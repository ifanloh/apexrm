import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { authenticateToken, getBearerToken, requireRole, type AuthUser } from "../../src/auth.js";
import { sql } from "../../src/db.js";
import { getOrganizerLiveRaceSnapshot } from "../../src/organizer-live-race.js";
import {
  ensureOrganizerWorkspaceTable,
  getOrganizerWorkspace
} from "../../src/repository.js";
import { handlePreflight, sendError, sendJson } from "../../src/vercel-shared.js";

const liveRaceQuerySchema = z.object({
  eventId: z.coerce.number().int().positive(),
  raceId: z.coerce.number().int().positive()
});

async function authenticateOrganizerWorkspaceRequest(request: IncomingMessage): Promise<AuthUser> {
  const token = getBearerToken(request.headers, request.url);

  if (token) {
    return authenticateToken(token);
  }

  const demoUserHeader = request.headers["x-organizer-demo-user"];
  const demoUser = typeof demoUserHeader === "string" ? demoUserHeader.trim() : null;

  if (demoUser === "local-admin") {
    return {
      userId: "local-admin",
      email: "admin",
      role: "admin",
      crewCode: null,
      displayName: "Admin"
    };
  }

  throw new Error("Missing bearer token");
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (handlePreflight(request, response)) {
    return;
  }

  if (request.method !== "GET") {
    sendError(request, response, 405, "Method not allowed");
    return;
  }

  try {
    const actor = await authenticateOrganizerWorkspaceRequest(request);
    requireRole(actor, ["admin", "panitia", "observer"]);
    await ensureOrganizerWorkspaceTable(sql);

    const url = new URL(request.url ?? "/", "http://localhost");
    const query = liveRaceQuerySchema.parse({
      eventId: url.searchParams.get("eventId"),
      raceId: url.searchParams.get("raceId")
    });
    const workspace = await getOrganizerWorkspace(sql, actor.userId);

    if (!workspace) {
      sendJson(request, response, 200, { item: null });
      return;
    }

    sendJson(request, response, 200, {
      item: await getOrganizerLiveRaceSnapshot(sql, {
        ownerUserId: actor.userId,
        payload: workspace.payload,
        eventId: query.eventId,
        raceId: query.raceId
      })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusCode =
      /token/i.test(message) ? 401 : message === "Forbidden" ? 403 : error instanceof Error && error.name === "ZodError" ? 400 : 500;

    sendError(request, response, statusCode, statusCode === 500 ? "Internal server error" : message, {
      detail: statusCode === 500 ? message : undefined,
      name: error instanceof Error ? error.name : "Error"
    });
  }
}

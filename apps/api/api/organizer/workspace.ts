import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { authenticateToken, getBearerToken, requireRole, type AuthUser } from "../../src/auth.js";
import { sql } from "../../src/db.js";
import {
  ensureOrganizerWorkspaceTable,
  getOrganizerWorkspace,
  saveOrganizerWorkspace,
  type JsonValue
} from "../../src/repository.js";
import { handlePreflight, readJsonBody, sendError, sendJson } from "../../src/vercel-shared.js";

const organizerWorkspacePayloadSchema = z.object({
  payload: z.unknown(),
  username: z.string().trim().optional().nullable(),
  displayName: z.string().trim().optional().nullable()
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

  try {
    const actor = await authenticateOrganizerWorkspaceRequest(request);
    requireRole(actor, ["admin", "panitia", "observer"]);
    await ensureOrganizerWorkspaceTable(sql);

    if (request.method === "GET") {
      sendJson(request, response, 200, {
        item: await getOrganizerWorkspace(sql, actor.userId)
      });
      return;
    }

    if (request.method === "PUT") {
      const payload = organizerWorkspacePayloadSchema.parse(await readJsonBody(request));
      const result = await saveOrganizerWorkspace(sql, {
        ownerUserId: actor.userId,
        username: payload.username ?? actor.email,
        displayName: payload.displayName ?? actor.displayName,
        payload: payload.payload as JsonValue
      });

      sendJson(request, response, 200, result);
      return;
    }

    sendError(request, response, 405, "Method not allowed");
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

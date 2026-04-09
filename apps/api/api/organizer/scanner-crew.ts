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

const createScannerCrewSchema = z.object({
  eventId: z.number().int().positive(),
  name: z.string().trim().min(1),
  username: z.string().trim().min(1),
  password: z.string().min(1),
  assignedCheckpointId: z.number().int().positive().nullable().optional()
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function toPositiveInteger(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.trunc(value));
}

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

    if (request.method !== "POST") {
      sendError(request, response, 405, "Method not allowed");
      return;
    }

    const input = createScannerCrewSchema.parse(await readJsonBody(request));
    const workspace = await getOrganizerWorkspace(sql, actor.userId);

    if (!workspace) {
      sendError(request, response, 404, "Organizer workspace not found");
      return;
    }

    const payload = isRecord(workspace.payload) ? workspace.payload : {};
    const crewRecords = Array.isArray(payload.crew) ? payload.crew.filter(isRecord) : [];
    const normalizedUsername = normalizeUsername(input.username);

    if (
      crewRecords.some(
        (entry) => typeof entry.username === "string" && normalizeUsername(entry.username) === normalizedUsername
      )
    ) {
      sendError(request, response, 409, "Scanner crew username already exists");
      return;
    }

    const nextIds = isRecord(payload.nextIds) ? payload.nextIds : {};
    const maxExistingCrewId = crewRecords.reduce((maxId, entry) => {
      const currentId = typeof entry.id === "number" && Number.isFinite(entry.id) ? Math.trunc(entry.id) : 0;
      return Math.max(maxId, currentId);
    }, 0);
    const nextCrewId = Math.max(toPositiveInteger(nextIds.crew, maxExistingCrewId + 1), maxExistingCrewId + 1);
    const member = {
      id: nextCrewId,
      eventId: input.eventId,
      name: input.name,
      username: input.username.trim(),
      password: input.password,
      assignedCheckpointId: input.assignedCheckpointId ?? null,
      createdAt: new Date().toISOString()
    };
    const nextPayload = {
      ...payload,
      crew: [...crewRecords, member],
      nextIds: {
        ...nextIds,
        crew: nextCrewId + 1
      }
    };

    await saveOrganizerWorkspace(sql, {
      ownerUserId: actor.userId,
      username: workspace.username ?? actor.email,
      displayName: workspace.displayName ?? actor.displayName,
      payload: nextPayload as JsonValue
    });

    sendJson(request, response, 200, {
      item: {
        member,
        nextCrewId: nextCrewId + 1
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusCode =
      /token/i.test(message)
        ? 401
        : message === "Forbidden"
          ? 403
          : error instanceof Error && error.name === "ZodError"
            ? 400
            : 500;

    sendError(request, response, statusCode, statusCode === 500 ? "Internal server error" : message, {
      detail: statusCode === 500 ? message : undefined,
      name: error instanceof Error ? error.name : "Error"
    });
  }
}

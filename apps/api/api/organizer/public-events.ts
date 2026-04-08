import type { IncomingMessage, ServerResponse } from "node:http";
import { sql } from "../../src/db.js";
import { extractOrganizerPrototypePublicEvents } from "../../src/organizer-public-events.js";
import {
  ensureOrganizerWorkspaceTable,
  listOrganizerWorkspaces
} from "../../src/repository.js";
import { handlePreflight, sendError, sendJson } from "../../src/vercel-shared.js";

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (handlePreflight(request, response)) {
    return;
  }

  if (request.method !== "GET") {
    sendError(request, response, 405, "Method not allowed");
    return;
  }

  try {
    await ensureOrganizerWorkspaceTable(sql);
    const workspaces = await listOrganizerWorkspaces(sql, 25);

    const items = workspaces.flatMap((workspace) =>
      extractOrganizerPrototypePublicEvents(
        workspace.payload,
        workspace.ownerUserId,
        workspace.username,
        workspace.displayName,
        workspace.updatedAt
      )
    );

    sendJson(request, response, 200, { items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendError(request, response, 500, "Internal server error", {
      detail: message,
      name: error instanceof Error ? error.name : "Error"
    });
  }
}

import type { IncomingMessage, ServerResponse } from "node:http";
import { sql } from "../../src/db.js";
import { getOrganizerPublicLiveRaceSnapshot } from "../../src/organizer-public-live-race.js";
import { ensureOrganizerWorkspaceTable, getOrganizerWorkspace } from "../../src/repository.js";
import { handlePreflight, sendError, sendJson } from "../../src/vercel-shared.js";

function getQueryValue(request: IncomingMessage, key: string) {
  const url = new URL(request.url ?? "/", "http://localhost");
  return url.searchParams.get(key);
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (handlePreflight(request, response)) {
    return;
  }

  if (request.method !== "GET") {
    sendError(request, response, 405, "Method not allowed");
    return;
  }

  const ownerUserId = getQueryValue(request, "ownerUserId")?.trim() ?? "";
  const eventId = Number.parseInt(getQueryValue(request, "eventId") ?? "", 10);
  const raceId = Number.parseInt(getQueryValue(request, "raceId") ?? "", 10);

  if (!ownerUserId || !Number.isFinite(eventId) || eventId <= 0 || !Number.isFinite(raceId) || raceId <= 0) {
    sendError(request, response, 400, "ownerUserId, eventId, and raceId are required");
    return;
  }

  try {
    await ensureOrganizerWorkspaceTable(sql);
    const workspace = await getOrganizerWorkspace(sql, ownerUserId);

    if (!workspace) {
      sendJson(request, response, 200, { item: null });
      return;
    }

    const item = await getOrganizerPublicLiveRaceSnapshot(sql, {
      ownerUserId: workspace.ownerUserId,
      payload: workspace.payload,
      eventId,
      raceId,
      updatedAt: workspace.updatedAt
    });

    sendJson(request, response, 200, { item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendError(request, response, 500, "Internal server error", {
      detail: message,
      name: error instanceof Error ? error.name : "Error"
    });
  }
}

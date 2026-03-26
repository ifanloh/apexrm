import type { IncomingMessage, ServerResponse } from "node:http";
import { sql } from "../../../src/db.js";
import { getCheckpointLeaderboard } from "../../../src/repository.js";
import { ensureCheckpointBootstrap } from "../../../src/service.js";
import { handlePreflight, sendError, sendJson } from "../../_shared.js";

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (handlePreflight(request, response)) {
    return;
  }

  try {
    await ensureCheckpointBootstrap();

    const pathname = new URL(request.url ?? "/", "https://arm.local").pathname;
    const checkpointId = decodeURIComponent(pathname.split("/").pop() ?? "");

    if (!checkpointId) {
      sendError(request, response, 400, "Missing checkpointId");
      return;
    }

    sendJson(request, response, 200, await getCheckpointLeaderboard(sql, checkpointId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusCode = /token/i.test(message) ? 401 : message === "Forbidden" ? 403 : 500;

    sendError(request, response, statusCode, statusCode === 500 ? "Internal server error" : message, {
      detail: statusCode === 500 ? message : undefined,
      name: error instanceof Error ? error.name : "Error"
    });
  }
}

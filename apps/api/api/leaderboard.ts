import type { IncomingMessage, ServerResponse } from "node:http";
import { sql } from "../src/db.js";
import { getCheckpointLeaderboard, getLiveLeaderboard, getOverallLeaderboard } from "../src/repository.js";
import { ensureCheckpointBootstrap } from "../src/service.js";
import { handlePreflight, sendError, sendJson } from "../src/vercel-shared.js";

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (handlePreflight(request, response)) {
    return;
  }

  try {
    const url = new URL(request.url ?? "/api/leaderboard", "https://arm.local");
    const view = url.searchParams.get("view");

    if (view === "checkpoint") {
      await ensureCheckpointBootstrap();

      const checkpointId = url.searchParams.get("checkpointId");

      if (!checkpointId) {
        sendError(request, response, 400, "Missing checkpointId");
        return;
      }

      sendJson(request, response, 200, await getCheckpointLeaderboard(sql, checkpointId));
      return;
    }

    if (view === "live") {
      sendJson(request, response, 200, {
        items: await getLiveLeaderboard(sql)
      });
      return;
    }

    const category = url.searchParams.get("category");
    const limitParam = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 5), 200) : 50;

    sendJson(request, response, 200, await getOverallLeaderboard(sql, limit, category));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusCode = /token/i.test(message) ? 401 : message === "Forbidden" ? 403 : 500;

    sendError(request, response, statusCode, statusCode === 500 ? "Internal server error" : message, {
      detail: statusCode === 500 ? message : undefined,
      name: error instanceof Error ? error.name : "Error"
    });
  }
}

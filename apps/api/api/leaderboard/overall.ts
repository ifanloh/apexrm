import type { IncomingMessage, ServerResponse } from "node:http";
import { sql } from "../../src/db.js";
import { getOverallLeaderboard } from "../../src/repository.js";
import { handlePreflight, sendError, sendJson } from "../../src/vercel-shared.js";

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (handlePreflight(request, response)) {
    return;
  }

  try {
    const url = new URL(request.url ?? "/api/leaderboard/overall", "https://arm.local");
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

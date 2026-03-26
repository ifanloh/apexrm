import type { IncomingMessage, ServerResponse } from "node:http";
import { authenticateToken, getBearerToken, requireRole } from "../../src/auth.js";
import { sql } from "../../src/db.js";
import { searchRunners } from "../../src/repository.js";
import { handlePreflight, sendError, sendJson } from "../_shared.js";

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (handlePreflight(request, response)) {
    return;
  }

  try {
    const token = getBearerToken(request.headers, request.url);

    if (!token) {
      sendError(request, response, 401, "Missing bearer token");
      return;
    }

    const actor = await authenticateToken(token);
    requireRole(actor, ["admin", "panitia", "observer"]);

    const url = new URL(request.url ?? "/api/runners/search", "https://arm.local");
    const query = url.searchParams.get("q");
    const checkpointId = url.searchParams.get("checkpointId");

    sendJson(request, response, 200, {
      items: await searchRunners(sql, {
        query,
        checkpointId
      })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusCode = /token/i.test(message) ? 401 : message === "Forbidden" ? 403 : 500;

    sendError(request, response, statusCode, statusCode === 500 ? "Internal server error" : message, {
      detail: statusCode === 500 ? message : undefined,
      name: error instanceof Error ? error.name : "Error"
    });
  }
}

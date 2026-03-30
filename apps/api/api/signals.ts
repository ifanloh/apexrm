import type { IncomingMessage, ServerResponse } from "node:http";
import { authenticateToken, getBearerToken, requireRole } from "../src/auth.js";
import { sql } from "../src/db.js";
import { getDuplicateAuditLog, getNotificationFeed } from "../src/repository.js";
import { ensureCheckpointBootstrap } from "../src/service.js";
import { handlePreflight, sendError, sendJson } from "../src/vercel-shared.js";

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
    requireRole(actor, ["admin", "panitia"]);
    await ensureCheckpointBootstrap();

    const url = new URL(request.url ?? "/api/signals", "https://arm.local");
    const view = url.searchParams.get("view");

    if (view === "duplicates") {
      sendJson(request, response, 200, {
        items: await getDuplicateAuditLog(sql)
      });
      return;
    }

    sendJson(request, response, 200, {
      items: await getNotificationFeed(sql)
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

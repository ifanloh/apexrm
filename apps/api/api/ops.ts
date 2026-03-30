import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { scanSubmissionSchema } from "../src/contracts.js";
import { authenticateToken, getBearerToken, requireRole } from "../src/auth.js";
import { sql } from "../src/db.js";
import { processSingleScan, syncOfflineScans } from "../src/repository.js";
import { ensureCheckpointBootstrap } from "../src/service.js";
import { handlePreflight, readJsonBody, sendError, sendJson } from "../src/vercel-shared.js";

const syncOfflineSchema = z.object({
  scans: z.array(scanSubmissionSchema).min(1)
});

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
    requireRole(actor, ["crew", "panitia", "admin"]);
    await ensureCheckpointBootstrap();

    const url = new URL(request.url ?? "/api/ops", "https://arm.local");
    const view = url.searchParams.get("view");

    if (view === "sync-offline") {
      const payload = syncOfflineSchema.parse(await readJsonBody(request));
      const result = await syncOfflineScans(sql, payload.scans, actor);
      sendJson(request, response, 200, result);
      return;
    }

    const payload = scanSubmissionSchema.parse(await readJsonBody(request));
    const result = await processSingleScan(sql, payload, actor);
    sendJson(request, response, result.status === "accepted" ? 201 : 200, result);
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

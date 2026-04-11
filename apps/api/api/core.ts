import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { authenticateToken, getBearerToken } from "../src/auth.js";
import { sql } from "../src/db.js";
import { ensureOrganizerWorkspaceTable, getRecentPassings } from "../src/repository.js";
import { createScannerPilotLogin } from "../src/scanner-demo-auth.js";
import { listActiveCheckpoints } from "../src/service.js";
import { handlePreflight, readJsonBody, sendError, sendJson } from "../src/vercel-shared.js";

const scannerDemoLoginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1)
});

function getHealthPayload() {
  const requiredEnv = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY", "CORS_ORIGIN"] as const;
  const missingEnv = requiredEnv.filter((key) => !process.env[key]);

  return {
    status: missingEnv.length === 0 ? "ok" : "degraded",
    service: "arm-api",
    timestamp: new Date().toISOString(),
    missingEnv
  };
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (handlePreflight(request, response)) {
    return;
  }

  try {
    const url = new URL(request.url ?? "/api/core", "https://arm.local");
    const view = url.searchParams.get("view");

    if (view === "me") {
      const token = getBearerToken(request.headers, request.url);

      if (!token) {
        sendError(request, response, 401, "Missing bearer token");
        return;
      }

      const actor = await authenticateToken(token);
      sendJson(request, response, 200, actor);
      return;
    }

    if (view === "checkpoints") {
      const items = await listActiveCheckpoints();
      sendJson(request, response, 200, { items });
      return;
    }

    if (view === "recent-passings") {
      sendJson(request, response, 200, {
        items: await getRecentPassings(sql)
      });
      return;
    }

    if (view === "scanner-pilot-login" || view === "scanner-demo-login") {
      if (request.method !== "POST") {
        sendError(request, response, 405, "Method not allowed");
        return;
      }

      await ensureOrganizerWorkspaceTable(sql);
      const payload = scannerDemoLoginSchema.parse(await readJsonBody(request));
      sendJson(request, response, 200, await createScannerPilotLogin(payload));
      return;
    }

    const payload = getHealthPayload();
    sendJson(request, response, payload.missingEnv.length === 0 ? 200 : 500, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    const statusCode =
      message === "Invalid scanner crew credentials."
        ? 401
        : /token/i.test(message)
          ? 401
          : error instanceof Error && error.name === "ZodError"
            ? 400
            : 500;

    sendError(request, response, statusCode, statusCode === 500 ? "Internal server error" : message, {
      detail: statusCode === 500 ? message : undefined,
      name: error instanceof Error ? error.name : "Error"
    });
  }
}

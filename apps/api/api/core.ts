import type { IncomingMessage, ServerResponse } from "node:http";
import { authenticateToken, getBearerToken } from "../src/auth.js";
import { handlePreflight, sendError, sendJson } from "../src/vercel-shared.js";

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

    const payload = getHealthPayload();
    sendJson(request, response, payload.missingEnv.length === 0 ? 200 : 500, payload);
  } catch (error) {
    sendError(request, response, 401, error instanceof Error ? error.message : "Invalid token");
  }
}

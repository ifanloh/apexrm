import type { IncomingMessage, ServerResponse } from "node:http";

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

export default function handler(_request: IncomingMessage, response: ServerResponse) {
  const payload = getHealthPayload();

  response.statusCode = payload.missingEnv.length === 0 ? 200 : 500;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(payload));
}

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
  const origin = _request.headers.origin;
  response.setHeader("Access-Control-Allow-Origin", origin ?? "*");
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (_request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  const payload = getHealthPayload();

  response.statusCode = payload.missingEnv.length === 0 ? 200 : 500;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(payload));
}

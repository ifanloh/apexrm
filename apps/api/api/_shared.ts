import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";

let serverPromise: Promise<FastifyInstance> | null = null;

function getAllowedOrigin(request: IncomingMessage) {
  const origin = request.headers.origin;

  if (!origin) {
    return null;
  }

  const allowedOrigins = (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return allowedOrigins.includes(origin) ? origin : null;
}

function applyCorsHeaders(request: IncomingMessage, response: ServerResponse) {
  const allowedOrigin = getAllowedOrigin(request);

  if (!allowedOrigin) {
    return false;
  }

  response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  return true;
}

async function getServer() {
  if (!serverPromise) {
    serverPromise = import("../src/app.js").then(async ({ createServer }) => {
      const server = await createServer();
      await server.ready();
      return server;
    });
  }

  return serverPromise;
}

export async function forwardToFastify(request: IncomingMessage, response: ServerResponse) {
  try {
    applyCorsHeaders(request, response);

    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }

    const server = await getServer();
    server.server.emit("request", request, response);
  } catch (error) {
    console.error("API handler startup failed", error);
    response.statusCode = 500;
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        message: error instanceof Error ? error.message : "Unknown startup error"
      })
    );
  }
}

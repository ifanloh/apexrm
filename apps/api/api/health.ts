import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";
import { createServer } from "../src/app.js";

let serverPromise: Promise<FastifyInstance> | null = null;

async function getServer() {
  if (!serverPromise) {
    serverPromise = createServer().then(async (server) => {
      await server.ready();
      return server;
    });
  }

  return serverPromise;
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  try {
    const server = await getServer();
    request.url = "/health";
    server.server.emit("request", request, response);
  } catch (error) {
    console.error("Health handler startup failed", error);
    response.statusCode = 500;
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        status: "error",
        message: error instanceof Error ? error.message : "Unknown startup error"
      })
    );
  }
}

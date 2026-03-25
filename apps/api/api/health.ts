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
  const server = await getServer();
  request.url = "/health";
  server.server.emit("request", request, response);
}

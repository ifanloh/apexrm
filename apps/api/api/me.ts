import type { IncomingMessage, ServerResponse } from "node:http";
import { authenticateToken, getBearerToken } from "../src/auth.js";
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
    sendJson(request, response, 200, actor);
  } catch (error) {
    sendError(request, response, 401, error instanceof Error ? error.message : "Invalid token");
  }
}

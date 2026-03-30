import type { IncomingMessage, ServerResponse } from "node:http";
import { listActiveCheckpoints } from "../../src/service.js";
import { handlePreflight, sendError, sendJson } from "../../src/vercel-shared.js";

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (handlePreflight(request, response)) {
    return;
  }

  try {
    const items = await listActiveCheckpoints();
    sendJson(request, response, 200, { items });
  } catch (error) {
    sendError(request, response, 500, "Internal server error", {
      detail: error instanceof Error ? error.message : "Unknown error",
      name: error instanceof Error ? error.name : "Error"
    });
  }
}

import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { createScannerDemoLogin } from "../../src/scanner-demo-auth.js";
import { ensureOrganizerWorkspaceTable } from "../../src/repository.js";
import { sql } from "../../src/db.js";
import { handlePreflight, readJsonBody, sendError, sendJson } from "../../src/vercel-shared.js";

const scannerDemoLoginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1)
});

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (handlePreflight(request, response)) {
    return;
  }

  if (request.method !== "POST") {
    sendError(request, response, 405, "Method not allowed");
    return;
  }

  try {
    await ensureOrganizerWorkspaceTable(sql);
    const payload = scannerDemoLoginSchema.parse(await readJsonBody(request));
    sendJson(request, response, 200, await createScannerDemoLogin(payload));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusCode =
      message === "Invalid scanner crew credentials."
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

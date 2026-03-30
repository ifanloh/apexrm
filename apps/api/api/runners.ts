import type { IncomingMessage, ServerResponse } from "node:http";
import { sql } from "../src/db.js";
import { getRunnerDetail, searchRunners } from "../src/repository.js";
import { handlePreflight, sendError, sendJson } from "../src/vercel-shared.js";

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (handlePreflight(request, response)) {
    return;
  }

  try {
    const url = new URL(request.url ?? "/api/runners", "https://arm.local");
    const view = url.searchParams.get("view");

    if (view === "detail") {
      const bib = url.searchParams.get("bib");

      if (!bib) {
        sendError(request, response, 400, "Parameter bib wajib diisi");
        return;
      }

      const detail = await getRunnerDetail(sql, bib);

      if (!detail) {
        sendError(request, response, 404, "Pelari tidak ditemukan");
        return;
      }

      sendJson(request, response, 200, detail);
      return;
    }

    sendJson(request, response, 200, {
      items: await searchRunners(sql, {
        query: url.searchParams.get("q"),
        checkpointId: url.searchParams.get("checkpointId")
      })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusCode = /token/i.test(message) ? 401 : message === "Forbidden" ? 403 : 500;

    sendError(request, response, statusCode, statusCode === 500 ? "Internal server error" : message, {
      detail: statusCode === 500 ? message : undefined,
      name: error instanceof Error ? error.name : "Error"
    });
  }
}

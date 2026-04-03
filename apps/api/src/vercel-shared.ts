import type { IncomingMessage, ServerResponse } from "node:http";

export function getAllowedOrigin(request: IncomingMessage) {
  return request.headers.origin ?? "*";
}

export function applyCorsHeaders(request: IncomingMessage, response: ServerResponse) {
  response.setHeader("Access-Control-Allow-Origin", getAllowedOrigin(request));
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Organizer-Demo-User");
}

export function handlePreflight(request: IncomingMessage, response: ServerResponse) {
  applyCorsHeaders(request, response);

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return true;
  }

  return false;
}

export function sendJson(
  request: IncomingMessage,
  response: ServerResponse,
  statusCode: number,
  payload: unknown
) {
  applyCorsHeaders(request, response);
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(payload));
}

export function sendError(
  request: IncomingMessage,
  response: ServerResponse,
  statusCode: number,
  message: string,
  extras?: Record<string, unknown>
) {
  sendJson(request, response, statusCode, {
    message,
    ...(extras ?? {})
  });
}

export async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(body || "{}") as T;
}

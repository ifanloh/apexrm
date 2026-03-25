import type { IncomingMessage, ServerResponse } from "node:http";
import { forwardToFastify } from "./_shared.js";

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  await forwardToFastify(request, response);
}

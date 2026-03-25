import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { liveRaceSnapshotSchema, scanSubmissionSchema } from "@arm/contracts";
import { requireAuth, requireRole } from "./auth.js";
import { closeDb, sql } from "./db.js";
import {
  ensureDefaultCheckpoints,
  getCheckpointLeaderboard,
  getDuplicateAuditLog,
  getLiveLeaderboard,
  getNotificationFeed,
  processSingleScan,
  syncOfflineScans
} from "./repository.js";
import { config } from "./config.js";

const syncOfflineSchema = z.object({
  scans: z.array(scanSubmissionSchema).min(1)
});

const server = Fastify({
  logger: true
});

const sseClients = new Set<NodeJS.WritableStream>();

await server.register(cors, {
  origin: config.corsOrigins.length > 0 ? config.corsOrigins : true
});

await ensureDefaultCheckpoints(sql);

server.get("/health", async () => ({
  status: "ok",
  service: "arm-api",
  timestamp: new Date().toISOString()
}));

server.get(`${config.apiPrefix}/meta/checkpoints`, async () => {
  const rows = await sql<{
    id: string;
    code: string;
    name: string;
    km_marker: number;
    order_index: number;
  }[]>`
    select id, code, name, km_marker, order_index
    from public.checkpoints
    where is_active = true
    order by order_index asc
  `;

  return {
    items: rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      kmMarker: row.km_marker,
      order: row.order_index
    }))
  };
});

server.get(`${config.apiPrefix}/me`, async (request) => {
  return requireAuth(request);
});

server.get(`${config.apiPrefix}/leaderboard/live`, async (request) => {
  const actor = await requireAuth(request);
  requireRole(actor, ["admin", "panitia", "observer"]);

  return {
    items: await getLiveLeaderboard(sql)
  };
});

server.get(`${config.apiPrefix}/leaderboard/live/:checkpointId`, async (request) => {
  const actor = await requireAuth(request);
  requireRole(actor, ["admin", "panitia", "observer"]);
  const params = z.object({ checkpointId: z.string().min(1) }).parse(request.params);
  return getCheckpointLeaderboard(sql, params.checkpointId);
});

server.get(`${config.apiPrefix}/audit/duplicates`, async (request) => {
  const actor = await requireAuth(request);
  requireRole(actor, ["admin", "panitia"]);

  return {
    items: await getDuplicateAuditLog(sql)
  };
});

server.get(`${config.apiPrefix}/notifications`, async (request) => {
  const actor = await requireAuth(request);
  requireRole(actor, ["admin", "panitia"]);

  return {
    items: await getNotificationFeed(sql)
  };
});

server.get(`${config.apiPrefix}/events`, async (request, reply) => {
  const actor = await requireAuth(request);
  requireRole(actor, ["admin", "panitia", "observer"]);

  reply.raw.writeHead(200, {
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream"
  });

  sseClients.add(reply.raw);
  reply.raw.write(`event: snapshot\n`);
  reply.raw.write(`data: ${JSON.stringify(await createSnapshot())}\n\n`);

  reply.raw.on("close", () => {
    sseClients.delete(reply.raw);
  });
});

server.post(`${config.apiPrefix}/scan`, async (request, reply) => {
  const actor = await requireAuth(request);
  requireRole(actor, ["crew", "panitia", "admin"]);
  const payload = scanSubmissionSchema.parse(request.body);
  const response = await processSingleScan(sql, payload, actor);
  await broadcastSnapshot();

  return reply.code(response.status === "accepted" ? 201 : 200).send(response);
});

server.post(`${config.apiPrefix}/sync-offline`, async (request) => {
  const actor = await requireAuth(request);
  requireRole(actor, ["crew", "panitia", "admin"]);
  const payload = syncOfflineSchema.parse(request.body);
  const result = await syncOfflineScans(sql, payload.scans, actor);
  await broadcastSnapshot();
  return result;
});

server.setErrorHandler((error, _request, reply) => {
  if (error instanceof z.ZodError) {
    reply.code(400).send({
      message: "Invalid request payload",
      issues: error.issues
    });
    return;
  }

  if (error instanceof Error && /token/i.test(error.message)) {
    reply.code(401).send({
      message: error.message
    });
    return;
  }

  if (error instanceof Error && error.message === "Forbidden") {
    reply.code(403).send({
      message: error.message
    });
    return;
  }

  server.log.error(error);
  reply.code(500).send({
    message: "Internal server error"
  });
});

const closeServer = async (signal: string) => {
  server.log.info({ signal }, "Shutting down server");
  await server.close();
  await closeDb();
  process.exit(0);
};

process.on("SIGINT", () => {
  void closeServer("SIGINT");
});

process.on("SIGTERM", () => {
  void closeServer("SIGTERM");
});

server.listen({ port: config.port, host: "0.0.0.0" }).catch((error) => {
  server.log.error(error);
  process.exit(1);
});

async function createSnapshot() {
  return liveRaceSnapshotSchema.parse({
    updatedAt: new Date().toISOString(),
    leaderboards: await getLiveLeaderboard(sql),
    duplicates: await getDuplicateAuditLog(sql),
    notifications: await getNotificationFeed(sql)
  });
}

async function broadcastSnapshot() {
  if (sseClients.size === 0) {
    return;
  }

  const payload = JSON.stringify(await createSnapshot());

  for (const client of sseClients) {
    client.write(`event: snapshot\n`);
    client.write(`data: ${payload}\n\n`);
  }
}

import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { liveRaceSnapshotSchema, scanSubmissionSchema } from "@arm/contracts";
import { requireAuth, requireRole } from "./auth.js";
import { sql } from "./db.js";
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

let checkpointBootstrapPromise: Promise<void> | null = null;

function createHealthPayload() {
  return {
    status: "ok",
    service: "arm-api",
    timestamp: new Date().toISOString()
  };
}

async function createSnapshot() {
  return liveRaceSnapshotSchema.parse({
    updatedAt: new Date().toISOString(),
    leaderboards: await getLiveLeaderboard(sql),
    duplicates: await getDuplicateAuditLog(sql),
    notifications: await getNotificationFeed(sql)
  });
}

async function ensureCheckpointBootstrap() {
  if (!checkpointBootstrapPromise) {
    checkpointBootstrapPromise = ensureDefaultCheckpoints(sql);
  }

  await checkpointBootstrapPromise;
}

export async function createServer() {
  const server = Fastify({
    logger: true
  });

  await server.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : true
  });

  server.get("/health", async () => createHealthPayload());
  server.get(`${config.apiPrefix}/health`, async () => createHealthPayload());

  server.get(`${config.apiPrefix}/meta/checkpoints`, async () => {
    await ensureCheckpointBootstrap();

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
    await ensureCheckpointBootstrap();

    return {
      items: await getLiveLeaderboard(sql)
    };
  });

  server.get(`${config.apiPrefix}/leaderboard/live/:checkpointId`, async (request) => {
    const actor = await requireAuth(request);
    requireRole(actor, ["admin", "panitia", "observer"]);
    await ensureCheckpointBootstrap();
    const params = z.object({ checkpointId: z.string().min(1) }).parse(request.params);
    return getCheckpointLeaderboard(sql, params.checkpointId);
  });

  server.get(`${config.apiPrefix}/audit/duplicates`, async (request) => {
    const actor = await requireAuth(request);
    requireRole(actor, ["admin", "panitia"]);
    await ensureCheckpointBootstrap();

    return {
      items: await getDuplicateAuditLog(sql)
    };
  });

  server.get(`${config.apiPrefix}/notifications`, async (request) => {
    const actor = await requireAuth(request);
    requireRole(actor, ["admin", "panitia"]);
    await ensureCheckpointBootstrap();

    return {
      items: await getNotificationFeed(sql)
    };
  });

  server.get(`${config.apiPrefix}/events`, async (_request, reply) => {
    return reply.code(410).send({
      message: "Live stream SSE dinonaktifkan untuk deploy serverless. Gunakan polling snapshot dashboard."
    });
  });

  server.get(`${config.apiPrefix}/snapshot`, async (request) => {
    const actor = await requireAuth(request);
    requireRole(actor, ["admin", "panitia", "observer"]);
    await ensureCheckpointBootstrap();
    return createSnapshot();
  });

  server.post(`${config.apiPrefix}/scan`, async (request, reply) => {
    const actor = await requireAuth(request);
    requireRole(actor, ["crew", "panitia", "admin"]);
    await ensureCheckpointBootstrap();
    const payload = scanSubmissionSchema.parse(request.body);
    const response = await processSingleScan(sql, payload, actor);

    return reply.code(response.status === "accepted" ? 201 : 200).send(response);
  });

  server.post(`${config.apiPrefix}/sync-offline`, async (request) => {
    const actor = await requireAuth(request);
    requireRole(actor, ["crew", "panitia", "admin"]);
    await ensureCheckpointBootstrap();
    const payload = syncOfflineSchema.parse(request.body);
    return syncOfflineScans(sql, payload.scans, actor);
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
    const diagnostics = {
      detail: error instanceof Error ? error.message : "Unknown error",
      name: error instanceof Error ? error.name : "Error"
    };

    reply.code(500).send({
      message: "Internal server error",
      ...diagnostics
    });
  });

  return server;
}

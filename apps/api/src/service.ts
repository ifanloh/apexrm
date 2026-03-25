import { liveRaceSnapshotSchema } from "./contracts.js";
import { sql } from "./db.js";
import {
  ensureDefaultCheckpoints,
  getDuplicateAuditLog,
  getLiveLeaderboard,
  getNotificationFeed
} from "./repository.js";

let checkpointBootstrapPromise: Promise<void> | null = null;

export function createHealthPayload() {
  return {
    status: "ok",
    service: "arm-api",
    timestamp: new Date().toISOString()
  };
}

export async function ensureCheckpointBootstrap() {
  if (!checkpointBootstrapPromise) {
    checkpointBootstrapPromise = ensureDefaultCheckpoints(sql);
  }

  await checkpointBootstrapPromise;
}

export async function listActiveCheckpoints() {
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

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    kmMarker: Number(row.km_marker),
    order: row.order_index
  }));
}

export async function createSnapshot() {
  await ensureCheckpointBootstrap();

  return liveRaceSnapshotSchema.parse({
    updatedAt: new Date().toISOString(),
    leaderboards: await getLiveLeaderboard(sql),
    duplicates: await getDuplicateAuditLog(sql),
    notifications: await getNotificationFeed(sql)
  });
}

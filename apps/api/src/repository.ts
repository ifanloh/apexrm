import type { Sql } from "postgres";
import type {
  AcceptedScan,
  CheckpointLeaderboard,
  DuplicateScan,
  LeaderboardEntry,
  NotificationEvent,
  OverallLeaderboard,
  OverallLeaderboardEntry,
  ScanSubmission
} from "./contracts.js";
import { defaultCheckpoints } from "./contracts.js";
import type { AuthUser } from "./auth.js";
import { sendTelegramTop5Message } from "./telegram.js";

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

export type ScanProcessResult =
  | {
      status: "accepted";
      officialScan: AcceptedScan;
      leaderboard: CheckpointLeaderboard;
      notification: NotificationEvent | null;
    }
  | {
      status: "duplicate";
      duplicate: DuplicateScan;
      leaderboard: CheckpointLeaderboard;
    };

export async function ensureDefaultCheckpoints(sql: Sql) {
  for (const checkpoint of defaultCheckpoints) {
    await sql`
      insert into public.checkpoints (id, code, name, km_marker, order_index)
      values (${checkpoint.id}, ${checkpoint.code}, ${checkpoint.name}, ${checkpoint.kmMarker}, ${checkpoint.order})
      on conflict (id) do update
      set
        code = excluded.code,
        name = excluded.name,
        km_marker = excluded.km_marker,
        order_index = excluded.order_index
    `;
  }
}

export async function processSingleScan(
  sql: Sql,
  scan: ScanSubmission,
  actor: AuthUser
): Promise<ScanProcessResult> {
  const result = await sql.begin(async (txAny) => {
    const tx = txAny as unknown as Sql;
    const crewCode = actor.crewCode ?? scan.crewId;
    const crewName = actor.displayName ?? actor.email ?? crewCode;

    const [crew] = await tx<{ id: string }[]>`
      insert into public.crews (auth_user_id, code, name, role)
      values (${actor.userId}, ${crewCode}, ${crewName}, ${actor.role})
      on conflict (code) do update
      set
        auth_user_id = excluded.auth_user_id,
        name = excluded.name,
        role = excluded.role
      returning id
    `;

    const [participant] = await tx<{ id: string }[]>`
      insert into public.participants (bib, name)
      values (${scan.bib}, ${`Runner ${scan.bib}`})
      on conflict (bib) do update
      set name = public.participants.name
      returning id
    `;

    const existing = await tx<{
      client_scan_id: string;
    }[]>`
      select client_scan_id
      from public.scans
      where race_id = ${scan.raceId}
        and checkpoint_id = ${scan.checkpointId}
        and bib = ${scan.bib}
      limit 1
    `;

    if (existing.length > 0) {
      const duplicate: DuplicateScan = {
        clientScanId: scan.clientScanId,
        raceId: scan.raceId,
        checkpointId: scan.checkpointId,
        bib: scan.bib,
        crewId: scan.crewId,
        deviceId: scan.deviceId,
        scannedAt: scan.scannedAt,
        capturedOffline: scan.capturedOffline,
        serverReceivedAt: new Date().toISOString(),
        firstAcceptedClientScanId: existing[0].client_scan_id,
        reason: "duplicate_bib_checkpoint"
      };

      await tx`
        insert into public.audit_logs (type, race_id, checkpoint_id, bib, payload)
        values (
          'duplicate_scan',
          ${scan.raceId},
          ${scan.checkpointId},
          ${scan.bib},
          ${tx.json({
            clientScanId: scan.clientScanId,
            deviceId: scan.deviceId,
            firstAcceptedClientScanId: existing[0].client_scan_id
          })}
        )
      `;

      const duplicateResult: ScanProcessResult = {
        status: "duplicate",
        duplicate,
        leaderboard: await getCheckpointLeaderboard(tx, scan.checkpointId)
      };

      return duplicateResult as ScanProcessResult;
    }

    const [positionRow] = await tx<{ next_position: number }[]>`
      select count(*)::int + 1 as next_position
      from public.scans
      where race_id = ${scan.raceId}
        and checkpoint_id = ${scan.checkpointId}
    `;

    const [insertedScan] = await tx<{
      server_received_at: string;
      position: number;
    }[]>`
      insert into public.scans (
        client_scan_id,
        race_id,
        checkpoint_id,
        participant_id,
        bib,
        crew_id,
        crew_code,
        device_id,
        scanned_at,
        captured_offline,
        position
      )
      values (
        ${scan.clientScanId},
        ${scan.raceId},
        ${scan.checkpointId},
        ${participant.id},
        ${scan.bib},
        ${crew.id},
        ${crewCode},
        ${scan.deviceId},
        ${scan.scannedAt},
        ${scan.capturedOffline},
        ${positionRow.next_position}
      )
      returning server_received_at, position
    `;

    const leaderboard = await getCheckpointLeaderboard(tx, scan.checkpointId);
    const notification = await maybeNotifyTop5(tx, {
      bib: scan.bib,
      checkpointId: scan.checkpointId,
      participantId: participant.id,
      position: insertedScan.position,
      scannedAt: scan.scannedAt
    });

    const officialScan: AcceptedScan = {
      clientScanId: scan.clientScanId,
      raceId: scan.raceId,
      checkpointId: scan.checkpointId,
      bib: scan.bib,
      crewId: crewCode,
      deviceId: scan.deviceId,
      scannedAt: scan.scannedAt,
      capturedOffline: scan.capturedOffline,
      serverReceivedAt: toIsoString(insertedScan.server_received_at),
      position: insertedScan.position
    };

    const acceptedResult: ScanProcessResult = {
      status: "accepted",
      officialScan,
      leaderboard,
      notification
    };

    return acceptedResult as ScanProcessResult;
  });

  return result as ScanProcessResult;
}

export async function syncOfflineScans(sql: Sql, scans: ScanSubmission[], actor: AuthUser) {
  const results: ScanProcessResult[] = [];

  for (const scan of scans) {
    results.push(await processSingleScan(sql, scan, actor));
  }

  return {
    total: scans.length,
    accepted: results.filter((item) => item.status === "accepted").length,
    duplicates: results.filter((item) => item.status === "duplicate").length,
    results
  };
}

export async function getCheckpointLeaderboard(sql: Sql, checkpointId: string): Promise<CheckpointLeaderboard> {
  const [totals] = await sql<{ total: number }[]>`
    select count(*)::int as total
    from public.scans
    where checkpoint_id = ${checkpointId}
  `;

  const rows = await sql<{
    bib: string;
    checkpoint_id: string;
    position: number;
    scanned_at: string;
    crew_code: string;
    device_id: string;
  }[]>`
    select bib, checkpoint_id, position, scanned_at, crew_code, device_id
    from public.scans
    where checkpoint_id = ${checkpointId}
    order by position asc
    limit 5
  `;

  const topEntries: LeaderboardEntry[] = rows.map((row) => ({
    bib: row.bib,
    checkpointId: row.checkpoint_id,
    position: row.position,
    scannedAt: toIsoString(row.scanned_at),
    crewId: row.crew_code,
    deviceId: row.device_id
  }));

  return {
    checkpointId,
    totalOfficialScans: totals?.total ?? 0,
    topEntries
  };
}

export async function getLiveLeaderboard(sql: Sql) {
  const checkpoints = await sql<{
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

  const checkpointList = checkpoints.length
    ? checkpoints
    : defaultCheckpoints.map((checkpoint) => ({
        id: checkpoint.id,
        code: checkpoint.code,
        name: checkpoint.name,
        km_marker: checkpoint.kmMarker,
        order_index: checkpoint.order
      }));

  const [totals, rows] = await Promise.all([
    sql<{
      checkpoint_id: string;
      total: number;
    }[]>`
      select checkpoint_id, count(*)::int as total
      from public.scans
      group by checkpoint_id
    `,
    sql<{
      bib: string;
      checkpoint_id: string;
      position: number;
      scanned_at: string | Date;
      crew_code: string;
      device_id: string;
    }[]>`
      with ranked_entries as (
        select
          bib,
          checkpoint_id,
          position,
          scanned_at,
          crew_code,
          device_id,
          row_number() over (
            partition by checkpoint_id
            order by position asc, scanned_at asc, bib asc
          ) as row_rank
        from public.scans
      )
      select bib, checkpoint_id, position, scanned_at, crew_code, device_id
      from ranked_entries
      where row_rank <= 5
      order by checkpoint_id asc, position asc
    `
  ]);

  const totalsByCheckpoint = new Map(totals.map((row) => [row.checkpoint_id, row.total]));
  const entriesByCheckpoint = new Map<string, LeaderboardEntry[]>();

  for (const row of rows) {
    const list = entriesByCheckpoint.get(row.checkpoint_id) ?? [];
    list.push({
      bib: row.bib,
      checkpointId: row.checkpoint_id,
      position: row.position,
      scannedAt: toIsoString(row.scanned_at),
      crewId: row.crew_code,
      deviceId: row.device_id
    });
    entriesByCheckpoint.set(row.checkpoint_id, list);
  }

  return checkpointList.map((checkpoint) => ({
    checkpointId: checkpoint.id,
    totalOfficialScans: totalsByCheckpoint.get(checkpoint.id) ?? 0,
    topEntries: entriesByCheckpoint.get(checkpoint.id) ?? []
  }));
}

export async function getOverallLeaderboard(sql: Sql, limit = 20): Promise<OverallLeaderboard> {
  const [totals] = await sql<{ total: number }[]>`
    select count(distinct participant_id)::int as total
    from public.scans
  `;

  const rows = await sql<{
    bib: string;
    checkpoint_id: string;
    checkpoint_code: string;
    checkpoint_name: string;
    checkpoint_km_marker: number;
    checkpoint_order: number;
    scanned_at: string | Date;
    crew_code: string;
    device_id: string;
    rank: number | string;
  }[]>`
    with ranked_progress as (
      select
        s.participant_id,
        s.bib,
        s.checkpoint_id,
        c.code as checkpoint_code,
        c.name as checkpoint_name,
        c.km_marker as checkpoint_km_marker,
        c.order_index as checkpoint_order,
        s.scanned_at,
        s.crew_code,
        s.device_id,
        row_number() over (
          partition by s.participant_id
          order by c.order_index desc, s.scanned_at asc, s.position asc, s.server_received_at asc
        ) as participant_pick
      from public.scans s
      inner join public.checkpoints c on c.id = s.checkpoint_id
      where c.is_active = true
    ),
    latest_progress as (
      select *
      from ranked_progress
      where participant_pick = 1
    ),
    ordered_progress as (
      select
        *,
        row_number() over (
          order by checkpoint_order desc, scanned_at asc, bib asc
        ) as rank
      from latest_progress
    )
    select
      bib,
      checkpoint_id,
      checkpoint_code,
      checkpoint_name,
      checkpoint_km_marker,
      checkpoint_order,
      scanned_at,
      crew_code,
      device_id,
      rank
    from ordered_progress
    where rank <= ${limit}
    order by rank asc
  `;

  const topEntries: OverallLeaderboardEntry[] = rows.map((row) => ({
    bib: row.bib,
    rank: Number(row.rank),
    checkpointId: row.checkpoint_id,
    checkpointCode: row.checkpoint_code,
    checkpointName: row.checkpoint_name,
    checkpointKmMarker: Number(row.checkpoint_km_marker),
    checkpointOrder: row.checkpoint_order,
    scannedAt: toIsoString(row.scanned_at),
    crewId: row.crew_code,
    deviceId: row.device_id
  }));

  return {
    totalRankedRunners: totals?.total ?? 0,
    topEntries
  };
}

export async function getDuplicateAuditLog(sql: Sql) {
  const rows = await sql<{
    payload: {
      clientScanId: string;
      deviceId: string;
      firstAcceptedClientScanId: string;
    };
    race_id: string;
    checkpoint_id: string;
    bib: string;
    created_at: string;
  }[]>`
    select payload, race_id, checkpoint_id, bib, created_at
    from public.audit_logs
    where type = 'duplicate_scan'
    order by created_at desc
    limit 50
  `;

  return rows.map((row) => ({
    clientScanId: row.payload.clientScanId,
    raceId: row.race_id,
    checkpointId: row.checkpoint_id,
    bib: row.bib,
    crewId: "server-audit",
    deviceId: row.payload.deviceId,
    scannedAt: toIsoString(row.created_at),
    capturedOffline: false,
    serverReceivedAt: toIsoString(row.created_at),
    firstAcceptedClientScanId: row.payload.firstAcceptedClientScanId,
    reason: "duplicate_bib_checkpoint" as const
  }));
}

export async function getNotificationFeed(sql: Sql): Promise<NotificationEvent[]> {
  const rows = await sql<{
    id: string;
    checkpoint_id: string;
    bib: string;
    position: number;
    created_at: string;
    delivered: boolean;
  }[]>`
    select id, checkpoint_id, bib, position, created_at, delivered
    from public.top5_notifications
    order by created_at desc
    limit 50
  `;

  return rows.map((row) => ({
    id: row.id,
    channel: "telegram",
    checkpointId: row.checkpoint_id,
    bib: row.bib,
    position: row.position,
    createdAt: toIsoString(row.created_at),
    delivered: row.delivered
  }));
}

async function maybeNotifyTop5(
  tx: Sql,
  input: {
    bib: string;
    checkpointId: string;
    participantId: string;
    position: number;
    scannedAt: string;
  }
): Promise<NotificationEvent | null> {
  if (input.position > 5) {
    return null;
  }

  const existing = await tx<{ id: string }[]>`
    select id
    from public.top5_notifications
    where checkpoint_id = ${input.checkpointId}
      and bib = ${input.bib}
      and position = ${input.position}
    limit 1
  `;

  if (existing.length > 0) {
    return null;
  }

  const [checkpoint] = defaultCheckpoints.filter((item) => item.id === input.checkpointId);
  const telegram = await sendTelegramTop5Message({
    bib: input.bib,
    checkpointCode: checkpoint?.code ?? input.checkpointId,
    position: input.position,
    scannedAt: input.scannedAt
  });

  const [row] = await tx<{
    id: string;
    created_at: string;
    delivered: boolean;
  }[]>`
    insert into public.top5_notifications (
      checkpoint_id,
      participant_id,
      bib,
      position,
      telegram_message_id,
      delivered,
      payload
    )
    values (
      ${input.checkpointId},
      ${input.participantId},
      ${input.bib},
      ${input.position},
      ${telegram.messageId},
      ${telegram.delivered},
      ${tx.json({
        telegramDelivered: telegram.delivered
      })}
    )
    returning id, created_at, delivered
  `;

  return {
    id: row.id,
    channel: "telegram",
    checkpointId: input.checkpointId,
    bib: input.bib,
    position: input.position,
    createdAt: toIsoString(row.created_at),
    delivered: row.delivered
  };
}

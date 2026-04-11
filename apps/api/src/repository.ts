import type { Sql } from "postgres";
import type {
  AcceptedScan,
  CheckpointLeaderboard,
  DuplicateScan,
  DuplicateWithdrawal,
  LeaderboardEntry,
  NotificationEvent,
  OverallLeaderboard,
  OverallLeaderboardEntry,
  RecordedWithdrawal,
  RecentPassing,
  RunnerDetail,
  RunnerSearchEntry,
  RunnerPassing,
  ScanSubmission,
  WithdrawalSubmission
} from "./contracts.js";
import { defaultCheckpoints } from "./contracts.js";
import type { AuthUser } from "./auth.js";
import { sendTelegramTop5Message } from "./telegram.js";

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeBib(value: string) {
  return value.trim().toUpperCase();
}

type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export async function ensureOrganizerWorkspaceTable(sql: Sql) {
  await sql`
    create table if not exists public.organizer_workspaces (
      owner_user_id text primary key,
      username text,
      display_name text,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;

  await sql`
    create index if not exists organizer_workspaces_updated_at_idx
    on public.organizer_workspaces (updated_at desc)
  `;
}

export async function getOrganizerWorkspace(
  sql: Sql,
  ownerUserId: string
): Promise<{
  ownerUserId: string;
  username: string | null;
  displayName: string | null;
  payload: unknown;
  updatedAt: string;
} | null> {
  const [row] = await sql<{
    owner_user_id: string;
    username: string | null;
    display_name: string | null;
    payload: unknown;
    updated_at: string | Date;
  }[]>`
    select owner_user_id, username, display_name, payload, updated_at
    from public.organizer_workspaces
    where owner_user_id = ${ownerUserId}
    limit 1
  `;

  if (!row) {
    return null;
  }

  return {
    ownerUserId: row.owner_user_id,
    username: row.username,
    displayName: row.display_name,
    payload: row.payload,
    updatedAt: toIsoString(row.updated_at)
  };
}

export async function saveOrganizerWorkspace(
  sql: Sql,
  input: {
    ownerUserId: string;
    username: string | null;
    displayName: string | null;
    payload: JsonValue;
  }
) {
  const [row] = await sql<{
    updated_at: string | Date;
  }[]>`
    insert into public.organizer_workspaces (
      owner_user_id,
      username,
      display_name,
      payload,
      updated_at
    )
    values (
      ${input.ownerUserId},
      ${input.username},
      ${input.displayName},
      ${sql.json(input.payload)},
      now()
    )
    on conflict (owner_user_id) do update
    set
      username = excluded.username,
      display_name = excluded.display_name,
      payload = excluded.payload,
      updated_at = now()
    returning updated_at
  `;

  return {
    updatedAt: row ? toIsoString(row.updated_at) : new Date().toISOString()
  };
}

export async function listOrganizerWorkspaces(
  sql: Sql,
  limit?: number
): Promise<
  Array<{
    ownerUserId: string;
    username: string | null;
    displayName: string | null;
    payload: unknown;
    updatedAt: string;
  }>
> {
  const safeLimit = typeof limit === "number" && Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 100) : null;
  const rows = await sql<{
    owner_user_id: string;
    username: string | null;
    display_name: string | null;
    payload: unknown;
    updated_at: string | Date;
  }[]>`
    select owner_user_id, username, display_name, payload, updated_at
    from public.organizer_workspaces
    order by updated_at desc
    ${safeLimit ? sql`limit ${safeLimit}` : sql``}
  `;

  return rows.map((row) => ({
    ownerUserId: row.owner_user_id,
    username: row.username,
    displayName: row.display_name,
    payload: row.payload,
    updatedAt: toIsoString(row.updated_at)
  }));
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

export type WithdrawalProcessResult =
  | {
      status: "recorded";
      withdrawal: RecordedWithdrawal;
    }
  | {
      status: "already_withdrawn";
      withdrawal: DuplicateWithdrawal;
    };

type CheckpointSeed = {
  id: string;
  code: string;
  name: string;
  kmMarker: number;
  order: number;
};

async function ensureCrewAndParticipant(
  tx: Sql,
  actor: AuthUser,
  input: {
    crewId: string;
    bib: string;
  }
) {
  const crewCode = actor.crewCode ?? input.crewId;
  const crewName = actor.displayName ?? actor.email ?? crewCode;
  const normalizedBib = normalizeBib(input.bib);

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
    values (${normalizedBib}, ${`Runner ${normalizedBib}`})
    on conflict (bib) do update
    set name = public.participants.name
    returning id
  `;

  return {
    crew,
    crewCode,
    normalizedBib,
    participant
  };
}

export async function ensureDefaultCheckpoints(sql: Sql) {
  const [existing] = await sql<{ total: number }[]>`
    select count(*)::int as total
    from public.checkpoints
  `;

  if (Number(existing?.total ?? 0) > 0) {
    return;
  }

  await sql.begin(async (txAny) => {
    const tx = txAny as unknown as Sql;

    for (const checkpoint of defaultCheckpoints) {
      await insertCheckpointSeedIfMissing(tx, checkpoint);
    }
  });
}

export async function syncConfiguredCheckpoints(sql: Sql, checkpoints: CheckpointSeed[]) {
  await sql.begin(async (txAny) => {
    const tx = txAny as unknown as Sql;

    for (const checkpoint of checkpoints) {
      await moveCheckpointToSafeOrder(tx, checkpoint.id);
    }

    for (const checkpoint of checkpoints) {
      await reserveCheckpointOrderIndex(tx, checkpoint.id, checkpoint.order);
      await upsertCheckpointSeed(tx, checkpoint);
    }
  });
}

async function moveCheckpointToSafeOrder(sql: Sql, checkpointId: string) {
  await sql`
    update public.checkpoints
    set order_index = (
      select coalesce(max(existing.order_index), 0) + 1000
      from public.checkpoints as existing
    )
    where id = ${checkpointId}
  `;
}

async function reserveCheckpointOrderIndex(sql: Sql, checkpointId: string, orderIndex: number) {
  await sql`
    update public.checkpoints
    set order_index = (
      select coalesce(max(existing.order_index), 0) + 1000
      from public.checkpoints as existing
    )
    where order_index = ${orderIndex}
      and id <> ${checkpointId}
  `;
}

async function resolveSafeOrderIndex(sql: Sql, checkpointId: string, preferredOrder: number) {
  const [row] = await sql<{ order_index: number }[]>`
    select
      case
        when exists (
          select 1
          from public.checkpoints
          where order_index = ${preferredOrder}
            and id <> ${checkpointId}
        )
        then (
          select coalesce(max(existing.order_index), 0) + 1000
          from public.checkpoints as existing
        )
        else ${preferredOrder}
      end as order_index
  `;

  return Number(row?.order_index ?? preferredOrder);
}

async function insertCheckpointSeedIfMissing(sql: Sql, seed: CheckpointSeed) {
  const orderIndex = await resolveSafeOrderIndex(sql, seed.id, seed.order);

  await sql`
    insert into public.checkpoints (id, code, name, km_marker, order_index, is_active)
    values (${seed.id}, ${seed.code}, ${seed.name}, ${seed.kmMarker}, ${orderIndex}, true)
    on conflict (id) do nothing
  `;
}

async function upsertCheckpointSeed(sql: Sql, seed: CheckpointSeed) {
  await sql`
    insert into public.checkpoints (id, code, name, km_marker, order_index, is_active)
    values (${seed.id}, ${seed.code}, ${seed.name}, ${seed.kmMarker}, ${seed.order}, true)
    on conflict (id) do update
    set
      code = excluded.code,
      name = excluded.name,
      km_marker = excluded.km_marker,
      order_index = excluded.order_index,
      is_active = true
  `;
}

function resolveFallbackCheckpointSeed(checkpointId: string) {
  const predefined = defaultCheckpoints.find((checkpoint) => checkpoint.id === checkpointId);

  if (predefined) {
    return {
      code: predefined.code,
      name: predefined.name,
      kmMarker: predefined.kmMarker,
      order: predefined.order
    };
  }

  if (checkpointId === "cp-start" || checkpointId === "start") {
    return {
      code: "START",
      name: "Start",
      kmMarker: 0,
      order: 0
    };
  }

  if (checkpointId === "finish" || checkpointId === "cp-finish") {
    return {
      code: "FIN",
      name: "Finish",
      kmMarker: 999,
      order: 999
    };
  }

  const extraMatch = /^cp-extra-(\d+)$/i.exec(checkpointId);

  if (extraMatch) {
    const checkpointNumber = Number(extraMatch[1]);

    return {
      code: `CP${checkpointNumber}`,
      name: `Checkpoint ${checkpointNumber}`,
      kmMarker: checkpointNumber,
      order: checkpointNumber
    };
  }

  const numericMatch = /^cp-(\d+)$/i.exec(checkpointId);

  if (!numericMatch) {
    return null;
  }

  const rawValue = Number(numericMatch[1]);

  if (!Number.isFinite(rawValue)) {
    return null;
  }

  const checkpointNumber = rawValue >= 40 && rawValue % 10 === 0 ? rawValue / 10 : rawValue;

  return {
    code: `CP${checkpointNumber}`,
    name: `Checkpoint ${checkpointNumber}`,
    kmMarker: rawValue,
    order: checkpointNumber
  };
}

async function ensureCheckpointExists(sql: Sql, checkpointId: string) {
  const seed = resolveFallbackCheckpointSeed(checkpointId);

  if (!seed) {
    return;
  }

  await insertCheckpointSeedIfMissing(sql, { id: checkpointId, ...seed });
}

export async function processSingleScan(
  sql: Sql,
  scan: ScanSubmission,
  actor: AuthUser
): Promise<ScanProcessResult> {
  await ensureCheckpointExists(sql, scan.checkpointId);

  const result = await sql.begin(async (txAny) => {
    const tx = txAny as unknown as Sql;
    const { crew, crewCode, normalizedBib, participant } = await ensureCrewAndParticipant(tx, actor, {
      crewId: scan.crewId,
      bib: scan.bib
    });

    const existing = await tx<{
      client_scan_id: string;
    }[]>`
      select client_scan_id
      from public.scans
      where race_id = ${scan.raceId}
        and checkpoint_id = ${scan.checkpointId}
        and upper(trim(bib)) = ${normalizedBib}
      limit 1
    `;

    if (existing.length > 0) {
      const duplicate: DuplicateScan = {
        clientScanId: scan.clientScanId,
        raceId: scan.raceId,
        checkpointId: scan.checkpointId,
        bib: normalizedBib,
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
          ${normalizedBib},
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
        ${normalizedBib},
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
      bib: normalizedBib,
      checkpointId: scan.checkpointId,
      participantId: participant.id,
      position: insertedScan.position,
      scannedAt: scan.scannedAt
    });

    const officialScan: AcceptedScan = {
      clientScanId: scan.clientScanId,
      raceId: scan.raceId,
      checkpointId: scan.checkpointId,
      bib: normalizedBib,
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

export async function processSingleWithdrawal(
  sql: Sql,
  withdrawal: WithdrawalSubmission,
  actor: AuthUser
): Promise<WithdrawalProcessResult> {
  const result = await sql.begin(async (txAny) => {
    const tx = txAny as unknown as Sql;
    const { crewCode, normalizedBib, participant } = await ensureCrewAndParticipant(tx, actor, {
      crewId: withdrawal.crewId,
      bib: withdrawal.bib
    });

    const existing = await tx<{
      created_at: string | Date;
      payload: {
        clientWithdrawId?: string;
      };
    }[]>`
      select created_at, payload
      from public.audit_logs
      where type = 'runner_withdrawn'
        and race_id = ${withdrawal.raceId}
        and upper(trim(bib)) = ${normalizedBib}
      order by created_at asc
      limit 1
    `;

    if (existing.length > 0) {
      return {
        status: "already_withdrawn",
        withdrawal: {
          clientWithdrawId: withdrawal.clientWithdrawId,
          raceId: withdrawal.raceId,
          checkpointId: withdrawal.checkpointId,
          bib: normalizedBib,
          crewId: withdrawal.crewId,
          deviceId: withdrawal.deviceId,
          reportedAt: withdrawal.reportedAt,
          capturedOffline: withdrawal.capturedOffline,
          note: withdrawal.note ?? null,
          serverReceivedAt: toIsoString(existing[0].created_at),
          firstRecordedClientWithdrawId: existing[0].payload?.clientWithdrawId ?? "server-withdrawal",
          reason: "already_withdrawn"
        }
      } satisfies WithdrawalProcessResult;
    }

    const [auditRow] = await tx<{
      created_at: string | Date;
    }[]>`
      insert into public.audit_logs (type, race_id, checkpoint_id, bib, payload)
      values (
        'runner_withdrawn',
        ${withdrawal.raceId},
        ${withdrawal.checkpointId},
        ${normalizedBib},
        ${tx.json({
          clientWithdrawId: withdrawal.clientWithdrawId,
          participantId: participant.id,
          crewCode,
          deviceId: withdrawal.deviceId,
          reportedAt: withdrawal.reportedAt,
          note: withdrawal.note ?? null
        })}
      )
      returning created_at
    `;

    return {
      status: "recorded",
      withdrawal: {
        clientWithdrawId: withdrawal.clientWithdrawId,
        raceId: withdrawal.raceId,
        checkpointId: withdrawal.checkpointId,
        bib: normalizedBib,
        crewId: crewCode,
        deviceId: withdrawal.deviceId,
        reportedAt: withdrawal.reportedAt,
        capturedOffline: withdrawal.capturedOffline,
        note: withdrawal.note ?? null,
        serverReceivedAt: toIsoString(auditRow.created_at),
        reason: "runner_withdrawn"
      }
    } satisfies WithdrawalProcessResult;
  });

  return result as WithdrawalProcessResult;
}

export async function syncOfflineWithdrawals(sql: Sql, withdrawals: WithdrawalSubmission[], actor: AuthUser) {
  const results: WithdrawalProcessResult[] = [];

  for (const withdrawal of withdrawals) {
    results.push(await processSingleWithdrawal(sql, withdrawal, actor));
  }

  return {
    total: withdrawals.length,
    recorded: results.filter((item) => item.status === "recorded").length,
    duplicates: results.filter((item) => item.status === "already_withdrawn").length,
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

  const totals = await sql<{
    checkpoint_id: string;
    total: number;
  }[]>`
    select checkpoint_id, count(*)::int as total
    from public.scans
    group by checkpoint_id
  `;

  const totalsByCheckpoint = new Map(totals.map((row) => [row.checkpoint_id, row.total]));

  return checkpointList.map((checkpoint) => ({
    checkpointId: checkpoint.id,
    totalOfficialScans: totalsByCheckpoint.get(checkpoint.id) ?? 0,
    topEntries: []
  }));
}

export async function getOverallLeaderboard(
  sql: Sql,
  limit = 20,
  category?: string | null
): Promise<OverallLeaderboard> {
  const normalizedCategory = category?.trim().toLowerCase() || null;

  const [totals] = await sql<{ total: number }[]>`
    select count(distinct participant_id)::int as total
    from public.scans s
    inner join public.participants p on p.id = s.participant_id
    where ${normalizedCategory ? sql`lower(p.category) = ${normalizedCategory}` : sql`true`}
  `;

  const rows = await sql<{
    bib: string;
    name: string;
    category: string;
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
        p.name,
        p.category,
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
      inner join public.participants p on p.id = s.participant_id
      where c.is_active = true
        and not exists (
          select 1
          from public.audit_logs a
          where a.type = 'runner_withdrawn'
            and a.race_id = s.race_id
            and upper(trim(a.bib)) = upper(trim(s.bib))
        )
        and ${normalizedCategory ? sql`lower(p.category) = ${normalizedCategory}` : sql`true`}
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
      name,
      category,
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
    name: row.name,
    category: row.category,
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

export async function searchRunners(
  sql: Sql,
  input: {
    query?: string | null;
    checkpointId?: string | null;
    limit?: number;
  }
): Promise<RunnerSearchEntry[]> {
  const normalizedQuery = input.query ? input.query.trim().toUpperCase() : "";
  const likeQuery = `%${normalizedQuery}%`;
  const checkpointFilter = input.checkpointId && input.checkpointId !== "all" ? input.checkpointId : null;
  const limit = Math.min(Math.max(input.limit ?? 12, 1), 50);

  const rows = await sql<{
    bib: string;
    name: string;
    rank: number | string;
    checkpoint_id: string;
    checkpoint_code: string;
    checkpoint_name: string;
    checkpoint_km_marker: number;
    checkpoint_order: number;
    scanned_at: string | Date;
    crew_code: string;
    device_id: string;
  }[]>`
    with ranked_progress as (
      select
        s.participant_id,
        s.bib,
        p.name,
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
      inner join public.participants p on p.id = s.participant_id
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
      name,
      rank,
      checkpoint_id,
      checkpoint_code,
      checkpoint_name,
      checkpoint_km_marker,
      checkpoint_order,
      scanned_at,
      crew_code,
      device_id
    from ordered_progress
    where (
      ${normalizedQuery ? sql`upper(trim(bib)) like ${likeQuery} or upper(trim(name)) like ${likeQuery}` : sql`true`}
    )
      and (
        ${checkpointFilter ? sql`checkpoint_id = ${checkpointFilter}` : sql`true`}
      )
    order by rank asc
    limit ${limit}
  `;

  return rows.map((row) => ({
    bib: row.bib,
    name: row.name,
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
}

export async function getRunnerDetail(sql: Sql, bib: string): Promise<RunnerDetail | null> {
  const normalizedBib = normalizeBib(bib);

  const [runner] = await sql<{
    bib: string;
    name: string;
    rank: number | string;
    checkpoint_id: string;
    checkpoint_code: string;
    checkpoint_name: string;
    checkpoint_km_marker: number;
    checkpoint_order: number;
    scanned_at: string | Date;
    crew_code: string;
    device_id: string;
  }[]>`
    with ranked_progress as (
      select
        s.participant_id,
        s.bib,
        p.name,
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
      inner join public.participants p on p.id = s.participant_id
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
      name,
      rank,
      checkpoint_id,
      checkpoint_code,
      checkpoint_name,
      checkpoint_km_marker,
      checkpoint_order,
      scanned_at,
      crew_code,
      device_id
    from ordered_progress
    where upper(trim(bib)) = ${normalizedBib}
    limit 1
  `;

  if (!runner) {
    return null;
  }

  const passingsRows = await sql<{
    checkpoint_id: string;
    checkpoint_code: string;
    checkpoint_name: string;
    checkpoint_km_marker: number;
    checkpoint_order: number;
    scanned_at: string | Date;
    position: number;
    crew_code: string;
    device_id: string;
  }[]>`
    select
      s.checkpoint_id,
      c.code as checkpoint_code,
      c.name as checkpoint_name,
      c.km_marker as checkpoint_km_marker,
      c.order_index as checkpoint_order,
      s.scanned_at,
      s.position,
      s.crew_code,
      s.device_id
    from public.scans s
    inner join public.checkpoints c on c.id = s.checkpoint_id
    where upper(trim(s.bib)) = ${normalizedBib}
    order by c.order_index asc, s.scanned_at asc, s.position asc
  `;

  const passings: RunnerPassing[] = passingsRows.map((row) => ({
    checkpointId: row.checkpoint_id,
    checkpointCode: row.checkpoint_code,
    checkpointName: row.checkpoint_name,
    checkpointKmMarker: Number(row.checkpoint_km_marker),
    checkpointOrder: row.checkpoint_order,
    scannedAt: toIsoString(row.scanned_at),
    position: row.position,
    crewId: row.crew_code,
    deviceId: row.device_id
  }));

  return {
    bib: runner.bib,
    name: runner.name,
    rank: Number(runner.rank),
    currentCheckpointId: runner.checkpoint_id,
    currentCheckpointCode: runner.checkpoint_code,
    currentCheckpointName: runner.checkpoint_name,
    currentCheckpointKmMarker: Number(runner.checkpoint_km_marker),
    currentCheckpointOrder: runner.checkpoint_order,
    lastScannedAt: toIsoString(runner.scanned_at),
    totalPassings: passings.length,
    passings
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

export async function getRecentPassings(sql: Sql, limit = 12): Promise<RecentPassing[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 30);

  const rows = await sql<{
    bib: string;
    name: string;
    checkpoint_id: string;
    checkpoint_code: string;
    checkpoint_name: string;
    checkpoint_km_marker: number;
    scanned_at: string | Date;
    crew_code: string;
    device_id: string;
    position: number;
  }[]>`
    select
      s.bib,
      p.name,
      s.checkpoint_id,
      c.code as checkpoint_code,
      c.name as checkpoint_name,
      c.km_marker as checkpoint_km_marker,
      s.scanned_at,
      s.crew_code,
      s.device_id,
      s.position
    from public.scans s
    inner join public.participants p on p.id = s.participant_id
    inner join public.checkpoints c on c.id = s.checkpoint_id
    where c.is_active = true
    order by s.scanned_at desc, s.server_received_at desc
    limit ${safeLimit}
  `;

  return rows.map((row) => ({
    bib: row.bib,
    name: row.name,
    checkpointId: row.checkpoint_id,
    checkpointCode: row.checkpoint_code,
    checkpointName: row.checkpoint_name,
    checkpointKmMarker: Number(row.checkpoint_km_marker),
    scannedAt: toIsoString(row.scanned_at),
    crewId: row.crew_code,
    deviceId: row.device_id,
    position: row.position
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

  const [checkpoint] = await tx<{ code: string }[]>`
    select code
    from public.checkpoints
    where id = ${input.checkpointId}
    limit 1
  `;
  const [defaultCheckpoint] = defaultCheckpoints.filter((item) => item.id === input.checkpointId);
  const telegram = await sendTelegramTop5Message({
    bib: input.bib,
    checkpointCode: checkpoint?.code ?? defaultCheckpoint?.code ?? input.checkpointId,
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

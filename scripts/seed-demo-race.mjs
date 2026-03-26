import postgres from "postgres";
import { randomUUID } from "node:crypto";

const config = {
  databaseUrl: process.env.DATABASE_URL,
  runnerCount: Number(process.env.DEMO_RUNNER_COUNT ?? 500),
  raceId: process.env.DEMO_RACE_ID ?? "templiers-demo-2026",
  raceStart: process.env.DEMO_RACE_START ?? "2026-03-29T00:15:00+07:00"
};

const checkpoints = [
  { id: "cp-start", code: "START", name: "Millau", kmMarker: 0, order: 0, deviceId: "scanner-start-01", crewCode: "crew-01" },
  { id: "cp-10", code: "CP1", name: "Peyreleau", kmMarker: 23.3, order: 1, deviceId: "scanner-cp1-01", crewCode: "crew-02" },
  { id: "cp-21", code: "CP2", name: "Roquesaltes", kmMarker: 44.4, order: 2, deviceId: "scanner-cp2-01", crewCode: "crew-03" },
  { id: "cp-30", code: "CP3", name: "La Salvage", kmMarker: 55.9, order: 3, deviceId: "scanner-cp3-01", crewCode: "crew-04" },
  { id: "finish", code: "FIN", name: "Arrivee Millau", kmMarker: 80.6, order: 4, deviceId: "scanner-finish-01", crewCode: "crew-05" }
];

const crewTemplates = [
  { code: "crew-01", name: "Millau Start Crew", role: "crew" },
  { code: "crew-02", name: "Peyreleau Crew", role: "crew" },
  { code: "crew-03", name: "Roquesaltes Crew", role: "crew" },
  { code: "crew-04", name: "La Salvage Crew", role: "crew" },
  { code: "crew-05", name: "Finish Crew", role: "crew" }
];

const womenFirstNames = [
  "Alya", "Sinta", "Nadia", "Rania", "Keisha", "Nayla", "Anya", "Livia", "Mei", "Clara",
  "Sofia", "Maya", "Raisa", "Putri", "Naomi", "Aisha", "Luna", "Tasya", "Dinda", "Farah"
];
const menFirstNames = [
  "Rama", "Bima", "Fajar", "Adit", "Rafi", "Arga", "Dio", "Rizky", "Farrel", "Gilang",
  "Raka", "Naufal", "Yuda", "Tegar", "Reno", "Bagas", "Aldo", "Kevin", "Hanif", "Yoga"
];
const lastNames = [
  "Pratama", "Santoso", "Mahendra", "Wibowo", "Saputra", "Utama", "Kusuma", "Permana", "Wijaya", "Nugraha",
  "Lestari", "Sari", "Kirana", "Andika", "Pamungkas", "Hidayat", "Putra", "Prameswari", "Ardana", "Setiawan",
  "Mulyadi", "Prakoso", "Putri", "Anindita", "Firmansyah", "Gunawan", "Fauzi", "Rahardjo", "Syahputra", "Yuliani"
];

function assertConfig() {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL wajib diisi untuk seed demo race.");
  }

  if (config.runnerCount < 50) {
    throw new Error("DEMO_RUNNER_COUNT minimal 50.");
  }
}

function createRandom(seed) {
  let value = seed >>> 0;

  return () => {
    value += 0x6d2b79f5;
    let next = Math.imul(value ^ (value >>> 15), value | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toIso(valueMs) {
  return new Date(valueMs).toISOString();
}

function buildParticipants(count) {
  const random = createRandom(20260326);
  const namesUsed = new Map();

  const participants = Array.from({ length: count }, (_, index) => {
    const isWoman = random() < 0.34;
    const firstNamePool = isWoman ? womenFirstNames : menFirstNames;
    const firstName = firstNamePool[Math.floor(random() * firstNamePool.length)];
    const lastName = lastNames[Math.floor(random() * lastNames.length)];
    const fullNameBase = `${firstName} ${lastName}`;
    const duplicateCount = namesUsed.get(fullNameBase) ?? 0;
    namesUsed.set(fullNameBase, duplicateCount + 1);

    return {
      id: randomUUID(),
      bib: `T${String(index + 1).padStart(4, "0")}`,
      name: duplicateCount > 0 ? `${fullNameBase} ${duplicateCount + 1}` : fullNameBase,
      category: isWoman ? "women" : "men",
      score: random()
    };
  });

  participants.sort((left, right) => left.score - right.score);

  const stageBuckets = [
    Math.floor(count * 0.14),
    Math.floor(count * 0.24),
    Math.floor(count * 0.28),
    Math.floor(count * 0.22)
  ];
  const finishedCount = stageBuckets[0];
  const cp3Count = stageBuckets[1];
  const cp2Count = stageBuckets[2];
  const cp1Count = stageBuckets[3];

  participants.forEach((participant, index) => {
    let stage = 0;

    if (index < finishedCount) {
      stage = 4;
    } else if (index < finishedCount + cp3Count) {
      stage = 3;
    } else if (index < finishedCount + cp3Count + cp2Count) {
      stage = 2;
    } else if (index < finishedCount + cp3Count + cp2Count + cp1Count) {
      stage = 1;
    }

    participant.stage = stage;
    participant.rankSeed = index + 1;
  });

  return participants;
}

function buildScanRows(participants) {
  const random = createRandom(8080);
  const raceStartMs = new Date(config.raceStart).getTime();
  const segmentDistances = [23.3, 21.1, 11.5, 24.7];
  const segmentFactors = [1.02, 1.26, 1.12, 1.31];
  const scanRows = [];

  for (const participant of participants) {
    const normalizedRank = participant.rankSeed / participants.length;
    const basePaceMinPerKm =
      7.8 +
      normalizedRank * 7.2 +
      (participant.category === "women" ? 0.25 : 0) +
      random() * 0.9;

    let elapsedMinutes = participant.rankSeed * 0.045 + random() * 1.6;

    scanRows.push({
      clientScanId: `${participant.bib}-${checkpoints[0].id}`,
      raceId: config.raceId,
      checkpointId: checkpoints[0].id,
      participantId: participant.id,
      bib: participant.bib,
      crewCode: checkpoints[0].crewCode,
      deviceId: checkpoints[0].deviceId,
      scannedAt: toIso(raceStartMs + elapsedMinutes * 60_000),
      capturedOffline: false
    });

    for (let checkpointIndex = 1; checkpointIndex <= participant.stage; checkpointIndex += 1) {
      const checkpoint = checkpoints[checkpointIndex];
      const segmentMinutes =
        segmentDistances[checkpointIndex - 1] *
        basePaceMinPerKm *
        segmentFactors[checkpointIndex - 1] *
        (0.95 + random() * 0.14);

      elapsedMinutes += segmentMinutes + random() * 6;

      scanRows.push({
        clientScanId: `${participant.bib}-${checkpoint.id}`,
        raceId: config.raceId,
        checkpointId: checkpoint.id,
        participantId: participant.id,
        bib: participant.bib,
        crewCode: checkpoint.crewCode,
        deviceId: checkpoint.deviceId,
        scannedAt: toIso(raceStartMs + elapsedMinutes * 60_000),
        capturedOffline: checkpointIndex > 1 && random() < 0.12
      });
    }
  }

  const rowsByCheckpoint = new Map(checkpoints.map((checkpoint) => [checkpoint.id, []]));

  for (const row of scanRows) {
    rowsByCheckpoint.get(row.checkpointId)?.push(row);
  }

  for (const checkpoint of checkpoints) {
    const rows = rowsByCheckpoint.get(checkpoint.id) ?? [];
    rows.sort((left, right) => left.scannedAt.localeCompare(right.scannedAt) || left.bib.localeCompare(right.bib));
    rows.forEach((row, index) => {
      row.position = index + 1;
    });
  }

  return scanRows.sort((left, right) => left.scannedAt.localeCompare(right.scannedAt));
}

function buildNotificationRows(scanRows) {
  return scanRows
    .filter((row) => row.checkpointId !== "cp-start" && row.position <= 5)
    .map((row) => ({
      checkpointId: row.checkpointId,
      participantId: row.participantId,
      bib: row.bib,
      position: row.position,
      telegramMessageId: `demo-${row.checkpointId}-${row.position}`,
      delivered: true,
      payload: { source: "demo-seed", delivered: true },
      createdAt: row.scannedAt
    }));
}

function buildDuplicateAuditRows(scanRows) {
  const random = createRandom(4040);
  const candidates = scanRows.filter((row) => row.checkpointId !== "cp-start");
  const picked = [];

  for (let index = 0; index < 12 && candidates.length > 0; index += 1) {
    const pickIndex = Math.floor(random() * candidates.length);
    const [row] = candidates.splice(pickIndex, 1);
    const duplicateAt = new Date(new Date(row.scannedAt).getTime() + (index + 1) * 40_000).toISOString();

    picked.push({
      type: "duplicate_scan",
      raceId: row.raceId,
      checkpointId: row.checkpointId,
      bib: row.bib,
      payload: {
        clientScanId: `${row.clientScanId}-duplicate`,
        deviceId: row.deviceId,
        firstAcceptedClientScanId: row.clientScanId
      },
      createdAt: duplicateAt
    });
  }

  return picked.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function main() {
  assertConfig();

  const sql = postgres(config.databaseUrl, {
    idle_timeout: 5,
    max: 1,
    max_lifetime: 60,
    prepare: false,
    ssl: "require"
  });

  const participants = buildParticipants(config.runnerCount);
  const scanRows = buildScanRows(participants);
  const notificationRows = buildNotificationRows(scanRows);
  const duplicateAuditRows = buildDuplicateAuditRows(scanRows);

  await sql.begin(async (transaction) => {
    await transaction`delete from public.top5_notifications`;
    await transaction`delete from public.audit_logs`;
    await transaction`delete from public.scans`;
    await transaction`delete from public.participants`;

    await transaction`
      insert into public.checkpoints (id, code, name, km_marker, order_index, is_active)
      ${transaction(
        checkpoints.map((checkpoint) => ({
          id: checkpoint.id,
          code: checkpoint.code,
          name: checkpoint.name,
          km_marker: checkpoint.kmMarker,
          order_index: checkpoint.order,
          is_active: true
        })),
        "id",
        "code",
        "name",
        "km_marker",
        "order_index",
        "is_active"
      )}
      on conflict (id) do update
      set
        code = excluded.code,
        name = excluded.name,
        km_marker = excluded.km_marker,
        order_index = excluded.order_index,
        is_active = true
    `;

    await transaction`
      insert into public.crews (code, name, role)
      ${transaction(
        crewTemplates.map((crew) => ({
          code: crew.code,
          name: crew.name,
          role: crew.role
        })),
        "code",
        "name",
        "role"
      )}
      on conflict (code) do update
      set
        name = excluded.name,
        role = excluded.role
    `;

    const crewRows = await transaction`
      select id, code
      from public.crews
    `;
    const crewIdByCode = new Map(crewRows.map((row) => [row.code, row.id]));

    await transaction`
      insert into public.participants (id, bib, name, category)
      ${transaction(
        participants.map((participant) => ({
          id: participant.id,
          bib: participant.bib,
          name: participant.name,
          category: participant.category
        })),
        "id",
        "bib",
        "name",
        "category"
      )}
    `;

    await transaction`
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
        position,
        server_received_at
      )
      ${transaction(
        scanRows.map((row) => ({
          client_scan_id: row.clientScanId,
          race_id: row.raceId,
          checkpoint_id: row.checkpointId,
          participant_id: row.participantId,
          bib: row.bib,
          crew_id: crewIdByCode.get(row.crewCode) ?? null,
          crew_code: row.crewCode,
          device_id: row.deviceId,
          scanned_at: row.scannedAt,
          captured_offline: row.capturedOffline,
          position: row.position,
          server_received_at: row.scannedAt
        })),
        "client_scan_id",
        "race_id",
        "checkpoint_id",
        "participant_id",
        "bib",
        "crew_id",
        "crew_code",
        "device_id",
        "scanned_at",
        "captured_offline",
        "position",
        "server_received_at"
      )}
    `;

    await transaction`
      insert into public.top5_notifications (
        checkpoint_id,
        participant_id,
        bib,
        position,
        telegram_message_id,
        delivered,
        payload,
        created_at
      )
      ${transaction(
        notificationRows.map((notification) => ({
          checkpoint_id: notification.checkpointId,
          participant_id: notification.participantId,
          bib: notification.bib,
          position: notification.position,
          telegram_message_id: notification.telegramMessageId,
          delivered: notification.delivered,
          payload: transaction.json(notification.payload),
          created_at: notification.createdAt
        })),
        "checkpoint_id",
        "participant_id",
        "bib",
        "position",
        "telegram_message_id",
        "delivered",
        "payload",
        "created_at"
      )}
    `;

    await transaction`
      insert into public.audit_logs (
        type,
        race_id,
        checkpoint_id,
        bib,
        payload,
        created_at
      )
      ${transaction(
        duplicateAuditRows.map((duplicateAudit) => ({
          type: duplicateAudit.type,
          race_id: duplicateAudit.raceId,
          checkpoint_id: duplicateAudit.checkpointId,
          bib: duplicateAudit.bib,
          payload: transaction.json(duplicateAudit.payload),
          created_at: duplicateAudit.createdAt
        })),
        "type",
        "race_id",
        "checkpoint_id",
        "bib",
        "payload",
        "created_at"
      )}
    `;
  });

  const stageSummary = participants.reduce(
    (summary, participant) => {
      summary[participant.stage] += 1;
      return summary;
    },
    { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }
  );

  const womenCount = participants.filter((participant) => participant.category === "women").length;
  const officialScanCount = scanRows.length;

  console.log(
    JSON.stringify(
      {
        raceId: config.raceId,
        runnerCount: participants.length,
        womenCount,
        officialScanCount,
        notifications: notificationRows.length,
        duplicateAuditLogs: duplicateAuditRows.length,
        checkpointStageSummary: {
          startOnly: stageSummary[0],
          cp1: stageSummary[1],
          cp2: stageSummary[2],
          cp3: stageSummary[3],
          finish: stageSummary[4]
        }
      },
      null,
      2
    )
  );

  await sql.end({ timeout: 5 });
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

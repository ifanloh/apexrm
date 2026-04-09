import type { Sql } from "postgres";
import type { CheckpointLeaderboard, OverallLeaderboard, OverallLeaderboardEntry } from "./contracts.js";

type ParsedEvent = {
  id: number;
  name: string;
  status: string | null;
};

type ParsedRace = {
  id: number;
  eventId: number;
  name: string;
  status: string | null;
};

type ParsedCheckpoint = {
  id: number;
  raceId: number;
  name: string;
  orderIndex: number;
  distanceFromStart: number | null;
  isStartLine: boolean;
  isFinishLine: boolean;
};

type ParsedParticipant = {
  id: number;
  raceId: number;
  bibNumber: string | null;
  fullName: string;
  gender: string | null;
  status: string | null;
};

type PublicCheckpointMapping = {
  localCheckpointId: number;
  publicCheckpointId: string;
  publicCheckpointCode: string;
  publicCheckpointName: string;
  publicCheckpointOrder: number;
  publicCheckpointKmMarker: number;
  scannerCheckpointId: string;
  isFinishLine: boolean;
};

type ScanRow = {
  bib: string;
  checkpoint_id: string;
  position: number;
  scanned_at: string | Date;
  crew_code: string;
  device_id: string;
  server_received_at: string | Date;
};

export type OrganizerPublicLiveRaceSnapshot = {
  updatedAt: string;
  raceId: number;
  raceName: string;
  raceStatus: string;
  totalParticipants: number;
  scannedIn: number;
  finished: number;
  dnf: number;
  overallLeaderboard: OverallLeaderboard;
  womenLeaderboard: OverallLeaderboard;
  checkpointLeaderboards: CheckpointLeaderboard[];
};

const DEMO_CHECKPOINT_IDS = ["cp-start", "cp-10", "cp-21", "cp-30", "cp-40", "finish"] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function normalizeBib(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseWorkspacePayload(payload: unknown) {
  if (!isObject(payload)) {
    return {
      checkpoints: [] as ParsedCheckpoint[],
      events: [] as ParsedEvent[],
      participants: [] as ParsedParticipant[],
      races: [] as ParsedRace[]
    };
  }

  const events = toArray(payload.events)
    .map((eventRecord) => {
      const id = getNumber(eventRecord.id);
      const name = getString(eventRecord.name);

      if (id === null || !name) {
        return null;
      }

      return {
        id,
        name,
        status: getString(eventRecord.status)?.toLowerCase() ?? null
      } satisfies ParsedEvent;
    })
    .filter((event): event is ParsedEvent => Boolean(event));

  const races = toArray(payload.races)
    .map((raceRecord) => {
      const id = getNumber(raceRecord.id);
      const eventId = getNumber(raceRecord.eventId);
      const name = getString(raceRecord.name);

      if (id === null || eventId === null || !name) {
        return null;
      }

      return {
        id,
        eventId,
        name,
        status: getString(raceRecord.status)?.toLowerCase() ?? null
      } satisfies ParsedRace;
    })
    .filter((race): race is ParsedRace => Boolean(race));

  const checkpoints = toArray(payload.checkpoints)
    .map((checkpointRecord) => {
      const id = getNumber(checkpointRecord.id);
      const raceId = getNumber(checkpointRecord.raceId);
      const name = getString(checkpointRecord.name);
      const orderIndex = getNumber(checkpointRecord.orderIndex);

      if (id === null || raceId === null || !name || orderIndex === null) {
        return null;
      }

      return {
        id,
        raceId,
        name,
        orderIndex,
        distanceFromStart: getNumber(checkpointRecord.distanceFromStart),
        isStartLine: Boolean(checkpointRecord.isStartLine),
        isFinishLine: Boolean(checkpointRecord.isFinishLine)
      } satisfies ParsedCheckpoint;
    })
    .filter((checkpoint): checkpoint is ParsedCheckpoint => Boolean(checkpoint));

  const participants = toArray(payload.participants)
    .map((participantRecord) => {
      const id = getNumber(participantRecord.id);
      const raceId = getNumber(participantRecord.raceId);
      const fullName = getString(participantRecord.fullName);

      if (id === null || raceId === null || !fullName) {
        return null;
      }

      return {
        id,
        raceId,
        bibNumber: getString(participantRecord.bibNumber),
        fullName,
        gender: getString(participantRecord.gender)?.toLowerCase() ?? null,
        status: getString(participantRecord.status)?.toLowerCase() ?? null
      } satisfies ParsedParticipant;
    })
    .filter((participant): participant is ParsedParticipant => Boolean(participant));

  return {
    checkpoints,
    events,
    participants,
    races
  };
}

function buildOrganizerRaceScopedId(ownerUserId: string, eventId: number, raceId: number) {
  return `organizer:${ownerUserId}:${eventId}:${raceId}`;
}

function buildScannerCheckpointId(checkpoint: ParsedCheckpoint, intermediateIndex: number) {
  if (checkpoint.isStartLine) {
    return DEMO_CHECKPOINT_IDS[0];
  }

  if (checkpoint.isFinishLine) {
    return DEMO_CHECKPOINT_IDS[DEMO_CHECKPOINT_IDS.length - 1];
  }

  return DEMO_CHECKPOINT_IDS[Math.min(intermediateIndex, DEMO_CHECKPOINT_IDS.length - 2)] ?? `cp-extra-${checkpoint.orderIndex}`;
}

function mapPublicCheckpoints(checkpoints: ParsedCheckpoint[]) {
  let customCheckpointCount = 0;
  let intermediateIndex = 1;

  return checkpoints
    .slice()
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .map((checkpoint, orderIndex) => {
      if (!checkpoint.isStartLine && !checkpoint.isFinishLine) {
        customCheckpointCount += 1;
      }

      const currentIntermediateIndex = checkpoint.isStartLine || checkpoint.isFinishLine ? intermediateIndex : intermediateIndex++;

      return {
        localCheckpointId: checkpoint.id,
        publicCheckpointId: checkpoint.isStartLine ? "cp-start" : checkpoint.isFinishLine ? "finish" : `cp-${customCheckpointCount}`,
        publicCheckpointCode: checkpoint.isStartLine ? "START" : checkpoint.isFinishLine ? "FIN" : `CP${customCheckpointCount}`,
        publicCheckpointName: checkpoint.name,
        publicCheckpointOrder: orderIndex,
        publicCheckpointKmMarker: checkpoint.distanceFromStart ?? 0,
        scannerCheckpointId: buildScannerCheckpointId(checkpoint, currentIntermediateIndex),
        isFinishLine: checkpoint.isFinishLine
      } satisfies PublicCheckpointMapping;
    });
}

function compareProgress(
  left: { mapping: PublicCheckpointMapping; row: ScanRow },
  right: { mapping: PublicCheckpointMapping; row: ScanRow }
) {
  if (left.mapping.publicCheckpointOrder !== right.mapping.publicCheckpointOrder) {
    return left.mapping.publicCheckpointOrder - right.mapping.publicCheckpointOrder;
  }

  const scannedAtDiff = new Date(right.row.scanned_at).getTime() - new Date(left.row.scanned_at).getTime();

  if (scannedAtDiff !== 0) {
    return scannedAtDiff;
  }

  if (left.row.position !== right.row.position) {
    return right.row.position - left.row.position;
  }

  return new Date(right.row.server_received_at).getTime() - new Date(left.row.server_received_at).getTime();
}

function buildCheckpointLeaderboards(mappings: PublicCheckpointMapping[], scanRows: ScanRow[]) {
  return mappings.map((mapping) => {
    const checkpointRows = scanRows
      .filter((row) => row.checkpoint_id === mapping.scannerCheckpointId)
      .sort((left, right) => left.position - right.position || new Date(left.scanned_at).getTime() - new Date(right.scanned_at).getTime());

    return {
      checkpointId: mapping.publicCheckpointId,
      totalOfficialScans: checkpointRows.length,
      topEntries: checkpointRows.slice(0, 10).map((row) => ({
        bib: normalizeBib(row.bib),
        checkpointId: mapping.publicCheckpointId,
        position: row.position,
        scannedAt: toIsoString(row.scanned_at),
        crewId: row.crew_code,
        deviceId: row.device_id
      }))
    } satisfies CheckpointLeaderboard;
  });
}

function buildOverallLeaderboardEntries(
  mappings: PublicCheckpointMapping[],
  raceParticipants: ParsedParticipant[],
  scanRows: ScanRow[],
  category?: "women"
) {
  const participantByBib = new Map(
    raceParticipants
      .map((participant) => {
        const normalizedBib = normalizeBib(participant.bibNumber);

        if (!normalizedBib) {
          return null;
        }

        return [normalizedBib, participant] as const;
      })
      .filter((entry): entry is readonly [string, ParsedParticipant] => Boolean(entry))
  );
  const mappingByScannerId = new Map(mappings.map((mapping) => [mapping.scannerCheckpointId, mapping]));
  const latestByBib = new Map<string, { participant: ParsedParticipant | null; row: ScanRow; mapping: PublicCheckpointMapping }>();

  for (const row of scanRows) {
    const bib = normalizeBib(row.bib);
    const mapping = mappingByScannerId.get(row.checkpoint_id);

    if (!bib || !mapping) {
      continue;
    }

    const participant = participantByBib.get(bib) ?? null;

    if (category === "women" && participant?.gender !== "women") {
      continue;
    }

    const current = latestByBib.get(bib);

    if (!current || compareProgress(current, { row, mapping }) < 0) {
      latestByBib.set(bib, { participant, row, mapping });
    }
  }

  return [...latestByBib.entries()]
    .sort((left, right) => {
      const leftEntry = left[1];
      const rightEntry = right[1];

      if (leftEntry.mapping.publicCheckpointOrder !== rightEntry.mapping.publicCheckpointOrder) {
        return rightEntry.mapping.publicCheckpointOrder - leftEntry.mapping.publicCheckpointOrder;
      }

      const scannedAtDiff = new Date(leftEntry.row.scanned_at).getTime() - new Date(rightEntry.row.scanned_at).getTime();

      if (scannedAtDiff !== 0) {
        return scannedAtDiff;
      }

      return left[0].localeCompare(right[0]);
    })
    .map(([bib, entry], index) => ({
      bib,
      name: entry.participant?.fullName ?? `Runner ${bib}`,
      category: entry.participant?.gender === "women" ? "women" : "men",
      rank: index + 1,
      checkpointId: entry.mapping.publicCheckpointId,
      checkpointCode: entry.mapping.publicCheckpointCode,
      checkpointName: entry.mapping.publicCheckpointName,
      checkpointKmMarker: entry.mapping.publicCheckpointKmMarker,
      checkpointOrder: entry.mapping.publicCheckpointOrder,
      scannedAt: toIsoString(entry.row.scanned_at),
      crewId: entry.row.crew_code,
      deviceId: entry.row.device_id
    } satisfies OverallLeaderboardEntry));
}

export async function getOrganizerPublicLiveRaceSnapshot(
  sql: Sql,
  input: {
    ownerUserId: string;
    payload: unknown;
    eventId: number;
    raceId: number;
    updatedAt?: string | null;
  }
): Promise<OrganizerPublicLiveRaceSnapshot | null> {
  const parsed = parseWorkspacePayload(input.payload);
  const event = parsed.events.find((entry) => entry.id === input.eventId && entry.status !== "archived") ?? null;
  const race = parsed.races.find((entry) => entry.id === input.raceId && entry.eventId === input.eventId) ?? null;

  if (!event || !race) {
    return null;
  }

  const raceParticipants = parsed.participants.filter((participant) => participant.raceId === race.id);
  const mappings = mapPublicCheckpoints(parsed.checkpoints.filter((checkpoint) => checkpoint.raceId === race.id));
  const raceScopedId = buildOrganizerRaceScopedId(input.ownerUserId, event.id, race.id);
  const allowedScannerCheckpointIds = new Set<string>(mappings.map((mapping) => mapping.scannerCheckpointId));

  const [scanRowsRaw, withdrawnRows] = await Promise.all([
    sql<ScanRow[]>`
      select bib, checkpoint_id, position, scanned_at, crew_code, device_id, server_received_at
      from public.scans
      where race_id = ${raceScopedId}
      order by scanned_at desc, server_received_at desc
      limit 5000
    `,
    sql<{ bib: string }[]>`
      select upper(trim(bib)) as bib
      from public.audit_logs
      where type = 'runner_withdrawn'
        and race_id = ${raceScopedId}
    `
  ]);

  const withdrawnBibs = new Set(withdrawnRows.map((row) => normalizeBib(row.bib)).filter(Boolean));
  const scanRows = scanRowsRaw.filter((row) => allowedScannerCheckpointIds.has(row.checkpoint_id) && !withdrawnBibs.has(normalizeBib(row.bib)));
  const scannedIn = new Set(scanRows.map((row) => normalizeBib(row.bib)).filter(Boolean)).size;
  const checkpointLeaderboards = buildCheckpointLeaderboards(mappings, scanRows);
  const overallEntries = buildOverallLeaderboardEntries(mappings, raceParticipants, scanRows);
  const womenEntries = buildOverallLeaderboardEntries(mappings, raceParticipants, scanRows, "women");
  const latestScanAt = scanRows[0] ? toIsoString(scanRows[0].scanned_at) : input.updatedAt ?? new Date().toISOString();

  return {
    updatedAt: latestScanAt,
    raceId: race.id,
    raceName: race.name,
    raceStatus: race.status ?? "upcoming",
    totalParticipants: raceParticipants.length,
    scannedIn,
    finished: overallEntries.filter((entry) => entry.checkpointId === "finish").length,
    dnf: Math.max(
      withdrawnBibs.size,
      raceParticipants.filter((participant) => participant.status === "dnf").length
    ),
    overallLeaderboard: {
      totalRankedRunners: overallEntries.length,
      topEntries: overallEntries
    },
    womenLeaderboard: {
      totalRankedRunners: womenEntries.length,
      topEntries: womenEntries
    },
    checkpointLeaderboards
  };
}

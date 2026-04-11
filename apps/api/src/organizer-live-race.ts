import type { Sql } from "postgres";

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
  assignedCrewId: number | null;
};

type ParsedCrew = {
  id: number;
  eventId: number;
  name: string;
};

type ParsedParticipant = {
  id: number;
  raceId: number;
  bibNumber: string | null;
  fullName: string;
  status: string | null;
};

type ScannerCheckpointMapping = {
  localCheckpointId: number;
  scannerCheckpointId: string;
  name: string;
  orderIndex: number;
  distanceFromStart: number | null;
  isStartLine: boolean;
  isFinishLine: boolean;
  assignedCrewId: number | null;
};

export type OrganizerLiveRaceSnapshot = {
  raceId: number;
  raceName: string;
  raceStatus: string;
  totalParticipants: number;
  scannedIn: number;
  finished: number;
  dnf: number;
  checkpoints: Array<{
    checkpointId: number;
    name: string;
    orderIndex: number;
    isStartLine: boolean;
    isFinishLine: boolean;
    assignedCrew: string | null;
    scanCount: number;
    lastScanAt: string | null;
  }>;
  recentScans: Array<{
    id: string;
    participantId: number;
    participantName: string;
    bibNumber: string | null;
    checkpointId: number;
    checkpointName: string;
    scannedAt: string;
    isDuplicate: boolean;
    raceId: number;
  }>;
};

const DEMO_CHECKPOINT_IDS = [
  "cp-start",
  "cp-10",
  "cp-21",
  "cp-30",
  "cp-40",
  "cp-50",
  "cp-60",
  "cp-70",
  "cp-80",
  "cp-90",
  "cp-100",
  "cp-110",
  "finish"
] as const;

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

function normalizeBib(value: string | null) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function buildOrganizerRaceScopedId(ownerUserId: string, eventId: number, raceId: number) {
  return `organizer:${ownerUserId}:${eventId}:${raceId}`;
}

function buildScannerCheckpointId(checkpoint: ParsedCheckpoint, intermediateIndex: number) {
  if (checkpoint.isStartLine) {
    return DEMO_CHECKPOINT_IDS[0];
  }

  if (checkpoint.isFinishLine) {
    return DEMO_CHECKPOINT_IDS[DEMO_CHECKPOINT_IDS.length - 1];
  }

  return DEMO_CHECKPOINT_IDS[intermediateIndex] ?? `cp-extra-${checkpoint.orderIndex}`;
}

function mapScannerCheckpoints(checkpoints: ParsedCheckpoint[]) {
  let intermediateIndex = 1;

  return checkpoints
    .slice()
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .map((checkpoint) => {
      const currentIntermediateIndex = checkpoint.isStartLine || checkpoint.isFinishLine ? intermediateIndex : intermediateIndex++;

      return {
        localCheckpointId: checkpoint.id,
        scannerCheckpointId: buildScannerCheckpointId(checkpoint, currentIntermediateIndex),
        name: checkpoint.name,
        orderIndex: checkpoint.orderIndex,
        distanceFromStart: checkpoint.distanceFromStart,
        isStartLine: checkpoint.isStartLine,
        isFinishLine: checkpoint.isFinishLine,
        assignedCrewId: checkpoint.assignedCrewId
      } satisfies ScannerCheckpointMapping;
    });
}

function parseWorkspacePayload(payload: unknown) {
  if (!isObject(payload)) {
    return {
      checkpoints: [] as ParsedCheckpoint[],
      crew: [] as ParsedCrew[],
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
        isFinishLine: Boolean(checkpointRecord.isFinishLine),
        assignedCrewId: getNumber(checkpointRecord.assignedCrewId)
      } satisfies ParsedCheckpoint;
    })
    .filter((checkpoint): checkpoint is ParsedCheckpoint => Boolean(checkpoint));

  const crew = toArray(payload.crew)
    .map((crewRecord) => {
      const id = getNumber(crewRecord.id);
      const eventId = getNumber(crewRecord.eventId);
      const name = getString(crewRecord.name);

      if (id === null || eventId === null || !name) {
        return null;
      }

      return {
        id,
        eventId,
        name
      } satisfies ParsedCrew;
    })
    .filter((member): member is ParsedCrew => Boolean(member));

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
        status: getString(participantRecord.status)?.toLowerCase() ?? null
      } satisfies ParsedParticipant;
    })
    .filter((participant): participant is ParsedParticipant => Boolean(participant));

  return {
    checkpoints,
    crew,
    events,
    participants,
    races
  };
}

export async function getOrganizerLiveRaceSnapshot(
  sql: Sql,
  input: {
    ownerUserId: string;
    payload: unknown;
    eventId: number;
    raceId: number;
  }
): Promise<OrganizerLiveRaceSnapshot | null> {
  const parsed = parseWorkspacePayload(input.payload);
  const event = parsed.events.find((entry) => entry.id === input.eventId && entry.status !== "archived") ?? null;
  const race = parsed.races.find((entry) => entry.id === input.raceId && entry.eventId === input.eventId) ?? null;

  if (!event || !race) {
    return null;
  }

  const raceParticipants = parsed.participants.filter((participant) => participant.raceId === race.id);
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
  const crewById = new Map(parsed.crew.filter((member) => member.eventId === event.id).map((member) => [member.id, member.name]));
  const checkpointMappings = mapScannerCheckpoints(parsed.checkpoints.filter((checkpoint) => checkpoint.raceId === race.id));
  const checkpointByScannerId = new Map<string, ScannerCheckpointMapping>(
    checkpointMappings.map((checkpoint) => [checkpoint.scannerCheckpointId, checkpoint])
  );
  const raceScopedId = buildOrganizerRaceScopedId(input.ownerUserId, event.id, race.id);

  const [scanTotals, scanRows, scannedInRow] = await Promise.all([
    sql<{
      checkpoint_id: string;
      total: number;
      last_scanned_at: string | Date | null;
    }[]>`
      select checkpoint_id, count(*)::int as total, max(scanned_at) as last_scanned_at
      from public.scans
      where race_id = ${raceScopedId}
      group by checkpoint_id
    `,
    sql<{
      client_scan_id: string;
      bib: string;
      checkpoint_id: string;
      scanned_at: string | Date;
    }[]>`
      select client_scan_id, bib, checkpoint_id, scanned_at
      from public.scans
      where race_id = ${raceScopedId}
      order by scanned_at desc, server_received_at desc
      limit 50
    `,
    sql<{ total: number }[]>`
      select count(distinct upper(trim(bib)))::int as total
      from public.scans
      where race_id = ${raceScopedId}
    `
  ]);

  const totalsByCheckpointId = new Map(
    scanTotals.map((row) => [
      row.checkpoint_id,
      {
        total: Number(row.total),
        lastScannedAt: row.last_scanned_at ? (row.last_scanned_at instanceof Date ? row.last_scanned_at.toISOString() : row.last_scanned_at) : null
      }
    ])
  );

  return {
    raceId: race.id,
    raceName: race.name,
    raceStatus: race.status ?? "draft",
    totalParticipants: raceParticipants.length,
    scannedIn: Number(scannedInRow[0]?.total ?? 0),
    finished: raceParticipants.filter((participant) => participant.status === "finished").length,
    dnf: raceParticipants.filter((participant) => participant.status === "dnf").length,
    checkpoints: checkpointMappings.map((checkpoint) => {
      const totals = totalsByCheckpointId.get(checkpoint.scannerCheckpointId);

      return {
        checkpointId: checkpoint.localCheckpointId,
        name: checkpoint.name,
        orderIndex: checkpoint.orderIndex,
        isStartLine: checkpoint.isStartLine,
        isFinishLine: checkpoint.isFinishLine,
        assignedCrew: checkpoint.assignedCrewId !== null ? crewById.get(checkpoint.assignedCrewId) ?? null : null,
        scanCount: totals?.total ?? 0,
        lastScanAt: totals?.lastScannedAt ?? null
      };
    }),
    recentScans: scanRows.map((row) => {
      const normalizedBib = normalizeBib(row.bib);
      const participant = participantByBib.get(normalizedBib) ?? null;
      const checkpoint = checkpointByScannerId.get(row.checkpoint_id) ?? null;
      const scannedAt = row.scanned_at instanceof Date ? row.scanned_at.toISOString() : row.scanned_at;

      return {
        id: row.client_scan_id,
        participantId: participant?.id ?? 0,
        participantName: participant?.fullName ?? `Runner ${normalizedBib}`,
        bibNumber: normalizedBib,
        checkpointId: checkpoint?.localCheckpointId ?? 0,
        checkpointName: checkpoint?.name ?? row.checkpoint_id,
        scannedAt,
        isDuplicate: false,
        raceId: race.id
      };
    })
  };
}

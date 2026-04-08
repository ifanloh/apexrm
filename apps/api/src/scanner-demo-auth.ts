import { createHash } from "node:crypto";
import { SignJWT } from "jose";
import { checkpointSchema, defaultCheckpoints } from "./contracts.js";
import { config } from "./config.js";
import { listOrganizerWorkspaces } from "./repository.js";
import { sql } from "./db.js";

type ScannerDemoLoginInput = {
  username: string;
  password: string;
};

type WorkspaceRecord = {
  ownerUserId: string;
  username: string | null;
  displayName: string | null;
  payload: unknown;
  updatedAt: string;
};

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

type ParsedCrew = {
  id: number;
  eventId: number;
  name: string;
  username: string;
  password: string | null;
  assignedCheckpointId: number | null;
};

type ScannerCheckpoint = {
  id: string;
  code: string;
  name: string;
  kmMarker: number;
  order: number;
};

export type ScannerDemoLoginResult = {
  accessToken: string;
  assignedCheckpointId: string | null;
  checkpoints: ScannerCheckpoint[];
  eventLabel: string;
  profile: {
    crewCode: string | null;
    displayName: string | null;
    email: string | null;
    role: "crew";
    userId: string;
  };
  raceId: string;
};

const DEMO_CHECKPOINT_IDS = ["cp-start", "cp-10", "cp-21", "cp-30", "cp-40", "finish"] as const;
const DEMO_CHECKPOINT_CODES = ["START", "CP1", "CP2", "CP3", "CP4", "FIN"] as const;

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

function parseWorkspacePayload(payload: unknown) {
  if (!isObject(payload)) {
    return {
      checkpoints: [] as ParsedCheckpoint[],
      crew: [] as ParsedCrew[],
      events: [] as ParsedEvent[],
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

  const crew = toArray(payload.crew)
    .map((crewRecord) => {
      const id = getNumber(crewRecord.id);
      const eventId = getNumber(crewRecord.eventId);
      const name = getString(crewRecord.name);
      const username = getString(crewRecord.username);

      if (id === null || eventId === null || !name || !username) {
        return null;
      }

      return {
        id,
        eventId,
        name,
        username,
        password: getString(crewRecord.password),
        assignedCheckpointId: getNumber(crewRecord.assignedCheckpointId)
      } satisfies ParsedCrew;
    })
    .filter((member): member is ParsedCrew => Boolean(member));

  return {
    checkpoints,
    crew,
    events,
    races
  };
}

function buildScannerCheckpointId(checkpoint: ParsedCheckpoint, orderIndex: number, intermediateIndex: number) {
  if (checkpoint.isStartLine) {
    return DEMO_CHECKPOINT_IDS[0];
  }

  if (checkpoint.isFinishLine) {
    return DEMO_CHECKPOINT_IDS[DEMO_CHECKPOINT_IDS.length - 1];
  }

  return DEMO_CHECKPOINT_IDS[Math.min(intermediateIndex, DEMO_CHECKPOINT_IDS.length - 2)] ?? `cp-extra-${orderIndex}`;
}

function buildScannerCheckpointCode(checkpoint: ParsedCheckpoint, intermediateIndex: number) {
  if (checkpoint.isStartLine) {
    return DEMO_CHECKPOINT_CODES[0];
  }

  if (checkpoint.isFinishLine) {
    return DEMO_CHECKPOINT_CODES[DEMO_CHECKPOINT_CODES.length - 1];
  }

  return DEMO_CHECKPOINT_CODES[Math.min(intermediateIndex, DEMO_CHECKPOINT_CODES.length - 2)] ?? `CP${intermediateIndex}`;
}

function mapScannerCheckpoints(checkpoints: ParsedCheckpoint[]) {
  if (!checkpoints.length) {
    return {
      assignedCheckpointMap: new Map<number, string>(),
      checkpoints: defaultCheckpoints.map((checkpoint) => checkpointSchema.parse(checkpoint))
    };
  }

  let intermediateIndex = 1;
  const assignedCheckpointMap = new Map<number, string>();
  const mapped = checkpoints
    .slice()
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .map((checkpoint, index) => {
      const currentIntermediateIndex = checkpoint.isStartLine || checkpoint.isFinishLine ? intermediateIndex : intermediateIndex++;
      const scannerCheckpoint = checkpointSchema.parse({
        id: buildScannerCheckpointId(checkpoint, checkpoint.orderIndex, currentIntermediateIndex),
        code: buildScannerCheckpointCode(checkpoint, currentIntermediateIndex),
        name: checkpoint.name,
        kmMarker: checkpoint.distanceFromStart ?? 0,
        order: index
      });

      assignedCheckpointMap.set(checkpoint.id, scannerCheckpoint.id);
      return scannerCheckpoint;
    });

  return {
    assignedCheckpointMap,
    checkpoints: mapped
  };
}

function selectPrimaryRace(
  races: ParsedRace[],
  checkpoints: ParsedCheckpoint[],
  member: ParsedCrew
) {
  if (member.assignedCheckpointId !== null) {
    const assignedCheckpoint = checkpoints.find((checkpoint) => checkpoint.id === member.assignedCheckpointId) ?? null;

    if (assignedCheckpoint) {
      return races.find((race) => race.id === assignedCheckpoint.raceId) ?? null;
    }
  }

  return (
    races.find((race) => race.status === "live") ??
    races.find((race) => race.status === "upcoming") ??
    races.find((race) => race.status === "finished") ??
    races[0] ??
    null
  );
}

function buildRaceScopedId(ownerUserId: string, eventId: number, raceId: number) {
  return `organizer:${ownerUserId}:${eventId}:${raceId}`;
}

function buildDemoCrewUserId(ownerUserId: string, eventId: number, memberId: number) {
  const digest = createHash("sha256")
    .update(`${ownerUserId}:${eventId}:${memberId}`)
    .digest("hex");

  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `4${digest.slice(13, 16)}`,
    `${((Number.parseInt(digest.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0")}${digest.slice(18, 20)}`,
    digest.slice(20, 32)
  ].join("-");
}

async function issueDemoCrewToken(payload: {
  crewCode: string;
  displayName: string;
  userId: string;
  username: string;
}) {
  const sharedSecret = config.supabaseJwtSecret || config.databaseUrl;

  if (!sharedSecret) {
    throw new Error("Server-side auth secret is required for demo scanner login.");
  }

  const jwtKey = new TextEncoder().encode(sharedSecret);
  const issuer = `${config.supabaseUrl}/auth/v1`;

  return new SignJWT({
    app_metadata: {
      crew_code: payload.crewCode,
      role: "crew"
    },
    email: `${payload.username}@scanner.demo`,
    role: "crew",
    user_metadata: {
      name: payload.displayName
    }
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(issuer)
    .setAudience("authenticated")
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(jwtKey);
}

function findMatchingWorkspace(workspaces: WorkspaceRecord[], input: ScannerDemoLoginInput) {
  const normalizedUsername = input.username.trim().toLowerCase();

  for (const workspace of workspaces) {
    const parsed = parseWorkspacePayload(workspace.payload);
    const member = parsed.crew.find(
      (crewMember) =>
        crewMember.username.trim().toLowerCase() === normalizedUsername &&
        crewMember.password !== null &&
        crewMember.password === input.password
    );

    if (member) {
      return {
        member,
        parsed,
        workspace
      };
    }
  }

  return null;
}

export async function createScannerDemoLogin(input: ScannerDemoLoginInput): Promise<ScannerDemoLoginResult> {
  const workspaces = await listOrganizerWorkspaces(sql);
  const match = findMatchingWorkspace(workspaces, input);

  if (!match) {
    throw new Error("Invalid scanner crew credentials.");
  }

  const { member, parsed, workspace } = match;
  const event = parsed.events.find((entry) => entry.id === member.eventId && entry.status !== "archived") ?? null;

  if (!event) {
    throw new Error("Scanner crew event is no longer available.");
  }

  const eventRaces = parsed.races.filter((race) => race.eventId === event.id);
  const race = selectPrimaryRace(eventRaces, parsed.checkpoints, member);

  if (!race) {
    throw new Error("No race category is ready for this crew account.");
  }

  const raceCheckpoints = parsed.checkpoints.filter((checkpoint) => checkpoint.raceId === race.id);
  const { assignedCheckpointMap, checkpoints } = mapScannerCheckpoints(raceCheckpoints);
  const assignedCheckpointId =
    member.assignedCheckpointId !== null ? assignedCheckpointMap.get(member.assignedCheckpointId) ?? null : null;
  const crewCode = `crew-${workspace.ownerUserId}-${event.id}-${member.id}`;
  const userId = buildDemoCrewUserId(workspace.ownerUserId, event.id, member.id);

  return {
    accessToken: await issueDemoCrewToken({
      crewCode,
      displayName: member.name,
      userId,
      username: member.username
    }),
    assignedCheckpointId,
    checkpoints,
    eventLabel: `${event.name} - ${race.name}`,
    profile: {
      crewCode,
      displayName: member.name,
      email: `${member.username}@scanner.demo`,
      role: "crew",
      userId
    },
    raceId: buildRaceScopedId(workspace.ownerUserId, event.id, race.id)
  };
}

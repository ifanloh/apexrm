export type PrototypePublicCheckpoint = {
  id: number;
  name: string;
  orderIndex: number;
  distanceFromStart: number | null;
  isStartLine: boolean;
  isFinishLine: boolean;
};

export type PrototypePublicRace = {
  id: number;
  name: string;
  distance: number | null;
  elevationGain: number | null;
  descentM: number | null;
  maxParticipants: number | null;
  cutoffTime: string | null;
  gpxFileName: string | null;
  status: "upcoming" | "live" | "finished";
  participantCount: number;
  checkpointCount: number;
  crewCount: number;
  waypoints: Array<{
    id: string;
    name: string;
    km: number;
    ele: number;
    lat: number;
    lon: number;
  }>;
  profilePoints: Array<{
    km: number;
    ele: number;
  }>;
  checkpoints: PrototypePublicCheckpoint[];
};

export type PrototypePublicEventItem = {
  ownerUserId: string;
  username: string | null;
  displayName: string | null;
  updatedAt: string;
  event: {
    id: number;
    name: string;
    location: string;
    description: string | null;
    startDate: string | null;
    endDate: string | null;
    logoUrl: string | null;
    bannerUrl: string | null;
    status: "upcoming" | "live" | "finished";
    createdAt: string;
    updatedAt: string;
  };
  races: PrototypePublicRace[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRouteWaypoints(value: unknown): PrototypePublicRace["waypoints"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((point) => {
      if (!isObject(point)) {
        return null;
      }

      const id = getString(point.id);
      const name = getString(point.name);
      const km = getNumber(point.km);
      const ele = getNumber(point.ele);
      const lat = getNumber(point.lat);
      const lon = getNumber(point.lon);

      if (!id || !name || km === null || ele === null || lat === null || lon === null) {
        return null;
      }

      return { id, name, km, ele, lat, lon };
    })
    .filter((point): point is PrototypePublicRace["waypoints"][number] => Boolean(point));
}

function getProfilePoints(value: unknown): PrototypePublicRace["profilePoints"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((point) => {
      if (!isObject(point)) {
        return null;
      }

      const km = getNumber(point.km);
      const ele = getNumber(point.ele);

      if (km === null || ele === null) {
        return null;
      }

      return { km, ele };
    })
    .filter((point): point is PrototypePublicRace["profilePoints"][number] => Boolean(point));
}

function normalizeRaceStatus(value: unknown): PrototypePublicRace["status"] | null {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "live" || normalized === "finished" || normalized === "upcoming") {
    return normalized;
  }

  return null;
}

function deriveEventStatus(races: PrototypePublicRace[]): PrototypePublicEventItem["event"]["status"] {
  if (races.some((race) => race.status === "live")) {
    return "live";
  }

  if (races.some((race) => race.status === "upcoming")) {
    return "upcoming";
  }

  return "finished";
}

export function extractOrganizerPrototypePublicEvents(
  payload: unknown,
  ownerUserId: string,
  username: string | null,
  displayName: string | null,
  updatedAt: string
) {
  if (!isObject(payload)) {
    return [] as PrototypePublicEventItem[];
  }

  const events = Array.isArray(payload.events) ? payload.events.filter(isObject) : [];
  const races = Array.isArray(payload.races) ? payload.races.filter(isObject) : [];
  const checkpoints = Array.isArray(payload.checkpoints) ? payload.checkpoints.filter(isObject) : [];
  const participants = Array.isArray(payload.participants) ? payload.participants.filter(isObject) : [];
  const crew = Array.isArray(payload.crew) ? payload.crew.filter(isObject) : [];

  return events.flatMap((eventRecord) => {
    const eventId = getNumber(eventRecord.id);
    const eventName = getString(eventRecord.name);
    const eventStatus = getString(eventRecord.status)?.toLowerCase();

    if (eventId === null || !eventName || eventStatus === "archived") {
      return [];
    }

    const publicRaces = races
      .filter((raceRecord) => getNumber(raceRecord.eventId) === eventId)
      .map((raceRecord) => {
        const raceId = getNumber(raceRecord.id);
        const raceName = getString(raceRecord.name);
        const raceStatus = normalizeRaceStatus(raceRecord.status);

        if (raceId === null || !raceName || !raceStatus) {
          return null;
        }

        const raceCheckpoints = checkpoints
          .filter((checkpointRecord) => getNumber(checkpointRecord.raceId) === raceId)
          .map((checkpointRecord) => {
            const checkpointId = getNumber(checkpointRecord.id);
            const checkpointName = getString(checkpointRecord.name);
            const orderIndex = getNumber(checkpointRecord.orderIndex);

            if (checkpointId === null || !checkpointName || orderIndex === null) {
              return null;
            }

            return {
              id: checkpointId,
              name: checkpointName,
              orderIndex,
              distanceFromStart: getNumber(checkpointRecord.distanceFromStart),
              isStartLine: Boolean(checkpointRecord.isStartLine),
              isFinishLine: Boolean(checkpointRecord.isFinishLine)
            } satisfies PrototypePublicCheckpoint;
          })
          .filter((checkpoint): checkpoint is PrototypePublicCheckpoint => Boolean(checkpoint))
          .sort((left, right) => left.orderIndex - right.orderIndex);

        return {
          id: raceId,
          name: raceName,
          distance: getNumber(raceRecord.distance),
          elevationGain: getNumber(raceRecord.elevationGain),
          descentM: getNumber(raceRecord.descentM),
          maxParticipants: getNumber(raceRecord.maxParticipants),
          cutoffTime: getString(raceRecord.cutoffTime),
          gpxFileName: getString(raceRecord.gpxFileName),
          status: raceStatus,
          participantCount:
            getNumber(raceRecord.participantCount) ?? participants.filter((participant) => getNumber(participant.raceId) === raceId).length,
          checkpointCount: getNumber(raceRecord.checkpointCount) ?? raceCheckpoints.length,
          crewCount: getNumber(raceRecord.crewCount) ?? crew.filter((member) => getNumber(member.eventId) === eventId).length,
          waypoints: getRouteWaypoints(raceRecord.waypoints),
          profilePoints: getProfilePoints(raceRecord.profilePoints),
          checkpoints: raceCheckpoints
        } satisfies PrototypePublicRace;
      })
      .filter((race): race is PrototypePublicRace => Boolean(race));

    if (!publicRaces.length) {
      return [];
    }

    return [
      {
        ownerUserId,
        username,
        displayName,
        updatedAt,
        event: {
          id: eventId,
          name: eventName,
          location: getString(eventRecord.location) ?? "Trailnesia",
          description: getString(eventRecord.description),
          startDate: getString(eventRecord.startDate),
          endDate: getString(eventRecord.endDate),
          logoUrl: getString(eventRecord.logoUrl),
          bannerUrl: getString(eventRecord.bannerUrl),
          status: deriveEventStatus(publicRaces),
          createdAt: getString(eventRecord.createdAt) ?? updatedAt,
          updatedAt: getString(eventRecord.updatedAt) ?? updatedAt
        },
        races: publicRaces
      } satisfies PrototypePublicEventItem
    ];
  });
}

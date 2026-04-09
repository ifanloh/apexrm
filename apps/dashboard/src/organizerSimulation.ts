import type { CheckpointLeaderboard, DuplicateScan, NotificationEvent, OverallLeaderboard } from "@arm/contracts";
import type {
  OrganizerCrewAssignmentDraft,
  OrganizerParticipantDraft,
  OrganizerRaceDraft,
  OrganizerSetupDraft,
  OrganizerSimulatedScanDraft
} from "./organizerSetup";
import { isOrganizerRaceFinishedState } from "./organizerSetup";

export type OrganizerRaceSimulationSnapshot = {
  overallLeaderboard: OverallLeaderboard;
  womenLeaderboard: OverallLeaderboard;
  checkpointLeaderboards: CheckpointLeaderboard[];
  duplicates: DuplicateScan[];
  notifications: NotificationEvent[];
  acceptedCount: number;
  duplicateCount: number;
};

function toIsoWithOffset(base: Date, minutes: number) {
  return new Date(base.getTime() + minutes * 60_000).toISOString();
}

function buildSimulatedScanDraft(
  race: OrganizerRaceDraft,
  args: {
    id: string;
    bib: string;
    checkpointId: string;
    scannedAt: string;
    status?: "accepted" | "duplicate";
    firstAcceptedId?: string | null;
  }
): OrganizerSimulatedScanDraft | null {
  const crew =
    race.crewAssignments.find((assignment) => assignment.checkpointId === args.checkpointId) ??
    race.crewAssignments[0] ??
    null;

  if (!crew) {
    return null;
  }

  return {
    id: args.id,
    bib: normalizeBib(args.bib),
    checkpointId: args.checkpointId,
    crewAssignmentId: crew.id,
    deviceId: crew.deviceLabel.trim() || crew.id,
    scannedAt: args.scannedAt,
    status: args.status ?? "accepted",
    firstAcceptedId: args.firstAcceptedId ?? null
  };
}

export function buildOrganizerTrialScenario(race: OrganizerRaceDraft): OrganizerSimulatedScanDraft[] {
  if (!race.participants.length || !race.checkpoints.length || !race.crewAssignments.length) {
    return [];
  }

  const baseStart = Number.isNaN(new Date(race.startAt).getTime()) ? new Date() : new Date(race.startAt);
  const sortedCheckpoints = [...race.checkpoints].sort((left, right) => left.order - right.order);
  const progressCheckpoints = sortedCheckpoints.filter((checkpoint) => checkpoint.id !== "cp-start");
  const first = progressCheckpoints[0] ?? null;
  const second = progressCheckpoints[1] ?? first;
  const third = progressCheckpoints[2] ?? second;
  const finish = sortedCheckpoints.find((checkpoint) => checkpoint.id === "finish") ?? progressCheckpoints[progressCheckpoints.length - 1] ?? null;

  if (!first || !finish) {
    return [];
  }

  const [p1, p2, p3, p4, p5] = race.participants.slice(0, 5);
  const scans: Array<OrganizerSimulatedScanDraft | null> = [];
  const finishedScenario = isOrganizerRaceFinishedState(race.editionLabel);

  if (p1) {
    scans.push(
      buildSimulatedScanDraft(race, {
        id: `${race.slug}-sample-1`,
        bib: p1.bib,
        checkpointId: first.id,
        scannedAt: toIsoWithOffset(baseStart, 65)
      })
    );
    if (second) {
      scans.push(
        buildSimulatedScanDraft(race, {
          id: `${race.slug}-sample-2`,
          bib: p1.bib,
          checkpointId: second.id,
          scannedAt: toIsoWithOffset(baseStart, 160)
        })
      );
    }
    scans.push(
      buildSimulatedScanDraft(race, {
        id: `${race.slug}-sample-3`,
        bib: p1.bib,
        checkpointId: finish.id,
        scannedAt: toIsoWithOffset(baseStart, finishedScenario ? 280 : 345)
      })
    );
  }

  if (p2) {
    scans.push(
      buildSimulatedScanDraft(race, {
        id: `${race.slug}-sample-4`,
        bib: p2.bib,
        checkpointId: first.id,
        scannedAt: toIsoWithOffset(baseStart, 72)
      })
    );
    if (second) {
      scans.push(
        buildSimulatedScanDraft(race, {
          id: `${race.slug}-sample-5`,
          bib: p2.bib,
          checkpointId: second.id,
          scannedAt: toIsoWithOffset(baseStart, 172)
        })
      );
    }
    if (finishedScenario) {
      scans.push(
        buildSimulatedScanDraft(race, {
          id: `${race.slug}-sample-6`,
          bib: p2.bib,
          checkpointId: finish.id,
          scannedAt: toIsoWithOffset(baseStart, 296)
        })
      );
    }
  }

  if (p3 && third) {
    scans.push(
      buildSimulatedScanDraft(race, {
        id: `${race.slug}-sample-7`,
        bib: p3.bib,
        checkpointId: first.id,
        scannedAt: toIsoWithOffset(baseStart, 85)
      })
    );
    scans.push(
      buildSimulatedScanDraft(race, {
        id: `${race.slug}-sample-8`,
        bib: p3.bib,
        checkpointId: third.id,
        scannedAt: toIsoWithOffset(baseStart, finishedScenario ? 225 : 238)
      })
    );
  }

  if (p4) {
    const p4Accepted = buildSimulatedScanDraft(race, {
      id: `${race.slug}-sample-9`,
      bib: p4.bib,
      checkpointId: first.id,
      scannedAt: toIsoWithOffset(baseStart, 94)
    });
    scans.push(p4Accepted);
    if (p4Accepted) {
      scans.push(
        buildSimulatedScanDraft(race, {
          id: `${race.slug}-sample-10`,
          bib: p4.bib,
          checkpointId: first.id,
          scannedAt: toIsoWithOffset(baseStart, 95),
          status: "duplicate",
          firstAcceptedId: p4Accepted.id
        })
      );
    }
  }

  if (p5 && finishedScenario && second) {
    scans.push(
      buildSimulatedScanDraft(race, {
        id: `${race.slug}-sample-11`,
        bib: p5.bib,
        checkpointId: second.id,
        scannedAt: toIsoWithOffset(baseStart, 244)
      })
    );
  }

  return scans.filter((scan): scan is OrganizerSimulatedScanDraft => Boolean(scan));
}

const SAMPLE_COUNTRIES = ["ID", "MY", "SG", "TH", "JP", "AU", "PH", "KR"] as const;
const SAMPLE_CLUBS = [
  "Altix Racing",
  "Arjuno Collective",
  "Welirang Peak Lab",
  "Kaliandra Endurance",
  "Nusantara Summit",
  "Garuda Trail Society"
] as const;

function createSampleParticipantsForRace(race: OrganizerRaceDraft): OrganizerParticipantDraft[] {
  if (race.participants.length > 0) {
    return race.participants;
  }

  const previewParticipants: OrganizerParticipantDraft[] = race.rankingPreview.map((entry, index) => ({
    bib: entry.bib,
    name: entry.name,
    gender: (entry.category === "women" ? "women" : "men") as OrganizerParticipantDraft["gender"],
    countryCode: SAMPLE_COUNTRIES[index % SAMPLE_COUNTRIES.length],
    club: SAMPLE_CLUBS[index % SAMPLE_CLUBS.length]
  }));

  if (previewParticipants.length >= 8) {
    return previewParticipants;
  }

  const extrasNeeded = 8 - previewParticipants.length;
  const extras = Array.from({ length: extrasNeeded }, (_, index) => {
    const bibPrefix = race.title.replace(/[^A-Z0-9]/gi, "").slice(0, 2).toUpperCase() || "TR";
    const bib = `${bibPrefix}${(index + 101).toString().padStart(3, "0")}`;

    return {
      bib,
      name: `Sample Runner ${index + 1}`,
      gender: index % 3 === 0 ? "women" : "men",
      countryCode: SAMPLE_COUNTRIES[(previewParticipants.length + index) % SAMPLE_COUNTRIES.length],
      club: SAMPLE_CLUBS[(previewParticipants.length + index) % SAMPLE_CLUBS.length]
    } satisfies OrganizerParticipantDraft;
  });

  return [...previewParticipants, ...extras];
}

function createCheckpointCrewForRace(race: OrganizerRaceDraft): OrganizerCrewAssignmentDraft[] {
  const existingByCheckpoint = new Map(race.crewAssignments.map((crew) => [crew.checkpointId, crew]));

  return race.checkpoints.map((checkpoint, index) => {
    const existing = existingByCheckpoint.get(checkpoint.id);

    if (existing) {
      return {
        ...existing,
        role: "scan",
        deviceLabel: existing.deviceLabel.trim() || `Scanner ${checkpoint.code}`,
        status: existing.status
      };
    }

    return {
      id: `${race.slug}-crew-${checkpoint.id}`,
      name: `Crew ${checkpoint.code}`,
      email: `${checkpoint.code.toLowerCase()}.${race.slug}@altix.local`,
      role: "scan",
      checkpointId: checkpoint.id,
      deviceLabel: `Scanner ${checkpoint.code}`,
      status: checkpoint.id === "cp-start" ? "active" : "accepted",
      inviteCode: `${race.slug.toUpperCase().slice(0, 3)}-${checkpoint.code}`
    } satisfies OrganizerCrewAssignmentDraft;
  });
}

export function shouldAutoSeedOrganizerTrial(setup: OrganizerSetupDraft) {
  if (setup.races.length === 0) {
    return false;
  }

  const totalParticipants = setup.races.reduce((sum, race) => sum + race.participants.length, 0);
  const totalSimulatedScans = setup.races.reduce((sum, race) => sum + race.simulatedScans.length, 0);

  return totalParticipants === 0 && totalSimulatedScans === 0;
}

export function seedOrganizerTrialSetup(setup: OrganizerSetupDraft): OrganizerSetupDraft {
  return {
    ...setup,
    races: setup.races.map((race) => {
      const participants = createSampleParticipantsForRace(race);
      const crewAssignments = createCheckpointCrewForRace(race);
      const seededRace = {
        ...race,
        participants,
        crewAssignments
      };

      return {
        ...seededRace,
        simulatedScans: buildOrganizerTrialScenario(seededRace)
      };
    })
  };
}

function normalizeBib(value: string) {
  return value.trim().toUpperCase();
}

function getParticipantByBib(participants: OrganizerParticipantDraft[], bib: string) {
  const normalizedBib = normalizeBib(bib);
  return participants.find((participant) => normalizeBib(participant.bib) === normalizedBib) ?? null;
}

function getCheckpointOrder(race: OrganizerRaceDraft, checkpointId: string) {
  return race.checkpoints.find((checkpoint) => checkpoint.id === checkpointId)?.order ?? -1;
}

function compareOverallProgress(left: OrganizerSimulatedScanDraft, right: OrganizerSimulatedScanDraft, race: OrganizerRaceDraft) {
  const leftOrder = getCheckpointOrder(race, left.checkpointId);
  const rightOrder = getCheckpointOrder(race, right.checkpointId);

  if (leftOrder !== rightOrder) {
    return rightOrder - leftOrder;
  }

  if (left.scannedAt !== right.scannedAt) {
    return left.scannedAt.localeCompare(right.scannedAt);
  }

  return normalizeBib(left.bib).localeCompare(normalizeBib(right.bib));
}

function compareCheckpointProgress(left: OrganizerSimulatedScanDraft, right: OrganizerSimulatedScanDraft) {
  if (left.scannedAt !== right.scannedAt) {
    return left.scannedAt.localeCompare(right.scannedAt);
  }

  return normalizeBib(left.bib).localeCompare(normalizeBib(right.bib));
}

function buildOverallEntries(
  race: OrganizerRaceDraft,
  acceptedScans: OrganizerSimulatedScanDraft[]
) {
  const bestScanByBib = new Map<string, OrganizerSimulatedScanDraft>();

  acceptedScans.forEach((scan) => {
    const bib = normalizeBib(scan.bib);
    const current = bestScanByBib.get(bib);

    if (!current || compareOverallProgress(scan, current, race) < 0) {
      bestScanByBib.set(bib, scan);
    }
  });

  const rankedScans = [...bestScanByBib.values()].sort((left, right) => compareOverallProgress(left, right, race));

  return rankedScans.map((scan, index) => {
    const checkpoint = race.checkpoints.find((item) => item.id === scan.checkpointId);
    const participant = getParticipantByBib(race.participants, scan.bib);

    return {
      bib: normalizeBib(scan.bib),
      name: participant?.name || normalizeBib(scan.bib),
      category: participant?.gender === "women" ? "women" : "men",
      rank: index + 1,
      checkpointId: scan.checkpointId,
      checkpointCode: checkpoint?.code || scan.checkpointId.toUpperCase(),
      checkpointName: checkpoint?.name || scan.checkpointId,
      checkpointKmMarker: checkpoint?.kmMarker ?? 0,
      checkpointOrder: checkpoint?.order ?? 0,
      scannedAt: scan.scannedAt,
      crewId: scan.crewAssignmentId,
      deviceId: scan.deviceId
    };
  });
}

export function buildOrganizerRaceSimulationSnapshot(race: OrganizerRaceDraft): OrganizerRaceSimulationSnapshot {
  const attempts = [...race.simulatedScans].sort((left, right) => left.scannedAt.localeCompare(right.scannedAt));
  const acceptedScans = attempts.filter((scan) => scan.status === "accepted");
  const duplicateScans = attempts.filter((scan) => scan.status === "duplicate");

  const overallEntries = buildOverallEntries(race, acceptedScans);
  const womenEntries = overallEntries
    .filter((entry) => entry.category === "women")
    .map((entry, index) => ({
      ...entry,
      rank: index + 1
    }));

  const checkpointLeaderboards = race.checkpoints.map((checkpoint) => {
    const scansAtCheckpoint = acceptedScans
      .filter((scan) => scan.checkpointId === checkpoint.id)
      .sort((left, right) => compareCheckpointProgress(left, right));

    return {
      checkpointId: checkpoint.id,
      totalOfficialScans: scansAtCheckpoint.length,
      topEntries: scansAtCheckpoint.slice(0, 10).map((scan, index) => ({
        bib: normalizeBib(scan.bib),
        checkpointId: checkpoint.id,
        position: index + 1,
        scannedAt: scan.scannedAt,
        crewId: scan.crewAssignmentId,
        deviceId: scan.deviceId
      }))
    };
  });

  const duplicates: DuplicateScan[] = duplicateScans.map((scan) => ({
    clientScanId: scan.id,
    raceId: race.slug,
    checkpointId: scan.checkpointId,
    bib: normalizeBib(scan.bib),
    crewId: scan.crewAssignmentId,
    deviceId: scan.deviceId,
    scannedAt: scan.scannedAt,
    capturedOffline: false,
    serverReceivedAt: scan.scannedAt,
    firstAcceptedClientScanId: scan.firstAcceptedId || "",
    reason: "duplicate_bib_checkpoint"
  }));

  const notifications: NotificationEvent[] = checkpointLeaderboards
    .flatMap((board) =>
      board.topEntries.slice(0, 5).map((entry) => ({
        id: `${board.checkpointId}-${entry.bib}-${entry.scannedAt}`,
        channel: "telegram" as const,
        checkpointId: board.checkpointId,
        bib: entry.bib,
        position: entry.position,
        createdAt: entry.scannedAt,
        delivered: true
      }))
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 20);

  return {
    overallLeaderboard: {
      totalRankedRunners: overallEntries.length,
      topEntries: overallEntries
    },
    womenLeaderboard: {
      totalRankedRunners: womenEntries.length,
      topEntries: womenEntries
    },
    checkpointLeaderboards,
    duplicates,
    notifications,
    acceptedCount: acceptedScans.length,
    duplicateCount: duplicates.length
  };
}

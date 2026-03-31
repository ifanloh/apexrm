import type { CheckpointLeaderboard, DuplicateScan, NotificationEvent, OverallLeaderboard } from "@arm/contracts";
import type { OrganizerParticipantDraft, OrganizerRaceDraft, OrganizerSimulatedScanDraft } from "./organizerSetup";

export type OrganizerRaceSimulationSnapshot = {
  overallLeaderboard: OverallLeaderboard;
  womenLeaderboard: OverallLeaderboard;
  checkpointLeaderboards: CheckpointLeaderboard[];
  duplicates: DuplicateScan[];
  notifications: NotificationEvent[];
  acceptedCount: number;
  duplicateCount: number;
};

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

import type {
  OrganizerParticipantDraft,
  OrganizerParticipantImportMode,
  OrganizerRaceDraft
} from "./organizerSetup";

export type ParticipantImportImpact = {
  newRows: number;
  updatedRows: number;
  unchangedRows: number;
  skippedExistingRows: number;
  skippedNewRows: number;
};

export function participantDraftEquals(left: OrganizerParticipantDraft, right: OrganizerParticipantDraft) {
  return (
    left.bib === right.bib &&
    left.name === right.name &&
    left.gender === right.gender &&
    left.countryCode === right.countryCode &&
    left.club === right.club
  );
}

export function calculateParticipantImportImpact(
  existingParticipants: OrganizerParticipantDraft[],
  importedParticipants: OrganizerParticipantDraft[]
): ParticipantImportImpact {
  const existingByBib = new Map(existingParticipants.map((participant) => [participant.bib, participant]));
  let newRows = 0;
  let updatedRows = 0;
  let unchangedRows = 0;

  importedParticipants.forEach((participant) => {
    const current = existingByBib.get(participant.bib);

    if (!current) {
      newRows += 1;
      return;
    }

    if (participantDraftEquals(current, participant)) {
      unchangedRows += 1;
      return;
    }

    updatedRows += 1;
  });

  return {
    newRows,
    updatedRows,
    unchangedRows,
    skippedExistingRows: importedParticipants.length - newRows,
    skippedNewRows: newRows
  };
}

export function applyParticipantImportMode(
  currentParticipants: OrganizerParticipantDraft[],
  importedParticipants: OrganizerParticipantDraft[],
  mode: OrganizerParticipantImportMode
) {
  if (mode === "replace") {
    return importedParticipants;
  }

  const importedByBib = new Map(importedParticipants.map((participant) => [participant.bib, participant]));

  if (mode === "add") {
    return [
      ...currentParticipants,
      ...importedParticipants.filter((participant) => !currentParticipants.some((current) => current.bib === participant.bib))
    ];
  }

  if (mode === "update") {
    return currentParticipants.map((participant) => importedByBib.get(participant.bib) ?? participant);
  }

  const mergedParticipants = currentParticipants.map((participant) => importedByBib.get(participant.bib) ?? participant);
  const existingBibs = new Set(currentParticipants.map((participant) => participant.bib));

  return [...mergedParticipants, ...importedParticipants.filter((participant) => !existingBibs.has(participant.bib))];
}

export function appendOrganizerSimulatedScan(
  race: OrganizerRaceDraft,
  input: {
    bib: string;
    checkpointId: string;
    crewAssignmentId: string;
    scannedAt?: string;
    id?: string;
  }
): OrganizerRaceDraft {
  const normalizedBib = input.bib.trim().toUpperCase();
  const checkpoint = race.checkpoints.find((item) => item.id === input.checkpointId);
  const crew = race.crewAssignments.find((item) => item.id === input.crewAssignmentId);
  const participant = race.participants.find((item) => item.bib.trim().toUpperCase() === normalizedBib);

  if (!normalizedBib || !checkpoint || !crew || !participant || crew.checkpointId !== checkpoint.id) {
    return race;
  }

  const firstAccepted = race.simulatedScans.find(
    (scan) => scan.status === "accepted" && scan.checkpointId === checkpoint.id && scan.bib.toUpperCase() === normalizedBib
  );

  return {
    ...race,
    simulatedScans: [
      ...race.simulatedScans,
      {
        id: input.id ?? crypto.randomUUID(),
        bib: normalizedBib,
        checkpointId: checkpoint.id,
        crewAssignmentId: crew.id,
        deviceId: crew.deviceLabel.trim() || crew.id,
        scannedAt: input.scannedAt ?? new Date().toISOString(),
        status: firstAccepted ? ("duplicate" as const) : ("accepted" as const),
        firstAcceptedId: firstAccepted?.id ?? null
      }
    ]
  };
}

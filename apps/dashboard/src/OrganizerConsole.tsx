import { useEffect, useState, type ChangeEvent } from "react";
import type { DemoCourseCheckpoint } from "./demoCourseVariants";
import {
  createParticipantImportTemplateCsv,
  createParticipantImportTemplateWorkbook,
  type OrganizerBrandingDraft,
  type OrganizerCrewAssignmentDraft,
  type OrganizerParticipantImportMode,
  type OrganizerRaceDraft,
  type ParticipantImportPreview
} from "./organizerSetup";
import type { CheckpointLeaderboard, DuplicateScan, NotificationEvent } from "@arm/contracts";

type OrganizerConsoleProps = {
  profileLabel: string;
  eventTitle: string;
  eventPhaseLabel: string;
  branding: OrganizerBrandingDraft;
  races: OrganizerRaceDraft[];
  selectedRaceSlug: string;
  checkpoints: DemoCourseCheckpoint[];
  crewAssignments: OrganizerCrewAssignmentDraft[];
  draftSavedAt: string | null;
  leaderboards: CheckpointLeaderboard[];
  duplicates: DuplicateScan[];
  notifications: NotificationEvent[];
  liveModeLabel: string;
  opsUpdatedAt: string | null;
  importFileName: string | null;
  importImpact: {
    newRows: number;
    updatedRows: number;
    unchangedRows: number;
    skippedExistingRows: number;
    skippedNewRows: number;
  };
  importMode: OrganizerParticipantImportMode;
  importPreview: ParticipantImportPreview;
  importText: string;
  onBackToSpectator: () => void;
  onSaveDraft: () => void;
  onBrandingChange: (patch: Partial<OrganizerBrandingDraft>) => void;
  onRaceChange: (slug: string, patch: Partial<OrganizerRaceDraft>) => void;
  onAddRace: () => void;
  onRemoveRace: (slug: string) => void;
  onSelectRace: (slug: string) => void;
  onImportFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onImportModeChange: (mode: OrganizerParticipantImportMode) => void;
  onClearImport: () => void;
  onApplyImport: () => void;
  onToggleRacePublish: (slug: string, nextPublished: boolean) => void;
  onCheckpointChange: (checkpointId: string, patch: Partial<DemoCourseCheckpoint>) => void;
  onAddCheckpoint: () => void;
  onRemoveCheckpoint: (checkpointId: string) => void;
  onCrewAssignmentChange: (crewId: string, patch: Partial<OrganizerCrewAssignmentDraft>) => void;
  onAddCrewAssignment: () => void;
  onRemoveCrewAssignment: (crewId: string) => void;
  onRegenerateCrewInvite: (crewId: string) => void;
  onEventLogoChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onHeroBackgroundChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onGpxChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onAddSimulatedScan: (input: { bib: string; checkpointId: string; crewAssignmentId: string }) => void;
  onClearSimulatedScans: () => void;
  onLoadSampleScenario: () => void;
  onResetDemoEvent: () => void;
};

type OrganizerConsoleView = "overview" | "branding" | "races" | "crew" | "participants" | "operations";
type OrganizerSetupStepView = "branding" | "races" | "participants" | "crew" | "overview";

export function OrganizerConsole({
  profileLabel,
  eventTitle,
  eventPhaseLabel,
  branding,
  races,
  selectedRaceSlug,
  checkpoints,
  crewAssignments,
  draftSavedAt,
  leaderboards,
  duplicates,
  notifications,
  liveModeLabel,
  opsUpdatedAt,
  importFileName,
  importImpact,
  importMode,
  importPreview,
  importText,
  onBackToSpectator,
  onSaveDraft,
  onBrandingChange,
  onRaceChange,
  onAddRace,
  onRemoveRace,
  onSelectRace,
  onImportFileChange,
  onImportModeChange,
  onClearImport,
  onApplyImport,
  onToggleRacePublish,
  onCheckpointChange,
  onAddCheckpoint,
  onRemoveCheckpoint,
  onCrewAssignmentChange,
  onAddCrewAssignment,
  onRemoveCrewAssignment,
  onRegenerateCrewInvite,
  onEventLogoChange,
  onHeroBackgroundChange,
  onGpxChange,
  onAddSimulatedScan,
  onClearSimulatedScans,
  onLoadSampleScenario,
  onResetDemoEvent
}: OrganizerConsoleProps) {
  const [activeView, setActiveView] = useState<OrganizerConsoleView>("branding");
  const [simulationBib, setSimulationBib] = useState("");
  const [simulationCheckpointId, setSimulationCheckpointId] = useState("");
  const [simulationCrewAssignmentId, setSimulationCrewAssignmentId] = useState("");
  const setupSteps: Array<{ view: OrganizerSetupStepView; title: string; shortLabel: string; description: string }> = [
    {
      view: "branding",
      title: "Set event identity",
      shortLabel: "Event",
      description: "Complete event basics, branding, and the organizer-facing edition identity."
    },
    {
      view: "races",
      title: "Create race categories",
      shortLabel: "Races",
      description: "Create each race category, upload course assets, and organize checkpoints."
    },
    {
      view: "participants",
      title: "Import participants",
      shortLabel: "Participants",
      description: "Upload roster files for the selected race and choose how to apply them."
    },
    {
      view: "crew",
      title: "Set up crew accounts",
      shortLabel: "Crew",
      description: "Assign scan crew to checkpoints, activate their accounts, and provision devices."
    },
    {
      view: "overview",
      title: "Save draft & publish",
      shortLabel: "Review",
      description: "Validate readiness, fix blockers, and publish categories."
    }
  ];
  const draftSavedLabel = draftSavedAt
    ? `Draft saved ${new Date(draftSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : "Draft ready";
  const selectedRace = races.find((race) => race.slug === selectedRaceSlug) ?? null;
  const importModeCopy: Record<OrganizerParticipantImportMode, { label: string; description: string; applyLabel: string }> = {
    merge: {
      label: "Add + update by BIB",
      description: "Add new participants and update existing ones for the selected race.",
      applyLabel: "Apply add + update to selected race"
    },
    add: {
      label: "Add new only",
      description: "Only add BIBs that do not exist yet. Existing BIBs stay unchanged.",
      applyLabel: "Add new participants to selected race"
    },
    update: {
      label: "Update existing only",
      description: "Only update BIBs that already exist. New BIBs are skipped.",
      applyLabel: "Update existing participants"
    },
    replace: {
      label: "Replace all",
      description: "Replace the full participant roster for the selected race with this file.",
      applyLabel: "Replace selected race roster"
    }
  };
  const checkpointCoverage = checkpoints.map((checkpoint) => {
    const assignedCrew = crewAssignments.filter((crew) => crew.checkpointId === checkpoint.id);

    return {
      checkpoint,
      assignedCrew,
      covered: assignedCrew.length > 0
    };
  });
  const coveredCheckpointCount = checkpointCoverage.filter((item) => item.covered).length;
  const uncoveredCheckpointCount = checkpointCoverage.length - coveredCheckpointCount;
  const selectedCheckpointIds = new Set(checkpoints.map((checkpoint) => checkpoint.id));
  const selectedRaceBoards = leaderboards
    .filter((board) => selectedCheckpointIds.has(board.checkpointId))
    .sort((left, right) => right.totalOfficialScans - left.totalOfficialScans);
  const liveActiveCheckpointCount = selectedRaceBoards.filter((board) => board.totalOfficialScans > 0).length;
  const raceDayDuplicates = duplicates.slice(0, 4);
  const raceDayNotifications = notifications.slice(0, 4);
  const scanCrewAssignments = crewAssignments;
  const pendingInviteFieldCrew = scanCrewAssignments.filter((crew) => crew.status === "invited").length;
  const missingDeviceFieldCrew = scanCrewAssignments.filter((crew) => !crew.deviceLabel.trim().length).length;
  const activatableFieldCrew = scanCrewAssignments.filter((crew) => crew.status === "accepted" && crew.deviceLabel.trim().length > 0).length;
  const provisionedCrewCount = scanCrewAssignments.filter((crew) => crew.deviceLabel.trim().length > 0).length;
  const readyDeviceCrewCount = scanCrewAssignments.filter(
    (crew) => crew.deviceLabel.trim().length > 0 && (crew.status === "accepted" || crew.status === "active")
  ).length;
  const checkpointProvisioning = checkpoints.map((checkpoint) => {
    const assignedFieldCrew = scanCrewAssignments.filter((crew) => crew.checkpointId === checkpoint.id);
    const readyAssignedCrew = assignedFieldCrew.filter(
      (crew) => crew.deviceLabel.trim().length > 0 && (crew.status === "accepted" || crew.status === "active")
    );

    return {
      checkpoint,
      assignedFieldCrew,
      readyAssignedCrew,
      ready: readyAssignedCrew.length > 0
    };
  });
  const readyCheckpointProvisionCount = checkpointProvisioning.filter((item) => item.ready).length;
  const checkpointAudit = checkpoints.map((checkpoint) => {
    const assignedCrew = crewAssignments.filter((crew) => crew.checkpointId === checkpoint.id);
    const fieldCrew = assignedCrew;
    const acceptedFieldCrew = fieldCrew.filter((crew) => crew.status === "accepted" || crew.status === "active");
    const provisionedFieldCrew = fieldCrew.filter((crew) => crew.deviceLabel.trim().length > 0);
    const blockers: string[] = [];

    if (assignedCrew.length === 0) {
      blockers.push("No crew assigned");
    }

    if (fieldCrew.length === 0) {
      blockers.push("No scan crew");
    }

    if (fieldCrew.length > 0 && acceptedFieldCrew.length < fieldCrew.length) {
      blockers.push("Scan crew not accepted");
    }

    if (fieldCrew.length > 0 && provisionedFieldCrew.length < fieldCrew.length) {
      blockers.push("Devices not provisioned");
    }

    let level: "ready" | "attention" | "blocked" = "ready";
    if (blockers.length > 0) {
      level = assignedCrew.length === 0 || fieldCrew.length === 0 ? "blocked" : "attention";
    }

    return {
      checkpoint,
      assignedCrew,
      fieldCrew,
      acceptedFieldCrew,
      provisionedFieldCrew,
      blockers,
      level
    };
  });
  const checkpointAuditSummary = {
    ready: checkpointAudit.filter((item) => item.level === "ready").length,
    attention: checkpointAudit.filter((item) => item.level === "attention").length,
    blocked: checkpointAudit.filter((item) => item.level === "blocked").length
  };
  const crewStatusSummary = {
    active: crewAssignments.filter((crew) => crew.status === "active").length,
    accepted: crewAssignments.filter((crew) => crew.status === "accepted").length,
    standby: crewAssignments.filter((crew) => crew.status === "standby").length,
    invited: crewAssignments.filter((crew) => crew.status === "invited").length
  };
  const raceReadiness = races.map((race) => {
    const fieldCrew = race.crewAssignments;
    const acceptedFieldCrew = fieldCrew.filter((crew) => crew.status === "accepted" || crew.status === "active");
    const provisionedFieldCrew = fieldCrew.filter((crew) => crew.deviceLabel.trim().length > 0);
    const checks = [
      {
        label: "Event logo uploaded",
        pass: Boolean(branding.eventLogoDataUrl)
      },
      {
        label: "Hero background uploaded",
        pass: Boolean(branding.heroBackgroundImageDataUrl)
      },
      {
        label: "GPX linked to race",
        pass: Boolean(race.gpxFileName)
      },
      {
        label: "Course description filled",
        pass: race.courseDescription.trim().length >= 24
      },
      {
        label: "Highlights defined",
        pass: race.courseHighlights.filter(Boolean).length >= 2
      },
      {
        label: "Checkpoint plan ready",
        pass: race.checkpoints.length >= 3
      },
      {
        label: "Crew assigned",
        pass: race.crewAssignments.length > 0
      },
      {
        label: "Scan crew accepted",
        pass: fieldCrew.length > 0 && acceptedFieldCrew.length === fieldCrew.length
      },
      {
        label: "Devices provisioned",
        pass: fieldCrew.length > 0 && provisionedFieldCrew.length === fieldCrew.length
      },
      {
        label: "Participants imported",
        pass: race.participants.length > 0
      },
      {
        label: "Start schedule set",
        pass: Boolean(race.startAt.trim()) && Boolean(race.scheduleLabel.trim())
      }
    ];

    const passCount = checks.filter((check) => check.pass).length;

    return {
      race,
      checks,
      passCount,
      ready: passCount === checks.length
    };
  });
  const readyRaceCount = raceReadiness.filter((item) => item.ready).length;
  const blockedRaceReadiness = raceReadiness
    .map((item) => ({
      ...item,
      blockedChecks: item.checks.filter((check) => !check.pass)
    }))
    .filter((item) => !item.ready || !item.race.isPublished);
  const publishedRaceCount = races.filter((race) => race.isPublished).length;
  const draftRaceCount = races.length - publishedRaceCount;
  const liveRaceCount = races.filter((race) => race.editionLabel.toLowerCase() === "live").length;
  const finishedRaceCount = races.filter((race) => race.editionLabel.toLowerCase() === "finished").length;
  const blockerCounts = blockedRaceReadiness
    .flatMap((item) => item.blockedChecks.map((check) => check.label))
    .reduce<Record<string, number>>((accumulator, label) => {
      accumulator[label] = (accumulator[label] ?? 0) + 1;
      return accumulator;
    }, {});
  const topBlockers = Object.entries(blockerCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5);
  const selectedRaceReadiness = raceReadiness.find((item) => item.race.slug === selectedRaceSlug) ?? null;
  const launchSummaryLabel =
    blockedRaceReadiness.length === 0 && publishedRaceCount > 0
      ? "Edition ready for publish"
      : publishedRaceCount === 0
        ? "No race category published yet"
        : "Edition still needs setup";
  const primaryBlocker = topBlockers[0] ?? null;
  const currentStepIndex = setupSteps.findIndex((step) => step.view === activeView);
  const currentStep = currentStepIndex >= 0 ? setupSteps[currentStepIndex] : null;
  const defaultSimulationCheckpointId = checkpoints.find((checkpoint) => checkpoint.id !== "finish")?.id ?? checkpoints[0]?.id ?? "";
  const simulationCheckpointCrew = crewAssignments.filter((crew) => crew.checkpointId === simulationCheckpointId);
  const checkpointOrderById = new Map(checkpoints.map((checkpoint) => [checkpoint.id, checkpoint.order]));
  const checkpointScanHistory = (selectedRace?.simulatedScans ?? []).filter((scan) => scan.status === "accepted");
  const bestAcceptedOrderByBib = checkpointScanHistory.reduce<Map<string, number>>((accumulator, scan) => {
    const bib = scan.bib.trim().toUpperCase();
    const order = checkpointOrderById.get(scan.checkpointId) ?? -1;
    const current = accumulator.get(bib) ?? -1;

    if (order > current) {
      accumulator.set(bib, order);
    }

    return accumulator;
  }, new Map<string, number>());
  const simulationTargetOrder = checkpointOrderById.get(simulationCheckpointId) ?? -1;
  const eligibleSimulationParticipants = (selectedRace?.participants ?? []).filter((participant) => {
    const bib = participant.bib.trim().toUpperCase();
    const alreadyAcceptedAtCheckpoint = checkpointScanHistory.some(
      (scan) => scan.bib.trim().toUpperCase() === bib && scan.checkpointId === simulationCheckpointId
    );

    if (alreadyAcceptedAtCheckpoint) {
      return false;
    }

    const bestOrder = bestAcceptedOrderByBib.get(bib) ?? -1;

    if (simulationTargetOrder <= 0) {
      return bestOrder < 0;
    }

    return bestOrder === simulationTargetOrder - 1;
  });
  const simulationRankedCount = new Set(
    (selectedRace?.simulatedScans ?? [])
      .filter((scan) => scan.status === "accepted")
      .map((scan) => scan.bib.trim().toUpperCase())
  ).size;
  const simulationAcceptedCount = (selectedRace?.simulatedScans ?? []).filter((scan) => scan.status === "accepted").length;
  const simulationDuplicateCount = (selectedRace?.simulatedScans ?? []).filter((scan) => scan.status === "duplicate").length;
  const recentSimulationAttempts = [...(selectedRace?.simulatedScans ?? [])]
    .sort((left, right) => right.scannedAt.localeCompare(left.scannedAt))
    .slice(0, 8);
  const selectedSimulationParticipant =
    selectedRace?.participants.find((participant) => participant.bib.trim().toUpperCase() === simulationBib.trim().toUpperCase()) ?? null;

  useEffect(() => {
    if (activeView === "operations") {
      return;
    }

    if (currentStepIndex === -1) {
      setActiveView("branding");
    }
  }, [activeView, currentStepIndex]);

  useEffect(() => {
    setSimulationBib("");
    setSimulationCheckpointId(defaultSimulationCheckpointId);
  }, [defaultSimulationCheckpointId, selectedRaceSlug]);

  useEffect(() => {
    if (!simulationCheckpointId || !checkpoints.some((checkpoint) => checkpoint.id === simulationCheckpointId)) {
      if (simulationCheckpointId !== defaultSimulationCheckpointId) {
        setSimulationCheckpointId(defaultSimulationCheckpointId);
      }
      return;
    }

    if (!simulationCheckpointCrew.some((crew) => crew.id === simulationCrewAssignmentId)) {
      setSimulationCrewAssignmentId(simulationCheckpointCrew[0]?.id ?? "");
    }
  }, [
    checkpoints,
    defaultSimulationCheckpointId,
    simulationCheckpointCrew,
    simulationCheckpointId,
    simulationCrewAssignmentId
  ]);

  function handleRecordSimulatedScan() {
    if (!simulationBib.trim() || !simulationCheckpointId || !simulationCrewAssignmentId) {
      return;
    }

    onAddSimulatedScan({
      bib: simulationBib,
      checkpointId: simulationCheckpointId,
      crewAssignmentId: simulationCrewAssignmentId
    });
    setSimulationBib("");
  }

  function handleSimulateCheckpointWave() {
    if (!simulationCheckpointId || !simulationCrewAssignmentId) {
      return;
    }

    eligibleSimulationParticipants.slice(0, 3).forEach((participant) => {
      onAddSimulatedScan({
        bib: participant.bib,
        checkpointId: simulationCheckpointId,
        crewAssignmentId: simulationCrewAssignmentId
      });
    });
  }

  function handleSimulateDuplicate() {
    if (!simulationCheckpointId || !simulationCrewAssignmentId) {
      return;
    }

    const latestAcceptedAtCheckpoint = [...checkpointScanHistory]
      .filter((scan) => scan.checkpointId === simulationCheckpointId)
      .sort((left, right) => right.scannedAt.localeCompare(left.scannedAt))[0];

    if (!latestAcceptedAtCheckpoint) {
      return;
    }

    onAddSimulatedScan({
      bib: latestAcceptedAtCheckpoint.bib,
      checkpointId: simulationCheckpointId,
      crewAssignmentId: simulationCrewAssignmentId
    });
  }

  async function downloadParticipantTemplate(kind: "csv" | "xlsx") {
    const blob =
      kind === "csv"
        ? new Blob([createParticipantImportTemplateCsv()], { type: "text/csv;charset=utf-8;" })
        : new Blob(
            [
              (
                await import("xlsx")
              ).write(await createParticipantImportTemplateWorkbook(), {
                type: "array",
                bookType: "xlsx"
              })
            ],
            {
              type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            }
          );
    const fileName = kind === "csv" ? "trailnesia-participants-template.csv" : "trailnesia-participants-template.xlsx";
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  function handleInspectRace(slug: string) {
    onSelectRace(slug);
    setActiveView("races");
  }

  function goToStep(view: OrganizerSetupStepView) {
    setActiveView(view);
  }

  function goToPreviousStep() {
    if (currentStepIndex <= 0) {
      return;
    }

    setActiveView(setupSteps[currentStepIndex - 1].view);
  }

  function goToNextStep() {
    if (currentStepIndex === -1 || currentStepIndex >= setupSteps.length - 1) {
      return;
    }

    setActiveView(setupSteps[currentStepIndex + 1].view);
  }

  return (
    <section className="organizer-console-shell" id="organizer-console">
      <div className="organizer-console-header">
        <div>
          <p className="section-label">Organizer Platform</p>
          <h2>Event Setup Console</h2>
          <p className="organizer-console-copy">
            Follow the setup flow one section at a time: event identity, race categories, crew accounts, then save draft and publish.
          </p>
          <p className="organizer-console-meta">
            {eventTitle} · {eventPhaseLabel} · Signed in as {profileLabel}
          </p>
          {currentStep ? (
            <div className="organizer-console-flow-meta">
              <span className="organizer-flow-pill">Step {currentStepIndex + 1} of {setupSteps.length}</span>
              <span className="organizer-flow-pill secondary">{draftSavedLabel}</span>
              <strong>{currentStep.title}</strong>
              <span>{currentStep.description}</span>
            </div>
          ) : (
            <div className="organizer-console-flow-meta">
              <span className="organizer-flow-pill secondary">Operations</span>
              <span className="organizer-flow-pill secondary">{draftSavedLabel}</span>
              <strong>Race day operations</strong>
              <span>Use this after setup to monitor live activity and exceptions.</span>
            </div>
          )}
        </div>
        <div className="organizer-console-actions">
          <button className="toolbar-link organizer-secondary-action" onClick={onSaveDraft} type="button">
            Save draft
          </button>
          <button className="toolbar-link organizer-console-back" onClick={onBackToSpectator} type="button">
            Back to spectator
          </button>
        </div>
      </div>

      <nav aria-label="Organizer console sections" className="organizer-console-nav">
        {setupSteps.map((step, index) => (
          <button className={`organizer-console-nav-button ${activeView === step.view ? "active" : ""}`} key={step.view} onClick={() => goToStep(step.view)} type="button">
            <span className="organizer-console-nav-step">{index + 1}</span>
            <span>{step.shortLabel}</span>
          </button>
        ))}
        <button className={`organizer-console-nav-button organizer-console-nav-secondary ${activeView === "operations" ? "active" : ""}`} onClick={() => setActiveView("operations")} type="button">
          Race Day Ops
        </button>
      </nav>

      <div className="organizer-console-grid">
        <article className="panel organizer-console-panel organizer-console-wide" hidden={activeView !== "overview"}>
          <div className="panel-head compact">
            <div>
              <p className="organizer-step-label">Step 5 of 5</p>
              <p className="section-label">Launch Summary</p>
              <h3>Edition go-live status</h3>
            </div>
            <span className={`organizer-readiness-pill ${blockedRaceReadiness.length === 0 && publishedRaceCount > 0 ? "ready" : "draft"}`}>
              {launchSummaryLabel}
            </span>
          </div>

          <div className="organizer-import-note">
            <strong>Draft mode stays private.</strong>
            <p>
              All changes in branding, races, participants, and crew are saved as draft. Spectators only see categories that
              you publish explicitly.
            </p>
          </div>

          <div className="organizer-launch-summary">
            <div className="panel-badge compact-badge">
              <span>Published races</span>
              <strong>{publishedRaceCount}</strong>
              <span>{draftRaceCount} still draft</span>
            </div>
            <div className="panel-badge compact-badge">
              <span>Ready categories</span>
              <strong>{readyRaceCount}</strong>
              <span>of {races.length}</span>
            </div>
            <div className="panel-badge compact-badge">
              <span>Current focus</span>
              <strong>{selectedRace?.title ?? "No race selected"}</strong>
              <span>
                {selectedRaceReadiness ? `${selectedRaceReadiness.passCount}/${selectedRaceReadiness.checks.length} checks complete` : "select a race"}
              </span>
            </div>
          </div>

          <div className="organizer-setup-sequence">
            {setupSteps.map((step, index) => (
              <button className="organizer-setup-sequence-card" key={`setup-sequence-${step.view}`} onClick={() => goToStep(step.view)} type="button">
                <span className="organizer-setup-sequence-number">{index + 1}</span>
                <strong>{step.shortLabel}</strong>
                <p>{step.description}</p>
              </button>
            ))}
          </div>

          <div className="organizer-launch-detail organizer-launch-detail-condensed">
            <div className="organizer-launch-card">
              <p className="section-label">Current launch signal</p>
              <h3>{primaryBlocker ? primaryBlocker[0] : "All publish checks are green"}</h3>
              <p className="organizer-launch-copy">
                {primaryBlocker
                  ? `${primaryBlocker[1]} categories still need this item before they can be published.`
                  : `${liveRaceCount} live categories and ${finishedRaceCount} finished categories are already aligned for spectator view.`}
              </p>
              <div className="organizer-launch-tags">
                {topBlockers.length > 1 ? (
                  topBlockers.slice(1, 4).map(([label, count]) => (
                    <span className="organizer-validation-tag" key={`blocker-${label}`}>
                      {label} · {count}
                    </span>
                  ))
                ) : (
                  <span className="organizer-validation-tag success">All publish checks are green</span>
                )}
              </div>
            </div>
          </div>
        </article>

          <article className="panel organizer-console-panel organizer-console-wide" hidden={activeView !== "operations"}>
            <div className="panel-head compact">
              <div>
                <p className="section-label">Race Day Ops</p>
                <h3>Live operations snapshot</h3>
            </div>
          </div>

          <div className="organizer-ops-summary">
            <div className="panel-badge compact-badge">
              <span>Live mode</span>
              <strong>{liveModeLabel}</strong>
              <span>{opsUpdatedAt ? `updated ${opsUpdatedAt}` : "waiting for sync"}</span>
            </div>
            <div className="panel-badge compact-badge">
              <span>Active checkpoints</span>
              <strong>{liveActiveCheckpointCount}</strong>
              <span>of {selectedRaceBoards.length}</span>
            </div>
            <div className="panel-badge compact-badge">
              <span>Duplicate audits</span>
              <strong>{duplicates.length}</strong>
              <span>event-wide feed</span>
            </div>
            <div className="panel-badge compact-badge">
              <span>Broadcast events</span>
              <strong>{notifications.length}</strong>
              <span>top-5 notifications</span>
              </div>
            </div>

            <section className="organizer-ops-simulator">
              <div className="panel-head compact">
                <div>
                  <p className="section-label">Trial simulator</p>
                  <h3>Run a miniature race day</h3>
                </div>
                <button
                  className="toolbar-link organizer-secondary-action"
                  disabled={recentSimulationAttempts.length === 0}
                  onClick={onClearSimulatedScans}
                  type="button"
                >
                  Reset trial scans
                </button>
                <button
                  className="toolbar-link organizer-secondary-action"
                  disabled={!selectedRace || selectedRace.participants.length === 0 || checkpoints.length === 0 || crewAssignments.length === 0}
                  onClick={onLoadSampleScenario}
                  type="button"
                >
                  Load sample scenario
                </button>
                <button className="toolbar-link organizer-secondary-action" onClick={onResetDemoEvent} type="button">
                  Clear all trial scans
                </button>
              </div>

              <div className="organizer-ops-summary organizer-ops-summary-compact">
                <div className="panel-badge compact-badge">
                  <span>Race</span>
                  <strong>{selectedRace?.title ?? "No race selected"}</strong>
                  <span>{selectedRace?.participants.length ?? 0} registered participants</span>
                </div>
                <div className="panel-badge compact-badge">
                  <span>Accepted scans</span>
                  <strong>{simulationAcceptedCount}</strong>
                  <span>counted into live boards</span>
                </div>
                <div className="panel-badge compact-badge">
                  <span>Duplicate scans</span>
                  <strong>{simulationDuplicateCount}</strong>
                  <span>same BIB + same checkpoint</span>
                </div>
                <div className="panel-badge compact-badge">
                  <span>Ranked runners</span>
                  <strong>{simulationRankedCount}</strong>
                  <span>live race order projected</span>
                </div>
              </div>

              <div className="organizer-simulator-grid">
                <label className="organizer-field">
                  <span>BIB input</span>
                  <input
                    list={`participant-bibs-${selectedRaceSlug}`}
                    onChange={(event) => setSimulationBib(event.target.value.toUpperCase())}
                    placeholder="Type or scan BIB"
                    value={simulationBib}
                  />
                  <datalist id={`participant-bibs-${selectedRaceSlug}`}>
                    {(selectedRace?.participants ?? []).map((participant) => (
                      <option key={`sim-bib-${participant.bib}`} value={participant.bib}>
                        {participant.name}
                      </option>
                    ))}
                  </datalist>
                </label>

                <label className="organizer-field">
                  <span>Checkpoint</span>
                  <select onChange={(event) => setSimulationCheckpointId(event.target.value)} value={simulationCheckpointId}>
                    {checkpoints.map((checkpoint) => (
                      <option key={`sim-checkpoint-${checkpoint.id}`} value={checkpoint.id}>
                        {checkpoint.code} - {checkpoint.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="organizer-field">
                  <span>Scan crew</span>
                  <select
                    disabled={simulationCheckpointCrew.length === 0}
                    onChange={(event) => setSimulationCrewAssignmentId(event.target.value)}
                    value={simulationCrewAssignmentId}
                  >
                    {simulationCheckpointCrew.length === 0 ? (
                      <option value="">No crew assigned to this checkpoint</option>
                    ) : (
                      simulationCheckpointCrew.map((crew) => (
                        <option key={`sim-crew-${crew.id}`} value={crew.id}>
                          {crew.name} | {crew.deviceLabel.trim() || "No device label"}
                        </option>
                      ))
                    )}
                  </select>
                </label>

                <div className="organizer-simulator-actions">
                  <div className="organizer-simulator-button-row">
                    <button
                      className="toolbar-link organizer-primary-action"
                      disabled={!simulationBib.trim() || !selectedSimulationParticipant || !simulationCheckpointId || !simulationCrewAssignmentId}
                      onClick={handleRecordSimulatedScan}
                      type="button"
                    >
                      Record trial scan
                    </button>
                    <button
                      className="toolbar-link organizer-secondary-action"
                      disabled={eligibleSimulationParticipants.length === 0 || !simulationCheckpointId || !simulationCrewAssignmentId}
                      onClick={handleSimulateCheckpointWave}
                      type="button"
                    >
                      Simulate checkpoint wave
                    </button>
                    <button
                      className="toolbar-link organizer-secondary-action"
                      disabled={!checkpointScanHistory.some((scan) => scan.checkpointId === simulationCheckpointId) || !simulationCrewAssignmentId}
                      onClick={handleSimulateDuplicate}
                      type="button"
                    >
                      Inject duplicate
                    </button>
                  </div>
                  <p className="organizer-simulator-note">
                    {selectedSimulationParticipant
                      ? `${selectedSimulationParticipant.name} | ${selectedSimulationParticipant.club || "No club"}`
                      : simulationBib.trim().length
                        ? "BIB not found in this race roster yet."
                        : "Duplicates at the same checkpoint will be sent to duplicate audit automatically."}
                  </p>
                </div>
              </div>

              <div className="organizer-simulator-queue">
                <p className="section-label">Ready queue</p>
                <div className="organizer-simulator-queue-items">
                  {eligibleSimulationParticipants.slice(0, 6).map((participant) => (
                    <span className="organizer-validation-tag" key={`sim-queue-${participant.bib}`}>
                      {participant.bib} | {participant.name}
                    </span>
                  ))}
                  {!eligibleSimulationParticipants.length ? (
                    <span className="organizer-validation-tag">No runner is queued for this checkpoint yet.</span>
                  ) : null}
                </div>
              </div>

              <div className="organizer-ops-list organizer-ops-list-wide">
                {recentSimulationAttempts.length ? (
                  recentSimulationAttempts.map((attempt) => {
                    const checkpoint = checkpoints.find((item) => item.id === attempt.checkpointId);
                    const crew = crewAssignments.find((item) => item.id === attempt.crewAssignmentId);
                    const participant =
                      selectedRace?.participants.find(
                        (item) => item.bib.trim().toUpperCase() === attempt.bib.trim().toUpperCase()
                      ) ?? null;

                    return (
                      <article className="organizer-ops-row" key={attempt.id}>
                        <div>
                          <strong>
                            BIB {attempt.bib}
                            {participant ? ` - ${participant.name}` : ""}
                          </strong>
                          <p>
                            {(checkpoint ? `${checkpoint.code} - ${checkpoint.name}` : attempt.checkpointId) +
                              ` | ${crew?.name ?? "Unknown crew"}`}
                          </p>
                        </div>
                        <div className="organizer-ops-row-meta">
                          <span className={`organizer-readiness-pill ${attempt.status === "accepted" ? "ready" : "draft"}`}>
                            {attempt.status === "accepted" ? "Accepted" : "Duplicate"}
                          </span>
                          <small>{new Date(attempt.scannedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <div className="empty-compact">No trial scan recorded yet. Use this panel to simulate race-day scans.</div>
                )}
              </div>

              <section className="organizer-simulator-runbook">
                <div className="panel-head compact">
                  <div>
                    <p className="section-label">Trial runbook</p>
                    <h3>Recommended flow for a first rehearsal</h3>
                  </div>
                </div>
                <ol className="organizer-runbook-list">
                  <li>Reset the demo event if you want to start from a clean baseline.</li>
                  <li>Complete Branding, Races, Participants, and Crew for the selected category.</li>
                  <li>Load the sample scenario to seed realistic checkpoint activity.</li>
                  <li>Open spectator view and confirm Event Home, Race Detail, and sidebar state look correct.</li>
                  <li>Return to Race Day Ops, record manual scans, then simulate a checkpoint wave.</li>
                  <li>Inject one duplicate and confirm it appears in duplicate audit without breaking the live board.</li>
                  <li>Reset trial scans and repeat until the team is comfortable with the race-day flow.</li>
                </ol>
              </section>
            </section>

            <div className="organizer-ops-grid">
            <section className="organizer-ops-card">
              <div className="panel-head compact">
                <div>
                  <p className="section-label">Checkpoint load</p>
                  <h3>Most active checkpoints</h3>
                </div>
              </div>
              <div className="organizer-ops-list">
                {selectedRaceBoards.slice(0, 5).map((board) => {
                  const checkpoint = checkpoints.find((item) => item.id === board.checkpointId);

                  return (
                    <article className="organizer-ops-row" key={`ops-board-${board.checkpointId}`}>
                      <div>
                        <strong>{checkpoint ? `${checkpoint.code} - ${checkpoint.name}` : board.checkpointId}</strong>
                        <p>{board.totalOfficialScans} official scans</p>
                      </div>
                      <span className={`organizer-readiness-pill ${board.totalOfficialScans > 0 ? "ready" : "draft"}`}>
                        {board.totalOfficialScans > 0 ? "Active" : "Idle"}
                      </span>
                    </article>
                  );
                })}
                {!selectedRaceBoards.length ? <div className="empty-compact">No live checkpoint board available yet for this race.</div> : null}
              </div>
            </section>

            <section className="organizer-ops-card">
              <div className="panel-head compact">
                <div>
                  <p className="section-label">Broadcasts</p>
                  <h3>Latest top-5 notifications</h3>
                </div>
              </div>
              <div className="organizer-ops-list">
                {raceDayNotifications.map((notification) => (
                  <article className="organizer-ops-row" key={notification.id}>
                    <div>
                      <strong>BIB {notification.bib}</strong>
                      <p>
                        {notification.checkpointId} | position #{notification.position}
                      </p>
                    </div>
                    <small>{new Date(notification.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
                  </article>
                ))}
                {!raceDayNotifications.length ? <div className="empty-compact">No top-5 broadcast has been emitted yet.</div> : null}
              </div>
            </section>

            <section className="organizer-ops-card">
              <div className="panel-head compact">
                <div>
                  <p className="section-label">Duplicate audit</p>
                  <h3>Latest duplicate scans</h3>
                </div>
              </div>
              <div className="organizer-ops-list">
                {raceDayDuplicates.map((duplicate) => (
                  <article className="organizer-ops-row" key={duplicate.clientScanId}>
                    <div>
                      <strong>BIB {duplicate.bib}</strong>
                      <p>
                        {duplicate.checkpointId} | first accepted {duplicate.firstAcceptedClientScanId}
                      </p>
                    </div>
                    <small>{new Date(duplicate.serverReceivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
                  </article>
                ))}
                {!raceDayDuplicates.length ? <div className="empty-compact">No duplicate scan needs attention yet.</div> : null}
              </div>
            </section>
          </div>
        </article>

        <article className="panel organizer-console-panel" hidden={activeView !== "branding"}>
          <div className="panel-head compact">
            <div>
              <p className="organizer-step-label">Step 1 of 5</p>
              <p className="section-label">Branding</p>
              <h3>Edition identity</h3>
            </div>
          </div>

          <div className="organizer-form-grid">
            <label className="organizer-field">
              <span>Organizer name</span>
              <input value={branding.organizerName} onChange={(event) => onBrandingChange({ organizerName: event.target.value })} />
            </label>
            <label className="organizer-field">
              <span>Brand name</span>
              <input value={branding.brandName} onChange={(event) => onBrandingChange({ brandName: event.target.value })} />
            </label>
            <label className="organizer-field">
              <span>Brand line 1</span>
              <input value={branding.brandStackTop} onChange={(event) => onBrandingChange({ brandStackTop: event.target.value })} />
            </label>
            <label className="organizer-field">
              <span>Brand line 2</span>
              <input value={branding.brandStackBottom} onChange={(event) => onBrandingChange({ brandStackBottom: event.target.value })} />
            </label>
            <label className="organizer-field">
              <span>Edition label</span>
              <input value={branding.editionLabel} onChange={(event) => onBrandingChange({ editionLabel: event.target.value })} />
            </label>
            <label className="organizer-field">
              <span>Banner tagline</span>
              <input value={branding.bannerTagline} onChange={(event) => onBrandingChange({ bannerTagline: event.target.value })} />
            </label>
            <label className="organizer-field organizer-field-wide">
              <span>Home title</span>
              <input value={branding.homeTitle} onChange={(event) => onBrandingChange({ homeTitle: event.target.value })} />
            </label>
            <label className="organizer-field organizer-field-wide">
              <span>Home subtitle</span>
              <textarea rows={3} value={branding.homeSubtitle} onChange={(event) => onBrandingChange({ homeSubtitle: event.target.value })} />
            </label>
            <label className="organizer-field">
              <span>Date ribbon</span>
              <input value={branding.dateRibbon} onChange={(event) => onBrandingChange({ dateRibbon: event.target.value })} />
            </label>
            <label className="organizer-field">
              <span>Location ribbon</span>
              <input value={branding.locationRibbon} onChange={(event) => onBrandingChange({ locationRibbon: event.target.value })} />
            </label>
          </div>
        </article>

        <article className="panel organizer-console-panel" hidden={activeView !== "branding"}>
          <div className="panel-head compact">
            <div>
              <p className="section-label">Assets</p>
              <h3>Event logo & hero background</h3>
            </div>
          </div>

          <div className="organizer-assets-grid">
            <div className="organizer-logo-dropzone">
              <div className="organizer-logo-preview">
                {branding.eventLogoDataUrl ? <img alt="Event logo preview" src={branding.eventLogoDataUrl} /> : <span>Event logo preview</span>}
              </div>
              <label className="toolbar-link organizer-file-trigger">
                Upload event logo
                <input accept="image/*" hidden onChange={onEventLogoChange} type="file" />
              </label>
            </div>

            <div className="organizer-logo-dropzone">
              <div className="organizer-logo-preview organizer-hero-preview">
                {branding.heroBackgroundImageDataUrl ? (
                  <img alt="Hero background preview" src={branding.heroBackgroundImageDataUrl} />
                ) : (
                  <span>Hero background preview</span>
                )}
              </div>
              <label className="toolbar-link organizer-file-trigger">
                Upload hero background
                <input accept="image/*" hidden onChange={onHeroBackgroundChange} type="file" />
              </label>
            </div>
          </div>

          <div className="organizer-step-actions">
            <button className="toolbar-link organizer-secondary-action" onClick={goToNextStep} type="button">
              Continue to races & checkpoints
            </button>
          </div>
        </article>

        <article className="panel organizer-console-panel organizer-console-wide" hidden={activeView !== "overview"}>
          <div className="panel-head compact">
            <div>
              <p className="section-label">Readiness</p>
              <h3>Category publish readiness</h3>
            </div>
            <div className="panel-badge compact-badge">
              <span>Ready races</span>
              <strong>{readyRaceCount}</strong>
              <span>of {races.length}</span>
            </div>
          </div>

          <div className="organizer-readiness-grid">
            {raceReadiness.map(({ race, checks, passCount, ready }) => (
              <article className={`organizer-readiness-card ${ready ? "ready" : "draft"}`} key={`readiness-${race.slug}`}>
                <div className="organizer-readiness-head">
                  <div>
                    <strong>{race.title}</strong>
                    <p>
                      {passCount}/{checks.length} setup checks complete
                    </p>
                  </div>
                  <div className="organizer-readiness-actions">
                    <span className={`organizer-readiness-pill ${race.isPublished ? "published" : ready ? "ready" : "draft"}`}>
                      {race.isPublished ? "Published" : ready ? "Ready" : "Needs setup"}
                    </span>
                    <button
                      className={`toolbar-link organizer-publish-button ${race.isPublished ? "secondary" : ""}`}
                      disabled={!race.isPublished && !ready}
                      onClick={() => onToggleRacePublish(race.slug, !race.isPublished)}
                      type="button"
                    >
                      {race.isPublished ? "Unpublish" : "Publish"}
                    </button>
                  </div>
                </div>

                <div className="organizer-readiness-list">
                  {checks.map((check) => (
                    <div className={`organizer-readiness-item ${check.pass ? "pass" : "pending"}`} key={`${race.slug}-${check.label}`}>
                      <span className="organizer-readiness-dot" aria-hidden="true" />
                      <span>{check.label}</span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="panel organizer-console-panel organizer-console-wide" hidden={activeView !== "overview"}>
          <div className="panel-head compact">
            <div>
              <p className="section-label">Publish Validation</p>
              <h3>Blocked categories</h3>
            </div>
            <div className="panel-badge compact-badge">
              <span>Need attention</span>
              <strong>{blockedRaceReadiness.length}</strong>
              <span>categories</span>
            </div>
          </div>

          <div className="organizer-validation-list">
            {blockedRaceReadiness.map(({ race, blockedChecks, ready }) => (
              <article className="organizer-validation-row" key={`validation-${race.slug}`}>
                <div>
                  <strong>{race.title}</strong>
                  <p>
                    {race.isPublished ? "Published with open blockers" : ready ? "Ready to publish" : "Draft with pending setup"}
                  </p>
                </div>
                <div className="organizer-validation-meta">
                  <div className="organizer-validation-tags">
                    {blockedChecks.length ? (
                      blockedChecks.slice(0, 4).map((check) => (
                        <span className="organizer-validation-tag" key={`${race.slug}-${check.label}`}>
                          {check.label}
                        </span>
                      ))
                    ) : (
                      <span className="organizer-validation-tag success">Ready for publish</span>
                    )}
                  </div>
                  <button className="toolbar-link organizer-secondary-action" onClick={() => handleInspectRace(race.slug)} type="button">
                    Inspect race
                  </button>
                </div>
              </article>
            ))}
            {!blockedRaceReadiness.length ? <div className="empty-compact">All race categories are ready and published.</div> : null}
          </div>
        </article>

        <article className="panel organizer-console-panel organizer-console-wide" hidden={activeView !== "races"}>
          <div className="panel-head compact">
            <div>
              <p className="organizer-step-label">Step 2 of 5</p>
              <p className="section-label">Races & Checkpoints</p>
              <h3>Focused race setup</h3>
            </div>
            <button className="toolbar-link organizer-apply-button" onClick={onAddRace} type="button">
              Add race category
            </button>
          </div>

          <div className="organizer-race-workspace">
            <div className="organizer-race-toolbar">
              <label className="organizer-field organizer-race-selector">
                <span>Selected race</span>
                <select onChange={(event) => onSelectRace(event.target.value)} value={selectedRaceSlug}>
                  {races.map((race) => (
                    <option key={`race-workspace-${race.slug}`} value={race.slug}>
                      {race.title}
                    </option>
                  ))}
                </select>
              </label>
              {selectedRace ? (
                <div className="organizer-race-toolbar-actions">
                  <span className={`organizer-status-pill ${selectedRace.editionLabel.toLowerCase() === "live" ? "live" : "finished"}`}>
                    {selectedRace.editionLabel}
                  </span>
                  <span className={`organizer-status-pill ${selectedRace.isPublished ? "published" : "draft"}`}>
                    {selectedRace.isPublished ? "Published" : "Draft"}
                  </span>
                  <button
                    className="toolbar-link organizer-secondary-action"
                    onClick={() => onToggleRacePublish(selectedRace.slug, !selectedRace.isPublished)}
                    type="button"
                  >
                    {selectedRace.isPublished ? "Unpublish" : "Publish"}
                  </button>
                  <button className="toolbar-link organizer-remove-race" onClick={() => onRemoveRace(selectedRace.slug)} type="button">
                    Remove race
                  </button>
                </div>
              ) : null}
            </div>

            {selectedRace ? (
              <>
                <div className="organizer-race-summary">
                  <div className="panel-badge compact-badge">
                    <span>Readiness</span>
                    <strong>
                      {selectedRaceReadiness ? `${selectedRaceReadiness.passCount}/${selectedRaceReadiness.checks.length}` : "0/0"}
                    </strong>
                    <span>{selectedRaceReadiness?.ready ? "ready to publish" : "checks pending"}</span>
                  </div>
                  <div className="panel-badge compact-badge">
                    <span>Participants</span>
                    <strong>{selectedRace.participants.length}</strong>
                    <span>mapped to this race</span>
                  </div>
                  <div className="panel-badge compact-badge">
                    <span>Checkpoints</span>
                    <strong>{selectedRace.checkpoints.length}</strong>
                    <span>course plan</span>
                  </div>
                  <div className="panel-badge compact-badge">
                    <span>Assigned scan crew</span>
                    <strong>{selectedRace.crewAssignments.length}</strong>
                    <span>checkpoint scanning team</span>
                  </div>
                </div>

                <section className="organizer-subsection">
                  <div className="organizer-subsection-head">
                    <div>
                      <p className="section-label">Race details</p>
                      <h4>Category identity & course copy</h4>
                    </div>
                  </div>
                  <div className="organizer-form-grid compact organizer-race-editor-grid">
                    <label className="organizer-field organizer-field-wide">
                      <span>Race title</span>
                      <input value={selectedRace.title} onChange={(event) => onRaceChange(selectedRace.slug, { title: event.target.value })} />
                    </label>
                    <label className="organizer-field">
                      <span>Status</span>
                      <select value={selectedRace.editionLabel} onChange={(event) => onRaceChange(selectedRace.slug, { editionLabel: event.target.value })}>
                        <option value="Live">Live</option>
                        <option value="Finished">Finished</option>
                      </select>
                    </label>
                    <label className="organizer-field">
                      <span>Schedule</span>
                      <input value={selectedRace.scheduleLabel} onChange={(event) => onRaceChange(selectedRace.slug, { scheduleLabel: event.target.value })} />
                    </label>
                    <label className="organizer-field">
                      <span>Start ISO time</span>
                      <input value={selectedRace.startAt} onChange={(event) => onRaceChange(selectedRace.slug, { startAt: event.target.value })} />
                    </label>
                    <label className="organizer-field">
                      <span>Start town</span>
                      <input value={selectedRace.startTown} onChange={(event) => onRaceChange(selectedRace.slug, { startTown: event.target.value })} />
                    </label>
                    <label className="organizer-field">
                      <span>Distance (km)</span>
                      <input
                        type="number"
                        value={selectedRace.distanceKm}
                        onChange={(event) => onRaceChange(selectedRace.slug, { distanceKm: Number(event.target.value) || 0 })}
                      />
                    </label>
                    <label className="organizer-field">
                      <span>Ascent (m+)</span>
                      <input
                        type="number"
                        value={selectedRace.ascentM}
                        onChange={(event) => onRaceChange(selectedRace.slug, { ascentM: Number(event.target.value) || 0 })}
                      />
                    </label>
                    <label className="organizer-field organizer-field-wide">
                      <span>Course description</span>
                      <textarea
                        rows={3}
                        value={selectedRace.courseDescription}
                        onChange={(event) => onRaceChange(selectedRace.slug, { courseDescription: event.target.value })}
                      />
                    </label>
                    <label className="organizer-field organizer-field-wide">
                      <span>Course highlights</span>
                      <input
                        value={selectedRace.courseHighlights.join(", ")}
                        onChange={(event) =>
                          onRaceChange(selectedRace.slug, {
                            courseHighlights: event.target.value
                              .split(",")
                              .map((value) => value.trim())
                              .filter(Boolean)
                          })
                        }
                      />
                    </label>
                  </div>
                </section>

                <section className="organizer-subsection">
                  <div className="organizer-subsection-head">
                    <div>
                      <p className="section-label">Course file</p>
                      <h4>GPX for the selected race</h4>
                    </div>
                  </div>
                  <div className="organizer-gpx-draft organizer-gpx-panel">
                    <strong>{`Course file for ${selectedRace.title}`}</strong>
                    <p>
                      {selectedRace.gpxFileName
                        ? `${selectedRace.gpxFileName} (${Math.round((selectedRace.gpxFileSize ?? 0) / 1024)} KB)`
                        : "No GPX uploaded yet for the selected race."}
                    </p>
                    <label className="toolbar-link organizer-file-trigger">
                      Upload GPX for selected race
                      <input accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden onChange={onGpxChange} type="file" />
                    </label>
                  </div>
                </section>

                <section className="organizer-subsection">
                  <div className="organizer-subsection-head">
                    <div>
                      <p className="section-label">Checkpoints</p>
                      <h4>Checkpoint plan for {selectedRace.title}</h4>
                    </div>
                    <button className="toolbar-link organizer-apply-button" onClick={onAddCheckpoint} type="button">
                      Add checkpoint
                    </button>
                  </div>

                  <div className="organizer-checkpoint-list">
                    {checkpoints.map((checkpoint) => (
                      <article className="organizer-checkpoint-row" key={checkpoint.id}>
                        <label className="organizer-field">
                          <span>Code</span>
                          <input value={checkpoint.code} onChange={(event) => onCheckpointChange(checkpoint.id, { code: event.target.value.toUpperCase() })} />
                        </label>
                        <label className="organizer-field organizer-field-wide">
                          <span>Name</span>
                          <input value={checkpoint.name} onChange={(event) => onCheckpointChange(checkpoint.id, { name: event.target.value })} />
                        </label>
                        <label className="organizer-field">
                          <span>KM marker</span>
                          <input
                            type="number"
                            value={checkpoint.kmMarker}
                            onChange={(event) => onCheckpointChange(checkpoint.id, { kmMarker: Number(event.target.value) || 0 })}
                          />
                        </label>
                        <label className="organizer-field">
                          <span>Order</span>
                          <input readOnly value={checkpoint.order + 1} />
                        </label>
                        <div className="organizer-checkpoint-actions">
                          <button
                            className="toolbar-link organizer-remove-race"
                            disabled={checkpoint.id === "cp-start" || checkpoint.id === "finish"}
                            onClick={() => onRemoveCheckpoint(checkpoint.id)}
                            type="button"
                          >
                            Remove
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                <div className="organizer-step-actions">
                  <button className="toolbar-link organizer-secondary-action" onClick={goToPreviousStep} type="button">
                    Back to branding
                  </button>
                  <button className="toolbar-link organizer-secondary-action" onClick={goToNextStep} type="button">
                    Continue to participants
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-compact">Select a race category to start editing its details, GPX, and checkpoints.</div>
            )}
          </div>
        </article>

        <article className="panel organizer-console-panel organizer-console-wide" hidden={activeView !== "crew"}>
          <div className="panel-head compact">
            <div>
              <p className="organizer-step-label">Step 4 of 5</p>
              <p className="section-label">Crew & Accounts</p>
              <h3>Field operations setup</h3>
            </div>
            <button className="toolbar-link organizer-apply-button" onClick={onAddCrewAssignment} type="button">
              Add crew
            </button>
          </div>

          <div className="organizer-crew-workspace">
            <div className="organizer-race-toolbar">
              <label className="organizer-field organizer-race-selector">
                <span>Selected race</span>
                <select onChange={(event) => onSelectRace(event.target.value)} value={selectedRaceSlug}>
                  {races.map((race) => (
                    <option key={`crew-race-${race.slug}`} value={race.slug}>
                      {race.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="organizer-race-toolbar-actions">
                <div className="panel-badge compact-badge">
                  <span>Ready checkpoints</span>
                  <strong>{checkpointAuditSummary.ready}</strong>
                  <span>{checkpointAuditSummary.attention + checkpointAuditSummary.blocked} still need work</span>
                </div>
              </div>
            </div>

            <div className="organizer-crew-summary">
              <div className="panel-badge compact-badge">
                <span>Covered checkpoints</span>
                <strong>{coveredCheckpointCount}</strong>
                <span>of {checkpointCoverage.length}</span>
              </div>
              <div className="panel-badge compact-badge">
                <span>Ready devices</span>
                <strong>{readyDeviceCrewCount}</strong>
                <span>of {scanCrewAssignments.length} scan crew</span>
              </div>
              <div className="panel-badge compact-badge">
                <span>Pending invites</span>
                <strong>{pendingInviteFieldCrew}</strong>
                <span>{activatableFieldCrew} ready to activate</span>
              </div>
              <div className="panel-badge compact-badge">
                <span>Missing devices</span>
                <strong>{missingDeviceFieldCrew}</strong>
                <span>{crewStatusSummary.active} active on course</span>
              </div>
            </div>

            <section className="organizer-subsection">
              <div className="organizer-subsection-head">
                <div>
                  <p className="section-label">Checkpoint ops board</p>
                  <h4>Coverage, acceptance, and device readiness</h4>
                </div>
              </div>

              <div className="organizer-checkpoint-ops-board">
                {checkpointAudit.map(({ checkpoint, assignedCrew, fieldCrew, acceptedFieldCrew, provisionedFieldCrew, blockers, level }) => {
                  const provisioning = checkpointProvisioning.find((item) => item.checkpoint.id === checkpoint.id);

                  return (
                    <article className={`organizer-checkpoint-ops-row ${level}`} key={`audit-${checkpoint.id}`}>
                      <div className="organizer-checkpoint-ops-main">
                        <div>
                          <strong>
                            {checkpoint.code} - {checkpoint.name}
                          </strong>
                          <p>{checkpoint.kmMarker.toFixed(1)} km marker</p>
                        </div>
                        <span className={`organizer-readiness-pill ${level === "ready" ? "ready" : "draft"}`}>
                          {level === "ready" ? "Ready" : level === "attention" ? "Attention" : "Blocked"}
                        </span>
                      </div>
                      <div className="organizer-checkpoint-ops-stats">
                        <span>{assignedCrew.length ? `${assignedCrew.length} crew assigned` : "No crew assigned"}</span>
                        <span>{fieldCrew.length ? `${acceptedFieldCrew.length}/${fieldCrew.length} scan crew accepted` : "No scan crew"}</span>
                        <span>{fieldCrew.length ? `${provisionedFieldCrew.length}/${fieldCrew.length} devices provisioned` : "No scan device provisioned yet"}</span>
                        <span>{provisioning?.ready ? "Checkpoint device ready" : "Checkpoint device pending"}</span>
                      </div>
                      <div className="organizer-checkpoint-ops-meta">
                        <small>
                          {assignedCrew.length
                            ? assignedCrew.map((crew) => `${crew.name} (${crew.status})`).join(", ")
                            : "No assignment yet"}
                        </small>
                        <div className="organizer-audit-tags">
                          {blockers.length ? (
                            blockers.map((blocker) => (
                              <span className={`organizer-audit-tag ${level}`} key={`${checkpoint.id}-${blocker}`}>
                                {blocker}
                              </span>
                            ))
                          ) : (
                            <span className="organizer-audit-tag ready">Crew and device flow complete</span>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="organizer-subsection">
              <div className="organizer-subsection-head">
                <div>
                  <p className="section-label">Crew roster</p>
                  <h4>Assign scan crew, invite, and activate devices</h4>
                </div>
              </div>

              <div className="organizer-crew-list">
                {crewAssignments.map((crew) => (
                  <article className="organizer-crew-row" key={crew.id}>
                <label className="organizer-field organizer-field-wide">
                  <span>Name</span>
                  <input value={crew.name} onChange={(event) => onCrewAssignmentChange(crew.id, { name: event.target.value })} />
                </label>
                <label className="organizer-field organizer-field-wide">
                  <span>Email</span>
                  <input value={crew.email} onChange={(event) => onCrewAssignmentChange(crew.id, { email: event.target.value })} />
                </label>
                <label className="organizer-field">
                  <span>Checkpoint</span>
                  <select value={crew.checkpointId} onChange={(event) => onCrewAssignmentChange(crew.id, { checkpointId: event.target.value })}>
                    {checkpoints.map((checkpoint) => (
                      <option key={`crew-checkpoint-${checkpoint.id}`} value={checkpoint.id}>
                        {checkpoint.code} - {checkpoint.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="organizer-field">
                  <span>Device label</span>
                  <input value={crew.deviceLabel} onChange={(event) => onCrewAssignmentChange(crew.id, { deviceLabel: event.target.value })} />
                </label>
                <label className="organizer-field">
                  <span>Status</span>
                  <select value={crew.status} onChange={(event) => onCrewAssignmentChange(crew.id, { status: event.target.value as OrganizerCrewAssignmentDraft["status"] })}>
                    <option value="invited">Invited</option>
                    <option value="accepted">Accepted</option>
                    <option value="active">Active</option>
                    <option value="standby">Standby</option>
                  </select>
                </label>
                <div className="organizer-crew-invite">
                  <span>Invite</span>
                  <strong>{crew.inviteCode}</strong>
                  <small>{`trailnesia://crew/invite/${crew.inviteCode}`}</small>
                  <div className="organizer-crew-workflow">
                    {crew.status === "invited" ? (
                      <button
                        className="toolbar-link organizer-secondary-action"
                        onClick={() => onCrewAssignmentChange(crew.id, { status: "accepted" })}
                        type="button"
                      >
                        Mark accepted
                      </button>
                    ) : null}
                    {crew.status === "accepted" && crew.deviceLabel.trim().length > 0 ? (
                      <button
                        className="toolbar-link organizer-secondary-action"
                        onClick={() => onCrewAssignmentChange(crew.id, { status: "active" })}
                        type="button"
                      >
                        Activate device
                      </button>
                    ) : null}
                    {crew.status === "accepted" && !crew.deviceLabel.trim().length ? (
                      <small className="organizer-crew-workflow-note">Add device label to activate this crew.</small>
                    ) : null}
                    {crew.status === "active" ? (
                      <button
                        className="toolbar-link organizer-secondary-action"
                        onClick={() => onCrewAssignmentChange(crew.id, { status: "standby" })}
                        type="button"
                      >
                        Set standby
                      </button>
                    ) : null}
                    {crew.status === "standby" && crew.deviceLabel.trim().length > 0 ? (
                      <button
                        className="toolbar-link organizer-secondary-action"
                        onClick={() => onCrewAssignmentChange(crew.id, { status: "active" })}
                        type="button"
                      >
                        Reactivate
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="organizer-checkpoint-actions">
                  <button className="toolbar-link organizer-secondary-action" onClick={() => onRegenerateCrewInvite(crew.id)} type="button">
                    Regenerate invite
                  </button>
                  <button className="toolbar-link organizer-remove-race" onClick={() => onRemoveCrewAssignment(crew.id)} type="button">
                    Remove
                  </button>
                </div>
                  </article>
                ))}
                {!crewAssignments.length ? <div className="empty-compact">No crew assigned yet for this race.</div> : null}
              </div>
            </section>

            <div className="organizer-step-actions">
              <button className="toolbar-link organizer-secondary-action" onClick={goToPreviousStep} type="button">
                Back to participants
              </button>
              <button className="toolbar-link organizer-secondary-action" onClick={goToNextStep} type="button">
                Continue to save draft & publish
              </button>
            </div>
          </div>
        </article>

        <article className="panel organizer-console-panel organizer-console-wide" hidden={activeView !== "participants"}>
          <div className="panel-head compact">
            <div>
              <p className="organizer-step-label">Step 3 of 5</p>
              <p className="section-label">Participant Import</p>
              <h3>Upload CSV or Excel roster</h3>
              <span className="organizer-inline-meta">Import participants for: {selectedRace?.title ?? "No race selected"}</span>
            </div>
          </div>

          <div className="organizer-participant-import-shell">
            <div className="organizer-import-toolbar">
              <div className="organizer-template-actions">
                <button className="toolbar-link organizer-secondary-action" onClick={() => downloadParticipantTemplate("csv")} type="button">
                  Download CSV template
                </button>
                <button className="toolbar-link organizer-secondary-action" onClick={() => downloadParticipantTemplate("xlsx")} type="button">
                  Download Excel template
                </button>
              </div>
              <div className="organizer-import-actions">
                <label className="toolbar-link organizer-file-trigger">
                  Upload CSV / Excel
                  <input
                    accept=".csv,.tsv,.txt,.xlsx,.xls"
                    hidden
                    onChange={onImportFileChange}
                    type="file"
                  />
                </label>
                <button className="toolbar-link organizer-secondary-action" disabled={!importText.trim().length} onClick={onClearImport} type="button">
                  Clear draft
                </button>
              </div>
            </div>

            <div className="organizer-import-status">
              <div className="panel-badge compact-badge">
                <span>Uploaded file</span>
                <strong>{importFileName ?? "No file yet"}</strong>
                <span>{importText.trim().length ? "parsed for preview" : "upload csv or excel"}</span>
              </div>
              <div className="panel-badge compact-badge">
                <span>Preview rows</span>
                <strong>{importPreview.totalRows}</strong>
                <span>entries</span>
              </div>
              <div className="panel-badge compact-badge">
                <span>Valid</span>
                <strong>{importPreview.validRows}</strong>
                <span>ready to apply</span>
              </div>
              <div className="panel-badge compact-badge">
                <span>Invalid</span>
                <strong>{importPreview.invalidRows}</strong>
                <span>rows skipped</span>
              </div>
              <div className="panel-badge compact-badge">
                <span>Duplicate BIB</span>
                <strong>{importPreview.duplicateBibs}</strong>
                <span>ignored in import</span>
              </div>
              <div className="panel-badge compact-badge">
                <span>Current roster</span>
                <strong>{selectedRace?.participants.length ?? 0}</strong>
                <span>participants in selected race</span>
              </div>
              <div className="panel-badge compact-badge">
                <span>New</span>
                <strong>{importImpact.newRows}</strong>
                <span>new bibs in file</span>
              </div>
              <div className="panel-badge compact-badge">
                <span>Updated</span>
                <strong>{importImpact.updatedRows}</strong>
                <span>existing bibs changed</span>
              </div>
              <div className="panel-badge compact-badge">
                <span>Unchanged</span>
                <strong>{importImpact.unchangedRows}</strong>
                <span>existing bibs identical</span>
              </div>
            </div>

            <div className="organizer-import-note">
              <strong>Template columns</strong>
              <p>Use exactly: <code>bib</code>, <code>name</code>, <code>gender</code>, <code>country</code>, <code>club</code>.</p>
              <p>This import applies only to the currently selected race.</p>
            </div>

            <div className="organizer-import-mode-shell">
              <div className="organizer-field">
                <label htmlFor="organizer-import-mode">Import mode</label>
                <select
                  id="organizer-import-mode"
                  onChange={(event) => onImportModeChange(event.target.value as OrganizerParticipantImportMode)}
                  value={importMode}
                >
                  <option value="merge">Add + update by BIB</option>
                  <option value="add">Add new only</option>
                  <option value="update">Update existing only</option>
                  <option value="replace">Replace all</option>
                </select>
              </div>
              <div className={`organizer-import-mode-summary ${importMode === "replace" ? "warning" : ""}`}>
                <strong>{importModeCopy[importMode].label}</strong>
                <p>{importModeCopy[importMode].description}</p>
                {importMode === "add" ? <span>Existing BIBs skipped: {importImpact.skippedExistingRows}</span> : null}
                {importMode === "update" ? <span>New BIBs skipped: {importImpact.skippedNewRows}</span> : null}
                {importMode === "replace" ? <span>This will overwrite the current roster for {selectedRace?.title ?? "the selected race"}.</span> : null}
              </div>
            </div>
          </div>

          <button className="toolbar-link organizer-apply-button" disabled={!importPreview.validRows} onClick={onApplyImport} type="button">
            {importModeCopy[importMode].applyLabel}
          </button>

          {importPreview.sampleErrors.length ? (
            <div className="organizer-import-errors">
              {importPreview.sampleErrors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          ) : null}

          {importPreview.columns.length ? (
            <div className="organizer-import-preview">
              <div className="organizer-import-head">
                {importPreview.previewColumns.map((column) => (
                  <strong key={column}>{column}</strong>
                ))}
              </div>
              {importPreview.rows.map((row, index) => (
                <div className="organizer-import-row" key={`import-row-${index}`}>
                  {importPreview.previewColumns.map((column, columnIndex) => (
                    <span key={`${column}-${columnIndex}`}>{row[columnIndex] ?? "-"}</span>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-compact">No import preview yet. Upload a participant file to review the draft.</div>
          )}

          <div className="organizer-step-actions">
            <button className="toolbar-link organizer-secondary-action" onClick={goToPreviousStep} type="button">
              Back to races & checkpoints
            </button>
            <button className="toolbar-link organizer-secondary-action" onClick={goToNextStep} type="button">
              Continue to crew & accounts
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}

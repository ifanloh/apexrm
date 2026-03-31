import { useState, type ChangeEvent } from "react";
import type { DemoCourseCheckpoint } from "./demoCourseVariants";
import type { OrganizerBrandingDraft, OrganizerCrewAssignmentDraft, OrganizerRaceDraft, ParticipantImportPreview } from "./organizerSetup";
import type { CheckpointLeaderboard, DuplicateScan, NotificationEvent } from "@arm/contracts";

type OrganizerConsoleProps = {
  profileLabel: string;
  branding: OrganizerBrandingDraft;
  races: OrganizerRaceDraft[];
  selectedRaceSlug: string;
  checkpoints: DemoCourseCheckpoint[];
  crewAssignments: OrganizerCrewAssignmentDraft[];
  leaderboards: CheckpointLeaderboard[];
  duplicates: DuplicateScan[];
  notifications: NotificationEvent[];
  liveModeLabel: string;
  opsUpdatedAt: string | null;
  importPreview: ParticipantImportPreview;
  importText: string;
  onBackToSpectator: () => void;
  onBrandingChange: (patch: Partial<OrganizerBrandingDraft>) => void;
  onRaceChange: (slug: string, patch: Partial<OrganizerRaceDraft>) => void;
  onAddRace: () => void;
  onRemoveRace: (slug: string) => void;
  onSelectRace: (slug: string) => void;
  onImportTextChange: (value: string) => void;
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
};

type OrganizerConsoleView = "overview" | "branding" | "races" | "crew" | "participants" | "operations";

export function OrganizerConsole({
  profileLabel,
  branding,
  races,
  selectedRaceSlug,
  checkpoints,
  crewAssignments,
  leaderboards,
  duplicates,
  notifications,
  liveModeLabel,
  opsUpdatedAt,
  importPreview,
  importText,
  onBackToSpectator,
  onBrandingChange,
  onRaceChange,
  onAddRace,
  onRemoveRace,
  onSelectRace,
  onImportTextChange,
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
  onGpxChange
}: OrganizerConsoleProps) {
  const [activeView, setActiveView] = useState<OrganizerConsoleView>("overview");
  const selectedRace = races.find((race) => race.slug === selectedRaceSlug) ?? null;
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
  const fieldCrewAssignments = crewAssignments.filter((crew) => crew.role === "lead" || crew.role === "scan");
  const pendingInviteFieldCrew = fieldCrewAssignments.filter((crew) => crew.status === "invited").length;
  const missingDeviceFieldCrew = fieldCrewAssignments.filter((crew) => !crew.deviceLabel.trim().length).length;
  const activatableFieldCrew = fieldCrewAssignments.filter((crew) => crew.status === "accepted" && crew.deviceLabel.trim().length > 0).length;
  const provisionedCrewCount = fieldCrewAssignments.filter((crew) => crew.deviceLabel.trim().length > 0).length;
  const readyDeviceCrewCount = fieldCrewAssignments.filter(
    (crew) => crew.deviceLabel.trim().length > 0 && (crew.status === "accepted" || crew.status === "active")
  ).length;
  const checkpointProvisioning = checkpoints.map((checkpoint) => {
    const assignedFieldCrew = fieldCrewAssignments.filter((crew) => crew.checkpointId === checkpoint.id);
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
    const fieldCrew = assignedCrew.filter((crew) => crew.role === "lead" || crew.role === "scan");
    const acceptedFieldCrew = fieldCrew.filter((crew) => crew.status === "accepted" || crew.status === "active");
    const provisionedFieldCrew = fieldCrew.filter((crew) => crew.deviceLabel.trim().length > 0);
    const blockers: string[] = [];

    if (assignedCrew.length === 0) {
      blockers.push("No crew assigned");
    }

    if (fieldCrew.length === 0) {
      blockers.push("No lead/scan crew");
    }

    if (fieldCrew.length > 0 && acceptedFieldCrew.length < fieldCrew.length) {
      blockers.push("Field crew not accepted");
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
    const fieldCrew = race.crewAssignments.filter((crew) => crew.role === "lead" || crew.role === "scan");
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
        label: "Field crew accepted",
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

  function handleInspectRace(slug: string) {
    onSelectRace(slug);
    setActiveView("races");
  }

  return (
    <section className="organizer-console-shell" id="organizer-console">
      <div className="organizer-console-header">
        <div>
          <p className="section-label">Organizer Platform</p>
          <h2>Event Setup Console</h2>
          <p className="organizer-console-copy">
            Setup branding, event logo, course asset draft, race categories, checkpoints, and participant import for the current edition.
          </p>
          <p className="organizer-console-meta">Signed in as {profileLabel}</p>
        </div>
        <div className="organizer-console-actions">
          <button className="toolbar-link organizer-console-back" onClick={onBackToSpectator} type="button">
            Back to spectator
          </button>
        </div>
      </div>

      <nav aria-label="Organizer console sections" className="organizer-console-nav">
        <button className={`organizer-console-nav-button ${activeView === "overview" ? "active" : ""}`} onClick={() => setActiveView("overview")} type="button">
          Overview
        </button>
        <button className={`organizer-console-nav-button ${activeView === "branding" ? "active" : ""}`} onClick={() => setActiveView("branding")} type="button">
          Branding
        </button>
        <button className={`organizer-console-nav-button ${activeView === "races" ? "active" : ""}`} onClick={() => setActiveView("races")} type="button">
          Races & Checkpoints
        </button>
        <button className={`organizer-console-nav-button ${activeView === "crew" ? "active" : ""}`} onClick={() => setActiveView("crew")} type="button">
          Crew & Devices
        </button>
        <button className={`organizer-console-nav-button ${activeView === "participants" ? "active" : ""}`} onClick={() => setActiveView("participants")} type="button">
          Participants
        </button>
        <button className={`organizer-console-nav-button ${activeView === "operations" ? "active" : ""}`} onClick={() => setActiveView("operations")} type="button">
          Race Day Ops
        </button>
      </nav>

      <div className="organizer-console-grid">
        <article className="panel organizer-console-panel organizer-console-wide" hidden={activeView !== "overview"}>
          <div className="panel-head compact">
            <div>
              <p className="section-label">Launch Summary</p>
              <h3>Edition go-live status</h3>
            </div>
            <span className={`organizer-readiness-pill ${blockedRaceReadiness.length === 0 && publishedRaceCount > 0 ? "ready" : "draft"}`}>
              {launchSummaryLabel}
            </span>
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
              <h3>Event hero, logo & selected race GPX</h3>
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

            <div className="organizer-gpx-draft">
              <strong>{selectedRace ? `Course file for ${selectedRace.title}` : "Course file draft"}</strong>
              <p>
                {selectedRace?.gpxFileName
                  ? `${selectedRace.gpxFileName} (${Math.round((selectedRace.gpxFileSize ?? 0) / 1024)} KB)`
                  : "No GPX uploaded yet for the selected race."}
              </p>
              <label className="toolbar-link organizer-file-trigger">
                Upload GPX for selected race
                <input accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden onChange={onGpxChange} type="file" />
              </label>
            </div>
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
              <p className="section-label">Race Categories</p>
              <h3>Edition race setup</h3>
            </div>
            <button className="toolbar-link organizer-apply-button" onClick={onAddRace} type="button">
              Add race category
            </button>
          </div>

          <div className="organizer-race-grid">
            {races.map((race) => (
              <article className="organizer-race-card" key={race.slug}>
                <div className="organizer-race-card-head">
                  <strong>{race.title}</strong>
                  <div className="organizer-race-card-actions">
                    <span className={`organizer-status-pill ${race.editionLabel.toLowerCase() === "live" ? "live" : "finished"}`}>{race.editionLabel}</span>
                    <span className={`organizer-status-pill ${race.isPublished ? "published" : "draft"}`}>{race.isPublished ? "Published" : "Draft"}</span>
                    <button className="toolbar-link organizer-remove-race" onClick={() => onRemoveRace(race.slug)} type="button">
                      Remove
                    </button>
                  </div>
                </div>

                <div className="organizer-form-grid compact">
                  <label className="organizer-field organizer-field-wide">
                    <span>Race title</span>
                    <input value={race.title} onChange={(event) => onRaceChange(race.slug, { title: event.target.value })} />
                  </label>
                  <label className="organizer-field">
                    <span>Status</span>
                    <select value={race.editionLabel} onChange={(event) => onRaceChange(race.slug, { editionLabel: event.target.value })}>
                      <option value="Live">Live</option>
                      <option value="Finished">Finished</option>
                    </select>
                  </label>
                  <label className="organizer-field">
                    <span>Schedule</span>
                    <input value={race.scheduleLabel} onChange={(event) => onRaceChange(race.slug, { scheduleLabel: event.target.value })} />
                  </label>
                  <label className="organizer-field">
                    <span>Start ISO time</span>
                    <input value={race.startAt} onChange={(event) => onRaceChange(race.slug, { startAt: event.target.value })} />
                  </label>
                  <label className="organizer-field">
                    <span>Start town</span>
                    <input value={race.startTown} onChange={(event) => onRaceChange(race.slug, { startTown: event.target.value })} />
                  </label>
                  <label className="organizer-field">
                    <span>Distance (km)</span>
                    <input
                      type="number"
                      value={race.distanceKm}
                      onChange={(event) => onRaceChange(race.slug, { distanceKm: Number(event.target.value) || 0 })}
                    />
                  </label>
                  <label className="organizer-field">
                    <span>Ascent (m+)</span>
                    <input
                      type="number"
                      value={race.ascentM}
                      onChange={(event) => onRaceChange(race.slug, { ascentM: Number(event.target.value) || 0 })}
                    />
                  </label>
                  <label className="organizer-field organizer-field-wide">
                    <span>Course description</span>
                    <textarea
                      rows={3}
                      value={race.courseDescription}
                      onChange={(event) => onRaceChange(race.slug, { courseDescription: event.target.value })}
                    />
                  </label>
                  <label className="organizer-field organizer-field-wide">
                    <span>Course highlights</span>
                    <input
                      value={race.courseHighlights.join(", ")}
                      onChange={(event) =>
                        onRaceChange(race.slug, {
                          courseHighlights: event.target.value
                            .split(",")
                            .map((value) => value.trim())
                            .filter(Boolean)
                        })
                      }
                    />
                  </label>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="panel organizer-console-panel organizer-console-wide" hidden={activeView !== "races"}>
          <div className="panel-head compact">
            <div>
              <p className="section-label">Checkpoints</p>
              <h3>Checkpoint setup</h3>
            </div>
            <button className="toolbar-link organizer-apply-button" onClick={onAddCheckpoint} type="button">
              Add checkpoint
            </button>
          </div>

          <label className="organizer-field">
            <span>Inspect race</span>
            <select onChange={(event) => onSelectRace(event.target.value)} value={selectedRaceSlug}>
              {races.map((race) => (
                <option key={race.slug} value={race.slug}>
                  {race.title}
                </option>
              ))}
            </select>
          </label>

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
        </article>

        <article className="panel organizer-console-panel organizer-console-wide" hidden={activeView !== "crew"}>
          <div className="panel-head compact">
            <div>
              <p className="section-label">Crew</p>
              <h3>Crew assignment</h3>
            </div>
            <button className="toolbar-link organizer-apply-button" onClick={onAddCrewAssignment} type="button">
              Add crew
            </button>
          </div>

          <label className="organizer-field">
            <span>Inspect race</span>
            <select onChange={(event) => onSelectRace(event.target.value)} value={selectedRaceSlug}>
              {races.map((race) => (
                <option key={`crew-race-${race.slug}`} value={race.slug}>
                  {race.title}
                </option>
              ))}
            </select>
          </label>

          <div className="organizer-coverage-summary">
            <div className="panel-badge compact-badge">
              <span>Covered checkpoints</span>
              <strong>{coveredCheckpointCount}</strong>
              <span>of {checkpointCoverage.length}</span>
            </div>
            <div className="panel-badge compact-badge">
              <span>Uncovered checkpoints</span>
              <strong>{uncoveredCheckpointCount}</strong>
              <span>need assignment</span>
            </div>
            <div className="panel-badge compact-badge">
              <span>Active crew</span>
              <strong>{crewStatusSummary.active}</strong>
              <span>ready on device</span>
            </div>
            <div className="panel-badge compact-badge">
              <span>Accepted</span>
              <strong>{crewStatusSummary.accepted}</strong>
              <span>confirmed crew</span>
            </div>
            <div className="panel-badge compact-badge">
              <span>Invited / standby</span>
              <strong>{crewStatusSummary.invited + crewStatusSummary.standby}</strong>
              <span>pending acceptance</span>
            </div>
          </div>

          <div className="organizer-coverage-list">
            {checkpointCoverage.map(({ checkpoint, assignedCrew, covered }) => (
              <article className={`organizer-coverage-row ${covered ? "covered" : "uncovered"}`} key={`coverage-${checkpoint.id}`}>
                <div>
                  <strong>
                    {checkpoint.code} - {checkpoint.name}
                  </strong>
                  <p>{checkpoint.kmMarker.toFixed(1)} km marker</p>
                </div>
                <div className="organizer-coverage-meta">
                  <span className={`organizer-readiness-pill ${covered ? "ready" : "draft"}`}>{covered ? "Covered" : "Uncovered"}</span>
                  <small>
                    {assignedCrew.length
                      ? assignedCrew.map((crew) => `${crew.name} (${crew.role}, ${crew.status})`).join(", ")
                      : "No crew assigned yet"}
                  </small>
                </div>
              </article>
            ))}
          </div>

          <div className="panel-head compact organizer-subpanel-head">
            <div>
              <p className="section-label">Provisioning</p>
              <h3>Scanner device readiness</h3>
            </div>
          </div>

          <div className="organizer-provisioning-summary">
            <div className="panel-badge compact-badge">
              <span>Field crew</span>
              <strong>{fieldCrewAssignments.length}</strong>
              <span>lead + scan roles</span>
            </div>
            <div className="panel-badge compact-badge">
              <span>Devices assigned</span>
              <strong>{provisionedCrewCount}</strong>
              <span>{fieldCrewAssignments.length - provisionedCrewCount} missing</span>
            </div>
            <div className="panel-badge compact-badge">
              <span>Ready devices</span>
              <strong>{readyDeviceCrewCount}</strong>
              <span>accepted or active</span>
            </div>
            <div className="panel-badge compact-badge">
              <span>Ready checkpoints</span>
              <strong>{readyCheckpointProvisionCount}</strong>
              <span>of {checkpointProvisioning.length}</span>
            </div>
            <div className="panel-badge compact-badge">
              <span>Pending invites</span>
              <strong>{pendingInviteFieldCrew}</strong>
              <span>awaiting acceptance</span>
            </div>
            <div className="panel-badge compact-badge">
              <span>Missing devices</span>
              <strong>{missingDeviceFieldCrew}</strong>
              <span>need provisioning</span>
            </div>
            <div className="panel-badge compact-badge">
              <span>Ready to activate</span>
              <strong>{activatableFieldCrew}</strong>
              <span>accepted + provisioned</span>
            </div>
          </div>

          <div className="organizer-provisioning-list">
            {checkpointProvisioning.map(({ checkpoint, assignedFieldCrew, readyAssignedCrew, ready }) => (
              <article className={`organizer-provisioning-row ${ready ? "ready" : "pending"}`} key={`provisioning-${checkpoint.id}`}>
                <div>
                  <strong>
                    {checkpoint.code} - {checkpoint.name}
                  </strong>
                  <p>{checkpoint.kmMarker.toFixed(1)} km marker</p>
                </div>
                <div className="organizer-provisioning-meta">
                  <span className={`organizer-readiness-pill ${ready ? "ready" : "draft"}`}>{ready ? "Device ready" : "Pending device"}</span>
                  <small>
                    {assignedFieldCrew.length
                      ? assignedFieldCrew
                          .map((crew) => `${crew.name} - ${crew.deviceLabel || "No device"} (${crew.status})`)
                          .join(", ")
                      : "No lead/scan crew assigned"}
                  </small>
                  {readyAssignedCrew.length ? (
                    <div className="organizer-provisioning-tags">
                      {readyAssignedCrew.map((crew) => (
                        <span className="organizer-provisioning-tag" key={`${checkpoint.id}-${crew.id}`}>
                          {crew.deviceLabel}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>

          <div className="panel-head compact organizer-subpanel-head">
            <div>
              <p className="section-label">Checkpoint Audit</p>
              <h3>Crew and device readiness by checkpoint</h3>
            </div>
          </div>

          <div className="organizer-audit-summary">
            <div className="panel-badge compact-badge">
              <span>Ready checkpoints</span>
              <strong>{checkpointAuditSummary.ready}</strong>
              <span>fully operational</span>
            </div>
            <div className="panel-badge compact-badge">
              <span>Need attention</span>
              <strong>{checkpointAuditSummary.attention}</strong>
              <span>crew or device gap</span>
            </div>
            <div className="panel-badge compact-badge">
              <span>Blocked</span>
              <strong>{checkpointAuditSummary.blocked}</strong>
              <span>cannot open yet</span>
            </div>
          </div>

          <div className="organizer-audit-list">
            {checkpointAudit.map(({ checkpoint, assignedCrew, fieldCrew, acceptedFieldCrew, provisionedFieldCrew, blockers, level }) => (
              <article className={`organizer-audit-row ${level}`} key={`audit-${checkpoint.id}`}>
                <div>
                  <strong>
                    {checkpoint.code} - {checkpoint.name}
                  </strong>
                  <p>{checkpoint.kmMarker.toFixed(1)} km marker</p>
                </div>
                <div className="organizer-audit-meta">
                  <span className={`organizer-readiness-pill ${level === "ready" ? "ready" : "draft"}`}>
                    {level === "ready" ? "Ready" : level === "attention" ? "Attention" : "Blocked"}
                  </span>
                  <small>
                    {assignedCrew.length
                      ? `${assignedCrew.length} crew | ${acceptedFieldCrew.length}/${fieldCrew.length || 0} accepted | ${provisionedFieldCrew.length}/${fieldCrew.length || 0} provisioned`
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
            ))}
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
                  <span>Role</span>
                  <select value={crew.role} onChange={(event) => onCrewAssignmentChange(crew.id, { role: event.target.value as OrganizerCrewAssignmentDraft["role"] })}>
                    <option value="lead">Lead</option>
                    <option value="scan">Scan</option>
                    <option value="support">Support</option>
                  </select>
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
        </article>

        <article className="panel organizer-console-panel organizer-console-wide" hidden={activeView !== "participants"}>
          <div className="panel-head compact">
            <div>
              <p className="section-label">Participant Import</p>
              <h3>CSV draft preview</h3>
            </div>
          </div>

          <label className="organizer-field organizer-field-wide">
            <span>Paste CSV/TSV rows</span>
            <textarea
              rows={8}
              placeholder={"bib,name,gender,country,club\nM116,Arif Nugroho,men,ID,Tropic Alpine Club"}
              value={importText}
              onChange={(event) => onImportTextChange(event.target.value)}
            />
          </label>

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
            <span>Applied to race</span>
            <strong>{selectedRace?.participants.length ?? 0}</strong>
            <span>participants</span>
          </div>

          <button className="toolbar-link organizer-apply-button" onClick={onApplyImport} type="button">
            Apply valid rows to selected race
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
            <div className="empty-compact">No import preview yet. Paste participant rows to review the draft.</div>
          )}
        </article>
      </div>
    </section>
  );
}

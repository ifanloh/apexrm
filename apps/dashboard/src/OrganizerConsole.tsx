import type { ChangeEvent } from "react";
import type { DemoCourseCheckpoint } from "./demoCourseVariants";
import type { OrganizerBrandingDraft, OrganizerCrewAssignmentDraft, OrganizerRaceDraft, ParticipantImportPreview } from "./organizerSetup";

type OrganizerConsoleProps = {
  profileLabel: string;
  branding: OrganizerBrandingDraft;
  races: OrganizerRaceDraft[];
  selectedRaceSlug: string;
  checkpoints: DemoCourseCheckpoint[];
  crewAssignments: OrganizerCrewAssignmentDraft[];
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
  onEventLogoChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onHeroBackgroundChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onGpxChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function OrganizerConsole({
  profileLabel,
  branding,
  races,
  selectedRaceSlug,
  checkpoints,
  crewAssignments,
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
  onEventLogoChange,
  onHeroBackgroundChange,
  onGpxChange
}: OrganizerConsoleProps) {
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
  const crewStatusSummary = {
    active: crewAssignments.filter((crew) => crew.status === "active").length,
    standby: crewAssignments.filter((crew) => crew.status === "standby").length,
    invited: crewAssignments.filter((crew) => crew.status === "invited").length
  };
  const raceReadiness = races.map((race) => {
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

  return (
    <section className="organizer-console-shell" id="organizer-console">
      <div className="organizer-console-header">
        <div>
          <p className="section-label">Organizer Platform</p>
          <h2>Event Setup Console</h2>
          <p className="organizer-console-copy">
            Setup branding, event logo, course asset draft, race categories, checkpoints, and participant import for the current edition.
          </p>
        </div>
        <div className="organizer-console-actions">
          <div className="panel-badge">
            <span>Signed in as</span>
            <strong>{profileLabel}</strong>
          </div>
          <button className="toolbar-link organizer-console-back" onClick={onBackToSpectator} type="button">
            Back to spectator
          </button>
        </div>
      </div>

      <div className="organizer-console-grid">
        <article className="panel organizer-console-panel">
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

        <article className="panel organizer-console-panel">
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

        <article className="panel organizer-console-panel organizer-console-wide">
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

        <article className="panel organizer-console-panel organizer-console-wide">
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

        <article className="panel organizer-console-panel">
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

        <article className="panel organizer-console-panel">
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
              <span>Invited / standby</span>
              <strong>{crewStatusSummary.invited + crewStatusSummary.standby}</strong>
              <span>pending readiness</span>
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
                      ? assignedCrew.map((crew) => `${crew.name} (${crew.role})`).join(", ")
                      : "No crew assigned yet"}
                  </small>
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
                    <option value="active">Active</option>
                    <option value="standby">Standby</option>
                  </select>
                </label>
                <div className="organizer-checkpoint-actions">
                  <button className="toolbar-link organizer-remove-race" onClick={() => onRemoveCrewAssignment(crew.id)} type="button">
                    Remove
                  </button>
                </div>
              </article>
            ))}
            {!crewAssignments.length ? <div className="empty-compact">No crew assigned yet for this race.</div> : null}
          </div>
        </article>

        <article className="panel organizer-console-panel">
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

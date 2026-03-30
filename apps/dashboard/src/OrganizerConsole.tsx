import type { ChangeEvent } from "react";
import type { DemoCourseCheckpoint } from "./demoCourseVariants";
import type { OrganizerBrandingDraft, OrganizerRaceDraft, ParticipantImportPreview } from "./organizerSetup";

type OrganizerConsoleProps = {
  profileLabel: string;
  branding: OrganizerBrandingDraft;
  races: OrganizerRaceDraft[];
  selectedRaceSlug: string;
  checkpoints: DemoCourseCheckpoint[];
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
  onCheckpointChange: (checkpointId: string, patch: Partial<DemoCourseCheckpoint>) => void;
  onEventLogoChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onGpxChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function OrganizerConsole({
  profileLabel,
  branding,
  races,
  selectedRaceSlug,
  checkpoints,
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
  onCheckpointChange,
  onEventLogoChange,
  onGpxChange
}: OrganizerConsoleProps) {
  const selectedRace = races.find((race) => race.slug === selectedRaceSlug) ?? null;

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
              <h3>Event logo & GPX draft</h3>
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

            <div className="organizer-gpx-draft">
              <strong>Course file draft</strong>
              <p>{branding.gpxFileName ? `${branding.gpxFileName} (${Math.round((branding.gpxFileSize ?? 0) / 1024)} KB)` : "No GPX uploaded yet."}</p>
              <label className="toolbar-link organizer-file-trigger">
                Upload GPX draft
                <input accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden onChange={onGpxChange} type="file" />
              </label>
            </div>
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
                  <input
                    type="number"
                    value={checkpoint.order}
                    onChange={(event) => onCheckpointChange(checkpoint.id, { order: Number(event.target.value) || 0 })}
                  />
                </label>
              </article>
            ))}
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
            <span>Applied to race</span>
            <strong>{selectedRace?.participants.length ?? 0}</strong>
            <span>participants</span>
          </div>

          <button className="toolbar-link organizer-apply-button" onClick={onApplyImport} type="button">
            Apply import to selected race
          </button>

          {importPreview.columns.length ? (
            <div className="organizer-import-preview">
              <div className="organizer-import-head">
                {importPreview.columns.map((column) => (
                  <strong key={column}>{column}</strong>
                ))}
              </div>
              {importPreview.rows.map((row, index) => (
                <div className="organizer-import-row" key={`import-row-${index}`}>
                  {importPreview.columns.map((column, columnIndex) => (
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

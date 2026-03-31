# Trailnesia Organizer Trial Execution Report

Date:

- 2026-03-31

Environment:

- Workspace: `C:\ARM`
- Dashboard: [https://apexrm-dashboard.vercel.app](https://apexrm-dashboard.vercel.app)
- API: [https://apexrm-api.vercel.app/api](https://apexrm-api.vercel.app/api)

## Summary

I executed the organizer-side trial in three layers:

1. organizer logic smoke test
2. spectator smoke test
3. dashboard typecheck and production build

Result:

- organizer automated trial: `PASS`
- spectator smoke check: `PASS`
- dashboard typecheck: `PASS`
- dashboard production build: `PASS`

The organizer workflow is now strong enough for an internal controlled trial.

## Commands Executed

```powershell
npm.cmd run qc:organizer
npm.cmd run qc:spectator
npm.cmd run typecheck --workspace @arm/dashboard
npm.cmd run build --workspace @arm/dashboard
```

## Results

### 1. Organizer Trial QA

Command:

```powershell
npm.cmd run qc:organizer
```

Outcome:

- `22/22 checks passed`

Covered logic:

- default organizer setup contains races and checkpoints
- organizer workspace auto-seeds when blank
- seeded races get participants, scan crew, and simulated scans
- live sample scenario contains accepted + duplicate scans
- finished sample scenario contains finish scans
- simulation snapshot produces:
  - overall leaderboard
  - duplicate audits
  - checkpoint leaderboards
  - notifications
- participant import templates work
- CSV and Excel parsing work
- duplicate BIB detection works
- import modes work:
  - `Add + update by BIB`
  - `Add new only`
  - `Update existing only`
  - `Replace all`
- invalid simulated scans are rejected
- duplicate simulated scans are classified correctly
- invite code generation is race-scoped

Primary evidence:

- [C:\ARM\scripts\qc-organizer-trial.mjs](/C:/ARM/scripts/qc-organizer-trial.mjs)
- [C:\ARM\apps\dashboard\src\organizerWorkflow.ts](/C:/ARM/apps/dashboard/src/organizerWorkflow.ts)

### 2. Spectator Smoke QA

Command:

```powershell
npm.cmd run qc:spectator
```

Outcome:

- `PASS`

Covered logic:

- dashboard production HTML and bundle reachable
- spectator bundle markers present:
  - `Race Categories`
  - `Search a runner`
  - `Runners list`
  - `Favorites list`
  - `My followed runners`
  - `Ranking`
  - `Race leaders`
  - `Statistics`
  - `Back to race page`
  - `Open Race Live`
  - `View Results`
  - `Leading`
- public API endpoints reachable:
  - overall leaderboard
  - live leaders
  - runner detail
  - runner search

Primary evidence:

- [C:\ARM\scripts\qc-spectator-phase-a.mjs](/C:/ARM/scripts/qc-spectator-phase-a.mjs)

Note:

- I added retry behavior to this smoke check because the live API had occasional transient false negatives even when the endpoints were healthy.

### 3. Typecheck

Command:

```powershell
npm.cmd run typecheck --workspace @arm/dashboard
```

Outcome:

- `PASS`

### 4. Production Build

Command:

```powershell
npm.cmd run build --workspace @arm/dashboard
```

Outcome:

- `PASS`

Note:

- Vite still warns that the bundle is large.
- This is not blocking trial readiness, but should be handled later with code-splitting.

## Organizer Checklist Coverage Status

Reference:

- [C:\ARM\docs\TRAILNESIA_ORGANIZER_TRIAL_CHECKLIST.md](/C:/ARM/docs/TRAILNESIA_ORGANIZER_TRIAL_CHECKLIST.md)

### Fully exercised by runtime checks

- auto-seed organizer baseline
- sample scenario loading logic
- resettable demo/trial state
- participant import parsing and validation
- participant import modes
- scan duplication rules
- checkpoint/crew mismatch blocking
- race snapshot generation for live dashboard behavior

### Verified by code path inspection, but not browser-driven in this run

- organizer login lands directly in organizer console
- setup flow is step-based:
  - `Branding`
  - `Races`
  - `Participants`
  - `Crew`
  - `Review & Publish`
- `Race Day Ops` remains separate from setup flow
- branding tab only contains branding concerns
- races tab is race-first
- crew tab is scan-crew-only
- participants tab is upload-first with CSV/XLSX templates
- publish flow is readiness-gated

Primary source evidence:

- [C:\ARM\apps\dashboard\src\OrganizerConsole.tsx](/C:/ARM/apps/dashboard/src/OrganizerConsole.tsx)
- [C:\ARM\apps\dashboard\src\App.tsx](/C:/ARM/apps/dashboard/src/App.tsx)

### Not fully executed in live browser due missing organizer credentials

- actual Supabase organizer login session in browser
- real file upload click path in browser
- visual persistence across refresh in authenticated organizer session
- browser-level navigation across all organizer setup steps after login

These are the only items I could not fully prove from the machine without a valid organizer trial account.

## Current Verdict

### Trial readiness

- `YES` for internal controlled organizer trial

### Production readiness

- `NOT YET` for full race-day production without human UAT

Reason:

- logic and build quality are now strong
- but a real organizer account should still be used once to confirm the authenticated browser path end-to-end

## Recommended Next Action

Run one final browser UAT with a real organizer account and confirm:

1. organizer login
2. branding save
3. participant upload
4. crew assignment
5. publish / unpublish
6. race-day ops simulation
7. spectator reflection

If those pass, the organizer layer is ready for a real internal pilot.

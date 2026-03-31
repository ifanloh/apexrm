# Trailnesia Organizer Trial Checklist

## Purpose

This checklist is for a controlled organizer-side trial of Trailnesia.

It verifies the end-to-end flow for:

- organizer onboarding
- event branding
- race and checkpoint setup
- participant import
- crew and device assignment
- publish workflow
- race-day simulation
- spectator response to organizer actions

Use this together with:

- [C:\ARM\docs\TRAILNESIA_PRODUCT_BLUEPRINT.md](/C:/ARM/docs/TRAILNESIA_PRODUCT_BLUEPRINT.md)
- [C:\ARM\docs\TRAILNESIA_PHASE_A_MANUAL_VERIFICATION.md](/C:/ARM/docs/TRAILNESIA_PHASE_A_MANUAL_VERIFICATION.md)

Primary environments:

- Dashboard: [https://apexrm-dashboard.vercel.app](https://apexrm-dashboard.vercel.app)
- API: [https://apexrm-api.vercel.app/api](https://apexrm-api.vercel.app/api)

## Trial Scope

Recommended trial scale:

- 1 event edition
- 2 race categories minimum
- 20 to 50 participants per category
- 3 to 5 checkpoints per category
- 1 scan crew per checkpoint

Current demo baseline in the app:

- organizer setup auto-seeds trial data if the organizer workspace is blank
- `Race Day Ops` includes:
  - `Record trial scan`
  - `Simulate checkpoint wave`
  - `Inject duplicate`
  - `Load sample scenario`
  - `Reset demo event`

## Global Pass Criteria

The organizer trial passes when:

- setup flow is understandable step by step
- draft data can be saved without publishing
- published races appear to spectators
- draft races do not appear to spectators
- participant import behaves correctly for each import mode
- checkpoint coverage and device readiness are visible
- race-day simulation updates organizer and spectator views consistently
- duplicate scans are detected and surfaced
- no organizer section feels blocked by unrelated panels or hidden state leaks

## Pre-Trial Preparation

### 1. Access

Steps:

1. Open dashboard.
2. Log in as organizer.
3. Wait for the organizer workspace to load.

Expected:

- organizer lands directly in `Organizer Console`
- organizer does not land in spectator mode first
- if workspace is blank, demo seed/trial baseline is prepared automatically

### 2. Initial shell

Steps:

1. Inspect the organizer console at 100% browser zoom.
2. Switch between setup steps.

Expected:

- the layout is readable at normal zoom
- no black/dark legacy panel artifacts appear
- the step-by-step flow is understandable:
  - `Branding`
  - `Races`
  - `Participants`
  - `Crew`
  - `Review & Publish`
- `Race Day Ops` feels separate from setup

## Step 1: Branding

### 3. Branding draft save

Steps:

1. Edit organizer name.
2. Edit event brand name and edition label.
3. Edit hero copy.
4. Navigate away and return.

Expected:

- changes persist as draft
- nothing is forced to publish
- no spectator-facing changes appear unless relevant race is already published

### 4. Event logo upload

Steps:

1. Upload an event logo.
2. Inspect header placeholder and branding preview.

Expected:

- uploaded logo replaces the event-logo placeholder
- preview is visible and not cropped
- logo persists after navigation/refresh

### 5. Hero background upload

Steps:

1. Upload a hero background image.
2. Return to spectator event home.

Expected:

- event home hero uses the uploaded image
- if image exists, it overrides the fallback gradient hero

## Step 2: Races & Checkpoints

### 6. Race selection workflow

Steps:

1. Open `Races`.
2. Change `Selected race`.
3. Inspect the currently editable form.

Expected:

- only one race is actively edited at a time
- fields shown belong to the selected race
- the workflow feels race-first, not panel-first

### 7. Add new race category

Steps:

1. Click `Add race`.
2. Fill title, schedule, start town, distance, ascent.
3. Save draft.

Expected:

- new race is created in `Draft`
- spectator does not see it yet
- readiness for that race is initially incomplete

### 8. Remove race category

Steps:

1. Select a non-essential draft race.
2. Remove it.

Expected:

- selected draft race is removed cleanly
- no unrelated race is affected

### 9. GPX upload for selected race

Steps:

1. Select one race.
2. Upload GPX.
3. Inspect race detail preview.

Expected:

- GPX binds only to the selected race
- course map, profile, distance, and ascent update for that race
- other races remain unchanged

### 10. Checkpoint editing

Steps:

1. Add a checkpoint.
2. Edit checkpoint name/code/km marker.
3. Remove a non-terminal checkpoint.

Expected:

- checkpoints remain sorted by km marker/order
- start/finish remain protected
- selected race readiness updates accordingly

## Step 3: Participants

### 11. Download templates

Steps:

1. Open `Participants`.
2. Download CSV template.
3. Download Excel template.

Expected:

- both files download successfully
- headers match:
  - `bib`
  - `name`
  - `gender`
  - `country`
  - `club`

### 12. Upload CSV roster

Steps:

1. Upload a valid CSV.
2. Review preview.

Expected:

- uploaded file name is shown
- preview rows appear
- valid/invalid/duplicate counts are shown
- current roster impact is visible

### 13. Upload Excel roster

Steps:

1. Upload a valid `.xlsx`.
2. Review preview.

Expected:

- Excel file is parsed correctly
- preview and counts behave the same as CSV

### 14. Import mode: Add + update by BIB

Steps:

1. Prepare file with:
   - one new BIB
   - one existing BIB with updated fields
   - one unchanged BIB
2. Select `Add + update by BIB`.
3. Apply.

Expected:

- new runner is added
- existing runner is updated
- unchanged runner remains unchanged

### 15. Import mode: Add new only

Steps:

1. Use a file with existing and new BIBs.
2. Select `Add new only`.
3. Apply.

Expected:

- only new BIBs are added
- existing BIBs are skipped

### 16. Import mode: Update existing only

Steps:

1. Use a file with existing and new BIBs.
2. Select `Update existing only`.
3. Apply.

Expected:

- only existing BIBs are updated
- new BIBs are skipped

### 17. Import mode: Replace all

Steps:

1. Use a new file with a smaller roster.
2. Select `Replace all`.
3. Apply.

Expected:

- selected race roster is replaced entirely
- organizer is clearly informed this is destructive for the selected race only

### 18. Import validation

Steps:

1. Upload file with missing required columns.
2. Upload file with duplicate BIBs.
3. Upload file with blank rows.

Expected:

- invalid file structure is rejected or flagged
- duplicate BIBs are reported
- blank rows do not create phantom participants

## Step 4: Crew & Devices

### 19. Add scan crew

Steps:

1. Open `Crew`.
2. Add one crew.
3. Fill name, email, checkpoint, device label, and status.

Expected:

- crew appears in the selected race roster
- only `scan crew` terminology is used

### 20. Checkpoint ops board

Steps:

1. Inspect `Checkpoint ops board`.
2. Compare one covered and one uncovered checkpoint.

Expected:

- each checkpoint shows:
  - assigned crew
  - accepted/active state
  - provisioned device state
  - `Ready`, `Attention`, or `Blocked`

### 21. Invite workflow

Steps:

1. Add a new crew with status `Invited`.
2. Regenerate invite.
3. Mark accepted.
4. Activate device.

Expected:

- invite code exists
- regenerate changes invite token/code
- accepted crew can become active if device exists
- no unsupported role concept appears

### 22. Coverage summary

Steps:

1. Inspect crew summary cards.
2. Compare to actual checkpoint assignments.

Expected:

- covered checkpoints count is correct
- ready devices count is correct
- pending invites count is correct
- missing devices count is correct

## Step 5: Review & Publish

### 23. Readiness gating

Steps:

1. Select a race with missing setup items.
2. Open `Review & Publish`.

Expected:

- readiness clearly shows missing blockers such as:
  - no GPX
  - no participants
  - no crew
  - no accepted/provisioned devices

### 24. Publish blocked race

Steps:

1. Try to publish a race that is not ready.

Expected:

- publish action is blocked or disabled
- blockers are visible and understandable

### 25. Publish ready race

Steps:

1. Complete all readiness items for one draft race.
2. Publish it.
3. Open spectator event home.

Expected:

- race becomes visible to spectator
- cards/dropdowns/search scope include that race

### 26. Unpublish race

Steps:

1. Unpublish one race that is currently visible.
2. Open spectator event home and utility views.

Expected:

- race disappears from spectator-facing views
- if spectator was focused on that race, the app falls back safely

### 27. Save without publish

Steps:

1. Change branding and race data on a draft race.
2. Do not publish.
3. Refresh organizer console.

Expected:

- draft changes remain saved
- spectator still does not see the draft race

## Race Day Ops Simulation

### 28. Load sample scenario

Steps:

1. Open `Race Day Ops`.
2. Click `Load sample scenario`.

Expected:

- selected race gets a realistic set of accepted scans
- duplicate audit is populated
- leaderboards and notifications become non-empty

### 29. Record trial scan manually

Steps:

1. Pick valid BIB.
2. Pick matching checkpoint.
3. Pick crew assigned to that checkpoint.
4. Record scan.

Expected:

- scan is accepted
- organizer metrics update
- spectator views reflect progression

### 30. Invalid trial scan guardrails

Steps:

1. Try unknown BIB.
2. Try crew assigned to another checkpoint.

Expected:

- invalid input does not create accepted scan
- race state is unchanged

### 31. Duplicate injection

Steps:

1. Record a valid scan.
2. Record the same BIB again at the same checkpoint or use `Inject duplicate`.

Expected:

- second scan becomes duplicate
- duplicate audit count increases
- accepted leaderboard is not corrupted

### 32. Simulate checkpoint wave

Steps:

1. Pick a checkpoint with ready queue.
2. Click `Simulate checkpoint wave`.

Expected:

- several logical runners are scanned in batch
- queue shrinks
- leaders/checkpoint stats move accordingly

### 33. Reset trial scans

Steps:

1. Add or load several scans.
2. Click `Reset trial scans`.

Expected:

- simulated scans for the selected race clear
- organizer and spectator revert to blank/initial state for that race

### 34. Reset demo event

Steps:

1. Make several setup edits and load scenarios.
2. Click `Reset demo event`.

Expected:

- organizer demo workspace returns to baseline
- races, crews, participants, and simulation state are reset cleanly

## Organizer to Spectator Cross-Checks

### 35. Published race appears in spectator home

Steps:

1. Publish a ready race.
2. Open spectator event home.

Expected:

- race card appears
- CTA and status match the race state

### 36. Live simulation updates spectator race detail

Steps:

1. Publish/select a live race.
2. Add scans from organizer `Race Day Ops`.
3. Open spectator race detail.

Expected:

- `Leading` updates reflect simulated scan state
- runner status shows checkpoint progress or `Finished` if finish scan exists
- no podium is shown while race is still `LIVE`

### 37. Finished race shows ranking

Steps:

1. Use a finished race or load a finish-heavy scenario.
2. Open spectator race detail.

Expected:

- section title shows `Ranking`
- podium only appears when the race is finished
- total race time is shown, not gap formatting

## Final Organizer Trial Sign-Off

Mark the trial as accepted only if:

- onboarding flow feels structured and non-confusing
- organizer can save drafts safely
- participant import modes behave exactly as labeled
- checkpoint coverage is easy to understand
- scan crew workflow is coherent
- publish gating prevents incomplete races from leaking to spectators
- race-day simulation feels credible enough for internal rehearsal

## Suggested Trial Sequence

If time is limited, run these in order:

1. Organizer login lands in console
2. Branding draft save
3. Add one draft race
4. Upload participant CSV
5. Add scan crew to every checkpoint
6. Publish ready race
7. Load sample scenario
8. Record manual trial scan
9. Inject duplicate
10. Verify spectator race detail updates

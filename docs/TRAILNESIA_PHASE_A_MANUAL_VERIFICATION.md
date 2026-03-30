# Trailnesia Phase A Manual Verification

## Scope

This checklist verifies the public spectator layer after Phase A:

- Event Home
- Race Detail
- Search a runner
- Runners list
- Favorites list
- My followed runners
- Ranking
- Race leaders
- Statistics

Use this against the live production URLs:

- Dashboard: [https://apexrm-dashboard.vercel.app](https://apexrm-dashboard.vercel.app)
- API: [https://apexrm-api.vercel.app/api](https://apexrm-api.vercel.app/api)
- Scanner: [https://apexrm-scanner.vercel.app](https://apexrm-scanner.vercel.app)

## Test Data Context

Current spectator seed is based on the `MANTRA116` edition with these race categories:

- `Mantra 116 Ultra` (`LIVE`)
- `Mantra Ultra 68` (`FINISHED`)
- `Mantra Trail 38 Welirang` (`FINISHED`)
- `Mantra Trail 34 Arjuno` (`FINISHED`)
- `Mantra Fun 17` (`FINISHED`)
- `Mantra Fun 10` (`FINISHED`)

Useful known runners for spot-checking:

- `Arif Nugroho`
- `Bayu Pambudi`
- `Raka Wijaya`
- `Putri Maharani`
- `Nabila Savitri`

## Global Checks

### 1. Shell

Steps:

1. Open the dashboard home page.
2. Wait for initial load to settle.
3. Scroll vertically.

Expected:

- Left sidebar stays visible.
- Right rail stays visible on race detail pages.
- Middle content is the primary scrolling area.
- No dark theme elements remain.
- Branding uses `Trailnesia`.
- Sidebar logo is visible and not cropped.

### 2. Header

Steps:

1. Open the dashboard at browser zoom `100%`.
2. Check header on event home.
3. Open a race detail page and check header again.

Expected:

- Header does not wrap or overlap.
- Edition select remains compact.
- Search field remains compact.
- No magnifying-glass icon appears inside the search field.
- Event-logo placeholder is shown at the left of the edition selector.
- Header remains usable with the right rail visible.

## Event Home

### 3. Event Home Layout

Steps:

1. Open dashboard root.
2. Confirm the main hero and race category cards render.

Expected:

- Event home shows the edition hero.
- The page shows race category cards, not one-race detail content.
- The right rail does not show one race's ranking while still on event home.

### 4. Race Card States

Steps:

1. Inspect `Mantra 116 Ultra`.
2. Inspect at least one finished race card.

Expected:

- `Mantra 116 Ultra` shows `LIVE`.
- `LIVE` badge is red.
- `LIVE` cards use the term `Leading`, not `Ranking`.
- Finished cards show `FINISHED`.
- Finished cards use the term `Ranking`.
- `LIVE` cards do not show podium medals for top 3.
- Finished cards may show podium medals for top 3.

### 5. Race Card CTA

Steps:

1. Inspect CTA on the live card.
2. Inspect CTA on a finished card.

Expected:

- Live card CTA reads `Open Race Live`.
- Finished card CTA reads `View Results`.

## Race Detail

### 6. Race Detail Core Structure

Steps:

1. Open `Mantra 116 Ultra`.
2. Scroll through the page.

Expected:

- Race detail contains only the core sequence:
  - course info / description
  - elevation profile
  - map
  - race leaders or race ranking
- Utility views are not stacked under the race page.

### 7. Race Detail Ongoing Logic

Steps:

1. Open `Mantra 116 Ultra`.
2. Inspect the leader panel and right rail.

Expected:

- Race status shows `LIVE`.
- Right rail labels use `Leading`, not `Ranking`.
- No podium icons appear for ongoing leaders unless a runner is actually finished.
- Ongoing runners show last checkpoint / on-course status instead of `Finisher`.
- If a runner has reached finish, only then may `Finished` and podium be shown.

### 8. Race Detail Finished Logic

Steps:

1. Open `Mantra Ultra 68`.
2. Inspect the main detail area and right rail.

Expected:

- Race status shows `FINISHED`.
- Main panel shows `Race ranking`.
- Right rail labels use `Ranking`.
- Podium medals appear for places `1-3`.
- Race time shows total time, not split-gap formatting.

### 9. Course Information Per Category

Steps:

1. Open two different race categories.
2. Compare the course info panel.

Expected:

- Each category has different course description text.
- Each category has different highlights/identity.
- Course map changes with the selected race.
- Elevation profile reflects the selected race.

## Utility Views

### 10. Back to Race Page

Steps:

1. Open any race detail page.
2. Click `Ranking`.
3. Click `Back to race page`.

Expected:

- Utility view opens alone.
- Returning to race page restores the current race context.

### 11. Search a Runner

Steps:

1. Open `Search a runner`.
2. Search for `Arif`.
3. Search by bib such as `M116`.

Expected:

- Search page shows its own heading and filters.
- Results table is shown in utility view only.
- Search field works with `Enter`.
- No extra race hero or race-detail blocks appear in this view.

### 12. Runners List

Steps:

1. Open `Runners list`.
2. Inspect table structure.
3. Change filters.

Expected:

- Dedicated `Runners list` page is shown.
- No race-detail hero appears at the top.
- Rows are full width and clean.
- No avatar circles are shown.
- No `UTMB Index` is shown.
- Table formatting remains stable when filters change.

### 13. Favorites List

Steps:

1. Open `Favorites list`.
2. Inspect table structure.

Expected:

- Dedicated `Favorites list` page is shown.
- Filters are visible.
- Table includes favorite-specific actions.
- No race-detail hero appears above the table.

### 14. My Followed Runners

Steps:

1. Open `My followed runners` with no favorites selected.
2. Add at least one favorite from a list row.
3. Return to `My followed runners`.

Expected:

- Empty state shows a clean "add your first runner to follow" message.
- No dark/black artifact panels appear.
- Followed runners appear after favoriting.

### 15. Ranking

Steps:

1. Open `Ranking`.
2. Check filters.
3. Switch between `Men` and `Women`.

Expected:

- Ranking is a standalone utility view.
- `Of which category ?` offers only `Men` and `Women`.
- No extra race-detail sections appear under the table.
- `Gender` column is shown.
- `CATEG.` column is not shown.
- Country uses flag icons only.
- Top `1-3` rows show podium icons.
- `Sex` rank is gender-specific, not just copied from overall rank.

### 16. Race Leaders

Steps:

1. From event home, open `Race leaders`.
2. Inspect filters and rows.
3. Open `Race leaders` from an ongoing race detail page.

Expected:

- Event-level leaders view supports:
  - race filter
  - nationality filter
  - category filter
- When opened from event home, default race scope is broader than one race.
- When opened from one race detail page, default race scope matches that race.
- Rows show last point and next estimated passing context.

### 17. Statistics

Steps:

1. Open `Statistics` from event home.
2. Open `Statistics` from a race detail page.

Expected:

- Event-home statistics can reflect all races.
- Race-detail statistics are scoped to the active race only.
- Cards show:
  - starters
  - withdrawals
  - finishers
- Country distribution is shown.
- No unrelated race-detail sections are stacked under statistics.

## Regression Checks

### 18. Sidebar Behavior

Steps:

1. Collapse and expand `THE RUNNERS`.
2. Collapse and expand `FOLLOW THE RACE`.

Expected:

- Collapsed chevron points right.
- Expanded chevron points down.

### 19. Search Field Icons

Steps:

1. Inspect topbar search.
2. Inspect `Search a runner` search field.

Expected:

- No magnifying-glass button/icon remains inside the field.
- Search field is still aligned and compact.

### 20. Logo and Branding

Steps:

1. Inspect sidebar logo.
2. Inspect header branding.

Expected:

- Trailnesia logo is visible and not cropped.
- Sidebar logo contrasts clearly against the sidebar.
- Header uses the organizer event-logo placeholder instead of hardcoded event text.

## Pass Criteria

Phase A is considered accepted when:

- all spectator views are reachable from the sidebar
- no spectator utility view is stacked under race detail
- live vs finished race behavior is consistent
- header and shell stay stable at normal browser zoom
- ranking/leaders/statistics reflect the correct race scope
- no obvious visual artifacts remain in spectator views

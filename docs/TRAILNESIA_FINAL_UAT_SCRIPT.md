# Trailnesia Final UAT Script

## Purpose

This script combines the final automated checks needed before a controlled trial or production verification.

It covers:

- spectator smoke verification
- organizer smoke verification
- dashboard typecheck
- dashboard production build
- optional browser organizer login flow

## Command

```powershell
npm run uat:final
```

## Optional Environment Variables

If organizer live credentials are available, set:

```powershell
$env:UAT_DASHBOARD_URL="https://apexrm-dashboard.vercel.app"
$env:UAT_ORGANIZER_EMAIL="organizer@example.com"
$env:UAT_ORGANIZER_PASSWORD="your-password"
```

Then run:

```powershell
npm run uat:final
```

## Behavior

- Without organizer credentials:
  - script still runs all automated smoke checks
  - browser organizer login steps are marked `SKIP`

- With organizer credentials and Playwright installed:
  - script also validates:
    - organizer can log in
    - organizer lands directly in `Event Setup Console`
    - setup step nav is visible
    - `Race Day Ops` controls are visible
    - participant template download actions are visible

## Pass Criteria

The run is considered acceptable when:

- `spectator smoke check` passes
- `organizer smoke check` passes
- `dashboard typecheck` passes
- `dashboard production build` passes

Browser steps may be skipped only when live organizer credentials or Playwright are unavailable.

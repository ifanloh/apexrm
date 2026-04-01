# Trailnesia Scanner UAT

## Command

```powershell
npm run uat:scanner
```

## Optional Environment Variables

```powershell
$env:UAT_SCANNER_URL="https://apexrm-scanner.vercel.app"
$env:UAT_SCANNER_EMAIL="crew-or-admin@example.com"
$env:UAT_SCANNER_PASSWORD="your-password"
```

If scanner-specific credentials are not provided, the script will also reuse:

- `UAT_ORGANIZER_EMAIL`
- `UAT_ORGANIZER_PASSWORD`

## Coverage

The script verifies:

- scanner homepage is reachable
- scanner typecheck passes
- scanner production build passes
- browser login works when credentials are available
- scanner workspace essentials render after login

## Notes

- Browser steps require Playwright and Chromium to be installed locally.
- If credentials are missing, browser login steps are marked `SKIP`.

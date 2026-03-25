# ARM Race Management

Implementasi ini sekarang diarahkan mengikuti arsitektur target:

- `PWA Scanner` deploy terpisah di Vercel
- `Admin Dashboard` deploy terpisah di Vercel
- `Backend API` deploy di Render
- database dan auth memakai `Supabase`
- notifikasi Top 5 dikirim ke `Telegram Bot API`
- monitoring memakai endpoint `/health`
- CI/CD deploy bisa dijalankan lewat `GitHub Actions`

## Struktur

```text
apps/
  api/        Fastify API untuk Render
  scanner/    React + Vite PWA untuk Vercel
  dashboard/  React + Vite Admin Dashboard untuk Vercel
packages/
  contracts/  Shared schema dan contract type
supabase/
  schema.sql  Struktur tabel PostgreSQL
  seed.sql    Seed checkpoint awal
  policies.sql Policy dasar RLS
docs/
  DEPLOYMENT.md Panduan setup cloud
.github/
  workflows/
    ci.yml      Test + build workflow
    deploy.yml  Deploy scanner, dashboard, dan API
render.yaml   Blueprint deploy backend ke Render
```

## Alur Yang Sudah Diwiring

- Crew login lewat Supabase Auth di frontend scanner
- Scanner kirim `Bearer token` ke backend
- Backend validasi JWT Supabase
- Scan baru masuk ke PostgreSQL/Supabase
- Scan duplikat dicatat ke audit log
- Top 5 per checkpoint dihitung dari data scan resmi
- Event Top 5 memicu kirim pesan ke Telegram bila env tersedia
- Dashboard membaca leaderboard, duplikat, dan notifikasi
- Scanner tetap menyimpan scan offline ke `IndexedDB`
- Saat koneksi kembali, scanner kirim batch ke `/api/sync-offline`

## Endpoint Backend

- `GET /health`
- `GET /api/meta/checkpoints`
- `GET /api/leaderboard/live`
- `GET /api/leaderboard/live/:checkpointId`
- `GET /api/audit/duplicates`
- `GET /api/notifications`
- `GET /api/events`
- `POST /api/scan`
- `POST /api/sync-offline`

## Environment

Isi `.env` dari template:

```bash
PORT=4000
API_PREFIX=/api
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
DATABASE_URL=postgresql://postgres:password@db.example.supabase.co:5432/postgres
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=replace-with-supabase-anon-key
SUPABASE_JWT_SECRET=optional-legacy-shared-secret
TELEGRAM_BOT_TOKEN=replace-with-bot-token
TELEGRAM_CHAT_ID=@raceupdate
VITE_API_BASE_URL=http://localhost:4000/api
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=replace-with-supabase-anon-key
```

## Setup Supabase

1. Jalankan SQL di [schema.sql](/C:/ARM/supabase/schema.sql)
2. Jalankan seed di [seed.sql](/C:/ARM/supabase/seed.sql)
3. Jalankan policy di [policies.sql](/C:/ARM/supabase/policies.sql)
4. Buat user untuk crew dan panitia di Supabase Auth
5. Pastikan `DATABASE_URL`, `SUPABASE_URL`, dan `SUPABASE_ANON_KEY` sudah diisi ke `.env`
6. Isi `SUPABASE_JWT_SECRET` hanya jika project masih memakai shared secret legacy

## Jalankan Lokal

```bash
npm.cmd install
npm.cmd run build
```

Backend:

```bash
npm.cmd run dev:api
```

Frontend:

```bash
npm.cmd run dev:scanner
npm.cmd run dev:dashboard
```

## Deploy

Scanner dan dashboard:

- deploy `apps/scanner` ke Vercel
- deploy `apps/dashboard` ke Vercel
- isi env `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

Backend:

- deploy root repo ke Render memakai [render.yaml](/C:/ARM/render.yaml)
- isi env `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

Panduan rinci ada di [DEPLOYMENT.md](/C:/ARM/docs/DEPLOYMENT.md).

## GitHub Actions Deploy

Jika ingin deploy otomatis dari GitHub Actions, isi secret berikut:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_SCANNER_PROJECT_ID`
- `VERCEL_DASHBOARD_PROJECT_ID`
- `RENDER_DEPLOY_HOOK_URL`

Workflow deploy ada di [deploy.yml](/C:/ARM/.github/workflows/deploy.yml).

## Catatan Status

- Arsitektur utama sekarang sudah diarahkan ke `Vercel + Render + Supabase + Telegram`
- Scanner sudah punya login, queue offline, duplicate check lokal, dan endpoint bulk sync
- Dashboard sudah dipisahkan sebagai frontend standalone
- Health endpoint dan CI workflow sudah ada
- Integrasi Telegram bergantung pada env bot yang valid
- Validasi penuh end-to-end ke Supabase/Telegram belum bisa saya jalankan tanpa kredensial real
"# apexrm" 
"# apexrm" 

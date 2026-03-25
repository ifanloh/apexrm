# Deployment Guide

## 1. Supabase

1. Buat project baru di Supabase.
2. Buka SQL Editor.
3. Jalankan [schema.sql](/C:/ARM/supabase/schema.sql).
4. Jalankan [seed.sql](/C:/ARM/supabase/seed.sql).
5. Jalankan [policies.sql](/C:/ARM/supabase/policies.sql).
6. Di Authentication:
   set user untuk crew dan panitia/admin.
7. Untuk user yang perlu role khusus, simpan role di `app_metadata`.
8. Catat `Project URL` dan `anon/publishable key` karena dipakai frontend dan backend.
9. `JWT secret` hanya diperlukan bila project masih memakai shared secret legacy.

Contoh metadata:

```json
{
  "role": "crew",
  "crew_code": "crew-01"
}
```

Role yang dipakai aplikasi:

- `crew`
- `panitia`
- `admin`
- `observer`

## 2. Render API

1. Hubungkan repo ini ke Render.
2. Gunakan blueprint [render.yaml](/C:/ARM/render.yaml) atau buat web service manual.
3. Isi environment variables:
   - `DATABASE_URL`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `CORS_ORIGIN`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
4. Deploy backend.
5. Pastikan health check `/health` mengembalikan `ok`.
6. Gunakan template [apps/api/.env.example](/C:/ARM/apps/api/.env.example) sebagai daftar rahasia yang wajib terisi.
7. Jika deploy via GitHub Actions, buat `Deploy Hook` di Render lalu simpan URL-nya sebagai secret `RENDER_DEPLOY_HOOK_URL`.
8. Isi `SUPABASE_JWT_SECRET` hanya jika project masih memakai konfigurasi JWT legacy berbasis shared secret.

## 3. Vercel Scanner

1. Buat project Vercel yang root-nya `apps/scanner`.
2. Build command:
   `npm run build --workspace @arm/scanner`
3. Output directory:
   `dist`
4. Env:
   - `VITE_API_BASE_URL`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Template env ada di [apps/scanner/.env.example](/C:/ARM/apps/scanner/.env.example).
6. Untuk deploy otomatis via GitHub Actions, simpan `Project ID` scanner sebagai secret `VERCEL_SCANNER_PROJECT_ID`.

## 4. Vercel Dashboard

1. Buat project Vercel yang root-nya `apps/dashboard`.
2. Build command:
   `npm run build --workspace @arm/dashboard`
3. Output directory:
   `dist`
4. Env:
   - `VITE_API_BASE_URL`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Template env ada di [apps/dashboard/.env.example](/C:/ARM/apps/dashboard/.env.example).
6. Untuk deploy otomatis via GitHub Actions, simpan `Project ID` dashboard sebagai secret `VERCEL_DASHBOARD_PROJECT_ID`.

## 4b. GitHub Actions Secrets

Tambahkan secret ini di repository GitHub:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_SCANNER_PROJECT_ID`
- `VERCEL_DASHBOARD_PROJECT_ID`
- `RENDER_DEPLOY_HOOK_URL`

Workflow [deploy.yml](/C:/ARM/.github/workflows/deploy.yml) akan:

- menjalankan `typecheck` dan `build`
- deploy `apps/scanner` ke Vercel
- deploy `apps/dashboard` ke Vercel
- memicu deploy backend di Render lewat deploy hook

## 5. Telegram

1. Buat bot lewat `@BotFather`.
2. Masukkan bot ke channel/group target.
3. Isi `TELEGRAM_BOT_TOKEN`.
4. Isi `TELEGRAM_CHAT_ID` dengan handle channel atau ID grup.

## 6. Monitoring

1. Tambah monitor di Uptime Robot ke endpoint:
   `https://your-render-api-domain/health`
2. Interval:
   `5 minutes`
3. Aktifkan email alert.

## 7. Post-Deploy Check

Sebelum deploy, kamu bisa cek env lokal dengan:

```bash
npm run check:deploy
```

1. Login scanner dengan akun `crew`.
2. Pilih checkpoint.
3. Submit scan online.
4. Matikan koneksi lalu submit scan offline.
5. Aktifkan koneksi dan pastikan batch `sync-offline` sukses.
6. Login dashboard dengan akun `panitia/admin`.
7. Pastikan leaderboard, audit duplikat, dan notifikasi tampil.
8. Pastikan pesan Top 5 masuk ke Telegram.

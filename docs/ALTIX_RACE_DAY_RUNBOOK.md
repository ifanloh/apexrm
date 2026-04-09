# Altix Race Day Runbook

## 1. Sebelum Race Start

- Buka organizer dashboard dan pastikan event serta race yang akan dipakai sudah `Live`.
- Masuk ke `Race Day Ops` lalu cek jumlah runner, checkpoint, dan live feed sudah termuat.
- Pastikan setiap akun scanner crew sudah ter-assign ke checkpoint yang benar.
- Di setiap HP scanner:
  - login memakai akun checkpoint masing-masing
  - cek status `Checkpoint locked`
  - cek baterai di atas `50%`
  - pastikan mode hemat daya dimatikan
- Jalankan 1 scan uji coba sebelum start untuk memastikan:
  - scanner menerima input
  - organizer `Live Feed` bergerak
  - spectator live ikut menerima update

## 2. Saat Race Berjalan

- Gunakan QR scan sebagai jalur utama, manual BIB sebagai fallback.
- Jika scan diterima:
  - status harus `accepted`
  - organizer `Live Feed` menambah item baru
  - spectator live ranking atau race page ikut bergerak
- Jika muncul `duplicate`:
  - jangan scan terus-menerus
  - konfirmasi apakah runner memang sudah tercatat di checkpoint itu
- Pantau indikator scanner:
  - `Offline mode`
  - `Syncing`
  - `Sync completed`
  - `Queue`

## 3. Jika Internet Putus

- Tetap lanjut scan. Scanner akan memasukkan data ke queue lokal.
- Jangan logout.
- Jangan hapus app dari recent apps.
- Begitu koneksi kembali:
  - tunggu status `Syncing`
  - pastikan queue turun sampai `0`
  - cek organizer live ops apakah scan yang tadi tertunda sudah muncul

## 4. Jika HP atau Crew Bermasalah

- Jika kamera gagal:
  - pindah ke input manual BIB
- Jika akun salah checkpoint:
  - organizer edit akun crew
  - logout dari scanner
  - login ulang dengan akun yang benar
- Jika HP habis baterai:
  - pindah ke HP cadangan
  - login akun checkpoint yang sama
  - lanjut scan

## 5. Jika Organizer Feed Terlihat Stuck

- Hard refresh organizer dashboard sekali
- Buka ulang `Race Day Ops`
- Pastikan badge sync aktif dan live feed memuat item terbaru
- Jika feed publik spectator belum ikut bergerak:
  - cek `Race Day Ops` dulu sebagai sumber kebenaran utama
  - lalu cek halaman race spectator

## 6. Setelah Race

- Pastikan queue scanner di semua HP sudah `0`
- Cek ranking terakhir dan total official passings
- Export hasil jika dibutuhkan panitia
- Simpan screenshot akhir:
  - organizer `Race Day Ops`
  - spectator ranking
  - scanner last sync

## 7. Kredensial Demo Saat Ini

- Organizer:
  - username: `admin`
  - password: `admin`
- Scanner demo:
  - username: `crew_demo`
  - password: `demo123`

## 8. Checklist Go / No-Go Cepat

- Event sudah `Live`
- Crew sudah assigned checkpoint
- Scanner login berhasil
- 1 scan test `accepted`
- Organizer live ops bergerak
- Spectator live bergerak
- Semua HP scanner punya baterai dan koneksi aman

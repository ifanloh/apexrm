# Trailnesia Organizer Dashboard Redesign Brief

## Purpose

Dokumen ini ditujukan untuk UI/UX designer yang akan mendesain ulang `Organizer Dashboard` Trailnesia agar:

- lebih mudah dipahami first-time organizer
- lebih efektif untuk setup event end-to-end
- lebih efisien secara visual dan operasional
- tetap aman untuk kebutuhan race-day

Brief ini harus dibaca sebagai dokumen desain produk, bukan sebagai spesifikasi front-end final.

---

## Product Context

Trailnesia memiliki tiga surface utama:

1. `Platform Home / Spectator`
2. `Organizer Dashboard`
3. `Scanner App`

Dokumen ini hanya fokus pada `Organizer Dashboard`.

Organizer Dashboard dipakai oleh organizer setelah mendapatkan akun dari tim Trailnesia untuk:

- membuat event
- membuat race categories
- mengisi branding event
- menambah checkpoint
- import peserta
- menambah akun scanner crew
- publish race ke publik
- memonitor readiness sebelum race live

---

## Problem Statement

Hasil trial menunjukkan organizer masih bingung dengan:

1. **alur kerja**
- user tidak selalu paham harus mulai dari mana
- user belum yakin langkah berikutnya apa
- `Race Day Ops` terasa terlalu dekat dengan setup awal

2. **informasi yang terlalu teknis**
- terlalu banyak istilah operasional muncul terlalu dini
- user harus membaca banyak panel untuk mengerti konteks

3. **hirarki tombol**
- tombol penting dan tombol sekunder terlalu mirip
- aksi krusial seperti `Publish`, `Add`, `Upload`, `Apply import`, `Continue` belum cukup menonjol

4. **struktur halaman**
- walau sudah dibagi per step, console masih terasa seperti kumpulan tool panel
- user belum merasa sedang dipandu oleh workflow yang jelas

---

## Current Organizer Journey

Journey yang ingin dipertahankan:

1. user deal dengan Trailnesia
2. user menerima email dan password untuk login
3. user login ke `Organizer Home`
4. user membuat event dan race categories
5. user mengatur crew dan akun scanner
6. user menyimpan draft lalu publish race

Current product flow yang sudah ada:

1. `Organizer Home`
2. `Create Event Wizard`
3. `Event Setup Console`

### Organizer Home

State yang ada:

- empty state: `You have no events yet`
- list event jika organizer punya banyak event
- action:
  - `Create your first event`
  - `Open`
  - `Duplicate`
  - `Archive`
  - `Restore`

### Create Event Wizard

Current step:

1. `Event basics`
2. `Branding`
3. `First race category`
4. `Save draft`

Catatan:

- wizard saat ini hanya membuat `event draft + 1 first race category`
- kategori race lain ditambahkan setelah masuk ke console
- race pertama otomatis dibuat sebagai `Upcoming`

### Event Setup Console

Current step:

1. `Event`
2. `Races`
3. `Participants`
4. `Scanner crew`
5. `Review`
6. `Race day (later)`

---

## Design Goal

Designer diminta membuat dashboard yang terasa:

- jelas
- tenang
- terarah
- tidak ramai
- tidak teknis di awal
- tetap cepat dipakai panitia saat data sudah banyak

Target mental model:

> “Saya login, saya paham harus isi apa dulu, saya tahu mana yang wajib, mana yang nanti, dan saya bisa publish tanpa takut salah.”

---

## Primary UX Goals

### 1. Make the workflow obvious

Organizer harus langsung mengerti:

- sekarang saya ada di langkah apa
- langkah berikutnya apa
- apa yang wajib diisi agar bisa lanjut
- apa yang boleh ditunda

### 2. Separate setup from operations

`Race Day Ops` tidak boleh terasa seperti bagian dari onboarding setup.

Harus terasa seperti:

- setup mode
- review mode
- race-day operations mode

### 3. Reduce cognitive load

Kurangi:

- panel berdampingan yang terlalu banyak
- metric card yang tidak perlu untuk first-time organizer
- istilah teknis terlalu dini
- tombol yang terlalu banyak muncul bersamaan

### 4. Make critical actions visually obvious

Harus sangat jelas mana:

- primary action
- secondary action
- destructive action
- state/status info

---

## Required Product Rules

Designer **tidak boleh melanggar** rules produk berikut:

### Authentication

- organizer login menggunakan credential dari Trailnesia
- untuk trial internal saat ini ada shortcut organizer:
  - username: `admin`
  - password: `admin`

### Draft and Publish

- semua perubahan organizer disimpan sebagai `draft`
- race boleh di-`Publish` walau crew belum lengkap
- race yang sudah publish tapi belum readiness lengkap harus tetap berstatus `Upcoming`
- race hanya boleh menjadi `Live` jika semua go-live readiness hijau

### Event Status Logic

Public event status mengikuti prioritas:

1. jika minimal 1 race `Live` -> event status = `Live`
2. jika tidak ada `Live`, tapi ada minimal 1 race `Upcoming` -> event status = `Upcoming`
3. jika semua published race selesai -> event status = `Finished`

### Setup Boundaries

Wizard awal hanya perlu fokus untuk:

- membuat event draft
- membuat first race category

Operasional lanjutan tetap di console:

- tambah category lain
- import participants
- atur scanner crew
- publish

### Scanner Crew

- crew di checkpoint adalah `scanner crew`
- bukan multi-role field team yang kompleks

---

## Current Pain Points to Solve

### A. Organizer Home

Masalah:

- masih terasa seperti daftar kartu biasa, belum terasa seperti command center organizer
- user belum langsung paham perbedaan antara `buat event baru`, `buka draft`, dan `event yang sudah live`

Yang perlu diperjelas:

- status event
- next action per event
- CTA paling penting untuk first-time organizer

### B. Create Event Wizard

Masalah:

- belum terasa cukup “guided”
- user mungkin belum paham bahwa wizard baru membuat draft awal
- masih ada potensi ekspektasi bahwa wizard sudah menyelesaikan seluruh event

Yang perlu diperjelas:

- wizard outcome
- apa yang akan dikerjakan di console setelah wizard selesai
- per-step guidance yang lebih sederhana

### C. Event Setup Console

Masalah:

- step sudah ada, tapi halaman masih terasa seperti kumpulan tools
- masih ada istilah yang terlalu teknis untuk first-time organizer
- beberapa panel terlalu padat
- banyak tombol tampil bersamaan

Yang perlu diperjelas:

- “do this now”
- “you can do this later”
- “you are ready to publish”
- “what still blocks Live”

### D. Button Hierarchy

Masalah:

- `Save draft`, `Continue`, `Publish`, `Upload`, `Add`, `Apply import` sebelumnya terlalu mirip dengan secondary action
- user harus membaca label satu per satu untuk menemukan aksi utama

Designer harus mendefinisikan sistem tombol yang sangat jelas untuk:

- primary CTA
- supporting CTA
- destructive CTA
- neutral tool action

---

## Information Architecture Direction

Designer diminta mengeksplor IA yang membuat alur ini sangat jelas:

### Level 1: Organizer Home

Should answer:

- event mana yang saya punya?
- mana yang masih draft?
- mana yang butuh perhatian?
- apa CTA berikutnya?

### Level 2: Event Setup

Should answer:

- saya sedang setup event yang mana?
- step saya saat ini apa?
- step berikutnya apa?
- apa blocker saya?

### Level 3: Race Day Ops

Should answer:

- apakah ini sudah race-day mode?
- checkpoint mana aktif?
- ada duplicate atau queue issue tidak?

Ops sebaiknya terasa sebagai mode terpisah dari setup.

---

## Recommended Design Direction

### Overall Tone

- calm
- premium but practical
- no dashboard clutter
- no enterprise noise
- feels like a guided event-builder, not an admin backoffice

### Layout

Diutamakan mengeksplor:

1. **guided workspace**
- left step rail / top step rail
- single main content pane
- contextual guide / helper panel

2. **focus mode per step**
- satu step satu fokus utama
- minim distraksi dari step lain

3. **review mode**
- summary state yang lebih jelas
- publish readiness sangat mudah dipindai

### Suggested Visual Hierarchy

#### Primary actions

Examples:

- `Create event`
- `Continue`
- `Add race`
- `Upload participants`
- `Apply import`
- `Publish`

Should be:

- most visible
- highest contrast
- easiest to spot in one scan

#### Secondary actions

Examples:

- `Back`
- `Open`
- `Duplicate`
- `Inspect`
- `Download template`
- `Save draft`

Should be:

- visible but calmer
- clearly supportive, not competing with primary CTA

#### Destructive actions

Examples:

- `Remove`
- `Archive`
- `Delete checkpoint`

Should be:

- clearly dangerous
- separated from primary CTA
- hard to tap by accident

---

## Specific Screens to Redesign

Designer should prioritize these screens in order:

### 1. Organizer Home

Need:

- empty state
- multi-event list state
- draft/live/upcoming/finished signal
- clear CTA hierarchy

### 2. Create Event Wizard

Need:

- guided setup
- review screen
- clear promise: “this creates your initial draft”

### 3. Event Setup Console

Need redesign for these tabs/steps:

- `Event`
- `Races`
- `Participants`
- `Scanner crew`
- `Review & publish`

### 4. Race Day Ops

Need:

- separated visual mode
- should feel like later-stage operations
- not mixed visually with setup mode

---

## UX Questions the Designer Should Answer

Designer is expected to propose clear answers for:

1. How does a first-time organizer know what to do first?
2. How does a returning organizer quickly continue unfinished work?
3. How do we make `Publish as Upcoming` feel safe?
4. How do we show that `Live` has stricter readiness rules?
5. How do we make `Participants` and `Scanner crew` feel like structured tasks, not technical tools?
6. How do we visually separate `setup` from `race-day ops`?

---

## Suggested Deliverables

Please ask the designer to deliver:

### A. Flow Map

- Organizer Home
- Create Event Wizard
- Event Setup
- Review & Publish
- Race Day Ops

### B. Low-Fidelity Wireframes

At minimum for:

- Organizer Home
- Wizard
- Setup step layout
- Review & Publish
- Race Day Ops

### C. High-Fidelity Screens

At minimum for:

- empty state
- multi-event state
- event setup step
- participants import step
- scanner crew step
- publish review step

### D. Component System Direction

For:

- page header
- stepper
- guide card
- primary CTA
- secondary CTA
- destructive CTA
- status pill
- readiness card
- table/list card

---

## Success Criteria for the Redesign

Redesign is considered successful if a first-time organizer can do this without explanation:

1. login
2. create event
3. create race category
4. upload participant roster
5. add scanner crew
6. publish race as `Upcoming`

And can also understand:

- why the race is not `Live` yet
- what is still missing
- where to go next

---

## Important Note for Designer

Do **not** redesign this as a data-heavy admin panel first.

The right product feeling is:

> “guided setup workspace for race organizers”

not:

> “technical dashboard with many tools”

The current problem is not lack of features.  
The current problem is that the features are not yet framed in the clearest possible workflow.

---

## Current Implementation Reference

Relevant current files:

- [C:\ARM\apps\dashboard\src\App.tsx](/C:/ARM/apps/dashboard/src/App.tsx)
- [C:\ARM\apps\dashboard\src\OrganizerConsole.tsx](/C:/ARM/apps/dashboard/src/OrganizerConsole.tsx)
- [C:\ARM\apps\dashboard\src\styles.css](/C:/ARM/apps/dashboard/src/styles.css)

Related QA/trial docs:

- [C:\ARM\docs\TRAILNESIA_ORGANIZER_TRIAL_CHECKLIST.md](/C:/ARM/docs/TRAILNESIA_ORGANIZER_TRIAL_CHECKLIST.md)
- [C:\ARM\docs\TRAILNESIA_ORGANIZER_TRIAL_EXECUTION_REPORT.md](/C:/ARM/docs/TRAILNESIA_ORGANIZER_TRIAL_EXECUTION_REPORT.md)


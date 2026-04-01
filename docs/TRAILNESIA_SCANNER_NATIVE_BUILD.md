# Trailnesia Scanner Android Build

Scanner sekarang difokuskan ke **Android dulu** dengan native wrapper Capacitor. Basis UI/logic tetap satu di `apps/scanner`, lalu dibungkus jadi proyek Android native yang bisa menghasilkan APK debug.

## Workspace

- App web source: `apps/scanner`
- Config native: `apps/scanner/capacitor.config.json`

## Scripts

Jalankan dari root repo:

- `npm run build --workspace @arm/scanner`
- `npm run cap:sync --workspace @arm/scanner`
- `npm run cap:android --workspace @arm/scanner`
- `npm run android:apk --workspace @arm/scanner`
- `npm run android:open --workspace @arm/scanner`
- `npm run scanner:android:apk`
- `npm run scanner:android:open`

## Android APK

1. `npm run cap:android --workspace @arm/scanner`
2. `npm run android:open --workspace @arm/scanner`
3. Di Android Studio:
   - tunggu Gradle sync selesai
   - pilih `Build > Build Bundle(s) / APK(s) > Build APK(s)`
4. APK akan tersedia dari output Android Studio

Atau langsung dari CLI:

1. `npm run android:apk --workspace @arm/scanner`
2. Output debug APK:
   - `apps/scanner/android/app/build/outputs/apk/debug/app-debug.apk`

Atau langsung dari root repo:

1. `npm run scanner:android:apk`
2. Output debug APK:
   - `apps/scanner/android/app/build/outputs/apk/debug/app-debug.apk`

## Status iOS

- Proyek iOS tetap tersedia di `apps/scanner/ios`
- tetapi jalur kerja aktif sekarang **Android-first**
- iOS final build nanti tetap memerlukan macOS + Xcode

## Catatan

- Build native Android bisa dilakukan dari CLI atau Android Studio.
- Proyek iOS sudah digenerate, tapi belum menjadi fokus delivery saat ini.
- Setiap ada perubahan UI/logic scanner, ulangi `cap:sync` sebelum membuka proyek native.

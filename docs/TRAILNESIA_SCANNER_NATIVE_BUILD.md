# Trailnesia Scanner Native Build

Scanner sekarang disiapkan sebagai aplikasi native wrapper dengan Capacitor, sehingga basis UI/logic tetap satu, tetapi output-nya bisa dibuka sebagai proyek Android dan iOS.

## Workspace

- App web source: `apps/scanner`
- Config native: `apps/scanner/capacitor.config.json`

## Scripts

Jalankan dari root repo:

- `npm run build --workspace @arm/scanner`
- `npm run cap:sync --workspace @arm/scanner`
- `npm run cap:android --workspace @arm/scanner`
- `npm run cap:ios --workspace @arm/scanner`
- `npm run android:apk --workspace @arm/scanner`
- `npm run android:open --workspace @arm/scanner`
- `npm run ios:open --workspace @arm/scanner`

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

## iOS App

1. `npm run cap:ios --workspace @arm/scanner`
2. `npm run ios:open --workspace @arm/scanner`
3. Di Xcode:
   - pilih simulator atau device
   - build/run app
   - untuk distribusi, gunakan archive flow Xcode

## Catatan

- Build native tetap membutuhkan Android Studio untuk APK dan Xcode/macOS untuk iOS final build.
- Proyek iOS sudah digenerate di `apps/scanner/ios`, tetapi compile/run iOS final tetap membutuhkan macOS + Xcode.
- Setiap ada perubahan UI/logic scanner, ulangi `cap:sync` sebelum membuka proyek native.

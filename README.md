# FinanSight — Personal Financial Planner

Aplikasi perencana keuangan pribadi berbasis web yang dapat di-build ke Android/iOS menggunakan Capacitor JS.

---

## Fitur Utama

- **PIN 6 Digit** — Keamanan akses aplikasi dengan PIN yang disimpan secara lokal (hashed)
- **Dashboard** — Ringkasan utang/piutang, progress wishlist, dan aktivitas terbaru
- **Kalender** — Tampilan bulanan terintegrasi dengan semua deadline dan event
- **Utang & Piutang** — Pencatatan lengkap dengan filter, status lunas, dan deteksi keterlambatan
- **Kegiatan (To-Do)** — Manajemen tugas dengan prioritas dan deadline
- **Planner/Wishlist** — Target barang dengan simulasi cicilan tabungan
- **Ekspor/Impor** — Backup data ke JSON dan restore
- **Dark Mode** — Tema gelap yang tersimpan otomatis

---

## Struktur File

```
finansight/
├── index.html      # Struktur UI lengkap
├── app.js          # Semua logic: database, PIN, CRUD, kalender, simulator
└── README.md       # Dokumentasi ini
```

---

## Cara Menjalankan (Web/Browser)

Cukup buka `index.html` di browser modern. Tidak perlu server karena menggunakan IndexedDB via Dexie.js CDN.

> **Catatan:** Gunakan browser Chromium-based (Chrome/Edge) untuk hasil terbaik dengan IndexedDB.

---

## Build ke Android (Capacitor JS)

### 1. Inisialisasi Proyek

```bash
# Install dependencies
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android

# Init Capacitor
npx cap init FinanSight com.finansight.app --web-dir www
```

### 2. Siapkan Web Assets

```bash
# Buat folder www dan copy file
mkdir www
cp index.html www/
cp app.js www/
```

### 3. Tambah Platform Android

```bash
npx cap add android
npx cap sync
```

### 4. Build APK

```bash
# Buka di Android Studio
npx cap open android

# Atau build via CLI (butuh Android SDK)
cd android && ./gradlew assembleDebug
```

APK tersedia di: `android/app/build/outputs/apk/debug/app-debug.apk`

---

## capacitor.config.json

```json
{
  "appId": "com.finansight.app",
  "appName": "FinanSight",
  "webDir": "www",
  "server": {
    "androidScheme": "https"
  },
  "plugins": {
    "SplashScreen": {
      "launchShowDuration": 2000,
      "backgroundColor": "#ffffff"
    }
  }
}
```

---

## package.json (minimal)

```json
{
  "name": "finansight",
  "version": "1.0.0",
  "scripts": {
    "build": "cp index.html www/ && cp app.js www/",
    "sync": "npx cap sync"
  },
  "dependencies": {
    "@capacitor/android": "^5.0.0",
    "@capacitor/core": "^5.0.0"
  },
  "devDependencies": {
    "@capacitor/cli": "^5.0.0"
  }
}
```

---

## GitHub Actions CI/CD

File `.github/workflows/build.yml`:

```yaml
name: Build Android APK
on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Prepare web assets
        run: mkdir -p www && cp index.html www/ && cp app.js www/

      - name: Sync Capacitor
        run: npx cap sync android

      - name: Build APK
        run: cd android && ./gradlew assembleDebug

      - name: Upload APK
        uses: actions/upload-artifact@v3
        with:
          name: app-debug
          path: android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Tech Stack

| Komponen | Teknologi |
|----------|-----------|
| UI | HTML5 + TailwindCSS CDN |
| Icons | Lucide Icons |
| Font | Plus Jakarta Sans |
| Database | Dexie.js (IndexedDB wrapper) |
| Mobile Build | Capacitor JS |
| CI/CD | GitHub Actions |

---

## Catatan Keamanan

- PIN disimpan sebagai hash sederhana di IndexedDB lokal
- Tidak ada data yang dikirim ke server (offline-first)
- Untuk produksi, ganti `simpleHash` dengan `crypto.subtle.digest` (SHA-256)

---

## Cara Reset PIN

Jika lupa PIN, klik **"Lupa / Reset PIN"** di layar PIN. PIN akan direset tanpa menghapus data.

# Fulus — Keuangan Multi-Organisasi

Aplikasi pencatatan kas untuk beberapa organisasi sekaligus (RT, UPZ, Voly, Pengajian, dst).
Frontend statis (Neumorphism, PWA) di GitHub Pages + backend Google Apps Script + database Google Sheets.

## Struktur

```
fulus/
├── backend/           # Google Apps Script (clasp)
│   ├── appsscript.json
│   ├── .clasp.json
│   ├── Code.gs        # router doGet/doPost
│   ├── Config.gs      # konfigurasi + setup sheet
│   ├── Db.gs          # helper baca/tulis sheet
│   ├── Auth.gs        # login by email + token
│   ├── Transaction.gs # CRUD transaksi
│   └── Report.gs      # dashboard, laporan, export, admin
└── frontend/          # GitHub Pages
    ├── index.html
    ├── manifest.json
    ├── sw.js
    ├── icon.svg
    ├── css/style.css
    └── js/
        ├── api.js
        └── app.js
```

## 1. Deploy Backend (clasp)

`backend/.clasp.json` sudah diisi dengan scriptId Anda. Jika belum login:

```bash
npm i -g @google/clasp
clasp login
clasp push
clasp deploy --description "Fulus API v1"
```

Setelah deploy, salin URL `/exec` (bukan `/dev`) ke `frontend/js/api.js` → `API_URL`.

Set juga **Execute as: Me** dan **Who has access: Anyone** di deployment.

### Inisialisasi Spreadsheet (via Script Properties)

`SPREADSHEET_ID` disimpan di **Script Properties** (bukan hardcoded), sama seperti project absensi Anda. Jalankan sekali lewat URL:

```
<API_URL>?action=setup&spreadsheet_id=<ID_SPREADSHEET_ANDA>
```

Atau dari editor Apps Script: **Run → setup** (pakai `spreadsheet_id` param opsional; jika kosong akan pakai Script Properties → spreadsheet aktif → buat baru).

Fungsi juga tersedia:
- `setSpreadsheetId(id)` — simpan & validasi ID ke Script Properties.
- `setup(spreadsheet_id)` — inisialisasi sheet + seed.

Sheet `Users`, `Organizations`, `Categories`, `Transactions`, `AuditLog` dibuat otomatis + seed 4 organisasi & kategori default.

### Tambah Pengguna Pertama (Admin)

Buka spreadsheet → sheet `Users` → tambah baris:

| id | email | nama | role | org_access | aktif |
|----|-------|------|------|------------|-------|
| (acak) | admin@email.com | Admin | admin | * | TRUE |

`org_access` untuk admin global diisi `*`. Untuk viewer, isi daftar `org_id` dipisah koma (kosong = semua).

## 2. Deploy Frontend (GitHub Pages)

```bash
git remote add origin https://github.com/appscriptkhoer-design/Fulus.git
git push -u origin main
```

Di GitHub → Settings → Pages → Source: `main` branch, folder `/frontend`.

## 3. Fitur

- Login berbasis email (cek sheet `Users`), role `admin` / `viewer`.
- Dashboard saldo per organisasi + total, filter periode.
- CRUD transaksi: masuk/keluar, jumlah, tanggal, kategori, metode, keterangan.
- Referensi otomatis (`IN-YYYYMMDD-NNN` / `OUT-YYYYMMDD-NNN`).
- Filter & pencarian transaksi, paginasi.
- Laporan harian / per organisasi / per metode + export CSV.
- Neumorphism UI, mode terang/gelap (oranye–putih–hitam).
- PWA: bisa dipasang di HP, cache app shell.

## 4. Catatan Keamanan

- Autentikasi email-only (sesuai permintaan). Token HMAC berlaku 12 jam.
- Semua akses divalidasi di backend (role + `org_access`).
- Jangan simpan data sensitif di frontend.

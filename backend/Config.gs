const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function Props_(k) {
  return PropertiesService.getScriptProperties().getProperty(k);
}
function PropsSet_(k, v) {
  PropertiesService.getScriptProperties().setProperty(k, String(v));
}

function getSpreadsheetId_() {
  const id = Props_('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID belum diatur. Jalankan setup() atau setSpreadsheetId(id).');
  return id;
}

function setSpreadsheetId(id) {
  const v = String(id || '').trim();
  if (!v) throw new Error('Spreadsheet ID wajib diisi.');
  const ss = SpreadsheetApp.openById(v); // validasi bisa dibuka
  PropsSet_('SPREADSHEET_ID', v);
  return { ok: true, data: { spreadsheet_id: v, name: ss.getName(), url: ss.getUrl() } };
}

// Dipanggil tanpa login: hanya boleh selama belum ada satu pun user
function guardFirstRun_() {
  if (!Props_('SPREADSHEET_ID')) return; // spreadsheet belum terhubung = tahap inisialisasi
  if (readAll_(SH.users).length > 0) {
    throw new Error('Akses ditolak: inisialisasi hanya berlaku sebelum ada user');
  }
}

const SH = {
  users: 'Users',
  orgs: 'Organizations',
  cats: 'Categories',
  units: 'Units',
  tx: 'Transactions',
  audit: 'AuditLog'
};

const HEADERS = {
  Users: ['id', 'email', 'nama', 'role', 'org_access', 'aktif', 'created_at'],
  Organizations: ['id', 'nama', 'deskripsi', 'mata_uang', 'urutan', 'aktif', 'created_at'],
  Categories: ['id', 'org_id', 'nama', 'tipe', 'aktif', 'created_at'],
  Units: ['id', 'org_id', 'nama', 'aktif', 'created_at'],
  Transactions: ['id', 'org_id', 'unit_id', 'tipe', 'jumlah', 'tanggal', 'kategori_id', 'keterangan', 'metode', 'referensi', 'status', 'created_by', 'created_at', 'updated_at'],
  AuditLog: ['id', 'waktu', 'email', 'aksi', 'detail']
};

const DEFAULT_ORGS = [
  { nama: 'RT', deskripsi: 'Kas Rukun Tetangga' },
  { nama: 'UPZ', deskripsi: 'Unit Pengumpul Zakat' },
  { nama: 'Voly', deskripsi: 'Organisasi Bola Voli' },
  { nama: 'Pengajian', deskripsi: 'Pengajian Rutinan' }
];

const DEFAULT_CATS = [
  { nama: 'Iuran', tipe: 'masuk' },
  { nama: 'Sumbangan', tipe: 'masuk' },
  { nama: 'Donasi', tipe: 'masuk' },
  { nama: 'Operasional', tipe: 'keluar' },
  { nama: 'Perlengkapan', tipe: 'keluar' },
  { nama: 'Kegiatan', tipe: 'keluar' },
  { nama: 'Lainnya', tipe: 'semua' }
];

// Unit bawaan: nama organisasi -> daftar unit
const DEFAULT_UNITS = {
  UPZ: ['Tingkat desa', 'Kecamatan', 'Kabupaten']
};

function getSecret_() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('APP_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('APP_SECRET', s);
  }
  return s;
}

function setup(spreadsheetId) {
  // 1) id param  2) Script Properties  3) spreadsheet aktif (container-bound)  4) buat baru
  let ss = null;
  if (spreadsheetId) {
    ss = SpreadsheetApp.openById(String(spreadsheetId).trim());
  }
  if (!ss) {
    const id = Props_('SPREADSHEET_ID');
    if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  }
  if (!ss) {
    try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('Fulus - Keuangan Organisasi');
  }
  PropsSet_('SPREADSHEET_ID', ss.getId());

  Object.keys(HEADERS).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const want = HEADERS[name];
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, want.length).setValues([want]).setFontWeight('bold');
      sh.setFrozenRows(1);
      return;
    }
    // migrasi: tambahkan kolom baru di akhir bila header lama belum lengkap
    const have = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(function (v) { return String(v); });
    let tambah = [];
    want.forEach(function (h) { if (have.indexOf(h) === -1) tambah.push(h); });
    if (tambah.length) {
      const start = have.findIndex(function (v) { return v === ''; });
      const col = (start === -1 ? have.length : start) + 1;
      sh.getRange(1, col, 1, tambah.length).setValues([tambah]).setFontWeight('bold');
    }
  });

  const orgs = readAll_(SH.orgs);
  if (orgs.length === 0) {
    DEFAULT_ORGS.forEach(function (o, i) {
      appendRow_(SH.orgs, {
        id: genId_(), nama: o.nama, deskripsi: o.deskripsi,
        mata_uang: 'IDR', urutan: i + 1, aktif: true, created_at: nowISO_()
      });
    });
  }

  const cats = readAll_(SH.cats);
  if (cats.length === 0) {
    DEFAULT_CATS.forEach(function (c) {
      appendRow_(SH.cats, {
        id: genId_(), org_id: 'GLOBAL', nama: c.nama, tipe: c.tipe,
        aktif: true, created_at: nowISO_()
      });
    });
  }

  // seed unit bawaan (hanya jika sheet Units masih kosong)
  const units = readAll_(SH.units);
  if (units.length === 0) {
    const orgsNow = readAll_(SH.orgs);
    Object.keys(DEFAULT_UNITS).forEach(function (orgNama) {
      const org = orgsNow.find(function (o) { return String(o.nama) === orgNama; });
      if (!org) return;
      DEFAULT_UNITS[orgNama].forEach(function (u) {
        appendRow_(SH.units, {
          id: genId_(), org_id: org.id, nama: u,
          aktif: true, created_at: nowISO_()
        });
      });
    });
  }

  if (ss.getSheetByName('Sheet1') && ss.getSheetByName('Sheet1').getLastRow() === 0) {
    ss.deleteSheet(ss.getSheetByName('Sheet1'));
  }
  return {
    ok: true,
    data: {
      msg: 'Setup selesai',
      spreadsheet_id: ss.getId(),
      spreadsheet_url: ss.getUrl(),
      orgs: readAll_(SH.orgs).length,
      cats: readAll_(SH.cats).length,
      units: readAll_(SH.units).length
    }
  };
}

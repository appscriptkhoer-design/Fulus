function periodRange_(params) {
  let dari = params.dari, sampai = params.sampai;
  if (!dari || !sampai) {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0, 23, 59, 59, 999);
    dari = dari || fmtDate_(first);
    sampai = sampai || fmtDate_(last);
  }
  return { dari: dari, sampai: sampai };
}

function fmtDate_(d) {
  return d.getFullYear() + '-' + pad2_(d.getMonth() + 1) + '-' + pad2_(d.getDate());
}

function inRange_(t, r) {
  const d = new Date(t.tanggal);
  const a = new Date(r.dari); a.setHours(0, 0, 0, 0);
  const b = new Date(r.sampai); b.setHours(23, 59, 59, 999);
  return d >= a && d <= b;
}

function sumBy_(rows) {
  let masuk = 0, keluar = 0;
  rows.forEach(function (t) {
    const j = Number(t.jumlah) || 0;
    if (t.tipe === 'masuk') masuk += j; else keluar += j;
  });
  return { masuk: masuk, keluar: keluar, saldo: masuk - keluar };
}

function dashboard_(user, params) {
  const orgs = readAll_(SH.orgs).filter(function (o) {
    return String(o.aktif).toUpperCase() !== 'FALSE' && canAccessOrg_(user, o.id);
  });
  const all = readAll_(SH.tx).filter(function (t) { return canAccessOrg_(user, t.org_id); });
  const r = periodRange_(params);

  const perOrg = orgs.map(function (o) {
    const rows = all.filter(function (t) { return String(t.org_id) === String(o.id) && inRange_(t, r); });
    const s = sumBy_(rows);
    const rowsAll = all.filter(function (t) { return String(t.org_id) === String(o.id); });
    const sa = sumBy_(rowsAll);
    return {
      org_id: o.id, nama: o.nama, deskripsi: o.deskripsi,
      masuk: s.masuk, keluar: s.keluar, saldo: s.saldo,
      saldo_total: sa.saldo, jumlah_transaksi: rows.length
    };
  });

  const total = sumBy_(all.filter(function (t) { return inRange_(t, r); }));
  const totalSemua = sumBy_(all);

  const kategori = {};
  all.filter(function (t) { return inRange_(t, r); }).forEach(function (t) {
    const key = t.kategori_id || '-';
    if (!kategori[key]) kategori[key] = { kategori_id: key, masuk: 0, keluar: 0, jumlah: 0 };
    const j = Number(t.jumlah) || 0;
    if (t.tipe === 'masuk') kategori[key].masuk += j; else kategori[key].keluar += j;
    kategori[key].jumlah++;
  });
  const cats = readAll_(SH.cats);
  const kategoriOut = Object.keys(kategori).map(function (k) {
    const c = cats.find(function (x) { return String(x.id) === k; });
    return Object.assign({}, kategori[k], { nama: c ? c.nama : 'Tanpa kategori' });
  }).sort(function (a, b) { return (b.masuk + b.keluar) - (a.masuk + a.keluar); });

  const recent = decorate_(all.sort(function (a, b) { return new Date(b.tanggal) - new Date(a.tanggal); }).slice(0, 8));

  return {
    ok: true,
    data: {
      periode: r,
      total: total,
      total_all: totalSemua,
      per_org: perOrg,
      kategori: kategoriOut,
      recent: recent,
      jumlah_transaksi: all.filter(function (t) { return inRange_(t, r); }).length
    }
  };
}

function reports_(user, params) {
  const r = periodRange_(params);
  const all = readAll_(SH.tx).filter(function (t) {
    return canAccessOrg_(user, t.org_id) && inRange_(t, r) &&
      (!params.org_id || String(t.org_id) === String(params.org_id)) &&
      (!params.unit_id || String(t.unit_id) === String(params.unit_id));
  });

  const harian = {};
  all.forEach(function (t) {
    const key = fmtDate_(new Date(t.tanggal));
    if (!harian[key]) harian[key] = { tanggal: key, masuk: 0, keluar: 0 };
    const j = Number(t.jumlah) || 0;
    if (t.tipe === 'masuk') harian[key].masuk += j; else harian[key].keluar += j;
  });
  const harianArr = Object.keys(harian).sort().map(function (k) {
    const h = harian[k];
    h.saldo = h.masuk - h.keluar;
    return h;
  });

  const orgs = readAll_(SH.orgs).filter(function (o) { return canAccessOrg_(user, o.id); });
  const perOrg = orgs.map(function (o) {
    const rows = all.filter(function (t) { return String(t.org_id) === String(o.id); });
    const s = sumBy_(rows);
    return { org_id: o.id, nama: o.nama, masuk: s.masuk, keluar: s.keluar, saldo: s.saldo, jumlah: rows.length };
  });

  const metode = {};
  all.forEach(function (t) {
    const m = t.metode || 'tunai';
    if (!metode[m]) metode[m] = { metode: m, masuk: 0, keluar: 0 };
    const j = Number(t.jumlah) || 0;
    if (t.tipe === 'masuk') metode[m].masuk += j; else metode[m].keluar += j;
  });

  // ringkasan per unit (hanya transaksi yang punya unit)
  const unitsAll = readAll_(SH.units);
  const perUnit = {};
  all.filter(function (t) { return t.unit_id; }).forEach(function (t) {
    const key = String(t.unit_id);
    if (!perUnit[key]) {
      const u = unitsAll.find(function (x) { return String(x.id) === key; });
      const o = u ? orgs.find(function (x) { return String(x.id) === String(u.org_id); }) : null;
      perUnit[key] = {
        unit_id: key, nama: u ? u.nama : key,
        organisasi: o ? o.nama : '', masuk: 0, keluar: 0, jumlah: 0
      };
    }
    const j = Number(t.jumlah) || 0;
    if (t.tipe === 'masuk') perUnit[key].masuk += j; else perUnit[key].keluar += j;
    perUnit[key].jumlah++;
  });

  return {
    ok: true,
    data: {
      periode: r,
      total: sumBy_(all),
      harian: harianArr,
      per_org: perOrg,
      per_unit: Object.keys(perUnit).map(function (k) {
        const x = perUnit[k];
        x.saldo = x.masuk - x.keluar;
        return x;
      }),
      metode: Object.keys(metode).map(function (k) { return metode[k]; }),
      transaksi: decorate_(all.sort(function (a, b) { return new Date(b.tanggal) - new Date(a.tanggal); }))
    }
  };
}

function exportCsv_(user, params) {
  const res = reports_(user, params);
  const rows = res.data.transaksi;
  const head = ['referensi', 'tanggal', 'organisasi', 'unit', 'tipe', 'kategori', 'jumlah', 'metode', 'keterangan', 'oleh'];
  const lines = [head.join(',')];
  rows.forEach(function (t) {
    lines.push([
      t.referensi, fmtDate_(new Date(t.tanggal)), csvEsc_(t.org_nama), csvEsc_(t.unit_nama), t.tipe,
      csvEsc_(t.kategori_nama), t.jumlah, t.metode, csvEsc_(t.keterangan), csvEsc_(t.created_nama)
    ].join(','));
  });
  return { ok: true, data: { csv: lines.join('\n'), filename: 'laporan-' + res.data.periode.dari + '_' + res.data.periode.sampai + '.csv' } };
}

function csvEsc_(v) {
  const s = String(v === null || v === undefined ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function saveUser_(by, p) {
  if (!p.email) throw new Error('Email wajib diisi');
  if (['admin', 'viewer'].indexOf(String(p.role)) === -1) throw new Error('Role tidak valid');
  const email = String(p.email).trim().toLowerCase();
  const target = p.id ? findById_(SH.users, p.id) : findUserByEmail_(email);
  const rec = {
    email: email,
    nama: p.nama || email.split('@')[0],
    role: p.role,
    org_access: p.role === 'admin' ? '*' : (p.org_access || ''),
    aktif: p.aktif === false ? false : true
  };
  if (target) {
    updateRow_(SH.users, target.id, rec);
    audit_(by.email, 'user.update', email);
    return { ok: true, data: publicUser_(findById_(SH.users, target.id)) };
  }
  const newRec = Object.assign({ id: genId_(), created_at: nowISO_() }, rec);
  withLock_(function () { appendRow_(SH.users, newRec); });
  audit_(by.email, 'user.create', email);
  return { ok: true, data: publicUser_(newRec) };
}

function saveOrg_(by, p) {
  if (p._reactivate) {
    const cur = findById_(SH.orgs, p.id);
    if (!cur) throw new Error('Organisasi tidak ditemukan');
    updateRow_(SH.orgs, p.id, { aktif: true });
    audit_(by.email, 'org.enable', cur.nama);
    return { ok: true, data: findById_(SH.orgs, p.id) };
  }
  if (!p.nama) throw new Error('Nama organisasi wajib diisi');
  if (p.id) {
    updateRow_(SH.orgs, p.id, { nama: p.nama, deskripsi: p.deskripsi || '', urutan: Number(p.urutan) || 0, aktif: p.aktif === false ? false : true });
    audit_(by.email, 'org.update', String(p.id));
    return { ok: true, data: findById_(SH.orgs, p.id) };
  }
  const rec = { id: genId_(), nama: p.nama, deskripsi: p.deskripsi || '', mata_uang: 'IDR', urutan: Number(p.urutan) || 99, aktif: true, created_at: nowISO_() };
  withLock_(function () { appendRow_(SH.orgs, rec); });
  audit_(by.email, 'org.create', rec.nama);
  return { ok: true, data: rec };
}

function saveCat_(by, p) {
  if (p._reactivate) {
    const cur = findById_(SH.cats, p.id);
    if (!cur) throw new Error('Kategori tidak ditemukan');
    updateRow_(SH.cats, p.id, { aktif: true });
    audit_(by.email, 'cat.enable', cur.nama);
    return { ok: true, data: findById_(SH.cats, p.id) };
  }
  if (!p.nama) throw new Error('Nama kategori wajib diisi');
  if (['masuk', 'keluar', 'semua'].indexOf(String(p.tipe)) === -1) throw new Error('Tipe kategori tidak valid');
  if (p.id) {
    updateRow_(SH.cats, p.id, { nama: p.nama, tipe: p.tipe, org_id: p.org_id || 'GLOBAL', aktif: p.aktif === false ? false : true });
    audit_(by.email, 'cat.update', String(p.id));
    return { ok: true, data: findById_(SH.cats, p.id) };
  }
  const rec = { id: genId_(), org_id: p.org_id || 'GLOBAL', nama: p.nama, tipe: p.tipe, aktif: true, created_at: nowISO_() };
  withLock_(function () { appendRow_(SH.cats, rec); });
  audit_(by.email, 'cat.create', rec.nama);
  return { ok: true, data: rec };
}

// Hapus organisasi. Masih dipakai transaksi -> dinonaktifkan (riwayat tetap utuh).
function deleteOrg_(by, p) {
  const org = findById_(SH.orgs, p.id);
  if (!org) throw new Error('Organisasi tidak ditemukan');
  const dipakai = readAll_(SH.tx).filter(function (t) { return String(t.org_id) === String(p.id); }).length;
  if (dipakai > 0) {
    updateRow_(SH.orgs, p.id, { aktif: false });
    audit_(by.email, 'org.disable', org.nama + ' (' + dipakai + ' trx)');
    return { ok: true, data: { mode: 'disabled', aktif: false, transaksi: dipakai, nama: org.nama } };
  }
  deleteRow_(SH.orgs, p.id);
  audit_(by.email, 'org.delete', org.nama);
  return { ok: true, data: { mode: 'deleted', aktif: true, transaksi: 0, nama: org.nama } };
}

// Hapus kategori. Masih dipakai transaksi -> dinonaktifkan.
function deleteCat_(by, p) {
  const cat = findById_(SH.cats, p.id);
  if (!cat) throw new Error('Kategori tidak ditemukan');
  const dipakai = readAll_(SH.tx).filter(function (t) { return String(t.kategori_id) === String(p.id); }).length;
  if (dipakai > 0) {
    updateRow_(SH.cats, p.id, { aktif: false });
    audit_(by.email, 'cat.disable', cat.nama + ' (' + dipakai + ' trx)');
    return { ok: true, data: { mode: 'disabled', aktif: false, transaksi: dipakai, nama: cat.nama } };
  }
  deleteRow_(SH.cats, p.id);
  audit_(by.email, 'cat.delete', cat.nama);
  return { ok: true, data: { mode: 'deleted', aktif: true, transaksi: 0, nama: cat.nama } };
}

/* ===== UNIT (sub organisasi, contoh UPZ: Tingkat desa/Kecamatan/Kabupaten) ===== */

function listUnits_(user, params) {
  let units = readAll_(SH.units).filter(function (u) {
    if (String(u.aktif).toUpperCase() === 'FALSE') return false;
    return canAccessOrg_(user, u.org_id);
  });
  if (params.org_id) {
    units = units.filter(function (u) { return String(u.org_id) === String(params.org_id); });
  }
  return { ok: true, data: units };
}

function saveUnit_(by, p) {
  if (p._reactivate) {
    const cur = findById_(SH.units, p.id);
    if (!cur) throw new Error('Unit tidak ditemukan');
    updateRow_(SH.units, p.id, { aktif: true });
    audit_(by.email, 'unit.enable', cur.nama);
    return { ok: true, data: findById_(SH.units, p.id) };
  }
  if (!p.nama) throw new Error('Nama unit wajib diisi');
  if (!p.org_id) throw new Error('Organisasi wajib dipilih');
  const org = findById_(SH.orgs, p.org_id);
  if (!org) throw new Error('Organisasi tidak ditemukan');
  if (p.id) {
    updateRow_(SH.units, p.id, { nama: p.nama, org_id: p.org_id, aktif: p.aktif === false ? false : true });
    audit_(by.email, 'unit.update', p.nama);
    return { ok: true, data: findById_(SH.units, p.id) };
  }
  const rec = { id: genId_(), org_id: p.org_id, nama: p.nama, aktif: true, created_at: nowISO_() };
  withLock_(function () { appendRow_(SH.units, rec); });
  audit_(by.email, 'unit.create', rec.nama + ' @' + org.nama);
  return { ok: true, data: rec };
}

function deleteUnit_(by, p) {
  const unit = findById_(SH.units, p.id);
  if (!unit) throw new Error('Unit tidak ditemukan');
  const dipakai = readAll_(SH.tx).filter(function (t) { return String(t.unit_id) === String(p.id); }).length;
  if (dipakai > 0) {
    updateRow_(SH.units, p.id, { aktif: false });
    audit_(by.email, 'unit.disable', unit.nama + ' (' + dipakai + ' trx)');
    return { ok: true, data: { mode: 'disabled', aktif: false, transaksi: dipakai, nama: unit.nama } };
  }
  deleteRow_(SH.units, p.id);
  audit_(by.email, 'unit.delete', unit.nama);
  return { ok: true, data: { mode: 'deleted', aktif: true, transaksi: 0, nama: unit.nama } };
}

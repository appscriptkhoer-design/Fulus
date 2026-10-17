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
      (!params.org_id || String(t.org_id) === String(params.org_id));
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

  return {
    ok: true,
    data: {
      periode: r,
      total: sumBy_(all),
      harian: harianArr,
      per_org: perOrg,
      metode: Object.keys(metode).map(function (k) { return metode[k]; }),
      transaksi: decorate_(all.sort(function (a, b) { return new Date(b.tanggal) - new Date(a.tanggal); }))
    }
  };
}

function exportCsv_(user, params) {
  const res = reports_(user, params);
  const rows = res.data.transaksi;
  const head = ['referensi', 'tanggal', 'organisasi', 'tipe', 'kategori', 'jumlah', 'metode', 'keterangan', 'oleh'];
  const lines = [head.join(',')];
  rows.forEach(function (t) {
    lines.push([
      t.referensi, fmtDate_(new Date(t.tanggal)), csvEsc_(t.org_nama), t.tipe,
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

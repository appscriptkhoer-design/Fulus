function listOrganizations_(user) {
  const orgs = readAll_(SH.orgs).filter(function (o) {
    return String(o.aktif).toUpperCase() !== 'FALSE' && canAccessOrg_(user, o.id);
  }).sort(function (a, b) { return (a.urutan || 0) - (b.urutan || 0); });
  return { ok: true, data: orgs };
}

function listCategories_(user, params) {
  let cats = readAll_(SH.cats).filter(function (c) {
    if (String(c.aktif).toUpperCase() === 'FALSE') return false;
    if (c.org_id === 'GLOBAL') return true;
    return canAccessOrg_(user, c.org_id);
  });
  if (params.org_id) {
    cats = cats.filter(function (c) { return c.org_id === 'GLOBAL' || c.org_id === params.org_id; });
  }
  if (params.tipe) {
    cats = cats.filter(function (c) { return c.tipe === params.tipe || c.tipe === 'semua'; });
  }
  return { ok: true, data: cats };
}

function listTransactions_(user, params) {
  let rows = readAll_(SH.tx).filter(function (t) { return canAccessOrg_(user, t.org_id); });

  if (params.org_id) rows = rows.filter(function (t) { return String(t.org_id) === String(params.org_id); });
  if (params.tipe) rows = rows.filter(function (t) { return String(t.tipe) === String(params.tipe); });
  if (params.kategori_id) rows = rows.filter(function (t) { return String(t.kategori_id) === String(params.kategori_id); });
  if (params.q) {
    const q = String(params.q).toLowerCase();
    rows = rows.filter(function (t) {
      return String(t.keterangan || '').toLowerCase().indexOf(q) !== -1 ||
        String(t.referensi || '').toLowerCase().indexOf(q) !== -1;
    });
  }
  if (params.dari) {
    const d = new Date(params.dari); d.setHours(0, 0, 0, 0);
    rows = rows.filter(function (t) { return new Date(t.tanggal) >= d; });
  }
  if (params.sampai) {
    const d = new Date(params.sampai); d.setHours(23, 59, 59, 999);
    rows = rows.filter(function (t) { return new Date(t.tanggal) <= d; });
  }

  rows.sort(function (a, b) { return new Date(b.tanggal) - new Date(a.tanggal); });

  const page = parseInt(params.page || '1', 10);
  const size = parseInt(params.size || '50', 10);
  const total = rows.length;
  const slice = rows.slice((page - 1) * size, page * size);

  return { ok: true, data: { total: total, page: page, size: size, items: decorate_(slice) } };
}

function decorate_(rows) {
  const orgs = readAll_(SH.orgs);
  const cats = readAll_(SH.cats);
  const users = readAll_(SH.users);
  return rows.map(function (t) {
    const o = orgs.find(function (x) { return String(x.id) === String(t.org_id); });
    const c = cats.find(function (x) { return String(x.id) === String(t.kategori_id); });
    const u = users.find(function (x) { return String(x.id) === String(t.created_by); });
    return Object.assign({}, t, {
      org_nama: o ? o.nama : t.org_id,
      kategori_nama: c ? c.nama : '',
      created_nama: u ? u.nama : (t.created_by || '')
    });
  });
}

function genRef_(tipe) {
  const d = new Date();
  const y = d.getFullYear();
  const m = pad2_(d.getMonth() + 1);
  const day = pad2_(d.getDate());
  const seq = readAll_(SH.tx).filter(function (t) {
    const td = new Date(t.tanggal);
    return td.getFullYear() === y && (td.getMonth() + 1) === +m && td.getDate() === +day;
  }).length + 1;
  const prefix = tipe === 'masuk' ? 'IN' : 'OUT';
  return prefix + '-' + y + m + day + '-' + String(seq).padStart(3, '0');
}

function pad2_(n) { return String(n).padStart(2, '0'); }

function validateTx_(p) {
  if (!p.org_id) throw new Error('Organisasi wajib diisi');
  if (!p.tipe || ['masuk', 'keluar'].indexOf(p.tipe) === -1) throw new Error('Tipe tidak valid');
  const jml = Number(p.jumlah);
  if (!isFinite(jml) || jml <= 0) throw new Error('Jumlah harus > 0');
  if (!p.tanggal) throw new Error('Tanggal wajib diisi');
  return {
    org_id: String(p.org_id),
    tipe: p.tipe,
    jumlah: jml,
    tanggal: p.tanggal,
    kategori_id: p.kategori_id || '',
    keterangan: p.keterangan || '',
    metode: p.metode || 'tunai'
  };
}

function createTransaction_(user, payload) {
  const v = validateTx_(payload);
  if (!canAccessOrg_(user, v.org_id)) throw new Error('Akses organisasi ditolak');
  return withLock_(function () {
    const rec = Object.assign({}, v, {
      id: genId_(),
      referensi: genRef_(v.tipe),
      status: 'aktif',
      created_by: user.id,
      created_at: nowISO_(),
      updated_at: nowISO_()
    });
    appendRow_(SH.tx, rec);
    audit_(user.email, 'tx.create', rec.referensi + ' ' + v.tipe + ' ' + v.jumlah);
    return { ok: true, data: decorate_([rec])[0] };
  });
}

function updateTransaction_(user, payload) {
  const existing = findById_(SH.tx, payload.id);
  if (!existing) throw new Error('Transaksi tidak ditemukan');
  if (!canAccessOrg_(user, existing.org_id)) throw new Error('Akses organisasi ditolak');
  const v = validateTx_(payload);
  if (!canAccessOrg_(user, v.org_id)) throw new Error('Akses organisasi ditolak');
  return withLock_(function () {
    v.updated_at = nowISO_();
    updateRow_(SH.tx, payload.id, v);
    audit_(user.email, 'tx.update', payload.id);
    return { ok: true, data: decorate_([findById_(SH.tx, payload.id)])[0] };
  });
}

function deleteTransaction_(user, payload) {
  const existing = findById_(SH.tx, payload.id);
  if (!existing) throw new Error('Transaksi tidak ditemukan');
  if (!canAccessOrg_(user, existing.org_id)) throw new Error('Akses organisasi ditolak');
  return withLock_(function () {
    const done = deleteRow_(SH.tx, payload.id);
    audit_(user.email, 'tx.delete', payload.id);
    return { ok: done, data: { deleted: done } };
  });
}

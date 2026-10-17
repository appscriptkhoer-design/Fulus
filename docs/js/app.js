(function () {
  'use strict';

  const $ = function (s) { return document.querySelector(s); };
  const $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  const state = {
    user: null,
    orgs: [],
    cats: [],
    txPage: 1,
    txTotal: 0,
    txSize: 50
  };

  const rupiah = function (n) {
    return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
  };
  const fmtTgl = function (d) {
    if (!d) return '-';
    const x = new Date(d);
    if (isNaN(x.getTime())) return String(d);
    return x.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const today = function () { return new Date().toISOString().slice(0, 10); };
  const firstDay = function () { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
  const lastDay = function () { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10); };

  function toast(msg, isErr) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (isErr ? ' err' : '');
    clearTimeout(t._tm);
    t._tm = setTimeout(function () { t.classList.add('hidden'); }, 2600);
  }

  /* ---------- THEME ---------- */
  function applyTheme(th) {
    document.body.setAttribute('data-theme', th);
    localStorage.setItem('fulus_theme', th);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = th === 'dark' ? '#121216' : '#f0f2f5';
  }
  $('#theme-toggle').addEventListener('click', function () {
    applyTheme(document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  /* ---------- NAV ---------- */
  function showPage(name) {
    $$('.page').forEach(function (p) { p.classList.add('hidden'); });
    const el = $('#page-' + name);
    if (el) el.classList.remove('hidden');
    $$('.nav-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.page === name); });
    if (name === 'dashboard') loadDashboard();
    if (name === 'transaksi') loadTransactions();
    if (name === 'laporan') loadReports();
    if (name === 'pengaturan') loadSettings();
    window.scrollTo(0, 0);
  }
  $$('.nav-btn').forEach(function (b) {
    b.addEventListener('click', function () { showPage(b.dataset.page); });
  });

  /* ---------- LOGIN ---------- */
  $('#login-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const btn = $('#login-btn');
    const err = $('#login-err');
    err.textContent = '';
    btn.textContent = 'Memeriksa...';
    btn.disabled = true;
    try {
      const d = await API.post('login', { email: $('#login-email').value.trim() });
      localStorage.setItem('fulus_token', d.token);
      localStorage.setItem('fulus_user', JSON.stringify(d.user));
      state.user = d.user;
      enterApp();
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      btn.textContent = 'Masuk';
      btn.disabled = false;
    }
  });

  $('#logout-btn').addEventListener('click', function () {
    localStorage.removeItem('fulus_token');
    localStorage.removeItem('fulus_user');
    state.user = null;
    $('#view-app').classList.add('hidden');
    $('#view-login').classList.remove('hidden');
  });

  async function tryRestore() {
    const raw = localStorage.getItem('fulus_user');
    if (!raw || !localStorage.getItem('fulus_token')) return;
    try {
      state.user = JSON.parse(raw);
      const me = await API.get('me');
      state.user = me;
      enterApp();
    } catch (e) {
      localStorage.removeItem('fulus_token');
      localStorage.removeItem('fulus_user');
    }
  }

  function enterApp() {
    $('#view-login').classList.add('hidden');
    $('#view-app').classList.remove('hidden');
    $('#user-chip').textContent = (state.user.nama || state.user.email) + ' · ' + state.user.role;
    initFilters();
    loadMeta();
    showPage('dashboard');
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }

  async function loadMeta() {
    try {
      state.orgs = await API.get('organizations');
      state.cats = await API.get('categories');
      fillOrgSelects();
    } catch (e) { toast(e.message, true); }
  }

  function fillOrgSelects() {
    const opts = state.orgs.map(function (o) { return '<option value="' + o.id + '">' + esc(o.nama) + '</option>'; }).join('');
    ['#f-org', '#lap-org', '#tx-org'].forEach(function (sel) {
      const el = $(sel);
      const cur = el.value;
      el.innerHTML = (sel === '#tx-org' ? '' : '<option value="">Semua organisasi</option>') + opts;
      if (cur) el.value = cur;
    });
  }

  function fillCatSelect(tipe, selected) {
    const sel = $('#tx-kategori');
    const list = state.cats.filter(function (c) {
      return c.tipe === tipe || c.tipe === 'semua';
    });
    sel.innerHTML = '<option value="">Tanpa kategori</option>' + list.map(function (c) {
      return '<option value="' + c.id + '">' + esc(c.nama) + '</option>';
    }).join('');
    if (selected) sel.value = selected;
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  /* ---------- DASHBOARD ---------- */
  function initFilters() {
    $('#dash-dari').value = firstDay();
    $('#dash-sampai').value = lastDay();
    $('#lap-dari').value = firstDay();
    $('#lap-sampai').value = lastDay();
    $('#tx-tanggal').value = today();
  }

  $('#dash-refresh').addEventListener('click', loadDashboard);

  async function loadDashboard() {
    try {
      const d = await API.get('dashboard', { dari: $('#dash-dari').value, sampai: $('#dash-sampai').value });
      $('#st-saldo').textContent = rupiah(d.total_all.saldo);
      $('#st-masuk').textContent = rupiah(d.total.masuk);
      $('#st-keluar').textContent = rupiah(d.total.keluar);

      $('#org-cards').innerHTML = d.per_org.map(function (o) {
        return '<div class="neu-card org-card">' +
          '<div class="oc-name">' + esc(o.nama) + '</div>' +
          '<div class="oc-desc">' + esc(o.deskripsi || '') + '</div>' +
          '<div class="oc-bal">' + rupiah(o.saldo) + '</div>' +
          '<div class="oc-mini"><span class="in">↑ ' + rupiah(o.masuk) + '</span><span class="out">↓ ' + rupiah(o.keluar) + '</span></div>' +
          '<div class="oc-mini muted" style="margin-top:6px">Total: ' + rupiah(o.saldo_total) + ' · ' + o.jumlah_transaksi + ' trx</div>' +
          '</div>';
      }).join('') || '<div class="empty">Belum ada organisasi</div>';

      const max = Math.max.apply(null, d.kategori.map(function (k) { return k.masuk + k.keluar; }).concat([1]));
      $('#cat-bars').innerHTML = d.kategori.slice(0, 8).map(function (k) {
        const tot = k.masuk + k.keluar;
        const pct = Math.round((tot / max) * 100);
        return '<div class="cat-bar">' +
          '<div class="cb-top"><span>' + esc(k.nama) + '</span><span>' + rupiah(tot) + '</span></div>' +
          '<div class="cb-track"><div class="cb-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="cb-sub"><span>' + k.jumlah + ' transaksi</span><span>M:' + rupiah(k.masuk) + ' K:' + rupiah(k.keluar) + '</span></div>' +
          '</div>';
      }).join('') || '<div class="empty">Belum ada transaksi periode ini</div>';

      renderTxList('#recent-list', d.recent, false);
    } catch (e) { toast(e.message, true); }
  }

  /* ---------- TRANSAKSI ---------- */
  function renderTxList(sel, items, editable) {
    const el = $(sel);
    if (!items || items.length === 0) {
      el.innerHTML = '<div class="empty">Belum ada transaksi</div>';
      return;
    }
    el.innerHTML = items.map(function (t) {
      const isIn = t.tipe === 'masuk';
      const amt = (isIn ? '+ ' : '- ') + rupiah(t.jumlah);
      const acts = editable ? '<div class="tx-actions">' +
        '<button class="mini-btn" data-edit="' + t.id + '" title="Edit">✎</button>' +
        '<button class="mini-btn" data-del="' + t.id + '" title="Hapus">🗑</button></div>' : '';
      return '<div class="tx-item">' +
        '<div class="tx-ico ' + (isIn ? 'in' : 'out') + '">' + (isIn ? '↓' : '↑') + '</div>' +
        '<div class="tx-body">' +
        '<div class="tx-title">' + esc(t.keterangan || t.kategori_nama || (isIn ? 'Pemasukan' : 'Pengeluaran')) + '</div>' +
        '<div class="tx-sub">' + esc(t.org_nama) + ' · ' + esc(t.referensi) + ' · ' + fmtTgl(t.tanggal) + (t.metode ? ' · ' + esc(t.metode) : '') + '</div>' +
        '</div>' +
        '<div class="tx-amt ' + (isIn ? 'in' : 'out') + '">' + amt + '</div>' + acts +
        '</div>';
    }).join('');

    if (editable) {
      $$('[data-edit]').forEach(function (b) { b.addEventListener('click', function () { openTxModal(b.dataset.edit); }); });
      $$('[data-del]').forEach(function (b) { b.addEventListener('click', function () { delTx(b.dataset.del); }); });
    }
  }

  ['#f-cari', '#f-org', '#f-tipe', '#f-dari', '#f-sampai'].forEach(function (sel) {
    const el = $(sel);
    el.addEventListener(el.tagName === 'INPUT' && el.type !== 'date' ? 'input' : 'change', debounce(function () {
      state.txPage = 1;
      loadTransactions();
    }, 400));
  });

  function debounce(fn, ms) {
    let t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  async function loadTransactions() {
    try {
      const d = await API.get('transactions', {
        q: $('#f-cari').value, org_id: $('#f-org').value, tipe: $('#f-tipe').value,
        dari: $('#f-dari').value, sampai: $('#f-sampai').value,
        page: state.txPage, size: state.txSize
      });
      state.txTotal = d.total;
      const canEdit = state.user.role === 'admin';
      renderTxList('#tx-list', d.items, canEdit);
      const pages = Math.max(1, Math.ceil(d.total / d.size));
      $('#pg-info').textContent = 'Hal. ' + d.page + '/' + pages + ' · ' + d.total + ' data';
    } catch (e) { toast(e.message, true); }
  }

  $('#pg-prev').addEventListener('click', function () { if (state.txPage > 1) { state.txPage--; loadTransactions(); } });
  $('#pg-next').addEventListener('click', function () {
    const pages = Math.max(1, Math.ceil(state.txTotal / state.txSize));
    if (state.txPage < pages) { state.txPage++; loadTransactions(); }
  });

  /* ---------- MODAL TRANSAKSI ---------- */
  $('#btn-add-tx').addEventListener('click', function () { openTxModal(null); });
  $('#tx-close').addEventListener('click', closeTxModal);
  $('#modal-tx').addEventListener('click', function (e) { if (e.target === $('#modal-tx')) closeTxModal(); });

  $$('input[name="tx-tipe"]').forEach(function (r) {
    r.addEventListener('change', function () { fillCatSelect(r.value, $('#tx-kategori').value); });
  });

  function openTxModal(id) {
    const m = $('#modal-tx');
    $('#tx-err').textContent = '';
    if (id) {
      API.get('transaction.get', { id: id }).then(function (t) {
        $('#tx-modal-title').textContent = 'Edit Transaksi';
        $('#tx-id').value = t.id;
        $$('input[name="tx-tipe"]').forEach(function (r) { r.checked = r.value === t.tipe; });
        $('#tx-org').value = t.org_id;
        $('#tx-jumlah').value = t.jumlah;
        $('#tx-tanggal').value = t.tanggal ? new Date(t.tanggal).toISOString().slice(0, 10) : today();
        fillCatSelect(t.tipe, t.kategori_id);
        $('#tx-metode').value = t.metode || 'tunai';
        $('#tx-ket').value = t.keterangan || '';
      }).catch(function (e) { toast(e.message, true); });
    } else {
      $('#tx-modal-title').textContent = 'Tambah Transaksi';
      $('#tx-id').value = '';
      $$('input[name="tx-tipe"]').forEach(function (r) { r.checked = r.value === 'masuk'; });
      $('#tx-org').value = state.orgs.length ? state.orgs[0].id : '';
      $('#tx-jumlah').value = '';
      $('#tx-tanggal').value = today();
      fillCatSelect('masuk', '');
      $('#tx-metode').value = 'tunai';
      $('#tx-ket').value = '';
    }
    m.classList.remove('hidden');
  }

  function closeTxModal() { $('#modal-tx').classList.add('hidden'); }

  $('#tx-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const err = $('#tx-err');
    err.textContent = '';
    const payload = {
      id: $('#tx-id').value || undefined,
      org_id: $('#tx-org').value,
      tipe: $$('input[name="tx-tipe"]').find(function (r) { return r.checked; }).value,
      jumlah: Number($('#tx-jumlah').value),
      tanggal: $('#tx-tanggal').value,
      kategori_id: $('#tx-kategori').value,
      metode: $('#tx-metode').value,
      keterangan: $('#tx-ket').value.trim()
    };
    try {
      await API.post(payload.id ? 'transaction.update' : 'transaction.create', payload);
      closeTxModal();
      toast('Tersimpan');
      loadTransactions();
      loadMeta();
    } catch (ex) { err.textContent = ex.message; }
  });

  async function delTx(id) {
    if (!confirm('Hapus transaksi ini?')) return;
    try {
      await API.post('transaction.delete', { id: id });
      toast('Dihapus');
      loadTransactions();
    } catch (e) { toast(e.message, true); }
  }

  /* ---------- LAPORAN ---------- */
  $('#lap-refresh').addEventListener('click', loadReports);
  $('#btn-export').addEventListener('click', async function () {
    try {
      const d = await API.get('export', { dari: $('#lap-dari').value, sampai: $('#lap-sampai').value, org_id: $('#lap-org').value });
      const blob = new Blob(['\ufeff' + d.csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = d.filename;
      a.click();
      URL.revokeObjectURL(a.href);
      toast('CSV diunduh');
    } catch (e) { toast(e.message, true); }
  });

  async function loadReports() {
    try {
      const d = await API.get('reports', { dari: $('#lap-dari').value, sampai: $('#lap-sampai').value, org_id: $('#lap-org').value });
      $('#lp-masuk').textContent = rupiah(d.total.masuk);
      $('#lp-keluar').textContent = rupiah(d.total.keluar);
      $('#lp-saldo').textContent = rupiah(d.total.saldo);

      $('#lap-harian').innerHTML = tableHtml(
        ['Tanggal', 'Masuk', 'Keluar', 'Saldo'],
        d.harian.map(function (h) {
          return [fmtTgl(h.tanggal), numCell(h.masuk), numCell(-h.keluar), numCell(h.saldo)];
        })
      );

      $('#lap-org').innerHTML = tableHtml(
        ['Organisasi', 'Masuk', 'Keluar', 'Saldo', 'Jml'],
        d.per_org.map(function (o) {
          return [esc(o.nama), numCell(o.masuk), numCell(-o.keluar), numCell(o.saldo), String(o.jumlah)];
        })
      );

      $('#lap-metode').innerHTML = tableHtml(
        ['Metode', 'Masuk', 'Keluar'],
        d.metode.map(function (m) { return [esc(m.metode), numCell(m.masuk), numCell(-m.keluar)]; })
      );
    } catch (e) { toast(e.message, true); }
  }

  function numCell(n) {
    const v = Number(n) || 0;
    const cls = v >= 0 ? 'in-txt' : 'out-txt';
    return { html: '<span class="' + cls + '">' + rupiah(v) + '</span>' };
  }

  function tableHtml(head, rows) {
    if (!rows.length) return '<div class="empty">Tidak ada data</div>';
    return '<table><thead><tr>' + head.map(function (h, i) {
      return '<th' + (i > 0 ? ' class="num"' : '') + '>' + h + '</th>';
    }).join('') + '</tr></thead><tbody>' + rows.map(function (r) {
      return '<tr>' + r.map(function (c, i) {
        const txt = (c && c.html) ? c.html : c;
        return '<td' + (i > 0 ? ' class="num"' : '') + '>' + txt + '</td>';
      }).join('') + '</tr>';
    }).join('') + '</tbody></table>';
  }

  /* ---------- PENGATURAN ---------- */
  async function loadSettings() {
    const isAdmin = state.user.role === 'admin';
    $('#admin-only').classList.toggle('hidden', !isAdmin);
    $('#viewer-note').classList.toggle('hidden', isAdmin);
    if (!isAdmin) return;
    try {
      const users = await API.get('users.list');
      $('#user-list').innerHTML = users.map(function (u) {
        return '<div class="chip"><b>' + esc(u.nama) + '</b> · ' + esc(u.email) + ' · ' + esc(u.role) +
          ' <button data-deluser="' + u.id + '">✕</button></div>';
      }).join('');
      $$('[data-deluser]').forEach(function (b) {
        b.addEventListener('click', async function () {
          if (!confirm('Hapus pengguna ini?')) return;
          try { await API.post('users.delete', { id: b.dataset.deluser }); toast('Dihapus'); loadSettings(); }
          catch (e) { toast(e.message, true); }
        });
      });
    } catch (e) { toast(e.message, true); }
    loadOrgCatLists();
  }

  let editOrgId = null;
  let editCatId = null;

  async function loadOrgCatLists() {
    if (state.user.role !== 'admin') return;
    try {
      const orgs = await API.get('organizations.all');
      $('#org-list').innerHTML = orgs.map(function (o) {
        const off = String(o.aktif).toUpperCase() === 'FALSE';
        return '<div class="chip' + (off ? ' off' : '') + '">' +
          '<b>' + esc(o.nama) + '</b> ' + (off ? '(nonaktif) ' : '') +
          '<button data-editorg="' + o.id + '" title="Edit">✎</button>' +
          (off ? '<button data-onorg="' + o.id + '" title="Aktifkan">↺</button>'
               : '<button data-delorg="' + o.id + '" title="Hapus">🗑</button>') +
          '</div>';
      }).join('') || '<span class="muted">Belum ada</span>';

      const cats = await API.get('categories.all');
      $('#cat-list').innerHTML = cats.map(function (c) {
        const off = String(c.aktif).toUpperCase() === 'FALSE';
        return '<div class="chip' + (off ? ' off' : '') + '">' +
          '<b>' + esc(c.nama) + '</b> <span class="muted">' + esc(c.tipe) +
          (c.org_id && c.org_id !== 'GLOBAL' ? ' · org' : '') + '</span> ' +
          '<button data-editcat="' + c.id + '" title="Edit">✎</button>' +
          (off ? '<button data-oncat="' + c.id + '" title="Aktifkan">↺</button>'
               : '<button data-delcat="' + c.id + '" title="Hapus">🗑</button>') +
          '</div>';
      }).join('') || '<span class="muted">Belum ada</span>';

      bindOrgCatBtns();
    } catch (e) { /* daftar sekunder, abaikan */ }
  }

  function bindOrgCatBtns() {
    $$('[data-editorg]').forEach(function (b) {
      b.addEventListener('click', function () {
        API.get('organizations.all').then(function (list) {
          const org = list.find(function (x) { return String(x.id) === b.dataset.editorg; });
          if (!org) return;
          editOrgId = org.id;
          $('#o-nama').value = org.nama;
          $('#o-desc').value = org.deskripsi || '';
          $('#o-urutan').value = org.urutan || '';
          $('#o-save').textContent = 'Simpan';
          $('#o-cancel').classList.remove('hidden');
          $('#o-nama').focus();
        }).catch(function (e) { toast(e.message, true); });
      });
    });

    $$('[data-delorg]').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!confirm('Hapus organisasi ini? Jika sudah ada transaksi, ia hanya dinonaktifkan.')) return;
        try {
          const r = await API.post('orgs.delete', { id: b.dataset.delorg });
          toast(r.mode === 'deleted' ? 'Dihapus' : 'Dinonaktifkan (' + r.transaksi + ' transaksi)');
          loadOrgCatLists(); loadMeta(); loadDashboard();
        } catch (e) { toast(e.message, true); }
      });
    });

    $$('[data-onorg]').forEach(function (b) {
      b.addEventListener('click', async function () {
        try {
          await API.post('orgs.save', { id: b.dataset.onorg, nama: '', _reactivate: true });
          toast('Aktifkan'); loadOrgCatLists(); loadMeta();
        } catch (e) { toast(e.message, true); }
      });
    });

    $$('[data-editcat]').forEach(function (b) {
      b.addEventListener('click', function () {
        API.get('categories.all').then(function (list) {
          const c = list.find(function (x) { return String(x.id) === b.dataset.editcat; });
          if (!c) return;
          editCatId = c.id;
          $('#c-nama').value = c.nama;
          $('#c-tipe').value = c.tipe;
          $('#c-save').textContent = 'Simpan';
          $('#c-cancel').classList.remove('hidden');
          $('#c-nama').focus();
        }).catch(function (e) { toast(e.message, true); });
      });
    });

    $$('[data-delcat]').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!confirm('Hapus kategori ini?')) return;
        try {
          const r = await API.post('cats.delete', { id: b.dataset.delcat });
          toast(r.mode === 'deleted' ? 'Dihapus' : 'Dinonaktifkan (' + r.transaksi + ' transaksi)');
          loadOrgCatLists(); loadMeta();
        } catch (e) { toast(e.message, true); }
      });
    });

    $$('[data-oncat]').forEach(function (b) {
      b.addEventListener('click', async function () {
        try {
          await API.post('cats.save', { id: b.dataset.oncat, _reactivate: true });
          toast('Aktifkan'); loadOrgCatLists(); loadMeta();
        } catch (e) { toast(e.message, true); }
      });
    });
  }

  $('#o-cancel').addEventListener('click', function () {
    editOrgId = null;
    $('#o-nama').value = ''; $('#o-desc').value = ''; $('#o-urutan').value = '';
    $('#o-save').textContent = 'Tambah';
    $('#o-cancel').classList.add('hidden');
  });

  $('#c-cancel').addEventListener('click', function () {
    editCatId = null;
    $('#c-nama').value = '';
    $('#c-save').textContent = 'Tambah';
    $('#c-cancel').classList.add('hidden');
  });

  $('#u-save').addEventListener('click', async function () {
    try {
      await API.post('users.save', {
        email: $('#u-email').value.trim(),
        nama: $('#u-nama').value.trim(),
        role: $('#u-role').value,
        org_access: $('#u-orgs').value.trim()
      });
      toast('Pengguna disimpan');
      $('#u-email').value = ''; $('#u-nama').value = ''; $('#u-orgs').value = '';
      loadSettings();
    } catch (e) { toast(e.message, true); }
  });

  $('#o-save').addEventListener('click', async function () {
    try {
      const payload = {
        nama: $('#o-nama').value.trim(),
        deskripsi: $('#o-desc').value.trim(),
        urutan: $('#o-urutan').value ? Number($('#o-urutan').value) : undefined
      };
      if (editOrgId) payload.id = editOrgId;
      await API.post('orgs.save', payload);
      toast(editOrgId ? 'Organisasi diperbarui' : 'Organisasi ditambahkan');
      $('#o-cancel').click();
      loadMeta(); loadOrgCatLists(); loadDashboard();
    } catch (e) { toast(e.message, true); }
  });

  $('#c-save').addEventListener('click', async function () {
    try {
      const payload = { nama: $('#c-nama').value.trim(), tipe: $('#c-tipe').value };
      if (editCatId) payload.id = editCatId;
      await API.post('cats.save', payload);
      toast(editCatId ? 'Kategori diperbarui' : 'Kategori ditambahkan');
      $('#c-cancel').click();
      loadMeta(); loadOrgCatLists();
    } catch (e) { toast(e.message, true); }
  });

  /* ---------- INIT ---------- */
  applyTheme(localStorage.getItem('fulus_theme') || 'light');
  tryRestore();
})();

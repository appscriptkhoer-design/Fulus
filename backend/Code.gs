function doGet(e) {
  const p = (e && e.parameter) || {};
  const action = p.action || 'ping';
  const user = currentUser_(e);
  return json_(dispatch_(action, p, user, p));
}

function doPost(e) {
  const body = readPostBody_(e);
  const action = body.action || (e && e.parameter && e.parameter.action) || '';
  const user = currentUser_(e);
  return json_(dispatch_(action, body, user, body));
}

function dispatch_(action, params, user, payload) {
  try {
    switch (action) {
      case 'ping':
        return { ok: true, data: { pong: true, time: nowISO_() } };

      case 'setup':
        if (user) requireAdmin_(user);
        else guardFirstRun_();
        return setup(params.spreadsheet_id);

      case 'setSpreadsheetId':
        if (user) requireAdmin_(user);
        else guardFirstRun_();
        return setSpreadsheetId(params.id || payload.id);

      case 'bootstrap': {
        // Hanya jalan selama belum ada pengguna sama sekali (tahap inisialisasi)
        if (readAll_(SH.users).length > 0) {
          return { ok: false, error: 'Bootstrap hanya bisa sekali: daftarkan user via Pengaturan' };
        }
        const email = String(payload.email || '').trim().toLowerCase();
        if (!email || email.indexOf('@') === -1) return { ok: false, error: 'Email tidak valid' };
        const rec = {
          id: genId_(),
          email: email,
          nama: payload.nama || email.split('@')[0],
          role: 'admin',
          org_access: '*',
          aktif: true,
          created_at: nowISO_()
        };
        withLock_(function () { appendRow_(SH.users, rec); });
        audit_(email, 'bootstrap', 'Admin pertama dibuat');
        return login(email);
      }

      case 'login':
        return login(payload.email);

      case 'me':
        if (!user) return { ok: false, error: 'Belum login' };
        return { ok: true, data: publicUser_(user) };

      case 'organizations':
        if (!user) return { ok: false, error: 'Belum login' };
        return listOrganizations_(user);

      case 'organizations.all': {
        if (!user) return { ok: false, error: 'Belum login' };
        requireAdmin_(user);
        return { ok: true, data: readAll_(SH.orgs).sort(function (a, b) { return (a.urutan || 0) - (b.urutan || 0); }) };
      }

      case 'categories.all': {
        if (!user) return { ok: false, error: 'Belum login' };
        requireAdmin_(user);
        return { ok: true, data: readAll_(SH.cats) };
      }

      case 'units': {
        if (!user) return { ok: false, error: 'Belum login' };
        return listUnits_(user, params);
      }

      case 'units.all': {
        if (!user) return { ok: false, error: 'Belum login' };
        requireAdmin_(user);
        return { ok: true, data: readAll_(SH.units) };
      }

      case 'units.save': {
        if (!user) return { ok: false, error: 'Belum login' };
        requireAdmin_(user);
        return saveUnit_(user, payload);
      }

      case 'units.delete': {
        if (!user) return { ok: false, error: 'Belum login' };
        requireAdmin_(user);
        return deleteUnit_(user, payload);
      }

      case 'categories':
        if (!user) return { ok: false, error: 'Belum login' };
        return listCategories_(user, params);

      case 'dashboard':
        if (!user) return { ok: false, error: 'Belum login' };
        return dashboard_(user, params);

      case 'transactions':
        if (!user) return { ok: false, error: 'Belum login' };
        return listTransactions_(user, params);

      case 'transaction.get': {
        if (!user) return { ok: false, error: 'Belum login' };
        const t = findById_(SH.tx, params.id);
        if (!t) return { ok: false, error: 'Transaksi tidak ditemukan' };
        if (!canAccessOrg_(user, t.org_id)) return { ok: false, error: 'Akses ditolak' };
        return { ok: true, data: decorate_([t])[0] };
      }

      case 'transaction.create':
        if (!user) return { ok: false, error: 'Belum login' };
        return createTransaction_(user, payload);

      case 'transaction.update':
        if (!user) return { ok: false, error: 'Belum login' };
        return updateTransaction_(user, payload);

      case 'transaction.delete':
        if (!user) return { ok: false, error: 'Belum login' };
        return deleteTransaction_(user, payload);

      case 'reports':
        if (!user) return { ok: false, error: 'Belum login' };
        return reports_(user, params);

      case 'export':
        if (!user) return { ok: false, error: 'Belum login' };
        return exportCsv_(user, params);

      case 'users.list':
        if (!user) return { ok: false, error: 'Belum login' };
        requireAdmin_(user);
        return { ok: true, data: readAll_(SH.users).map(publicUser_) };

      case 'users.save': {
        if (!user) return { ok: false, error: 'Belum login' };
        requireAdmin_(user);
        return saveUser_(user, payload);
      }

      case 'users.delete': {
        if (!user) return { ok: false, error: 'Belum login' };
        requireAdmin_(user);
        if (String(payload.id) === String(user.id)) return { ok: false, error: 'Tidak bisa hapus akun sendiri' };
        const done = deleteRow_(SH.users, payload.id);
        audit_(user.email, 'user.delete', String(payload.id));
        return { ok: done, data: { deleted: done } };
      }

      case 'orgs.save': {
        if (!user) return { ok: false, error: 'Belum login' };
        requireAdmin_(user);
        return saveOrg_(user, payload);
      }

      case 'cats.save': {
        if (!user) return { ok: false, error: 'Belum login' };
        requireAdmin_(user);
        return saveCat_(user, payload);
      }

      case 'orgs.delete': {
        if (!user) return { ok: false, error: 'Belum login' };
        requireAdmin_(user);
        return deleteOrg_(user, payload);
      }

      case 'cats.delete': {
        if (!user) return { ok: false, error: 'Belum login' };
        requireAdmin_(user);
        return deleteCat_(user, payload);
      }

      default:
        return { ok: false, error: 'Aksi tidak dikenal: ' + action };
    }
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

function json_(res) {
  return ContentService.createTextOutput(JSON.stringify(res || { ok: false, error: 'empty' }))
    .setMimeType(ContentService.MimeType.JSON);
}

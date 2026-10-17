function findUserByEmail_(email) {
  if (!email) return null;
  const e = String(email).trim().toLowerCase();
  return readAll_(SH.users).find(function (u) {
    return String(u.email || '').trim().toLowerCase() === e && String(u.aktif).toUpperCase() !== 'FALSE';
  }) || null;
}

function makeToken_(email) {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = email + '|' + exp;
  const sig = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(payload, getSecret_())
  ).replace(/=+$/, '');
  return Utilities.base64EncodeWebSafe(payload + '|' + sig).replace(/=+$/, '');
}

function verifyToken_(token) {
  if (!token) return null;
  try {
    const bytes = Utilities.base64DecodeWebSafe(token);
    const raw = Utilities.newBlob(bytes).getDataAsString();
    const parts = raw.split('|');
    if (parts.length !== 3) return null;
    const email = parts[0];
    const exp = parseInt(parts[1], 10);
    const sig = parts[2];
    if (!exp || Date.now() > exp) return null;
    const expect = Utilities.base64EncodeWebSafe(
      Utilities.computeHmacSha256Signature(email + '|' + exp, getSecret_())
    ).replace(/=+$/, '');
    if (sig !== expect) return null;
    return findUserByEmail_(email);
  } catch (e) {
    return null;
  }
}

function currentUser_(e) {
  const token = (e.parameter && e.parameter.token) ||
    readPostBody_(e).token || '';
  return verifyToken_(token);
}

function readPostBody_(e) {
  try {
    if (e && e.postData && e.postData.contents) {
      return JSON.parse(e.postData.contents);
    }
  } catch (err) {}
  return {};
}

function login(email) {
  const u = findUserByEmail_(email);
  if (!u) return { ok: false, error: 'Email tidak terdaftar' };
  audit_(u.email, 'login', 'Login berhasil');
  return {
    ok: true,
    data: {
      token: makeToken_(u.email),
      user: publicUser_(u)
    }
  };
}

function publicUser_(u) {
  return {
    id: u.id, email: u.email, nama: u.nama,
    role: u.role, org_access: String(u.org_access || '')
  };
}

function isAdmin_(u) { return String(u.role).toLowerCase() === 'admin'; }
function isViewer_(u) { return String(u.role).toLowerCase() === 'viewer'; }

function canAccessOrg_(u, orgId) {
  if (isAdmin_(u)) return true;
  const acc = String(u.org_access || '').trim();
  if (!acc || acc === '*') return true;
  return acc.split(',').map(function (s) { return s.trim(); }).indexOf(String(orgId)) !== -1;
}

function requireAdmin_(u) {
  if (!isAdmin_(u)) throw new Error('Akses ditolak: butuh role admin');
}

function audit_(email, aksi, detail) {
  try {
    appendRow_(SH.audit, { id: genId_(), waktu: nowISO_(), email: email || '', aksi: aksi, detail: detail || '' });
  } catch (e) {}
}

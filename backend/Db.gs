function nowISO_() {
  return new Date().toISOString();
}

function genId_() {
  return Utilities.getUuid().replace(/-/g, '').substring(0, 12);
}

function getSheet_(name) {
  const ss = SpreadsheetApp.openById(getSpreadsheetId_());
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    const h = HEADERS[name];
    if (h) {
      sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

function readAll_(name) {
  const sh = getSheet_(name);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const h = HEADERS[name];
  const vals = sh.getRange(2, 1, last - 1, h.length).getValues();
  return vals.filter(function (r) { return r[0] !== ''; }).map(function (r) {
    const o = {};
    h.forEach(function (k, i) { o[k] = r[i]; });
    return o;
  });
}

function appendRow_(name, obj) {
  const sh = getSheet_(name);
  const h = HEADERS[name];
  const row = h.map(function (k) {
    const v = obj[k];
    if (v === undefined || v === null) return '';
    if (typeof v === 'boolean') return v;
    if (k === 'tanggal' && v !== '' && !(v instanceof Date)) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d;
    }
    return v;
  });
  sh.appendRow(row);
  return obj;
}

function updateRow_(name, id, obj) {
  const sh = getSheet_(name);
  const h = HEADERS[name];
  const last = sh.getLastRow();
  if (last < 2) return false;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      const current = {};
      h.forEach(function (k, j) { current[k] = sh.getRange(i + 2, j + 1).getValue(); });
      const merged = Object.assign({}, current, obj);
      const row = h.map(function (k) {
        const v = merged[k];
        if (v === undefined || v === null) return '';
        if (typeof v === 'boolean') return v;
        if (k === 'tanggal' && v !== '' && !(v instanceof Date)) {
          const d = new Date(v);
          if (!isNaN(d.getTime())) return d;
        }
        return v;
      });
      sh.getRange(i + 2, 1, 1, h.length).setValues([row]);
      return true;
    }
  }
  return false;
}

function deleteRow_(name, id) {
  const sh = getSheet_(name);
  const last = sh.getLastRow();
  if (last < 2) return false;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      sh.deleteRow(i + 2);
      return true;
    }
  }
  return false;
}

function findById_(name, id) {
  return readAll_(name).find(function (r) { return String(r.id) === String(id); }) || null;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    return fn();
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

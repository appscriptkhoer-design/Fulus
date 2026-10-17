const API_URL = 'https://script.google.com/macros/s/AKfycbz-p8RfF0kSYEXfCq2bW0tpLKsW148H_i34aCTY4Ezc_LfGZgIjBPcbCd7x5kZ9dPnYIQ/exec';

const API = (function () {
  function token() { return localStorage.getItem('fulus_token') || ''; }

  async function call(action, data, method) {
    const isGet = method === 'GET';
    let url = API_URL + '?action=' + encodeURIComponent(action);
    const opts = { method: isGet ? 'GET' : 'POST', redirect: 'follow' };

    if (isGet) {
      const p = data || {};
      Object.keys(p).forEach(function (k) {
        if (p[k] !== '' && p[k] !== undefined && p[k] !== null) {
          url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(p[k]);
        }
      });
      if (token()) url += '&token=' + encodeURIComponent(token());
    } else {
      const body = Object.assign({ action: action, token: token() }, data || {});
      opts.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(url, opts);
    const txt = await res.text();
    let json;
    try { json = JSON.parse(txt); } catch (e) { throw new Error('Respons server tidak valid'); }
    if (!json.ok) throw new Error(json.error || 'Terjadi kesalahan');
    return json.data;
  }

  return {
    get: function (a, p) { return call(a, p, 'GET'); },
    post: function (a, p) { return call(a, p, 'POST'); }
  };
})();

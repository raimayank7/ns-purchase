/* NSSlipPortal: the maths of the payslip portal (employees open their payslips on their phones). Pure functions, no screen, no network
   (node scripts/test_slipportal.js). Used by the App (engine/slipportal.js: HR makes the encrypted copies) and by view.niveshsahayak.in/pay/
   (engine/slipview.js: the employee's phone opens one). The Worker (workers/payslips) only ever holds the output of seal().

   WHAT IS KEPT WHERE
     company code   8 characters (no 0/O/1/I/L), names the company on the Worker.
     access key K   22 characters (128 random bits). Lives only in the link HR gives out (after the #, which browsers never send to
                    any server) and in the owner's data home. It is mixed into every key below, so the Worker, or anyone who copies
                    its database, cannot even try the 10^6 possible PINs: they would have to guess a 128-bit key as well.
     PIN            6 digits per employee. Made at random, kept in the owner's data home, printed for HR to hand out.
     per employee   lk = a lookup name (SHA-256 of K + employee ID, so the Worker never sees the employee ID),
                    salt (16 random bytes, kept on the Worker and sent to the phone before it asks for anything),
                    PBKDF2-SHA256 over (PIN + 0x00 + K, salt, ITER rounds) gives 64 bytes:
                      first 32 = the AES-256-GCM key that locks the payslips (never leaves the device),
                      last 32  = the verifier vf. The Worker keeps SHA-256(vf) only and gives the ciphertext out only to a phone that
                                 sends the right vf, and only a few wrong tries are allowed (see the Worker).
     ciphertext     iv(12) + AES-GCM(flag + data) as base64url (flag 0 = JSON, 1 = deflated JSON), with  code|lk  as the associated
                    data, so one employee's file cannot be passed off as another's.
   Plain content (what an employee sees):  { v:1, co:'company name', months:{ 'YYYY-MM': slip } },  slip = see slipOf(). */
(function (G) {
  'use strict';
  var ITER = 600000;
  var CODE_CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   /* 31 characters: nothing that looks like another */
  var subtle = function () { return G.crypto.subtle; };

  function utf8(s) { return new TextEncoder().encode(s); }
  function unutf8(b) { return new TextDecoder().decode(b); }
  function b64u(bytes) { var s = ''; for (var i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var bin = atob(s), b = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; }
  function rnd(n) { return G.crypto.getRandomValues(new Uint8Array(n)); }
  /* a random integer below n with no bias */
  function below(n) { var lim = Math.floor(4294967296 / n) * n, x; do { x = new Uint32Array(1); G.crypto.getRandomValues(x); x = x[0]; } while (x >= lim); return x % n; }

  function genPin() { var s = ''; for (var i = 0; i < 6; i++) s += below(10); return s; }
  function genCode() { var s = ''; for (var i = 0; i < 8; i++) s += CODE_CH.charAt(below(CODE_CH.length)); return s; }
  function genKey() { return b64u(rnd(16)); }          /* the access key K, 22 characters */
  function genAdmin() { return b64u(rnd(32)); }        /* the HR admin secret, 43 characters */
  function genSalt() { return b64u(rnd(16)); }

  function normEid(s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ''); }
  function sha256(text) { return subtle().digest('SHA-256', utf8(text)).then(function (b) { return new Uint8Array(b); }); }
  /* the name the Worker knows an employee by: it cannot be turned back into the employee ID without K */
  function lookup(K, eid) { return sha256('ns-pay-id|' + K + '|' + normEid(eid)).then(function (b) { return b64u(b.subarray(0, 16)); }); }

  /* PIN + K + salt -> { key, vf } (the slow step: 600,000 PBKDF2 rounds, about half a second on a phone) */
  function derive(pin, K, salt, iter) {
    var pw = utf8(String(pin) + '\u0000' + String(K));
    return subtle().importKey('raw', pw, 'PBKDF2', false, ['deriveBits']).then(function (k) {
      return subtle().deriveBits({ name: 'PBKDF2', salt: unb64u(salt), iterations: iter || ITER, hash: 'SHA-256' }, k, 512);
    }).then(function (bits) {
      var all = new Uint8Array(bits);
      return subtle().importKey('raw', all.subarray(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']).then(function (key) { return { key: key, vf: b64u(all.subarray(32)) }; });
    });
  }

  function canZip() { return typeof G.CompressionStream === 'function' && typeof G.DecompressionStream === 'function' && typeof G.Response === 'function' && typeof G.Blob === 'function'; }
  function pipe(bytes, stream) { return new G.Response(new G.Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer().then(function (ab) { return new Uint8Array(ab); }); }

  /* object -> ciphertext text */
  function seal(obj, d, code, lk) {
    var raw = utf8(JSON.stringify(obj)), zip = canZip();
    return (zip ? pipe(raw, new G.CompressionStream('deflate-raw')) : Promise.resolve(raw)).then(function (data) {
      var plain = new Uint8Array(data.length + 1); plain[0] = zip ? 1 : 0; plain.set(data, 1);
      var iv = rnd(12);
      return subtle().encrypt({ name: 'AES-GCM', iv: iv, additionalData: utf8(code + '|' + lk) }, d.key, plain).then(function (ct) {
        var out = new Uint8Array(12 + ct.byteLength); out.set(iv, 0); out.set(new Uint8Array(ct), 12); return b64u(out);
      });
    });
  }
  /* ciphertext text -> object, or rejects with Error('wrong') when the key, code or employee does not match */
  function open(ct, d, code, lk) {
    var bytes; try { bytes = unb64u(ct); } catch (e) { return Promise.reject(new Error('wrong')); }
    if (bytes.length < 29) return Promise.reject(new Error('wrong'));
    return subtle().decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12), additionalData: utf8(code + '|' + lk) }, d.key, bytes.subarray(12)).then(function (ab) {
      var p = new Uint8Array(ab), data = p.subarray(1);
      return p[0] === 1 ? pipe(data, new G.DecompressionStream('deflate-raw')) : data;
    }, function () { throw new Error('wrong'); }).then(function (raw) { return JSON.parse(unutf8(raw)); });
  }

  /* everything the Worker stores for one employee: { lk, salt, vf, ct }. vf is what the phone will send to prove the PIN.
     opt.salt keeps the old salt when the PIN is unchanged. */
  function item(eid, pin, K, code, content, opt) {
    opt = opt || {};
    var salt = opt.salt || genSalt();
    return lookup(K, eid).then(function (lk) {
      return derive(pin, K, salt, opt.iter).then(function (d) {
        return seal(content, d, code, lk).then(function (ct) { return { lk: lk, salt: salt, vf: d.vf, ct: ct }; });
      });
    });
  }

  /* ---------- the link ---------- */
  function link(base, code, K) { return String(base).replace(/\/+$/, '') + '/pay/#' + code + '-' + K; }
  /* a pasted link or "CODE-KEY" -> { code, K } or null */
  function parseLink(text) {
    var m = /([ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8})-([A-Za-z0-9_-]{22})/.exec(String(text || '').replace(/\s+/g, ''));
    return m ? { code: m[1], K: m[2] } : null;
  }

  /* ---------- the payslip an employee sees ---------- */
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; }
  function r2(n) { return Math.round((n + (n < 0 ? -1e-9 : 1e-9)) * 100) / 100; }
  function last4(s) { s = String(s || '').replace(/\s+/g, ''); return s.length > 4 ? 'XXXX' + s.slice(-4) : s; }
  /* a saved salary slip (doc type 'salary') -> the small object that is locked for the employee. B = NSBooks (for salSplit).
     PAN and bank account are shown only by their last four characters. */
  function slipOf(doc, B) {
    var s = B.salSplit(doc), e = doc.emp || {};
    var rows = function (l) { return (l || []).filter(function (x) { return String(x.desc || '').trim() && num(x.amt); }).map(function (x) { return [String(x.desc).trim(), r2(num(x.amt))]; }); };
    return {
      no: doc.no || '', m: doc.month || '', n: String((doc.buyer && doc.buyer.name) || ''), id: String(e.code || ''), des: e.desig || '', dep: e.dept || '', doj: e.doj || '',
      pan: last4(e.pan), uan: e.uan || '', esi: e.esi || '', bank: e.bankName || '', acc: last4(e.bankAcc),
      days: doc.days === '' || doc.days == null ? '' : String(doc.days), paid: doc.paid === '' || doc.paid == null ? '' : String(doc.paid),
      earn: rows(doc.earn), ded: rows(doc.ded), gross: s.gross, tded: s.ded, net: s.net, pd: doc.payDate || ''
    };
  }

  var API = { ITER: ITER, genPin: genPin, genCode: genCode, genKey: genKey, genAdmin: genAdmin, genSalt: genSalt, normEid: normEid, lookup: lookup, derive: derive, seal: seal, open: open,
    item: item, link: link, parseLink: parseLink, slipOf: slipOf, b64u: b64u, unb64u: unb64u, sha256: sha256 };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.NSSlipPortal = API;
})(typeof window !== 'undefined' ? window : globalThis);

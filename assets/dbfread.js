/* NSDbf: reads dBase / FoxPro / Visual FoxPro tables (.dbf, with memo .fpt / .dbt) from bytes. Pure, no screen; runs in the App
   and in Node (tests). Used by "Bring data from other software" (Evershine keeps its books as Visual FoxPro tables).
   read(dbfBytes, { memo: fptBytes, codepage: 'windows-1252', deleted: false }) -> { version, date, fields: [{ name, type, len, dec }], records: [{...}], count }
   head(dbfBytes) -> the same without records (fast: only the header is read).
   Values: C text (trailing spaces cut), N / F number (blank = null), D 'yyyy-mm-dd' (blank = ''), L true / false / null,
   I whole number, Y currency, B double, T 'yyyy-mm-ddThh:mm:ss', M / G / W memo text (needs the memo file, else ''),
   V / Q varchar (VFP). Rows marked deleted are left out unless opts.deleted. */
(function (G) {
  'use strict';
  function u8(b) { return b instanceof Uint8Array ? b : b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array(b.buffer, b.byteOffset || 0, b.byteLength); }
  function decoder(cp) {
    try { return new TextDecoder(cp || 'windows-1252'); } catch (e) { return new TextDecoder('latin1'); }
  }
  function ascii(b, s, n) { var t = ''; for (var i = 0; i < n; i++) { var c = b[s + i]; if (!c) break; t += String.fromCharCode(c); } return t; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  /* Julian day number -> yyyy-mm-dd (VFP DateTime keeps the day as a Julian day) */
  function jd(j) {
    if (!j) return '';
    var a = j + 32044, b = Math.floor((4 * a + 3) / 146097), c = a - Math.floor(146097 * b / 4), d = Math.floor((4 * c + 3) / 1461), e = c - Math.floor(1461 * d / 4), m = Math.floor((5 * e + 2) / 153);
    var day = e - Math.floor((153 * m + 2) / 5) + 1, mon = m + 3 - 12 * Math.floor(m / 10), yr = 100 * b + d - 4800 + Math.floor(m / 10);
    return yr + '-' + pad(mon) + '-' + pad(day);
  }
  function head(bytes) {
    var b = u8(bytes); if (b.length < 32) throw new Error('not a table file');
    var dv = new DataView(b.buffer, b.byteOffset, b.byteLength), ver = b[0];
    var count = dv.getUint32(4, true), hlen = dv.getUint16(8, true), rlen = dv.getUint16(10, true), fields = [], off = 1;
    if (hlen < 33 || rlen < 1 || hlen > b.length) throw new Error('not a table file');
    for (var p = 32; p + 32 <= hlen && b[p] !== 0x0D; p += 32) {
      var name = ascii(b, p, 11).trim(), type = String.fromCharCode(b[p + 11]), len = b[p + 16], dec = b[p + 17], flags = b[p + 18];
      if (type === 'C' && ver !== 0x30 && ver !== 0x31 && ver !== 0x32 && dec) len += dec * 256;   /* dBase: long text keeps its high byte in dec */
      fields.push({ name: name, type: type, len: len, dec: type === 'C' ? 0 : dec, off: off, nullable: !!(flags & 2), system: !!(flags & 1) });
      off += len;
    }
    /* the rows must be as long as their columns: if the dBase reading of wide text columns does not add up, read them as plain widths */
    if (off !== rlen && fields.some(function (f) { return f.type === 'C' && f.len > 255; })) {
      off = 1; fields.forEach(function (f) { if (f.type === 'C' && f.len > 255) f.len = f.len % 256; f.off = off; off += f.len; });
    }
    return { version: ver, date: (1900 + b[1]) + '-' + pad(b[2]) + '-' + pad(b[3]), count: count, hlen: hlen, rlen: rlen, cp: b[29], fields: fields.filter(function (f) { return !f.system && f.type !== '0'; }), all: fields };
  }
  /* memo file: VFP .fpt (block size at 6-7 big endian; block = type 4 bytes + length 4 bytes big endian + data) or dBase .dbt (512 blocks, ends at 0x1A) */
  function memoReader(m, dec) {
    if (!m) return function () { return ''; };
    var b = u8(m), dv = new DataView(b.buffer, b.byteOffset, b.byteLength), fpt = b.length > 8 && dv.getUint16(6, false) > 0, bs = fpt ? dv.getUint16(6, false) : 512;
    return function (blk) {
      if (!blk) return '';
      var p = blk * bs; if (p >= b.length) return '';
      if (fpt) { var len = dv.getUint32(p + 4, false); return dec.decode(b.subarray(p + 8, Math.min(b.length, p + 8 + len))); }
      var e = p; while (e < b.length && b[e] !== 0x1A) e++;
      return dec.decode(b.subarray(p, e));
    };
  }
  function read(bytes, opts) {
    opts = opts || {};
    var b = u8(bytes), h = head(b), dv = new DataView(b.buffer, b.byteOffset, b.byteLength), dec = decoder(opts.codepage), memo = memoReader(opts.memo, dec), out = [];
    var n = Math.min(h.count, Math.floor((b.length - h.hlen) / h.rlen));
    for (var r = 0; r < n; r++) {
      var at = h.hlen + r * h.rlen;
      if (b[at] === 0x2A && !opts.deleted) continue;   /* '*' = deleted row */
      var row = {};
      if (opts.deleted) row._deleted = b[at] === 0x2A;
      for (var i = 0; i < h.fields.length; i++) {
        var f = h.fields[i], s = at + f.off, v;
        switch (f.type) {
          case 'C': case 'V': case 'Q': v = dec.decode(b.subarray(s, s + f.len)).replace(/[\s\u0000]+$/, ''); break;
          case 'N': case 'F': { var t = ascii(b, s, f.len).trim(); v = t === '' || /^\*+$/.test(t) ? null : +t; if (v !== null && isNaN(v)) v = null; break; }
          case 'D': { var d = ascii(b, s, 8).trim(); v = /^\d{8}$/.test(d) && d !== '00000000' ? d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6) : ''; break; }
          case 'L': { var c = String.fromCharCode(b[s]).toUpperCase(); v = 'TY'.indexOf(c) >= 0 ? true : 'FN'.indexOf(c) >= 0 ? false : null; break; }
          case 'I': v = dv.getInt32(s, true); break;
          case 'Y': v = Number(dv.getBigInt64(s, true)) / 10000; break;
          case 'B': v = f.len === 8 ? dv.getFloat64(s, true) : +ascii(b, s, f.len).trim() || 0; break;
          case 'T': { var day = dv.getInt32(s, true), ms = dv.getInt32(s + 4, true); if (!day) { v = ''; break; } var sec = Math.floor(ms / 1000); v = jd(day) + 'T' + pad(Math.floor(sec / 3600)) + ':' + pad(Math.floor(sec / 60) % 60) + ':' + pad(sec % 60); break; }
          case 'M': case 'G': case 'W': { var blk = f.len === 4 ? dv.getUint32(s, true) : +ascii(b, s, f.len).trim() || 0; v = memo(blk); break; }
          default: v = ascii(b, s, f.len).trim();
        }
        row[f.name] = v;
      }
      out.push(row);
    }
    return { version: h.version, date: h.date, fields: h.fields.map(function (f) { return { name: f.name, type: f.type, len: f.len, dec: f.dec }; }), records: out, count: h.count };
  }
  var API = { read: read, head: head, jd: jd };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.NSDbf = API;
})(typeof window !== 'undefined' ? window : this);

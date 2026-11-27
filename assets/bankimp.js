/* Bank statement import in NSBiz (gap-money, 2026-11-14; after itax.js).
   Section 'bimp': the user opens the CSV or Excel statement from net banking, checks the columns, and every line is sorted by bankimport.js
   (NSBI) into: receipt from a party, payment to a party, expense, other income, cash deposited or withdrawn, or still open. What the user
   confirms is saved as the records the Money screens already make (receipt, voucher, exp, oinc, contra), each with a `bsk` key so a line is
   never posted twice, even when the same statement is opened again. The party or head chosen for a narration is remembered (meta
   'bankrules', per business) and suggested next time. PDF statements are read with PDF.js (bank PDFs with text, password asked when the file has one). Nothing leaves the browser.
   Screen words: NS.t('bi.*'), section name NS.t('app.bimp'). */
(function () {
  'use strict';
  var A = window.NSApp, K = window.NSBank, I = window.NSBI; if (!A || !I) return;
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, num = NS.num, r2 = NS.r2, money = NS.money, B = NSBooks, key = B.key;
  function BI(k, v) { return NS.t('bi.' + k, v); }
  var XL = ['/assets/vendor/xlsx-0.20.3.full.min.js', ''];
  var WANT = '';   /* where the cursor goes after the table is drawn again (see the keys below) */
  var COLS = ['date', 'desc', 'ref', 'dr', 'cr', 'amt', 'type', 'bal'];
  var BS = null, RULES = null, filt = 'todo', busy = false, acct = 'bank';   /* acct: which bank the statement is from (several banks) */
  function bankAcct() { var L = A.banks ? A.banks() : []; if (!L.some(function (x) { return x.k === acct; })) acct = 'bank'; return acct; }
  /* BS = { name, rows, map, header, lines, keys, edits: { key: { kind, name, billId, from, post } }, sug: suggestions } */

  function bizKey() { return key(A.bizName()); }
  function rules() { return (RULES && RULES[bizKey()]) || []; }
  function loadRules() {
    var obj = function (m) { return m && typeof m === 'object' ? m : {}; };
    return Promise.all([NSStore.meta('bankrules').catch(function () {}), NSStore.meta('banklayouts').catch(function () {}), NSStore.meta('bankwip').catch(function () {}), NSStore.meta('bankwiprows').catch(function () {}), NSStore.meta('bankkeys').catch(function () {})])
      .then(function (r) { RULES = obj(r[0]); LAY = obj(r[1]); WIP = obj(r[2]); WROWS = obj(r[3]); KEYS = obj(r[4]); RV++; });
  }
  /* Like ZEEFA, which keeps the start row and columns on the bank account: the columns the user set for a bank are kept
     (meta 'banklayouts', per business and bank, newest 3) and tried again on that bank's next file. */
  var LAY = {}, WIP = {}, wipT = 0, WROWS = {}, ROWSAVED = null;
  /* Keywords of ledgers (like Tally's "Suggested Keyword" on a ledger master): when a line's details contain one of a ledger's keywords,
     that ledger is suggested. Kept per business: meta 'bankkeys' = { business: { ledgerId: { l: the ledger, w: [keywords] } } }. */
  var KEYS = {}, KWO = false, KW = { led: null };
  function ledId(L) { return L.k === 'other' ? 'o|' + L.a : L.k === 'bank' ? 'bank|' + L.bk : L.k + '|' + key(L.name); }
  function kwMap() { return (KEYS[bizKey()] = KEYS[bizKey()] || {}); }
  function saveKeys() { RV++; LEDC = null; SPC = null; CX = null; SUG = null; VER++; return NSStore.meta('bankkeys', KEYS).catch(function () {}); }
  function kwCount() { var m = kwMap(), n = 0; Object.keys(m).forEach(function (k) { n += m[k].w.length; }); return n; }
  function addKeywords(L, text) {
    var m = kwMap(), id = ledId(L), e = m[id] || (m[id] = { l: { k: L.k, name: L.name, bk: L.bk, t: L.t, nm: L.nm, a: L.a, lab: L.lab }, w: [] }), n = 0;
    String(text || '').split(/[,;\n]+/).forEach(function (w) { w = w.trim(); if (I.kwNorm(w).length >= 3 && e.w.map(I.kwNorm).indexOf(I.kwNorm(w)) < 0) { e.w.push(w); n++; } });
    if (!e.w.length) delete m[id];
    return n;
  }
  /* the lines of the statement are kept once (meta 'bankwiprows'); a choice only rewrites the small list of choices (meta 'bankwip').
     Before, every choice wrote all 2,000 lines again, and each write also set off the automatic backup. */
  function wipRows(w) { return w.rows || WROWS[bizKey()] || []; }
  function layouts() { return ((LAY[bizKey()] || {})[bankAcct()] || []); }
  function keepLayout(map) {
    if (!map) return; var b = LAY[bizKey()] = LAY[bizKey()] || {}, l = (b[bankAcct()] || []).filter(function (x) { return JSON.stringify(x.map) !== JSON.stringify(map); });
    l.unshift({ map: map, at: Date.now() }); b[bankAcct()] = l.slice(0, 3); NSStore.meta('banklayouts', LAY).catch(function () {});
  }
  /* Like ZEEFA, whose imported lines wait in their own table until posted: the open statement and the choices made on it are
     kept (meta 'bankwip', per business), so closing the App half way through 2,000 lines loses nothing. */
  function saveWip(now) {
    clearTimeout(wipT);
    if (!BS || !BS.lines.length) { delete WIP[bizKey()]; delete WROWS[bizKey()]; }   /* gone at once, so the screen drawn next does not offer it again */
    wipT = setTimeout(function () {
      if (BS && BS.lines.length) {
        WIP[bizKey()] = { name: BS.name, map: BS.map, header: BS.header, edits: BS.edits, sess: SESS, acct: bankAcct(), at: Date.now() };
        if (ROWSAVED !== BS.rows) { WROWS[bizKey()] = BS.rows; ROWSAVED = BS.rows; NSStore.meta('bankwiprows', WROWS).catch(function () {}); }
      } else { delete WIP[bizKey()]; delete WROWS[bizKey()]; ROWSAVED = null; NSStore.meta('bankwiprows', WROWS).catch(function () {}); }
      NSStore.meta('bankwip', WIP).catch(function () {});
    }, now ? 0 : 4000);
  }
  /* the choices are written 4 seconds after the last one; when the tab is hidden or closed they are written at once */
  document.addEventListener('visibilitychange', function () { if (document.hidden && BS && BS.lines.length) saveWip(true); });
  window.addEventListener('pagehide', function () { if (BS && BS.lines.length) saveWip(true); });
  function saveRules(list) { RULES = RULES || {}; RULES[bizKey()] = list; RV++; return NSStore.meta('bankrules', RULES).catch(function () {}); }
  function heads() { var H = window.NSHeads; return H ? { exp: H.list(['dexp', 'iexp']).map(function (h) { return H.label(h); }), inc: H.list(['oinc', 'dinc']).map(function (h) { return H.label(h); }) } : { exp: [], inc: [] }; }
  function partyNames() { var o = {}; NS.active(NS.forBiz(A.data().party, A.biz())).forEach(function (p) { o[key(p.name)] = p.name; }); return Object.keys(o).map(function (k) { return o[k]; }).sort(); }

  /* ---------- PDF statements (PDF.js 3.11.174, Mozilla, Apache 2.0; a copy is kept in the App: /vendor/, so it works offline) ----------
     A bank PDF is text placed on the page. The words are put back into rows by their height on the page; the heading line
     (Date ... Balance) gives the columns, and every word goes under the heading nearest to it. A narration that runs onto a
     second line is joined to its row; the heading printed again on later pages is skipped. Password-protected statements
     (most Indian banks) ask for the password; it is used only to open the file and is not kept. Scanned (picture) PDFs have no
     text and cannot be read this way. */
  var PDFJS = '/vendor/pdf.min.js', PDFW = '/vendor/pdf.worker.min.js';
  function askPassword(again) {
    return new Promise(function (res) {
      var d = NS.el('dialog', { 'class': 'b2-dlg bi-pw' });
      d.innerHTML = '<form method="dialog"><h3>' + (again ? 'Wrong password. Try again' : 'This statement has a password') + '</h3>' +
        '<p class="soft">Banks usually use your customer ID, date of birth or part of your name and mobile number. The password is used only to open the file here; it is not saved.</p>' +
        '<input type="password" class="bi-pwin" autocomplete="off" aria-label="PDF password" style="width:100%">' +
        '<div class="row" style="margin-top:12px;gap:8px;display:flex;justify-content:flex-end"><button type="button" class="btn" value="x">Cancel</button><button class="btn primary" value="ok">Open</button></div></form>';
      document.body.appendChild(d);
      var inp = d.querySelector('.bi-pwin'), done = function (v) { d.close(); d.remove(); res(v); };
      d.querySelector('button[value=x]').addEventListener('click', function () { done(null); });
      d.querySelector('form').addEventListener('submit', function (e) { e.preventDefault(); done(inp.value); });
      d.addEventListener('cancel', function (e) { e.preventDefault(); done(null); });
      d.showModal(); inp.focus();
    });
  }
  function pdfOpen(lib, data, pw, tries) {
    var o = { data: data.slice(0), isEvalSupported: false };   /* CVE-2024-4367: never let a PDF's fonts run code */
    if (pw != null) o.password = pw;
    var t = lib.getDocument(o);
    return t.promise.catch(function (err) {
      if (err && err.name === 'PasswordException' && tries < 5) return askPassword(err.code === 2).then(function (p) { if (p == null) throw new Error('cancel'); return pdfOpen(lib, data, p, tries + 1); });
      throw err;
    });
  }
  /* the words of each page are put back into a table by NSBank.pdfLines / pdfTable (bankcore.js, tested with a real ICICI PDF) */
  function pdfRows(file) {
    return NS.loadJs(PDFJS).then(function () {
      var lib = window.pdfjsLib; if (!lib) throw new Error('load');
      lib.GlobalWorkerOptions.workerSrc = PDFW;
      return file.arrayBuffer().then(function (buf) { return pdfOpen(lib, new Uint8Array(buf), null, 0); });
    }).then(function (pdf) {
      /* pages one after another (a 100-page statement read all at once held the browser for several seconds) */
      var pages = [], n = 0;
      function next() {
        if (++n > pdf.numPages) return Promise.resolve(pages);
        if (n % 10 === 0) NS.toast(BI('pdfpage', { a: n, b: pdf.numPages }));
        return pdf.getPage(n).then(function (p) { return p.getTextContent(); }).then(function (tc) { pages.push(K.pdfLines(tc.items)); return next(); });
      }
      return next();
    }).then(K.pdfTable);
  }

  /* ---------- reading ---------- */
  function readFile(file) {
    var xl = /\.xlsx?$/i.test(file.name);
    if (/\.pdf$/i.test(file.name)) {
      NS.toast('Reading ' + file.name + '…');
      pdfRows(file).then(function (rows) { if (rows.length < 2) { NS.toast('No statement lines found in this PDF. A scanned (picture) PDF has no text: download the CSV or Excel statement instead.', 'bad'); return; } setRows(rows, file.name); })
        .catch(function (e) { if (e && e.message === 'cancel') return; NS.toast('Could not read this PDF' + (e && e.name === 'InvalidPDFException' ? ' (it is not a valid PDF)' : '') + '. Try the CSV or Excel statement.', 'bad'); });
      return;
    }
    var get = xl ? NS.loadJs(XL[0], XL[1]).then(function () { return file.arrayBuffer(); }).then(function (buf) {
      var wb = window.XLSX.read(buf, { type: 'array', cellDates: false }), ws = wb.Sheets[wb.SheetNames[0]];
      return window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    }) : file.text().then(K.csvRows);
    get.then(function (rows) { setRows(rows, file.name); }).catch(function (e) { NS.toast(BI(e && /password/i.test(e.message || '') ? 'xlpw' : 'readfail'), 'bad'); });
  }
  function setRows(rows, name, map, keep) {
    rows = (rows || []).filter(function (r) { return r && r.some(function (c) { return String(c == null ? '' : c).trim(); }); });
    var from = keep ? keep.header : map ? (BS && BS.header) : undefined, S = K.statement(rows, map, from), prevEdits = keep ? keep.edits || {} : BS && BS.edits && map ? BS.edits : {}, laid = false;
    if (!map && !keep) layouts().forEach(function (L) { var S2 = K.statement(rows, L.map, -1); if (S2.lines.length > S.lines.length || (S2.lines.length && S2.lines.length === S.lines.length && S.guessed)) { S = S2; laid = true; } });
    BS = { name: name, rows: rows, map: S.map || {}, header: S.header == null ? -1 : S.header, lines: S.lines, edits: prevEdits, laid: laid };
    BS.lines.forEach(function (l, i) { l.i = i; });
    CX = null; SUG = null; SESS = keep && keep.sess || []; page = 0; find = ''; COLD = null;
    saveWip();
    A.show();
    if (S.lines.length && !keep) NS.toast(BI(laid ? 'readlaid' : 'read', { n: S.lines.length }));
  }

  /* ---------- the work ----------
     Speed (25 Nov 2026, a real 2,010-line ICICI statement froze the screen): the books are read once per statement (CX, made again
     only when the saved data changes), the suggestions are worked out once (SUG, again only when a choice teaches a new rule),
     a page shows 100 lines, and a choice redraws only the table part, not the whole App screen. */
  var CX = null, SUG = null, SESS = [], PAGE = 100, page = 0, find = '';
  var RV = 0;   /* changes whenever the saved rules change */
  function dataStamp() { var d = A.data(); return d ? (d.doc || []).length + '|' + (d.party || []).length + '|' + A.bizName() + '|' + bankAcct() + '|' + RV : ''; }
  function ctx() {
    var st = dataStamp();
    if (CX && CX.st === st && CX.bs === BS) return CX;
    var docs = A.mine(), dates = BS.lines.map(function (l) { return l.date; }).sort(), from = dates[0] || '', to = dates[dates.length - 1] || '', LC = ledCtx();
    CX = { st: st, bs: BS, lines: BS.lines, keys: I.lineKeys(BS.lines), parties: LC.names, pindex: LC.pindex,
      bills: B.bills(A.data().doc, A.bizName()).bills.map(function (b) { return { id: b.id, no: b.no, date: b.date, party: b.party, side: b.side, left: b.left }; }),
      done: I.doneKeys(docs), book: from ? K.bookLines(docs, A.bizName(), from, to, bankAcct()) : [] };
    CX.billsBy = {}; CX.bills.forEach(function (b) { var k = b.side + '|' + key(b.party); (CX.billsBy[k] = CX.billsBy[k] || []).push(b); });
    CX.led = LC.led; CX.roles = LC.roles; CX.ledOf = LC.ledOf; CX.ledset = LC.ledset; CX.kw = LC.kw; CX.byId = LC.byId;
    SUG = null; VER++;
    return CX;
  }
  /* the ledgers, the index that finds one by the payee's name, and which heads exist: made once per change of the books */
  var LEDC = null;
  function ledCtx() {
    var st = dataStamp(); if (LEDC && LEDC.st === st) return LEDC;
    var led = buildLedgers(), roles = {}, map = {}, ledset = {}, nm = {};
    led.forEach(function (L) {
      if (L.k === 'party') roles[key(L.name)] = L.lab;
      if (L.k === 'exp' || L.k === 'inc') ledset[L.k + '|' + key(L.name)] = 1;
      if (L.k === 'cash' || L.k === 'bank' || L.a === I.SUSP.a) return;   /* found by plain words (ATM, cash), never by a payee's name */
      (map[key(L.name)] = map[key(L.name)] || []).push(L); nm[key(L.name)] = L.name;
    });
    var names = Object.keys(nm).map(function (k) { return nm[k]; }), byId = {}, kw = [], km = kwMap();
    led.forEach(function (L) { byId[ledId(L)] = L; });
    Object.keys(km).forEach(function (id) { var L = byId[id] || (km[id].l && km[id].l.k === 'other' ? km[id].l : null); if (L) km[id].w.forEach(function (w) { var n = I.kwNorm(w); if (n.length >= 3) kw.push({ n: n, L: L }); }); });   /* a ledger that is gone is skipped */
    /* the ledger for a name and a direction: a party first, then the others that take money this way */
    function ledOf(name, dir) { var l = map[key(name)] || []; for (var i = 0; i < l.length; i++) if (l[i].k === 'party') return l[i]; for (var j = 0; j < l.length; j++) if (I.allowed(l[j], dir)) return l[j]; return null; }
    LEDC = { st: st, led: led, roles: roles, names: names, pindex: I.partyIndex(names), ledOf: ledOf, ledset: ledset, byId: byId, kw: kw };
    return LEDC;
  }
  /* ---------- every ledger the user can pick (26 Nov 2026): one list for the one picker ----------
     parties (customers, suppliers), expense and income heads, cash, the business's other banks, and the other accounts the books
     already hold (loans, capital, drawings, assets, provisions). Each has the kind it is shown with; the kind decides the entry. */
  function buildLedgers() {
    var out = [], seen = {};
    function add(L, lab) { var k = L.k + '|' + key(L.name); if (!L.name || seen[k]) return; seen[k] = 1; L.lab = lab; L.lc = L.name.toLowerCase(); out.push(L); }
    var roles = {}; NS.active(NS.forBiz(A.data().party, A.biz())).forEach(function (p) { roles[key(p.name)] = p.role; });
    partyNames().forEach(function (n) { var r = roles[key(n)]; add({ k: 'party', name: n }, r === 'supplier' ? 'supplier' : r === 'customer' ? 'customer' : 'party'); });
    var H = heads(); H.exp.forEach(function (n) { add({ k: 'exp', name: n }, 'exp'); }); H.inc.forEach(function (n) { add({ k: 'inc', name: n }, 'inc'); });
    A.mine().forEach(function (d) { if (d.type === 'exp' && d.cat) add({ k: 'exp', name: String(d.cat) }, 'exp'); else if (d.type === 'oinc' && d.head) add({ k: 'inc', name: String(d.head) }, 'inc'); });
    add({ k: 'cash', name: BI('lk_cash') }, 'cash');
    add({ k: 'other', name: I.SUSP.nm, t: I.SUSP.t, nm: I.SUSP.nm, a: I.SUSP.a }, 'susp');
    (A.banks ? A.banks() : []).forEach(function (x) { if (x.k === 'bank' || x.k === bankAcct()) return; add({ k: 'bank', name: A.bankLabel(x), bk: x.k }, 'bank'); });
    var acc = {}; try { acc = B.accounts(A.data().doc, A.bizName()); } catch (er) {}
    Object.keys(acc).forEach(function (a) {
      var m = /^(cap|drw|loan|given|fa|ocl|oca):(.+)$/.exec(a); if (!m) return;
      var nm = m[2].replace(/(^|\s)\S/g, function (c) { return c.toUpperCase(); });
      add({ k: 'other', name: (A.accName ? A.accName(a, {}) : '') || nm, t: m[1], nm: nm, a: a }, m[1]);
    });
    add({ k: 'other', name: BI('lk_cap'), t: 'cap', nm: 'Capital', a: 'cap:capital' }, 'cap');
    add({ k: 'other', name: BI('lk_drw'), t: 'drw', nm: 'Drawings', a: 'drw:drawings' }, 'drw');
    return out;
  }
  /* the ledgers that match what is typed, best first: names that start with it, then words that start with it, then anywhere inside */
  function findLed(q, dir, max) {
    var L = CX && CX.led || [], words = q.toLowerCase().split(/\s+/).filter(Boolean), a = [], b = [], c = [], i, j, L1, lc, ok, st;
    for (i = 0; i < L.length; i++) {
      L1 = L[i]; if (!I.allowed(L1, dir)) continue;
      lc = L1.lc; ok = true; st = 2;
      for (j = 0; j < words.length; j++) { var at = lc.indexOf(words[j]); if (at < 0) { ok = false; break; } if (at === 0) { if (j === 0) st = 0; else if (st > 1) st = 1; } else if (lc.charAt(at - 1) === ' ' && st > 1) st = 1; }
      if (!ok) continue;
      (st === 0 ? a : st === 1 ? b : c).push(L1);
      if (!words.length && a.length >= max) break;
    }
    return a.concat(b, c).slice(0, max);
  }
  function suggestions() {
    var c = ctx();
    if (!SUG) { SUG = I.suggest(Object.assign({}, c, { rules: rules().concat(SESS), ledOf: c.ledOf, ledset: c.ledset, kw: c.kw })); VER++; }
    return SUG;
  }
  /* The entries (suggestion + the user's own choice) are made once and kept until something changes (VER): a choice used to make them
     again for all 2,000 lines three or four times over. entryAt(i) makes one only. */
  var VER = 0, EN = null;
  function dirty() { VER++; }
  function entryOf(s) {
    var ed = BS.edits[s.key], e = Object.assign({}, s);
    if (ed) {
      if (ed.kind !== undefined) { e.kind = ed.kind; e.name = ed.name || ''; e.from = ed.from; e.to = ed.to; e.led = ed.led; if (ed.billId !== undefined) e.billId = ed.billId; }   /* a ledger picked by the user replaces the whole suggestion */
      else ['name', 'billId', 'from', 'to', 'led', 'note'].forEach(function (f) { if (ed[f] !== undefined) e[f] = ed[f]; });
      if (ed.note !== undefined) e.note = ed.note;
      e.edited = true;
    }
    if (e.kind === 'contra' && !e.from) e.from = BS.lines[e.i].cr ? 'cash' : 'bank';
    e.susp = e.kind === 'susp';   /* the user sent this line to the Suspense A/c: it is given its ledger afterwards (like Tally) */
    e.problem = e.kind ? I.problem(e, BS.lines[e.i]) : 'p_kind';   /* a line with no ledger is the user's to decide: it is not ticked and not sent anywhere by itself */
    e.post = ed && ed.post != null ? !!ed.post : (e.status === 'new' && !!e.kind && !e.problem);
    return e;
  }
  function entries() {
    var S = suggestions();
    if (EN && EN.v === VER && EN.bs === BS && EN.s === S) return EN.E;
    EN = { v: VER, bs: BS, s: S, E: S.map(entryOf) };
    return EN.E;
  }
  function entryAt(i) { var S = suggestions(); return EN && EN.v === VER && EN.s === S ? EN.E[i] : S[i] && entryOf(S[i]); }
  /* a choice on one line teaches the rest of this statement at once (same payee, or the same bulk transfer file): only the lines that
     could be affected are worked out again (same payee letters, same bulk file), not the whole statement */
  function teach(i) {
    var e = entryAt(i); if (!e || !e.kind) return;
    var ln = BS.lines[i], py = I.payee(ln.desc), bt = I.batchOf(ln.desc), prev = suggestions(), only = [];
    SESS = I.learn(SESS, [{ line: ln, kind: e.kind, name: e.name, from: e.from, to: e.to, led: e.led }]);
    BS.lines.forEach(function (l, j) {
      var p = prev[j]; if (!p || p.status !== 'new' || j === i) return;
      var q = l._py || (l._py = I.payee(l.desc)), a = py.core, b = q.core;
      if ((a && b && a[0] === b[0] && (a === b || (a.length >= 8 && b.indexOf(a) === 0) || (b.length >= 8 && a.indexOf(b) === 0))) || (bt && I.batchOf(l.desc) === bt)) only.push(j);
    });
    only.push(i);
    var cx = ctx(); SUG = I.suggest(Object.assign({}, cx, { rules: rules().concat(SESS), only: only, prev: prev, ledOf: cx.ledOf, ledset: cx.ledset, kw: cx.kw })); VER++;
  }
  function nextNoFn() {
    var extra = {};
    return function (type, pre, date) {
      var fy = NS.fy(date), short = fy.slice(2, 4) + '-' + fy.slice(5), k = type + fy, max = extra[k] || 0;
      A.mine().forEach(function (d) { if (d.type !== type || NS.fy(d.date) !== fy) return; var m = String(d.no || '').match(/(\d+)\s*$/); if (m) max = Math.max(max, +m[1]); });
      extra[k] = max + 1; return pre + '/' + short + '/' + String(max + 1).padStart(3, '0');
    };
  }
  function sellerCopy() { var s = JSON.parse(JSON.stringify(A.biz() || {})); delete s.id; delete s.created; delete s.updated; return s; }

  function post(list) {
    if (busy) return; busy = true;
    var c = ctx(), o = { seller: sellerCopy(), file: BS.name || '', bills: c.bills, no: nextNoFn(), bacct: bankAcct() }, recs = [], made = [], newParties = {}, skipped = 0;
    var have = {}; A.data().party.forEach(function (p) { have[key(p.name)] = 1; });
    list.forEach(function (e) {
      var l = BS.lines[e.i]; if (!e.kind) e = Object.assign({}, e, { kind: 'susp' });
      if (A.closedMsg && A.closedMsg(l.date)) { skipped++; return; }
      var r = I.records(e, l, o); if (!r) return;
      recs.push(r); made.push({ line: l, kind: e.kind, name: e.name, from: e.from });
      if ((e.kind === 'in' || e.kind === 'out') && e.name && !have[key(e.name)]) newParties[key(e.name)] = { name: e.name, role: e.kind === 'in' ? 'customer' : 'supplier' };
    });
    var all = Object.keys(newParties).map(function (k) { return ['party', newParties[k]]; }).concat(recs.map(function (r) { return ['doc', r]; })), done = 0;
    var bar = $('.bi-prog'); if (bar) { bar.hidden = false; bar.max = all.length || 1; bar.value = 0; }
    /* saved a few at a time, with the screen given a breath between, so a long statement never locks the window */
    function step() {
      var part = all.slice(done, done + 25); if (!part.length) return Promise.resolve();
      return Promise.all(part.map(function (x) { return NSStore.put(x[0], x[1]); })).then(function () {
        done += part.length; if (bar) bar.value = done;
        return new Promise(function (res) { setTimeout(res, 0); }).then(step);
      });
    }
    return step().then(function () { return saveRules(I.learn(rules(), made)); }).then(function () {
      busy = false; BS.edits = {}; SESS = []; CX = null; SUG = null; saveWip(true);
      NS.toast(BI('posted', { n: recs.length }) + (skipped ? ' ' + BI('closed', { n: skipped }) : ''));
      if (NS.checkReminder) NS.checkReminder();
      A.show();
    }).catch(function () { busy = false; CX = null; NS.toast(BI('postfail'), 'bad'); A.show(); });
  }

  /* ---------- screen ---------- */
  var KINDS = ['', 'in', 'out', 'exp', 'oinc', 'contra'], OV = {};
  /* the old kind list, only behind the small "Change type" link of a line where the kind is a real question */
  var KOPT = {}; function kindSel(e) { var s = '<select data-bikind="' + e.i + '" aria-label="' + esc(BI('what')) + '">'; KINDS.forEach(function (k) { s += '<option value="' + k + '"' + (e.kind === k ? ' selected' : '') + '>' + (KOPT[k] || (KOPT[k] = esc(BI('k_' + (k || 'none'))))) + '</option>'; }); return s + '</select>'; }
  var TG = { 'in': 'tg_in', out: 'tg_out', exp: 'tg_exp', oinc: 'tg_oinc', jv: 'tg_jv' };
  function tagText(e) {
    if (!e.kind) return '';
    var lg = I.ledgerOf(e), l = BS.lines[e.i], kind = '';
    if (e.kind === 'contra') return BI(lg && lg.tag === 'bank' ? 'tg_xfer' : l.cr ? 'tg_dep' : 'tg_wd');
    if (lg && lg.tag === 'party') { var r = CX.roles[key(lg.name)]; kind = BI(r ? 'lk_' + r : 'lk_newparty'); }
    else if (lg && lg.tag === 'exp') kind = BI('lk_exp'); else if (lg && lg.tag === 'inc') kind = BI('lk_inc'); else if (e.kind === 'jv' && e.led) kind = BI('lk_' + e.led.t);
    return (kind ? kind + ' · ' : '') + BI(TG[e.kind]);
  }
  function ledText(e) {
    var lg = I.ledgerOf(e); if (!lg) return '';
    if (lg.tag === 'cash') return BI('lk_cash');
    if (lg.tag === 'bank') { var bk = (A.banks ? A.banks() : []).filter(function (x) { return x.k === lg.bk; })[0]; return bk ? A.bankLabel(bk) : lg.name; }
    return lg.name;
  }
  /* a line where the kind is a real question: a party whose role is the other way round (a supplier who paid us), or a line that cannot be posted as it stands */
  function ambiguous(e) { if (!e.kind) return false; if (e.problem) return true; var n = e.kind === 'in' || e.kind === 'out' ? CX.roles[key(e.name)] : ''; return (e.kind === 'in' && n === 'supplier') || (e.kind === 'out' && n === 'customer'); }
  /* "Columns of the file": the picks wait here (COLD) until the user presses "Use these columns", so the panel stays open
     while every column is chosen (owner 25 Nov: it used to read the file again and close after the first pick) */
  var COLD = null, PS = null, POPE = null, PICK = null;
  function popEl() { if (!POPE || !POPE.isConnected) { POPE = NS.el('div', { 'class': 'bi-pop', role: 'listbox' }); POPE.hidden = true; document.body.appendChild(POPE); POPE.addEventListener('mousedown', function (e) { var o = e.target.closest('[data-bio]'); if (!o || !PS) return; e.preventDefault(); if (PICK) PICK(PS.items[+o.getAttribute('data-bio')]); }); } return POPE; }
  function closePop() { if (POPE) POPE.hidden = true; if (PS && PS.inp) PS.inp.setAttribute('aria-expanded', 'false'); PS = null; }
  /* the list follows its box when the page scrolls or the window changes size (a scroll inside the list itself is left alone) */
  var DRAW = null;
  window.addEventListener('scroll', function (e) { if (PS && DRAW && PS.inp.isConnected && !(POPE && e.target instanceof Node && POPE.contains(e.target))) DRAW(); }, true);
  window.addEventListener('resize', function () { if (PS && DRAW && PS.inp.isConnected) DRAW(); });
  function colMap() { return COLD || (BS && BS.map) || {}; }
  function colCount() {
    if (!BS || !BS.rows) return '';
    var n = K.statement(BS.rows, colMap(), BS.header).lines.length;
    return n ? BI('colfound', { n: n }) : BI('colnone');
  }
  function colsHtml() {
    var M = colMap(), rows = BS && BS.rows || [], n = rows.length ? Math.max.apply(null, rows.slice(0, 50).map(function (r) { return r.length; })) : 0, hdr = BS && BS.header >= 0 ? rows[BS.header] || [] : [];
    var opt = function (k) { return '<option value="">—</option>' + Array.apply(null, Array(n)).map(function (_, i) { return '<option value="' + i + '"' + (M[k] === i ? ' selected' : '') + '>' + esc((i + 1) + (hdr[i] ? ': ' + String(hdr[i]).slice(0, 24) : '')) + '</option>'; }).join(''); };
    /* the first rows of the file, with column numbers, so the user can see which column holds what */
    var from = Math.max(0, BS && BS.header >= 0 ? BS.header : 0), show = rows.slice(from, from + 6), cut = function (v) { v = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); return v.length > 22 ? v.slice(0, 21) + '…' : v; };
    var prev = n ? '<p class="soft">' + esc(BI('colprev')) + '</p><div class="tbl-wrap bi-colprev"><table class="tbl"><thead><tr>' + Array.apply(null, Array(n)).map(function (_, i) { return '<th>' + (i + 1) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      show.map(function (r) { return '<tr>' + Array.apply(null, Array(n)).map(function (_, i) { return '<td class="l">' + esc(cut(r[i])) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' : '';
    return '<p class="hint">' + esc(BI('colsh')) + '</p>' + prev + '<div class="fg br-map">' + COLS.map(function (k) { return '<div class="f"><label for="bi-c-' + k + '">' + esc(BI('c_' + k)) + '</label><select id="bi-c-' + k + '" data-bicol="' + k + '">' + opt(k) + '</select></div>'; }).join('') + '</div>' +
      '<p class="bi-colcount sb-note" aria-live="polite">' + esc(colCount()) + '</p><div class="btns"><button type="button" class="btn primary" data-bicolok' + (COLD ? '' : ' disabled') + '>' + esc(BI('colok')) + '</button> <button type="button" class="btn" data-bicolx' + (COLD ? '' : ' hidden') + '>' + esc(BI('colundo')) + '</button></div>';
  }
  function rowHtml(e) {
    var l = BS.lines[e.i], dis = e.status !== 'new' && !(BS.edits[e.key] && BS.edits[e.key].post);
    var nameBox = '', billSel = '';
    nameBox = '<span class="bi-led"><input class="bi-ledin" data-biled="' + e.i + '" role="combobox" aria-autocomplete="list" aria-expanded="false" autocomplete="off" dir="auto" value="' + esc(ledText(e)) + '" placeholder="' + esc(BI('ledph')) + '" aria-label="' + esc(BI('ledger')) + '">' + (e.kind === 'susp' ? '<span class="bi-tag bi-susp">' + esc(BI('tg_susp')) + '</span>' : e.kind ? '<span class="bi-tag">' + esc(tagText(e)) + '</span>' : '') + '</span>';
    if (e.kind === 'in' || e.kind === 'out') {
      var mine = CX.billsBy[(e.kind === 'in' ? 'recv' : 'pay') + '|' + key(e.name)] || [];
      if (mine.length) billSel = '<select data-bibill="' + e.i + '" aria-label="' + esc(BI('bill')) + '"><option value="">' + esc(BI('oldest')) + '</option>' + mine.map(function (b) { return '<option value="' + esc(b.id) + '"' + (e.billId === b.id ? ' selected' : '') + '>' + esc((b.no || '—') + ' · ' + NS.fmtDate(b.date) + ' · ' + money(b.left, false)) + '</option>'; }).join('') + '</select>';
    }
    var kwl = e.kind && e.kind !== 'susp' ? '<button type="button" class="bi-lnk" data-bikw="' + e.i + '" title="' + esc(BI('kw_hint')) + '">+ ' + esc(BI('kw_one')) + '</button>' : '';
    var chg = ambiguous(e) ? (OV[e.i] ? kindSel(e) : '<button type="button" class="bi-lnk" data-bitype="' + e.i + '">' + esc(BI('chtype')) + '</button>') : '';
    var why = e.edited ? '' : e.why ? '<span class="soft bi-why' + (e.conf === 'guess' ? ' bi-guess' : '') + '">' + esc(BI(e.why)) + '</span>' : '';
    var state = e.status === 'done' ? '<span class="soft">' + esc(BI('s_done')) + '</span>' : e.status === 'inbooks' ? '<span class="soft">' + esc(BI('s_inbooks')) + '</span>' : why;
    return '<tr data-birow="' + e.i + '"' + (e.status !== 'new' ? ' class="soft"' : '') + '><td><input type="checkbox" data-bipost="' + e.i + '"' + (e.post ? ' checked' : '') + (e.problem && !e.post ? ' disabled' : '') + ' aria-label="' + esc(BI('postthis')) + '"></td>' +
      '<td>' + NS.fmtDate(l.date) + '</td><td class="l bi-desc">' + esc(l.desc || '—') + (l.ref ? ' <span class="mono soft">' + esc(l.ref) + '</span>' : '') + '</td><td class="n">' + (l.dr ? money(l.dr, false) : '') + '</td><td class="n">' + (l.cr ? money(l.cr, false) : '') + '</td>' +
      '<td class="l bi-do">' + (dis ? state : nameBox + billSel + chg + kwl + (e.status === 'new' && e.kind && e.problem ? '<span class="sb-note bad">' + esc(BI(e.problem)) + '</span>' : state)) + '</td></tr>';
  }
  function matches(e) {
    if (filt !== 'all' && !(filt === 'todo' ? e.status === 'new' : filt === 'ready' ? e.post : filt === 'susp' ? e.status === 'new' && e.susp : !e.post && e.status === 'new')) return false;
    if (!find) return true;
    var l = BS.lines[e.i], t = (l.desc + ' ' + l.ref + ' ' + (e.name || '') + ' ' + (l.dr || l.cr)).toLowerCase();
    return find.split(/\s+/).every(function (w) { return t.indexOf(w) >= 0; });
  }
  /* the part that changes with every choice: tiles, the page of lines, the post button */
  function bodyParts() {
    var E = entries(), ready = E.filter(function (e) { return e.post; }), rev = E.filter(function (e) { return e.status === 'new' && !e.post && !e.susp; }), parked = E.filter(function (e) { return e.status === 'new' && e.susp; }).length, skip = E.length - E.filter(function (e) { return e.status === 'new'; }).length;
    var guess = E.filter(function (e) { return e.status === 'new' && e.conf === 'guess' && !e.edited; }).length;
    var shown = E.filter(matches), pages = Math.max(1, Math.ceil(shown.length / PAGE)); if (page >= pages) page = pages - 1; if (page < 0) page = 0;
    var din = 0, dout = 0; ready.forEach(function (e) { din += BS.lines[e.i].cr; dout += BS.lines[e.i].dr; });
    var tiles = '<div class="tiles"><div class="tile"><span>' + esc(BI('t_lines')) + '</span><b>' + E.length + '</b></div><div class="tile ok"><span>' + esc(BI('t_ready')) + '</span><b>' + ready.length + '</b></div><div class="tile' + (rev.length ? ' warn' : '') + '"><span>' + esc(BI('t_review')) + '</span><b>' + rev.length + '</b></div><div class="tile"><span>' + esc(BI('t_skip')) + '</span><b>' + skip + '</b></div></div>';
    var pager = pages > 1 ? '<div class="bi-pager"><button type="button" class="btn sm" data-bipage="-1"' + (page ? '' : ' disabled') + '>' + esc(BI('prev')) + '</button> <span class="soft">' + esc(BI('pageof', { a: page * PAGE + 1, b: Math.min(shown.length, (page + 1) * PAGE), n: shown.length })) + '</span> <button type="button" class="btn sm" data-bipage="1"' + (page < pages - 1 ? '' : ' disabled') + '>' + esc(BI('next')) + '</button></div>' : '';
    var vis = shown.slice(page * PAGE, (page + 1) * PAGE), allOn = vis.length && vis.every(function (e) { return e.post || e.problem; });
    return {
      top: tiles + (rev.length ? '<p class="sb-note">' + esc(BI('parkn', { n: rev.length })) + ' <button type="button" class="btn sm" data-bipark>' + esc(BI('parkall')) + '</button></p>' : '') + (guess ? '<p class="sb-note">' + esc(BI('guessn', { n: guess })) + ' <button type="button" class="btn sm" data-biguess>' + esc(BI('guessshow')) + '</button></p>' : ''), pg: pager,
      head: '<tr><th><input type="checkbox" data-biallpage' + (allOn ? ' checked' : '') + ' aria-label="' + esc(BI('tickpage')) + '" title="' + esc(BI('tickpage')) + '"></th><th>' + esc(BI('c_date')) + '</th><th class="l">' + esc(BI('c_desc')) + '</th><th class="n">' + esc(BI('wd')) + '</th><th class="n">' + esc(BI('dep')) + '</th><th class="l">' + esc(BI('ledger')) + '</th></tr>',
      rows: vis.map(function (e) { return { i: e.i, h: rowHtml(e) }; }), empty: '<tr><td colspan="6" class="soft">' + esc(BI('none')) + '</td></tr>',
      foot: '<button type="button" class="btn primary" data-bipostall' + (ready.length ? '' : ' disabled') + '>' + esc(BI('postn', { n: ready.length })) + '</button> <span class="soft">' + esc(BI('sum', { i: money(din, false), o: money(dout, false) })) + '</span> <progress class="bi-prog" hidden></progress>'
    };
  }
  var LAST = null;   /* what is on the screen now, so a choice changes only the lines that changed */
  function bodyHtml() {
    var P = bodyParts(); LAST = { top: P.top, pg: P.pg, head: P.head, foot: P.foot, rows: P.rows.map(function (r) { return r.h; }), order: P.rows.map(function (r) { return r.i; }).join(',') };
    return '<div class="bi-top">' + P.top + '</div><div class="bi-pg">' + P.pg + '</div><div class="tbl-wrap"><table class="tbl bi-t"><thead>' + P.head + '</thead><tbody>' + (P.rows.length ? LAST.rows.join('') : P.empty) + '</tbody></table></div><div class="bi-pg">' + P.pg + '</div><div class="btns bi-foot">' + P.foot + '</div>';
  }
  /* a choice used to draw the whole page of lines again (100 rows of inputs); now only the rows whose text changed are replaced */
  function patchBody(body) {
    var P = bodyParts(), order = P.rows.map(function (r) { return r.i; }).join(','), tb = $('.bi-t tbody', body);
    if (!LAST || !tb || LAST.order !== order || !P.rows.length || tb.rows.length !== P.rows.length) { body.innerHTML = bodyHtml(); return; }
    var put = function (sel, h, key) { if (LAST[key] === h) return; var el = $(sel, body); if (el) el.innerHTML = h; LAST[key] = h; };
    put('.bi-top', P.top, 'top'); put('.bi-t thead', P.head, 'head'); put('.bi-foot', P.foot, 'foot');
    if (LAST.pg !== P.pg) { $$('.bi-pg', body).forEach(function (el) { el.innerHTML = P.pg; }); LAST.pg = P.pg; }
    var tmp = document.createElement('tbody');
    P.rows.forEach(function (r, k) { if (LAST.rows[k] === r.h) return; tmp.innerHTML = r.h; tb.rows[k].replaceWith(tmp.firstChild); LAST.rows[k] = r.h; });
  }
  function html() {
    var head = '<div class="pane-hd"><h2>' + esc(A.T('bimp')) + '</h2><div class="quick">' + (BS ? '<button type="button" class="btn" data-biclose>' + esc(BI('close')) + '</button>' : '') + '<label class="btn primary" for="bi-file">' + esc(BI(BS ? 'other' : 'open')) + '</label><input type="file" id="bi-file" class="sr" accept=".csv,.txt,.xls,.xlsx,.pdf,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></div></div>';
    var spb = '<div class="bi-kwbox">' + kwHtml() + '</div><div class="bi-spbox">' + spHtml() + '</div>';
    var w = !BS && WIP[bizKey()];
    if (w) head += '<div class="card bi-wip"><p>' + esc(BI('wip', { f: w.name, n: K.statement(wipRows(w), w.map, w.header).lines.length, k: Object.keys(w.edits || {}).length, d: NS.fmtDate(new Date(w.at).toISOString().slice(0, 10)) })) + '</p><div class="btns"><button type="button" class="btn primary" data-biwip>' + esc(BI('wipgo')) + '</button> <button type="button" class="btn" data-biwipx>' + esc(BI('wipnew')) + '</button></div></div>';
    if (!BS || !BS.lines.length) return head + spb + '<div class="card"><h3>' + esc(BI('start')) + '</h3><p>' + esc(BI('starth')) + '</p>' + (BS && !BS.lines.length ? '<p class="sb-note bad">' + esc(BI('nolines')) + '</p>' + colsHtml() : '') +
      '<ol><li>' + esc(BI('s1')) + '</li><li>' + esc(BI('s2')) + '</li><li>' + esc(BI('s3')) + '</li><li>' + esc(BI('s4')) + '</li></ol><p class="soft">' + esc(BI('priv')) + '</p></div>';
    ctx();
    return head + spb + (BS.laid ? '<p class="sb-note">' + esc(BI('laid')) + '</p>' : '') + '<p class="sb-note">' + esc(BI('from', { f: BS.name, n: BS.lines.length, a: NS.fmtDate(BS.lines[0].date), b: NS.fmtDate(BS.lines[BS.lines.length - 1].date) })) + '</p>' + '<details class="br-cols"' + (COLD ? ' open' : '') + '><summary>' + esc(BI('cols')) + '</summary>' + colsHtml() + '</details>' +
      '<div class="tools-row">' + (A.banks && A.banks().length > 1 ? '<label>' + esc(A.T('bankacct')) + ' <select data-biacct>' + A.banks().map(function (x) { return '<option value="' + esc(x.k) + '"' + (x.k === bankAcct() ? ' selected' : '') + '>' + esc(A.bankLabel(x)) + '</option>'; }).join('') + '</select></label> ' : '') +
      '<label>' + esc(BI('show')) + ' <select data-bifilt>' + [['todo', 'f_todo'], ['ready', 'f_ready'], ['review', 'f_review'], ['susp', 'f_susp'], ['all', 'f_all']].map(function (x) { return '<option value="' + x[0] + '"' + (filt === x[0] ? ' selected' : '') + '>' + esc(BI(x[1])) + '</option>'; }).join('') + '</select></label> ' +
      '<label>' + esc(BI('find')) + ' <input type="search" data-bifind value="' + esc(find) + '" placeholder="' + esc(BI('findph')) + '"></label></div>' +
      '<p class="hint">' + esc(BI('table_h')) + '</p><div class="bi-body">' + bodyHtml() + '</div>' +
      '<p class="soft">' + esc(BI('remember')) + '</p>';
  }
  /* redraw only the changing part; the cursor goes to WANT (or stays on the box it was on) */
  function refresh(pane) {
    saveWip();
    var body = $('.bi-body', pane); if (!body) { A.show(); return; }
    var fa = document.activeElement, fsel = '';
    if (!WANT && fa && body.contains(fa)) { ['data-biled', 'data-bikind', 'data-bibill', 'data-bipost'].forEach(function (a) { if (!fsel && fa.hasAttribute(a)) fsel = '[' + a + '="' + fa.getAttribute(a) + '"]'; }); }
    patchBody(body);
    var w = WANT || fsel; WANT = '';
    if (w) { var el = $(w, body); if (el) { el.focus({ preventScroll: true }); if (el.select && el.tagName === 'INPUT' && el.type !== 'checkbox') try { el.select(); } catch (er) {} el.scrollIntoView({ block: 'nearest' }); } }
  }
  A.addSection('bimp', function () { if (!RULES) { loadRules().then(function () { if (/^#bimp/.test(location.hash)) A.show(); }); return '<div class="pane-hd"><h2>' + esc(A.T('bimp')) + '</h2></div><p class="soft">…</p>'; } return html(); }, function (pane) {
    var wg = $('[data-biwip]', pane); if (wg) wg.addEventListener('click', function () { var w = WIP[bizKey()]; if (w.acct) acct = w.acct; setRows(wipRows(w), w.name, w.map, w); });
    var wx = $('[data-biwipx]', pane); if (wx) wx.addEventListener('click', function () { delete WIP[bizKey()]; saveWip(true); A.show(); });
    var bc = $('[data-biclose]', pane); if (bc) bc.addEventListener('click', function () { (NS.ask ? NS.ask(BI('closeq')) : Promise.resolve(window.confirm(BI('closeq')))).then(function (y) { if (!y) return; BS = null; CX = null; SUG = null; SESS = []; saveWip(true); A.show(); }); });
    var fi = $('#bi-file', pane); if (fi) fi.addEventListener('change', function () { if (fi.files[0]) readFile(fi.files[0]); fi.value = ''; });
    var ba = $('[data-biacct]', pane); if (ba) ba.addEventListener('change', function () { acct = ba.value; CX = null; A.show(); });
    $$('[data-bicol]', pane).forEach(function (s) { s.addEventListener('change', function () {
      COLD = Object.assign({}, colMap()); COLD[s.getAttribute('data-bicol')] = s.value === '' ? null : +s.value;
      var c = $('.bi-colcount', pane), ok = $('[data-bicolok]', pane), x = $('[data-bicolx]', pane);
      if (c) c.textContent = colCount(); if (ok) ok.disabled = false; if (x) x.hidden = false;
    }); });
    var cok = $('[data-bicolok]', pane); if (cok) cok.addEventListener('click', function () { var m = COLD; COLD = null; WANT = ''; setRows(BS.rows, BS.name, m); if (BS.lines.length) keepLayout(m); var d = $('.br-cols', $('#main') || document); if (d && !BS.lines.length) d.open = true; });
    var cx = $('[data-bicolx]', pane); if (cx) cx.addEventListener('click', function () { COLD = null; A.show(); });
    var ft = $('[data-bifilt]', pane); if (ft) ft.addEventListener('change', function () { filt = ft.value; page = 0; refresh(pane); });
    var fd = $('[data-bifind]', pane), ftm = 0; if (fd) fd.addEventListener('input', function () { clearTimeout(ftm); ftm = setTimeout(function () { find = fd.value.trim().toLowerCase(); page = 0; refresh(pane); }, 200); });
    var body0 = $('.bi-body', pane), spbox = $('.bi-spbox', pane), kwbox = $('.bi-kwbox', pane); if (!body0 && !spbox && !kwbox) return;
    var body = body0 || document.createElement('div');
    function onHosts(type, fn) { [body0, spbox, kwbox].forEach(function (h) { if (h) h.addEventListener(type, fn); }); }
    function isLed(el) { return !!(el && el.hasAttribute && (el.hasAttribute('data-biled') || el.hasAttribute('data-bispick') || el.hasAttribute('data-bikwled') || el.hasAttribute('data-bispline'))); }
    function isPn(el) { return !!(el && el.hasAttribute && (el.hasAttribute('data-bispick') || el.hasAttribute('data-bikwled') || el.hasAttribute('data-bispline'))); }
    function rowOf(el) { return el.getAttribute('data-biled') || el.getAttribute('data-bikind') || el.getAttribute('data-bibill'); }
    /* the ledger box of the next line down */
    function nextLed(el) { var tr = el.closest('tr'); while (tr && (tr = tr.nextElementSibling)) { var n = tr.querySelector('[data-biled]'); if (n) return '[data-biled="' + n.getAttribute('data-biled') + '"]'; } return ''; }
    if (WANT) { var w = $(WANT, pane); WANT = ''; if (w) { w.focus(); if (w.select && w.tagName === 'INPUT') try { w.select(); } catch (er) {} w.scrollIntoView({ block: 'nearest' }); } }
    function ed(i) { var k = ctx().keys[+i]; BS.edits[k] = BS.edits[k] || {}; dirty(); return BS.edits[k]; }
    wireSusp(pane, spbox); wireKeys(pane, kwbox);

    /* ---------- the ledger picker: one box per line (26 Nov 2026) ----------
       Type a few letters of any ledger; each match shows what kind it is (Fedex · Supplier). The ledger picked decides what the line is
       (NSBI.fromLedger): a supplier with money out is a payment, a customer with money in a receipt, an expense head an expense, and so on.
       One list is drawn for the whole screen and moved under the box in use, so nothing of it is kept for each of the lines. */
    closePop();
    function pickItem(it) {
      if (!PS) return; var i = PS.i, q = PS.q, inp = PS.inp, nx = isPn(inp) ? '' : nextLed(inp); closePop();
      var L = it.L;
      if (!L) {   /* a name that is not a ledger yet, made from what was typed */
        L = it.nw === 'party' ? { k: 'party', name: q } : it.nw === 'exp' ? { k: 'exp', name: q } : it.nw === 'inc' ? { k: 'inc', name: q } : { k: 'other', name: q, t: 'loan', nm: q, a: 'loan:' + key(q) };
      }
      if (inp.hasAttribute('data-bispline')) {   /* a Suspense line: this ledger, applied at once; the cursor goes to the next line's box */
        var dir0 = spDirOf(inp.getAttribute('data-bispline')); if (!I.allowed(L, dir0)) { NS.toast(BI('sp_skip', { n: 1 }), 'bad'); return; }
        var tr = inp.closest('tr'), nx2 = tr && tr.nextElementSibling && tr.nextElementSibling.querySelector('[data-bispline]'); SPFOCUS = nx2 ? nx2.getAttribute('data-bispline') : '';
        spApply(pane, 'led', [inp.getAttribute('data-bispline')], L); return;
      }
      if (inp.hasAttribute('data-bikwled')) { KW.led = L; inp.value = L.name; inp.defaultValue = L.name; var kt = $('[data-bikwtext]', pane); if (kt) kt.focus(); return; }   /* the keyword box: the ledger the keywords are for */
      if (inp.hasAttribute('data-bispick')) { SP.led = L; inp.value = L.name; inp.defaultValue = L.name; return; }   /* the Suspense panel: the ledger for the ticked lines */
      var ln = BS.lines[+i], f = I.fromLedger(L, ln.cr ? 'cr' : 'dr'), o = ed(i);
      o.kind = f.kind; o.name = f.name || ''; o.from = f.from; o.to = f.to; o.led = f.led; o.billId = ''; o.post = null;
      WANT = WANT || nx; teach(+i); refresh(pane);
    }
    function drawPop() {
      var P = popEl(), q = PS.q;
      P.innerHTML = PS.items.length ? PS.items.map(function (it, j) {
        return '<div class="bi-opt' + (j === PS.hi ? ' on' : '') + '" role="option" aria-selected="' + (j === PS.hi) + '" data-bio="' + j + '">' + (it.L ? '<span>' + esc(it.L.name) + '</span><small>' + esc(BI('lk_' + it.L.lab)) + '</small>' : '<span>' + esc(BI('new_' + it.nw, { n: q })) + '</span><small>' + esc(BI('new')) + '</small>') + '</div>';
      }).join('') : '<div class="bi-none">' + esc(BI('nomatch')) + '</div>';
      var r = PS.inp.getBoundingClientRect(), vh = window.innerHeight || 700, below = vh - r.bottom;
      P.style.left = Math.max(4, Math.min(r.left, (window.innerWidth || 1000) - 300)) + 'px'; P.style.minWidth = Math.max(260, r.width) + 'px';
      if (below < 240 && r.top > below) { P.style.top = ''; P.style.bottom = (vh - r.top + 2) + 'px'; } else { P.style.bottom = ''; P.style.top = (r.bottom + 2) + 'px'; }
      P.hidden = false; PS.inp.setAttribute('aria-expanded', 'true');
      var on = P.querySelector('.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
    }
    DRAW = drawPop;
    function openPop(inp) {
      var pn = isPn(inp), i = pn ? -1 : +inp.getAttribute('data-biled'), l = pn ? null : BS.lines[i], dir = inp.hasAttribute('data-bispline') ? spDirOf(inp.getAttribute('data-bispline')) : pn ? '' : l.cr ? 'cr' : 'dr', q = inp.value.trim(), changed = q !== (inp.defaultValue || '').trim();
      var items = findLed(changed ? q : '', dir, 12).map(function (L) { return { L: L }; });
      if (changed && q && !items.some(function (x) { return x.L.lc === q.toLowerCase(); })) { items.push({ nw: 'party' }); if (dir) items.push({ nw: dir === 'dr' ? 'exp' : 'inc' }); items.push({ nw: 'loan' }); }
      PS = { inp: inp, i: i, dir: dir, q: q, items: items, hi: 0 }; drawPop();
    }
    onHosts('input', function (e) { if (isLed(e.target)) openPop(e.target); });
    /* a click into a ledger box selects what is there, so typing replaces it (a plain click would put the cursor in the middle of the old name) */
    onHosts('focusin', function (e) { var el = e.target; if (isLed(el)) { if (PS && PS.inp !== el) closePop(); try { el.select(); } catch (er) {} el._bis = 1; } });
    onHosts('mouseup', function (e) { var el = e.target; if (el._bis) { el._bis = 0; e.preventDefault(); try { el.select(); } catch (er) {} } });
    onHosts('focusout', function (e) {
      var el = e.target; if (!isLed(el)) return;
      setTimeout(function () { if (el.isConnected && document.activeElement !== el && el.value !== el.defaultValue) { if (PS && PS.inp === el) closePop(); el.value = el.defaultValue; } else if (PS && PS.inp === el && document.activeElement !== el) closePop(); }, 160);   /* left without choosing: the old ledger stays */
    });
    onHosts('keydown', function (e) {
      var el = e.target; if (!el.matches('[data-biled],[data-bispick],[data-bikwled],[data-bispline],[data-bikind],[data-bibill]')) return;
      var led = isLed(el);
      if (led && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault(); if (!PS || PS.inp !== el) { openPop(el); return; }
        var n = PS.items.length; if (n) { PS.hi = (PS.hi + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; drawPop(); } return;
      }
      if (led && e.key === 'Escape' && PS) { e.preventDefault(); e.stopPropagation(); closePop(); el.value = el.defaultValue; return; }
      if (led && ((e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) || (e.key === 'Tab' && !e.shiftKey)) && PS && PS.inp === el && PS.items.length && el.value.trim() !== (el.defaultValue || '').trim()) { e.preventDefault(); pickItem(PS.items[PS.hi]); return; }
      if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey) return;
      e.preventDefault(); if (isPn(el)) return;
      /* Enter on a line's box goes on like Tab: to the bill when there is one, else to the next line's ledger */
      var i = rowOf(el), to = led && $('[data-bibill="' + i + '"]', body) ? '[data-bibill="' + i + '"]' : nextLed(el);
      if (led && el.value.trim() === '' && el.defaultValue) { var o0 = ed(i); o0.kind = ''; o0.name = ''; o0.from = o0.to = o0.led = undefined; o0.billId = ''; o0.post = null; WANT = to; refresh(pane); return; }
      var t = to && $(to, body);
      if (t) { t.focus(); if (t.select && t.tagName === 'INPUT') try { t.select(); } catch (er) {} t.scrollIntoView({ block: 'nearest' }); }
    });
    PICK = pickItem;
    body.addEventListener('change', function (ev) {
      var s = ev.target, i;
      if ((i = s.getAttribute('data-bikind')) != null) {   /* "Change type": the kind list for the rare line where the kind is a question */
        var e0 = entryAt(+i) || {}, o = ed(i); o.kind = s.value; o.billId = ''; o.name = s.value === 'in' || s.value === 'out' ? e0.name || '' : s.value === 'exp' ? 'Bank charges' : s.value === 'oinc' ? 'Interest received' : ''; o.from = o.to = o.led = undefined; o.post = null;
        if (s.value === 'contra') o.from = BS.lines[+i].cr ? 'cash' : 'bank'; OV[i] = false; WANT = WANT || nextLed(s); teach(+i); refresh(pane); return;
      }
      if ((i = s.getAttribute('data-bibill')) != null) { ed(i).billId = s.value; WANT = WANT || nextLed(s); refresh(pane); return; }
      if ((i = s.getAttribute('data-bipost')) != null) { ed(i).post = s.checked; if (s.checked) teach(+i); refresh(pane); return; }   /* ticking a name read from the details confirms it for its other lines too */
      if (s.hasAttribute('data-biallpage')) {
        var on = s.checked, E = entries().filter(matches).slice(page * PAGE, (page + 1) * PAGE);
        E.forEach(function (e) { if (!e.problem || !on) ed(e.i).post = on && !e.problem; }); refresh(pane);
      }
    });
    body.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-bikw')) {   /* a keyword for the ledger of this line, started from the payee's name */
        var ki = +b.getAttribute('data-bikw'), ke = entryAt(ki), KL = ke && ledFor(ke);
        if (!KL) { NS.toast(BI('kw_noled'), 'bad'); return; }
        askText(BI('kw_for', { l: KL.name }), BI('kw_ask'), (I.payee(BS.lines[ki].desc).name || '')).then(function (v) {
          if (v == null) return; var n = addKeywords(KL, v); if (!n) { NS.toast(BI('kw_nothing'), 'bad'); return; }
          saveKeys().then(function () { NS.toast(BI('kw_saved', { n: n })); A.show(); });
        }); return;
      }
      if (b.hasAttribute('data-bipark')) {   /* the user's own choice: every line that still has no ledger waits in the Suspense A/c */
        var todo = entries().filter(function (e) { return e.status === 'new' && !e.kind; });
        (NS.ask ? NS.ask(BI('parkq', { n: todo.length })) : Promise.resolve(window.confirm(BI('parkq', { n: todo.length })))).then(function (yes) {
          if (!yes) return;
          todo.forEach(function (e) { var o = ed(e.i); o.kind = 'susp'; o.name = I.SUSP.nm; o.from = o.to = o.led = undefined; o.billId = ''; o.post = true; });
          refresh(pane);
        }); return;
      }
      if (b.hasAttribute('data-bitype')) { var ti = b.getAttribute('data-bitype'); OV[ti] = true; WANT = '[data-bikind="' + ti + '"]'; refresh(pane); return; }
      if (b.hasAttribute('data-bipage')) { page += +b.getAttribute('data-bipage'); refresh(pane); var t = $('.bi-t', body); if (t) t.scrollIntoView({ block: 'start' }); return; }
      if (b.hasAttribute('data-biguess')) { filt = 'guess'; page = 0; var f2 = $('[data-bifilt]', pane); if (f2) f2.value = 'guess'; refresh(pane); return; }
      if (b.hasAttribute('data-bipostall')) {
        var list = entries().filter(function (e) { return e.post && !e.problem; });
        var ns = list.filter(function (e) { return e.kind === 'susp'; }).length, msg = BI('confirm', { n: list.length }) + (ns ? ' ' + BI('confirm_s', { s: ns }) : '');
        (NS.ask ? NS.ask(msg) : Promise.resolve(window.confirm(msg))).then(function (yes) { if (yes) post(list); });
      }
    });
  });
  /* ---------- the Suspense A/c panel (like Tally's Suspense ledger view: narration search, suggested ledger, Replace Ledger) ----------
     Lines posted with no ledger sit in the Suspense A/c as journals that keep the line's own words. Here they are found by their narration,
     shown with the ledger the keywords and past choices suggest, and given a ledger in bulk. The record is changed in place (same number
     of records, same line key), so the line is never posted twice and the books are right at every step. */
  var SP = { open: false, sel: {}, find: '', page: 0, led: null }, SPC = null, SPP = 50;
  function suspDocs() { return A.mine().filter(function (d) { return d.susp && d.type === 'jv'; }).sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); }); }
  function suspLine(d, i) { var sl = (d.lines || []).filter(function (l) { return l.a === I.SUSP.a; })[0] || {}, out = (+sl.dr || 0) > 0, amt = out ? +sl.dr : +sl.cr; return { date: d.date, desc: d.sdesc || d.narr || '', ref: d.sref || '', dr: out ? amt : 0, cr: out ? 0 : amt, i: i || 0 }; }
  function suspSug(docs) {
    var LC = ledCtx(), k = docs.length + '|' + LC.st + '|' + RV; if (SPC && SPC.k === k) return SPC.m;
    var S = I.suggest({ lines: docs.map(function (d, i) { return suspLine(d, i); }), keys: docs.map(function (d) { return d.bsk || d.id; }), parties: LC.names, pindex: LC.pindex, bills: [], rules: rules(), done: {}, book: [], ledOf: LC.ledOf, ledset: LC.ledset, kw: LC.kw }), m = {};
    docs.forEach(function (d, i) { m[d.id] = S[i]; }); SPC = { k: k, m: m }; return m;
  }
  function spShown(docs) { var w = SP.find.toLowerCase().split(/\s+/).filter(Boolean); return docs.filter(function (d) { var t = ((d.sdesc || '') + ' ' + (d.narr || '') + ' ' + (d.total || '')).toLowerCase(); return w.every(function (x) { return t.indexOf(x) >= 0; }); }); }
  function spHtml() {
    var docs = suspDocs(); if (!docs.length) return '';
    var h = '<div class="card bi-sp"><div class="bi-sphd"><b>' + esc(BI('sp_title', { n: docs.length })) + '</b> <button type="button" class="btn sm" data-bispopen>' + esc(BI(SP.open ? 'sp_hide' : 'sp_show')) + '</button></div>';
    if (!SP.open) return h + '<p class="soft">' + esc(BI('sp_h')) + '</p></div>';
    var sug = suspSug(docs), shown = spShown(docs), pages = Math.max(1, Math.ceil(shown.length / SPP)); if (SP.page >= pages) SP.page = pages - 1; if (SP.page < 0) SP.page = 0;
    var vis = shown.slice(SP.page * SPP, (SP.page + 1) * SPP), all = vis.length && vis.every(function (d) { return SP.sel[d.id]; }), nsel = docs.filter(function (d) { return SP.sel[d.id]; }).length;
    h += '<div class="tools-row"><label>' + esc(BI('sp_find')) + ' <input type="search" data-bispfind value="' + esc(SP.find) + '" placeholder="' + esc(BI('findph')) + '"></label></div>' +
      '<div class="tbl-wrap"><table class="tbl bi-spt"><thead><tr><th><input type="checkbox" data-bispall' + (all ? ' checked' : '') + ' aria-label="' + esc(BI('tickpage')) + '"></th><th>' + esc(BI('c_date')) + '</th><th class="l">' + esc(BI('c_desc')) + '</th><th class="n">' + esc(BI('wd')) + '</th><th class="n">' + esc(BI('dep')) + '</th><th class="l">' + esc(BI('sp_linecol')) + '</th></tr></thead><tbody>' +
      vis.map(function (d) {
        var l = suspLine(d), e = sug[d.id], t = e && e.kind && e.kind !== 'susp' ? ledText(e) || BI('lk_cash') : '';
        return '<tr><td><input type="checkbox" data-bispsel="' + esc(d.id) + '"' + (SP.sel[d.id] ? ' checked' : '') + '></td><td>' + NS.fmtDate(d.date) + '</td><td class="l bi-desc">' + esc(l.desc || '—') + '</td><td class="n">' + (l.dr ? money(l.dr, false) : '') + '</td><td class="n">' + (l.cr ? money(l.cr, false) : '') + '</td><td class="l"><span class="bi-led"><input class="bi-ledin" data-bispline="' + esc(d.id) + '" role="combobox" aria-autocomplete="list" aria-expanded="false" autocomplete="off" dir="auto" value="" placeholder="' + esc(t || BI('sp_lph')) + '" aria-label="' + esc(BI('ledger')) + '">' + (t ? '<button type="button" class="btn sm" data-bispuse="' + esc(d.id) + '" title="' + esc(BI('sp_use')) + '">' + esc(BI('sp_use')) + '</button>' : '') + '</span></td></tr>';
      }).join('') + '</tbody></table></div>' +
      (pages > 1 ? '<div class="bi-pager"><button type="button" class="btn sm" data-bispage="-1"' + (SP.page ? '' : ' disabled') + '>' + esc(BI('prev')) + '</button> <span class="soft">' + esc(BI('pageof', { a: SP.page * SPP + 1, b: Math.min(shown.length, (SP.page + 1) * SPP), n: shown.length })) + '</span> <button type="button" class="btn sm" data-bispage="1"' + (SP.page < pages - 1 ? '' : ' disabled') + '>' + esc(BI('next')) + '</button></div>' : '') +
      '<div class="bi-spact"><label>' + esc(BI('sp_pick')) + ' <input class="bi-ledin" data-bispick role="combobox" aria-autocomplete="list" aria-expanded="false" autocomplete="off" dir="auto" value="' + esc(SP.led ? SP.led.name : '') + '" placeholder="' + esc(BI('ledph')) + '"></label> ' +
      '<button type="button" class="btn primary" data-bispapply' + (nsel ? '' : ' disabled') + '>' + esc(BI('sp_apply', { n: nsel })) + '</button> <button type="button" class="btn" data-bispsug' + (nsel ? '' : ' disabled') + '>' + esc(BI('sp_sug', { n: nsel })) + '</button></div></div>';
    return h;
  }
  function refreshSp(pane) {
    var box = $('.bi-spbox', pane); if (!box) return;
    var fa = document.activeElement, keep = fa && fa.hasAttribute && fa.hasAttribute('data-bispfind');
    box.innerHTML = spHtml();
    if (keep) { var f = $('[data-bispfind]', box); if (f) { f.focus(); try { f.setSelectionRange(f.value.length, f.value.length); } catch (er) {} } }
  }
  var SPFOCUS = '';
  function spDirOf(id) { var d = suspDocs().filter(function (x) { return x.id === id; })[0]; return d && suspLine(d).cr ? 'cr' : 'dr'; }
  function spApply(pane, mode, ids, LL) {
    var all = suspDocs(), docs = ids ? all.filter(function (d) { return ids.indexOf(d.id) >= 0; }) : all.filter(function (d) { return SP.sel[d.id]; }); LL = LL || SP.led;
    if (!docs.length) { NS.toast(BI('sp_none'), 'bad'); return; }
    if (mode === 'led' && !LL) { NS.toast(BI('sp_pickfirst'), 'bad'); return; }
    var sug = suspSug(all), no = nextNoFn(), recs = [], made = [], left = 0, np = {}, have = {};
    A.data().party.forEach(function (p) { have[key(p.name)] = 1; });
    docs.forEach(function (d) {
      if (A.closedMsg && A.closedMsg(d.date)) { left++; return; }
      var l = suspLine(d), dir = l.cr ? 'cr' : 'dr', f;
      if (mode === 'led') { if (!I.allowed(LL, dir)) { left++; return; } f = I.fromLedger(LL, dir); }
      else { var se = sug[d.id]; if (!se || !se.kind || se.kind === 'susp') { left++; return; } f = { kind: se.kind, name: se.name, from: se.from, to: se.to, led: se.led }; }
      var bank = (d.lines || []).filter(function (x) { return x.a !== I.SUSP.a; })[0], e = Object.assign({ key: d.bsk || 'sp' + d.id }, f);
      var r = I.records(e, l, { seller: d.seller || sellerCopy(), file: d.bsfile || '', bills: [], no: no, bacct: bank && /^bank:/.test(bank.a) ? bank.a : 'bank' });
      if (!r) { left++; return; }
      r.id = d.id; r.created = d.created; recs.push(r); made.push({ line: l, kind: f.kind, name: f.name, from: f.from, to: f.to, led: f.led });
      if ((f.kind === 'in' || f.kind === 'out') && f.name && !have[key(f.name)]) np[key(f.name)] = { name: f.name, role: f.kind === 'in' ? 'customer' : 'supplier' };
    });
    if (!recs.length) { NS.toast(BI('sp_skip', { n: left }), 'bad'); return; }
    var jobs = Object.keys(np).map(function (k) { return ['party', np[k]]; }).concat(recs.map(function (r) { return ['doc', r]; })), done = 0;
    function step() {
      var part = jobs.slice(done, done + 25); if (!part.length) return Promise.resolve();
      return Promise.all(part.map(function (x) { return NSStore.put(x[0], x[1]); })).then(function () { done += part.length; return new Promise(function (res) { setTimeout(res, 0); }).then(step); });
    }
    NS.toast(BI('sp_working', { n: recs.length }));
    step().then(function () { return saveRules(I.learn(rules(), made)); }).then(function () {
      SP.sel = {}; CX = null; LEDC = null; SPC = null; SUG = null; VER++;
      NS.toast(BI('sp_done', { n: recs.length }) + (left ? ' ' + BI('sp_skip', { n: left }) : '')); A.show();
    }).catch(function () { CX = null; LEDC = null; SPC = null; NS.toast(BI('postfail'), 'bad'); A.show(); });
  }
  function wireSusp(pane, box) {
    if (!box) return;
    if (SPFOCUS) {   /* the box of the next Suspense line gets the cursor (again a moment later, in case the screen is drawn once more) */
      var fid = SPFOCUS.replace(/"/g, ''), fo = $('[data-bispline="' + fid + '"]', box); SPFOCUS = '';
      if (fo) fo.focus();
      setTimeout(function () { if (!document.activeElement || document.activeElement === document.body) { var f2 = document.querySelector('[data-bispline="' + fid + '"]'); if (f2) f2.focus(); } }, 500);
    }
    box.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-bispopen')) { SP.open = !SP.open; refreshSp(pane); return; }
      if (b.hasAttribute('data-bispage')) { SP.page += +b.getAttribute('data-bispage'); refreshSp(pane); return; }
      if (b.hasAttribute('data-bispuse')) { var uid = b.getAttribute('data-bispuse'), utr = b.closest('tr'), un = utr && utr.nextElementSibling && utr.nextElementSibling.querySelector('[data-bispline]'); SPFOCUS = un ? un.getAttribute('data-bispline') : ''; spApply(pane, 'sug', [uid]); return; }
      if (b.hasAttribute('data-bispapply')) { spApply(pane, 'led'); return; }
      if (b.hasAttribute('data-bispsug')) { spApply(pane, 'sug'); return; }
    });
    var ft = 0;
    box.addEventListener('input', function (ev) { if (ev.target.hasAttribute('data-bispfind')) { var v = ev.target.value; clearTimeout(ft); ft = setTimeout(function () { SP.find = v.trim(); SP.page = 0; refreshSp(pane); }, 200); } });
    box.addEventListener('change', function (ev) {
      var t = ev.target, id;
      if ((id = t.getAttribute('data-bispsel')) != null) { if (t.checked) SP.sel[id] = 1; else delete SP.sel[id]; refreshSp(pane); return; }
      if (t.hasAttribute('data-bispall')) { var vis = spShown(suspDocs()).slice(SP.page * SPP, (SP.page + 1) * SPP); vis.forEach(function (d) { if (t.checked) SP.sel[d.id] = 1; else delete SP.sel[d.id]; }); refreshSp(pane); }
    });
  }
  /* the ledger an entry stands for, as the picker lists it */
  function ledFor(e) {
    var LC = ledCtx(), dir = BS.lines[e.i].cr ? 'cr' : 'dr';
    if (e.kind === 'jv' && e.led) return LC.byId['o|' + e.led.a] || null;
    if (e.kind === 'contra') { var o = e.to && e.to !== 'bank' && e.to !== 'cash' ? e.to : e.from && e.from !== 'bank' && e.from !== 'cash' ? e.from : ''; return o ? LC.byId['bank|' + o] || null : LC.byId['cash|' + key(BI('lk_cash'))] || null; }
    return e.name ? LC.ledOf(e.name, dir) : null;
  }
  /* ---------- keywords of ledgers ---------- */
  function askText(title, hint, value) {
    return new Promise(function (res) {
      var d = NS.el('dialog', { 'class': 'b2-dlg bi-pw' });
      d.innerHTML = '<form method="dialog"><h3>' + esc(title) + '</h3><p class="soft">' + esc(hint) + '</p><input type="text" class="bi-pwin" autocomplete="off" dir="auto" value="' + esc(value || '') + '" style="width:100%">' +
        '<div class="row" style="margin-top:12px;gap:8px;display:flex;justify-content:flex-end"><button type="button" class="btn" value="x">' + esc(A.T('cancel')) + '</button><button class="btn primary" value="ok">' + esc(BI('kw_add')) + '</button></div></form>';
      document.body.appendChild(d);
      var inp = d.querySelector('.bi-pwin'), done = function (v) { d.close(); d.remove(); res(v); };
      d.querySelector('button[value=x]').addEventListener('click', function () { done(null); });
      d.querySelector('form').addEventListener('submit', function (e) { e.preventDefault(); done(inp.value); });
      d.addEventListener('cancel', function (e) { e.preventDefault(); done(null); });
      d.showModal(); inp.focus(); inp.select();
    });
  }
  function kwHtml() {
    var m = kwMap(), ids = Object.keys(m).sort(function (a, b) { return String(m[a].l.name).localeCompare(String(m[b].l.name)); }), n = kwCount();
    var h = '<details class="card bi-kw"' + (KWO ? ' open' : '') + '><summary><b>' + esc(BI('kw_title', { n: n })) + '</b></summary><p class="soft">' + esc(BI('kw_h')) + '</p>' +
      '<div class="bi-spact bi-kwadd"><label>' + esc(BI('kw_led')) + ' <input class="bi-ledin" data-bikwled role="combobox" aria-autocomplete="list" aria-expanded="false" autocomplete="off" dir="auto" value="' + esc(KW.led ? KW.led.name : '') + '" placeholder="' + esc(BI('ledph')) + '"></label> ' +
      '<label>' + esc(BI('kw_words')) + ' <input type="text" data-bikwtext dir="auto" placeholder="' + esc(BI('kw_ph')) + '"></label> <button type="button" class="btn primary" data-bikwadd>' + esc(BI('kw_add')) + '</button></div>';
    if (!ids.length) return h + '<p class="soft">' + esc(BI('kw_none')) + '</p></details>';
    return h + '<ul class="bi-kwlist">' + ids.map(function (id) {
      return '<li><b>' + esc(m[id].l.name) + '</b> ' + m[id].w.map(function (w, k) { return '<span class="bi-chip">' + esc(w) + ' <button type="button" class="bi-chipx" data-bikwdel="' + esc(id) + '" data-k="' + k + '" aria-label="' + esc(BI('kw_del')) + '">×</button></span>'; }).join(' ') + '</li>';
    }).join('') + '</ul></details>';
  }
  function wireKeys(pane, box) {
    if (!box) return;
    var det = $('.bi-kw', box); if (det) det.addEventListener('toggle', function () { KWO = det.open; });
    box.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-bikwadd')) {
        var t = $('[data-bikwtext]', box); if (!KW.led) { NS.toast(BI('sp_pickfirst'), 'bad'); return; }
        var n = addKeywords(KW.led, t && t.value); if (!n) { NS.toast(BI('kw_nothing'), 'bad'); return; }
        KWO = true; saveKeys().then(function () { NS.toast(BI('kw_saved', { n: n })); A.show(); }); return;
      }
      if (b.hasAttribute('data-bikwdel')) {
        var m = kwMap(), id = b.getAttribute('data-bikwdel'), k = +b.getAttribute('data-k'); if (!m[id]) return;
        m[id].w.splice(k, 1); if (!m[id].w.length) delete m[id]; KWO = true; saveKeys().then(function () { A.show(); });
      }
    });
    var kt = $('[data-bikwtext]', box); if (kt) kt.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); var a = $('[data-bikwadd]', box); if (a) a.click(); } });
  }
  function menu() {
    var nav = $('.hub-nav'), app = $('#app'); if (!nav || !app || app.getAttribute('data-secs') || $('[data-sec="bimp"]', nav)) return;
    var at = $('[data-sec="itx"]', nav) || $('[data-sec="stf"]', nav) || $('[data-sec="money"]', nav), a = NS.el('a', { href: '#bimp', 'data-sec': 'bimp' }, '<span>' + esc(A.T('bimp')) + '</span>');
    if (at && at.parentNode) at.parentNode.insertBefore(a, at.nextSibling); else nav.appendChild(a);   /* F2-14 */
  }
  function start() { menu(); loadRules(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  A.bankimp = { entries: function () { return BS ? entries() : []; }, post: post, setRows: setRows, state: function () { return BS; } };
})();

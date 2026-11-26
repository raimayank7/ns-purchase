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
    return Promise.all([NSStore.meta('bankrules').catch(function () {}), NSStore.meta('banklayouts').catch(function () {}), NSStore.meta('bankwip').catch(function () {})])
      .then(function (r) { RULES = obj(r[0]); LAY = obj(r[1]); WIP = obj(r[2]); });
  }
  /* Like ZEEFA, which keeps the start row and columns on the bank account: the columns the user set for a bank are kept
     (meta 'banklayouts', per business and bank, newest 3) and tried again on that bank's next file. */
  var LAY = {}, WIP = {}, wipT = 0;
  function layouts() { return ((LAY[bizKey()] || {})[bankAcct()] || []); }
  function keepLayout(map) {
    if (!map) return; var b = LAY[bizKey()] = LAY[bizKey()] || {}, l = (b[bankAcct()] || []).filter(function (x) { return JSON.stringify(x.map) !== JSON.stringify(map); });
    l.unshift({ map: map, at: Date.now() }); b[bankAcct()] = l.slice(0, 3); NSStore.meta('banklayouts', LAY).catch(function () {});
  }
  /* Like ZEEFA, whose imported lines wait in their own table until posted: the open statement and the choices made on it are
     kept (meta 'bankwip', per business), so closing the App half way through 2,000 lines loses nothing. */
  function saveWip(now) {
    clearTimeout(wipT);
    if (!BS || !BS.lines.length) delete WIP[bizKey()];   /* gone at once, so the screen drawn next does not offer it again */
    wipT = setTimeout(function () {
      if (BS && BS.lines.length) WIP[bizKey()] = { name: BS.name, rows: BS.rows, map: BS.map, header: BS.header, edits: BS.edits, sess: SESS, acct: bankAcct(), at: Date.now() };
      else delete WIP[bizKey()];
      NSStore.meta('bankwip', WIP).catch(function () {});
    }, now ? 0 : 1500);
  }
  function saveRules(list) { RULES = RULES || {}; RULES[bizKey()] = list; return NSStore.meta('bankrules', RULES).catch(function () {}); }
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
  function dataStamp() { var d = A.data(); return d ? (d.doc || []).length + '|' + (d.party || []).length + '|' + A.bizName() + '|' + bankAcct() + '|' + (RULES ? JSON.stringify(rules()).length : 0) : ''; }
  function ctx() {
    var st = dataStamp();
    if (CX && CX.st === st && CX.bs === BS) return CX;
    var docs = A.mine(), dates = BS.lines.map(function (l) { return l.date; }).sort(), from = dates[0] || '', to = dates[dates.length - 1] || '', pn = partyNames();
    CX = { st: st, bs: BS, lines: BS.lines, keys: I.lineKeys(BS.lines), parties: pn, pindex: I.partyIndex(pn),
      bills: B.bills(A.data().doc, A.bizName()).bills.map(function (b) { return { id: b.id, no: b.no, date: b.date, party: b.party, side: b.side, left: b.left }; }),
      done: I.doneKeys(docs), book: from ? K.bookLines(docs, A.bizName(), from, to, bankAcct()) : [] };
    CX.billsBy = {}; CX.bills.forEach(function (b) { var k = b.side + '|' + key(b.party); (CX.billsBy[k] = CX.billsBy[k] || []).push(b); });
    SUG = null;
    return CX;
  }
  function suggestions() {
    var c = ctx();
    if (!SUG) SUG = I.suggest(Object.assign({}, c, { rules: rules().concat(SESS) }));
    return SUG;
  }
  function entries() {
    return suggestions().map(function (s) {
      var ed = BS.edits[s.key], e = Object.assign({}, s);
      if (ed) { ['kind', 'name', 'billId', 'from', 'note'].forEach(function (f) { if (ed[f] !== undefined) e[f] = ed[f]; }); e.edited = true; if (ed.billId !== undefined) e.billId = ed.billId; }
      if (e.kind === 'contra' && !e.from) e.from = BS.lines[e.i].cr ? 'cash' : 'bank';
      e.problem = e.kind ? I.problem(e, BS.lines[e.i]) : 'p_kind';
      /* a name only read from the line (not a saved party) waits for the user's tick; a choice the user made counts as checked */
      e.post = ed && ed.post != null ? !!ed.post : (e.status === 'new' && !!e.kind && !e.problem && (e.conf !== 'guess' || !!(ed && (ed.name !== undefined || ed.kind !== undefined))));
      return e;
    });
  }
  /* a choice on one line teaches the rest of this statement at once (same payee, or the same bulk transfer file) */
  function teach(i) {
    var e = entries()[i]; if (!e || !e.kind) return;
    SESS = I.learn(SESS, [{ line: BS.lines[i], kind: e.kind, name: e.name, from: e.from }]); SUG = null;
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
      var l = BS.lines[e.i];
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
  var KINDS = ['', 'in', 'out', 'exp', 'oinc', 'contra'];
  var KOPT = {}; function kindSel(e) { var s = '<select data-bikind="' + e.i + '" aria-label="' + esc(BI('what')) + '">'; KINDS.forEach(function (k) { s += '<option value="' + k + '"' + (e.kind === k ? ' selected' : '') + '>' + (KOPT[k] || (KOPT[k] = esc(BI('k_' + (k || 'none'))))) + '</option>'; }); return s + '</select>'; }
  /* "Columns of the file": the picks wait here (COLD) until the user presses "Use these columns", so the panel stays open
     while every column is chosen (owner 25 Nov: it used to read the file again and close after the first pick) */
  var COLD = null;
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
    if (e.kind === 'in' || e.kind === 'out') {
      var mine = CX.billsBy[(e.kind === 'in' ? 'recv' : 'pay') + '|' + key(e.name)] || [];
      nameBox = '<input data-biname="' + e.i + '" list="bi-parties" dir="auto" value="' + esc(e.name || '') + '" placeholder="' + esc(BI('party')) + '" aria-label="' + esc(BI('party')) + '">';
      if (mine.length) billSel = '<select data-bibill="' + e.i + '" aria-label="' + esc(BI('bill')) + '"><option value="">' + esc(BI('oldest')) + '</option>' + mine.map(function (b) { return '<option value="' + esc(b.id) + '"' + (e.billId === b.id ? ' selected' : '') + '>' + esc((b.no || '—') + ' · ' + NS.fmtDate(b.date) + ' · ' + money(b.left, false)) + '</option>'; }).join('') + '</select>';
    } else if (e.kind === 'exp' || e.kind === 'oinc') {
      nameBox = '<input data-biname="' + e.i + '" list="' + (e.kind === 'exp' ? 'bi-heads' : 'bi-inc') + '" dir="auto" value="' + esc(e.name || '') + '" placeholder="' + esc(BI('head')) + '" aria-label="' + esc(BI('head')) + '">';
    } else if (e.kind === 'contra') {
      nameBox = '<select data-bifrom="' + e.i + '" aria-label="' + esc(BI('what')) + '"><option value="cash"' + (e.from === 'cash' ? ' selected' : '') + '>' + esc(BI('k_dep')) + '</option><option value="bank"' + (e.from === 'bank' ? ' selected' : '') + '>' + esc(BI('k_wd')) + '</option></select>';
    }
    var why = e.edited ? '' : e.why ? '<span class="soft bi-why' + (e.conf === 'guess' ? ' bi-guess' : '') + '">' + esc(BI(e.why)) + '</span>' : '';
    var state = e.status === 'done' ? '<span class="soft">' + esc(BI('s_done')) + '</span>' : e.status === 'inbooks' ? '<span class="soft">' + esc(BI('s_inbooks')) + '</span>' : why;
    return '<tr data-birow="' + e.i + '"' + (e.status !== 'new' ? ' class="soft"' : '') + '><td><input type="checkbox" data-bipost="' + e.i + '"' + (e.post ? ' checked' : '') + (e.problem && !e.post ? ' disabled' : '') + ' aria-label="' + esc(BI('postthis')) + '"></td>' +
      '<td>' + NS.fmtDate(l.date) + '</td><td class="l bi-desc">' + esc(l.desc || '—') + (l.ref ? ' <span class="mono soft">' + esc(l.ref) + '</span>' : '') + '</td><td class="n">' + (l.dr ? money(l.dr, false) : '') + '</td><td class="n">' + (l.cr ? money(l.cr, false) : '') + '</td>' +
      '<td class="l bi-do">' + (dis ? state : kindSel(e) + nameBox + billSel + (e.status === 'new' && e.kind && e.problem ? '<span class="sb-note bad">' + esc(BI(e.problem)) + '</span>' : state)) + '</td></tr>';
  }
  function matches(e) {
    if (filt !== 'all' && !(filt === 'todo' ? e.status === 'new' : filt === 'ready' ? e.post : filt === 'guess' ? e.status === 'new' && e.conf === 'guess' && !e.edited : !e.post && e.status === 'new')) return false;
    if (!find) return true;
    var l = BS.lines[e.i], t = (l.desc + ' ' + l.ref + ' ' + (e.name || '') + ' ' + (l.dr || l.cr)).toLowerCase();
    return find.split(/\s+/).every(function (w) { return t.indexOf(w) >= 0; });
  }
  /* the part that changes with every choice: tiles, the page of lines, the post button */
  function bodyHtml() {
    var E = entries(), ready = E.filter(function (e) { return e.post; }), rev = E.filter(function (e) { return e.status === 'new' && !e.post; }), skip = E.length - E.filter(function (e) { return e.status === 'new'; }).length;
    var guess = E.filter(function (e) { return e.status === 'new' && e.conf === 'guess' && !e.edited; }).length;
    var shown = E.filter(matches), pages = Math.max(1, Math.ceil(shown.length / PAGE)); if (page >= pages) page = pages - 1; if (page < 0) page = 0;
    var din = 0, dout = 0; ready.forEach(function (e) { din += BS.lines[e.i].cr; dout += BS.lines[e.i].dr; });
    var tiles = '<div class="tiles"><div class="tile"><span>' + esc(BI('t_lines')) + '</span><b>' + E.length + '</b></div><div class="tile ok"><span>' + esc(BI('t_ready')) + '</span><b>' + ready.length + '</b></div><div class="tile' + (rev.length ? ' warn' : '') + '"><span>' + esc(BI('t_review')) + '</span><b>' + rev.length + '</b></div><div class="tile"><span>' + esc(BI('t_skip')) + '</span><b>' + skip + '</b></div></div>';
    var pager = pages > 1 ? '<div class="bi-pager"><button type="button" class="btn sm" data-bipage="-1"' + (page ? '' : ' disabled') + '>' + esc(BI('prev')) + '</button> <span class="soft">' + esc(BI('pageof', { a: page * PAGE + 1, b: Math.min(shown.length, (page + 1) * PAGE), n: shown.length })) + '</span> <button type="button" class="btn sm" data-bipage="1"' + (page < pages - 1 ? '' : ' disabled') + '>' + esc(BI('next')) + '</button></div>' : '';
    var vis = shown.slice(page * PAGE, (page + 1) * PAGE), allOn = vis.length && vis.every(function (e) { return e.post || e.problem; });
    return tiles + (guess ? '<p class="sb-note">' + esc(BI('guessn', { n: guess })) + ' <button type="button" class="btn sm" data-biguess>' + esc(BI('guessshow')) + '</button></p>' : '') +
      pager + '<div class="tbl-wrap"><table class="tbl bi-t"><thead><tr><th><input type="checkbox" data-biallpage' + (allOn ? ' checked' : '') + ' aria-label="' + esc(BI('tickpage')) + '" title="' + esc(BI('tickpage')) + '"></th><th>' + esc(BI('c_date')) + '</th><th class="l">' + esc(BI('c_desc')) + '</th><th class="n">' + esc(BI('wd')) + '</th><th class="n">' + esc(BI('dep')) + '</th><th class="l">' + esc(BI('what')) + '</th></tr></thead><tbody>' +
      (vis.length ? vis.map(rowHtml).join('') : '<tr><td colspan="6" class="soft">' + esc(BI('none')) + '</td></tr>') + '</tbody></table></div>' + pager +
      '<div class="btns"><button type="button" class="btn primary" data-bipostall' + (ready.length ? '' : ' disabled') + '>' + esc(BI('postn', { n: ready.length })) + '</button> <span class="soft">' + esc(BI('sum', { i: money(din, false), o: money(dout, false) })) + '</span> <progress class="bi-prog" hidden></progress></div>';
  }
  function html() {
    var head = '<div class="pane-hd"><h2>' + esc(A.T('bimp')) + '</h2><div class="quick">' + (BS ? '<button type="button" class="btn" data-biclose>' + esc(BI('close')) + '</button>' : '') + '<label class="btn primary" for="bi-file">' + esc(BI(BS ? 'other' : 'open')) + '</label><input type="file" id="bi-file" class="sr" accept=".csv,.txt,.xls,.xlsx,.pdf,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></div></div>';
    var w = !BS && WIP[bizKey()];
    if (w) head += '<div class="card bi-wip"><p>' + esc(BI('wip', { f: w.name, n: K.statement(w.rows, w.map, w.header).lines.length, k: Object.keys(w.edits || {}).length, d: NS.fmtDate(new Date(w.at).toISOString().slice(0, 10)) })) + '</p><div class="btns"><button type="button" class="btn primary" data-biwip>' + esc(BI('wipgo')) + '</button> <button type="button" class="btn" data-biwipx>' + esc(BI('wipnew')) + '</button></div></div>';
    if (!BS || !BS.lines.length) return head + '<div class="card"><h3>' + esc(BI('start')) + '</h3><p>' + esc(BI('starth')) + '</p>' + (BS && !BS.lines.length ? '<p class="sb-note bad">' + esc(BI('nolines')) + '</p>' + colsHtml() : '') +
      '<ol><li>' + esc(BI('s1')) + '</li><li>' + esc(BI('s2')) + '</li><li>' + esc(BI('s3')) + '</li><li>' + esc(BI('s4')) + '</li></ol><p class="soft">' + esc(BI('priv')) + '</p></div>';
    var H = heads(), pn = ctx().parties;
    return head + (BS.laid ? '<p class="sb-note">' + esc(BI('laid')) + '</p>' : '') + '<p class="sb-note">' + esc(BI('from', { f: BS.name, n: BS.lines.length, a: NS.fmtDate(BS.lines[0].date), b: NS.fmtDate(BS.lines[BS.lines.length - 1].date) })) + '</p>' + '<details class="br-cols"' + (COLD ? ' open' : '') + '><summary>' + esc(BI('cols')) + '</summary>' + colsHtml() + '</details>' +
      '<div class="tools-row">' + (A.banks && A.banks().length > 1 ? '<label>' + esc(A.T('bankacct')) + ' <select data-biacct>' + A.banks().map(function (x) { return '<option value="' + esc(x.k) + '"' + (x.k === bankAcct() ? ' selected' : '') + '>' + esc(A.bankLabel(x)) + '</option>'; }).join('') + '</select></label> ' : '') +
      '<label>' + esc(BI('show')) + ' <select data-bifilt>' + [['todo', 'f_todo'], ['ready', 'f_ready'], ['review', 'f_review'], ['guess', 'f_guess'], ['all', 'f_all']].map(function (x) { return '<option value="' + x[0] + '"' + (filt === x[0] ? ' selected' : '') + '>' + esc(BI(x[1])) + '</option>'; }).join('') + '</select></label> ' +
      '<label>' + esc(BI('find')) + ' <input type="search" data-bifind value="' + esc(find) + '" placeholder="' + esc(BI('findph')) + '"></label></div>' +
      '<p class="hint">' + esc(BI('table_h')) + '</p><div class="bi-body">' + bodyHtml() + '</div>' +
      '<datalist id="bi-parties">' + pn.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist><datalist id="bi-heads">' + H.exp.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist><datalist id="bi-inc">' + H.inc.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>' +
      '<p class="soft">' + esc(BI('remember')) + '</p>';
  }
  /* redraw only the changing part; the cursor goes to WANT (or stays on the box it was on) */
  function refresh(pane) {
    saveWip();
    var body = $('.bi-body', pane); if (!body) { A.show(); return; }
    var fa = document.activeElement, fsel = '';
    if (!WANT && fa && body.contains(fa)) { ['data-bikind', 'data-biname', 'data-bifrom', 'data-bibill', 'data-bipost'].forEach(function (a) { if (!fsel && fa.hasAttribute(a)) fsel = '[' + a + '="' + fa.getAttribute(a) + '"]'; }); }
    body.innerHTML = bodyHtml();
    var w = WANT || fsel; WANT = '';
    if (w) { var el = $(w, body); if (el) { el.focus({ preventScroll: true }); if (el.select && el.tagName === 'INPUT' && el.type !== 'checkbox') try { el.select(); } catch (er) {} el.scrollIntoView({ block: 'nearest' }); } }
  }
  A.addSection('bimp', function () { if (!RULES) { loadRules().then(function () { if (/^#bimp/.test(location.hash)) A.show(); }); return '<div class="pane-hd"><h2>' + esc(A.T('bimp')) + '</h2></div><p class="soft">…</p>'; } return html(); }, function (pane) {
    var wg = $('[data-biwip]', pane); if (wg) wg.addEventListener('click', function () { var w = WIP[bizKey()]; if (w.acct) acct = w.acct; setRows(w.rows, w.name, w.map, w); });
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
    var body = $('.bi-body', pane); if (!body) return;
    function rowOf(el) { return el.getAttribute('data-bikind') || el.getAttribute('data-biname') || el.getAttribute('data-bifrom') || el.getAttribute('data-bibill'); }
    function nextKind(el) { var ks = $$('[data-bikind]', body), i = rowOf(el), at = ks.map(function (k) { return k.getAttribute('data-bikind'); }).indexOf(i); var nx = ks[at + 1]; return nx ? '[data-bikind="' + nx.getAttribute('data-bikind') + '"]' : ''; }
    function after(i) { return '[data-biname="' + i + '"],[data-bifrom="' + i + '"]'; }
    if (WANT) { var w = $(WANT, pane); WANT = ''; if (w) { w.focus(); if (w.select && w.tagName === 'INPUT') try { w.select(); } catch (er) {} w.scrollIntoView({ block: 'nearest' }); } }
    function ed(i) { var k = ctx().keys[+i]; BS.edits[k] = BS.edits[k] || {}; return BS.edits[k]; }
    /* one listener for the whole table (rows are drawn again after each choice) */
    body.addEventListener('keydown', function (e) {
      var el = e.target; if (!el.matches('[data-bikind],[data-biname],[data-bifrom],[data-bibill]')) return;
      if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      /* Enter on a line's box goes on like Tab: from the choice to the name, from the name to the next line */
      var i = rowOf(el), to = el.hasAttribute('data-bikind') ? after(i) : el.hasAttribute('data-biname') && $('[data-bibill="' + i + '"]', body) ? '[data-bibill="' + i + '"]' : nextKind(el);
      if (el.hasAttribute('data-biname') && el.value.trim() !== (el.getAttribute('value') || '')) { WANT = to; el.dispatchEvent(new Event('change', { bubbles: true })); return; }
      var t = to && $(to, body);
      if (t) { t.focus(); if (t.select && t.tagName === 'INPUT') try { t.select(); } catch (er) {} t.scrollIntoView({ block: 'nearest' }); }
    });
    body.addEventListener('change', function (ev) {
      var s = ev.target, i;
      if ((i = s.getAttribute('data-bikind')) != null) { var o = ed(i); o.kind = s.value; o.billId = ''; o.name = ''; o.post = null; if (s.value === 'exp') o.name = 'Bank charges'; if (s.value === 'oinc') o.name = 'Interest received'; if (s.value === 'contra') o.from = BS.lines[+i].cr ? 'cash' : 'bank'; WANT = WANT || after(i); teach(+i); refresh(pane); return; }
      if ((i = s.getAttribute('data-biname')) != null) { var o2 = ed(i); o2.name = s.value.trim(); o2.billId = ''; o2.post = null; WANT = WANT || nextKind(s); teach(+i); refresh(pane); return; }
      if ((i = s.getAttribute('data-bibill')) != null) { ed(i).billId = s.value; WANT = WANT || nextKind(s); refresh(pane); return; }
      if ((i = s.getAttribute('data-bifrom')) != null) { var o3 = ed(i); o3.from = s.value; o3.post = null; WANT = WANT || nextKind(s); teach(+i); refresh(pane); return; }
      if ((i = s.getAttribute('data-bipost')) != null) { ed(i).post = s.checked; if (s.checked) teach(+i); refresh(pane); return; }   /* ticking a name read from the details confirms it for its other lines too */
      if (s.hasAttribute('data-biallpage')) {
        var on = s.checked, E = entries().filter(matches).slice(page * PAGE, (page + 1) * PAGE);
        E.forEach(function (e) { if (!e.problem || !on) ed(e.i).post = on && !e.problem; }); refresh(pane);
      }
    });
    body.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-bipage')) { page += +b.getAttribute('data-bipage'); refresh(pane); var t = $('.bi-t', body); if (t) t.scrollIntoView({ block: 'start' }); return; }
      if (b.hasAttribute('data-biguess')) { filt = 'guess'; page = 0; var f2 = $('[data-bifilt]', pane); if (f2) f2.value = 'guess'; refresh(pane); return; }
      if (b.hasAttribute('data-bipostall')) {
        var list = entries().filter(function (e) { return e.post && !e.problem; });
        var msg = BI('confirm', { n: list.length });
        (NS.ask ? NS.ask(msg) : Promise.resolve(window.confirm(msg))).then(function (yes) { if (yes) post(list); });
      }
    });
  });
  function menu() {
    var nav = $('.hub-nav'), app = $('#app'); if (!nav || !app || app.getAttribute('data-secs') || $('[data-sec="bimp"]', nav)) return;
    var at = $('[data-sec="itx"]', nav) || $('[data-sec="stf"]', nav) || $('[data-sec="money"]', nav), a = NS.el('a', { href: '#bimp', 'data-sec': 'bimp' }, '<span>' + esc(A.T('bimp')) + '</span>');
    if (at && at.parentNode) at.parentNode.insertBefore(a, at.nextSibling); else nav.appendChild(a);   /* F2-14 */
  }
  function start() { menu(); loadRules(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  A.bankimp = { entries: function () { return BS ? entries() : []; }, post: post, setRows: setRows, state: function () { return BS; } };
})();

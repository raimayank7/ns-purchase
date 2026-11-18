/* Bank statement import in NSBiz (gap-money, 2026-11-14; after itax.js).
   Section 'bimp': the user opens the CSV or Excel statement from net banking, checks the columns, and every line is sorted by bankimport.js
   (NSBI) into: receipt from a party, payment to a party, expense, other income, cash deposited or withdrawn, or still open. What the user
   confirms is saved as the records the Money screens already make (receipt, voucher, exp, oinc, contra), each with a `bsk` key so a line is
   never posted twice, even when the same statement is opened again. The party or head chosen for a narration is remembered (meta
   'bankrules', per business) and suggested next time. PDF statements are not read. Nothing leaves the browser.
   Screen words: NS.t('bi.*'), section name NS.t('app.bimp'). */
(function () {
  'use strict';
  var A = window.NSApp, K = window.NSBank, I = window.NSBI; if (!A || !I) return;
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, num = NS.num, r2 = NS.r2, money = NS.money, B = NSBooks, key = B.key;
  function BI(k, v) { return NS.t('bi.' + k, v); }
  var XL = ['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw'];
  var WANT = '';   /* where the cursor goes after the table is drawn again (see the keys below) */
  var COLS = ['date', 'desc', 'ref', 'dr', 'cr', 'amt', 'type', 'bal'];
  var BS = null, RULES = null, filt = 'todo', busy = false;
  /* BS = { name, rows, map, header, lines, keys, edits: { key: { kind, name, billId, from, post } }, sug: suggestions } */

  function bizKey() { return key(A.bizName()); }
  function rules() { return (RULES && RULES[bizKey()]) || []; }
  function loadRules() { return NSStore.meta('bankrules').then(function (m) { RULES = m && typeof m === 'object' ? m : {}; }).catch(function () { RULES = {}; }); }
  function saveRules(list) { RULES = RULES || {}; RULES[bizKey()] = list; return NSStore.meta('bankrules', RULES).catch(function () {}); }
  function heads() { var H = window.NSHeads; return H ? { exp: H.list(['dexp', 'iexp']).map(function (h) { return H.label(h); }), inc: H.list(['oinc', 'dinc']).map(function (h) { return H.label(h); }) } : { exp: [], inc: [] }; }
  function partyNames() { var o = {}; NS.forBiz(A.data().party, A.biz()).forEach(function (p) { o[key(p.name)] = p.name; }); B.parties(A.mine(), A.bizName()); return Object.keys(o).map(function (k) { return o[k]; }).sort(); }

  /* ---------- reading ---------- */
  function readFile(file) {
    var xl = /\.xlsx?$/i.test(file.name);
    if (/\.pdf$/i.test(file.name)) { NS.toast(BI('nopdf'), 'bad'); return; }
    var get = xl ? NS.loadJs(XL[0], XL[1]).then(function () { return file.arrayBuffer(); }).then(function (buf) {
      var wb = window.XLSX.read(buf, { type: 'array', cellDates: false }), ws = wb.Sheets[wb.SheetNames[0]];
      return window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    }) : file.text().then(K.csvRows);
    get.then(function (rows) { setRows(rows, file.name); }).catch(function () { NS.toast(BI('readfail'), 'bad'); });
  }
  function setRows(rows, name, map) {
    rows = (rows || []).filter(function (r) { return r && r.some(function (c) { return String(c == null ? '' : c).trim(); }); });
    var S = K.statement(rows, map, map ? (BS && BS.header) : undefined), prevEdits = BS && BS.edits && map ? BS.edits : {};
    BS = { name: name, rows: rows, map: S.map || {}, header: S.header == null ? -1 : S.header, lines: S.lines, edits: prevEdits };
    BS.lines.forEach(function (l, i) { l.i = i; });
    A.show();
    if (S.lines.length) NS.toast(BI('read', { n: S.lines.length }));
  }

  /* ---------- the work ---------- */
  function ctx() {
    var docs = A.mine(), dates = BS.lines.map(function (l) { return l.date; }).sort(), from = dates[0] || '', to = dates[dates.length - 1] || '';
    return { lines: BS.lines, parties: partyNames(), bills: B.bills(A.data().doc, A.bizName()).bills.map(function (b) { return { id: b.id, no: b.no, date: b.date, party: b.party, side: b.side, left: b.left }; }),
      rules: rules(), done: I.doneKeys(docs), book: from ? K.bookLines(docs, A.bizName(), from, to) : [] };
  }
  function entries() {
    var c = ctx(), sug = I.suggest(c);
    return sug.map(function (s) {
      var ed = BS.edits[s.key], e = Object.assign({}, s);
      if (ed) { ['kind', 'name', 'billId', 'from', 'note'].forEach(function (f) { if (ed[f] !== undefined) e[f] = ed[f]; }); e.edited = true; if (ed.billId !== undefined) e.billId = ed.billId; }
      if (e.kind === 'contra' && !e.from) e.from = BS.lines[e.i].cr ? 'cash' : 'bank';
      e.post = ed && ed.post != null ? !!ed.post : (e.status === 'new' && e.kind && !I.problem(e, BS.lines[e.i]));
      e.problem = e.kind ? I.problem(e, BS.lines[e.i]) : 'p_kind';
      return e;
    });
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
    var c = ctx(), o = { seller: sellerCopy(), file: BS.name || '', bills: c.bills, no: nextNoFn() }, recs = [], made = [], newParties = {}, skipped = 0;
    list.forEach(function (e) {
      var l = BS.lines[e.i];
      if (A.closedMsg && A.closedMsg(l.date)) { skipped++; return; }
      var r = I.records(e, l, o); if (!r) return;
      recs.push(r); made.push({ line: l, kind: e.kind, name: e.name, from: e.from });
      if ((e.kind === 'in' || e.kind === 'out') && e.name && !A.data().party.some(function (p) { return key(p.name) === key(e.name); })) newParties[key(e.name)] = { name: e.name, role: e.kind === 'in' ? 'customer' : 'supplier' };
    });
    var chain = Promise.resolve();
    Object.keys(newParties).forEach(function (k) { chain = chain.then(function () { return NSStore.put('party', newParties[k]); }); });
    recs.forEach(function (r) { chain = chain.then(function () { return NSStore.put('doc', r); }); });
    return chain.then(function () { return saveRules(I.learn(rules(), made)); }).then(function () {
      busy = false; BS.edits = {};
      NS.toast(BI('posted', { n: recs.length }) + (skipped ? ' ' + BI('closed', { n: skipped }) : ''));
      if (NS.checkReminder) NS.checkReminder();
      A.show();
    }).catch(function () { busy = false; NS.toast(BI('postfail'), 'bad'); A.show(); });
  }

  /* ---------- screen ---------- */
  var KINDS = ['', 'in', 'out', 'exp', 'oinc', 'contra'];
  function colsHtml() {
    var M = BS && BS.map || {}, n = BS && BS.rows ? Math.max.apply(null, BS.rows.slice(0, 50).map(function (r) { return r.length; })) : 0, hdr = BS && BS.rows && BS.header >= 0 ? BS.rows[BS.header] || [] : [];
    var opt = function (k) { return '<option value="">—</option>' + Array.apply(null, Array(n)).map(function (_, i) { return '<option value="' + i + '"' + (M[k] === i ? ' selected' : '') + '>' + esc((i + 1) + (hdr[i] ? ': ' + String(hdr[i]).slice(0, 24) : '')) + '</option>'; }).join(''); };
    return '<p class="hint">' + esc(BI('colsh')) + '</p><div class="fg br-map">' + COLS.map(function (k) { return '<div class="f"><label for="bi-c-' + k + '">' + esc(BI('c_' + k)) + '</label><select id="bi-c-' + k + '" data-bicol="' + k + '">' + opt(k) + '</select></div>'; }).join('') + '</div>';
  }
  function rowHtml(e, bills) {
    var l = BS.lines[e.i], dis = e.status !== 'new' && !(BS.edits[e.key] && BS.edits[e.key].post), H = heads();
    var kindSel = '<select data-bikind="' + e.i + '" aria-label="' + esc(BI('what')) + '">' + KINDS.map(function (k) { return '<option value="' + k + '"' + (e.kind === k ? ' selected' : '') + '>' + esc(BI('k_' + (k || 'none'))) + '</option>'; }).join('') + '</select>';
    var nameBox = '', billSel = '';
    if (e.kind === 'in' || e.kind === 'out') {
      var side = e.kind === 'in' ? 'recv' : 'pay', mine = bills.filter(function (b) { return b.side === side && key(b.party) === key(e.name); });
      nameBox = '<input data-biname="' + e.i + '" list="bi-parties" dir="auto" value="' + esc(e.name || '') + '" placeholder="' + esc(BI('party')) + '" aria-label="' + esc(BI('party')) + '">';
      if (mine.length) billSel = '<select data-bibill="' + e.i + '" aria-label="' + esc(BI('bill')) + '"><option value="">' + esc(BI('oldest')) + '</option>' + mine.map(function (b) { return '<option value="' + esc(b.id) + '"' + (e.billId === b.id ? ' selected' : '') + '>' + esc((b.no || '—') + ' · ' + NS.fmtDate(b.date) + ' · ' + money(b.left, false)) + '</option>'; }).join('') + '</select>';
    } else if (e.kind === 'exp' || e.kind === 'oinc') {
      nameBox = '<input data-biname="' + e.i + '" list="' + (e.kind === 'exp' ? 'bi-heads' : 'bi-inc') + '" dir="auto" value="' + esc(e.name || '') + '" placeholder="' + esc(BI('head')) + '" aria-label="' + esc(BI('head')) + '">';
    } else if (e.kind === 'contra') {
      nameBox = '<select data-bifrom="' + e.i + '" aria-label="' + esc(BI('what')) + '"><option value="cash"' + (e.from === 'cash' ? ' selected' : '') + '>' + esc(BI('k_dep')) + '</option><option value="bank"' + (e.from === 'bank' ? ' selected' : '') + '>' + esc(BI('k_wd')) + '</option></select>';
    }
    var state = e.status === 'done' ? '<span class="soft">' + esc(BI('s_done')) + '</span>' : e.status === 'inbooks' ? '<span class="soft">' + esc(BI('s_inbooks')) + '</span>' : e.why ? '<span class="soft">' + esc(BI(e.why)) + '</span>' : '';
    return '<tr' + (e.status !== 'new' ? ' class="soft"' : '') + '><td><input type="checkbox" tabindex="-1" data-bipost="' + e.i + '"' + (e.post ? ' checked' : '') + (e.problem && !e.post ? ' disabled' : '') + ' aria-label="' + esc(BI('postthis')) + '"></td>' +
      '<td>' + NS.fmtDate(l.date) + '</td><td class="l">' + esc(l.desc || '—') + (l.ref ? ' <span class="mono soft">' + esc(l.ref) + '</span>' : '') + '</td><td class="n">' + (l.dr ? money(l.dr, false) : '') + '</td><td class="n">' + (l.cr ? money(l.cr, false) : '') + '</td>' +
      '<td class="l bi-do">' + (dis ? state : kindSel + nameBox + billSel + (e.status === 'new' && e.kind && e.problem ? '<span class="sb-note bad">' + esc(BI(e.problem)) + '</span>' : state)) + '</td></tr>';
  }
  function html() {
    var head = '<div class="pane-hd"><h2>' + esc(A.T('bimp')) + '</h2><div class="quick"><label class="btn primary" for="bi-file">' + esc(BI(BS ? 'other' : 'open')) + '</label><input type="file" id="bi-file" class="sr" accept=".csv,.txt,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></div></div>';
    if (!BS || !BS.lines.length) return head + '<div class="card"><h3>' + esc(BI('start')) + '</h3><p>' + esc(BI('starth')) + '</p>' + (BS && !BS.lines.length ? '<p class="sb-note bad">' + esc(BI('nolines')) + '</p>' + colsHtml() : '') +
      '<ol><li>' + esc(BI('s1')) + '</li><li>' + esc(BI('s2')) + '</li><li>' + esc(BI('s3')) + '</li><li>' + esc(BI('s4')) + '</li></ol><p class="soft">' + esc(BI('priv')) + '</p></div>';
    var E = entries(), bills = ctx().bills, ready = E.filter(function (e) { return e.post; }), rev = E.filter(function (e) { return e.status === 'new' && !e.post; }), skip = E.length - E.filter(function (e) { return e.status === 'new'; }).length;
    var shown = E.filter(function (e) { return filt === 'all' || (filt === 'todo' ? e.status === 'new' : filt === 'ready' ? e.post : !e.post && e.status === 'new'); });
    var din = ready.reduce(function (a, e) { return a + BS.lines[e.i].cr; }, 0), dout = ready.reduce(function (a, e) { return a + BS.lines[e.i].dr; }, 0);
    var tiles = '<div class="tiles"><div class="tile"><span>' + esc(BI('t_lines')) + '</span><b>' + E.length + '</b></div><div class="tile ok"><span>' + esc(BI('t_ready')) + '</span><b>' + ready.length + '</b></div><div class="tile' + (rev.length ? ' warn' : '') + '"><span>' + esc(BI('t_review')) + '</span><b>' + rev.length + '</b></div><div class="tile"><span>' + esc(BI('t_skip')) + '</span><b>' + skip + '</b></div></div>';
    var H = heads();
    return head + '<p class="sb-note">' + esc(BI('from', { f: BS.name, n: BS.lines.length, a: NS.fmtDate(BS.lines[0].date), b: NS.fmtDate(BS.lines[BS.lines.length - 1].date) })) + '</p>' + '<details class="br-cols"><summary>' + esc(BI('cols')) + '</summary>' + colsHtml() + '</details>' + tiles +
      '<div class="tools-row"><label>' + esc(BI('show')) + ' <select data-bifilt>' + [['todo', 'f_todo'], ['ready', 'f_ready'], ['review', 'f_review'], ['all', 'f_all']].map(function (x) { return '<option value="' + x[0] + '"' + (filt === x[0] ? ' selected' : '') + '>' + esc(BI(x[1])) + '</option>'; }).join('') + '</select></label></div>' +
      '<p class="hint">' + esc(BI('table_h')) + '</p><div class="tbl-wrap"><table class="tbl bi-t"><thead><tr><th></th><th>' + esc(BI('c_date')) + '</th><th class="l">' + esc(BI('c_desc')) + '</th><th class="n">' + esc(BI('wd')) + '</th><th class="n">' + esc(BI('dep')) + '</th><th class="l">' + esc(BI('what')) + '</th></tr></thead><tbody>' +
      (shown.length ? shown.map(function (e) { return rowHtml(e, bills); }).join('') : '<tr><td colspan="6" class="soft">' + esc(BI('none')) + '</td></tr>') + '</tbody></table></div>' +
      '<datalist id="bi-parties">' + partyNames().map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist><datalist id="bi-heads">' + H.exp.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist><datalist id="bi-inc">' + H.inc.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>' +
      '<div class="btns"><button type="button" class="btn primary" data-bipostall' + (ready.length ? '' : ' disabled') + '>' + esc(BI('postn', { n: ready.length })) + '</button> <span class="soft">' + esc(BI('sum', { i: money(din, false), o: money(dout, false) })) + '</span></div><p class="soft">' + esc(BI('remember')) + '</p>';
  }
  A.addSection('bimp', function () { if (!RULES) { loadRules().then(function () { if (/^#bimp/.test(location.hash)) A.show(); }); return '<div class="pane-hd"><h2>' + esc(A.T('bimp')) + '</h2></div><p class="soft">…</p>'; } return html(); }, function (pane) {
    var fi = $('#bi-file', pane); if (fi) fi.addEventListener('change', function () { if (fi.files[0]) readFile(fi.files[0]); fi.value = ''; });
    $$('[data-bicol]', pane).forEach(function (s) { s.addEventListener('change', function () { var m = Object.assign({}, BS.map); m[s.getAttribute('data-bicol')] = s.value === '' ? null : +s.value; setRows(BS.rows, BS.name, m); }); });
    var ft = $('[data-bifilt]', pane); if (ft) ft.addEventListener('change', function () { filt = ft.value; A.show(); });
    function rowOf(el) { return el.getAttribute('data-bikind') || el.getAttribute('data-biname') || el.getAttribute('data-bifrom') || el.getAttribute('data-bibill'); }
    function nextKind(el) { var ks = $$('[data-bikind]', pane), i = rowOf(el), at = ks.map(function (k) { return k.getAttribute('data-bikind'); }).indexOf(i); var nx = ks[at + 1]; return nx ? '[data-bikind="' + nx.getAttribute('data-bikind') + '"]' : ''; }
    function after(i) { return '[data-biname="' + i + '"],[data-bifrom="' + i + '"]'; }
    if (WANT) { var w = $(WANT, pane); WANT = ''; if (w) { w.focus(); if (w.select && w.tagName === 'INPUT') try { w.select(); } catch (er) {} w.scrollIntoView({ block: 'nearest' }); } }
    /* Enter on a line's box goes on like Tab: from the choice to the name, from the name to the next line */
    $$('[data-bikind],[data-biname],[data-bifrom],[data-bibill]', pane).forEach(function (el) {
      el.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey) return;
        e.preventDefault();
        var i = rowOf(el), to = el.hasAttribute('data-bikind') ? after(i) : el.hasAttribute('data-biname') && $('[data-bibill="' + i + '"]', pane) ? '[data-bibill="' + i + '"]' : nextKind(el);
        var t = to && $(to, pane);
        if (el.hasAttribute('data-biname') && el.value.trim() !== (el.getAttribute('value') || '')) { WANT = to; el.dispatchEvent(new Event('change', { bubbles: true })); return; }
        if (t) { t.focus(); if (t.select && t.tagName === 'INPUT') try { t.select(); } catch (er) {} t.scrollIntoView({ block: 'nearest' }); }
      });
    });
    function ed(i) { var e = BS.lines[+i], k = I.lineKeys(BS.lines)[+i]; BS.edits[k] = BS.edits[k] || {}; return BS.edits[k]; }
    $$('[data-bikind]', pane).forEach(function (s) { s.addEventListener('change', function () { var o = ed(s.getAttribute('data-bikind')); o.kind = s.value; o.billId = ''; o.name = ''; o.post = null; if (s.value === 'exp') o.name = 'Bank charges'; if (s.value === 'oinc') o.name = 'Interest received'; WANT = WANT || after(s.getAttribute('data-bikind')); A.show(); }); });
    $$('[data-biname]', pane).forEach(function (s) { s.addEventListener('change', function () { var o = ed(s.getAttribute('data-biname')); o.name = s.value.trim(); o.billId = ''; o.post = null; WANT = WANT || nextKind(s); A.show(); }); });
    $$('[data-bibill]', pane).forEach(function (s) { s.addEventListener('change', function () { ed(s.getAttribute('data-bibill')).billId = s.value; WANT = WANT || nextKind(s); A.show(); }); });
    $$('[data-bifrom]', pane).forEach(function (s) { s.addEventListener('change', function () { var o = ed(s.getAttribute('data-bifrom')); o.from = s.value; o.post = null; WANT = WANT || nextKind(s); A.show(); }); });
    $$('[data-bipost]', pane).forEach(function (c) { c.addEventListener('change', function () { ed(c.getAttribute('data-bipost')).post = c.checked; A.show(); }); });
    var pa = $('[data-bipostall]', pane); if (pa) pa.addEventListener('click', function () {
      var list = entries().filter(function (e) { return e.post && !e.problem; });
      var msg = BI('confirm', { n: list.length });
      (NS.ask ? NS.ask(msg) : Promise.resolve(window.confirm(msg))).then(function (yes) { if (yes) post(list); });
    });
  });
  function menu() {
    var nav = $('.hub-nav'), app = $('#app'); if (!nav || !app || app.getAttribute('data-secs') || $('[data-sec="bimp"]', nav)) return;
    var at = $('[data-sec="itx"]', nav) || $('[data-sec="stf"]', nav) || $('[data-sec="money"]', nav), a = NS.el('a', { href: '#bimp', 'data-sec': 'bimp' }, '<span>' + esc(A.T('bimp')) + '</span>');
    if (at && at.nextSibling) nav.insertBefore(a, at.nextSibling); else nav.appendChild(a);
  }
  function start() { menu(); loadRules(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  A.bankimp = { entries: function () { return BS ? entries() : []; }, post: post, setRows: setRows, state: function () { return BS; } };
})();

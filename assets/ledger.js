/* Party ledger and group reports of NSBiz (after app.js; Party Ledger plan, Steps B and C).
     st/<party key>   the party ledger (it replaces the old statement of account, so every #st/ link keeps working):
                      all entries with voucher type, number, Debit, Credit and the running balance marked Dr / Cr, opening and closing,
                      date presets and a voucher-type filter; or bill-wise (each bill, what settled it, what is still due);
                      or the balance confirmation letter (one page to the party, the ledger as page 2 if wanted).
                      Print, PDF, Excel and WhatsApp. The printed sheets are in English like every printed document.
     grp              group reports: group summary (opening, debit, credit, closing per party, totals per group with its sub-groups),
                      outstanding by group with ageing (receivable and payable), top parties by sales, purchases or dues.
   Groups come from the data home meta 'groups' (made in My data); a party without a group sits in Customers or Suppliers.
   The sums come from NSBooks (books.js: ledger, billwise, partyMoves, groupSummary, groupDues, topParties). */
(function () {
  'use strict';
  var A = window.NSApp; if (!A) return;
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, num = NS.num, money = NS.money, B = NSBooks, key = B.key, T = A.T;
  var VT = ['sales', 'receipts', 'notes', 'purchases', 'payments', 'journal', 'opening'];
  var view = 'all', types = [], shown = false, lastK = null, withStmt = true, gtab = 'sum', gside = 'recv', topBy = 'sales';

  /* ---------- shared bits ---------- */
  function presets(today) {
    if (NS.periodPresets) return NS.periodPresets(today);   /* one list for every report (R-3) */
    var y = +today.slice(0, 4), m = +today.slice(5, 7), fs = A.fyStart(today), fy = +fs.slice(0, 4), qs = m >= 10 ? 10 : m >= 7 ? 7 : m >= 4 ? 4 : 1;
    return { month: [today.slice(0, 8) + '01', today], quarter: [y + '-' + String(qs).padStart(2, '0') + '-01', today], fy: [fs, today], lfy: [(fy - 1) + '-04-01', fy + '-03-31'] };
  }
  /* date presets + From / To (app.js wires the date boxes) */
  function period() {
    var r = A.range(), P = presets(NS.today()), on = Object.keys(P).filter(function (k) { return P[k][0] === r[0] && P[k][1] === r[1]; })[0] || 'custom';
    return '<div class="tools-row lg-period"><label><span>' + esc(T('lg_period')) + '</span> <select data-preset>' + Object.keys(P).concat(['custom']).map(function (k) {
      return '<option value="' + k + '"' + (k === on ? ' selected' : '') + '>' + esc(T('lg_p_' + k)) + '</option>'; }).join('') + '</select></label>' +
      '<label>' + esc(T('from')) + ' <input type="date" data-stfrom value="' + r[0] + '"></label><label>' + esc(T('to')) + ' <input type="date" data-stto value="' + r[1] + '"></label></div>';
  }
  function wirePeriod(pane) {
    var s = $('[data-preset]', pane);
    if (s) s.addEventListener('change', function () { var p = presets(NS.today())[s.value]; if (p) { A.range(p[0], p[1]); A.show(); } });
  }
  /* Tally's Particulars: "To Sales", "By Cash" (R-18); narration under it */
  function oppText(d, acct) { return window.NSRep ? NSRep.opp(d, acct, function (a, dd) { return A.accName ? A.accName(a, dd) : a; }).text : ''; }
  function narrOf(d) { return window.NSRep ? NSRep.narr(d) : ''; }
  A.oppText = oppText; A.narrOf = narrOf;
  function enBal(v) { return money(Math.abs(v), false) + (v > 0.004 ? ' Dr' : v < -0.004 ? ' Cr' : ''); }
  function partyRec(k) { return A.data().party.filter(function (x) { return key(x.name) === k; })[0] || null; }
  function partyOf(k) {
    var P = B.parties(A.mine(), A.bizName()), rec = partyRec(k);
    return Object.assign({ key: k, name: rec ? rec.name : k, bal: 0 }, P[k] || {}, { rec: rec });
  }
  function addrLines(o) {
    if (!o) return '';
    var a = [o.addr, [o.city, o.pin].filter(Boolean).join(' '), o.gstin ? 'GSTIN ' + o.gstin : '', o.phone].filter(function (x) { return String(x || '').trim(); });
    return a.map(function (x) { return '<br>' + esc(String(x)).replace(/\n/g, '<br>'); }).join('');
  }
  function bizHead(title, sub) {
    var Z = A.biz() || {};
    return '<div class="st-hd"><div><b>' + esc(A.bizName()) + '</b>' + addrLines(Z) + '</div><div class="r"><b>' + esc(title) + '</b>' + sub + '</div></div>';
  }
  function fileName(s) { return String(s).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'party'; }
  function seg(name, list, on) {
    return '<div class="seg" role="group">' + list.map(function (x) { return '<button type="button" class="btn sm" data-' + name + '="' + x[0] + '" aria-pressed="' + (x[0] === on) + '">' + esc(x[1]) + '</button>'; }).join('') + '</div>';
  }
  /* PDF of the printable pages: a copy in paper colours, so a dark screen still gives a white page */
  function pdf(pane, name, title, phone) {
    var nodes = $$('.lg-print > .stsheet', pane).map(function (n) { var c = n.cloneNode(true); c.classList.add('lg-paper'); return c; });
    NS.sharePdf(nodes, name, 'a4', title, '', { phone: phone });
  }

  /* link to the Share maker (share.niveshsahayak.in) with this party chosen: a snapshot link or file for the customer (platform group P3) */
  function shareUrl(k) {
    var x = (window.NS_CFG && NS_CFG.inapp || {}).share; if (!x) return '';
    var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    return (local && x[1] ? 'http://localhost:' + x[1] + '/' : 'https://' + x[0] + '/') + '#stmt/' + encodeURIComponent(k);
  }

  /* ---------- Items: what was sold to the party and bought from them (owner 2026-11-18: "what did we sell to this party?") ---------- */
  function lineAmt(it) { var a = num(it.qty || 0) * num(it.rate || 0); if (num(it.disc)) a = a * (1 - num(it.disc) / 100); return NS.r2 ? NS.r2(a) : Math.round(a * 100) / 100; }
  function itemSums(ents) {
    var out = { sale: {}, buy: {} };
    ents.forEach(function (d) {
      var role = B.role(d), side = role === 'sale' ? 'sale' : role === 'buy' ? 'buy' : role === 'sret' ? 'sale' : role === 'pret' ? 'buy' : '';
      if (!side || !d.items) return;
      var sign = /ret$/.test(role) ? -1 : 1;
      d.items.forEach(function (it) {
        var nm = String(it.desc || '').trim(); if (!nm) return;
        var x = out[side][key(nm)] || (out[side][key(nm)] = { name: nm, unit: it.unit || '', qty: 0, amt: 0, bills: {}, last: '' });
        x.qty += sign * num(it.qty || 0); x.amt += sign * lineAmt(it); x.bills[d.id] = 1; if ((d.date || '') > x.last) x.last = d.date || '';
      });
    });
    ['sale', 'buy'].forEach(function (k) { out[k] = Object.keys(out[k]).map(function (z) { return out[k][z]; }).sort(function (a, b) { return b.amt - a.amt; }); });
    return out;
  }
  function itemsTable(list, title) {
    if (!list.length) return '';
    var tq = 0, ta = 0; list.forEach(function (x) { ta += x.amt; });
    return '<h3>' + esc(title) + '</h3><div class="tbl-wrap"><table class="tbl lg-items"><thead><tr><th>' + esc(T('lg_itm')) + '</th><th class="n">' + esc(T('lg_iqty')) + '</th><th class="n">' + esc(T('lg_irate')) + '</th><th class="n">' + esc(T('lg_ibills')) + '</th><th>' + esc(T('lg_ilast')) + '</th><th class="n">' + esc(T('lg_iamt')) + '</th></tr></thead><tbody>' +
      list.map(function (x) { return '<tr><td>' + esc(x.name) + '</td><td class="n">' + esc(String(Math.round(x.qty * 1000) / 1000)) + (x.unit ? ' ' + esc(x.unit) : '') + '</td><td class="n">' + (x.qty ? money(x.amt / x.qty) : '') + '</td><td class="n">' + Object.keys(x.bills).length + '</td><td>' + A.ldate(x.last) + '</td><td class="n"><b>' + money(x.amt) + '</b></td></tr>'; }).join('') +
      '</tbody><tfoot><tr><th>' + esc(T('lg_itot')) + '</th><td></td><td></td><td></td><td></td><th class="n">' + money(ta) + '</th></tr></tfoot></table></div>';
  }
  function itemsXl(p, k, r, ents) {
    var S = itemSums(ents), rows = [['Side', 'Item', 'Quantity', 'Unit', 'Average rate', 'Bills', 'Last bill', 'Amount']];
    [['sale', 'Sold'], ['buy', 'Bought']].forEach(function (z) { S[z[0]].forEach(function (x) { rows.push([z[1], x.name, Math.round(x.qty * 1000) / 1000, x.unit, x.qty ? Math.round(x.amt / x.qty * 100) / 100 : '', Object.keys(x.bills).length, x.last, Math.round(x.amt * 100) / 100]); }); });
    NS.xlsx(fileName(p.name) + '-items-' + r[0] + '-to-' + r[1] + '.xlsx', [{ name: 'Items', rows: rows }]);
  }

  /* ---------- the party ledger ---------- */
  A.addSection('st', function (k) {
    if (k !== lastK) { shown = false; lastK = k; restoreView(k); }   /* a different party starts with the preview closed and its own last view */
    var p = partyOf(k), r = A.range(), today = NS.today(), G = A.groups(), g = B.groupTree(G).filter(function (x) { return x.id === A.gidOf(k); })[0];
    var line = p.bal > 0.004 ? T('theyowe', { p: p.name, a: money(p.bal) }) : p.bal < -0.004 ? T('weowe', { p: p.name, a: money(-p.bal) }) : T('settled', { p: p.name });
    var body = !shown ? '' : view === 'bills' ? billsSheet(k, p, r) : view === 'letter' ? letterSheets(k, p, r) : ledgerSheet(k, p, r, types);
    var names = partyNames(), ents = A.mine().filter(function (d) { return B.partiesOf(d)[k] && B.role(d) && (d.date || '') >= r[0] && (d.date || '') <= r[1]; }).sort(A.byDate);
    return '<p><a href="#parties" class="link" data-back>' + esc(T('back')) + '</a></p>' +
      '<div class="tools-row lg-switch"><label><span>' + esc(T('lg_switch')) + '</span> <input type="search" list="lg-parties" data-pswitch placeholder="' + esc(T('lg_switchph')) + '" autocomplete="off" value=""></label>' +
        '<datalist id="lg-parties">' + names.map(function (x) { return '<option value="' + esc(x.name) + '" label="' + esc(enBal(x.bal)) + '"></option>'; }).join('') + '</datalist>' +
        '<button type="button" class="btn sm" data-pnext="-1" aria-label="' + esc(T('lg_prev')) + '">&lsaquo;</button><button type="button" class="btn sm" data-pnext="1" aria-label="' + esc(T('lg_next')) + '">&rsaquo;</button></div>' +
      '<div class="pane-hd"><h2>' + esc(p.name) + (g ? ' <small class="pill">' + esc(A.gname(g)) + '</small>' : '') + '</h2><div class="quick">' +
        (p.bal > 0.004 ? '<button type="button" class="btn wa" data-wa="' + esc(k) + '">' + esc(T('remind')) + '</button>' : '') +
        (p.bal > 0.004 && shareUrl(k) ? '<a class="btn" target="_blank" rel="noopener" href="' + esc(shareUrl(k)) + '">' + esc(NS.t('sh.app.link')) + '</a>' : '') +
        '<button type="button" class="btn" data-form="' + (p.bal < 0 ? 'mout' : 'min') + '" data-party="' + esc(p.name) + '">' + esc(T('recpay')) + '</button>' + (A.bwBtns ? A.bwBtns(k, p) : '') + (view === 'items' ? '<button type="button" class="btn" data-lgixl>' + esc(T('lg_xl')) + '</button>' :
        '<button type="button" class="btn' + (shown ? '' : ' primary') + '" data-lgprev aria-pressed="' + shown + '">' + esc(T(shown ? 'lg_hideprev' : 'lg_prev_btn')) + '</button>' +
        '<button type="button" class="btn" data-lgprint>' + esc(T('print')) + '</button><button type="button" class="btn" data-lgpdf>' + esc(T('pdf')) + '</button>' +
        (view !== 'letter' ? '<button type="button" class="btn" data-lgxl>' + esc(T('lg_xl')) + '</button><button type="button" class="btn wa" data-lgwa>' + esc(T('lg_wa')) + '</button>' : '')) + '</div></div>' +
      '<p class="big">' + esc(line) + '</p>' +
      '<div class="lg-bar">' + seg('lgview', [['all', T('lg_all')], ['items', T('lg_items')], ['bills', T('lg_bills')], ['letter', T('lg_letter')]], view) +
      period() +
      (view === 'all' ? '<div class="lg-vt" role="group" aria-label="' + esc(T('lg_vt')) + '"><span class="soft">' + esc(T('lg_vt')) + '</span> <button type="button" class="btn sm" data-vt="" aria-pressed="' + !types.length + '">' + esc(T('all')) + '</button>' +
        VT.map(function (v) { return '<button type="button" class="btn sm" data-vt="' + v + '" aria-pressed="' + (types.indexOf(v) >= 0) + '">' + esc(T('lg_vt_' + v)) + '</button>'; }).join('') + '</div>' +
        (types.length ? '<p class="soft">' + esc(T('lg_filtered')) + '</p>' : '') + lgOptBox() : '') + '</div>' +
      (view === 'bills' ? '<p class="soft">' + esc(T('lg_billsh', { d: A.ldate(r[1]) })) + '</p>' : '') +
      (view === 'letter' ? '<p class="soft">' + esc(T('lg_letterh', { p: p.name, d: A.ldate(r[1]) })) + '</p><label class="chk"><input type="checkbox" data-withst' + (withStmt ? ' checked' : '') + '> ' + esc(T('lg_stmt')) + '</label>' : '') +
      (view === 'items' ? (function () { var S = itemSums(ents); return (itemsTable(S.sale, T('lg_sold', { p: p.name })) + itemsTable(S.buy, T('lg_bought', { p: p.name }))) || '<p class="soft">' + esc(T('lg_noitems')) + '</p>'; })() :
      '<h3>' + esc(T('lg_entries')) + ' <small class="soft">(' + ents.length + ')</small></h3>' + A.rowsHtml(ents.slice(0, 100), { left: A.leftMap(A.mine()) }) +
        (ents.length > 100 ? '<p class="soft">' + esc(T('lg_more', { n: ents.length - 100 })) + '</p>' : '') +
      (shown ? '<div class="tbl-wrap"><div class="lg-print">' + body + '</div></div>' : '<p class="soft lg-hint">' + esc(T('lg_prevh')) + '</p>'));
  }, function (pane, k) {
    var ix = $('[data-lgixl]', pane); if (ix) ix.addEventListener('click', function () { var r = A.range(); itemsXl(partyOf(k), k, r, A.mine().filter(function (d) { return B.partiesOf(d)[k] && B.role(d) && (d.date || '') >= r[0] && (d.date || '') <= r[1]; })); });
    wirePeriod(pane); saveView(k);
    var ps = $('[data-pswitch]', pane), names = partyNames();
    function goParty(v) {
      v = String(v || '').trim(); if (!v) return;
      var hit = names.filter(function (x) { return x.name === v; })[0] || names.filter(function (x) { return key(x.name) === key(v); })[0];
      if (hit) location.hash = '#st/' + encodeURIComponent(hit.key);
    }
    if (ps) { ps.addEventListener('change', function () { goParty(ps.value); }); ps.addEventListener('keydown', function (e) { if (e.key === 'Enter') goParty(ps.value); }); }
    $$('[data-pnext]', pane).forEach(function (b) {
      b.addEventListener('click', function () {
        var i = names.map(function (x) { return x.key; }).indexOf(k), n = +b.getAttribute('data-pnext'); if (!names.length) return;
        location.hash = '#st/' + encodeURIComponent(names[(i + n + names.length) % names.length].key);
      });
    });
    var pv = $('[data-lgprev]', pane); if (pv) pv.addEventListener('click', function () { shown = !shown; A.show(); });
    $$('[data-lgo]', pane).forEach(function (c) { c.addEventListener('change', function () { var o = lgOpt(); o[c.getAttribute('data-lgo')] = c.checked ? 1 : 0; lgOptSave(o); shown = true; A.show(); var d = $('.lg-opts', pane); setTimeout(function () { var d2 = document.querySelector('.lg-opts'); if (d2) d2.open = true; }, 30); }); });   /* print choices: the preview shows the change at once */
    /* Print / PDF pressed before the preview: open the ledger page first, then print or make the PDF */
    var lp = $('[data-lgprint]', pane); if (lp) lp.addEventListener('click', function () { if (shown) { window.print(); return; } shown = true; A.show(); setTimeout(function () { window.print(); }, 350); });
    var lf = $('[data-lgpdf]', pane); if (lf && !shown) lf.addEventListener('click', function (e) { e.stopImmediatePropagation(); shown = true; A.show(); setTimeout(function () { var b = $('[data-pane] [data-lgpdf]'); if (b) b.click(); }, 350); }, true);
    $$('[data-lgview]', pane).forEach(function (b) { b.addEventListener('click', function () { view = b.getAttribute('data-lgview'); A.show(); }); });
    $$('[data-vt]', pane).forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-vt'), i = types.indexOf(v);
        if (!v) types = []; else if (i >= 0) types.splice(i, 1); else types.push(v);
        if (types.length === VT.length) types = [];
        A.show();
      });
    });
    var ws = $('[data-withst]', pane); if (ws) ws.addEventListener('change', function () { withStmt = ws.checked; A.show(); });
    var p = partyOf(k), r = A.range();
    var pb = $('[data-lgpdf]', pane); if (pb) pb.addEventListener('click', function () {
      pdf(pane, (view === 'letter' ? 'Balance confirmation ' : view === 'bills' ? 'Bill-wise ' : 'Ledger ') + p.name + ' ' + r[1], view === 'letter' ? 'Balance confirmation' : 'Party ledger', A.phoneOf(k));
    });
    var xb = $('[data-lgxl]', pane); if (xb) xb.addEventListener('click', function () { excel(k, p, r); });
    var wb = $('[data-lgwa]', pane); if (wb) wb.addEventListener('click', function () { waLedger(k, p, r); });
  });

  /* each party remembers the tab and the dates last used on it (this browser only) */
  function viewStore(k, v) {
    try {
      var o = JSON.parse(localStorage.getItem('ns-lg-view') || '{}');
      if (!v) return o[k] || null;
      o[k] = v; var ks = Object.keys(o); if (ks.length > 300) delete o[ks[0]];
      localStorage.setItem('ns-lg-view', JSON.stringify(o));
    } catch (e) { return null; }
  }
  function saveView(k) {
    var r = A.range(), P = presets(NS.today()), on = Object.keys(P).filter(function (x) { return P[x][0] === r[0] && P[x][1] === r[1]; })[0] || '';
    viewStore(k, { view: view, preset: on, range: r });
  }
  function restoreView(k) {
    var o = viewStore(k); if (!o) return;
    if (/^(all|bills|letter)$/.test(o.view)) view = o.view;
    var p = o.preset && presets(NS.today())[o.preset];
    if (p) A.range(p[0], p[1]); else if (o.range) A.range(o.range[0], o.range[1]);
  }

  /* every party of this business, A to Z, for the switcher */
  function partyNames() {
    var P = B.parties(A.mine(), A.bizName()), seen = {}, out = [];
    A.data().party.forEach(function (x) { var k = key(x.name); if (k && !seen[k]) { seen[k] = 1; out.push({ key: k, name: x.name, bal: (P[k] || {}).bal || 0 }); } });
    Object.keys(P).forEach(function (k) { if (!seen[k]) { seen[k] = 1; out.push({ key: k, name: P[k].name || k, bal: P[k].bal || 0 }); } });
    return out.sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  /* print choices of the party ledger (Evershine): kept in this browser */
  var LGO_DEF = { open: 1, narr: 1, vtype: 1, vno: 1, lasty: 0, pageno: 1, half: 0 };
  function lgOpt() { try { return Object.assign({}, LGO_DEF, JSON.parse(localStorage.getItem('ns-lgopt') || '{}')); } catch (e) { return Object.assign({}, LGO_DEF); } }
  function lgOptSave(o) { try { localStorage.setItem('ns-lgopt', JSON.stringify(o)); } catch (e) {} }
  function lgOptBox() {
    var o = lgOpt(), c = function (k, l) { return '<label class="chk"><input type="checkbox" data-lgo="' + k + '"' + (o[k] ? ' checked' : '') + '> ' + esc(l) + '</label>'; };
    return '<details class="more lg-opts"><summary>Print choices</summary><div class="lg-optl">' + c('open', 'Opening balance') + c('narr', 'Narration') + c('vtype', 'Voucher type') + c('vno', 'Voucher no.') +
      c('lasty', 'Add last year') + c('pageno', 'Page numbers') + c('half', 'Half page (A5)') + '</div></details>';
  }
  function ledgerSheet(k, p, r, vt) {
    var O = lgOpt(); if (O.lasty && r[0]) r = [(+r[0].slice(0, 4) - 1) + r[0].slice(4), r[1]];   /* add last year: from the same day a year earlier */
    var S = B.ledger(A.mine(), A.bizName(), k, r[0], r[1], vt);
    var pg = (O.half ? '@page{size:A5}' : '') + (O.pageno ? '@page{@bottom-right{content:"Page " counter(page) " of " counter(pages);font-size:9pt}}' : '');
    return '<div class="stsheet sh' + (O.half ? ' lg-half' : '') + (O.vtype ? '' : ' lg-novt') + (O.vno ? '' : ' lg-novn') + '" dir="ltr" data-sheet>' + (pg ? '<style media="print">' + pg + '</style>' : '') + bizHead('PARTY LEDGER', '<br>' + esc(p.name) + addrLines(p.rec) + '<br>' + A.ldate(r[0]) + ' to ' + A.ldate(r[1]) +
        (vt && vt.length ? '<br><span class="soft">Only: ' + esc(vt.map(function (v) { return VTEN[v]; }).join(', ')) + '</span>' : '')) +
      '<table class="tbl st lg-tbl"><thead><tr><th>Date</th><th>Particulars</th><th class="lg-cvt">Voucher type</th><th class="lg-cvn">Voucher no.</th><th class="n">Debit</th><th class="n">Credit</th><th class="n">Balance</th><th class="noprint"></th></tr></thead><tbody>' +
      (O.open ? '' : '<!--') + '<tr class="lg-ob"><td>' + A.ldate(r[0]) + '</td><td colspan="3">Opening balance</td><td class="n"></td><td class="n"></td><td class="n">' + enBal(S.open) + '</td><td class="noprint"></td></tr>' + (O.open ? '' : '-->') +
      S.rows.map(function (x) {
        var nr = O.narr ? narrOf(x.d) : '';
        return '<tr data-k="' + esc(x.d.id) + '"><td>' + A.ldate(x.date) + '</td><td>' + esc(oppText(x.d, 'p:' + k)) + (nr ? '<br><span class="soft lg-narr">' + esc(nr) + '</span>' : '') + '</td><td class="lg-cvt">' + esc(A.enName(x.d)) + (x.d.ref ? ' <span class="soft">(' + esc(x.d.ref) + ')</span>' : '') + '</td><td class="lg-cvn">' + esc(x.d.no || x.d.billNo || '') + '</td>' +
          '<td class="n">' + (x.dr ? money(x.dr, false) : '') + '</td><td class="n">' + (x.cr ? money(x.cr, false) : '') + '</td><td class="n">' + enBal(x.bal) + '</td>' +
          '<td class="noprint"><button type="button" class="btn sm ib" data-view="' + esc(x.d.id) + '" title="' + esc(T('open')) + '" aria-label="' + esc(T('open')) + '">' + NS.icSvg('eye') + '</button></td></tr>'; }).join('') +
      (S.rows.length ? '' : '<tr><td colspan="8" class="soft">No entries in this period.</td></tr>') +
      '</tbody><tfoot><tr><th colspan="4">Total</th><th class="n">' + money(S.dr, false) + '</th><th class="n">' + money(S.cr, false) + '</th><th></th><th class="noprint"></th></tr>' +
      '<tr><th colspan="4">Closing balance on ' + A.ldate(r[1]) + '</th><th class="n"></th><th class="n"></th><th class="n">' + enBal(S.close) + '</th><th class="noprint"></th></tr></tfoot></table>' +
      '<p class="small">Dr = amount due to ' + esc(A.bizName()) + '; Cr = amount due from ' + esc(A.bizName()) + '.</p>' + NS.creditLine('st-ft') + '</div>';
  }
  var VTEN = { sales: 'Sales', receipts: 'Money received', notes: 'Credit and debit notes', purchases: 'Purchases', payments: 'Payments', journal: 'Journal', opening: 'Opening balance' };

  function billsSheet(k, p, r) {
    var W = B.billwise(A.mine(), A.bizName(), k, r[1]), sides = ['recv', 'pay'].filter(function (s) { return W.bills.some(function (b) { return b.side === s; }); });
    var tbl = function (s) {
      var L = W.bills.filter(function (b) { return b.side === s; });
      return '<h4 class="lg-h">' + (s === 'recv' ? 'Bills to receive' : 'Bills to pay') + '</h4><table class="tbl st lg-tbl"><thead><tr><th>Date</th><th>Bill</th><th class="n">Amount</th><th>Settled by</th><th class="n">Still due</th><th class="n">Days since bill</th></tr></thead><tbody>' +
        L.map(function (b) {
          return '<tr><td>' + A.ldate(b.date) + '</td><td>' + esc(A.enName(b)) + ' ' + esc(b.no) + (b.due ? '<br><span class="soft">Due ' + A.ldate(b.due) + '</span>' : '') + '</td><td class="n">' + money(b.total, false) + '</td>' +
            '<td class="lg-by">' + (b.by.length ? b.by.map(function (x) { return esc(x.type === 'paid' ? 'Paid on the bill' : A.enName(x) + ' ' + (x.no || '')) + (x.adv ? ' (advance)' : '') + ' <span class="soft">' + A.ldate(x.date) + '</span> ' + money(x.amt, false); }).join('<br>') : '—') + '</td>' +
            '<td class="n">' + (b.left > 0.004 ? '<b>' + money(b.left, false) + '</b>' : 'Paid') + '</td><td class="n">' + (b.left > 0.004 ? B.daysBetween(b.date, r[1]) : '') + '</td></tr>'; }).join('') +
        '</tbody><tfoot><tr><th colspan="2">Total</th><th class="n">' + money(L.reduce(function (a, b) { return a + b.total; }, 0), false) + '</th><th></th><th class="n">' + money(W.due[s], false) + '</th><th></th></tr></tfoot></table>' +
        (W.advances[s] > 0.004 ? '<p>' + (B.isStrict && B.isStrict(A.bizName()) ? 'On account (not set against a bill yet): ' : 'Advance not used yet: ') + '<b>' + money(W.advances[s]) + '</b></p>' : '');
    };
    return '<div class="stsheet sh" dir="ltr" data-sheet>' + bizHead('BILL-WISE DETAILS', '<br>' + esc(p.name) + addrLines(p.rec) + '<br>As on ' + A.ldate(r[1])) +
      (sides.length ? sides.map(tbl).join('') : '<p>No bills up to this date.</p>') +
      '<p class="small">' + (B.isStrict && B.isStrict(A.bizName()) ? 'Money is set only against the bills it names; the rest stays on account until it is adjusted.' : 'Money is set against the bills it names first, then against the oldest bill.') + '</p>' + NS.creditLine('st-ft') + '</div>';
  }

  /* the balance confirmation letter: auditors and CAs ask for it at year end */
  function letterSheets(k, p, r) {
    var asOn = r[1], bal = B.statement(A.mine(), A.bizName(), k, '', asOn).close, amt = money(Math.abs(bal)), biz = esc(A.bizName());
    var what = bal > 0.004 ? amt + ' Debit, that is, ' + amt + ' is payable by you to us' : bal < -0.004 ? amt + ' Credit, that is, ' + amt + ' is payable by us to you' : 'Nil (no amount is payable either way)';
    var theirs = bal > 0.004 ? amt + ' payable by us to ' + biz : bal < -0.004 ? amt + ' receivable by us from ' + biz : 'Nil';
    var letter = '<div class="stsheet sh lg-letter" dir="ltr" data-sheet>' +
      '<div class="st-hd"><div><b>' + biz + '</b>' + addrLines(A.biz()) + '</div><div class="r">Date: ' + A.ldate(NS.today()) + '</div></div>' +
      '<p>To,<br><b>' + esc(p.name) + '</b>' + addrLines(p.rec) + '</p>' +
      '<p><b>Subject: Confirmation of balance as on ' + A.ldate(asOn) + '</b></p>' +
      '<p>Dear Sir / Madam,</p>' +
      '<p>As per our books of account, the balance of your account with us as on ' + A.ldate(asOn) + ' is <b>' + what + '</b>.</p>' +
      '<p>Please check this balance with your books and confirm it by signing the confirmation below and sending a copy back to us within 15 days. ' +
      'If your books show a different balance, please send us your statement of account for the period, so that the difference can be reconciled.</p>' +
      '<p>Thanking you,<br>Yours faithfully,</p><p class="lg-sign">For <b>' + biz + '</b><br><br><br>Authorised signatory</p>' +
      '<div class="lg-cut">cut here and send back</div>' +
      '<p><b>CONFIRMATION</b></p><p>To <b>' + biz + '</b></p>' +
      '<p>We confirm the balance of our account in your books as on ' + A.ldate(asOn) + ': <b>' + theirs + '</b>.</p>' +
      '<p class="lg-box">&#9744; We agree with this balance.</p>' +
      '<p class="lg-box">&#9744; We do not agree. As per our books the balance is &#8377; ______________ (payable by us / receivable by us). Our statement of account is attached.</p>' +
      '<p class="lg-sign2">For <b>' + esc(p.name) + '</b><br><br><br>Signature and stamp: ____________________ &nbsp; Name: ____________________ &nbsp; Date: ____________</p>' +
      '</div>';
    return letter + (withStmt ? ledgerSheet(k, p, [A.fyStart(asOn), asOn], []) : '');
  }

  /* Excel: the ledger and the bill-wise sheet in one file (English headers, like every report) */
  function excel(k, p, r) {
    var S = B.ledger(A.mine(), A.bizName(), k, r[0], r[1], types), W = B.billwise(A.mine(), A.bizName(), k, r[1]);
    var dc = function (v) { return v > 0.004 ? 'Dr' : v < -0.004 ? 'Cr' : ''; };
    var led = [['Date', 'Voucher type', 'Voucher no.', 'Reference', 'Debit', 'Credit', 'Balance', 'Dr/Cr', 'Particulars', 'Narration'], [r[0], 'Opening balance', '', '', '', '', Math.abs(S.open), dc(S.open)]]
      .concat(S.rows.map(function (x) { return [x.date, A.enName(x.d), x.d.no || x.d.billNo || '', x.d.ref || '', x.dr || '', x.cr || '', Math.abs(x.bal), dc(x.bal), oppText(x.d, 'p:' + k), narrOf(x.d)]; }))
      .concat([['', 'Total', '', '', S.dr, S.cr, '', ''], [r[1], 'Closing balance', '', '', '', '', Math.abs(S.close), dc(S.close)]]);
    var bw = [['Side', 'Bill date', 'Bill', 'Bill no.', 'Due date', 'Amount', 'Settled', 'Still due', 'Settled by']].concat(W.bills.map(function (b) {
      return [b.side === 'pay' ? 'To pay' : 'To receive', b.date, A.enName(b), b.no, b.due, b.total, NS.r2(b.total - b.left), b.left, b.by.map(function (x) { return (x.type === 'paid' ? 'Paid on the bill' : A.enName(x) + ' ' + (x.no || '')) + ' ' + x.date + ' ' + x.amt; }).join('; ')];
    }));
    NS.xlsx(fileName(p.name) + '-ledger-' + r[0] + '-to-' + r[1] + '.xlsx', [{ name: 'Ledger', rows: led }, { name: 'Bill-wise', rows: bw }]);
  }
  function waLedger(k, p, r) {
    var S = B.ledger(A.mine(), A.bizName(), k, r[0], r[1], types);
    var lines = S.rows.slice(-20).map(function (x) { return A.ldate(x.date) + ' ' + A.enName(x.d) + ' ' + (x.d.no || '') + ' ' + (x.dr ? 'Dr ' + money(x.dr) : 'Cr ' + money(x.cr)); });
    var msg = T('lg_watxt', { p: p.name, b: A.bizName(), f: A.ldate(r[0]), t: A.ldate(r[1]), o: enBal(S.open), c: enBal(S.close) }) + (lines.length ? '\n\n' + lines.join('\n') : '');
    var ph = A.phoneOf(k); if (ph.length === 10) ph = '91' + ph;
    if (!ph) NS.toast(T('nophone', { p: p.name }));
    window.open('https://wa.me/' + (ph.length >= 11 ? ph : '') + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
  }

  /* ---------- group reports ---------- */
  function treeRows(list, render, total) {
    /* each group, its own parties, its sub-groups, then its total (which includes the sub-groups) */
    var by = {}; list.forEach(function (g) { (by[g.under || ''] = by[g.under || ''] || []).push(g); });
    function walk(g) { return render(g) + (by[g.id] || []).map(walk).join('') + total(g); }
    return (by[''] || []).map(walk).join('');
  }
  function pad(d) { return ' style="padding-inline-start:' + (0.5 + d * 1.1) + 'em"'; }
  A.addSection('grp', function () {
    var G = A.groups(), sel = A.grp(), r = A.range(), today = NS.today(), D = A.mine(), biz = A.bizName(), P = B.parties(D, biz);
    var gid = function (k) { return A.gidOf(k, P); }, own = B.groupsOf(G, 'party').length;
    var hd = '<div class="pane-hd"><h2>' + esc(T('grp')) + '</h2></div>' + seg('gtab', [['sum', T('lg_sum')], ['out', T('lg_out')], ['top', T('lg_top')]].concat(A.routeBody ? [['route', NS.t('rtb.tab')]] : []), gtab) +
      '<div class="tools-row">' + A.grpSel() + (A.routeSel ? A.routeSel() : '') + ((gtab === 'out' || gtab === 'route') ? seg('gside', [['recv', T('recv')], ['pay', T('pay')]], gside) : gtab === 'top' ? '<label><span>' + esc(T('lg_by')) + '</span> <select data-topby>' +
        ['sales', 'buys', 'recv', 'pay'].map(function (x) { return '<option value="' + x + '"' + (x === topBy ? ' selected' : '') + '>' + esc(T('lg_by_' + x)) + '</option>'; }).join('') + '</select></label>' : '') + '</div>' +
      (gtab !== 'out' && gtab !== 'route' ? period() : '') +
      '<p class="soft">' + esc(gtab === 'route' ? NS.t('rtb.h_tab') : T('lg_' + gtab + 'h')) + '</p>' +
      '<div class="quick lg-acts"><button type="button" class="btn" data-print>' + esc(T('print')) + '</button><button type="button" class="btn" data-lgpdf>' + esc(T('pdf')) + '</button><button type="button" class="btn" data-gxl>' + esc(T('lg_xl')) + '</button></div>';
    var bal = function (v) { return money(Math.abs(v), false) + (v > 0.004 ? ' ' + T('dr') : v < -0.004 ? ' ' + T('cr') : ''); }, body = '';
    if (gtab === 'sum') {
      var S = B.groupSummary(B.partyMoves(D, biz, r[0], r[1]), gid, G).filter(function (g) { return g.sum.n && (!sel || B.inGroup(g.id, sel, G)); });
      if (sel) S.forEach(function (g) { if (g.id === sel) g.under = ''; });
      body = S.length ? '<table class="tbl st lg-tbl"><thead><tr><th>' + esc(T('party')) + '</th><th class="n">' + esc(T('opening')) + '</th><th class="n">' + esc(T('debit')) + '</th><th class="n">' + esc(T('credit')) + '</th><th class="n">' + esc(T('closing')) + '</th></tr></thead><tbody>' +
        treeRows(S, function (g) {
          return '<tr class="lg-gh"><th colspan="5"' + pad(g.depth) + '>' + esc(A.gname(g)) + ' <span class="soft">· ' + esc(T('lg_n', { n: g.sum.n })) + '</span></th></tr>' + g.rows.map(function (x) {
            return '<tr><td' + pad(g.depth + 1) + '><a href="#st/' + encodeURIComponent(x.key) + '">' + esc(x.name) + '</a></td><td class="n">' + bal(x.open) + '</td><td class="n">' + money(x.dr, false) + '</td><td class="n">' + money(x.cr, false) + '</td><td class="n">' + bal(x.close) + '</td></tr>'; }).join('');
        }, function (g) {
          return '<tr class="lg-gt"><th' + pad(g.depth) + '>' + esc(T('lg_gtotal', { g: A.gname(g) })) + '</th><th class="n">' + bal(g.sum.open) + '</th><th class="n">' + money(g.sum.dr, false) + '</th><th class="n">' + money(g.sum.cr, false) + '</th><th class="n">' + bal(g.sum.close) + '</th></tr>';
        }) + '</tbody></table>' : '<p class="soft">' + esc(T('none')) + '</p>';
    } else if (gtab === 'out') {
      var O = B.groupDues(dueBills(D, biz), gid, G, today, true).filter(function (g) { return (gside === 'pay' ? g.pt : g.rt) > 0.004 && (!sel || B.inGroup(g.id, sel, G)); });
      if (sel) O.forEach(function (g) { if (g.id === sel) g.under = ''; });
      body = O.length ? '<table class="tbl st lg-tbl"><thead><tr><th>' + esc(T('lg_group')) + '</th>' + ['a0', 'a1', 'a2', 'a3'].map(function (x) { return '<th class="n">' + esc(T(x)) + '</th>'; }).join('') + '<th class="n">' + esc(T('totaldue')) + '</th></tr></thead><tbody>' +
        treeRows(O, function (g) {
          var a = gside === 'pay' ? g.pay : g.recv;
          return '<tr' + (g.depth ? '' : ' class="lg-gt"') + '><th scope="row"' + pad(g.depth) + '><a href="#dues' + (gside === 'pay' ? '/pay' : '') + '" data-gopen="' + esc(g.id) + '">' + esc(A.gname(g)) + '</a></th>' +
            a.map(function (v) { return '<td class="n">' + (v ? money(v, false) : '—') + '</td>'; }).join('') + '<td class="n"><b>' + money(gside === 'pay' ? g.pt : g.rt, false) + '</b></td></tr>';
        }, function () { return ''; }) + '</tbody></table><p class="soft">' + esc(T('lg_outsub')) + '</p>' : '<p class="soft">' + esc(T('nodues')) + '</p>';
    } else if (gtab === 'route') {
      body = A.routeBody(gside, dueBills(D, biz), today, P);
    } else {
      var M = B.partyMoves(D, biz, topBy === 'recv' || topBy === 'pay' ? '' : r[0], r[1]), gm = {}; B.groupTree(G).forEach(function (g) { gm[g.id] = g; });
      var top = B.topParties(M, topBy, 20, function (k) { return A.grpKeep(k, P); });
      body = top.length ? '<table class="tbl st lg-tbl"><thead><tr><th class="n">#</th><th>' + esc(T('party')) + '</th><th>' + esc(T('lg_group')) + '</th><th class="n">' + esc(T('lg_by_' + topBy)) + '</th></tr></thead><tbody>' +
        top.map(function (x, i) { var g = gm[gid(x.key)]; return '<tr><td class="n">' + (i + 1) + '</td><td><a href="#st/' + encodeURIComponent(x.key) + '">' + esc(x.name) + '</a></td><td>' + (g ? esc(A.gname(g)) : '') + '</td><td class="n">' + money(x.value, false) + '</td></tr>'; }).join('') +
        '</tbody></table>' : '<p class="soft">' + esc(T('none')) + '</p>';
    }
    var sub = gtab === 'out' || gtab === 'route' ? T(gside) + ' · ' + A.ldate(today) : A.ldate(r[0]) + ' – ' + A.ldate(r[1]);
    return hd + (own ? '' : '<p class="note">' + esc(T('lg_nogroups')) + ' <a href="' + A.myUrl('#party') + '">' + esc(NS.t('my.t.party')) + ' ›</a></p>') +
      '<div class="tbl-wrap"><div class="lg-print"><div class="stsheet sh lg-rep" data-sheet>' + bizHead(gtab === 'route' ? NS.t('rtb.tab') : T('lg_' + gtab), '<br>' + esc(sub) + (sel ? '<br>' + esc(T('lg_group')) + ': ' + esc(A.gname(B.groupTree(G).filter(function (g) { return g.id === sel; })[0] || { id: sel, name: sel })) : '')) + body + '</div></div></div>';
  }, function (pane) {
    var hdr = $('.pane-hd', pane), la = $('.lg-acts', pane); if (hdr && la && !hdr.contains(la)) { var h2 = $('h2', hdr); hdr.insertBefore(la, h2 ? h2.nextSibling : hdr.firstChild); }   /* Print / Share PDF / Excel on the heading line, as on every report (19 Nov 2026) */
    wirePeriod(pane);
    $$('[data-gtab]', pane).forEach(function (b) { b.addEventListener('click', function () { gtab = b.getAttribute('data-gtab'); A.show(); }); });
    $$('[data-gside]', pane).forEach(function (b) { b.addEventListener('click', function () { gside = b.getAttribute('data-gside'); A.show(); }); });
    var tb = $('[data-topby]', pane); if (tb) tb.addEventListener('change', function () { topBy = tb.value; A.show(); });
    $$('[data-gopen]', pane).forEach(function (a) { a.addEventListener('click', function () { A.grp(a.getAttribute('data-gopen')); }); });
    var pb = $('[data-lgpdf]', pane); if (pb) pb.addEventListener('click', function () { pdf(pane, (gtab === 'route' ? NS.t('rtb.tab') : T('lg_' + gtab)) + ' ' + A.range()[1], gtab === 'route' ? NS.t('rtb.tab') : T('lg_' + gtab)); });
    var xb = $('[data-gxl]', pane); if (xb) xb.addEventListener('click', groupExcel);
  });
  /* ---------- Debtors list and Creditors list (reports plan, Phase 1): every party with a balance as on a date, with phone,
     GSTIN, city, oldest open bill, days overdue and credit limit (debtors) or MSME size (creditors); group, minimum amount, sort;
     Print, PDF, Excel. Printed column names stay in English like every printed report. ---------- */
  var dcAs = '', dcMin = '', dcSort = 'bal';
  function dcRows(side) {
    var as = dcAs || A.range()[1], D = A.mine().filter(function (d) { return (d.date || '') <= as; }), biz = A.bizName(), P = B.parties(D, biz);
    var byP = {};
    dueBills(D, biz).forEach(function (b) { if (b.left > 0.004 && b.side === side) (byP[key(b.party)] = byP[key(b.party)] || []).push(b); });
    var rows = Object.keys(P).map(function (k) { return P[k]; }).filter(function (p) { return (side === 'recv' ? p.bal > 0.004 : p.bal < -0.004) && A.grpKeep(p.key, P, side === 'recv' ? 'debtors' : 'creditors'); }).map(function (p) {
      var rec = partyRec(p.key) || {}, bl = byP[p.key] || [], old = '', days = 0;
      bl.forEach(function (b) { if (!old || (b.date || '') < old) old = b.date || ''; var dd = B.daysBetween(b.due || b.date, as); if (dd > days) days = dd; });
      return { key: p.key, name: rec.name || p.name, phone: rec.phone || p.phone || '', gstin: rec.gstin || '', city: rec.city || '', amt: Math.abs(p.bal), old: old, days: days,
        limit: num(rec.climit), msme: rec.msme || '' };
    }).filter(function (r) { return !num(dcMin) || r.amt >= num(dcMin); });
    rows.sort(dcSort === 'age' ? function (a, b) { return b.days - a.days || b.amt - a.amt; } : dcSort === 'name' ? function (a, b) { return a.name.localeCompare(b.name); } : function (a, b) { return b.amt - a.amt; });
    return { rows: rows, as: as, total: rows.reduce(function (s, r) { return s + r.amt; }, 0) };
  }
  function dcHtml(side) {
    var R = dcRows(side), deb = side === 'recv', title = T(deb ? 'dc_deb' : 'dc_cred');
    var hd = '<div class="pane-hd"><h2>' + esc(title) + '</h2></div>' +
      '<div class="lg-bar"><label><span>' + esc(T('dc_as')) + '</span> <input type="date" data-dcas value="' + R.as + '"></label><a class="btn sm" href="#os/' + side + '">' + esc(NS.t('rp.os_link')) + ' ›</a>' + A.grpSel(deb ? 'debtors' : 'creditors') +
      '<label><span>' + esc(T('dc_min')) + '</span> <input type="number" min="0" step="1" data-dcmin value="' + esc(dcMin) + '" style="width:120px"></label>' +
      '<label><span>' + esc(T('dc_sort')) + '</span> <select data-dcsort>' + [['bal', 'dc_s_bal'], ['age', 'dc_s_age'], ['name', 'dc_s_name']].map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === dcSort ? ' selected' : '') + '>' + esc(T(x[1])) + '</option>'; }).join('') + '</select></label></div>' +
      '<p class="soft">' + esc(T(deb ? 'dc_h_deb' : 'dc_h_cred')) + '</p>' +
      '<div class="quick lg-acts"><button type="button" class="btn" data-print>' + esc(T('print')) + '</button><button type="button" class="btn" data-dcpdf>' + esc(T('pdf')) + '</button><button type="button" class="btn" data-dcxl>' + esc(T('lg_xl')) + '</button></div>';
    var body = R.rows.length ? '<table class="tbl st lg-tbl dc-tbl"><thead><tr><th class="n">#</th><th>Party</th><th>Phone</th><th>GSTIN</th><th>City</th><th class="n">Balance</th><th>Oldest bill</th><th class="n">Days overdue</th><th class="n">' + (deb ? 'Credit limit' : 'MSME') + '</th></tr></thead><tbody>' +
      R.rows.map(function (r, i) {
        var over = deb && r.limit && r.amt > r.limit;
        return '<tr' + (over ? ' class="dc-over"' : '') + '><td class="n">' + (i + 1) + '</td><td><a href="#st/' + encodeURIComponent(r.key) + '">' + esc(r.name) + '</a></td><td>' + esc(r.phone) + '</td><td class="mono">' + esc(r.gstin) + '</td><td>' + esc(r.city) + '</td><td class="n"><b>' + money(r.amt, false) + ' ' + (deb ? 'Dr' : 'Cr') + '</b></td><td>' + (r.old ? A.ldate(r.old) : '') + '</td><td class="n">' + (r.days ? r.days : '') + '</td><td class="n">' + (deb ? (r.limit ? money(r.limit, false) : '') : esc(r.msme ? r.msme.charAt(0).toUpperCase() + r.msme.slice(1) : '')) + '</td></tr>';
      }).join('') + '</tbody><tfoot><tr><th colspan="5">Total (' + R.rows.length + ')</th><th class="n">' + money(R.total, false) + ' ' + (deb ? 'Dr' : 'Cr') + '</th><th colspan="3"></th></tr></tfoot></table>'
      : '<p class="soft">' + esc(T('none')) + '</p>';
    return hd + '<div class="tbl-wrap"><div class="lg-print"><div class="stsheet sh lg-rep" data-sheet>' + bizHead(deb ? 'Sundry Debtors' : 'Sundry Creditors', '<br>As on ' + esc(A.ldate(R.as))) + body + NS.creditLine('st-ft') + '</div></div></div>';
  }
  function dcWire(side) {
    return function (pane) {
      var a = $('[data-dcas]', pane); if (a) a.addEventListener('change', function () { dcAs = a.value; A.show(); });
      var m = $('[data-dcmin]', pane); if (m) m.addEventListener('change', function () { dcMin = m.value; A.show(); });
      var s = $('[data-dcsort]', pane); if (s) s.addEventListener('change', function () { dcSort = s.value; A.show(); });
      var pb = $('[data-dcpdf]', pane); if (pb) pb.addEventListener('click', function () { pdf(pane, (side === 'recv' ? 'Debtors' : 'Creditors') + ' ' + (dcAs || A.range()[1]), T(side === 'recv' ? 'dc_deb' : 'dc_cred')); });
      var xb = $('[data-dcxl]', pane); if (xb) xb.addEventListener('click', function () {
        var R = dcRows(side), deb = side === 'recv', rows = [[deb ? 'Sundry Debtors' : 'Sundry Creditors', 'As on ' + R.as], ['#', 'Party', 'Phone', 'GSTIN', 'City', 'Balance', 'Oldest bill', 'Days overdue', deb ? 'Credit limit' : 'MSME']];
        R.rows.forEach(function (r, i) { rows.push([i + 1, r.name, r.phone, r.gstin, r.city, Math.round(r.amt * 100) / 100, r.old, r.days || '', deb ? (r.limit || '') : r.msme]); });
        rows.push(['', 'Total', '', '', '', Math.round(R.total * 100) / 100]);
        NS.xlsx(fileName(A.bizName()) + (deb ? '-debtors-' : '-creditors-') + R.as + '.xlsx', [{ name: deb ? 'Debtors' : 'Creditors', rows: rows }]);
      });
    };
  }
  A.addSection('dlist', function () { return dcHtml('recv'); }, dcWire('recv'));
  A.addSection('clist', function () { return dcHtml('pay'); }, dcWire('pay'));
  /* ---------- inner core (reports plan, Phase 1): shared bits ---------- */
  function acts(pfx) { return '<div class="quick lg-acts"><button type="button" class="btn" data-print>' + esc(T('print')) + '</button><button type="button" class="btn" data-' + pfx + 'pdf>' + esc(T('pdf')) + '</button><button type="button" class="btn" data-' + pfx + 'xl>' + esc(T('lg_xl')) + '</button></div>'; }
  function sheet(title, sub, body) { return '<div class="tbl-wrap"><div class="lg-print"><div class="stsheet sh lg-rep" data-sheet>' + bizHead(title, '<br>' + sub) + body + NS.creditLine('st-ft') + '</div></div></div>'; }
  function rng() { var r = A.range(); return esc(A.ldate(r[0])) + ' to ' + esc(A.ldate(r[1])); }
  function m2(v) { return Math.round(v * 100) / 100; }
  function monthName(ym) { var p = ym.split('-'); return new Date(+p[0], +p[1] - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' }); }

  /* ---------- Sales summary and Purchase summary: by month, party, item or HSN; a month opens its days, a day opens its bills ---------- */
  var smBy = (function () { var o = { sale: 'month', buy: 'month' }; try { Object.assign(o, JSON.parse(localStorage.getItem('ns-rep-smby') || '{}')); } catch (e) {} return o; })(), smCol =   /* ERP C-13: remembered */ (function () { try { return localStorage.getItem('ns-rep-col') === '1'; } catch (e) { return false; } })();
  /* the register: one row per bill with the GST split; columnar = taxable value per GST rate too (Tally's columnar register) */
  function regData(docs) { var rows = docs.slice().sort(A.byDate).reverse().map(function (d) { return NSRep.regRow(d, A.amountOf); }); rows.sort(function (a, b) { return a.date.localeCompare(b.date) || String(a.no).localeCompare(String(b.no)); }); return { rows: rows, T: NSRep.regTotals(rows), rates: smCol ? NSRep.rateCols(rows) : [] }; }
  /* custom fields in the registers (ERP Round 2, B-1): filter row, extra columns, group by a field (cfields.js) */
  var CFT = { sale: ['vt:invoice', 'vt:cashmemo', 'vt:note', 'vt:expinv'], buy: ['vt:pbill', 'vt:self', 'vt:note'], vreg: ['vt:receipt', 'vt:voucher', 'vt:exp', 'vt:contra', 'vt:jv', 'vt:note'] };
  function cfCols(docs) { return window.NSCF ? NSCF.colsOf(docs) : []; }
  function cfBar(scope, t) { return window.NSCF ? NSCF.filterBar(scope, t) : ''; }
  function cfOk(d, scope) { return !window.NSCF || NSCF.pass(d, scope); }
  function cfByOpts(side) { return window.NSCF ? NSCF.groupDefs(CFT[side === 'sale' ? 'sale' : 'buy']).map(function (f) { return '<option value="cf:' + esc(f.id) + '"' + (smBy[side] === 'cf:' + f.id ? ' selected' : '') + '>' + esc(T('cr_by') + ' ' + f.label) + '</option>'; }).join('') : ''; }
  function regTable(side, docs) {
    if (!window.NSRep) return A.rowsHtml(docs, { left: A.leftMap(A.mine()) });
    var X = regData(docs), m = function (v) { return v ? money(v, false) : ''; }, pos = function (c) { return NS.stateName && NS.stateName(c) || c || ''; }, CC = cfCols(docs);
    if (!X.rows.length) return '<p class="soft">' + esc(T('none')) + '</p>';
    return '<table class="tbl st lg-tbl reg-tbl"><thead><tr><th>Date</th><th>No.</th><th>' + (side === 'sale' ? 'Customer' : 'Supplier') + '</th><th>GSTIN</th><th>Place of supply</th>' + (CC.length ? NSCF.colHead(CC) : '') +
      X.rates.map(function (g) { return '<th class="n">Taxable ' + g + '%</th>'; }).join('') + '<th class="n">Taxable value</th><th class="n">CGST</th><th class="n">SGST</th><th class="n">IGST</th><th class="n">TCS</th><th class="n">Round off</th><th class="n">Total</th><th class="noprint"></th></tr></thead><tbody>' +
      X.rows.map(function (r) {
        return '<tr data-k="' + esc(r.id) + '"><td>' + esc(A.ldate(r.date)) + '</td><td>' + esc(A.enName(r.d) + ' ' + r.no) + '</td><td>' + esc(r.party) + '</td><td class="mono">' + esc(r.gstin) + '</td><td>' + esc(pos(r.pos)) + '</td>' + (CC.length ? NSCF.colCells(CC, r.d) : '') +
          X.rates.map(function (g) { return '<td class="n">' + m(r.rates[g]) + '</td>'; }).join('') +
          '<td class="n">' + money(r.taxable, false) + '</td><td class="n">' + m(r.cgst) + '</td><td class="n">' + m(r.sgst) + '</td><td class="n">' + m(r.igst) + '</td><td class="n">' + m(r.tcs) + '</td><td class="n">' + m(r.round) + '</td><td class="n"><b>' + money(r.total, false) + '</b></td>' +
          '<td class="noprint"><button type="button" class="btn sm ib" data-view="' + esc(r.id) + '" title="' + esc(T('open')) + '" aria-label="' + esc(T('open')) + '">' + NS.icSvg('eye') + '</button></td></tr>';
      }).join('') + '</tbody><tfoot><tr><th colspan="' + (5 + CC.length) + '">Total (' + X.rows.length + ')</th>' + X.rates.map(function (g) { return '<th class="n">' + money(X.T.rates[g] || 0, false) + '</th>'; }).join('') +
      ['taxable', 'cgst', 'sgst', 'igst', 'tcs', 'round', 'total'].map(function (k) { return '<th class="n">' + money(X.T[k], false) + '</th>'; }).join('') + '<th class="noprint"></th></tr></tfoot></table>';
  }
  function regXl(side, docs, title) {
    var X = regData(docs), CC = cfCols(docs), rows = [[title, A.range()[0] + ' to ' + A.range()[1]], ['Date', 'Voucher', 'No.', side === 'sale' ? 'Customer' : 'Supplier', 'GSTIN', 'Place of supply'].concat(CC.map(function (f) { return f.label; }), X.rates.map(function (g) { return 'Taxable ' + g + '%'; }), ['Taxable value', 'CGST', 'SGST', 'IGST', 'TCS', 'Round off', 'Total'])];
    X.rows.forEach(function (r) { rows.push([r.date, A.enName(r.d), r.no, r.party, r.gstin, NS.stateName && NS.stateName(r.pos) || r.pos].concat(CC.length ? NSCF.colVals(CC, r.d) : [], X.rates.map(function (g) { return r.rates[g] || ''; }), [r.taxable, r.cgst, r.sgst, r.igst, r.tcs, r.round, r.total])); });
    rows.push(['Total', '', '', '', '', ''].concat(CC.map(function () { return ''; }), X.rates.map(function (g) { return X.T.rates[g] || 0; }), [X.T.taxable, X.T.cgst, X.T.sgst, X.T.igst, X.T.tcs, X.T.round, X.T.total]));
    NS.xlsx(fileName(A.bizName()) + (side === 'sale' ? '-sales-register-' : '-purchase-register-') + A.range()[1] + '.xlsx', [{ name: 'Register', rows: rows }]);
  }
  function smDocs(side) { var r = A.range(); return A.mine().filter(function (d) { var R = B.role(d); return (side === 'sale' ? /^(sale|sret)$/.test(R) : /^(buy|pret)$/.test(R) || R === 'exp' && (d.items || []).length && d.type !== 'exp') && (d.date || '') >= r[0] && (d.date || '') <= r[1] && cfOk(d, 'reg'); }); }
  function smVal(d) {
    var R = B.role(d), sg = /ret$/.test(R) ? -1 : 1, tot = num(A.amountOf(d)), t = d.items && d.items.length ? B.itemTotals(d) : null, g = t ? t.cgst + t.sgst + t.igst : 0;
    return { tx: sg * (t ? t.taxable : tot - g), gst: sg * g, tot: sg * tot };
  }
  function smAgg(list, kf, lf) {
    var o = {};
    list.forEach(function (x) { var k = kf(x); if (k == null || k === '') return; var r = o[k] || (o[k] = { k: k, label: lf ? lf(x, k) : k, n: 0, tx: 0, gst: 0, tot: 0 }); r.n += x.n == null ? 1 : x.n; r.tx += x.tx; r.gst += x.gst; r.tot += x.tot; });
    return Object.keys(o).map(function (k) { return o[k]; });
  }
  function smRows(side, arg) {
    try { Object.assign(smBy, JSON.parse(localStorage.getItem('ns-rep-smby') || '{}')); } catch (e) {}   /* C-13: the choice may arrive from the data home after this file loaded */
    var D = smDocs(side), by = smBy[side];
    var flat = D.map(function (d) { var v = smVal(d); return { d: d, date: d.date || '', party: B.partyName(d) || (d.cat ? (A.catName ? A.catName(d.cat) : String(d.cat)) : ''), tx: v.tx, gst: v.gst, tot: v.tot }; });
    if (/^\d{4}-\d{2}$/.test(arg)) return { lvl: 'day', rows: smAgg(flat.filter(function (x) { return x.date.slice(0, 7) === arg; }), function (x) { return x.date; }).sort(function (a, b) { return a.k.localeCompare(b.k); }) };
    if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) return { lvl: 'bill', docs: D.filter(function (d) { return d.date === arg; }) };
    if (/^\d{4}-\d{2}\/reg$/.test(arg)) return { lvl: 'bill', docs: D.filter(function (d) { return (d.date || '').slice(0, 7) === arg.slice(0, 7); }) };
    if (by === 'reg') return { lvl: 'bill', docs: D };
    if (by === 'month') return { lvl: 'month', rows: smAgg(flat, function (x) { return x.date.slice(0, 7); }).sort(function (a, b) { return a.k.localeCompare(b.k); }) };
    var cfd = /^cf:/.test(by) && window.NSCF && NSCF.get(by.slice(3)), cfv = function (x) { return cfd ? NSCF.fmt(cfd, x.d.cf && x.d.cf[cfd.id]) || '—' : ''; };
    if (cfd) return { lvl: 'cf', first: cfd.label, rows: smAgg(flat, function (x) { return key(cfv(x)); }, cfv).sort(function (a, b) { return b.tot - a.tot; }) };   /* sales by a custom field, e.g. by Site (ERP Round 2) */
    /* analysis: a row per party or item, a column per month (taxable value, returns taken off) */
    if (by === 'pm' || by === 'im') {
      var mx = {}, ms = {};
      var put = function (k, lab, ym, v, q, u) { var r = mx[k] || (mx[k] = { k: k, label: lab, m: {}, q: {}, tot: 0, qty: 0, unit: u || '' }); r.m[ym] = (r.m[ym] || 0) + v; r.tot += v; if (q) { r.q[ym] = (r.q[ym] || 0) + q; r.qty += q; } ms[ym] = 1; };
      if (by === 'pm') flat.forEach(function (x) { var lab = x.party || 'Cash'; put(key(lab), lab, x.date.slice(0, 7), x.tx); });
      else D.forEach(function (d) { var sg = /ret$/.test(B.role(d)) ? -1 : 1; (d.items || []).forEach(function (it) { var nm = String(it.desc || '').trim(); if (nm) put(key(nm), nm, (d.date || '').slice(0, 7), sg * lineAmt(it), sg * num(it.qty || 0), it.unit); }); });
      return { lvl: 'mx', first: by === 'pm' ? 'Party' : 'Item', months: Object.keys(ms).sort(), rows: Object.keys(mx).map(function (k) { return mx[k]; }).sort(function (a, b) { return b.tot - a.tot; }) };
    }
    if (by === 'party') return { lvl: 'party', rows: smAgg(flat, function (x) { return key(x.party || 'Cash'); }, function (x) { return x.party || 'Cash'; }).sort(function (a, b) { return b.tot - a.tot; }) };
    var lines = [];
    D.forEach(function (d) { var R = B.role(d), sg = /ret$/.test(R) ? -1 : 1; (d.items || []).forEach(function (it) { var a = lineAmt(it), g = a * num(it.gst) / 100; lines.push({ id: d.id, name: String(it.desc || '').trim(), hsn: String(it.hsn || '').trim() || '(no HSN)', n: 0, tx: sg * a, gst: sg * g, tot: sg * (a + g), qty: sg * num(it.qty || 0), unit: it.unit || '' }); }); });
    function bills(rows, kf) { var s = {}; lines.forEach(function (x) { var k = kf(x); (s[k] = s[k] || {})[x.id] = 1; }); rows.forEach(function (r) { r.n = Object.keys(s[r.kk != null ? r.kk : r.k] || {}).length; }); return rows; }   /* F2-7 */
    if (by === 'hsn') return { lvl: 'hsn', rows: bills(smAgg(lines, function (x) { return x.hsn; }), function (x) { return x.hsn; }).sort(function (a, b) { return b.tx - a.tx; }) };
    var o = {}; lines.forEach(function (x) { if (!x.name) return; var r = o[key(x.name)] || (o[key(x.name)] = { k: x.name, label: x.name, n: 0, qty: 0, unit: x.unit, tx: 0, gst: 0, tot: 0 }); r.qty += x.qty; r.tx += x.tx; r.gst += x.gst; r.tot += x.tot; });
    return { lvl: 'item', rows: bills(Object.keys(o).map(function (k) { o[k].kk = k; return o[k]; }), function (x) { return key(x.name); }).sort(function (a, b) { return b.tx - a.tx; }) };
  }
  function smHtml(side, arg) {
    var sec = side === 'sale' ? 'ssum' : 'psum', R = smRows(side, arg || ''), title = T(side === 'sale' ? 'cr_ssum' : 'cr_psum');
    var crumbs = arg ? '<p class="cr-drill"><a href="#' + sec + '">' + esc(T('cr_allm')) + '</a>' + (arg.length === 10 ? ' › <a href="#' + sec + '/' + arg.slice(0, 7) + '">' + esc(monthName(arg.slice(0, 7))) + '</a> › <b>' + esc(A.ldate(arg)) + '</b>' : ' › <b>' + esc(monthName(arg.slice(0, 7))) + '</b>' + (/\/reg$/.test(arg) ? '' : ' · <a href="#' + sec + '/' + arg + '/reg">' + esc(NS.t('rp.regmonth')) + ' ›</a>')) + '</p>' : '';
    var bar = '<div class="lg-bar">' + (arg ? '' : '<label><span>' + esc(T('cr_by')) + '</span> <select data-smby>' + ['month', 'party', 'item', 'hsn', 'pm', 'im', 'reg'].map(function (x) { return '<option value="' + x + '"' + (smBy[side] === x ? ' selected' : '') + '>' + esc(x === 'reg' ? NS.t('rp.reg') : T('cr_by_' + x)) + '</option>'; }).join('') + cfByOpts(side) + '</select></label>') + period() + '</div>' + cfBar('reg', CFT[side === 'sale' ? 'sale' : 'buy']);
    var hd = '<div class="pane-hd"><h2>' + esc(title) + '</h2></div>' + crumbs + bar + '<p class="soft">' + esc(T('cr_h_sum')) + '</p>' + acts('sm');
    if (R.lvl === 'bill') return hd + '<label class="chk no-print"><input type="checkbox" data-smcol' + (smCol ? ' checked' : '') + '> ' + esc(NS.t('rp.colh')) + '</label>' +
      sheet(side === 'sale' ? 'Sales register' : 'Purchase register', rng() + (arg ? '<br>' + esc(arg.length === 10 ? A.ldate(arg) : monthName(arg.slice(0, 7))) : ''), regTable(side, R.docs));
    if (R.lvl === 'mx') {
      var mt = {}, gt = 0, mm = function (v) { return v ? money(v, false) : ''; };
      var mxb = R.rows.length ? '<div class="tbl-scroll"><table class="tbl st lg-tbl sm-tbl sm-mx"><thead><tr><th>' + R.first + '</th>' + R.months.map(function (k) { return '<th class="n"><a href="#' + sec + '/' + k + '">' + esc(new Date(+k.slice(0, 4), +k.slice(5) - 1, 1).toLocaleString('en-IN', { month: 'short' }) + ' ' + k.slice(2, 4)) + '</a></th>'; }).join('') + '<th class="n">Total</th></tr></thead><tbody>' +
        R.rows.map(function (r) { gt += r.tot; return '<tr><td>' + esc(r.label) + (r.qty ? ' <span class="soft">(' + esc(String(m2(r.qty))) + (r.unit ? ' ' + esc(r.unit) : '') + ')</span>' : '') + '</td>' + R.months.map(function (k) { mt[k] = (mt[k] || 0) + (r.m[k] || 0); return '<td class="n">' + mm(r.m[k]) + '</td>'; }).join('') + '<td class="n"><b>' + money(r.tot, false) + '</b></td></tr>'; }).join('') +
        '</tbody><tfoot><tr><th>Total</th>' + R.months.map(function (k) { return '<th class="n">' + money(mt[k] || 0, false) + '</th>'; }).join('') + '<th class="n">' + money(gt, false) + '</th></tr></tfoot></table></div>' : '<p class="soft">' + esc(T('none')) + '</p>';
      return hd + sheet((side === 'sale' ? 'Sales' : 'Purchase') + ' analysis: ' + R.first.toLowerCase() + ' by month', rng() + '<br>Taxable value, returns taken off', mxb);
    }
    var first = R.first || { month: 'Month', day: 'Date', party: 'Party', item: 'Item', hsn: 'HSN / SAC' }[R.lvl], tt = { n: 0, tx: 0, gst: 0, tot: 0 };
    var body = R.rows.length ? '<table class="tbl st lg-tbl sm-tbl"><thead><tr><th>' + first + '</th>' + (R.lvl === 'item' ? '<th class="n">Quantity</th>' : '<th class="n">Bills</th>') + '<th class="n">Taxable value</th><th class="n">GST</th><th class="n">Total</th></tr></thead><tbody>' +
      R.rows.map(function (r) {
        tt.n += r.n || 0; tt.tx += r.tx; tt.gst += r.gst; tt.tot += r.tot;
        var lab = R.lvl === 'month' ? '<a href="#' + sec + '/' + r.k + '">' + esc(monthName(r.k)) + '</a> <a class="soft no-print" href="#' + sec + '/' + r.k + '/reg">' + esc(NS.t('rp.regshort')) + '</a>' : R.lvl === 'day' ? '<a href="#' + sec + '/' + r.k + '">' + esc(A.ldate(r.k)) + '</a>' : R.lvl === 'party' && r.label !== 'Cash' ? '<a href="#st/' + encodeURIComponent(key(r.label)) + '">' + esc(r.label) + '</a>' : esc(r.label);
        return '<tr><td>' + lab + '</td><td class="n">' + (R.lvl === 'item' ? esc(String(m2(r.qty))) + (r.unit ? ' ' + esc(r.unit) : '') : r.n) + '</td><td class="n">' + money(r.tx, false) + '</td><td class="n">' + money(r.gst, false) + '</td><td class="n"><b>' + money(r.tot, false) + '</b></td></tr>';
      }).join('') + '</tbody><tfoot><tr><th>Total</th><th class="n">' + (R.lvl === 'item' ? '' : tt.n) + '</th><th class="n">' + money(tt.tx, false) + '</th><th class="n">' + money(tt.gst, false) + '</th><th class="n">' + money(tt.tot, false) + '</th></tr></tfoot></table>'
      : '<p class="soft">' + esc(T('none')) + '</p>';
    return hd + sheet(side === 'sale' ? 'Sales summary' : 'Purchase summary', rng() + (arg ? '<br>' + esc(arg.length === 7 ? monthName(arg) : A.ldate(arg)) : '') + '<br>By ' + first, body);
  }
  function smWire(side) {
    return function (pane, arg) {
      wirePeriod(pane);
      var s = $('[data-smby]', pane); if (s) s.addEventListener('change', function () { smBy[side] = s.value; try { localStorage.setItem('ns-rep-smby', JSON.stringify(smBy)); } catch (e) {} A.show(); });
      var cc = $('[data-smcol]', pane); if (cc) cc.addEventListener('change', function () { smCol = cc.checked; try { localStorage.setItem('ns-rep-col', smCol ? '1' : '0'); } catch (e) {} A.show(); });
      var pb = $('[data-smpdf]', pane); if (pb) pb.addEventListener('click', function () { pdf(pane, (side === 'sale' ? 'Sales summary ' : 'Purchase summary ') + A.range()[1], T(side === 'sale' ? 'cr_ssum' : 'cr_psum')); });
      var xb = $('[data-smxl]', pane); if (xb) xb.addEventListener('click', function () {
        var R = smRows(side, arg || ''); if (R.lvl === 'bill') { if (window.NSRep) regXl(side, R.docs, side === 'sale' ? 'Sales register' : 'Purchase register'); return; }
        if (R.lvl === 'mx') { var xr = [[(side === 'sale' ? 'Sales' : 'Purchase') + ' analysis by month (taxable value)', A.range()[0] + ' to ' + A.range()[1]], [R.first].concat(R.months.map(monthName), ['Total'])];
          R.rows.forEach(function (r) { xr.push([r.label].concat(R.months.map(function (k) { return m2(r.m[k] || 0); }), [m2(r.tot)])); });
          NS.xlsx(fileName(A.bizName()) + (side === 'sale' ? '-sales-analysis-' : '-purchase-analysis-') + A.range()[1] + '.xlsx', [{ name: 'Analysis', rows: xr }]); return; }
        var rows = [[(side === 'sale' ? 'Sales' : 'Purchase') + ' summary', A.range()[0] + ' to ' + A.range()[1]], [R.first || R.lvl, R.lvl === 'item' ? 'Quantity' : 'Bills', 'Taxable value', 'GST', 'Total']];
        R.rows.forEach(function (r) { rows.push([R.lvl === 'month' ? monthName(r.k) : r.label, R.lvl === 'item' ? m2(r.qty) : r.n, m2(r.tx), m2(r.gst), m2(r.tot)]); });
        NS.xlsx(fileName(A.bizName()) + (side === 'sale' ? '-sales-summary-' : '-purchase-summary-') + A.range()[1] + '.xlsx', [{ name: 'Summary', rows: rows }]);
      });
    };
  }
  A.addSection('ssum', function (arg) { return smHtml('sale', arg); }, smWire('sale'));
  A.addSection('psum', function (arg) { return smHtml('buy', arg); }, smWire('buy'));

  /* ---------- Voucher registers: receipts, payments, journals, contra, credit notes, debit notes ---------- */
  var vrT = 'receipt', vrMode = '';
  var VRT = {
    all: function (d) { return !!B.role(d) || VDOC.test(d.type || '') || d.type === 'stk'; },
    sale: function (d) { return B.role(d) === 'sale'; }, sret: function (d) { return B.role(d) === 'sret'; },
    purchase: function (d) { return B.role(d) === 'buy'; }, pret: function (d) { return B.role(d) === 'pret'; },
    receipt: function (d) { return /^(in|oinc)$/.test(B.role(d)); }, payment: function (d) { return /^(out|outexp|taxpay|refund)$/.test(B.role(d)); },
    contra: function (d) { return d.type === 'contra'; }, journal: function (d) { return B.role(d) === 'jv'; },
    expense: function (d) { return d.type === 'exp' && !(d.items || []).length || B.role(d) === 'exp'; },
    cnote: function (d) { return d.type === 'note' && d.kind !== 'debit'; }, dnote: function (d) { return d.type === 'note' && d.kind === 'debit'; },
    quote: function (d) { return d.type === 'quote'; }, proforma: function (d) { return d.type === 'proforma'; }, so: function (d) { return d.type === 'so'; },
    po: function (d) { return d.type === 'po'; }, challan: function (d) { return d.type === 'challan'; },
    grn: function (d) { return d.type === 'stk' && /^(grn|rejin|rejout)$/.test(d.kind || ''); },
    stj: function (d) { return d.type === 'stk' && /^(move|make|adj|jobout|jobin)$/.test(d.kind || ''); } };
  var VDOC = /^(quote|proforma|so|po|challan)$/;
  var VRN = { all: 'Day book (every voucher)', sale: 'Sales register', sret: 'Sales return register', purchase: 'Purchase register', pret: 'Purchase return register',
    receipt: 'Receipt register', payment: 'Payment register', contra: 'Contra register', journal: 'Journal register', expense: 'Expense register',
    cnote: 'Credit note register', dnote: 'Debit note register', quote: 'Quotation register', proforma: 'Proforma invoice register', so: 'Sales order register',
    po: 'Purchase order register', challan: 'Delivery challan register', grn: 'Goods receipt and returns register', stj: 'Stock journal register' };
  var VRL = { all: 'Every voucher (day book)', sale: 'Sales', sret: 'Sales returns', purchase: 'Purchases', pret: 'Purchase returns', receipt: 'Receipts', payment: 'Payments',
    contra: 'Contra', journal: 'Journals', expense: 'Expenses', cnote: 'Credit notes', dnote: 'Debit notes', quote: 'Quotations', proforma: 'Proforma invoices', so: 'Sales orders',
    po: 'Purchase orders', challan: 'Delivery challans', grn: 'Goods receipts and returns', stj: 'Stock journals' };
  var VRG = [['Accounting vouchers', ['all', 'sale', 'sret', 'purchase', 'pret', 'receipt', 'payment', 'contra', 'journal', 'expense', 'cnote', 'dnote']],
    ['Orders and other documents', ['quote', 'proforma', 'so', 'po', 'challan']], ['Inventory vouchers', ['grn', 'stj']]];
  function vrList() { var r = A.range(); return A.mine().filter(function (d) { return (d.date || '') >= r[0] && (d.date || '') <= r[1] && VRT[vrT](d) && (!vrMode || d.mode === vrMode) && cfOk(d, 'vreg'); }).sort(function (a, b) { return (a.date || '').localeCompare(b.date || '') || String(a.no || '').localeCompare(String(b.no || '')); }); }
  A.addSection('vreg', function () {
    var L = vrList(), CC = cfCols(L), tot = 0, modes = { cash: 'Cash', upi: 'UPI', bank: 'Bank', cheque: 'Cheque', card: 'Card' };
    var bar = '<div class="lg-bar"><label><span>' + esc(T('cr_vtype')) + '</span> <select data-vrt>' + VRG.map(function (g) { return '<optgroup label="' + esc(g[0]) + '">' + g[1].map(function (k) { return '<option value="' + k + '"' + (k === vrT ? ' selected' : '') + '>' + esc(VRL[k]) + '</option>'; }).join('') + '</optgroup>'; }).join('') + '</select></label>' +
      '<label><span>' + esc(T('cr_mode')) + '</span> <select data-vrm><option value="">' + esc(T('all')) + '</option>' + Object.keys(modes).map(function (k) { return '<option value="' + k + '"' + (k === vrMode ? ' selected' : '') + '>' + modes[k] + '</option>'; }).join('') + '</select></label>' + period() + '</div>' + cfBar('vreg', CFT.vreg);
    var body = L.length ? '<table class="tbl st lg-tbl"><thead><tr><th>Date</th><th>Voucher</th><th>Party / account</th><th>Mode</th>' + (CC.length ? NSCF.colHead(CC) : '') + '<th class="n">Amount</th><th class="noprint"></th></tr></thead><tbody>' + L.map(function (d) {
      var a = d.type === 'oinc' ? num(d.amount) : num(A.amountOf(d)); tot += a;   /* other income: the money received, TDS apart (F2-9) */
      return '<tr><td>' + esc(A.ldate(d.date)) + '</td><td>' + esc(A.docName(d) + ' ' + (d.no || '')) + '</td><td>' + esc(B.partyName(d) || d.payer || d.cat || (d.type === 'contra' ? ({ wd: 'Bank to cash', dep: 'Cash to bank', xfer: 'Bank to bank' })[B.contraKind(d)] : '')) + '</td><td>' + esc(modes[d.mode] || d.mode || '') + '</td>' + (CC.length ? NSCF.colCells(CC, d) : '') + '<td class="n">' + money(a, false) + '</td><td class="noprint"><button type="button" class="btn sm ib" data-view="' + d.id + '" title="' + esc(T('open')) + '" aria-label="' + esc(T('open')) + '">' + NS.icSvg('eye') + '</button></td></tr>';
    }).join('') + '</tbody><tfoot><tr><th colspan="' + (4 + CC.length) + '">Total (' + L.length + ')</th><th class="n">' + money(tot, false) + '</th><th class="noprint"></th></tr></tfoot></table>' : '<p class="soft">' + esc(T('none')) + '</p>';
    return '<div class="pane-hd"><h2>' + esc(T('cr_vreg')) + '</h2></div>' + bar + acts('vr') + sheet(VRN[vrT], rng(), body);
  }, function (pane) {
    wirePeriod(pane);
    var t = $('[data-vrt]', pane); if (t) t.addEventListener('change', function () { vrT = t.value; A.show(); });
    var m = $('[data-vrm]', pane); if (m) m.addEventListener('change', function () { vrMode = m.value; A.show(); });
    var pb = $('[data-vrpdf]', pane); if (pb) pb.addEventListener('click', function () { pdf(pane, VRN[vrT] + ' ' + A.range()[1], VRN[vrT]); });
    var xb = $('[data-vrxl]', pane); if (xb) xb.addEventListener('click', function () { var VL = vrList(), CC = cfCols(VL), rows = [[VRN[vrT], A.range()[0] + ' to ' + A.range()[1]], ['Date', 'Voucher', 'Party / account', 'Mode'].concat(CC.map(function (f) { return f.label; }), ['Amount'])]; VL.forEach(function (d) { rows.push([d.date, A.docName(d) + ' ' + (d.no || ''), B.partyName(d) || d.cat || '', d.mode || ''].concat(CC.length ? NSCF.colVals(CC, d) : [], [m2(num(A.amountOf(d)))])); }); NS.xlsx(fileName(A.bizName()) + '-' + vrT + '-register-' + A.range()[1] + '.xlsx', [{ name: 'Register', rows: rows }]); });
  });

  /* ---------- Cash and bank summary: opening, money in, money out and closing for each month ---------- */
  function cbMonths() {
    var r = A.range(), out = [], y = +r[0].slice(0, 4), m = +r[0].slice(5, 7);
    while (true) { var s = y + '-' + String(m).padStart(2, '0'), st = s + '-01', en = new Date(y, m, 0).toISOString ? (y + '-' + String(m).padStart(2, '0') + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0')) : ''; if (st > r[1]) break; out.push([s, st < r[0] ? r[0] : st, en > r[1] ? r[1] : en]); m++; if (m > 12) { m = 1; y++; } if (out.length > 36) break; }
    return out;
  }
  function cbData() {
    var D = A.mine(), biz = A.bizName();
    var BL = A.banks ? A.banks() : [{ k: 'bank' }];   /* every bank account its own table (several banks) */
    return ['cash'].concat(BL.map(function (x) { return x.k; })).map(function (acct) {
      return { acct: acct, rows: cbMonths().map(function (mm) { var b = B.book(D, biz, acct, mm[1], mm[2]), i = 0, o = 0; b.rows.forEach(function (x) { i += x.dr; o += x.cr; }); return { m: mm[0], open: b.open, inn: i, out: o, close: b.close }; }) };
    });
  }
  A.addSection('cbsum', function () {
    var bal = function (v) { return money(Math.abs(v), false) + (v < -0.004 ? ' Cr' : ''); };
    var body = cbData().map(function (a) {
      return '<h3>' + esc(a.acct === 'cash' ? 'Cash in hand' : B.bankName(a.acct)) + '</h3><table class="tbl st lg-tbl"><thead><tr><th>Month</th><th class="n">Opening</th><th class="n">Money in</th><th class="n">Money out</th><th class="n">Closing</th></tr></thead><tbody>' +
        a.rows.map(function (r) { return '<tr data-k="' + r.m + '"><td><a href="#books/' + esc(a.acct) + '?m=' + r.m + '">' + esc(monthName(r.m)) + '</a></td><td class="n">' + bal(r.open) + '</td><td class="n">' + money(r.inn, false) + '</td><td class="n">' + money(r.out, false) + '</td><td class="n"><b>' + bal(r.close) + '</b></td></tr>'; }).join('') + '</tbody></table>';
    }).join('');
    return '<div class="pane-hd"><h2>' + esc(T('cr_cbsum')) + '</h2></div><div class="lg-bar">' + period() + '</div><p class="soft">' + esc(T('cr_h_cb')) + '</p>' + acts('cb') + sheet('Cash and bank summary', rng(), body);
  }, function (pane) {
    wirePeriod(pane);
    var pb = $('[data-cbpdf]', pane); if (pb) pb.addEventListener('click', function () { pdf(pane, 'Cash and bank summary ' + A.range()[1], T('cr_cbsum')); });
    var xb = $('[data-cbxl]', pane); if (xb) xb.addEventListener('click', function () { var rows = [['Cash and bank summary', A.range()[0] + ' to ' + A.range()[1]]]; cbData().forEach(function (a) { rows.push([]); rows.push([a.acct === 'cash' ? 'Cash in hand' : B.bankName(a.acct)]); rows.push(['Month', 'Opening', 'Money in', 'Money out', 'Closing']); a.rows.forEach(function (r) { rows.push([monthName(r.m), m2(r.open), m2(r.inn), m2(r.out), m2(r.close)]); }); }); NS.xlsx(fileName(A.bizName()) + '-cash-bank-summary-' + A.range()[1] + '.xlsx', [{ name: 'Cash and bank', rows: rows }]); });
  });

  /* ---------- Print many vouchers at once: a type and dates; the maker prints them one after another (?printall=from,to) ---------- */
  var mpSite = 'billing';
  var MP = [['billing', 'invoice'], ['cash-memo', 'cashmemo'], ['quotation', 'quote'], ['proforma', 'proforma'], ['sales-order', 'so'], ['challan', 'challan'], ['purchase-order', 'po'],
    ['credit-note', 'note:credit'], ['debit-note', 'note:debit'], ['self-invoice', 'self'], ['receipt', 'receipt'], ['voucher', 'voucher']];
  function mpCount() {
    var r = A.range(), ty = MP.filter(function (x) { return x[0] === mpSite; })[0][1], k = ty.split(':');
    return A.mine().filter(function (d) { return (d.type || 'invoice') === k[0] && (!k[1] || (k[1] === 'debit' ? d.kind === 'debit' : d.kind !== 'debit')) && (d.date || '') >= r[0] && (d.date || '') <= r[1]; }).length;
  }
  A.addSection('mprint', function () {
    var n = mpCount(), nm = function (s) { var a = $('#ns-side .side-g a[data-ic="d-' + s + '"]'); return a ? (a.textContent || '').trim() : s; };
    return '<div class="pane-hd"><h2>' + esc(T('cr_mprint')) + '</h2></div><div class="lg-bar"><label><span>' + esc(T('cr_doctype')) + '</span> <select data-mpsite>' + MP.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === mpSite ? ' selected' : '') + '>' + esc(nm(x[0])) + '</option>'; }).join('') + '</select></label>' + period() + '</div>' +
      '<p class="soft">' + esc(T('cr_h_mp')) + '</p><p><b>' + esc(T('cr_found', { n: n })) + '</b></p><div class="quick"><button type="button" class="btn primary" data-mpgo' + (n ? '' : ' disabled') + '>' + esc(T('cr_printall', { n: n })) + '</button></div>';
  }, function (pane) {
    wirePeriod(pane);
    var s = $('[data-mpsite]', pane); if (s) s.addEventListener('change', function () { mpSite = s.value; A.show(); });
    var g = $('[data-mpgo]', pane); if (g) g.addEventListener('click', function () { var r = A.range(), u = A.toolUrl(mpSite) + '?printall=' + r[0] + ',' + r[1]; if (!A.openUrl(u)) location.href = u; });
  });

  /* ---------- Ledger of any account (cash, bank, sales, an expense head, GST, capital...): opened from the Chart of Accounts and the Trial Balance ---------- */
  function aclName(k) { return A.accName ? A.accName(k, {}) : k; }
  var aclView = 'vch';
  /* #acl/<account>, #acl/<account>?m=2026-10 (one month of it, from the monthly summary) */
  function aclArg(arg) {
    var p = String(arg || 'cash').split('?'), k = p[0] || 'cash', m = (/(?:^|&)m=(\d{4}-\d{2})/.exec(p[1] || '') || [])[1] || '', r = A.range();
    if (m) r = [m + '-01' < r[0] ? r[0] : m + '-01', NSRep.monthEnd(m) > r[1] ? r[1] : NSRep.monthEnd(m)];
    return { k: k, m: m, r: r };
  }
  A.addSection('acl', function (arg) {
    var X = aclArg(arg), k = X.k, r = X.r;
    if (k.indexOf('p:') === 0) { setTimeout(function () { location.replace('#st/' + encodeURIComponent(k.slice(2))); }, 0); return ''; }
    var Bk = B.book(A.mine(), A.bizName(), k, r[0], r[1]), bal = function (v) { return money(Math.abs(v), false) + (v > 0.004 ? ' Dr' : v < -0.004 ? ' Cr' : ''); }, td = 0, tc = 0, mon = aclView === 'mon' && !X.m && window.NSRep, body;
    if (mon) {
      var M = NSRep.monthly(Bk, r[0], r[1]);
      body = '<table class="tbl st lg-tbl"><thead><tr><th>Month</th><th class="n">Opening</th><th class="n">Debit</th><th class="n">Credit</th><th class="n">Closing</th></tr></thead><tbody>' +
        M.map(function (x) { td += x.dr; tc += x.cr; return '<tr data-k="' + x.m + '"><td><a href="#acl/' + encodeURIComponent(k) + '?m=' + x.m + '">' + esc(monthName(x.m)) + '</a>' + (x.n ? ' <span class="soft">(' + x.n + ')</span>' : '') + '</td><td class="n">' + bal(x.open) + '</td><td class="n">' + (x.dr ? money(x.dr, false) : '') + '</td><td class="n">' + (x.cr ? money(x.cr, false) : '') + '</td><td class="n"><b>' + bal(x.close) + '</b></td></tr>'; }).join('') +
        '</tbody><tfoot><tr><th>Total</th><th class="n">' + bal(Bk.open) + '</th><th class="n">' + money(td, false) + '</th><th class="n">' + money(tc, false) + '</th><th class="n">' + bal(Bk.close) + '</th></tr></tfoot></table>';
    } else body = '<table class="tbl st lg-tbl"><thead><tr><th>Date</th><th>Particulars</th><th>Voucher</th><th class="n">Debit</th><th class="n">Credit</th><th class="n">Balance</th><th class="noprint"></th></tr></thead><tbody><tr><td>' + esc(A.ldate(r[0])) + '</td><td colspan="2"><i>Opening balance</i></td><td></td><td></td><td class="n">' + bal(Bk.open) + '</td><td class="noprint"></td></tr>' +
      Bk.rows.map(function (x) { td += x.dr; tc += x.cr; var d = x.d, nr = narrOf(d); return '<tr data-k="' + esc(d.id) + '"><td>' + esc(A.ldate(x.date)) + '</td><td>' + esc(oppText(d, k) || (B.partyName(d) || '')) + (nr ? '<br><span class="soft lg-narr">' + esc(nr) + '</span>' : '') + '</td><td>' + esc(A.docName(d) + ' ' + (d.no || '') + (B.partyName(d) ? ' · ' + B.partyName(d) : '')) + '</td><td class="n">' + (x.dr ? money(x.dr, false) : '') + '</td><td class="n">' + (x.cr ? money(x.cr, false) : '') + '</td><td class="n">' + bal(x.bal) + '</td><td class="noprint"><button type="button" class="btn sm ib" data-view="' + d.id + '" title="' + esc(T('open')) + '" aria-label="' + esc(T('open')) + '">' + NS.icSvg('eye') + '</button></td></tr>'; }).join('') +
      '</tbody><tfoot><tr><th colspan="3">Total</th><th class="n">' + money(td, false) + '</th><th class="n">' + money(tc, false) + '</th><th class="n">' + bal(Bk.close) + '</th><th class="noprint"></th></tr></tfoot></table>';
    var sw = window.NSRep && !X.m ? seg('aclv', [['vch', NS.t('rp.vch')], ['mon', NS.t('rp.mon')]], aclView) : '';
    var one = X.m ? '<p class="note">' + esc(NS.t('rp.onemonth', { m: monthName(X.m) })) + ' <a href="#acl/' + encodeURIComponent(k) + '">' + esc(NS.t('rp.wholeper')) + ' ›</a></p>' : '';
    return '<div class="pane-hd"><h2>' + esc(T('cr_acl')) + ': ' + esc(aclName(k)) + '</h2>' + sw + '</div><p class="cr-drill"><a href="#coa">' + esc(T('cr_coa')) + '</a> › <b>' + esc(aclName(k)) + '</b></p>' + one + '<div class="lg-bar">' + period() + '</div>' + acts('acl') +
      sheet((mon ? 'Monthly summary: ' : 'Ledger: ') + aclName(k), esc(A.ldate(r[0])) + ' to ' + esc(A.ldate(r[1])), body);
  }, function (pane, arg) {
    wirePeriod(pane);
    $$('[data-aclv]', pane).forEach(function (b) { b.addEventListener('click', function () { aclView = b.getAttribute('data-aclv'); A.show(); }); });
    var X = aclArg(arg), k = X.k;
    var pb = $('[data-aclpdf]', pane); if (pb) pb.addEventListener('click', function () { pdf(pane, 'Ledger ' + aclName(k) + ' ' + A.range()[1], T('cr_acl')); });
    var xb = $('[data-aclxl]', pane); if (xb) xb.addEventListener('click', function () { var r = X.r, Bk = B.book(A.mine(), A.bizName(), k, r[0], r[1]), rows = [['Ledger: ' + aclName(k), r[0] + ' to ' + r[1]], ['Date', 'Particulars', 'Voucher', 'Debit', 'Credit', 'Balance', 'Narration'], [r[0], 'Opening balance', '', '', '', m2(Bk.open)]]; Bk.rows.forEach(function (x) { rows.push([x.date, oppText(x.d, k), A.enName(x.d) + ' ' + (x.d.no || ''), x.dr ? m2(x.dr) : '', x.cr ? m2(x.cr) : '', m2(x.bal), narrOf(x.d)]); }); NS.xlsx(fileName(aclName(k)) + '-ledger-' + r[1] + '.xlsx', [{ name: 'Ledger', rows: rows }]); });
  });
  /* open bills with the party's credit days applied (as on the Dues screen), so ageing counts from the due date */
  function dueBills(D, biz) {
    var C = A.data();
    return B.bills(D, biz).bills.map(function (b) {
      var pm = C.party.filter(function (p) { return key(p.name) === key(b.party); })[0] || {};
      return b.due || !num(pm.cdays) ? b : Object.assign({}, b, { due: B.addDays(b.date, num(pm.cdays)) });
    });
  }
  /* every group report in one Excel file, English headers */
  function groupExcel() {
    var G = A.groups(), r = A.range(), D = A.mine(), biz = A.bizName(), P = B.parties(D, biz), today = NS.today(), sel = A.grp();
    var gid = function (k) { return A.gidOf(k, P); }, en = function (g) { return B.BUILTIN[g.id] || g.name; }, ind = function (g) { return new Array(g.depth + 1).join('    '); };
    var inSel = function (g) { return !sel || B.inGroup(g.id, sel, G); };
    var sum = [['Group / party', 'Opening', 'Dr/Cr', 'Debit', 'Credit', 'Closing', 'Dr/Cr']], dc = function (v) { return v > 0.004 ? 'Dr' : v < -0.004 ? 'Cr' : ''; };
    B.groupSummary(B.partyMoves(D, biz, r[0], r[1]), gid, G).filter(function (g) { return g.sum.n && inSel(g); }).forEach(function (g) {
      sum.push([ind(g) + en(g) + ' (total)', Math.abs(g.sum.open), dc(g.sum.open), g.sum.dr, g.sum.cr, Math.abs(g.sum.close), dc(g.sum.close)]);
      g.rows.forEach(function (x) { sum.push([ind(g) + '    ' + x.name, Math.abs(x.open), dc(x.open), x.dr, x.cr, Math.abs(x.close), dc(x.close)]); });
    });
    var out = function (s) {
      return [['Group', '0-30 days', '31-60 days', '61-90 days', 'Over 90 days', 'Total due']].concat(B.groupDues(dueBills(D, biz), gid, G, today, true)
        .filter(function (g) { return (s === 'pay' ? g.pt : g.rt) > 0.004 && inSel(g); }).map(function (g) { var a = s === 'pay' ? g.pay : g.recv; return [ind(g) + en(g)].concat(a).concat([s === 'pay' ? g.pt : g.rt]); }));
    };
    var gm = {}; B.groupTree(G).forEach(function (g) { gm[g.id] = g; });
    var top = [['Rank by', 'Party', 'Group', 'Amount']];
    ['sales', 'buys', 'recv', 'pay'].forEach(function (by) {
      B.topParties(B.partyMoves(D, biz, by === 'recv' || by === 'pay' ? '' : r[0], r[1]), by, 20, function (k) { return A.grpKeep(k, P); }).forEach(function (x) {
        top.push([{ sales: 'Sales', buys: 'Purchases', recv: 'They owe us', pay: 'We owe them' }[by], x.name, en(gm[gid(x.key)] || { id: 'debtors' }), x.value]);
      });
    });
    NS.xlsx(fileName(biz) + '-group-reports-' + r[0] + '-to-' + r[1] + '.xlsx', [{ name: 'Group summary', rows: sum }, { name: 'Outstanding receivable', rows: out('recv') }, { name: 'Outstanding payable', rows: out('pay') }, { name: 'Top parties', rows: top }].concat(A.routeRows ? [{ name: 'Route-wise receivable', rows: A.routeRows('recv', dueBills(D, biz), today, P) }, { name: 'Route-wise payable', rows: A.routeRows('pay', dueBills(D, biz), today, P) }] : []));
  }

  /* the menu link (the full App only; door sites keep their own short menu) */
  function menu() {
    var nav = $('.hub-nav'), app = $('#app'); if (!nav || !app || app.getAttribute('data-secs') || $('[data-sec="grp"]', nav)) return;
    var after = $('[data-sec="parties"]', nav), a = NS.el('a', { href: '#grp', 'data-sec': 'grp' }, '<span>' + esc(T('grp')) + '</span>');
    if (after && after.nextSibling) nav.insertBefore(a, after.nextSibling); else nav.appendChild(a);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', menu); else menu();
})();

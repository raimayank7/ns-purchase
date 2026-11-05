/* Party ledger and group reports of the Nivesh Sahayak App (after app.js; Party Ledger plan, Steps B and C).
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
  var view = 'all', types = [], withStmt = true, gtab = 'sum', gside = 'recv', topBy = 'sales';

  /* ---------- shared bits ---------- */
  function presets(today) {
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
  function pdf(pane, name, title) {
    var nodes = $$('.lg-print > .stsheet', pane).map(function (n) { var c = n.cloneNode(true); c.classList.add('lg-paper'); return c; });
    NS.sharePdf(nodes, name, 'a4', title, '');
  }

  /* ---------- the party ledger ---------- */
  A.addSection('st', function (k) {
    var p = partyOf(k), r = A.range(), today = NS.today(), G = A.groups(), g = B.groupTree(G).filter(function (x) { return x.id === A.gidOf(k); })[0];
    var line = p.bal > 0.004 ? T('theyowe', { p: p.name, a: money(p.bal) }) : p.bal < -0.004 ? T('weowe', { p: p.name, a: money(-p.bal) }) : T('settled', { p: p.name });
    var body = view === 'bills' ? billsSheet(k, p, r) : view === 'letter' ? letterSheets(k, p, r) : ledgerSheet(k, p, r, types);
    return '<p><a href="#parties" class="link">' + esc(T('back')) + '</a></p><div class="pane-hd"><h2>' + esc(p.name) + (g ? ' <small class="pill">' + esc(A.gname(g)) + '</small>' : '') + '</h2><div class="quick">' +
        (p.bal > 0.004 ? '<button type="button" class="btn wa" data-wa="' + esc(k) + '">' + esc(T('remind')) + '</button>' : '') +
        '<button type="button" class="btn" data-form="' + (p.bal < 0 ? 'mout' : 'min') + '" data-party="' + esc(p.name) + '">' + esc(T('recpay')) + '</button></div></div>' +
      '<p class="big">' + esc(line) + '</p>' +
      seg('lgview', [['all', T('lg_all')], ['bills', T('lg_bills')], ['letter', T('lg_letter')]], view) +
      period() +
      (view === 'all' ? '<div class="lg-vt" role="group" aria-label="' + esc(T('lg_vt')) + '"><span class="soft">' + esc(T('lg_vt')) + '</span> <button type="button" class="btn sm" data-vt="" aria-pressed="' + !types.length + '">' + esc(T('all')) + '</button>' +
        VT.map(function (v) { return '<button type="button" class="btn sm" data-vt="' + v + '" aria-pressed="' + (types.indexOf(v) >= 0) + '">' + esc(T('lg_vt_' + v)) + '</button>'; }).join('') + '</div>' +
        (types.length ? '<p class="soft">' + esc(T('lg_filtered')) + '</p>' : '') : '') +
      (view === 'bills' ? '<p class="soft">' + esc(T('lg_billsh', { d: A.ldate(r[1]) })) + '</p>' : '') +
      (view === 'letter' ? '<p class="soft">' + esc(T('lg_letterh', { p: p.name, d: A.ldate(r[1]) })) + '</p><label class="chk"><input type="checkbox" data-withst' + (withStmt ? ' checked' : '') + '> ' + esc(T('lg_stmt')) + '</label>' : '') +
      '<div class="quick lg-acts"><button type="button" class="btn" data-print>' + esc(T('print')) + '</button><button type="button" class="btn" data-lgpdf>' + esc(T('pdf')) + '</button>' +
        (view !== 'letter' ? '<button type="button" class="btn" data-lgxl>' + esc(T('lg_xl')) + '</button><button type="button" class="btn wa" data-lgwa>' + esc(T('lg_wa')) + '</button>' : '') + '</div>' +
      '<div class="tbl-wrap"><div class="lg-print">' + body + '</div></div>' +
      '<h3>' + esc(T('recent')) + '</h3>' + A.rowsHtml(A.mine().filter(function (d) { return B.partiesOf(d)[k] && B.role(d); }).sort(A.byDate).slice(0, 30), { left: A.leftMap(A.mine()) });
  }, function (pane, k) {
    wirePeriod(pane);
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
      pdf(pane, (view === 'letter' ? 'Balance confirmation ' : view === 'bills' ? 'Bill-wise ' : 'Ledger ') + p.name + ' ' + r[1], view === 'letter' ? 'Balance confirmation' : 'Party ledger');
    });
    var xb = $('[data-lgxl]', pane); if (xb) xb.addEventListener('click', function () { excel(k, p, r); });
    var wb = $('[data-lgwa]', pane); if (wb) wb.addEventListener('click', function () { waLedger(k, p, r); });
  });

  function ledgerSheet(k, p, r, vt) {
    var S = B.ledger(A.mine(), A.bizName(), k, r[0], r[1], vt);
    return '<div class="stsheet sh" dir="ltr" data-sheet>' + bizHead('PARTY LEDGER', '<br>' + esc(p.name) + addrLines(p.rec) + '<br>' + A.ldate(r[0]) + ' to ' + A.ldate(r[1]) +
        (vt && vt.length ? '<br><span class="soft">Only: ' + esc(vt.map(function (v) { return VTEN[v]; }).join(', ')) + '</span>' : '')) +
      '<table class="tbl st lg-tbl"><thead><tr><th>Date</th><th>Voucher type</th><th>Voucher no.</th><th class="n">Debit</th><th class="n">Credit</th><th class="n">Balance</th></tr></thead><tbody>' +
      '<tr class="lg-ob"><td>' + A.ldate(r[0]) + '</td><td colspan="2">Opening balance</td><td class="n"></td><td class="n"></td><td class="n">' + enBal(S.open) + '</td></tr>' +
      S.rows.map(function (x) {
        return '<tr><td>' + A.ldate(x.date) + '</td><td>' + esc(A.enName(x.d)) + (x.d.ref ? ' <span class="soft">(' + esc(x.d.ref) + ')</span>' : '') + '</td><td>' + esc(x.d.no || x.d.billNo || '') + '</td>' +
          '<td class="n">' + (x.dr ? money(x.dr, false) : '') + '</td><td class="n">' + (x.cr ? money(x.cr, false) : '') + '</td><td class="n">' + enBal(x.bal) + '</td></tr>'; }).join('') +
      (S.rows.length ? '' : '<tr><td colspan="6" class="soft">No entries in this period.</td></tr>') +
      '</tbody><tfoot><tr><th colspan="3">Total</th><th class="n">' + money(S.dr, false) + '</th><th class="n">' + money(S.cr, false) + '</th><th></th></tr>' +
      '<tr><th colspan="3">Closing balance on ' + A.ldate(r[1]) + '</th><th class="n"></th><th class="n"></th><th class="n">' + enBal(S.close) + '</th></tr></tfoot></table>' +
      '<p class="st-ft">Made with the Nivesh Sahayak App on ' + A.ldate(NS.today()) + '. Dr = amount due to ' + esc(A.bizName()) + '; Cr = amount due from ' + esc(A.bizName()) + '.</p></div>';
  }
  var VTEN = { sales: 'Sales', receipts: 'Money received', notes: 'Credit and debit notes', purchases: 'Purchases', payments: 'Payments', journal: 'Journal', opening: 'Opening balance' };

  function billsSheet(k, p, r) {
    var W = B.billwise(A.mine(), A.bizName(), k, r[1]), sides = ['recv', 'pay'].filter(function (s) { return W.bills.some(function (b) { return b.side === s; }); });
    var tbl = function (s) {
      var L = W.bills.filter(function (b) { return b.side === s; });
      return '<h4 class="lg-h">' + (s === 'recv' ? 'Bills to receive' : 'Bills to pay') + '</h4><table class="tbl st lg-tbl"><thead><tr><th>Date</th><th>Bill</th><th class="n">Amount</th><th>Settled by</th><th class="n">Still due</th><th class="n">Days</th></tr></thead><tbody>' +
        L.map(function (b) {
          return '<tr><td>' + A.ldate(b.date) + '</td><td>' + esc(A.enName(b)) + ' ' + esc(b.no) + (b.due ? '<br><span class="soft">Due ' + A.ldate(b.due) + '</span>' : '') + '</td><td class="n">' + money(b.total, false) + '</td>' +
            '<td class="lg-by">' + (b.by.length ? b.by.map(function (x) { return esc(x.type === 'paid' ? 'Paid on the bill' : A.enName(x) + ' ' + (x.no || '')) + (x.adv ? ' (advance)' : '') + ' <span class="soft">' + A.ldate(x.date) + '</span> ' + money(x.amt, false); }).join('<br>') : '—') + '</td>' +
            '<td class="n">' + (b.left > 0.004 ? '<b>' + money(b.left, false) + '</b>' : 'Paid') + '</td><td class="n">' + (b.left > 0.004 ? B.daysBetween(b.date, r[1]) : '') + '</td></tr>'; }).join('') +
        '</tbody><tfoot><tr><th colspan="2">Total</th><th class="n">' + money(L.reduce(function (a, b) { return a + b.total; }, 0), false) + '</th><th></th><th class="n">' + money(W.due[s], false) + '</th><th></th></tr></tfoot></table>' +
        (W.advances[s] > 0.004 ? '<p>Advance not used yet: <b>' + money(W.advances[s]) + '</b></p>' : '');
    };
    return '<div class="stsheet sh" dir="ltr" data-sheet>' + bizHead('BILL-WISE DETAILS', '<br>' + esc(p.name) + addrLines(p.rec) + '<br>As on ' + A.ldate(r[1])) +
      (sides.length ? sides.map(tbl).join('') : '<p>No bills up to this date.</p>') +
      '<p class="st-ft">Made with the Nivesh Sahayak App on ' + A.ldate(NS.today()) + '. Money is set against the bills it names first, then against the oldest bill.</p></div>';
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
    var led = [['Date', 'Voucher type', 'Voucher no.', 'Reference', 'Debit', 'Credit', 'Balance', 'Dr/Cr'], [r[0], 'Opening balance', '', '', '', '', Math.abs(S.open), dc(S.open)]]
      .concat(S.rows.map(function (x) { return [x.date, A.enName(x.d), x.d.no || x.d.billNo || '', x.d.ref || '', x.dr || '', x.cr || '', Math.abs(x.bal), dc(x.bal)]; }))
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
    var hd = '<div class="pane-hd"><h2>' + esc(T('grp')) + '</h2>' + seg('gtab', [['sum', T('lg_sum')], ['out', T('lg_out')], ['top', T('lg_top')]], gtab) + '</div>' +
      '<div class="tools-row">' + A.grpSel() + (gtab === 'out' ? seg('gside', [['recv', T('recv')], ['pay', T('pay')]], gside) : gtab === 'top' ? '<label><span>' + esc(T('lg_by')) + '</span> <select data-topby>' +
        ['sales', 'buys', 'recv', 'pay'].map(function (x) { return '<option value="' + x + '"' + (x === topBy ? ' selected' : '') + '>' + esc(T('lg_by_' + x)) + '</option>'; }).join('') + '</select></label>' : '') + '</div>' +
      (gtab !== 'out' ? period() : '') +
      '<p class="soft">' + esc(T('lg_' + gtab + 'h')) + '</p>' +
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
    } else {
      var M = B.partyMoves(D, biz, topBy === 'recv' || topBy === 'pay' ? '' : r[0], r[1]), gm = {}; B.groupTree(G).forEach(function (g) { gm[g.id] = g; });
      var top = B.topParties(M, topBy, 20, function (k) { return A.grpKeep(k, P); });
      body = top.length ? '<table class="tbl st lg-tbl"><thead><tr><th class="n">#</th><th>' + esc(T('party')) + '</th><th>' + esc(T('lg_group')) + '</th><th class="n">' + esc(T('lg_by_' + topBy)) + '</th></tr></thead><tbody>' +
        top.map(function (x, i) { var g = gm[gid(x.key)]; return '<tr><td class="n">' + (i + 1) + '</td><td><a href="#st/' + encodeURIComponent(x.key) + '">' + esc(x.name) + '</a></td><td>' + (g ? esc(A.gname(g)) : '') + '</td><td class="n">' + money(x.value, false) + '</td></tr>'; }).join('') +
        '</tbody></table>' : '<p class="soft">' + esc(T('none')) + '</p>';
    }
    var sub = gtab === 'out' ? T(gside) + ' · ' + A.ldate(today) : A.ldate(r[0]) + ' – ' + A.ldate(r[1]);
    return hd + (own ? '' : '<p class="note">' + esc(T('lg_nogroups')) + ' <a href="' + A.myUrl('#party') + '">' + esc(NS.t('my.t.party')) + ' ›</a></p>') +
      '<div class="tbl-wrap"><div class="lg-print"><div class="stsheet sh lg-rep" data-sheet>' + bizHead(T('lg_' + gtab), '<br>' + esc(sub) + (sel ? '<br>' + esc(T('lg_group')) + ': ' + esc(A.gname(B.groupTree(G).filter(function (g) { return g.id === sel; })[0] || { id: sel, name: sel })) : '')) + body + '</div></div></div>';
  }, function (pane) {
    wirePeriod(pane);
    $$('[data-gtab]', pane).forEach(function (b) { b.addEventListener('click', function () { gtab = b.getAttribute('data-gtab'); A.show(); }); });
    $$('[data-gside]', pane).forEach(function (b) { b.addEventListener('click', function () { gside = b.getAttribute('data-gside'); A.show(); }); });
    var tb = $('[data-topby]', pane); if (tb) tb.addEventListener('change', function () { topBy = tb.value; A.show(); });
    $$('[data-gopen]', pane).forEach(function (a) { a.addEventListener('click', function () { A.grp(a.getAttribute('data-gopen')); }); });
    var pb = $('[data-lgpdf]', pane); if (pb) pb.addEventListener('click', function () { pdf(pane, T('lg_' + gtab) + ' ' + A.range()[1], T('lg_' + gtab)); });
    var xb = $('[data-gxl]', pane); if (xb) xb.addEventListener('click', groupExcel);
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
    NS.xlsx(fileName(biz) + '-group-reports-' + r[0] + '-to-' + r[1] + '.xlsx', [{ name: 'Group summary', rows: sum }, { name: 'Outstanding receivable', rows: out('recv') }, { name: 'Outstanding payable', rows: out('pay') }, { name: 'Top parties', rows: top }]);
  }

  /* the menu link (the full App only; door sites keep their own short menu) */
  function menu() {
    var nav = $('.hub-nav'), app = $('#app'); if (!nav || !app || app.getAttribute('data-secs') || $('[data-sec="grp"]', nav)) return;
    var after = $('[data-sec="parties"]', nav), a = NS.el('a', { href: '#grp', 'data-sec': 'grp' }, '<span>' + esc(T('grp')) + '</span>');
    if (after && after.nextSibling) nav.insertBefore(a, after.nextSibling); else nav.appendChild(a);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', menu); else menu();
})();

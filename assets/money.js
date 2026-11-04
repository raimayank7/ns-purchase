/* Money door sites (khata., purchase., expenses., cheque., cash-book.): extra sections of the Nivesh Sahayak App.
   They read the same records as app.niveshsahayak.in through NSApp (app.js) and NSBooks (books.js), so nothing is stored twice:
     khata   customers who owe you: totals, quick credit sale / money received, top dues with WhatsApp and statement
     preg    purchase register: purchase bills, returns and self invoices with GST between two dates; debit note for a return
     ebook   expense book: expenses by type and month for a financial year (GST claimed as input tax credit left out)
     chq     cheque register: received and given cheques, post-dated ones, status hand / deposited / issued / cleared / bounced
     books   cash book, bank book and day book (journal) between two dates
   The printed sheets (registers, books, debit note) stay in English like every document; the screen around them is translated. */
(function () {
  'use strict';
  var A = window.NSApp; if (!A) return;
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, num = NS.num, r2 = NS.r2, money = NS.money, B = NSBooks, key = B.key, T = A.T;
  function m(v) { return v ? money(v, false) : ''; }
  function csvCell(v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function download(name, rows) {
    var a = NS.el('a', { href: URL.createObjectURL(new Blob(['﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n')], { type: 'text/csv;charset=utf-8' })), download: name });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function biz() { return A.biz() || {}; }
  function head(title, sub) {
    var b = biz();
    return '<div class="st-hd"><div><b>' + esc(b.name) + '</b>' + (b.addr ? '<br>' + esc(b.addr).replace(/\n/g, '<br>') : '') + (b.gstin ? '<br>GSTIN ' + esc(b.gstin) : '') + '</div>' +
      '<div class="r"><b>' + esc(title) + '</b><br>' + esc(sub) + '</div></div>';
  }
  function foot() { return '<p class="st-ft">Made with Nivesh Sahayak on ' + A.ldate(NS.today()) + '.</p>'; }
  function dates() {
    var r = A.range();
    return '<div class="tools-row"><label>' + esc(T('from')) + ' <input type="date" data-stfrom value="' + r[0] + '"></label><label>' + esc(T('to')) + ' <input type="date" data-stto value="' + r[1] + '"></label></div>';
  }
  function outBtns() {
    return '<button type="button" class="btn" data-m-print>' + esc(T('print')) + '</button><button type="button" class="btn" data-m-pdf>' + esc(T('pdf')) + '</button><button type="button" class="btn" data-m-csv>' + esc(T('csv')) + '</button>';
  }
  var CSV = null, PDFNAME = '';
  function wireOut(pane) {
    var p = $('[data-m-print]', pane), f = $('[data-m-pdf]', pane), c = $('[data-m-csv]', pane);
    if (p) p.addEventListener('click', function () { window.print(); });
    if (f) f.addEventListener('click', function () { NS.sharePdf($$('[data-sheet]', pane), PDFNAME, 'a4', PDFNAME, ''); });
    if (c) c.addEventListener('click', function () { if (CSV) download(PDFNAME.replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').toLowerCase() + '.csv', CSV); });
  }

  /* ---------- khata: customers who owe you ---------- */
  A.addSection('khata', function () {
    var D = A.mine(), today = NS.today(), R = B.bills(D, A.bizName()), P = B.parties(D, A.bizName()), by = {};
    R.bills.filter(function (b) { return b.side === 'recv'; }).forEach(function (b) { var k = key(b.party); (by[k] = by[k] || { k: k, name: b.party, list: [] }).list.push(b); });
    var rows = Object.keys(by).map(function (k) { var a = B.ageing(by[k].list, today); by[k].a = a; by[k].tot = r2(a[0] + a[1] + a[2] + a[3]); by[k].old = by[k].list.reduce(function (x, b) { return b.date < x ? b.date : x; }, today); return by[k]; })
      .sort(function (a, b) { return b.tot - a.tot; });
    var tot = r2(rows.reduce(function (a, r) { return a + r.tot; }, 0)), late = r2(rows.reduce(function (a, r) { return a + r.a[2] + r.a[3]; }, 0));
    var month = today.slice(0, 7), got = r2(D.filter(function (d) { return B.role(d) === 'in' && (d.date || '').slice(0, 7) === month; }).reduce(function (a, d) { return a + num(d.amount); }, 0));
    return '<div class="pane-hd"><h2>' + esc(T('khata')) + ' <small class="soft">' + esc(A.bizName()) + '</small></h2></div>' +
      '<div class="tiles"><a class="tile" href="#dues"><span>' + esc(T('recv')) + '</span><b>' + money(tot) + '</b></a><a class="tile' + (late ? ' warn' : '') + '" href="#dues"><span>' + esc(T('late60')) + '</span><b>' + money(late) + '</b></a>' +
        '<div class="tile"><span>' + esc(T('gotmon')) + '</span><b>' + money(got) + '</b></div><a class="tile" href="#parties"><span>' + esc(T('kcust')) + '</span><b>' + rows.length + '</b></a></div>' +
      '<div class="card"><h3>' + esc(T('quick')) + '</h3><div class="quick"><button type="button" class="btn primary" data-form="csale">+ ' + esc(T('csale')) + '</button>' +
        '<button type="button" class="btn" data-form="min">+ ' + esc(T('min')) + '</button><button type="button" class="btn" data-form="ob">+ ' + esc(T('ob')) + '</button>' +
        '<a class="btn" href="' + A.toolUrl('billing') + '">+ ' + esc(T('newinv')) + '</a></div></div>' +
      '<div class="card"><h3>' + esc(T('top')) + '</h3>' + (rows.length ? '<ul class="rows">' + rows.slice(0, 12).map(function (r) {
        return '<li><a href="#st/' + encodeURIComponent(r.k) + '"><b>' + esc(r.name) + '</b><span class="soft">' + esc(T('since', { d: A.ldate(r.old), n: B.daysBetween(r.old, today) })) + '</span></a><b class="amt">' + money(r.tot) + '</b>' +
          '<div class="acts"><button type="button" class="btn sm wa" data-wa="' + esc(r.k) + '">' + esc(T('remind')) + '</button><a class="btn sm" href="#st/' + encodeURIComponent(r.k) + '">' + esc(T('stmt')) + '</a>' +
          '<button type="button" class="btn sm" data-form="min" data-party="' + esc(r.name) + '">' + esc(T('recpay')) + '</button></div></li>'; }).join('') + '</ul>' + (rows.length > 12 ? '<p><a href="#dues">' + esc(T('more')) + ' ›</a></p>' : '')
        : '<p class="soft">' + esc(T('nodues')) + '</p>') + '</div>' +
      '<details class="card"><summary><b>' + esc(T('help')) + '</b></summary><p>' + esc(T('khh')) + '</p></details>';
  });

  /* ---------- purchase register ---------- */
  function purchases() {
    var r = A.range();
    return A.mine().filter(function (d) { return (d.type === 'pbill' || d.type === 'self') && d.date >= r[0] && d.date <= r[1]; }).filter(A.match).sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
  }
  A.addSection('preg', function () {
    var r = A.range(), list = purchases(), S = { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
    CSV = [['Date', 'Supplier', 'Supplier GSTIN', 'Type', 'Bill no.', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Total']];
    var body = list.map(function (d) {
      var t = B.itemTotals(d), sg = d.type === 'pbill' && d.kind === 'return' ? -1 : 1, tot = d.type === 'self' ? r2(t.taxable + t.cgst + t.sgst + t.igst) : t.total;
      ['taxable', 'cgst', 'sgst', 'igst'].forEach(function (k) { S[k] = r2(S[k] + sg * t[k]); }); S.total = r2(S.total + sg * tot);
      var ty = d.type === 'self' ? 'Self invoice (RCM)' : sg < 0 ? 'Return' : 'Bill', sup = B.partyName(d), g = d.buyer && d.buyer.gstin || '';
      CSV.push([d.date, sup, g, ty, d.no || '', sg * t.taxable, sg * t.cgst, sg * t.sgst, sg * t.igst, sg * tot]);
      var acts = (d.type === 'pbill' ? '<button type="button" class="btn sm" data-edit="' + d.id + '">' + esc(T('edit')) + '</button>' : '<a class="btn sm" href="' + A.toolUrl('self-invoice') + '?open=' + encodeURIComponent(d.id) + '">' + esc(T('open')) + '</a>') +
        (d.photo ? '<button type="button" class="btn sm" data-photo="' + d.id + '">' + esc(T('photo')) + '</button>' : '') +
        (sg < 0 ? '<button type="button" class="btn sm" data-dn="' + d.id + '">' + esc(T('dn')) + '</button>' : '');
      return '<tr><td>' + A.ldate(d.date) + '</td><td>' + esc(sup) + (g ? '<br><span class="soft mono">' + esc(g) + '</span>' : '') + '</td><td>' + esc(ty) + ' ' + esc(d.no || '') + '<div class="acts no-print">' + acts + '</div></td>' +
        ['taxable', 'cgst', 'sgst', 'igst'].map(function (k) { return '<td class="n">' + m(sg * t[k]) + '</td>'; }).join('') + '<td class="n"><b>' + m(sg * tot) + '</b></td></tr>';
    }).join('');
    PDFNAME = 'Purchase register ' + r[0] + ' to ' + r[1];
    return '<div class="pane-hd"><h2>' + esc(T('preg')) + '</h2><div class="quick"><button type="button" class="btn primary" data-form="pbill">+ ' + esc(T('pbill')) + '</button><button type="button" class="btn" data-form="pret">+ ' + esc(T('pret')) + '</button></div></div>' +
      '<p class="soft">' + esc(T('pregh')) + '</p>' + dates() + A.searchBar() + '<div class="quick">' + outBtns() + '</div>' +
      '<div class="tbl-wrap"><div class="stsheet sh wide" data-sheet>' + head('PURCHASE REGISTER', A.ldate(r[0]) + ' to ' + A.ldate(r[1])) +
      '<table class="tbl st"><thead><tr><th>Date</th><th>Supplier</th><th>Bill</th><th class="n">Taxable</th><th class="n">CGST</th><th class="n">SGST</th><th class="n">IGST</th><th class="n">Total</th></tr></thead><tbody>' +
      (body || '<tr><td colspan="8">' + esc(T('none')) + '</td></tr>') + '</tbody><tfoot><tr><th colspan="3">Total (' + list.length + ')</th>' +
      ['taxable', 'cgst', 'sgst', 'igst', 'total'].map(function (k) { return '<th class="n">' + money(S[k], false) + '</th>'; }).join('') + '</tr></tfoot></table>' +
      '<p class="st-ft">Returns are shown as minus amounts. Self invoices (reverse charge): GST is paid by you and claimed back as input tax credit.</p>' + foot() + '</div></div>';
  }, function (pane) {
    wireOut(pane);
    $$('[data-dn]', pane).forEach(function (b) { b.addEventListener('click', function () { debitNote(b.getAttribute('data-dn')); }); });
  });

  /* a purchase return printed as the buyer's debit note to the supplier (a business document; under GST the supplier's credit note is the tax document) */
  function debitNote(id) {
    var d = A.data().doc.filter(function (x) { return x.id === id; })[0]; if (!d) return;
    var t = B.itemTotals(d), b = d.seller || {}, s = d.buyer || {}, rows = (d.items || []).filter(function (it) { return it.desc || num(it.rate); });
    var w = window.open('', '_blank'); if (!w) return;
    w.document.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Debit note ' + esc(d.no || '') + '</title><style>' +
      'body{font:14px/1.45 system-ui,Segoe UI,Arial,sans-serif;color:#111;margin:24px}h1{font-size:20px;text-align:center;margin:0 0 14px;letter-spacing:.06em}' +
      '.two{display:flex;justify-content:space-between;gap:24px;margin-bottom:12px}table{border-collapse:collapse;width:100%;margin:10px 0}th,td{border:1px solid #999;padding:5px 7px;text-align:left}' +
      'th{background:#eef2f6}.n{text-align:right;white-space:nowrap}.sign{margin-top:48px;text-align:right}.ft{color:#555;font-size:12px;margin-top:18px}@page{size:A4;margin:14mm}</style></head><body>' +
      '<h1>DEBIT NOTE</h1><div class="two"><div><b>' + esc(b.name) + '</b><br>' + esc(b.addr || '').replace(/\n/g, '<br>') + (b.gstin ? '<br>GSTIN ' + esc(b.gstin) : '') + '</div>' +
      '<div style="text-align:right">Debit note no. <b>' + esc(d.no || '') + '</b><br>Date ' + A.ldate(d.date) + (d.orig && d.orig.no ? '<br>Against your bill no. <b>' + esc(d.orig.no) + '</b>' : '') + '</div></div>' +
      '<div><b>To:</b> ' + esc(s.name || '') + (s.gstin ? ', GSTIN ' + esc(s.gstin) : '') + (s.state ? ', State ' + esc(NS.stateName(s.state) || s.state) : '') + '</div>' +
      '<p>We have debited your account for the goods returned / allowance below.</p><table><thead><tr><th>#</th><th>Item</th><th>HSN/SAC</th><th class="n">Qty</th><th class="n">Rate</th><th class="n">GST %</th><th class="n">Taxable value</th></tr></thead><tbody>' +
      rows.map(function (it, i) { var q = it.qty === '' || it.qty == null ? 1 : num(it.qty); return '<tr><td>' + (i + 1) + '</td><td>' + esc(it.desc) + '</td><td>' + esc(it.hsn || '') + '</td><td class="n">' + NS.qty(q) + '</td><td class="n">' + money(it.rate, false) + '</td><td class="n">' + (d.noGst ? '—' : num(it.gst)) + '</td><td class="n">' + money(r2(q * num(it.rate)), false) + '</td></tr>'; }).join('') +
      '</tbody><tfoot><tr><th colspan="6">Taxable value</th><th class="n">' + money(t.taxable, false) + '</th></tr>' +
      (t.cgst ? '<tr><th colspan="6">CGST</th><th class="n">' + money(t.cgst, false) + '</th></tr><tr><th colspan="6">SGST</th><th class="n">' + money(t.sgst, false) + '</th></tr>' : '') +
      (t.igst ? '<tr><th colspan="6">IGST</th><th class="n">' + money(t.igst, false) + '</th></tr>' : '') +
      (t.round ? '<tr><th colspan="6">Round off</th><th class="n">' + money(t.round, false) + '</th></tr>' : '') +
      '<tr><th colspan="6">Total</th><th class="n">' + money(t.total, false) + '</th></tr></tfoot></table><p>' + esc(NS.inWords(t.total)) + '</p>' +
      '<p class="ft">Please send us your credit note for this return under section 34 of the CGST Act, so the GST can be adjusted on both sides.</p>' +
      '<div class="sign">For ' + esc(b.name) + '<br><br><br>Authorised signatory</div><p class="ft">Made with Nivesh Sahayak.</p><script>onload=function(){print()}<\/script></body></html>');
    w.document.close();
  }

  /* ---------- expense book ---------- */
  var MON = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'], efy = '';
  A.addSection('ebook', function () {
    var D = A.mine(), today = NS.today(); if (!efy) efy = NS.fy(today);
    var y0 = +efy.slice(0, 4), from = y0 + '-04-01', to = (y0 + 1) + '-03-31', cats = {}, names = {}, col = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], fys = {};
    B.inBooks(D, A.bizName()).forEach(function (d) {
      if (!d.date) return;
      var R = B.role(d); if (R !== 'exp' && R !== 'outexp') return;
      fys[NS.fy(d.date)] = 1;
      if (d.date < from || d.date > to) return;
      var mi = (+d.date.slice(5, 7) + 8) % 12;
      if (R === 'exp') names[key(d.cat || 'Miscellaneous')] = names[key(d.cat || 'Miscellaneous')] || d.cat || 'Miscellaneous';
      else (d.lines || []).forEach(function (l) { names[key(l.head || 'Miscellaneous')] = names[key(l.head || 'Miscellaneous')] || l.head || 'Miscellaneous'; });
      B.postings(d).forEach(function (l) {
        if (l.a.indexOf('exp:') !== 0) return;
        var c = cats[l.a.slice(4)] = cats[l.a.slice(4)] || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        c[mi] = r2(c[mi] + l.dr - l.cr); col[mi] = r2(col[mi] + l.dr - l.cr);
      });
    });
    fys[efy] = 1; fys[NS.fy(today)] = 1;
    var list = Object.keys(cats).map(function (k) { return { k: k, name: names[k] || k, v: cats[k], tot: r2(cats[k].reduce(function (a, b) { return a + b; }, 0)) }; }).sort(function (a, b) { return b.tot - a.tot; });
    var grand = r2(col.reduce(function (a, b) { return a + b; }, 0)), mi0 = (+today.slice(5, 7) + 8) % 12, thisFy = efy === NS.fy(today);
    CSV = [['Expense type'].concat(MON).concat(['Total'])].concat(list.map(function (c) { return [c.name].concat(c.v).concat([c.tot]); })).concat([['Total'].concat(col).concat([grand])]);
    PDFNAME = 'Expense book ' + efy;
    var recent = A.mine().filter(function (d) { var R = B.role(d); return (R === 'exp' || R === 'outexp') && d.date >= from && d.date <= to; }).filter(A.match).sort(A.byDate);
    return '<div class="pane-hd"><h2>' + esc(T('ebook')) + '</h2><div class="quick"><button type="button" class="btn primary" data-form="exp">+ ' + esc(T('exp')) + '</button></div></div>' +
      '<p class="soft">' + esc(T('ebookh')) + '</p>' +
      '<div class="tiles"><div class="tile"><span>' + esc(T('yrtot')) + '</span><b>' + money(grand) + '</b></div>' +
        (thisFy ? '<div class="tile"><span>' + esc(T('thismon')) + '</span><b>' + money(col[mi0]) + '</b></div>' : '') +
        (list[0] ? '<div class="tile"><span>' + esc(T('topcat')) + '</span><b>' + esc(list[0].name) + '</b></div>' : '') + '</div>' +
      '<div class="tools-row"><label>' + esc(T('yr')) + ' <select data-efy>' + Object.keys(fys).sort().reverse().map(function (f) { return '<option value="' + f + '"' + (f === efy ? ' selected' : '') + '>' + f + '</option>'; }).join('') + '</select></label></div>' +
      '<div class="quick">' + outBtns() + '</div>' +
      '<div class="tbl-wrap"><div class="stsheet sh wide" data-sheet>' + head('EXPENSE BOOK', 'Financial year ' + efy) +
      '<table class="tbl st eb"><thead><tr><th>Expense type</th>' + MON.map(function (x) { return '<th class="n">' + x + '</th>'; }).join('') + '<th class="n">Total</th></tr></thead><tbody>' +
      (list.length ? list.map(function (c) { return '<tr><td>' + esc(c.name) + '</td>' + c.v.map(function (v) { return '<td class="n">' + m(v) + '</td>'; }).join('') + '<td class="n"><b>' + money(c.tot, false) + '</b></td></tr>'; }).join('') : '<tr><td colspan="14">' + esc(T('none')) + '</td></tr>') +
      '</tbody><tfoot><tr><th>Total</th>' + col.map(function (v) { return '<th class="n">' + m(v) + '</th>'; }).join('') + '<th class="n">' + money(grand, false) + '</th></tr></tfoot></table>' +
      '<p class="st-ft">Amounts without the GST you claim as input tax credit. Expenses paid by payment voucher are counted under their account head.</p>' + foot() + '</div></div>' +
      '<h3>' + esc(T('recent')) + '</h3>' + A.searchBar() + A.rowsHtml(recent.slice(0, 100));
  }, function (pane) {
    wireOut(pane);
    var s = $('[data-efy]', pane); if (s) s.addEventListener('change', function () { efy = s.value; A.show(); });
  });

  /* ---------- cheque register ---------- */
  var cf = 'all';
  function cheques() {
    return A.mine().filter(function (d) { return (d.type === 'receipt' || d.type === 'voucher') && d.mode === 'cheque'; }).map(function (d) {
      var c = d.chq || { date: d.date, st: 'ok', bank: '' }, out = d.type === 'voucher' || d.kind === 'ref';
      return { d: d, out: out, no: d.ref || '', cdate: c.date || d.date, bank: c.bank || '', st: c.st || 'ok', on: c.on || '', amt: A.amountOf(d) };
    });
  }
  A.addSection('chq', function () {
    var today = NS.today(), all = cheques(), wk = new Date(Date.parse(today + 'T00:00:00Z') + 7 * 864e5).toISOString().slice(0, 10);
    var pend = function (c) { return c.st !== 'ok' && c.st !== 'bounce'; };
    var sum = function (f) { return r2(all.filter(f).reduce(function (a, c) { return a + c.amt; }, 0)); };
    var F = { all: function () { return true; }, pdc: function (c) { return pend(c) && c.cdate > today; }, pend: pend, ok: function (c) { return c.st === 'ok'; }, bounce: function (c) { return c.st === 'bounce'; } };
    var q = A.q().toLowerCase();
    var list = all.filter(F[cf]).filter(function (c) { return !q || (c.no + ' ' + B.partyName(c.d) + ' ' + c.bank).toLowerCase().indexOf(q) >= 0; }).sort(function (a, b) { return b.cdate.localeCompare(a.cdate); });
    var due = all.filter(function (c) { return pend(c) && c.cdate <= wk; }).sort(function (a, b) { return a.cdate.localeCompare(b.cdate); });
    return '<div class="pane-hd"><h2>' + esc(T('chq')) + '</h2><div class="quick"><button type="button" class="btn primary" data-form="min" data-mode="cheque">+ ' + esc(T('crecv')) + '</button><button type="button" class="btn" data-form="mout" data-mode="cheque">+ ' + esc(T('cgive')) + '</button></div></div>' +
      '<p class="soft">' + esc(T('chqh')) + '</p>' +
      '<div class="tiles"><div class="tile"><span>' + esc(T('inhand')) + '</span><b>' + money(sum(function (c) { return !c.out && pend(c); })) + '</b></div>' +
        '<div class="tile"><span>' + esc(T('issued')) + '</span><b>' + money(sum(function (c) { return c.out && pend(c); })) + '</b></div>' +
        '<div class="tile"><span>' + esc(T('pdc')) + '</span><b>' + all.filter(F.pdc).length + '</b></div>' +
        '<div class="tile' + (all.some(F.bounce) ? ' warn' : '') + '"><span>' + esc(T('c_bounce')) + '</span><b>' + all.filter(F.bounce).length + '</b></div></div>' +
      (due.length ? '<div class="card"><h3>' + esc(T('due7')) + '</h3><ul class="rows">' + due.map(function (c) {
        return '<li><span><b>' + esc(B.partyName(c.d)) + '</b> <span class="soft">' + esc(T(c.out ? 'cgive' : 'crecv')) + ' ' + esc(c.no) + ' · ' + A.ldate(c.cdate) + '</span></span><b class="amt">' + money(c.amt) + '</b></li>'; }).join('') + '</ul></div>' : '') +
      '<div class="tools-row"><label class="sr" for="chq-q">' + esc(T('search')) + '</label><input id="chq-q" type="search" data-q value="' + esc(A.q()) + '" placeholder="' + esc(T('search')) + '">' +
      '<div class="seg" role="group">' + ['all', 'pdc', 'pend', 'ok', 'bounce'].map(function (f) { return '<button type="button" class="btn sm" data-cf="' + f + '" aria-pressed="' + (cf === f) + '">' + esc(T(f === 'all' ? 'all' : f === 'pdc' ? 'pdc' : f === 'pend' ? 'pend' : 'c_' + f)) + '</button>'; }).join('') + '</div></div>' +
      (list.length ? '<div class="tbl-wrap"><table class="tbl chq"><thead><tr><th>' + esc(T('cdate')) + '</th><th>' + esc(T('cno')) + '</th><th>' + esc(T('party')) + '</th><th class="n">' + esc(T('amount')) + '</th><th>' + esc(T('cst')) + '</th><th></th></tr></thead><tbody>' +
        list.map(function (c) {
          var d = c.d, nx = c.out ? ['ok', 'bounce'] : c.st === 'hand' ? ['dep', 'ok', 'bounce'] : ['ok', 'bounce'];
          return '<tr><td>' + A.ldate(c.cdate) + (c.cdate > today && pend(c) ? ' <span class="pill">' + esc(T('pdc')) + '</span>' : '') + '</td><td class="mono">' + esc(c.no) + (c.bank ? '<br><span class="soft">' + esc(c.bank) + '</span>' : '') + '</td>' +
            '<td>' + esc(B.partyName(d)) + '<br><span class="soft">' + esc(T(c.out ? 'cgive' : 'crecv')) + '</span></td><td class="n">' + (c.out ? '−' : '+') + money(c.amt, false) + '</td>' +
            '<td><span class="pill ' + (c.st === 'ok' ? 'ok' : c.st === 'bounce' ? 'bad' : 'warn') + '">' + esc(T('c_' + c.st)) + '</span>' + (c.on ? '<br><span class="soft">' + A.ldate(c.on) + '</span>' : '') + '</td>' +
            '<td class="acts">' + (c.st === 'ok' || c.st === 'bounce' ? '' : nx.map(function (s) { return '<button type="button" class="btn sm" data-cst="' + s + '" data-id="' + d.id + '">' + esc(T('mk_' + s)) + '</button>'; }).join('')) +
            '<button type="button" class="btn sm" data-edit="' + d.id + '">' + esc(T('edit')) + '</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="soft">' + esc(T('nochq')) + '</p>') +
      '<p class="soft">' + esc(T('chqfoot')) + '</p>';
  }, function (pane) {
    $$('[data-cf]', pane).forEach(function (b) { b.addEventListener('click', function () { cf = b.getAttribute('data-cf'); A.show(); }); });
    $$('[data-cst]', pane).forEach(function (b) { b.addEventListener('click', function () { setStatus(b.getAttribute('data-id'), b.getAttribute('data-cst')); }); });
  });
  function setStatus(id, st) {
    var d = A.data().doc.filter(function (x) { return x.id === id; })[0]; if (!d) return;
    if (st === 'bounce' && !confirm(T('cbounce', { n: d.ref || '', p: B.partyName(d) }))) return;
    d.chq = Object.assign({ date: d.date, bank: '' }, d.chq || {}, { st: st, on: st === 'ok' ? NS.today() : st === 'bounce' ? NS.today() : '' });
    NSStore.put('doc', d).then(function (saved) { return A.markPaid(saved); }).then(function () { NS.toast(T(st === 'bounce' ? 'bnote' : 'saved')); A.show(); });
  }

  /* ---------- cash book, bank book, day book ---------- */
  var bk = 'cash';
  var ACC = { sales: 'Sales', 'sales-return': 'Sales returns', purchases: 'Purchases', 'purchase-return': 'Purchase returns', cash: 'Cash', bank: 'Bank', 'chq-in': 'Cheques received (not cleared)', 'chq-out': 'Cheques issued (not cleared)',
    'gst-out-cgst': 'Output CGST', 'gst-out-sgst': 'Output SGST', 'gst-out-utgst': 'Output UTGST', 'gst-out-igst': 'Output IGST', 'gst-in-cgst': 'Input CGST', 'gst-in-sgst': 'Input SGST', 'gst-in-igst': 'Input IGST',
    'gst-rcm-payable': 'GST payable (reverse charge)', 'tds-receivable': 'TDS receivable', 'tds-payable': 'TDS payable', 'round-off': 'Round off', opening: 'Opening balances', 'p:cash-customer': 'Cash customer', 'p:unknown': 'Creditors (unnamed)' };
  function accName(a, d) {
    if (ACC[a]) return ACC[a];
    if (a.indexOf('p:') === 0) return B.partyName(d) || a.slice(2);
    if (a.indexOf('exp:') === 0) { var n = d.type === 'exp' ? d.cat : ((d.lines || []).filter(function (l) { return key(l.head || 'Miscellaneous') === a.slice(4); })[0] || {}).head; return (n || a.slice(4)) + ' (expense)'; }
    return a;
  }
  function particulars(d) {
    if (d.type === 'contra') return d.from === 'bank' ? 'Cash withdrawn from bank' : 'Cash deposited in bank';
    var p = B.partyName(d); return A.enName(d) + (d.no ? ' ' + d.no : '') + (p ? ' · ' + p : d.cat ? ' · ' + d.cat : '');
  }
  A.addSection('books', function () {
    var r = A.range(), D = A.mine(), sheet, title;
    if (bk === 'day') {
      title = 'DAY BOOK';
      var ent = B.inBooks(D, A.bizName()).filter(function (d) { return d.date >= r[0] && d.date <= r[1]; }), td = 0, tc = 0;
      CSV = [['Date', 'Entry', 'Account', 'Debit', 'Credit']];
      sheet = '<table class="tbl st"><thead><tr><th>Date</th><th>Entry</th><th>Account</th><th class="n">Debit</th><th class="n">Credit</th></tr></thead><tbody>' +
        (ent.length ? ent.map(function (d) {
          var L = B.postings(d), en = particulars(d);
          return L.map(function (l, i) {
            td = r2(td + l.dr); tc = r2(tc + l.cr); CSV.push([d.date, en, accName(l.a, d), l.dr || '', l.cr || '']);
            return '<tr' + (i === 0 ? ' class="first"' : '') + '><td>' + (i === 0 ? A.ldate(d.date) : '') + '</td><td>' + (i === 0 ? esc(en) : '') + '</td><td>' + (l.cr ? '&nbsp;&nbsp;To ' : '') + esc(accName(l.a, d)) + '</td><td class="n">' + m(l.dr) + '</td><td class="n">' + m(l.cr) + '</td></tr>';
          }).join('');
        }).join('') : '<tr><td colspan="5">' + esc(T('none')) + '</td></tr>') +
        '</tbody><tfoot><tr><th colspan="3">Total</th><th class="n">' + money(td, false) + '</th><th class="n">' + money(tc, false) + '</th></tr></tfoot></table>';
    } else {
      title = bk === 'bank' ? 'BANK BOOK' : 'CASH BOOK';
      var Bk = B.book(D, A.bizName(), bk, r[0], r[1]), ti = 0, to = 0;
      CSV = [['Date', 'Particulars', 'Reference', 'In', 'Out', 'Balance'], [r[0], 'Opening balance', '', '', '', Bk.open]];
      sheet = '<table class="tbl st"><thead><tr><th>Date</th><th>Particulars</th><th class="n">In (Receipts)</th><th class="n">Out (Payments)</th><th class="n">Balance</th></tr></thead><tbody>' +
        '<tr><td>' + A.ldate(r[0]) + '</td><td>Opening balance</td><td></td><td></td><td class="n">' + money(Bk.open, false) + '</td></tr>' +
        Bk.rows.map(function (x) {
          ti = r2(ti + x.dr); to = r2(to + x.cr); CSV.push([x.date, particulars(x.d), x.d.ref || '', x.dr || '', x.cr || '', x.bal]);
          return '<tr><td>' + A.ldate(x.date) + '</td><td>' + esc(particulars(x.d)) + (x.d.ref ? ' <span class="soft">(' + esc(x.d.ref) + ')</span>' : '') + '</td><td class="n">' + m(x.dr) + '</td><td class="n">' + m(x.cr) + '</td><td class="n">' + money(x.bal, false) + '</td></tr>';
        }).join('') +
        '</tbody><tfoot><tr><th colspan="2">Closing balance</th><th class="n">' + money(ti, false) + '</th><th class="n">' + money(to, false) + '</th><th class="n">' + money(Bk.close, false) + '</th></tr></tfoot></table>' +
        (bk === 'cash' && Bk.close < -0.004 ? '<p class="st-ft"><b>Cash balance below zero: an entry is missing or wrong.</b></p>' : '');
    }
    PDFNAME = title.charAt(0) + title.slice(1).toLowerCase() + ' ' + r[0] + ' to ' + r[1];
    var A0 = B.accounts(D, A.bizName());
    return '<div class="pane-hd"><h2>' + esc(T('books')) + '</h2><div class="seg" role="group">' + [['cash', 'cashbook'], ['bank', 'bankbook2'], ['day', 'daybook']].map(function (x) {
        return '<button type="button" class="btn sm" data-bk="' + x[0] + '" aria-pressed="' + (bk === x[0]) + '">' + esc(T(x[1])) + '</button>'; }).join('') + '</div></div>' +
      '<div class="tiles"><div class="tile' + ((A0.cash || 0) < 0 ? ' neg' : '') + '"><span>' + esc(T('cashin')) + '</span><b>' + money(A0.cash || 0) + '</b></div><div class="tile"><span>' + esc(T('bank')) + '</span><b>' + money(A0.bank || 0) + '</b></div>' +
        ((A0['chq-in'] || 0) ? '<div class="tile"><span>' + esc(T('inhand')) + '</span><b>' + money(A0['chq-in']) + '</b></div>' : '') + '</div>' +
      '<div class="card"><h3>' + esc(T('quick')) + '</h3><div class="quick"><button type="button" class="btn" data-form="min">+ ' + esc(T('min')) + '</button><button type="button" class="btn" data-form="mout">+ ' + esc(T('mout')) + '</button>' +
        '<button type="button" class="btn" data-form="exp">+ ' + esc(T('exp')) + '</button><button type="button" class="btn" data-form="contra">+ ' + esc(T('contra')) + '</button></div></div>' +
      '<p class="soft">' + esc(T(bk === 'day' ? 'dayh' : 'cbh')) + '</p>' + dates() + '<div class="quick">' + outBtns() + '</div>' +
      '<div class="tbl-wrap"><div class="stsheet sh wide" data-sheet>' + head(title, A.ldate(r[0]) + ' to ' + A.ldate(r[1])) + sheet + foot() + '</div></div>';
  }, function (pane) {
    wireOut(pane);
    $$('[data-bk]', pane).forEach(function (b) { b.addEventListener('click', function () { bk = b.getAttribute('data-bk'); A.show(); }); });
  });
})();

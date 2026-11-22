/* GST TDS deducted (GSTR-7) and ITC distribution by an Input Service Distributor (GSTR-6): two App screens, #gtds and #isd
   (owner 20 Nov 2026: "Build GSTR-7 and GSTR-6"). Records kept in the data home as documents of type 'gsttds' and 'isddist';
   they are not posted in the books (post the TDS with a journal: supplier Dr, GST TDS payable Cr). Each screen fills the
   department's offline tool (.xlsm) through NS.xlFill, the template downloaded once from gst.gov.in and kept on the device.
   GSTR-7 (s.51 of the CGST Act): 2% of the taxable value paid when a contract is above Rs 2.5 lakh: IGST 2% for a supplier in another
   state, CGST 1% + SGST 1% in the same state. GSTR-6 (s.20, rule 39): the month's input-service credit split between the branches by
   their share; a branch in another state gets all of it as IGST, a branch in the same state gets IGST as IGST and CGST/SGST as they are.
   Screen words: English (the App is English only). */
(function () {
  'use strict';
  var A = window.NSApp, B = window.NSBooks; if (!A || !B) return;
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, num = NS.num, money = NS.money;
  var r2 = function (n) { return Math.round((+n || 0) * 100) / 100; }, m = function (n) { return money(n, false); };
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  var MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var ST = { month: (function () { var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); })() };
  function me() { return A.biz() || {}; }
  function myState() { var b = me(); return String(b.state || String(b.gstin || '').slice(0, 2)); }
  function g15(x) { return String(x || '').trim().toUpperCase(); }
  function okGstin(g) { return /^\d{2}[A-Z0-9]{13}$/.test(g15(g)); }
  function inMonth(d) { return d && d.slice(0, 7) === ST.month; }
  function fy(mo) { var y = +mo.slice(0, 4), mm = +mo.slice(5, 7), s = mm >= 4 ? y : y - 1; return s + '-' + String(s + 1).slice(2); }
  function monthPick() { return '<label>Month <input type="month" data-gm value="' + esc(ST.month) + '"></label>'; }
  function dmy(d, sep) { return d ? d.slice(8, 10) + sep + d.slice(5, 7) + sep + d.slice(0, 4) : ''; }
  function nextNo(type, pre) { var n = A.mine().filter(function (d) { return d.type === type; }).length + 1; return pre + '/' + fy(ST.month) + '/' + String(n).padStart(3, '0'); }
  function utilButtons(kind, label) { return '<button type="button" class="btn primary" data-gfill="' + kind + '" data-ic="xls">Fill the official ' + label + ' tool (Excel)</button><button type="button" class="btn sm" data-gfill="' + kind + '" data-change="1" data-noic>Change template file</button>'; }

  /* ---------- GSTR-7: GST TDS deducted ---------- */
  function tdsSplit(paid, supState) { var t = r2(paid * 0.02), inter = supState && supState !== myState(); return inter ? { igst: t, cgst: 0, sgst: 0 } : { igst: 0, cgst: r2(paid * 0.01), sgst: r2(paid * 0.01) }; }
  function tdsList() { return A.mine().filter(function (d) { return d.type === 'gsttds' && !d.deleted && inMonth(d.date); }).sort(A.byDate); }
  function tdsSuggest() {   /* purchase bills of the month with a taxable value of Rs 2.5 lakh or more and no deduction recorded yet */
    var done = {}; A.mine().forEach(function (d) { if (d.type === 'gsttds' && d.ref) done[d.ref] = 1; });
    return A.mine().filter(function (d) { return d.type === 'pbill' && d.kind !== 'return' && !d.deleted && !d.cancelled && inMonth(d.date) && !done[d.id] && B.itemTotals(d).taxable >= 250000; });
  }
  function tdsHtml() {
    var L = tdsList(), S = tdsSuggest(), tot = L.reduce(function (a, d) { a.paid += num(d.paid); a.igst += num(d.igst); a.cgst += num(d.cgst); a.sgst += num(d.sgst); return a; }, { paid: 0, igst: 0, cgst: 0, sgst: 0 });
    return '<div class="pane-hd"><h2>GST TDS deducted (GSTR-7)</h2></div>' +
      '<p class="soft">For government offices and notified bodies that deduct GST TDS (section 51) when paying a supplier under a contract above Rs 2.5 lakh: 2% of the taxable value, as IGST for a supplier in another state, else 1% CGST + 1% SGST. Pay it by the 10th of the next month and file GSTR-7. Post it in the books with a journal (supplier Dr, GST TDS payable Cr).</p>' +
      '<div class="tools-row">' + monthPick() + '</div>' +
      '<div class="tiles"><div class="tile"><span>Amount paid</span><b>' + m(tot.paid) + '</b></div><div class="tile"><span>IGST</span><b>' + m(tot.igst) + '</b></div><div class="tile"><span>CGST</span><b>' + m(tot.cgst) + '</b></div><div class="tile"><span>SGST/UTGST</span><b>' + m(tot.sgst) + '</b></div></div>' +
      '<div class="quick no-print">' + utilButtons('gstr7', 'GSTR-7') + '</div>' +
      (S.length ? '<div class="card"><h3>Bills of Rs 2.5 lakh or more this month</h3><ul class="rows">' + S.map(function (d) { var t = B.itemTotals(d); return '<li><span>' + esc((d.buyer && d.buyer.name) || '') + ' · ' + esc(d.no || '') + ' · ' + A.ldate(d.date) + ' · taxable ' + m(t.taxable) + '</span><button type="button" class="btn sm" data-gtadd="' + d.id + '">Record 2% TDS</button></li>'; }).join('') + '</ul></div>' : '') +
      '<div class="card"><h3>Add a deduction by hand</h3><div class="tools-row"><label>Supplier GSTIN <input data-gt="gstin" maxlength="15"></label><label>Supplier name <input data-gt="name"></label><label>Bill no. <input data-gt="no"></label><label>Bill date <input type="date" data-gt="ddate"></label>' +
      '<label>Bill value <input data-gt="value" inputmode="decimal"></label><label>Amount paid (taxable) <input data-gt="paid" inputmode="decimal"></label><label>Date deducted <input type="date" data-gt="date" value="' + esc(ST.month + '-28') + '"></label><button type="button" class="btn" data-gtsave>Save</button></div></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Supplier (deductee)</th><th>Bill</th><th class="n">Paid</th><th class="n">IGST</th><th class="n">CGST</th><th class="n">SGST</th><th></th></tr></thead><tbody>' +
      (L.map(function (d) { return '<tr><td>' + A.ldate(d.date) + '</td><td>' + esc(d.name || '') + '<br><span class="soft">' + esc(d.gstin) + '</span></td><td>' + esc(d.no || '') + ' · ' + A.ldate(d.ddate) + '</td><td class="n">' + m(d.paid) + '</td><td class="n">' + m(d.igst) + '</td><td class="n">' + m(d.cgst) + '</td><td class="n">' + m(d.sgst) + '</td><td><button type="button" class="btn sm" data-gtdel="' + d.id + '">Delete</button></td></tr>'; }).join('') || '<tr><td colspan="8" class="soft">No deduction recorded this month.</td></tr>') + '</tbody></table></div>';
  }
  function tdsSave(o) {
    var st = String(o.gstin || '').slice(0, 2), sp = tdsSplit(num(o.paid), st);
    var rec = Object.assign({ type: 'gsttds', seller: me(), created: Date.now() }, o, sp);
    return NSStore.put('doc', rec).then(function () { NS.toast('Saved'); A.show(); });
  }
  function tdsWire(pane) {
    common(pane);
    $$('[data-gtadd]', pane).forEach(function (b) { b.addEventListener('click', function () {
      var d = A.mine().filter(function (x) { return x.id === b.getAttribute('data-gtadd'); })[0]; if (!d) return; var t = B.itemTotals(d), s = d.buyer || {};
      tdsSave({ ref: d.id, gstin: g15(s.gstin), name: s.name || '', no: d.no || '', ddate: d.date, value: r2(t.total), paid: r2(t.taxable), date: d.date });
    }); });
    var sv = $('[data-gtsave]', pane); if (sv) sv.addEventListener('click', function () {
      var o = {}; $$('[data-gt]', pane).forEach(function (i) { o[i.getAttribute('data-gt')] = i.value.trim(); });
      if (!okGstin(o.gstin) || !num(o.paid) || !o.date) { NS.toast('Type the supplier GSTIN, the amount paid and the date.', 'bad'); return; }
      o.gstin = g15(o.gstin); o.value = r2(num(o.value) || num(o.paid)); o.paid = r2(num(o.paid)); tdsSave(o);
    });
    $$('[data-gtdel]', pane).forEach(function (b) { b.addEventListener('click', function () { NSStore.del('doc', b.getAttribute('data-gtdel')).then(function () { A.show(); }); }); });
  }

  /* ---------- GSTR-6: ITC distribution by an Input Service Distributor ---------- */
  function units() { return (me().isdUnits || []).filter(function (u) { return okGstin(u.gstin) && num(u.share) > 0; }); }
  /* an ISD passes on the credit of input SERVICES only (s.2(61)): the lines with a SAC code (99...) of the month's purchase bills;
     a bill of goods, or a line without a code, is left out (owner 22 Nov: the screen used to take every bill with GST) */
  function sac(it) { return /^99/.test(String(it.hsn || '').trim()); }
  function isdAll() { return A.mine().filter(function (d) { return d.type === 'pbill' && d.kind !== 'return' && !d.deleted && !d.cancelled && !d.noGst && inMonth(d.date); }).sort(A.byDate); }
  function isdBills() { return isdAll().filter(function (d) { return (d.items || []).some(sac); }).map(function (d) { return Object.assign({}, d, { items: d.items.filter(sac), charges: [], _tot: B.itemTotals(d).total }); }); }
  function isdLeft() { return isdAll().filter(function (d) { return (d.items || []).some(function (it) { return String(it.desc || '').trim() && !sac(it); }); }).length; }
  function isdTotals(L) { return L.reduce(function (a, d) { var t = B.itemTotals(d), bk = B.itcBlk ? B.itcBlk(d) : null; ['igst', 'cgst', 'sgst'].forEach(function (h) { var x = num(t[h]), bl = bk ? num(bk.blk[h]) + num(bk.inel[h]) : 0; a.el[h] = r2(a.el[h] + x - bl); a.inel[h] = r2(a.inel[h] + bl); }); a.txv = r2(a.txv + num(t.taxable)); return a; }, { txv: 0, el: { igst: 0, cgst: 0, sgst: 0 }, inel: { igst: 0, cgst: 0, sgst: 0 } }); }
  /* each branch's part: its share of the credit; another state = all as IGST; same state = as it is */
  function split(tot, U) {
    var sum = U.reduce(function (a, u) { return a + num(u.share); }, 0), ms = myState(), out = [];
    U.forEach(function (u, i) {
      var f = num(u.share) / sum, other = String(u.gstin).slice(0, 2) !== ms;
      ['el', 'inel'].forEach(function (k) {
        var x = tot[k], ig = r2(x.igst * f), cg = r2(x.cgst * f), sg = r2(x.sgst * f); if (!(ig || cg || sg)) return;
        out.push({ gstin: g15(u.gstin), name: u.name || '', eligible: k === 'el', txv: r2(tot.txv * f), igst: other ? r2(ig + cg + sg) : ig, cgst: other ? 0 : cg, sgst: other ? 0 : sg, i: i });
      });
    });
    return out;
  }
  function isdSaved() { return A.mine().filter(function (d) { return d.type === 'isddist' && !d.deleted && d.month === ST.month; })[0]; }
  function isdHtml() {
    var U = units(), Lb = isdBills(), T = isdTotals(Lb), sv = isdSaved(), rows = sv ? sv.lines : split(T, U), left = isdLeft();
    return '<div class="pane-hd"><h2>ITC distribution (GSTR-6)</h2></div>' +
      '<p class="soft">For a head office registered as an Input Service Distributor (ISD): the credit on the month\'s input-service bills is passed to the branches by their share (section 20, rule 39). ' +
      'A branch in another state gets it all as IGST; a branch in the same state gets IGST, CGST and SGST as they are. Blocked or ineligible credit is distributed as ineligible. File GSTR-6 by the 13th of the next month.</p>' +
      '<div class="tools-row">' + monthPick() + '</div>' +
      '<div class="card"><h3>Branches and their share</h3><p class="soft">Share = the branch\'s turnover in the state for the period the rule names (usually the last financial year), or any ratio you use. Saved with this business.</p>' +
      '<div data-units>' + (me().isdUnits || []).concat([{}]).map(function (u, i) { return '<div class="tools-row"><label>Branch GSTIN <input data-iu="gstin" data-ii="' + i + '" value="' + esc(u.gstin || '') + '" maxlength="15"></label><label>Name <input data-iu="name" data-ii="' + i + '" value="' + esc(u.name || '') + '"></label><label>Share <input data-iu="share" data-ii="' + i + '" value="' + esc(u.share || '') + '" inputmode="decimal"></label></div>'; }).join('') + '</div>' +
      '<button type="button" class="btn sm" data-iusave>Save branches</button></div>' +
      (left ? '<p class="note">' + left + (left === 1 ? ' purchase bill of this month has' : ' purchase bills of this month have') + ' goods or lines without a SAC code: those lines are left out, because an ISD distributes the credit on input services only. Give each service line its SAC code (starting 99) in the purchase bill to include it.</p>' : '') +
      '<div class="tiles"><div class="tile"><span>Bills with input services</span><b>' + Lb.length + '</b></div><div class="tile"><span>Eligible credit</span><b>' + m(T.el.igst + T.el.cgst + T.el.sgst) + '</b></div><div class="tile"><span>Ineligible</span><b>' + m(T.inel.igst + T.inel.cgst + T.inel.sgst) + '</b></div></div>' +
      '<div class="quick no-print"><button type="button" class="btn" data-isdsave>' + (sv ? 'Distribute again' : 'Save this distribution') + '</button>' + utilButtons('gstr6', 'GSTR-6') + '</div>' +
      (sv ? '<p class="soft">Saved distribution of ' + esc(ST.month) + ' (ISD invoices ' + esc(sv.lines.map(function (l) { return l.no; }).filter(Boolean).join(', ')) + ').</p>' : '<p class="soft">Not saved yet: saving gives each branch its ISD invoice number.</p>') +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Branch</th><th>ITC</th><th>ISD invoice</th><th class="n">IGST</th><th class="n">CGST</th><th class="n">SGST</th></tr></thead><tbody>' +
      (rows.map(function (r) { return '<tr><td>' + esc(r.name || '') + '<br><span class="soft">' + esc(r.gstin) + '</span></td><td>' + (r.eligible ? 'Eligible' : 'Ineligible') + '</td><td>' + esc(r.no || '—') + '</td><td class="n">' + m(r.igst) + '</td><td class="n">' + m(r.cgst) + '</td><td class="n">' + m(r.sgst) + '</td></tr>'; }).join('') || '<tr><td colspan="6" class="soft">' + (U.length ? 'No input-service bills this month.' : 'Add the branches first.') + '</td></tr>') + '</tbody></table></div>';
  }
  function isdWire(pane) {
    common(pane);
    var us = $('[data-iusave]', pane); if (us) us.addEventListener('click', function () {
      var U = []; $$('[data-iu]', pane).forEach(function (i) { var n = +i.getAttribute('data-ii'); U[n] = U[n] || {}; U[n][i.getAttribute('data-iu')] = i.value.trim(); });
      U = U.filter(function (u) { return u && u.gstin; }).map(function (u) { return { gstin: g15(u.gstin), name: u.name, share: num(u.share) }; });
      var bad = U.filter(function (u) { return !okGstin(u.gstin); }); if (bad.length) { NS.toast('Check the GSTIN: ' + bad[0].gstin, 'bad'); return; }
      NSStore.put('biz', Object.assign({}, me(), { isdUnits: U })).then(function () { NS.toast('Saved'); A.show(); });
    });
    var ds = $('[data-isdsave]', pane); if (ds) ds.addEventListener('click', function () {
      var U = units(); if (!U.length) { NS.toast('Add the branches and their share first.', 'bad'); return; }
      var old = isdSaved(), rows = split(isdTotals(isdBills()), U), date = (function () { var y = +ST.month.slice(0, 4), mm = +ST.month.slice(5, 7); return ST.month + '-' + new Date(y, mm, 0).getDate(); })();
      var n0 = A.mine().filter(function (d) { return d.type === 'isddist' && d !== old; }).reduce(function (a, d) { return a + (d.lines || []).length; }, 0);
      rows.forEach(function (r, i) { r.no = 'ISD/' + fy(ST.month) + '/' + String(n0 + i + 1).padStart(3, '0'); r.date = date; });
      var rec = Object.assign(old || { type: 'isddist', seller: me(), created: Date.now() }, { month: ST.month, date: date, lines: rows, updated: Date.now() });
      NSStore.put('doc', rec).then(function () { NS.toast('Saved'); A.show(); });
    });
  }

  /* ---------- both: month, and filling the department's tools ---------- */
  function common(pane) {
    var mi = $('[data-gm]', pane); if (mi) mi.addEventListener('change', function () { if (mi.value) { ST.month = mi.value; A.show(); } });
    $$('[data-gfill]', pane).forEach(function (b) { b.addEventListener('click', function () { fill(b.getAttribute('data-gfill'), !!b.getAttribute('data-change')); }); });
  }
  function fill7(book) {
    if (['Home', '3 TDS'].some(function (n) { return book.sheets.indexOf(n) < 0; })) return Promise.reject(new Error('notutil'));
    var L = tdsList(); if (!L.length) return Promise.reject(new Error('empty'));
    return book.sheet('Home').then(function (H) { H.set('B7', g15(me().gstin)); H.set('D7', fy(ST.month)); H.set('E7', MON[+ST.month.slice(5, 7) - 1]); })
      .then(function () { return book.sheet('3 TDS'); }).then(function (S) {
        S.putRows(6, L.map(function (d) { return ['', d.gstin, String(d.name || '').slice(0, 250), d.no || '', dmy(d.ddate || d.date, '/'), num(d.value), num(d.paid), num(d.igst), num(d.cgst), num(d.sgst), 'Add']; }));
        return L.length;
      });
  }
  function fill6(book) {
    if (['Home', '3.B2B', '5,8 Distribution of ITC', 'master'].some(function (n) { return book.sheets.indexOf(n) < 0; })) return Promise.reject(new Error('notutil'));
    var sv = isdSaved(); if (!sv) return Promise.reject(new Error('nosave'));
    var POS = [], ms = myState();
    return book.sheet('master').then(function (M) { POS = M.listUnder('Name of the State'); })
      .then(function () { return book.sheet('Home'); }).then(function (H) { H.set('B6', g15(me().gstin)); H.set('D6', fy(ST.month)); H.set('E6', MON[+ST.month.slice(5, 7) - 1]); })
      .then(function () { return book.sheet('3.B2B'); }).then(function (S) {
        var rows = [];
        isdBills().forEach(function (d) {
          var sup = d.buyer || {}, ss = String(sup.state || g15(sup.gstin).slice(0, 2) || ms), inter = ss !== ms, by = {};
          (d.items || []).forEach(function (it) { var g = num(it.gst), q = num(it.qty) * num(it.rate), tx = r2(q - q * num(it.disc) / 100), b = by[g] || (by[g] = { tx: 0 }); b.tx = r2(b.tx + tx); });
          var tot = r2(d._tot != null ? d._tot : B.itemTotals(d).total);   /* the whole invoice value, as on the supplier's bill */
          Object.keys(by).forEach(function (g) { var t = r2(by[g].tx * g / 100); rows.push(['', g15(sup.gstin), dmy(d.date, '-'), d.no || '', tot, NS.xlFill.posFrom(POS, ms.padStart(2, '0') + '-'), inter ? 'Interstate' : 'Intrastate', num(g) / 100, by[g].tx, inter ? t : 0, inter ? 0 : r2(t / 2), inter ? 0 : r2(t - r2(t / 2)), 0, '', '', 'Add']); });
        });
        S.putRows(6, rows); return rows.length;
      })
      .then(function (n3) { return book.sheet('5,8 Distribution of ITC').then(function (S) {
        S.putRows(8, sv.lines.map(function (l) { return ['', l.eligible ? 'Eligible' : 'Ineligible', 'Registered', l.gstin, 'ISD Invoice', l.no, dmy(l.date, '-'), '', '', '', '', l.txv, 'No', l.igst, l.cgst, l.sgst, 0, '', '', '', '', 'Add']; }));
        return n3 + sv.lines.length;
      }); });
  }
  function fill(kind, change) {
    var g = g15(me().gstin), tp = null;
    if (!okGstin(g)) { NS.toast('Add the GSTIN of this business first (My data › Businesses).'); return; }
    if (!NS.xlFill) return;
    NS.xlFill.template(kind, change).then(function (x) {
      tp = x; if (!tp) return;
      NS.toast('Filling ' + tp.file.name + '…');
      return NS.xlFill.open(tp.file).then(function (book) { return (kind === 'gstr7' ? fill7(book) : fill6(book)).then(function (n) {
        NS.xlFill.good(kind, tp);
        var nm = g + '_' + kind.toUpperCase() + '_' + ST.month + ' NSBiz.xlsm';
        return book.save(nm).then(function (bl) { return NS.xlFill.toFolder(g, kind.toUpperCase() + ' ' + ST.month, nm, bl); }).then(function (inF) {
          NS.toast('Saved as "' + nm + '" (' + n + ' rows).' + (inF ? ' Also saved in NSBiz › GST Returns.' : '') + ' Open it in Excel, enable macros, then use the tool\'s own buttons to check it and make the upload file.');
        });
      }); });
    }).catch(function (e) {
      var w = e && e.message; if (/^(notutil|nosheet|notxl)$/.test(w)) NS.xlFill.bad(kind, tp);
      NS.toast(w === 'empty' ? 'No deduction recorded this month.' : w === 'nosave' ? 'Save this month\'s distribution first (it gives the ISD invoice numbers).' : w === 'notzip' ? 'Choose the zip downloaded from gst.gov.in, or the tool inside it.' : w === 'notinzip' || w === 'notutil' || w === 'nosheet' || w === 'notxl' ? 'That is not the ' + kind.toUpperCase() + ' offline tool. Download it from gst.gov.in › Downloads › Offline Tools.' : 'Could not fill the tool: ' + (w || e), 'bad');
    });
  }
  A.addSection('gtds', tdsHtml, tdsWire);
  A.addSection('isd', isdHtml, isdWire);
})();

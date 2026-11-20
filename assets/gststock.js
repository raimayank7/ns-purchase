/* GST stock forms in the App (owner 20 Nov 2026: "Add GSTR-10, ITC-01, ITC-03", "Windows program fills"), section #gststk.
   The stock in hand on a chosen date, traced to the purchase bills it came from (NSStock.lotsOn, FIFO), with the GST credit on it:
   ITC-01 (claim the credit on stock: new registration s.18(1)(a)/(b), leaving composition (c), goods becoming taxable (d)),
   ITC-03 (pay back that credit: opting for composition or goods becoming exempt, s.18(4)), GSTR-10 (final return when the GST number
   is cancelled). Goods made here and opening stock have no supplier's invoice; fixed assets with GST credit are capital goods.
   The department's offline tools for these three come as .xls / .xlsb files, which a browser cannot rewrite without losing their
   macros, so the Windows program fills a copy with the customer's own Excel (NSDesktopXL.fill, ns-desktop helpers/xlfill.ps1).
   In a browser the rows are offered as an Excel file to copy from. Screen words: English (the App is English only). */
(function () {
  'use strict';
  var A = window.NSApp, S = window.NSStock, B = window.NSBooks; if (!A || !S || !B) return;
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, num = NS.num, money = NS.money, r2 = function (n) { return Math.round((+n || 0) * 100) / 100; };
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  var FORMS = {
    itc01: { t: 'ITC-01: claim credit on stock', kind: 'itc01', ext: '.xls' },
    itc03: { t: 'ITC-03: pay back credit on stock', kind: 'itc03', ext: '.xls' },
    gstr10: { t: 'GSTR-10: final return on cancellation', kind: 'gstr10', ext: '.xlsb' }
  };
  var ST = { form: 'itc03', date: NS.today(), sec01: 'Section 18(1)(a)', sec03: 'Section 18(4) - Composition ', ref: '', refDate: '', ordDate: '' };
  /* units as each tool spells them (read from the tools' own lists, 20 Nov 2026) */
  var UL = {
    itc01: 'BAG BALE BUNDLES BUCKLES BOX BOTTLES BUNCHES CANS CARTONS DOZEN DRUM GRAMS GROSS KILOGRAMS KILOLITER KILOMETRE MILLILITRE METERS NUMBERS PACKS PIECES PAIRS QUINTAL ROLLS SETS TABLETS THOUSANDS TUBES UNITS YARDS OTHERS',
    itc03: 'BAGS BALE BUNDLES BUCKLES BOX BOTTLES BUNCHES CANS CARTONS DOZENS DRUMS GRAMMES GROSS KILOGRAMS KILOLITRE KILOMETRE MILILITRE METERS NUMBERS PACKS PIECES PAIRS QUINTAL ROLLS SETS TABLETS THOUSANDS TONNES TUBES UNITS YARDS OTHERS',
    gstr10: 'BAGS BALE BUNDLES BUCKLES BOX BOTTLES BUNCHES CANS CARTONS DOZENS DRUMS GRAMMES GROSS KILOGRAMS KILOLITRE KILOMETRE MILILITRE METERS NUMBERS PACKS PIECES PAIRS QUINTAL ROLLS SETS TABLETS THOUSANDS TONNES TUBES UNITS YARDS OTHERS'
  };
  var UNIT = { nos: 'NUMBERS', no: 'NUMBERS', pcs: 'PIECES', pc: 'PIECES', kg: 'KILOGRAMS', kgs: 'KILOGRAMS', mtr: 'METERS', m: 'METERS', mtrs: 'METERS', box: 'BOX', bag: 'BAG', bags: 'BAG', set: 'SETS', sets: 'SETS',
    pack: 'PACKS', packs: 'PACKS', pkt: 'PACKS', doz: 'DOZEN', dozen: 'DOZEN', pair: 'PAIRS', pairs: 'PAIRS', qtl: 'QUINTAL', roll: 'ROLLS', rolls: 'ROLLS', btl: 'BOTTLES', bottle: 'BOTTLES', ctn: 'CARTONS', gm: 'GRAMS', gms: 'GRAMS', g: 'GRAMS', unit: 'UNITS', units: 'UNITS', tube: 'TUBES', drum: 'DRUM', ton: 'TONNES', tonne: 'TONNES' };
  function uqc(form, unit) {
    var want = UNIT[key(unit).replace(/\.$/, '')] || 'OTHERS', list = UL[form].split(' ');
    if (list.indexOf(want) >= 0) return want;
    var hit = list.filter(function (x) { return x.indexOf(want) === 0 || want.indexOf(x) === 0; })[0] || list.filter(function (x) { return x.slice(0, 4) === want.slice(0, 4); })[0];   /* BAG / BAGS, DOZEN / DOZENS, GRAMS / GRAMMES */
    return hit || 'OTHERS';
  }
  var GT = {   /* goods types as each tool spells them: [inputs, inputs in semi-finished/finished goods, capital goods, no invoice] */
    itc01: ['Inputs held in Stock', 'Inputs contained in semi-finished or finished goods held in stock', '', 'Inputs held in Stock'],
    itc03: ['Inputs held in stock', 'Inputs contained in semi-finished and finished goods held in stock', 'Capital goods held in stock', 'Inputs held in stock and as contained in semi-finished /finished goods held in stock'],
    gstr10: ['Input held in stock', 'Inputs contained in semi-finished and finished goods held in stock', 'Capital goods/plant and machinery held in stock ', 'Inputs held in stock or inputs as contained in semi-finished/ finished goods held in stock']
  };
  function me() { return A.biz() || {}; }
  function myState() { var b = me(); return String(b.state || String(b.gstin || '').slice(0, 2)); }
  /* the rows: invoice rows (with the supplier's GSTIN and bill), rows with no invoice, capital goods */
  function work() {
    var docs = A.mine(), items = A.data().item, ms = myState(), inv = [], none = [], cap = [];
    S.lotsOn(docs, items, A.bizName(), ST.date).forEach(function (l) {
      var d = l.d, sup = d && d.buyer || {}, g15 = String(sup.gstin || '').trim().toUpperCase();
      var line = d && (d.items || []).filter(function (it) { return key(it.desc) === l.k || key(it.desc) === key(l.name); })[0], g = line ? num(line.gst) : 0;
      var ss = String(sup.state || g15.slice(0, 2) || ms), inter = !!ss && !!ms && ss !== ms, tx = r2(l.value * g / 100);
      var row = { name: l.name, unit: l.unit, qty: l.qty, value: l.value, g: g, igst: inter ? tx : 0, cgst: inter ? 0 : r2(tx / 2), sgst: inter ? 0 : r2(tx - r2(tx / 2)), made: l.src === 'make' };
      if (l.src === 'buy' && d && d.type === 'pbill' && /^\d{2}[A-Z0-9]{13}$/.test(g15)) inv.push(Object.assign(row, { gstin: g15, sup: sup.name || '', no: d.no || '', date: d.date }));
      else none.push(row);
    });
    docs.forEach(function (d) {   /* capital goods: fixed assets bought with GST credit and not sold by the date */
      if (d.type !== 'fa' || d.kind === 'sale' || d.date > ST.date || !d.itc || !num(d.gstAmt)) return;
      var sold = docs.some(function (x) { return x.type === 'fa' && x.kind === 'sale' && x.date <= ST.date && key(x.name) === key(d.name); }); if (sold) return;
      var ga = num(d.gstAmt), g15 = String(d.supplier && d.supplier.gstin || d.buyer && d.buyer.gstin || '').toUpperCase();
      cap.push({ name: d.name || 'Fixed asset', unit: 'Nos', qty: 1, value: r2(num(d.amount)), g: 0, igst: d.inter ? ga : 0, cgst: d.inter ? 0 : r2(ga / 2), sgst: d.inter ? 0 : r2(ga - r2(ga / 2)), gstin: g15, no: d.no || '', date: d.date, cap: 1 });
    });
    var tot = { value: 0, igst: 0, cgst: 0, sgst: 0 }; inv.concat(none, cap).forEach(function (r) { ['value', 'igst', 'cgst', 'sgst'].forEach(function (h) { tot[h] = r2(tot[h] + r[h]); }); });
    return { inv: inv, none: none, cap: cap, tot: tot };
  }
  function dmy(d, sep) { return d ? d.slice(8, 10) + sep + d.slice(5, 7) + sep + d.slice(0, 4) : ''; }
  /* what the Windows program writes: header cells and rows, in the tool's own columns and words */
  function spec(w) {
    var f = ST.form, g = String(me().gstin || '').toUpperCase(), T = GT[f], U = function (u) { return uqc(f, u); };
    var gt = function (r) { return r.cap ? T[2] : r.made ? T[1] : T[0]; };
    if (f === 'itc03') {
      var rowsI = w.inv.concat(w.cap.filter(function (r) { return r.gstin; })).map(function (r) { return [r.gstin, '', r.no, dmy(r.date, '/'), gt(r), String(r.name).slice(0, 30), U(r.unit), r.qty, r.value, 'Non SEZ', r.cgst, r.sgst, r.igst, 0, 'Add']; });
      return { cells: [{ s: 'Home', c: 'B4', v: g }, { s: 'Home', c: 'D4', v: ST.sec03 }, { s: 'Home', c: 'F4', v: 'No' }].concat(/Composition/.test(ST.sec03) ? [{ s: 'Home', c: 'D7', v: ST.ref }, { s: 'Home', c: 'D8', v: dmy(ST.refDate || ST.date, '/') }] : [{ s: 'Home', c: 'D10', v: dmy(ST.date, '/') }]),
        rows: [{ s: 'Invoice_Available', r: 7, col: 2, data: rowsI }], skipped: w.none.length + w.cap.filter(function (r) { return !r.gstin; }).length };
    }
    if (f === 'itc01') {
      var sh = { 'Section 18(1)(a)': 'Sec_18_1_A', 'Section 18(1)(b)': 'Sec_18_1_B', 'Section 18(1)(c)': 'Sec_18_1_C', 'Section 18(1)(d)': 'Sec_18_1_D' }[ST.sec01], dr = { 'Section 18(1)(a)': 'D10', 'Section 18(1)(b)': 'D10', 'Section 18(1)(c)': 'D11', 'Section 18(1)(d)': 'D12' }[ST.sec01];
      var rows1 = w.inv.map(function (r, i) { return [i + 1, r.gstin, r.no, dmy(r.date, '-'), gt(r), String(r.name).slice(0, 30), U(r.unit), r.qty, r.value, 'Non-SEZ', r.cgst, r.sgst, r.igst, 0, 'Add']; });
      return { cells: [{ s: 'Import_Export_file', c: 'B7', v: g }, { s: 'Import_Export_file', c: 'C7', v: 'No' }, { s: 'Import_Export_file', c: 'H5', v: ST.sec01 }, { s: 'Import_Export_file', c: dr, v: dmy(ST.date, '-') }],
        rows: [{ s: sh, r: 7, col: 2, data: rows1 }], skipped: w.none.length + w.cap.length };
    }
    var rowsG = w.inv.concat(w.cap.filter(function (r) { return r.gstin; })).map(function (r) { return [r.gstin, '', '', r.no, dmy(r.date, '-'), gt(r), String(r.name).slice(0, 30), U(r.unit), r.qty, r.value, r.cgst, r.sgst, r.igst, 0, 'Add']; });
    var rowsN = w.none.concat(w.cap.filter(function (r) { return !r.gstin; })).map(function (r, i) { return [i + 1, T[3], String(r.name).slice(0, 30), U(r.unit), r.qty, r.value, r.cgst, r.sgst, r.igst, 0, 'Add']; });
    return { cells: [{ s: 'Home', c: 'B4', v: g }, { s: 'Home', c: 'D7', v: dmy(ST.date, '-') }, { s: 'Home', c: 'D8', v: ST.ref }, { s: 'Home', c: 'D9', v: dmy(ST.ordDate || ST.date, '-') }],
      rows: [{ s: 'Invoice_Available', r: 6, col: 2, data: rowsG }, { s: 'Inv_Not_Avail (Without GSTIN)', r: 6, col: 2, data: rowsN }], skipped: 0 };
  }
  function m(n) { return money(n, false); }
  function html() {
    var w = work(), f = ST.form, desk = !!window.NSDesktopXL;
    var tr = function (r) { return '<tr><td>' + esc(r.name) + (r.cap ? ' <span class="soft">(capital goods)</span>' : r.made ? ' <span class="soft">(made here)</span>' : '') + '</td><td>' + esc(r.gstin ? r.gstin + ' · ' + (r.no || '') + ' · ' + A.ldate(r.date) : '—') + '</td><td class="n">' + NS.qty(r.qty) + ' ' + esc(r.unit || '') + '</td><td class="n">' + m(r.value) + '</td><td class="n">' + m(r.igst) + '</td><td class="n">' + m(r.cgst) + '</td><td class="n">' + m(r.sgst) + '</td></tr>'; };
    var all = w.inv.concat(w.cap, w.none);
    return '<div class="pane-hd"><h2>GST stock forms (ITC-01, ITC-03, GSTR-10)</h2></div>' +
      '<p class="soft">The stock in hand on the date, traced to the purchase bills it came from (newest bills first), with the GST credit on it. ' +
      'Goods made here and opening stock have no supplier\'s invoice; fixed assets with GST credit are capital goods. Check every row before filing: the department may ask for the invoices.</p>' +
      '<div class="tools-row"><label>Form <select data-gs="form">' + Object.keys(FORMS).map(function (k) { return '<option value="' + k + '"' + (k === f ? ' selected' : '') + '>' + esc(FORMS[k].t) + '</option>'; }).join('') + '</select></label>' +
      '<label>' + (f === 'gstr10' ? 'Effective date of cancellation' : f === 'itc03' ? 'Stock on (the day before the change)' : 'Stock on (the date of the claim)') + ' <input type="date" data-gs="date" value="' + esc(ST.date) + '"></label>' +
      (f === 'itc01' ? '<label>Claim under <select data-gs="sec01">' + ['Section 18(1)(a)', 'Section 18(1)(b)', 'Section 18(1)(c)', 'Section 18(1)(d)'].map(function (x) { return '<option' + (x === ST.sec01 ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></label>' : '') +
      (f === 'itc03' ? '<label>Section <select data-gs="sec03">' + ['Section 18(4) - Composition ', 'Section 18(4) - Exemption'].map(function (x) { return '<option value="' + esc(x) + '"' + (x === ST.sec03 ? ' selected' : '') + '>' + esc(x.trim()) + '</option>'; }).join('') + '</select></label>' : '') +
      (f === 'itc03' && /Composition/.test(ST.sec03) ? '<label>Application reference no. (CMP-02) <input data-gs="ref" value="' + esc(ST.ref) + '"></label><label>Date of opting in <input type="date" data-gs="refDate" value="' + esc(ST.refDate) + '"></label>' : '') +
      (f === 'gstr10' ? '<label>Cancellation order reference no. <input data-gs="ref" value="' + esc(ST.ref) + '"></label><label>Date of the order <input type="date" data-gs="ordDate" value="' + esc(ST.ordDate) + '"></label>' : '') + '</div>' +
      '<div class="tiles"><div class="tile"><span>Value of stock</span><b>' + m(w.tot.value) + '</b></div><div class="tile"><span>IGST</span><b>' + m(w.tot.igst) + '</b></div><div class="tile"><span>CGST</span><b>' + m(w.tot.cgst) + '</b></div><div class="tile"><span>SGST/UTGST</span><b>' + m(w.tot.sgst) + '</b></div></div>' +
      '<div class="quick no-print"><button type="button" class="btn primary" data-gsfill="0" data-ic="xls">Fill the official ' + esc(f === 'gstr10' ? 'GSTR-10' : f === 'itc01' ? 'ITC-01' : 'ITC-03') + ' tool (Excel)</button><button type="button" class="btn sm" data-gsfill="1" data-noic>Change template file</button><button type="button" class="btn" data-gsxl data-ic="xls">Excel of these rows</button></div>' +
      (desk ? '' : '<p class="note">Filling the official tool needs NSBiz for Windows: these tools are older Excel files that only Excel itself can fill without breaking them. In the browser, use "Excel of these rows" and copy the rows into the tool.</p>') +
      (f === 'itc01' && (w.none.length || w.cap.length) ? '<p class="soft">' + (w.none.length + w.cap.length) + ' row(s) without a supplier\'s invoice are not written into ITC-01 (it lists invoices only).</p>' : '') +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Item</th><th>Supplier GSTIN · bill · date</th><th class="n">Quantity</th><th class="n">Value</th><th class="n">IGST</th><th class="n">CGST</th><th class="n">SGST/UTGST</th></tr></thead><tbody>' +
      (all.map(tr).join('') || '<tr><td colspan="7" class="soft">No stock in hand on this date.</td></tr>') + '</tbody></table></div>';
  }
  function fill(change) {
    var f = ST.form, g = String(me().gstin || '').toUpperCase(), tp = null;
    if (!/^\d{2}[A-Z0-9]{13}$/.test(g)) { NS.toast('Add the GSTIN of this business first (My data › Businesses).'); return; }
    if (!window.NSDesktopXL) { NS.toast('This needs NSBiz for Windows (it uses your Excel). In the browser, use "Excel of these rows".'); return; }
    var w = work(), sp = spec(w);
    NS.xlFill.template(FORMS[f].kind, change).then(function (x) {
      tp = x; if (!tp) return;
      NS.toast('Excel is filling ' + tp.file.name + '… (this can take a minute)');
      return tp.file.arrayBuffer().then(function (ab) { return window.NSDesktopXL.fill(new Uint8Array(ab), (/\.[a-z]+$/i.exec(tp.file.name) || [FORMS[f].ext])[0], sp); }).then(function (r) {
        if (!r || !r.ok || !r.bytes) { if (r && r.noexcel) NS.toast('Microsoft Excel is needed on this computer to fill this tool.', 'bad'); else NS.toast('Excel could not fill it: ' + ((r && r.errors || []).join('; ') || 'no answer'), 'bad'); return; }
        NS.xlFill.good(FORMS[f].kind, tp);
        var ext = (/\.[a-z]+$/i.exec(tp.file.name) || [FORMS[f].ext])[0], nm = g + '_' + f.toUpperCase() + '_' + ST.date + ' NSBiz' + ext, bl = new Blob([r.bytes]);
        NS.saveFile(bl, nm);
        return NS.xlFill.toFolder(g, f.toUpperCase() + ' ' + ST.date, nm, bl).then(function (inF) {
          NS.toast('Saved as "' + nm + '" (' + r.written + ' values' + (sp.skipped ? ', ' + sp.skipped + ' row(s) without an invoice left out' : '') + ').' + (inF ? ' Also saved in NSBiz › GST Returns.' : '') + (r.errors && r.errors.length ? ' Not written: ' + r.errors.slice(0, 3).join('; ') : '') + ' Open it in Excel, enable macros, then use the tool\'s own buttons to check it and make the upload file.');
        });
      });
    }).catch(function (e) { NS.toast('Could not fill the tool: ' + (e && e.message || e), 'bad'); });
  }
  function wire(pane) {
    $$('[data-gs]', pane).forEach(function (el) { el.addEventListener('change', function () { ST[el.getAttribute('data-gs')] = el.value; A.show(); }); });
    $$('[data-gsfill]', pane).forEach(function (b) { b.addEventListener('click', function () { fill(b.getAttribute('data-gsfill') === '1'); }); });
    var x = $('[data-gsxl]', pane); if (x) x.addEventListener('click', function () {
      var w = work(), H = ['Item', 'Goods type', 'Supplier GSTIN', 'Bill no.', 'Bill date', 'Unit (UQC)', 'Quantity', 'Value', 'Central tax', 'State/UT tax', 'Integrated tax', 'Cess'];
      var R = w.inv.concat(w.cap, w.none).map(function (r) { return [r.name, r.cap ? 'Capital goods' : r.made ? 'Semi-finished/finished goods' : 'Inputs', r.gstin || '', r.no || '', r.date ? dmy(r.date, '-') : '', uqc(ST.form, r.unit), r.qty, r.value, r.cgst, r.sgst, r.igst, 0]; });
      NS.loadLazy(['xlsx.js']).then(function () { NS.saveFile(NS.xlsx.write([['Stock ' + ST.date, [H].concat(R)]]), 'gst-stock-' + ST.form + '-' + ST.date + '.xlsx'); });
    });
  }
  A.addSection('gststk', html, wire);
})();

/* TDS returns working in the App (ERP round 2: S-22), section #tdsr after Other income and taxes.
   For one quarter: every deduction in the books (purchase bills and expenses with TDS booked, payment vouchers with TDS, salary slips
   with TDS), the challans paid (Other income and taxes › Pay tax, kind TDS, with BSR code, challan serial and date), each deduction
   linked to the challan it was paid with (automatically: the first challan paid on or after it with room; or picked here), checks
   (PAN missing or wrong, section missing, not paid, paid late) and interest on late payment (1.5% a month or part, s.398(3) of the
   Income-tax Act, 2025, see tdscore.js), the statement due date and the late fee for a filing date typed here.
   Export: an Excel file with the deductee rows and the challans in the order the Return Preparation Utility asks for them; the
   statement itself is made and checked with the department's own utility (RPU and FVU), which NSBiz does not replace.
   Maths: tdscore.js (NSTds). Screen words: NS.t('tq.*') (App: English only). */
(function () {
  'use strict';
  var A = window.NSApp, T = window.NSTds, B = window.NSBooks; if (!A || !T || !B) return;
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, num = NS.num, money = NS.money;
  function F(k, v) { return NS.t('tq.' + k, v); }
  function m0(v) { return money(v, false); }
  /* statement forms of the Income-tax Rules, 2026 (old form in brackets); see FORMSRC */
  var FORMS = { '140': ['140', '26Q', 'TDS other than salary (residents)'], '138': ['138', '24Q', 'TDS on salary'], '144': ['144', '27Q', 'TDS on payments to non-residents'], '143': ['143', '27EQ', 'TCS collected on sales'] };
  var FORMSRC = 'Form numbers: Income-tax Rules, 2026, rule 219 (G.S.R. 198(E), 20 March 2026), checked 19 Nov 2026. Late fee: s.427 of the Income-tax Act, 2025; interest: s.398(3)(a).';
  var fyNow = (function () { var d = NS.today(), y = +d.slice(0, 4), m = +d.slice(5, 7); return String(m >= 4 ? y : y - 1); })();
  var ST = { fy: fyNow, q: T.quarterOf(NS.today()), form: '140', filed: '' };
  function fname(f) { var x = FORMS[f]; return 'Form ' + x[0] + ' (old ' + x[1] + ')'; }
  /* TCS (Form 143): every sales bill of the year with TCS charged, and the challans of kind TCS. Collected tax is paid by the 7th of the
     next month (March too); the statement is due by the 15th after the quarter (15 May for Q4), as for the old Form 27EQ. */
  function tcsRows(docs) {
    return docs.filter(function (d) { return !d.cancelled && !d.deleted && /^(invoice|cashmemo|expinv)$/.test(d.type || 'invoice') && d.tcs && d.tcs.on; }).map(function (d) {
      var t = B.itemTotals(d), rate = B.tcsRate ? B.tcsRate(d) : num(d.tcs.rate), base = d.tcs.base === 'taxable' ? t.taxable : t.taxable + t.cgst + t.sgst + t.igst;
      return { id: d.id, src: 'invoice', no: d.no || '', date: d.date, party: d.buyer && d.buyer.name || '', pan: B.tcsPan ? String(B.tcsPan(d) || '').toUpperCase() : '', sec: '', code: T.tcsCode(d.tcs.sec), base: NS.r2 ? NS.r2(base) : base, rate: rate, tds: t.tcs || 0, form: '143' };
    }).filter(function (r) { return r.tds > 0; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }
  /* bills where the buyer's Form No. 127 was kept instead of collecting TCS: reported with remark B and no tax (Form 143, Note 2) */
  function declRows(docs, from, to) {
    return docs.filter(function (d) { return !d.cancelled && !d.deleted && /^(invoice|cashmemo)$/.test(d.type || 'invoice') && d.tcs && d.tcs.decl && !d.tcs.on && d.date >= from && d.date <= to; }).map(function (d) {
      var t = B.itemTotals(d), sec = d.tcs.sec || '';
      return { id: d.id, src: 'invoice', no: d.no || '', date: d.date, party: d.buyer && d.buyer.name || '', pan: B.tcsPan ? String(B.tcsPan(d) || '').toUpperCase() : '', code: T.tcsCode(sec), base: NS.r2(t.taxable + t.cgst + t.sgst + t.igst), rate: 0, tds: 0, decl: true, declOn: d.tcs.declOn || '', form: '143' };
    }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }
  function tcsDue(date) { var y = +date.slice(0, 4), m = +date.slice(5, 7), ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1; return ny + '-' + String(nm).padStart(2, '0') + '-07'; }
  function tcsStmtDue(fy, q) { var y = +fy; return [y + '-07-15', y + '-10-15', (y + 1) + '-01-15', (y + 1) + '-05-15'][q - 1]; }
  function tcsWork() {
    var docs = A.mine(), qr = T.quarter(ST.fy, ST.q), from = ST.fy + '-04-01', to = (+ST.fy + 1) + '-03-31';
    var yr = tcsRows(docs).filter(function (r) { return r.date >= from && r.date <= to; });
    var ch = docs.filter(function (d) { return d.type === 'taxpay' && d.kind === 'tcs' && d.date >= from && d.date <= (+ST.fy + 1) + '-06-30'; });
    var m = T.map(yr, ch), inq = function (r) { return r.date >= qr.from && r.date <= qr.to; };
    m.rows.forEach(function (r) { r.due = tcsDue(r.date); r.late = !!(r.ch && r.paid > r.due); r.intDeposit = 0; });
    m.rows = m.rows.filter(inq); m.unmapped = m.unmapped.filter(inq); m.short = m.unmapped.reduce(function (a, r) { return a + r.tds; }, 0);
    var checks = []; m.rows.forEach(function (r) { if (!r.pan) checks.push({ k: 'nopan', r: r }); if (!r.ch) checks.push({ k: 'noch', r: r }); else if (r.late) checks.push({ k: 'late', r: r }); });
    return { decl: declRows(docs, qr.from, qr.to), q: Object.assign({}, qr, { due: tcsStmtDue(ST.fy, ST.q) }), map: m, tds: m.rows.reduce(function (a, r) { return a + r.tds; }, 0), intr: 0, checks: checks, chDocs: ch, tcs: true };
  }
  function work() {
    if (ST.form === '143') return tcsWork();
    var docs = A.mine(), qr = T.quarter(ST.fy, ST.q);
    /* every deduction of the tax year goes through the challans in date order (a challan's room is shared by all forms and quarters);
       the screen then shows this quarter and this form */
    var yr = T.deductions(docs, A.data().party || [], B.dedKind).filter(function (r) { return r.date >= ST.fy + '-04-01' && r.date <= (+ST.fy + 1) + '-03-31'; });
    var ch = docs.filter(function (d) { return d.type === 'taxpay' && d.kind === 'tds' && d.date >= ST.fy + '-04-01' && d.date <= (+ST.fy + 1) + '-06-30'; });
    var m = T.map(yr, ch), mine = function (r) { return r.form === ST.form && r.date >= qr.from && r.date <= qr.to; };
    m.rows = m.rows.filter(mine); m.unmapped = m.unmapped.filter(mine); m.short = m.unmapped.reduce(function (s, r) { return s + r.tds; }, 0);
    var tds = m.rows.reduce(function (s, r) { return s + r.tds; }, 0), intr = m.rows.reduce(function (s, r) { return s + r.intDeposit; }, 0);
    return { q: qr, map: m, tds: tds, intr: intr, checks: T.checks(m.rows), chDocs: ch };
  }
  function html() {
    var w = work(), m = w.map, ys = [+fyNow, +fyNow - 1, +fyNow - 2], TC = !!w.tcs, TX = TC ? 'TCS' : 'TDS', W = function (k, v) { return TC ? F(k, v).replace(/TDS/g, 'TCS').replace(/deductee/gi, 'collectee') : F(k, v); };
    var bar = '<div class="pr-bar tr-bar"><label>' + esc(F('year')) + ' <select id="tr-fy">' + ys.map(function (y) { return '<option value="' + y + '"' + (String(y) === ST.fy ? ' selected' : '') + '>' + y + '-' + String(y + 1).slice(2) + '</option>'; }).join('') + '</select></label>' +
      '<label>' + esc(F('quarter')) + ' <select id="tr-q">' + [1, 2, 3, 4].map(function (q) { return '<option value="' + q + '"' + (q === +ST.q ? ' selected' : '') + '>Q' + q + '</option>'; }).join('') + '</select></label>' +
      '<label>' + esc(F('form')) + ' <select id="tr-form">' + Object.keys(FORMS).map(function (f) { return '<option value="' + f + '"' + (f === ST.form ? ' selected' : '') + '>' + esc(fname(f) + ' · ' + FORMS[f][2]) + '</option>'; }).join('') + '</select></label></div>';
    var chOpts = function (r) { return '<select data-trch="' + esc(r.id) + '" aria-label="' + esc(F('challan')) + '"><option value="">' + esc(F('auto')) + '</option>' + m.challans.map(function (c) { return '<option value="' + esc(c.id) + '"' + (r.ch && r.ch.id === c.id && c.alloc.indexOf(r.id) >= 0 ? ' selected' : '') + '>' + esc((c.bsr || '—') + ' / ' + (c.serial || '—') + ' · ' + A.ldate(c.date) + ' · ' + m0(c.tax)) + '</option>'; }).join('') + '</select>'; };
    var rows = m.rows.length ? '<div class="tbl-wrap"><table class="tbl pw-t"><thead><tr><th>' + esc(A.T('date')) + '</th><th>' + esc(TC ? 'Collectee' : F('party')) + '</th><th>PAN</th><th>' + esc(TC ? 'Rate' : F('sec')) + '</th><th class="n">' + esc(TC ? 'Amount received or debited' : F('base')) + '</th><th class="n">' + TX + '</th><th>' + esc(F('due')) + '</th><th>' + esc(F('challan')) + '</th><th class="n">' + esc(F('int')) + '</th></tr></thead><tbody>' +
      m.rows.map(function (r) {
        var s = T.sec(r.sec);
        return '<tr' + (!r.ch || r.late || !r.pan ? ' class="pr-bad"' : '') + '><td>' + esc(A.ldate(r.date)) + '</td><th scope="row">' + esc(r.party) + '<small class="soft"> · ' + esc(A.docName ? r.src : r.src) + ' ' + esc(r.no || '') + '</small></th><td dir="ltr">' + esc(r.pan || '—') + '</td><td>' + esc(TC ? (r.code ? 'Code ' + r.code + ' · ' : '') + (r.rate ? r.rate + '%' : '—') : r.form === '138' ? 'Code 1002 · 392 (old 192)' : s ? (T.code(r) ? 'Code ' + T.code(r) : 'Form 141') + ' · ' + s[6] + ' (old ' + s[1] + ')' : '—') + '</td>' +
          '<td class="n">' + m0(r.base) + '</td><td class="n"><b>' + m0(r.tds) + '</b></td><td>' + esc(A.ldate(r.due)) + '</td><td>' + (r.ch ? '<span class="pill' + (r.late ? ' warn' : ' ok') + '">' + esc(A.ldate(r.paid)) + '</span> ' : '<span class="pill warn">' + esc(F('notpaid')) + '</span> ') + chOpts(r) + '</td><td class="n">' + (r.intDeposit ? m0(r.intDeposit) : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="soft">' + esc(F('none')) + '</p>';
    var cks = w.checks.length ? '<div class="card"><h3>' + esc(F('checks', { n: w.checks.length })) + '</h3><ul class="rows">' + w.checks.slice(0, 60).map(function (c) { return '<li><span>' + esc(W('ck_' + c.k, { p: c.r.party, d: A.ldate(c.r.date), t: m0(c.r.tds) })) + '</span></li>'; }).join('') + '</ul></div>' : (m.rows.length ? '<p class="pill ok">' + esc(F('allok')) + '</p>' : '');
    var chs = '<div class="card"><h3>' + esc(F('challans')) + '</h3>' + (m.challans.length ? '<ul class="rows">' + m.challans.map(function (c) { return '<li><span>' + esc(F('chline', { b: c.bsr || '—', s: c.serial || '—', d: A.ldate(c.date), n: c.no })) + (c.bsr ? '' : ' <span class="pill warn">' + esc(F('nobsr')) + '</span>') + '</span><b class="amt">' + esc(F('used', { u: m0(c.used), t: m0(c.tax) })) + '</b></li>'; }).join('') + '</ul>' : '<p class="soft">' + esc(W('noch')) + '</p>') +
      '<p><a class="btn sm" href="#acx">' + esc(F('paych')) + ' ›</a></p></div>';
    var fee = T.lateFee(w.q.due, ST.filed, w.tds);
    var sum = '<ul class="rows pw-tot"><li><span>' + esc(W('tdsq')) + '</span><b class="amt">' + money(w.tds) + '</b></li><li><span>' + esc(F('short')) + '</span><b class="amt">' + money(m.short) + '</b></li>' + (TC ? '' : '<li><span>' + esc(F('intq')) + '</span><b class="amt">' + money(w.intr) + '</b></li>') + '<li><span>' + esc(F('stdue')) + '</span><b>' + esc(A.ldate(w.q.due)) + '</b></li></ul>' +
      '<div class="fg"><div class="f"><label for="tr-filed">' + esc(F('filed')) + '</label><input type="date" id="tr-filed" value="' + esc(ST.filed) + '"><small class="soft">' + esc(F('filedh')) + '</small></div></div>' + (fee ? '<p class="callout">' + esc(F('fee', { a: money(fee) })) + '</p>' : '');
    /* S-23: certificate working per deductee for this quarter (Form 131, old 16A; Form 130, old Form 16, for salary): the deductions and
       the challans that paid them, to check against the certificate downloaded from TRACES */
    var by = {}; m.rows.forEach(function (r) { (by[r.party] = by[r.party] || []).push(r); });
    var certs = !TC && Object.keys(by).length ? '<div class="card"><h3>' + esc(F('certs', { f: ST.form === '138' ? 'Form 130 (old Form 16)' : 'Form 131 (old 16A)' })) + '</h3><ul class="rows">' + Object.keys(by).sort().map(function (p) {
      var t = by[p].reduce(function (a, r) { return a + r.tds; }, 0); return '<li><span>' + esc(p) + ' <span class="soft">' + esc(by[p][0].pan || '—') + '</span></span><b class="amt">' + m0(t) + '</b> <button type="button" class="btn sm" data-trcert="' + esc(p) + '" data-ic="print">' + esc(F('certp')) + '</button></li>'; }).join('') + '</ul><p class="soft">' + esc(F('certh')) + '</p></div>' : '';
    return '<div class="pane-hd"><h2>' + esc(F('title')) + '</h2><div class="quick"><button type="button" class="btn primary" data-trxl data-ic="download">' + esc(F('xl')) + '</button></div></div><p class="soft">' + esc(TC ? 'TCS charged on your sales bills in the quarter, the TCS challans paid, and what to fix before filing Form 143 (old 27EQ). Make the statement with the department’s utility using the Excel file.' : F('intro')) + '</p>' + bar + sum + cks + rows + chs + certs +
      '<p class="soft">' + esc(TC ? 'Pay TCS by the 7th of the next month. The quarterly statement is due by 15 July, 15 October, 15 January and 15 May (as for the old Form 27EQ: check the date on the income-tax portal). Interest on late payment of TCS is not worked out here.' : F('rules')) + '</p><p class="soft">' + esc(FORMSRC) + '</p>';
  }
  function wire(pane) {
    var ch = function (id, k) { var x = $('#' + id, pane); if (x) x.addEventListener('change', function () { ST[k] = x.value; A.show(); }); };
    ch('tr-fy', 'fy'); ch('tr-q', 'q'); ch('tr-form', 'form'); ch('tr-filed', 'filed');
    /* link a deduction to a challan: the challan record keeps the ids it paid (alloc), taken off every other challan */
    $$('[data-trch]', pane).forEach(function (s) { s.addEventListener('change', function () {
      var id = s.getAttribute('data-trch'), to = s.value, w = work(), jobs = [];
      w.chDocs.forEach(function (c) {
        var al = (c.alloc || []).filter(function (x) { return x !== id; }); if (c.id === to) al.push(id);
        if (al.length !== (c.alloc || []).length || c.id === to) jobs.push(NSStore.put('doc', Object.assign(JSON.parse(JSON.stringify(c)), { alloc: al })));
      });
      Promise.all(jobs).then(function () { NS.toast(A.T('saved')); A.show(); });
    }); });
    $$('[data-trcert]', pane).forEach(function (b) { b.addEventListener('click', function () {
      var p = b.getAttribute('data-trcert'), w = work(), L = w.map.rows.filter(function (r) { return r.party === p; }), biz = A.biz() || {}, win = window.open('', '_blank'); if (!win) return;
      var tot = L.reduce(function (a, r) { return a + r.tds; }, 0), base = L.reduce(function (a, r) { return a + r.base; }, 0), fn = ST.form === '138' ? 'Form 130 (old Form 16)' : 'Form 131 (old 16A)';
      win.document.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>TDS certificate working ' + esc(p) + '</title><style>body{font:13px/1.45 system-ui,sans-serif;margin:16mm}table{width:100%;border-collapse:collapse;margin:8px 0}th,td{border:1px solid #999;padding:5px 7px;text-align:left}.n{text-align:right}h1{font-size:18px;margin:0}' + NS.pageBoxes(false) + NS.creditCss + '</style></head><body>' +
        '<h1>' + esc(biz.name || A.bizName() || '') + '</h1><p>TAN: ' + esc(biz.tan || '—') + ' · PAN: ' + esc(biz.pan || '—') + '</p><h2>TDS certificate working, ' + esc(fn) + ', ' + esc(ST.fy + '-' + String(+ST.fy + 1).slice(2)) + ' Q' + ST.q + '</h2>' +
        '<p><b>Deductee:</b> ' + esc(p) + ' · PAN ' + esc(L[0] && L[0].pan || '—') + '</p><table><thead><tr><th>Date</th><th>Section</th><th class="n">Amount paid or credited</th><th class="n">TDS</th><th>BSR code</th><th>Challan serial</th><th>Date deposited</th></tr></thead><tbody>' +
        L.map(function (r) { var s = T.sec(r.sec); return '<tr><td>' + esc(r.date) + '</td><td>' + esc(r.form === '138' ? '392 (old 192)' : s ? s[6] + ' (old ' + s[1] + ')' : '') + '</td><td class="n">' + m0(r.base) + '</td><td class="n">' + m0(r.tds) + '</td><td>' + esc(r.ch ? r.ch.bsr : '') + '</td><td>' + esc(r.ch ? r.ch.serial : '') + '</td><td>' + esc(r.ch ? r.ch.date : 'not paid') + '</td></tr>'; }).join('') +
        '</tbody><tfoot><tr><th colspan="2">Total</th><th class="n">' + m0(base) + '</th><th class="n">' + m0(tot) + '</th><th colspan="3"></th></tr></tfoot></table>' +
        '<p>This is a working from the books. The certificate itself is downloaded from the TRACES portal after the quarterly statement is filed' + (ST.form === '138' ? '; Part B (the tax working) is under Employees › Salary TDS › Working.' : '.') + '</p>' + NS.creditDoc() + '<script>window.print()<\/script></body></html>');
      win.document.close();
    }); });
    var x = $('[data-trxl]', pane); if (x) x.addEventListener('click', function () {
      var w = work(); if (exportStatement(w)) return; var ann = w.tcs ? [['Collectee name', 'PAN', 'Date of collection', 'Amount received or debited', 'Rate', 'TCS', 'Collection code', 'Bill no.', 'BSR code', 'Challan serial', 'Date deposited']].concat(w.map.rows.map(function (r) { return [r.party, r.pan, r.date, r.base, r.rate, r.tds, '', r.no, r.ch ? r.ch.bsr : '', r.ch ? r.ch.serial : '', r.ch ? r.ch.date : '']; })) : T.annexure(w.map.rows), chs = [['BSR code', 'Challan serial', 'Date of deposit', 'Minor head', 'Tax', 'Interest', 'Fee', 'Linked TDS', 'Not linked']].concat(w.map.challans.map(function (c) { var d = w.chDocs.filter(function (y) { return y.id === c.id; })[0] || {}; return [c.bsr, c.serial, c.date, c.minor, c.tax, num(d['int']), num(d.fee), c.used, c.left]; }));
      var fn = (w.tcs ? 'tcs-' : 'tds-') + fname(ST.form).replace(/\W+/g, '-').replace(/-+$/, '').toLowerCase() + '-' + ST.fy + '-Q' + ST.q + '.xlsx';
      NS.loadLazy(['xlsx.js']).then(function () { NS.saveFile(NS.xlsx.write([[w.tcs ? 'Collectees' : 'Deductees', ann], ['Challans', chs]]), fn); NS.toast(F('saved', { f: fn })); }, function () { NS.toast(F('noxl'), 'bad'); });
    });
  }
  /* one file for the quarter, in the department's own layout (owner 20 Nov): About (who, which statement, totals, what to check),
     Part B challans (columns A to K) and the Annexure (Form 140/138/144 columns A to Q, Form 143 columns A to U) with the official
     4-digit section or collection codes of the Income-tax Rules, 2026. The department's utility still makes the upload file (FVU). */
  function exportStatement(w) {
    var b = A.biz() || {}, rows = w.tcs ? w.map.rows.concat(w.decl || []).sort(function (x, y) { return x.date < y.date ? -1 : 1; }) : w.map.rows;
    var st = T.statement({ rows: rows, tcs: !!w.tcs, chExtra: function (c) { var d = w.chDocs.filter(function (y) { return y.id === c.id; })[0] || {}; return { int: d['int'], fee: d.fee, oth: d.oth || d.pen }; } });
    var noCode = rows.filter(function (r) { return w.tcs ? !r.code : !T.code(r); }).length, noPan = rows.filter(function (r) { return !r.pan; }).length, noCh = rows.filter(function (r) { return !r.decl && !r.ch; }).length;
    var tot = rows.reduce(function (a, r) { return a + r.tds; }, 0), qEnd = T.ddmm(w.q.to);
    var about = [['Form', fname(ST.form) + ': ' + FORMS[ST.form][2]], ['Tax year', ST.fy + '-' + String(+ST.fy + 1).slice(2)], ['Quarter', 'Q' + ST.q + ' (quarter ended ' + qEnd + ')'],
      [w.tcs ? 'Collector' : 'Deductor', b.name || ''], ['TAN', b.tan || '(add the TAN in My data › Businesses)'], ['PAN', String(b.pan || (b.gstin ? String(b.gstin).slice(2, 12) : '') || '').toUpperCase()],
      ['Address', [b.addr, b.city, b.pin].filter(Boolean).join(', ')], ['Statement due by', T.ddmm(w.q.due)],
      [w.tcs ? 'Collectee rows' : 'Deductee rows', rows.length], [w.tcs ? 'Total tax collected' : 'Total tax deducted', NS.r2(tot)], ['Challans', st.chRows.length], [],
      ['Before filing', [noCode ? noCode + ' row(s) with no ' + (w.tcs ? 'collection' : 'section') + ' code: pick it on the bill.' : '', noPan ? noPan + ' row(s) with no PAN (PANNOTAVBL): the higher rate applies, remark C.' : '', noCh ? noCh + ' row(s) not yet linked to a paid challan.' : ''].filter(Boolean).join(' ') || 'Nothing missing.'],
      ['Codes', w.tcs ? 'Collection codes of Form No. 143, Note 9 (1068 liquor, 1069 tendu leaves, 1070-1072 timber and forest produce, 1073 scrap, 1074 coal, lignite or iron ore, 1075-1085 motor vehicle and notified goods, 1088-1089 overseas tour, 1090-1092 parking lot, toll plaza, mine or quarry). Remark B = buyer gave Form No. 127 (section 394(2)); C = no PAN (section 397(2)); A = lower-collection certificate.' : 'Section codes of Form No. 140, Note 15 (for example 1023/1024 contractors, 1026 technical fees, 1027 professional fees, 1028 director, 1006 commission, 1008 rent of machinery, 1009 rent of land or building, 1022 interest, 1031 purchase of goods, 1067 partner; salary 1002). Remark A = lower or no deduction certificate; C = no PAN.'],
      ['Source', 'Income-tax Rules, 2026 (G.S.R. 198(E), 20 March 2026), Form No. ' + ST.form + ' and its Notes.'],
      ['How to file', 'Type or paste these rows into the department\'s Return Preparation Utility for Form No. ' + ST.form + ', validate with the File Validation Utility (FVU), then upload on the income-tax portal or at a TIN facilitation centre.'],
      ['Made by', NS.creditText || 'NSBiz by Nivesh Sahayak']];
    var fn = (w.tcs ? 'TCS' : 'TDS') + ' Form ' + ST.form + ' ' + ST.fy + '-' + String(+ST.fy + 1).slice(2) + ' Q' + ST.q + '.xlsx';
    NS.loadLazy(['xlsx.js']).then(function () {
      NS.saveFile(NS.xlsx.write([['About', about], ['Part B Challans', [st.chHead].concat(st.chRows)], [w.tcs ? 'Annexure Collectees' : 'Annexure Deductees', [st.head].concat(st.ann)]]), fn);
      NS.toast(F('saved', { f: fn }));
    }, function () { NS.toast(F('noxl'), 'bad'); });
    return true;
  }
  A.addSection('tdsr', html, wire);
  function menu() {
    var nav = $('.hub-nav'), app = $('#app'); if (!nav || !app || app.getAttribute('data-secs') || $('[data-sec="tdsr"]', nav)) return;
    var at = $('[data-sec="stf"]', nav) || $('[data-sec="acx"]', nav), a = NS.el('a', { href: '#tdsr', 'data-sec': 'tdsr' }, '<span>' + esc(F('title')) + '</span>');
    if (at && at.nextSibling) nav.insertBefore(a, at.nextSibling); else nav.appendChild(a);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', menu); else menu();
  setTimeout(menu, 400);
})();

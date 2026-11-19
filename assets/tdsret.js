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
  var FORMS = { '140': ['140', '26Q', 'TDS other than salary (residents)'], '138': ['138', '24Q', 'TDS on salary'], '144': ['144', '27Q', 'TDS on payments to non-residents'] };
  var FORMSRC = 'Form numbers: Income-tax Rules, 2026, rule 219 (G.S.R. 198(E), 20 March 2026), checked 19 Nov 2026. Late fee: s.427 of the Income-tax Act, 2025; interest: s.398(3)(a).';
  var fyNow = (function () { var d = NS.today(), y = +d.slice(0, 4), m = +d.slice(5, 7); return String(m >= 4 ? y : y - 1); })();
  var ST = { fy: fyNow, q: T.quarterOf(NS.today()), form: '140', filed: '' };
  function fname(f) { var x = FORMS[f]; return 'Form ' + x[0] + ' (old ' + x[1] + ')'; }
  function work() {
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
    var w = work(), m = w.map, ys = [+fyNow, +fyNow - 1, +fyNow - 2];
    var bar = '<div class="pr-bar tr-bar"><label>' + esc(F('year')) + ' <select id="tr-fy">' + ys.map(function (y) { return '<option value="' + y + '"' + (String(y) === ST.fy ? ' selected' : '') + '>' + y + '-' + String(y + 1).slice(2) + '</option>'; }).join('') + '</select></label>' +
      '<label>' + esc(F('quarter')) + ' <select id="tr-q">' + [1, 2, 3, 4].map(function (q) { return '<option value="' + q + '"' + (q === +ST.q ? ' selected' : '') + '>Q' + q + '</option>'; }).join('') + '</select></label>' +
      '<label>' + esc(F('form')) + ' <select id="tr-form">' + Object.keys(FORMS).map(function (f) { return '<option value="' + f + '"' + (f === ST.form ? ' selected' : '') + '>' + esc(fname(f) + ' · ' + FORMS[f][2]) + '</option>'; }).join('') + '</select></label></div>';
    var chOpts = function (r) { return '<select data-trch="' + esc(r.id) + '" aria-label="' + esc(F('challan')) + '"><option value="">' + esc(F('auto')) + '</option>' + m.challans.map(function (c) { return '<option value="' + esc(c.id) + '"' + (r.ch && r.ch.id === c.id && c.alloc.indexOf(r.id) >= 0 ? ' selected' : '') + '>' + esc((c.bsr || '—') + ' / ' + (c.serial || '—') + ' · ' + A.ldate(c.date) + ' · ' + m0(c.tax)) + '</option>'; }).join('') + '</select>'; };
    var rows = m.rows.length ? '<div class="tbl-wrap"><table class="tbl pw-t"><thead><tr><th>' + esc(A.T('date')) + '</th><th>' + esc(F('party')) + '</th><th>PAN</th><th>' + esc(F('sec')) + '</th><th class="n">' + esc(F('base')) + '</th><th class="n">TDS</th><th>' + esc(F('due')) + '</th><th>' + esc(F('challan')) + '</th><th class="n">' + esc(F('int')) + '</th></tr></thead><tbody>' +
      m.rows.map(function (r) {
        var s = T.sec(r.sec);
        return '<tr' + (!r.ch || r.late || !r.pan ? ' class="pr-bad"' : '') + '><td>' + esc(A.ldate(r.date)) + '</td><th scope="row">' + esc(r.party) + '<small class="soft"> · ' + esc(A.docName ? r.src : r.src) + ' ' + esc(r.no || '') + '</small></th><td dir="ltr">' + esc(r.pan || '—') + '</td><td>' + esc(r.form === '138' ? '392 (old 192)' : s ? s[6] + ' (old ' + s[1] + ')' : '—') + '</td>' +
          '<td class="n">' + m0(r.base) + '</td><td class="n"><b>' + m0(r.tds) + '</b></td><td>' + esc(A.ldate(r.due)) + '</td><td>' + (r.ch ? '<span class="pill' + (r.late ? ' warn' : ' ok') + '">' + esc(A.ldate(r.paid)) + '</span> ' : '<span class="pill warn">' + esc(F('notpaid')) + '</span> ') + chOpts(r) + '</td><td class="n">' + (r.intDeposit ? m0(r.intDeposit) : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="soft">' + esc(F('none')) + '</p>';
    var cks = w.checks.length ? '<div class="card"><h3>' + esc(F('checks', { n: w.checks.length })) + '</h3><ul class="rows">' + w.checks.slice(0, 60).map(function (c) { return '<li><span>' + esc(F('ck_' + c.k, { p: c.r.party, d: A.ldate(c.r.date), t: m0(c.r.tds) })) + '</span></li>'; }).join('') + '</ul></div>' : (m.rows.length ? '<p class="pill ok">' + esc(F('allok')) + '</p>' : '');
    var chs = '<div class="card"><h3>' + esc(F('challans')) + '</h3>' + (m.challans.length ? '<ul class="rows">' + m.challans.map(function (c) { return '<li><span>' + esc(F('chline', { b: c.bsr || '—', s: c.serial || '—', d: A.ldate(c.date), n: c.no })) + (c.bsr ? '' : ' <span class="pill warn">' + esc(F('nobsr')) + '</span>') + '</span><b class="amt">' + esc(F('used', { u: m0(c.used), t: m0(c.tax) })) + '</b></li>'; }).join('') + '</ul>' : '<p class="soft">' + esc(F('noch')) + '</p>') +
      '<p><a class="btn sm" href="#acx">' + esc(F('paych')) + ' ›</a></p></div>';
    var fee = T.lateFee(w.q.due, ST.filed, w.tds);
    var sum = '<ul class="rows pw-tot"><li><span>' + esc(F('tdsq')) + '</span><b class="amt">' + money(w.tds) + '</b></li><li><span>' + esc(F('short')) + '</span><b class="amt">' + money(m.short) + '</b></li><li><span>' + esc(F('intq')) + '</span><b class="amt">' + money(w.intr) + '</b></li><li><span>' + esc(F('stdue')) + '</span><b>' + esc(A.ldate(w.q.due)) + '</b></li></ul>' +
      '<div class="fg"><div class="f"><label for="tr-filed">' + esc(F('filed')) + '</label><input type="date" id="tr-filed" value="' + esc(ST.filed) + '"><small class="soft">' + esc(F('filedh')) + '</small></div></div>' + (fee ? '<p class="callout">' + esc(F('fee', { a: money(fee) })) + '</p>' : '');
    /* S-23: certificate working per deductee for this quarter (Form 131, old 16A; Form 130, old Form 16, for salary): the deductions and
       the challans that paid them, to check against the certificate downloaded from TRACES */
    var by = {}; m.rows.forEach(function (r) { (by[r.party] = by[r.party] || []).push(r); });
    var certs = Object.keys(by).length ? '<div class="card"><h3>' + esc(F('certs', { f: ST.form === '138' ? 'Form 130 (old Form 16)' : 'Form 131 (old 16A)' })) + '</h3><ul class="rows">' + Object.keys(by).sort().map(function (p) {
      var t = by[p].reduce(function (a, r) { return a + r.tds; }, 0); return '<li><span>' + esc(p) + ' <span class="soft">' + esc(by[p][0].pan || '—') + '</span></span><b class="amt">' + m0(t) + '</b> <button type="button" class="btn sm" data-trcert="' + esc(p) + '" data-ic="print">' + esc(F('certp')) + '</button></li>'; }).join('') + '</ul><p class="soft">' + esc(F('certh')) + '</p></div>' : '';
    return '<div class="pane-hd"><h2>' + esc(F('title')) + '</h2><div class="quick"><button type="button" class="btn primary" data-trxl data-ic="download">' + esc(F('xl')) + '</button></div></div><p class="soft">' + esc(F('intro')) + '</p>' + bar + sum + cks + rows + chs + certs +
      '<p class="soft">' + esc(F('rules')) + '</p><p class="soft">' + esc(FORMSRC) + '</p>';
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
      win.document.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>TDS certificate working ' + esc(p) + '</title><style>body{font:13px/1.45 system-ui,sans-serif;margin:16mm}table{width:100%;border-collapse:collapse;margin:8px 0}th,td{border:1px solid #999;padding:5px 7px;text-align:left}.n{text-align:right}h1{font-size:18px;margin:0}</style></head><body>' +
        '<h1>' + esc(biz.name || A.bizName() || '') + '</h1><p>TAN: ' + esc(biz.tan || '—') + ' · PAN: ' + esc(biz.pan || '—') + '</p><h2>TDS certificate working, ' + esc(fn) + ', ' + esc(ST.fy + '-' + String(+ST.fy + 1).slice(2)) + ' Q' + ST.q + '</h2>' +
        '<p><b>Deductee:</b> ' + esc(p) + ' · PAN ' + esc(L[0] && L[0].pan || '—') + '</p><table><thead><tr><th>Date</th><th>Section</th><th class="n">Amount paid or credited</th><th class="n">TDS</th><th>BSR code</th><th>Challan serial</th><th>Date deposited</th></tr></thead><tbody>' +
        L.map(function (r) { var s = T.sec(r.sec); return '<tr><td>' + esc(r.date) + '</td><td>' + esc(r.form === '138' ? '392 (old 192)' : s ? s[6] + ' (old ' + s[1] + ')' : '') + '</td><td class="n">' + m0(r.base) + '</td><td class="n">' + m0(r.tds) + '</td><td>' + esc(r.ch ? r.ch.bsr : '') + '</td><td>' + esc(r.ch ? r.ch.serial : '') + '</td><td>' + esc(r.ch ? r.ch.date : 'not paid') + '</td></tr>'; }).join('') +
        '</tbody><tfoot><tr><th colspan="2">Total</th><th class="n">' + m0(base) + '</th><th class="n">' + m0(tot) + '</th><th colspan="3"></th></tr></tfoot></table>' +
        '<p>This is a working from the books. The certificate itself is downloaded from the TRACES portal after the quarterly statement is filed' + (ST.form === '138' ? '; Part B (the tax working) is under Staff › Salary TDS › Working.' : '.') + '</p><p style="color:#555;font-size:11px">Designed &amp; Developed by: Nivesh Sahayak</p><script>window.print()<\/script></body></html>');
      win.document.close();
    }); });
    var x = $('[data-trxl]', pane); if (x) x.addEventListener('click', function () {
      var w = work(), ann = T.annexure(w.map.rows), chs = [['BSR code', 'Challan serial', 'Date of deposit', 'Minor head', 'Tax', 'Interest', 'Fee', 'Linked TDS', 'Not linked']].concat(w.map.challans.map(function (c) { var d = w.chDocs.filter(function (y) { return y.id === c.id; })[0] || {}; return [c.bsr, c.serial, c.date, c.minor, c.tax, num(d['int']), num(d.fee), c.used, c.left]; }));
      var fn = 'tds-' + fname(ST.form).replace(/\W+/g, '-').replace(/-+$/, '').toLowerCase() + '-' + ST.fy + '-Q' + ST.q + '.xlsx';
      NS.loadLazy(['xlsx.js']).then(function () { NS.saveFile(NS.xlsx.write([['Deductees', ann], ['Challans', chs]]), fn); NS.toast(F('saved', { f: fn })); }, function () { NS.toast(F('noxl'), 'bad'); });
    });
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

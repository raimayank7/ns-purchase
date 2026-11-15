/* Payroll in the App's Staff area (gap-pay): three more tabs after Employees, added through A.staffExt of staff.js.
     #stf/att  Attendance   a sheet per month (employees x days: tap a day to change it), calendar view of one employee, bulk marking,
                            weekly offs and holidays, Excel/CSV export and import; the paid days go to the salary slip and the salary register.
     #stf/pf   PF return    the month's salary slips become the ECR text file (11 fields joined by #~#) and the challan working.
     #stf/esi  ESI          the monthly contribution sheet (Excel/CSV) and the challan working.
   Maths and file layouts: engine/payrollcore.js (NSPayroll, tested by scripts/test_payroll.js). Screen words: NS.t('pr.*'). Everything stays in the data home. */
(function () {
  'use strict';
  var SHEETJS = ['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw'];
  var A = window.NSApp, S = window.NSStaff, P = window.NSPayroll, B = window.NSBooks; if (!A || !A.staffExt || !S || !P || !B) return;
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, num = NS.num, money = NS.money;
  function F(k, v) { return NS.t('pr.' + k, v); }
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function curYm() { return NS.today().slice(0, 7); }
  var ST = { ym: curYm(), ready: false, emps: [], att: null, cfg: null, view: 'grid', calEmp: '', sig: '' };
  var saveT = 0;

  /* ---------- data ---------- */
  function load() {
    var biz = A.bizName() || '';
    return Promise.all([S.list(biz), P.Store.att(), P.Store.cfg()]).then(function (r) {
      var sig = biz + '|' + r[0].map(function (e) { return e.id + ':' + (e.updated || 0); }).join(',') + '|' + JSON.stringify(r[2]).length + '|' + JSON.stringify(r[1]).length;
      var was = ST.sig; ST.emps = r[0]; ST.att = r[1]; ST.cfg = r[2]; ST.ready = true; ST.sig = sig;
      if (was !== sig && /^#stf\/(att|pf|esi)/.test(location.hash) && !ST.busy) A.show();
    });
  }
  function saveAtt() { clearTimeout(saveT); saveT = setTimeout(function () { ST.busy = 1; P.Store.saveAtt(ST.att).then(function () { ST.busy = 0; }); }, 350); }
  function saveCfg() { return P.Store.saveCfg(ST.cfg); }
  function month() { return ST.att.months[ST.ym] = ST.att.months[ST.ym] || {}; }
  function active() {
    var first = ST.ym + '-01', last = ST.ym + '-' + String(P.daysIn(ST.ym)).padStart(2, '0');
    return ST.emps.filter(function (e) { return !(e.left && e.left < first) && !(e.doj && e.doj > last); });
  }
  function slipsOf(ym) { return A.mine().filter(function (d) { return d.type === 'salary' && d.month === ym; }); }
  function slipFor(e, ym) {
    var k = key(e.name), L = slipsOf(ym).filter(function (d) { return key(B.partyName(d)) === k; }).sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    return L[0] || null;
  }
  function monthTitle(ym) { return new Date(ym + '-01T00:00:00').toLocaleDateString(NS.lang && NS.lang() !== 'en' ? NS.lang() : 'en-IN', { month: 'long', year: 'numeric' }); }
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function head(cur) {
    return '<div class="pr-bar"><label class="pr-m">' + esc(F('month')) + ' <input type="month" id="pr-ym" value="' + esc(ST.ym) + '"></label>' + (cur ? '' : '') + '</div>';
  }
  function loading() { return '<p class="soft">' + esc(F('loading')) + '</p>'; }
  function dl(text, name, type) { NS.saveFile(new Blob([text], { type: type || 'text/plain' }), name); NS.toast(F('saved', { f: name })); }
  function bindMonth(pane) { var m = $('#pr-ym', pane); if (m) m.addEventListener('change', function () { if (m.value) { ST.ym = m.value; A.show(); } }); }
  function note(k) { return '<p class="pr-note">' + esc(F(k)) + '</p>'; }

  /* ================= attendance ================= */
  var LABEL = { P: 'P', A: 'A', H: 'H', PL: 'PL', UL: 'UL', HOL: 'HOL', WO: 'WO', NA: '·' };
  function cell(e, d, rec) {
    var c = P.dayCode(rec, ST.ym, d, ST.att.cfg, e), mark = rec && rec.d && rec.d[d] ? 1 : 0;
    return '<button type="button" class="pr-c c-' + (c || 'none') + (mark ? ' mk' : '') + '" data-e="' + esc(e.id) + '" data-d="' + d + '" title="' + esc(e.name + ' · ' + d + ' ' + (c ? F('code_' + c) : F('code_none'))) + '"' + (c === 'NA' ? ' disabled' : '') + '>' + esc(c ? LABEL[c] : '') + '</button>';
  }
  function sumCells(e) {
    var rec = month()[e.id], s = P.summary(rec, ST.ym, ST.att.cfg, e);
    return '<td class="n" data-s="P">' + s.P + '</td><td class="n" data-s="A">' + (s.A + s.UL) + '</td><td class="n" data-s="paid"><b>' + s.paid + '</b></td><td class="n"><input class="pr-ot" data-ot="' + esc(e.id) + '" inputmode="decimal" value="' + esc(rec && rec.ot || '') + '" aria-label="' + esc(F('ot')) + '"></td><td class="n" data-s="un">' + (s.unmarked || '') + '</td>';
  }
  function gridHtml() {
    var n = P.daysIn(ST.ym), E = active(), d, h = '<th>' + esc(F('emp')) + '</th>';
    for (d = 1; d <= n; d++) h += '<th class="n pr-dh' + (P.weekday(ST.ym, d) === 0 ? ' sun' : '') + '">' + d + '<small>' + DAYS[P.weekday(ST.ym, d)].charAt(0) + '</small></th>';
    return '<div class="tbl-wrap"><table class="tbl pr-grid"><thead><tr>' + h + '<th class="n">' + esc(F('s_p')) + '</th><th class="n">' + esc(F('s_a')) + '</th><th class="n">' + esc(F('s_paid')) + '</th><th class="n">' + esc(F('ot')) + '</th><th class="n">' + esc(F('s_un')) + '</th></tr></thead><tbody>' +
      E.map(function (e) {
        var rec = month()[e.id], r = '<th scope="row">' + esc(e.name) + '</th>';
        for (d = 1; d <= n; d++) r += '<td>' + cell(e, d, rec) + '</td>';
        return '<tr data-row="' + esc(e.id) + '">' + r + sumCells(e) + '</tr>';
      }).join('') + '</tbody></table></div>';
  }
  function calHtml() {
    var E = active(), e = E.filter(function (x) { return x.id === ST.calEmp; })[0] || E[0]; if (!e) return '';
    ST.calEmp = e.id;
    var n = P.daysIn(ST.ym), lead = P.weekday(ST.ym, 1), rec = month()[e.id], h = '', i;
    h += '<label class="pr-m">' + esc(F('emp')) + ' <select id="pr-cal">' + E.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === e.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></label>';
    h += '<div class="pr-cal" data-calfor="' + esc(e.id) + '">' + DAYS.map(function (x) { return '<b>' + x + '</b>'; }).join('');
    for (i = 0; i < lead; i++) h += '<i></i>';
    for (i = 1; i <= n; i++) h += '<div class="pr-cd"><span>' + i + '</span>' + cell(e, i, rec) + '</div>';
    var s = P.summary(rec, ST.ym, ST.att.cfg, e);
    return h + '</div><p class="soft" data-calsum>' + esc(F('calsum', { p: s.paid, d: s.days, a: s.lop })) + '</p>';
  }
  function legend() {
    return '<p class="pr-legend">' + P.CODES.map(function (c) { return '<span class="pr-c c-' + c + '">' + LABEL[c] + '</span> ' + esc(F('code_' + c)); }).join(' · ') + '</p><p class="soft">' + esc(F('tap')) + '</p>';
  }
  function settingsHtml() {
    var cfg = ST.att.cfg, hol = Object.keys(cfg.hol || {}).sort();
    return '<details class="card pr-set"><summary>' + esc(F('setup')) + '</summary><p class="soft">' + esc(F('woh')) + '</p><div class="pr-wo">' + DAYS.map(function (d, i) {
      return '<label class="chk"><input type="checkbox" data-wo="' + i + '"' + ((cfg.wo || []).indexOf(i) >= 0 ? ' checked' : '') + '> ' + d + '</label>';
    }).join('') + '</div><h4>' + esc(F('hol')) + '</h4><ul class="rows">' + (hol.length ? hol.map(function (d) {
      return '<li><span>' + esc(NS.fmtDate ? NS.fmtDate(d) : d) + ' · ' + esc(cfg.hol[d]) + '</span><button type="button" class="btn sm danger" data-holdel="' + esc(d) + '">' + esc(NS.t('app.del')) + '</button></li>';
    }).join('') : '<li class="soft">' + esc(F('nohol')) + '</li>') + '</ul><div class="fg"><div class="f"><label for="pr-hd">' + esc(F('holdate')) + '</label><input id="pr-hd" type="date"></div><div class="f"><label for="pr-hn">' + esc(F('holname')) + '</label><input id="pr-hn"></div></div><button type="button" class="btn sm" data-holadd>+ ' + esc(F('holadd')) + '</button></details>';
  }
  function attHtml() {
    if (!ST.ready) return loading();
    var E = active();
    var tools = '<div class="acts pr-tools"><button type="button" class="btn sm' + (ST.view === 'grid' ? ' primary' : '') + '" data-view="grid">' + esc(F('v_grid')) + '</button><button type="button" class="btn sm' + (ST.view === 'cal' ? ' primary' : '') + '" data-view="cal">' + esc(F('v_cal')) + '</button>' +
      '<button type="button" class="btn sm" data-allp>' + esc(F('allp')) + '</button><button type="button" class="btn sm" data-xl>' + esc(F('exp_xl')) + '</button><button type="button" class="btn sm" data-csv>' + esc(F('exp_csv')) + '</button>' +
      '<label class="btn sm">' + esc(F('imp')) + '<input type="file" accept=".csv,.xlsx,text/csv" data-imp hidden></label></div>';
    var bulk = '<div class="pr-bulk"><span>' + esc(F('bulk')) + '</span> <input id="pr-bd" type="number" min="1" max="' + P.daysIn(ST.ym) + '" placeholder="' + esc(F('day')) + '" aria-label="' + esc(F('day')) + '"> <select id="pr-bc">' + P.CODES.map(function (c) { return '<option value="' + c + '">' + esc(F('code_' + c)) + '</option>'; }).join('') + '<option value="">' + esc(F('code_none')) + '</option></select> <button type="button" class="btn sm" data-bulk>' + esc(F('apply')) + '</button></div>';
    if (!E.length) return '<p class="soft">' + esc(F('intro')) + '</p>' + head() + '<p class="soft">' + esc(F('noemp')) + '</p><p><a class="btn sm" href="#stf/emp">' + esc(F('addemp')) + '</a></p>';
    return '<p class="soft">' + esc(F('intro')) + '</p>' + head() + tools + (ST.view === 'cal' ? calHtml() : gridHtml()) + legend() + bulk + '<p class="soft" data-msg aria-live="polite"></p>' + settingsHtml();
  }
  function msg(pane, t) { var m = $('[data-msg]', pane); if (m) m.textContent = t; }
  function refreshRow(pane, e) {
    var row = $('[data-row="' + e.id + '"]', pane);
    if (row) { var tds = $$('td', row), keep = tds.slice(0, P.daysIn(ST.ym)).map(function (t) { return t.outerHTML; }).join(''); row.innerHTML = '<th scope="row">' + esc(e.name) + '</th>' + keep + sumCells(e); }
  }
  function cellRefresh(pane, e, d) {
    var rec = month()[e.id], btn = $('button[data-e="' + e.id + '"][data-d="' + d + '"]', pane);
    if (btn) btn.outerHTML = cell(e, d, rec);
    if (ST.view === 'grid') { var tr = $('[data-row="' + e.id + '"]', pane); if (tr) { var t = document.createElement('tbody'); t.innerHTML = '<tr>' + sumCells(e) + '</tr>'; var nw = $$('td', t.firstChild), old = $$('td', tr).slice(-5); nw.forEach(function (x, i) { old[i].innerHTML = x.innerHTML; }); } }
    else { var s = P.summary(rec, ST.ym, ST.att.cfg, e), c = $('[data-calsum]', pane); if (c) c.textContent = F('calsum', { p: s.paid, d: s.days, a: s.lop }); }
  }
  function attBind(pane) {
    bindMonth(pane);
    var cfg = ST.att.cfg;
    if (!pane._prClick) pane.addEventListener('click', pane._prClick = function (ev) {   /* one listener per pane: the pane is drawn again, not replaced */
      var b = ev.target.closest('button.pr-c[data-e]'); if (!b || b.disabled) return;
      var e = ST.emps.filter(function (x) { return x.id === b.getAttribute('data-e'); })[0], d = +b.getAttribute('data-d'); if (!e) return;
      var rec = month()[e.id] = month()[e.id] || { d: {} };
      var cur = P.dayCode(rec, ST.ym, d, cfg, e);
      P.setDay(rec, d, P.next(rec.d && rec.d[d] ? rec.d[d] : cur === 'WO' || cur === 'HOL' ? cur : ''));
      cellRefresh(pane, e, d); saveAtt();
    });
    $$('[data-view]', pane).forEach(function (b) { b.addEventListener('click', function () { ST.view = b.getAttribute('data-view'); A.show(); }); });
    var cs = $('#pr-cal', pane); if (cs) cs.addEventListener('change', function () { ST.calEmp = cs.value; A.show(); });
    var ap = $('[data-allp]', pane); if (ap) ap.addEventListener('click', function () { var m = month(); active().forEach(function (e) { m[e.id] = P.fillPresent(m[e.id] || { d: {} }, ST.ym, cfg, e); }); saveAtt(); A.show(); NS.toast(F('allpdone')); });
    var bk = $('[data-bulk]', pane); if (bk) bk.addEventListener('click', function () {
      var d = Math.round(num($('#pr-bd', pane).value)); if (d < 1 || d > P.daysIn(ST.ym)) { NS.toast(F('badday'), 'bad'); return; }
      var code = $('#pr-bc', pane).value; P.markDay(month(), active().map(function (e) { return e.id; }), d, code); saveAtt(); A.show(); NS.toast(F('bulkdone', { d: d }));
    });
    $$('input[data-ot]', pane).forEach(function (i) { i.addEventListener('input', function () { var id = i.getAttribute('data-ot'); var rec = month()[id] = month()[id] || { d: {} }; rec.ot = i.value; saveAtt(); }); });
    function rows() { return P.sheetRows(ST.ym, active(), month(), cfg); }
    var cv = $('[data-csv]', pane); if (cv) cv.addEventListener('click', function () { dl('﻿' + P.toCsv(rows()), 'attendance-' + ST.ym + '.csv', 'text/csv'); });
    var xl = $('[data-xl]', pane); if (xl) xl.addEventListener('click', function () {
      NS.loadLazy(['xlsx.js']).then(function () { NS.saveFile(NS.xlsx.write([['Attendance ' + ST.ym, rows()], [F('howsheet'), [[F('howhead')]].concat(P.CODES.map(function (c) { return [c + ' = ' + F('code_' + c)]; })), [90]]]), 'attendance-' + ST.ym + '.xlsx'); NS.toast(F('saved', { f: 'attendance-' + ST.ym + '.xlsx' })); }, function () { NS.toast(F('noxl'), 'bad'); });
    });
    var im = $('[data-imp]', pane); if (im) im.addEventListener('change', function () {
      var f = im.files && im.files[0]; if (!f) return;
      NS.loadLazy(['xlsx.js']).then(function () { return NS.xlsx.read(f); }).then(function (rows) {
        var r = P.parseSheet(rows, ST.ym, active());
        if (r.error) { msg(pane, F('imp_' + r.error)); return; }
        Object.keys(r.month).forEach(function (id) { month()[id] = r.month[id]; });
        saveAtt(); A.show();
        NS.toast(F('impdone', { n: r.matched }) + (r.unknown.length ? ' ' + F('impunk', { n: r.unknown.length, l: r.unknown.slice(0, 5).join(', ') }) : '') + (r.bad.length ? ' ' + F('impbad', { n: r.bad.length, l: r.bad.slice(0, 3).join('; ') }) : ''));
      }).catch(function (er) { msg(pane, F(er && er.message === 'xls' ? 'imp_xls' : 'imp_fail')); });
      im.value = '';
    });
    $$('[data-wo]', pane).forEach(function (c) { c.addEventListener('change', function () { var l = $$('[data-wo]', pane).filter(function (x) { return x.checked; }).map(function (x) { return +x.getAttribute('data-wo'); }); cfg.wo = l; saveAtt(); }); });
    var ha = $('[data-holadd]', pane); if (ha) ha.addEventListener('click', function () { var d = $('#pr-hd', pane).value, n = $('#pr-hn', pane).value.trim(); if (!d) return; cfg.hol = cfg.hol || {}; cfg.hol[d] = n || F('hol1'); saveAtt(); A.show(); });
    $$('[data-holdel]', pane).forEach(function (b) { b.addEventListener('click', function () { delete cfg.hol[b.getAttribute('data-holdel')]; saveAtt(); A.show(); }); });
  }

  /* ================= PF ================= */
  function flagsOf(e) { var f = ST.cfg.flags[e.id] = ST.cfg.flags[e.id] || {}; return f; }
  function basicOf(d) { var L = d.earn || [], l = L.filter(function (x) { return /basic/i.test(x.desc); })[0] || L[0]; return l ? num(l.amt) : 0; }
  /* days and paid days for the month: from the attendance sheet when marked, else from the slip's own boxes */
  function daysFor(e, d) {
    var sd = P.slipDays(month()[e.id], ST.ym, ST.att.cfg, e), n = P.daysIn(ST.ym);
    if (sd) return { days: sd.days, paid: sd.paid, src: 'att' };
    var dd = num(d && d.days) || n, pd = d && String(d.paid || '').trim() !== '' ? num(d.paid) : dd;
    return { days: dd, paid: pd, src: d ? 'slip' : '' };
  }
  function pfRows() {
    var cfg = ST.cfg.pf, out = [], missing = [];
    active().forEach(function (e) {
      var d = slipFor(e, ST.ym), f = flagsOf(e); if (!d) { missing.push(e.name); return; }
      var dy = daysFor(e, d), sp = B.salSplit(d), uan = e.uan || (d.emp && d.emp.uan) || '';
      if (!uan && !sp.pf) return;   /* not in the provident fund: no UAN and nothing deducted */
      var l = P.pfLine({ uan: uan, name: e.name, gross: sp.gross, basic: basicOf(d), days: dy.days, paid: dy.paid, noEps: f.noEps, full: f.full }, cfg);
      l.e = e; l.src = dy.src; out.push(l);
    });
    return { lines: out, missing: missing };
  }
  var PFERR = { uan: 'e_uan', basic: 'e_basic', name: 'e_name' };
  function setHtml(which) {
    var c = ST.cfg[which], D = which === 'pf' ? P.PF : P.ESI, fields = which === 'pf' ? [['ceil', 'f_ceil'], ['epf', 'f_epf'], ['eps', 'f_eps'], ['edli', 'f_edli'], ['admin', 'f_admin'], ['adminMin', 'f_adminmin']] : [['ceil', 'f_eceil'], ['ee', 'f_ee'], ['er', 'f_er'], ['daily', 'f_daily']];
    return '<details class="card pr-set"><summary>' + esc(F('rates')) + '</summary><p class="soft">' + esc(F(which === 'pf' ? 'rates_pf' : 'rates_esi')) + '</p><div class="fg">' + fields.map(function (f) {
      return '<div class="f"><label for="pr-s-' + f[0] + '">' + esc(F(f[1])) + '</label><input id="pr-s-' + f[0] + '" data-set="' + f[0] + '" inputmode="decimal" value="' + esc(c[f[0]] != null ? c[f[0]] : D[f[0]]) + '"></div>';
    }).join('') + '</div><button type="button" class="btn sm" data-setreset>' + esc(F('reset')) + '</button></details>';
  }
  function setBind(pane, which) {
    $$('[data-set]', pane).forEach(function (i) { i.addEventListener('change', function () { var v = num(i.value); if (v >= 0) ST.cfg[which][i.getAttribute('data-set')] = v; saveCfg().then(A.show); }); });
    var r = $('[data-setreset]', pane); if (r) r.addEventListener('click', function () { ST.cfg[which] = {}; saveCfg().then(A.show); });
  }
  function pfHtml() {
    if (!ST.ready) return loading();
    var R = pfRows(), L = R.lines, ok = L.filter(function (l) { return l.ok; }), ch = P.pfChallan(L, ST.cfg.pf), cfg = Object.assign({}, P.PF, ST.cfg.pf);
    var tbl = L.length ? '<div class="tbl-wrap"><table class="tbl pr-t"><thead><tr><th>' + esc(F('emp')) + '</th><th>UAN</th><th class="n">' + esc(F('gross')) + '</th><th class="n">' + esc(F('epfw')) + '</th><th class="n">' + esc(F('epsw')) + '</th><th class="n">EPF</th><th class="n">EPS</th><th class="n">' + esc(F('diff')) + '</th><th class="n">NCP</th><th>' + esc(F('flags')) + '</th></tr></thead><tbody>' +
      L.map(function (l) {
        var f = flagsOf(l.e);
        return '<tr' + (l.ok ? '' : ' class="pr-bad"') + '><th scope="row">' + esc(l.e.name) + (l.ok ? '' : '<small class="pr-err">' + esc(l.errs.map(function (k) { return F(PFERR[k]); }).join(', ')) + '</small>') + '</th><td data-l="UAN" dir="ltr">' + esc(l.uan) + '</td>' +
          '<td class="n" data-l="' + esc(F('gross')) + '">' + money(l.gross, false) + '</td><td class="n" data-l="' + esc(F('epfw')) + '">' + money(l.epfW, false) + '</td><td class="n" data-l="' + esc(F('epsw')) + '">' + money(l.epsW, false) + '</td><td class="n" data-l="EPF">' + money(l.epf, false) + '</td><td class="n" data-l="EPS">' + money(l.eps, false) + '</td><td class="n" data-l="' + esc(F('diff')) + '">' + money(l.diff, false) + '</td><td class="n" data-l="NCP">' + l.ncp + '</td>' +
          '<td class="pr-fl"><label class="chk"><input type="checkbox" data-fl="noEps" data-id="' + esc(l.e.id) + '"' + (f.noEps ? ' checked' : '') + '> ' + esc(F('fl_noeps')) + '</label><label class="chk"><input type="checkbox" data-fl="full" data-id="' + esc(l.e.id) + '"' + (f.full ? ' checked' : '') + '> ' + esc(F('fl_full')) + '</label></td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="soft">' + esc(F('noslips')) + '</p>';
    var chh = '<div class="card pr-ch"><h3>' + esc(F('challan')) + ' · ' + esc(monthTitle(ST.ym)) + '</h3><ul class="rows">' +
      [['ac01e', ch.ac01.employee], ['ac01r', ch.ac01.employer], ['ac10', ch.ac10], ['ac02', ch.ac02], ['ac21', ch.ac21], ['ac22', ch.ac22]].map(function (r) { return '<li><span>' + esc(F(r[0])) + '</span><b class="amt">' + money(r[1]) + '</b></li>'; }).join('') +
      '<li class="pr-tot"><span>' + esc(F('total')) + '</span><b class="amt">' + money(ch.total) + '</b></li></ul><p class="soft">' + esc(F('chnote', { d: cfg.due, m: ok.length })) + '</p></div>';
    return '<p class="soft">' + esc(F('pfintro')) + '</p>' + head() + (R.missing.length ? '<p class="pr-warn">' + esc(F('noslip', { n: R.missing.length, l: R.missing.slice(0, 6).join(', ') })) + '</p>' : '') +
      '<p class="pr-warn pr-unver">' + esc(F('unver_pf')) + '</p>' + tbl +
      '<div class="acts pr-tools"><button type="button" class="btn primary" data-ecr' + (ok.length ? '' : ' disabled') + '>' + esc(F('dl_ecr', { n: ok.length })) + '</button><button type="button" class="btn sm" data-ecrcopy' + (ok.length ? '' : ' disabled') + '>' + esc(F('copy')) + '</button><button type="button" class="btn sm" data-pfxl' + (L.length ? '' : ' disabled') + '>' + esc(F('exp_xl')) + '</button></div>' +
      '<p class="soft">' + esc(F('ecrhow')) + '</p>' + chh + setHtml('pf');
  }
  function flagBind(pane) {
    $$('[data-fl]', pane).forEach(function (c) { c.addEventListener('change', function () { var f = ST.cfg.flags[c.getAttribute('data-id')] = ST.cfg.flags[c.getAttribute('data-id')] || {}; f[c.getAttribute('data-fl')] = c.checked; saveCfg().then(A.show); }); });
  }
  function pfBind(pane) {
    bindMonth(pane); setBind(pane, 'pf'); flagBind(pane);
    function file() { return P.pfFile(pfRows().lines); }
    var d = $('[data-ecr]', pane); if (d) d.addEventListener('click', function () { dl(file(), 'ECR-' + ST.ym.replace('-', '') + '.txt'); });
    var c = $('[data-ecrcopy]', pane); if (c) c.addEventListener('click', function () { (navigator.clipboard ? navigator.clipboard.writeText(file()) : Promise.reject()).then(function () { NS.toast(F('copied')); }, function () { NS.toast(F('copyfail'), 'bad'); }); });
    var x = $('[data-pfxl]', pane); if (x) x.addEventListener('click', function () {
      var R = pfRows().lines, rows = [['Employee', 'UAN', 'Gross wages', 'EPF wages', 'EPS wages', 'EDLI wages', 'EPF contribution (12%)', 'EPS contribution (8.33%)', 'EPF-EPS difference', 'NCP days', 'Refund of advances']].concat(R.map(function (l) { return [l.e.name, l.uan, l.gross, l.epfW, l.epsW, l.edliW, l.epf, l.eps, l.diff, l.ncp, 0]; }));
      NS.loadLazy(['xlsx.js']).then(function () { NS.saveFile(NS.xlsx.write([['PF ' + ST.ym, rows]]), 'pf-working-' + ST.ym + '.xlsx'); }, function () { NS.toast(F('noxl'), 'bad'); });
    });
  }

  /* ================= ESI ================= */
  function esiRows() {
    var cfg = ST.cfg.esi, out = [], missing = [];
    active().forEach(function (e) {
      var d = slipFor(e, ST.ym), f = flagsOf(e);
      if (!d) {
        var ipn = String(e.esi || '').replace(/\s/g, '');
        if (!ipn) { missing.push(e.name); return; }
        var z = P.esiLine({ ip: ipn, name: e.name, gross: 0, paid: 0, days: 0, covered: false, reason: f.reason, lastDay: e.left && e.left.slice(0, 7) <= ST.ym ? e.left : '' }, cfg);
        z.e = e; z.noslip = true; out.push(z); return;
      }
      var dy = daysFor(e, d), sp = B.salSplit(d);
      var hist = []; for (var k = 1; k <= 6; k++) { var y = +ST.ym.slice(0, 4), m = +ST.ym.slice(5, 7) - k; while (m < 1) { m += 12; y--; } var ym = y + '-' + String(m).padStart(2, '0'), pd = slipFor(e, ym); if (pd) hist.push({ ym: ym, gross: B.salSplit(pd).gross }); }
      var l = P.esiLine({ ip: e.esi || (d.emp && d.emp.esi) || '', name: e.name, gross: sp.gross, paid: dy.paid, days: dy.days, covered: P.covered(hist, ST.ym, cfg), reason: f.reason, lastDay: e.left && e.left.slice(0, 7) === ST.ym ? e.left : '' }, cfg);
      l.e = e; out.push(l);
    });
    return { lines: out, missing: missing };
  }
  function esiHtml() {
    if (!ST.ready) return loading();
    var R = esiRows(), L = R.lines, ok = L.filter(function (l) { return l.ok; }), ch = P.esiChallan(L), cfg = Object.assign({}, P.ESI, ST.cfg.esi);
    var tbl = L.length ? '<div class="tbl-wrap"><table class="tbl pr-t"><thead><tr><th>' + esc(F('emp')) + '</th><th>' + esc(F('ipno')) + '</th><th class="n">' + esc(F('daysp')) + '</th><th class="n">' + esc(F('wages')) + '</th><th class="n">' + esc(F('eshare')) + '</th><th class="n">' + esc(F('rshare')) + '</th><th>' + esc(F('status')) + '</th></tr></thead><tbody>' +
      L.map(function (l) {
        var st = !l.applies && l.ok ? '<span class="pill ok">' + esc(F('st_zero')) + '</span>' : !l.applies && !l.errs.length ? '<span class="pill">' + esc(F(l.wages ? 'st_over' : 'st_zero')) + '</span>' : !l.ok ? '<span class="pill warn">' + esc(F(l.errs.indexOf('ip') >= 0 ? 'e_ip' : l.errs.indexOf('lastday') >= 0 ? 'e_lastday' : 'e_name')) + '</span>' : l.exempt ? '<span class="pill">' + esc(F('st_exempt')) + '</span>' : l.over ? '<span class="pill">' + esc(F('st_cov')) + '</span>' : '<span class="pill ok">' + esc(F('st_ok')) + '</span>';
        var zero = l.days === 0 ? '<select data-reason="' + esc(l.e.id) + '" aria-label="' + esc(F('reason')) + '"><option value="">' + esc(F('reason')) + '</option>' + P.ESI_REASONS.map(function (r) { return '<option value="' + r[0] + '"' + (String(flagsOf(l.e).reason) === String(r[0]) ? ' selected' : '') + '>' + r[0] + ' · ' + esc(r[1]) + '</option>'; }).join('') + '</select>' : '';
        return '<tr' + (l.errs.length ? ' class="pr-bad"' : '') + '><th scope="row">' + esc(l.e.name) + '</th><td data-l="' + esc(F('ipno')) + '" dir="ltr">' + esc(l.ip) + '</td><td class="n" data-l="' + esc(F('daysp')) + '">' + l.days + '</td><td class="n" data-l="' + esc(F('wages')) + '">' + money(l.wages, false) + '</td><td class="n" data-l="' + esc(F('eshare')) + '">' + money(l.ee, false) + '</td><td class="n" data-l="' + esc(F('rshare')) + '">' + money(l.er, false) + '</td><td data-l="' + esc(F('status')) + '">' + st + zero + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="soft">' + esc(F('noslips')) + '</p>';
    var chh = '<div class="card pr-ch"><h3>' + esc(F('challan_esi')) + ' · ' + esc(monthTitle(ST.ym)) + '</h3><ul class="rows"><li><span>' + esc(F('wages')) + ' (' + ch.members + ')</span><b class="amt">' + money(ch.wages) + '</b></li><li><span>' + esc(F('eshare')) + '</span><b class="amt">' + money(ch.ee) + '</b></li><li><span>' + esc(F('rshare')) + '</span><b class="amt">' + money(ch.er) + '</b></li><li class="pr-tot"><span>' + esc(F('total')) + '</span><b class="amt">' + money(ch.total) + '</b></li></ul><p class="soft">' + esc(F('chnote_esi')) + '</p></div>';
    return '<p class="soft">' + esc(F('esiintro')) + '</p>' + head() + (R.missing.length ? '<p class="pr-warn">' + esc(F('noslip', { n: R.missing.length, l: R.missing.slice(0, 6).join(', ') })) + '</p>' : '') +
      '<p class="pr-warn pr-unver">' + esc(F('unver_esi')) + '</p>' + tbl +
      '<div class="acts pr-tools"><button type="button" class="btn primary" data-esixl' + (ok.length ? '' : ' disabled') + '>' + esc(F('dl_esi', { n: ok.length })) + '</button><button type="button" class="btn sm" data-esicsv' + (ok.length ? '' : ' disabled') + '>' + esc(F('exp_csv')) + '</button></div><p class="soft">' + esc(F('esihow')) + '</p>' + chh + setHtml('esi');
  }
  function esiBind(pane) {
    bindMonth(pane); setBind(pane, 'esi');
    $$('[data-reason]', pane).forEach(function (s) { s.addEventListener('change', function () { var id = s.getAttribute('data-reason'); (ST.cfg.flags[id] = ST.cfg.flags[id] || {}).reason = s.value; saveCfg().then(A.show); }); });
    function rows() { return P.esiRows(esiRows().lines); }
    var x = $('[data-esixl]', pane); if (x) x.addEventListener('click', function () {
      var fn = 'esi-contribution-' + ST.ym + '.xls';
      NS.loadJs(SHEETJS[0], SHEETJS[1]).then(function () {
        var X = window.XLSX, ws = X.utils.aoa_to_sheet(rows()), r = X.utils.decode_range(ws['!ref']);
        for (var R = r.s.r; R <= r.e.r; R++) for (var C = r.s.c; C <= r.e.c; C++) { var c = ws[X.utils.encode_cell({ r: R, c: C })]; if (c) { c.t = 's'; c.v = String(c.v); c.z = '@'; } }
        var wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Sheet1');
        NS.saveFile(new Blob([X.write(wb, { bookType: 'biff8', type: 'array' })], { type: 'application/vnd.ms-excel' }), fn); NS.toast(F('saved', { f: fn }));
      }, function () { NS.toast(F('noxl'), 'bad'); });
    });
    var c = $('[data-esicsv]', pane); if (c) c.addEventListener('click', function () { dl('﻿' + P.toCsv(rows()), 'esi-contribution-' + ST.ym + '.csv', 'text/csv'); });
  }

  A.staffExt.att = { html: attHtml, bind: attBind };
  A.staffExt.pf = { html: pfHtml, bind: pfBind };
  A.staffExt.esi = { html: esiHtml, bind: esiBind };
  window.addEventListener('hashchange', function () { if (/^#stf\/(att|pf|esi)/.test(location.hash)) load(); });
  document.addEventListener('ns-data', load);
  load();
  A.payroll = { state: ST, load: load };
})();

/* Income tax in NSBiz (gap-money, 2026-11-14; after acctx.js and staff.js, before the end of the app engine list).
   Section 'itx' with three parts (#itx, #itx/itr, #itx/data):
     Advance tax   estimate of the year's income from the books (the profit so far carried to the whole year, or the presumptive profit of
                   44AD / 44ADA, or typed), both regimes side by side, the four instalments (15 Jun / 15 Sep / 15 Dec / 15 Mar), what is already
                   paid ('Pay tax' records of kind advance tax) and the interest of ss.424 / 425 if an instalment is missed (itcore.js)
     Which ITR    questions -> ITR-1 to ITR-7 with the reasons, a list of documents and notes
     Data sheet   figures of the books for the return or the accountant: turnover, other income, expenses by head, book profit,
                   presumptive profit, TDS credits, advance tax paid, the typed plan figures; copy, CSV, print
   Plan only: nothing is filed and nothing is posted. The typed figures are kept per business and year in meta 'itplan'.
   Screen words: NS.t('it.*'), section name NS.t('app.itx'). */
(function () {
  'use strict';
  var A = window.NSApp, X = A && A.acx, IT = window.NSIT; if (!A || !X || !IT) return;   /* NSPL (plcore.js) loads after this file: read when the screen is drawn */
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, num = NS.num, r2 = NS.r2, money = NS.money, B = NSBooks, key = B.key;
  var fld = X.fld, sel = X.sel;
  function I(k, v) { return NS.t('it.' + k, v); }
  function today() { return NS.today(); }
  var TABS = ['plan', 'itr', 'data'];
  var ST = { fy: '', plans: null, loaded: false, tab: 'plan' };   /* plans = meta 'itplan': { 'biz|fy': { inp, q } } */

  /* ---------- the year and the books ---------- */
  function years() { var f = IT.fyOf(today()), y = +f.start.slice(0, 4); return [0, 1, 2].map(function (k) { return IT.fyOf((y - k) + '-04-01'); }); }
  function curFy() { var ys = years(); return ys.filter(function (f) { return f.start === ST.fy; })[0] || ys[0]; }
  function planKey(fy) { return key(A.bizName()) + '|' + fy.start; }
  function books(fy) {
    var P = window.NSPL, D = A.data(), asOn = today() < fy.end ? today() : fy.end;
    if (asOn < fy.start) asOn = fy.start;
    var base = P.fromBooks(D.doc, D.item, A.bizName(), fy.start, asOn, {}), F = P.statements(base.rows, base.cs), pl = F.pl;
    var exp = base.rows.filter(function (r) { return ['mat', 'pur', 'emp', 'fin', 'dep', 'oth'].indexOf(r.g) >= 0 && r.dr - r.cr; }).map(function (r) { return { name: r.name, g: r.g, amt: r2(r.dr - r.cr) }; });
    if (pl.chg) exp.unshift({ name: I('stockchg'), g: 'chg', amt: pl.chg });
    return { asOn: asOn, pl: pl, rev: pl.rev, oinc: pl.oinc, exp: exp, pbt: pl.pbt, full: asOn >= fy.end };
  }
  function suggest(fy, bk) {
    var bus = r2(bk.pbt - bk.oinc), oth = bk.oinc;
    return { business: Math.round(bk.full ? bus : IT.annualise(bus, fy.start, bk.asOn, fy.end)), other: Math.round(bk.full ? oth : IT.annualise(oth, fy.start, bk.asOn, fy.end)),
      turnover: Math.round(bk.full ? bk.rev : IT.annualise(bk.rev, fy.start, bk.asOn, fy.end)) };
  }
  function slot(fy) { ST.plans = ST.plans || {}; var k = planKey(fy); return ST.plans[k] = ST.plans[k] || { inp: {}, q: {} }; }
  function persist() { NSStore.meta('itplan', ST.plans || {}).catch(function () {}); }
  function inpOf(fy, bk) {
    var s = slot(fy), sg = suggest(fy, bk), v = Object.assign({ age: 'gen', resident: true, pres: 'none', regime: 'auto', salary: '', house: '', capgain: '', ded80c: '', dedOther: '', npsEmployer: '', surcharge: '', tds: '', deferred: '', months: 4, digital: '' }, s.inp);
    if (s.inp.business == null) v.business = sg.business; if (s.inp.other == null) v.other = sg.other; if (s.inp.turnover == null) v.turnover = sg.turnover;
    if (s.inp.tds == null) v.tds = IT.tdsCredits(A.data().doc, A.bizName(), fy.start, fy.end).reduce(function (a, x) { return a + x.amt; }, 0);
    return v;
  }

  /* ---------- advance tax ---------- */
  function planCalc(fy, bk, v) {
    var pres = v.pres !== 'none', bus = pres ? IT.presumptive(v.pres, v.turnover, v.digital) : num(v.business);
    var i = { age: v.age, resident: !!v.resident, salary: num(v.salary), business: bus, house: num(v.house), other: num(v.other), capgain: num(v.capgain), ded80c: num(v.ded80c), dedOther: num(v.dedOther), npsEmployer: num(v.npsEmployer), surcharge: num(v.surcharge) };
    var T = IT.tax(i), use = v.regime === 'old' ? 'old' : v.regime === 'new' ? 'new' : T.better, R = use === 'old' ? T.old : T.nu;
    var paid = IT.paidAdvance(A.data().doc, A.bizName(), fy.start, fy.end);
    var senior = v.resident && v.age !== 'gen' && !bus;
    var adv = IT.advance({ fyStart: fy.start, tax: R.total, tds: num(v.tds), paid: paid, presumptive: pres, senior: senior, deferred: num(v.deferred), months: v.months });
    return { i: i, bus: bus, T: T, use: use, R: R, paid: paid, adv: adv, pres: pres, senior: senior };
  }
  function ro(label, o, n, strong) { return '<tr' + (strong ? ' class="b"' : '') + '><th scope="row" class="l">' + esc(label) + '</th><td class="n">' + (o == null ? '' : money(o, false)) + '</td><td class="n">' + (n == null ? '' : money(n, false)) + '</td></tr>'; }
  function resultHtml(fy, bk, v) {
    var C = planCalc(fy, bk, v), T = C.T, a = C.adv, R = C.R, msg = [];
    if (C.senior) msg.push(I('m_senior'));
    else if (a.below) msg.push(I('m_below', { n: money(a.due) }));
    if (C.pres) msg.push(I('m_pres'));
    if (v.pres === 'ad' && num(v.turnover) > 20000000) msg.push(I('m_adlim'));   /* s.58, old 44AD (F3-14) */
    if (v.pres === 'ada' && num(v.turnover) > 5000000) msg.push(I('m_adalim'));
    if (R.surchargeWarn) msg.push(I('m_sur'));
    if (fy.start < IT.fyOf(today()).start) msg.push(I('m_past'));
    if (a.payable && !C.pres && v.pres === 'none' && C.bus && fy.start === IT.fyOf(today()).start && !bk.full) msg.push(I('m_season'));
    var tiles = '<div class="tiles"><div class="tile"><span>' + esc(I('t_ti')) + '</span><b>' + money(R.ti) + '</b></div><div class="tile' + (C.use === 'new' ? ' ok' : '') + '"><span>' + esc(I('t_new')) + '</span><b>' + money(T.nu.total) + '</b></div>' +
      '<div class="tile' + (C.use === 'old' ? ' ok' : '') + '"><span>' + esc(I('t_old')) + '</span><b>' + money(T.old.total) + '</b></div><div class="tile' + (a.payable ? ' warn' : '') + '"><span>' + esc(I('t_adv', { r: I(C.use === 'old' ? 'r_old' : 'r_new') })) + '</span><b>' + money(a.payable ? a.due : 0) + '</b></div></div>';
    var reg = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l"></th><th class="n">' + esc(I('r_new')) + '</th><th class="n">' + esc(I('r_old')) + '</th></tr></thead><tbody>' +
      ro(I('x_gross'), T.nu.gross, T.old.gross) + ro(I('x_ded'), T.nu.ded, T.old.ded) + ro(I('x_ti'), T.nu.ti, T.old.ti, 1) + ro(I('x_slab'), T.nu.base, T.old.base) + ro(I('x_reb'), T.nu.rebate, T.old.rebate) +
      ro(I('x_sur'), T.nu.surcharge, T.old.surcharge) + ro(I('x_cess'), T.nu.cess, T.old.cess) + ro(I('x_total'), T.nu.total, T.old.total, 1) + '</tbody></table></div>' +
      '<p class="sb-note">' + esc(I('better', { r: I(T.better === 'new' ? 'r_new' : 'r_old'), n: money(T.saving, false) })) + '</p>';
    var sched = '';
    if (a.payable) {
      sched = '<h3>' + esc(I('h_sched', { fy: fy.label })) + '</h3><p class="hint">' + esc(I('sched_h', { t: money(R.total, false), d: money(num(v.tds), false), n: money(a.due, false) })) + '</p>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + esc(I('c_date')) + '</th><th class="n">' + esc(I('c_pct')) + '</th><th class="n">' + esc(I('c_cum')) + '</th><th class="n">' + esc(I('c_paid')) + '</th><th class="n">' + esc(I('c_pay')) + '</th><th class="n">' + esc(I('c_int')) + '</th></tr></thead><tbody>' +
        a.rows.map(function (r) { return '<tr><td>' + esc(A.ldate(r.date)) + '</td><td class="n">' + Math.round(r.pct * 100) + '%</td><td class="n">' + money(r.cumDue, false) + '</td><td class="n">' + money(r.paidTo, false) + '</td><td class="n"><b>' + money(r.short, false) + '</b></td><td class="n">' + (r.interest ? money(r.interest, false) : '—') + '</td></tr>'; }).join('') +
        '</tbody></table></div><p class="sb-note">' + esc(I('int_h', { a: money(a.int425, false), b: money(a.int424, false), m: v.months })) + '</p>';
    }
    var paid = '<h3>' + esc(I('h_paid')) + '</h3>' + (C.paid.length ? '<ul class="rows">' + C.paid.map(function (p) { return '<li><div class="ln"><span><b>' + esc(p.no || I('advtax')) + '</b><span class="soft"> · ' + esc(A.ldate(p.date)) + (p.ref ? ' · ' + esc(p.ref) : '') + '</span></span><b class="amt">' + money(p.amt) + '</b></div></li>'; }).join('') + '</ul><p class="soft">' + esc(I('paid_sum', { n: money(a.paidAll, false) })) + '</p>' : '<p class="soft">' + esc(I('paid_none')) + '</p>') +
      '<p><button type="button" class="btn" data-itpay>+ ' + esc(I('recpay')) + '</button> <button type="button" class="btn" data-itcopy>' + esc(I('copy')) + '</button></p>';
    return (msg.length ? '<div class="callout">' + msg.map(function (m) { return '<p>' + esc(m) + '</p>'; }).join('') + '</div>' : '') + tiles + reg + sched + paid;
  }
  function planText(fy, bk, v) {
    var C = planCalc(fy, bk, v), a = C.adv, L = [I('title') + ' ' + fy.label + ' · ' + (A.bizName() || '')];
    L.push(I('x_gross') + ': ' + C.R.gross, I('x_ded') + ': ' + C.R.ded, I('x_ti') + ': ' + C.R.ti, I('t_new') + ': ' + C.T.nu.total, I('t_old') + ': ' + C.T.old.total, I('t_adv', { r: I(C.use === 'old' ? 'r_old' : 'r_new') }) + ': ' + a.due);
    a.rows.forEach(function (r) { L.push(r.date + '\t' + Math.round(r.pct * 100) + '%\t' + r.cumDue + '\t' + r.paidTo + '\t' + r.short); });
    return L.join('\n');
  }
  function numIn(id, v, ph) { return '<input id="' + id + '" data-it="' + id.slice(3) + '" inputmode="decimal" dir="ltr" value="' + esc(v == null ? '' : v) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + '>'; }
  function planHtml(fy, bk) {
    var v = inpOf(fy, bk), sg = suggest(fy, bk), pres = IT.presumptive;
    var inputs = '<div class="fg">' +
      fld('it-age', I('f_age'), sel('it-age', v.age, [['gen', I('a_gen')], ['sen', I('a_sen')], ['sup', I('a_sup')]]).replace('<select ', '<select data-it="age" ')) +
      fld('it-regime', I('f_regime'), sel('it-regime', v.regime, [['auto', I('rg_auto')], ['new', I('r_new')], ['old', I('r_old')]]).replace('<select ', '<select data-it="regime" ')) +
      fld('it-pres', I('f_pres'), sel('it-pres', v.pres, [['none', I('p_none')], ['ad', I('p_ad')], ['ada', I('p_ada')]]).replace('<select ', '<select data-it="pres" '), { hint: I('f_pres_h') }) +
      '<div class="f"><label><input type="checkbox" data-it="resident"' + (v.resident ? ' checked' : '') + '> ' + esc(I('f_res')) + '</label></div>' +
      fld('it-turnover', I('f_turn'), numIn('it-turnover', v.turnover), { hint: I('f_turn_h', { n: money(sg.turnover, false) }) }) +
      fld('it-digital', I('f_dig'), numIn('it-digital', v.digital), { hint: I('f_dig_h') }) +
      fld('it-business', I('f_bus'), numIn('it-business', v.business), { hint: I('f_bus_h', { so: money(r2(bk.pbt - bk.oinc), false), d: A.ldate(bk.asOn), y: money(sg.business, false) }) }) +
      fld('it-other', I('f_oth'), numIn('it-other', v.other), { hint: I('f_oth_h') }) +
      fld('it-salary', I('f_sal'), numIn('it-salary', v.salary), { hint: I('f_sal_h') }) + fld('it-house', I('f_house'), numIn('it-house', v.house), { hint: I('f_house_h') }) +
      fld('it-capgain', I('f_cg'), numIn('it-capgain', v.capgain), { hint: I('f_cg_h') }) +
      fld('it-ded80c', I('f_80c'), numIn('it-ded80c', v.ded80c), { hint: I('f_80c_h') }) + fld('it-dedOther', I('f_dedo'), numIn('it-dedOther', v.dedOther), { hint: I('f_dedo_h') }) +
      fld('it-npsEmployer', I('f_nps'), numIn('it-npsEmployer', v.npsEmployer), { hint: I('f_nps_h') }) +
      fld('it-surcharge', I('f_sur'), numIn('it-surcharge', v.surcharge), { hint: I('f_sur_h') }) +
      fld('it-tds', I('f_tds'), numIn('it-tds', v.tds), { hint: I('f_tds_h') }) + fld('it-deferred', I('f_def'), numIn('it-deferred', v.deferred), { hint: I('f_def_h') }) +
      fld('it-months', I('f_mon'), numIn('it-months', v.months), { hint: I('f_mon_h') }) + '</div>' +
      '<p><button type="button" class="btn sm" data-itbooks>' + esc(I('usebooks')) + '</button></p>';
    return '<p class="soft">' + esc(I('plan_h')) + '</p>' + (bk.rev || bk.pbt ? '' : '<p class="sb-note bad">' + esc(I('nobooks')) + '</p>') +
      '<details open><summary>' + esc(I('inputs')) + '</summary>' + inputs + '</details><div data-itres>' + resultHtml(fy, bk, v) + '</div>' + notesHtml(fy);
  }
  function notesHtml(fy) {
    var R = IT.RATES;
    return '<details class="card"><summary>' + esc(I('basis')) + '</summary><ul>' + ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7'].map(function (k) { return '<li>' + esc(I(k, { d: R.asOf })) + '</li>'; }).join('') + '</ul></details>';
  }

  /* ---------- which ITR ---------- */
  function qOf(fy, bk) {
    var s = slot(fy), q = Object.assign({ who: 'individual', resident: true, over50: false, business: bk.rev ? 'regular' : 'none', presType: 'ad', partner: false, capgain: 'none', houses: 0, foreign: false, director: false, unlisted: false, agri: false, loss: false, esop: false, crypto: false, salary: false }, s.q);
    return q;
  }
  function chk(k, q) { return '<div class="f"><label><input type="checkbox" data-itq="' + k + '"' + (q[k] ? ' checked' : '') + '> ' + esc(I('q_' + k)) + '</label></div>'; }
  function itrResult(q) {
    var res = IT.itrForm(q), list = IT.checklist(q, res.form);
    return '<div class="card"><h3>' + esc(I('use_form', { f: res.form })) + '</h3><p>' + esc(I('formd_' + res.form)) + '</p><ul>' + res.why.map(function (w) { return '<li>' + esc(I(w)) + '</li>'; }).join('') + '</ul>' +
      '<p class="soft">' + res.notes.map(function (n) { return esc(I(n)); }).join(' ') + '</p></div>' +
      '<div class="card"><h3>' + esc(I('docs_h')) + '</h3><ul>' + list.map(function (d) { return '<li>' + esc(I(d)) + '</li>'; }).join('') + '</ul></div>';
  }
  function itrHtml(fy, bk) {
    var q = qOf(fy, bk);
    return '<p class="soft">' + esc(I('itr_h')) + '</p><div class="fg">' +
      fld('itq-who', I('q_who'), sel('itq-who', q.who, [['individual', I('w_ind')], ['huf', I('w_huf2')], ['firm', I('w_firm2')], ['company', I('w_co')], ['other', I('w_oth')]]).replace('<select ', '<select data-itq="who" ')) +
      fld('itq-business', I('q_business'), sel('itq-business', q.business, [['none', I('b_none')], ['presumptive', I('b_pres')], ['regular', I('b_reg')]]).replace('<select ', '<select data-itq="business" ')) +
      fld('itq-presType', I('q_presType'), sel('itq-presType', q.presType, [['ad', I('p_ad')], ['ada', I('p_ada')], ['ae', I('p_ae')]]).replace('<select ', '<select data-itq="presType" ')) +
      fld('itq-capgain', I('q_capgain'), sel('itq-capgain', q.capgain, [['none', I('c_none')], ['small', I('c_small')], ['other', I('c_other')]]).replace('<select ', '<select data-itq="capgain" ')) +
      fld('itq-houses', I('q_houses'), sel('itq-houses', q.houses, [['0', '0'], ['1', '1'], ['2', '2'], ['3', '3+']]).replace('<select ', '<select data-itq="houses" ')) + '</div><div class="fg">' +
      ['resident', 'salary', 'over50', 'partner', 'foreign', 'director', 'unlisted', 'agri', 'loss', 'esop', 'crypto'].map(function (k) { return chk(k, q); }).join('') + '</div>' +
      '<div data-itrres>' + itrResult(q) + '</div>';
  }

  /* ---------- data sheet ---------- */
  function sheetRows(fy, bk) {
    var D = A.data(), v = inpOf(fy, bk), S = [], pl = bk.pl;
    function sec(t) { S.push({ h: t }); }
    function row(l, a, note) { S.push({ l: l, a: a, n: note || '' }); }
    sec(I('s_bus', { a: A.ldate(fy.start), b: A.ldate(bk.asOn) }));
    row(I('s_turn'), r2(bk.rev)); row(I('s_oinc'), r2(bk.oinc));
    bk.exp.forEach(function (e) { row('  ' + e.name, e.amt); });
    row(I('s_exp'), r2(pl.exp)); row(I('s_pbt'), r2(bk.pbt), I('s_pbt_n'));
    sec(I('s_pres'));
    var tov = bk.rev;
    row(I('s_pturn'), r2(tov)); row(I('s_ad'), IT.presumptive('ad', tov, num(v.digital)), I('s_ad_n')); row(I('s_ada'), IT.presumptive('ada', tov, 0), I('s_ada_n'));
    sec(I('s_tds')); var tds = IT.tdsCredits(D.doc, A.bizName(), fy.start, fy.end);
    tds.forEach(function (t) { row(A.ldate(t.date) + ' · ' + (t.party || '—') + (t.no ? ' · ' + t.no : ''), t.amt); });
    row(I('s_tdst'), r2(tds.reduce(function (a, x) { return a + x.amt; }, 0)), I('s_tds_n'));
    sec(I('s_adv')); var pd = IT.paidAdvance(D.doc, A.bizName(), fy.start, fy.end);
    pd.forEach(function (p) { row(A.ldate(p.date) + (p.no ? ' · ' + p.no : '') + (p.ref ? ' · ' + p.ref : ''), p.amt); });
    row(I('s_advt'), r2(pd.reduce(function (a, x) { return a + x.amt; }, 0)));
    sec(I('s_typed'));
    [['f_sal', v.salary], ['f_house', v.house], ['f_cg', v.capgain], ['f_80c', v.ded80c], ['f_dedo', v.dedOther], ['f_nps', v.npsEmployer]].forEach(function (x) { if (num(x[1])) row(I(x[0]), num(x[1])); });
    return S;
  }
  function dataHtml(fy, bk) {
    var S = sheetRows(fy, bk);
    return '<p class="soft">' + esc(I('data_h')) + '</p><div class="tbl-wrap"><table class="tbl sb-data"><tbody>' + S.map(function (r) {
      return r.h ? '<tr><th colspan="3" class="l">' + esc(r.h) + '</th></tr>' : '<tr><td class="l">' + esc(r.l) + '</td><td class="n">' + money(r.a, false) + '</td><td class="soft">' + esc(r.n) + '</td></tr>';
    }).join('') + '</tbody></table></div><p><button type="button" class="btn primary" data-itdcopy>' + esc(I('copy')) + '</button> <button type="button" class="btn" data-itdcsv>' + esc(I('csv')) + '</button> <button type="button" class="btn" data-itdprint>' + esc(I('print')) + '</button></p>';
  }
  function sheetText(fy, bk, sep) {
    return sheetRows(fy, bk).map(function (r) { return r.h ? r.h : r.l + sep + r.a + (r.n ? sep + r.n : ''); }).join('\n');
  }
  function csvOf(fy, bk) {
    function c(x) { x = String(x == null ? '' : x); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }
    return '﻿' + sheetRows(fy, bk).map(function (r) { return r.h ? c(r.h) : [r.l, r.a, r.n].map(c).join(','); }).join('\r\n');
  }
  function download(name, text) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function copy(text) { (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { NS.toast(I('copied')); }, function () { NS.toast(I('copyfail'), 'bad'); }); }

  /* ---------- the section ---------- */
  function tabs(cur, fy) {
    return '<div class="tabs" role="tablist">' + TABS.map(function (t) { return '<a role="tab" class="tab' + (t === cur ? ' on' : '') + '" href="#itx' + (t === 'plan' ? '' : '/' + t) + '"' + (t === cur ? ' aria-selected="true"' : '') + '>' + esc(I('t_' + t)) + '</a>'; }).join('') + '</div>' +
      '<div class="tools-row"><label>' + esc(I('year')) + ' <select data-ityear>' + years().map(function (f) { return '<option value="' + f.start + '"' + (f.start === fy.start ? ' selected' : '') + '>' + esc(f.label) + '</option>'; }).join('') + '</select></label></div>';
  }
  var CTX = null;   /* the year and books the open screen was drawn with */
  A.addSection('itx', function (arg) {
    if (!ST.loaded) { load(); return '<div class="pane-hd"><h2>' + esc(A.T('itx')) + '</h2></div><p class="soft">…</p>'; }
    var cur = TABS.indexOf(arg) >= 0 ? arg : 'plan', fy = curFy(), bk = books(fy); ST.tab = cur; CTX = { fy: fy, bk: bk };
    return '<div class="pane-hd"><h2>' + esc(A.T('itx')) + '</h2></div>' + tabs(cur, fy) + (cur === 'itr' ? itrHtml(fy, bk) : cur === 'data' ? dataHtml(fy, bk) : planHtml(fy, bk)) +
      '<p class="sb-note">' + esc(I('disclaimer')) + '</p>';
  }, function (pane) {
    if (!CTX) return;
    var fy = CTX.fy, bk = CTX.bk, s = slot(fy);
    var yr = $('[data-ityear]', pane); if (yr) yr.addEventListener('change', function () { ST.fy = yr.value; A.show(); });
    /* the typed figures */
    function redraw() { var box = $('[data-itres]', pane); if (box) { box.innerHTML = resultHtml(fy, bk, inpOf(fy, bk)); wireRes(); } }
    $$('[data-it]', pane).forEach(function (el) {
      var f = el.getAttribute('data-it');
      function take() { s.inp[f] = el.type === 'checkbox' ? el.checked : el.value; redraw(); }
      el.addEventListener('input', take); el.addEventListener('change', function () { take(); persist(); });
    });
    var ub = $('[data-itbooks]', pane); if (ub) ub.addEventListener('click', function () { s.inp = {}; persist(); A.show(); });
    function wireRes() {
      var pb = $('[data-itpay]', pane); if (pb) pb.addEventListener('click', function () { X.forms.taxpay(); });
      var cb = $('[data-itcopy]', pane); if (cb) cb.addEventListener('click', function () { copy(planText(fy, bk, inpOf(fy, bk))); });
    }
    wireRes();
    /* which ITR */
    $$('[data-itq]', pane).forEach(function (el) {
      var f = el.getAttribute('data-itq');
      el.addEventListener('change', function () {
        s.q = Object.assign(qOf(fy, bk), s.q); s.q[f] = el.type === 'checkbox' ? el.checked : f === 'houses' ? +el.value : el.value; persist();
        var box = $('[data-itrres]', pane); if (box) box.innerHTML = itrResult(qOf(fy, bk));
      });
    });
    /* data sheet */
    var dc = $('[data-itdcopy]', pane); if (dc) dc.addEventListener('click', function () { copy(sheetText(fy, bk, '\t')); });
    var dv = $('[data-itdcsv]', pane); if (dv) dv.addEventListener('click', function () { download('income-tax-data-' + fy.label + '.csv', csvOf(fy, bk)); });
    var dp = $('[data-itdprint]', pane); if (dp) dp.addEventListener('click', function () { window.print(); });
  });
  function load() {
    NSStore.meta('itplan').then(function (m) { ST.plans = m && typeof m === 'object' ? m : {}; }).catch(function () { ST.plans = {}; }).then(function () { ST.loaded = true; if (/^#itx/.test(location.hash)) A.show(); });
  }
  function menu() {
    var nav = $('.hub-nav'), app = $('#app'); if (!nav || !app || app.getAttribute('data-secs') || $('[data-sec="itx"]', nav)) return;
    var at = $('[data-sec="stf"]', nav) || $('[data-sec="acx"]', nav) || $('[data-sec="money"]', nav), a = NS.el('a', { href: '#itx', 'data-sec': 'itx' }, '<span>' + esc(A.T('itx')) + '</span>');
    if (at && at.nextSibling) nav.insertBefore(a, at.nextSibling); else nav.appendChild(a);
  }
  function start() { menu(); load(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  A.itax = { planCalc: planCalc, books: books, sheetRows: sheetRows };
})();

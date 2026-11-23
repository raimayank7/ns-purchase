/* Payroll round 2 in the App's Staff area (after staff.js and payroll.js), added as more tabs through A.staffExt:
     #stf/run    Process salary  one month for every working employee at once (S-28): days paid from attendance, earnings by the
                                 salary structure, overtime, PF, ESI, professional tax, labour welfare fund, TDS from the year projection,
                                 advance recovery; type bonus / arrears / other deductions; "Make salary slips" saves one 'salary' record
                                 per employee (the record the salary slip maker prints, ticked into the accounts), bank transfer sheet,
                                 "Mark all paid", payslips to print, salary register.
     #stf/heads  Pay heads       the pay head list and each employee's salary structure with effective months, payroll details and
                                 tax declarations (S-27, S-30), the payroll settings (overtime, 50% wage rule, LWF, bank sheet columns).
     #stf/tax    Salary TDS      the year's tax working per employee, both regimes (S-30); printable working (for the Form 16 type
                                 certificate the employer downloads from TRACES).
     #stf/year   Bonus, gratuity bonus working for the tax year and gratuity provision (S-32, T-B17), booked as a journal entry.
   Maths: engine/paycore.js (NSPayRun), engine/saltax.js (NSSalTax), engine/statrates.js (NSStatRates), payrollcore.js (NSPayroll).
   Screen words: NS.t('pw.*') (App screens: English only). */
(function () {
  'use strict';
  var A = window.NSApp, S = window.NSStaff, P = window.NSPayroll, R = window.NSPayRun, TX = window.NSSalTax, SR = window.NSStatRates, B = window.NSBooks;
  if (!A || !A.staffExt || !S || !P || !R || !TX || !B || !A.acx) return;
  var X = A.acx, $ = NS.$, $$ = NS.$$, esc = NS.esc, num = NS.num, money = NS.money, r2 = NS.r2, fld = X.fld, inp = X.inp, sel = X.sel, val = X.val;
  function F(k, v) { return NS.t('pw.' + k, v); }
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function m0(v) { return money(v, false); }
  function mt(ym) { return new Date(ym + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); }
  function lastDay(ym) { return ym + '-' + String(R.days(ym)).padStart(2, '0'); }
  function ask(m) { return NS.ask ? NS.ask(m) : Promise.resolve(window.confirm(m)); }
  var ST = { ym: NS.today().slice(0, 7), emps: [], cfg: null, att: null, ready: false, sig: '', user: {} };

  /* ---------- data ---------- */
  function load() {
    var biz = A.bizName() || '';
    return Promise.all([S.list(biz), P.Store.cfg(), P.Store.att()]).then(function (r) {
      var sig = biz + '|' + r[0].map(function (e) { return e.id + ':' + (e.updated || 0); }).join(',') + '|' + JSON.stringify(r[1]).length + '|' + JSON.stringify(r[2]).length;
      var was = ST.sig; ST.emps = r[0]; ST.cfg = r[1]; ST.att = r[2]; ST.ready = true; ST.sig = sig; P.setLeave((r[1].leave || {}).types);
      if (was !== sig && /^#stf\/(run|heads|tax|year|leave)/.test(location.hash)) A.show();
    });
  }
  function heads() { return R.heads(ST.cfg); }
  function active(ym) { var a = ym + '-01', z = lastDay(ym); return ST.emps.filter(function (e) { return !(e.left && e.left < a) && !(e.doj && e.doj > z); }); }
  function slips() { return A.mine().filter(function (d) { return d.type === 'salary'; }); }
  function slipOf(e, ym) { return slips().filter(function (d) { return d.month === ym && key(B.partyName(d)) === key(e.name); }).sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); })[0] || null; }
  function bizState() { var b = A.biz() || {}; return b.state || ''; }
  function userKey() { return 'ns-payrun|' + (A.bizName() || '') + '|' + ST.ym; }
  function loadUser() { try { ST.user = JSON.parse(localStorage.getItem(userKey()) || '{}'); } catch (e) { ST.user = {}; } }
  function saveUser() { try { localStorage.setItem(userKey(), JSON.stringify(ST.user)); } catch (e) {} }
  function saveCfg() { return P.Store.saveCfg(ST.cfg); }

  /* the tax year so far for one employee: taxable pay, TDS, PF, PT, HRA, basic + DA from the saved slips before month ym */
  function ytdOf(e, ym) {
    var fy = TX.fyOf(ym), o = { tax: 0, tds: 0, pf: 0, pt: 0, hra: 0, bda: 0, months: 0, est: 0, estAmt: 0 }, had = {};
    slips().forEach(function (d) {
      if (!d.month || d.month >= ym || TX.fyOf(d.month) !== fy || key(B.partyName(d)) !== key(e.name)) return;
      var s = B.salSplit(d); o.tax += s.gross; o.tds += s.tds; o.pf += s.pf; o.pt += s.pt; o.months++; had[d.month] = 1;
      (d.earn || []).forEach(function (l) { var h = l.head || R.guess(l.desc); if (h === 'hra') o.hra += num(l.amt); if (h === 'basic' || h === 'da') o.bda += num(l.amt); });
    });
    /* months of this tax year before ym with no slip in NSBiz while the employee was working (salary paid before the business used
       NSBiz, or slips not made): taken from the salary structure, so the year's tax is not understated; TDS of those months is
       typed by the user as "TDS already deducted" in the declarations (prevTds) when it was cut outside NSBiz */
    for (var m = fy.slice(0, 4) + '-04'; m < ym; m = R.addM(m, 1)) {
      if (had[m] || e.doj && e.doj.slice(0, 7) > m || e.left && e.left.slice(0, 7) < m) continue;
      var st = R.structFor(e, m), t = R.monthTaxable(e, m, heads()); if (!t) continue;
      o.tax += t; o.hra += num(st.hra); o.bda += num(st.basic) + num(st.da); o.est++; o.estAmt += t;
      if (SR) o.pt += SR.pt(e.ptState || bizState(), t, +m.slice(5, 7), e) || 0;
      if (!e.noPf) o.pf += Math.round(Math.min(num(st.basic) + num(st.da), P.PF.ceil) * P.PF.epf / 100);   /* PF on the wage ceiling, for the 80C estimate */
    }
    return o;
  }
  /* what an employee still owes as staff advance, and the instalment plans of the advances given (sadv.plan) */
  function advOf(e) {
    var acc = B.accounts(A.mine(), A.bizName()), owed = acc[B.SADV + key(e.name)] || 0;
    var plans = A.mine().filter(function (d) { return d.type === 'sadv' && d.kind !== 'back' && key(d.emp) === key(e.name) && d.plan; }).map(function (d) { return d.plan; });
    return { owed: owed, plans: plans };
  }
  function declOf(e, ym) {
    var d = (e.decl || {})[TX.fyOf(ym)] || {};
    if (!num(d.prevTds)) {   /* "TDS already cut this tax year elsewhere" typed on a slip in the salary slip maker */
      var fy = TX.fyOf(ym), L = slips().filter(function (x) { return x.month && x.month < ym && TX.fyOf(x.month) === fy && key(B.partyName(x)) === key(e.name) && num(x.tdsPrev); }).sort(function (a, b) { return a.month < b.month ? 1 : -1; });
      if (L.length) d = Object.assign({}, d, { prevTds: num(L[0].tdsPrev) });
    }
    return d;
  }
  function ageOf(e, ym) { if (!e.dob) return 0; var y = TX.fyOf(ym).slice(0, 4); return +y + 1 - +e.dob.slice(0, 4) - (('-03-31' < e.dob.slice(4)) ? 1 : 0); }
  /* the full month's row for one employee: run once to get the pay, then PT and TDS on it */
  function rowFor(e, ym, user) {
    user = user || {};
    var rec = (ST.att.months[ym] || {})[e.id], sd = P.slipDays(rec, ym, ST.att.cfg, e), cfg = runCfg(), cut = sd ? P.unpaidLeave(ST.att, e, ym, ST.cfg.leave || {}) : { days: 0, why: [] };
    if (sd && cut.days) sd = Object.assign({}, sd, { paid: Math.max(0, NS.r2(sd.paid - cut.days)) });   /* T-B16: leave beyond the balance, late marks */
    var o = { emp: e, ym: ym, heads: heads(), att: sd, cfg: cfg, P: P, user: user };
    var first = R.row(o), st = e.ptState || bizState(), pt = SR ? SR.pt(st, first.gross, +ym.slice(5, 7), e) : null;
    var av = advOf(e), own = slipOf(e, ym);
    if (own && !own.payDate) av.owed += B.salSplit(own).adv;   /* making this month's slip again: what it already recovered is owed again */
    var adv = user.adv != null && user.adv !== '' ? num(user.adv) : R.advEmi(av.owed, av.plans, ym);
    /* TDS: the year projection */
    var y = ytdOf(e, ym), left = 12 - TX.monthNo(ym), future = 0, fh = 0, fb = 0, sth = R.structFor(e, ym);
    for (var i = 1; i <= left; i++) { var nm = R.addM(ym, i); future += R.monthTaxable(e, nm, heads()); var s2 = R.structFor(e, nm); fh += num(s2.hra); fb += num(s2.basic) + num(s2.da); }
    var dc = declOf(e, ym), ptm = pt || 0;
    var tin = { ym: ym, regime: e.regime || 'new', age: ageOf(e, ym), paidYtd: y.tax, tdsYtd: y.tds, month: first.taxable, future: future,
      hra: { recv: y.hra + first.amt('hra') + fh, basicDa: y.bda + first.amt('basic') + first.amt('da') + fb, rent: num(dc.rent) * 12, metro: !!dc.metro },
      pt: y.pt + ptm * (left + 1), pfEe: y.pf + first.amt('pf') * (left + 1), decl: dc, prev: { sal: dc.prevSal, tds: dc.prevTds } }, tx = TX.year(tin);
    var tds = user.tds != null && user.tds !== '' ? num(user.tds) : tx.perMonth;
    var row = R.row(Object.assign(o, { pt: ptm, tds: tds, adv: Math.max(0, Math.min(adv, av.owed)) }));
    if (y.est) tx.lines.splice(1, 0, ['Of it, months without a slip in NSBiz (from the salary structure): ' + y.est, y.estAmt]);
    var mw = e.skill ? minWageFor(e, ym) : null, rate = (num(sth.basic) + num(sth.da)) / 26;
    row.minw = mw && rate < num(mw.daily) ? { rate: NS.r2(rate), min: num(mw.daily) } : null;
    row.cut = cut; row.tx = tx; row.txIn = tin; row.ptNone = pt == null; row.marked = !!sd; row.slip = slipOf(e, ym); row.sth = sth;
    return row;
  }
  /* T-B22: the user's table of minimum wages (meta 'payroll'.minWage = [{ state, skill, daily, from, src }]): typed from the state
     notification, never shipped filled. The run warns when an employee's daily rate (basic + DA of the full month / 26) is below it. */
  var SKILLS = ['us', 'ss', 'sk', 'hs'];
  function minWageFor(e, ym) {
    var st = e.ptState || bizState(), L = ((ST.cfg || {}).minWage || []).filter(function (m) { return m.skill === (e.skill || '') && (!m.state || m.state === st) && (!m.from || m.from <= ym + '-31'); })
      .sort(function (a, b) { return (a.from || '') < (b.from || '') ? 1 : -1; });
    return L[0] || null;
  }
  function runCfg() { var c = ST.cfg || {}; return { pf: c.pf, esi: c.esi, otMult: num((c.ot || {}).mult) || R.DEF.otMult, otHours: num((c.ot || {}).hours) || R.DEF.otHours, code50: !!(c.flags && c.flags.code50), lwf: c.lwf || {} }; }

  function head(tab) {
    return '<div class="pr-bar"><label class="pr-m">' + esc(F('month')) + ' <input type="month" id="pw-ym" value="' + esc(ST.ym) + '"></label></div>';
  }
  function bindMonth(pane) { var m = $('#pw-ym', pane); if (m) m.addEventListener('change', function () { if (m.value) { ST.ym = m.value; loadUser(); A.show(); } }); }
  function wait() { if (!ST.ready) { load(); return '<p class="soft">' + esc(F('loading')) + '</p>'; } return ''; }

  /* ================= Process salary (S-28) ================= */
  function runRows() { return active(ST.ym).map(function (e) { return rowFor(e, ST.ym, ST.user[e.id]); }); }
  function runHtml() {
    var w = wait(); if (w) return w;
    loadUser();
    var L = runRows(), tot = { g: 0, d: 0, n: 0, pf: 0, esi: 0, er: 0 };
    L.forEach(function (r) { tot.g += r.gross; tot.d += r.dedTotal; tot.n += r.net; tot.er += r.erPf + r.erEsi + r.erLwf; });
    var nos = L.filter(function (r) { return !r.marked; }).length, ptn = L.filter(function (r) { return r.ptNone; }).length;
    var cell = function (r, k, v) { var paid = r.slip && r.slip.payDate; return '<input class="pw-in" inputmode="decimal" dir="ltr" data-u="' + esc(r.emp.id) + '" data-k="' + k + '" value="' + esc(v == null ? '' : v) + '"' + (paid ? ' disabled' : '') + ' aria-label="' + esc(r.emp.name + ' ' + F('c_' + k)) + '">'; };
    var tbl = L.length ? '<div class="tbl-wrap"><table class="tbl pw-t"><thead><tr><th>' + esc(F('emp')) + '</th><th class="n">' + esc(F('days')) + '</th><th class="n">' + esc(F('gross')) + '</th><th class="n">' + esc(F('c_bonus')) + '</th><th class="n">' + esc(F('c_arrear')) + '</th>' +
      '<th class="n">PF</th><th class="n">ESI</th><th class="n">' + esc(F('pt')) + '</th><th class="n">LWF</th><th class="n">' + esc(F('c_tds')) + '</th><th class="n">' + esc(F('c_adv')) + '</th><th class="n">' + esc(F('c_other')) + '</th><th class="n">' + esc(F('net')) + '</th><th>' + esc(F('status')) + '</th></tr></thead><tbody>' +
      L.map(function (r) {
        var u = ST.user[r.emp.id] || {}, sl = r.slip, stt = sl ? (sl.payDate ? '<span class="pill ok">' + esc(F('paidon', { d: A.ldate(sl.payDate) })) + '</span>' : '<span class="pill">' + esc(F('made', { no: sl.no || '' })) + '</span>') : '<span class="pill warn">' + esc(F('notmade')) + '</span>';
        return '<tr><th scope="row">' + esc(r.emp.name) + (r.ot.hours ? '<small class="soft"> · ' + esc(F('othrs', { h: r.ot.hours, a: m0(r.ot.amt) })) + '</small>' : '') + '</th>' +
          '<td class="n" data-l="' + esc(F('days')) + '">' + esc(r.paid + '/' + r.days) + (r.marked ? '' : ' <span class="pill" title="' + esc(F('nomarkh')) + '">' + esc(F('nomark')) + '</span>') + (r.cut && r.cut.days ? ' <span class="pill warn" title="' + esc(r.cut.why.join(', ')) + '">' + esc(F('cutdays', { n: r.cut.days })) + '</span>' : '') + '</td>' +
          '<td class="n" data-l="' + esc(F('gross')) + '"><b>' + m0(r.gross) + '</b></td><td class="n" data-l="' + esc(F('c_bonus')) + '">' + cell(r, 'bonus', u.bonus) + '</td><td class="n" data-l="' + esc(F('c_arrear')) + '">' + cell(r, 'arrear', u.arrear) + '</td>' +
          '<td class="n" data-l="PF">' + m0(r.amt('pf')) + '</td><td class="n" data-l="ESI">' + m0(r.amt('esi')) + '</td><td class="n" data-l="' + esc(F('pt')) + '">' + (r.ptNone ? '<span title="' + esc(F('ptnoneh')) + '">—</span>' : m0(r.amt('pt'))) + '</td><td class="n" data-l="LWF">' + m0(r.amt('lwf')) + '</td>' +
          '<td class="n" data-l="' + esc(F('c_tds')) + '">' + cell(r, 'tds', u.tds != null && u.tds !== '' ? u.tds : r.amt('tds')) + '</td><td class="n" data-l="' + esc(F('c_adv')) + '">' + cell(r, 'adv', u.adv != null && u.adv !== '' ? u.adv : r.amt('adv')) + '</td><td class="n" data-l="' + esc(F('c_other')) + '">' + cell(r, 'other', u.other) + '</td>' +
          '<td class="n" data-l="' + esc(F('net')) + '"><b>' + m0(r.net) + '</b></td><td data-l="' + esc(F('status')) + '">' + stt + '</td></tr>';
      }).join('') + '</tbody><tfoot><tr><th>' + esc(F('total')) + '</th><td></td><td class="n"><b>' + m0(tot.g) + '</b></td><td colspan="9"></td><td class="n"><b>' + m0(tot.n) + '</b></td><td></td></tr></tfoot></table></div>' : '<p class="soft">' + esc(F('noemps')) + '</p>';
    return '<p class="soft">' + esc(F('runh')) + '</p>' + head() +
      (nos ? '<p class="pr-warn">' + esc(F('nomarkn', { n: nos })) + ' <a href="#stf/att">' + esc(F('toatt')) + ' ›</a></p>' : '') +
      (ptn ? '<p class="pr-warn">' + esc(F('ptnone', { n: ptn })) + '</p>' : '') +
      L.filter(function (r) { return r.minw; }).map(function (r) { return '<p class="pr-warn">' + esc(F('minwarn', { n: r.emp.name, r: money(r.minw.rate), m: money(r.minw.min) })) + '</p>'; }).join('') +
      (L.some(function (r) { return !R.structFor(r.emp, ST.ym)._from; }) ? '<p class="soft">' + esc(F('nostruct')) + ' <a href="#stf/heads">' + esc(F('tostruct')) + ' ›</a></p>' : '') + tbl +
      (L.length ? '<ul class="rows pw-tot"><li><span>' + esc(F('gross')) + '</span><b class="amt">' + money(tot.g) + '</b></li><li><span>' + esc(F('dedall')) + '</span><b class="amt">' + money(tot.d) + '</b></li><li><span>' + esc(F('net')) + '</span><b class="amt">' + money(tot.n) + '</b></li><li><span>' + esc(F('erall')) + '</span><b class="amt">' + money(tot.er) + '</b></li></ul>' : '') +
      '<div class="acts pr-tools"><button type="button" class="btn primary" data-pwmake' + (L.length ? '' : ' disabled') + '>' + esc(F('make')) + '</button><button type="button" class="btn" data-pwpay>' + esc(F('payall')) + '</button>' +
      '<button type="button" class="btn" data-pwbank data-ic="download">' + esc(F('bank')) + '</button><button type="button" class="btn" data-pwreg data-ic="download">' + esc(F('reg')) + '</button><button type="button" class="btn" data-pwprint data-ic="print">' + esc(F('slips')) + '</button><button type="button" class="btn sm" data-pwclear>' + esc(F('clear')) + '</button></div>' +
      '<p class="soft">' + esc(F('makeh')) + '</p>';
  }
  function slipDoc(r, old) {
    var e = r.emp, date = lastDay(ST.ym), d = old ? JSON.parse(JSON.stringify(old)) : { type: 'salary', kind: '', no: X.nextNo('salary', 'SAL', date), date: date, paper: 'a4', design: 'classic', copies: 1, copyLabel: '', notes: '', status: '', app: 1, created: Date.now() };
    Object.assign(d, { seller: X.sellerCopy(), buyer: Object.assign(d.buyer || {}, { name: e.name, addr: '', phone: '', gstin: '', pan: e.pan || '' }), acct: true, regime: e.regime || 'new', ptState: e.ptState || bizState(), month: ST.ym,
      emp: { code: e.code || '', desig: e.desig || '', dept: e.dept || '', doj: e.doj || '', pan: e.pan || '', uan: e.uan || '', esi: e.esi || '', bankName: e.bankName || '', bankAcc: e.bankAcc || '', bankIfsc: e.bankIfsc || '' },
      days: String(r.days), paid: String(r.paid), earn: r.earn.map(function (l) { return { desc: l.desc, amt: String(l.amt), head: l.head }; }), ded: r.ded.map(function (l) { return { desc: l.desc, amt: String(l.amt), head: l.head }; }),
      erPf: r.erPf ? String(r.erPf) : '', erEsi: r.erEsi ? String(r.erEsi) : '', erLwf: r.erLwf ? String(r.erLwf) : '', payMode: d.payMode || 'bank', payDate: d.payDate || '', run: 1, ot: r.ot.hours ? { hours: r.ot.hours, rate: r.ot.rate } : undefined, total: r.net });
    if (!d.ot) delete d.ot;
    return d;
  }
  function makeSlips() {
    var L = runRows(), todo = L.filter(function (r) { return !(r.slip && r.slip.payDate) && r.gross > 0; }), keep = L.length - todo.length;
    if (!todo.length) { NS.toast(F('nothing'), 'bad'); return; }
    if (A.closedMsg && A.closedMsg(lastDay(ST.ym))) { NS.toast(A.closedMsg(lastDay(ST.ym)), 'bad'); return; }
    ask(F('makeq', { n: todo.length, m: mt(ST.ym) })).then(function (yes) {
      if (!yes) return;
      /* one at a time: each new number looks at the slips already saved */
      todo.reduce(function (pr, r) { return pr.then(function () { var d = slipDoc(r, r.slip); return NSStore.put('doc', d).then(function (s) { A.data().doc.push(s || d); }); }); }, Promise.resolve())
        .then(function () { NS.toast(F('madeok', { n: todo.length }) + (keep ? ' ' + F('kept', { n: keep }) : '')); A.show(); }, function () { NS.toast(F('nosave'), 'bad'); });
    });
  }
  function payAll() {
    var L = slips().filter(function (d) { return d.month === ST.ym && !d.payDate; });
    if (!L.length) { NS.toast(F('nounpaid'), 'bad'); return; }
    X.open(F('payall'), '<p class="soft">' + esc(F('payallh', { n: L.length, a: money(L.reduce(function (s, d) { return s + B.salSplit(d).net; }, 0)) })) + '</p><div class="fg">' +
      fld('pw-pdate', A.T('date'), inp('pw-pdate', NS.today(), { type: 'date', req: 1 })) + fld('pw-pmode', A.T('mode'), sel('pw-pmode', 'bank', X.modeOpts())) + X.bankF('pw-pbank', '', 'pw-pmode') + '</div>', function () {
      var dt = val('pw-pdate'); if (!dt) { NS.toast(A.T('need', { f: A.T('date') }), 'bad'); return; }
      var bk = {}; X.bankSet(bk, 'pw-pbank');
      Promise.all(L.map(function (d) { var x = Object.assign(JSON.parse(JSON.stringify(d)), { acct: true, payDate: dt, payMode: val('pw-pmode') }); if (bk.bacct) x.payBacct = bk.bacct; return NSStore.put('doc', x); }))
        .then(function () { var dl = $('.acx-dlg[open]'); if (dl) dl.close(); NS.toast(F('paidok', { n: L.length })); A.show(); });
    });
  }
  function bankSheet() {
    var L = runRows().filter(function (r) { return r.slip; }).map(function (r) { var s = B.salSplit(r.slip); return Object.assign({}, r, { net: s.net }); });
    if (!L.length) { NS.toast(F('makefirst'), 'bad'); return; }
    var b = R.bankRows(L, ST.ym, ST.cfg.bank), fn = 'salary-bank-transfer-' + ST.ym;
    NS.loadLazy(['xlsx.js']).then(function () { NS.saveFile(NS.xlsx.write([['Bank transfer', b.rows]]), fn + '.xlsx'); NS.toast(F('saved', { f: fn + '.xlsx' }) + (b.missing.length ? ' ' + F('nobank', { l: b.missing.join(', ') }) : '')); },
      function () { NS.saveFile(new Blob(['﻿' + P.toCsv(b.rows)], { type: 'text/csv' }), fn + '.csv'); });
  }
  function register() {
    var L = slips().filter(function (d) { return d.month === ST.ym; }); if (!L.length) { NS.toast(F('makefirst'), 'bad'); return; }
    var H = heads().filter(function (h) { return h.kind === 'earn'; }), D = ['pf', 'esi', 'pt', 'lwf', 'tds', 'adv', 'loan', 'other'];
    var rows = [['Employee', 'Code', 'Days', 'Paid days'].concat(H.map(function (h) { return h.name; }), ['Other earnings', 'Gross'], D.map(function (k) { return R.DED[k]; }), ['Total deductions', 'Net pay', 'Employer PF', 'Employer ESI', 'Employer LWF', 'Paid on'])];
    L.forEach(function (d) {
      var by = {}, other = 0; (d.earn || []).forEach(function (l) { var h = l.head || R.guess(l.desc); if (h && H.some(function (x) { return x.id === h; })) by[h] = (by[h] || 0) + num(l.amt); else other += num(l.amt); });
      var dd = {}; (d.ded || []).forEach(function (l) { var k = l.head || ({ pf: 'pf', esi: 'esi', pt: 'pt', tds: 'tds', lwf: 'lwf', adv: 'adv' })[B.dedKind(l.desc)] || 'other'; dd[k] = (dd[k] || 0) + num(l.amt); });
      var s = B.salSplit(d);
      rows.push([B.partyName(d), d.emp && d.emp.code || '', num(d.days), num(d.paid)].concat(H.map(function (h) { return by[h.id] || 0; }), [other, s.gross], D.map(function (k) { return dd[k] || 0; }), [s.ded, s.net, num(d.erPf), num(d.erEsi), num(d.erLwf), d.payDate || '']));
    });
    var fn = 'salary-register-' + ST.ym + '.xlsx';
    NS.loadLazy(['xlsx.js']).then(function () { NS.saveFile(NS.xlsx.write([['Salary register', rows]]), fn); NS.toast(F('saved', { f: fn })); }, function () { NS.toast(F('noxl'), 'bad'); });
  }
  /* payslips: one page each, English (read by the employee and banks), printed from a new window */
  function printSlips() {
    var L = slips().filter(function (d) { return d.month === ST.ym; }); if (!L.length) { NS.toast(F('makefirst'), 'bad'); return; }
    var b = A.biz() || {}, w = window.open('', '_blank'); if (!w) { NS.toast(F('popup'), 'bad'); return; }
    var pg = L.map(function (d) {
      var s = B.salSplit(d), e = d.emp || {}, n = Math.max((d.earn || []).length, (d.ded || []).length), rows = '';
      for (var i = 0; i < n; i++) { var a = (d.earn || [])[i], c = (d.ded || [])[i]; rows += '<tr><td>' + esc(a ? a.desc : '') + '</td><td class="n">' + (a ? m0(num(a.amt)) : '') + '</td><td>' + esc(c ? c.desc : '') + '</td><td class="n">' + (c ? m0(num(c.amt)) : '') + '</td></tr>'; }
      return '<section><h1>' + esc(b.name || A.bizName() || '') + '</h1><p class="a">' + esc([b.addr, b.city, b.state ? NS.stateName(b.state) : ''].filter(Boolean).join(', ')) + '</p><h2>Salary slip for ' + esc(mt(d.month)) + '</h2>' +
        '<table class="i"><tr><th>Employee</th><td>' + esc(B.partyName(d)) + '</td><th>Code</th><td>' + esc(e.code || '') + '</td></tr><tr><th>Designation</th><td>' + esc(e.desig || '') + '</td><th>PAN</th><td>' + esc(e.pan || '') + '</td></tr>' +
        '<tr><th>UAN</th><td>' + esc(e.uan || '') + '</td><th>ESI no.</th><td>' + esc(e.esi || '') + '</td></tr><tr><th>Days paid</th><td>' + esc((d.paid || d.days) + ' of ' + d.days) + '</td><th>Bank account</th><td>' + esc(e.bankAcc || '') + '</td></tr></table>' +
        '<table class="p"><thead><tr><th>Earnings</th><th class="n">Amount</th><th>Deductions</th><th class="n">Amount</th></tr></thead><tbody>' + rows + '</tbody><tfoot><tr><th>Gross</th><th class="n">' + m0(s.gross) + '</th><th>Total deductions</th><th class="n">' + m0(s.ded) + '</th></tr><tr><th colspan="3">Net pay</th><th class="n">' + m0(s.net) + '</th></tr></tfoot></table>' +
        '<p>Net pay in words: ' + esc(NS.inWords(s.net)) + '</p><p class="f">This salary slip is generated from the employer’s records. ' + 'Designed &amp; Developed by: Nivesh Sahayak' + '</p></section>';
    }).join('');
    w.document.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Salary slips ' + esc(mt(ST.ym)) + '</title><style>body{font:13px/1.45 system-ui,sans-serif;color:#111;margin:0}section{padding:18mm 14mm;page-break-after:always}h1{font-size:20px;margin:0}h2{font-size:15px;margin:10px 0}.a{margin:2px 0 8px;color:#444}table{width:100%;border-collapse:collapse;margin:8px 0}th,td{border:1px solid #999;padding:5px 7px;text-align:left}.n{text-align:right}.i th{background:#f2f2f2;width:18%}.p thead th{background:#f2f2f2}.f{color:#555;font-size:11px;margin-top:16px}@page{size:A4;margin:0}</style></head><body>' + pg + '<script>window.onload=function(){window.print()}<\/script></body></html>');
    w.document.close();
  }
  function runBind(pane) {
    bindMonth(pane);
    $$('[data-u]', pane).forEach(function (i) { i.addEventListener('change', function () { var id = i.getAttribute('data-u'), k = i.getAttribute('data-k'); var u = ST.user[id] = ST.user[id] || {}; if (i.value.trim() === '') delete u[k]; else u[k] = i.value.trim(); saveUser(); A.show(); }); });
    var on = function (s, f) { var b = $(s, pane); if (b) b.addEventListener('click', f); };
    on('[data-pwmake]', makeSlips); on('[data-pwpay]', payAll); on('[data-pwbank]', bankSheet); on('[data-pwreg]', register); on('[data-pwprint]', printSlips);
    on('[data-pwclear]', function () { ST.user = {}; saveUser(); A.show(); });
  }

  /* ================= Pay heads and salary structures (S-27) ================= */
  var CALC = ['att', 'flat', 'pct', 'user'];
  function headsHtml() {
    var w = wait(); if (w) return w;
    var H = heads(), E = active(ST.ym);
    return '<p class="soft">' + esc(F('headsh')) + '</p><div class="tbl-wrap"><table class="tbl pw-t"><thead><tr><th>' + esc(F('hname')) + '</th><th>' + esc(F('hcalc')) + '</th><th>' + esc(F('hflags')) + '</th><th></th></tr></thead><tbody>' +
      H.map(function (h) { return '<tr' + (h.off ? ' class="sf-paid"' : '') + '><th scope="row">' + esc(h.name) + (h.off ? ' <span class="pill">' + esc(F('off')) + '</span>' : '') + '</th><td>' + esc(F('calc_' + h.calc) + (h.calc === 'pct' ? ' ' + num(h.pct) + '% ' + F('of') + ' ' + (h.of || []).map(function (id) { var x = H.filter(function (y) { return y.id === id; })[0]; return x ? x.name : id; }).join(', ') : '')) + '</td><td>' + ['pf', 'esi', 'tax'].filter(function (k) { return h[k]; }).map(function (k) { return '<span class="pill">' + esc(F('f_' + k)) + '</span>'; }).join(' ') + '</td><td class="acts"><button type="button" class="btn sm" data-pwhead="' + esc(h.id) + '">' + esc(A.T('edit')) + '</button></td></tr>'; }).join('') +
      '</tbody></table></div><p><button type="button" class="btn" data-pwhead="">+ ' + esc(F('addhead')) + '</button></p>' +
      '<h3>' + esc(F('structs')) + '</h3><p class="soft">' + esc(F('structh')) + '</p>' + (E.length ? '<ul class="rows">' + E.map(function (e) {
        var st = R.structFor(e, ST.ym), tot = R.monthTaxable(e, ST.ym, H);
        return '<li><div class="ln"><span><b>' + esc(e.name) + '</b><span class="soft"> · ' + esc(st._from ? F('from', { m: mt(st._from) }) : F('fromusual')) + ' · ' + esc(F('regime_' + (e.regime || 'new'))) + '</span></span><b class="amt">' + money(tot) + '</b></div><div class="acts"><button type="button" class="btn sm primary" data-pwstruct="' + esc(e.id) + '">' + esc(F('editstruct')) + '</button><button type="button" class="btn sm" data-pwdecl="' + esc(e.id) + '">' + esc(F('decl')) + '</button></div></li>';
      }).join('') + '</ul>' : '<p class="soft">' + esc(F('noemps')) + '</p>') + setHtml() + minHtml();
  }
  function setHtml() {
    var c = ST.cfg || {}, ot = c.ot || {}, lw = c.lwf || {}, bk = c.bank || {}, bn = c.bonus || {}, sh = Object.assign({ start: '09:30', grace: 10, half: 4, full: 8, otAfter: 9 }, c.shift || {});
    return '<details class="card pr-set"><summary>' + esc(F('settings')) + '</summary><div class="fg">' +
      fld('pw-otm', F('otmult'), inp('pw-otm', ot.mult || R.DEF.otMult, { mode: 'decimal' }), { hint: F('otmulth') }) + fld('pw-oth', F('othours'), inp('pw-oth', ot.hours || R.DEF.otHours, { mode: 'decimal' })) +
      '<label class="chk f wide"><input type="checkbox" id="pw-c50"' + (c.flags && c.flags.code50 ? ' checked' : '') + '> ' + esc(F('code50')) + '</label><small class="soft f wide">' + esc(F('code50h')) + '</small>' +
      fld('pw-lee', F('lwfee'), inp('pw-lee', lw.ee || '', { mode: 'decimal' })) + fld('pw-ler', F('lwfer'), inp('pw-ler', lw.er || '', { mode: 'decimal' })) +
      fld('pw-lm', F('lwfm'), inp('pw-lm', (lw.months || []).join(', '), { mode: 'text' }), { hint: F('lwfmh') }) +
      fld('pw-lpct', F('lwfpct'), inp('pw-lpct', lw.pct || '', { mode: 'decimal' }), { hint: F('lwfpcth') }) + fld('pw-lmax', F('lwfmax'), inp('pw-lmax', lw.max || '', { mode: 'decimal' })) + fld('pw-lerx', F('lwferx'), inp('pw-lerx', lw.erX || '', { mode: 'decimal' })) +
      (SR && SR.LWF ? fld('pw-lst', F('lwfst'), sel('pw-lst', '', [['', F('lwfst_')]].concat(Object.keys(SR.LWF).map(function (k) { return [k, NS.stateName(k)]; }))), { hint: F('lwfsth') }) : '') +
      (lw.src ? '<p class="soft f wide">' + esc(lw.src) + '</p>' : '') +
      fld('pw-bk', F('bankcols'), inp('pw-bk', (bk.cols || ['name', 'acc', 'ifsc', 'amt', 'narr']).join(', '), { mode: 'text' }), { hint: F('bankcolsh'), wide: 1 }) +
      fld('pw-shs', F('shstart'), inp('pw-shs', sh.start, { type: 'time' }), { hint: F('shh') }) + fld('pw-shg', F('shgrace'), inp('pw-shg', sh.grace, { mode: 'numeric' })) +
      fld('pw-shh', F('shhalf'), inp('pw-shh', sh.half, { mode: 'decimal' })) + fld('pw-shf', F('shfull'), inp('pw-shf', sh.full, { mode: 'decimal' })) + fld('pw-sho', F('shot'), inp('pw-sho', sh.otAfter, { mode: 'decimal' })) +
      fld('pw-bnp', F('bonpct'), inp('pw-bnp', bn.pct || R.DEF.bonusPct, { mode: 'decimal' })) + fld('pw-bnc', F('bonceil'), inp('pw-bnc', bn.ceil || R.DEF.bonusCeil, { mode: 'decimal' }), { hint: F('bonceilh') }) +
      fld('pw-bnl', F('bonlimit'), inp('pw-bnl', bn.limit || R.DEF.bonusLimit, { mode: 'decimal' })) + fld('pw-grc', F('gratceil'), inp('pw-grc', (c.grat || {}).ceil || R.DEF.gratCeil, { mode: 'decimal' })) +
      '</div><button type="button" class="btn sm primary" data-pwset>' + esc(A.T('save')) + '</button><p class="soft">' + esc(F('seth', { d: R.DEF.checked })) + '</p></details>';
  }
  function minHtml() {
    var L = (ST.cfg || {}).minWage || [];
    return '<details class="card pr-set"><summary>' + esc(F('minw')) + '</summary><p class="soft">' + esc(F('minwh')) + '</p>' +
      (L.length ? '<ul class="rows">' + L.map(function (m, i) { return '<li><span>' + esc((m.state ? NS.stateName(m.state) : F('anystate')) + ' · ' + F('skill_' + m.skill) + ' · ' + F('from', { m: m.from || '—' }) + (m.src ? ' · ' + m.src : '')) + '</span><b class="amt">' + esc(F('perday', { a: money(m.daily) })) + '</b> <button type="button" class="btn sm danger" data-mwdel="' + i + '">' + esc(A.T('del')) + '</button></li>'; }).join('') + '</ul>' : '') +
      '<div class="fg">' + fld('mw-st', F('state'), sel('mw-st', bizState(), [['', F('anystate')]].concat(NS.STATES.map(function (x) { return [x[0], x[1]]; })))) + fld('mw-sk', F('skill'), sel('mw-sk', 'us', SKILLS.map(function (k) { return [k, F('skill_' + k)]; }))) +
      fld('mw-d', F('mwdaily'), inp('mw-d', '', { mode: 'decimal' })) + fld('mw-f', F('mwfrom'), inp('mw-f', '', { type: 'date' })) + fld('mw-src', F('mwsrc'), inp('mw-src', ''), { wide: 1 }) + '</div><button type="button" class="btn sm" data-mwadd>+ ' + esc(F('mwadd')) + '</button></details>';
  }
  function headForm(id) {
    var H = heads(), h = H.filter(function (x) { return x.id === id; })[0] || { kind: 'earn', calc: 'att', esi: 1, tax: 1 }, sys = !!h.sys, earnH = H.filter(function (x) { return x.kind === 'earn' && x.id !== h.id && x.calc !== 'pct'; });
    X.open(id ? F('edithead') : F('addhead'), '<div class="fg">' + fld('pw-hn', F('hname'), inp('pw-hn', h.name || '', { req: 1 })) +
      (h.calc === 'ot' ? '' : fld('pw-hc', F('hcalc'), sel('pw-hc', h.calc, CALC.map(function (c) { return [c, F('calc_' + c)]; })))) +
      fld('pw-hp', F('pct'), inp('pw-hp', h.pct || '', { mode: 'decimal' }), { hint: F('pcth') }) + '</div>' +
      '<fieldset data-pwof><legend>' + esc(F('ofl')) + '</legend>' + earnH.map(function (x) { return '<label class="chk"><input type="checkbox" data-of="' + esc(x.id) + '"' + ((h.of || []).indexOf(x.id) >= 0 ? ' checked' : '') + '> ' + esc(x.name) + '</label>'; }).join('') + '</fieldset>' +
      '<fieldset><legend>' + esc(F('hflags')) + '</legend>' + ['pf', 'esi', 'tax'].map(function (k) { return '<label class="chk"><input type="checkbox" id="pw-f' + k + '"' + (h[k] ? ' checked' : '') + '> ' + esc(F('fl_' + k)) + '</label>'; }).join('') +
      '<label class="chk"><input type="checkbox" id="pw-foff"' + (h.off ? ' checked' : '') + '> ' + esc(F('offl')) + '</label></fieldset>' + (sys ? '<p class="soft">' + esc(F('sysh')) + '</p>' : ''),
    function () {
      var nm = val('pw-hn'); if (!nm) { NS.toast(A.T('need', { f: F('hname') }), 'bad'); return; }
      var own = (ST.cfg.heads = ST.cfg.heads || []), rec = own.filter(function (x) { return x.id === h.id; })[0];
      var nh = { id: h.id || R.newId(nm, H), name: nm, kind: 'earn', calc: h.calc === 'ot' ? 'ot' : val('pw-hc'), pct: num(val('pw-hp')), of: $$('[data-of]').filter(function (c) { return c.checked; }).map(function (c) { return c.getAttribute('data-of'); }),
        pf: $('#pw-fpf').checked ? 1 : 0, esi: $('#pw-fesi').checked ? 1 : 0, tax: $('#pw-ftax').checked ? 1 : 0, off: $('#pw-foff').checked ? 1 : 0 };
      if (nh.calc === 'pct' && !nh.of.length) { NS.toast(F('needof'), 'bad'); return; }
      if (rec) Object.assign(rec, nh); else own.push(nh);
      saveCfg().then(function () { var dl = $('.acx-dlg[open]'); if (dl) dl.close(); NS.toast(A.T('saved')); load(); });
    });
  }
  /* an employee's payroll details and salary structure rows (each with its effective month) */
  function structForm(e) {
    var H = heads().filter(function (h) { return h.kind === 'earn' && (h.calc === 'att' || h.calc === 'flat' || h.calc === 'pct') && !h.off });
    var rows = (e.struct && e.struct.length ? e.struct.slice() : [{ from: (e.doj || ST.ym).slice(0, 7), lines: (function () { var s = R.structFor(e, ST.ym), o = {}; H.forEach(function (h) { if (s[h.id]) o[h.id] = s[h.id]; }); return o; })() }]).sort(function (a, b) { return a.from < b.from ? -1 : 1; });
    function rowHtml(r, i) { return '<fieldset data-srow="' + i + '"><legend>' + esc(F('rowl', { n: i + 1 })) + '</legend><div class="fg">' + fld('pw-sf' + i, F('fromm'), inp('pw-sf' + i, r.from, { type: 'month', req: 1 })) + H.map(function (h) { return fld('pw-s' + i + '-' + h.id, h.name + (h.calc === 'pct' ? ' (%)' : ''), inp('pw-s' + i + '-' + h.id, r.lines[h.id] || '', { mode: 'decimal' })); }).join('') + '</div></fieldset>'; }
    X.open(F('structof', { n: e.name }), '<div class="fg">' +
      fld('pw-reg', F('regime'), sel('pw-reg', e.regime || 'new', [['new', F('regime_new')], ['old', F('regime_old')]])) + fld('pw-dob', F('dob'), inp('pw-dob', e.dob || '', { type: 'date' }), { hint: F('dobh') }) +
      fld('pw-pts', F('ptstate'), sel('pw-pts', e.ptState || '', [['', F('ptbiz')]].concat(NS.STATES.map(function (s) { return [s[0], s[0] + ' · ' + s[1]]; })))) +
      fld('pw-dev', F('devid'), inp('pw-dev', e.devId || '', { mode: 'text' }), { hint: F('devidh') }) +
      fld('pw-skill', F('skill'), sel('pw-skill', e.skill || '', [['', F('skill_')]].concat(SKILLS.map(function (k) { return [k, F('skill_' + k)]; }))), { hint: F('skillh') }) +
      fld('pw-sex', F('sex'), sel('pw-sex', e.sex || '', [['', '—'], ['f', F('sex_f')], ['m', F('sex_m')]]), { hint: F('sexh') }) +
      ['noPf', 'noEps', 'noEsi', 'noLwf', 'fixedTerm'].map(function (k) { return '<label class="chk f"><input type="checkbox" id="pw-' + k + '"' + (e[k] ? ' checked' : '') + '> ' + esc(F('k_' + k)) + '</label>'; }).join('') + '</div>' +
      '<div data-srows>' + rows.map(rowHtml).join('') + '</div><p><button type="button" class="btn sm" data-addinc>+ ' + esc(F('addinc')) + '</button></p><p class="soft">' + esc(F('inch')) + '</p>',
    function () {
      var n = $$('[data-srow]').length, out = [], seen = {};
      for (var i = 0; i < n; i++) {
        var fm = val('pw-sf' + i); if (!fm) continue; if (seen[fm]) { NS.toast(F('dupfrom', { m: fm }), 'bad'); return; } seen[fm] = 1;
        var lines = {}; H.forEach(function (h) { var v = val('pw-s' + i + '-' + h.id); if (v !== '') lines[h.id] = num(v); }); out.push({ from: fm, lines: lines });
      }
      var rec = Object.assign({}, e, { struct: out, regime: val('pw-reg'), dob: val('pw-dob'), ptState: val('pw-pts'), devId: val('pw-dev'), skill: val('pw-skill'), sex: val('pw-sex') });
      ['noPf', 'noEps', 'noEsi', 'noLwf', 'fixedTerm'].forEach(function (k) { if ($('#pw-' + k).checked) rec[k] = true; else delete rec[k]; });
      /* the usual pay of the employee list follows the structure in force today, so the slip maker fills the same amounts */
      var nowYm = NS.today().slice(0, 7), sorted = out.sort(function (a, b) { return a.from < b.from ? -1 : 1; }), last = sorted.filter(function (r) { return r.from <= nowYm; }).pop() || sorted[0];   /* the structure in force today, not a later increment */
      if (last) rec.earn = H.filter(function (h) { return h.calc !== 'pct' && num(last.lines[h.id]); }).map(function (h) { return { desc: h.name, amt: String(last.lines[h.id]) }; });
      S.put(rec).then(function () { var dl = $('.acx-dlg[open]'); if (dl) dl.close(); NS.toast(A.T('saved')); load(); if (A.staff && A.staff.refresh) A.staff.refresh(); }, function () { NS.toast(F('nosave'), 'bad'); });
    }, function (f) {
      $('[data-addinc]', f).addEventListener('click', function () { var box = $('[data-srows]', f), i = $$('[data-srow]', f).length, prev = i ? {} : {}; if (i) H.forEach(function (h) { prev[h.id] = $('#pw-s' + (i - 1) + '-' + h.id, f).value; }); box.insertAdjacentHTML('beforeend', rowHtml({ from: ST.ym, lines: prev }, i)); });
    });
  }
  function declForm(e) {
    var fy = TX.fyOf(ST.ym), d = (e.decl || {})[fy] || {};
    X.open(F('declof', { n: e.name, y: fy }), '<p class="soft">' + esc(F('declh')) + '</p><div class="fg">' +
      fld('pw-rent', F('rent'), inp('pw-rent', d.rent || '', { mode: 'decimal' })) + '<label class="chk f"><input type="checkbox" id="pw-metro"' + (d.metro ? ' checked' : '') + '> ' + esc(F('metro', { c: TX.CITIES })) + '</label>' +
      fld('pw-c80', F('c80'), inp('pw-c80', d.c80 || '', { mode: 'decimal' }), { hint: F('c80h') }) + fld('pw-d80', F('d80'), inp('pw-d80', d.d80 || '', { mode: 'decimal' })) +
      fld('pw-hli', F('hli'), inp('pw-hli', d.hli || '', { mode: 'decimal' })) + fld('pw-oth', F('othded'), inp('pw-oth', d.other || '', { mode: 'decimal' })) +
      fld('pw-psal', F('prevsal'), inp('pw-psal', d.prevSal || '', { mode: 'decimal' }), { hint: F('prevh') }) + fld('pw-ptds', F('prevtds'), inp('pw-ptds', d.prevTds || '', { mode: 'decimal' })) + '</div>',
    function () {
      var rec = Object.assign({}, e); rec.decl = Object.assign({}, e.decl || {});
      rec.decl[fy] = { rent: num(val('pw-rent')), metro: $('#pw-metro').checked, c80: num(val('pw-c80')), d80: num(val('pw-d80')), hli: num(val('pw-hli')), other: num(val('pw-oth')), prevSal: num(val('pw-psal')), prevTds: num(val('pw-ptds')) };
      S.put(rec).then(function () { var dl = $('.acx-dlg[open]'); if (dl) dl.close(); NS.toast(A.T('saved')); load(); if (A.staff && A.staff.refresh) A.staff.refresh(); });
    });
  }
  function headsBind(pane) {
    bindMonth(pane);
    $$('[data-pwhead]', pane).forEach(function (b) { b.addEventListener('click', function () { headForm(b.getAttribute('data-pwhead')); }); });
    $$('[data-pwstruct]', pane).forEach(function (b) { b.addEventListener('click', function () { var e = ST.emps.filter(function (x) { return x.id === b.getAttribute('data-pwstruct'); })[0]; if (e) structForm(e); }); });
    $$('[data-pwdecl]', pane).forEach(function (b) { b.addEventListener('click', function () { var e = ST.emps.filter(function (x) { return x.id === b.getAttribute('data-pwdecl'); })[0]; if (e) declForm(e); }); });
    var ma = $('[data-mwadd]', pane); if (ma) ma.addEventListener('click', function () {
      var d = num($('#mw-d', pane).value); if (!(d > 0)) { NS.toast(A.T('need', { f: F('mwdaily') }), 'bad'); return; }
      (ST.cfg.minWage = ST.cfg.minWage || []).push({ state: $('#mw-st', pane).value, skill: $('#mw-sk', pane).value, daily: d, from: $('#mw-f', pane).value, src: $('#mw-src', pane).value.trim() });
      saveCfg().then(function () { NS.toast(A.T('saved')); load(); });
    });
    $$('[data-mwdel]', pane).forEach(function (b) { b.addEventListener('click', function () { ST.cfg.minWage.splice(+b.getAttribute('data-mwdel'), 1); saveCfg().then(load); }); });
    var s = $('[data-pwset]', pane); if (s) s.addEventListener('click', function () {
      var c = ST.cfg, months = $('#pw-lm', pane).value.split(/[^0-9]+/).map(Number).filter(function (m) { return m >= 1 && m <= 12; });
      c.ot = { mult: num($('#pw-otm', pane).value) || R.DEF.otMult, hours: num($('#pw-oth', pane).value) || R.DEF.otHours };
      c.flags = c.flags || {}; c.flags.code50 = $('#pw-c50', pane).checked;
      c.lwf = { ee: num($('#pw-lee', pane).value), er: num($('#pw-ler', pane).value), months: months, pct: num($('#pw-lpct', pane).value), max: num($('#pw-lmax', pane).value), erX: num($('#pw-lerx', pane).value), src: (c.lwf || {}).src || '' };
      var lst = $('#pw-lst', pane) && $('#pw-lst', pane).value; if (lst && SR.LWF[lst]) c.lwf = Object.assign({ ee: 0, er: 0, pct: 0, max: 0, erX: 0 }, SR.LWF[lst]);   /* a state preset from an official text */
      var cols = $('#pw-bk', pane).value.split(/[^a-z]+/i).map(function (x) { return x.toLowerCase(); }).filter(function (x) { return R.BANKCOLS[x]; });
      c.bank = { cols: cols.length ? cols : ['name', 'acc', 'ifsc', 'amt', 'narr'] };
      c.bonus = { pct: Math.min(20, Math.max(8.33, num($('#pw-bnp', pane).value) || R.DEF.bonusPct)), ceil: num($('#pw-bnc', pane).value) || R.DEF.bonusCeil, limit: num($('#pw-bnl', pane).value) || R.DEF.bonusLimit };
      c.grat = { ceil: num($('#pw-grc', pane).value) || R.DEF.gratCeil };
      c.shift = { start: $('#pw-shs', pane).value || '09:30', grace: num($('#pw-shg', pane).value), half: num($('#pw-shh', pane).value) || 4, full: num($('#pw-shf', pane).value) || 8, otAfter: num($('#pw-sho', pane).value) || 9 };   /* device punches (attendance import) */
      saveCfg().then(function () { NS.toast(A.T('saved')); load(); });
    });
  }

  /* ================= Salary TDS working (S-30) ================= */
  function taxHtml() {
    var w = wait(); if (w) return w;
    var L = active(ST.ym).map(function (e) { return rowFor(e, ST.ym, ST.user[e.id]); });
    return '<p class="soft">' + esc(F('taxh')) + '</p>' + head() + (L.length ? '<div class="tbl-wrap"><table class="tbl pw-t"><thead><tr><th>' + esc(F('emp')) + '</th><th>' + esc(F('regime')) + '</th><th class="n">' + esc(F('ygross')) + '</th><th class="n">' + esc(F('ti')) + '</th><th class="n">' + esc(F('ytax')) + '</th><th class="n">' + esc(F('done')) + '</th><th class="n">' + esc(F('left')) + '</th><th class="n">' + esc(F('permonth')) + '</th><th></th></tr></thead><tbody>' +
      L.map(function (r) { var t = r.tx; return '<tr><th scope="row">' + esc(r.emp.name) + '</th><td>' + esc(F('regime_' + t.regime)) + '</td><td class="n">' + m0(t.gross) + '</td><td class="n">' + m0(t.ti) + '</td><td class="n">' + m0(t.total) + '</td><td class="n">' + m0(t.done) + '</td><td class="n">' + m0(t.due) + '</td><td class="n"><b>' + m0(t.perMonth) + '</b></td><td class="acts"><button type="button" class="btn sm" data-pwwork="' + esc(r.emp.id) + '">' + esc(F('working')) + '</button><button type="button" class="btn sm" data-pwdecl="' + esc(r.emp.id) + '">' + esc(F('decl')) + '</button></td></tr>'; }).join('') +
      '</tbody></table></div>' : '<p class="soft">' + esc(F('noemps')) + '</p>') + '<p class="soft">' + esc(F('taxnote', { d: TX.RULES.checked })) + '</p>';
  }
  function workHtml(e) {
    var r = rowFor(e, ST.ym, ST.user[e.id]), c = TX.compare(r.txIn);
    var col = function (t) { return '<table class="tbl pw-w"><tbody>' + t.lines.map(function (l) { return '<tr><td>' + esc(l[0]) + '</td><td class="n">' + m0(l[1]) + '</td></tr>'; }).join('') + '</tbody></table>'; };
    return '<p><b>' + esc(e.name) + '</b> · PAN ' + esc(e.pan || '—') + ' · ' + esc(F('tyear', { y: TX.fyOf(ST.ym) })) + '</p><div class="pw-cols"><div><h3>' + esc(F('regime_new')) + '</h3>' + col(c.neu) + '</div><div><h3>' + esc(F('regime_old')) + '</h3>' + col(c.old) + '</div></div>' +
      '<p class="callout">' + esc(F('better', { r: F('regime_' + c.better), a: money(Math.abs(c.neu.total - c.old.total)), c: F('regime_' + (e.regime || 'new')) })) + '</p><p class="soft">' + esc(F('form16')) + '</p>';
  }
  function taxBind(pane) {
    bindMonth(pane);
    $$('[data-pwdecl]', pane).forEach(function (b) { b.addEventListener('click', function () { var e = ST.emps.filter(function (x) { return x.id === b.getAttribute('data-pwdecl'); })[0]; if (e) declForm(e); }); });
    $$('[data-pwwork]', pane).forEach(function (b) { b.addEventListener('click', function () {
      var e = ST.emps.filter(function (x) { return x.id === b.getAttribute('data-pwwork'); })[0]; if (!e) return;
      var h = workHtml(e);
      X.open(F('workof', { n: e.name }), h + '<p><button type="button" class="btn sm" data-pwwp data-ic="print">' + esc(A.T('print')) + '</button></p>', function () { var dl = $('.acx-dlg[open]'); if (dl) dl.close(); }, function (f) {
        $('[data-pwwp]', f).addEventListener('click', function () { var w = window.open('', '_blank'); if (!w) return; w.document.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Tax working ' + esc(e.name) + '</title><style>body{font:13px system-ui,sans-serif;margin:14mm}table{border-collapse:collapse;width:100%}td{border:1px solid #aaa;padding:4px 6px}.n{text-align:right}.pw-cols{display:grid;grid-template-columns:1fr 1fr;gap:12px}' + NS.pageBoxes(true) + '</style></head><body><h2>' + esc(A.bizName() || '') + ': income-tax working on salary</h2>' + h + '<script>window.print()<\/script></body></html>'); w.document.close(); });
      });
    }); });
  }

  /* ================= Bonus and gratuity (S-32, T-B17) ================= */
  function yearHtml() {
    var w = wait(); if (w) return w;
    var fy = TX.fyOf(ST.ym), ys = fy.slice(0, 4), c = ST.cfg || {}, bc = Object.assign({}, R.DEF, { bonusPct: (c.bonus || {}).pct, bonusCeil: (c.bonus || {}).ceil, bonusLimit: (c.bonus || {}).limit, gratCeil: (c.grat || {}).ceil });
    Object.keys(bc).forEach(function (k) { if (bc[k] == null) bc[k] = R.DEF[k]; });
    var rows = ST.emps.map(function (e) {
      var wages = [], days = 0;
      slips().forEach(function (d) { if (d.month && TX.fyOf(d.month) === fy && key(B.partyName(d)) === key(e.name)) { var bd = 0; (d.earn || []).forEach(function (l) { var h = l.head || R.guess(l.desc); if (h === 'basic' || h === 'da') bd += num(l.amt); }); wages.push(bd); days += num(d.paid || d.days); } });
      return { emp: e, wages: wages, days: days };
    }).filter(function (r) { return r.wages.length; });
    var bon = R.bonus(rows, bc), on = (+ys + 1) + '-03-31';
    var gr = ST.emps.filter(function (e) { return !e.left || e.left >= ys + '-04-01'; }).map(function (e) { var s = R.structFor(e, ST.ym); return Object.assign({ emp: e }, R.gratuity(e, num(s.basic) + num(s.da), e.left && e.left < on ? e.left : on, bc)); });
    var bt = bon.reduce(function (s, b) { return s + b.amt; }, 0), gt = gr.reduce(function (s, g) { return s + g.amt; }, 0);
    return '<p class="soft">' + esc(F('yearh', { y: fy })) + '</p>' + head() +
      '<h3>' + esc(F('bonus')) + '</h3>' + (bon.length ? '<div class="tbl-wrap"><table class="tbl pw-t"><thead><tr><th>' + esc(F('emp')) + '</th><th class="n">' + esc(F('bbase')) + '</th><th class="n">%</th><th class="n">' + esc(F('bamt')) + '</th><th></th></tr></thead><tbody>' +
        bon.map(function (b) { return '<tr><th scope="row">' + esc(b.emp.name) + '</th><td class="n">' + m0(b.base) + '</td><td class="n">' + b.pct + '</td><td class="n"><b>' + m0(b.amt) + '</b></td><td>' + (b.eligible ? '' : '<span class="pill">' + esc(F('bno_' + b.why)) + '</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="soft">' + esc(F('noslipsy')) + '</p>') +
      '<p class="soft">' + esc(F('bonush', { c: money(bc.bonusCeil), l: money(bc.bonusLimit) })) + '</p>' +
      '<h3>' + esc(F('grat')) + '</h3>' + (gr.length ? '<div class="tbl-wrap"><table class="tbl pw-t"><thead><tr><th>' + esc(F('emp')) + '</th><th>' + esc(F('doj')) + '</th><th class="n">' + esc(F('years')) + '</th><th class="n">' + esc(F('gamt')) + '</th><th></th></tr></thead><tbody>' +
        gr.map(function (g) { return '<tr><th scope="row">' + esc(g.emp.name) + '</th><td>' + esc(g.emp.doj ? A.ldate(g.emp.doj) : '—') + '</td><td class="n">' + g.years + '</td><td class="n"><b>' + m0(g.amt) + '</b></td><td>' + (g.why === 'doj' ? '<span class="pill warn">' + esc(F('nodoj')) + '</span>' : g.eligible ? '<span class="pill ok">' + esc(F('gdue')) + '</span>' : '<span class="pill">' + esc(F('gnot', { n: g.need })) + '</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '') +
      '<p class="soft">' + esc(F('grath', { c: money(bc.gratCeil) })) + '</p>' +
      '<div class="acts pr-tools"><button type="button" class="btn primary" data-pwprov data-b="' + bt + '" data-g="' + gt + '">' + esc(F('bookprov')) + '</button><button type="button" class="btn" data-pwyxl data-ic="download">' + esc(F('yxl')) + '</button></div><p class="soft">' + esc(F('provh')) + '</p>';
  }
  function yearBind(pane) {
    bindMonth(pane);
    var p = $('[data-pwprov]', pane); if (p) p.addEventListener('click', function () {
      var fy = TX.fyOf(ST.ym), date = (+fy.slice(0, 4) + 1) + '-03-31', bt = num(p.getAttribute('data-b')), gt = num(p.getAttribute('data-g'));
      /* gratuity: only the rise over what is already provided (the liability account's balance) */
      var acc = B.accounts(A.mine(), A.bizName()), had = -(acc['ocl:provision for gratuity'] || 0), hadB = -(acc['ocl:bonus payable'] || 0), gch = r2(gt - had), bch = r2(bt - hadB);
      if (!(gch > 0) && !(bch > 0)) { NS.toast(F('provnone'), 'bad'); return; }
      ask(F('provq', { b: money(Math.max(0, bch)), g: money(Math.max(0, gch)), d: A.ldate(date) })).then(function (yes) {
        if (!yes) return;
        var lines = []; if (bch > 0) { lines.push({ a: 'exp:bonus to employees', dr: bch, cr: 0 }, { a: 'ocl:bonus payable', dr: 0, cr: bch }); }
        if (gch > 0) { lines.push({ a: 'exp:gratuity', dr: gch, cr: 0 }, { a: 'ocl:provision for gratuity', dr: 0, cr: gch }); }
        var d = { type: 'jv', app: 1, no: X.nextNo('jv', 'JV', date), date: date, seller: X.sellerCopy(), lines: lines, narr: 'Bonus and gratuity provision for ' + fy + ' (payroll working)', total: r2(Math.max(0, bch) + Math.max(0, gch)) };
        NSStore.put('doc', d).then(function () { NS.toast(A.T('saved')); A.show(); });
      });
    });
    var x = $('[data-pwyxl]', pane); if (x) x.addEventListener('click', function () {
      var rows = [['Employee', 'Date of joining', 'Last basic + DA', 'Completed years', 'Gratuity worked out']];
      ST.emps.forEach(function (e) { var s = R.structFor(e, ST.ym), g = R.gratuity(e, num(s.basic) + num(s.da), (+TX.fyOf(ST.ym).slice(0, 4) + 1) + '-03-31', R.DEF); rows.push([e.name, e.doj || '', num(s.basic) + num(s.da), g.years, g.amt]); });
      NS.loadLazy(['xlsx.js']).then(function () { NS.saveFile(NS.xlsx.write([['Gratuity', rows]]), 'gratuity-working.xlsx'); });
    });
  }

  /* ================= Full and final settlement (T-B19) =================
     From Employees › Full and final: the leaving month's salary up to the last day, leave encashment, gratuity, bonus still owed,
     notice pay (paid or recovered), the advance still owed, other lines; TDS on all of it as the year's last month; saves one salary
     slip (ff: { ... }) marked into the accounts, marks the employee as left, keeps the ESI reason and last day, prints a statement. */
  var REASONS = [['res', 2], ['ret', 3], ['term', 10], ['died', 5], ['end', 2]];
  function ffWork(e, o) {
    var ym = o.date.slice(0, 7), dim = R.days(ym), lastD = +o.date.slice(8, 10), rec = (ST.att.months[ym] || {})[e.id], st = R.structFor(e, ym);
    var e2 = Object.assign({}, e, { left: o.date }), sd = P.slipDays(rec, ym, ST.att.cfg, e2), att = sd || { days: dim, paid: lastD - (e.doj && e.doj.slice(0, 7) === ym ? +e.doj.slice(8, 10) - 1 : 0), ot: 0 };
    var cfg = runCfg(), first = R.row({ emp: e2, ym: ym, heads: heads(), att: att, cfg: cfg, P: P }), pt = SR ? SR.pt(e.ptState || bizState(), first.gross, +ym.slice(5, 7), e) : 0;
    var row = R.row({ emp: e2, ym: ym, heads: heads(), att: att, cfg: cfg, P: P, pt: pt || 0 });
    var bd = num(st.basic) + num(st.da), gross = R.monthTaxable(e, ym, heads());
    var f = R.ff({ row: row, bd: bd, gross: gross, leaveDays: o.leave, grat: { amt: o.grat, eligible: o.grat > 0 }, bonus: o.bonus, noticeDays: o.nDays, noticeGiven: o.nGiven, noticeBy: o.nBy, noticeOn: o.nOn, advOwed: o.adv,
      extraEarn: o.xe ? [{ desc: o.xeDesc || 'Other payment', amt: o.xe }] : [], extraDed: o.xd ? [{ desc: o.xdDesc || 'Other deduction', amt: o.xd }] : [] });
    /* TDS: this is the last month of pay this year: everything still due is cut now */
    var y = ytdOf(e, ym), dc = declOf(e, ym), lump = f.parts.leave + f.parts.grat + f.parts.bonus + (f.parts.notice || 0) + num(o.xe), taxLump = Math.max(0, lump - num(o.exG) - num(o.exL));
    var tx = TX.year({ ym: ym, regime: e.regime || 'new', age: ageOf(e, ym), paidYtd: y.tax, tdsYtd: y.tds, month: row.taxable, oneOff: taxLump, future: 0, pt: y.pt + (pt || 0), pfEe: y.pf + row.amt('pf'),
      hra: { recv: y.hra + row.amt('hra'), basicDa: y.bda + row.amt('basic') + row.amt('da'), rent: num(dc.rent) * (TX.monthNo(ym)), metro: !!dc.metro }, decl: dc, prev: { sal: dc.prevSal, tds: dc.prevTds } });
    var tds = o.tds !== '' && o.tds != null ? num(o.tds) : tx.due;
    f.ded = f.ded.filter(function (l) { return l.head !== 'tds'; }); if (tds > 0) f.ded.push({ head: 'tds', desc: R.DED.tds, amt: Math.round(tds) });
    f.dedTotal = f.ded.reduce(function (a, l) { return a + l.amt; }, 0); f.net = f.gross - f.dedTotal;
    return { f: f, row: row, att: att, tx: tx, bd: bd, gross: gross, ym: ym, tds: tds };
  }
  function ffForm(e) {
    if (!ST.ready) { load().then(function () { ffForm(e); }); return; }
    var ym0 = NS.today().slice(0, 7), lv = 0;
    P.leaveTypes().forEach(function (t) { if (t.encash) lv += Math.max(0, P.leaveBal(ST.att, e, t, ym0, (ST.cfg.leave || {}), { leaving: true }).bal); });   /* this year's earned leave is due on leaving (OSH Code s.32(1)(vi)) */
    var st = R.structFor(e, ym0), bd = num(st.basic) + num(st.da), c = ST.cfg || {}, g = R.gratuity(e, bd, NS.today(), { gratCeil: (c.grat || {}).ceil || R.DEF.gratCeil });
    var av = advOf(e), fy = TX.fyOf(ym0), wages = [], days = 0;
    slips().forEach(function (d) { if (d.month && TX.fyOf(d.month) === fy && key(B.partyName(d)) === key(e.name)) { var b = 0; (d.earn || []).forEach(function (l) { var h = l.head || R.guess(l.desc); if (h === 'basic' || h === 'da') b += num(l.amt); }); wages.push(b); days += num(d.paid || d.days); } });
    var bon = R.bonus([{ emp: e, wages: wages, days: days }], { bonusPct: (c.bonus || {}).pct || R.DEF.bonusPct, bonusCeil: (c.bonus || {}).ceil || R.DEF.bonusCeil, bonusLimit: (c.bonus || {}).limit || R.DEF.bonusLimit })[0];
    /* average basic + DA of the last 10 months' slips (else the structure) for the tax exemptions */
    var last10 = slips().filter(function (d) { return key(B.partyName(d)) === key(e.name) && d.month; }).sort(function (a, b) { return a.month < b.month ? 1 : -1; }).slice(0, 10), sum10 = 0;
    last10.forEach(function (d) { (d.earn || []).forEach(function (l) { var h = l.head || R.guess(l.desc); if (h === 'basic' || h === 'da') sum10 += num(l.amt); }); });
    var avgBD = last10.length ? sum10 / last10.length : bd, ex = R.ffExempt({ avgBD: avgBD, months: g.months, grat: g.eligible ? g.amt : 0, leaveDays: lv, leaveAmt: lv * bd / 26 });
    var gEx = ex.grat, q = function (id, lab, v, o) { return fld(id, lab, inp(id, v, Object.assign({ mode: 'decimal' }, o || {})), o && o.hint ? { hint: o.hint } : null); };
    X.open(F('ffof', { n: e.name }), '<p class="soft">' + esc(F('ffh')) + '</p><div class="fg">' +
      fld('ff-date', F('ffdate'), inp('ff-date', NS.today(), { type: 'date', req: 1 })) + fld('ff-why', F('ffwhy'), sel('ff-why', 'res', REASONS.map(function (r) { return [r[0], F('why_' + r[0])]; }))) +
      q('ff-nd', F('ffnd'), 30) + q('ff-ng', F('ffng'), 30) + fld('ff-nby', F('ffnby'), sel('ff-nby', 'emp', [['emp', F('nby_emp')], ['er', F('nby_er')]])) + fld('ff-non', F('ffnon'), sel('ff-non', 'gross', [['gross', F('non_gross')], ['bd', F('non_bd')]])) +
      q('ff-leave', F('ffleave'), lv, { hint: F('ffleaveh') }) + q('ff-grat', F('ffgrat'), g.eligible ? g.amt : 0, { hint: g.eligible ? F('ffgrath', { y: g.years }) : F('ffgratno', { y: g.years, n: g.need }) }) +
      q('ff-bonus', F('ffbonus'), bon ? bon.amt : 0, { hint: F('ffbonush') }) + q('ff-adv', F('ffadv'), Math.max(0, av.owed)) +
      q('ff-exg', F('ffexg'), gEx, { hint: F('ffexgh') }) + q('ff-exl', F('ffexl'), ex.leave, { hint: F('ffexlh') }) +
      fld('ff-xed', F('ffxed'), inp('ff-xed', '')) + q('ff-xe', F('ffxe'), '') + fld('ff-xdd', F('ffxdd'), inp('ff-xdd', '')) + q('ff-xd', F('ffxd'), '') + q('ff-tds', F('fftds'), '', { hint: F('fftdsh') }) +
      '</div><div class="card" data-ffsum aria-live="polite"></div><p class="soft">' + esc(F('ffnote')) + '</p>',
    function () {
      var o = read(); if (!o.date) { NS.toast(A.T('need', { f: F('ffdate') }), 'bad'); return; }
      if (A.closedMsg && A.closedMsg(o.date)) { NS.toast(A.closedMsg(o.date), 'bad'); return; }
      var w = ffWork(e, o), acc = B.accounts(A.mine(), A.bizName()), provG = Math.max(0, -(acc['ocl:provision for gratuity'] || 0)), provB = Math.max(0, -(acc['ocl:bonus payable'] || 0));
      var old = slipOf(e, w.ym); if (old && old.payDate) { NS.toast(F('ffpaid'), 'bad'); return; }
      ask(F('ffq', { n: e.name, a: money(w.f.net) })).then(function (yes) {
        if (!yes) return;
        var d = slipDoc({ emp: Object.assign({}, e, { left: o.date }), days: w.att.days, paid: w.att.paid, earn: w.f.earn, ded: w.f.ded, erPf: w.row.erPf, erEsi: w.row.erEsi, erLwf: w.row.erLwf, net: w.f.net, ot: { hours: 0 } }, old);
        d.month = w.ym; d.date = o.date; d.ff = { date: o.date, why: o.why, notice: { days: o.nDays, given: o.nGiven, by: o.nBy }, leave: o.leave, exempt: { grat: o.exG, leave: o.exL } };
        d.prov = { grat: Math.min(provG, w.f.parts.grat || 0), bonus: Math.min(provB, w.f.parts.bonus || 0) };
        NSStore.put('doc', d).then(function () {
          var rec = Object.assign({}, e, { left: o.date, leftWhy: o.why }); return S.put(rec);
        }).then(function () {
          var fl = ST.cfg.flags = ST.cfg.flags || {}; fl[e.id] = Object.assign(fl[e.id] || {}, { reason: (REASONS.filter(function (r) { return r[0] === o.why; })[0] || [0, 2])[1] }); return saveCfg();
        }).then(function () { var dl = $('.acx-dlg[open]'); if (dl) dl.close(); NS.toast(F('ffsaved')); ffPrint(e, d, w); load(); if (A.staff && A.staff.refresh) A.staff.refresh(); A.show(); });
      });
    }, function (f) {
      function upd() { var o = read(); if (!o.date) return; var w = ffWork(e, o); $('[data-ffsum]', f).innerHTML = ffTable(w.f, w); }
      f.addEventListener('input', upd); f.addEventListener('change', upd); upd();
    });
    function read() { var v = function (id) { var x = $('#' + id); return x ? x.value.trim() : ''; }; return { date: v('ff-date'), why: v('ff-why'), nDays: num(v('ff-nd')), nGiven: num(v('ff-ng')), nBy: v('ff-nby'), nOn: v('ff-non'), leave: num(v('ff-leave')), grat: num(v('ff-grat')), bonus: num(v('ff-bonus')), adv: num(v('ff-adv')), exG: num(v('ff-exg')), exL: num(v('ff-exl')), xe: num(v('ff-xe')), xeDesc: v('ff-xed'), xd: num(v('ff-xd')), xdDesc: v('ff-xdd'), tds: v('ff-tds') }; }
  }
  function ffTable(f, w) {
    var n = Math.max(f.earn.length, f.ded.length), r = '';
    for (var i = 0; i < n; i++) { var a = f.earn[i], c = f.ded[i]; r += '<tr><td>' + esc(a ? a.desc : '') + '</td><td class="n">' + (a ? m0(a.amt) : '') + '</td><td>' + esc(c ? c.desc : '') + '</td><td class="n">' + (c ? m0(c.amt) : '') + '</td></tr>'; }
    return '<div class="tbl-wrap"><table class="tbl pw-w"><thead><tr><th>' + esc(F('ffpay')) + '</th><th class="n"></th><th>' + esc(F('ffcut')) + '</th><th class="n"></th></tr></thead><tbody>' + r + '</tbody><tfoot><tr><th>' + esc(F('gross')) + '</th><th class="n">' + m0(f.gross) + '</th><th>' + esc(F('dedall')) + '</th><th class="n">' + m0(f.dedTotal) + '</th></tr><tr><th colspan="3">' + esc(F('ffnet')) + '</th><th class="n"><b>' + m0(f.net) + '</b></th></tr></tfoot></table></div>' +
      '<p class="soft">' + esc(F('ffdays', { p: w.att.paid, d: w.att.days, l: f.daily })) + '</p>';
  }
  function ffPrint(e, d, w) {
    var b = A.biz() || {}, win = window.open('', '_blank'); if (!win) { NS.toast(F('popup'), 'bad'); return; }
    var f = w.f, ff = d.ff || {};
    win.document.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Full and final settlement ' + esc(e.name) + '</title><style>body{font:13px/1.45 system-ui,sans-serif;margin:16mm}table{width:100%;border-collapse:collapse;margin:8px 0}th,td{border:1px solid #999;padding:5px 7px;text-align:left}.n{text-align:right}h1{font-size:19px;margin:0}h2{font-size:15px}.s{margin-top:40px;display:flex;justify-content:space-between}' + NS.pageBoxes(false) + '</style></head><body>' +
      '<h1>' + esc(b.name || A.bizName() || '') + '</h1><p>' + esc([b.addr, b.city].filter(Boolean).join(', ')) + '</p><h2>Full and final settlement</h2>' +
      '<table><tr><th>Employee</th><td>' + esc(e.name) + '</td><th>Code</th><td>' + esc(e.code || '') + '</td></tr><tr><th>Joined</th><td>' + esc(e.doj || '') + '</td><th>Last working day</th><td>' + esc(ff.date || '') + '</td></tr><tr><th>Reason</th><td>' + esc(F('why_' + ff.why)) + '</td><th>PAN / UAN</th><td>' + esc((e.pan || '—') + ' / ' + (e.uan || '—')) + '</td></tr></table>' +
      ffTable(f, w).replace(/<p class="soft">.*<\/p>$/, '') + '<p>Net payable in words: ' + esc(NS.inWords(Math.max(0, f.net))) + '</p>' +
      '<p>I have received the above amount in full and final settlement of all my dues.</p><div class="s"><span>For the employer</span><span>Signature of the employee</span></div>' +
      '<p style="color:#555;font-size:11px;margin-top:24px">Designed &amp; Developed by: Nivesh Sahayak</p><script>window.print()<\/script></body></html>');
    win.document.close();
  }
  A.payrunFF = ffForm;

  /* ================= Leave types and balances (T-B16) ================= */
  var ACCR = ['m', 'y', 'w20'];
  function leaveHtml() {
    var w = wait(); if (w) return w;
    var L = (ST.cfg.leave || {}), T = P.leaveTypes(), E = active(ST.ym), year = P.leaveYear(ST.ym, L.yearStart);
    var types = '<div class="tbl-wrap"><table class="tbl pw-t"><thead><tr><th>' + esc(F('lcode')) + '</th><th>' + esc(F('lname')) + '</th><th class="n">' + esc(F('lper')) + '</th><th>' + esc(F('lacc')) + '</th><th class="n">' + esc(F('lcarry')) + '</th><th>' + esc(F('lenc')) + '</th><th></th></tr></thead><tbody>' +
      T.map(function (t, i) { return '<tr><th scope="row">' + esc(t.code) + '</th><td>' + esc(t.name) + '</td><td class="n">' + esc(t.accrue === 'w20' ? '—' : String(t.perYear)) + '</td><td>' + esc(F('acc_' + t.accrue)) + '</td><td class="n">' + esc(t.carry === '' || t.carry == null ? F('all') : String(t.carry)) + '</td><td>' + esc(t.encash ? F('yes') : F('no')) + '</td><td class="acts"><button type="button" class="btn sm" data-lvedit="' + i + '">' + esc(A.T('edit')) + '</button></td></tr>'; }).join('') +
      '</tbody></table></div>';
    var bal = T.length && E.length ? '<h3>' + esc(F('lbal', { y: year })) + '</h3><div class="tbl-wrap"><table class="tbl pw-t"><thead><tr><th>' + esc(F('emp')) + '</th>' + T.map(function (t) { return '<th class="n">' + esc(t.code + ' ' + F('lopen')) + '</th><th class="n">' + esc(t.code + ' ' + F('lleft')) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      E.map(function (e) { return '<tr><th scope="row">' + esc(e.name) + '</th>' + T.map(function (t) { var b = P.leaveBal(ST.att, e, t, ST.ym, L), os = b.osh, note = os ? (os.data ? (os.ok ? F('oshok', { d: os.counted, w: os.worked }) : F('oshno', { d: os.counted, n: os.need })) : F('oshnodata')) : '';
            return '<td class="n"><input class="pw-in" inputmode="decimal" dir="ltr" data-lvo="' + esc(e.id) + '" data-c="' + t.code + '" value="' + esc(b.open || '') + '" aria-label="' + esc(e.name + ' ' + t.code + ' ' + F('lopen')) + '"></td><td class="n" title="' + esc(F('lbalh', { o: b.open, e: b.earned, t: b.taken }) + (note ? ' · ' + note : '')) + '"><b>' + b.bal + '</b>' + (os && !os.ok ? ' <span class="pill" title="' + esc(note) + '">' + esc(os.data ? F('oshshort') : F('oshnone')) + '</span>' : '') + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div><p class="soft">' + esc(F('lbalnote')) + '</p><p><button type="button" class="btn sm" data-lvcarry>' + esc(F('lcarrybtn', { y: +year + 1 })) + '</button></p>' : '';
    return '<p class="soft">' + esc(F('leaveh')) + '</p>' + head() + (T.length ? types : '<p class="soft">' + esc(F('notypes')) + '</p>') +
      '<p><button type="button" class="btn" data-lvedit="-1">+ ' + esc(F('laddtype')) + '</button>' + (T.some(function (t) { return t.code === 'EL'; }) ? '' : ' <button type="button" class="btn" data-lvpre title="' + esc(F('lelpreh')) + '">+ ' + esc(F('lelpre')) + '</button>') + '</p>' +
      '<div class="fg">' + fld('pw-lys', F('lys'), sel('pw-lys', String(L.yearStart || 1), [['1', F('lys_1')], ['4', F('lys_4')]])) + fld('pw-late', F('llate'), inp('pw-late', L.lateN || '', { mode: 'numeric' }), { hint: F('llateh') }) + '</div><p><button type="button" class="btn sm" data-lvset>' + esc(A.T('save')) + '</button></p>' + bal;
  }
  function leaveBind(pane) {
    bindMonth(pane);
    var L = ST.cfg.leave = ST.cfg.leave || { types: [] }; L.types = L.types || [];
    $$('[data-lvedit]', pane).forEach(function (b) { b.addEventListener('click', function () {
      var i = +b.getAttribute('data-lvedit'), t = L.types[i] || { code: '', name: '', perYear: '', accrue: 'm', carry: '', encash: false };
      X.open(F(i < 0 ? 'laddtype' : 'ledittype'), '<div class="fg">' + fld('lv-code', F('lcode'), inp('lv-code', t.code, { mode: 'text', req: 1 }), { hint: F('lcodeh') }) + fld('lv-name', F('lname'), inp('lv-name', t.name, { req: 1 })) +
        fld('lv-acc', F('lacc'), sel('lv-acc', t.accrue, ACCR.map(function (a) { return [a, F('acc_' + a)]; }))) + fld('lv-per', F('lper'), inp('lv-per', t.perYear, { mode: 'decimal' })) +
        fld('lv-carry', F('lcarry'), inp('lv-carry', t.carry, { mode: 'decimal' }), { hint: F('lcarryh') }) + '<label class="chk f"><input type="checkbox" id="lv-enc"' + (t.encash ? ' checked' : '') + '> ' + esc(F('lenc')) + '</label>' +
        (i >= 0 ? '<label class="chk f"><input type="checkbox" id="lv-del"> ' + esc(F('ldel')) + '</label>' : '') + '</div>', function () {
        var code = val('lv-code').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4), nm = val('lv-name');
        if (!code || !nm) { NS.toast(A.T('need', { f: F('lcode') }), 'bad'); return; }
        if (P.BASE.indexOf(code) >= 0 || L.types.some(function (x, j) { return j !== i && x.code === code; })) { NS.toast(F('lcodedup', { c: code }), 'bad'); return; }
        var nt = { code: code, name: nm, accrue: val('lv-acc'), perYear: num(val('lv-per')), carry: val('lv-carry') === '' ? '' : num(val('lv-carry')), encash: $('#lv-enc').checked };
        if (i >= 0 && $('#lv-del') && $('#lv-del').checked) L.types.splice(i, 1); else if (i >= 0) L.types[i] = nt; else L.types.push(nt);
        saveCfg().then(function () { var dl = $('.acx-dlg[open]'); if (dl) dl.close(); NS.toast(A.T('saved')); load(); });
      });
    }); });
    var pre = $('[data-lvpre]', pane); if (pre) pre.addEventListener('click', function () { L.types.push({ code: 'EL', name: 'Earned leave', accrue: 'w20', perYear: '', carry: 30, encash: true }); saveCfg().then(function () { NS.toast(A.T('saved')); load(); }); });
    var st = $('[data-lvset]', pane); if (st) st.addEventListener('click', function () { L.yearStart = +$('#pw-lys', pane).value || 1; L.lateN = num($('#pw-late', pane).value) || 0; saveCfg().then(function () { NS.toast(A.T('saved')); load(); }); });
    var year = P.leaveYear(ST.ym, L.yearStart);
    function openOf(y) { var a = ST.att.leave = ST.att.leave || {}; a.open = a.open || {}; return a.open[y] = a.open[y] || {}; }
    $$('[data-lvo]', pane).forEach(function (i) { i.addEventListener('change', function () { var o = openOf(year), id = i.getAttribute('data-lvo'); (o[id] = o[id] || {})[i.getAttribute('data-c')] = num(i.value); P.Store.saveAtt(ST.att).then(function () { A.show(); }); }); });
    var cr = $('[data-lvcarry]', pane); if (cr) cr.addEventListener('click', function () {
      var start = +L.yearStart || 1, last = R.addM(year + '-' + String(start).padStart(2, '0'), 11), nx = openOf(String(+year + 1));
      active(ST.ym).forEach(function (e) { P.leaveTypes().forEach(function (t) { (nx[e.id] = nx[e.id] || {})[t.code] = P.carryOver(ST.att, e, t, last, L); }); });
      P.Store.saveAtt(ST.att).then(function () { NS.toast(F('lcarried', { y: +year + 1 })); });
    });
  }
  A.staffExt.leave = { html: leaveHtml, bind: leaveBind };
  A.staffExt.run = { html: runHtml, bind: runBind };
  A.staffExt.heads = { html: headsHtml, bind: headsBind };
  A.staffExt.tax = { html: taxHtml, bind: taxBind };
  A.staffExt.year = { html: yearHtml, bind: yearBind };
  window.addEventListener('hashchange', function () { if (/^#stf\/(run|heads|tax|year|leave)/.test(location.hash)) load(); });
  document.addEventListener('ns-data', function () { if (/^#stf\/(run|heads|tax|year|leave)/.test(location.hash)) load(); });
  load();   /* leave types become attendance marks as soon as the App opens */
  A.payrun = { state: ST, rowFor: rowFor, load: load };
})();

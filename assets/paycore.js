/* NSPayRun: pay heads, salary structure per employee and the month's salary run for all employees (ERP round 2: S-27, S-28, T-B14,
   T-B15, T-B18, S-32). Pure functions, tested by scripts/test_payrun.js; the screens are in engine/payrun.js.

   PAY HEADS  meta 'payroll'.heads = [{ id, name, kind 'earn' | 'ded', calc 'att' (monthly amount paid for the days paid) | 'flat'
              (full amount every month) | 'pct' (pct % of the heads in 'of') | 'user' (typed in the run), pct, of: [ids],
              pf (part of PF wages), esi (part of ESI wages), tax (taxable salary), off (no longer used) }].
              Built-in heads (always there, cannot be removed): basic, da, hra, conv, spl, ot, bonus, arrear (earnings);
              the deductions PF, ESI, PT, LWF, TDS, advance and loan recovery are worked out by the run, not typed as heads.
   STRUCTURE  employee.struct = [{ from: 'YYYY-MM', lines: { <headId>: monthly amount (or % for a 'pct' head) } }]: the newest one
              that started on or before the month applies (an increment = a new row from its month). An employee with no structure
              uses the "usual pay" of the employee list (emp.earn) read by its names.
   THE RUN    row(): earnings by the structure for the days paid (attendance), overtime, PF (NSPayroll.pfLine), ESI (esiLine),
              professional tax (NSStatRates), labour welfare fund (typed per business), TDS (NSSalTax, by the caller), advance and
              loan recovery, net pay. Every slip line keeps its head id, so the books read PF / ESI / PT / LWF / TDS by head.
   OVERTIME   Code on Wages, 2019, s.14: overtime at not less than twice the ordinary rate of wages (multiplier is a setting, default 2);
              hourly rate = (basic + DA for the month) / (days in the month x normal hours a day).
   BONUS      Code on Wages, 2019, ss.26-27: 8.33% (minimum) to 20% (maximum) of the wage (basic + DA) earned in the year, wage
              counted at most the ceiling (typed setting, default 7,000 a month or the minimum wage if higher), employees earning
              up to the eligibility limit (typed, default 21,000 a month) who worked at least 30 days in the year.
              Eligibility Rs 21,000 a month (S.O. 4711(E)) and calculation ceiling Rs 7,000 or the minimum wage (S.O. 4710(E)), both of
              25 Aug 2026 with effect from 21 Nov 2025 (the codes' start: S.O. 5319(E), 5322(E)). Read 19 Nov 2026.
   GRATUITY   Code on Social Security, 2020, s.53: 15 days' wages (last basic + DA / 26 x 15) for every completed year (part above
              6 months counts as a year), payable after 5 years of continuous service. The 1 year for a fixed-term employee and the
              Rs 20 lakh ceiling are from the Labour Ministry's FAQ (not the Code text): typed settings. */
(function (root) {
  'use strict';
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; }
  function rup(v) { return Math.round(v + 1e-9); }
  function r2(v) { return Math.round((v + 1e-9) * 100) / 100; }
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  var N = {};
  N.HEADS = [
    { id: 'basic', name: 'Basic salary', kind: 'earn', calc: 'att', pf: 1, esi: 1, tax: 1, sys: 1 },
    { id: 'da', name: 'Dearness allowance (DA)', kind: 'earn', calc: 'att', pf: 1, esi: 1, tax: 1, sys: 1 },
    { id: 'hra', name: 'House rent allowance (HRA)', kind: 'earn', calc: 'att', esi: 1, tax: 1, sys: 1 },
    { id: 'conv', name: 'Conveyance allowance', kind: 'earn', calc: 'att', esi: 1, tax: 1, sys: 1 },
    { id: 'spl', name: 'Special allowance', kind: 'earn', calc: 'att', esi: 1, tax: 1, sys: 1 },
    { id: 'ot', name: 'Overtime', kind: 'earn', calc: 'ot', esi: 1, tax: 1, sys: 1 },
    { id: 'bonus', name: 'Bonus', kind: 'earn', calc: 'user', tax: 1, sys: 1 },
    { id: 'arrear', name: 'Arrears', kind: 'earn', calc: 'user', pf: 1, esi: 1, tax: 1, sys: 1 }
  ];
  /* deductions and employer contributions the run works out (desc = the English words the books read, books.js dedKind) */
  N.DED = { pf: 'Provident fund (PF)', esi: 'ESI', pt: 'Professional tax', lwf: 'Labour welfare fund (LWF)', tds: 'TDS (income tax)', adv: 'Advance recovery', loan: 'Loan recovery', other: 'Other deduction' };
  N.DEF = { otMult: 2, otHours: 8, bonusCeil: 7000, bonusLimit: 21000, bonusPct: 8.33, gratCeil: 2000000, gratYears: 5, checked: '2026-11-19' };
  /* every head: built-ins first (with the user's own changes to their names and flags), then the user's own */
  N.heads = function (cfg) {
    var own = (cfg && cfg.heads) || [], byId = {}; own.forEach(function (h) { byId[h.id] = h; });
    var L = N.HEADS.map(function (h) { return Object.assign({}, h, byId[h.id] || {}, { sys: 1, calc: h.calc === 'ot' ? 'ot' : (byId[h.id] || {}).calc || h.calc }); });
    own.forEach(function (h) { if (!N.HEADS.some(function (b) { return b.id === h.id; })) L.push(h); });
    return L;
  };
  N.newId = function (name, list) { var b = 'h-' + key(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20), id = b, i = 2; while (list.some(function (h) { return h.id === id; })) id = b + '-' + i++; return id; };
  /* the usual-pay names of the employee list (emp.earn) mapped to heads */
  var GUESS = [[/basic/i, 'basic'], [/dearness|\bDA\b/i, 'da'], [/house rent|\bHRA\b/i, 'hra'], [/conveyance|transport/i, 'conv'], [/special/i, 'spl']];
  N.guess = function (desc) { for (var i = 0; i < GUESS.length; i++) if (GUESS[i][0].test(desc)) return GUESS[i][1]; return ''; };
  /* the structure lines that apply in month ym: { headId: amount } (plus 'extra': [{desc, amt}] for usual-pay lines no head matched) */
  N.structFor = function (emp, ym) {
    var rows = (emp && emp.struct || []).filter(function (s) { return s.from && s.from <= ym; }).sort(function (a, b) { return a.from < b.from ? 1 : -1; });
    if (rows.length) return Object.assign({}, rows[0].lines, { _from: rows[0].from });
    var out = {}, extra = [];
    (emp && emp.earn || []).forEach(function (l) { var v = num(l.amt); if (!v) return; var id = N.guess(l.desc); if (id && !out[id]) out[id] = v; else extra.push({ desc: l.desc, amt: v }); });
    if (extra.length) out._extra = extra;
    return out;
  };
  /* arrears when an increment is entered late: (new - old) x months from 'from' up to (not including) 'upto' */
  N.arrears = function (emp, from, upto) {
    var rows = (emp.struct || []).slice().sort(function (a, b) { return a.from < b.from ? -1 : 1; }), i = rows.map(function (r) { return r.from; }).indexOf(from);
    if (i < 1) return 0;
    var a = rows[i].lines, b = rows[i - 1].lines, diff = 0, n = 0, m = from;
    Object.keys(a).forEach(function (k) { diff += num(a[k]) - num(b[k]); });
    while (m < upto && n < 36) { n++; m = N.addM(m, 1); }
    return rup(diff * n);
  };
  N.addM = function (ym, k) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + k; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + String(m + 1).padStart(2, '0'); };
  N.days = function (ym) { return new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate(); };
  /* overtime pay for 'hours' at mult x the ordinary hourly rate of (basic + DA) */
  N.otPay = function (basicDa, ym, hours, cfg) { cfg = Object.assign({}, N.DEF, cfg || {}); var rate = num(basicDa) / (N.days(ym) * num(cfg.otHours)) * num(cfg.otMult); return { rate: r2(rate), amt: rup(rate * num(hours)) }; };
  /* code50 (Code on Wages s.2(y)): when the allowances left out of "wages" are above half of all pay, the excess counts as wages */
  N.code50 = function (wage, total) { wage = num(wage); total = num(total); var out = total - wage; return out > total / 2 ? rup(wage + out - total / 2) : wage; };

  /* one employee's row for month ym.
     o = { emp, ym, heads, att: { days, paid, ot } (null = full month), cfg: payroll settings { pf, esi, otMult, otHours, code50,
           lwf: { ee, er, months: [m] } }, P: NSPayroll (pfLine / esiLine), pt: amount (from NSStatRates, null = none),
           tds: amount, adv: recovery, loan: recovery, user: { headId: amount } (typed bonus / arrears / changes), covered (ESI) }
     -> { earn: [{head, desc, amt}], ded: [{head, desc, amt}], gross, ded total, net, erPf, erEsi, erLwf, pfWage, esiWage, taxable, paid, days, ot } */
  N.row = function (o) {
    var emp = o.emp || {}, ym = o.ym, cfg = o.cfg || {}, H = o.heads || N.heads(cfg), st = N.structFor(emp, ym), user = o.user || {};
    var days = o.att && o.att.days ? num(o.att.days) : N.days(ym), paid = o.att ? num(o.att.paid) : days, f = days ? Math.min(1, paid / days) : 1;
    var earn = [], amtOf = {};
    function add(h, v) { v = rup(v); amtOf[h.id] = v; if (v) earn.push({ head: h.id, desc: h.name, amt: v }); }
    H.filter(function (h) { return h.kind === 'earn' && !h.off && h.calc !== 'pct' && h.calc !== 'ot'; }).forEach(function (h) {
      var full = num(st[h.id]);
      if (user[h.id] != null && user[h.id] !== '') add(h, num(user[h.id]));
      else if (h.calc === 'att') add(h, full * f); else if (h.calc === 'flat') add(h, full); else add(h, 0);
    });
    H.filter(function (h) { return h.kind === 'earn' && !h.off && h.calc === 'pct'; }).forEach(function (h) {
      var p = st[h.id] != null && st[h.id] !== '' ? num(st[h.id]) : num(h.pct), of = (h.of || []).reduce(function (s, id) { return s + num(amtOf[id]); }, 0);
      add(h, user[h.id] != null && user[h.id] !== '' ? num(user[h.id]) : of * p / 100);
    });
    (st._extra || []).forEach(function (x) { var v = rup(num(x.amt) * f); if (v) earn.push({ head: '', desc: x.desc, amt: v }); });
    var otH = H.filter(function (h) { return h.id === 'ot'; })[0], ot = { rate: 0, amt: 0 }, hours = num(o.att && o.att.ot);
    if (otH && !otH.off) {
      ot = N.otPay(num(st.basic) + num(st.da), ym, hours, cfg);
      add(otH, user.ot != null && user.ot !== '' ? num(user.ot) : ot.amt);
    }
    var gross = earn.reduce(function (s, l) { return s + l.amt; }, 0), flag = function (k) { return earn.reduce(function (s, l) { var h = H.filter(function (x) { return x.id === l.head; })[0]; return s + (h ? (h[k] ? l.amt : 0) : (k === 'esi' || k === 'tax' ? l.amt : 0)); }, 0); };
    var pfW = flag('pf'), esiW = flag('esi'), taxable = flag('tax');
    if (cfg.code50) pfW = N.code50(pfW, gross - num(amtOf.ot) - num(amtOf.bonus));
    var ded = [], P = o.P, erPf = 0, erEsi = 0, erLwf = 0, pfl = null, esl = null;
    function dd(id, v) { v = id === 'lwf' ? Math.round(v * 100) / 100 : rup(v); if (v) ded.push({ head: id, desc: N.DED[id], amt: v }); }   /* LWF can be in paise (Delhi Rs 0.75) */
    if (P && !emp.noPf && pfW > 0) {
      pfl = P.pfLine({ uan: emp.uan, name: emp.name, gross: gross, basic: pfW, days: days, paid: paid, noEps: emp.noEps, full: cfg.pf && cfg.pf.full }, cfg.pf);
      dd('pf', pfl.epf); erPf = pfl.eps + pfl.diff;
    }
    if (P && !emp.noEsi && esiW > 0) {
      var within = esiW - num(amtOf.ot) <= ((cfg.esi && cfg.esi.ceil) || P.ESI.ceil);   /* coverage is judged without overtime; contribution is on all ESI wages */
      esl = P.esiLine({ ip: emp.esi, name: emp.name, gross: esiW, paid: paid, days: days, covered: within || o.covered }, cfg.esi);
      if (esl.applies) { dd('esi', esl.ee); erEsi = esl.er; }
    }
    if (o.pt) dd('pt', o.pt);
    var lw = cfg.lwf || {}, mon = +ym.slice(5, 7);
    if ((lw.months || []).map(Number).indexOf(mon) >= 0 && !emp.noLwf) {
      if (num(lw.pct)) { var lv = Math.min(num(lw.max) || Infinity, gross * num(lw.pct) / 100); lv = Math.round(lv * 100) / 100; dd('lwf', lv); erLwf = Math.round(lv * (num(lw.erX) || 1) * 100) / 100; }   /* a percentage of wages (Haryana) */
      else { dd('lwf', num(lw.ee)); erLwf = num(lw.er); }
    }
    if (o.tds) dd('tds', o.tds);
    if (o.adv) dd('adv', o.adv);
    if (o.loan) dd('loan', o.loan);
    if (user.other) dd('other', user.other);
    var dt = ded.reduce(function (s, l) { return s + l.amt; }, 0);
    return { emp: emp, ym: ym, days: days, paid: paid, earn: earn, ded: ded, gross: gross, dedTotal: dt, net: gross - dt, erPf: erPf, erEsi: erEsi, erLwf: erLwf,
      pfWage: pfW, esiWage: esiW, taxable: taxable, ot: { hours: hours, rate: ot.rate, amt: num(amtOf.ot) }, struct: st, pf: pfl, esiL: esl,
      amt: function (id) { var l = earn.concat(ded).filter(function (x) { return x.head === id; })[0]; return l ? l.amt : 0; } };
  };
  /* the employee's taxable salary for a full month by the structure (for the projection of the months still to come) */
  N.monthTaxable = function (emp, ym, heads) { var st = N.structFor(emp, ym); return (heads || N.HEADS).filter(function (h) { return h.kind === 'earn' && h.tax && !h.off && (h.calc === 'att' || h.calc === 'flat'); }).reduce(function (s, h) { return s + num(st[h.id]); }, 0) + (st._extra || []).reduce(function (s, x) { return s + num(x.amt); }, 0); };

  /* ---------- salary advance recovery (T-B18): sadv { plan: { emi, from 'YYYY-MM', months } } ---------- */
  /* the instalment of month ym: the smaller of the EMI and what is still owed (owed = advances given - recovered so far) */
  N.advEmi = function (owed, plans, ym) {
    owed = num(owed); if (!(owed > 0)) return 0;
    var emi = 0;
    (plans || []).forEach(function (p) { if (!p || !p.from || ym < p.from) return; if (num(p.months) && ym >= N.addM(p.from, num(p.months)) && owed <= 0) return; emi += num(p.emi); });
    return rup(Math.min(emi, owed));
  };

  /* ---------- bank transfer sheet (S-28; T-B20 templates) ---------- */
  N.BANKCOLS = { name: 'Employee name', code: 'Employee code', acc: 'Account number', ifsc: 'IFSC', amt: 'Amount', bank: 'Bank name', narr: 'Narration' };
  N.bankRows = function (rows, ym, fmt) {
    var cols = (fmt && fmt.cols && fmt.cols.length ? fmt.cols : ['name', 'acc', 'ifsc', 'amt', 'narr']), head = cols.map(function (c) { return N.BANKCOLS[c] || c; });
    var mn = new Date(ym + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    var body = rows.filter(function (r) { return r.net > 0; }).map(function (r) {
      var e = r.emp || {}; return cols.map(function (c) { return c === 'name' ? e.name : c === 'code' ? e.code || '' : c === 'acc' ? String(e.bankAcc || '') : c === 'ifsc' ? String(e.bankIfsc || '').toUpperCase() : c === 'amt' ? r.net : c === 'bank' ? e.bankName || '' : c === 'narr' ? 'Salary ' + mn : ''; });
    });
    var miss = rows.filter(function (r) { return r.net > 0 && !(String(r.emp.bankAcc || '').trim() && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(r.emp.bankIfsc || '').toUpperCase())); }).map(function (r) { return r.emp.name; });
    return { rows: (fmt && fmt.noHead ? [] : [head]).concat(body), missing: miss, total: body.length ? rows.filter(function (r) { return r.net > 0; }).reduce(function (s, r) { return s + r.net; }, 0) : 0 };
  };

  /* ---------- bonus and gratuity (S-32 / T-B17) ---------- */
  /* rows: [{ emp, wages: [basic+DA of each month of the year], days: days worked }] -> per employee bonus at pct (8.33-20) */
  N.bonus = function (rows, cfg) {
    cfg = Object.assign({}, N.DEF, cfg || {}); var pct = Math.min(20, Math.max(8.33, num(cfg.bonusPct)));
    return rows.map(function (r) {
      var w = (r.wages || []).map(num), maxM = w.reduce(function (a, b) { return Math.max(a, b); }, 0), ok = maxM <= num(cfg.bonusLimit) && num(r.days) >= 30;
      var base = w.reduce(function (s, x) { return s + Math.min(x, num(cfg.bonusCeil)); }, 0);
      return { emp: r.emp, eligible: ok, why: maxM > num(cfg.bonusLimit) ? 'limit' : num(r.days) < 30 ? 'days' : '', base: rup(base), pct: pct, amt: ok ? rup(base * pct / 100) : 0 };
    });
  };
  /* emp: { doj, left, fixedTerm }, wage: last monthly basic + DA, on: date */
  N.gratuity = function (emp, wage, on, cfg) {
    cfg = Object.assign({}, N.DEF, cfg || {});
    if (!emp || !emp.doj) return { years: 0, amt: 0, eligible: false, why: 'doj' };
    var a = new Date(emp.doj + 'T00:00:00'), b = new Date((on || emp.left) + 'T00:00:00'), months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() - (b.getDate() < a.getDate() ? 1 : 0);
    var full = Math.floor(months / 12), years = full + (months % 12 >= 6 ? 1 : 0), need = emp.fixedTerm ? 1 : num(cfg.gratYears);
    var eligible = full >= need, amt = Math.min(num(cfg.gratCeil), rup(num(wage) * 15 / 26 * years));
    return { months: months, years: years, eligible: eligible, amt: amt, provision: amt, need: need };
  };

  /* ---------- attendance from a biometric / face device export (T-B14) ----------
     rows: the sheet read from the device software's CSV / Excel. Columns found by heading: employee code / ID, date, time (one row
     per punch) or in / out (one row per day). cfg.shift = { start '09:30', grace 10 (minutes), half 4 (hours for a half day),
     full 8 (hours for a full day), otAfter 9 (hours after which overtime counts) }.
     Returns { month: { empId: { d: {day: 'P'|'H'|'A'}, ot, late } }, matched, unknown: [ids], bad: [rows] }. */
  function hm(s) { var m = /(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\s*(am|pm)?/i.exec(String(s || '')); if (!m) return null; var h = +m[1] % 24, mi = +m[2]; if (m[3]) { if (/pm/i.test(m[3]) && h < 12) h += 12; if (/am/i.test(m[3]) && h === 12) h = 0; } return h * 60 + mi; }
  function ymd(s) {
    s = String(s || '').trim(); var m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return m[1] + '-' + String(+m[2]).padStart(2, '0') + '-' + String(+m[3]).padStart(2, '0');
    if ((m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.exec(s))) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + String(+m[2]).padStart(2, '0') + '-' + String(+m[1]).padStart(2, '0');   /* Indian day/month/year */
    if (/^\d{5}(\.\d+)?$/.test(s)) { var d = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 864e5); return d.toISOString().slice(0, 10); }   /* Excel day number */
    return '';
  }
  N.hm = hm; N.ymd = ymd;
  N.parsePunches = function (rows, ym, emps, cfg) {
    var sh = Object.assign({ start: '09:30', grace: 10, half: 4, full: 8, otAfter: 9 }, cfg && cfg.shift || {}), out = { month: {}, matched: 0, unknown: [], bad: [] };
    var hi = -1, col = {}, i;
    for (i = 0; i < Math.min(rows.length, 20); i++) {
      var h = rows[i].map(function (c) { return key(c); }), c = {};
      h.forEach(function (x, j) {
        if (c.id == null && /^(emp(loyee)?\s*(code|id|no\.?)|user\s*id|enroll(ment)?\s*(no|id)|ac-?no\.?|card\s*no|code|id)$/.test(x)) c.id = j;
        else if (c.date == null && /^(date|punch date|att(endance)? date|log date)$/.test(x)) c.date = j;
        else if (c.dt == null && /^(date\s*time|datetime|punch time|log time|time stamp|timestamp|check\s*time)$/.test(x)) c.dt = j;
        else if (c.time == null && /^(time|punch)$/.test(x)) c.time = j;
        else if (c['in'] == null && /^(in|in time|first in|check in|in punch)$/.test(x)) c['in'] = j;
        else if (c.out == null && /^(out|out time|last out|check out|out punch)$/.test(x)) c.out = j;
      });
      if (c.id != null && (c.date != null || c.dt != null)) { hi = i; col = c; break; }
    }
    if (hi < 0) { out.error = 'head'; return out; }
    var byId = {}; (emps || []).forEach(function (e) { if (e.devId) byId[key(e.devId)] = e; if (e.code && !byId[key(e.code)]) byId[key(e.code)] = e; });
    var day = {};   /* empId|date -> [minutes] */
    rows.slice(hi + 1).forEach(function (r, n) {
      var id = String(r[col.id] == null ? '' : r[col.id]).trim(); if (!id) return;
      var e = byId[key(id)] || byId[key(id.replace(/^0+/, ''))]; if (!e) { if (out.unknown.indexOf(id) < 0) out.unknown.push(id); return; }
      var dt = col.dt != null ? String(r[col.dt] || '') : '', d = ymd(col.date != null ? r[col.date] : dt);
      if (!d) { out.bad.push(hi + n + 2); return; }
      if (d.slice(0, 7) !== ym) return;
      var k = e.id + '|' + d, L = day[k] = day[k] || [];
      [col.time != null ? r[col.time] : null, col['in'] != null ? r[col['in']] : null, col.out != null ? r[col.out] : null, col.dt != null ? dt.replace(/^\S+\s+/, '') : null].forEach(function (v) { var x = v == null ? null : hm(v); if (x != null) L.push(x); });
    });
    var start = hm(sh.start) || 0;
    Object.keys(day).forEach(function (k) {
      var p = k.split('|'), id = p[0], d = +p[1].slice(8, 10), L = day[k].sort(function (a, b) { return a - b; });
      var rec = out.month[id] = out.month[id] || { d: {}, ot: 0, late: 0 }, hrs = L.length > 1 ? (L[L.length - 1] - L[0]) / 60 : 0;
      rec.d[d] = hrs >= num(sh.full) ? 'P' : hrs >= num(sh.half) ? 'H' : L.length === 1 ? 'H' : 'A';
      if (L[0] > start + num(sh.grace)) rec.late++;
      if (hrs > num(sh.otAfter)) rec.ot = r2(rec.ot + Math.floor((hrs - num(sh.otAfter)) * 2) / 2);   /* in half hours */
    });
    out.matched = Object.keys(out.month).length;
    return out;
  };
  /* ---------- full and final settlement (T-B19) ----------
     o = { row (the leaving month's salary row from row(), days up to the last day), bd (monthly basic + DA), gross (monthly gross by
           the structure), leaveDays (encashable leave left), leaveDiv (days a month for leave pay, default 26), grat ({ amt, eligible }),
           bonus (bonus still owed), noticeDays (notice the contract asks for), noticeGiven (days of notice actually served),
           noticeBy 'emp' (employee left without full notice: recovered) | 'er' (employer ended it early: paid), noticeOn 'gross' | 'bd',
           advOwed, extraEarn: [{desc, amt}], extraDed: [{desc, amt}] }
     -> { earn, ded, gross, dedTotal, net, parts: { salary, leave, grat, bonus, notice } } (lines keep head ids, as in row()) */
  /* income-tax exemptions offered as defaults on the full and final screen (Income-tax Act, 2025, s.19(1) Table; read 19 Nov 2026,
     notes in side-session-notes r2-payroll-rules-check-2.md):
       gratuity, non-government employee (Sl. 6): least of the gratuity, the notified limit and half a month's salary for each completed
         year of service, salary = average basic + DA of the 10 months before leaving (s.19(2)(b)). Sl. 5 (employees under the Payment of
         Gratuity Act) still names the repealed Act, so the stricter Sl. 6 is used; the user may change the figure.
       leave encashment (Sl. 14): least of the amount, leave at credit counted at most 30 days a year of service x a day's average
         salary, 10 months' average salary and the notified limit.
     Notified limits, kept alive by s.536(2)(j): gratuity Rs 20 lakh (S.O. 1213(E), 8 Mar 2019), leave encashment Rs 25 lakh (S.O. 2276(E),
     24 May 2023, from 1 Apr 2023); both notifications read 19 Nov 2026. */
  N.TAXEX = { gratMax: 2000000, leaveMax: 2500000 };
  N.ffExempt = function (o) {
    var avg = num(o.avgBD), yrs = Math.floor(num(o.months) / 12), g = num(o.grat), l = num(o.leaveAmt);
    var eg = g > 0 ? Math.min(g, N.TAXEX.gratMax, rup(avg / 2 * yrs)) : 0;
    var credit = Math.min(num(o.leaveDays), 30 * Math.max(1, yrs)), el = l > 0 ? Math.min(l, rup(credit * avg / 30), rup(10 * avg), N.TAXEX.leaveMax) : 0;
    return { grat: Math.max(0, eg), leave: Math.max(0, el) };
  };
  N.FFDESC = { leave: 'Leave encashment', grat: 'Gratuity', bonus: 'Bonus', notice: 'Notice pay', noticerec: 'Notice pay recovered', adv: 'Advance recovery' };
  N.ff = function (o) {
    var row = o.row || { earn: [], ded: [] }, earn = row.earn.map(function (l) { return Object.assign({}, l); }), ded = row.ded.filter(function (l) { return l.head !== 'adv'; }).map(function (l) { return Object.assign({}, l); });
    var daily = num(o.bd) / (num(o.leaveDiv) || 26), parts = { salary: row.gross || 0 };
    function e(h, v, d) { v = rup(v); if (v > 0) earn.push({ head: h, desc: d || N.FFDESC[h], amt: v }); parts[h] = (parts[h] || 0) + Math.max(0, v); }
    function x(h, v, d) { v = rup(v); if (v > 0) ded.push({ head: h, desc: d || N.FFDESC[h], amt: v }); }
    e('leave', daily * num(o.leaveDays));
    if (o.grat && o.grat.eligible) e('grat', o.grat.amt);
    e('bonus', o.bonus);
    var short = Math.max(0, num(o.noticeDays) - num(o.noticeGiven)), nbase = (o.noticeOn === 'bd' ? num(o.bd) : num(o.gross)) / 30;
    if (short) { if (o.noticeBy === 'er') e('notice', nbase * short); else x('noticerec', nbase * short); }
    (o.extraEarn || []).forEach(function (l) { e('', l.amt, l.desc); });
    x('adv', o.advOwed);
    (o.extraDed || []).forEach(function (l) { x('other', l.amt, l.desc); });
    var g = earn.reduce(function (a, l) { return a + l.amt; }, 0), d = ded.reduce(function (a, l) { return a + l.amt; }, 0);
    return { earn: earn, ded: ded, gross: g, dedTotal: d, net: g - d, parts: parts, short: short, daily: r2(daily) };
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = N; else root.NSPayRun = N;
})(typeof window !== 'undefined' ? window : this);

/* NSPayroll: attendance, PF return (ECR text file) and ESI monthly contribution, pure functions (node scripts/test_payroll.js) plus the
   small store part that keeps attendance and the payroll settings in the data home (meta 'attendance', meta 'payroll').

   ATTENDANCE  meta 'attendance' = { months: { 'YYYY-MM': { <empId>: { d: { '1': 'P', '2': 'A', ... }, ot: hours } } },
                                     cfg: { wo: [0] (weekly-off weekdays, 0 = Sunday), hol: { 'YYYY-MM-DD': 'name' } } }
     codes  P present, A absent, H half day, PL paid leave, UL unpaid leave, HOL holiday, WO weekly off.  A day with no mark is
     weekly off / holiday when the settings say so, else "not marked" (never counted as paid until someone marks it).
     paid days = P + H/2 + PL + HOL + WO; the days before the joining date and after the leaving date are not paid.

   PF (ECR text file for the EPFO unified portal, one line per member, 11 fields joined by #~#):
     UAN, member name, gross wages, EPF wages, EPS wages, EDLI wages, EPF contribution (employee 12%), EPS contribution (8.33%),
     EPF-EPS difference (employer's own EPF share), NCP days (days not paid), refund of advances.
     EPF wages = basic up to the wage ceiling (or the whole basic when the employer pays on it), EPS and EDLI wages are capped at the ceiling.
     ***The field list was first taken from payroll vendors' descriptions; on 15 Nov 2026 it was compared with EPFO's own ECR FAQ
     (archived copy of epfo.gov.in): 11 fields joined by #~#, matching. The portal's information sheet was not read, so one real
     upload by the owner is still the final check; the rates and the ceiling are typed settings.***

   ESI (monthly contribution sheet of the ESIC employer portal; checked 15 Nov 2026 against ESIC's own MC_Template1.xls, archived copy):
     six text columns IP number (10 digits), IP name (letters and spaces only), days for which wages were paid or payable (whole days),
     total monthly wages, reason code (0-13, used when no days), last working day (needed for codes 2-6 and 10), saved as .xls. Employee 0.75% and employer 3.25% of wages, each rounded UP to the
     next rupee (Social Security (Central) Rules, 2026, rule 19, published 8 May 2026); no employee share when the average daily wage is
     Rs 176 or less (esic.gov.in/contribution, reviewed 4 Apr 2025); wage limit Rs 21,000 a month (typed setting: not confirmed from an
     official page on 14 Nov 2026); once covered, an employee stays covered to the end of the contribution period (Apr-Sep, Oct-Mar). */
(function (root) {
  'use strict';
  var N = {};
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; }
  function r2(v) { return Math.round((v + 1e-9) * 100) / 100; }
  function rup(v) { return Math.round(v + 1e-9); }               /* to the nearest rupee, halves up */
  function up(v) { return Math.ceil(v - 1e-9); }                 /* to the next higher rupee */
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  /* ---------- attendance ---------- */
  var CODES = ['P', 'A', 'H', 'PL', 'UL', 'HOL', 'WO'];
  var PAID = { P: 1, A: 0, H: 0.5, PL: 1, UL: 0, HOL: 1, WO: 1 };
  N.CODES = CODES;
  function dim(ym) { return new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate(); }
  function dow(ym, d) { return new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1, d).getDay(); }
  function iso(ym, d) { return ym + '-' + pad(d); }
  N.daysIn = dim; N.weekday = dow; N.iso = iso;
  N.defaultCfg = function () { return { wo: [0], hol: {} }; };
  /* the code of one day: the mark, else NA (not employed that day), HOL, WO, or '' (not marked) */
  N.dayCode = function (rec, ym, d, cfg, emp) {
    var s = iso(ym, d); cfg = cfg || N.defaultCfg();
    if (emp && (emp.doj && s < emp.doj || emp.left && s > emp.left)) return 'NA';   /* not employed that day: a mark there is ignored */
    var m = rec && rec.d && rec.d[d]; if (m) return m;
    if (cfg.hol && cfg.hol[s]) return 'HOL';
    if ((cfg.wo || []).indexOf(dow(ym, d)) >= 0) return 'WO';
    return '';
  };
  N.summary = function (rec, ym, cfg, emp) {
    var n = dim(ym), c = { P: 0, A: 0, H: 0, PL: 0, UL: 0, HOL: 0, WO: 0, NA: 0, unmarked: 0 }, paid = 0, d, k;
    for (d = 1; d <= n; d++) {
      k = N.dayCode(rec, ym, d, cfg, emp);
      if (!k) c.unmarked++; else { c[k] = (c[k] || 0) + 1; paid += PAID[k] || 0; }
    }
    c.days = n; c.paid = r2(paid); c.lop = r2(n - paid); c.ot = r2(num(rec && rec.ot)); c.any = !!(rec && rec.d && Object.keys(rec.d).length);
    return c;
  };
  /* cycle one cell: unmarked > P > A > H > PL > UL > HOL > WO > unmarked */
  N.next = function (c) { var i = CODES.indexOf(c); return i < 0 ? CODES[0] : i === CODES.length - 1 ? '' : CODES[i + 1]; };
  N.setDay = function (rec, d, code) { rec.d = rec.d || {}; if (code) rec.d[d] = code; else delete rec.d[d]; return rec; };
  /* mark every day that is not marked and not a weekly off / holiday / outside employment as present */
  N.fillPresent = function (rec, ym, cfg, emp) {
    rec.d = rec.d || {};
    for (var d = 1; d <= dim(ym); d++) if (!N.dayCode(rec, ym, d, cfg, emp)) rec.d[d] = 'P';
    return rec;
  };
  /* mark one day for many employees; days that are a weekly off / holiday are changed too (the caller chose that day) */
  N.markDay = function (month, ids, d, code) { ids.forEach(function (id) { month[id] = month[id] || { d: {} }; N.setDay(month[id], d, code); }); return month; };

  /* sheet: header [Employee, Code, 1..n, Present, Absent, Half days, Paid leave, Unpaid leave, Holidays, Weekly off, Paid days, Overtime hours] */
  N.sheetRows = function (ym, emps, month, cfg) {
    var n = dim(ym), head = ['Employee', 'Code'], d, rows = [];
    for (d = 1; d <= n; d++) head.push(String(d));
    head = head.concat(['Present', 'Absent', 'Half days', 'Paid leave', 'Unpaid leave', 'Holidays', 'Weekly off', 'Paid days', 'Overtime hours']);
    emps.forEach(function (e) {
      var rec = month && month[e.id] || {}, s = N.summary(rec, ym, cfg, e), row = [e.name, e.code || ''];
      for (d = 1; d <= n; d++) { var c = N.dayCode(rec, ym, d, cfg, e); row.push(c === 'NA' ? '' : c); }
      rows.push(row.concat([s.P, s.A, s.H, s.PL, s.UL, s.HOL, s.WO, s.paid, s.ot]));
    });
    return [head].concat(rows);
  };
  var ALIAS = { P: 'P', PRESENT: 'P', '1': 'P', A: 'A', ABSENT: 'A', H: 'H', HD: 'H', HALF: 'H', '0.5': 'H', PL: 'PL', L: 'PL', CL: 'PL', EL: 'PL', SL: 'PL', UL: 'UL', LWP: 'UL', LOP: 'UL', HOL: 'HOL', HOLIDAY: 'HOL', WO: 'WO', OFF: 'WO', W: 'WO', '0': 'A' };
  /* rows read from a CSV/Excel file in the layout above (day columns are headed 1, 2, 3 ...). Matches the employee by code, else by name.
     Returns { month: {empId: rec}, matched, unknown: [names], bad: ['Name day 5: x'] }. A cell left empty stays unmarked. */
  N.parseSheet = function (rows, ym, emps) {
    var out = { month: {}, matched: 0, unknown: [], bad: [] }, hi = -1, i, n = dim(ym);
    for (i = 0; i < Math.min(rows.length, 15); i++) if (/^employee|^name/i.test(String(rows[i][0] || '').trim())) { hi = i; break; }
    if (hi < 0) { out.error = 'head'; return out; }
    var head = rows[hi].map(function (h) { return String(h).trim(); }), col = {}, otc = -1;
    head.forEach(function (h, c) { if (/^\d+$/.test(h) && +h >= 1 && +h <= n) col[+h] = c; if (/overtime|^ot\b/i.test(h)) otc = c; });
    if (!Object.keys(col).length) { out.error = 'days'; return out; }
    var byCode = {}, byName = {}; emps.forEach(function (e) { if (e.code) byCode[key(e.code)] = e; byName[key(e.name)] = e; });
    rows.slice(hi + 1).forEach(function (r) {
      var nm = String(r[0] || '').trim(); if (!nm) return;
      var e = byName[key(nm)] || (r[1] && byCode[key(r[1])]); if (!e) { out.unknown.push(nm); return; }
      var rec = { d: {}, ot: otc >= 0 ? num(r[otc]) : 0 };
      Object.keys(col).forEach(function (d) {
        var v = String(r[col[d]] == null ? '' : r[col[d]]).trim().toUpperCase(); if (!v) return;
        var c = ALIAS[v]; if (!c) { out.bad.push(nm + ' day ' + d + ': ' + v); return; }
        rec.d[d] = c;
      });
      out.month[e.id] = rec; out.matched++;
    });
    return out;
  };
  N.toCsv = function (rows) {
    return rows.map(function (r) { return r.map(function (c) { c = String(c == null ? '' : c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n');
  };
  /* the days for a salary slip: days in the month and paid days (null when nothing was marked for that employee) */
  N.slipDays = function (rec, ym, cfg, emp) {
    if (!rec || !rec.d || !Object.keys(rec.d).length) return null;
    var s = N.summary(rec, ym, cfg, emp); return { days: s.days, paid: s.paid, unmarked: s.unmarked, ot: s.ot };
  };

  /* ---------- PF ---------- */
  N.PF = { ceil: 25000, epf: 12, eps: 8.33, edli: 0.5, admin: 0.5, adminMin: 500, due: 15 };
  function pfCfg(c) { return Object.assign({}, N.PF, c || {}); }
  /* m: { uan, name, gross, basic, days, paid, noEps (employee not in the pension scheme, e.g. joined after 58), full (pay PF on the whole basic) } */
  N.pfLine = function (m, cfg) {
    cfg = pfCfg(cfg);
    var errs = [], uan = String(m.uan || '').replace(/\s/g, ''), basic = num(m.basic), gross = num(m.gross);
    if (!/^\d{12}$/.test(uan)) errs.push('uan');
    if (!(basic > 0)) errs.push('basic');
    var epfW = m.full ? basic : Math.min(basic, cfg.ceil), epsW = m.noEps ? 0 : Math.min(epfW, cfg.ceil), edliW = Math.min(epfW, cfg.ceil);
    epfW = rup(epfW); epsW = rup(epsW); edliW = rup(edliW);
    var epf = rup(epfW * cfg.epf / 100), eps = rup(epsW * cfg.eps / 100), diff = epf - eps;
    var ncp = Math.max(0, Math.round(num(m.days) - num(m.paid)));
    gross = rup(Math.max(gross, epfW));
    var name = String(m.name || '').replace(/#~#|[\r\n]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
    if (!name) errs.push('name');
    return { ok: !errs.length, errs: errs, uan: uan, name: name, gross: gross, epfW: epfW, epsW: epsW, edliW: edliW, epf: epf, eps: eps, diff: diff, ncp: ncp, line: [uan, name, gross, epfW, epsW, edliW, epf, eps, diff, ncp, 0].join('#~#') };
  };
  N.pfFile = function (lines) { return lines.filter(function (l) { return l.ok; }).map(function (l) { return l.line; }).join('\r\n') + (lines.some(function (l) { return l.ok; }) ? '\r\n' : ''); };
  /* the challan: A/c 01 (employees' 12% and the employer's EPF share), A/c 10 (pension), A/c 02 (administration, minimum), A/c 21 (EDLI) */
  N.pfChallan = function (lines, cfg) {
    cfg = pfCfg(cfg);
    var L = lines.filter(function (l) { return l.ok; }), s = function (k) { return L.reduce(function (a, l) { return a + l[k]; }, 0); };
    var epfW = s('epfW'), edliW = s('edliW'), ee = s('epf'), er = s('diff'), eps = s('eps');
    var admin = L.length ? Math.max(cfg.adminMin, rup(epfW * cfg.admin / 100)) : 0, edli = rup(edliW * cfg.edli / 100);
    var a01 = { employee: ee, employer: er, total: ee + er };
    return { members: L.length, epfW: epfW, edliW: edliW, ac01: a01, ac10: eps, ac02: admin, ac21: edli, ac22: 0, total: a01.total + eps + admin + edli };
  };

  /* ---------- ESI ---------- */
  N.ESI = { ceil: 21000, ee: 0.75, er: 3.25, daily: 176 };
  function esiCfg(c) { return Object.assign({}, N.ESI, c || {}); }
  /* contribution period of a month: 'YYYY-04' .. 'YYYY-09' = Apr-Sep, else Oct-Mar; returns its first month */
  N.periodStart = function (ym) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7); return m >= 4 && m <= 9 ? y + '-04' : m >= 10 ? y + '-10' : (y - 1) + '-10'; };
  /* earlier months of the same period in which this employee's pay was within the limit => stays covered */
  N.covered = function (history, ym, cfg) {
    cfg = esiCfg(cfg); var from = N.periodStart(ym);
    return (history || []).some(function (h) { return h.ym >= from && h.ym < ym && num(h.gross) > 0 && num(h.gross) <= cfg.ceil; });
  };
  /* Sheet rules from ESIC's own "Sample MC Excel Template" (MC_Template1.xls, sheet "Instructions & Reason Codes", read 15 Nov 2026 from
     the Internet Archive copy of esic.in): every employee mapped to the employer must be in the sheet, also those with no wages (days 0 +
     a reason code); days are a whole number, fractions rounded UP; the IP name has only letters and spaces; the last working day is given
     only when days are 0 and the reason is 2, 3, 4, 5, 6 or 10 (it then leaves the employer's list); a reason with no last day leaves it
     blank; dates DD/MM/YYYY; the file is Excel 97-2003 (.xls) with every column as text. */
  var LASTDAY = { 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 10: 1 };
  N.ESI_LASTDAY = LASTDAY;
  /* m: { ip, name, gross, paid (days paid), days, covered, lastDay, reason } */
  N.esiLine = function (m, cfg) {
    cfg = esiCfg(cfg);
    var gross = num(m.gross), paid = num(m.paid), errs = [], ip = String(m.ip || '').replace(/\s/g, '');
    var applies = gross > 0 && (gross <= cfg.ceil || !!m.covered);
    var hasIp = /^\d{10}$/.test(ip), zero = !(gross > 0);
    if ((applies || (zero && ip)) && !hasIp) errs.push('ip');
    var daily = paid > 0 ? gross / paid : gross / 26, exempt = daily <= cfg.daily;
    var er = applies ? up(gross * cfg.er / 100) : 0, ee = applies && !exempt ? up(gross * cfg.ee / 100) : 0;
    var days = zero ? 0 : Math.max(0, Math.ceil(paid - 1e-9));
    var name = String(m.name || '').replace(/[^A-Za-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
    var inSheet = applies || (zero && hasIp);
    if (inSheet && !name) errs.push('name');
    var reason = days > 0 ? 0 : (num(m.reason) || 0);
    var lastDay = days === 0 && LASTDAY[reason] ? (m.lastDay || '') : '';
    if (days === 0 && LASTDAY[reason] && !lastDay) errs.push('lastday');
    return { ok: inSheet && !errs.length, applies: applies, errs: errs, ip: ip, name: name, days: days, wages: rup(gross), ee: ee, er: er, exempt: applies && exempt,
      reason: reason, lastDay: lastDay, over: gross > cfg.ceil && !!m.covered };
  };
  /* the headings exactly as in ESIC's template */
  N.ESI_HEAD = ['IP Number \n(10 Digits)', 'IP Name\n( Only alphabets and space )', 'No of Days for which wages paid/payable during the month', 'Total Monthly Wages',
    ' Reason Code for Zero workings days(numeric only; provide 0 for all other reasons- Click on the link for reference)', ' Last Working Day\n( Format DD/MM/YYYY  or DD-MM-YYYY)'];
  N.esiRows = function (lines) {
    return [N.ESI_HEAD].concat(lines.filter(function (l) { return l.ok; }).map(function (l) {
      return [l.ip, l.name, String(l.days), String(l.wages), String(l.days > 0 ? 0 : l.reason), l.lastDay ? l.lastDay.split('-').reverse().join('/') : ''];
    }));
  };
  N.esiChallan = function (lines) {
    var L = lines.filter(function (l) { return l.applies; }), s = function (k) { return L.reduce(function (a, l) { return a + l[k]; }, 0); };
    return { members: L.length, wages: s('wages'), ee: s('ee'), er: s('er'), total: s('ee') + s('er') };
  };
  /* reason codes for a month with no wages, as in ESIC's template (0 = no particular reason) */
  N.ESI_REASONS = [[0, 'Without reason'], [1, 'On leave'], [2, 'Left service'], [3, 'Retired'], [4, 'Out of coverage'], [5, 'Expired'], [6, 'Non implemented area'], [7, 'Compliance by immediate employer'],
    [8, 'Suspension of work'], [9, 'Strike / lockout'], [10, 'Retrenchment'], [11, 'No work'], [12, 'Does not belong to this employer'], [13, 'Duplicate IP']];

  /* ---------- store ---------- */
  N.Store = {
    att: function () { return NSStore.meta('attendance').then(function (m) { m = m && typeof m === 'object' ? m : {}; m.months = m.months || {}; m.cfg = Object.assign(N.defaultCfg(), m.cfg || {}); return m; }).catch(function () { return { months: {}, cfg: N.defaultCfg() }; }); },
    saveAtt: function (m) { return NSStore.meta('attendance', m); },
    cfg: function () { return NSStore.meta('payroll').then(function (m) { m = m && typeof m === 'object' ? m : {}; m.pf = m.pf || {}; m.esi = m.esi || {}; m.flags = m.flags || {}; return m; }).catch(function () { return { pf: {}, esi: {}, flags: {} }; }); },
    saveCfg: function (m) { return NSStore.meta('payroll', m); },
    /* fill a slip's days and paid days from the attendance of its month (only boxes still empty); resolves true when it did */
    fillDays: function (doc, e, force) {
      if (!e || !doc || !doc.month) return Promise.resolve(false);
      return N.Store.att().then(function (m) {
        var sd = N.slipDays((m.months[doc.month] || {})[e.id], doc.month, m.cfg, e); if (!sd) return false;
        var did = false;
        if (force || !String(doc.days || '').trim()) { doc.days = String(sd.days); did = true; }
        if (force || !String(doc.paid || '').trim()) { doc.paid = String(sd.paid); did = true; }
        return did;
      }).catch(function () { return false; });
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = N; else root.NSPayroll = N;
})(typeof window !== 'undefined' ? window : this);

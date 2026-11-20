/* NSTds: TDS rules as pure functions (ERP round 2: S-20, S-21, S-22, T-B12). Tested by scripts/test_tdsbook.js.
   Used by the App (TDS on purchase bills and expenses when they are booked: engine/tdsbook.js; TDS returns working: engine/tdsret.js).

   Law: Income-tax Act, 2025 (in force 1 April 2026), section 393 (TDS on payments other than salary; the old 1961 section is shown in
   brackets because businesses still know them by it) and section 392 (salary). TDS is due at the time of credit to the party's
   account or of payment, whichever is earlier, so it is worked out when the bill is booked. The base is the value WITHOUT GST when
   the GST is shown separately on the bill (CBDT Circular 23/2017, carried over). No PAN or an inoperative PAN: the higher of the
   normal rate or 20%, 5% for purchase of goods (s.397(2)(b)(i); inoperative PAN: s.262(6), rule 162(3)(c)). Twice the rate is a TCS rule only. A lower-deduction certificate (party.ldc) gives its rate up to its amount limit.
   Rates and thresholds below: Tax Year 2026-27 (same table as the TDS calculator, tds.js, checked 5 Nov 2026 against a section 393
   rate chart; see SRC). Thresholds count per party, per section, per tax year, so bills below the limit are kept with tds.amt 0 and
   the bill that crosses the limit takes the TDS of the earlier ones too ("catch-up").

   Interest (Income-tax Act, 2025, s.398(3)(a)(i) and (ii)): 1% a month or part of a month from the date the tax was deductible to the
   date it was deducted; 1.5% a month or part of a month from the date it was deducted to the date it was paid. Deposit due date: the
   7th of the next month, 30 April for March (Income-tax Rules, 2026, rule 218(2)). Statement due dates: 31 July, 31 October, 31 January,
   31 May (rule 219(4)). Late statement fee: Rs 200 a day, at most the TDS of the statement (s.427; old s.234E).
   Statements (rule 219): Form 138 salary (old 24Q), Form 140 other payees except non-residents (old 26Q), Form 144 non-residents
   (old 27Q), Form 143 TCS (old 27EQ); certificates Form 130 (old 16) and 131 (old 16A), rule 215; lower-deduction application Form 128.
   All checked 19 Nov 2026 in the gazetted Act and Rules (G.S.R. 198(E), 20 Mar 2026); notes in side-session-notes r2-payroll-rules-check.md. */
(function (root) {
  'use strict';
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; }
  function rup(v) { return Math.round(v + 1e-9); }
  function r2(v) { return Math.round((v + 1e-9) * 100) / 100; }
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  var T = {};
  /* id, old section, rate individual/HUF, rate others, threshold kind, limit, 2025 Act place, nature (English) */
  T.SEC = [
    ['c', '194C', 1, 2, 'c', 0, '393(1) Sl. 6(i)', 'Contractors and sub-contractors'],
    ['jp', '194J', 10, 10, 'year', 50000, '393(1) Sl. 6(iii)', 'Professional fees'],
    ['jt', '194J', 2, 2, 'year', 50000, '393(1) Sl. 6(iii)', 'Fees for technical services, call centre'],
    ['jd', '194J', 10, 10, 'none', 0, '393(1) Sl. 6(iii)', 'Fees or commission to a director'],
    ['h', '194H', 2, 2, 'year', 20000, '393(1) Sl. 1(ii)', 'Commission or brokerage'],
    ['il', '194I', 10, 10, 'month', 50000, '393(1) Sl. 2(ii)', 'Rent of land, building or furniture'],
    ['im', '194I', 2, 2, 'month', 50000, '393(1) Sl. 2(ii)', 'Rent of plant and machinery'],
    ['ib', '194-IB', 2, 2, 'month', 50000, '393(1) Sl. 2(i)', 'Rent paid by individuals not under audit'],
    ['a', '194A', 10, 10, 'year', 10000, '393(1) Sl. 5(iii)', 'Interest other than on securities'],
    ['m', '194M', 2, 2, 'year', 5000000, '393(1) Sl. 6(ii)', 'Contract work or fees paid by individuals not under audit'],
    ['q', '194Q', 0.1, 0.1, 'over', 5000000, '393(1) Sl. 8(ii)', 'Purchase of goods (buyer with turnover above 10 crore)'],
    ['tp', '194T', 10, 10, 'year', 20000, '393(3) Sl. 7', 'Salary, interest or commission to a partner']
  ];
  T.SRC = { checked: '2026-11-19', rates: 'tds.js table (5 Nov 2026, NiveshSahayak/Tax research/area-6 and a section 393 rate chart)', interest: 's.398(3)(a) Income-tax Act, 2025; fee s.427; due dates rules 218(2) and 219(4) (gazetted texts, read 19 Nov 2026)' };
  T.sec = function (id) { return T.SEC.filter(function (s) { return s[0] === id; })[0] || null; };
  /* a section as people type it ('194C', '393 (old 194C)', 'c', '194J technical', 'rent machinery') -> id */
  T.secOf = function (txt) {
    var s = String(txt || '').trim(); if (!s) return '';
    if (T.sec(s.toLowerCase())) return s.toLowerCase();
    var u = s.toUpperCase().replace(/\s+/g, ' '), m = /194[- ]?([A-Z]{1,2})/.exec(u);
    var k = m ? m[1] : '';
    if (k === 'C') return 'c'; if (k === 'H') return 'h'; if (k === 'A') return 'a'; if (k === 'Q') return 'q'; if (k === 'M') return 'm'; if (k === 'T') return 'tp'; if (k === 'IB') return 'ib';
    if (k === 'J') return /TECH|CALL/.test(u) ? 'jt' : /DIRECTOR/.test(u) ? 'jd' : 'jp';
    if (k === 'I') return /PLANT|MACHIN/.test(u) ? 'im' : 'il';
    return '';
  };
  T.label = function (id) { var s = T.sec(id); return s ? s[6] + ' (old ' + s[1] + ') · ' + s[7] : ''; };
  T.oldSec = function (id) { var s = T.sec(id); return s ? s[1] : ''; };
  T.panOk = function (pan) { return /^[A-Z]{5}\d{4}[A-Z]$/.test(String(pan || '').toUpperCase()); };
  /* deductee type from the PAN's 4th letter: P individual, H HUF -> 'ind' (the lower rate); any other -> 'oth' */
  T.who = function (pan, deductee) { if (deductee === 'ind' || deductee === 'huf') return 'ind'; if (deductee) return 'oth'; var c = String(pan || '').toUpperCase()[3]; return c === 'P' || c === 'H' ? 'ind' : 'oth'; };
  T.fy = function (date) { var y = +date.slice(0, 4), m = +date.slice(5, 7); var s = m >= 4 ? y : y - 1; return { from: s + '-04-01', to: (s + 1) + '-03-31', label: s + '-' + String(s + 1).slice(2) }; };

  /* the TDS of one bill / payment.
     o = { sec, pan, panOp (false = inoperative), deductee, amt (base without GST), ytd (base of earlier bills of this party and
           section this tax year), free (the part of ytd on which no TDS was deducted yet: taken now when the limit is crossed), monthTotal (194I: this month's rent so far, without this bill),
           ldc: [{ no, rate, limit, from, to, sec }], ldcUsed: { certNo: base already used }, date }
     -> { apply, base, rate, tds, catchup, why ('below-c' | 'below-y' | 'below-m' | 'below-q' | 'nosec'), nopan, ldc (cert no) } */
  T.due = function (o) {
    var s = T.sec(o.sec); if (!s) return { apply: false, base: 0, rate: 0, tds: 0, why: 'nosec' };
    var amt = num(o.amt), ytd = num(o.ytd), who = T.who(o.pan, o.deductee), rate = who === 'ind' ? s[2] : s[3], base = amt, apply = false, why = '', catchup = false;
    if (s[4] === 'none') apply = true;
    else if (s[4] === 'c') { apply = amt > 30000 || ytd + amt > 100000; if (!apply) why = 'below-c'; else if (ytd + amt > 100000 && num(o.free) > 0) { base = num(o.free) + amt; catchup = true; } }
    else if (s[4] === 'month') { apply = num(o.monthTotal) + amt > s[5]; if (!apply) why = 'below-m'; else if (num(o.monthTotal) > 0 && num(o.monthTotal) <= s[5]) { base = num(o.monthTotal) + amt; catchup = true; } }
    else if (s[4] === 'year') { apply = ytd + amt > s[5]; if (!apply) why = 'below-y'; else if (num(o.free) > 0) { base = num(o.free) + amt; catchup = true; } }
    else if (s[4] === 'over') { base = Math.max(0, ytd + amt - s[5]) - Math.max(0, ytd - s[5]); apply = base > 0; if (!apply) why = 'below-q'; }
    var nopan = !T.panOk(o.pan) || o.panOp === false, ldc = '';
    if (nopan) rate = s[0] === 'q' ? 5 : Math.max(20, rate);   /* s.397(2)(b)(i) */
    else if (apply && o.ldc && o.ldc.length) {
      var d = o.date || '', c = o.ldc.filter(function (x) { return (!x.sec || T.secOf(x.sec) === s[0]) && (!x.from || d >= x.from) && (!x.to || d <= x.to); })[0];
      if (c) {
        var used = num((o.ldcUsed || {})[c.no]), room = num(c.limit) ? Math.max(0, num(c.limit) - used) : Infinity;
        if (room > 0) {
          var inC = Math.min(base, room), tds1 = inC * num(c.rate) / 100 + (base - inC) * rate / 100;
          return { apply: true, base: rup(base), rate: base ? r2(tds1 / base * 100) : num(c.rate), tds: rup(tds1), catchup: catchup, ldc: c.no, ldcBase: rup(inC), nopan: false, who: who, why: '' };
        }
      }
    }
    var tds = apply ? rup(base * rate / 100) : 0;
    return { apply: apply, base: rup(base), rate: apply ? rate : 0, tds: tds, catchup: catchup, why: why, nopan: nopan, ldc: ldc, who: who };
  };

  /* every deduction in the records of a business (docs already filtered to it), with the form it belongs to.
     Sources: purchase bill / expense with tds { sec, rate, base, amt }, payment voucher with tdsRate (base = its lines), salary slip
     TDS lines (section 392). parties: [{name, pan, deductee, nr (non-resident)}]. Returns [{ id, src, date, party, pan, who, sec,
     base, tds, form '138' | '140' | '144', ch (challan id it was paid with, from the challan's alloc) }] */
  T.deductions = function (docs, parties, dedKind) {
    var P = {}; (parties || []).forEach(function (p) { P[key(p.name)] = p; });
    var out = [];
    (docs || []).forEach(function (d) {
      if (d.cancelled || d.deleted) return;
      var nm = d.buyer && d.buyer.name || '', p = P[key(nm)] || {}, pan = String(p.pan || d.buyer && d.buyer.pan || '').toUpperCase();
      if ((d.type === 'pbill' && d.kind !== 'return' || d.type === 'exp') && d.tds && num(d.tds.amt) > 0)
        out.push({ id: d.id, src: d.type, no: d.no || d.vno || '', date: d.date, party: nm, pan: pan, who: T.who(pan, p.deductee), sec: T.secOf(d.tds.sec), base: num(d.tds.base), rate: num(d.tds.rate), tds: num(d.tds.amt), form: p.nr ? '144' : '140', ldc: d.tds.ldc || '' });
      else if (d.type === 'voucher' && num(d.tdsRate) > 0) {
        var g = (d.lines || []).reduce(function (a, l) { return a + num(l.amt); }, 0);
        out.push({ id: d.id, src: 'voucher', no: d.no || '', date: d.date, party: nm, pan: pan, who: T.who(pan, p.deductee), sec: T.secOf(d.tdsSec), base: r2(g), rate: num(d.tdsRate), tds: r2(g * num(d.tdsRate) / 100), form: p.nr ? '144' : '140' });
      } else if (d.type === 'salary' && d.acct) {
        var t = (d.ded || []).filter(function (l) { return (l.head === 'tds') || (dedKind ? dedKind(l.desc) === 'tds' : /TDS|income.?tax/i.test(l.desc)); }).reduce(function (a, l) { return a + num(l.amt); }, 0);
        if (t > 0) { var gr = (d.earn || []).reduce(function (a, l) { return a + num(l.amt); }, 0), ep = String(d.emp && d.emp.pan || '').toUpperCase(); out.push({ id: d.id, src: 'salary', no: d.no || '', date: d.date || (d.month ? d.month + '-28' : ''), month: d.month, party: nm, pan: ep, who: 'ind', sec: 's', base: r2(gr), rate: gr ? r2(t / gr * 100) : 0, tds: r2(t), form: '138' }); }
      }
    });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  };
  /* base and TDS already booked for one party + section this tax year (to check the threshold); skip = the bill being changed */
  T.ytd = function (docs, party, sec, date, skip) {
    var f = T.fy(date), k = key(party), o = { base: 0, tds: 0, month: 0, free: 0 }, ym = date.slice(0, 7);
    (docs || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }).forEach(function (d) {   /* by date: 'free' restarts after a bill with TDS */
      if (d.id === skip || d.cancelled || d.deleted || key(d.buyer && d.buyer.name) !== k || !(d.date >= f.from && d.date <= f.to)) return;
      var s = '', b = 0, t = 0;
      if ((d.type === 'pbill' && d.kind !== 'return' || d.type === 'exp') && d.tds) { s = T.secOf(d.tds.sec); b = num(d.tds.billBase != null ? d.tds.billBase : d.tds.base); t = num(d.tds.amt); }
      else if (d.type === 'voucher' && d.tdsSec) { s = T.secOf(d.tdsSec); b = (d.lines || []).reduce(function (a, l) { return a + num(l.amt); }, 0); t = r2(b * num(d.tdsRate) / 100); if (d.forBill) b = 0; }   /* a payment against a bill: its bill was already counted */
      if (s !== sec) return;
      o.base = r2(o.base + b); o.tds = r2(o.tds + t); if (!t) o.free = r2(o.free + b); else if (d.tds && d.tds.catchup || t) o.free = 0; if (d.date.slice(0, 7) === ym) o.month = r2(o.month + b);
    });
    return o;
  };
  /* what a certificate (ldc) has used so far this year: { certNo: base } */
  T.ldcUsed = function (docs, party) { var k = key(party), u = {}; (docs || []).forEach(function (d) { if (d.tds && d.tds.ldc && key(d.buyer && d.buyer.name) === k) u[d.tds.ldc] = r2((u[d.tds.ldc] || 0) + num(d.tds.ldcBase)); }); return u; };

  /* ---------- quarters, due dates, challans ---------- */
  T.quarterOf = function (date) { var m = +date.slice(5, 7); return m >= 4 && m <= 6 ? 1 : m >= 7 && m <= 9 ? 2 : m >= 10 ? 3 : 4; };
  T.quarter = function (fyStart, q) { var y = +fyStart; var r = [[y + '-04-01', y + '-06-30'], [y + '-07-01', y + '-09-30'], [y + '-10-01', y + '-12-31'], [(y + 1) + '-01-01', (y + 1) + '-03-31']][q - 1]; return { from: r[0], to: r[1], due: [y + '-07-31', y + '-10-31', (y + 1) + '-01-31', (y + 1) + '-05-31'][q - 1] }; };
  /* deposit due date of tax deducted on 'date': the 7th of the next month; deducted in March: 30 April */
  T.depositDue = function (date) { var y = +date.slice(0, 4), m = +date.slice(5, 7); if (m === 3) return y + '-04-30'; var ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1; return ny + '-' + String(nm).padStart(2, '0') + '-07'; };
  /* months or part of a month between two dates, counted the way TRACES counts (calendar months touched, the first included) */
  T.monthsPart = function (from, to) { if (!from || !to || to <= from) return 0; var a = from.split('-').map(Number), b = to.split('-').map(Number); return (b[0] - a[0]) * 12 + (b[1] - a[1]) + 1; };
  /* challans: taxpay records of kind 'tds' with ch { bsr, serial, date, minor }, tax, alloc [deduction ids].
     Each deduction goes to the challan named in an alloc; the rest to the first challan paid on or after it that still has room
     (the same section form: salary TDS to challans marked 'salary' when any is). Returns { rows (deductions with ch, paid, late,
     intDeposit), challans [{ id, date, tax, used, left }], unmapped, short } */
  T.map = function (deds, challans) {
    var C = (challans || []).map(function (c) { return { id: c.id, no: c.no || '', date: (c.ch && c.ch.date) || c.date, bsr: c.ch && c.ch.bsr || '', serial: c.ch && c.ch.serial || '', minor: c.ch && c.ch.minor || '200', sal: !!(c.ch && c.ch.sal), tax: num(c.tax), used: 0, alloc: c.alloc || [] }; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var anySal = C.some(function (c) { return c.sal; });
    var rows = deds.map(function (d) { return Object.assign({}, d); });
    rows.forEach(function (r) { C.forEach(function (c) { if (!r.ch && c.alloc.indexOf(r.id) >= 0 && c.used + r.tds <= c.tax + 0.5) { r.ch = c; c.used = r2(c.used + r.tds); } }); });
    rows.forEach(function (r) {
      if (r.ch) return;
      var c = C.filter(function (c) { return c.date >= r.date && (!anySal || c.sal === (r.form === '138')) && c.used + r.tds <= c.tax + 0.5 && !c.alloc.length; })[0];
      if (c) { r.ch = c; c.used = r2(c.used + r.tds); }
    });
    rows.forEach(function (r) {
      r.due = T.depositDue(r.date);
      if (r.ch) { r.paid = r.ch.date; r.late = r.paid > r.due; r.intDeposit = r.late ? rup(r.tds * 0.015 * T.monthsPart(r.date, r.paid)) : 0; }
      else { r.paid = ''; r.late = false; r.intDeposit = 0; }
    });
    return { rows: rows, challans: C.map(function (c) { return Object.assign({}, c, { left: r2(c.tax - c.used) }); }), unmapped: rows.filter(function (r) { return !r.ch; }), short: r2(rows.filter(function (r) { return !r.ch; }).reduce(function (s, r) { return s + r.tds; }, 0)) };
  };
  /* interest a month or part from 'from' to 'to' at pct a month */
  T.interest = function (amt, from, to, pct) { return rup(num(amt) * num(pct) / 100 * T.monthsPart(from, to)); };
  /* late statement fee: Rs 200 a day after the due date, at most the TDS of the statement */
  T.lateFee = function (due, filed, tds) { if (!filed || filed <= due) return 0; var d = Math.round((new Date(filed + 'T00:00:00') - new Date(due + 'T00:00:00')) / 864e5); return Math.min(d * 200, rup(num(tds))); };
  /* checks for a quarter's rows: PAN missing / bad, PAN letter vs deductee type, no section, no challan, late deposit */
  T.checks = function (rows) {
    var out = [];
    rows.forEach(function (r) {
      if (!r.pan) out.push({ r: r, k: 'nopan' }); else if (!T.panOk(r.pan)) out.push({ r: r, k: 'badpan' });
      if (r.form !== '138' && !r.sec) out.push({ r: r, k: 'nosec' });
      if (!r.ch) out.push({ r: r, k: 'noch' }); else if (r.late) out.push({ r: r, k: 'late' });
    });
    return out;
  };
  /* Section codes of the statements (Income-tax Rules, 2026, G.S.R. 198(E): Form No. 140 Note 15 and Form No. 143 Note 9; read in the
     gazetted text 20 Nov 2026). The statements use these 4-digit codes, not the old 194-style sections. Rent paid by individuals not
     under audit (old 194-IB) and payments under old 194M have no code in Form 140: they are reported in Form No. 141
     (challan-cum-statement), so T.code gives '' and the file says so. */
  T.CODES = { c: ['1023', '1024'], jt: '1026', jp: '1027', jd: '1028', h: '1006', im: '1008', il: '1009', a: '1022', q: '1031', tp: '1067' };
  T.code = function (r) {
    if (r.form === '138') return '1002';   /* salary, employees other than government */
    var c = T.CODES[r.sec]; if (!c) return '';
    return Array.isArray(c) ? c[r.who === 'ind' ? 0 : 1] : c;
  };
  /* TCS collection codes (Form No. 143, Note 9) from the "Section and nature" picked on the bill */
  T.tcsCode = function (sec) {
    var s = String(sec || '').toLowerCase(), m = /sl\.?\s*(\d)(?:\(([ab])\))?/.exec(s); if (!m) return '';
    var n = +m[1];
    if (n === 1) return '1068'; if (n === 2) return '1069'; if (n === 4) return '1073'; if (n === 5) return '1074';
    if (n === 3) return /other forest produce \(not/.test(s) ? '1072' : /timber obtained under a forest lease/.test(s) ? '1070' : '1071';   /* older bills (one combined line) -> 1071, timber by other mode */
    if (n === 6) {
      if (m[2] !== 'b') return '1075';
      var L = [['watch', '1076'], ['art', '1077'], ['collectible', '1078'], ['yacht', '1079'], ['sunglass', '1080'], ['bag', '1081'], ['shoe', '1082'], ['sport', '1083'], ['theatre', '1084'], ['horse', '1085']];
      var f = L.filter(function (x) { return s.indexOf(x[0]) >= 0; })[0]; return f ? f[1] : '';
    }
    if (n === 8) return '1088';
    if (n === 9) return /toll/.test(s) && !/parking/.test(s) ? '1091' : /mine|quarry/.test(s) && !/parking/.test(s) ? '1092' : '1090';
    return '';
  };
  function ddmm(d) { return d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : ''; }
  T.ddmm = ddmm;
  /* the statement in the department's own layout (Income-tax Rules, 2026): Part B table 1 (challans, columns A to K) and the Annexure
     (Form 140/138/144: deductee-wise, columns A to Q; Form 143: collectee-wise, columns A to U). One workbook, sheets in this order. */
  T.statement = function (o) {
    var used = [], ix = {};
    o.rows.forEach(function (r) { if (r.ch && !(r.ch.id in ix)) { ix[r.ch.id] = used.length + 1; used.push(r.ch); } });
    var chHead = ['(A) Sl. No.', '(B) Total tax', '(C) Total interest', '(D) Total fee', '(E) Total penalty/others', '(F) Total amount deposited as per challan (B+C+D+E)', '(G) Mode of payment (C = challan, B = book adjustment)', '(H) BSR code', '(I) Date on which amount deposited through challan (dd/mm/yyyy)', '(J) Challan serial No.', '(K) Minor head of challan'];
    var chRows = used.map(function (c, i) { var x = o.chExtra(c) || {}, tot = r2(num(c.tax) + num(x.int) + num(x.fee) + num(x.oth)); return [i + 1, num(c.tax), num(x.int), num(x.fee), num(x.oth), tot, 'C', c.bsr || '', ddmm(c.date), c.serial || '', c.minor || '']; });
    var ann, head;
    if (o.tcs) {
      head = ['(A) Sl. No.', '(B) Challan reference No. (column A of Part B)', '(C) Permanent account number', '(D) Name', '(E) Whether non-resident (Y/N)', '(F) Collectee code (non-resident)', '(G) Permanent establishment in India (non-resident) (Yes/No)', '(H) Whether collectee opting out of taxation regime under section 202(1)?', '(I) Amount received / debited', '(J) Date on which amount received/debited (dd/mm/yyyy)', '(K) Collection code', '(L) Total tax collected', '(M) Whether total tax collected has been deposited (Yes/No)', '(N) Total tax deposited', '(O) Date of collection (dd/mm/yyyy)', '(P) Rate at which tax collected', '(Q) Reason for lower collection / collection at higher rate', '(R) Certificate number under section 395(3)', '(S) Whether the payment by collectee is liable to TDS as per section 394(5) (Yes/No)', '(T) Challan number (if S is Yes)', '(U) Date of payment of TDS (if S is Yes)'];
      ann = o.rows.map(function (r, i) {
        var dep = r.ch ? r.tds : 0, rem = r.decl ? 'B' : r.ldc ? 'A' : !r.pan || !T.panOk(r.pan) ? 'C' : '';
        return [i + 1, r.ch ? ix[r.ch.id] : '', r.pan || 'PANNOTAVBL', r.party, 'N', '', '', '', r.base, ddmm(r.date), r.code || '', r.tds, r.decl ? '' : r.ch ? 'Yes' : 'No', dep, r.decl ? '' : ddmm(r.date), r.decl ? '' : r.rate, rem, r.ldc || '', 'No', '', ''];
      });
    } else {
      head = ['(A) Sl. No.', '(B) Challan reference No. (column A of Part B)', '(C) Permanent account number of the deductee', '(D) Name of the deductee', '(E) Section code', '(F) Date of payment or credit (dd/mm/yyyy)', '(G) Amount paid or credited', '(H) Cash withdrawal above Rs 1 crore, section 393(3) Sl. 5', '(I) Cash withdrawal above Rs 3 crore (co-operative societies)', '(J) Total tax deducted', '(K) Whether total tax deducted has been deposited (Yes/No)', '(L) Total tax deposited', '(M) Rate at which tax deducted', '(N) Date of deduction (dd/mm/yyyy)', '(O) Reason for non-deduction / lower / higher deduction', '(P) Certificate number under section 395', '(Q) Unique identification number of Form No. 121'];
      ann = o.rows.map(function (r, i) {
        var rem = r.ldc ? 'A' : !r.pan || !T.panOk(r.pan) ? 'C' : '';
        return [i + 1, r.ch ? ix[r.ch.id] : '', r.pan || 'PANNOTAVBL', r.party, T.code(r) || 'Form 141: no Form 140 code', ddmm(r.date), r.base, '', '', r.tds, r.ch ? 'Yes' : 'No', r.ch ? r.tds : 0, r.rate, ddmm(r.date), rem, r.ldc || '', ''];
      });
    }
    return { chHead: chHead, chRows: chRows, head: head, ann: ann };
  };
  /* Excel rows of the deductee annexure (the order of fields of the Return Preparation Utility's deductee sheet, simplified) */
  T.annexure = function (rows) {
    var head = ['Sl', 'Section (2025 Act)', 'Old section', 'Deductee name', 'PAN', 'Deductee type', 'Date of payment or credit', 'Amount paid or credited', 'TDS', 'Rate %', 'Date of deduction', 'Challan BSR code', 'Challan date', 'Challan serial', 'Lower deduction certificate'];
    return [head].concat(rows.map(function (r, i) {
      var s = r.form === '138' ? null : T.sec(r.sec);
      return [i + 1, r.form === '138' ? '392' : s ? s[6] : '', r.form === '138' ? '192' : s ? s[1] : '', r.party, r.pan || 'PANNOTAVBL', r.who === 'ind' ? 'Individual / HUF' : 'Others', r.date, r.base, r.tds, r.rate, r.date, r.ch ? r.ch.bsr : '', r.ch ? r.ch.date : '', r.ch ? r.ch.serial : '', r.ldc || ''];
    }));
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = T; else root.NSTds = T;
})(typeof window !== 'undefined' ? window : this);

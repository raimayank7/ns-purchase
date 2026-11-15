/* NSIT: income tax planning for the Nivesh Sahayak App (gap-money, 2026-11-14). Pure functions, no screen; node scripts/test_itcore.js.
   Tax year 2026-27 = financial year 1 Apr 2026 to 31 Mar 2027, the first year of the Income-tax Act, 2025 (in force 1 Apr 2026).
   Plan only: it estimates, it does not file, and it is not tax advice. Rules used (dated 14 Nov 2026):
     advance tax        Act 2025 ss. 403 (charge; resident 60+ with no business income is exempt, s.403(3)), 404 (only when the tax is
                        Rs 10,000 or more), 405 (tax on the estimated income less TDS/TCS), 406 (pay on your own estimate, change it in later
                        instalments), 408 (15 Jun 15%, 15 Sep 45%, 15 Dec 75%, 15 Mar 100% cumulative; profits declared under s.58(2) pay all
                        on or before 15 Mar; money paid up to 31 Mar counts for the year)
     interest           s.424 (old 234B): 1% a month or part from 1 April after the year, when no advance tax or less than 90% of the assessed tax
                        was paid, on the shortfall; s.425 (old 234C): 3% on the shortfall of each of the first three instalments (a single
                        month's interest counted as 3 months of 1%), 1% on the March shortfall; none when 12% by 15 Jun / 36% by 15 Sep were paid;
                        capital gains, winnings (s.2(49)(n)), dividend and first-year business profits are not counted when paid in the
                        remaining instalments (s.425(4)); s.58(2) presumptive cases pay all by 15 Mar and only 1% on its shortfall (s.425(3))
     Checked word by word on 15 Nov 2026 against the official text on incometaxindia.gov.in (pages /w/section-403-5, 404-5, 405-5,
     406-5, 408-6, 424-5, 425-5): every rule above matches. First written from a third-party mirror (eztax.in).
   Everything that depends on the person (slabs, ages, surcharge, deductions) is a typed field with the dated default shown on screen. */
(function (G) {
  'use strict';
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; }
  function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function utc(iso) { return Date.parse(iso + 'T00:00:00Z'); }

  /* ---------- rates for tax year 2026-27 (typed defaults; the screen shows them and the date) ---------- */
  var INF = Infinity;
  var RATES = {
    asOf: '2026-11-14',
    newSlabs: [[400000, 0], [800000, 0.05], [1200000, 0.10], [1600000, 0.15], [2000000, 0.20], [2400000, 0.25], [INF, 0.30]],
    oldSlabs: {
      gen: [[250000, 0], [500000, 0.05], [1000000, 0.20], [INF, 0.30]],      /* under 60 and non-residents */
      sen: [[300000, 0], [500000, 0.05], [1000000, 0.20], [INF, 0.30]],      /* 60 to 79 (resident) */
      sup: [[500000, 0], [1000000, 0.20], [INF, 0.30]]                       /* 80 and above (resident) */
    },
    newRebateLimit: 1200000, newRebateMax: 60000, oldRebateLimit: 500000, oldRebateMax: 12500,
    stdNewSalary: 75000, stdOldSalary: 50000, cess: 0.04, cap80C: 150000, advMin: 10000,
    presumptiveAD: 0.08, presumptiveADdigital: 0.06, presumptiveADA: 0.50
  };

  function slabTax(x, slabs) { var tax = 0, prev = 0; x = Math.max(0, x); slabs.forEach(function (s) { if (x > prev) tax += (Math.min(x, s[0]) - prev) * s[1]; prev = s[0]; }); return r2(tax); }

  /* ---------- the year ---------- */
  /* financial year (start, end) of an ISO date */
  function fyOf(iso) { var y = +iso.slice(0, 4), m = +iso.slice(5, 7), s = m >= 4 ? y : y - 1; return { start: s + '-04-01', end: (s + 1) + '-03-31', label: s + '-' + String(s + 1).slice(2), dates: [s + '-06-15', s + '-09-15', s + '-12-15', (s + 1) + '-03-15'] }; }
  /* a figure for the part of the year so far, carried to the whole year in proportion to days (a plain straight line: a seasonal business should type its own) */
  function annualise(sofar, fyStart, asOn, fyEnd) {
    var total = Math.round((utc(fyEnd) - utc(fyStart)) / 864e5) + 1, gone = Math.round((utc(asOn) - utc(fyStart)) / 864e5) + 1;
    if (gone < 1) return 0; if (gone >= total) return r2(num(sofar));
    return r2(num(sofar) * total / gone);
  }
  /* presumptive profit: 44AD (8%, 6% on receipts by digital modes) and 44ADA (50%); in the Act 2025 this is s.58 */
  function presumptive(kind, turnover, digital, rates) {
    var R = rates || RATES, t = Math.max(0, num(turnover));
    if (kind === 'ada') return r2(t * R.presumptiveADA);
    var d = Math.min(t, Math.max(0, num(digital)));
    return r2((t - d) * R.presumptiveAD + d * R.presumptiveADdigital);
  }

  /* ---------- tax on one estimate ----------
     i: { age: 'gen'|'sen'|'sup', resident (default true), salary, business, house, other (other sources), capgain (taxed at normal slab rates:
          typed by the user, special-rate capital gains are NOT handled), ded80c, dedOther (old regime), npsEmployer (both regimes),
          surcharge (typed amount, applies to both unless surchargeNew is given), surchargeNew }
     returns { old: {...}, nu: {...}, better: 'new'|'old', saving } */
  function regime(i, kind, R) {
    var sal = Math.max(0, num(i.salary)), std = sal > 0 ? Math.min(sal, kind === 'new' ? R.stdNewSalary : R.stdOldSalary) : 0;
    var gross = r2(num(i.salary) + num(i.business) + num(i.house) + num(i.other) + num(i.capgain));
    var ded = 0, rows = [];
    if (std) rows.push(['std', std]);
    ded += std;
    var nps = Math.max(0, num(i.npsEmployer)); if (nps) { rows.push(['nps', nps]); ded += nps; }
    if (kind === 'old') {
      var c = Math.min(Math.max(0, num(i.ded80c)), R.cap80C); if (c) { rows.push(['c80', c]); ded += c; }
      var o = Math.max(0, num(i.dedOther)); if (o) { rows.push(['oth', o]); ded += o; }
    }
    var ti = Math.max(0, r2(gross - ded)), slabs = kind === 'new' ? R.newSlabs : R.oldSlabs[i.age === 'sup' && i.resident !== false ? 'sup' : i.age === 'sen' && i.resident !== false ? 'sen' : 'gen'];
    var base = slabTax(ti, slabs), reb = 0;
    if (i.resident !== false) {
      if (kind === 'new' && ti <= R.newRebateLimit) reb = Math.min(base, R.newRebateMax);
      else if (kind === 'new' && ti > R.newRebateLimit) reb = Math.max(0, base - (ti - R.newRebateLimit));   /* marginal relief just above the limit */
      else if (kind === 'old' && ti <= R.oldRebateLimit) reb = Math.min(base, R.oldRebateMax);
    }
    var net = r2(base - reb), sur = r2(Math.max(0, num(kind === 'new' && i.surchargeNew != null && i.surchargeNew !== '' ? i.surchargeNew : i.surcharge)));
    var cess = r2((net + sur) * R.cess), total = r2(net + sur + cess);
    return { gross: gross, ded: r2(ded), dedRows: rows, ti: ti, base: base, rebate: r2(reb), surcharge: sur, cess: cess, total: total, surchargeWarn: ti > 5000000 && !sur };
  }
  function tax(i, rates) {
    var R = rates || RATES, o = regime(i, 'old', R), n = regime(i, 'new', R);
    return { old: o, nu: n, better: n.total <= o.total ? 'new' : 'old', saving: r2(Math.abs(o.total - n.total)) };
  }

  /* ---------- advance tax ----------
     a: { fyStart, tax (total tax of the estimate, with cess), tds (TDS and TCS expected on income in the estimate), paid [{ date, amt }],
          presumptive (declares profits under s.58(2) / 44AD / 44ADA), senior (resident 60+ with no business income), deferred (tax on capital gains,
          dividend or first-year business profit that will come later: s.425(4)), months (months from 1 April after the year to the day the tax is
          settled, for s.424, default 4 = a return filed by 31 July) }
     returns { due, payable, exempt, rows: [{ date, pct, target, paidTo, short, interest, cumDue }], int424, int425, total } */
  function advance(a) {
    var R = RATES, fy = fyOf(a.fyStart), due = Math.max(0, r2(num(a.tax) - num(a.tds))), exempt = !!a.senior, defd = Math.max(0, num(a.deferred));
    var pays = (a.paid || []).map(function (p) { return { date: p.date, amt: num(p.amt) }; }).filter(function (p) { return p.date >= fy.start && p.date <= fy.end && p.amt; });
    function paidTo(d) { return r2(pays.reduce(function (s, p) { return s + (p.date <= d ? p.amt : 0); }, 0)); }
    var payable = !exempt && due >= R.advMin, pct = a.presumptive ? [0, 0, 0, 1] : [0.15, 0.45, 0.75, 1];
    var rows = fy.dates.map(function (d, k) {
      var base = k === 3 ? due : r2(due - defd), cum = r2(base * pct[k]), p = paidTo(d), prev = k ? r2(paidTo(fy.dates[k - 1])) : 0;
      return { date: d, pct: pct[k], cumDue: cum, paid: r2(p - prev), paidTo: p, short: Math.max(0, r2(cum - p)), interest: 0 };
    });
    var int425 = 0;
    if (payable) {
      if (a.presumptive) { rows[3].interest = r2(rows[3].short * 0.01); }
      else {
        var p15 = rows[0].paidTo, p9 = rows[1].paidTo, ret = due;   /* tax due on "returned income" = the estimate */
        rows[0].interest = p15 >= 0.12 * (ret - defd) ? 0 : r2(rows[0].short * 0.03);
        rows[1].interest = p9 >= 0.36 * (ret - defd) ? 0 : r2(rows[1].short * 0.03);
        rows[2].interest = r2(rows[2].short * 0.03);
        rows[3].interest = r2(rows[3].short * 0.01);
      }
      int425 = r2(rows.reduce(function (s, r) { return s + r.interest; }, 0));
    }
    /* s.424: assessed tax = tax less TDS; 90% test on advance tax paid up to 31 March */
    var allPaid = paidTo(fy.end), months = a.months == null ? 4 : Math.max(0, Math.ceil(num(a.months))), int424 = 0, ass = due;
    if (payable && ass > 0 && allPaid < 0.9 * ass) int424 = r2(Math.max(0, ass - allPaid) * 0.01 * months);
    return { fy: fy, due: due, payable: payable, exempt: exempt, below: !exempt && due < R.advMin, rows: rows, paidAll: allPaid, int424: int424, int425: int425, total: r2(int424 + int425), assessed: ass };
  }

  /* ---------- from the books ---------- */
  /* advance and self-assessment tax paid in the year ('Pay tax' records, kind adv) */
  function paidAdvance(docs, biz, from, to) {
    var key = function (s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }, b = key(biz), out = [];
    (docs || []).forEach(function (d) { if (d && d.type === 'taxpay' && d.kind === 'adv' && d.date >= from && d.date <= to && (!b || key(d.seller && d.seller.name) === b) && num(d.amount)) out.push({ id: d.id, no: d.no || '', date: d.date, amt: r2(num(d.amount)), mode: d.mode || '', ref: d.ref || '' }); });
    return out.sort(function (x, y) { return x.date.localeCompare(y.date); });
  }
  /* TDS that customers and payers cut and we can claim: receipts (tds) and other income (tds) in the period */
  function tdsCredits(docs, biz, from, to) {
    var key = function (s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }, b = key(biz), out = [];
    (docs || []).forEach(function (d) {
      if (!d || (d.type !== 'receipt' && d.type !== 'oinc') || d.kind === 'ref' || !num(d.tds) || d.date < from || d.date > to) return;
      if (b && key(d.seller && d.seller.name) !== b) return;
      out.push({ id: d.id, no: d.no || '', date: d.date, party: String(d.buyer && d.buyer.name || d.payer || '').trim(), amt: r2(num(d.tds)), type: d.type });
    });
    return out.sort(function (x, y) { return x.date.localeCompare(y.date); });
  }

  /* ---------- which ITR form ----------
     q: { who: 'individual'|'huf'|'firm'|'company'|'other', resident: bool, over50: bool (total income above Rs 50 lakh), business: 'none'|'presumptive'|'regular',
          presType: 'ad'|'ada'|'ae' (when presumptive), partner: bool (partner in a firm), capgain: 'none'|'small'|'other', houses: 0|1|2|3+,
          foreign: bool (foreign assets or foreign income), director: bool, unlisted: bool (unlisted shares), agri: bool (agricultural income above Rs 5,000),
          loss: bool (losses to carry forward or set off), esop: bool, crypto: bool (virtual digital assets) }
     returns { form, why: [keys], notes: [keys] }; the keys are screen texts. The form conditions are those of the notified returns for the
     year ended 31 Mar 2026 (ITR-1 and ITR-4 allow up to two house properties); the returns for tax year 2026-27 are not notified yet. */
  function itrForm(q) {
    var why = [], notes = ['n_forms'];
    if (q.who === 'company') return { form: 'ITR-6', why: ['w_company'], notes: notes };
    if (q.who === 'firm') return { form: 'ITR-5', why: ['w_firm'], notes: notes };
    if (q.who === 'other') return { form: 'ITR-7', why: ['w_other'], notes: notes };
    var biz = q.business || 'none', needs2 = false, needs3 = false;
    if (biz === 'regular' || q.partner) { needs3 = true; why.push(q.partner && biz !== 'regular' ? 'w_partner' : 'w_business'); }
    if (biz === 'presumptive' && q.who !== 'individual' && q.who !== 'huf') { needs3 = true; why.push('w_presnot'); }
    if (biz === 'presumptive' && q.presType !== 'ad' && q.presType !== 'ada' && q.presType !== 'ae') { needs3 = true; }
    if (q.resident === false) { needs2 = true; why.push('w_nonres'); }
    if (q.over50) { needs2 = true; why.push('w_over50'); }
    if (q.capgain === 'other') { needs2 = true; why.push('w_capgain'); } else if (q.capgain === 'small') { notes.push('n_ltcg'); }
    if ((+q.houses || 0) > 2) { needs2 = true; why.push('w_houses'); }
    if (q.foreign) { needs2 = true; why.push('w_foreign'); }
    if (q.director) { needs2 = true; why.push('w_director'); }
    if (q.unlisted) { needs2 = true; why.push('w_unlisted'); }
    if (q.agri) { needs2 = true; why.push('w_agri'); }
    if (q.loss) { needs2 = true; why.push('w_loss'); }
    if (q.esop) { needs2 = true; why.push('w_esop'); }
    if (q.crypto) { needs2 = true; why.push('w_crypto'); }
    if (q.who === 'huf' && biz === 'none' && !needs2) { /* a HUF without business files ITR-2 as ITR-1 is for individuals */ needs2 = true; why.push('w_huf'); }
    var form;
    if (needs3) form = 'ITR-3';
    else if (biz === 'presumptive') { form = needs2 ? 'ITR-3' : 'ITR-4'; if (needs2) why.push('w_pres2'); else why.push('w_pres'); }
    else if (needs2) form = 'ITR-2';
    else { form = 'ITR-1'; why.push('w_simple'); }
    if (form === 'ITR-4' && q.presType === 'ae') notes.push('n_ae');
    if (biz === 'presumptive' && q.who === 'individual') notes.push('n_tax');
    return { form: form, why: why, notes: notes };
  }

  /* documents to have ready, by form and answers: keys of screen texts */
  function checklist(q, form) {
    var L = ['d_pan', 'd_aadhaar', 'd_bank', 'd_ais'];
    if (q.salary) L.push('d_form16');
    if ((+q.houses || 0) > 0) L.push('d_house');
    if (q.capgain && q.capgain !== 'none') L.push('d_cg');
    if (q.business && q.business !== 'none') L.push('d_books', 'd_bizbank');
    if (q.business === 'regular') L.push('d_bs', 'd_audit');
    if (q.business === 'presumptive') L.push('d_pres');
    L.push('d_tds', 'd_adv');
    if (q.foreign) L.push('d_foreign');
    L.push('d_ded');
    return L;
  }

  var API = { RATES: RATES, num: num, r2: r2, slabTax: slabTax, fyOf: fyOf, annualise: annualise, presumptive: presumptive, tax: tax, advance: advance, paidAdvance: paidAdvance, tdsCredits: tdsCredits, itrForm: itrForm, checklist: checklist };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.NSIT = API;
})(this);

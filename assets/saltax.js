/* NSSalTax: TDS on salary as a YEAR projection (ERP round 2, S-30). Pure functions, tested by scripts/test_payrun.js.
   The tax on the whole tax year's salary = salary already paid this year + this month + the months still to come (from the salary
   structure) + one-off pay (bonus, arrears) + salary from an earlier employer this year, less the deductions the employee declared;
   TDS this month = (tax for the year - TDS already deducted this year, here and by the earlier employer) / months left including this one.
   That is how employers spread the tax evenly (Income-tax Act, 2025, s.392: TDS on salary at the average rate on the estimated income
   of the year; old Act s.192).

   Rates (Tax Year 2026-27, Income-tax Act, 2025, First Schedule as carried from Finance Act 2025; see RULES below for the source note):
     new regime (default): nil to 4 lakh, 5% to 8 lakh, 10% to 12 lakh, 15% to 16 lakh, 20% to 20 lakh, 25% to 24 lakh, 30% above;
                standard deduction 75,000; rebate up to 12 lakh of total income (at most 60,000), with marginal relief just above it.
     old regime: nil to 2.5 lakh (3 lakh at 60, 5 lakh at 80), 5% to 5 lakh, 20% to 10 lakh, 30% above; standard deduction 50,000;
                rebate up to 5 lakh (at most 12,500); deductions: professional tax paid, HRA exemption, Chapter VI-A style
                deductions typed by the employee (80C-type up to 1.5 lakh incl. the employee's PF, 80D-type, home loan interest up to 2 lakh).
     surcharge 10% above 50 lakh, 15% above 1 crore, 25% above 2 crore, 37% above 5 crore (old regime only; the new regime stops at 25%),
                with marginal relief at each band; health and education cess 4%.
   HRA exempt (old regime) = least of HRA received, rent paid less 10% of basic + DA, 50% of basic + DA in the eight listed cities
   (Delhi, Mumbai, Kolkata, Chennai, Bengaluru, Hyderabad, Pune, Ahmedabad: Income-tax Rules 2026, as noted 4 Nov 2026 in
   NiveshSahayak/Tax research) else 40%. */
(function (root) {
  'use strict';
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; }
  function rup(v) { return Math.round(v + 1e-9); }
  var S = {};
  var NEW = { sd: 75000, slabs: [[400000, 0], [800000, 0.05], [1200000, 0.1], [1600000, 0.15], [2000000, 0.2], [2400000, 0.25], [Infinity, 0.3]], rebateUpTo: 1200000, rebateMax: 60000, surCap: 0.25 };
  var OLD = { sd: 50000, slabs: function (age) { var nil = age >= 80 ? 500000 : age >= 60 ? 300000 : 250000; return [[nil, 0], [500000, 0.05], [1000000, 0.2], [Infinity, 0.3]]; }, rebateUpTo: 500000, rebateMax: 12500, surCap: 0.37, c80: 150000, hli: 200000 };
  var SUR = [[5000000, 0.10], [10000000, 0.15], [20000000, 0.25], [50000000, 0.37]];
  S.RULES = { year: '2026-27', checked: '2026-11-19', NEW: NEW, OLD: OLD, SUR: SUR, cess: 0.04,
    note: 'Slabs (s.202), standard deduction (s.19(1) Sl. 2) and rebate (s.156) of the Income-tax Act, 2025; surcharge and 4% cess for Tax Year 2026-27 from the Finance Act, 2026 (No. 4 of 2026) s.3 as enacted: new regime 10/15/25%, old regime up to 37%, marginal relief s.3(5). Read in the gazette texts on 19 Nov 2026.' };
  S.CITIES = 'Delhi, Mumbai, Kolkata, Chennai, Bengaluru, Hyderabad, Pune, Ahmedabad';
  function slabTax(x, slabs) { var tax = 0, prev = 0; slabs.forEach(function (s) { if (x > prev) tax += (Math.min(x, s[0]) - prev) * s[1]; prev = s[0]; }); return tax; }
  S.slabTax = slabTax;
  /* tax for the year on total income ti under regime r ('new' | 'old'), age in years */
  S.taxOn = function (ti, r, age) {
    ti = Math.max(0, Math.floor(num(ti) / 10) * 10);   /* total income is rounded down to the nearest ten rupees */
    var R = r === 'old' ? OLD : NEW, slabs = r === 'old' ? OLD.slabs(num(age)) : NEW.slabs;
    var base = slabTax(ti, slabs), rebate = 0;
    if (ti <= R.rebateUpTo) rebate = Math.min(base, R.rebateMax);
    else if (r !== 'old') { var over = ti - R.rebateUpTo; if (base > over) rebate = base - over; }   /* marginal relief just above 12 lakh (new regime) */
    var tax = base - rebate, sur = 0;
    for (var i = SUR.length - 1; i >= 0; i--) {
      if (ti > SUR[i][0]) {
        var rate = Math.min(SUR[i][1], R.surCap); sur = tax * rate;
        /* marginal relief: tax + surcharge may not exceed the tax at the band's start + its surcharge + the income above the band */
        var at = SUR[i][0], tAt = slabTax(at, slabs), prevRate = i ? Math.min(SUR[i - 1][1], R.surCap) : 0, capT = tAt * (1 + prevRate) + (ti - at);
        if (tax + sur > capT) sur = Math.max(0, capT - tax);
        break;
      }
    }
    var cess = (tax + sur) * S.RULES.cess, total = rup(tax + sur + cess);
    return { ti: ti, base: rup(base), rebate: rup(rebate), tax: rup(tax), sur: rup(sur), cess: rup(cess), total: total };
  };
  /* HRA exempt for the year (old regime): hra received, basic + DA, rent paid (yearly figures), city 50% */
  S.hraExempt = function (hra, basicDa, rent, metro) {
    hra = num(hra); basicDa = num(basicDa); rent = num(rent);
    if (!(hra > 0) || !(rent > 0)) return 0;
    return rup(Math.max(0, Math.min(hra, rent - 0.1 * basicDa, (metro ? 0.5 : 0.4) * basicDa)));
  };
  /* months of the tax year (April = 1) */
  S.fyOf = function (ym) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7); var s = m >= 4 ? y : y - 1; return s + '-' + String(s + 1).slice(2); };
  S.monthNo = function (ym) { var m = +ym.slice(5, 7); return m >= 4 ? m - 3 : m + 9; };
  /* the year's working.
     o = { ym, regime, age, paidYtd (taxable salary paid in earlier months of this tax year), tdsYtd, month (this month's taxable salary),
           future (taxable salary of the months still to come; default month x months left after this), oneOff (bonus, arrears this month),
           hra: { recv (year), basicDa (year), rent (year), metro } (old regime), pt (professional tax of the year), pfEe (employee PF of the year),
           decl: { c80, d80, hli, other }, prev: { sal, tds } (earlier employer this year) }
     -> { regime, gross, sd, hra, pt, dedVIA, ti, tax..., due (tax still to deduct), left (months left incl. this), perMonth, lines } */
  S.year = function (o) {
    var r = o.regime === 'old' ? 'old' : 'new', mn = S.monthNo(o.ym), left = 12 - mn + 1;
    var month = num(o.month), oneOff = num(o.oneOff), future = o.future == null ? month * (left - 1) : num(o.future);
    var prev = o.prev || {}, decl = o.decl || {};
    var gross = num(o.paidYtd) + month + oneOff + future + num(prev.sal);
    var sd = Math.min(r === 'old' ? OLD.sd : NEW.sd, gross), hra = 0, pt = 0, via = 0, L = [];
    L.push(['Salary already paid this year', num(o.paidYtd)], ['This month', month + oneOff], ['Still to come (estimated)', future]);
    if (num(prev.sal)) L.push(['Earlier employer this year', num(prev.sal)]);
    L.push(['Gross salary', gross], ['Standard deduction', -sd]);
    if (r === 'old') {
      var h = o.hra || {}; hra = S.hraExempt(h.recv, h.basicDa, h.rent, h.metro); pt = num(o.pt);
      var c80 = Math.min(OLD.c80, num(decl.c80) + num(o.pfEe)), hli = Math.min(OLD.hli, num(decl.hli));
      via = c80 + num(decl.d80) + hli + num(decl.other);
      if (hra) L.push(['HRA exempt', -hra]); if (pt) L.push(['Professional tax', -pt]);
      if (c80) L.push(['Savings (80C type, incl. PF, up to 1.5 lakh)', -c80]); if (num(decl.d80)) L.push(['Health insurance (80D type)', -num(decl.d80)]);
      if (hli) L.push(['Home loan interest (up to 2 lakh)', -hli]); if (num(decl.other)) L.push(['Other deductions', -num(decl.other)]);
    }
    var ti = Math.max(0, gross - sd - hra - pt - via), t = S.taxOn(ti, r, o.age);
    L.push(['Total income', t.ti], ['Tax on it', t.base]);
    if (t.rebate) L.push(['Rebate', -t.rebate]); if (t.sur) L.push(['Surcharge', t.sur]);
    L.push(['Cess 4%', t.cess], ['Tax for the year', t.total]);
    var done = num(o.tdsYtd) + num(prev.tds), due = Math.max(0, t.total - done);
    L.push(['TDS already deducted', -done], ['Still to deduct', due]);
    var per = left > 0 ? rup(due / left) : due;
    return Object.assign({ regime: r, gross: gross, sd: sd, hra: hra, pt: pt, via: via, left: left, done: done, due: due, perMonth: per, lines: L }, t);
  };
  /* both regimes side by side (for "which regime is better" on the tax working) */
  S.compare = function (o) { var a = S.year(Object.assign({}, o, { regime: 'new' })), b = S.year(Object.assign({}, o, { regime: 'old' })); return { neu: a, old: b, better: a.total <= b.total ? 'new' : 'old' }; };
  if (typeof module !== 'undefined' && module.exports) module.exports = S; else root.NSSalTax = S;
})(typeof window !== 'undefined' ? window : this);

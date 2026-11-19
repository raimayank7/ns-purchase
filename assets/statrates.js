/* NSStatRates: professional tax by state as one dated table (ERP round 2, used by the salary run; S-29 part).
   pt(state code, monthly gross, month 1-12, employee) -> rupees a month, 0 where the state has no professional tax, null where this
   table does not know the state (the run then shows "type it yourself"). Each row says when it was read and from where; a slab
   that is not in this table is never guessed. Labour welfare fund is a typed setting per business (Pay heads › Payroll settings),
   because the amounts and months differ by state and change often. */
(function (root) {
  'use strict';
  var R = {};
  /* state code -> [ checked, source, function (g monthly gross, mon month 1-12, e employee) ] */
  var PT = {
    '27': ['2026-11-04', 'Maharashtra State Tax on Professions Act, Schedule I entry 1 (men; women up to 25,000 a month pay none)', function (g, mon, e) { if (e && e.sex === 'f' && g <= 25000) return 0; return g <= 7500 ? 0 : g <= 10000 ? 175 : mon === 2 ? 300 : 200; }],
    '29': ['2026-11-04', 'Karnataka Tax on Professions Act, Schedule (Rs 300 in February from 1 Apr 2025)', function (g, mon) { return g >= 25000 ? (mon === 2 ? 300 : 200) : 0; }],
    '19': ['2026-11-04', 'West Bengal State Tax on Professions Act, Schedule I', function (g) { return g <= 10000 ? 0 : g <= 15000 ? 110 : g <= 25000 ? 130 : g <= 40000 ? 150 : 200; }],
    '24': ['2026-11-04', 'Gujarat State Tax on Professions Act, Schedule I', function (g) { return g >= 12000 ? 200 : 0; }],
    '36': ['2026-11-04', 'Telangana Tax on Professions Act, Schedule', function (g) { return g <= 15000 ? 0 : g <= 20000 ? 150 : 200; }],
    '37': ['2026-11-04', 'Andhra Pradesh Tax on Professions Act, Schedule', function (g) { return g <= 15000 ? 0 : g <= 20000 ? 150 : 200; }],
    '18': ['2026-11-04', 'Assam Professions Tax Act, Schedule', function (g) { return g <= 15000 ? 0 : g <= 25000 ? 180 : 208; }],
    /* Punjab State Development Tax Act, 2018, ss.4-5 and Schedule (read 19 Nov 2026): Rs 200 a month from persons paying income tax,
       i.e. whose income is above the basic exemption limit; senior citizens exempt. Exemption limit taken by the employee's regime. */
    '03': ['2026-11-19', 'Punjab State Development Tax Act, 2018, Schedule', function (g, mon, e) { var age = e && e.dob ? new Date().getFullYear() - +e.dob.slice(0, 4) : 0; if (age >= 60) return 0; return g * 12 > (e && e.regime === 'old' ? 250000 : 400000) ? 200 : 0; }]
  };
  /* states and union territories with no professional tax on salaries (checked 4 Nov 2026; Odisha repealed it from 1 Apr 2026) */
  var NONE = { '07': 1, '09': 1, '06': 1, '08': 1, '02': 1, '05': 1, '04': 1, '12': 1, '21': 1 };
  R.PT = PT; R.NONE = NONE;
  /* Labour welfare fund presets: ONLY rates read in an official text (side-session-notes r2-payroll-rules-check-2.md / -3.md,
     19 Nov 2026). ee / er = rupees each time it is cut; pct + max + erX = a percentage of wages (Haryana); months = when it is cut.
     States whose current rates were found only in secondary sources (Maharashtra, Madhya Pradesh, West Bengal, Kerala, Andhra Pradesh,
     Telangana) are left out: type them from your board's notice. */
  R.LWF = {
    '03': { ee: 5, er: 20, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], src: 'Punjab Labour Welfare Fund (Amendment) Act 32 of 2014: Rs 5 + Rs 20 a month, paid half-yearly (15 Oct, 15 Apr). A 2025 Bill raising it to Rs 10 + Rs 40 was not found in force.' },
    '06': { pct: 0.2, max: 35, erX: 2, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], src: 'Haryana Labour Welfare Fund (Amendment) Act 16 of 2021: 0.2% of wages, at most Rs 35 a month, employer twice; deposit by 31 Dec.' },
    '29': { ee: 50, er: 100, months: [12], src: 'Karnataka Labour Welfare Fund (Amendment) Act 5 of 2025: Rs 50 + Rs 100 a year, due 15 January.' },
    '33': { ee: 20, er: 40, months: [12], src: 'Tamil Nadu G.O. 161 of 2022: Rs 20 + Rs 40 a year (the due date differs between sources: check with the board).' },
    '07': { ee: 0.75, er: 2.25, months: [6, 12], src: 'Delhi Labour Welfare Fund notification (2004): Rs 0.75 + Rs 2.25, half-yearly (15 Jul, 15 Jan).' },
    '24': { ee: 6, er: 12, months: [6, 12], src: 'Gujarat Labour Welfare Board notice (2016): Rs 6 + Rs 12, half-yearly.' }
  };
  R.pt = function (st, g, mon, e) { st = String(st || ''); if (NONE[st]) return 0; var r = PT[st]; return r ? r[2](+g || 0, +mon || 0, e) : null; };
  R.ptSource = function (st) { var r = PT[st]; return r ? r[1] + ' (checked ' + r[0] + ')' : NONE[st] ? 'No professional tax on salaries' : ''; };
  if (typeof module !== 'undefined' && module.exports) module.exports = R; else root.NSStatRates = R;
})(typeof window !== 'undefined' ? window : this);

/* NSSlipSheet: draws one payslip (the small object made by NSSlipPortal.slipOf) as a printable sheet. Used by the employee's page
   (view.niveshsahayak.in/pay/) and by the App for the "Send payslip PDF" fallback. Words: NS.t('slv.*'); names and lines are the
   company's own text. html() returns a string, every value escaped. */
(function () {
  'use strict';
  var NS = window.NS, esc = NS.esc;
  function t(k, v) { return NS.t('slv.' + k, v); }
  function money(n) { return NS.money(n); }
  function mon(m) { return /^\d{4}-\d{2}$/.test(m || '') ? new Date(m + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : String(m || ''); }
  function row(l, v) { return v ? '<div><span>' + esc(l) + '</span><b>' + esc(v) + '</b></div>' : ''; }
  function table(head, rows, total, totalLabel) {
    return '<table class="sps-t"><thead><tr><th>' + esc(head) + '</th><th class="n"></th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td class="n">' + money(r[1]) + '</td></tr>'; }).join('') : '<tr><td class="soft">-</td><td></td></tr>') +
      '</tbody><tfoot><tr><th>' + esc(totalLabel) + '</th><th class="n">' + money(total) + '</th></tr></tfoot></table>';
  }
  function html(s, co) {
    var days = s.days ? (s.paid !== '' ? s.paid + ' / ' + s.days : s.days) : '';
    return '<div class="sps" data-sps><div class="sps-hd"><b class="sps-co">' + esc(co || '') + '</b><span>' + esc(t('title')) + ' · ' + esc(mon(s.m)) + '</span></div>' +
      '<div class="sps-id">' + row(t('emp'), s.n) + row(t('id'), s.id) + row(t('des'), s.des) + row(t('dep'), s.dep) + row(t('doj'), s.doj ? NS.fmtDate(s.doj) : '') + row(t('days'), days) +
      row(t('pan'), s.pan) + row(t('uan'), s.uan) + row(t('esi'), s.esi) + row(t('bank'), s.bank ? s.bank + (s.acc ? ' ' + s.acc : '') : s.acc) + row(t('slipno'), s.no) + '</div>' +
      '<div class="sps-cols">' + table(t('earn'), s.earn || [], s.gross, t('gross')) + table(t('ded'), s.ded || [], s.tded, t('tded')) + '</div>' +
      '<p class="sps-net"><span>' + esc(t('net')) + '</span><b>' + money(s.net) + '</b></p>' + (s.pd ? '<p class="sps-pd soft">' + esc(t('paidon', { d: NS.fmtDate(s.pd) })) + '</p>' : '') +
      '<p class="sps-ft soft">' + esc(t('computer')) + '</p></div>';
  }
  window.NSSlipSheet = { html: html, month: mon };
})();

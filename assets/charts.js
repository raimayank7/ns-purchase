/* Charts in the App (owner 20 Nov: "start with ECharts"): section #charts under Display and Reports.
   Apache ECharts 5.6.0 (Apache 2.0). A copy is kept in the App at /vendor/echarts.min.js, so the charts work offline and in the
   Windows program; it is loaded only when this screen opens. The figures are worked out from the saved vouchers of this business
   for the period chosen at the top (financial year by default): sales and purchases by month, money in and out by month, what
   customers owe by age, and the top customers. Nothing is sent anywhere. The App is English only. */
(function () {
  'use strict';
  var A = window.NSApp, B = window.NSBooks; if (!A || !B) return;
  var $ = NS.$, esc = NS.esc, num = NS.num, money = NS.money;
  var LIB = '/vendor/echarts.min.js', live = [];
  function months(from, to) {
    var out = [], y = +from.slice(0, 4), m = +from.slice(5, 7), ty = +to.slice(0, 4), tm = +to.slice(5, 7);
    while ((y < ty || (y === ty && m <= tm)) && out.length < 24) { out.push(y + '-' + String(m).padStart(2, '0')); m++; if (m > 12) { m = 1; y++; } }
    return out;
  }
  var MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function label(ym) { return MN[+ym.slice(5, 7) - 1] + ' ' + ym.slice(2, 4); }
  function work() {
    var r = A.range(), from = r[0], to = r[1], M = months(from, to), ix = {}, docs = A.mine().filter(function (d) { return d && !d.cancelled && !d.deleted && d.date && d.date >= from && d.date <= to; });
    M.forEach(function (m, i) { ix[m] = i; });
    var zero = function () { return M.map(function () { return 0; }); }, sale = zero(), buy = zero(), inn = zero(), out = zero(), cust = {};
    docs.forEach(function (d) {
      var i = ix[d.date.slice(0, 7)]; if (i == null) return;
      var t = d.type || 'invoice', R = B.role(d), amt = num(A.amountOf(d));
      if (/^(invoice|cashmemo|expinv)$/.test(t)) { sale[i] += amt; var n = d.buyer && d.buyer.name || 'Cash sale'; cust[n] = (cust[n] || 0) + amt; }
      else if (t === 'pbill' && d.kind !== 'return') buy[i] += amt;
    });
    /* money in and out = what reached or left the cash and bank accounts in the books (a sale paid on the bill counts too);
       moving money between cash and bank (contra) and opening balances are neither */
    try {
      B.inBooks(A.mine(), A.bizName()).forEach(function (d) {
        if (!d.date || d.date < from || d.date > to || /^(contra|ob)$/.test(B.role(d))) return;   /* opening balances are not money that came in */ var i = ix[d.date.slice(0, 7)]; if (i == null) return;
        B.postings(d).forEach(function (l) { if (l.a === 'cash' || B.isBank(l.a)) { inn[i] += num(l.dr); out[i] += num(l.cr); } });
      });
    } catch (e) {}
    var open = []; try { open = B.bills(A.mine(), A.bizName()).bills.filter(function (b) { return b.side === 'recv' && b.left > 0.004; }); } catch (e) {}
    var age = B.ageing ? B.ageing(open, NS.today()) : [0, 0, 0, 0];
    var top = Object.keys(cust).map(function (k) { return [k, cust[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8).reverse();
    var r2 = function (a) { return a.map(function (v) { return Math.round(v * 100) / 100; }); };
    return { from: from, to: to, labels: M.map(label), sale: r2(sale), buy: r2(buy), inn: r2(inn), out: r2(out), age: age, top: top,
      tSale: sale.reduce(function (a, b) { return a + b; }, 0), tBuy: buy.reduce(function (a, b) { return a + b; }, 0) };
  }
  function html() {
    var w = work();
    var card = function (id, title, sub) { return '<div class="card ch-card"><h3>' + esc(title) + '</h3>' + (sub ? '<p class="soft">' + esc(sub) + '</p>' : '') + '<div class="ch-box" id="' + id + '" role="img" aria-label="' + esc(title) + '"><p class="soft ch-wait">Drawing the chart…</p></div></div>'; };
    return '<div class="pane-hd"><h2>Charts</h2></div>' +
      '<p class="soft">From ' + esc(A.ldate(w.from)) + ' to ' + esc(A.ldate(w.to)) + ' (change the period at the top). Sales ' + esc(money(w.tSale)) + ', purchases ' + esc(money(w.tBuy)) + '.</p>' +
      '<div class="ch-grid">' + card('ch-sb', 'Sales and purchases by month', 'Bill totals with GST') + card('ch-io', 'Money in and money out by month', 'Into and out of cash and bank (not transfers between them)') +
      card('ch-age', 'What customers owe, by age', 'Open sales bills, days since the bill date') + card('ch-top', 'Top customers', 'Sales in the period') + '</div>';
  }
  function colors() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    var cs = getComputedStyle(document.body);
    return { dark: dark, ink: cs.color || (dark ? '#E5E7EB' : '#1F2937'), line: dark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.10)',
      teal: dark ? '#2DD4BF' : '#0E746A', gold: dark ? '#F2B63C' : '#B47F23', red: dark ? '#F87171' : '#B91C1C', grey: dark ? '#94A3B8' : '#64748B' };
  }
  function draw(pane) {
    live.forEach(function (c) { try { c.dispose(); } catch (e) {} }); live = [];
    var w = work(), C = colors(), E = window.echarts; if (!E) return;
    var fmt = function (v) { return money(v, false); }, base = { textStyle: { color: C.ink, fontFamily: 'inherit' }, tooltip: { trigger: 'axis', valueFormatter: fmt }, legend: { textStyle: { color: C.ink }, top: 0 }, grid: { left: 8, right: 12, top: 34, bottom: 8, containLabel: true } };
    var axisX = { type: 'category', data: w.labels, axisLine: { lineStyle: { color: C.line } }, axisLabel: { color: C.ink } };
    var axisY = { type: 'value', splitLine: { lineStyle: { color: C.line } }, axisLabel: { color: C.ink, formatter: function (v) { return v >= 1e7 ? (v / 1e7) + ' Cr' : v >= 1e5 ? (v / 1e5) + ' L' : v >= 1e3 ? (v / 1e3) + 'k' : v; } } };
    function mk(id, opt) { var el = $('#' + id, pane); if (!el) return; el.innerHTML = ''; var c = E.init(el, null, { renderer: 'canvas' }); c.setOption(Object.assign({}, base, opt)); live.push(c); }
    mk('ch-sb', { xAxis: axisX, yAxis: axisY, series: [{ name: 'Sales', type: 'bar', data: w.sale, itemStyle: { color: C.teal } }, { name: 'Purchases', type: 'bar', data: w.buy, itemStyle: { color: C.gold } }] });
    mk('ch-io', { xAxis: axisX, yAxis: axisY, series: [{ name: 'Money in', type: 'line', smooth: false, data: w.inn, itemStyle: { color: C.teal }, areaStyle: { opacity: 0.12 } }, { name: 'Money out', type: 'line', smooth: false, data: w.out, itemStyle: { color: C.red } }] });
    var ageL = ['0 to 30 days', '31 to 60 days', '61 to 90 days', 'Over 90 days'], ageC = [C.teal, C.gold, '#E07B39', C.red];
    if (w.age.some(function (v) { return v > 0; })) mk('ch-age', { tooltip: { trigger: 'item', valueFormatter: fmt }, legend: { textStyle: { color: C.ink }, bottom: 0 }, series: [{ type: 'pie', radius: ['45%', '72%'], center: ['50%', '45%'], label: { color: C.ink, formatter: '{b}\n{d}%' }, data: ageL.map(function (n, i) { return { name: n, value: Math.round(w.age[i] * 100) / 100, itemStyle: { color: ageC[i] } }; }).filter(function (x) { return x.value > 0; }) }] });
    else { var a = $('#ch-age', pane); if (a) a.innerHTML = '<p class="soft ch-wait">No customer owes anything right now.</p>'; }
    if (w.top.length) mk('ch-top', { tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: fmt }, legend: { show: false }, xAxis: axisY, yAxis: { type: 'category', data: w.top.map(function (t) { return t[0].length > 22 ? t[0].slice(0, 21) + '…' : t[0]; }), axisLabel: { color: C.ink } }, series: [{ name: 'Sales', type: 'bar', data: w.top.map(function (t) { return Math.round(t[1] * 100) / 100; }), itemStyle: { color: C.teal } }] });
    else { var b = $('#ch-top', pane); if (b) b.innerHTML = '<p class="soft ch-wait">No sales in this period yet.</p>'; }
  }
  function wire(pane) {
    NS.loadJs(LIB).then(function () { if (document.contains(pane)) draw(pane); }, function () {
      Array.prototype.forEach.call(pane.querySelectorAll('.ch-wait'), function (p) { p.textContent = 'The chart could not be loaded.'; });
    });
  }
  window.addEventListener('resize', function () { live.forEach(function (c) { try { c.resize(); } catch (e) {} }); });
  window.addEventListener('beforeprint', function () { live.forEach(function (c) { try { c.resize(); } catch (e) {} }); });
  A.addSection('charts', html, wire);
  function menu() {
    var nav = $('.hub-nav'), app = $('#app'); if (!nav || !app || app.getAttribute('data-secs') || $('[data-sec="charts"]', nav)) return;
    nav.appendChild(NS.el('a', { href: '#charts', 'data-sec': 'charts' }, '<span>' + esc(NS.t('app.charts')) + '</span>'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', menu); else menu();
  setTimeout(menu, 400);
})();

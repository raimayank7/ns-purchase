/* Route / beat and scheme in the Nivesh Sahayak App (after app.js and ledger.js; India plan A, 2026-11-17; sums in routecore.js).
     Party master (My data): optional Route / beat and Scheme boxes.
     Dues, Parties:           a Route filter next to the Group filter; each due line shows the party's route and scheme.
     Group reports:           a "Route-wise" tab = outstanding per route with ageing (0-30, 31-60, 61-90, 90+), the parties under each
                              route and the salesman named on its open bills; print, PDF and Excel like the other group reports.
   Nothing here fills a route by itself: parties without one sit under "No route". */
(function () {
  'use strict';
  var A = window.NSApp; if (!A || !window.NSRoute) return;
  var R = NSRoute, B = NSBooks, esc = NS.esc, key = B.key, money = NS.money, T = function (k, p) { return NS.t(k, p); };
  var rte = '';   /* the route filter: '' = all, '-' = parties without a route, else the route key */

  function partyRec(k) { return A.data().party.filter(function (p) { return key(p.name) === k; })[0] || null; }
  function routeOfKey(k) { return R.routeOf(partyRec(k)); }
  function routeKeep(k) {
    if (!rte) return true;
    var r = routeOfKey(k); return rte === '-' ? !r : R.rkey(r) === rte;
  }
  function routes() { return R.list(A.data().party); }

  /* the filter box: only when at least one party has a route (a shop that never uses routes never sees it) */
  function routeSel() {
    var L = routes(); if (!L.length) return '';
    if (rte && rte !== '-' && !L.some(function (r) { return R.rkey(r) === rte; })) rte = '';
    return '<label class="lg-gsel rt-sel"><span>' + esc(T('rtb.route')) + '</span> <select data-rte><option value="">' + esc(A.T('all')) + '</option>' +
      L.map(function (r) { return '<option value="' + esc(R.rkey(r)) + '"' + (R.rkey(r) === rte ? ' selected' : '') + '>' + esc(r) + '</option>'; }).join('') +
      '<option value="-"' + (rte === '-' ? ' selected' : '') + '>' + esc(T('rtb.none')) + '</option></select></label>';
  }
  function routeTag(k) {
    var p = partyRec(k); if (!p || (!R.routeOf(p) && !p.scheme)) return '';
    return '<br><span class="soft rt-tag">' + [R.routeOf(p) && esc(T('rtb.route')) + ': ' + esc(R.routeOf(p)), p.scheme && esc(T('rtb.scheme')) + ': ' + esc(p.scheme)].filter(Boolean).join(' · ') + '</span>';
  }
  document.addEventListener('change', function (e) {
    var s = e.target; if (!s.matches || !s.matches('[data-rte]')) return;
    rte = s.value; A.show();
  });

  /* ---------- the route-wise outstanding report (a tab of Group reports; ledger.js calls these) ---------- */
  function build(openBills, today, P) {
    var D = A.mine(), sm = {}; D.forEach(function (d) { if (d.sman) sm[d.id] = String(d.sman).trim(); });
    var keep = openBills.filter(function (b) { return A.grpKeep(key(b.party), P); });
    return R.dues(keep, routeOfKey, today, true, function (id) { return sm[id]; }, B);
  }
  function body(side, openBills, today, P) {
    var out = build(openBills, today, P).filter(function (g) { return (side === 'pay' ? g.pt : g.rt) > 0.004; });
    if (!out.length) return '<p class="soft">' + esc(A.T('nodues')) + '</p>';
    var tot = [0, 0, 0, 0, 0];
    var rows = out.map(function (g) {
      var a = side === 'pay' ? g.pay : g.recv, t = side === 'pay' ? g.pt : g.rt;
      a.forEach(function (v, i) { tot[i] += v; }); tot[4] += t;
      var ps = g.parties[side].filter(function (x) { return x.tot > 0.004; });
      return '<tr class="lg-gt rt-h"><th scope="row">' + esc(g.id ? g.name : T('rtb.none')) + (g.sman.length ? '<br><span class="soft">' + esc(T('rtb.sman')) + ': ' + esc(g.sman.join(', ')) + '</span>' : '') +
        ' <span class="soft">· ' + esc(A.T('lg_n', { n: ps.length })) + '</span></th>' + a.map(function (v) { return '<td class="n">' + (v ? money(v, false) : '—') + '</td>'; }).join('') + '<td class="n"><b>' + money(t, false) + '</b></td></tr>' +
        ps.map(function (x) {
          var p = partyRec(x.key) || {};
          return '<tr class="rt-p"><td style="padding-inline-start:1.6em"><a href="#st/' + encodeURIComponent(x.key) + '">' + esc(x.name) + '</a>' + (p.scheme ? '<br><span class="soft">' + esc(T('rtb.scheme')) + ': ' + esc(p.scheme) + '</span>' : '') + '</td>' +
            x.a.map(function (v) { return '<td class="n">' + (v ? money(v, false) : '—') + '</td>'; }).join('') + '<td class="n">' + money(x.tot, false) + '</td></tr>'; }).join('');
    }).join('');
    return '<table class="tbl st lg-tbl rt-tbl"><thead><tr><th>' + esc(T('rtb.route')) + '</th>' + ['a0', 'a1', 'a2', 'a3'].map(function (x) { return '<th class="n">' + esc(A.T(x)) + '</th>'; }).join('') + '<th class="n">' + esc(A.T('totaldue')) + '</th></tr></thead><tbody>' + rows +
      '<tr class="lg-gt"><th>' + esc(T('rtb.all')) + '</th>' + tot.map(function (v, i) { return (i === 4 ? '<th class="n"><b>' : '<th class="n">') + (v ? money(Math.round(v * 100) / 100, false) : '—') + (i === 4 ? '</b></th>' : '</th>'); }).join('') + '</tr></tbody></table>' +
      '<p class="soft">' + esc(T('rtb.h_rep')) + '</p>';
  }
  /* Excel rows (English headers like every report): route, party, scheme, salesman, the four ageing bands, total */
  function rows(side, openBills, today, P) {
    var out = [['Route', 'Party', 'Scheme', 'Salesman', '0-30 days', '31-60 days', '61-90 days', 'Over 90 days', 'Total due']];
    build(openBills, today, P).filter(function (g) { return (side === 'pay' ? g.pt : g.rt) > 0.004; }).forEach(function (g) {
      var a = side === 'pay' ? g.pay : g.recv, t = side === 'pay' ? g.pt : g.rt;
      out.push([g.id ? g.name : '(No route)', '(Route total)', '', g.sman.join(', ')].concat(a).concat([t]));
      g.parties[side].filter(function (x) { return x.tot > 0.004; }).forEach(function (x) { var p = partyRec(x.key) || {}; out.push([g.id ? g.name : '(No route)', x.name, p.scheme || '', '', ].concat(x.a).concat([x.tot])); });
    });
    return out;
  }

  A.routeKeep = routeKeep; A.routeSel = routeSel; A.routeTag = routeTag; A.routeBody = body; A.routeRows = rows; A.routeAny = function () { return routes().length > 0; };
})();

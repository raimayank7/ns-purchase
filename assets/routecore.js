/* NSRoute: route / beat and scheme of a party, and the route-wise outstanding report for distributors (India plan A, 2026-11-17).
   A distributor's salesman visits shops along a route (a beat) on fixed days; dues are chased route by route.
   The party master has two optional fields: route (free text, "Model Town beat", "Monday - Samrala road") and scheme (free text, "5% on 50 cases").
   Pure functions, no screen (node scripts/test_route.js); the screens are in route.js.
     routeOf(rec)                     the trimmed route of a party record ('' = none)
     rkey(route)                      the same route typed with other capitals or spaces is one route
     list(parties)                    every route in use, sorted
     dues(openBills, routeOfKey, today, byDue, smanOfId)
                                      open bills (NSBooks.bills().bills) added up per route and side with ageing 0-30, 31-60, 61-90, 90+.
                                      [{ id, name, recv: [4], pay: [4], rt, pt, n, sman: ['Ravi'], parties: { recv: [{ key, name, a: [4], tot }], pay: [...] } }]
                                      routeOfKey(partyKey) gives the route of a party; bills of parties without one go to the "no route" row (id '', last).
                                      smanOfId(billId) optionally gives the salesman named on the bill. */
(function (G) {
  'use strict';
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; }
  function r2(n) { return Math.round(n * 100) / 100; }
  function routeOf(rec) { return String(rec && rec.route != null ? rec.route : '').replace(/\s+/g, ' ').trim(); }
  function rkey(r) { return routeOf({ route: r }).toLowerCase(); }
  function list(parties) {
    var seen = {}, out = [];
    (parties || []).forEach(function (p) { var r = routeOf(p), k = rkey(r); if (r && !seen[k]) { seen[k] = 1; out.push(r); } });
    return out.sort(function (a, b) { return a.localeCompare(b); });
  }
  function dues(openBills, routeOfKey, today, byDue, smanOfId, B) {
    B = B || G.NSBooks;
    var by = {}, names = {};
    (openBills || []).forEach(function (b) {
      var pk = String(b.party || '').trim().toLowerCase(), r = routeOfKey(pk) || '', id = rkey(r);
      names[id] = names[id] || r;
      (by[id] = by[id] || []).push(b);
    });
    var out = Object.keys(by).map(function (id) {
      var recv = [], pay = [], pp = { recv: {}, pay: {} }, sm = {};
      by[id].forEach(function (b) {
        var side = b.side === 'pay' ? 'pay' : 'recv', pk = String(b.party || '').trim().toLowerCase();
        (side === 'pay' ? pay : recv).push(b);
        var o = pp[side][pk] = pp[side][pk] || { key: pk, name: b.party, list: [] }; o.list.push(b);
        var s = smanOfId && smanOfId(b.id); if (s) sm[s] = 1;
      });
      var parts = function (side) {
        return Object.keys(pp[side]).map(function (k) { var o = pp[side][k], a = B.ageing(o.list, today, byDue); return { key: o.key, name: o.name, a: a, tot: r2(a[0] + a[1] + a[2] + a[3]) }; })
          .sort(function (x, y) { return y.tot - x.tot; });
      };
      var a = B.ageing(recv, today, byDue), p = B.ageing(pay, today, byDue);
      return { id: id, name: names[id], recv: a, pay: p, rt: r2(a[0] + a[1] + a[2] + a[3]), pt: r2(p[0] + p[1] + p[2] + p[3]),
        n: Object.keys(Object.assign({}, pp.recv, pp.pay)).length, sman: Object.keys(sm).sort(), parties: { recv: parts('recv'), pay: parts('pay') } };
    });
    /* biggest receivable first, "no route" always last */
    return out.sort(function (x, y) { if (!x.id !== !y.id) return x.id ? -1 : 1; return (y.rt + y.pt) - (x.rt + x.pt) || x.name.localeCompare(y.name); });
  }
  var API = { routeOf: routeOf, rkey: rkey, list: list, dues: dues, num: num };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.NSRoute = API;
})(typeof window !== 'undefined' ? window : this);

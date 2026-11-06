/* NSStaff: the employee list (Accounts coverage WP-5), shared by the salary slip maker, the App (Staff, salary and loans) and
   My data. Kept in the data home as meta 'staff' = { emps: [{ id, name, biz (business name), code, desig, dept, doj, pan, uan, esi,
   bankName, bankAcc, bankIfsc, earn: [{ desc, amt }] (usual monthly pay), left (date the employee left), updated }] }.
   The list fills itself: saving a salary slip keeps that employee's details and pay (keep()); picking a name on a new slip
   fills the slip from the list (fillSlip()). An employee with no business belongs to every business. */
(function () {
  'use strict';
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; }
  var EMPK = ['code', 'desig', 'dept', 'doj', 'pan', 'uan', 'esi', 'bankName', 'bankAcc', 'bankIfsc'];
  var M = null;
  function load() {
    return NSStore.meta('staff').then(function (m) { M = m && typeof m === 'object' && Array.isArray(m.emps) ? m : { emps: [] }; return M; })
      .catch(function () { M = M || { emps: [] }; return M; });
  }
  function save() { return NSStore.meta('staff', M); }
  function mineOf(list, biz) { var b = key(biz); return list.filter(function (e) { return !b || !e.biz || key(e.biz) === b; }); }
  /* employees of a business (all when no business is given), by name */
  function list(biz) { return load().then(function (m) { return mineOf(m.emps, biz).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); }); }); }
  function forSlip(biz) { return list(biz).then(function (l) { return l.filter(function (e) { return !e.left; }); }); }
  function find(name, biz) { var k = key(name); return M ? mineOf(M.emps, biz).filter(function (e) { return key(e.name) === k; })[0] : null; }
  /* a new slip from the list: the employee's details and usual pay; days are left for this month */
  function fillSlip(doc, e) {
    doc.buyer = Object.assign(doc.buyer || {}, { name: e.name });
    doc.emp = {}; EMPK.forEach(function (k) { doc.emp[k] = e[k] || ''; });
    if (e.earn && e.earn.length) doc.earn = e.earn.map(function (l) { return { desc: l.desc, amt: String(l.amt == null ? '' : l.amt) }; });
    doc.days = ''; doc.paid = '';
  }
  /* after a salary slip is saved: add the employee, or bring the details and the usual pay up to date */
  function keep(doc) {
    return load().then(function (m) {
      var nm = String(doc.buyer && doc.buyer.name || '').trim(), b = String(doc.seller && doc.seller.name || '').trim(); if (!nm) return;
      var e = find(nm, b);
      if (!e) { e = { id: newId(), name: nm, biz: b }; m.emps.push(e); }
      EMPK.forEach(function (k) { var v = String((doc.emp || {})[k] || '').trim(); if (v) e[k] = v; });
      var earn = (doc.earn || []).filter(function (l) { return String(l.desc || '').trim() && num(l.amt); });
      if (earn.length) e.earn = earn.map(function (l) { return { desc: String(l.desc).trim(), amt: String(l.amt) }; });
      e.updated = Date.now();
      return save();
    }).catch(function () {});
  }
  function newId() { return 'emp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  /* add or change one employee (the App and My data forms); a name already in that business is refused */
  function put(e) {
    return load().then(function (m) {
      var clash = mineOf(m.emps, e.biz).filter(function (x) { return x.id !== e.id && key(x.name) === key(e.name); })[0];
      if (clash) return Promise.reject(new Error('dup'));
      var i = -1; m.emps.forEach(function (x, j) { if (x.id === e.id) i = j; });
      e = Object.assign({}, e, { id: e.id || newId(), updated: Date.now() });
      if (i >= 0) m.emps[i] = e; else m.emps.push(e);
      return save().then(function () { return e; });
    });
  }
  function remove(id) { return load().then(function (m) { m.emps = m.emps.filter(function (x) { return x.id !== id; }); return save(); }); }
  window.NSStaff = { load: load, list: list, forSlip: forSlip, find: find, fillSlip: fillSlip, keep: keep, put: put, remove: remove, EMPK: EMPK, key: key };
})();

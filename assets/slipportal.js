/* Payslip portal, HR side (App › Payroll › Salary register › "Publish payslips to employees"; after staff.js).
   For a month, HR publishes every employee's salary slip: each employee's payslips are locked in this browser (engine/slipportalcore.js,
   AES-256-GCM, key from a 6-digit PIN + the access key) and only the locked copy goes to the small Worker (workers/payslips). Employees open
   ONE company link on view.niveshsahayak.in/pay/, type Employee ID + PIN and read their payslips on their phones.

   State, in the data home as meta 'slipportal' = { by: { <business name, lower case>: C } }, C = {
     code, admin (HR secret), K (access key), retention (months), off, made, months: ['2026-10', ...] (published months, newest last),
     emps: { <Employee ID, lower case, no spaces>: { eid, name, pin, salt } } }.
   The PINs stay here (on this PC's data home and its backups) so HR can print the list again and months can be added later.
   Employees come from the Employees list (NSStaff: the "Employee code" is the Employee ID); a slip belongs to an employee by name.
   Screen words: NS.t('sp.*'), English only (App screen); the employee's page and sheet use 'slv.*'. */
(function () {
  'use strict';
  var A = window.NSApp, S = window.NSStaff, P = window.NSSlipPortal, SS = window.NSSlipSheet, B = window.NSBooks; if (!A || !S || !P || !B) return;
  var NS = window.NS, $ = NS.$, $$ = NS.$$, esc = NS.esc;
  var API = (window.NS_CFG && NS_CFG.pay) || '';
  var ITER = window.NS_SLIP_ITER || undefined;   /* only tests make this smaller */
  function T(k, v) { return NS.t('sp.' + k, v); }
  function bkey() { return String(A.bizName() || '').trim().toLowerCase(); }
  function ym(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function monthName(m) { return SS.month(m); }
  function ask(msg) { return NS.ask ? NS.ask(msg) : Promise.resolve(window.confirm(msg)); }
  function viewBase() { return (A.siteHome && A.siteHome('view')) || 'https://view.niveshsahayak.in/'; }

  var M = null, C = null, EMPS = [], busy = false, showPins = false, dlg = null;
  /* closing the page while payslips are still being locked and sent stops the upload part-way: ask the browser to warn */
  var working = 0;
  window.addEventListener('beforeunload', function (e) { if (working > 0) { e.preventDefault(); e.returnValue = ''; } });
  function load() {
    return NSStore.meta('slipportal').then(function (m) { M = m && typeof m === 'object' && m.by ? m : { by: {} }; C = M.by[bkey()] || null; return C; });
  }
  function save() { if (C) M.by[bkey()] = C; return NSStore.meta('slipportal', M); }
  function post(path, body) {
    return fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }).catch(function () { return { ok: false, why: 'net' }; });
  }
  function why(r) { return T('e_' + (r && r.why || 'error')) ; }

  /* ---------- who and what ---------- */
  function slips() { return A.mine().filter(function (d) { return d.type === 'salary' && /^\d{4}-\d{2}$/.test(d.month || ''); }); }
  function slipMonths() { var o = {}; slips().forEach(function (d) { o[d.month] = 1; }); return Object.keys(o).sort().reverse(); }
  /* the employees with an Employee ID, the ones without, the clashes; and each one's slips by month */
  function people() {
    var out = { ok: [], noId: [], dup: [] }, byId = {}, sl = slips();
    EMPS.forEach(function (e) {
      var id = P.normEid(e.code); if (!id) { out.noId.push(e); return; }
      if (byId[id]) { out.dup.push(e); return; }
      var mine = {}; sl.forEach(function (d) { if (S.key(B.partyName(d)) === S.key(e.name)) { var o = mine[d.month]; if (!o || (d.created || 0) >= (o.created || 0)) mine[d.month] = d; } });
      byId[id] = { e: e, id: id, slips: mine }; out.ok.push(byId[id]);
    });
    return out;
  }
  function cutoff(months) { var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - months); return ym(d); }
  function contentFor(p) {
    var o = { v: 1, co: A.bizName() || '', months: {} };
    (C.months || []).forEach(function (m) { if (p.slips[m]) { var s = P.slipOf(p.slips[m], B); s.id = String(p.e.code || '').trim(); o.months[m] = s; } });
    return o;
  }
  function pinOf(p) {
    var r = C.emps[p.id];
    if (!r) r = C.emps[p.id] = { eid: String(p.e.code).trim(), name: p.e.name, pin: P.genPin(), salt: P.genSalt() };
    r.eid = String(p.e.code).trim(); r.name = p.e.name; return r;
  }
  /* lock and upload these people (all published months of each); only = a list of ids, else everybody */
  function upload(only, progress) { working++; return upload0(only, progress).then(function (r) { working--; return r; }, function (e) { working--; throw e; }); }
  function upload0(only, progress) {
    var all = people().ok.filter(function (p) { return (!only || only.indexOf(p.id) >= 0) && Object.keys(contentFor(p).months).length; });
    var gone = Object.keys(C.emps).filter(function (id) { return !all.some(function (p) { return p.id === id; }) && (!only || only.indexOf(id) >= 0); });
    var done = 0, items = [];
    function one(p) {
      var r = pinOf(p);
      return P.item(r.eid, r.pin, C.K, C.code, contentFor(p), { salt: r.salt, iter: ITER }).then(function (it) { items.push(it); done++; if (progress) progress(done, all.length); });
    }
    var q = all.slice(), run = function () { var p = q.shift(); return p ? one(p).then(run) : null; };
    return Promise.all([run(), run(), run(), run()]).then(function () {
      var chunks = []; for (var i = 0; i < items.length; i += 20) chunks.push(items.slice(i, i + 20));
      var res = Promise.resolve({ ok: true });
      if (!chunks.length && !C.made) res = post('/publish', { code: C.code, admin: C.admin, retention: C.retention, items: [] });
      chunks.forEach(function (ch) { res = res.then(function (r) { return r.ok ? post('/publish', { code: C.code, admin: C.admin, retention: C.retention, items: ch }) : r; }); });
      return res;
    }).then(function (r) {
      if (!r.ok) return r;
      return Promise.all(gone.map(function (id) { return P.lookup(C.K, C.emps[id].eid); })).then(function (lks) {
        return (lks.length ? post('/admin/delete', { code: C.code, admin: C.admin, lks: lks }) : Promise.resolve({ ok: true })).then(function (d) {
          if (d.ok) gone.forEach(function (id) { delete C.emps[id]; });
          C.made = C.made || Date.now(); return d.ok ? { ok: true, count: items.length } : d;
        });
      });
    });
  }

  /* ---------- actions ---------- */
  function firstSetup() { C = { code: P.genCode(), admin: P.genAdmin(), K: P.genKey(), retention: 12, off: false, made: 0, months: [], emps: {} }; }
  function publishMonth(month, setBar) {
    if (!API) { NS.toast(T('e_soon'), 'bad'); return Promise.resolve(); }
    var pp = people();
    if (!pp.ok.some(function (p) { return p.slips[month]; })) { NS.toast(T('noslips', { m: monthName(month) }), 'bad'); return Promise.resolve(); }
    var fresh = !C; if (fresh) firstSetup();
    var snap = JSON.stringify(C);
    if (C.months.indexOf(month) < 0) C.months.push(month); C.months.sort();
    var cut = cutoff(C.retention || 12); C.months = C.months.filter(function (m) { return m >= cut || m === month; });
    var tries = 0;
    function attempt() {
      return save().then(function () { return upload(null, setBar); }).then(function (r) {
        if (!r.ok && r.why === 'denied' && fresh && tries++ < 3) { C.code = P.genCode(); C.made = 0; return attempt(); }   /* code taken by someone else: make another */
        return r;
      });
    }
    return attempt().then(function (r) {
      if (!r.ok) { if (fresh) { C = null; delete M.by[bkey()]; return NSStore.meta('slipportal', M).then(function () { return r; }); } C = JSON.parse(snap); return save().then(function () { return r; }); }
      return save().then(function () { return r; });
    });
  }
  function unpublishMonth(m) {
    C.months = C.months.filter(function (x) { return x !== m; });
    return save().then(function () { return upload(null); }).then(function (r) { return save().then(function () { return r; }); });
  }
  function resetPin(id) {
    var r = C.emps[id]; if (!r) return Promise.resolve({ ok: false });
    r.pin = P.genPin(); r.salt = P.genSalt();
    return save().then(function () { return upload([id]); }).then(function (x) { return save().then(function () { return x; }); });
  }

  /* ---------- printing ---------- */
  function printHtml(html) {
    var f = document.createElement('iframe'); f.setAttribute('aria-hidden', 'true'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    var d = f.contentWindow.document; d.open(); d.write(html); d.close();
    setTimeout(function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {} setTimeout(function () { f.remove(); }, 60000); }, 300);
  }
  function pinSheet() {
    var link = P.link(viewBase(), C.code, C.K), co = esc(A.bizName() || '');
    var rows = Object.keys(C.emps).map(function (id) { return C.emps[id]; }).sort(function (a, b) { return String(a.eid).localeCompare(String(b.eid), undefined, { numeric: true }); });
    return '<!doctype html><meta charset="utf-8"><title>' + esc(T('pl_title')) + '</title><style>body{font:14px/1.45 Arial,sans-serif;margin:16px;color:#111}h1{font-size:18px;margin:0 0 4px}.card{display:inline-block;vertical-align:top;width:calc(50% - 14px);box-sizing:border-box;border:1px dashed #666;padding:10px 12px;margin:0 6px 10px 0;page-break-inside:avoid}' +
      '.card b{font-size:15px}.pin{font:bold 22px monospace;letter-spacing:.2em}.l{font:11px monospace;word-break:break-all;color:#333}.s{color:#555;font-size:12px}@media print{.n{display:none}}</style>' +
      '<h1>' + co + ' - ' + esc(T('pl_h')) + '</h1><p class="s n">' + esc(T('pl_cut')) + '</p>' +
      rows.map(function (r) { return '<div class="card"><div class="s">' + co + '</div><div><span class="s">' + esc(T('pl_eid')) + '</span> <b>' + esc(r.eid) + '</b></div><div>' + esc(r.name) + '</div>' +
        '<div><span class="s">' + esc(T('pl_pin')) + '</span> <span class="pin">' + esc(r.pin) + '</span></div><div class="s">' + esc(T('pl_how')) + '</div><div class="l">' + esc(link) + '</div></div>'; }).join('') +
      '<p class="s">' + esc(T('pl_keep')) + '</p>';
  }

  /* ---------- PDF fallback (one employee, password) ---------- */
  function pdfFor(p) {
    var months = Object.keys(p.slips).sort().reverse(); if (!months.length) { NS.toast(T('nopdf'), 'bad'); return; }
    var pw = (C && C.emps[p.id] && C.emps[p.id].pin) || P.genPin();
    var box = $('[data-spd-pbox]', dlg);
    box.hidden = false;
    box.innerHTML = '<h3>' + esc(T('pdf_h', { n: p.e.name })) + '</h3><p class="soft">' + esc(T('pdf_p')) + '</p><div class="fg">' +
      '<div class="f"><label for="spd-pm">' + esc(T('month')) + '</label><select id="spd-pm">' + months.map(function (m) { return '<option value="' + esc(m) + '">' + esc(monthName(m)) + '</option>'; }).join('') + '</select></div>' +
      '<div class="f"><label for="spd-pw">' + esc(T('pdf_pw')) + '</label><input id="spd-pw" value="' + esc(pw) + '" autocomplete="off"></div></div>' +
      '<p class="soft">' + esc(T('pdf_tell')) + '</p><p><button type="button" class="btn primary" data-spd-mk>' + esc(T('pdf_go')) + '</button> <button type="button" class="btn" data-spd-xx>' + esc(T('close')) + '</button></p>';
    $('[data-spd-xx]', box).addEventListener('click', function () { box.hidden = true; });
    $('[data-spd-mk]', box).addEventListener('click', function () {
      var m = $('#spd-pm', box).value, pwd = $('#spd-pw', box).value.trim(); if (!pwd) { NS.toast(T('pdf_need'), 'bad'); return; }
      var s = P.slipOf(p.slips[m], B), hold = document.createElement('div'); hold.innerHTML = SS.html(s, A.bizName() || ''); document.body.appendChild(hold);
      var nodes = $$('[data-sps]', hold);
      NS.sharePdf(nodes, 'Payslip ' + p.e.name + ' ' + m, 'a4', 'Payslip ' + monthName(m), T('pdf_msg', { m: monthName(m) }), { password: pwd }).then(function () { hold.remove(); }, function () { hold.remove(); });
    });
  }

  /* ---------- the dialog ---------- */
  function html() {
    var pp = people(), ms = slipMonths(), link = C ? P.link(viewBase(), C.code, C.K) : '';
    var h = '<div class="dlg-hd"><h2 id="spd-t">' + esc(T('title')) + (A.bizName() ? ' · ' + esc(A.bizName()) : '') + '</h2><button type="button" class="icon-btn" data-x aria-label="' + esc(NS.t('close')) + '">✕</button></div><div class="spd" style="padding:0 4px 8px">';
    if (!API) h += '<p class="spd-warn">' + esc(T('e_soon')) + '</p>';
    h += '<p class="soft">' + esc(T('intro')) + '</p>';
    if (C) {
      h += '<div class="card"><h3>' + esc(T('link_h')) + ' <span class="pill ' + (C.off ? 'warn' : 'ok') + '">' + esc(T(C.off ? 'off' : 'on')) + '</span></h3><div class="spd-link"><input readonly value="' + esc(link) + '" aria-label="' + esc(T('link_h')) + '" data-spd-link>' +
        '<button type="button" class="btn sm" data-spd-copy>' + esc(T('copy')) + '</button><a class="btn sm" href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(T('open')) + '</a></div><p class="soft">' + esc(T('link_p')) + '</p></div>';
    }
    h += '<div class="card"><h3>' + esc(T('pub_h')) + '</h3>' + (ms.length ? '<div class="fg"><div class="f"><label for="spd-m">' + esc(T('month')) + '</label><select id="spd-m">' + ms.map(function (m) { return '<option value="' + esc(m) + '"' + (C && C.months.indexOf(m) >= 0 ? '' : '') + '>' + esc(monthName(m)) + (C && C.months.indexOf(m) >= 0 ? ' · ' + esc(T('published')) : '') + '</option>'; }).join('') + '</select></div></div>' +
      '<p><button type="button" class="btn primary" data-spd-pub' + (busy ? ' disabled' : '') + '>' + esc(C ? T('pub_go2') : T('pub_go')) + '</button></p><div class="spd-prog" data-spd-prog hidden><i></i></div><p class="soft" data-spd-say aria-live="polite"></p>' : '<p class="soft">' + esc(T('noslips0')) + '</p>') + '</div>';
    if (pp.noId.length || pp.dup.length) {
      h += '<div class="card"><h3 class="spd-warn">' + esc(T('warn_h')) + '</h3><ul class="rows">' + pp.noId.map(function (e) { return '<li>' + esc(T('w_noid', { n: e.name })) + '</li>'; }).join('') + pp.dup.map(function (e) { return '<li>' + esc(T('w_dup', { n: e.name, i: e.code })) + '</li>'; }).join('') + '</ul></div>';
    }
    if (C && C.months.length) {
      h += '<div class="card"><h3>' + esc(T('months_h')) + '</h3><div class="spd-chips">' + C.months.slice().reverse().map(function (m) { return '<span class="pill ok">' + esc(monthName(m)) + ' <button type="button" class="btn sm" data-spd-un="' + esc(m) + '">' + esc(T('unpub')) + '</button></span>'; }).join('') + '</div><p class="soft">' + esc(T('months_p', { r: C.retention })) + '</p></div>';
    }
    if (pp.ok.length) {
      h += '<div class="card"><h3>' + esc(T('emp_h')) + '</h3><p><button type="button" class="btn sm" data-spd-showpin aria-pressed="' + showPins + '">' + esc(T(showPins ? 'hidepin' : 'showpin')) + '</button>' + (C && Object.keys(C.emps).length ? ' <button type="button" class="btn sm primary" data-spd-print>' + esc(T('print_pins')) + '</button>' : '') + '</p>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + esc(T('pl_eid')) + '</th><th>' + esc(T('name')) + '</th><th>' + esc(T('pl_pin')) + '</th><th></th></tr></thead><tbody>' +
        pp.ok.map(function (p) {
          var r = C && C.emps[p.id], n = Object.keys(p.slips).length;
          return '<tr><td>' + esc(String(p.e.code).trim()) + '</td><td>' + esc(p.e.name) + '</td><td class="spd-pin">' + (r ? (showPins ? esc(r.pin) : '••••••') : '<span class="soft">' + esc(n ? T('notyet') : T('noslip')) + '</span>') + '</td><td class="acts">' +
            (r ? '<button type="button" class="btn sm" data-spd-reset="' + esc(p.id) + '">' + esc(T('reset')) + '</button>' : '') +
            (n ? '<button type="button" class="btn sm" data-spd-pdf="' + esc(p.id) + '">' + esc(T('pdf_btn')) + '</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div><div data-spd-pbox hidden></div></div>';
    }
    if (C) {
      h += '<div class="card"><h3>' + esc(T('set_h')) + '</h3><div class="fg"><div class="f"><label for="spd-ret">' + esc(T('ret')) + '</label><select id="spd-ret">' + [3, 6, 12, 24, 36].map(function (n) { return '<option value="' + n + '"' + (n === C.retention ? ' selected' : '') + '>' + esc(T('ret_n', { n: n })) + '</option>'; }).join('') + '</select></div></div>' +
        '<p class="soft">' + esc(T('ret_p')) + '</p><p><button type="button" class="btn" data-spd-off>' + esc(T(C.off ? 'turn_on' : 'turn_off')) + '</button> <button type="button" class="btn danger" data-spd-del>' + esc(T('destroy')) + '</button></p></div>';
    }
    h += '<p class="soft">' + esc(T('limits')) + '</p></div>';
    return h;
  }
  function say(t) { var e = $('[data-spd-say]', dlg); if (e) e.textContent = t || ''; }
  function draw() {
    dlg.innerHTML = html();
    $('[data-x]', dlg).addEventListener('click', function () { dlg.close(); });
    var q = function (s, fn) { $$(s, dlg).forEach(function (b) { b.addEventListener('click', function () { fn(b); }); }); };
    q('[data-spd-copy]', function () { var i = $('[data-spd-link]', dlg); i.select(); (navigator.clipboard ? navigator.clipboard.writeText(i.value) : Promise.reject()).then(function () { NS.toast(T('copied')); }, function () { document.execCommand('copy'); NS.toast(T('copied')); }); });
    q('[data-spd-pub]', function () {
      var m = $('#spd-m', dlg).value; busy = true; var b = $('[data-spd-pub]', dlg); b.disabled = true;
      var bar = $('[data-spd-prog]', dlg); bar.hidden = false;
      say(T('working'));
      publishMonth(m, function (d, n) { $('i', bar).style.width = Math.round(d / Math.max(1, n) * 100) + '%'; say(T('locking', { d: d, n: n })); }).then(function (r) {
        busy = false; if (!r) return;
        if (!r.ok) { NS.toast(why(r), 'bad'); draw(); return; }
        showPins = true; NS.toast(T('pubdone', { n: r.count || 0 })); draw();
      });
    });
    q('[data-spd-un]', function (b) { var m = b.getAttribute('data-spd-un'); ask(T('unpub_q', { m: monthName(m) })).then(function (y) { if (y) unpublishMonth(m).then(function (r) { NS.toast(r.ok ? T('done') : why(r), r.ok ? '' : 'bad'); draw(); }); }); });
    q('[data-spd-showpin]', function () { showPins = !showPins; draw(); });
    q('[data-spd-print]', function () { printHtml(pinSheet()); });
    q('[data-spd-reset]', function (b) { var id = b.getAttribute('data-spd-reset'); ask(T('reset_q', { n: C.emps[id].name })).then(function (y) { if (y) resetPin(id).then(function (r) { showPins = true; NS.toast(r.ok ? T('reset_done') : why(r), r.ok ? '' : 'bad'); draw(); }); }); });
    q('[data-spd-pdf]', function (b) { var p = people().ok.filter(function (x) { return x.id === b.getAttribute('data-spd-pdf'); })[0]; if (p) pdfFor(p); });
    var ret = $('#spd-ret', dlg);
    if (ret) ret.addEventListener('change', function () {
      var n = +ret.value; C.retention = n;
      post('/admin/retention', { code: C.code, admin: C.admin, months: n }).then(function (r) {
        if (!r.ok) { NS.toast(why(r), 'bad'); return; }
        var cut = cutoff(n), before = C.months.length; C.months = C.months.filter(function (m) { return m >= cut; });
        save().then(function () { return before !== C.months.length ? upload(null) : { ok: true }; }).then(function () { return save(); }).then(function () { NS.toast(T('done')); draw(); });
      });
    });
    q('[data-spd-off]', function () { var off = !C.off; post('/admin/off', { code: C.code, admin: C.admin, off: off }).then(function (r) { if (!r.ok) { NS.toast(why(r), 'bad'); return; } C.off = off; save().then(function () { NS.toast(T(off ? 'now_off' : 'now_on')); draw(); }); }); });
    q('[data-spd-del]', function () { ask(T('destroy_q')).then(function (y) { if (y) post('/admin/destroy', { code: C.code, admin: C.admin }).then(function (r) { if (!r.ok && r.why !== 'denied') { NS.toast(why(r), 'bad'); return; } delete M.by[bkey()]; C = null; NSStore.meta('slipportal', M).then(function () { NS.toast(T('destroyed')); draw(); }); }); }); });
  }
  function open() {
    if (!dlg) {
      dlg = NS.el('dialog', { 'class': 'hub-dlg b2-dlg acx-dlg spd-dlg', 'aria-labelledby': 'spd-t' });
      document.body.appendChild(dlg);
    }
    S.list(A.bizName() || '').then(function (l) { EMPS = l; return load(); }).then(function () { draw(); if (!dlg.open) dlg.showModal(); });
  }
  A.slipPortal = { open: open, people: people, _state: function () { return C; }, _publish: publishMonth, _load: load, _emps: function (l) { EMPS = l; } };
})();

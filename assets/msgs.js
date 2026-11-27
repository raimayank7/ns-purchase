/* NSBiz: Messages (SMS and WhatsApp), App section 'msg' (Utilities). Owner 26 Nov 2026: a bulk SMS / WhatsApp manager like dedicated SMS
   software. The business buys SMS or WhatsApp from any company, enters its API once (ready settings, or the address the company gave it),
   and NSBiz manages and sends: DLT / WhatsApp templates, parties and Excel lists, personalised messages, send now or later, reports,
   a do-not-send list, and automatic messages for new bills and payments. Engine: msgcore.js (NSMsg). App screen: English only.
   Kept in meta 'msgset' { <business id>: { accts, tpls, stop, cap, auto, autoSince, camps } } and 'msglog' { <business id>: [ last 3000 ] }.
   Passwords / keys: in NSBiz for Windows locked with Windows DPAPI (NSDesktopMsg); in a browser only in this device's own storage.
   Free way first (owner 26 Nov: 'how Tally, Busy and others send reminders'): templates sent 'by my own WhatsApp' or 'by my phone's
   SMS' need no company and no account: NSBiz opens WhatsApp / the SMS app with the number and message filled in, one party after
   another, and the user presses Send there (WhatsApp does not allow automatic sending from a normal number). After a new bill or
   payment it asks 'Send it on WhatsApp?', like Busy's 'Send SMS after saving'.
   Bought SMS / WhatsApp API (optional): like ordinary SMS software, from the user's own device straight to the user's own SMS / WhatsApp company: NSBiz for
   Windows (any company), else straight from the browser for companies that allow it. No server of ours in between (owner 26 Nov:
   not a single rupee; Nivesh Sahayak is never in the message chain, so no DLT or reseller registration on our side). Designed & Developed by: Nivesh Sahayak (https://www.niveshsahayak.in/) */
(function () {
  'use strict';
  var A = window.NSApp, M = window.NSMsg, B = window.NSBooks; if (!A || !M || !B) return;
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, key = B.key;
  var ST = { tab: 'send', set: null, log: null, edit: null, prev: null, busy: false, msg: '', list: null, src: 'dues', min: 1, group: '', tpl: '', text: '', when: '', paste: '' };
  var DESK = window.NSDesktopMsg, PROG = !!(window.chrome && window.chrome.webview);
  var CHN = { mywa: 'my own WhatsApp (free)', mysms: 'my phone\'s SMS (free)', sms: 'SMS company', wa: 'WhatsApp company' };
  function chName(ch) { return CHN[ch] || ch; }
  function isOwn(ch) { return !!M.OWN[ch]; }
  function ownAcct(ch) { return { id: 'own-' + ch, name: ch === 'mysms' ? 'your phone\'s SMS' : 'your own WhatsApp', ch: ch, own: 1, mobile: '91' }; }
  function mobileDev() { return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent); }
  function howOpen(ch) {
    if (ch === 'mysms') return /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios' : 'phone';
    if (mobileDev()) return 'phone';
    return (ST.set && ST.set.waOpen) || (PROG ? 'app' : 'web');
  }
  /* open WhatsApp / the SMS app with the message typed in (must run inside a click) */
  function openOwn(ch, to, text) {
    var link = M.ownLink(ch, to, text, howOpen(ch));
    if (PROG || /^https:/.test(link)) window.open(link, /^https:/.test(link) ? 'ns-wa' : '_blank');   /* the program hands non-NSBiz addresses to Windows */
    else location.href = link;   /* whatsapp: / sms: in a browser: the browser passes it to the app and the page stays */
    return link;
  }
  function bizId() { var b = A.biz(); return b && b.id ? b.id : ''; }
  /* a short gap between messages. A hidden page (NSBiz for Windows in the tray) gets its timers stretched to once a minute, so
     there the next message simply waits for the SMS company's answer to the last one (each send already waits for it). */
  function pause(ms) { return new Promise(function (res) { if (document.hidden) res(); else setTimeout(res, ms); }); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function money(v) { return NS.money ? NS.money(v, false) : (+v).toFixed(2); }
  function indian(v) { return (Math.round(+v * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }

  /* ---------- kept settings ---------- */
  function load() {
    if (ST.set) return Promise.resolve();
    return Promise.all([NSStore.meta('msgset'), NSStore.meta('msglog'), NSStore.meta('groups')]).then(function (m) {
      var all = m[0] && typeof m[0] === 'object' ? m[0] : {}, lg = m[1] && typeof m[1] === 'object' ? m[1] : {};
      ST.all = all; ST.logs = lg; ST.groups = m[2] && Array.isArray(m[2].party) ? m[2].party : []; ST.bizFor = bizId();
      ST.set = all[bizId()] || { accts: [], tpls: [], stop: {}, cap: 1000, auto: {}, camps: [] };
      ['accts', 'tpls', 'camps'].forEach(function (k) { if (!Array.isArray(ST.set[k])) ST.set[k] = []; });
      ST.set.stop = ST.set.stop || {}; ST.set.auto = ST.set.auto || {};
      ST.log = Array.isArray(lg[bizId()]) ? lg[bizId()] : [];
    });
  }
  function save() { ST.all[bizId()] = ST.set; return NSStore.meta('msgset', ST.all); }
  function saveLog() { ST.logs[bizId()] = ST.log.slice(-3000); return NSStore.meta('msglog', ST.logs); }

  /* ---------- secrets ---------- */
  function secretSave(id, s) {
    if (DESK) return DESK.ask('secret', { acct: id, s: s });
    try { localStorage.setItem('ns-msg-sec-' + id, JSON.stringify(s)); } catch (e) {}
    return Promise.resolve({ ok: true });
  }
  function secretOf(id) { try { return JSON.parse(localStorage.getItem('ns-msg-sec-' + id) || '{}'); } catch (e) { return {}; } }

  /* ---------- sending one request ---------- */
  function sendReq(acct, req) {
    if (DESK) return DESK.ask('send', { acct: acct.id, req: req });   /* the program fills the locked secrets in */
    var S = secretOf(acct.id), json = /json/i.test(JSON.stringify(req.headers || {}));
    function fillS(s, how) { return String(s || '').replace(/\{(key|user|password)\}/g, function (a, k) { if (S[k] == null || S[k] === '') return a; return how === 'url' ? encodeURIComponent(S[k]) : how === 'json' ? JSON.stringify(String(S[k])).slice(1, -1) : String(S[k]); }); }
    var r = { method: req.method, url: fillS(req.url, 'url'), headers: {}, body: fillS(req.body, json ? 'json' : 'url') };
    Object.keys(req.headers || {}).forEach(function (k) { r.headers[k] = fillS(req.headers[k], 'raw'); });
    if (/\{(key|user|password)\}/.test(r.url + r.body + JSON.stringify(r.headers))) return Promise.resolve({ ok: false, status: 0, text: 'The password or key of this account is not on this device: enter it in Accounts.' });
    return fetch(r.url, { method: r.method, headers: r.headers, body: r.method === 'GET' ? undefined : r.body }).then(function (x) { return x.text().then(function (t) { return { ok: true, status: x.status, text: t }; }); })
      .catch(function () { return { ok: false, status: 0, text: 'This SMS company does not take messages straight from a browser. Use NSBiz for Windows to send.' }; });
  }

  /* ---------- who gets it ---------- */
  function partyPhones() {
    var o = {}; A.data().party.forEach(function (p) { if (p.phone) o[key(p.name)] = p.phone; }); return o;
  }
  function recipients() {
    var src = ST.src, ph = partyPhones(), out = [], biz = A.biz();
    if (src === 'excel') return (ST.list || []).slice();
    var P = B.parties(A.mine(), biz ? biz.name : '');
    if (src === 'dues') Object.keys(P).forEach(function (k) { var p = P[k]; if (p.bal >= (+ST.min || 0.01)) out.push({ name: p.name, mobile: ph[k] || p.phone || '', fields: { due: indian(p.bal) } }); });
    else A.data().party.forEach(function (p) {
      if (p.biz && biz && p.biz !== biz.id) return;
      var role = p.role || 'customer', grp = p.group || '';
      if (src === 'customers' && !(role === 'customer' || role === 'both')) return;
      if (src === 'suppliers' && !(role === 'supplier' || role === 'both')) return;
      if (src === 'group' && grp !== ST.group) return;
      var bal = P[key(p.name)] ? P[key(p.name)].bal : 0;
      out.push({ name: p.name, mobile: p.phone || '', fields: { due: indian(Math.max(0, bal)) } });
    });
    out.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
    return out;
  }
  function ctx() {
    var b = A.biz() || {}; return { business: b.name || '', phone: b.phone || '', upi: b.upi || '', date: NS.fmtDate ? NS.fmtDate(new Date().toISOString().slice(0, 10)) : new Date().toISOString().slice(0, 10), text: ST.text };
  }
  function tplOf(id) { return ST.set.tpls.filter(function (x) { return x.id === id; })[0]; }
  function acctFor(tpl) { if (isOwn(tpl.ch)) return ownAcct(tpl.ch); return ST.set.accts.filter(function (a) { return a.ch === tpl.ch && (!tpl.acct || a.id === tpl.acct); })[0]; }
  function preview() {
    var tpl = tplOf(ST.tpl); if (!tpl) { ST.msg = 'Choose a template.'; return; }
    var acct = acctFor(tpl); if (!acct) { ST.msg = 'Add a ' + (tpl.ch === 'wa' ? 'WhatsApp' : 'SMS') + ' account first (Accounts).'; return; }
    var left = Math.max(0, (+ST.set.cap || 1000) - sentToday());
    ST.prev = M.batch(recipients(), tpl, ctx(), { stop: ST.set.stop, cap: left, style: acct.mobile || '10' });
    ST.prev.tpl = tpl; ST.prev.acct = acct; ST.msg = '';
  }
  function sentToday() { var d = new Date().toISOString().slice(0, 10); return ST.log.filter(function (l) { return l.ok && String(l.at).slice(0, 10) === d; }).length; }

  /* ---------- sending a batch: one at a time, a little apart; the log saved as it goes ---------- */
  function run(P, camp) {
    if (ST.busy) return Promise.resolve(); ST.busy = true;
    var tpl = P.tpl, acct = P.acct, i = 0, ok = 0, bad = 0;
    if (acct.own) {
      ST.busy = false;
      if (tpl.ch === 'mysms' && tpl.kind === 'promo') { ST.msg = 'Offers and greetings cannot go as SMS from your own phone number (TRAI does not allow promotional SMS from ordinary numbers). Send them by your own WhatsApp.'; A.show(); return Promise.resolve(); }
      ST.hand = { P: P, i: 0, n: 0, camp: camp || '' }; ST.tab = 'send'; ST.msg = '';
      if (location.hash.indexOf('#msg') !== 0) location.hash = '#msg'; else A.show();
      return Promise.resolve();
    }
    if (tpl.kind === 'promo' && !M.promoOk()) { ST.busy = false; ST.msg = 'Promotional messages can only go between 10 am and 9 pm. Choose "Send later".'; A.show(); return Promise.resolve(); }
    function step() {
      if (i >= P.msgs.length || ST.stop) { ST.busy = false; ST.stop = false; ST.msg = 'Sent ' + ok + (bad ? ', failed ' + bad + ' (see Reports)' : '') + '.'; return saveLog().then(function () { A.show(); }); }
      var m = P.msgs[i++], req = M.request(acct, tpl, m, {});
      var el = $('.ms-prog'); if (el) el.textContent = 'Sending ' + i + ' of ' + P.msgs.length + '…';
      return sendReq(acct, req).then(function (r) {
        var v = r.ok === false && !r.status ? { ok: false, why: r.text } : M.verdict(acct, r.status, r.text);
        if (v.ok) ok++; else bad++;
        ST.log.push({ at: new Date().toISOString(), ch: tpl.ch, tpl: tpl.name, to: m.m10, name: m.name, text: m.text, vals: m.vals, parts: m.parts, ok: v.ok, why: v.ok ? '' : v.why, ref: v.ref || '', camp: camp || '', doc: m.doc || '' });
        if (!v.ok && /not on this device|does not take messages/.test(v.why)) i = P.msgs.length;   /* the same for every message: stop */
        if (i % 20 === 0) saveLog();
        return pause(350);
      }).then(step);
    }
    A.show();
    return step();
  }

  /* ---------- send later: kept with the business, sent when NSBiz is open at that time ---------- */
  function tick() {
    if (!ST.set || ST.busy) return;
    var now = new Date().toISOString(), due = ST.set.camps.filter(function (c) { return c.state === 'wait' && c.at <= now; })[0];
    if (!due) return;
    var keep = { src: ST.src, min: ST.min, group: ST.group, tpl: ST.tpl, text: ST.text, list: ST.list };
    Object.assign(ST, { src: due.src, min: due.min, group: due.group, tpl: due.tpl, text: due.text, list: due.list || null });
    preview(); var P = ST.prev; Object.assign(ST, keep); ST.prev = null;
    due.state = 'sending'; save();
    if (!P || !P.msgs) { due.state = 'failed'; save(); return; }
    if (P.acct.own) { due.state = 'done'; due.sent = 0; save(); if (NS.toast) NS.toast('Time to send "' + P.tpl.name + '" on your WhatsApp: open Messages.'); run(P, due.id); return; }
    run(P, due.id).then(function () { due.state = 'done'; due.sent = P.msgs.length; save(); });
  }
  setInterval(function () { if (ST.set) tick(); }, 60000);

  /* ---------- automatic messages: a new bill or a payment received (only those saved after the switch was turned on) ---------- */
  function autoCheck() {
    if (!ST.set || ST.busy) return;
    var au = ST.set.auto, since = ST.set.autoSince || '';
    if (!since || (!au.bill && !au.paid)) return;
    /* read the saved bills afresh: the App's own list is only refreshed when it next draws */
    return NSStore.list('doc').then(function (docs) { autoDocs(docs.filter(function (d) { var b = A.biz(); return b && b.id && d.bizId ? d.bizId === b.id : key(d.seller && d.seller.name) === key(A.bizName()); })); });
  }
  function autoDocs(docs) {
    if (!ST.set || ST.busy) return;
    var au = ST.set.auto, since = ST.set.autoSince || '';
    var done = {}; ST.log.forEach(function (l) { if (l.doc) done[l.doc] = 1; });
    var ph = partyPhones(), list = [];
    docs.forEach(function (d) {
      var when = d.created ? new Date(d.created).toISOString() : ''; if (!when || when < since || done[d.id]) return;
      var kind = d.type === 'invoice' ? 'bill' : d.type === 'receipt' && d.kind !== 'ref' ? 'paid' : ''; if (!kind || !au[kind]) return;
      var nm = d.buyer && d.buyer.name; if (!nm) return;
      list.push({ d: d, kind: kind, r: { name: nm, mobile: ph[key(nm)] || (d.buyer && d.buyer.phone) || '', fields: { billno: d.no || '', billamt: indian(d.total || 0), paid: indian(d.amount || d.total || 0), date: NS.fmtDate ? NS.fmtDate(d.date) : d.date } } });
    });
    if (!list.length) return;
    var groups = {}; list.forEach(function (x) { (groups[x.kind] = groups[x.kind] || []).push(x); });
    Object.keys(groups).forEach(function (kind) {
      var tpl = tplOf(au[kind]); if (!tpl) return; var acct = acctFor(tpl); if (!acct) return;
      var P = M.batch(groups[kind].map(function (x) { return x.r; }), tpl, ctx(), { stop: ST.set.stop, style: acct.mobile || '10' });
      P.msgs.forEach(function (m) { var x = groups[kind].filter(function (g) { return M.mobile(g.r.mobile, '10') === m.m10 && g.r.name === m.name; })[0]; m.doc = x && x.d.id; });
      groups[kind].forEach(function (x) { if (!P.msgs.some(function (m) { return m.doc === x.d.id; })) ST.log.push({ at: new Date().toISOString(), ch: tpl.ch, tpl: tpl.name, to: '', name: x.r.name, ok: false, why: 'not sent: ' + ((P.left.filter(function (l) { return l.name === x.r.name; })[0] || {}).why || 'left out'), doc: x.d.id, auto: 1 }); });
      P.tpl = tpl; P.acct = acct;
      if (acct.own) { P.msgs.forEach(function (m) { ASK.push({ m: m, tpl: tpl, kind: kind }); }); showAsk(); return; }
      run(P, 'auto');
    });
  }
  /* own WhatsApp / SMS: after a new bill or payment, ask (like Busy's 'Send SMS after saving'); a click opens WhatsApp */
  var ASK = [];
  function showAsk() {
    var box = document.getElementById('msg-ask');
    var it = ASK[0];
    if (!it) { if (box) box.remove(); return; }
    if (it.m.doc && ST.log.some(function (l) { return l.doc === it.m.doc; })) { ASK.shift(); return showAsk(); }
    if (!box) { box = document.createElement('div'); box.id = 'msg-ask'; box.className = 'msg-ask'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Send on WhatsApp'); document.body.appendChild(box); }
    var wa = it.tpl.ch === 'mywa';
    box.innerHTML = '<p><b>' + (it.kind === 'bill' ? 'New bill' : 'Payment received') + ': send it to ' + esc(it.m.name) + ' on ' + (wa ? 'your WhatsApp' : 'your phone\'s SMS') + '?</b></p><p class="soft">' + esc(it.m.text) + '</p>' +
      '<div class="btns"><button type="button" class="btn primary" data-askgo>' + (wa ? 'Send on WhatsApp' : 'Send by SMS') + '</button> <button type="button" class="btn" data-asknot>Not now</button>' + (ASK.length > 1 ? ' <span class="soft">' + (ASK.length - 1) + ' more</span>' : '') + '</div>';
    box.onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var go = b.hasAttribute('data-askgo'); if (!go && !b.hasAttribute('data-asknot')) return;
      if (go) openOwn(it.tpl.ch, it.m.to, it.m.text);
      ST.log.push({ at: new Date().toISOString(), ch: it.tpl.ch, tpl: it.tpl.name, to: it.m.m10, name: it.m.name, text: it.m.text, vals: it.m.vals, parts: it.m.parts, ok: go, why: go ? '' : 'you chose Not now', ref: go ? (wa ? 'opened in WhatsApp' : 'opened in the SMS app') : '', own: 1, auto: 1, doc: it.m.doc || '' });
      ASK.shift(); saveLog(); showAsk();
    };
  }
  document.addEventListener('ns-saved', function () { setTimeout(function () { if (ST.set) autoCheck(); }, 1500); });

  /* ---------- reading an Excel / CSV contact list ---------- */
  function readList(f) {
    return NS.loadJs('/assets/vendor/xlsx-0.20.3.full.min.js', '').then(function () { return f.arrayBuffer(); }).then(function (buf) {
      var X = window.XLSX, csv = /\.(csv|txt)$/i.test(f.name), wb = csv ? X.read(new TextDecoder().decode(buf), { type: 'string', raw: true }) : X.read(buf, { type: 'array' });
      var rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
      var hr = 0; while (hr < Math.min(rows.length, 10) && !rows[hr].some(function (c) { return /mobile|phone|number|contact/i.test(c); })) hr++;
      if (hr >= rows.length) hr = 0;
      var H = (rows[hr] || []).map(function (h) { return String(h).trim(); }), mi = H.findIndex(function (h) { return /mobile|phone|number|contact/i.test(h); }), ni = H.findIndex(function (h) { return /name/i.test(h); });
      if (mi < 0) throw new Error('No column called Mobile (or Phone) was found in the first sheet.');
      return rows.slice(hr + 1).filter(function (r) { return r.some(function (c) { return String(c).trim(); }); }).map(function (r) {
        var f2 = {}; H.forEach(function (h, i) { if (h) f2[key(h).replace(/[^a-z0-9]+/g, '')] = String(r[i] == null ? '' : r[i]).trim(); });
        return { name: ni >= 0 ? String(r[ni]).trim() : '', mobile: String(r[mi]).trim(), fields: f2 };
      });
    });
  }

  /* ---------- screen ---------- */
  var TABS = [['send', 'Send'], ['tpl', 'Templates'], ['acct', 'Accounts'], ['log', 'Reports'], ['stop', 'Do-not-send list'], ['auto', 'Automatic']];
  function html() {
    if (ST.set && ST.bizFor !== bizId()) { ST.set = null; ST.prev = null; ST.edit = null; }   /* another business shown: its own settings */
    if (!ST.set) { load().then(function () { A.show(); }); return '<p class="soft">Loading…</p>'; }
    var h = '<div class="pane-hd"><h2>' + esc(A.T('msg')) + '</h2></div>';
    h += '<p class="hint">Send payment reminders, bill and payment messages, offers and greetings to your parties by WhatsApp or SMS. Free from your own WhatsApp number (NSBiz types each message; you press Send), like Tally, Busy and Vyapar reminders; or through an SMS or WhatsApp company you buy from, to send many at once. Your messages and contacts stay with you.</p>';
    h += '<div class="tabs ms-tabs">' + TABS.map(function (t) { return '<button type="button" class="tab' + (ST.tab === t[0] ? ' on' : '') + '" data-mstab="' + t[0] + '">' + esc(t[1]) + '</button>'; }).join('') + '</div>';
    if (ST.msg) h += '<p class="sb-note ms-prog">' + esc(ST.msg) + '</p>'; else if (ST.busy) h += '<p class="sb-note ms-prog">Sending…</p>';
    h += ({ send: sendHtml, tpl: tplHtml, acct: acctHtml, log: logHtml, stop: stopHtml, auto: autoHtml })[ST.tab]();
    return h;
  }
  function sel(attr, opts, cur) { return '<select ' + attr + '>' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(cur) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
  function handHtml() {
    var H = ST.hand, P = H.P, m = P.msgs[H.i], wa = P.tpl.ch === 'mywa';
    if (!m) return '';
    return '<div class="card msg-hand"><h3>Sending through ' + esc(P.acct.name) + ': ' + (H.i + 1) + ' of ' + P.msgs.length + '</h3>' +
      '<p><b>' + esc(m.name) + '</b> <span class="soft">' + esc(m.m10) + '</span></p><p class="msg-text">' + esc(m.text) + '</p>' +
      '<div class="btns"><button type="button" class="btn primary" data-msdo="handopen" autofocus>' + (wa ? 'Open in WhatsApp' : 'Open in the SMS app') + '</button> <button type="button" class="btn" data-msdo="handskip">Skip this one</button> <button type="button" class="btn" data-msdo="handstop">Stop</button></div>' +
      '<p class="soft">' + (wa ? 'WhatsApp' : 'Your SMS app') + ' opens with the message typed in. Press Send there, then come back and press the button again for the next party. ' + (wa ? 'NSBiz cannot press Send for you: WhatsApp does not allow automatic sending from a normal number, and many messages to people who do not know you can get the number blocked.' : 'Your phone plan\'s SMS rates apply.') + '</p>' +
      (wa && !mobileDev() ? '<p><label>Open WhatsApp in ' + sel('data-ms="waOpen"', [['app', 'the WhatsApp app on this computer'], ['web', 'WhatsApp Web (browser)']], howOpen('mywa')) + '</label></p>' : '') +
      (!wa && !mobileDev() ? '<p class="soft">SMS from your own SIM works on a phone. On a Windows computer it works only when Phone Link is set up with your phone.</p>' : '') + '</div>';
  }
  function sendHtml() {
    var S = ST.set;
    if (ST.hand) return handHtml();
    if (!S.tpls.length) return '<div class="card"><h3>Before the first message</h3><p>Add a message in <b>Templates</b>: ready wordings in English, Hindi and Punjabi are there. Choose <b>my own WhatsApp</b> and it goes free from your own WhatsApp number, like reminders from Busy or Vyapar: no company, no account, no cost.</p><p class="soft">To send hundreds without pressing Send for each one, buy SMS or WhatsApp from any company and add it in <b>Accounts</b> (optional).</p><div class="btns"><button type="button" class="btn primary" data-mstab="tpl">Templates</button></div></div>';
    var groups = ST.groups || [];
    var h = '<div class="card"><h3>1. The message</h3><p>' + sel('data-ms="tpl"', [['', 'Choose a template']].concat(S.tpls.map(function (t) { return [t.id, t.name + ' (' + chName(t.ch) + ', ' + (t.kind === 'promo' ? 'promotional' : 'service') + ', ' + ({ en: 'English', hi: 'Hindi', pa: 'Punjabi' }[t.lang] || t.lang) + ')']; })), ST.tpl) + '</p>';
    var tpl = tplOf(ST.tpl);
    if (tpl && tpl.vars.indexOf('text') >= 0) h += '<p><label>Text for the message <input data-ms="text" value="' + esc(ST.text) + '" maxlength="30" placeholder="up to 30 letters, e.g. Happy Diwali"></label></p>';
    if (tpl) h += '<p class="soft ms-tpltext">' + esc(tpl.text) + '</p>';
    h += '<h3>2. Who gets it</h3><p>' + sel('data-ms="src"', [['dues', 'Parties with dues'], ['customers', 'All customers'], ['suppliers', 'All suppliers'], ['group', 'A party group'], ['excel', 'A list from Excel or CSV']], ST.src) +
      (ST.src === 'dues' ? ' <label>owing at least Rs <input type="number" data-ms="min" value="' + esc(ST.min) + '" min="0" style="width:8em"></label>' : '') +
      (ST.src === 'group' ? ' ' + sel('data-ms="group"', [['', 'Choose']].concat(groups.map(function (g) { return [g.id, g.name]; })), ST.group) : '') +
      (ST.src === 'excel' ? ' <label class="btn" for="ms-xl">Choose the list</label><input type="file" id="ms-xl" class="sr" accept=".xlsx,.xls,.csv">' + (ST.list ? ' <span class="soft">' + ST.list.length + ' rows (columns become fields: name, mobile and any other)</span>' : '') : '') + '</p>' +
      '<div class="btns"><button type="button" class="btn primary" data-msdo="preview">Preview</button></div></div>';
    if (ST.prev) {
      var P = ST.prev;
      h += '<div class="card"><h3>3. Check and send</h3><p><b>' + P.msgs.length + '</b> message' + (P.msgs.length === 1 ? '' : 's') + ', ' + (P.acct.own ? 'one by one through ' + esc(P.acct.name) + ': you press Send in ' + (P.tpl.ch === 'mywa' ? 'WhatsApp' : 'the SMS app') + ' for each, free.' : '<b>' + P.totalParts + '</b> ' + (P.tpl.ch === 'wa' ? 'WhatsApp messages' : 'SMS credits') + ' through ' + esc(P.acct.name) + '.') + (P.left.length ? ' ' + P.left.length + ' left out (below).' : '') + '</p>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">Party</th><th class="l">Mobile</th><th class="l">Message</th>' + (P.acct.own ? '' : '<th class="n">SMS</th>') + '</tr></thead><tbody>' +
        P.msgs.slice(0, 200).map(function (m) { return '<tr><td class="l">' + esc(m.name) + '</td><td class="l">' + esc(m.m10) + '</td><td class="l">' + esc(m.text) + '</td>' + (P.acct.own ? '' : '<td class="n">' + m.parts + '</td>') + '</tr>'; }).join('') + '</tbody></table></div>' +
        (P.msgs.length > 200 ? '<p class="soft">…and ' + (P.msgs.length - 200) + ' more.</p>' : '') +
        (P.left.length ? '<details><summary>' + P.left.length + ' left out</summary><ul>' + P.left.slice(0, 300).map(function (l) { return '<li>' + esc((l.name || '?') + ' ' + (l.mobile || '') + ': ' + l.why) + '</li>'; }).join('') + '</ul></details>' : '') +
        '<div class="btns"><button type="button" class="btn" data-msdo="test">Send a test to me first</button> <button type="button" class="btn primary" data-msdo="send"' + (ST.busy || !P.msgs.length ? ' disabled' : '') + '>' + (P.acct.own ? 'Start sending' : 'Send now') + '</button>' +
        ' <label>or later: <input type="datetime-local" data-ms="when" value="' + esc(ST.when) + '"></label> <button type="button" class="btn" data-msdo="later">Send later</button>' + (ST.busy ? ' <button type="button" class="btn" data-msdo="halt">Stop</button>' : '') + '</div>' +
        '<p class="soft">Later: sent when NSBiz is open at that time (NSBiz for Windows keeps running in the tray).</p></div>';
    }
    var w = ST.set.camps.filter(function (c) { return c.state === 'wait'; });
    if (w.length) h += '<div class="card"><h3>Waiting to be sent</h3><ul>' + w.map(function (c) { return '<li>' + esc(new Date(c.at).toLocaleString()) + ': ' + esc((tplOf(c.tpl) || {}).name || '?') + ' <button type="button" class="btn sm" data-mscancel="' + c.id + '">Cancel</button></li>'; }).join('') + '</ul></div>';
    return h;
  }
  function tplHtml() {
    var S = ST.set, E = ST.edit && ST.edit.k === 'tpl' ? ST.edit.v : null;
    var h = '<div class="card"><h3>Your templates</h3>' + (S.tpls.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">Name</th><th class="l">Kind</th><th class="l">Template</th><th></th></tr></thead><tbody>' + S.tpls.map(function (t) {
      return '<tr><td class="l">' + esc(t.name) + '</td><td class="l">' + esc(chName(t.ch)) + ', ' + (t.kind === 'promo' ? 'promotional' : 'service') + ', ' + esc(t.lang) + (isOwn(t.ch) ? '' : '<br><span class="soft">ID ' + esc(t.tid || '-') + '</span>') + '</td><td class="l">' + esc(t.text) + '</td><td><button type="button" class="btn sm" data-msedit="' + t.id + '">Change</button> <button type="button" class="btn sm" data-msdel="' + t.id + '">Delete</button></td></tr>';
    }).join('') + '</tbody></table></div>' : '<p class="soft">None yet.</p>') + '<div class="btns"><button type="button" class="btn primary" data-msnew="tpl">Add a template</button></div></div>';
    h += '<div class="card"><h3>Ready wordings to get approved</h3><p class="soft">Ask your SMS company to register these on DLT (or on WhatsApp) exactly as written, then add each with the Template ID they give you. {#var#} is a place NSBiz fills (party name, amount and so on; up to 30 letters each).</p>' +
      M.SUGGEST.map(function (s) { return '<div class="ms-sug"><b>' + esc(s.name) + '</b> <span class="soft">(' + (s.kind === 'promo' ? 'promotional' : 'service') + ')</span>' + ['en', 'hi', 'pa'].map(function (l) { return '<p><span class="soft">' + { en: 'English', hi: 'Hindi', pa: 'Punjabi' }[l] + ':</span> ' + esc(s[l]) + ' <button type="button" class="btn sm" data-msuse="' + s.id + '|' + l + '">Use</button></p>'; }).join('') + '</div>'; }).join('') + '</div>';
    if (E) {
      var n = M.slots(E.text);
      h += '<div class="card ms-edit"><h3>' + (E.id ? 'Change the template' : 'New template') + '</h3><div class="mg-dbf">' +
        '<label>Name <input data-te="name" value="' + esc(E.name) + '"></label>' +
        '<label>Sent by ' + sel('data-te="ch"', [['mywa', 'My own WhatsApp (free)'], ['mysms', 'My phone\'s SMS (free, from a phone)'], ['sms', 'An SMS company (DLT)'], ['wa', 'A WhatsApp company (API)']], E.ch) + '</label>' +
        '<label>Kind ' + sel('data-te="kind"', [['service', 'Service (dues, bills, receipts)'], ['promo', 'Promotional (offers, greetings)']], E.kind) + '</label>' +
        '<label>Language ' + sel('data-te="lang"', [['en', 'English'], ['hi', 'Hindi'], ['pa', 'Punjabi']], E.lang) + '</label>' +
        (isOwn(E.ch) ? '' : '<label>' + (E.ch === 'wa' ? 'WhatsApp template name' : 'DLT Template ID') + ' <input data-te="tid" value="' + esc(E.tid) + '"></label>') + '</div>' +
        '<p><label>' + (isOwn(E.ch) ? 'Your message (places as {#var#}; change the words as you like)' : 'Exact approved text (' + (E.ch === 'wa' ? 'places as {{1}}, {{2}}' : 'places as {#var#}') + ')') + '<textarea data-te="text" rows="3" style="width:100%">' + esc(E.text) + '</textarea></label></p>' +
        (n ? '<p>What goes in each place:</p><ol>' + Array.apply(null, { length: n }).map(function (x, i) { return '<li>' + sel('data-tv="' + i + '"', [['', 'Choose']].concat(M.FIELDS), (E.vars || [])[i] || '') + '</li>'; }).join('') + '</ol>' : '<p class="soft">This template has no places to fill.</p>') +
        '<div class="btns"><button type="button" class="btn primary" data-msok="tpl">Save the template</button> <button type="button" class="btn" data-msx>Cancel</button></div></div>';
    }
    return h;
  }
  function acctHtml() {
    var S = ST.set, E = ST.edit && ST.edit.k === 'acct' ? ST.edit.v : null;
    var h = '<div class="card"><h3>Your SMS and WhatsApp accounts</h3>' + (S.accts.length ? '<ul>' + S.accts.map(function (a) { return '<li><b>' + esc(a.name) + '</b> (' + (a.ch === 'wa' ? 'WhatsApp' : 'SMS') + (a.sender ? ', sender ' + esc(a.sender) : '') + ') <button type="button" class="btn sm" data-msacc="' + a.id + '">Change</button> <button type="button" class="btn sm" data-msadel="' + a.id + '">Delete</button></li>'; }).join('') + '</ul>' : '<p class="soft">None, and none is needed: templates sent by <b>my own WhatsApp</b> or <b>my phone\'s SMS</b> go free from your own number. Add an account only if you buy SMS or WhatsApp from a company, to send many without pressing Send for each.</p>') +
      '<div class="btns"><button type="button" class="btn primary" data-msnew="acct">Add an account</button></div>' +
      '<p class="soft">NSBiz is free. With a company account it sends straight from your device to that company, like any SMS software: you pay only that company, and your DLT registration (sender ID and templates) is with them under your own business.</p>' +
      (DESK ? '<p class="soft">Passwords and keys are kept locked on this computer (Windows protection).</p>' : '<p class="soft">In a browser, passwords and keys are kept only on this device. Many SMS companies do not take messages straight from a browser: NSBiz for Windows sends through any company.</p>') + '</div>';
    if (E) {
      var pre = M.PRESETS.filter(function (p) { return p.id === E.preset; })[0];
      h += '<div class="card ms-edit"><h3>' + (E.id ? 'Change the account' : 'New account') + '</h3><p>' + sel('data-ae="preset"', [['', 'Choose your company']].concat(M.PRESETS.map(function (p) { return [p.id, p.name]; })).concat([['paste', 'Another company: paste the address it gave me']]), E.preset) + '</p>';
      if (E.preset === 'paste') h += '<p><label>The address your SMS company gave you for sending (with your own details and a sample number and message in it)<textarea data-ae="paste" rows="3" style="width:100%" placeholder="http://sms.example.in/api/sendhttp.php?user=...&password=...&sender=...&mobile=...&message=...">' + esc(ST.paste) + '</textarea></label></p><div class="btns"><button type="button" class="btn" data-msdo="parse">Read the address</button></div>';
      if (pre && pre.note) h += '<p class="soft">' + esc(pre.note) + '</p>';
      if (E.url) {
        h += '<div class="mg-dbf"><label>Name <input data-ae="name" value="' + esc(E.name) + '"></label>' +
          (E.ch !== 'wa' ? '<label>Sender ID (service) <input data-ae="sender" value="' + esc(E.sender || '') + '" maxlength="11"></label><label>Sender ID (promotional) <input data-ae="senderPromo" value="' + esc(E.senderPromo || '') + '" maxlength="11"></label><label>DLT Entity ID <input data-ae="entity" value="' + esc(E.entity || '') + '"></label>' :
            '<label>Phone number ID <input data-ae="phoneid" value="' + esc(E.phoneid || '') + '"></label>') +
          (/\{key\}/.test(E.url + JSON.stringify(E.headers || {}) + (E.body || '')) ? '<label>API key / token <input type="password" data-sec="key" autocomplete="new-password" placeholder="' + (E.hasSecret ? 'kept (leave empty)' : '') + '"></label>' : '') +
          (/\{user\}/.test(E.url) ? '<label>User name <input data-sec="user" autocomplete="off" placeholder="' + (E.hasSecret ? 'kept (leave empty)' : '') + '"></label>' : '') +
          (/\{password\}/.test(E.url) ? '<label>Password <input type="password" data-sec="password" autocomplete="new-password" placeholder="' + (E.hasSecret ? 'kept (leave empty)' : '') + '"></label>' : '') +
          '<label>Numbers sent as ' + sel('data-ae="mobile"', [['10', '9876543210'], ['91', '919876543210'], ['+91', '+919876543210']], E.mobile || '10') + '</label>' +
          '<label>A good reply contains <input data-ae="ok" value="' + esc(E.ok || '') + '" placeholder="(any reply without error words)"></label></div>' +
          '<details><summary>Advanced: the address NSBiz uses</summary><p><code>' + esc(E.method + ' ' + E.url) + '</code></p>' + (E.body ? '<p><code>' + esc(E.body) + '</code></p>' : '') + '</details>' +
          '<div class="btns"><button type="button" class="btn primary" data-msok="acct">Save the account</button> <button type="button" class="btn" data-msx>Cancel</button></div>';
      }
      h += '</div>';
    }
    if (S.accts.length) h += '<div class="card"><h3>Test</h3><p><label>My mobile <input data-ms="me" value="' + esc(S.me || '') + '" placeholder="98xxxxxxxx"></label> ' + sel('data-ms="testtpl"', [['', 'with template…']].concat(S.tpls.map(function (t) { return [t.id, t.name]; })), ST.testTpl || '') + ' <button type="button" class="btn" data-msdo="test">Send a test to me</button></p></div>';
    return h;
  }
  function logHtml() {
    var L = ST.log.slice().reverse(), ok = L.filter(function (l) { return l.ok; }).length;
    return '<div class="card"><h3>Sent messages</h3><p>' + L.length + ' in the log: ' + ok + ' sent, ' + (L.length - ok) + ' failed. Today: ' + sentToday() + ' of your limit of ' + (ST.set.cap || 1000) + '.</p>' +
      '<div class="btns"><button type="button" class="btn" data-msdo="xl">Export to Excel</button> <button type="button" class="btn" data-msdo="resend">Send the failed ones again</button></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">When</th><th class="l">Party</th><th class="l">Mobile</th><th class="l">Template</th><th class="l">Result</th></tr></thead><tbody>' +
      L.slice(0, 300).map(function (l) { return '<tr><td class="l">' + esc(new Date(l.at).toLocaleString()) + '</td><td class="l">' + esc(l.name) + '</td><td class="l">' + esc(l.to) + '</td><td class="l">' + esc(l.tpl) + (l.auto ? ' <span class="soft">(automatic)</span>' : '') + '</td><td class="l">' + (l.ok ? '<span class="ok">' + (l.own ? esc(l.ref || 'opened') : 'sent') + '</span>' : '<span class="bad">' + (l.own ? 'not sent' : 'failed') + '</span> ' + esc(l.why)) + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
  }
  function stopHtml() {
    var k = Object.keys(ST.set.stop);
    return '<div class="card"><h3>Never send to these numbers</h3><p class="soft">Numbers that asked to stop (a STOP reply, a call) or that you do not want to message. They are left out of every message.</p>' +
      '<p><label>Add numbers (one per line or with commas)<textarea data-ms="stopadd" rows="3" style="width:100%"></textarea></label></p><div class="btns"><button type="button" class="btn primary" data-msdo="stopadd">Add</button></div>' +
      (k.length ? '<ul>' + k.sort().map(function (m) { return '<li>' + esc(m) + ' <button type="button" class="btn sm" data-msunstop="' + m + '">Remove</button></li>'; }).join('') + '</ul>' : '<p class="soft">The list is empty.</p>') +
      '<h3>Daily limit</h3><p><label>At most <input type="number" data-ms="cap" value="' + esc(ST.set.cap || 1000) + '" min="1" style="width:8em"> messages a day</label> <button type="button" class="btn" data-msdo="cap">Save</button></p></div>';
  }
  function autoHtml() {
    var au = ST.set.auto, opts = [['', 'Off']].concat(ST.set.tpls.filter(function (t) { return t.kind !== 'promo'; }).map(function (t) { return [t.id, t.name]; }));
    return '<div class="card"><h3>Automatic messages</h3><p class="soft">When a sale bill is saved, or money is received, NSBiz sends the party the template you choose here (only for entries saved after you switch it on, and only while NSBiz is open). With a template sent by your own WhatsApp or phone, NSBiz asks "Send it on WhatsApp?" right after saving, and one click opens WhatsApp with the message typed in.</p>' +
      '<p><label>New sale bill ' + sel('data-ms="autobill"', opts, au.bill || '') + '</label></p><p><label>Money received ' + sel('data-ms="autopaid"', opts, au.paid || '') + '</label></p>' +
      '<div class="btns"><button type="button" class="btn primary" data-msdo="auto">Save</button></div>' + (ST.set.autoSince ? '<p class="soft">On since ' + esc(new Date(ST.set.autoSince).toLocaleString()) + '.</p>' : '') + '</div>';
  }

  function blankTpl() { return { id: '', name: '', ch: 'mywa', kind: 'service', lang: 'en', tid: '', text: '', vars: [] }; }
  function readTplForm(pane) {
    if (!ST.edit) return {};
    var E = ST.edit.v; $$('[data-te]', pane).forEach(function (x) { E[x.getAttribute('data-te')] = x.value; });
    E.vars = []; $$('[data-tv]', pane).forEach(function (x) { E.vars[+x.getAttribute('data-tv')] = x.value; });
    return E;
  }
  function readAcctForm(pane) { if (!ST.edit) return {}; var E = ST.edit.v; $$('[data-ae]', pane).forEach(function (x) { if (x.getAttribute('data-ae') !== 'preset' && x.getAttribute('data-ae') !== 'paste') E[x.getAttribute('data-ae')] = x.value.trim(); }); return E; }
  function act(op, pane) {
    var S = ST.set;
    if (op === 'preview') { preview(); A.show(); }
    if (op === 'send' && ST.prev) { var P = ST.prev; ST.prev = null; run(P); }
    if (op === 'halt') ST.stop = true;
    if (/^hand/.test(op) && ST.hand) {
      var H = ST.hand, hm = H.P.msgs[H.i], ht = H.P.tpl;
      if (op === 'handstop') { ST.hand = null; ST.msg = 'Stopped: ' + H.n + ' opened.'; return saveLog().then(function () { A.show(); }); }
      if (op === 'handopen') { openOwn(ht.ch, hm.to, hm.text); H.n++; }
      ST.log.push({ at: new Date().toISOString(), ch: ht.ch, tpl: ht.name, to: hm.m10, name: hm.name, text: hm.text, vals: hm.vals, parts: hm.parts, ok: op === 'handopen', why: op === 'handopen' ? '' : 'skipped', ref: op === 'handopen' ? (ht.ch === 'mywa' ? 'opened in WhatsApp' : 'opened in the SMS app') : '', own: 1, camp: H.camp, doc: hm.doc || '' });
      H.i++;
      if (H.i >= H.P.msgs.length) { ST.hand = null; ST.msg = 'Done: ' + H.n + ' opened in ' + (ht.ch === 'mywa' ? 'WhatsApp' : 'the SMS app') + '. Check that each one was sent there.'; }
      return saveLog().then(function () { A.show(); var f = $('[data-msdo=handopen]'); if (f) f.focus(); });
    }
    if (op === 'later' && ST.prev) {
      if (!ST.when) { ST.msg = 'Choose the date and time.'; A.show(); return; }
      var at = new Date(ST.when).toISOString();
      if (tplOf(ST.tpl).kind === 'promo' && !M.promoOk(at)) { ST.msg = 'Promotional messages can only go between 10 am and 9 pm.'; A.show(); return; }
      S.camps.push({ id: uid(), at: at, state: 'wait', tpl: ST.tpl, src: ST.src, min: ST.min, group: ST.group, text: ST.text, list: ST.src === 'excel' ? ST.list : null });
      ST.prev = null; save().then(function () { ST.msg = 'It will be sent on ' + new Date(at).toLocaleString() + ' (if NSBiz is open then).'; A.show(); });
    }
    if (op === 'test') {
      var me = M.mobile(S.me || ($('[data-ms=me]', pane) || {}).value || '', '10'), t0 = tplOf(ST.tab === 'acct' ? ST.testTpl : ST.tpl) || S.tpls[0];
      if (!me) { ST.msg = 'Type your own mobile number (Accounts › Test) first.'; ST.tab = 'acct'; A.show(); return; }
      if (!t0) { ST.msg = 'Add a template first.'; A.show(); return; }
      var ac = acctFor(t0); if (!ac) { ST.msg = 'No account for this template.'; A.show(); return; }
      var vals = {}; M.FIELDS.forEach(function (f) { vals[f[0]] = { name: 'Test', due: '100', billno: 'TEST/1', billamt: '100', paid: '100', duedate: ctx().date, link: '-', text: 'Test' }[f[0]] || ''; });
      var Pt = M.batch([{ name: (A.biz() || {}).name || 'Test', mobile: me, fields: vals }], t0, ctx(), { style: ac.mobile || '10' });
      if (!Pt.msgs.length) { ST.msg = 'The test could not be made: ' + (Pt.left[0] || {}).why; A.show(); return; }
      Pt.tpl = t0; Pt.acct = ac; run(Pt, 'test');
    }
    if (op === 'parse') {
      var p = M.parseUrl(ST.paste = ($('[data-ae=paste]', pane) || {}).value || '');
      if (!p) { ST.msg = 'That is not a web address (it should start with http).'; A.show(); return; }
      if (p.missing.length) { ST.msg = 'The address has no part for the ' + p.missing.join(' and the ') + '. Paste the full address with a sample number and message in it.'; A.show(); return; }
      Object.assign(ST.edit.v, { ch: 'sms', method: p.method, url: p.url, mobile: p.mobile, ok: p.ok, bad: p.bad, sender: p.values.sender || '', entity: p.values.entity || '', name: ST.edit.v.name || p.url.replace(/^https?:\/\/([^\/]+).*$/, '$1'), _sec: { key: p.values.key, user: p.values.user, password: p.values.password } });
      ST.msg = 'Found: ' + Object.keys(p.found).map(function (r) { return r + ' (' + p.found[r] + ')'; }).join(', ') + '. Check, then Save.'; A.show();
    }
    if (op === 'stopadd') { String(($('[data-ms=stopadd]', pane) || {}).value || '').split(/[\n,;]+/).forEach(function (x) { var m = M.mobile(x, '10'); if (m) S.stop[m] = 1; }); save().then(function () { A.show(); }); }
    if (op === 'cap') { S.cap = Math.max(1, +($('[data-ms=cap]', pane) || {}).value || 1000); save().then(function () { ST.msg = 'Saved.'; A.show(); }); }
    if (op === 'auto') {
      var b0 = ($('[data-ms=autobill]', pane) || {}).value, p0 = ($('[data-ms=autopaid]', pane) || {}).value, was = S.auto.bill || S.auto.paid;
      S.auto = { bill: b0, paid: p0 }; if ((b0 || p0) && !was) S.autoSince = new Date().toISOString(); if (!b0 && !p0) S.autoSince = '';
      save().then(function () { ST.msg = 'Saved.'; A.show(); });
    }
    if (op === 'xl' && typeof NS.xlsx === 'function') NS.xlsx('NSBiz messages.xlsx', [{ name: 'Messages', rows: [['When', 'Party', 'Mobile', 'Template', 'Message', 'SMS', 'Result', 'Reason']].concat(ST.log.map(function (l) { return [l.at.replace('T', ' ').slice(0, 19), l.name, l.to, l.tpl, l.text || '', l.parts || '', l.ok ? (l.own ? l.ref || 'opened' : 'sent') : (l.own ? 'not sent' : 'failed'), l.why || '']; })) }]);
    if (op === 'resend') {
      var fail = ST.log.filter(function (l) { return !l.ok && l.to && l.text; }); if (!fail.length) { ST.msg = 'Nothing failed.'; A.show(); return; }
      var byT = {}; fail.forEach(function (l) { (byT[l.tpl] = byT[l.tpl] || []).push(l); });
      Object.keys(byT).forEach(function (tn) {
        var t1 = S.tpls.filter(function (x) { return x.name === tn; })[0]; if (!t1) return; var a1 = acctFor(t1); if (!a1) return;
        var msgs = byT[tn].map(function (l) { return { to: M.mobile(l.to, a1.mobile || '10'), m10: l.to, name: l.name, text: l.text, vals: l.vals || [], parts: l.parts || 1 }; });
        ST.log = ST.log.filter(function (l) { return byT[tn].indexOf(l) < 0; });
        run({ msgs: msgs, tpl: t1, acct: a1 }, 'resend');
      });
    }
  }
  /* its link in the App's menu (Utilities), like bankimp.js: the side menu only lists screens that have one (help-update, 27 Nov 2026) */
  (function () {
    function link() { var nav = $('.hub-nav'), app = $('#app'); if (!nav || !app || app.getAttribute('data-secs') || $('[data-sec="msg"]', nav)) return;
      nav.appendChild(NS.el('a', { href: '#msg', 'data-sec': 'msg' }, '<span>' + esc(A.T('msg')) + '</span>')); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', link); else link();
  })();
  A.addSection('msg', html, function (pane) {
    var fx = $('#ms-xl', pane); if (fx) fx.addEventListener('change', function () {
      var f = fx.files[0]; fx.value = ''; if (!f) return;
      readList(f).then(function (L) { ST.list = L; ST.prev = null; ST.msg = ''; A.show(); }, function (e) { ST.msg = e.message; A.show(); });
    });
    /* the App keeps the same panel and calls this after every drawing: listen on it once, or every click would run many times over */
    if (pane.__msWired) return; pane.__msWired = 1;
    pane.addEventListener('change', function (e) {
      var s = e.target, k = s.getAttribute('data-ms');
      if (k) {
        if (k === 'me') { ST.set.me = s.value.trim(); save(); return; }
        if (k === 'testtpl') { ST.testTpl = s.value; return; }
        if (k === 'waOpen') { ST.set.waOpen = s.value; save(); return; }
        if (k === 'stopadd' || k === 'cap' || /^auto/.test(k)) return;
        ST[k] = s.value; if (k !== 'when') ST.prev = null; if (k === 'src' || k === 'tpl') A.show(); return;
      }
      if (s.getAttribute('data-ae') === 'preset') {
        var v = s.value, pre = M.PRESETS.filter(function (p) { return p.id === v; })[0], E = ST.edit.v;
        if (pre) Object.assign(E, { preset: v, ch: pre.ch, method: pre.method, url: pre.url, headers: pre.headers || {}, body: pre.body || '', mobile: pre.mobile, ok: pre.ok, bad: pre.bad, name: E.name || pre.name });
        else { E.preset = v; E.url = ''; }
        A.show(); return;
      }
      if (s.getAttribute('data-te') === 'text' || s.getAttribute('data-te') === 'ch') { readTplForm(pane); A.show(); }
    });
    pane.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return; var v;
      if ((v = b.getAttribute('data-mstab'))) { ST.tab = v; ST.edit = null; ST.msg = ''; A.show(); return; }
      if ((v = b.getAttribute('data-msdo'))) { act(v, pane); return; }
      if ((v = b.getAttribute('data-msnew'))) { ST.edit = { k: v, v: v === 'tpl' ? blankTpl() : { id: '', preset: '', ch: 'sms', url: '' } }; ST.msg = ''; A.show(); return; }
      if ((v = b.getAttribute('data-msedit'))) { ST.edit = { k: 'tpl', v: JSON.parse(JSON.stringify(tplOf(v))) }; A.show(); return; }
      if ((v = b.getAttribute('data-msacc'))) { ST.edit = { k: 'acct', v: JSON.parse(JSON.stringify(ST.set.accts.filter(function (a) { return a.id === v; })[0])) }; A.show(); return; }
      if ((v = b.getAttribute('data-msuse'))) {
        var p = v.split('|'), sg = M.SUGGEST.filter(function (x) { return x.id === p[0]; })[0];
        ST.edit = { k: 'tpl', v: Object.assign(blankTpl(), { name: sg.name + ' (' + { en: 'English', hi: 'Hindi', pa: 'Punjabi' }[p[1]] + ')', kind: sg.kind, lang: p[1], text: sg[p[1]], vars: (p[1] === 'en' ? sg.vars : sg[p[1] + 'Vars']).slice() }) }; A.show(); return;
      }
      if ((v = b.getAttribute('data-msdel'))) { (NS.ask ? NS.ask('Delete this template?') : Promise.resolve(confirm('Delete this template?'))).then(function (y) { if (!y) return; ST.set.tpls = ST.set.tpls.filter(function (t) { return t.id !== v; }); save().then(function () { A.show(); }); }); return; }
      if ((v = b.getAttribute('data-msadel'))) { (NS.ask ? NS.ask('Delete this account? Its password or key is removed from this device too.') : Promise.resolve(confirm('Delete?'))).then(function (y) { if (!y) return; ST.set.accts = ST.set.accts.filter(function (a) { return a.id !== v; }); secretSave(v, {}); save().then(function () { A.show(); }); }); return; }
      if ((v = b.getAttribute('data-msunstop'))) { delete ST.set.stop[v]; save().then(function () { A.show(); }); return; }
      if ((v = b.getAttribute('data-mscancel'))) { ST.set.camps = ST.set.camps.filter(function (c) { return c.id !== v; }); save().then(function () { A.show(); }); return; }
      if (b.hasAttribute('data-msx')) { ST.edit = null; A.show(); return; }
      if (b.getAttribute('data-msok') === 'tpl') {
        var T0 = readTplForm(pane), n = M.slots(T0.text);
        if (!T0.name || !T0.text) { ST.msg = 'Give the template a name and its exact text.'; A.show(); return; }
        if (T0.ch === 'mysms' && T0.kind === 'promo') { ST.msg = 'Offers and greetings cannot go as SMS from your own phone number (TRAI does not allow promotional SMS from ordinary numbers). Choose my own WhatsApp for them.'; A.show(); return; }
        if (isOwn(T0.ch)) T0.tid = '';
        if (T0.vars.slice(0, n).some(function (x) { return !x; }) || T0.vars.length < n) { ST.msg = 'Choose what goes in every place.'; A.show(); return; }
        T0.vars = T0.vars.slice(0, n);
        if (!T0.id) { T0.id = uid(); ST.set.tpls.push(T0); } else ST.set.tpls = ST.set.tpls.map(function (t) { return t.id === T0.id ? T0 : t; });
        ST.edit = null; save().then(function () { ST.msg = 'Template saved.'; A.show(); }); return;
      }
      if (b.getAttribute('data-msok') === 'acct') {
        var E = readAcctForm(pane), sec = Object.assign({}, E._sec || {}); delete E._sec;
        $$('[data-sec]', pane).forEach(function (x) { if (x.value.trim()) sec[x.getAttribute('data-sec')] = x.value.trim(); });
        if (!E.url) { ST.msg = 'Choose your company first.'; A.show(); return; }
        if (!E.id) E.id = uid();
        var anySec = Object.keys(sec).some(function (k) { return sec[k]; });
        if (anySec) E.hasSecret = true;
        ST.set.accts = ST.set.accts.filter(function (a) { return a.id !== E.id; }).concat([E]);
        (anySec ? secretSave(E.id, sec) : Promise.resolve()).then(save).then(function () { ST.edit = null; ST.paste = ''; ST.msg = 'Account saved.'; A.show(); });
      }
    });
  });
  A.msg = { showAsk: showAsk, ask: function () { return ASK; }, state: function () { return ST; }, load: load, preview: preview, run: run, recipients: recipients, autoCheck: autoCheck, tick: tick, readList: readList };
})();

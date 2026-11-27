/* NSBiz (app.niveshsahayak.in): the full software on the same data home as the document sites.
   Phase 2, money in and out: dashboard, sales list with what is still due on each bill, money received and paid
   (linked to bills, part payments, advances), purchase bills and returns, expenses, dues with ageing,
   party statements (print, PDF, WhatsApp reminder), cash and bank books, opening balances, one-click convert.
   Accounts come from NSBooks (books.js); every record lives in the data home's 'doc' store, so the receipt and
   voucher sites can print what is saved here. Screen words: NS.t('app.<key>') (English in i18n.js, other languages in engine/lang).
   Party ledger, balance confirmation letter and group reports: ledger.js (sections 'st' and 'grp').
   Door sites (khata., purchase. ...) show only some sections (#app data-secs) and add their own through window.NSApp (money.js). */
(function () {
  'use strict';
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, num = NS.num, r2 = NS.r2, money = NS.money, B = NSBooks, key = B.key;

  function T(k, v) { return NS.t('app.' + k, v); }   /* screen words: the 'app.' keys of i18n.js and the language packs */

  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var TOOLS = (window.NS_CFG && NS_CFG.tools) || [];
  /* shop and trade records (kit.js) open in their own site, which is not in TOOLS */
  var KITSITE = { pos: 'pos', pharma: 'pharmacy', resto: 'restaurant', lr: 'bilty', job: 'job-card', hotel: 'hotel', rentb: 'rent', rabill: 'contractor-bill', fee: 'fee-receipt' };
  KITSITE.jewel = 'jewellery'; KITSITE.garment = 'garment';   /* group C trade tools */
  var SITEOF = { invoice: 'billing', quote: 'quotation', proforma: 'proforma', so: 'sales-order', challan: 'challan', po: 'purchase-order', self: 'self-invoice', note: 'credit-note', cashmemo: 'cash-memo', receipt: 'receipt', voucher: 'voucher', expinv: 'export-invoice' };
  function toolUrl(site) { var x = TOOLS.filter(function (x) { return x[0] === site; })[0]; if (!x) return '#'; return LOCAL ? 'http://localhost:' + x[4] + '/' : 'https://' + x[1] + '/'; }
  function myUrl(h) { return (LOCAL ? 'http://localhost:8862/' : 'https://my.niveshsahayak.in/') + (h || ''); }
  /* the shell: document makers and My data open inside the app (a frame next to the menu), not as another website.
     #do/<site><path?query#hash> shows <site> in the frame; Back returns to the screen it was opened from. */
  var NEWDOCS = [['billing', 'invoice'], ['quotation', 'quote'], ['proforma', 'proforma'], ['sales-order', 'so'], ['challan', 'challan'], ['purchase-order', 'po'], ['credit-note', 'note', 'k.credit'], ['debit-note', 'note', 'k.debit'],
    ['cash-memo', 'cashmemo'], ['receipt', 'receipt'], ['voucher', 'voucher'], ['self-invoice', 'self'], ['rent-receipt', 'rent'], ['salary-slip', 'salary'], ['petty-cash', 'petty'],
    ['pos', 'pos', 'nav.pos'], ['pharmacy', 'pharma', 'nav.pharmacy'], ['restaurant', 'resto', 'nav.restaurant'], ['bilty', 'lr', 'nav.bilty'], ['job-card', 'job', 'Doc.job'], ['hotel', 'hotel', 'Doc.hotel'], ['rent', 'rentb', 'Doc.rentb'], ['contractor-bill', 'rabill', 'nav.contractorbill'], ['fee-receipt', 'fee', 'Doc.fee']];
  NEWDOCS.push(['clinic', 'visit', 'nav.clinic'], ['salon', 'svc', 'nav.salon']);
  NEWDOCS.push(['jewellery', 'jewel', 'nav.jewellery'], ['garment', 'garment', 'nav.garment']);
  NEWDOCS.push(['mandi', 'mandi', 'nav.mandi'], ['petrol', 'pump', 'nav.petrol']); KITSITE.mandi = 'mandi'; KITSITE.pump = 'petrol';
  NEWDOCS.push(['dairy', 'dairy', 'nav.dairy'], ['subscribers', 'subs', 'nav.subs']); KITSITE.dairy = 'dairy'; KITSITE.subs = 'subscribers';   /* India plan B */
  NEWDOCS.push(['tripsheet', 'tsh', 'nav.tripsheet']); KITSITE.tsh = 'tripsheet';   /* India plan C */
  /* every Nivesh Sahayak site the App knows (build.py INAPP_MAP): [host, local port, how it opens, name key].
     'twin' = the App's own copy of the maker (or My data) at /do/<site>/, same engine and data home, shown on an App screen;
     '#<section>' = a door site whose screens the App has itself; 'frame' = any other site, only its content, in the App's frame */
  var INAPP = (window.NS_CFG && NS_CFG.inapp) || {};
  function siteHome(s) { var x = INAPP[s]; if (!x) return s === 'my' ? myUrl() : toolUrl(s); return LOCAL ? (x[1] ? 'http://localhost:' + x[1] + '/' : '') : 'https://' + x[0] + '/'; }
  function siteOf(u) {
    if (u.origin === location.origin) return '';
    if (u.href.indexOf(myUrl()) === 0) return 'my';
    var ks = Object.keys(INAPP).sort(function (a, b) { return (INAPP[a][2] === 'twin' ? 0 : 1) - (INAPP[b][2] === 'twin' ? 0 : 1); });   /* makers first */
    for (var i = 0; i < ks.length; i++) { var h = siteHome(ks[i]); if (h && u.href.indexOf(h) === 0) return ks[i]; }
    var x = TOOLS.filter(function (x) { return u.href.indexOf(toolUrl(x[0])) === 0; })[0];
    return x ? x[0] : '';
  }
  /* a link, a button or a maker asks for href: open it on an App screen. false = not an App place (the caller goes there itself) */
  function openUrl(href) {
    if (/^(blob|data|javascript|mailto|tel|sms|whatsapp):/i.test(String(href || ''))) return false;   /* a file being saved or an app link, never a screen */
    var u; try { u = new URL(href, location.href); } catch (e) { return false; }
    if (u.origin === location.origin) {   /* the App's own addresses, asked for by a maker copy or My data */
      if (/^\/do\/[a-z0-9-]+\//.test(u.pathname)) { go(u.pathname.slice(1) + u.search + u.hash); return true; }
      var h = u.hash.slice(1).split('/')[0];
      if (u.pathname === '/' && !h) { go('home'); return true; }   /* the App itself (NSBiz card in My data): its Dashboard, here */
      if (u.pathname === '/' && h && !DOOR && (SECS.indexOf(h) >= 0 || EXT[h])) { go(u.hash.slice(1)); return true; }
      /* any other page of the App (Help, What's new, Windows program, About, privacy...) opens on an App screen with Back, so the
         side menu, the business and the way back to the Dashboard stay (owner 2026-11-18: nothing may keep the user away); files are left alone */
      if (!DOOR && u.pathname !== '/' && !/\.(json|xml|txt|exe|zip|pdf|png|jpe?g|webp|svg|ico|js|css)$/i.test(u.pathname)) { go('do/page' + u.pathname + u.search + u.hash); return true; }
      return false;
    }
    var s = DOOR ? '' : siteOf(u);
    /* our other sites with no screen of their own in the App (support, promotion cards, website designs...): shown on an App screen too,
       so nothing opens a new tab (owner 2026-11-18). www (Blogger) cannot be shown inside another page, so it still opens on its own. */
    if (!s && !DOOR && /\.niveshsahayak\.in$/.test(u.hostname) && u.hostname !== 'www.niveshsahayak.in' && u.protocol === 'https:') { go('do/web/' + encodeURIComponent(u.href)); return true; }
    if (!s) return false;
    var how = (INAPP[s] || [])[2] || 'twin', path = u.pathname.replace(/^\/[a-z]{2,3}\/$/, '/');   /* a language home (/hi/) is the maker too */
    if (how.charAt(0) === '#') { var sh = u.hash.slice(1), s0 = sh.split('/')[0]; go(sh && (SECS.indexOf(s0) >= 0 || EXT[s0]) ? sh : how.slice(1)); return true; }
    go('do/' + s + (how === 'twin' && path === '/' ? '/' : u.pathname) + u.search + u.hash);
    return true;
  }
  /* the maker a saved record opens in (a counter bill is an invoice made on pos.) and its address: the App shows it inside */
  KITSITE.visit = 'clinic'; KITSITE.svc = 'salon';
  var SLIPSITE = { rent: 'rent-receipt', salary: 'salary-slip', petty: 'petty-cash' };
  function docSite(d) { var ty = d.type || 'invoice'; return ty === 'note' && d.kind === 'debit' ? 'debit-note' : ty === 'invoice' && d.counter ? 'pos' : SITEOF[ty] || KITSITE[ty] || SLIPSITE[ty] || ''; }
  function docUrl(d) { var s = docSite(d); return s ? siteHome(s) + '?open=' + encodeURIComponent(d.id) : ''; }
  var backTo = '', trail = [];
  function frameTitle(site, rest) {
    var id = (/[?&]open=([^&#]+)/.exec(rest) || [])[1], d = id && C.doc.filter(function (x) { return x.id === decodeURIComponent(id); })[0];
    if (d) return docName(d) + (d.no ? ' ' + d.no : '');
    var nd = NEWDOCS.filter(function (n) { return n[0] === site; })[0], k = (INAPP[site] || [])[3], nm = nd ? NS.t(nd[2] || 'Doc.' + nd[1]) : k ? NS.t(k) : site;
    if (/[?&]from=/.test(rest)) return T('fr_conv', { doc: nm });
    if (site === 'my') return NS.t('my.title');
    if (site === 'web') { try { return new URL(decodeURIComponent(rest.slice(1))).hostname.replace('.niveshsahayak.in', ''); } catch (e) { return ''; } }
    if (site === 'page') return /^\/([a-z]{2,3}\/)?help\//.test(rest) ? NS.t('f.help') : /whats-new/.test(rest) ? NS.t('wn.title') : /^\/desktop\//.test(rest) ? NS.t('nav.desktop') : 'Nivesh Sahayak';
    return nd && !id && /^\/(\?|#|$)/.test(rest) ? T('fr_new', { doc: nm }) : nm;
  }
  /* a maker copy tells what it has saved (inapp.js): the App's address and title follow it (replaceState: no new history step) */
  function frameAt(site, j) {
    if (cur !== 'do' || arg.split(/[\/?#]/)[0] !== site) return;
    var h = j ? 'do/' + site + '/?open=' + encodeURIComponent(j.id) : /[?&]from=/.test(arg) ? 'do/' + site + '/' : '';
    if (!h || h === 'do/' + arg) return;
    history.replaceState(null, '', '#' + h); arg = h.slice(3); trail[trail.length - 1] = h;
    var box = curBox(); if (box) box.setAttribute('data-url', '/' + h);
    var h2 = $('.fr-hd h2'); if (h2 && j && j.doc) h2.textContent = docName(j.doc) + (j.doc.no ? ' ' + j.doc.no : '');
  }
  /* the frame fills the screen below the title row (above the phone tab bar and the status bar), so the document scrolls inside it */
  function sizeFrame() {
    var box = curBox(), fr = box && $('iframe.app-frame', box); if (!fr) return;
    var bottom = 0;
    $$('.tabbar, .sbar').forEach(function (b) { var r = b.getBoundingClientRect(), cs = getComputedStyle(b); if (r.height && cs.display !== 'none' && cs.position === 'fixed' && r.top > innerHeight / 2) bottom = Math.max(bottom, innerHeight - r.top); });
    var top = fr.getBoundingClientRect().top + scrollY;
    fr.style.height = Math.max(380, innerHeight - top - bottom - 6) + 'px';
  }
  /* makers opened in the App stay ready in the background (up to KEEP, the least used one goes first): going back to one
     shows it at once, as it was left, instead of loading the page again. They sit on a shelf next to the screen, never inside it,
     because moving an iframe in the page reloads it; a hidden one keeps its place and its typing (owner, 2026-11-06) */
  var KEEP = 4, shelf = null;
  function shelfEl() {
    if (shelf && shelf.isConnected) return shelf;
    var pane = $('[data-pane]'); if (!pane) return null;
    shelf = document.createElement('div'); shelf.className = 'fr-shelf'; shelf.hidden = true;
    pane.parentNode.insertBefore(shelf, pane.nextSibling);
    return shelf;
  }
  function curBox() { return shelf && $('.fr-box.cur', shelf); }
  function shelve() { if (shelf) { shelf.hidden = true; var b = curBox(); if (b) b.classList.remove('cur'); } }
  function frame(a) {
    var site = a.split(/[\/?#]/)[0], rest = a.slice(site.length) || '/';
    var how = (INAPP[site] || [])[2] || (site === 'my' ? 'twin' : 'frame'), path = rest.replace(/[?#].*$/, '');
    var url = site === 'page' ? rest : site === 'web' ? decodeURIComponent(rest.slice(1)) : how === 'twin' && path === '/' ? '/do/' + site + rest : siteHome(site).replace(/\/$/, '') + rest;
    if (how === 'twin' && site !== 'my' && rest === '/') url += '?new=1';   /* "New ...": a fresh document, not the one last opened */
    var title = frameTitle(site, rest);
    var pane = $('[data-pane]'), sh = shelfEl(), box = curBox();
    document.documentElement.classList.add('app-in', 'app-frame-on');
    document.documentElement.classList.toggle('app-maker', !/^(my|page|web)$/.test(site));   /* a document maker: full screen (desk.css) */
    if (box && box.getAttribute('data-url') === url && !sh.hidden) { frVsSync(); return; }
    /* the App's own title row (Back + what is open), then the document: no second website, no new tab */
    frVsSync();
    pane.innerHTML = '<div class="pane-hd fr-hd"><button type="button" class="btn sm fr-back" data-fback>' + esc(T('back')) + '</button><h2>' + esc(title) + '</h2></div>';
    $('[data-fback]', pane).addEventListener('click', function () { if (trail.length > 1) history.back(); else go(backTo || 'home'); });
    var boxes = $$('.fr-box', sh);
    boxes.forEach(function (b) { b.classList.remove('cur'); });
    box = boxes.filter(function (b) { return b.getAttribute('data-url') === url; })[0];
    if (!box) {
      if (boxes.length >= KEEP) boxes.sort(function (x, y) { return +x.getAttribute('data-used') - +y.getAttribute('data-used'); })[0].remove();
      box = document.createElement('div'); box.className = 'fr-box'; box.setAttribute('data-url', url);
      box.innerHTML = '<div class="fr-wait" aria-hidden="true"><div class="shim"></div><div class="shim"></div><div class="shim"></div></div>' +
        '<iframe class="app-frame" src="' + esc(url) + '" title="' + esc(title) + '" allow="web-share; clipboard-write"></iframe>';
      sh.appendChild(box);
      var fr = $('iframe.app-frame', box);
      /* the document shows when it is ready (its words and data in), not at the first load event: a half-drawn page flashed (owner 19 Nov) */
      var showFr = function () { var n = 0; (function w() { var ok = false; try { ok = fr.contentDocument.documentElement.classList.contains('ready'); } catch (er) { ok = true; } if (ok || ++n > 80) { fr.classList.add('on'); sizeFrame(); } else setTimeout(w, 30); })(); };
      fr.addEventListener('load', function () {
        showFr();
        /* a page of the App: its own heading names the screen */
        if (site === 'page') try { var hh = fr.contentDocument.querySelector('h1'), t2 = $('.fr-hd h2'); if (hh && t2 && box.classList.contains('cur')) t2.textContent = hh.textContent.trim(); } catch (er) {}
      });
    } else { var fr0 = $('iframe.app-frame', box); fr0.title = title; try { fr0.contentDocument.dispatchEvent(new CustomEvent('ns-shown')); } catch (er) {} }   /* P5-4: it brings in what changed meanwhile */
    box.classList.add('cur'); box.setAttribute('data-used', String(Date.now())); sh.hidden = false; frVsSync();
    sizeFrame(); requestAnimationFrame(sizeFrame);
    var h2 = $('h2', pane); h2.tabIndex = -1; h2.focus({ preventScroll: true });
  }
  var MODES = ['cash', 'upi', 'cheque', 'bank', 'card', 'dd', 'other'];
  var EXP = ['rent', 'power', 'salary', 'transport', 'phone', 'repair', 'office', 'fuel', 'bank', 'prof', 'ads', 'misc'];
  var SALES = { invoice: 1, cashmemo: 1, note: 1, quote: 1, proforma: 1, so: 1, challan: 1, expinv: 1 };
  SALES.jewel = 1; SALES.garment = 1;   /* group C trade tools: their bills are in the Sales list */
  var CONVERT = { quote: ['so', 'challan', 'invoice'], proforma: ['invoice'], so: ['challan', 'invoice'], challan: ['invoice'] };
  CONVERT.po = ['grn', 'pbill'];   /* ERP round 2 (orders.js): a purchase order becomes a receipt note or a purchase bill (open lines only) */
  function envBtn(attr) { return window.NSEnvelope ? NSEnvelope.btn(attr, true) : ''; }
  var SECS = ['home', 'sales', 'buy', 'money', 'dues', 'parties', 'cash', 'st'];
  /* EXT: sections added by other files (NSApp.addSection); DOOR: the sections a door site shows (#app data-secs), first = start */
  var EXT = {}, DOOR = null, HOME = [];

  var C = { biz: [], party: [], item: [], doc: [] }, CFG = {}, GRP = {}, BIZ = null, cur = 'home', arg = '', q = '', filt = 'all', grp = '', sortBy = 'new', typeBy = '', DUE = {};

  /* MEM = what the data home gave last, SIG = its stamp (count and save times of every list, plus the settings): a screen
     shows from memory at once and is drawn again only when the stamp changed (owner, 2026-11-11: shortcuts felt stuck) */
  var MEM = null, SIG = '', painted = false, readyFns = [];
  function sigOf(r) {
    return r.slice(0, 4).map(function (L) { var s = 0; L.forEach(function (x) { s = (s + (x.updated || 0)) % 1e15; }); return L.length + ':' + s; }).join('|') + '|' + JSON.stringify([r[4] || 0, r[5] || 0, r[6] || 0, r[7] || 0]);
  }
  function whenReady(fn) { if (MEM) fn(); else readyFns.push(fn); }
  var linked = false;   /* ERP Round 1, C-1: once per App start, vouchers with no business id get the id of the one business their seller name matches */
  function load() {
    if (!linked && NSStore.linkBiz) { linked = true; return NSStore.linkBiz().then(load, load); }
    return Promise.all(['biz', 'party', 'item'].map(function (s) { return NSStore.list(s); }).concat([NSStore.meta('settings'), NSStore.meta('groups'), NSStore.meta('followups'), NSStore.meta('banks'), NSStore.meta('carry')])).then(function (r0) {
      var r = [r0[0], r0[1], r0[2], null, r0[3], r0[4], r0[5], r0[6]];
      return yearDocs(r, r0[7] || {}).then(function (docs) { r[3] = docs; return r; });
    }).then(function (r) {
      apply(r);
      var s = sigOf(r), ch = s !== SIG; MEM = r; SIG = s;   /* stamped after apply: its one-time settings copy is part of it */
      readyFns.splice(0).forEach(function (f) { try { f(); } catch (e) {} });
      if (!window.__nsAppData) { window.__nsAppData = 1; setTimeout(function () { document.dispatchEvent(new Event('ns-app-data')); }, 0); }   /* the loading screen waits for this (core.js, owner 25 Nov) */
      if (NS.gateway) setTimeout(NS.gateway, 0);   /* the box above Dashboard: drawn again once the business is known (it could stay empty when drawn before the data arrived) */
      return ch;
    });
  }
  /* SQLite Stage 3 (owner, 21 Nov 2026), like Tally / Busy: the App reads only the open years of this tab's business. Years closed
     in Year end (in an unbroken run from the first year) stay in their own files; their balances come in as opening records
     (NSAcct.carryForward: each party's open bills, cash, banks, stock, one journal for the other accounts), worked out once and
     kept in the data home (meta 'carry', per business) with the closed years' fingerprint, so a change there works them out
     again. A report or period that starts before the open years reads every year (needYears). Carried records are only on
     screen: they have ids 'cy-…' and cyc:1, and the store refuses to save or delete them. */
  var CYV = 1, YEARS = { biz: '', fy: '', all: false }, wantAll = false;
  /* Speed (27 Nov 2026), like Tally and Evershine open one year at a time: a business with many documents (AUTO_N) does not read its older years at start. Every year before
     last year is treated like a closed one for loading: its balances come in as opening records (the same carry-forward as Year end, kept in meta 'carry'), nothing is
     locked, and a report that reaches back reads every year (needYears). localStorage ns-autocut = off turns it off. */
  var AUTO_N = 15000;
  function autoYears() { var t = NS.today(), y = +t.slice(0, 4) - (+t.slice(5, 7) < 4 ? 1 : 0) - 2, out = []; for (var i = y; i >= 2000; i--) out.push(i + '-' + String((i + 1) % 100).padStart(2, '0')); return out; }
  function autoOn(n) { try { if (localStorage.getItem('ns-autocut') === 'off') return false; } catch (e) {} return n > AUTO_N; }
  function closedOf(raw, b, L, auto) {
    if (!b || !b.id || !window.NSAcct) return [];
    var c = (NS.cfgFor ? NS.cfgFor(raw || {}, b, L) : raw || {}).closed || {}, out = [];
    NSAcct.closedKeys(b).forEach(function (k) { (c[k] || []).forEach(function (f) { if (out.indexOf(f) < 0) out.push(f); }); });
    if (auto) autoYears().forEach(function (f) { if (out.indexOf(f) < 0) out.push(f); });
    return out;
  }
  function pickBiz(L, raw) { var want = NS.curBiz(); return L.filter(function (b) { return b.id === want; })[0] || L.filter(function (b) { return b.id === (raw || {}).defBiz; })[0] || L[0] || null; }
  var LAST = null;   /* the documents of the last read, with the data home's stamp and what was asked: a screen change with no save in between reads nothing again */
  function yearDocs(r, carry) {
    var b0 = pickBiz(r[0] || [], r[4]);
    var st = NSStore.docStat ? NSStore.docStat(true).catch(function () { return null; }) : Promise.resolve(null);
    return st.then(function (s) {
      var stamp = s && s.stamp, auto = !!(s && autoOn(s.n)), ask = JSON.stringify([b0 && b0.id || '', wantAll, wantAll ? [] : closedOf(r[4], b0, r[0] || [], auto), carry[b0 && b0.id] ? carry[b0.id].sig : '']);
      if (stamp && LAST && LAST.stamp === stamp && LAST.ask === ask) { YEARS = LAST.years; return LAST.docs; }
      return yearDocs0(r, carry, auto).then(function (docs) { LAST = stamp ? { stamp: stamp, ask: ask, docs: docs, years: YEARS } : null; return docs; });
    });
  }
  function yearDocs0(r, carry, auto) {
    var b = pickBiz(r[0] || [], r[4]), shut = wantAll ? [] : closedOf(r[4], b, r[0] || [], auto);
    if (!shut.length || !NSStore.docsFrom) { YEARS = { biz: b && b.id || '', fy: '', all: true }; return NSStore.list('doc'); }
    var q = {}; q[b.id] = shut;
    return NSStore.docsFrom(q).then(function (res) {
      var cut = res.cut && res.cut[b.id];
      YEARS = { biz: b.id, fy: cut ? cut.fy : '', first: cut ? cut.first : '', all: !cut };
      if (!cut) return res.docs;
      var cs = (NS.cfgFor ? NS.cfgFor(r[4] || {}, b, r[0]) : r[4] || {}) || {}, sig = CYV + '|' + cut.fy + '|' + cut.sig + '|' + JSON.stringify([cs.stockValue || '', cs.billwise || '', (r[2] || []).length]);
      var have = carry[b.id];
      if (have && have.sig === sig && Array.isArray(have.recs)) return res.docs.concat(have.recs);
      /* first start after closing a year (or a change in a closed year): every year is read once and the openings are kept */
      if (NS.toast) NS.toast('Updating the opening balances from the earlier years. This takes a moment and only happens after a change in an earlier year.');
      return NSStore.list('doc').then(function (all) {
        apply([r[0], r[1], r[2], all, r[4], r[5], r[6], r[7]]);
        var seller = JSON.parse(JSON.stringify(b)); delete seller.id; delete seller.created; delete seller.updated;
        var recs = NSAcct.carryForward(all.filter(function (d) { return !d.date || d.date <= NSAcct.fyEnd(cut.fy); }), r[2], b.name, cut.fy, seller), now = Date.now();
        recs.forEach(function (x, i) { x.id = 'cy-' + cut.fy + '-' + (i + 1); x.cyc = 1; x.bizId = b.id; x.created = x.updated = now; });
        NSStore.meta('carry').then(function (m) { m = m || {}; m[b.id] = { sig: sig, fy: cut.fy, at: now, recs: recs }; return NSStore.meta('carry', m); }).catch(function () {});
        return res.docs.concat(recs);
      });
    }, function () { YEARS = { biz: b.id, fy: '', all: true }; return NSStore.list('doc'); });
  }
  /* a date before the open years: read every year (once), then draw the screen again */
  function needYears(from) {
    if (wantAll || YEARS.all || !YEARS.fy || !from || !window.NSAcct || from > NSAcct.fyEnd(YEARS.fy)) return false;
    wantAll = true; NS.toast && NS.toast(T('yrs_older'));
    setTimeout(function () { load().then(function () { if (cur !== 'do') paint(); }); }, 0);
    return true;
  }
  function apply(r) {
      C = { biz: r[0], party: r[1], item: r[2], doc: r[3] }; CFG = r[4] || {}; GRP = r[5] || {}; FU = r[6] || {}; BANKS = r[7] || {};
      NS.bizCache = C.biz;
      if (NS.cfgSplit(CFG, C.biz)) (NS.loadCfg ? NS.loadCfg() : NSStore.meta('settings', CFG)).catch(function () {});   /* settings per business: one-time copy. ERP Round 2: saved from a fresh read (NS.loadCfg splits and saves it), never the copy read at load, which could undo a settings save made a moment before */
      var RAW = CFG;
      var want = NS.curBiz();   /* this tab's business (another tab switching business never moves it) */
      BIZ = C.biz.filter(function (b) { return b.id === want; })[0] || C.biz.filter(function (b) { return b.id === CFG.defBiz; })[0] || C.biz[0] || null; if (BIZ && BIZ.id && BIZ.id !== want) try { sessionStorage.setItem('ns-app-biz', BIZ.id); } catch (e) {}
      if (!BIZ) {   /* no business master yet: use the seller name of the newest bill */
        var d = C.doc.slice().sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); }).filter(function (d) { return d.seller && d.seller.name; })[0];
        if (d) BIZ = Object.assign({ id: '', name: d.seller.name }, d.seller);
      }
      CFG = NS.cfgFor(RAW, BIZ, C.biz);   /* the settings of this tab's business */
      if (window.NSStock && NSStock.valuation) NSStock.valuation(CFG.stockValue);   /* FIFO or weighted average, My data › Settings */
      B.setBanks(banks());   /* names of this business's bank accounts in every report */
      if (B.setBillwise) { B.setBillwise(bizName(), CFG.billwise); B.setItemLedgers(C.item.reduce(function (o, m) { if (m && m.desc && (m.sl || m.pl)) o[m.desc] = { sl: m.sl || '', pl: m.pl || '' }; return o; }, {})); }   /* ERP Round 2: strict bill-wise (A-12), item sales / purchase ledgers (A-9) */
      bizChip();
  }
  function bizName() { return BIZ ? BIZ.name : ''; }
  /* the vouchers of this tab's business: by business id (C-1), else by the seller's name */
  var MINE = null;
  function mine() {
    var b = key(bizName()), id = BIZ && BIZ.id;
    if (MINE && MINE.doc === C.doc && MINE.b === b && MINE.id === id && B.memoOn && B.memoOn()) return MINE.list;   /* the same list while one screen is drawn (Stage 3) */
    var l = C.doc.filter(function (d) { return id && d.bizId ? d.bizId === id : key(d.seller && d.seller.name) === b; });
    MINE = { doc: C.doc, b: b, id: id, list: l };
    return l;
  }
  /* ---------- bank accounts of the business (ERP masters step 3) ----------
     The bank on the business record is the default bank (account 'bank'); extra banks live in data home meta 'banks' =
     { <business id>: [{ id, name, acc, ifsc, branch }] } and post to NSBooks.bankKey(name). A money entry keeps its bank in d.bacct.
     The "Bank account" choice shows only when the business has two or more banks and the payment mode goes through a bank. */
  var BANKS = {};
  function banks(b) {
    return B.bankList(b || BIZ, BANKS, T('bankdef'));
  }
  function bankLabel(x) { var a = String(x.acc || '').replace(/\s/g, ''); return x.name + (a ? ' · ' + (a.length > 4 ? '…' + a.slice(-4) : a) : ''); }
  /* the select; '' when the business has one bank. mode: id of the payment mode select it follows ('' = always shown) */
  function bankFld(id, cur, mode, label) {
    var L = banks(); if (L.length < 2) return '';
    var v = L.some(function (x) { return x.k === cur; }) ? cur : 'bank';
    return '<div class="f" data-bankf="' + id + '"' + (mode ? ' data-bankmode="' + mode + '"' : '') + '><label for="' + id + '">' + esc(label || T('bankacct')) + '</label>' +
      '<select id="' + id + '" name="' + id + '">' + L.map(function (x) { return '<option value="' + esc(x.k) + '"' + (x.k === v ? ' selected' : '') + '>' + esc(bankLabel(x)) + '</option>'; }).join('') + '</select></div>';
  }
  /* show each bank choice only for a mode that goes through a bank (UPI, bank transfer, cheque, card...) */
  function bankSync(root) {
    $$('[data-bankf]', root).forEach(function (f) {
      var m = f.getAttribute('data-bankmode'), s = m && $('#' + m, root);
      if (s) f.hidden = B.moneyAcct(s.value) !== 'bank' || !!(s.closest('.f') && s.closest('.f').hidden);
    });
  }
  /* the bank key to save ('' = the default bank, or the field is hidden / not there) */
  function bankVal(root, id) { var f = $('[data-bankf="' + id + '"]', root), s = f && !f.hidden && $('#' + id, root); return s && s.value !== 'bank' && B.isBank(s.value) ? s.value : ''; }
  /* forms of other files (acctx.js X.open): keep the bank choice in step with the mode (one listener per form element) */
  function bankWire(root) { if (!root) return; bankSync(root); if (root._bkw) return; root._bkw = 1; root.addEventListener('change', function () { bankSync(root); }); }
  function setBacct(d, v) { if (v) d.bacct = v; else delete d.bacct; return d; }
  function sellerCopy() { var s = JSON.parse(JSON.stringify(BIZ || {})); delete s.id; delete s.created; delete s.updated; return s; }
  function docName(d) {
    var ty = d.type || 'invoice';
    if (ty === 'note') return T(d.kind === 'debit' ? 'd_debit' : 'd_credit');
    if (ty === 'quote') return T(d.kind === 'estimate' ? 'd_estimate' : 'd_quote');
    if (ty === 'receipt') return T(d.kind === 'adv' ? 'd_adv' : d.kind === 'ref' ? 'd_ref' : 'd_receipt');
    if (ty === 'voucher') return T(d.forBill ? 'd_voucher' : 'd_vexp');
    if (ty === 'pbill') return T(d.kind === 'return' ? 'd_pret' : 'd_pbill');
    if (ty === 'contra') { var ck = B.contraKind(d); return T(ck === 'xfer' ? 'd_xfer' : ck === 'wd' ? 'd_withdraw' : 'd_deposit'); }
    /* shop and trade kits and slips have no app.d_ name: use the maker's own name (never a raw key) */
    var k = 'app.d_' + ty, v = NS.t(k);
    return v !== k ? v : NS.t(KITNAME[ty] || 'Doc.' + ty);
  }
  var KITNAME = { pos: 'nav.pos', pharma: 'nav.pharmacy', resto: 'nav.restaurant', lr: 'nav.bilty', rabill: 'nav.contractorbill' };
  KITNAME.jewel = 'nav.jewellery'; KITNAME.garment = 'nav.garment';
  KITNAME.dairy = 'nav.dairy'; KITNAME.subs = 'nav.subs';   /* India plan B */
  KITNAME.mandi = 'nav.mandi'; KITNAME.pump = 'nav.petrol'; KITNAME.tsh = 'nav.tripsheet';
  function ldate(iso) { return NS.fmtDate(iso); }
  /* expense heads: a head picked from the list is saved as its code (rent) or English name, never as the words of the screen
     language, so one head is one ledger whatever language it was typed in; shown in the screen language (round C) */
  function catName(c) { if (EXP.indexOf(c) >= 0) return T('ex_' + c); var h = window.NSHeads && NSHeads.find(c); return h && !h.custom ? NSHeads.label(h) : c; }
  function catCode(c) { var h = window.NSHeads && NSHeads.find(c); return !h || h.custom ? c : NSHeads.APPCODE[h.id] ? h.id : h.en; }
  function fyStart(iso) { return NS.fy(iso).slice(0, 4) + '-04-01'; }
  function amountOf(d) {
    if (d.gen && B.genTotal) return B.genTotal(d);   /* A-10 */
    var R = B.role(d);
    if (R === 'in' || R === 'refund' || R === 'exp' || R === 'ob' || R === 'contra' || B.bounced(d) && d.type === 'receipt') return num(d.amount);
    if (B.bounced(d)) return r2((d.lines || []).reduce(function (a, l) { return a + num(l.amt); }, 0));
    if (R === 'out' || R === 'outexp') return r2((d.lines || []).reduce(function (a, l) { return a + num(l.amt); }, 0));
    return num(d.total);
  }

  /* ---------- sections ---------- */
  function route() {
    var h = decodeURIComponent(location.hash.slice(1)), p = h.split('/');
    /* addresses the NSBiz Helper add-on opens (toolbar, shortcuts, reminders): #qe/<kind> = quick entry,
       #pay/<min|mout>/<bill id> = record a payment against that bill; then back to the screen the App was on */
    /* #biz/<id>: switch to that business (the add-on's panel on the GST portal, when the portal shows another of your businesses) */
    if (p[0] === 'biz' && p[1]) {
      history.replaceState(null, '', '#' + (backTo && !/^(qe|pay|biz)\//.test(backTo) ? backTo : 'home'));
      route(); whenReady(function () { setBiz(p.slice(1).join('/')); });
      return;
    }
    if ((p[0] === 'qe' && p[1]) || (p[0] === 'pay' && /^(min|mout)$/.test(p[1] || '') && p[2])) {
      history.replaceState(null, '', '#' + (backTo && !/^(qe|pay)\//.test(backTo) ? backTo : 'home'));
      route();
      if (p[0] === 'qe') quickEntry(p[1]);
      else whenReady(function () { openForm(p[1], { forId: p.slice(2).join('/') }); });
      return;
    }
    /* where the App has been, so the title row's Back goes back the way the user came (a maker opened from another maker too) */
    if (trail.length > 1 && trail[trail.length - 2] === h) trail.pop(); else if (trail[trail.length - 1] !== h) trail.push(h);
    cur = p[0] === 'do' && !DOOR ? 'do' : SECS.indexOf(p[0]) >= 0 || EXT[p[0]] ? p[0] : 'home'; arg = p.slice(1).join('/');
    /* one cash screen: where the cash, bank and day book screen (money.js) is on hand, #cash and #cash/bank open it */
    if (cur === 'cash' && EXT.books && (!DOOR || DOOR.indexOf('books') >= 0)) { cur = 'books'; arg = B.isBank(arg) ? arg : 'cash'; }
    if (cur === 'do' && window.NSVDocs && NSVDocs.claim(arg)) { trail.pop(); history.replaceState(null, '', '#' + (backTo || 'home')); route(); return; }
    if (cur !== 'do') { backTo = h; document.documentElement.classList.remove('app-frame-on', 'app-maker'); shelve(); }
    if (DOOR && DOOR.indexOf(cur) < 0 && cur !== 'st') { cur = DOOR[0]; arg = ''; }
    show(true);
  }
  function go(h) { if (/^do\//.test(h) && window.NSVDocs && NSVDocs.claim(h.slice(3))) return; location.hash = h; }   /* step 4: documents open as voucher screens (vdocs.js) */
  var showSeq = 0;
  function show(focus, soft) {
    $$('[data-sec]').forEach(function (b) { var on = b.getAttribute('data-sec') === (cur === 'st' ? 'parties' : cur); b.setAttribute('aria-current', on ? 'page' : 'false'); });
    if (cur === 'do') {
      document.documentElement.classList.add('no-sponsor'); frame(arg);
      /* after a reload the saved documents come in later: name the open one then */
      return load().then(function () { var h2 = $('.fr-hd h2'), st = arg.split(/[\/?#]/)[0]; if (cur === 'do' && h2 && /[?&]open=/.test(arg)) h2.textContent = frameTitle(st, arg.slice(st.length)); });
    }
    /* a redraw started earlier (window focus when the user clicks, late data) must not paint over a newer screen or the frame */
    var mine_ = ++showSeq, want = cur + '/' + arg, first = false;
    /* a screen change, a key or a tap shows what is in memory at once; the data home is read after that.
       soft = the window came back or late data arrived: draw again only if something changed, and never under an open
       form or list (a redraw used to close the business list while it was being used) */
    if (MEM && !soft) { apply(MEM); paint(focus); first = true; }
    return load().then(function (changed) {
      if (mine_ !== showSeq || cur === 'do' || cur + '/' + arg !== want) return;
      if (painted && !changed && (first || soft)) return;
      if (soft && $('dialog[open]')) return;
      paint(focus && !first);
    });
  }
  function paint(focus) { if (B.memo) B.memo(true); try { return paint0(focus); } finally { if (B.memo) B.memo(false); } }
  /* phone test 21 Nov: when the data home answers late, the screen may not draw again (nothing changed), so the line saying where the
     data is kept is put right on its own */
  document.addEventListener('ns-data', function () { var m = $('[data-mode]'); if (m && window.NSStore) m.textContent = T(NSStore.mode() === 'vault' ? 'vault' : 'local'); });   /* Stage 3: every panel of one drawing shares the same dues and balances */
  function paint0(focus) {
      painted = true;
      var pane = $('[data-pane]');
      $('[data-mode]').textContent = T(NSStore.mode() === 'vault' ? 'vault' : 'local');
      labels();
      document.documentElement.classList.toggle('app-in', !!BIZ);
      /* a business moving from other software starts with no business: the import screen makes it */
      if (!BIZ && cur === 'mig' && EXT.mig && !DOOR) { pane.innerHTML = EXT.mig.html(arg); if (EXT.mig.wire) EXT.mig.wire(pane, arg); return; }
      if (!BIZ) { pane.innerHTML = noBiz(); wireSample(pane); return; }
      /* a remembered party screen whose party was deleted (sample data removed): go to the dashboard */
      if (cur === 'st' && arg && !C.party.some(function (p) { return key(p.name) === arg; }) && !B.parties(mine(), bizName())[arg]) { location.replace('#home'); return; }
      /* shared guard (owner 27 Nov 2026: speed): a screen wired again on this same panel never piles up the same listener (the Messages bug that ran a page at 100% CPU).
         A listener added to the panel with the same type and the same code as one from the previous drawing replaces it. */
      if (!pane.__dd) { pane.__dd = { seen: {}, prev: {} }; var ael = pane.addEventListener; pane.addEventListener = function (t, f, o) { var k = t + '|' + String(f), d = pane.__dd; if (typeof f === 'function' && d.prev[k]) { pane.removeEventListener(t, d.prev[k], o); delete d.prev[k]; } d.seen[k] = f; return ael.call(pane, t, f, o); }; }
      pane.__dd.prev = pane.__dd.seen; pane.__dd.seen = {};
      pane.innerHTML = (NS.crumbs ? NS.crumbs(cur, arg) : '') + sampleNote() + bizBar() + (EXT[cur] ? EXT[cur].html(arg) : ({ home: homeHtml, sales: salesHtml, buy: buyHtml, money: moneyHtml, dues: duesHtml, parties: partiesHtml, cash: cashHtml })[cur]());
      wire(pane); wireSample(pane);
      if (EXT[cur] && EXT[cur].wire) EXT[cur].wire(pane, arg);
      /* no sponsored card where a document is made or printed (statement, ledger, books, reports): the Support page promise */
      document.documentElement.classList.toggle('no-sponsor', !!$('[data-nosp], [data-print], [data-b2print], [data-m-print], [data-lgpdf], [data-sheet], .stsheet', pane));
      if (focus) { var h2 = $('h2', pane); if (h2) { h2.tabIndex = -1; h2.focus({ preventScroll: true }); } }
  }
  function labels() {
    $$('[data-sec]').forEach(function (b) { var k = 'app.' + b.getAttribute('data-sec'), w = NS.t(k), sp = $('span', b); if (w !== k && sp && !sp.hasAttribute('data-erp')) sp.textContent = w; });   /* data-erp: the accounting name the menu gave it (desk.js) */   /* no app.<sec> word (cadoc, b2...): the label keeps its own data-i18n */
    $$('[data-t]').forEach(function (e) { e.textContent = T(e.getAttribute('data-t')); });
    /* the guide exists in every language: point its link at the one on screen */
    var L = NS.lang ? NS.lang() : 'en';
    $$('a[href$="how-it-works/"]').forEach(function (a) { a.setAttribute('href', L === 'en' ? '/how-it-works/' : '/' + L + '/how-it-works/'); });
  }
  function noBiz() {
    return '<div class="card"><h2>' + esc(T('nobiz')) + '</h2><p>' + esc(T('nobizp')) + '</p><p><a class="btn primary" href="' + myUrl('#biz/new') + '">' + esc(T('addbiz')) + '</a></p></div>' +
      (EXT.mig && !DOOR ? '<div class="card"><h3>Moving from other software?</h3><p>Bring your parties, items, opening balances and past bills across from Tally, Evershine and others. The business is made for you.</p><p><a class="btn" href="#mig">Bring data from other software</a></p></div>' : '') +
      (window.NSSample && !DOOR ? '<div class="card sample-try"><h3>' + esc(T('sm_try')) + '</h3><p>' + esc(T('sm_tryp')) + '</p><p><button type="button" class="btn" data-sample>' + esc(T('sm_try')) + '</button></p></div>' : '');
  }
  /* sample data: shown on every screen while it is there, with one tap to take it away */
  function sampleNote() {
    return window.NSSample && NSSample.has(C.biz) ? '<div class="note sample-note"><span>' + esc(T('sm_on')) + '</span><button type="button" class="btn sm" data-unsample>' + esc(T('sm_rm')) + '</button></div>' : '';
  }
  function wireSample(pane) {
    var a = $('[data-sample]', pane), r = $('[data-unsample]', pane);
    if (a) a.addEventListener('click', function () { a.disabled = true; NSSample.add().then(function () { NS.toast(T('sm_added')); go(''); show(); }, function (e) { a.disabled = false; NS.toast(NS.t('nosave', { e: e.message }), 'bad'); }); });
    if (r) r.addEventListener('click', function () { (NS.ask ? NS.ask(T('sm_conf')) : Promise.resolve(confirm(T('sm_conf')))).then(function (ok) { if (!ok) return; r.disabled = true; NSSample.remove().then(function () { NS.toast(T('sm_gone')); show(); }); }); });
  }
  function bizBar() {
    /* up to 4 businesses: one button each, one tap switches; more: one button that opens the list (also Alt S, the title bar and the status bar) */
    var bz = C.biz.length < 2 ? '' : C.biz.length <= 4 ? '<span class="bz-tabs" role="group" aria-label="' + esc(T('biz')) + '">' + C.biz.map(function (b) {
      var on = BIZ && b.id === BIZ.id;
      return '<button type="button" class="bz-tab" data-noic data-bizgo="' + esc(b.id) + '" aria-pressed="' + on + '" title="' + esc(b.name) + '">' + esc(b.name) + '</button>'; }).join('') + '</span>'
      : '<button type="button" class="btn bz-btn" data-noic data-bizsw aria-haspopup="dialog"><span class="soft">' + esc(T('biz')) + '</span> <b>' + esc(BIZ ? BIZ.name : '') + '</b> <span aria-hidden="true">▾</span></button>';
    var nw = '<select class="newdoc" data-newdoc aria-label="' + esc(T('newdoc')) + '"><option value="">+ ' + esc(T('newdoc')) + '</option>' +
      NEWDOCS.filter(function (n) { return TOOLS.some(function (x) { return x[0] === n[0]; }) || INAPP[n[0]]; }).map(function (n) { return '<option value="' + n[0] + '">' + esc(NS.t(n[2] || 'Doc.' + n[1])) + '</option>'; }).join('') + '</select>';
    return '<div class="bizbar">' + bz + '<span class="grow"></span>' + nw + '<a class="btn sm" href="' + myUrl() + '">' + esc(NS.t('my.title')) + '</a></div>';
  }

  /* ---------- dashboard ---------- */
  function homeHtml() {
    var D = mine(), today = NS.today(), mon = today.slice(0, 7), A = B.accounts(D, bizName()), P = B.parties(D, bizName());
    var sales = function (pred) { return r2(D.filter(function (d) { return B.role(d) === 'sale' && pred(d.date || ''); }).reduce(function (a, d) { return a + num(d.total); }, 0)); };
    var recv = 0, pay = 0;
    Object.keys(P).forEach(function (k) { if (P[k].bal > 0) recv += P[k].bal; else pay -= P[k].bal; });
    var bw = B.bills(D, bizName()).bills.filter(function (b) { return b.side === 'recv'; }).sort(function (a, b) { return a.date.localeCompare(b.date); }).slice(0, 6);
    var tiles = [['today', sales(function (x) { return x === today; }), '#sales'], ['month', sales(function (x) { return x.slice(0, 7) === mon; }), '#sales'],
      ['recv', r2(recv), '#dues'], ['pay', r2(pay), '#dues/pay'], ['cashin', A.cash || 0, '#cash'], ['bank', bankSum(A), '#cash/bank']];
    var recent = D.filter(function (d) { return B.role(d); }).sort(function (a, b) { return (b.date || '').localeCompare(a.date || '') || (b.updated || 0) - (a.updated || 0); }).slice(0, 8);
    var cf = cashFlow(D, mon), owe = Object.keys(P).map(function (k) { return P[k]; }).filter(function (p) { return p.bal > 0.004; }).sort(function (a, b) { return b.bal - a.bal; }).slice(0, 5);
    /* every part carries data-dash (and each tile data-tile) so the person can arrange the Dashboard (dash.js) */
    return '<h2>' + esc(T('home')) + ' <small class="soft">' + esc(bizName()) + '</small></h2><div class="dash-root">' +
      '<div class="tiles" data-dash="tiles">' + tiles.map(function (x) { return '<a href="' + x[2] + '" data-tile="' + x[0] + '" class="tile' + (x[1] < 0 ? ' neg' : '') + '"><span>' + esc(T(x[0])) + '</span><b>' + money(x[1]) + '</b></a>'; }).join('') + '</div>' +
      /* cash below zero: money went out that never came in, usually the opening cash is missing (round C) */
      ((A.cash || 0) < -0.004 ? '<p class="note">' + esc(T('negcash')) + ' <button type="button" class="btn sm" data-form="ob">' + esc(T('ob')) + '</button></p>' : '') +
      '<div class="card" data-dash="quick"><h3>' + esc(T('quick')) + '</h3><div class="quick">' +
        '<a class="btn primary" data-q="newinv" href="' + toolUrl('billing') + '">+ ' + esc(T('newinv')) + '</a>' +
        '<button type="button" class="btn primary" data-quick aria-keyshortcuts="Control+Alt+Q">' + esc(T('qe_title')) + ' <kbd>Ctrl Alt Q</kbd></button>' +
        ['min', 'mout', 'pbill', 'exp', 'ob', 'sale', 'contra', 'pret'].map(function (f) { return '<button type="button" class="btn" data-form="' + f + '">+ ' + esc(T(f === 'sale' ? 'qe_sale' : f)) + '</button>'; }).join('') + '</div></div>' +
      '<div class="card" data-dash="overdue"><h3>' + esc(T('overdue')) + '</h3>' + (bw.length ? '<ul class="rows">' + bw.map(function (b) {
        return '<li><a href="#st/' + encodeURIComponent(key(b.party)) + '"><b>' + esc(b.party) + '</b><span class="soft">' + esc(docName(b)) + ' ' + esc(b.no) + ' · ' + ldate(b.date) + ' · ' + esc(T('days', { n: B.daysBetween(b.date, today) })) + '</span></a><b class="amt">' + money(b.left) + '</b></li>'; }).join('') + '</ul>'
        : '<p class="soft">' + esc(T('nodues')) + '</p>') + '</div>' +
      '<div class="card" data-dash="cf"><h3>' + esc(T('d_cf')) + ' <small class="soft">' + esc(bizName()) + '</small></h3><div class="tiles">' + [['d_in', cf.inn], ['d_out', cf.out], ['d_net', cf.net]].map(function (x) { return '<div class="tile' + (x[1] < 0 ? ' neg' : '') + '"><span>' + esc(T(x[0])) + '</span><b>' + money(x[1]) + '</b></div>'; }).join('') + '</div></div>' +
      '<div class="card" data-dash="top"><h3>' + esc(T('d_top')) + '</h3>' + (owe.length ? '<ul class="rows">' + owe.map(function (p) { return '<li><a href="#st/' + encodeURIComponent(p.key) + '"><b>' + esc(p.name) + '</b></a><b class="amt">' + money(p.bal) + '</b></li>'; }).join('') + '</ul><p><a class="link" href="#dues">' + esc(T('dues')) + ' ›</a></p>' : '<p class="soft">' + esc(T('nodues')) + '</p>') + '</div>' +
      HOME.map(function (f, i) { var h = ''; try { h = f() || ''; } catch (e) {} return h ? '<div class="dash-x" data-dash="x' + i + '">' + h + '</div>' : ''; }).join('') +
      '<div class="card" data-dash="recent"><h3>' + esc(T('recent')) + '</h3>' + rowsHtml(recent) + '</div>' +
      '<details class="card" data-dash="help"><summary><b>' + esc(T('help')) + '</b></summary><p>' + esc(T('helpp')) + '</p><p class="soft">' + esc(T('invfix')) + '</p></details></div>';
  }

  /* one line per record, with its actions */
  /* record types another part of the App edits through NSApp.editX (acctx, more, finrep, mfg, staff); canEdit lets them say no (a GST set-off) */
  var XEDIT = /^(jv|fa|stk|wo|oinc|taxpay|pdd|sadv|loan|emi)$/;
  /* phones (phone.css): one row = party, number and date on the left; amount and "overdue by N days" on the right */
  function overdueDays(id) { var du = DUE[id]; if (!du || du >= NS.today()) return 0; return B.daysBetween(du, NS.today()); }
  function phRow(d, left, ty) {
    var party = B.partyName(d) || (d.cat ? catName(d.cat) : '') || docName(d), l = left[d.id], st = '', cl = '';
    if (l != null) {
      var od = l > 0.004 ? overdueDays(d.id) : 0;
      if (l <= 0.004) { st = T('paid'); cl = ' ok'; }
      else if (od) { st = NS.t(od === 1 ? 'ph.od1' : 'ph.od', { n: od }); cl = ' bad'; }
      else if (l < amountOf(d) - 0.004) { st = T('left', { a: money(l) }); cl = ' warn'; }
      else { st = T('unpaid'); cl = ' warn'; }
    }
    return '<span class="ph-r"><span class="ph-l"><b>' + esc(party) + '</b><span class="soft">' + esc((d.no || d.billNo ? (B.partyName(d) ? '' : docName(d) + ' ') + (d.no || d.billNo) : docName(d)) + ' · ') + '<span class="nw">' + esc(ldate(d.date)) + '</span>' + '</span></span>' +
      '<span class="ph-a"><b>' + money(amountOf(d)) + '</b>' + (st ? '<span class="ph-s' + cl + '">' + esc(st) + '</span>' : '') + '</span></span>' +
      '<button type="button" class="ph-m" data-phrow aria-label="' + esc(NS.t('ph.rowmore')) + '" aria-expanded="false">' + NS.icSvg('more') + '</button>';
  }
  function rowsHtml(list, opts) {
    opts = opts || {};
    if (!list.length) return '<p class="soft">' + esc(T('none')) + '</p>';
    var left = opts.left || {};
    return '<ul class="rows">' + list.map(function (d) {
      var ty = d.type || 'invoice', site = (d.type === 'note' && d.kind === 'debit' ? 'debit-note' : SITEOF[ty]), appMade = d.app || /^(pbill|exp|ob|contra)$/.test(ty), pills = '';
      if (left[d.id] != null) pills = left[d.id] <= 0.004 ? '<span class="pill ok">' + esc(T('paid')) + '</span>' : left[d.id] < amountOf(d) - 0.004 ? '<span class="pill warn">' + esc(T('left', { a: money(left[d.id]) })) + '</span>' : '<span class="pill warn">' + esc(T('unpaid')) + '</span>';
      if (d.nextNo) pills += ' <span class="pill">' + esc(T('made', { x: d.nextNo })) + '</span>';
      if (d.cancelled && NS.cxPill) pills += NS.cxPill(d);   /* A-3 */
      if (B.bounced(d)) pills += ' <span class="pill bad">' + esc(T('c_bounce')) + '</span>';
      else if (d.mode === 'cheque' && d.chq && d.chq.st && d.chq.st !== 'ok') pills += ' <span class="pill warn">' + esc(T('c_' + d.chq.st)) + '</span>';
      if (d.status === 'inv' && d.invNo) pills += ' <span class="pill ok">' + esc(T('made', { x: d.invNo })) + '</span>';
      var acts = [], ib = function (attr, ic, lbl, cls) { return '<button type="button" class="btn sm ib' + (cls ? ' ' + cls : '') + '" ' + attr + ' title="' + esc(lbl) + '" aria-label="' + esc(lbl) + '">' + NS.icSvg(ic) + '</button>'; };
      /* every entry opens to look at it (its lines, its accounting entry, the bill photo); the small buttons show only an icon, the name on hover */
      acts.push(ib('data-view="' + d.id + '"', 'eye', T('open')));
      if (B.partyName(d) && window.NSEnvelope) acts.push(ib('data-env-doc="' + d.id + '"', 'mail', 'Print an envelope'));
      var xed = !appMade && XEDIT.test(ty) && (ty !== 'stk' || /^(move|make|jobout|jobin)$/.test(d.kind || ''));   /* stock counts and adjustments are changed on the stock site */
      if ((appMade && ty !== 'cashmemo') || xed) acts.push(ib('data-edit="' + d.id + '"', 'edit', T('edit')));
      /* a document made in a maker (invoice, quotation...) is changed there: the button says Edit; the App's own receipts keep Open (to print) */
      if (docUrl(d) && (!site || !appMade || /^(receipt|voucher|cashmemo)$/.test(ty))) acts.push('<a class="btn sm ib" href="' + docUrl(d) + (appMade ? '&amp;print=1' : '') + '" title="' + esc(T(appMade ? 'print' : 'edit')) + '" aria-label="' + esc(T(appMade ? 'print' : 'edit')) + '">' + NS.icSvg(appMade ? 'print' : 'edit') + '</a>');
      /* a document made in a maker: Print opens it there and prints at once */
      if (docUrl(d) && !appMade) acts.push('<a class="btn sm ib" href="' + docUrl(d) + '&amp;print=1" title="' + esc(T('print')) + '" aria-label="' + esc(T('print')) + '">' + NS.icSvg('print') + '</a>');
      if (left[d.id] > 0.004 && (ty === 'invoice' || ty === 'cashmemo')) acts.push('<button type="button" class="btn sm" data-form="min" data-for="' + d.id + '">' + esc(T('recpay')) + '</button>');
      if (left[d.id] > 0.004 && ty === 'pbill') acts.push('<button type="button" class="btn sm" data-form="mout" data-for="' + d.id + '">' + esc(T('recpay')) + '</button>');
      if (CONVERT[ty] && !opts.noconv) acts.push('<select class="sm conv" data-conv="' + d.id + '" aria-label="' + esc(T('convert')) + ' ' + esc(d.no || '') + '"><option value="">' + esc(T('convert')) + '…</option>' +
        CONVERT[ty].map(function (x) { return '<option value="' + x + '">' + esc(x === 'grn' || x === 'pbill' ? NS.t(x === 'grn' ? 'or.mk_grn' : 'or.mk_pbill') : T(x === 'invoice' ? 'makeinv' : x === 'so' ? 'makeso' : 'makedc')) + '</option>'; }).join('') + '</select>');
      if (window.NSReuse && ty === 'pbill' && d.kind !== 'return' && d.items && d.items.length) acts.push(ib('data-reorder="' + d.id + '"', 'repeat', NS.t('cap.again_order')));
      if (window.NSReuse && /^(invoice|cashmemo)$/.test(ty) && docUrl(d) && d.items && d.items.length) acts.push('<a class="btn sm ib" href="' + docUrl(d).replace('open=', 'copy=') + '" title="' + esc(NS.t('cap.again_sale')) + '" aria-label="' + esc(NS.t('cap.again_sale')) + '">' + NS.icSvg('repeat') + '</a>');
      if ((ty === 'invoice' || ty === 'cashmemo') && B.partyName(d)) acts.push(ib('data-rowwa="' + d.id + '"', 'wa', T('rwa'), 'wa'));
      if (ty === 'exp') acts.push(ib('data-vprint="' + d.id + '"', 'print', T('print')));
      if (NS.cxBtn && d.no && (d.cancelled || B.role(d))) acts.push(NS.cxBtn(d, 'btn sm ib'));   /* A-3: Cancel voucher / Undo cancel */
      if (appMade || xed) acts.push(ib('data-del="' + d.id + '"', 'trash', T('del'), 'danger'));
      return '<li><div class="ln"><span><b>' + esc(docName(d)) + ' ' + esc(d.no || d.billNo || (ty === 'exp' && d.vno) || '') + '</b> ' + pills + '<span class="soft"> · <span class="nw">' + ldate(d.date) + '</span>' + (B.partyName(d) ? ' · ' + esc(B.partyName(d)) : d.cat ? ' · ' + esc(catName(d.cat)) : '') + '</span></span>' +
        '<b class="amt">' + money(amountOf(d)) + '</b>' + phRow(d, left, ty) + '</div><div class="acts">' + acts.join('') + '</div></li>';
    }).join('') + '</ul>';
  }
  function leftMap(D) { var m = {}; D.forEach(function (d) { if (/^(sale|buy|sdeb)$/.test(B.role(d))) m[d.id] = 0; }); B.bills(D, bizName()).bills.forEach(function (b) { m[b.id] = b.left; DUE[b.id] = b.due || ''; }); return m; }
  function searchBar(filters) {
    return '<div class="tools-row"><label class="sr" for="app-q">' + esc(T('search')) + '</label><input id="app-q" type="search" data-q value="' + esc(q) + '" placeholder="' + esc(T('search')) + '">' +
      (filters ? '<div class="seg" role="group">' + filters.map(function (f) { return '<button type="button" class="btn sm' + (/^(overdue|in|out)$/.test(f) ? ' ph-only' : '') + '" data-filt="' + f + '" aria-pressed="' + (filt === f) + '">' + esc(/^(overdue|in|out)$/.test(f) ? NS.t('ph.f_' + f) : T(f)) + '</button>'; }).join('') + '</div>' : '') + '</div>';
  }
  function match(d) { return !q || JSON.stringify([d.no, d.billNo, B.partyName(d), d.cat, d.ref]).toLowerCase().indexOf(q.toLowerCase()) >= 0; }
  function sorted(list) {
    if (sortBy === 'old') return list.slice().sort(function (a, b) { return byDate(b, a); });
    if (sortBy === 'high') return list.slice().sort(function (a, b) { return Math.abs(amountOf(b)) - Math.abs(amountOf(a)); });
    if (sortBy === 'low') return list.slice().sort(function (a, b) { return Math.abs(amountOf(a)) - Math.abs(amountOf(b)); });
    return list;
  }
  function typeOk(d) { return !typeBy || (d.type || 'invoice') === typeBy; }
  function byDate(a, b) { return (b.date || '').localeCompare(a.date || '') || (b.updated || 0) - (a.updated || 0); }

  function salesHtml() {
    var D = mine(), L = leftMap(D);
    var list = D.filter(function (d) { return SALES[d.type || 'invoice'] && !(d.type === 'note' && d.side === 'purchase'); }).filter(match).filter(function (d) {
      if (filt === 'unpaid') return L[d.id] > 0.004; if (filt === 'overdue') return L[d.id] > 0.004 && overdueDays(d.id) > 0; if (filt === 'paid') return L[d.id] != null && L[d.id] <= 0.004; return true; }).filter(typeOk).sort(byDate);
    list = sorted(list);
    return '<div class="pane-hd" data-phkind="sales"><h2>' + esc(T('sales')) + '</h2><a class="btn primary" href="' + toolUrl('billing') + '">+ ' + esc(T('newinv')) + '</a></div>' + searchBar(['all', 'unpaid', 'overdue', 'paid']) + rowsHtml(list.slice(0, 200), { left: L });
  }
  function buyHtml() {
    var D = mine(), L = leftMap(D);
    var list = D.filter(function (d) { return /^(pbill|exp|self|po)$/.test(d.type) || d.type === 'voucher' && !d.forBill || d.type === 'note' && d.side === 'purchase'; }).filter(match).filter(function (d) {
      if (filt === 'unpaid') return L[d.id] > 0.004 || d.type === 'exp' && d.mode === 'credit'; if (filt === 'overdue') return L[d.id] > 0.004 && overdueDays(d.id) > 0; if (filt === 'paid') return L[d.id] != null && L[d.id] <= 0.004; return true; }).filter(typeOk).sort(byDate);
    list = sorted(list);
    return '<div class="pane-hd" data-phkind="buy"><h2>' + esc(T('buy')) + '</h2><div class="quick">' + ['pbill', 'exp', 'pret'].map(function (f) { return '<button type="button" class="btn' + (f === 'pbill' ? ' primary' : '') + '" data-form="' + f + '">+ ' + esc(T(f)) + '</button>'; }).join('') + (window.NSApp && NSApp.scan ? '<button type="button" class="btn" data-scan data-ic="camera">' + esc(NS.t('cap.btn')) + '</button>' : '') + '</div></div>' +
      searchBar(['all', 'unpaid', 'overdue', 'paid']) + rowsHtml(list.slice(0, 200), { left: L });
  }
  function moneyHtml() {
    var list = mine().filter(function (d) { return d.type === 'receipt' || d.type === 'voucher' && d.forBill || d.type === 'ob' || d.type === 'contra'; }).filter(match).filter(function (d) { return filt === 'in' ? d.type === 'receipt' : filt === 'out' ? d.type === 'voucher' : true; }).filter(typeOk).sort(byDate);
    list = sorted(list);
    return '<div class="pane-hd" data-phkind="money"><h2>' + esc(T('money')) + '</h2><div class="quick"><button type="button" class="btn primary" data-form="min">+ ' + esc(T('min')) + '</button><button type="button" class="btn" data-form="mout">+ ' + esc(T('mout')) + '</button><button type="button" class="btn" data-form="ob">+ ' + esc(T('ob')) + '</button></div></div>' +
      searchBar(['all', 'in', 'out']) + rowsHtml(list.slice(0, 200));
  }

  var stFrom = '', stTo = '';
  /* the report period: one for every report (NS.period, ERP review R-3); f / t change it */
  function range(f, t) {
    if (NS.period) { if (f || t) NS.periodSet(f, t); var p = NS.period(); stFrom = p.from; stTo = p.to; needYears(stFrom); return [stFrom, stTo]; }
    if (f) stFrom = f; if (t) stTo = t; if (!stTo) stTo = NS.today(); if (!stFrom) stFrom = fyStart(stTo); return [stFrom, stTo];
  }
  /* follow-ups on dues: when a party was last reminded and the date it promised to pay (data home meta 'followups', per business) */
  var FU = {};
  function fuKey(k) { return (BIZ && BIZ.id || '') + '|' + k; }
  function fuGet(k) { return FU[fuKey(k)] || {}; }
  function fuSet(k, patch) {
    var o = Object.assign({}, fuGet(k), patch);
    if (!o.last && !o.promise) delete FU[fuKey(k)]; else FU[fuKey(k)] = o;
    NSStore.meta('followups', FU).catch(function () {});
  }
  function fuLine(k) {
    var f = fuGet(k), t = NS.today();
    return (f.last ? '<br><span class="soft fu-l">' + esc(T('fu_last', { d: ldate(f.last) })) + '</span>' : '') +
      '<br><label class="fu-p"><span class="soft">' + esc(T('fu_promise')) + '</span> <input type="date" data-promise="' + esc(k) + '" value="' + esc(f.promise || '') + '"></label>' +
      (f.promise && f.promise < t ? ' <span class="b1-warn">' + esc(T('fu_broken')) + '</span>' : '');
  }
  function fuBulk(rows) {
    var sel = $$('[data-fupick]:checked').map(function (c) { return c.getAttribute('data-fupick'); });
    if (!sel.length) { NS.toast(T('fu_none')); return; }
    var P = B.parties(mine(), bizName()), dlg = $('#fu-dlg');
    if (!dlg) { dlg = NS.el('dialog', { id: 'fu-dlg', class: 'bz-dlg', 'aria-label': T('fu_bulk') }); document.body.appendChild(dlg); }
    dlg.innerHTML = '<h3>' + esc(T('fu_bulk')) + '</h3><p class="soft">' + esc(T('fu_bulkh')) + '</p><ul class="rows">' + sel.map(function (k) {
      var p = P[k] || { name: k, bal: 0 }, has = phoneOf(k, P);
      return '<li><div class="ln"><span><b>' + esc(p.name) + '</b></span><b class="amt">' + money(p.bal) + '</b></div><div class="acts">' +
        (has ? '<button type="button" class="btn sm wa" data-fusend="' + esc(k) + '">' + esc(T('fu_send')) + '</button>' : '<span class="soft">' + esc(T('fu_nophone')) + '</span>') + '</div></li>'; }).join('') +
      '</ul><div class="btns"><button type="button" class="btn" data-fuclose>' + esc(T('fu_close')) + '</button></div>';
    dlg.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-fuclose')) { dlg.close(); show(false, true); }
      else if (b.hasAttribute('data-fusend')) { whatsapp(b.getAttribute('data-fusend')); b.disabled = true; b.textContent = T('fu_sent'); }
    });
    if (!dlg.open) dlg.showModal();
  }
  function fuWire(pane) {
    $$('[data-promise]', pane).forEach(function (i) { i.addEventListener('change', function () { fuSet(i.getAttribute('data-promise'), { promise: i.value }); show(false, true); }); });
    var all = $('[data-fuall]', pane);
    if (all) all.addEventListener('click', function () {
      var boxes = $$('[data-fupick]', pane), on = boxes.some(function (c) { return !c.checked; });
      boxes.forEach(function (c) { c.checked = on && c.hasAttribute('data-late'); });
    });
  }
  /* WhatsApp text for one bill (the bill itself is opened with Open, where Share PDF is) */
  function rowWa(id) {
    var d = C.doc.filter(function (x) { return x.id === id; })[0]; if (!d) return;
    var k = key(B.partyName(d)), P = B.parties(mine(), bizName()), left = leftMap(mine())[id], ph = phoneOf(k, P);
    var msg = T('rwa_msg', { p: B.partyName(d), n: d.no || docName(d), d: ldate(d.date), b: bizName(), a: money(amountOf(d)), l: left > 0.004 ? T('rwa_left', { l: money(left) }) : '' }) + (BIZ && BIZ.upi && left > 0.004 ? ' ' + NS.t('uf.waupi', { u: BIZ.upi, a: money(left) }) : '');
    if (ph.length === 10) ph = '91' + ph;
    if (!ph) NS.toast(T('nophone', { p: B.partyName(d) }));
    window.open('https://wa.me/' + (ph.length >= 11 ? ph : '') + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
  }
  /* what is in every bank account together (several banks: ERP masters step 3) */
  function bankSum(A) { return r2(Object.keys(A).reduce(function (s, k) { return B.isBank(k) ? s + A[k] : s; }, 0)); }
  /* cash and bank movement of a month, contra transfers and opening balances left out */
  function cashFlow(D, mon) {
    var o = { inn: 0, out: 0 };
    B.inBooks(D, bizName()).forEach(function (d) {
      if (d.type === 'contra' || d.type === 'ob' || (d.date || '').slice(0, 7) !== mon) return;
      B.postings(d).forEach(function (l) { if (l.a === 'cash' || B.isBank(l.a)) { o.inn += l.dr; o.out += l.cr; } });
    });
    return { inn: r2(o.inn), out: r2(o.out), net: r2(o.inn - o.out) };
  }
  /* ---------- dues with ageing ---------- */
  function duesHtml() {
    var side = arg === 'pay' ? 'pay' : 'recv', D = mine(), today = NS.today(), R = B.bills(D, bizName());
    var by = {};
    R.bills.filter(function (b) { return b.side === side; }).forEach(function (b) { var k = key(b.party); (by[k] = by[k] || { name: b.party, list: [] }).list.push(b); });
    var P = B.parties(D, bizName()), rows = Object.keys(by).map(function (k) {
      /* credit days of the party (Configuration Hub) give bills without a due date one; ageing then counts from the due date */
      var pm = C.party.filter(function (p) { return key(p.name) === k; })[0] || {}, list = by[k].list.map(function (b) { return b.due || !num(pm.cdays) ? b : Object.assign({}, b, { due: B.addDays(b.date, num(pm.cdays)) }); });
      var a = B.ageing(list, today, true), tot = r2(a[0] + a[1] + a[2] + a[3]);
      return { k: k, name: by[k].name, a: a, tot: tot, phone: phoneOf(k, P), late: B.overdue(list, today), lim: num(pm.climit), over: num(pm.climit) && side === 'recv' && tot > num(pm.climit) };
    })
      .filter(function (r) { return (!q || r.name.toLowerCase().indexOf(q.toLowerCase()) >= 0) && grpKeep(r.k, P) && (!window.NSCF || NSCF.partyPass(r.k, 'dues')); }).sort(function (a, b) { return b.tot - a.tot; });
    var tot = [0, 0, 0, 0]; rows.forEach(function (r) { r.a.forEach(function (v, i) { tot[i] = r2(tot[i] + v); }); });
    var advs = Object.keys(R.advances).filter(function (k) { return R.advances[k][side] > 0.004; });
    return '<div class="pane-hd"><h2>' + esc(T('dues')) + '</h2><div class="seg" role="group"><a class="btn sm" href="#dues" aria-pressed="' + (side === 'recv') + '">' + esc(T('recv')) + '</a><a class="btn sm" href="#dues/pay" aria-pressed="' + (side === 'pay') + '">' + esc(T('pay')) + '</a></div></div>' +
      '<div class="tiles">' + ['a0', 'a1', 'a2', 'a3'].map(function (x, i) { return '<div class="tile' + (i === 3 && tot[3] ? ' warn' : '') + '"><span>' + rng(esc(T(x))) + '</span><b>' + money(tot[i]) + '</b></div>'; }).join('') + '</div>' +
      (window.NSApp && NSApp.duesExtra ? NSApp.duesExtra(side) : '') + searchBar() + '<div class="tools-row">' + grpSel() + (window.NSApp && NSApp.routeSel ? NSApp.routeSel() : '') + (window.NSCF ? NSCF.filterBar('dues', ['party']) : '') + (side === 'recv' && rows.length ? '<button type="button" class="btn sm" data-fuall>' + esc(T('fu_pickall')) + '</button><button type="button" class="btn sm wa" data-fubulk>' + esc(T('fu_bulk')) + '</button>' : '') + '</div>' +
      (rows.length ? '<div class="tbl-wrap"><table class="tbl dues-t"><thead><tr><th>' + esc(T('party')) + '</th>' + ['a0', 'a1', 'a2', 'a3'].map(function (x) { return '<th class="n">' + rng(esc(T(x))) + '</th>'; }).join('') + '<th class="n">' + esc(T('totaldue')) + '</th><th class="n">' + esc(NS.t('b1.late')) + '</th><th></th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><th scope="row">' + (side === 'recv' && r.phone ? '<input type="checkbox" class="fu-pick" data-fupick="' + esc(r.k) + '"' + (r.late ? ' data-late' : '') + ' aria-label="' + esc(T('fu_pick', { p: r.name })) + '"> ' : '') + '<a href="#st/' + encodeURIComponent(r.k) + '">' + esc(r.name) + '</a>' + (window.NSApp && NSApp.routeTag ? NSApp.routeTag(r.k) : '') + (side === 'recv' ? fuLine(r.k) : '') + (r.over ? '<br><span class="b1-warn">' + esc(NS.t('b1.overlim', { v: money(r.lim) })) + '</span>' : '') + '</th>' + r.a.map(function (v, i) { return '<td class="n' + (v ? '' : ' nil') + '" data-l="' + rng(esc(T('a' + i))) + '">' + (v ? money(v, false) : '—') + '</td>'; }).join('') +
            '<td class="n" data-l="' + esc(T('totaldue')) + '"><b>' + money(r.tot, false) + '</b></td><td class="n' + (r.late ? ' b1-warn' : ' nil') + '" data-l="' + esc(NS.t('b1.late')) + '">' + (r.late ? money(r.late, false) : '—') + '</td><td class="acts">' + (side === 'recv' ? '<button type="button" class="btn sm wa" data-wa="' + esc(r.k) + '">' + esc(T('remind')) + '</button>' : '') +
            '<button type="button" class="btn sm" data-form="' + (side === 'recv' ? 'min' : 'mout') + '" data-party="' + esc(r.name) + '">' + esc(T('recpay')) + '</button> ' + envBtn('data-env-name="' + esc(r.name) + '"') + '</td></tr>'; }).join('') +
        '</tbody></table></div>' : '<p class="soft">' + esc(T('nodues')) + '</p>') +
      '<p class="soft">' + esc(NS.t('b1.ageh')) + '</p>' +
      (advs.length ? '<div class="card"><h3>' + esc(T('advance')) + '</h3><p class="soft">' + esc(T('advh')) + '</p><ul class="rows">' + advs.map(function (k) {
        return '<li><a href="#st/' + encodeURIComponent(k) + '"><b>' + esc((P[k] || { name: k }).name) + '</b></a><b class="amt">' + money(R.advances[k][side]) + '</b></li>'; }).join('') + '</ul></div>' : '');
  }
  /* an age range like 0–30 keeps its order in right-to-left languages */
  function rng(s) { return String(s).replace(/(\d+\s*[–-]\s*\d+\+?|\d+\+)/g, '\u2066$1\u2069'); }
  function phoneOf(k, P) {
    var m = C.party.filter(function (p) { return key(p.name) === k; })[0];
    return String(m && m.phone || P && P[k] && P[k].phone || '').replace(/\D/g, '');
  }

  function partiesHtml() {
    var P = B.parties(mine(), bizName()), list = Object.keys(P).map(function (k) { return P[k]; }).filter(function (p) { return (!q || p.name.toLowerCase().indexOf(q.toLowerCase()) >= 0) && grpKeep(p.key, P) && (!window.NSCF || NSCF.partyPass(p.key, 'parties')); })
      .sort(function (a, b) { return Math.abs(b.bal) - Math.abs(a.bal); });
    var gmap = {}; B.groupTree(GRP).forEach(function (g) { gmap[g.id] = g; });
    return '<div class="pane-hd"><h2>' + esc(T('parties')) + '</h2><div class="quick">' + (DOOR ? '' : '<a class="btn" href="#grp">' + esc(T('grp')) + '</a>') + '<a class="btn" href="' + myUrl('#party') + '">' + esc(NS.t('my.t.party')) + ' ›</a></div></div>' + searchBar() +
      '<div class="tools-row">' + grpSel() + (window.NSApp && NSApp.routeSel ? NSApp.routeSel() : '') + (window.NSCF ? NSCF.filterBar('parties', ['party']) : '') + '</div>' +
      (list.length ? '<ul class="rows">' + list.map(function (p) {
        var g = gmap[gidOf(p.key, P)];
        return '<li><a href="#st/' + encodeURIComponent(p.key) + '"><b>' + esc(p.name) + '</b><span class="soft">' + (g ? esc(gname(g)) + ' · ' : '') + esc(NS.t(p.bal > 0.004 ? 'ux.p.recv' : p.bal < -0.004 ? 'ux.p.pay' : 'ux.p.nil')) + '</span></a>' +
          '<b class="amt' + (p.bal < 0 ? ' neg' : '') + '">' + money(Math.abs(p.bal)) + (p.bal > 0.004 ? ' ' + T('dr') : p.bal < -0.004 ? ' ' + T('cr') : '') + '</b>' + envBtn('data-env-name="' + esc(p.name) + '"') + '</li>'; }).join('') + '</ul>' : '<p class="soft">' + esc(T('none')) + '</p>');
  }

  /* ---------- party groups (meta 'groups', made in My data; the party ledger and group reports live in ledger.js) ---------- */
  var groupOf = function (p, m) { return (NS.partyGroup || B.partyGroup)(p, m); };
  /* group id of a party key: the party master's group, else Customers / Suppliers by its role (or by its balance when it has no master) */
  function gidOf(k, P) {
    var rec = C.party.filter(function (x) { return key(x.name) === k; })[0];
    if (!rec) rec = { name: k, role: P && P[k] && P[k].bal < -0.004 ? 'supplier' : 'customer' };
    return groupOf(rec, GRP).id;
  }
  /* built-in names: My data's words (grp.debtors / grp.creditors from ns-groups) when that pack has them, else the App's own */
  function gname(g) { if (!(g.builtin || B.BUILTIN[g.id])) return g.name; var k = 'grp.' + g.id, w = NS.t(k); return w !== k ? w : T('lg_g_' + g.id); }
  /* top: 'debtors' or 'creditors' on a screen of one side only; a group chosen on the other side is not used there (owner 19 Nov: Sundry Creditors showed Sundry Debtors) */
  function grpFor(top) { return !grp || !top || B.inGroup(grp, top, GRP) ? grp : ''; }
  function grpKeep(k, P, top) { var g = grpFor(top); return (!g || B.inGroup(gidOf(k, P), g, GRP)) && (!window.NSApp || !NSApp.routeKeep || NSApp.routeKeep(k)); }   /* route filter: route.js */
  /* group filter: All, Customers and its groups, Suppliers and its groups (sub-groups indented) */
  function grpSel(top) {
    var cur = grpFor(top), tree = B.groupTree(GRP).filter(function (g) { return !top || g.id === top || B.inGroup(g.id, top, GRP); });
    return '<label class="lg-gsel"><span>' + esc(T('lg_group')) + '</span> <select data-grp><option value="">' + esc(T('all')) + '</option>' + tree.map(function (g) {
      return '<option value="' + esc(g.id) + '"' + (g.id === cur ? ' selected' : '') + '>' + new Array(g.depth + 1).join('\u2003') + esc(gname(g)) + '</option>'; }).join('') + '</select></label>';
  }
  /* the statement is printed in English like every document */
  var ENDOC = { salary: 'Salary slip', rent: 'Rent receipt', petty: 'Petty cash', emi: 'Loan EMI', salpay: 'Salary paid', sadv: 'Employee advance', loan: 'Loan', pettyl: 'Petty cash', rentin: 'Rent received', sal: 'Salary slip', expinv: 'Export invoice', advadj: 'GST on advance adjusted', jv: 'Journal entry', fa: 'Fixed asset', stk: 'Stock entry', invoice: 'Invoice', cashmemo: 'Cash memo', credit: 'Credit note', debit: 'Debit note', receipt: 'Receipt', adv: 'Advance received', ref: 'Refund paid', voucher: 'Payment', pbill: 'Purchase bill', pret: 'Purchase return', exp: 'Expense', ob: 'Opening balance', self: 'Self invoice', oinc: 'Other income', don: 'Donation or subscription received', taxpay: 'Tax paid', gstset: 'GST set-off', wo: 'Write-off', pdd: 'Provision for doubtful debts' };
  function enName(d) {
    var ty = d.type || 'invoice';
    return ENDOC[ty === 'note' ? d.kind : ty === 'receipt' && d.kind !== 'pay' ? d.kind : ty === 'pbill' && d.kind === 'return' ? 'pret' : ty] || ty;
  }

  /* ---------- cash and bank ---------- */
  function cashHtml() {
    var acct = B.isBank(arg) ? arg : 'cash', today = NS.today();
    range();
    var Bk = B.book(mine(), bizName(), acct, stFrom, stTo);
    return '<div class="pane-hd"><h2>' + esc(T('cash')) + '</h2><div class="seg" role="group"><a class="btn sm" href="#cash" aria-pressed="' + (acct === 'cash') + '">' + esc(T('cashbook')) + '</a><a class="btn sm" href="#cash/bank" aria-pressed="' + (acct === 'bank') + '">' + esc(T('bankbook')) + '</a></div></div>' +
      '<p class="soft">' + esc(T('cbh')) + '</p>' +
      '<div class="tools-row"><label>' + esc(T('from')) + ' <input type="date" data-stfrom value="' + stFrom + '"></label><label>' + esc(T('to')) + ' <input type="date" data-stto value="' + stTo + '"></label></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + esc(T('date')) + '</th><th>' + esc(T('particulars')) + '</th><th class="n">' + esc(T('in')) + '</th><th class="n">' + esc(T('out')) + '</th><th class="n">' + esc(T('balance')) + '</th></tr></thead><tbody>' +
      '<tr><td>' + ldate(stFrom) + '</td><td>' + esc(T('opening')) + '</td><td></td><td></td><td class="n">' + money(Bk.open, false) + '</td></tr>' +
      Bk.rows.map(function (r) { return '<tr><td>' + ldate(r.date) + '</td><td>' + esc(docName(r.d)) + ' ' + esc(r.d.no || '') + (B.partyName(r.d) ? ' · ' + esc(B.partyName(r.d)) : r.d.cat ? ' · ' + esc(catName(r.d.cat)) : '') + '</td><td class="n">' + (r.dr ? money(r.dr, false) : '') + '</td><td class="n">' + (r.cr ? money(r.cr, false) : '') + '</td><td class="n">' + money(r.bal, false) + '</td></tr>'; }).join('') +
      '</tbody><tfoot><tr><th colspan="4">' + esc(T('closing')) + '</th><th class="n">' + money(Bk.close, false) + '</th></tr></tfoot></table></div>';
  }

  /* ---------- events ---------- */
  function wire(pane) {
    $$('[data-bizgo]', pane).forEach(function (b) { b.addEventListener('click', function () { setBiz(b.getAttribute('data-bizgo')); }); });
    var bs = $('[data-bizsw]', pane); if (bs) bs.addEventListener('click', switchBiz);
    var nd = $('[data-newdoc]', pane);
    if (nd) nd.addEventListener('change', function () { var v = nd.value; nd.value = ''; if (!v) return; var u = toolUrl(v) === '#' ? siteHome(v) : toolUrl(v); if (!openUrl(u)) location.href = u; });
    var qi = $('[data-q]', pane);
    if (qi) qi.addEventListener('input', function () { q = qi.value; var pos = qi.selectionStart; show().then(function () { var n = $('[data-q]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }); });
    $$('[data-filt]', pane).forEach(function (b) { b.addEventListener('click', function () { filt = b.getAttribute('data-filt'); show(); }); });
    $$('[data-grp]', pane).forEach(function (g) { g.addEventListener('change', function () { grp = g.value; show(); }); });
    $$('[data-stfrom],[data-stto]', pane).forEach(function (i) { i.addEventListener('change', function () { if (i.hasAttribute('data-stfrom')) range(i.value); else range('', i.value); show(); }); });
    pane.addEventListener('click', onClick);
    $$('[data-conv]', pane).forEach(function (s) { s.addEventListener('change', function () {
      if (!s.value) return;
      var v = s.value, src = C.doc.filter(function (x) { return x.id === s.getAttribute('data-conv'); })[0];
      if ((v === 'grn' || v === 'pbill') && window.NSOrd && NSOrd.makeFrom) { s.value = ''; NSOrd.makeFrom(s.getAttribute('data-conv'), v); return; }
      var go = function () { var u = toolUrl(SITEOF[v]) + '?from=' + encodeURIComponent(s.getAttribute('data-conv')); if (!openUrl(u)) location.href = u; };
      /* already converted once: ask before making a second one (round C) */
      if (src && src.nextNo) { s.value = ''; (NS.ask ? NS.ask(T('convagain', { x: src.nextNo })) : Promise.resolve(confirm(T('convagain', { x: src.nextNo })))).then(function (ok) { if (ok) go(); }); return; }
      go();
    }); });
    fuWire(pane);
  }
  function onClick(e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-reorder')) { var od = C.doc.filter(function (x) { return x.id === b.getAttribute('data-reorder'); })[0], dr = od && NSReuse.orderAgain(od); if (dr) { dr.date = NS.today(); openForm('pbill', { draft: dr, after: function (form) { var n = document.createElement('div'); n.className = 'scan-note'; n.setAttribute('role', 'note'); n.textContent = NS.t('cap.reorder_note', { p: B.partyName(od), d: ldate(od.date) }); form.insertBefore(n, form.firstChild); } }); } }
    else if (b.hasAttribute('data-scan') && window.NSApp && NSApp.scan) NSApp.scan();
    else if (b.hasAttribute('data-quick')) quickEntry(b.getAttribute('data-quick'));
    else if (b.hasAttribute('data-form')) openForm(b.getAttribute('data-form'), { forId: b.getAttribute('data-for'), party: b.getAttribute('data-party'), mode: b.getAttribute('data-mode'), side: b.getAttribute('data-side') || '', bacct: b.getAttribute('data-bacct') || '' });
    else if (b.hasAttribute('data-photo') || b.hasAttribute('data-view')) viewDoc(b.getAttribute('data-view') || b.getAttribute('data-photo'));
    else if (b.hasAttribute('data-vwprint')) printHtml($('.vw-body', b.closest('dialog')).innerHTML);
    else if (b.hasAttribute('data-edit')) { var d = C.doc.filter(function (x) { return x.id === b.getAttribute('data-edit'); })[0]; if (d && !(window.NSApp.editX && NSApp.editX(d))) openForm(formOf(d), { rec: d }); }
    else if (b.hasAttribute('data-del')) delRec(b.getAttribute('data-del'));
    else if (b.hasAttribute('data-wa')) whatsapp(b.getAttribute('data-wa'));
    else if (b.hasAttribute('data-rowwa')) rowWa(b.getAttribute('data-rowwa'));
    else if (b.hasAttribute('data-fubulk')) fuBulk();
    else if (b.hasAttribute('data-print')) window.print();
    else if (b.hasAttribute('data-vprint')) { var v = C.doc.filter(function (x) { return x.id === b.getAttribute('data-vprint'); })[0]; if (v) printVoucher(v); }
  }

  /* ---------- switch business: one list, reachable from every screen (title bar, status bar, Alt S) ---------- */
  var bzDlg = null, chipEl = null;
  function bizChip() {
    if (DOOR) return;
    var nav = $('.hd nav'), many = C.biz.length > 1 && !!BIZ;
    if (!chipEl && nav) {
      chipEl = document.createElement('button'); chipEl.type = 'button'; chipEl.className = 'btn sm bz-chip'; chipEl.setAttribute('data-noic', ''); chipEl.setAttribute('aria-haspopup', 'dialog'); chipEl.setAttribute('aria-keyshortcuts', 'Alt+S');
      chipEl.addEventListener('click', switchBiz); nav.insertBefore(chipEl, nav.firstChild);
    }
    if (chipEl) { chipEl.hidden = !many; if (many) { chipEl.innerHTML = '<b>' + esc(BIZ.name) + '</b> <span aria-hidden="true">▾</span>'; chipEl.title = T('biz') + ' (Alt S)'; chipEl.setAttribute('aria-label', T('biz') + ': ' + BIZ.name); } }
    var sb = $('[data-s-biz]');
    if (sb && BIZ) { sb.textContent = BIZ.name; sb.hidden = false; sb.classList.toggle('can', many); if (many && !sb._bz) { sb._bz = 1; sb.addEventListener('click', function () { if (C.biz.length > 1) switchBiz(); }); } }
  }
  function setBiz(id) {
    if (bzDlg && bzDlg.open) bzDlg.close();
    var b = C.biz.filter(function (x) { return x.id === id; })[0];
    if (!b || BIZ && b.id === BIZ.id) return;
    NS.setCurBiz(id);
    /* makers kept ready hold documents of the business just left: the next one starts fresh, in the new business */
    if (shelf) $$('.fr-box', shelf).forEach(function (x) { x.remove(); });
    q = ''; filt = 'all'; sortBy = 'new'; typeBy = '';
    if (cur === 'do' || cur === 'st') go(cur === 'do' && backTo && !/^(do|st)\//.test(backTo) ? backTo : 'home'); else show(true);
    apply(MEM || [C.biz, C.party, C.item, C.doc, null, GRP]);
    NS.toast('✓ ' + b.name);
  }
  function switchBiz() {
    if (C.biz.length < 2) return;
    if ($$('dialog').some(function (d) { return d.open && d !== bzDlg; })) return;
    if (!bzDlg) {
      bzDlg = document.createElement('dialog'); bzDlg.className = 'desk-keys bz-dlg'; bzDlg.setAttribute('aria-labelledby', 'bz-h'); document.body.appendChild(bzDlg);
      bzDlg.addEventListener('click', function (e) {
        var it = e.target.closest('[data-bizgo]');
        if (it) setBiz(it.getAttribute('data-bizgo')); else if (e.target === bzDlg || e.target.closest('[data-close], a')) bzDlg.close();
      });
      bzDlg.addEventListener('keydown', function (e) {
        var its = $$('[data-bizgo]', bzDlg), i = its.indexOf(document.activeElement);
        if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) { if (its[+e.key - 1]) { e.preventDefault(); e.stopPropagation(); setBiz(its[+e.key - 1].getAttribute('data-bizgo')); } }   /* not also the menu screen of that number (F7-8) */
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); (its[(i + (e.key === 'ArrowDown' ? 1 : its.length - 1)) % its.length] || its[0]).focus(); }
      });
    }
    if (bzDlg.open) { bzDlg.close(); return; }
    bzDlg.innerHTML = '<div class="dk-hd"><h2 id="bz-h">' + esc(T('biz')) + '</h2><button type="button" class="icon-btn" aria-label="' + esc(NS.t('close')) + '" data-close>✕</button></div><div class="bz-list">' +
      C.biz.map(function (b, i) {
        var on = BIZ && b.id === BIZ.id, sub = [b.gstin, b.city].filter(Boolean).join(' · ');
        return '<button type="button" class="bz-it" data-noic data-bizgo="' + esc(b.id) + '"' + (on ? ' aria-current="true"' : '') + '>' + (i < 9 ? '<kbd>' + (i + 1) + '</kbd>' : '<kbd></kbd>') +
          '<span class="bz-nm"><b>' + esc(b.name) + '</b>' + (sub ? '<small dir="ltr">' + esc(sub) + '</small>' : '') + '</span><span class="bz-ck" aria-hidden="true">' + (on ? '✓' : '') + '</span></button>'; }).join('') +
      '</div><p class="bz-ft"><a class="btn sm" href="' + myUrl('#biz/new') + '">+ ' + esc(T('addbiz')) + '</a></p>';
    bzDlg.showModal();
    var nx = $$('[data-bizgo]', bzDlg).filter(function (x) { return !x.hasAttribute('aria-current'); })[0]; if (nx) nx.focus();
  }

  /* ---------- a printed voucher for an expense or a staff advance: the hard copy the receiver signs (owner, 2026-11-11) ---------- */
  /* shared folder mode, one common series: the number of the document being saved was reserved in the folder just before (see submit) */
  var PRE = null;
  function vnoNext(date) {
    if (PRE && PRE.k === 'vno') return PRE.no;
    return nxAuto(NS.nextNo(vnoDocs(), nxApp('exp', 'EXP', date)));   /* one numbering engine (core.js, ERP A-6) */
  }
  /* these App screens have no number box: a 'manual' series still gets the next number here */
  function nxAuto(x) { return x.manual ? x.head + String(x.n).padStart(x.width, '0') + x.suffix : x.no; }
  /* App expenses keep our own voucher number in vno (no is the supplier's bill no.) */
  function vnoDocs() { return mine().filter(function (d) { return d.type === 'exp'; }).map(function (d) { return { id: d.id, type: 'exp', no: d.vno, date: d.date, seller: d.seller, vt: d.vt }; }); }
  /* the engine's options for an App voucher of this business (type, default prefix, date); receipts keep refund vouchers out of their series */
  function nxApp(type, pre, date) {
    var tag = ''; try { tag = localStorage.getItem('ns-sf-tag') || ''; } catch (e) {}
    return { type: type, seller: null, date: date, cfg: CFG, def: pre, tag: tag, match: type === 'receipt' ? function (d) { return d.kind !== 'ref'; } : null };
  }
  var ENMODE = { cash: 'Cash', upi: 'UPI', cheque: 'Cheque', bank: 'Bank transfer', card: 'Card', dd: 'Demand draft', other: 'Other', credit: 'On credit (not paid yet)' };
  function voucherSheet(d) {
    var b = BIZ || d.seller || {}, sadv = d.type === 'sadv', back = sadv && d.kind === 'back', amt = num(d.amount), who = sadv ? d.emp : B.partyName(d);
    var head = sadv ? '' : (EXP.indexOf(d.cat) >= 0 ? NS.tEn('app.ex_' + d.cat) : (function () { var h = window.NSHeads && NSHeads.find(d.cat); return h && h.en || d.cat || ''; })());
    var title = back ? 'ADVANCE RETURN RECEIPT' : sadv ? 'EMPLOYEE ADVANCE VOUCHER' : 'EXPENSE VOUCHER';
    var row = function (k, v) { return v ? '<tr><th scope="row">' + esc(k) + '</th><td>' + v + '</td></tr>' : ''; };
    var line = '<span class="vch-blank"></span>';
    return '<div class="stsheet sh vch" dir="ltr" lang="en" data-sheet>' + (d.cancelled ? '<div class="stamp cx-stamp">CANCELLED</div>' : '') +
      '<div class="st-hd"><div><b class="vch-biz">' + esc(b.name || '') + '</b>' + (b.addr ? '<br>' + esc(b.addr).replace(/\n/g, '<br>') : '') + ([b.city, b.pin].filter(Boolean).length ? '<br>' + esc([b.city, b.pin].filter(Boolean).join(' - ')) : '') +
        (b.phone ? '<br>Phone ' + esc(b.phone) : '') + (b.gstin ? '<br>GSTIN ' + esc(b.gstin) : '') + '</div>' +
      '<div class="r"><b class="vch-ttl">' + title + '</b><br>No. ' + (esc(sadv ? d.no || '' : d.vno || '') || line) + '<br>Date ' + ldate(d.date) + '</div></div>' +
      '<table class="tbl st vch-t"><tbody>' +
      row(back ? 'Received from' : 'Paid to', who ? esc(who) : line) +
      row('Towards', sadv ? (back ? 'Advance paid back' : 'Advance against salary / wages') + (d.notes ? ' · ' + esc(d.notes) : '') : esc(head) + (d.notes ? ' · ' + esc(d.notes) : '')) +
      row('Bill no.', !sadv && d.no ? esc(d.no) : '') +
      row(back ? 'Received by' : 'Paid by', esc(ENMODE[d.mode] || d.mode || '') + (d.ref ? ' · ' + esc(d.ref) : '')) +
      row('Amount', '<b class="vch-amt">' + NS.money(amt) + '</b>' + (!sadv && num(d.gst) ? ' <span class="soft">(includes GST at ' + esc(d.gst) + '%)</span>' : '') + '<br>' + esc(NS.inWords(amt))) +
      (window.NSCF ? ['meta', 'foot'].map(function (w) { return NSCF.printRows(d, NSCF.list(), '', w).map(function (r) { return row(r[0], esc(r[1])); }).join(''); }).join('') : '') +   /* custom fields (ERP Round 2) */
      '</tbody></table>' +
      '<p class="vch-rcv">' + (back ? 'Received the above amount.' : d.mode === 'credit' ? 'The above amount is payable.' : 'Received the above amount' + (sadv ? ' as advance. It may be adjusted against my salary / wages.' : '.')) + '</p>' +
      '<div class="vch-sign"><div>Prepared by</div><div>Approved by</div><div>' + (!back && d.mode === 'cash' && amt > 5000 ? '<span class="vch-stamp">Revenue stamp</span>' : '') +
        (back ? 'Signature of receiver (for ' + esc(b.name || '') + ')' : 'Signature of receiver' + (who ? '<small>' + esc(who) + '</small>' : '')) + '</div></div>' +
      NS.creditLine('st-ft') + '</div>';
  }
  function printVoucher(d) {
    var go = function (rec) {
      var host = $('#vch-print');
      if (!host) { host = document.createElement('div'); host.id = 'vch-print'; host.className = 'vch-print'; document.body.appendChild(host); }
      host.innerHTML = voucherSheet(rec);
      document.documentElement.classList.add('vch-on');
      var off = function () { window.removeEventListener('afterprint', off); document.documentElement.classList.remove('vch-on'); host.innerHTML = ''; };
      window.addEventListener('afterprint', off);
      setTimeout(function () { window.print(); }, 60);
    };
    /* an expense saved before vouchers had numbers gets its number now, so the paper and the record carry the same one */
    if (d.type === 'exp' && !d.vno) { var c = JSON.parse(JSON.stringify(d)); c.vno = vnoNext(c.date); NSStore.put('doc', c).then(function (s) { go(s || c); show(false, true); }, function () { go(d); }); }
    else go(d);
  }
  /* ---------- Open: look at one entry inside the App (owner 2026-11-18) ---------- */
  function printHtml(html) {
    var host = $('#vch-print');
    if (!host) { host = document.createElement('div'); host.id = 'vch-print'; host.className = 'vch-print'; document.body.appendChild(host); }
    host.innerHTML = '<div class="stsheet sh vw-print">' + html + '</div>';
    document.documentElement.classList.add('vch-on');
    var off = function () { window.removeEventListener('afterprint', off); document.documentElement.classList.remove('vch-on'); host.innerHTML = ''; };
    window.addEventListener('afterprint', off);
    setTimeout(function () { window.print(); }, 60);
  }
  function viewDoc(id) {
    var d = C.doc.filter(function (x) { return x.id === id; })[0]; if (!d) return;
    var ty = d.type || 'invoice', appMade = d.app || /^(pbill|exp|ob|contra)$/.test(ty), url = docUrl(d), m = function (v) { return v ? money(v) : ''; };
    var xed = !appMade && XEDIT.test(ty) && (ty !== 'stk' || /^(move|make|jobout|jobin)$/.test(d.kind || ''));
    var row = function (k, v) { return v ? '<tr><th scope="row">' + esc(T(k)) + '</th><td>' + v + '</td></tr>' : ''; };
    var party = B.partyName(d) || d.emp || d.lender || '';
    var h = '<div class="vw-top"><div><b class="vw-ttl">' + esc(docName(d)) + ' ' + esc(d.no || d.billNo || d.vno || '') + '</b><br><span class="soft">' + ldate(d.date) + (party ? ' · ' + esc(party) : '') + '</span></div>' +
      '<b class="vw-amt">' + money(amountOf(d)) + '</b></div>';
    h += '<table class="tbl vw-facts"><tbody>' + row('vw_mode', esc(ENMODE[d.mode] || d.mode || '')) + row('vw_ref', esc(d.ref || d.billNo && d.no !== d.billNo && d.billNo || '')) +
      row('vw_head', d.cat ? esc(EXP.indexOf(d.cat) >= 0 ? T('ex_' + d.cat) : catName(d.cat)) : '') + row('vw_due', d.due ? ldate(d.due) : '') + '</tbody></table>';
    if (d.items && d.items.length) h += '<h3>' + esc(T('vw_items')) + '</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + esc(T('lg_itm')) + '</th><th class="n">' + esc(T('lg_iqty')) + '</th><th class="n">' + esc(T('vw_rate')) + '</th><th class="n">' + esc(T('vw_gst')) + '</th><th class="n">' + esc(T('lg_iamt')) + '</th></tr></thead><tbody>' +
      d.items.map(function (it) { var a = num(it.qty || 0) * num(it.rate || 0) * (1 - num(it.disc || 0) / 100); return '<tr><td>' + esc(it.desc || '') + (it.hsn ? ' <small class="soft">HSN ' + esc(it.hsn) + '</small>' : '') + '</td><td class="n">' + esc(String(it.qty == null ? '' : it.qty)) + (it.unit ? ' ' + esc(it.unit) : '') + '</td><td class="n">' + m(num(it.rate)) + '</td><td class="n">' + (it.gst != null && it.gst !== '' ? esc(it.gst) + '%' : '') + '</td><td class="n">' + m(a) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    var P = [];
    try { P = B.postings(d) || []; } catch (e) { P = []; }
    if (P.length) {
      var an = function (a) { return NSApp.accName ? NSApp.accName(a, d) : a; }, td = 0, tc = 0;
      h += '<h3>' + esc(T('vw_entry')) + '</h3><div class="tbl-wrap"><table class="tbl vw-post"><thead><tr><th>' + esc(T('vw_acct')) + '</th><th class="n">' + esc(T('vw_dr')) + '</th><th class="n">' + esc(T('vw_cr')) + '</th></tr></thead><tbody>' +
        P.map(function (l) { td += l.dr; tc += l.cr; return '<tr><td>' + (l.cr ? '<span class="vw-to">' + esc(T('vw_to')) + '</span> ' : '') + esc(an(l.a)) + '</td><td class="n">' + m(l.dr) + '</td><td class="n">' + m(l.cr) + '</td></tr>'; }).join('') +
        '</tbody><tfoot><tr><th>' + esc(T('lg_itot')) + '</th><th class="n">' + money(td) + '</th><th class="n">' + money(tc) + '</th></tr></tfoot></table></div>';
    }
    var note = d.notes || d.narr || d.note || '';
    if (note) h += '<p class="vw-note"><b>' + esc(T('vw_note')) + ':</b> ' + esc(note) + '</p>';
    if (d.photo) h += '<h3>' + esc(T('photo')) + '</h3><img class="vw-photo" src="' + esc(d.photo) + '" alt="' + esc(T('photo')) + '">';
    if (d.cancelled) h = '<p class="cx-line" role="note">CANCELLED' + (d.cancelled.why ? ': ' + esc(d.cancelled.why) : '') + '</p>' + h;   /* A-3 */
    var acts = '';
    if (B.partyName(d) && window.NSEnvelope) acts += '<button type="button" class="btn" data-env-doc="' + d.id + '" data-close-box>Envelope</button>';
    if ((appMade && ty !== 'cashmemo') || xed) acts += '<button type="button" class="btn primary" data-edit="' + d.id + '" data-close-box>' + esc(T('edit')) + '</button>';
    if (NS.cxBtn && d.no && (d.cancelled || B.role(d))) acts += NS.cxBtn(d, 'btn').replace('<button ', '<button data-close-box ');
    if (url && !appMade) acts += '<a class="btn primary" href="' + url + '" data-close-box>' + esc(T('edit')) + '</a>';
    if (url && !appMade) acts += '<a class="btn" href="' + url + '&amp;print=1" data-close-box>' + esc(T('print')) + '</a>';
    if (url && appMade) acts += '<a class="btn" href="' + url + '&amp;print=1" data-close-box>' + esc(T('print')) + '</a>';   /* F1-12 */
    else if (/^(exp|sadv)$/.test(ty)) acts += '<button type="button" class="btn" data-vprint="' + d.id + '">' + esc(T('print')) + '</button>';
    else if (!url) acts += '<button type="button" class="btn" data-vwprint>' + esc(T('print')) + '</button>';
    var dlg = $('#vw-dlg');
    if (!dlg) {
      dlg = document.createElement('dialog'); dlg.id = 'vw-dlg'; dlg.className = 'vw-dlg';
      document.body.appendChild(dlg);
      dlg.addEventListener('click', function (e) { var x = e.target.closest('[data-close-box],[data-vwclose]'); if (x) dlg.close(); if (e.target.closest('button')) onClick(e); });
    }
    dlg.innerHTML = '<div class="dlg-hd"><h2>' + esc(T('open')) + ': ' + esc(docName(d)) + '</h2><button type="button" class="icon-btn" data-vwclose aria-label="' + esc(T('back')) + '" title="' + esc(T('back')) + '">&#10005;</button></div>' +
      '<div class="vw-body">' + h + '</div><div class="quick vw-acts">' + acts + '</div>';
    cardTables(dlg);   /* phone test 21 Nov: the item table cut off the Amount column */
    dlg.showModal();
  }
  function showPhoto(id) {
    var d = C.doc.filter(function (x) { return x.id === id; })[0]; if (!d || !d.photo) return;
    var w = window.open('', '_blank'); if (!w) return;
    fetch(d.photo).then(function (r) { return r.blob(); }).then(function (b) { w.location.href = URL.createObjectURL(b); });
  }
  /* a phone photo of the supplier's bill, made smaller (longest side 1400 px, JPEG) so the data home stays light */
  function shrinkPhoto(file) {
    return new Promise(function (res, rej) {
      var img = new Image(), u = URL.createObjectURL(file);
      img.onload = function () {
        var k = Math.min(1, 1400 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
        res(c.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = function () { URL.revokeObjectURL(u); rej(new Error('img')); };
      img.src = u;
    });
  }
  function formOf(d) { if (window.NSVDocs && NSVDocs.mine(d)) return 'vdoc'; return d.type === 'jv' ? 'jv' : (d.type || 'invoice') === 'invoice' ? 'sale' : d.type === 'contra' ? 'contra' : d.type === 'exp' ? 'exp' : d.type === 'ob' ? 'ob' : d.type === 'pbill' ? (d.kind === 'return' ? 'pret' : 'pbill') : d.type === 'receipt' ? 'min' : 'mout'; }

  function delRec(id) {
    var d = C.doc.filter(function (x) { return x.id === id; })[0]; if (!d) return;
    if (window.NSApp.closedMsg && NSApp.closedMsg(d.date)) { NS.toast(NSApp.closedMsg(d.date), 'bad'); return; }   /* closed financial year (more.js) */
    var msg = NS.t('b1.cdel', { x: docName(d) + ' ' + (d.no || '') });
    (NS.ask ? NS.ask(msg, { danger: true, ok: NS.t('desk.del') }) : Promise.resolve(confirm(msg))).then(function (yes) {
      if (!yes) return;
      var jobs = [NSStore.del('doc', id)];
      /* bills this payment had marked Paid go back to unpaid */
      C.doc.forEach(function (x) { if (x.paidBy === id) { x.status = 'unpaid'; delete x.paidBy; jobs.push(NSStore.put('doc', x)); } });
      Promise.all(jobs).then(function () { NS.toast(NS.t('b1.binned')); show(); }, function (err) { NS.toast(err.message, 'bad'); show(); });
    });
  }

  /* the payment reminder for one party: { url (wa.me with the message), ph, name } or null when nothing is due */
  function waReminder(k) {
    var D = mine(), P = B.parties(D, bizName()), p = P[k]; if (!p || p.bal <= 0) return null;
    var open = B.bills(D, bizName(), k).bills.filter(function (b) { return b.side === 'recv'; });
    var msg = T('wamsg', { p: p.name, a: money(p.bal), b: bizName(), d: ldate(NS.today()),
      bills: open.length ? T('wabills', { l: open.slice(0, 8).map(function (b) { return (b.no || docName(b)) + ' ' + ldate(b.date) + ' ' + money(b.left); }).join(', ') }) : '',
      upi: BIZ.upi ? NS.t('uf.waupi', { u: BIZ.upi, a: money(p.bal) }) : '' });
    var ph = phoneOf(k, P);
    if (ph.length === 10) ph = '91' + ph;
    return { url: 'https://wa.me/' + (ph.length >= 11 ? ph : '') + '?text=' + encodeURIComponent(msg), ph: ph, name: p.name };
  }
  function whatsapp(k) {
    var w = waReminder(k); if (!w) return;
    if (!w.ph) NS.toast(T('nophone', { p: w.name }));
    else if (fuGet(k).last === NS.today()) NS.toast(T('fu_again'));
    window.open(w.url, '_blank', 'noopener');
    if (w.ph) fuSet(k, { last: NS.today() });
  }

  /* ---------- forms ---------- */
  var dlg, form, F = null;
  function fld(id, label, html, o) { o = o || {}; return '<div class="f' + (o.wide ? ' wide' : '') + '"><label for="' + id + '">' + esc(label) + '</label>' + html + (o.hint ? '<small class="soft">' + esc(o.hint) + '</small>' : '') + '</div>'; }
  function inp(id, v, o) { o = o || {}; return '<input id="' + id + '" name="' + id + '" value="' + esc(v == null ? '' : v) + '"' + (o.type ? ' type="' + o.type + '"' : '') + (o.mode ? ' inputmode="' + o.mode + '"' : '') + (o.ltr ? ' dir="ltr"' : ' dir="auto"') + (o.req ? ' required' : '') + (o.list ? ' list="' + o.list + '"' : '') + ' autocomplete="off">'; }
  function sel(id, v, opts) { return '<select id="' + id + '" name="' + id + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
  function modeOpts(credit) { return (credit ? [['credit', T('m_credit')]] : []).concat(MODES.map(function (m) { return [m, T('m_' + m)]; })); }
  function partyList(role) {
    var seen = {}, out = [];
    C.party.forEach(function (p) { if (p.inactive) { seen[key(p.name)] = 1; return; } if (!role || !p.role || p.role === role || p.role === 'both') { seen[key(p.name)] = 1; out.push(p.name); } });   /* no longer used: not offered */
    mine().forEach(function (d) { var n = B.partyName(d); if (n && !seen[key(n)]) { seen[key(n)] = 1; out.push(n); } });
    return '<datalist id="dl-party">' + out.sort().map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>';
  }
  /* a date in another financial year than today's is asked about before the bill is saved (R-002: 01-06-2027 saved with no word) */
  function fyAsk(d) {
    var fy = NS.fy(d.date), cur = NS.fy(NS.today());
    if (!d.date || fy === cur) return Promise.resolve();
    return (NS.ask ? NS.ask(NS.t('c.fyout', { d: NS.fmtDate(d.date), fy: fy, cur: cur })) : Promise.resolve(window.confirm(NS.t('c.fyout', { d: NS.fmtDate(d.date), fy: fy, cur: cur })))).then(function (ok) { if (!ok) throw new Error('cancel'); });
  }
  function nextNo(type, pre, date) {
    if (PRE && PRE.k === type) return PRE.no;
    return nxAuto(NS.nextNo(mine(), nxApp(type, pre, date)));   /* one numbering engine (core.js, ERP A-6) */
  }

  var andPrint = false;
  function openForm(kind, o) {
    o = o || {};
    /* F1-11: a journal or other record with its own editor opens there (Ctrl K, Open, Edit), never in the money forms */
    if (o.rec && window.NSApp.editX && kind === 'jv' && NSApp.editX(o.rec)) return;
    if (kind === 'jv') { location.hash = 'b2jv'; return; }
    if (o.rec && o.rec.gen && window.NSApp.editX && NSApp.editX(o.rec)) return;
    if ((kind === 'genr' || kind === 'genp') && window.NSApp.genForm) { NSApp.genForm(kind === 'genr' ? 'rcpt' : 'pymt'); return; }   /* A-10: side menu / Go to */   /* A-10: a general receipt / payment opens in its own form */
    /* the entry window is parked with typing in it (multitasking): go back to it, or let it go and start the new one */
    if (dlg && NS.vsParked && NS.vsParked(dlg)) { NS.ask(NS.t('desk.parkq'), { ok: NS.t('desk.parkback'), no: NS.t('desk.parkdrop') }).then(function (y) { if (y) NS.vsResume(dlg); else { NS.vsDrop(dlg); openForm(kind, o); } }); return; }
    if (!dlg) { dlg = $('#app-form'); form = $('form', dlg); form.addEventListener('submit', function (e) { e.preventDefault(); if (F && F._sent && !NS.okRetry && Date.now() - F._sent < 1000) return; if (F) F._sent = Date.now();   /* a double click or two Ctrl+S save once (F3-1) */ andPrint = e.submitter && e.submitter.hasAttribute('data-andshare') ? 'share' : !!(e.submitter && e.submitter.hasAttribute('data-andprint')); submit(); }); form.addEventListener('input', onFormInput); form.addEventListener('change', onFormInput); dlg.addEventListener('close', function () { if (dlg._parking) return; PRE = null; NSStore.sfRelease(); }); }
    var rec = o.rec || null, today = NS.today(), h = '';
    F = { kind: kind, rec: rec, forId: o.forId, biz: bizName(), conv: o.conv || null }; if (dlg) { dlg.setAttribute('data-kind', kind); dlg.removeAttribute('data-dirty'); }
    var forDoc = o.forId && C.doc.filter(function (d) { return d.id === o.forId; })[0];
    var party = rec ? B.partyName(rec) : o.party || (o.draft && o.draft.buyer ? o.draft.buyer.name : '') || (forDoc ? B.partyName(forDoc) : '');
    if (kind === 'min' || kind === 'mout') {
      var out = kind === 'mout', amt = rec ? (out ? amountOf(rec) : num(rec.amount)) : '';
      if (!rec && forDoc) { var bl = B.bills(mine(), bizName()).bills.filter(function (b) { return b.id === forDoc.id; })[0]; amt = bl ? bl.left : ''; }
      h = '<div class="fg">' + fld('f-date', T('date'), inp('f-date', rec ? rec.date : today, { type: 'date', req: 1 })) +
        fld('f-party', T(out ? 'supp' : 'cust'), inp('f-party', party, { req: 1, list: 'dl-party' }) + partyList(out ? 'supplier' : 'customer')) +
        fld('f-amt', T('amount'), inp('f-amt', amt, { mode: 'decimal', ltr: 1, req: 1 })) +
        fld('f-mode', T('mode'), sel('f-mode', rec ? rec.mode : o.mode || (BIZ && /^(shop|resto|pharma)$/.test(BIZ.kind || '') ? 'cash' : 'upi'), modeOpts())) +   /* shops are paid in cash mostly (round C) */
        bankFld('f-bank', rec && rec.bacct, 'f-mode') +
        fld('f-ref', T('ref'), inp('f-ref', rec ? rec.ref : '', { ltr: 1 })) +
        chqFields(out, rec && rec.chq) + '</div>' +
        /* the bills come right after the amount; TDS, discount and note fold away (round C: the bill list was below the fold) */
        '<fieldset class="alloc"' + (NS.bizMode(BIZ, CFG).billwise ? '' : ' hidden') + '><legend>' + esc(T('against')) + '</legend><p class="soft">' + esc(T('againsth')) + '</p><div data-alloc></div><p class="soft" data-advleft></p></fieldset>' +
        (NS.bizMode(BIZ, CFG).billwise ? '' : '<p class="soft">' + esc(NS.t('cf.bwoff')) + '</p>') +   /* C-9: bill-wise off, the oldest bills are settled by themselves */
        '<details class="more"' + (rec && (num(rec.tds) || num(rec.tdsRate) || num(rec.disc)) ? ' open' : '') + '><summary>' + esc(T('mmore')) + '</summary><div class="fg">' +
        (out ? fld('f-tds', T('tdsout'), inp('f-tds', rec ? rec.tdsRate : '', { mode: 'decimal', ltr: 1 }), { hint: T('tdsouth') }) + fld('f-tdsx', NS.t('uf.tdsa'), inp('f-tdsx', '', { mode: 'decimal', ltr: 1 }))
          : fld('f-tds', T('tdsin'), inp('f-tds', rec ? rec.tds : '', { mode: 'decimal', ltr: 1 }), { hint: T('tdsinh') }) + fld('f-tdsx', NS.t('uf.tdsr'), inp('f-tdsx', '', { mode: 'decimal', ltr: 1 }))) +
        fld('f-disc', NS.t(out ? 'wo.discr' : 'wo.disca'), inp('f-disc', rec ? rec.disc || '' : '', { mode: 'decimal', ltr: 1 }), { hint: NS.t(out ? 'wo.discrh' : 'wo.discah') }) +   /* cash discount (WP-3) */
        fld('f-note', T('note'), inp('f-note', rec ? (out ? (rec.lines && rec.lines[0] || {}).desc : rec.purpose) : ''), { wide: 1 }) + '</div></details>';
    } else if (kind === 'pbill' || kind === 'pret' || kind === 'sale') {
      var r = rec || o.draft || { date: today, items: [{ desc: '', hsn: '', qty: 1, rate: '', gst: o.quick ? qeGst() : 18 }], round: !(o.quick && qeP().round === false), buyer: { name: party } };   /* o.draft: a purchase bill read from a photo (billscan.js), not saved until confirmed */
      var pm = C.party.filter(function (p) { return key(p.name) === key(party); })[0] || {}, sale = kind === 'sale';
      var bm = NS.bizMode(BIZ, CFG); F.acctMode = !bm.inv; F.noGstCol = sale && !bm.gst; F.noBatch = !bm.batch;   /* ERP C-9: features change what the entry screen asks for */
      if (sale && !rec) { r.no = F.autoNo = NS.nextInvNo(C.doc, bizName(), today, CFG); r.noGst = /^(comp|unreg)$/.test(BIZ.reg || '') || !String(BIZ.gstin || '').trim();   /* no GSTIN: a bill of supply, never GST (F1-7) */ r.round = (CFG.invoice || {}).round !== false; }
      h = '<div class="fg">' + fld('f-party', T(sale ? 'cust' : 'supp'), inp('f-party', party, { req: 1, list: 'dl-party' }) + partyList(sale ? 'customer' : 'supplier')) +
        fld('f-gstin', sale ? T('qe_gstin') : T('gstin'), inp('f-gstin', (r.buyer && r.buyer.gstin) || pm.gstin || '', { ltr: 1 })) +
        fld('f-state', sale ? T('qe_state') : T('state'), sel('f-state', (r.buyer && r.buyer.state) || pm.state || (BIZ.state || ''), [['', '—']].concat(NS.STATES.map(function (s) { return [s[0], s[0] + ' · ' + NS.stateLoc(s[0])]; })))) +
        fld('f-no', T(kind === 'pret' ? 'billno' : sale ? 'qe_no' : 'sno'), inp('f-no', r.no || '', { ltr: 1, req: kind !== 'pret' })) +
        fld('f-date', T('date'), inp('f-date', r.date, { type: 'date', req: 1 })) +
        (kind === 'pret' ? fld('f-orig', T('origno'), inp('f-orig', r.orig && r.orig.no || '', { ltr: 1, list: 'dl-pborig' }) + '<datalist id="dl-pborig">' + mine().filter(function (x) { return x.type === 'pbill' && x.kind !== 'return' && x.no; }).sort(byDate).slice(0, 300).map(function (x) { return '<option value="' + esc(x.no) + '" label="' + esc(B.partyName(x) + ' · ' + NS.fmtDate(x.date)) + '">'; }).join('') + '</datalist>') : fld('f-due', T('due'), inp('f-due', r.due || '', { type: 'date' }))) +
        (window.NSApp.gdField && !sale && bm.godown ? NSApp.gdField(r.gd) : '') + (window.NSApp.ledFld && kind !== 'pret' ? NSApp.ledFld(sale ? 'sl' : 'pl', sale ? r.sl : r.pl) : '') + '</div>' +
        (sale ? shipDisp(r) : '') +   /* owner 23 Nov: Ship to and Dispatch details above the items, also on a saved bill */
        '<fieldset><legend>' + esc(T('items')) + '</legend><div data-lines></div><button type="button" class="btn sm" data-addline>' + esc(T('addline')) + '</button>' +
        '<label class="chk"><input type="checkbox" id="f-nogst"' + (r.noGst ? ' checked' : '') + '> ' + esc(T(sale ? 'qe_nogst' : 'nogst')) + '</label><label class="chk"><input type="checkbox" id="f-round"' + (r.round !== false ? ' checked' : '') + '> ' + esc(T('round')) + '</label>' +
        (sale ? '' : '<label class="chk">' + esc(NS.t('ms.itc')) + ' <select id="f-pitc">' + [['ok', 'ms.itc_ok'], ['blocked', 'ms.itc_blocked'], ['ineligible', 'ms.itc_inel']].map(function (o) { return '<option value="' + o[0] + '"' + ((r.itc || 'ok') === o[0] ? ' selected' : '') + '>' + esc(NS.t(o[1])) + '</option>'; }).join('') + '</select></label>') +   /* r1-gst S-5: credit of the whole bill (lines keep their own) */
        (sale || kind !== 'pbill' ? '' : '<label class="chk">' + esc(NS.t('or.lcby')) + ' <select id="f-lcby">' + [['', 'or.lcby_v'], ['qty', 'or.lcby_q'], ['none', 'or.lcby_n']].map(function (o) { return '<option value="' + o[0] + '"' + ((r.lcBy || '') === o[0] ? ' selected' : '') + '>' + esc(NS.t(o[1])) + '</option>'; }).join('') + '</select></label>') +   /* ERP round 2, I-14: freight lines and charges into the goods' cost */
        chgBlock() + '<div class="sum" data-sum></div></fieldset>' +
        '<div class="fg">' + fld('f-narr', NS.t('bw.narr'), inp('f-narr', r.narr || ''), { wide: 1, hint: NS.t('bw.narrh') }) + '</div>' +   /* A-26 (r2-billwise): narration for the books */
        (kind === 'pbill' && !rec ? '<div class="fg">' + fld('f-mode', T('paidnow'), sel('f-mode', (o.quick && qeMode('pbill')) || 'credit', modeOpts(true)), { hint: T('paidnowh') }) + bankFld('f-bank', '', 'f-mode') + '</div>' : '') +
        (sale && !rec ? '<div class="fg">' + fld('f-mode', T('qe_recv'), sel('f-mode', (o.quick && qeMode('sale')) || (/^(shop|resto|pharma)$/.test(BIZ.kind || '') ? 'cash' : 'credit'), modeOpts(true)), { hint: T('qe_recvh') }) + bankFld('f-bank', '', 'f-mode') + '</div>' : '') +
        (sale ? '' : '<div class="fg"><div class="f wide"><label for="f-photo">' + esc(T('photo')) + '</label><input type="file" id="f-photo" accept="image/*"><small class="soft">' + esc(T('photoh')) + '</small><div class="photo-pv" data-photo-pv></div></div></div>');
      F.lines = JSON.parse(JSON.stringify(r.items)); F.photo = r.photo || ''; F.charges = JSON.parse(JSON.stringify(r.charges || []));
      if (sale && !party && BIZ.state) h = h.replace('<option value="' + BIZ.state + '">', '<option value="' + BIZ.state + '" selected>');
    } else if (kind === 'exp') {
      var x = rec || { date: today, mode: 'cash', gst: '' };
      h = '<div class="fg">' + fld('f-date', T('date'), inp('f-date', x.date, { type: 'date', req: 1 })) +
        fld('f-cat', T('cat'), inp('f-cat', catName(x.cat || ''), { req: 1, list: 'dl-cat' }) + '<datalist id="dl-cat">' + EXP.map(function (k) { return '<option value="' + esc(T('ex_' + k)) + '">'; }).join('') + '</datalist>') +
        fld('f-amt', T('amount'), inp('f-amt', x.amount || '', { mode: 'decimal', ltr: 1, req: 1 })) +
        fld('f-mode', T('paidhow'), sel('f-mode', x.mode, modeOpts(true))) +   /* we pay an expense: not the customer's "how did he pay" (round C) */
        bankFld('f-bank', x.bacct, 'f-mode') +
        fld('f-party', T('payee'), inp('f-party', B.partyName(x), { list: 'dl-party' }) + partyList('supplier')) +
        fld('f-no', T('billno'), inp('f-no', x.no || '', { ltr: 1 })) +
        fld('f-gst', T('incgst'), sel('f-gst', x.gst || '', [['', '—'], ['5', '5%'], ['12', '12%'], ['18', '18%'], ['40', '40%']])) +
        '<div class="f wide"><label class="chk"><input type="checkbox" id="f-itc"' + (x.itc ? ' checked' : '') + '> ' + esc(T('itc')) + '</label><label class="chk"><input type="checkbox" id="f-inter"' + (x.inter ? ' checked' : '') + '> ' + esc(T('inter')) + '</label></div>' +
        fld('f-note', T('note'), inp('f-note', x.notes || ''), { wide: 1 }) + '</div>';
    } else if (kind === 'csale') {
      h = '<p class="soft">' + esc(T('csaleh')) + '</p><div class="fg">' + fld('f-date', T('date'), inp('f-date', today, { type: 'date', req: 1 })) +
        fld('f-party', T('cust'), inp('f-party', party, { req: 1, list: 'dl-party' }) + partyList('customer')) +
        fld('f-amt', T('amount'), inp('f-amt', '', { mode: 'decimal', ltr: 1, req: 1 })) +
        fld('f-phone', T('phone'), inp('f-phone', (C.party.filter(function (p) { return key(p.name) === key(party); })[0] || {}).phone || '', { mode: 'tel', ltr: 1 })) +
        fld('f-desc', T('given'), inp('f-desc', ''), { wide: 1 }) + fld('f-due', T('due'), inp('f-due', '', { type: 'date' })) + '</div>';
    } else if (kind === 'contra') {
      var cx = rec || { date: today, from: 'cash' }, ck = rec ? B.contraKind(rec) : 'dep', many = banks().length > 1;
      var cb1 = ck === 'xfer' ? B.contraSide(cx, cx.from, 'cash') : B.bankOf(cx), cb2 = ck === 'xfer' ? B.contraSide(cx, cx.to, 'bank') : (banks()[1] || {}).k;
      h = '<p class="soft">' + esc(T('contrah')) + '</p><div class="fg">' + fld('f-date', T('date'), inp('f-date', cx.date, { type: 'date', req: 1 })) +
        fld('f-dir', T('contra'), sel('f-dir', ck === 'xfer' ? 'xfer' : ck === 'wd' ? 'bank' : 'cash', [['cash', T('d_deposit')], ['bank', T('d_withdraw')]].concat(many || ck === 'xfer' ? [['xfer', T('d_xfer')]] : []))) +
        bankFld('f-bank', cb1, '') + bankFld('f-bank2', cb2, '', T('bankto')) +
        fld('f-amt', T('amount'), inp('f-amt', cx.amount || '', { mode: 'decimal', ltr: 1, req: 1 })) +
        fld('f-ref', T('ref'), inp('f-ref', cx.ref || '', { ltr: 1 })) + fld('f-note', T('note'), inp('f-note', cx.notes || ''), { wide: 1 }) + '</div>';
    } else if (kind === 'vdoc') {   /* challan, quotation, order, note, cash memo, self / export invoice (vdocs.js) */
      F.vd = NSVDocs.make(o, F); h = F.vd.html; F.lines = F.vd.lines; F.photo = ''; F.charges = JSON.parse(JSON.stringify((F.vd.base && F.vd.base.charges) || [])); F.acctMode = !NS.bizMode(BIZ, CFG).inv; F.noBatch = !NS.bizMode(BIZ, CFG).batch;   /* ERP C-9 */
    } else if (kind === 'ob') {
      var ob = rec || { date: fyStart(today), side: 'recv' };
      h = '<p class="soft">' + esc(T('obh')) + '</p><div class="fg">' + fld('f-side', T('side'), sel('f-side', o.side || ob.side, [['recv', T('s_recv')], ['pay', T('s_pay')], ['cash', T('s_cash')], ['bank', T('s_bank')]])) +
        bankFld('f-bank', o.bacct || ob.bacct, '') +
        fld('f-party', T('party'), inp('f-party', party, { req: 1, list: 'dl-party' }) + partyList()) +
        fld('f-amt', T('amount'), inp('f-amt', ob.amount || '', { mode: 'decimal', ltr: 1, req: 1 })) +
        fld('f-date', T('date'), inp('f-date', ob.date, { type: 'date', req: 1 })) + '</div>' + (window.NSApp.obGrid ? NSApp.obGrid.html(ob) : '');   /* A-13: opening bills one by one */
    }
    $('[data-form-title]', dlg).textContent = (o.quick ? T('qe_title') + ' · ' : '') + (F.vd ? F.vd.title : T(kind === 'sale' ? 'qe_sale' : kind)) + (rec && rec.no ? ' ' + rec.no : '') + (C.biz.length > 1 && bizName() ? ' · ' + bizName() : '');
    if (window.NSApp.formTail) h += NSApp.formTail(kind, rec) || '';   /* ERP round 2: other files add parts to a form (tdsbook.js: TDS on purchase bills and expenses) */
    F.quick = !!o.quick; dlg.classList.toggle('qe-on', F.quick);
    if (F.quick) h = '<div class="qe-tabs" role="tablist">' + QE.map(function (q, i) { return '<button type="button" role="tab" class="btn sm' + (q === kind ? ' primary' : '') + '" aria-selected="' + (q === kind) + '" data-qe="' + q + '" aria-keyshortcuts="Alt+' + (i + 1) + '">' + esc(T(q === 'sale' ? 'qe_sale' : q)) + (i < 5 ? ' <kbd>Alt ' + (i + 1) + '</kbd>' : '') + '</button>'; }).join('') + '<button type="button" class="btn sm qe-cus-btn" data-qecus data-ic="gear">' + esc(T('qe_cus')) + '</button></div><p class="soft qe-keys">' + esc(T('qe_keys')) + '</p>' + h;   /* two businesses: the form names the one it saves to */
    if (window.NSCF) h += NSCF.appBlock(kind, F, rec || o.draft || F.vd && F.vd.base);   /* custom fields of this voucher type (ERP Round 2, B-1) */
    form.innerHTML = '<span data-of hidden></span>' + h + '<div class="dlg-foot"><button type="submit" class="btn primary">' + esc(T('save')) + '</button>' +
      (kind === 'exp' || kind === 'vdoc' ? '<button type="submit" class="btn" data-andprint data-ic="print">' + esc(T('save')) + ' + ' + esc(T('print')) + '</button>' : '') +
      (kind === 'vdoc' ? '<button type="submit" class="btn" data-andshare data-ic="share">' + esc(T('save')) + ' + ' + esc(NS.t('b.share')) + '</button>' : '') + '<button type="button" class="btn" data-close>' + esc(T('cancel')) + '</button></div>';
    $('[data-close]', form).addEventListener('click', function () { NS.vsLeave(); });
    var al = $('[data-addline]', form);
    if (al) al.addEventListener('click', function () { F.lines.push({ desc: '', hsn: '', qty: 1, rate: '', gst: $('#f-nogst', form).checked ? 0 : F.quick ? qeGst() : 18 }); drawLines(); });
    if (F.lines) drawLines();
    chgWire();
    if (kind === 'min' || kind === 'mout') { tdsPair('f-tds'); drawAlloc(true); chqShow(); }
    if (kind === 'ob') obShow();
    if (kind === 'contra') contraShow();
    bankSync(form);
    if (F.lines) drawPhoto();
    if (F.vd) F.vd.wire(form);
    if (kind === 'sale') NS.subPick($('#f-no', form), { type: 'invoice', cfg: function () { return CFG; }, get: function () { return F.vt || (F.rec && F.rec.vt) || ''; }, saved: function () { return !!F.rec; },   /* A-7: invoice sub-types */
      set: function (id) { F.vt = id; var n = $('#f-no', form); if (n && n.value === F.autoNo) n.value = F.autoNo = NS.nextInvNo(C.doc, bizName(), $('#f-date', form).value || today, CFG, id); } });
    if (o.after) o.after(form, F);   /* billscan.js marks the fields it was unsure about */
    if (window.NSApp.formWire) NSApp.formWire(kind, form, F);
    $$('[data-qe]', form).forEach(function (b) { b.addEventListener('click', function () { openForm(b.getAttribute('data-qe'), { quick: 1 }); }); });
    var qc = $('[data-qecus]', form); if (qc) qc.addEventListener('click', qeCustomize);
    var so = $('#f-shipon', form); if (so) so.addEventListener('change', function () { $('#f-shipbox', form).hidden = !so.checked; if (so.checked) $('#f-shname', form).focus(); });
    sdWire(form);
    dlg.showModal();
    var first = F.quick ? $('#f-party,#f-cat', form) : $('input:not([type=date]),select', form); if (first && (F.quick || !first.value)) first.focus(); else { var any = $('input:not([type=hidden]):not([type=checkbox]),select', form); if (any) any.focus(); }   /* never leave the cursor on Back (P2-14: Contra) */
  }
  function chqFields(out, c) {
    c = c || {};
    var st = out ? ['iss', 'ok', 'bounce'] : ['hand', 'dep', 'ok', 'bounce'];
    return '<div class="f wide chqf" data-chqf><div class="fg">' + fld('f-cdate', T('cdate'), inp('f-cdate', c.date || '', { type: 'date' }), { hint: T('cdateh') }) +
      fld('f-cbank', T('cbank'), inp('f-cbank', c.bank || '')) +
      fld('f-cst', T('cst'), sel('f-cst', c.st || st[0], st.map(function (x) { return [x, T('c_' + x)]; }))) +
      fld('f-con', T('con'), inp('f-con', c.on || '', { type: 'date' })) + '</div></div>';
  }
  function chqShow() {
    var box = $('[data-chqf]', form); if (!box) return;
    box.hidden = $('#f-mode', form).value !== 'cheque';
    var on = $('#f-con', form); on.closest('.f').hidden = $('#f-cst', form).value !== 'ok';
    if ($('#f-cst', form).value === 'ok' && !on.value) on.value = NS.today();
  }
  function chqFromForm() {
    if ($('#f-mode', form).value !== 'cheque') return null;
    var st = $('#f-cst', form).value;
    return { date: $('#f-cdate', form).value || $('#f-date', form).value, bank: $('#f-cbank', form).value.trim(), st: st, on: st === 'ok' ? $('#f-con', form).value || NS.today() : '' };
  }
  function drawPhoto() {
    var box = $('[data-photo-pv]', form); if (!box) return;
    box.innerHTML = F.photo ? '<img src="' + F.photo + '" alt="' + esc(T('photo')) + '"><button type="button" class="btn sm" data-photo-rm>' + esc(T('photorm')) + '</button>' : '';
    var rm = $('[data-photo-rm]', box); if (rm) rm.addEventListener('click', function () { F.photo = ''; $('#f-photo', form).value = ''; drawPhoto(); });
  }
  function obShow() {   /* cash in hand / bank balance: no party */
    var p = $('#f-party', form), own = /^(cash|bank)$/.test($('#f-side', form).value);
    p.closest('.f').hidden = own; p.required = !own; if (own) p.value = '';
    var bf = $('[data-bankf="f-bank"]', form); if (bf) bf.hidden = $('#f-side', form).value !== 'bank';
    var og = $('[data-obgrid]', form); if (og) og.hidden = own;
  }
  /* contra: one bank for a deposit or withdrawal, "from" and "to" banks for a bank to bank transfer */
  function contraShow() {
    var dir = $('#f-dir', form).value, b1 = $('[data-bankf="f-bank"]', form), b2 = $('[data-bankf="f-bank2"]', form);
    if (b1) { $('label', b1).textContent = T(dir === 'xfer' ? 'bankfrom' : 'bankacct'); }
    if (b2) b2.hidden = dir !== 'xfer';
  }
  function onFormInput(e) {
    var id = e.target.id || '';
    if (id === 'f-mode' || id === 'f-cst') chqShow();
    if (id === 'f-mode') bankSync(form);
    if (id === 'f-dir' && F.kind === 'contra') contraShow();
    if (id === 'f-side' && $('#f-party', form) && F.kind === 'ob') obShow();
    if (id === 'f-photo') { if (e.type === 'change' && e.target.files[0]) shrinkPhoto(e.target.files[0]).then(function (u) { F.photo = u; drawPhoto(); }).catch(function () { NS.toast(T('photobad'), 'bad'); }); return; }
    if (F.lines && e.target.hasAttribute('data-li')) { var i = +e.target.getAttribute('data-li'), k = e.target.getAttribute('data-lk'), was = F.lines[i][k]; F.lines[i][k] = e.target.value; if (k === 'desc') fillItem(i); if (k === 'unit' && e.type === 'change') unitRate(i, was); drawSum(); return; }
    if (F.lines && /f-(nogst|round|state)/.test(id)) drawSum();
    /* the first two digits of a GSTIN are the supplier's state code */
    if (id === 'f-gstin') { var st = e.target.value.trim().slice(0, 2); if (/^\d\d$/.test(st) && NS.stateName(st)) { $('#f-state', form).value = st; drawSum(); } }
    if (id === 'f-party' && F.lines) { var pm = C.party.filter(function (p) { return key(p.name) === key(e.target.value); })[0]; if (pm) { $('#f-gstin', form).value = pm.gstin || ''; if (pm.state) $('#f-state', form).value = pm.state; partyTerms(pm); drawSum(); } }
    if ((F.kind === 'min' || F.kind === 'mout') && (id === 'f-tdsx' || id === 'f-tds' || id === 'f-amt')) tdsPair(id);
    if ((F.kind === 'min' || F.kind === 'mout') && (id === 'f-party' || id === 'f-amt' || id === 'f-tds' || id === 'f-tdsx' || id === 'f-disc')) drawAlloc();
    if (e.target.hasAttribute && e.target.hasAttribute('data-al')) advLeft();
  }
  /* TDS asked both ways on Money received and Money paid: the box that is saved (received: rupees, paid: rate) and its twin.
     Received: the customer paid amount = bill - TDS, so rate = TDS / (amount + TDS). Paid: TDS = rate x amount of the bill. */
  function tdsPair(id) {
    var a = $('#f-tds', form), x = $('#f-tdsx', form); if (!a || !x) return;
    var out = F.kind === 'mout', amt = num($('#f-amt', form).value), fix = function (n) { return n ? String(+n.toFixed(2)) : ''; };
    if (id === 'f-tdsx') {
      var v = num(x.value);
      a.value = !x.value.trim() ? '' : out ? (amt ? fix(v / amt * 100) : '') : (v > 0 && v < 100 && amt ? String(tdsIn(v, amt)) : '');
    } else {
      var s = num(a.value), base = out ? 0 : tdsBase(amt + s);
      x.value = !a.value.trim() ? '' : out ? (amt ? String(r2(amt * s / 100)) : '') : (base ? fix(s / base * 100) : '');
    }
  }
  /* Money received: TDS is cut on the bill's value WITHOUT the GST shown on it (CBDT Circular 23/2017), so the rate works on
     the taxable part of the open bills this payment settles (oldest first), and is rounded to the rupee (s.288B), as tds. does.
     Money beyond the bills (an advance) has no GST known: rate on the whole of it. (round C: a 10% rate gave 8.47%) */
  function openRecv() {
    var p = key($('#f-party', form).value), D = mine().filter(function (d) { return !F.rec || d.id !== F.rec.id; });
    return p ? B.bills(D, bizName(), p).bills.filter(function (b) { return b.side === 'recv'; }).sort(function (a, b) { return a.date.localeCompare(b.date); }) : [];
  }
  function taxPart(b) { var d = C.doc.filter(function (x) { return x.id === b.id; })[0], t = d && d.items ? B.itemTotals(d) : null; return t && t.total > 0 ? Math.min(1, t.taxable / t.total) : 1; }
  function tdsIn(rate, cash) {
    var r = rate / 100, left = cash, tds = 0;
    openRecv().forEach(function (b) {
      if (left <= 0.004) return;
      var q = taxPart(b), net = b.left * (1 - r * q);
      if (left >= net - 0.005) { tds += r * q * b.left; left -= net; } else { tds += r * q * left / (1 - r * q); left = 0; }
    });
    if (left > 0.004) tds += left * r / (1 - r);
    return Math.round(tds);
  }
  function tdsBase(gross) {
    var left = gross, base = 0;
    openRecv().forEach(function (b) { if (left <= 0.004) return; var c = Math.min(b.left, left); base += c * taxPart(b); left -= c; });
    return r2(base + Math.max(0, left));
  }
  /* a party or item made in the quick add box while an entry is open: known to this form at once (P1-6, P2-1, P4-2) */
  document.addEventListener('ns-qa', function (e) {
    var x = e.detail || {}, r = x.rec; if (!r) return;
    var list = x.kind === 'item' ? C.item : C.party, nm = key(x.kind === 'item' ? r.desc : r.name);
    for (var i = list.length - 1; i >= 0; i--) if (key(x.kind === 'item' ? list[i].desc : list[i].name) === nm) list.splice(i, 1);
    list.push(r);
  });
  var LFROM = new WeakMap();
  /* what a party saved in My data / Masters brings to a bill (owner 26 Nov 2026): its usual discount for every line without one, the default ship-to place and the transporter
     (only into boxes still empty); the item's own "rates include GST" and usual discount come in fillItem */
  function partyTerms(pm) {
    var set = function (id, v) { var e = $('#' + id, form); if (e && v != null && String(v) !== '' && !String(e.value || '').trim()) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); } };
    F.partyDisc = num(pm.disc) > 0 ? num(pm.disc) : 0;
    if (F.partyDisc && F.lines) { F.lines.forEach(function (L, i) { if (!num(L.disc) && String(L.desc || '').trim()) { L.disc = String(F.partyDisc); var row = $$('[data-row]', form)[i], di = row && $('[data-lk=disc]', row); if (di) di.value = L.disc; } }); }
    if ($('#f-dptname', form) && pm.tname) set('f-dptname', pm.tname);
    var sh = pm.ship; if (sh && sh.addr && $('#f-shaddr', form) && !String($('#f-shaddr', form).value || '').trim()) {
      set('f-shname', sh.name || pm.name); set('f-shaddr', sh.addr); set('f-shcity', sh.city); set('f-shpin', sh.pin); set('f-shgstin', sh.gstin);
      if (sh.state && $('#f-shstate', form)) $('#f-shstate', form).value = sh.state;
      var on = $('#f-shipon', form); if (on && !on.checked) { on.checked = true; on.dispatchEvent(new Event('change', { bubbles: true })); }
    }
  }
  function fillItem(i) {
    var m = C.item.filter(function (x) { return key(x.desc) === key(F.lines[i].desc); })[0];
    var sp = window.NSReuse && $('#f-party', form) ? NSReuse.partyRate(C.party.filter(function (p) { return key(p.name) === key($('#f-party', form).value); })[0], F.lines[i].desc) : null;   /* this supplier's own price list (My data) */
    if (!m && sp == null) return; m = m || {};
    /* a line switched to another saved item takes that item's HSN, rate and unit (P1-6: the old item's values stayed); edits to the same item are kept */
    var L = F.lines[i], sr = F.kind === 'sale' || F.vd && !F.vd.buy ? m.rate || m.prate : m.prate || m.rate, fresh = !!m.desc && LFROM.get(L) !== key(m.desc); if (fresh) LFROM.set(L, key(m.desc));
    if (fresh || !L.hsn) L.hsn = m.hsn || ''; if ((fresh || !num(L.rate)) && (sp != null || sr)) L.rate = sp != null ? sp : sr; if (window.NSGst && m.desc && NSGst.hist(m).length) NSGst.fillLine(L, m, $('#f-date', form) ? $('#f-date', form).value : NS.today(), !(F.kind === 'sale' || F.vd && !F.vd.buy)); else if (m.gst !== '' && m.gst != null) L.gst = m.gst; if (m.unit && (fresh || !L.unit)) L.unit = m.unit;   /* r1-gst S-1, S-5: rate on the voucher date, taxability, purchase credit */
    var row = $$('[data-row]', form)[i]; if (row) { if ($('[data-lk=unit]', row)) $('[data-lk=unit]', row).value = L.unit || ''; $('[data-lk=hsn]', row).value = L.hsn; $('[data-lk=rate]', row).value = L.rate; $('[data-lk=gst]', row).value = L.gst; }
    if (fresh && m.desc) {   /* the item's rates include GST: the line takes the rate before tax (not a party's own price); the party's discount, else the item's usual one */
      if (m.incl && sp == null && num(L.gst) > 0 && num(L.rate) > 0) L.rate = String(r2(num(L.rate) * 100 / (100 + num(L.gst))));
      if (!num(L.disc)) { var dd = (F.partyDisc || 0) > 0 ? F.partyDisc : num(m.disc) > 0 ? num(m.disc) : 0; if (dd) L.disc = String(dd); }
      if (row) { if ($('[data-lk=rate]', row)) $('[data-lk=rate]', row).value = L.rate; if ($('[data-lk=disc]', row)) $('[data-lk=disc]', row).value = L.disc || ''; }
    }
    if (row && m.track && !$('[data-lk=batch],[data-lk=serial]', row)) { drawLines(); var di = $$('[data-lk=desc]', form)[i]; if (di) { di.focus(); di.setSelectionRange(di.value.length, di.value.length); } }   /* batch / serial item (more.js) */
  }
  function unitRate(i, was) {   /* F5-10 */
    var L = F.lines[i], m = C.item.filter(function (x) { return key(x.desc) === key(L.desc); })[0], a = m && m.alt, per = a && num(a.per), r = num(L.rate);
    if (!per || !r || !a.unit) return; var nu = key(L.unit), wu = key(was);
    if (nu === key(a.unit) && wu !== nu) L.rate = String(r2(r * per)); else if (wu === key(a.unit) && nu !== wu) L.rate = String(r2(r / per)); else return;
    var row = $$('[data-row]', form)[i], ri = row && $('[data-lk=rate]', row); if (ri) ri.value = L.rate; drawSum();
  }
  function drawLines() {
    var box = $('[data-lines]', form);
    var lineX = !F.noBatch && window.NSApp.lineX;   /* C-9: the batch switch */
    var plain = !(lineX && F.lines.some(function (L, i) { return NSApp.lineX(L, i, function () { return 'x'; }); }));   /* batch/serial columns: keep the labelled lines */
    box.classList.toggle('vg', plain); box.classList.toggle('nx-acct', !!F.acctMode); box.classList.toggle('nx-nogst', !!F.noGstCol);   /* ERP C-9 */
    box.innerHTML = '<datalist id="dl-item">' + NS.active(C.item).map(function (x) { return '<option value="' + esc(x.desc) + '">'; }).join('') + '</datalist>' +
      (plain ? '<div class="line line-hd" aria-hidden="true"><span class="lc-no">#</span><span>' + esc(F.acctMode ? NS.t('nx.partic') : T('item')) + '</span><span>' + esc(T('hsn')) + '</span><span class="n h-qty">' + esc(T('qty')) + '</span><span class="h-uom">' + esc(NS.t('dp.uom')) + '</span><span class="n">' + esc(F.acctMode ? NS.t('nx.value') : T('rate')) + '</span><span class="n h-disc">' + esc(NS.t('app.ldisc')) + '</span><span class="n h-gst">' + esc(T('gst')) + '</span><span class="n">' + esc(T('amount')) + '</span><span></span></div>' : '') + F.lines.map(function (L, i) {
      function c(k, lbl, o) { o = o || {}; return '<label class="lc lc-' + k + '"><span>' + esc(lbl) + '</span><input data-li="' + i + '" data-lk="' + k + '" value="' + esc(L[k] == null ? '' : L[k]) + '"' + (o.mode ? ' inputmode="' + o.mode + '" dir="ltr"' : ' dir="auto"') + (o.list ? ' list="' + o.list + '"' : '') + ' autocomplete="off"></label>'; }
      return '<div class="line" data-row>' + (plain ? '<span class="lc-no" aria-hidden="true">' + (i + 1) + '</span>' : '') + c('desc', T('item'), { list: 'dl-item' }) + c('hsn', T('hsn'), { mode: 'numeric' }) + c('qty', T('qty'), { mode: 'decimal' }) + c('unit', NS.t('dp.uom')) + c('rate', T('rate'), { mode: 'decimal' }) + c('disc', NS.t('app.ldisc'), { mode: 'decimal' }) + c('gst', T('gst'), { mode: 'decimal' }) +
        (lineX ? NSApp.lineX(L, i, c) : '') +   /* batch, expiry, serial (more.js) */
        (plain ? '<span class="lc-amt" data-lamt="' + i + '"></span>' : '') +
        (F.lines.length > 1 ? '<button type="button" class="icon-btn rm" data-rm="' + i + '" aria-label="' + esc(T('rmline')) + '">✕</button>' : '') + '</div>';
    }).join('');
    $$('[data-rm]', box).forEach(function (b) { b.addEventListener('click', function () { F.lines.splice(+b.getAttribute('data-rm'), 1); drawLines(); }); });
    drawSum();
  }
  /* Extra charges (freight, packing, insurance) on App vouchers, as the billing maker saves them: d.charges = [{name, amt, gst}],
     gst 'main' = the rate of the item with the largest value (owner 21 Nov: "did you forget extra charges in the App?") */
  var CHG_RATES = [0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 40];
  function chgBlock() {
    return '<div class="app-chg" data-chgbox><h4>' + esc(NS.t('b1.charges')) + '</h4><div data-chg></div>' +
      '<button type="button" class="btn sm" data-addchg>+ ' + esc(NS.t('b1.addchg')) + '</button><p class="soft small">' + esc(NS.t('b1.chgh')) + '</p></div>';
  }
  function drawChg() {
    var box = $('[data-chg]', form); if (!box) return;
    F.charges = F.charges || [];
    box.innerHTML = F.charges.map(function (c, i) {
      var g = c.gst == null || c.gst === '' ? 'main' : String(c.gst);
      return '<div class="chg-row" data-ci="' + i + '"><label class="f"><span>' + esc(NS.t('b1.chgname')) + '</span><input data-ck="name" list="dl-appchg" value="' + esc(c.name || '') + '"></label>' +
        '<label class="f"><span>' + esc(NS.t('b1.chgamt')) + '</span><input data-ck="amt" inputmode="decimal" dir="ltr" value="' + esc(c.amt == null ? '' : c.amt) + '"></label>' +
        '<label class="f"><span>' + esc(NS.t('l.gst')) + '</span><select data-ck="gst"><option value="main">' + esc(NS.t('b1.chgmain')) + '</option>' +
          CHG_RATES.map(function (r) { return '<option value="' + r + '"' + (String(r) === g ? ' selected' : '') + '>' + r + '%</option>'; }).join('') + '</select></label>' +
        '<button type="button" class="btn sm" data-chgdel="' + i + '">' + esc(NS.t('it.rm')) + '</button></div>';
    }).join('') + '<datalist id="dl-appchg"><option value="Freight"><option value="Packing"><option value="Insurance"><option value="Loading"><option value="Cartage"><option value="Installation"></datalist>';
  }
  function chgOut() {
    return (F.charges || []).filter(function (c) { return String(c.name || '').trim() || num(c.amt); })
      .map(function (c) { return { name: String(c.name || '').trim() || 'Charges', amt: num(c.amt), gst: c.gst == null || c.gst === '' ? 'main' : c.gst }; });
  }
  function chgWire() {
    var box = $('[data-chgbox]', form); if (!box) return;
    drawChg();
    $('[data-addchg]', box).addEventListener('click', function () { F.charges.push({ name: '', amt: '', gst: 'main' }); drawChg(); var n = $$('[data-ck=name]', box); if (n.length) n[n.length - 1].focus(); });
    box.addEventListener('input', function (e) {
      var r = e.target.closest('[data-ci]'), k = e.target.getAttribute('data-ck'); if (!r || !k) return;
      F.charges[+r.getAttribute('data-ci')][k] = k === 'gst' && e.target.value === 'main' ? 'main' : e.target.value;
      drawSum();
    });
    box.addEventListener('change', function (e) { if (e.target.getAttribute('data-ck') === 'gst') { var r = e.target.closest('[data-ci]'); F.charges[+r.getAttribute('data-ci')].gst = e.target.value; drawSum(); } });
    box.addEventListener('click', function (e) { var b = e.target.closest('[data-chgdel]'); if (!b) return; F.charges.splice(+b.getAttribute('data-chgdel'), 1); drawChg(); drawSum(); });
  }
  function billFromForm() {
    var d = { type: 'pbill', kind: F.kind === 'pret' ? 'return' : 'bill', seller: sellerCopy(), buyer: { name: $('#f-party', form).value.trim(), gstin: $('#f-gstin', form).value.trim().toUpperCase(), state: $('#f-state', form).value },
      no: $('#f-no', form).value.trim(), date: $('#f-date', form).value, noGst: $('#f-nogst', form).checked, round: $('#f-round', form).checked, photo: F.photo || '', itc: $('#f-pitc', form) && $('#f-pitc', form).value !== 'ok' ? $('#f-pitc', form).value : undefined,
      items: F.lines.filter(function (L) { return String(L.desc).trim() || num(L.rate); }).map(function (L) { var it = { desc: String(L.desc).trim(), hsn: String(L.hsn || '').trim(), qty: L.qty === '' ? 1 : num(L.qty), unit: L.unit || 'Nos', rate: num(L.rate), disc: num(L.disc) || '', gst: num(L.gst) }; if (L.tk) it.tk = L.tk; if (L.itc) it.itc = L.itc;   /* L.unit: set by weigh.js when a weight was typed; r1-gst: taxability, purchase credit */ return window.NSApp.lineCopy ? NSApp.lineCopy(L, it) : it; }) };
    if ($('#f-gd', form)) d.gd = $('#f-gd', form).value;
    if ($('#f-narr', form)) d.narr = $('#f-narr', form).value.trim();   /* A-26 */
    if ($('#f-pl', form)) d.pl = $('#f-pl', form).value.trim();   /* A-9 */
    if ($('#f-lcby', form)) d.lcBy = $('#f-lcby', form).value || undefined;   /* ERP round 2, I-14 */
    d.charges = chgOut();
    if ($('#f-due', form)) d.due = $('#f-due', form).value; else d.orig = { no: $('#f-orig', form).value.trim() };
    var t = B.itemTotals(d), total = r2(t.taxable + t.cgst + t.sgst + t.igst);   /* IGST when the supplier's state differs from ours */
    d.total = d.round ? Math.round(total) : total;
    d.tax = { taxable: t.taxable, cgst: t.cgst, sgst: t.sgst, igst: t.igst };
    return d;
  }
  /* a sale bill made here is the same record the billing maker saves (docs.js blank() + totals), numbered by its rule */
  /* Bill to / Ship to and Dispatch details of a sale bill (owner 2026-11-18): folded until opened; saved as the billing maker saves them */
  function shipDisp(r) {
    r = r || {}; var sh = r.ship || null, dp = r.disp || {}, VAL = { 'f-shname': sh && sh.name, 'f-shaddr': sh && sh.addr, 'f-shcity': sh && sh.city, 'f-shpin': sh && sh.pin, 'f-shgstin': sh && sh.gstin,
      'f-dpthrough': dp.through, 'f-dpdest': dp.dest, 'f-dpveh': dp.veh, 'f-dptname': dp.tname, 'f-dplr': dp.lr, 'f-dplrdate': dp.lrdate,
      /* the e-way bill number and date fill themselves from the portal's reply loaded into the bill (einv.js keeps it in d.irn) */
      'f-dpewb': dp.ewb || (r.irn && r.irn.ewb), 'f-dpewbdt': dp.ewbdate || (r.irn && NS.ewbDay(r.irn.ewbDt)),
      'f-dpwt': dp.wt, 'f-dpmark': dp.mark, 'f-dppo': dp.po, 'f-dppodate': dp.podate, 'f-dppkgs': dp.pkgs };
    var f = function (id, k, o) { o = o || {}; var val = VAL[id] ? ' value="' + esc(VAL[id]) + '"' : ''; return '<label class="sd-f' + (o.wide ? ' sd-w' : '') + '" for="' + id + '"><span>' + esc(NS.t(k)) + '</span>' + (o.sel ? '<select id="' + id + '">' + o.sel + '</select>' : '<input id="' + id + '"' + (o.type ? ' type="' + o.type + '"' : '') + (o.ltr ? ' dir="ltr"' : '') + val + '>') + '</label>'; };
    var any = !!(sh || Object.keys(dp).some(function (k) { return dp[k]; }));
    var st = '<option value=""></option>' + NS.STATES.map(function (s) { return '<option value="' + s[0] + '">' + esc(s[1]) + '</option>'; }).join('');
    var mode = dp.mode || '', shs = sh && sh.state || '';
    st = st.replace('value="' + shs + '"', 'value="' + shs + '" selected');
    /* owner 23 Nov: one line above the items (what is filled, and a button); the boxes in a box of their own, so the bill does not grow */
    return '<div class="sd-line"><span class="sd-sum" data-sdsum></span><button type="button" class="btn sm" data-sdopen data-ic="edit">' + esc(NS.t('dp.sum')) + '</button></div>' +
      '<dialog class="sd-dlg" data-sddlg aria-label="' + esc(NS.t('dp.sum')) + '"><div class="dlg-hd"><h2>' + esc(NS.t('dp.sum')) + '</h2></div><div class="sd-body">' +
      /* owner 23 Nov: the whole width, in groups (Ship to, Transport, Goods and order, E-way bill) */
      '<section class="sd-g"><h4>' + esc(NS.t('dp.shipto')) + '</h4><label class="chk"><input type="checkbox" id="f-shipon"' + (sh ? ' checked' : '') + '> ' + esc(NS.t('dp.shipon')) + '</label><div class="sd-grid" id="f-shipbox"' + (sh ? '' : ' hidden') + '>' +
      f('f-shname', 'dp.shname', { wide: 1 }) + f('f-shgstin', 'dp.shgstin', { ltr: 1 }) + f('f-shstate', 'dp.shstate', { sel: st }) + f('f-shaddr', 'dp.shaddr', { wide: 1 }) + f('f-shcity', 'dp.shcity') + f('f-shpin', 'dp.shpin', { ltr: 1 }) + '</div></section>' +
      '<section class="sd-g"><h4>' + esc(NS.t('dp.grp_tr')) + '</h4><div class="sd-grid">' +
      f('f-dpthrough', 'dp.through') + f('f-dpdest', 'dp.dest') + f('f-dpmode', 'dp.mode', { sel: ['', 'Road', 'Rail', 'Air', 'Ship', 'Courier', 'By hand'].map(function (x) { return '<option' + (x && x === mode ? ' selected' : '') + '>' + x + '</option>'; }).join('') }) +
      f('f-dptname', 'dp.tname') + f('f-dpveh', 'dp.veh', { ltr: 1 }) + f('f-dplr', 'dp.lr', { ltr: 1 }) + f('f-dplrdate', 'dp.lrdate', { type: 'date' }) + '</div></section>' +
      '<section class="sd-g"><h4>' + esc(NS.t('dp.grp_goods')) + '</h4><div class="sd-grid">' +
      f('f-dppkgs', 'dp.pkgs') + f('f-dpwt', 'dp.wt') + f('f-dpmark', 'dp.mark', { wide: 1 }) + f('f-dppo', 'dp.po', { ltr: 1 }) + f('f-dppodate', 'dp.podate', { type: 'date' }) + '</div></section>' +
      '<section class="sd-g"><h4>' + esc(NS.t('dp.grp_ewb')) + '</h4><div class="sd-grid">' +
      f('f-dpttype', 'dp.ttype', { wide: 1, sel: NS.EWB_TT.map(function (x) { return '<option value="' + x[0] + '"' + ((dp.ttype || '') === x[0] ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') }) +
      f('f-dpewb', 'dp.ewb', { ltr: 1 }) + f('f-dpewbdt', 'dp.ewbdt', { type: 'date' }) + '</div></div><div class="sd-foot"><button type="button" class="btn primary" data-sdok>' + esc(NS.t('dp.done')) + '</button></div></dialog>';
  }
  /* the one line: Ship to <name or same as the customer> · Dispatch <vehicle, transporter, LR> */
  function sdWire(form) {
    var line = $('[data-sdsum]', form), dl = $('[data-sddlg]', form); if (!line || !dl) return;
    var v = function (id) { var e = $('#' + id, form); return e ? String(e.value || '').trim() : ''; };
    var put = function () {
      var on = $('#f-shipon', form) && $('#f-shipon', form).checked, sh = on && (v('f-shname') || v('f-shaddr')) ? [v('f-shname'), v('f-shcity')].filter(Boolean).join(', ') : '';
      var dp = [v('f-dpveh'), v('f-dptname'), v('f-dplr') ? 'LR ' + v('f-dplr') : '', v('f-dppkgs') ? v('f-dppkgs') + ' pkgs' : '', v('f-dpwt'), v('f-dppo') ? 'PO ' + v('f-dppo') : '', v('f-dpewb') ? 'EWB ' + v('f-dpewb') : ''].filter(Boolean).join(' · ');
      line.innerHTML = '<b>' + esc(NS.t('dp.shipto')) + ':</b> ' + esc(sh || NS.t('dp.same')) + ' <span class="sd-sep">|</span> <b>' + esc(NS.t('dp.t')) + ':</b> ' + esc(dp || NS.t('dp.none'));
    };
    put();
    $('[data-sdopen]', form).addEventListener('click', function () { dl.showModal(); var f = $('input:not([type=checkbox]):not(:disabled), select:not(:disabled)', dl) || $('#f-shipon', form); if (f) f.focus(); });
    $('[data-sdok]', form).addEventListener('click', function () { dl.close(); });
    dl.addEventListener('close', function () { put(); var b = $('[data-sdopen]', form); if (b) b.focus(); });
    dl.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); dl.close(); } });
  }
  function shipDispOf(d) {
    var v = function (id) { var e = $('#' + id, form); return e ? String(e.value || '').trim() : ''; };
    if ($('#f-shipon', form) && $('#f-shipon', form).checked && (v('f-shname') || v('f-shaddr'))) d.ship = { name: v('f-shname') || d.buyer.name, addr: v('f-shaddr'), city: v('f-shcity'), pin: v('f-shpin'), state: v('f-shstate') || d.buyer.state, gstin: v('f-shgstin').toUpperCase() };
    var dp = { through: v('f-dpthrough'), dest: v('f-dpdest'), mode: v('f-dpmode'), veh: v('f-dpveh').toUpperCase(), tname: v('f-dptname'), lr: v('f-dplr'), lrdate: v('f-dplrdate'), ewb: v('f-dpewb'), ewbdate: v('f-dpewbdt'), wt: v('f-dpwt'), mark: v('f-dpmark'), po: v('f-dppo'), podate: v('f-dppodate'), pkgs: v('f-dppkgs'), ttype: v('f-dpttype') };
    if (Object.keys(dp).some(function (k) { return dp[k]; })) { d.disp = dp; d.tr = { veh: dp.veh, tname: dp.tname, lr: dp.lr }; }
    return d;
  }
  /* the design / paper chosen for this kind of document (Print designs, Masters > Voucher types) */
  function vtd(ty, kind, f) { try { var c = NS.vtCfg(NS.cfgFor(CFG, BIZ), ty, kind || '') || {}; return c[f] || ''; } catch (e) { return ''; } }
  function saleFromForm() {
    var b = billFromForm(), inv = CFG.invoice || {}, ship = /^(comp|unreg)$/.test(BIZ.reg || '') || !String(BIZ.gstin || '').trim() || b.noGst;
    var d = { type: 'invoice', app: 1, kind: ship ? 'supply' : 'tax', no: b.no, deliv: '', orig: { no: '', date: '' }, reason: 'ret', tr: { veh: '', tname: '', lr: '' },
      paper: vtd('invoice', '', 'paper') || inv.paper || 'a4', design: vtd('invoice', '', 'design') || inv.design || 'classic', copies: 1, date: b.date, due: b.due || '', pos: '', rc: false, recv: '', ref: '',
      seller: sellerCopy(), buyer: { name: b.buyer.name, addr: '', city: '', pin: '', state: b.buyer.state, gstin: b.buyer.gstin, phone: '' }, ship: null, einv: null, irn: null,
      items: b.items.map(function (it) { return Object.assign({}, it, { disc: it.disc || '' }); }), round: b.round, comp: true, notes: inv.notes || '', terms: inv.terms || '',
      status: 'unpaid', copyLabel: 'orig', valid: '', charges: chgOut(), tcs: { on: false, rate: '', base: 'total', sec: '' }, rec: null };
    var pm = C.party.filter(function (p) { return key(p.name) === key(d.buyer.name); })[0];
    if (pm) ['addr', 'city', 'pin', 'phone'].forEach(function (k) { if (pm[k]) d.buyer[k] = pm[k]; });
    var t = B.itemTotals(d), total = r2(t.taxable + t.cgst + t.sgst + t.igst);
    d.total = d.round ? Math.round(total) : total;
    d.tax = { taxable: t.taxable, cgst: t.cgst, sgst: t.sgst, igst: t.igst };
    if ($('#f-sl', form)) d.sl = $('#f-sl', form).value.trim();   /* A-9: sales ledger of this bill */
    if ($('#f-narr', form)) d.narr = $('#f-narr', form).value.trim();   /* A-26 */   /* A-9: sales ledger of this bill */
    if (!F.rec) { if (F.vt) d.vt = F.vt; NS.vtApply(d, NS.vtCfg(CFG, 'invoice', '', F.vt)); }   /* C-11 / A-7: this voucher type's defaults and series */
    if (F.conv) { d.fromId = F.conv.fromId; d.against = F.conv.against; d.ref = F.conv.ref || ''; if (F.conv.einv) d.einv = F.conv.einv; if (F.conv.ship) d.ship = F.conv.ship; }
    if (F.chl && F.chl.length && !d.against) d.against = 'Delivery challan ' + F.chl.join(', ');   /* Bill against a challan (orders.js) */
    return shipDispOf(d);
  }
  function drawSum() {
    var d = F.kind === 'sale' ? saleFromForm() : F.vd ? F.vd.build() : billFromForm(), t = d.tax;
    $$('[data-lamt]', form).forEach(function (s) { var L = F.lines[+s.getAttribute('data-lamt')] || {}, a = (L.qty === '' || L.qty == null ? 1 : num(L.qty)) * num(L.rate); a = a - a * num(L.disc) / 100; s.textContent = a ? money(a, false) : ''; });
    $('[data-sum]', form).innerHTML = '<span>' + esc(T('taxable')) + ' <b>' + money(t.taxable) + '</b></span><span>' + esc(T('tax')) + ' <b>' + money(t.cgst + t.sgst + t.igst) + '</b>' + (t.igst ? ' (IGST)' : t.cgst ? ' (CGST + SGST)' : '') + '</span><span>' + esc(T('total')) + ' <b>' + money(d.total) + '</b></span>';
  }
  /* open bills of the party on the right side, ticked oldest first up to the amount */
  function drawAlloc(prefill) {
    var out = F.kind === 'mout', side = out ? 'pay' : 'recv', p = key($('#f-party', form).value), box = $('[data-alloc]', form);
    var D = mine().filter(function (d) { return !F.rec || d.id !== F.rec.id; });
    var open = p ? B.bills(D, bizName(), p).bills.filter(function (b) { return b.side === side; }).sort(function (a, b) { return a.date.localeCompare(b.date); }) : [];
    var gross = num($('#f-amt', form).value) + (out ? 0 : num($('#f-tds', form).value)) + num(($('#f-disc', form) || {}).value);
    var had = {}; ((F.rec && F.rec.alloc) || []).forEach(function (a) { had[a.id] = num(a.amt); });
    var left = gross;
    if (F.forId && open.some(function (b) { return b.id === F.forId; })) open.sort(function (a, b) { return (b.id === F.forId) - (a.id === F.forId); });
    box.innerHTML = open.length ? open.map(function (b) {
      var v = F.rec ? (had[b.id] || 0) : r2(Math.max(0, Math.min(b.left, left))); if (!F.rec) left = r2(left - v);
      return '<div class="al"><label class="chk"><input type="checkbox" data-al="' + b.id + '"' + (v > 0 ? ' checked' : '') + '> <span><b>' + esc(b.no || docName(b)) + '</b> <span class="soft">' + ldate(b.date) + ' · ' + esc(T('left', { a: money(b.left) })) + '</span></span></label>' +
        '<input data-al="' + b.id + '" data-max="' + b.left + '" inputmode="decimal" dir="ltr" value="' + (v > 0 ? v : '') + '" aria-label="' + esc(T('settle', { a: b.no })) + '"></div>'; }).join('')
      : '<p class="soft">' + esc(p ? T('noopen') : '') + '</p>';
    $$('input[type=checkbox][data-al]', box).forEach(function (c) {
      c.addEventListener('change', function () {
        var amtI = $('input[data-al="' + c.getAttribute('data-al') + '"]:not([type=checkbox])', box);
        if (!c.checked) amtI.value = '';
        else {   /* an amount already typed: a ticked bill gets only what is left of it, never more than was received (19 Nov 2026) */
          var used = sumAlloc() - num(amtI.value), typed = num($('#f-amt', form).value) > 0, room = r2(Math.max(0, Math.min(num(amtI.getAttribute('data-max')), gross - used)));
          if (typed && room <= 0) { c.checked = false; amtI.value = ''; NS.toast(T('alfull'), 'bad'); return; }
          amtI.value = typed ? room : amtI.getAttribute('data-max');
        }
        /* nothing typed in the amount yet: ticking a bill fills it with what is left on the ticked bills (round C) */
        var ai = $('#f-amt', form); if (c.checked && ai && !ai.value.trim()) { ai.value = String(r2(sumAlloc())); gross = sumAlloc(); var tx = $('#f-tdsx', form); if (tx && tx.value.trim()) tdsPair('f-tdsx'); }
        advLeft();
      });
    });
    advLeft();
  }
  function sumAlloc() { return r2($$('[data-alloc] input[data-al]:not([type=checkbox])', form).reduce(function (a, i) { return a + num(i.value); }, 0)); }
  function advLeft() {
    var out = F.kind === 'mout', gross = num($('#f-amt', form).value) + (out ? 0 : num($('#f-tds', form).value)) + num(($('#f-disc', form) || {}).value), x = r2(gross - sumAlloc());
    $('[data-advleft]', form).textContent = x > 0.004 && $('#f-party', form).value.trim() ? T('advleft', { a: money(x) }) : '';
  }

  function reserveNo(type, pre, date) {
    var isV = type === 'vno', x = isV ? NS.nextNo(vnoDocs(), Object.assign(nxApp('exp', 'EXP', date), { tag: '' })) : NS.nextNo(mine(), Object.assign(nxApp(type, pre, date), { tag: '' }));
    if (x.manual || x.suffix || x.series.restart !== 'year') return Promise.resolve(null);
    /* the scope is written like the makers' (slip.js, docs.js), so the App and the maker share one series */
    var scope = type === 'cashmemo' ? key(bizName()) : (isV ? 'exp' : type) + '|' + key(bizName()) + '|';
    return NSStore.sfClaim({ scope: scope, prefix: x.head, digits: x.width, nos: x.nos });
  }
  function submit() {
    var k = F.kind, plan = null, date = $('#f-date', form) ? $('#f-date', form).value : '', md = $('#f-mode', form);
    if (date && F.biz === bizName()) {
      if (k === 'mout' && !F.rec) plan = ['voucher', 'PV'];
      else if (k === 'min' && !F.rec) plan = ['receipt', 'RCT'];
      else if (k === 'pbill' && !F.rec && !(md && md.value === 'credit')) plan = ['voucher', 'PV'];
      else if (k === 'csale' && !F.rec) plan = ['cashmemo', 'CM'];
      else if (k === 'exp' && !(F.rec && F.rec.vno)) plan = ['vno', 'EXP'];
    }
    PRE = null;
    if (!plan) return submitNow();
    return reserveNo(plan[0], plan[1], date).then(function (no) { PRE = no ? { k: plan[0], no: no } : null; submitNow(); });
  }
  /* sales check 24 Nov: a line with quantity 0 or text, a minus rate, or a GST rate that does not exist was saved as it was
     (a bill of Rs 0, a bill of minus Rs 71, a 7% line). Every bill line is checked before saving; the box is shown. */
  function lineBad(d, form) {
    var rates = NS.gstRatesFor(d.date), nogst = $('#f-nogst', form) && $('#f-nogst', form).checked;
    var rows = $$('[data-lines] [data-lk="desc"]', form);
    for (var i = 0; i < (F.lines || []).length; i++) {
      var L = F.lines[i]; if (!String(L.desc || '').trim() && !num(L.rate)) continue;
      var box = function (k) { return $('[data-li="' + i + '"][data-lk="' + k + '"]', form) || rows[i]; };
      var n = i + 1, q = String(L.qty == null ? '' : L.qty).trim();
      if (q !== '' && !(num(q) > 0)) return [box('qty'), T('l_qty', { n: n })];
      if (num(L.rate) < 0) return [box('rate'), T('l_neg', { n: n })];
      if (!nogst && rates.indexOf(num(L.gst)) < 0) return [box('gst'), T('l_gst', { n: n, r: L.gst, list: rates.join(', ') })];
    }
    return null;
  }
  function submitNow() {
    if (F.biz !== bizName()) { NS.toast(NS.t('ux.bizmoved', { b: bizName() }), 'bad'); dlg.close(); show(); return; }   /* never save under a business the form did not show */
    var k = F.kind, miss = $$('[required]', form).filter(function (i) { return !String(i.value).trim(); });
    if (miss.length) { NS.toast(T('need', { f: miss.map(function (i) { return $('label[for="' + i.id + '"]', form).textContent; }).join(', ') }), 'bad'); miss[0].focus(); return; }
    var lock = window.NSApp.closedMsg && $('#f-date', form) && (NSApp.closedMsg($('#f-date', form).value) || F.rec && NSApp.closedMsg(F.rec.date));   /* closed financial year (more.js) */
    if (lock) { NS.toast(lock, 'bad'); return; }
    if (window.NSCF && NSCF.appTake(form, F) === false) return;   /* required custom fields; the values go on the voucher saved below */
    var rec = F.rec ? JSON.parse(JSON.stringify(F.rec)) : null, jobs = [], party = $('#f-party', form) ? $('#f-party', form).value.trim() : '', d;
    if (k === 'min' || k === 'mout') {
      if (r2(sumAlloc()) > r2(num($('#f-amt', form).value) + (k === 'mout' ? 0 : num($('#f-tds', form).value)) + num(($('#f-disc', form) || {}).value)) + 0.004) { NS.toast(T('alover'), 'bad'); return; }   /* bills set off can never add up to more than the amount */
      var out = k === 'mout', amt = r2(num($('#f-amt', form).value)), alloc = $$('[data-alloc] input[data-al]:not([type=checkbox])', form).filter(function (i) { return num(i.value) > 0; }).map(function (i) {
        var b = C.doc.filter(function (x) { return x.id === i.getAttribute('data-al'); })[0]; return { id: i.getAttribute('data-al'), no: b ? b.no || '' : '', amt: r2(Math.min(num(i.value), num(i.getAttribute('data-max')))) }; });
      var date = $('#f-date', form).value, nos = alloc.map(function (a) { return a.no; }).filter(Boolean).join(', ');
      if (out) {
        d = Object.assign(rec || { type: 'voucher', no: nextNo('voucher', 'PV', date), paper: 'a4', design: vtd('voucher', '', 'design') || 'classic', copies: 1, copyLabel: 'orig', tdsSec: '', rcm: false, rcmRate: '18', prep: '', appr: '', status: '' }, {
          app: 1, forBill: true, date: date, seller: Object.assign(rec ? rec.seller : {}, sellerCopy()), mode: $('#f-mode', form).value, ref: $('#f-ref', form).value.trim(), tdsRate: $('#f-tds', form).value.trim(), disc: r2(num($('#f-disc', form).value)), alloc: alloc,
          lines: [{ desc: $('#f-note', form).value.trim() || (nos ? 'Payment against bill ' + nos : 'Payment on account'), head: 'Supplier payment', amt: amt }] });
        d.buyer = Object.assign(rec ? rec.buyer : { addr: '', phone: '', gstin: '', pan: '' }, { name: party });
      } else {
        var unpaidLeft = r2(amt + num($('#f-tds', form).value) + num($('#f-disc', form).value) - alloc.reduce(function (a, x) { return a + x.amt; }, 0));
        d = Object.assign(rec || { type: 'receipt', no: nextNo('receipt', 'RCT', date), paper: 'a4', design: vtd('receipt', '', 'design') || 'classic', copies: 1, copyLabel: '', gstAdv: false, rate: '18', pos: '', sac: '', rv: '', rvDate: '', refDate: '', bank: '', balance: '', status: '' }, {
          app: 1, kind: alloc.length ? 'pay' : 'adv', date: date, seller: Object.assign(rec ? rec.seller : {}, sellerCopy()), amount: amt, tds: $('#f-tds', form).value.trim(), disc: r2(num($('#f-disc', form).value)), mode: $('#f-mode', form).value,
          ref: $('#f-ref', form).value.trim(), against: nos, purpose: $('#f-note', form).value.trim() || (unpaidLeft > 0.004 && alloc.length ? 'Part advance' : ''), alloc: alloc });
        d.buyer = Object.assign(rec ? rec.buyer : { addr: '', phone: '', gstin: '', pan: '' }, { name: party });
      }
      d.total = amt; setBacct(d, bankVal(form, 'f-bank'));
      if ($('#f-note', form) && $('#f-note', form).value.trim()) d.narr = $('#f-note', form).value.trim(); else delete d.narr;   /* A-26: narration in the ledgers and Tally */
      var cq = chqFromForm(); if (cq) d.chq = cq; else delete d.chq;
      jobs.push(savePartyRole(party, out ? 'supplier' : 'customer'));
      return Promise.all(jobs).then(function () { return NSStore.put('doc', d); }).then(function (saved) { return markPaid(saved); }).then(done);
    }
    if (k === 'pbill' || k === 'pret') {
      d = billFromForm();
      if (!d.items.length) { NS.toast(T('need', { f: T('items') }), 'bad'); return; }
      var lb0 = lineBad(d, form); if (lb0) { NS.toast(lb0[1], 'bad'); if (lb0[0]) lb0[0].focus(); return; }
      if (rec) d = Object.assign(rec, d, { id: rec.id });
      var dup = k === 'pbill' && C.doc.filter(function (x) { return x.type === 'pbill' && x.kind !== 'return' && x.id !== (rec && rec.id) && key(x.no) === key(d.no) && key(B.partyName(x)) === key(party) && key(x.seller && x.seller.name) === key(bizName()); })[0];
      if (dup && !NS.okSync(T('samebill', { no: d.no, p: party }))) return;   /* (a check before saving the App's own entry; NS.ask is used where Save waits for an answer) */
      var mode = $('#f-mode', form) ? $('#f-mode', form).value : 'credit';
      if (window.NSApp.formSave) NSApp.formSave(k, d, form, F);
      jobs.push(savePartyRole(party, 'supplier', { gstin: d.buyer.gstin, state: d.buyer.state }));
      d.items.forEach(function (it) {
        if (!it.desc) return;
        var hit = C.item.filter(function (x) { return key(x.desc) === key(it.desc); })[0];
        if (!hit) jobs.push(NSStore.put('item', { desc: it.desc, hsn: it.hsn, unit: it.unit, rate: '', prate: it.rate, gst: it.gst, kind: 'goods' }));
        else if (k === 'pbill' && num(it.rate) && num(it.rate) !== num(hit.prate)) jobs.push(NSStore.put('item', Object.assign({}, hit, { prate: it.rate })));   /* the purchase rate only, never the sale rate */
      });
      return Promise.all(jobs).then(function () { return NSStore.put('doc', d); }).then(function (saved) {
        if (mode === 'credit' || k !== 'pbill') return saved;
        /* paid at once: a payment entry linked to this bill */
        var v = { type: 'voucher', app: 1, forBill: true, no: nextNo('voucher', 'PV', saved.date), date: saved.date, paper: 'a4', design: vtd('voucher', '', 'design') || 'classic', copies: 1, copyLabel: 'orig', tdsSec: '', tdsRate: '', rcm: false, rcmRate: '18', prep: '', appr: '', status: '',
          seller: sellerCopy(), buyer: { name: party, addr: '', phone: '', gstin: saved.buyer.gstin, pan: '' }, mode: mode, ref: '', alloc: [{ id: saved.id, no: saved.no, amt: r2(saved.total - B.tdsBk(saved)) }],
          lines: [{ desc: 'Payment against bill ' + saved.no, head: 'Supplier payment', amt: r2(saved.total - B.tdsBk(saved)) }] };   /* TDS cut on the bill is not paid to the supplier (S-20) */
        v.total = r2(saved.total - B.tdsBk(saved)); setBacct(v, bankVal(form, 'f-bank'));
        return NSStore.put('doc', v);
      }).then(done);
    }
    if (k === 'sale') {
      d = saleFromForm(); delete d.tax;
      /* F1-11: changing a saved sale bill keeps it (same id, paid status, ship-to and dispatch), never a second copy */
      if (F.rec) d = Object.assign(JSON.parse(JSON.stringify(F.rec)), d, { id: F.rec.id, status: F.rec.status, paidBy: F.rec.paidBy, ship: d.ship || F.rec.ship || null, disp: d.disp || F.rec.disp });
      if (!d.items.length) { NS.toast(T('need', { f: T('items') }), 'bad'); return; }
      var lb1 = lineBad(d, form); if (lb1) { NS.toast(lb1[1], 'bad'); if (lb1[0]) lb1[0].focus(); return; }
      /* the number is checked against the saved bills NOW, not the list read when the form opened: another tab or a second person
         may have used it meanwhile (P3-6). A number the App suggested moves on to the next free one; a typed one is refused. */
      var smode0 = $('#f-mode', form) ? $('#f-mode', form).value : 'credit';
      return fyAsk(d).then(function () { return smode0 === 'credit' && NS.creditAsk ? NS.creditAsk(bizName(), party, d.total, d.date, F.rec && F.rec.id) : null; }).then(function () { return NS.stockGuard ? NS.stockGuard(d, F.rec && F.rec.id) : null; }).then(function () { return NSStore.list('doc'); }).then(function (all) {   /* A-15: credit limit / overdue bills (warn or block, per party) */   /* ERP round 1: stock checks (stockguard.js) */
      var dupOf = function (no) { return all.filter(function (x) { return x.id !== d.id && (x.type || 'invoice') === 'invoice' && key(x.no) === key(no) && NS.fy(x.date) === NS.fy(d.date) && key(x.seller && x.seller.name) === key(bizName()); })[0]; };
      /* a bill whose date was changed into another financial year takes that year's next number, not the one suggested for today (R-002) */
      if (F.autoNo && d.no === F.autoNo && !dupOf(d.no)) { var want = NS.nextInvNo(all, bizName(), d.date, CFG, d.vt); if (want && want !== d.no && NS.fy(d.date) !== NS.fy(NS.today())) { var was0 = d.no; d.no = F.autoNo = want; $('#f-no', form).value = d.no; F.renumMsg = NS.t('c.renumfy', { a: was0, b: d.no, fy: NS.fy(d.date) }); } }
      if (dupOf(d.no)) {
        if (F.autoNo && d.no === F.autoNo) { var was = d.no; d.no = F.autoNo = NS.nextInvNo(all, bizName(), d.date, CFG, d.vt); $('#f-no', form).value = d.no; F.renumMsg = NS.t('c.renum', { a: was, b: d.no }); }
        else { NS.toast(T('qe_dup', { no: d.no }), 'bad'); $('#f-no', form).focus(); throw 'dup'; }
      }
      var smode = $('#f-mode', form) ? $('#f-mode', form).value : 'credit';
      jobs.push(savePartyRole(party, 'customer', { gstin: d.buyer.gstin, state: d.buyer.state }));
      d.items.forEach(function (it) {
        if (!it.desc) return;
        var hit = C.item.filter(function (x) { return key(x.desc) === key(it.desc); })[0];
        if (!hit) jobs.push(NSStore.put('item', { desc: it.desc, hsn: it.hsn, unit: it.unit, rate: it.rate, prate: '', gst: it.gst, kind: 'goods' }));   /* a new item learns its sale rate; a saved one keeps its price list */
      });
      return Promise.all(jobs).then(function () { return NSStore.put('doc', d); }).then(function (saved) {
        F.savedNo = saved.no; F.savedRec = saved; if (saved.fromId && window.NSVDocs) NSVDocs.markFrom(saved);
        if (smode === 'credit') return saved;
        /* paid at once: a receipt linked to this bill, and the bill is marked paid (as Money received does) */
        var rv = { type: 'receipt', app: 1, kind: 'pay', no: nextNo('receipt', 'RCT', saved.date), date: saved.date, paper: 'a4', design: vtd('receipt', '', 'design') || 'classic', copies: 1, copyLabel: '', gstAdv: false, rate: '18', pos: '', sac: '', rv: '', rvDate: '', refDate: '', bank: '', balance: '', status: '',
          seller: sellerCopy(), buyer: { name: party, addr: '', phone: '', gstin: saved.buyer.gstin, pan: '' }, amount: saved.total, tds: '', disc: 0, mode: smode, ref: '', against: saved.no, purpose: '', alloc: [{ id: saved.id, no: saved.no, amt: saved.total }] };
        rv.total = saved.total; setBacct(rv, bankVal(form, 'f-bank'));
        return NSStore.put('doc', rv).then(markPaid);
      }).then(done);
      }).catch(function (e) { if (e !== 'dup' && !(e && e.message === 'cancel')) throw e; });
    }
    if (k === 'vdoc') {
      var lb2 = F.lines && lineBad({ date: $('#f-date', form) ? $('#f-date', form).value : NS.today() }, form); if (lb2) { NS.toast(lb2[1], 'bad'); if (lb2[0]) lb2[0].focus(); return; }   /* sales check 24 Nov: the same line checks on every other document */
      var how = andPrint;
      return F.vd.save(form).then(function (saved) { if (!saved) return; F.savedNo = saved.no; F.savedRec = saved; F.renumMsg = F.vd.renum; done(); if (!how && NSVDocs.after) how = NSVDocs.after(saved); if (!how && NSApp.askPrint) NSApp.askPrint('vdoc', saved); if (how === 'share') NSVDocs.out(saved, 'share'); else if (how) { if (NSApp.chooseCopies) NSApp.chooseCopies('vdoc', saved).then(function (cp) { if (cp) NSVDocs.out(saved, 'print', cp); }); else NSVDocs.out(saved, 'print'); } });   /* C-15: print / share after saving */
    }
    if (k === 'exp') {
      d = Object.assign(rec || { type: 'exp', app: 1 }, { date: $('#f-date', form).value, seller: sellerCopy(), cat: catCode($('#f-cat', form).value.trim()), amount: r2(num($('#f-amt', form).value)), mode: $('#f-mode', form).value,
        buyer: { name: party }, no: $('#f-no', form).value.trim(), gst: $('#f-gst', form).value, itc: $('#f-itc', form).checked, inter: $('#f-inter', form).checked, notes: $('#f-note', form).value.trim() });
      d.total = d.amount; setBacct(d, bankVal(form, 'f-bank')); d.narr = d.notes;   /* A-26: the note is the narration in the ledgers and Tally */
      if (d.mode === 'credit' && !party) { NS.toast(T('need', { f: T('payee') }), 'bad'); $('#f-party', form).focus(); return; }
      if (party) jobs.push(savePartyRole(party, 'supplier'));
      if (window.NSApp.formSave) NSApp.formSave(k, d, form, F);
      if (!d.vno) d.vno = vnoNext(d.date);   /* our own voucher number (the bill no. box is the supplier's), printed on the voucher */
      var pr = andPrint;
      return Promise.all(jobs).then(function () { return NSStore.put('doc', d); }).then(function (saved) { done(); if (pr) printVoucher(saved || d); });
    }
    if (k === 'csale') {   /* a sale on credit (udhaar) is saved as an unpaid cash memo, so cash-memo. can print it */
      var amt2 = r2(num($('#f-amt', form).value)), date2 = $('#f-date', form).value, ph = $('#f-phone', form).value.trim();
      d = { type: 'cashmemo', kind: 'cashmemo', app: 1, no: nextNo('cashmemo', 'CM', date2), date: date2, due: $('#f-due', form).value, deliv: '', orig: { no: '', date: '' }, reason: 'ret', tr: { veh: '', tname: '', lr: '' },
        paper: 'th80', design: 'classic', copies: 1, pos: '', rc: false, recv: '', ref: '', seller: sellerCopy(),
        buyer: { name: party, addr: '', city: '', pin: '', state: BIZ.state || '', gstin: '', phone: ph }, ship: null, einv: null, irn: null,
        items: [{ desc: $('#f-desc', form).value.trim() || 'Goods on credit', hsn: '', qty: 1, unit: 'Nos', rate: amt2, disc: '', gst: 0 }],
        round: false, comp: true, notes: '', terms: '', status: 'unpaid', copyLabel: '', withGst: false, valid: '', total: amt2 };
      return savePartyRole(party, 'customer', { phone: ph }).then(function () { return NSStore.put('doc', d); }).then(done);
    }
    if (k === 'contra') {
      var fr = $('#f-dir', form).value, b1 = $('#f-bank', form) ? $('#f-bank', form).value : 'bank', b2 = $('#f-bank2', form) ? $('#f-bank2', form).value : 'bank';
      if (fr === 'xfer' && b1 === b2) { NS.toast(T('banksame'), 'bad'); return; }
      d = Object.assign(rec || { type: 'contra', app: 1, no: nextNo('contra', 'CV', $('#f-date', form).value) }, { date: $('#f-date', form).value, seller: sellerCopy(), from: fr === 'xfer' ? b1 : fr, to: fr === 'xfer' ? b2 : fr === 'cash' ? 'bank' : 'cash', amount: r2(num($('#f-amt', form).value)), ref: $('#f-ref', form).value.trim(), notes: $('#f-note', form).value.trim() });
      d.total = d.amount; setBacct(d, fr === 'xfer' ? '' : bankVal(form, 'f-bank')); d.narr = d.notes;   /* A-26 */
      return NSStore.put('doc', d).then(done);
    }
    if (k === 'ob') {
      d = Object.assign(rec || { type: 'ob', app: 1 }, { date: $('#f-date', form).value, seller: sellerCopy(), buyer: { name: /^(cash|bank)$/.test($('#f-side', form).value) ? '' : party }, side: $('#f-side', form).value, amount: r2(num($('#f-amt', form).value)) });
      d.total = d.amount; d.no = ''; setBacct(d, d.side === 'bank' ? bankVal(form, 'f-bank') : '');
      if (window.NSApp.obGrid && NSApp.obGrid.read(form, d) === false) return;
      if (!d.buyer.name) return NSStore.put('doc', d).then(done);
      return savePartyRole(party, d.side === 'pay' ? 'supplier' : 'customer').then(function () { return NSStore.put('doc', d); }).then(done);
    }
  }
  function done() {
    var again = F && F.quick && !F.rec ? F.kind : '', no = F && F.savedNo;
    var rm = F && F.renumMsg, kd = F && F.kind, sr = F && F.savedRec; PRE = null; dlg.close(); NS.toast(rm || (again ? T('qe_saved', { no: no || '' }) : T('saved')), rm ? 'warn' : ''); NS.checkReminder && NS.checkReminder(); show();
    /* owner 22 Nov: ask to print after saving a bill or voucher (vdoc documents ask in their own save path) */
    var TY = { sale: 'invoice', min: 'receipt', mout: 'voucher', pbill: 'pbill', pret: 'pbill', exp: 'exp', contra: 'contra' };
    /* owner 23 Nov: the saved voucher stays on screen (New, Print, Next are there); the "Print it now?" box comes on top of it */
    if (!again && (sr || (no && TY[kd]))) load().then(function () {
      var d = sr && sr.id ? mine().filter(function (x) { return x.id === sr.id; })[0] || sr : mine().filter(function (x) { return (x.type || 'invoice') === TY[kd] && (x.no === no || x.vno === no); }).sort(function (a, b) { return (b.updated || b.created || 0) - (a.updated || a.created || 0); })[0];
      if (!d) return;
      if (!(dlg && dlg.open)) openForm(kd, { rec: d });
      if (kd !== 'vdoc' && TY[kd] && NSApp.askPrint && !(NSApp._noAsk && Date.now() - NSApp._noAsk < 5000)) NSApp.askPrint(kd, d);
    });
    if (again) load().then(function () { openForm(again, { quick: 1 }); });   /* quick entry: the next one, blank (after the saved one is in the list, so the next number is right) */
  }
  /* ---------- quick entry: the five everyday entries, keyboard first ---------- */
  /* Quick entry's tabs and defaults, chosen by the user with Customize (owner 2026-11-18); kept in localStorage ns-qe (a tool
     setting: core.js carries it to the data home). Alt+1..5 stay on the first five tabs shown. */
  var QEALL = ['sale', 'pbill', 'min', 'mout', 'exp', 'contra', 'pret'];
  function qeP() { try { return JSON.parse(localStorage.getItem('ns-qe') || '{}') || {}; } catch (e) { return {}; } }
  function qeTabs() { var t = (qeP().tabs || []).filter(function (x) { return QEALL.indexOf(x) >= 0; }); return t.length ? t : ['sale', 'pbill', 'min', 'mout', 'exp']; }
  function qeGst() { var g = qeP().gst; return g != null && g !== '' && !isNaN(+g) ? +g : 18; }
  function qeMode(k) { var m = (qeP().mode || {})[k]; return m || ''; }
  var QE = qeTabs();
  function qeCustomize() {
    var P = qeP(), tabs = qeTabs().slice(), off = QEALL.filter(function (x) { return tabs.indexOf(x) < 0; });
    var d = $('#qe-cus'); if (!d) { d = document.createElement('dialog'); d.id = 'qe-cus'; d.className = 'hub-dlg qe-cus'; document.body.appendChild(d); }
    var nm = function (q) { return T(q === 'sale' ? 'qe_sale' : q); };
    function list() {
      return tabs.concat(off).map(function (q) { var on = tabs.indexOf(q) >= 0, i = tabs.indexOf(q);
        return '<li><label class="chk"><input type="checkbox" data-qt="' + q + '"' + (on ? ' checked' : '') + '> ' + esc(nm(q)) + (on && i < 5 ? ' <kbd>Alt ' + (i + 1) + '</kbd>' : '') + '</label>' +
          (on ? '<span><button type="button" class="btn sm ib" data-qup="' + q + '" title="' + esc(T('qe_cus_up')) + '" aria-label="' + esc(T('qe_cus_up')) + '"' + (i ? '' : ' disabled') + '>↑</button><button type="button" class="btn sm ib" data-qdn="' + q + '" title="' + esc(T('qe_cus_down')) + '" aria-label="' + esc(T('qe_cus_down')) + '"' + (i < tabs.length - 1 ? '' : ' disabled') + '>↓</button></span>' : '') + '</li>'; }).join('');
    }
    function draw() {
      setTimeout(function () { var ul = $('.qe-cl', d); if (ul && NS.dragSort) NS.dragSort(ul, function (a, b) { tabs.splice(b, 0, tabs.splice(a, 1)[0]); draw(); }, function (i) { return i < tabs.length; }); }, 0);
      d.innerHTML = '<div class="dlg-h"><h2>' + esc(T('qe_cus_t')) + '</h2></div><div class="dlg-b"><h3>' + esc(T('qe_cus_tabs')) + '</h3><ul class="qe-cl">' + list() + '</ul>' +
        '<div class="fg">' + fld('qc-gst', T('qe_cus_gst'), sel('qc-gst', String(qeGst()), ['0', '0.1', '0.25', '1.5', '3', '5', '12', '18', '40'].map(function (r) { return [r, r + '%']; }))) +
        fld('qc-sale', T('qe_cus_sale'), sel('qc-sale', qeMode('sale') || '', [['', T('qe_cus_std')]].concat(modeOpts(true)))) +
        fld('qc-pbill', T('qe_cus_pur'), sel('qc-pbill', qeMode('pbill') || '', [['', T('qe_cus_std')]].concat(modeOpts(true)))) + '</div>' +
        '<label class="chk"><input type="checkbox" id="qc-round"' + (P.round === false ? '' : ' checked') + '> ' + esc(T('qe_cus_round')) + '</label>' +
        '<p class="qa-msg" role="alert" hidden></p></div><div class="dlg-foot"><button type="button" class="btn primary" data-qsave>' + esc(T('save')) + '</button><button type="button" class="btn" data-qreset>' + esc(T('qe_cus_reset')) + '</button><button type="button" class="btn" data-qx>' + esc(T('cancel')) + '</button></div>';
    }
    draw();
    d.onclick = function (e) {
      var b = e.target.closest('button,input'); if (!b) return;
      if (b.hasAttribute('data-qt')) { var q = b.getAttribute('data-qt'); if (b.checked) { off.splice(off.indexOf(q), 1); tabs.push(q); } else { tabs.splice(tabs.indexOf(q), 1); off.push(q); } draw(); return; }
      if (b.hasAttribute('data-qup') || b.hasAttribute('data-qdn')) { var k = b.getAttribute('data-qup') || b.getAttribute('data-qdn'), i = tabs.indexOf(k), j = b.hasAttribute('data-qup') ? i - 1 : i + 1; tabs.splice(i, 1); tabs.splice(j, 0, k); draw(); return; }
      if (b.hasAttribute('data-qx')) { d.close(); return; }
      if (b.hasAttribute('data-qreset')) { try { localStorage.removeItem('ns-qe'); } catch (er) {} QE = qeTabs(); d.close(); reopen(); return; }
      if (b.hasAttribute('data-qsave')) {
        if (!tabs.length) { var m = $('.qa-msg', d); m.textContent = T('qe_cus_need'); m.hidden = false; return; }
        var np = { tabs: tabs, gst: $('#qc-gst', d).value, mode: { sale: $('#qc-sale', d).value, pbill: $('#qc-pbill', d).value }, round: $('#qc-round', d).checked };
        try { localStorage.setItem('ns-qe', JSON.stringify(np)); } catch (er) {}
        QE = qeTabs(); d.close(); NS.toast(T('qe_cus_ok')); reopen();
      }
    };
    function reopen() { if (dlg && dlg.open && F && F.quick && !dlg.getAttribute('data-dirty')) openForm(QE.indexOf(F.kind) >= 0 ? F.kind : QE[0], { quick: 1 }); }
    d.showModal();
  }
  function quickEntry(kind) {
    whenReady(function () {
      if (!BIZ) { NS.toast(T('qe_nobiz'), 'bad'); return; }
      if (dlg && dlg.open) dlg.close();
      openForm(QE.indexOf(kind) >= 0 ? kind : 'sale', { quick: 1 });
    });
  }
  /* Enter moves to the next box (the last box of the last item line starts a new line); Ctrl+S or Ctrl+Enter saves; Alt+1..5 switch */
  document.addEventListener('keydown', function (e) {
    if (!dlg || !dlg.open || !F || !$('[data-of]', form)) return;
    var k = (e.key || '').toLowerCase(), t = e.target;
    if (e.altKey && !e.ctrlKey && F.quick) { var n = /^Digit([1-5])$/.exec(e.code || ''); if (n && QE[+n[1] - 1]) { e.preventDefault(); openForm(QE[+n[1] - 1], { quick: 1 }); } return; }
    if ($('dialog[open]:not(#app-form)') && !(t && dlg.contains(t))) return;   /* a box on top (quick add) has its own keys (P4-4) */
    if ((e.ctrlKey || e.metaKey) && (k === 's' || k === 'enter')) { e.preventDefault(); if (form.requestSubmit) form.requestSubmit(); else submit(); return; }
    if (k !== 'enter' || e.shiftKey || !t || !form.contains(t) || !/^(INPUT|SELECT)$/.test(t.tagName) || /^(checkbox|file|submit|button)$/.test(t.type)) return;
    e.preventDefault();
    if (t.getAttribute('data-lk') === 'gst' && +t.getAttribute('data-li') === F.lines.length - 1 && (String(F.lines[F.lines.length - 1].desc).trim() || num(F.lines[F.lines.length - 1].rate))) {
      F.lines.push({ desc: '', hsn: '', qty: 1, rate: '', gst: $('#f-nogst', form) && $('#f-nogst', form).checked ? 0 : F.quick ? qeGst() : 18 }); drawLines();
      var nd = $$('[data-lk=desc]', form); nd[nd.length - 1].focus(); return;
    }
    var all = $$('input,select', form).filter(function (x) { return !x.disabled && x.type !== 'hidden' && x.type !== 'file' && x.type !== 'checkbox' && x.offsetParent !== null && !x.closest('details:not([open])'); });
    var i = all.indexOf(t);
    if (i >= 0 && i < all.length - 1) { all[i + 1].focus(); if (all[i + 1].select) try { all[i + 1].select(); } catch (er) {} }
    else { var sb = $('button[type=submit]', form); if (sb) sb.focus(); }
  }, true);
  function savePartyRole(name, want, extra) {
    if (!name) return Promise.resolve();
    var hit = C.party.filter(function (x) { return key(x.name) === key(name); })[0];
    if (hit && (hit.role === want || hit.role === 'both') && !extra) return Promise.resolve();
    var role = !hit || !hit.role ? want : hit.role === want || hit.role === 'both' ? hit.role : 'both';
    var rec = Object.assign(hit || { name: name }, { role: role });
    if (extra) Object.keys(extra).forEach(function (k) { if (extra[k] && !rec[k]) rec[k] = extra[k]; });
    return NSStore.put('party', rec);
  }
  /* sales bills fully settled by money linked to them are marked Paid (so the billing site's list agrees); bills it no longer settles go back */
  function markPaid(pay) {
    return NSStore.list('doc').then(function (all) {
      var R = B.bills(all, bizName()), open = {}; R.bills.forEach(function (b) { open[b.id] = b.left; });
      var jobs = [];
      all.forEach(function (d) {
        if (d.type !== 'invoice' && d.type !== 'cashmemo') return;
        var linked = (pay.alloc || []).some(function (a) { return a.id === d.id; });
        if (linked && !open[d.id] && d.status !== 'paid') { d.status = 'paid'; d.paidBy = pay.id; jobs.push(NSStore.put('doc', d)); }
        else if (d.paidBy === pay.id && (!linked || open[d.id] > 0.004)) { d.status = 'unpaid'; delete d.paidBy; jobs.push(NSStore.put('doc', d)); }
      });
      return Promise.all(jobs);
    });
  }

  /* for door sites and extra sections (money.js) */
  document.documentElement.classList.add('ns-soft');   /* the App: screens change at once, no fades or slides */
  window.NSApp = {
    T: T, B: B, addSection: function (name, html, wire) { EXT[name] = { html: html, wire: wire }; }, addHome: function (f) { HOME.push(f); }, cfg: function () { return CFG; }, show: show, openForm: openForm,
    newDoc: function (v) { var u = toolUrl(v) === '#' ? siteHome(v) : toolUrl(v); if (!openUrl(u)) location.href = u; },
    newDocs: function () { return NEWDOCS.filter(function (n) { return TOOLS.some(function (x) { return x[0] === n[0]; }) || INAPP[n[0]]; }).map(function (n) { return [n[0], NS.t(n[2] || 'Doc.' + n[1])]; }); },
    mine: mine, needYears: needYears, years: function () { return YEARS; }, biz: function () { return BIZ; }, bizName: bizName, data: function () { return C; }, docName: docName, catName: catName, enName: enName, amountOf: amountOf,
    rowsHtml: rowsHtml, leftMap: leftMap, searchBar: searchBar, match: match, byDate: byDate, fyStart: fyStart, toolUrl: toolUrl, myUrl: myUrl, ldate: ldate,
    range: range, trail: function () { return trail; }, viewDoc: function (id) { viewDoc(id); },
    formDoc: function () { if (!F || !form) return null; var d = F.kind === 'sale' ? saleFromForm() : F.vd && F.vd.build ? F.vd.build() : null; if (d) { delete d.tax; if (F.rec && F.rec.id) d.id = F.rec.id; } return d; },
    markPaid: markPaid, openUrl: openUrl, siteHome: siteHome, frameAt: frameAt, docUrl: docUrl, cfg: function () { return CFG; }, q: function () { return q; }, filt: function (f) { if (f != null) filt = f; return filt; }, sortBy: function (v) { if (v != null) sortBy = v; return sortBy; }, typeBy: function (v) { if (v != null) typeBy = v; return typeBy; }, overdueDays: overdueDays, cur: function () { return cur; }, arg: function () { return arg; },
    whatsapp: whatsapp, waReminder: waReminder, fuMark: function (k) { fuSet(k, { last: NS.today() }); }, phoneOf: phoneOf, groups: function () { return GRP; }, gidOf: gidOf, gname: gname, grpSel: grpSel, grpKeep: grpKeep, grp: function (g) { if (g != null) grp = g; return grp; },
    vh: function () { return { chgBlock: chgBlock, chgOut: chgOut, fld: fld, inp: inp, sel: sel, partyList: partyList, savePartyRole: savePartyRole, drawLines: drawLines, drawSum: drawSum, form: function () { return form; }, cur: function () { return F; } }; },
    door: function () { return DOOR; }, banks: banks, bankFld: bankFld, bankSync: bankSync, bankWire: bankWire, bankVal: bankVal, setBacct: setBacct, bankLabel: bankLabel, bankSum: bankSum, banksMeta: function () { return BANKS; }, whenReady: whenReady, switchBiz: switchBiz, setBiz: setBiz, printVoucher: printVoucher, quickEntry: quickEntry
  };
  window.NSApp.redrawLines = function () { if (F && F.lines && form && form.isConnected) drawLines(); };   /* cfields.js: a line field made from the open form shows at once */
  /* desk.js frVs: while an entry screen is open inside the frame, the App's own Back row steps aside; a frame kept on the shelf
     may come back with one still open, so the App looks again each time it shows a frame */
  function frVsSync() {
    var de = document.documentElement, on = false;
    try { var f = $('.fr-box.cur iframe') || $('iframe.app-frame'); on = !!(f && f.contentDocument && f.contentDocument.querySelector('dialog.vs[open]')); } catch (e) {}
    de.classList.toggle('fr-vs', on);
  }
  function cardTables(root) {
    $$('table.tbl:not(.tbl-cards):not(.dues-t):not(.vw-facts)', root).forEach(function (tb) {
      if (tb.closest('.stsheet') && !tb.matches('.lg-print .lg-tbl')) return;   /* phone test 21 Nov: the party ledger preview too (it was 560-790 px wide) */
      var hd = $$('thead th', tb).map(function (th) { return th.textContent.trim(); });
      if (!hd.length) return;
      tb.classList.add('tbl-cards');
      $$('tbody tr, tfoot tr', tb).forEach(function (tr) {
        var i = 0;
        Array.prototype.forEach.call(tr.cells, function (c) { if (!c.hasAttribute('data-l') && hd[i]) c.setAttribute('data-l', hd[i]); i += c.colSpan || 1; });
      });
    });
  }
  /* printing an App screen (Print button or Ctrl+P): its printable sheets are copied to a clean area at the top of the page and
     only that area prints, in paper colours; the page margin is 0 so the browser adds no date, title or web address: the
     credit line inside the sheet is the only line at the bottom (owner 2026-11-18: reports printed blank) */
  function paneSheet(pane) {
    var c = pane.cloneNode(true), sh = document.createElement('div'), b = BIZ;
    /* typed boxes print as their value, so a form screen keeps its figures */
    $$('input,select,textarea', c).forEach(function (n) {
      var t = n.type, v = n.tagName === 'SELECT' ? (n.value === '' ? '' : (n.options[n.selectedIndex] || {}).text || '') : /^(checkbox|radio)$/.test(t) ? (n.checked ? '\u2611' : '\u2610') : n.value;
      if (/^(hidden|button|submit|reset|file|search|color|range)$/.test(t) || (!v && t !== 'checkbox' && t !== 'radio')) { n.parentNode.removeChild(n); return; }
      var x = document.createElement('span'); x.className = 'ap-val'; x.textContent = v; n.parentNode.replaceChild(x, n);
    });
    $$('button,a.btn,dialog,nav,.seg,.quick,.sponsor-slot,.sponsor,.noprint,.no-print,.acts,[hidden],.tip,.help-tip,.sample-note', c).forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
    $$('.tbl-cards', c).forEach(function (t) { t.classList.remove('tbl-cards'); });
    sh.className = 'stsheet ap-pane';
    sh.innerHTML = '<p class="ap-biz"><b>' + esc(b && b.name || '') + '</b> · ' + esc(NS.fmtDate(NS.today())) + '</p>' + c.innerHTML + (NS.creditLine ? NS.creditLine('st-ft') : '');
    return sh;
  }
  (function printArea() {
    var de = document.documentElement, st = null;
    window.addEventListener('beforeprint', function () {
      if (!de.classList.contains('has-hub')) return;
      st = st || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'ap-page' }));
      st.textContent = de.classList.contains('vch-on') ? '' : '@page{size:A4;margin:0}';   /* a voucher sets the page size of the paper chosen in its Print box (vtools.js) */
      if (de.classList.contains('dk-print') || de.classList.contains('vch-on')) return;
      var pane = $('[data-pane]'); if (!pane || $('#app-printarea')) return;
      var src = $$('.lg-print .stsheet', pane); if (!src.length) src = $$('.stsheet', pane).filter(function (n) { return !n.closest('dialog'); });
      if (!src.length) src = [paneSheet(pane)];   /* a screen with no sheet of its own (lists, dues, parties...): a clean copy of the screen, else it printed blank pages */
      var box = document.createElement('div'); box.id = 'app-printarea';
      src.forEach(function (n) { var c = n.cloneNode(true); c.classList.add('lg-paper'); $$('.tbl-cards', c).forEach(function (t) { t.classList.remove('tbl-cards'); }); box.appendChild(c); });
      document.body.appendChild(box); de.classList.add('ap-print');
    });
    window.addEventListener('afterprint', function () { var b = $('#app-printarea'); if (b) b.remove(); de.classList.remove('ap-print'); if (st) st.textContent = ''; });
  })();
  function init() {
    if (!$('#app')) return;
    var ds = $('#app').getAttribute('data-secs'); if (ds) DOOR = ds.split(/\s+/);
    $$('[data-sec]').forEach(function (b) { b.addEventListener('click', function () { q = ''; filt = 'all'; }); });   /* the group filter stays: Parties, Dues and Group reports share it */
    window.addEventListener('hashchange', route);
    document.addEventListener('ns-lang', function () {
      if (cur !== 'do') return show();
      var b = $('[data-fback]'), h2 = $('.fr-hd h2'), st = arg.split(/[\/?#]/)[0]; if (b) b.textContent = T('back'); if (h2) h2.textContent = frameTitle(st, arg.slice(st.length) || '/');
    });
    window.addEventListener('resize', sizeFrame);
    /* phones: every list table of a screen reads as cards (each value with its column name), like the dues (owner, 2026-11-06);
       printable sheets (.stsheet) and the dues table keep their own layout */
    var pn = $('[data-pane]');
    if (pn) new MutationObserver(function () { cardTables(pn); }).observe(pn, { childList: true, subtree: true });
    /* links to a document maker or My data open inside the app (new-tab and modified clicks are left alone) */
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || e.defaultPrevented || e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      if (a.hasAttribute('download')) return;   /* a file download */
      if (a.hasAttribute('data-close-box')) { var bx = a.closest('dialog'); if (bx && bx.open) bx.close(); if (openUrl(a.href)) e.preventDefault(); return; }   /* My data box: "Open full data manager" = the App's own screen (#do/my/) */
      /* a link to one of our own sites opens inside the App even when it was made for a new tab (the My data box's "Open My data",
         promotion links...); other websites (sponsors, WhatsApp, the GST portal) still open on their own */
      if (a.target === '_blank' && !/(^|\.)niveshsahayak\.in$/.test(a.hostname) && a.hostname !== location.hostname) return;
      if (openUrl(a.href)) {
        e.preventDefault();
        var box = a.closest('dialog'); if (box && box.open && !box.classList.contains('vs')) box.close();   /* the small box closes, the page opens behind it */
      }
    });
    /* a page shown in the App's frame asks for another page (core.js): open it on an App screen */
    window.addEventListener('message', function (e) {
      /* Esc from a screen shown in a frame from its own site (Declarations, look-up tools...): it cannot press the App's Back itself */
      if (e.data && e.data.nsEsc && e.source && [].some.call(document.querySelectorAll('iframe.app-frame'), function (fr) { return fr.contentWindow === e.source; })) { if (!$('dialog[open]')) { var fb = $('[data-fback]'); if (fb) fb.click(); } return; }
      var u, d = e.data; if (!d || typeof d.nsOpen !== 'string') return;
      try { u = new URL(d.nsOpen); } catch (er) { return; }
      var from; try { from = new URL(e.origin); } catch (er) { return; }
      if (!/(^|\.)niveshsahayak\.in$/.test(from.hostname) && !/^(localhost|127\.0\.0\.1)$/.test(from.hostname)) return;
      if (!/(^|\.)niveshsahayak\.in$/.test(u.hostname) && !/^(localhost|127\.0\.0\.1)$/.test(u.hostname)) return;
      if (openUrl(u.href)) return;
      if (u.origin === location.origin) location.href = u.href; else window.open(u.href, '_blank', 'noopener');   /* an App page with no screen (Help, About...) / another site of ours */
    });
    /* F3-10: export invoices saved earlier as type exp (the expense type) move to expinv once */
    NSStore.ready().then(function () { return NSStore.list('doc'); }).then(function (L) { return Promise.all((L || []).filter(function (d) { return d.type === 'exp' && B.isExpInv(d); }).map(function (d) { d.type = 'expinv'; return NSStore.put('doc', d); })); }).catch(function () {});
    NSStore.ready().then(route).then(function () { NSStore.persist().catch(function () {}); });
    window.addEventListener('focus', function () { if (cur !== 'do' && !$('dialog[open]')) show(false, true); });
    document.addEventListener('ns-data', function () { if (cur !== 'do' && !$('dialog[open]')) show(false, true); });
    /* the App icon's own shortcuts (Dues, Money in and out, New invoice): with the App already open the browser only brings
       its window forward and hands the address here; without this they did nothing (owner, 2026-11-11) */
    try {
      if (window.launchQueue && launchQueue.setConsumer) launchQueue.setConsumer(function (p) {
        if (!p || !p.targetURL) return;
        var u = new URL(p.targetURL);
        if (u.origin === location.origin && u.hash.length > 1 && u.hash !== location.hash) { var open = $('dialog[open]'); if (open && open.close) open.close(); location.hash = u.hash; }
      });
    } catch (e) {}   /* the data home came in late */   /* bills made in another tab show up when you come back */
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

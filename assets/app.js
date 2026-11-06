/* Nivesh Sahayak App (app.niveshsahayak.in): the full software on the same data home as the document sites.
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
  var KITSITE = { pos: 'pos', pharma: 'pharmacy', resto: 'restaurant', lr: 'bilty', job: 'job-card', rabill: 'contractor-bill', fee: 'fee-receipt' };
  var SITEOF = { invoice: 'billing', quote: 'quotation', proforma: 'proforma', so: 'sales-order', challan: 'challan', po: 'purchase-order', self: 'self-invoice', note: 'credit-note', cashmemo: 'cash-memo', receipt: 'receipt', voucher: 'voucher' };
  function toolUrl(site) { var x = TOOLS.filter(function (x) { return x[0] === site; })[0]; if (!x) return '#'; return LOCAL ? 'http://localhost:' + x[4] + '/' : 'https://' + x[1] + '/'; }
  function myUrl(h) { return (LOCAL ? 'http://localhost:8862/' : 'https://my.niveshsahayak.in/') + (h || ''); }
  /* the shell: document makers and My data open inside the app (a frame next to the menu), not as another website.
     #do/<site><path?query#hash> shows <site> in the frame; Back returns to the screen it was opened from. */
  var NEWDOCS = [['billing', 'invoice'], ['quotation', 'quote'], ['proforma', 'proforma'], ['sales-order', 'so'], ['challan', 'challan'], ['purchase-order', 'po'], ['credit-note', 'note', 'k.credit'], ['debit-note', 'note', 'k.debit'],
    ['cash-memo', 'cashmemo'], ['receipt', 'receipt'], ['voucher', 'voucher'], ['self-invoice', 'self'], ['rent-receipt', 'rent'], ['salary-slip', 'salary'], ['petty-cash', 'petty']];
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
    var u; try { u = new URL(href, location.href); } catch (e) { return false; }
    if (u.origin === location.origin) {   /* the App's own addresses, asked for by a maker copy or My data */
      if (/^\/do\/[a-z0-9-]+\//.test(u.pathname)) { go(u.pathname.slice(1) + u.search + u.hash); return true; }
      var h = u.hash.slice(1).split('/')[0];
      if (u.pathname === '/' && h && !DOOR && (SECS.indexOf(h) >= 0 || EXT[h])) { go(u.hash.slice(1)); return true; }
      return false;
    }
    var s = DOOR ? '' : siteOf(u);
    if (!s) return false;
    var how = (INAPP[s] || [])[2] || 'twin', path = u.pathname.replace(/^\/[a-z]{2,3}\/$/, '/');   /* a language home (/hi/) is the maker too */
    if (how.charAt(0) === '#') { var sh = u.hash.slice(1), s0 = sh.split('/')[0]; go(sh && (SECS.indexOf(s0) >= 0 || EXT[s0]) ? sh : how.slice(1)); return true; }
    go('do/' + s + (how === 'twin' && path === '/' ? '/' : u.pathname) + u.search + u.hash);
    return true;
  }
  /* the maker a saved record opens in (a counter bill is an invoice made on pos.) and its address: the App shows it inside */
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
    return nd && !id && /^\/(\?|#|$)/.test(rest) ? T('fr_new', { doc: nm }) : nm;
  }
  /* a maker copy tells what it has saved (inapp.js): the App's address and title follow it (replaceState: no new history step) */
  function frameAt(site, j) {
    if (cur !== 'do' || arg.split(/[\/?#]/)[0] !== site) return;
    var h = j ? 'do/' + site + '/?open=' + encodeURIComponent(j.id) : /[?&]from=/.test(arg) ? 'do/' + site + '/' : '';
    if (!h || h === 'do/' + arg) return;
    history.replaceState(null, '', '#' + h); arg = h.slice(3); trail[trail.length - 1] = h;
    var fr = $('iframe.app-frame'); if (fr) fr.setAttribute('data-url', '/' + h);
    var h2 = $('.fr-hd h2'); if (h2 && j && j.doc) h2.textContent = docName(j.doc) + (j.doc.no ? ' ' + j.doc.no : '');
  }
  /* the frame fills the screen below the title row (above the phone tab bar and the status bar), so the document scrolls inside it */
  function sizeFrame() {
    var fr = $('iframe.app-frame'); if (!fr) return;
    var bottom = 0;
    $$('.tabbar, .sbar').forEach(function (b) { var r = b.getBoundingClientRect(), cs = getComputedStyle(b); if (r.height && cs.display !== 'none' && cs.position === 'fixed' && r.top > innerHeight / 2) bottom = Math.max(bottom, innerHeight - r.top); });
    var top = fr.getBoundingClientRect().top + scrollY;
    fr.style.height = Math.max(380, innerHeight - top - bottom - 6) + 'px';
  }
  function frame(a) {
    var site = a.split(/[\/?#]/)[0], rest = a.slice(site.length) || '/';
    var how = (INAPP[site] || [])[2] || (site === 'my' ? 'twin' : 'frame'), path = rest.replace(/[?#].*$/, '');
    var url = how === 'twin' && path === '/' ? '/do/' + site + rest : siteHome(site).replace(/\/$/, '') + rest;
    if (how === 'twin' && site !== 'my' && rest === '/') url += '?new=1';   /* "New ...": a fresh document, not the one last opened */
    var title = frameTitle(site, rest);
    var pane = $('[data-pane]'), fr = $('iframe.app-frame', pane);
    document.documentElement.classList.add('app-in', 'app-frame-on');
    if (fr && fr.getAttribute('data-url') === url) return;
    /* the App's own title row (Back + what is open), then the document: no second website, no new tab */
    pane.innerHTML = '<div class="pane-hd fr-hd"><button type="button" class="btn sm fr-back" data-fback>' + esc(T('back')) + '</button><h2>' + esc(title) + '</h2></div>' +
      '<div class="fr-box"><div class="fr-wait" aria-hidden="true"><div class="shim"></div><div class="shim"></div><div class="shim"></div></div>' +
      '<iframe class="app-frame" data-url="' + esc(url) + '" src="' + esc(url) + '" title="' + esc(title) + '" allow="web-share; clipboard-write"></iframe></div>';
    fr = $('iframe.app-frame', pane);
    fr.addEventListener('load', function () { fr.classList.add('on'); sizeFrame(); });
    $('[data-fback]', pane).addEventListener('click', function () { if (trail.length > 1) history.back(); else go(backTo || 'home'); });
    sizeFrame(); requestAnimationFrame(sizeFrame);
    var h2 = $('h2', pane); h2.tabIndex = -1; h2.focus({ preventScroll: true });
  }
  var MODES = ['cash', 'upi', 'cheque', 'bank', 'card', 'dd', 'other'];
  var EXP = ['rent', 'power', 'salary', 'transport', 'phone', 'repair', 'office', 'fuel', 'bank', 'prof', 'ads', 'misc'];
  var SALES = { invoice: 1, cashmemo: 1, note: 1, quote: 1, proforma: 1, so: 1, challan: 1 };
  var CONVERT = { quote: ['so', 'challan', 'invoice'], proforma: ['invoice'], so: ['challan', 'invoice'], challan: ['invoice'] };
  var SECS = ['home', 'sales', 'buy', 'money', 'dues', 'parties', 'cash', 'st'];
  /* EXT: sections added by other files (NSApp.addSection); DOOR: the sections a door site shows (#app data-secs), first = start */
  var EXT = {}, DOOR = null, HOME = [];

  var C = { biz: [], party: [], item: [], doc: [] }, CFG = {}, GRP = {}, BIZ = null, cur = 'home', arg = '', q = '', filt = 'all', grp = '';

  function load() {
    return Promise.all(['biz', 'party', 'item', 'doc'].map(function (s) { return NSStore.list(s); }).concat([NSStore.meta('settings'), NSStore.meta('groups')])).then(function (r) {
      C = { biz: r[0], party: r[1], item: r[2], doc: r[3] }; CFG = r[4] || {}; GRP = r[5] || {};
      NS.bizCache = C.biz;
      if (NS.cfgSplit(CFG, C.biz)) NSStore.meta('settings', CFG).catch(function () {});   /* settings per business: one-time copy */
      var RAW = CFG;
      var want = NS.curBiz();   /* this tab's business (another tab switching business never moves it) */
      BIZ = C.biz.filter(function (b) { return b.id === want; })[0] || C.biz.filter(function (b) { return b.id === CFG.defBiz; })[0] || C.biz[0] || null; if (BIZ && BIZ.id && BIZ.id !== want) try { sessionStorage.setItem('ns-app-biz', BIZ.id); } catch (e) {}
      if (!BIZ) {   /* no business master yet: use the seller name of the newest bill */
        var d = C.doc.slice().sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); }).filter(function (d) { return d.seller && d.seller.name; })[0];
        if (d) BIZ = Object.assign({ id: '', name: d.seller.name }, d.seller);
      }
      CFG = NS.cfgFor(RAW, BIZ, C.biz);   /* the settings of this tab's business */
      if (window.NSStock && NSStock.valuation) NSStock.valuation(CFG.stockValue);   /* FIFO or weighted average, My data › Settings */
    });
  }
  function bizName() { return BIZ ? BIZ.name : ''; }
  function mine() { var b = key(bizName()); return C.doc.filter(function (d) { return key(d.seller && d.seller.name) === b; }); }
  function sellerCopy() { var s = JSON.parse(JSON.stringify(BIZ || {})); delete s.id; delete s.created; delete s.updated; return s; }
  function docName(d) {
    var ty = d.type || 'invoice';
    if (ty === 'note') return T(d.kind === 'debit' ? 'd_debit' : 'd_credit');
    if (ty === 'quote') return T(d.kind === 'estimate' ? 'd_estimate' : 'd_quote');
    if (ty === 'receipt') return T(d.kind === 'adv' ? 'd_adv' : d.kind === 'ref' ? 'd_ref' : 'd_receipt');
    if (ty === 'voucher') return T(d.forBill ? 'd_voucher' : 'd_vexp');
    if (ty === 'pbill') return T(d.kind === 'return' ? 'd_pret' : 'd_pbill');
    if (ty === 'contra') return T(d.from === 'bank' ? 'd_withdraw' : 'd_deposit');
    return T('d_' + ty);
  }
  function ldate(iso) { return NS.fmtDate(iso); }
  function fyStart(iso) { return NS.fy(iso).slice(0, 4) + '-04-01'; }
  function amountOf(d) {
    var R = B.role(d);
    if (R === 'in' || R === 'refund' || R === 'exp' || R === 'ob' || R === 'contra' || B.bounced(d) && d.type === 'receipt') return num(d.amount);
    if (B.bounced(d)) return r2((d.lines || []).reduce(function (a, l) { return a + num(l.amt); }, 0));
    if (R === 'out' || R === 'outexp') return r2((d.lines || []).reduce(function (a, l) { return a + num(l.amt); }, 0));
    return num(d.total);
  }

  /* ---------- sections ---------- */
  function route() {
    var h = decodeURIComponent(location.hash.slice(1)), p = h.split('/');
    /* where the App has been, so the title row's Back goes back the way the user came (a maker opened from another maker too) */
    if (trail.length > 1 && trail[trail.length - 2] === h) trail.pop(); else if (trail[trail.length - 1] !== h) trail.push(h);
    cur = p[0] === 'do' && !DOOR ? 'do' : SECS.indexOf(p[0]) >= 0 || EXT[p[0]] ? p[0] : 'home'; arg = p.slice(1).join('/');
    /* one cash screen: where the cash, bank and day book screen (money.js) is on hand, #cash and #cash/bank open it */
    if (cur === 'cash' && EXT.books && (!DOOR || DOOR.indexOf('books') >= 0)) { cur = 'books'; arg = arg === 'bank' ? 'bank' : 'cash'; }
    if (cur !== 'do') { backTo = h; document.documentElement.classList.remove('app-frame-on'); }
    if (DOOR && DOOR.indexOf(cur) < 0 && cur !== 'st') { cur = DOOR[0]; arg = ''; }
    show(true);
  }
  function go(h) { location.hash = h; }
  var showSeq = 0;
  function show(focus) {
    $$('[data-sec]').forEach(function (b) { var on = b.getAttribute('data-sec') === (cur === 'st' ? 'parties' : cur); b.setAttribute('aria-current', on ? 'page' : 'false'); });
    if (cur === 'do') {
      document.documentElement.classList.add('no-sponsor'); frame(arg);
      /* after a reload the saved documents come in later: name the open one then */
      return load().then(function () { var h2 = $('.fr-hd h2'), st = arg.split(/[\/?#]/)[0]; if (cur === 'do' && h2 && /[?&]open=/.test(arg)) h2.textContent = frameTitle(st, arg.slice(st.length)); });
    }
    /* a redraw started earlier (window focus when the user clicks, late data) must not paint over a newer screen or the frame */
    var mine_ = ++showSeq, want = cur + '/' + arg;
    return load().then(function () {
      if (mine_ !== showSeq || cur === 'do' || cur + '/' + arg !== want) return;
      var pane = $('[data-pane]');
      $('[data-mode]').textContent = T(NSStore.mode() === 'vault' ? 'vault' : 'local');
      labels();
      document.documentElement.classList.toggle('app-in', !!BIZ);
      if (!BIZ) { pane.innerHTML = noBiz(); wireSample(pane); return; }
      /* a remembered party screen whose party was deleted (sample data removed): go to the dashboard */
      if (cur === 'st' && arg && !C.party.some(function (p) { return key(p.name) === arg; }) && !B.parties(mine(), bizName())[arg]) { location.replace('#home'); return; }
      pane.innerHTML = sampleNote() + bizBar() + (EXT[cur] ? EXT[cur].html(arg) : ({ home: homeHtml, sales: salesHtml, buy: buyHtml, money: moneyHtml, dues: duesHtml, parties: partiesHtml, cash: cashHtml })[cur]());
      wire(pane); wireSample(pane);
      if (EXT[cur] && EXT[cur].wire) EXT[cur].wire(pane, arg);
      /* no sponsored card where a document is made or printed (statement, ledger, books, reports): the Support page promise */
      document.documentElement.classList.toggle('no-sponsor', !!$('[data-print], [data-b2print], [data-m-print], [data-lgpdf], [data-sheet], .stsheet', pane));
      if (focus) { var h2 = $('h2', pane); if (h2) { h2.tabIndex = -1; h2.focus({ preventScroll: true }); } }
    });
  }
  function labels() {
    $$('[data-sec]').forEach(function (b) { $('span', b).textContent = T(b.getAttribute('data-sec')); });
    $$('[data-t]').forEach(function (e) { e.textContent = T(e.getAttribute('data-t')); });
    /* the guide exists in every language: point its link at the one on screen */
    var L = NS.lang ? NS.lang() : 'en';
    $$('a[href$="how-it-works/"]').forEach(function (a) { a.setAttribute('href', L === 'en' ? '/how-it-works/' : '/' + L + '/how-it-works/'); });
  }
  function noBiz() {
    return '<div class="card"><h2>' + esc(T('nobiz')) + '</h2><p>' + esc(T('nobizp')) + '</p><p><a class="btn primary" href="' + myUrl('#biz') + '">' + esc(T('addbiz')) + '</a></p></div>' +
      (window.NSSample && !DOOR ? '<div class="card sample-try"><h3>' + esc(T('sm_try')) + '</h3><p>' + esc(T('sm_tryp')) + '</p><p><button type="button" class="btn" data-sample>' + esc(T('sm_try')) + '</button></p></div>' : '');
  }
  /* sample data: shown on every screen while it is there, with one tap to take it away */
  function sampleNote() {
    return window.NSSample && NSSample.has(C.biz) ? '<div class="note sample-note"><span>' + esc(T('sm_on')) + '</span><button type="button" class="btn sm" data-unsample>' + esc(T('sm_rm')) + '</button></div>' : '';
  }
  function wireSample(pane) {
    var a = $('[data-sample]', pane), r = $('[data-unsample]', pane);
    if (a) a.addEventListener('click', function () { a.disabled = true; NSSample.add().then(function () { NS.toast(T('sm_added')); go(''); show(); }, function (e) { a.disabled = false; NS.toast(NS.t('nosave', { e: e.message }), 'bad'); }); });
    if (r) r.addEventListener('click', function () { if (!confirm(T('sm_conf'))) return; r.disabled = true; NSSample.remove().then(function () { NS.toast(T('sm_gone')); show(); }); });
  }
  function bizBar() {
    var bz = C.biz.length < 2 ? '' : '<label for="app-biz">' + esc(T('biz')) + '</label><select id="app-biz" data-biz>' + C.biz.map(function (b) {
      return '<option value="' + esc(b.id) + '"' + (BIZ && b.id === BIZ.id ? ' selected' : '') + '>' + esc(b.name) + '</option>'; }).join('') + '</select>';
    var nw = '<select class="newdoc" data-newdoc aria-label="' + esc(T('newdoc')) + '"><option value="">+ ' + esc(T('newdoc')) + '</option>' +
      NEWDOCS.filter(function (n) { return TOOLS.some(function (x) { return x[0] === n[0]; }); }).map(function (n) { return '<option value="' + n[0] + '">' + esc(NS.t(n[2] || 'Doc.' + n[1])) + '</option>'; }).join('') + '</select>';
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
      ['recv', r2(recv), '#dues'], ['pay', r2(pay), '#dues/pay'], ['cashin', A.cash || 0, '#cash'], ['bank', A.bank || 0, '#cash/bank']];
    var recent = D.filter(function (d) { return B.role(d); }).sort(function (a, b) { return (b.date || '').localeCompare(a.date || '') || (b.updated || 0) - (a.updated || 0); }).slice(0, 8);
    return '<h2>' + esc(T('home')) + ' <small class="soft">' + esc(bizName()) + '</small></h2>' +
      '<div class="tiles">' + tiles.map(function (x) { return '<a href="' + x[2] + '" class="tile' + (x[1] < 0 ? ' neg' : '') + '"><span>' + esc(T(x[0])) + '</span><b>' + money(x[1]) + '</b></a>'; }).join('') + '</div>' +
      '<div class="card"><h3>' + esc(T('quick')) + '</h3><div class="quick">' +
        '<a class="btn primary" href="' + toolUrl('billing') + '">+ ' + esc(T('newinv')) + '</a>' +
        ['min', 'mout', 'pbill', 'exp', 'ob'].map(function (f) { return '<button type="button" class="btn" data-form="' + f + '">+ ' + esc(T(f)) + '</button>'; }).join('') + '</div></div>' +
      '<div class="card"><h3>' + esc(T('overdue')) + '</h3>' + (bw.length ? '<ul class="rows">' + bw.map(function (b) {
        return '<li><a href="#st/' + encodeURIComponent(key(b.party)) + '"><b>' + esc(b.party) + '</b><span class="soft">' + esc(docName(b)) + ' ' + esc(b.no) + ' · ' + ldate(b.date) + ' · ' + esc(T('days', { n: B.daysBetween(b.date, today) })) + '</span></a><b class="amt">' + money(b.left) + '</b></li>'; }).join('') + '</ul>'
        : '<p class="soft">' + esc(T('nodues')) + '</p>') + '</div>' +
      HOME.map(function (f) { try { return f() || ''; } catch (e) { return ''; } }).join('') +
      '<div class="card"><h3>' + esc(T('recent')) + '</h3>' + rowsHtml(recent) + '</div>' +
      '<details class="card"><summary><b>' + esc(T('help')) + '</b></summary><p>' + esc(T('helpp')) + '</p><p class="soft">' + esc(T('invfix')) + '</p></details>';
  }

  /* one line per record, with its actions */
  function rowsHtml(list, opts) {
    opts = opts || {};
    if (!list.length) return '<p class="soft">' + esc(T('none')) + '</p>';
    var left = opts.left || {};
    return '<ul class="rows">' + list.map(function (d) {
      var ty = d.type || 'invoice', site = (d.type === 'note' && d.kind === 'debit' ? 'debit-note' : SITEOF[ty]), appMade = d.app || /^(pbill|exp|ob|contra)$/.test(ty), pills = '';
      if (left[d.id] != null) pills = left[d.id] <= 0.004 ? '<span class="pill ok">' + esc(T('paid')) + '</span>' : left[d.id] < amountOf(d) - 0.004 ? '<span class="pill warn">' + esc(T('left', { a: money(left[d.id]) })) + '</span>' : '<span class="pill warn">' + esc(T('unpaid')) + '</span>';
      if (d.nextNo) pills += ' <span class="pill">' + esc(T('made', { x: d.nextNo })) + '</span>';
      if (B.bounced(d)) pills += ' <span class="pill bad">' + esc(T('c_bounce')) + '</span>';
      else if (d.mode === 'cheque' && d.chq && d.chq.st && d.chq.st !== 'ok') pills += ' <span class="pill warn">' + esc(T('c_' + d.chq.st)) + '</span>';
      if (d.status === 'inv' && d.invNo) pills += ' <span class="pill ok">' + esc(T('made', { x: d.invNo })) + '</span>';
      var acts = [];
      if (d.photo) acts.push('<button type="button" class="btn sm" data-photo="' + d.id + '">' + esc(T('photo')) + '</button>');
      if (appMade && ty !== 'cashmemo') acts.push('<button type="button" class="btn sm" data-edit="' + d.id + '">' + esc(T('edit')) + '</button>');
      if (docUrl(d) && (!site || !appMade || /^(receipt|voucher|cashmemo)$/.test(ty))) acts.push('<a class="btn sm" href="' + docUrl(d) + '">' + esc(T('open')) + '</a>');
      if (left[d.id] > 0.004 && (ty === 'invoice' || ty === 'cashmemo')) acts.push('<button type="button" class="btn sm" data-form="min" data-for="' + d.id + '">' + esc(T('recpay')) + '</button>');
      if (left[d.id] > 0.004 && ty === 'pbill') acts.push('<button type="button" class="btn sm" data-form="mout" data-for="' + d.id + '">' + esc(T('recpay')) + '</button>');
      if (CONVERT[ty] && !opts.noconv) acts.push('<select class="sm conv" data-conv="' + d.id + '" aria-label="' + esc(T('convert')) + ' ' + esc(d.no || '') + '"><option value="">' + esc(T('convert')) + '…</option>' +
        CONVERT[ty].map(function (x) { return '<option value="' + x + '">' + esc(T(x === 'invoice' ? 'makeinv' : x === 'so' ? 'makeso' : 'makedc')) + '</option>'; }).join('') + '</select>');
      if (appMade) acts.push('<button type="button" class="btn sm danger" data-del="' + d.id + '">' + esc(T('del')) + '</button>');
      return '<li><div class="ln"><span><b>' + esc(docName(d)) + ' ' + esc(d.no || d.billNo || '') + '</b> ' + pills + '<span class="soft"> · ' + ldate(d.date) + (B.partyName(d) ? ' · ' + esc(B.partyName(d)) : d.cat ? ' · ' + esc(d.cat) : '') + '</span></span>' +
        '<b class="amt">' + money(amountOf(d)) + '</b></div><div class="acts">' + acts.join('') + '</div></li>';
    }).join('') + '</ul>';
  }
  function leftMap(D) { var m = {}; D.forEach(function (d) { if (/^(sale|buy|sdeb)$/.test(B.role(d))) m[d.id] = 0; }); B.bills(D, bizName()).bills.forEach(function (b) { m[b.id] = b.left; }); return m; }
  function searchBar(filters) {
    return '<div class="tools-row"><label class="sr" for="app-q">' + esc(T('search')) + '</label><input id="app-q" type="search" data-q value="' + esc(q) + '" placeholder="' + esc(T('search')) + '">' +
      (filters ? '<div class="seg" role="group">' + filters.map(function (f) { return '<button type="button" class="btn sm" data-filt="' + f + '" aria-pressed="' + (filt === f) + '">' + esc(T(f)) + '</button>'; }).join('') + '</div>' : '') + '</div>';
  }
  function match(d) { return !q || JSON.stringify([d.no, d.billNo, B.partyName(d), d.cat, d.ref]).toLowerCase().indexOf(q.toLowerCase()) >= 0; }
  function byDate(a, b) { return (b.date || '').localeCompare(a.date || '') || (b.updated || 0) - (a.updated || 0); }

  function salesHtml() {
    var D = mine(), L = leftMap(D);
    var list = D.filter(function (d) { return SALES[d.type || 'invoice']; }).filter(match).filter(function (d) {
      if (filt === 'unpaid') return L[d.id] > 0.004; if (filt === 'paid') return L[d.id] != null && L[d.id] <= 0.004; return true; }).sort(byDate);
    return '<div class="pane-hd"><h2>' + esc(T('sales')) + '</h2><a class="btn primary" href="' + toolUrl('billing') + '">+ ' + esc(T('newinv')) + '</a></div>' + searchBar(['all', 'unpaid', 'paid']) + rowsHtml(list.slice(0, 200), { left: L });
  }
  function buyHtml() {
    var D = mine(), L = leftMap(D);
    var list = D.filter(function (d) { return /^(pbill|exp|self|po)$/.test(d.type) || d.type === 'voucher' && !d.forBill; }).filter(match).filter(function (d) {
      if (filt === 'unpaid') return L[d.id] > 0.004 || d.type === 'exp' && d.mode === 'credit'; if (filt === 'paid') return L[d.id] != null && L[d.id] <= 0.004; return true; }).sort(byDate);
    return '<div class="pane-hd"><h2>' + esc(T('buy')) + '</h2><div class="quick">' + ['pbill', 'exp', 'pret'].map(function (f) { return '<button type="button" class="btn' + (f === 'pbill' ? ' primary' : '') + '" data-form="' + f + '">+ ' + esc(T(f)) + '</button>'; }).join('') + '</div></div>' +
      searchBar(['all', 'unpaid', 'paid']) + rowsHtml(list.slice(0, 200), { left: L });
  }
  function moneyHtml() {
    var list = mine().filter(function (d) { return d.type === 'receipt' || d.type === 'voucher' && d.forBill || d.type === 'ob'; }).filter(match).sort(byDate);
    return '<div class="pane-hd"><h2>' + esc(T('money')) + '</h2><div class="quick"><button type="button" class="btn primary" data-form="min">+ ' + esc(T('min')) + '</button><button type="button" class="btn" data-form="mout">+ ' + esc(T('mout')) + '</button><button type="button" class="btn" data-form="ob">+ ' + esc(T('ob')) + '</button></div></div>' +
      searchBar() + rowsHtml(list.slice(0, 200));
  }

  var stFrom = '', stTo = '';
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
      .filter(function (r) { return (!q || r.name.toLowerCase().indexOf(q.toLowerCase()) >= 0) && grpKeep(r.k, P); }).sort(function (a, b) { return b.tot - a.tot; });
    var tot = [0, 0, 0, 0]; rows.forEach(function (r) { r.a.forEach(function (v, i) { tot[i] = r2(tot[i] + v); }); });
    var advs = Object.keys(R.advances).filter(function (k) { return R.advances[k][side] > 0.004; });
    return '<div class="pane-hd"><h2>' + esc(T('dues')) + '</h2><div class="seg" role="group"><a class="btn sm" href="#dues" aria-pressed="' + (side === 'recv') + '">' + esc(T('recv')) + '</a><a class="btn sm" href="#dues/pay" aria-pressed="' + (side === 'pay') + '">' + esc(T('pay')) + '</a></div></div>' +
      '<div class="tiles">' + ['a0', 'a1', 'a2', 'a3'].map(function (x, i) { return '<div class="tile' + (i === 3 && tot[3] ? ' warn' : '') + '"><span>' + esc(T(x)) + '</span><b>' + money(tot[i]) + '</b></div>'; }).join('') + '</div>' +
      searchBar() + '<div class="tools-row">' + grpSel() + '</div>' +
      (rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + esc(T('party')) + '</th>' + ['a0', 'a1', 'a2', 'a3'].map(function (x) { return '<th class="n">' + esc(T(x)) + '</th>'; }).join('') + '<th class="n">' + esc(T('totaldue')) + '</th><th class="n">' + esc(NS.t('b1.late')) + '</th><th></th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><th scope="row"><a href="#st/' + encodeURIComponent(r.k) + '">' + esc(r.name) + '</a>' + (r.over ? '<br><span class="b1-warn">' + esc(NS.t('b1.overlim', { v: money(r.lim) })) + '</span>' : '') + '</th>' + r.a.map(function (v) { return '<td class="n">' + (v ? money(v, false) : '—') + '</td>'; }).join('') +
            '<td class="n"><b>' + money(r.tot, false) + '</b></td><td class="n' + (r.late ? ' b1-warn' : '') + '">' + (r.late ? money(r.late, false) : '—') + '</td><td class="acts">' + (side === 'recv' ? '<button type="button" class="btn sm wa" data-wa="' + esc(r.k) + '">' + esc(T('remind')) + '</button>' : '') +
            '<button type="button" class="btn sm" data-form="' + (side === 'recv' ? 'min' : 'mout') + '" data-party="' + esc(r.name) + '">' + esc(T('recpay')) + '</button></td></tr>'; }).join('') +
        '</tbody></table></div>' : '<p class="soft">' + esc(T('nodues')) + '</p>') +
      '<p class="soft">' + esc(NS.t('b1.ageh')) + '</p>' +
      (advs.length ? '<div class="card"><h3>' + esc(T('advance')) + '</h3><p class="soft">' + esc(T('advh')) + '</p><ul class="rows">' + advs.map(function (k) {
        return '<li><a href="#st/' + encodeURIComponent(k) + '"><b>' + esc((P[k] || { name: k }).name) + '</b></a><b class="amt">' + money(R.advances[k][side]) + '</b></li>'; }).join('') + '</ul></div>' : '');
  }
  function phoneOf(k, P) {
    var m = C.party.filter(function (p) { return key(p.name) === k; })[0];
    return String(m && m.phone || P && P[k] && P[k].phone || '').replace(/\D/g, '');
  }

  function partiesHtml() {
    var P = B.parties(mine(), bizName()), list = Object.keys(P).map(function (k) { return P[k]; }).filter(function (p) { return (!q || p.name.toLowerCase().indexOf(q.toLowerCase()) >= 0) && grpKeep(p.key, P); })
      .sort(function (a, b) { return Math.abs(b.bal) - Math.abs(a.bal); });
    var gmap = {}; B.groupTree(GRP).forEach(function (g) { gmap[g.id] = g; });
    return '<div class="pane-hd"><h2>' + esc(T('parties')) + '</h2><div class="quick">' + (DOOR ? '' : '<a class="btn" href="#grp">' + esc(T('grp')) + '</a>') + '<a class="btn" href="' + myUrl('#party') + '">' + esc(NS.t('my.t.party')) + ' ›</a></div></div>' + searchBar() +
      '<div class="tools-row">' + grpSel() + '</div>' +
      (list.length ? '<ul class="rows">' + list.map(function (p) {
        var g = gmap[gidOf(p.key, P)];
        return '<li><a href="#st/' + encodeURIComponent(p.key) + '"><b>' + esc(p.name) + '</b><span class="soft">' + (g ? esc(gname(g)) + ' · ' : '') + esc(NS.t(p.bal > 0.004 ? 'ux.p.recv' : p.bal < -0.004 ? 'ux.p.pay' : 'ux.p.nil')) + '</span></a>' +
          '<b class="amt' + (p.bal < 0 ? ' neg' : '') + '">' + money(Math.abs(p.bal)) + (p.bal > 0.004 ? ' ' + T('dr') : p.bal < -0.004 ? ' ' + T('cr') : '') + '</b></li>'; }).join('') + '</ul>' : '<p class="soft">' + esc(T('none')) + '</p>');
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
  function grpKeep(k, P) { return !grp || B.inGroup(gidOf(k, P), grp, GRP); }
  /* group filter: All, Customers and its groups, Suppliers and its groups (sub-groups indented) */
  function grpSel() {
    return '<label class="lg-gsel"><span>' + esc(T('lg_group')) + '</span> <select data-grp><option value="">' + esc(T('all')) + '</option>' + B.groupTree(GRP).map(function (g) {
      return '<option value="' + esc(g.id) + '"' + (g.id === grp ? ' selected' : '') + '>' + new Array(g.depth + 1).join('\u2003') + esc(gname(g)) + '</option>'; }).join('') + '</select></label>';
  }
  /* the statement is printed in English like every document */
  var ENDOC = { jv: 'Journal entry', fa: 'Fixed asset', stk: 'Stock entry', invoice: 'Invoice', cashmemo: 'Cash memo', credit: 'Credit note', debit: 'Debit note', receipt: 'Receipt', adv: 'Advance received', ref: 'Refund paid', voucher: 'Payment', pbill: 'Purchase bill', pret: 'Purchase return', exp: 'Expense', ob: 'Opening balance', self: 'Self invoice' };
  function enName(d) {
    var ty = d.type || 'invoice';
    return ENDOC[ty === 'note' ? d.kind : ty === 'receipt' && d.kind !== 'pay' ? d.kind : ty === 'pbill' && d.kind === 'return' ? 'pret' : ty] || ty;
  }

  /* ---------- cash and bank ---------- */
  function cashHtml() {
    var acct = arg === 'bank' ? 'bank' : 'cash', today = NS.today();
    if (!stTo) stTo = today; if (!stFrom) stFrom = fyStart(today);
    var Bk = B.book(mine(), bizName(), acct, stFrom, stTo);
    return '<div class="pane-hd"><h2>' + esc(T('cash')) + '</h2><div class="seg" role="group"><a class="btn sm" href="#cash" aria-pressed="' + (acct === 'cash') + '">' + esc(T('cashbook')) + '</a><a class="btn sm" href="#cash/bank" aria-pressed="' + (acct === 'bank') + '">' + esc(T('bankbook')) + '</a></div></div>' +
      '<p class="soft">' + esc(T('cbh')) + '</p>' +
      '<div class="tools-row"><label>' + esc(T('from')) + ' <input type="date" data-stfrom value="' + stFrom + '"></label><label>' + esc(T('to')) + ' <input type="date" data-stto value="' + stTo + '"></label></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + esc(T('date')) + '</th><th>' + esc(T('particulars')) + '</th><th class="n">' + esc(T('in')) + '</th><th class="n">' + esc(T('out')) + '</th><th class="n">' + esc(T('balance')) + '</th></tr></thead><tbody>' +
      '<tr><td>' + ldate(stFrom) + '</td><td>' + esc(T('opening')) + '</td><td></td><td></td><td class="n">' + money(Bk.open, false) + '</td></tr>' +
      Bk.rows.map(function (r) { return '<tr><td>' + ldate(r.date) + '</td><td>' + esc(docName(r.d)) + ' ' + esc(r.d.no || '') + (B.partyName(r.d) ? ' · ' + esc(B.partyName(r.d)) : r.d.cat ? ' · ' + esc(r.d.cat) : '') + '</td><td class="n">' + (r.dr ? money(r.dr, false) : '') + '</td><td class="n">' + (r.cr ? money(r.cr, false) : '') + '</td><td class="n">' + money(r.bal, false) + '</td></tr>'; }).join('') +
      '</tbody><tfoot><tr><th colspan="4">' + esc(T('closing')) + '</th><th class="n">' + money(Bk.close, false) + '</th></tr></tfoot></table></div>';
  }

  /* ---------- events ---------- */
  function wire(pane) {
    var bs = $('[data-biz]', pane);
    if (bs) bs.addEventListener('change', function () { NS.setCurBiz(bs.value); show(); });
    var nd = $('[data-newdoc]', pane);
    if (nd) nd.addEventListener('change', function () { var v = nd.value; nd.value = ''; if (v && !openUrl(toolUrl(v))) location.href = toolUrl(v); });
    var qi = $('[data-q]', pane);
    if (qi) qi.addEventListener('input', function () { q = qi.value; var pos = qi.selectionStart; show().then(function () { var n = $('[data-q]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }); });
    $$('[data-filt]', pane).forEach(function (b) { b.addEventListener('click', function () { filt = b.getAttribute('data-filt'); show(); }); });
    $$('[data-grp]', pane).forEach(function (g) { g.addEventListener('change', function () { grp = g.value; show(); }); });
    $$('[data-stfrom],[data-stto]', pane).forEach(function (i) { i.addEventListener('change', function () { if (i.hasAttribute('data-stfrom')) stFrom = i.value; else stTo = i.value; show(); }); });
    pane.addEventListener('click', onClick);
    $$('[data-conv]', pane).forEach(function (s) { s.addEventListener('change', function () { if (!s.value) return; var u = toolUrl(SITEOF[s.value]) + '?from=' + encodeURIComponent(s.getAttribute('data-conv')); if (!openUrl(u)) location.href = u; }); });
  }
  function onClick(e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-form')) openForm(b.getAttribute('data-form'), { forId: b.getAttribute('data-for'), party: b.getAttribute('data-party'), mode: b.getAttribute('data-mode'), side: b.getAttribute('data-side') || '' });
    else if (b.hasAttribute('data-photo')) showPhoto(b.getAttribute('data-photo'));
    else if (b.hasAttribute('data-edit')) { var d = C.doc.filter(function (x) { return x.id === b.getAttribute('data-edit'); })[0]; if (d && !(window.NSApp.editX && NSApp.editX(d))) openForm(formOf(d), { rec: d }); }
    else if (b.hasAttribute('data-del')) delRec(b.getAttribute('data-del'));
    else if (b.hasAttribute('data-wa')) whatsapp(b.getAttribute('data-wa'));
    else if (b.hasAttribute('data-print')) window.print();
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
  function formOf(d) { return d.type === 'contra' ? 'contra' : d.type === 'exp' ? 'exp' : d.type === 'ob' ? 'ob' : d.type === 'pbill' ? (d.kind === 'return' ? 'pret' : 'pbill') : d.type === 'receipt' ? 'min' : 'mout'; }

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

  function whatsapp(k) {
    var D = mine(), P = B.parties(D, bizName()), p = P[k]; if (!p || p.bal <= 0) return;
    var open = B.bills(D, bizName(), k).bills.filter(function (b) { return b.side === 'recv'; });
    var msg = T('wamsg', { p: p.name, a: money(p.bal), b: bizName(), d: ldate(NS.today()),
      bills: open.length ? T('wabills', { l: open.slice(0, 8).map(function (b) { return (b.no || docName(b)) + ' ' + ldate(b.date) + ' ' + money(b.left); }).join(', ') }) : '',
      upi: BIZ.upi ? NS.t('uf.waupi', { u: BIZ.upi, a: money(p.bal) }) : '' });
    var ph = phoneOf(k, P);
    if (ph.length === 10) ph = '91' + ph;
    if (!ph) NS.toast(T('nophone', { p: p.name }));
    window.open('https://wa.me/' + (ph.length >= 11 ? ph : '') + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
  }

  /* ---------- forms ---------- */
  var dlg, form, F = null;
  function fld(id, label, html, o) { o = o || {}; return '<div class="f' + (o.wide ? ' wide' : '') + '"><label for="' + id + '">' + esc(label) + '</label>' + html + (o.hint ? '<small class="soft">' + esc(o.hint) + '</small>' : '') + '</div>'; }
  function inp(id, v, o) { o = o || {}; return '<input id="' + id + '" name="' + id + '" value="' + esc(v == null ? '' : v) + '"' + (o.type ? ' type="' + o.type + '"' : '') + (o.mode ? ' inputmode="' + o.mode + '"' : '') + (o.ltr ? ' dir="ltr"' : ' dir="auto"') + (o.req ? ' required' : '') + (o.list ? ' list="' + o.list + '"' : '') + ' autocomplete="off">'; }
  function sel(id, v, opts) { return '<select id="' + id + '" name="' + id + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
  function modeOpts(credit) { return (credit ? [['credit', T('m_credit')]] : []).concat(MODES.map(function (m) { return [m, T('m_' + m)]; })); }
  function partyList(role) {
    var seen = {}, out = [];
    C.party.forEach(function (p) { if (!role || !p.role || p.role === role || p.role === 'both') { seen[key(p.name)] = 1; out.push(p.name); } });
    mine().forEach(function (d) { var n = B.partyName(d); if (n && !seen[key(n)]) { seen[key(n)] = 1; out.push(n); } });
    return '<datalist id="dl-party">' + out.sort().map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>';
  }
  function nextNo(type, pre, date) {
    var fy = NS.fy(date), short = fy.slice(2, 4) + '-' + fy.slice(5), c = CFG[type] || {}, digits = Math.min(6, Math.max(1, +((CFG.invoice || {}).digits) || 3)), max = 0;
    pre = String(c.prefix != null && c.prefix !== '' ? c.prefix : pre).replace(/[^A-Za-z0-9\/\-]/g, '');
    mine().forEach(function (d) { if (d.type !== type || NS.fy(d.date) !== fy) return; var m = String(d.no || '').match(/(\d+)\s*$/); if (m) max = Math.max(max, +m[1]); });
    return (pre ? pre + '/' : '') + short + '/' + String(max + 1).padStart(digits, '0');
  }

  function openForm(kind, o) {
    o = o || {};
    if (!dlg) { dlg = $('#app-form'); form = $('form', dlg); form.addEventListener('submit', function (e) { e.preventDefault(); submit(); }); form.addEventListener('input', onFormInput); form.addEventListener('change', onFormInput); }
    var rec = o.rec || null, today = NS.today(), h = '';
    F = { kind: kind, rec: rec, forId: o.forId, biz: bizName() };
    var forDoc = o.forId && C.doc.filter(function (d) { return d.id === o.forId; })[0];
    var party = rec ? B.partyName(rec) : o.party || (forDoc ? B.partyName(forDoc) : '');
    if (kind === 'min' || kind === 'mout') {
      var out = kind === 'mout', amt = rec ? (out ? amountOf(rec) : num(rec.amount)) : '';
      if (!rec && forDoc) { var bl = B.bills(mine(), bizName()).bills.filter(function (b) { return b.id === forDoc.id; })[0]; amt = bl ? bl.left : ''; }
      h = '<div class="fg">' + fld('f-date', T('date'), inp('f-date', rec ? rec.date : today, { type: 'date', req: 1 })) +
        fld('f-party', T(out ? 'supp' : 'cust'), inp('f-party', party, { req: 1, list: 'dl-party' }) + partyList(out ? 'supplier' : 'customer')) +
        fld('f-amt', T('amount'), inp('f-amt', amt, { mode: 'decimal', ltr: 1, req: 1 })) +
        fld('f-mode', T('mode'), sel('f-mode', rec ? rec.mode : o.mode || 'upi', modeOpts())) +
        (out ? fld('f-tds', T('tdsout'), inp('f-tds', rec ? rec.tdsRate : '', { mode: 'decimal', ltr: 1 }), { hint: T('tdsouth') }) + fld('f-tdsx', NS.t('uf.tdsa'), inp('f-tdsx', '', { mode: 'decimal', ltr: 1 }))
          : fld('f-tds', T('tdsin'), inp('f-tds', rec ? rec.tds : '', { mode: 'decimal', ltr: 1 }), { hint: T('tdsinh') }) + fld('f-tdsx', NS.t('uf.tdsr'), inp('f-tdsx', '', { mode: 'decimal', ltr: 1 }))) +
        fld('f-ref', T('ref'), inp('f-ref', rec ? rec.ref : '', { ltr: 1 })) +
        chqFields(out, rec && rec.chq) +
        fld('f-note', T('note'), inp('f-note', rec ? (out ? (rec.lines && rec.lines[0] || {}).desc : rec.purpose) : ''), { wide: 1 }) + '</div>' +
        '<fieldset class="alloc"><legend>' + esc(T('against')) + '</legend><p class="soft">' + esc(T('againsth')) + '</p><div data-alloc></div><p class="soft" data-advleft></p></fieldset>';
    } else if (kind === 'pbill' || kind === 'pret') {
      var r = rec || { date: today, items: [{ desc: '', hsn: '', qty: 1, rate: '', gst: 18 }], round: true, buyer: { name: party } };
      var pm = C.party.filter(function (p) { return key(p.name) === key(party); })[0] || {};
      h = '<div class="fg">' + fld('f-party', T('supp'), inp('f-party', party, { req: 1, list: 'dl-party' }) + partyList('supplier')) +
        fld('f-gstin', T('gstin'), inp('f-gstin', (r.buyer && r.buyer.gstin) || pm.gstin || '', { ltr: 1 })) +
        fld('f-state', T('state'), sel('f-state', (r.buyer && r.buyer.state) || pm.state || (BIZ.state || ''), [['', '—']].concat(NS.STATES.map(function (s) { return [s[0], s[0] + ' · ' + s[1]]; })))) +
        fld('f-no', T(kind === 'pret' ? 'billno' : 'sno'), inp('f-no', r.no || '', { ltr: 1, req: kind === 'pbill' })) +
        fld('f-date', T('date'), inp('f-date', r.date, { type: 'date', req: 1 })) +
        (kind === 'pret' ? fld('f-orig', T('origno'), inp('f-orig', r.orig && r.orig.no || '', { ltr: 1 })) : fld('f-due', T('due'), inp('f-due', r.due || '', { type: 'date' }))) +
        (window.NSApp.gdField ? NSApp.gdField(r.gd) : '') + '</div>' +
        '<fieldset><legend>' + esc(T('items')) + '</legend><div data-lines></div><button type="button" class="btn sm" data-addline>' + esc(T('addline')) + '</button>' +
        '<label class="chk"><input type="checkbox" id="f-nogst"' + (r.noGst ? ' checked' : '') + '> ' + esc(T('nogst')) + '</label><label class="chk"><input type="checkbox" id="f-round"' + (r.round !== false ? ' checked' : '') + '> ' + esc(T('round')) + '</label>' +
        '<div class="sum" data-sum></div></fieldset>' +
        (kind === 'pbill' && !rec ? '<div class="fg">' + fld('f-mode', T('paidnow'), sel('f-mode', 'credit', modeOpts(true)), { hint: T('paidnowh') }) + '</div>' : '') +
        '<div class="fg"><div class="f wide"><label for="f-photo">' + esc(T('photo')) + '</label><input type="file" id="f-photo" accept="image/*"><small class="soft">' + esc(T('photoh')) + '</small><div class="photo-pv" data-photo-pv></div></div></div>';
      F.lines = JSON.parse(JSON.stringify(r.items)); F.photo = r.photo || '';
    } else if (kind === 'exp') {
      var x = rec || { date: today, mode: 'cash', gst: '' };
      h = '<div class="fg">' + fld('f-date', T('date'), inp('f-date', x.date, { type: 'date', req: 1 })) +
        fld('f-cat', T('cat'), inp('f-cat', x.cat || '', { req: 1, list: 'dl-cat' }) + '<datalist id="dl-cat">' + EXP.map(function (k) { return '<option value="' + esc(T('ex_' + k)) + '">'; }).join('') + '</datalist>') +
        fld('f-amt', T('amount'), inp('f-amt', x.amount || '', { mode: 'decimal', ltr: 1, req: 1 })) +
        fld('f-mode', T('mode'), sel('f-mode', x.mode, modeOpts(true))) +
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
      var cx = rec || { date: today, from: 'cash' };
      h = '<p class="soft">' + esc(T('contrah')) + '</p><div class="fg">' + fld('f-date', T('date'), inp('f-date', cx.date, { type: 'date', req: 1 })) +
        fld('f-dir', T('contra'), sel('f-dir', cx.from, [['cash', T('d_deposit')], ['bank', T('d_withdraw')]])) +
        fld('f-amt', T('amount'), inp('f-amt', cx.amount || '', { mode: 'decimal', ltr: 1, req: 1 })) +
        fld('f-ref', T('ref'), inp('f-ref', cx.ref || '', { ltr: 1 })) + fld('f-note', T('note'), inp('f-note', cx.notes || ''), { wide: 1 }) + '</div>';
    } else if (kind === 'ob') {
      var ob = rec || { date: fyStart(today), side: 'recv' };
      h = '<p class="soft">' + esc(T('obh')) + '</p><div class="fg">' + fld('f-side', T('side'), sel('f-side', o.side || ob.side, [['recv', T('s_recv')], ['pay', T('s_pay')], ['cash', T('s_cash')], ['bank', T('s_bank')]])) +
        fld('f-party', T('party'), inp('f-party', party, { req: 1, list: 'dl-party' }) + partyList()) +
        fld('f-amt', T('amount'), inp('f-amt', ob.amount || '', { mode: 'decimal', ltr: 1, req: 1 })) +
        fld('f-date', T('date'), inp('f-date', ob.date, { type: 'date', req: 1 })) + '</div>';
    }
    $('[data-form-title]', dlg).textContent = T(kind) + (rec && rec.no ? ' ' + rec.no : '') + (C.biz.length > 1 && bizName() ? ' · ' + bizName() : '');   /* two businesses: the form names the one it saves to */
    form.innerHTML = h + '<div class="dlg-foot"><button type="submit" class="btn primary">' + esc(T('save')) + '</button><button type="button" class="btn" data-close>' + esc(T('cancel')) + '</button></div>';
    $('[data-close]', form).addEventListener('click', function () { dlg.close(); });
    var al = $('[data-addline]', form);
    if (al) al.addEventListener('click', function () { F.lines.push({ desc: '', hsn: '', qty: 1, rate: '', gst: $('#f-nogst', form).checked ? 0 : 18 }); drawLines(); });
    if (F.lines) drawLines();
    if (kind === 'min' || kind === 'mout') { tdsPair('f-tds'); drawAlloc(true); chqShow(); }
    if (kind === 'ob') obShow();
    if (F.lines) drawPhoto();
    dlg.showModal();
    var first = $('input:not([type=date]),select', form); if (first && !first.value) first.focus();
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
  }
  function onFormInput(e) {
    var id = e.target.id || '';
    if (id === 'f-mode' || id === 'f-cst') chqShow();
    if (id === 'f-side' && $('#f-party', form) && F.kind === 'ob') obShow();
    if (id === 'f-photo') { if (e.type === 'change' && e.target.files[0]) shrinkPhoto(e.target.files[0]).then(function (u) { F.photo = u; drawPhoto(); }).catch(function () { NS.toast(T('photobad'), 'bad'); }); return; }
    if (F.lines && e.target.hasAttribute('data-li')) { var i = +e.target.getAttribute('data-li'), k = e.target.getAttribute('data-lk'); F.lines[i][k] = e.target.value; if (k === 'desc') fillItem(i); drawSum(); return; }
    if (F.lines && /f-(nogst|round|state)/.test(id)) drawSum();
    /* the first two digits of a GSTIN are the supplier's state code */
    if (id === 'f-gstin') { var st = e.target.value.trim().slice(0, 2); if (/^\d\d$/.test(st) && NS.stateName(st)) { $('#f-state', form).value = st; drawSum(); } }
    if (id === 'f-party' && F.lines) { var pm = C.party.filter(function (p) { return key(p.name) === key(e.target.value); })[0]; if (pm) { if (pm.gstin && !$('#f-gstin', form).value) $('#f-gstin', form).value = pm.gstin; if (pm.state) $('#f-state', form).value = pm.state; drawSum(); } }
    if ((F.kind === 'min' || F.kind === 'mout') && (id === 'f-tdsx' || id === 'f-tds' || id === 'f-amt')) tdsPair(id);
    if ((F.kind === 'min' || F.kind === 'mout') && (id === 'f-party' || id === 'f-amt' || id === 'f-tds' || id === 'f-tdsx')) drawAlloc();
    if (e.target.hasAttribute && e.target.hasAttribute('data-al')) advLeft();
  }
  /* TDS asked both ways on Money received and Money paid: the box that is saved (received: rupees, paid: rate) and its twin.
     Received: the customer paid amount = bill - TDS, so rate = TDS / (amount + TDS). Paid: TDS = rate x amount of the bill. */
  function tdsPair(id) {
    var a = $('#f-tds', form), x = $('#f-tdsx', form); if (!a || !x) return;
    var out = F.kind === 'mout', amt = num($('#f-amt', form).value), fix = function (n) { return n ? String(+n.toFixed(2)) : ''; };
    if (id === 'f-tdsx') {
      var v = num(x.value);
      a.value = !x.value.trim() ? '' : out ? (amt ? fix(v / amt * 100) : '') : (v > 0 && v < 100 && amt ? String(r2(amt * v / (100 - v))) : '');
    } else {
      var s = num(a.value);
      x.value = !a.value.trim() ? '' : out ? (amt ? String(r2(amt * s / 100)) : '') : (amt + s ? fix(s / (amt + s) * 100) : '');
    }
  }
  function fillItem(i) {
    var m = C.item.filter(function (x) { return key(x.desc) === key(F.lines[i].desc); })[0]; if (!m) return;
    var L = F.lines[i]; if (!L.hsn) L.hsn = m.hsn || ''; if (!num(L.rate) && (m.prate || m.rate)) L.rate = m.prate || m.rate; if (m.gst !== '' && m.gst != null) L.gst = m.gst;
    var row = $$('[data-row]', form)[i]; if (row) { $('[data-lk=hsn]', row).value = L.hsn; $('[data-lk=rate]', row).value = L.rate; $('[data-lk=gst]', row).value = L.gst; }
    if (row && m.track && !$('[data-lk=batch],[data-lk=serial]', row)) { drawLines(); var di = $$('[data-lk=desc]', form)[i]; if (di) { di.focus(); di.setSelectionRange(di.value.length, di.value.length); } }   /* batch / serial item (more.js) */
  }
  function drawLines() {
    var box = $('[data-lines]', form);
    box.innerHTML = '<datalist id="dl-item">' + C.item.map(function (x) { return '<option value="' + esc(x.desc) + '">'; }).join('') + '</datalist>' + F.lines.map(function (L, i) {
      function c(k, lbl, o) { o = o || {}; return '<label class="lc lc-' + k + '"><span>' + esc(lbl) + '</span><input data-li="' + i + '" data-lk="' + k + '" value="' + esc(L[k] == null ? '' : L[k]) + '"' + (o.mode ? ' inputmode="' + o.mode + '" dir="ltr"' : ' dir="auto"') + (o.list ? ' list="' + o.list + '"' : '') + ' autocomplete="off"></label>'; }
      return '<div class="line" data-row>' + c('desc', T('item'), { list: 'dl-item' }) + c('hsn', T('hsn'), { mode: 'numeric' }) + c('qty', T('qty'), { mode: 'decimal' }) + c('rate', T('rate'), { mode: 'decimal' }) + c('gst', T('gst'), { mode: 'decimal' }) +
        (window.NSApp.lineX ? NSApp.lineX(L, i, c) : '') +   /* batch, expiry, serial (more.js) */
        (F.lines.length > 1 ? '<button type="button" class="icon-btn rm" data-rm="' + i + '" aria-label="' + esc(T('rmline')) + '">✕</button>' : '') + '</div>';
    }).join('');
    $$('[data-rm]', box).forEach(function (b) { b.addEventListener('click', function () { F.lines.splice(+b.getAttribute('data-rm'), 1); drawLines(); }); });
    drawSum();
  }
  function billFromForm() {
    var d = { type: 'pbill', kind: F.kind === 'pret' ? 'return' : 'bill', seller: sellerCopy(), buyer: { name: $('#f-party', form).value.trim(), gstin: $('#f-gstin', form).value.trim().toUpperCase(), state: $('#f-state', form).value },
      no: $('#f-no', form).value.trim(), date: $('#f-date', form).value, noGst: $('#f-nogst', form).checked, round: $('#f-round', form).checked, photo: F.photo || '',
      items: F.lines.filter(function (L) { return String(L.desc).trim() || num(L.rate); }).map(function (L) { var it = { desc: String(L.desc).trim(), hsn: String(L.hsn || '').trim(), qty: L.qty === '' ? 1 : num(L.qty), unit: 'Nos', rate: num(L.rate), gst: num(L.gst) }; return window.NSApp.lineCopy ? NSApp.lineCopy(L, it) : it; }) };
    if ($('#f-gd', form)) d.gd = $('#f-gd', form).value;
    if ($('#f-due', form)) d.due = $('#f-due', form).value; else d.orig = { no: $('#f-orig', form).value.trim() };
    var t = B.itemTotals(d), total = r2(t.taxable + t.cgst + t.sgst + t.igst);   /* IGST when the supplier's state differs from ours */
    d.total = d.round ? Math.round(total) : total;
    d.tax = { taxable: t.taxable, cgst: t.cgst, sgst: t.sgst, igst: t.igst };
    return d;
  }
  function drawSum() {
    var d = billFromForm(), t = d.tax;
    $('[data-sum]', form).innerHTML = '<span>' + esc(T('taxable')) + ' <b>' + money(t.taxable) + '</b></span><span>' + esc(T('tax')) + ' <b>' + money(t.cgst + t.sgst + t.igst) + '</b>' + (t.igst ? ' (IGST)' : t.cgst ? ' (CGST + SGST)' : '') + '</span><span>' + esc(T('total')) + ' <b>' + money(d.total) + '</b></span>';
  }
  /* open bills of the party on the right side, ticked oldest first up to the amount */
  function drawAlloc(prefill) {
    var out = F.kind === 'mout', side = out ? 'pay' : 'recv', p = key($('#f-party', form).value), box = $('[data-alloc]', form);
    var D = mine().filter(function (d) { return !F.rec || d.id !== F.rec.id; });
    var open = p ? B.bills(D, bizName(), p).bills.filter(function (b) { return b.side === side; }).sort(function (a, b) { return a.date.localeCompare(b.date); }) : [];
    var gross = num($('#f-amt', form).value) + (out ? 0 : num($('#f-tds', form).value));
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
        if (!c.checked) amtI.value = ''; else { var used = sumAlloc() - num(amtI.value); amtI.value = r2(Math.max(0, Math.min(num(amtI.getAttribute('data-max')), gross - used))) || amtI.getAttribute('data-max'); }
        advLeft();
      });
    });
    advLeft();
  }
  function sumAlloc() { return r2($$('[data-alloc] input[data-al]:not([type=checkbox])', form).reduce(function (a, i) { return a + num(i.value); }, 0)); }
  function advLeft() {
    var out = F.kind === 'mout', gross = num($('#f-amt', form).value) + (out ? 0 : num($('#f-tds', form).value)), x = r2(gross - sumAlloc());
    $('[data-advleft]', form).textContent = x > 0.004 && $('#f-party', form).value.trim() ? T('advleft', { a: money(x) }) : '';
  }

  function submit() {
    if (F.biz !== bizName()) { NS.toast(NS.t('ux.bizmoved', { b: bizName() }), 'bad'); dlg.close(); show(); return; }   /* never save under a business the form did not show */
    var k = F.kind, miss = $$('[required]', form).filter(function (i) { return !String(i.value).trim(); });
    if (miss.length) { NS.toast(T('need', { f: miss.map(function (i) { return $('label[for="' + i.id + '"]', form).textContent; }).join(', ') }), 'bad'); miss[0].focus(); return; }
    var lock = window.NSApp.closedMsg && $('#f-date', form) && (NSApp.closedMsg($('#f-date', form).value) || F.rec && NSApp.closedMsg(F.rec.date));   /* closed financial year (more.js) */
    if (lock) { NS.toast(lock, 'bad'); return; }
    var rec = F.rec ? JSON.parse(JSON.stringify(F.rec)) : null, jobs = [], party = $('#f-party', form) ? $('#f-party', form).value.trim() : '', d;
    if (k === 'min' || k === 'mout') {
      var out = k === 'mout', amt = r2(num($('#f-amt', form).value)), alloc = $$('[data-alloc] input[data-al]:not([type=checkbox])', form).filter(function (i) { return num(i.value) > 0; }).map(function (i) {
        var b = C.doc.filter(function (x) { return x.id === i.getAttribute('data-al'); })[0]; return { id: i.getAttribute('data-al'), no: b ? b.no || '' : '', amt: r2(Math.min(num(i.value), num(i.getAttribute('data-max')))) }; });
      var date = $('#f-date', form).value, nos = alloc.map(function (a) { return a.no; }).filter(Boolean).join(', ');
      if (out) {
        d = Object.assign(rec || { type: 'voucher', no: nextNo('voucher', 'PV', date), paper: 'a4', design: 'classic', copies: 1, copyLabel: 'orig', tdsSec: '', rcm: false, rcmRate: '18', prep: '', appr: '', status: '' }, {
          app: 1, forBill: true, date: date, seller: Object.assign(rec ? rec.seller : {}, sellerCopy()), mode: $('#f-mode', form).value, ref: $('#f-ref', form).value.trim(), tdsRate: $('#f-tds', form).value.trim(), alloc: alloc,
          lines: [{ desc: $('#f-note', form).value.trim() || (nos ? 'Payment against bill ' + nos : 'Payment on account'), head: 'Supplier payment', amt: amt }] });
        d.buyer = Object.assign(rec ? rec.buyer : { addr: '', phone: '', gstin: '', pan: '' }, { name: party });
      } else {
        var unpaidLeft = r2(amt + num($('#f-tds', form).value) - alloc.reduce(function (a, x) { return a + x.amt; }, 0));
        d = Object.assign(rec || { type: 'receipt', no: nextNo('receipt', 'RCT', date), paper: 'a4', design: 'classic', copies: 1, copyLabel: '', gstAdv: false, rate: '18', pos: '', sac: '', rv: '', rvDate: '', refDate: '', bank: '', balance: '', status: '' }, {
          app: 1, kind: alloc.length ? 'pay' : 'adv', date: date, seller: Object.assign(rec ? rec.seller : {}, sellerCopy()), amount: amt, tds: $('#f-tds', form).value.trim(), mode: $('#f-mode', form).value,
          ref: $('#f-ref', form).value.trim(), against: nos, purpose: $('#f-note', form).value.trim() || (unpaidLeft > 0.004 && alloc.length ? 'Part advance' : ''), alloc: alloc });
        d.buyer = Object.assign(rec ? rec.buyer : { addr: '', phone: '', gstin: '', pan: '' }, { name: party });
      }
      d.total = amt;
      var cq = chqFromForm(); if (cq) d.chq = cq; else delete d.chq;
      jobs.push(savePartyRole(party, out ? 'supplier' : 'customer'));
      return Promise.all(jobs).then(function () { return NSStore.put('doc', d); }).then(function (saved) { return markPaid(saved); }).then(done);
    }
    if (k === 'pbill' || k === 'pret') {
      d = billFromForm();
      if (!d.items.length) { NS.toast(T('need', { f: T('items') }), 'bad'); return; }
      if (rec) d = Object.assign(rec, d, { id: rec.id });
      var dup = k === 'pbill' && C.doc.filter(function (x) { return x.type === 'pbill' && x.kind !== 'return' && x.id !== (rec && rec.id) && key(x.no) === key(d.no) && key(B.partyName(x)) === key(party) && key(x.seller && x.seller.name) === key(bizName()); })[0];
      if (dup && !confirm(T('samebill', { no: d.no, p: party }))) return;
      var mode = $('#f-mode', form) ? $('#f-mode', form).value : 'credit';
      jobs.push(savePartyRole(party, 'supplier', { gstin: d.buyer.gstin, state: d.buyer.state }));
      d.items.forEach(function (it) {
        if (!it.desc) return;
        var hit = C.item.filter(function (x) { return key(x.desc) === key(it.desc); })[0];
        if (!hit) jobs.push(NSStore.put('item', { desc: it.desc, hsn: it.hsn, unit: it.unit, rate: '', gst: it.gst, kind: 'goods' }));
      });
      return Promise.all(jobs).then(function () { return NSStore.put('doc', d); }).then(function (saved) {
        if (mode === 'credit' || k !== 'pbill') return saved;
        /* paid at once: a payment entry linked to this bill */
        var v = { type: 'voucher', app: 1, forBill: true, no: nextNo('voucher', 'PV', saved.date), date: saved.date, paper: 'a4', design: 'classic', copies: 1, copyLabel: 'orig', tdsSec: '', tdsRate: '', rcm: false, rcmRate: '18', prep: '', appr: '', status: '',
          seller: sellerCopy(), buyer: { name: party, addr: '', phone: '', gstin: saved.buyer.gstin, pan: '' }, mode: mode, ref: '', alloc: [{ id: saved.id, no: saved.no, amt: saved.total }],
          lines: [{ desc: 'Payment against bill ' + saved.no, head: 'Supplier payment', amt: saved.total }] };
        v.total = saved.total;
        return NSStore.put('doc', v);
      }).then(done);
    }
    if (k === 'exp') {
      d = Object.assign(rec || { type: 'exp', app: 1 }, { date: $('#f-date', form).value, seller: sellerCopy(), cat: $('#f-cat', form).value.trim(), amount: r2(num($('#f-amt', form).value)), mode: $('#f-mode', form).value,
        buyer: { name: party }, no: $('#f-no', form).value.trim(), gst: $('#f-gst', form).value, itc: $('#f-itc', form).checked, inter: $('#f-inter', form).checked, notes: $('#f-note', form).value.trim() });
      d.total = d.amount;
      if (d.mode === 'credit' && !party) { NS.toast(T('need', { f: T('payee') }), 'bad'); $('#f-party', form).focus(); return; }
      if (party) jobs.push(savePartyRole(party, 'supplier'));
      return Promise.all(jobs).then(function () { return NSStore.put('doc', d); }).then(done);
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
      var fr = $('#f-dir', form).value;
      d = Object.assign(rec || { type: 'contra', app: 1, no: '' }, { date: $('#f-date', form).value, seller: sellerCopy(), from: fr, to: fr === 'cash' ? 'bank' : 'cash', amount: r2(num($('#f-amt', form).value)), ref: $('#f-ref', form).value.trim(), notes: $('#f-note', form).value.trim() });
      d.total = d.amount;
      return NSStore.put('doc', d).then(done);
    }
    if (k === 'ob') {
      d = Object.assign(rec || { type: 'ob', app: 1 }, { date: $('#f-date', form).value, seller: sellerCopy(), buyer: { name: /^(cash|bank)$/.test($('#f-side', form).value) ? '' : party }, side: $('#f-side', form).value, amount: r2(num($('#f-amt', form).value)) });
      d.total = d.amount; d.no = '';
      if (!d.buyer.name) return NSStore.put('doc', d).then(done);
      return savePartyRole(party, d.side === 'pay' ? 'supplier' : 'customer').then(function () { return NSStore.put('doc', d); }).then(done);
    }
  }
  function done() { dlg.close(); NS.toast(T('saved')); NS.checkReminder && NS.checkReminder(); show(); }
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
  window.NSApp = {
    T: T, B: B, addSection: function (name, html, wire) { EXT[name] = { html: html, wire: wire }; }, addHome: function (f) { HOME.push(f); }, cfg: function () { return CFG; }, show: show, openForm: openForm,
    mine: mine, biz: function () { return BIZ; }, bizName: bizName, data: function () { return C; }, docName: docName, enName: enName, amountOf: amountOf,
    rowsHtml: rowsHtml, leftMap: leftMap, searchBar: searchBar, match: match, byDate: byDate, fyStart: fyStart, toolUrl: toolUrl, myUrl: myUrl, ldate: ldate,
    range: function (f, t) { if (f) stFrom = f; if (t) stTo = t; if (!stTo) stTo = NS.today(); if (!stFrom) stFrom = fyStart(stTo); return [stFrom, stTo]; },
    markPaid: markPaid, openUrl: openUrl, siteHome: siteHome, frameAt: frameAt, docUrl: docUrl, cfg: function () { return CFG; }, q: function () { return q; }, filt: function (f) { if (f != null) filt = f; return filt; },
    whatsapp: whatsapp, phoneOf: phoneOf, groups: function () { return GRP; }, gidOf: gidOf, gname: gname, grpSel: grpSel, grpKeep: grpKeep, grp: function (g) { if (g != null) grp = g; return grp; },
    door: function () { return DOOR; }
  };
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
    /* links to a document maker or My data open inside the app (new-tab and modified clicks are left alone) */
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || a.target === '_blank' || e.defaultPrevented || e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      if (openUrl(a.href)) e.preventDefault();
    });
    NSStore.ready().then(route).then(function () { NSStore.persist().catch(function () {}); });
    window.addEventListener('focus', function () { if (cur !== 'do' && (!dlg || !dlg.open)) show(); });
    document.addEventListener('ns-data', function () { if (cur !== 'do' && (!dlg || !dlg.open)) show(); });   /* the data home came in late */   /* bills made in another tab show up when you come back */
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

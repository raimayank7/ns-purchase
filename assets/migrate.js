/* NSBiz: "Bring data from other software" (Utilities, section 'mig'; after bankimp.js). Owner 25 Nov 2026: every business that
   switches to NSBiz brings everything across: masters, openings, every bill and voucher. Evershine first (its folder is read
   in the browser: dbfread.js + evcore.js); Tally from its XML export files (tallyin.js: also the Tally files Marg, Vyapar,
   myBillBook and many others make); ZEEFA and Busy follow (listed, not ready yet).
   Flow: choose the folder (the whole Evershine folder or one company-year folder) -> companies and years found -> for each company:
   a new NSBiz business (or an existing one), its state -> Read and check (nothing saved: counts, and every account compared with
   Evershine's own postings, year by year) -> Bring it in (saved a few at a time) -> it can be taken out again (meta 'migrations').
   Every record carries src = { sw, co, id, batch }: a second run brings only what is new. App screen: English only. */
(function () {
  'use strict';
  var A = window.NSApp, D = window.NSDbf, E = window.NSEver, B = window.NSBooks, TI = window.NSTallyIn; if (!A || !D || !E || !B) return;
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, key = B.key;
  var ST = { sw: 'ev', files: null, cos: [], pick: {}, prev: null, busy: false, msg: '' };
  var SW = { ev: { id: 'evershine', name: 'Evershine' }, tally: { id: 'tally', name: 'Tally' } };
  function swOf() { return SW[ST.sw] || SW.ev; }

  function money(v) { return NS.money ? NS.money(v, false) : (+v).toFixed(2); }
  function sellerCopy(b) { var s = JSON.parse(JSON.stringify(b || {})); delete s.id; delete s.created; delete s.updated; return s; }
  function stateOpts(sel) { return '<option value="">Choose the state</option>' + NS.STATES.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === sel ? ' selected' : '') + '>' + esc(s[0] + ' ' + s[1]) + '</option>'; }).join(''); }

  /* ---------- reading the chosen folder ---------- */
  function want(name) { var n = name.toLowerCase().replace(/\.(dbf|fpt|dbt)$/, ''); return /\.(dbf|fpt|dbt)$/i.test(name) && E.TABLES.indexOf(n) >= 0; }
  function pathOf(f) { return f.webkitRelativePath || f.name; }
  function chosen(files) {
    var list = [].slice.call(files || []).filter(function (f) { return want(f.name); });
    var found = E.folders(list.map(pathOf));
    ST.files = list; ST.cos = []; ST.pick = {}; ST.prev = null; ST.msg = '';
    var by = {};
    found.forEach(function (f) { (by[f.co] = by[f.co] || []).push(f); });
    Object.keys(by).forEach(function (co) {
      var years = by[co].sort(function (a, b) { return a.year < b.year ? -1 : 1; });
      var have = A.data().biz.filter(function (b) { return b.src && b.src.sw === 'evershine' && b.src.co === co; })[0];
      ST.cos.push({ co: co, years: years });
      ST.pick[co] = { on: true, years: years.map(function (y) { return y.id; }), into: have ? have.id : 'new', name: have ? have.name : co + ' (from Evershine)', state: have ? have.state || '' : '' };
    });
    if (!found.length) ST.msg = 'No Evershine company folder was found there. Choose the EVERSHIN folder, or a folder like AIW2223 that holds account.dbf and allentry.dbf.';
    A.show();
  }
  /* Tally: one or more XML export files (masters and day book), read together as one company */
  function chosenTally(files) {
    var list = [].slice.call(files || []).filter(function (f) { return /\.xml$/i.test(f.name); });
    ST.files = null; ST.cos = []; ST.pick = {}; ST.prev = null; ST.msg = '';
    if (!list.length) { ST.msg = 'No Tally XML file was chosen. In Tally, export the masters and the Day Book (or the vouchers) as XML, then choose those files.'; A.show(); return; }
    /* read in 8 MB parts: a company's day book can be hundreds of MB */
    var c = TI.collector(), PART = 8 << 20, total = list.reduce(function (a, f) { return a + f.size; }, 0), done = 0;
    ST.busy = true; ST.msg = 'Reading the Tally files… 0%'; A.show();
    list.reduce(function (pr, f) {
      return pr.then(function () {
        var at = 0;
        function next() {
          if (at >= f.size) { c.end(); return Promise.resolve(); }
          var part = f.slice(at, at + PART); at += PART;
          return part.arrayBuffer().then(function (b) {
            c.feed(new Uint8Array(b)); done += b.byteLength;
            var el = $('.mg-read'), pc = Math.round(done / total * 100) + '%';
            if (el) el.textContent = 'Reading the Tally files… ' + pc; else ST.msg = 'Reading the Tally files… ' + pc;
            return new Promise(function (r) { setTimeout(r, 0); }).then(next);
          });
        }
        return next();
      });
    }, Promise.resolve()).then(function () {
      ST.busy = false; ST.msg = '';
      var M = c.M, texts = M;
      if (!M.vouchers.length && !Object.keys(M.ledgers).length) { ST.msg = 'These files hold no Tally ledgers or vouchers. Export the masters and the Day Book from Tally as XML.'; A.show(); return; }
      var co = M.company || list[0].name.replace(/\.xml$/i, '');
      var have = A.data().biz.filter(function (b) { return b.src && b.src.sw === 'tally' && key(b.src.co) === key(co); })[0];
      var dates = M.vouchers.map(function (v) { return v.f.DATE; }).filter(Boolean).sort();
      var span = dates.length ? fmt(dates[0]) + ' to ' + fmt(dates[dates.length - 1]) : 'masters only';
      ST.cos.push({ co: co, tally: texts, years: [{ id: 'all', year: list.length + ' file' + (list.length > 1 ? 's' : '') + ', ' + M.vouchers.length + ' vouchers, ' + span }] });
      ST.pick[co] = { on: true, years: ['all'], into: have ? have.id : 'new', name: have ? have.name : co + ' (from Tally)', state: have ? have.state || '' : '' };
      A.show();
    }).catch(function (e) { ST.busy = false; ST.msg = 'Could not read the files: ' + (e && e.message || e); A.show(); });
    function fmt(d) { return /^\d{8}$/.test(d) ? d.slice(6) + '-' + d.slice(4, 6) + '-' + d.slice(0, 4) : d; }
  }
  function tablesOf(y) {
    var T = {}, memo = {}, dir = y.dir.replace(/\/+$/, '') + '/';
    var mine = ST.files.filter(function (f) { var p = pathOf(f).replace(/\\/g, '/'); return p.indexOf(dir) === 0 || p.indexOf('/' + dir) >= 0 || (dir.indexOf('/') < 0 && p.split('/').slice(-2, -1)[0] === y.dir); });
    mine.forEach(function (f) { if (/\.(fpt|dbt)$/i.test(f.name)) memo[f.name.toLowerCase().replace(/\.(fpt|dbt)$/, '')] = f; });
    return Promise.all(mine.filter(function (f) { return /\.dbf$/i.test(f.name); }).map(function (f) {
      var t = f.name.toLowerCase().replace(/\.dbf$/, ''), m = memo[t];
      return Promise.all([f.arrayBuffer(), m ? m.arrayBuffer() : null]).then(function (b) {
        try { T[t] = D.read(b[0], { memo: b[1] }).records; } catch (e) { T[t] = []; ST.msg = 'Could not read ' + f.name + ' (' + e.message + ').'; }
      });
    })).then(function () { return T; });
  }

  /* ---------- read and check (nothing saved) ---------- */
  function bizFor(co) {
    var p = ST.pick[co];
    if (p.into !== 'new') { var b = A.data().biz.filter(function (x) { return x.id === p.into; })[0]; if (b) return b; }
    return { name: String(p.name || co).trim(), state: p.state || '' };
  }
  function haveIds(bizName) { var sw = swOf().id, o = {}; A.data().doc.forEach(function (d) { if (d.src && d.src.sw === sw && key(d.seller && d.seller.name) === key(bizName)) o[d.src.id] = 1; }); return o; }
  function readCheck() {
    if (ST.busy) return; ST.busy = true; ST.prev = null; ST.msg = 'Reading the ' + swOf().name + ' files…'; A.show();
    var out = [], jobs = ST.cos.filter(function (c) { return ST.pick[c.co].on; });
    function oneCo(c) {
      var biz = bizFor(c.co), seller = sellerCopy(biz), have = haveIds(biz.name), all = A.data().doc.filter(function (d) { return key(d.seller && d.seller.name) === key(biz.name); }), years = [];
      var pickYears = c.years.filter(function (y) { return ST.pick[c.co].years.indexOf(y.id) >= 0; });
      var firstEver = !all.some(function (d) { return d.src && d.src.sw === swOf().id; });
      if (c.tally) return new Promise(function (r) { setTimeout(r, 30); }).then(function () {
        var P = TI.plan(c.tally, { co: c.co, seller: seller, totals: B.itemTotals, postings: B.postings, noOpening: !firstEver, have: have });
        if (!seller.state && P.ownState) { seller.state = P.ownState; ST.pick[c.co].state = ST.pick[c.co].state || P.ownState; P = TI.plan(c.tally, { co: c.co, seller: seller, totals: B.itemTotals, postings: B.postings, noOpening: !firstEver, have: have }); }
        var C = TI.check(c.tally, P, B.accounts(P.docs, seller.name), { noOpening: !firstEver });
        years.push({ y: c.years[0], P: P, C: C, CR: null });
        out.push({ co: c.co, biz: biz, seller: seller, years: years });
      });
      return pickYears.reduce(function (pr, y, yi) {
        return pr.then(function () { return tablesOf(y); }).then(function (T) {
          if (!seller.state) { seller.state = E.ownState(T); ST.pick[c.co].state = ST.pick[c.co].state || seller.state; }
          var P = E.plan(T, { co: y.id, seller: seller, totals: B.itemTotals, postings: B.postings, noOpening: !(firstEver && yi === 0), have: have });
          P.docs.forEach(function (d) { have[d.src.id] = 1; });
          var CR = yi > 0 || !firstEver ? E.carry(T, P, B.accounts(all, seller.name)) : null;
          all = all.concat(P.docs);
          var C = E.check(T, P, B.accounts(P.docs, seller.name), { noOpening: !(firstEver && yi === 0) });
          years.push({ y: y, P: P, C: C, CR: CR });
        });
      }, Promise.resolve()).then(function () { out.push({ co: c.co, biz: biz, seller: seller, years: years }); });
    }
    jobs.reduce(function (pr, c) { return pr.then(function () { return oneCo(c); }); }, Promise.resolve()).then(function () {
      ST.busy = false; ST.prev = out; ST.msg = ''; A.show();
    }).catch(function (e) { ST.busy = false; ST.msg = 'Could not read the folder: ' + (e && e.message || e); A.show(); });
  }

  /* ---------- bring it in ---------- */
  function save() {
    if (ST.busy || !ST.prev) return;
    var sw = swOf(), batch = ST.sw + Date.now().toString(36), list = [], made = [];
    ST.busy = true; A.show();
    var bar = $('.mg-prog'), done = 0;
    function put(store, rec) { return NSStore.put(store, rec).then(function (r) { done++; if (bar) bar.value = done; return r; }); }
    var chain = Promise.resolve();
    ST.prev.forEach(function (R) {
      var count = R.years.reduce(function (s, y) { return s + y.P.docs.length + y.P.parties.length + y.P.items.length; }, 0);
      list.push(count);
      chain = chain.then(function () {
        if (bar) bar.max = list.reduce(function (a, b) { return a + b; }, 0) || 1;
        /* the business: an existing one, or a new one */
        var isNew = !R.biz.id;
        return (isNew ? put('biz', Object.assign({}, R.seller, { src: { sw: sw.id, co: R.co, batch: batch } })) : Promise.resolve(R.biz)).then(function (biz) {
          var seller = sellerCopy(biz), bizId = biz.id, rec = { batch: batch, sw: sw.id, co: R.co, biz: bizId, bizName: biz.name, newBiz: isNew, at: Date.now(), years: R.years.map(function (y) { return y.y.year; }), counts: {} };
          var data = A.data(), haveP = {}, haveI = {};
          data.party.forEach(function (p) { if (!p.biz || p.biz === bizId) haveP[key(p.name)] = 1; });
          data.item.forEach(function (i) { if (!i.biz || i.biz === bizId) haveI[key(i.desc)] = 1; });
          var groups = [], banks = [], recs = [];
          R.years.forEach(function (Y) {
            Y.P.groups.forEach(function (g) { groups.push(g); });
            Y.P.banks.forEach(function (b) { banks.push(b); });
            Y.P.parties.forEach(function (p) { if (haveP[key(p.name)]) return; haveP[key(p.name)] = 1; recs.push(['party', Object.assign({}, p, { biz: bizId, src: Object.assign({}, p.src, { batch: batch }) })]); });
            Y.P.items.forEach(function (i) { if (haveI[key(i.desc)]) return; haveI[key(i.desc)] = 1; recs.push(['item', Object.assign({}, i, { biz: bizId, src: Object.assign({}, i.src, { batch: batch }) })]); });
            Y.P.docs.forEach(function (d) { recs.push(['doc', Object.assign({}, d, { seller: seller, src: Object.assign({}, d.src, { batch: batch }) })]); rec.counts[d.type] = (rec.counts[d.type] || 0) + 1; });
          });
          rec.counts.party = recs.filter(function (x) { return x[0] === 'party'; }).length; rec.counts.item = recs.filter(function (x) { return x[0] === 'item'; }).length;
          return Promise.all([NSStore.meta('groups'), NSStore.meta('banks')]).then(function (m) {
            var G = m[0] && typeof m[0] === 'object' ? m[0] : {}, BK = m[1] && typeof m[1] === 'object' ? m[1] : {};
            G.party = Array.isArray(G.party) ? G.party : [];
            groups.forEach(function (g) { if (!G.party.some(function (x) { return x.id === g.id; })) G.party.push({ id: g.id, name: g.name, under: g.under, src: { sw: sw.id, batch: batch } }); });
            var bl = BK[bizId] = Array.isArray(BK[bizId]) ? BK[bizId] : [];
            banks.forEach(function (b) { if (!bl.some(function (x) { return key(x.name) === key(b.name); })) bl.push({ name: b.name, acc: '', ifsc: '', branch: '' }); });
            return Promise.all([NSStore.meta('groups', G), NSStore.meta('banks', BK)]);
          }).then(function () {
            /* saved 25 at a time with a breath between, so 10,000 records never lock the window */
            var i = 0;
            function step() {
              var part = recs.slice(i, i + 25); if (!part.length) return Promise.resolve();
              i += part.length;
              return Promise.all(part.map(function (x) { return put(x[0], x[1]); })).then(function () { return new Promise(function (r) { setTimeout(r, 0); }); }).then(step);
            }
            return step();
          }).then(function () {
            made.push(rec);
            return NSStore.meta('migrations').then(function (m) { m = Array.isArray(m) ? m : []; m.unshift(rec); return NSStore.meta('migrations', m.slice(0, 50)); });
          });
        });
      });
    });
    chain.then(function () {
      ST.busy = false; ST.prev = null; ST.files = null; ST.cos = [];
      ST.msg = made.map(function (r) { return 'Brought ' + r.co + ' into ' + r.bizName + ': ' + Object.keys(r.counts).map(function (k) { return r.counts[k] + ' ' + k; }).join(', ') + '.'; }).join(' ');
      if (NS.toast) NS.toast('Data brought in from ' + sw.name + '.');
      A.show();
    }).catch(function (e) { ST.busy = false; ST.msg = 'Stopped while saving: ' + (e && e.message || e) + '. What was saved can be taken out again below.'; A.show(); });
  }

  /* ---------- take an import out again ---------- */
  function undo(batch) {
    return NSStore.meta('migrations').then(function (m) {
      m = Array.isArray(m) ? m : []; var r = m.filter(function (x) { return x.batch === batch; })[0]; if (!r) return;
      var msg = 'Take out everything brought in from ' + r.co + ' into ' + r.bizName + '? Bills, vouchers, openings, parties and items of this import are removed' + (r.newBiz ? ', and the business itself' : '') + '. Your own entries are not touched.';
      return (NS.ask ? NS.ask(msg) : Promise.resolve(window.confirm(msg))).then(function (yes) {
        if (!yes) return;
        ST.busy = true; A.show();
        return Promise.all(['doc', 'party', 'item'].map(function (s) { return NSStore.list(s); })).then(function (L) {
          var jobs = [];
          ['doc', 'party', 'item'].forEach(function (s, i) { L[i].forEach(function (x) { if (x.src && x.src.batch === batch) jobs.push([s, x.id, x]); }); });
          function show(k, total) { var el = $('.mg-read'), w = 'Taking out… ' + k + ' of ' + total; if (el) el.textContent = w; else { ST.msg = w; A.show(); } }
          /* the import's own records in bulk (store.js delImport), then the business it made */
          if (NSStore.delImport) return NSStore.delImport(batch, jobs.map(function (j) { return { store: j[0], rec: j[2] }; }), show).then(function () {
            if (!r.newBiz) return;
            return NSStore.get('biz', r.biz).then(function (b) { if (b) return NSStore.del('biz', r.biz, { batch: batch }); });
          });
          if (r.newBiz) jobs.push(['biz', r.biz]);
          /* the business last, after everything in it; a few at a time with a breath between, and the count on screen */
          var k = 0, total = jobs.length;
          function step() {
            var part = jobs.slice(k, k + 25); if (!part.length) return Promise.resolve(); k += part.length;
            var el = $('.mg-read'); if (el) el.textContent = 'Taking out… ' + k + ' of ' + total; else { ST.msg = 'Taking out… ' + k + ' of ' + total; A.show(); }
            return Promise.all(part.map(function (j) { return NSStore.del(j[0], j[1], { batch: batch }); })).then(function () { return new Promise(function (res) { setTimeout(res, 0); }); }).then(step);
          }
          return step();
        }).then(function () {
          return NSStore.meta('migrations', m.filter(function (x) { return x.batch !== batch; }));
        }).then(function () { ST.busy = false; ST.msg = 'The import of ' + r.co + ' was taken out.'; A.show(); },
          function (e) { ST.busy = false; ST.msg = 'Stopped while taking it out: ' + (e && e.message || e) + '. Press Take it out again to finish.'; A.show(); });
      });
    });
  }

  /* ---------- screen ---------- */
  var HIST = null;
  function html() {
    var h = '<div class="pane-hd"><h2>' + esc(A.T('mig')) + '</h2></div>';
    h += '<p class="hint">Moving to NSBiz from other accounting software? Bring your parties, items, opening balances and every past bill and voucher across. The other software\'s files are only read, never changed; nothing is saved until you press Bring it in, and an import can be taken out again.</p>';
    if (ST.msg) h += '<p class="sb-note mg-read">' + esc(ST.msg) + '</p>';
    h += '<div class="card"><h3>1. The software you used</h3><div class="mg-sw">' +
      [['ev', 'Evershine', ''], ['tally', 'Tally', 'also Marg, Vyapar, myBillBook and others that export to Tally'], ['zf', 'ZEEFA', 'coming next'], ['busy', 'Busy', 'coming next']].map(function (s) {
        var ready = s[0] === 'ev' || (s[0] === 'tally' && TI);
        return '<label class="mg-opt' + (ready ? '' : ' soft') + '"><input type="radio" name="mg-sw" value="' + s[0] + '"' + (ready ? '' : ' disabled') + (ST.sw === s[0] ? ' checked' : '') + '> ' + esc(s[1]) + (s[2] ? ' <span class="soft">(' + esc(s[2]) + ')</span>' : '') + '</label>';
      }).join('') + '</div>' +
      (ST.sw === 'tally' ?
        '<h3>2. Its export files</h3><p class="soft">In Tally: open the company, go to <b>Export</b> (Alt+E) › <b>Masters</b> and save as XML; then open <b>Day Book</b> for the whole period (Alt+F2 to set the dates) › Export › XML. Choose both files here (hold Ctrl to pick more than one). Other software: use its "Export to Tally" XML file.</p>' +
        '<label class="btn primary" for="mg-xml">Choose the Tally XML files</label><input type="file" id="mg-xml" class="sr" accept=".xml,text/xml" multiple></div>' :
        '<h3>2. Its data folder</h3><p class="soft">Choose the Evershine folder (usually <b>EVERSHIN</b> on drive C: or D:), or one company-year folder such as AIW2223. Your browser asks you to confirm; only the files Evershine keeps its books in are read.</p>' +
        '<label class="btn primary" for="mg-dir">Choose the Evershine folder</label><input type="file" id="mg-dir" class="sr" webkitdirectory directory multiple></div>');
    if (ST.cos.length) {
      h += '<div class="card"><h3>3. Companies found</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th class="l">Company</th><th class="l">Years</th><th class="l">Bring into</th><th class="l">State</th></tr></thead><tbody>' +
        ST.cos.map(function (c) {
          var p = ST.pick[c.co];
          return '<tr><td><input type="checkbox" data-mgon="' + c.co + '"' + (p.on ? ' checked' : '') + ' aria-label="Bring ' + esc(c.co) + '"></td><td class="l"><b>' + esc(c.co) + '</b></td><td class="l">' +
            c.years.map(function (y) { return '<label class="mg-yr"><input type="checkbox" data-mgyr="' + c.co + '|' + y.id + '"' + (p.years.indexOf(y.id) >= 0 ? ' checked' : '') + '> ' + esc(y.year) + '</label>'; }).join(' ') + '</td>' +
            '<td class="l"><select data-mginto="' + c.co + '"><option value="new"' + (p.into === 'new' ? ' selected' : '') + '>A new business</option>' + A.data().biz.map(function (b) { return '<option value="' + esc(b.id) + '"' + (p.into === b.id ? ' selected' : '') + '>' + esc(b.name) + '</option>'; }).join('') + '</select>' +
            (p.into === 'new' ? ' <input type="text" data-mgname="' + c.co + '" value="' + esc(p.name) + '" aria-label="Name of the new business">' : '') + '</td>' +
            '<td class="l">' + (p.into === 'new' ? '<select data-mgstate="' + c.co + '">' + stateOpts(p.state) + '</select>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div><p class="soft">' + (ST.sw === 'tally' ? 'The ledgers\' opening balances come across on the first day; vouchers keep their own dates.' : 'Years of one company come into one business, oldest first: the first year\'s opening balances come across, later years carry forward in NSBiz.') + '</p>' +
        '<div class="btns"><button type="button" class="btn primary" data-mgread' + (ST.busy ? ' disabled' : '') + '>Read and check</button></div></div>';
    }
    if (ST.prev) {
      h += '<div class="card"><h3>4. What will come across</h3>';
      ST.prev.forEach(function (R) {
        h += '<h4>' + esc(R.co) + ' into ' + esc(R.seller.name) + (R.seller.state ? ' (state ' + esc(R.seller.state) + ')' : '') + '</h4><div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">Year</th><th class="n">Parties</th><th class="n">Items</th><th class="n">Bills</th><th class="n">Vouchers</th><th class="n">Bills with a posting fix</th><th class="l">Accounts compared with ' + esc(swOf().name) + '</th></tr></thead><tbody>' +
          R.years.map(function (Y) {
            var c = {}; Y.P.docs.forEach(function (d) { c[d.type] = (c[d.type] || 0) + 1; });
            var bills = (c.invoice || 0) + (c.expinv || 0) + (c.pbill || 0) + (c.note || 0) + (c.exp || 0), vch = (c.jv || 0) + (c.ob || 0) - (Y.P.fixed || 0);
            var ok = Y.C.bad === 0 && (!Y.CR || Y.CR.bad === 0);
            return '<tr><td class="l">' + esc(Y.y.year) + '</td><td class="n">' + Y.P.parties.length + '</td><td class="n">' + Y.P.items.length + '</td><td class="n">' + bills + '</td><td class="n">' + vch + '</td><td class="n">' + (Y.P.fixed || 0) + '</td><td class="l">' +
              (ok ? '<span class="ok">All ' + (Y.C.ok + (Y.CR ? Y.CR.ok : 0)) + ' match</span>' : '<span class="bad">' + (Y.C.bad + (Y.CR ? Y.CR.bad : 0)) + ' differ</span>, ' + (Y.C.ok + (Y.CR ? Y.CR.ok : 0)) + ' match') + (Y.P.skipped ? ' · ' + Y.P.skipped + ' already in NSBiz' : '') + '</td></tr>';
          }).join('') + '</tbody></table></div>';
        R.years.forEach(function (Y) {
          var rows = Y.C.rows.filter(function (r) { return r.diff; }).concat(Y.CR ? Y.CR.rows.filter(function (r) { return r.diff; }).map(function (r) { return Object.assign({ open: 1 }, r); }) : []);
          if (!rows.length) return;
          h += '<details><summary>' + esc(Y.y.year) + ': ' + rows.length + ' accounts differ from ' + esc(swOf().name) + '</summary><div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">Account</th><th class="n">' + esc(swOf().name) + '</th><th class="n">NSBiz</th><th class="n">Difference</th></tr></thead><tbody>' +
            rows.slice(0, 200).map(function (r) { return '<tr><td class="l">' + esc(r.name) + (r.open ? ' <span class="soft">(opening)</span>' : '') + '</td><td class="n">' + money(r.evershine != null ? r.evershine : r.tally) + '</td><td class="n">' + money(r.nsbiz) + '</td><td class="n">' + money(r.diff) + '</td></tr>'; }).join('') + '</tbody></table></div></details>';
        });
      });
      ST.prev.forEach(function (R) { R.years.forEach(function (Y) {
        var L = Y.P.left || {}, ks = Object.keys(L), W = Y.P.warn || [];
        if (ks.length) h += '<p class="soft">Left out, as they post nothing in ' + esc(swOf().name) + ': ' + esc(ks.map(function (k) { return L[k] + ' ' + k; }).join(', ')) + '.</p>';
        var ub = W.filter(function (w) { return w.w === 'unbalanced'; });
        if (ub.length) h += '<p class="sb-note">' + ub.length + ' voucher' + (ub.length > 1 ? 's do' : ' does') + ' not add up in the file itself (' + esc(ub.slice(0, 5).map(function (w) { return w.id; }).join(', ')) + (ub.length > 5 ? '…' : '') + '); the gap is kept in an account named Tally difference so you can find and correct it.</p>';
      }); });
      h += '<div class="btns"><button type="button" class="btn primary" data-mgsave' + (ST.busy ? ' disabled' : '') + '>Bring it in</button> <progress class="mg-prog"' + (ST.busy ? '' : ' hidden') + '></progress></div></div>';
    }
    if (HIST && HIST.length) {
      h += '<div class="card"><h3>Earlier imports</h3><ul class="mg-hist">' + HIST.map(function (r) {
        return '<li>' + esc(r.co) + ' into <b>' + esc(r.bizName) + '</b> on ' + esc(new Date(r.at).toLocaleDateString()) + ': ' + esc(Object.keys(r.counts).map(function (k) { return r.counts[k] + ' ' + k; }).join(', ')) +
          ' <button type="button" class="btn sm" data-mgundo="' + esc(r.batch) + '">Take it out again</button></li>';
      }).join('') + '</ul></div>';
    }
    return h;
  }
  /* its link in the App's menu (Utilities), like bankimp.js: the side menu only lists screens that have one (help-update, 27 Nov 2026) */
  (function () {
    function link() { var nav = $('.hub-nav'), app = $('#app'); if (!nav || !app || app.getAttribute('data-secs') || $('[data-sec="mig"]', nav)) return;
      nav.appendChild(NS.el('a', { href: '#mig', 'data-sec': 'mig' }, '<span>' + esc(A.T('mig')) + '</span>')); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', link); else link();
  })();
  A.addSection('mig', function () {
    if (!HIST) { NSStore.meta('migrations').then(function (m) { HIST = Array.isArray(m) ? m : []; if (/^#mig/.test(location.hash) && HIST.length) A.show(); }).catch(function () { HIST = []; }); HIST = HIST || []; }
    return html();
  }, function (pane) {
    var fi = $('#mg-dir', pane); if (fi) fi.addEventListener('change', function () { chosen(fi.files); fi.value = ''; });
    var fx = $('#mg-xml', pane); if (fx) fx.addEventListener('change', function () { chosenTally(fx.files); fx.value = ''; });
    pane.addEventListener('change', function (e) {
      var s = e.target, v;
      if (s.name === 'mg-sw') { ST.sw = s.value; ST.files = null; ST.cos = []; ST.pick = {}; ST.prev = null; ST.msg = ''; A.show(); return; }
      if ((v = s.getAttribute('data-mgon'))) { ST.pick[v].on = s.checked; ST.prev = null; return; }
      if ((v = s.getAttribute('data-mgyr'))) { var p = v.split('|'), L = ST.pick[p[0]].years; if (s.checked) { if (L.indexOf(p[1]) < 0) L.push(p[1]); } else ST.pick[p[0]].years = L.filter(function (x) { return x !== p[1]; }); ST.prev = null; return; }
      if ((v = s.getAttribute('data-mginto'))) { ST.pick[v].into = s.value; ST.prev = null; A.show(); return; }
      if ((v = s.getAttribute('data-mgstate'))) { ST.pick[v].state = s.value; ST.prev = null; return; }
    });
    pane.addEventListener('input', function (e) { var v = e.target.getAttribute('data-mgname'); if (v) { ST.pick[v].name = e.target.value; ST.prev = null; } });
    pane.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-mgread')) readCheck();
      if (b.hasAttribute('data-mgsave')) {
        var msg = 'Bring this data into NSBiz now? It can be taken out again later.';
        (NS.ask ? NS.ask(msg) : Promise.resolve(window.confirm(msg))).then(function (y) { if (y) save(); });
      }
      if (b.hasAttribute('data-mgundo')) undo(b.getAttribute('data-mgundo')).then(function () { HIST = null; A.show(); });
    });
  });
  A.mig = { state: function () { return ST; }, chosen: chosen, chosenTally: chosenTally, readCheck: readCheck, save: save, undo: undo };
})();

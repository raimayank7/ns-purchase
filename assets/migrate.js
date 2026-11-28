/* NSBiz: "Bring data from other software" (Utilities, section 'mig'; after bankimp.js). Owner 25 Nov 2026: every business that
   switches to NSBiz brings everything across: masters, openings, every bill and voucher. Evershine first (its folder is read
   in the browser: dbfread.js + evcore.js); Tally from its XML export files (tallyin.js: also the Tally files Marg, Vyapar,
   myBillBook and many others make); ZEEFA from the file its Purchase Import tool makes (zfcore.js); Busy from its own XML export
   (busycore.js); NSBiz's own Excel template or any Excel / CSV sheet, its columns matched by name or by hand and remembered (tplcore.js,
   meta 'implayouts'); and, in NSBiz for Windows, another program's database read only (SQL Server or ODBC: NSDesktopSQL in the
   program, ready query sets in sqlsets.js, settings per business kept by the program).
   Flow: choose the folder (the whole Evershine folder or one company-year folder) -> companies and years found -> for each company:
   a new NSBiz business (or an existing one), its state -> Read and check (nothing saved: counts, and every account compared with
   Evershine's own postings, year by year) -> Bring it in (saved a few at a time) -> it can be taken out again (meta 'migrations').
   Every record carries src = { sw, co, id, batch }: a second run brings only what is new. App screen: English only. */
(function () {
  'use strict';
  var A = window.NSApp, D = window.NSDbf, E = window.NSEver, B = window.NSBooks, TI = window.NSTallyIn, Z = window.NSZeefa, BZ = window.NSBusy, TP = window.NSTpl, SQ = window.NSSqlSets;
  if (!A || !D || !E || !B) return;
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, key = B.key;
  var ST = { sw: 'ev', files: null, cos: [], pick: {}, prev: null, busy: false, msg: '', zf: {}, force: {}, map: null, db: null };
  var SW = { ev: { id: 'evershine', name: 'Evershine' }, tally: { id: 'tally', name: 'Tally' }, zf: { id: 'zeefa', name: 'ZEEFA' }, busy: { id: 'busy', name: 'Busy' },
    xl: { id: 'excel', name: 'the Excel file' }, db: { id: 'database', name: 'the database' } };
  function swOf() { return SW[ST.sw] || SW.ev; }
  /* the other program's figure in a row of a check (each reader names it after its program) */
  function other(r) { return r.evershine != null ? r.evershine : r.tally != null ? r.tally : r.zeefa != null ? r.zeefa : r.busy != null ? r.busy : r.file; }
  function reset() { ST.files = null; ST.cos = []; ST.pick = {}; ST.prev = null; ST.zf = {}; ST.force = {}; ST.map = null; ST.msg = ''; }
  function addCo(co, years, extra) {
    years = years.slice().sort(function (a, b) { return a.year < b.year ? -1 : 1; });
    var have = A.data().biz.filter(function (b) { return b.src && b.src.sw === swOf().id && key(b.src.co) === key(co); })[0];
    ST.cos.push(Object.assign({ co: co, years: years }, extra || {}));
    var open = (ST.sw === 'xl' || ST.sw === 'db') && A.biz && A.biz();   /* a sheet or a database usually adds to the business that is open */
    ST.pick[co] = { on: true, years: years.map(function (y) { return y.id; }), into: have ? have.id : open && open.id ? open.id : 'new', name: have ? have.name : co + ' (from ' + swOf().name.replace(/^the /, '') + ')', state: have ? have.state || '' : '' };
  }

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
  /* ZEEFA: the files the ZEEFA Purchase Import tool made, one per year database (names end "for NSBiz.json") */
  function chosenZf(files) {
    var list = [].slice.call(files || []).filter(function (f) { return /\.json$/i.test(f.name); });
    reset();
    ST.msg = list.length ? 'Reading the files…' : 'Choose the file (or files) the ZEEFA Purchase Import tool made: their names end in "for NSBiz.json".';
    A.show();
    if (!list.length || !Z) return;
    var bad = [];
    Promise.all(list.map(function (f) {
      return f.text().then(function (txt) {
        var J = null; try { J = JSON.parse(txt); } catch (e) { J = null; }
        var I = Z.info(J); if (!I) { bad.push(f.name); return null; }
        ST.zf[I.id] = J; return Object.assign({ dir: f.name }, I);
      });
    })).then(function (found) {
      var by = {};
      found.filter(Boolean).forEach(function (y) { var L = by[y.co] = by[y.co] || []; if (!L.some(function (x) { return x.id === y.id; })) L.push(y); });
      Object.keys(by).forEach(function (co) { addCo(co, by[co]); });
      ST.msg = bad.length ? bad.join(', ') + (bad.length > 1 ? ' are not files' : ' is not a file') + ' made by the ZEEFA Purchase Import tool for NSBiz.' : '';
      A.show();
    }).catch(function (e) { ST.msg = 'Could not read the file: ' + (e && e.message || e); A.show(); });
  }
  /* Busy: the export files (masters + vouchers, one pair per year; several companies or years may be chosen at once) */
  function chosenBusy(files) {
    var list = [].slice.call(files || []).filter(function (f) { return /\.(dat|xml)$/i.test(f.name); });
    reset(); ST.msg = 'Reading the Busy files…'; A.show();
    Promise.all(list.map(function (f) { return f.arrayBuffer().then(function (b) { try { return { f: f, o: BZ.read(b) }; } catch (e) { return { f: f, err: e.message }; } }); })).then(function (R) {
      var by = {}, bad = [];
      R.forEach(function (r) {
        if (r.err || !r.o || !r.o.fy) { bad.push(r.f.name); return; }
        var co = BZ.company(r.f.name) || 'BUSY', y = +r.o.fy.slice(0, 4), yr = y + '-' + String(y + 1).slice(2), id = co + ' ' + yr;
        var c = by[co] = by[co] || {}; (c[id] = c[id] || { id: id, co: co, year: yr, parts: [], names: [] }).parts.push(r.o); c[id].names.push(r.f.name);
      });
      Object.keys(by).forEach(function (co) { addCo(co, Object.keys(by[co]).map(function (k) { return by[co][k]; })); });
      var noV = ST.cos.some(function (c) { return c.years.some(function (y) { return !y.parts.some(function (o) { return o.vouchers.length; }); }); });
      ST.msg = (bad.length ? 'These files are not Busy export files: ' + bad.join(', ') + '. ' : '') +
        (!ST.cos.length ? 'No Busy export file was found. Export the data from Busy as XML and choose both files: the one ending _MSAll.DAT (masters) and the one ending _Vh and a date (vouchers).' :
          noV ? 'No vouchers were found for a year: choose the file ending _Vh and a date as well, or only the masters come across.' : '');
      A.show();
    }).catch(function (e) { ST.msg = 'Could not read the files: ' + (e && e.message || e); A.show(); });
  }

  /* ---------- NSBiz's template, or any Excel / CSV sheet, or a database's rows: all read by tplcore.js ---------- */
  var LAYOUTS = null;   /* remembered column layouts: meta 'implayouts' { signature of the headings: { kind, map } } */
  function layouts() { return LAYOUTS ? Promise.resolve(LAYOUTS) : NSStore.meta('implayouts').then(function (m) { LAYOUTS = m && typeof m === 'object' ? m : {}; return LAYOUTS; }, function () { LAYOUTS = {}; return LAYOUTS; }); }
  function remember(sig, kind, map) {
    return layouts().then(function (L) { if (!sig) return; L[sig] = { kind: kind, map: map, at: Date.now() }; var keys = Object.keys(L); if (keys.length > 100) delete L[keys.sort(function (a, b) { return (L[a].at || 0) - (L[b].at || 0); })[0]]; return NSStore.meta('implayouts', L); });
  }
  /* Excel through the App's own SheetJS copy (as the bank statement import): writing the template, reading any .xlsx / .xls / .csv */
  var XLJS = '/assets/vendor/xlsx-0.20.3.full.min.js';
  function downloadTemplate() {
    if (typeof NS.xlsx !== 'function') return;
    NS.xlsx('NSBiz import template.xlsx', TP.template().map(function (s) { return { name: s[0], rows: s[1] }; }));
  }
  function readBook(f) {
    return NS.loadJs(XLJS, '').then(function () { return f.arrayBuffer(); }).then(function (buf) {
      var csv = /\.(csv|txt)$/i.test(f.name), X = window.XLSX;
      var wb = csv ? X.read(new TextDecoder().decode(buf), { type: 'string', raw: true }) : X.read(buf, { type: 'array', cellDates: false });
      return wb.SheetNames.map(function (n) {
        var rows = X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' });
        return { name: csv ? f.name.replace(/\.[^.]+$/, '') : n, rows: rows.map(function (r) { return r.map(function (c) { return c == null ? '' : String(c).trim(); }); }) };
      });
    });
  }
  /* a book [{ name, rows }] from a file or a database: the sheets it holds, by kind */
  function useBook(co, book, how) {
    return layouts().then(function (L) {
      var D0 = TP.read(book, { layouts: L, force: ST.force });
      var found = D0.found.filter(function (f) { return f.rows; });
      var sum = found.filter(function (f) { return f.kind; }).map(function (f) { return f.rows + ' ' + kindName(f.kind).toLowerCase(); }).join(', ') || 'nothing recognised yet';
      ST.cos = []; ST.pick = {};
      addCo(co, [{ id: 'all', year: how + ': ' + sum }], { book: book, found: D0.found });
      A.show();
    });
  }
  function kindName(k) { var s = TP.SHEETS.filter(function (x) { return x.k === k; })[0]; return s ? s.name : 'Leave out'; }
  function chosenXl(files) {
    var list = [].slice.call(files || []).filter(function (f) { return /\.(xlsx|xls|csv|txt)$/i.test(f.name); });
    reset();
    if (!list.length) { ST.msg = 'Choose an Excel file (.xlsx or .xls) or a CSV file.'; A.show(); return; }
    ST.msg = 'Reading the file…'; A.show();
    Promise.all(list.map(function (f) { return readBook(f).then(function (b) { return b.map(function (s) { return { name: list.length > 1 ? f.name.replace(/\.[^.]+$/, '') + ' · ' + s.name : s.name, rows: s.rows }; }); }); }))
      .then(function (bks) { ST.msg = ''; return useBook(list.map(function (f) { return f.name.replace(/\.[^.]+$/, ''); }).join(' + '), [].concat.apply([], bks), list.length + ' file' + (list.length > 1 ? 's' : '')); })
      .catch(function (e) { ST.msg = /password/i.test(e && e.message || '') ? 'This file is locked with a password: open it in Excel, remove the password and save it, then choose it again.' : 'Could not read the file: ' + (e && e.message || e); A.show(); });
  }
  /* the column screen: which column holds which field, for one sheet; remembered for the next file with the same headings */
  function colsHtml(c) {
    var f = (c.found || []).filter(function (x) { return x.name === ST.map; })[0]; if (!f) return '';
    var kind = (ST.force[f.name] && ST.force[f.name].kind) || f.kind || '', S = TP.SHEETS.filter(function (x) { return x.k === kind; })[0], map = (ST.force[f.name] && ST.force[f.name].map) || f.map || {};
    var heads = f.heads || [], hr = (ST.force[f.name] && ST.force[f.name].row) != null ? ST.force[f.name].row : (f.headRow || 0);
    var h = '<div class="card mg-cols"><h3>Columns of "' + esc(f.name) + '"</h3><p class="soft">Say what this sheet holds and which of its columns is which. NSBiz remembers it for the next file with the same headings.</p>' +
      '<p><label>This sheet holds <select data-mgkind="' + esc(f.name) + '"><option value="">Leave it out</option>' + TP.SHEETS.map(function (x) { return '<option value="' + x.k + '"' + (x.k === kind ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></label>' +
      ' <label>Headings are in row <input type="number" min="1" max="15" value="' + (hr + 1) + '" data-mghrow="' + esc(f.name) + '" style="width:5em"></label></p>';
    if (S) h += '<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">NSBiz field</th><th class="l">Column in the file</th></tr></thead><tbody>' + S.cols.map(function (col) {
      return '<tr><td class="l">' + esc(col.h) + (col.need ? ' <b>*</b>' : '') + '<br><span class="soft">' + esc(col.w || '') + '</span></td><td class="l"><select data-mgcol="' + col.k + '"><option value="">(none)</option>' +
        heads.map(function (hd, i) { return '<option value="' + i + '"' + (map[col.k] === i ? ' selected' : '') + '>' + esc(String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : '') + ': ' + (hd || '(no heading)')) + '</option>'; }).join('') + '</select></td></tr>';
    }).join('') + '</tbody></table></div>';
    return h + '<div class="btns"><button type="button" class="btn primary" data-mgcolsok>Use these columns</button> <button type="button" class="btn" data-mgcolsx>Close</button></div></div>';
  }
  function colsSave(pane) {
    var c = ST.cos[0], f = (c.found || []).filter(function (x) { return x.name === ST.map; })[0]; if (!f) return;
    var kind = $('[data-mgkind]', pane).value, row = Math.max(0, (+$('[data-mghrow]', pane).value || 1) - 1), map = {};
    $$('[data-mgcol]', pane).forEach(function (s) { if (s.value !== '') map[s.getAttribute('data-mgcol')] = +s.value; });
    var sheet = (c.book || []).filter(function (b) { return b.name === f.name; })[0], heads = sheet && sheet.rows[row] || [];
    ST.force[f.name] = kind ? { kind: kind, row: row, map: map, sig: TP.sig(heads), heads: heads } : { kind: '', row: row, map: {}, skip: 1 };
    var keep = kind ? remember(TP.sig(heads), kind, map) : Promise.resolve();
    ST.map = null; ST.prev = null;
    keep.then(function () { return useBook(c.co, c.book, c.years[0].year.split(':')[0]); });
  }

  /* ---------- a database (NSBiz for Windows): settings per business, then a ready query set or tables chosen by hand ---------- */
  var DBX = window.NSDesktopSQL;
  function dbKey() { var b = A.biz && A.biz(); return b && b.id ? 'biz:' + b.id : 'biz:new'; }
  function dbAsk(op, args) { return DBX ? DBX.ask(op, args) : Promise.resolve({ ok: false, error: 'Only in NSBiz for Windows.' }); }
  function dbCfg(pane) {
    var g = function (n) { var e = $('[data-dbf="' + n + '"]', pane); return e ? (e.type === 'checkbox' ? e.checked : e.value.trim()) : ''; };
    var c = { key: dbKey(), name: (A.biz && A.biz() && A.biz().name) || '', kind: g('kind') || 'sqlserver', server: g('server'), database: g('database'), auth: g('auth') || 'windows', user: g('user'), pw: g('pw'), dsn: g('dsn'), extra: g('extra') };
    return c;
  }
  function dbLoad() {
    if (ST.db) return;
    ST.db = { saved: null, cfg: {}, msg: '', dbs: [], tables: null, pick: [], set: '' };
    dbAsk('sources').then(function (r) {
      ST.db.src = r; var mine = (r.saved || []).filter(function (x) { return x.key === dbKey(); })[0];
      if (mine) { ST.db.cfg = mine; ST.db.set = mine.set || ''; }
      else ST.db.cfg = { kind: 'sqlserver', auth: 'windows', server: (r.instances || [])[0] || '' };
      A.show();
    });
  }
  function dbHtml() {
    if (!DBX) return '<p class="sb-note">Reading another program\'s database works in <b>NSBiz for Windows</b> (the program on your computer), because a browser cannot connect to a database. <a href="/desktop/">Get NSBiz for Windows</a>. Meanwhile, most programs can save their data to Excel: choose "Excel file" above.</p>';
    dbLoad();
    var D0 = ST.db, c = D0.cfg || {}, src = D0.src || {}, odbc = c.kind === 'odbc';
    var h = '<div class="mg-db"><p class="soft">NSBiz only reads: one question (SELECT) at a time, and anything it asks is undone at once. The settings are kept on this computer for this business; the password is locked with Windows\' own protection.</p>' +
      '<div class="mg-dbf"><label>Kind <select data-dbf="kind"><option value="sqlserver"' + (!odbc ? ' selected' : '') + '>SQL Server</option><option value="odbc"' + (odbc ? ' selected' : '') + '>ODBC (MySQL, PostgreSQL, Access...)</option></select></label>';
    if (!odbc) h += '<label>Server <input data-dbf="server" list="mg-inst" value="' + esc(c.server || '') + '" placeholder="PC-NAME\\SQLEXPRESS"></label><datalist id="mg-inst">' + (src.instances || []).map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>' +
      '<label>Login <select data-dbf="auth"><option value="windows"' + (c.auth !== 'sql' ? ' selected' : '') + '>Windows login</option><option value="sql"' + (c.auth === 'sql' ? ' selected' : '') + '>SQL Server login</option></select></label>';
    else h += '<label>Data source (DSN) <select data-dbf="dsn"><option value="">Choose</option>' + (src.dsns || []).map(function (x) { return '<option value="' + esc(x.name) + '"' + (x.name === c.dsn ? ' selected' : '') + '>' + esc(x.name + ' (' + x.driver + ')') + '</option>'; }).join('') + '</select></label>' +
      '<label>or a connection string <input data-dbf="extra" value="' + esc(c.extra || '') + '" placeholder="Driver={...};Server=...;Database=..."></label>';
    h += '<label>User <input data-dbf="user" value="' + esc(c.user || '') + '" autocomplete="off"></label><label>Password <input data-dbf="pw" type="password" autocomplete="new-password" placeholder="' + (c.hasPw ? 'saved (leave empty to keep)' : '') + '"></label>';
    if (!odbc) h += '<label>Database <input data-dbf="database" list="mg-dbs" value="' + esc(c.database || '') + '"></label><datalist id="mg-dbs">' + (D0.dbs || []).map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>';
    h += '</div><div class="btns"><button type="button" class="btn" data-db="test">Test connection</button>' + (!odbc ? ' <button type="button" class="btn" data-db="dbs">List databases</button>' : '') + ' <button type="button" class="btn" data-db="save">Save for this business</button></div>';
    if (D0.msg) h += '<p class="sb-note">' + esc(D0.msg) + '</p>';
    var sets = (SQ ? SQ.SETS : []).filter(function (x) { return x.kind === (odbc ? 'odbc' : 'sqlserver'); });
    h += '<h4>What to read</h4><p><label><select data-db-set><option value="">Tables I choose</option>' + sets.map(function (x) { return '<option value="' + x.id + '"' + (D0.set === x.id ? ' selected' : '') + '>' + esc(x.name) + ' (ready set)</option>'; }).join('') + '</select></label></p>';
    var cur = SQ && D0.set ? SQ.byId(D0.set) : null;
    if (cur) h += '<p class="soft">' + esc(cur.note) + ' The ready set reads parties, items, sale and purchase bills, receipts and payments. It was written from ' + esc(cur.name) + '\'s published tables and has not been tried on a real company yet: if a part fails, its message shows and you can choose the tables yourself.</p>';
    else {
      h += '<p class="soft">Choose the tables (or views) that hold parties, items, bills or receipts and payments; after reading, match their columns with Columns.</p>';
      if (!D0.tables) h += '<button type="button" class="btn" data-db="tables">Show the tables</button>';
      else h += '<div class="mg-dbt">' + D0.tables.slice(0, 2000).map(function (t, i) { var nm = (t.schema ? t.schema + '.' : '') + t.name; return '<label><input type="checkbox" data-dbt="' + esc(nm) + '"' + (D0.pick.indexOf(nm) >= 0 ? ' checked' : '') + '> ' + esc(nm) + (t.view ? ' <span class="soft">(view)</span>' : '') + '</label>'; }).join('') + '</div>';
    }
    h += '<div class="btns"><button type="button" class="btn primary" data-db="read">Read the data</button></div></div>';
    return h;
  }
  function dbRead(pane) {
    var cfg = dbCfg(pane), D0 = ST.db, cur = SQ && D0.set ? SQ.byId(D0.set) : null, jobs = [];
    if (cur) Object.keys(cur.sheets).forEach(function (nm) { jobs.push([nm, cur.sheets[nm]]); });
    else D0.pick.forEach(function (t) {
      var p = t.split('.'), q = cfg.kind === 'odbc' ? p.map(function (x) { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(x) ? x : '"' + x.replace(/"/g, '') + '"'; }).join('.') : p.map(function (x) { return '[' + x.replace(/[\[\]]/g, '') + ']'; }).join('.');
      jobs.push([t, 'SELECT * FROM ' + q]);
    });
    if (!jobs.length) { D0.msg = 'Choose a ready set or at least one table.'; A.show(); return; }
    reset(); ST.busy = true; ST.msg = 'Reading the database…'; A.show();
    var book = [], errs = [];
    jobs.reduce(function (pr, j) {
      return pr.then(function () {
        var el = $('.mg-read'); if (el) el.textContent = 'Reading ' + j[0] + '…';
        return dbAsk('query', { cfg: cfg, sql: j[1], max: 300000 }).then(function (r) {
          if (!r.ok) { errs.push(j[0] + ': ' + r.error); return; }
          book.push({ name: j[0], rows: [r.cols.map(String)].concat(r.rows.map(function (row) { return row.map(function (v) { return v == null ? '' : String(v); }); })) });
          if (r.more) errs.push(j[0] + ': only the first 300,000 rows were read.');
        });
      });
    }, Promise.resolve()).then(function () {
      ST.busy = false; ST.msg = errs.join(' ');
      return useBook(cfg.database || cfg.dsn || 'database', book, (cur ? cur.name : 'tables') + ' from ' + (cfg.database || cfg.dsn || cfg.server));
    });
  }
  function dbClick(op, pane) {
    var cfg = dbCfg(pane), D0 = ST.db;
    D0.cfg = Object.assign({}, D0.cfg, cfg, { pw: '' , hasPw: D0.cfg.hasPw || !!cfg.pw });
    if (op === 'test') { D0.msg = 'Connecting…'; A.show(); dbAsk('test', { cfg: cfg }).then(function (r) { D0.msg = r.ok ? 'Connected: SQL / database version ' + r.version + (r.database ? ', database ' + r.database : '') + '.' : r.error; A.show(); }); }
    if (op === 'dbs') dbAsk('databases', { cfg: cfg }).then(function (r) { if (r.ok) { D0.dbs = r.list; D0.msg = r.list.length + ' databases found: type or pick one.'; } else D0.msg = r.error; A.show(); });
    if (op === 'save') dbAsk('save', { cfg: Object.assign({}, cfg, { set: D0.set, keepPw: !cfg.pw }) }).then(function (r) { D0.msg = r.ok ? 'Saved for this business on this computer.' : r.error; if (r.ok) D0.cfg.hasPw = D0.cfg.hasPw || !!cfg.pw; A.show(); });
    if (op === 'tables') { D0.msg = 'Reading the list of tables…'; A.show(); dbAsk('tables', { cfg: cfg }).then(function (r) { if (r.ok) { D0.tables = r.list; D0.msg = ''; } else D0.msg = r.error; A.show(); }); }
    if (op === 'read') dbRead(pane);
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
      if (c.book) return new Promise(function (r) { setTimeout(r, 30); }).then(function () {
        /* the NSBiz template, any sheet, or a database's rows */
        return layouts().then(function (L) {
          var Dt = TP.read(c.book, { layouts: L, force: ST.force }), partiesHave = {};
          A.data().party.forEach(function (p) { partiesHave[key(p.name)] = p; });
          var opt = { co: c.co, sw: swOf().id, seller: seller, totals: B.itemTotals, postings: B.postings, noOpening: !firstEver, have: have, partiesHave: partiesHave };
          var P = TP.plan(Dt, opt);
          var C = TP.check(P, B.postings, B.accounts(P.docs, seller.name));
          years.push({ y: c.years[0], P: P, C: { rows: [], ok: C.rows.length - C.bad, bad: C.bad }, TC: C, CR: null });
          out.push({ co: c.co, biz: biz, seller: seller, years: years });
        });
      });
      if (ST.sw === 'busy') return pickYears.reduce(function (pr, y, yi) {
        return pr.then(function () {
          var Bz = BZ.combine(y.parts);
          if (!seller.state) { seller.state = BZ.ownState(Bz); ST.pick[c.co].state = ST.pick[c.co].state || seller.state; }
          var noOp = !(firstEver && yi === 0), P = BZ.plan(Bz, { co: y.id, seller: seller, totals: B.itemTotals, postings: B.postings, noOpening: noOp, have: have });
          P.docs.forEach(function (d) { have[d.src.id] = 1; });
          all = all.concat(P.docs);
          var C = BZ.check(Bz, P, B.accounts(P.docs, seller.name), { noOpening: noOp, postings: B.postings });
          years.push({ y: y, P: P, C: C, CR: null, unbal: BZ.balanced(Bz, P).bad.length });
        });
      }, Promise.resolve()).then(function () { out.push({ co: c.co, biz: biz, seller: seller, years: years }); });
      if (ST.sw === 'zf') { var known = {}; return pickYears.reduce(function (pr, y, yi) {
        return pr.then(function () {
          var T = ST.zf[y.id];
          if (!seller.state) { seller.state = Z.ownState(T); ST.pick[c.co].state = ST.pick[c.co].state || seller.state; }
          var later = !(firstEver && yi === 0), opt = { co: y.id, seller: seller, totals: B.itemTotals, postings: B.postings, noOpening: later, have: have, known: known };
          if (later) opt.prior = B.accounts(all, seller.name);   /* a later year's start journal, accounts kept by name */
          var P = Z.plan(T, opt);
          Z.known(P, known);
          P.docs.forEach(function (d) { have[d.src.id] = 1; });
          var ys = P.docs.filter(function (d) { return /^YS\//.test(d.src.id); });
          var CR = later ? Z.carry(T, P, B.accounts(all.concat(ys), seller.name)) : null;
          all = all.concat(P.docs);
          var C = Z.check(T, P, B.accounts(P.docs.filter(function (d) { return !/^YS\//.test(d.src.id); }), seller.name), { noOpening: later });
          years.push({ y: y, P: P, C: C, CR: CR });
        });
      }, Promise.resolve()).then(function () { out.push({ co: c.co, biz: biz, seller: seller, years: years }); }); }
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
            banks.forEach(function (b) { if (!bl.some(function (x) { return key(x.name) === key(b.name); })) bl.push({ name: b.name, acc: b.acc || '', ifsc: b.ifsc || '', branch: '', imp: batch }); });   /* imp: taken out with the import */
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
      HIST = null; A.show();   /* read the list of imports again, so Take it out again shows at once */
    }).catch(function (e) { ST.busy = false; HIST = null; ST.msg = 'Stopped while saving: ' + (e && e.message || e) + '. What was saved can be taken out again below.'; A.show(); });
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
          /* the bank accounts and party groups this import added (nothing else in them by now: everything of the import is gone) */
          return Promise.all([NSStore.meta('banks'), NSStore.meta('groups')]).then(function (mm) {
            var BK = mm[0] && typeof mm[0] === 'object' ? mm[0] : null, Gr = mm[1] && typeof mm[1] === 'object' ? mm[1] : null, jobs2 = [];
            if (BK) { var ch = false; Object.keys(BK).forEach(function (k) { if (!Array.isArray(BK[k])) return; var n = BK[k].filter(function (x) { return x.imp !== batch; }); if (n.length !== BK[k].length) { BK[k] = n; ch = true; } if (r.newBiz && k === r.biz) { delete BK[k]; ch = true; } }); if (ch) jobs2.push(NSStore.meta('banks', BK)); }
            if (Gr && Array.isArray(Gr.party)) { var n2 = Gr.party.filter(function (g) { return !(g.src && g.src.batch === batch); }); if (n2.length !== Gr.party.length) { Gr.party = n2; jobs2.push(NSStore.meta('groups', Gr)); } }
            return Promise.all(jobs2);
          });
        }).then(function () {
          return NSStore.meta('migrations', m.filter(function (x) { return x.batch !== batch; }));
        }).then(function () { ST.busy = false; ST.msg = 'The import of ' + r.co + ' was taken out.'; A.show(); },
          function (e) { ST.busy = false; ST.msg = 'Stopped while taking it out: ' + (e && e.message || e) + '. Press Take it out again to finish.'; A.show(); });
      });
    });
  }

  /* ---------- screen ---------- */
  var HIST = null;
  /* the sheets of an Excel file or a database, what each holds, and the button to match its columns */
  function sheetsHtml() {
    var c = ST.cos[0]; if (!c || !c.found) return '';
    var rows = c.found.filter(function (f) { return f.rows || f.kind; });
    var h = '<h4>What the ' + (ST.sw === 'db' ? 'tables' : 'sheets') + ' hold</h4><div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">' + (ST.sw === 'db' ? 'Table' : 'Sheet') + '</th><th class="n">Rows</th><th class="l">Holds</th><th></th></tr></thead><tbody>' +
      rows.map(function (f) {
        var miss = (f.missing || []).length ? ' <span class="bad">missing: ' + esc(f.missing.join(', ')) + '</span>' : '';
        return '<tr><td class="l">' + esc(f.name) + '</td><td class="n">' + f.rows + '</td><td class="l">' + (f.kind ? esc(kindName(f.kind)) + (f.remembered ? ' <span class="soft">(remembered layout)</span>' : '') : '<span class="soft">not recognised: left out</span>') + miss + '</td>' +
          '<td><button type="button" class="btn sm" data-mgmap="' + esc(f.name) + '">Columns…</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    if (ST.map) h += colsHtml(c);
    return h;
  }
  function html() {
    var h = '<div class="pane-hd"><h2>' + esc(A.T('mig')) + '</h2></div>';
    h += '<p class="hint">Moving to NSBiz from other accounting software? Bring your parties, items, opening balances and every past bill and voucher across. The other software\'s files are only read, never changed; nothing is saved until you press Bring it in, and an import can be taken out again.</p>';
    if (ST.msg) h += '<p class="sb-note mg-read">' + esc(ST.msg) + '</p>';
    h += '<div class="card"><h3>1. The software you used</h3><div class="mg-sw">' +
      [['ev', 'Evershine', '', 1], ['tally', 'Tally', 'also Marg, Vyapar, myBillBook and others that export to Tally', TI], ['zf', 'ZEEFA', '', Z], ['busy', 'Busy', '', BZ],
        ['xl', 'Excel or CSV file', 'NSBiz\'s own template, or a sheet saved from any program', TP], ['db', 'A database', 'SQL Server or ODBC: SAP Business One, ERPNext, Odoo and others', TP && window.NSDesktopSQL]].filter(function (s) { return s[0] !== 'db' || s[3]; }).map(function (s) {   /* a database only in NSBiz for Windows (a browser cannot reach one) */
        var ready = !!s[3];
        return '<label class="mg-opt' + (ready ? '' : ' soft') + '"><input type="radio" name="mg-sw" value="' + s[0] + '"' + (ready ? '' : ' disabled') + (ST.sw === s[0] ? ' checked' : '') + '> ' + esc(s[1]) + (s[2] ? ' <span class="soft">(' + esc(s[2]) + ')</span>' : '') + '</label>';
      }).join('') + '</div>' +
      (ST.sw === 'xl' ?
        '<h3>2. The file</h3><p class="soft">Use NSBiz\'s own template (it says what to type in every column), or a sheet saved from your old program: NSBiz finds the heading row and matches the columns by their names, and asks for the ones it cannot guess. Several files can be chosen at once.</p>' +
        '<div class="btns"><button type="button" class="btn" data-mgtpl>Download the NSBiz template (Excel)</button> <label class="btn primary" for="mg-xl">Choose the Excel or CSV file</label></div><input type="file" id="mg-xl" class="sr" accept=".xlsx,.xls,.csv,.txt" multiple></div>' :
      ST.sw === 'db' ? '<h3>2. The database</h3>' + dbHtml() + '</div>' :
      ST.sw === 'zf' ?
        '<h3>2. Its files for NSBiz</h3><p class="soft">ZEEFA keeps its books in a password-locked file that a browser cannot open. On the computer with ZEEFA, open the <b>ZEEFA Purchase Import</b> tool, choose a year\'s database and press <b>More… › Make a file for NSBiz</b> (it only reads ZEEFA, never changes it). Do it for each year you want, then choose all those files here at once. Each file holds that year\'s accounts and bills, so keep it as safe as your books.</p>' +
        '<label class="btn primary" for="mg-zf">Choose the ZEEFA files</label><input type="file" id="mg-zf" class="sr" accept=".json,application/json" multiple></div>' :
      ST.sw === 'busy' ?
        '<h3>2. Busy\'s export files</h3><p class="soft">Busy keeps its books locked, so they come across through Busy\'s own export: in Busy export the masters and the vouchers of the year as <b>XML</b>. Busy writes two files, one ending <b>_MSAll.DAT</b> (masters) and one ending <b>_Vh</b> and a date (vouchers). Choose both (hold Ctrl to pick more than one); several years or companies can be chosen at once. The files are only read.</p>' +
        '<label class="btn primary" for="mg-busy">Choose the Busy files</label><input type="file" id="mg-busy" class="sr" accept=".dat,.DAT,.xml" multiple></div>' :
      ST.sw === 'tally' ?
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
        }).join('') + '</tbody></table></div>' + sheetsHtml() + '<p class="soft">' + (ST.sw === 'xl' || ST.sw === 'db' ? 'Everything comes into the business chosen here: a new one, or one you already have (parties and items it already has are kept, not repeated).' : ST.sw === 'tally' ?  'The ledgers\' opening balances come across on the first day; vouchers keep their own dates.' : 'Years of one company come into one business, oldest first: the first year\'s opening balances come across, later years carry forward in NSBiz.') + '</p>' +
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
            rows.slice(0, 200).map(function (r) { return '<tr><td class="l">' + esc(r.name) + (r.open ? ' <span class="soft">(opening)</span>' : '') + '</td><td class="n">' + money(other(r)) + '</td><td class="n">' + money(r.nsbiz) + '</td><td class="n">' + money(r.diff) + '</td></tr>'; }).join('') + '</tbody></table></div></details>';
        });
      });
      ST.prev.forEach(function (R) { R.years.forEach(function (Y) {
        if (Y.TC) {   /* the template / sheet check: every total of the file against what NSBiz will post */
          h += '<h4>Balance check before saving</h4><div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">What</th><th class="n">In the file</th><th class="n">NSBiz will post</th><th class="n">Difference</th></tr></thead><tbody>' +
            Y.TC.rows.map(function (r) { return '<tr><td class="l">' + esc(r.name) + '</td><td class="n">' + money(r.file) + '</td><td class="n">' + money(r.nsbiz) + '</td><td class="n' + (Math.abs(r.diff) > 0.01 ? ' bad' : '') + '">' + money(r.diff) + '</td></tr>'; }).join('') +
            '<tr><td class="l">Opening balances: Dr (with stock) / Cr</td><td class="n">' + money(Y.TC.openings.dr) + '</td><td class="n">' + money(Y.TC.openings.cr) + '</td><td class="n' + (Math.abs(Y.TC.openings.gap) > 0.01 ? ' bad' : '') + '">' + money(Y.TC.openings.gap) + '</td></tr></tbody></table></div>' +
            (Math.abs(Y.TC.openings.gap) > 0.01 ? '<p class="sb-note">The opening balances do not add up: Dr and Cr differ by ' + money(Y.TC.openings.gap) + '. NSBiz keeps the difference in "Opening balance difference" so the books balance; correct it there or in the file.</p>' : '') +
            (Y.TC.gaps ? '<p class="sb-note">' + Y.TC.gaps + ' bill' + (Y.TC.gaps > 1 ? 's' : '') + ' total differs from its lines by more than Rs 1 (the file\'s total is kept): ' + esc(Y.P.warn.filter(function (w) { return w.w === 'billgap'; }).slice(0, 8).map(function (w) { return w.id + ' (' + w.sheet + ' row ' + w.row + ')'; }).join(', ')) + '.</p>' : '') +
            '<p class="' + (Y.TC.balanced ? 'ok' : 'bad') + '">' + (Y.TC.balanced ? 'The books balance (Dr = Cr).' : 'The books do not balance.') + '</p>';
          var PR = Y.P.probs || [];
          if (PR.length) h += '<details open><summary>' + PR.length + ' row' + (PR.length > 1 ? 's' : '') + ' left out or to look at</summary><ul class="mg-probs">' + PR.slice(0, 100).map(function (p) { return '<li>' + esc(p.sheet + ', row ' + p.row + ': ' + p.msg) + '</li>'; }).join('') + '</ul></details>';
          return;
        }
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
    var fz = $('#mg-zf', pane); if (fz) fz.addEventListener('change', function () { chosenZf(fz.files); fz.value = ''; });
    var fb = $('#mg-busy', pane); if (fb) fb.addEventListener('change', function () { chosenBusy(fb.files); fb.value = ''; });
    var fl = $('#mg-xl', pane); if (fl) fl.addEventListener('change', function () { chosenXl(fl.files); fl.value = ''; });
    if (pane._mgWired) return; pane._mgWired = 1;   /* the App keeps the same panel and calls this after every drawing: listen once */
    pane.addEventListener('change', function (e) {
      var s = e.target, v;
      if (s.name === 'mg-sw') { ST.sw = s.value; reset(); A.show(); return; }
      if (s.getAttribute('data-dbf') === 'kind' && ST.db) { ST.db.cfg = Object.assign({}, ST.db.cfg, dbCfg(pane), { kind: s.value }); ST.db.set = ''; ST.db.tables = null; ST.db.pick = []; A.show(); return; }
      if (s.getAttribute('data-dbf') === 'auth' && ST.db) { ST.db.cfg = Object.assign({}, ST.db.cfg, dbCfg(pane)); A.show(); return; }
      if (s.hasAttribute('data-db-set') && ST.db) { ST.db.cfg = Object.assign({}, ST.db.cfg, dbCfg(pane)); ST.db.set = s.value; A.show(); return; }
      if ((v = s.getAttribute('data-dbt')) && ST.db) { ST.db.pick = ST.db.pick.filter(function (x) { return x !== v; }); if (s.checked) ST.db.pick.push(v); return; }
      if ((v = s.getAttribute('data-mgkind'))) { var f0 = (ST.cos[0].found || []).filter(function (x) { return x.name === v; })[0]; ST.force[v] = Object.assign({ row: f0 ? f0.headRow || 0 : 0, map: {} }, ST.force[v] || {}, { kind: s.value, map: s.value === (f0 && f0.kind) ? f0.map : {} }); A.show(); return; }
      if ((v = s.getAttribute('data-mghrow'))) { var c0 = ST.cos[0], sh = (c0.book || []).filter(function (b) { return b.name === v; })[0], rw = Math.max(0, (+s.value || 1) - 1);
        var f1 = (c0.found || []).filter(function (x) { return x.name === v; })[0]; if (f1 && sh) { f1.heads = sh.rows[rw] || []; f1.headRow = rw; } ST.force[v] = Object.assign({}, ST.force[v] || { kind: f1 && f1.kind, map: {} }, { row: rw }); A.show(); return; }
      if ((v = s.getAttribute('data-mgon'))) { ST.pick[v].on = s.checked; ST.prev = null; return; }
      if ((v = s.getAttribute('data-mgyr'))) { var p = v.split('|'), L = ST.pick[p[0]].years; if (s.checked) { if (L.indexOf(p[1]) < 0) L.push(p[1]); } else ST.pick[p[0]].years = L.filter(function (x) { return x !== p[1]; }); ST.prev = null; return; }
      if ((v = s.getAttribute('data-mginto'))) { ST.pick[v].into = s.value; ST.prev = null; A.show(); return; }
      if ((v = s.getAttribute('data-mgstate'))) { ST.pick[v].state = s.value; ST.prev = null; return; }
    });
    pane.addEventListener('input', function (e) { var v = e.target.getAttribute('data-mgname'); if (v) { ST.pick[v].name = e.target.value; ST.prev = null; } });
    pane.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-mgread')) readCheck();
      if (b.hasAttribute('data-mgtpl')) downloadTemplate();
      if (b.hasAttribute('data-mgmap')) { ST.map = b.getAttribute('data-mgmap'); A.show(); }
      if (b.hasAttribute('data-mgcolsx')) { ST.map = null; A.show(); }
      if (b.hasAttribute('data-mgcolsok')) colsSave(pane);
      if (b.hasAttribute('data-db')) dbClick(b.getAttribute('data-db'), pane);
      if (b.hasAttribute('data-mgsave')) {
        var msg = 'Bring this data into NSBiz now? It can be taken out again later.';
        (NS.ask ? NS.ask(msg) : Promise.resolve(window.confirm(msg))).then(function (y) { if (y) save(); });
      }
      if (b.hasAttribute('data-mgundo')) undo(b.getAttribute('data-mgundo')).then(function () { HIST = null; A.show(); });
    });
  });
  A.mig = { state: function () { return ST; }, readBook: readBook, chosen: chosen, chosenTally: chosenTally, chosenZf: chosenZf, chosenBusy: chosenBusy, chosenXl: chosenXl, useBook: useBook, readCheck: readCheck, save: save, undo: undo };
})();

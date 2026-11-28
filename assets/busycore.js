/* NSBusy: Busy (Busy 21, Busy Infosoft) -> NSBiz records. Pure, no screen; runs in the App ("Bring data from other software")
   and in Node (tests, the Office PC check). Busy keeps its books in a password-locked database that only Busy itself opens, so
   nothing here touches it: the business exports its data from Busy (Data export, XML) and chooses the two files here.

   What Busy's export holds (read from a test company exported on the Office PC, 25 Nov 2026; _import-study/busy-export.md):
   - two files, iso-8859-1 XML with a .DAT extension, root <BusyData FinYear="01-04-2026">:
     <company>_<date>_MSAll.DAT = masters, <company>_<date>_Vh<dd><mm><yyyy>.DAT = vouchers (plus the masters they use).
   - masters: AccountGroups/AccountGroup (Name, PrimaryGroup, ParentGroupName), Accounts/Account (Name, ParentGroup, Address1-3,
     StateName, GSTNo, ITPAN, Mobile, TelNo, Email, TypeOfDealerGST, TDS flags), Items/Item (Name, ParentGroup, MainUnit, AltUnit,
     ConversionFactor, HSNCode, TaxCategory, TaxRateLocal / TaxRateLocal1 / TaxRateCentral, PurchaseAccount, SalesAccount),
     Units/Unit (Name, UQC), BillSundries/BillSundry (Name, BSNature, Type, accounts), SaleTypes / PurchaseTypes (L/GST-18% ...).
   - vouchers, one section per kind: Sales/Sale, Purcs/Purchase, SlRts/SaleReturn, PrRts/PurchaseReturn, Rcpts/Receipt,
     Pymts/Payment, Jrnls/Journal, Cntrs/Contra. Head: VchSeriesName, Date (dd-mm-yyyy), VchNo, STPTName (sale / purchase type),
     MasterName1 (party account), MasterName2 (material centre), PartyName, GSTNo, PurchaseBillNo, tmpVchCode.
     ItemEntries/ItemDetail (ItemName, UnitName, Qty, Price, Amt, ItemHSNCode, ItemTaxCategory), BillSundries/BSDetail (BSName,
     PercentVal, PercentOperatedOn, Amt), AccEntries/AccDetail (AccountName, AmountType, AmtMainCur, BillRefs...) = Busy's own
     ledger postings of the voucher, and bill-wise references (RefNo, Method, Value1, DueDate) on the party line or in
     PendingBillDetails/BillDetail.
   Not seen yet in a real export (ask the owner for one month before relying on them): opening balances, TDS on purchases, batch and
   serial-number items, Busy's own Debit / Credit Note vouchers. They are read where the field names make it plain and reported.

   How it comes into NSBiz (the same way as Evershine, evcore.js):
   - parties (Sundry Debtors / Creditors and any account a bill is made to), items, party groups, banks.
   - Sale / Purchase / Sale Return / Purchase Return -> NSBiz invoice / purchase bill / credit note / purchase return with their
     item lines, so GST returns and stock work; bill sundries other than GST become charges; the bill total is Busy's.
   - a bill posts exactly what Busy posted: any difference (a charge on another account, paise) is a small journal with the bill.
   - every other voucher (Receipt, Payment, Journal, Contra and any kind not listed) -> a journal of Busy's own posting lines, party
     lines settling the bills Busy's bill-wise references name.
   Every record carries src = { sw: 'busy', co, id } and a fixed id, so a second run brings only what is new. */
(function (G) {
  'use strict';
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function r2(n) { return Math.round((+n + Number.EPSILON) * 100) / 100; }
  function num(v) { var n = +String(v == null ? '' : v).replace(/,/g, ''); return isFinite(n) ? n : 0; }
  function t(s) { return String(s == null ? '' : s).trim(); }
  function title(s) { s = t(s).replace(/\s+/g, ' '); return s && s === s.toUpperCase() && /[A-Z]/.test(s) ? s.toLowerCase().replace(/(^|[\s.\-(\/&])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }) : s; }
  function hash(s) { var h1 = 5381, h2 = 52711; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); h1 = (h1 * 33) ^ c; h2 = (h2 * 31) ^ c; } return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36); }

  /* ---------- reading the XML (a small reader of our own: it must run in Node too) ---------- */
  function decode(input) {
    if (typeof input === 'string') return input;
    var u8 = input instanceof Uint8Array ? input : new Uint8Array(input), head = '';
    for (var i = 0; i < Math.min(200, u8.length); i++) head += String.fromCharCode(u8[i]);
    var enc = (head.match(/encoding\s*=\s*["']([^"']+)/i) || [])[1] || 'iso-8859-1';
    if (/utf-?8/i.test(enc) && typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(u8);
    var out = [], CH = 8192; for (var j = 0; j < u8.length; j += CH) out.push(String.fromCharCode.apply(null, u8.subarray(j, j + CH)));
    return out.join('');
  }
  function ent(s) {
    return s.indexOf('&') < 0 ? s : s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, function (m, e) {
      var l = e.toLowerCase(); if (l === 'lt') return '<'; if (l === 'gt') return '>'; if (l === 'amp') return '&'; if (l === 'quot') return '"'; if (l === 'apos') return "'";
      return String.fromCharCode(l[1] === 'x' ? parseInt(l.slice(2), 16) : +l.slice(1));
    });
  }
  function parse(src) {
    var s = decode(src), root = { n: '#', a: {}, c: [], t: '' }, st = [root], last = 0, m;
    var re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!(?!\[)[^>]*>|<(\/?)([A-Za-z_][\w.\-:]*)([^>]*?)(\/?)>/g;
    while ((m = re.exec(s))) {
      if (m.index > last) st[st.length - 1].t += ent(s.slice(last, m.index));
      last = re.lastIndex;
      if (m[1] != null) { st[st.length - 1].t += m[1]; continue; }
      if (!m[3]) continue;
      if (m[2]) { for (var k = st.length - 1; k > 0; k--) if (st[k].n === m[3]) { st.length = k; break; } continue; }
      var a = {}, am, are = /([\w.\-:]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
      while ((am = are.exec(m[4]))) a[am[1]] = ent(am[3] != null ? am[3] : am[4]);
      var node = { n: m[3], a: a, c: [], t: '' };
      st[st.length - 1].c.push(node);
      if (!m[5]) st.push(node);
    }
    return root.c.filter(function (x) { return x.n === 'BusyData'; })[0] || root.c[0] || root;
  }
  function kids(n, name) { return (n && n.c || []).filter(function (x) { return x.n === name; }); }
  function kid(n, name) { return kids(n, name)[0] || null; }
  /* the shallowest element of that name below n (not looking inside the parts named in stop) */
  function bfs(n, name, stop) {
    var q = (n && n.c || []).slice();
    while (q.length) { var x = q.shift(); if (x.n === name) return x; if (!stop || !stop[x.n]) q = q.concat(x.c); }
    return null;
  }
  function all(n, name, out) { out = out || []; (n && n.c || []).forEach(function (x) { if (x.n === name) out.push(x); all(x, name, out); }); return out; }
  function txt(n) { return n ? t(n.t) : ''; }
  var PARTS = { ItemEntries: 1, AccEntries: 1, BillSundries: 1, PendingBillDetails: 1, BillDetails: 1, BillRefs: 1, VchOtherInfoDetails: 1, BatchEntries: 1, ItemSerialNoEntries: 1, ParamStockEntries: 1 };
  function head(v, name) { var d = kid(v, name); return d ? txt(d) : txt(bfs(v, name, PARTS)); }
  function rec(n) { var o = {}; (n.c || []).forEach(function (x) { if (!x.c.length && !(x.n in o)) o[x.n] = t(x.t); else if (x.c.length) (x.c).forEach(function (y) { if (!y.c.length && !(y.n in o)) o[y.n] = t(y.t); }); }); return o; }
  function isoDate(s) {
    s = t(s); var m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/); if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : '';
  }

  /* one export file -> { fy, masters: {...}, vouchers: [...] } */
  var VSEC = { Sale: 'sale', Purchase: 'buy', SaleReturn: 'sret', PurchaseReturn: 'pret', Receipt: 'in', Payment: 'out', Journal: 'jv', Contra: 'contra' };
  function read(src) {
    var R = parse(src), o = { fy: isoDate(R.a && R.a.FinYear), groups: [], accounts: [], items: [], units: [], sundries: [], vouchers: [], sections: {} };
    (R.c || []).forEach(function (sec) {
      var rows = sec.c || []; o.sections[sec.n] = rows.length;
      if (sec.n === 'AccountGroups') rows.forEach(function (g) { o.groups.push(rec(g)); });
      else if (sec.n === 'Accounts') rows.forEach(function (a) { o.accounts.push(rec(a)); });
      else if (sec.n === 'Items') rows.forEach(function (a) { o.items.push(rec(a)); });
      else if (sec.n === 'Units') rows.forEach(function (a) { o.units.push(rec(a)); });
      else if (sec.n === 'BillSundries') rows.forEach(function (a) { o.sundries.push(rec(a)); });
      else rows.forEach(function (v) { if (kid(v, 'AccEntries') || kid(v, 'ItemEntries')) o.vouchers.push(voucher(v)); });
    });
    return o;
  }
  function collectRefs(n, party) {
    var out = [];
    (function walk(x) {
      (x.c || []).forEach(function (y) {
        if (kid(y, 'RefNo')) out.push({ party: txt(kid(y, 'MasterName1')) || party || '', no: txt(kid(y, 'RefNo')), method: txt(kid(y, 'Method')), amt: Math.abs(num(txt(kid(y, 'Value1')))), due: isoDate(txt(kid(y, 'DueDate'))) });
        else walk(y);
      });
    })(n);
    return out;
  }
  function voucher(v) {
    var party = head(v, 'MasterName1');
    var o = { vt: v.n, as: VSEC[v.n] || 'jv', date: isoDate(head(v, 'Date')), no: head(v, 'VchNo'), series: head(v, 'VchSeriesName'), code: txt(kid(v, 'tmpVchCode')),
      party: party, pname: head(v, 'PartyName'), gstin: head(v, 'GSTNo').toUpperCase(), stpt: head(v, 'STPTName'), pbill: head(v, 'PurchaseBillNo'),
      narr: head(v, 'Narration') || head(v, 'ShortNar') || head(v, 'LongNar') || head(v, 'Remarks'), items: [], bs: [], acc: [], refs: [] };
    var ie = kid(v, 'ItemEntries');
    kids(ie, 'ItemDetail').forEach(function (d) {
      var r = rec(d);
      o.items.push({ name: t(r.ItemName), unit: t(r.UnitName), qty: num(r.Qty || r.QtyMainUnit), price: num(r.Price), list: num(r.ListPrice), amt: num(r.Amt), net: num(r.NettAmount),
        hsn: t(r.ItemHSNCode), cat: t(r.ItemTaxCategory), batch: (kid(d, 'BatchEntries') || { c: [] }).c.length, serial: (kid(d, 'ItemSerialNoEntries') || { c: [] }).c.length });
    });
    kids(kid(v, 'BillSundries'), 'BSDetail').forEach(function (d) { var r = rec(d); o.bs.push({ name: t(r.BSName), pct: num(r.PercentVal), on: num(r.PercentOperatedOn), amt: num(r.Amt) }); });
    kids(kid(v, 'AccEntries'), 'AccDetail').forEach(function (d) {
      var nm = txt(kid(d, 'AccountName'));
      o.acc.push({ name: nm, type: txt(kid(d, 'AmountType')), amt: num(txt(kid(d, 'AmtMainCur'))), narr: txt(kid(d, 'ShortNar')) || txt(kid(d, 'Narration')), refs: collectRefs(kid(d, 'BillRefs') || kid(d, 'BillDetails') ? { c: kids(d, 'BillRefs').concat(kids(d, 'BillDetails')) } : { c: [] }, nm) });
    });
    o.refs = collectRefs({ c: kids(v, 'PendingBillDetails') }, party);
    o.tds = !!bfs(v, 'TDSAmt', null) || !!bfs(v, 'TDSAmount', null);
    return o;
  }
  /* both files (any order) -> one set: masters from both (the voucher file repeats the ones it uses) and the vouchers */
  function combine(list) {
    var B = { fy: '', groups: {}, accounts: {}, items: {}, units: {}, sundries: {}, vouchers: [], sections: {}, files: list.length };
    list.forEach(function (o) {
      if (!B.fy || o.fy && o.fy < B.fy) B.fy = o.fy;
      o.groups.forEach(function (g) { B.groups[key(g.Name)] = Object.assign(B.groups[key(g.Name)] || {}, g); });
      o.accounts.forEach(function (a) { B.accounts[key(a.Name)] = Object.assign(B.accounts[key(a.Name)] || {}, a); });
      o.items.forEach(function (a) { B.items[key(a.Name)] = Object.assign(B.items[key(a.Name)] || {}, a); });
      o.units.forEach(function (a) { B.units[key(a.Name)] = a; });
      o.sundries.forEach(function (a) { B.sundries[key(a.Name)] = a; });
      Object.keys(o.sections).forEach(function (k) { B.sections[k] = (B.sections[k] || 0) + o.sections[k]; });
    });
    var seen = {};
    list.forEach(function (o) { o.vouchers.forEach(function (v) { var id = vid(v); if (seen[id]) return; seen[id] = 1; B.vouchers.push(v); }); });
    B.vouchers.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return B;
  }
  function vid(v) { return v.vt + '/' + (v.code || [v.series, v.date, v.no].join('|')); }
  /* the kind of an export file from its name: masters (..._MSAll.DAT), vouchers (..._Vh<date>.DAT), '' */
  function fileKind(name) { var n = String(name || ''); return /_MSAll\.DAT$/i.test(n) ? 'masters' : /_Vh\d{6,8}\.DAT$/i.test(n) ? 'vouchers' : /\.(dat|xml)$/i.test(n) ? 'other' : ''; }
  function company(name) { var m = String(name || '').replace(/^.*[\\\/]/, '').match(/^(.*?)_\d{8}_(MSAll|Vh\d+)\.DAT$/i); return m ? m[1] : ''; }

  /* ---------- Dr / Cr of a posting line ----------
     AccDetail has AmountType and AmtMainCur. Which AmountType value is a debit, and whether amounts are signed, is learnt from the
     export itself: the party line of a Sale is a debit, of a Purchase a credit. */
  function calibrate(B) {
    var dr = {}, cr = {}, signed = false, sgn = { p: 0, n: 0 };
    B.vouchers.forEach(function (v) {
      var pos = 0, neg = 0; v.acc.forEach(function (a) { if (a.amt > 0) pos++; if (a.amt < 0) neg++; }); if (pos && neg) signed = true;
      if (v.as !== 'sale' && v.as !== 'buy') return;
      v.acc.forEach(function (a) {
        if (key(a.name) !== key(v.party)) return;
        var isDr = v.as === 'sale', ty = a.type.toLowerCase();
        (isDr ? dr : cr)[ty] = ((isDr ? dr : cr)[ty] || 0) + 1;
        if (a.amt) sgn[(a.amt > 0) === isDr ? 'p' : 'n']++;
      });
    });
    var best = '', bn = 0; Object.keys(dr).forEach(function (k) { if (dr[k] > bn) { bn = dr[k]; best = k; } });
    var crBest = ''; bn = 0; Object.keys(cr).forEach(function (k) { if (cr[k] > bn) { bn = cr[k]; crBest = k; } });
    return { drType: best, crType: crBest, signed: signed, drPositive: sgn.p >= sgn.n, learnt: !!(best || crBest) };
  }
  function signer(C) {
    return function (a) {
      var ty = a.type.toLowerCase(), v = Math.abs(a.amt);
      if (C.drType && ty === C.drType) return v;
      if (C.crType && ty === C.crType) return -v;
      if (/^(dr|d|debit)$/.test(ty)) return v;
      if (/^(cr|c|credit)$/.test(ty)) return -v;
      if (C.signed) return C.drPositive ? a.amt : -a.amt;
      if (C.drType && ty !== C.drType) return -v;
      if (C.crType && ty !== C.crType) return v;
      return ty === '1' ? v : -v;
    };
  }

  /* ---------- accounts: Busy account -> NSBiz account ---------- */
  var GRP = [   /* Busy's own reserved group names (a business's own sub-groups sit under them) */
    [/^sundry debtors$/, 'debtors'], [/^sundry creditors$/, 'creditors'], [/^cash-?\s*in-?\s*hand$/, 'cash'],
    [/^bank o\/?d( a\/?c| account)?$|^bank overdraft/, 'bankod'], [/^bank accounts?$/, 'bank'], [/^duties (&|and) taxes$/, 'tax'],
    [/^sales?( accounts?)?$/, 'sales'], [/^purchases?( accounts?)?$/, 'purchases'], [/^expenses\b/, 'exp'], [/^income\b|^revenue accounts?$/, 'inc'],
    [/^(capital accounts?|reserves (&|and) surplus|profit (&|and) loss)/, 'cap'], [/^(loans \(liability\)|secured loans|unsecured loans)$/, 'loan'], [/^fixed assets$/, 'fa'],
    [/^(provisions|current liabilities)/, 'ocl'], [/^stock-in-hand$/, 'stock'], [/./, 'oca']
  ];
  var SAME = { 'sales-return': 'sales', 'purchase-return': 'purchases' };
  function accountsMap(B, partyAcc) {
    var out = {}, used = {}, gr = B.groups;
    function chain(g) { var L = [], seen = {}; g = key(g); while (g && !seen[g]) { seen[g] = 1; L.push(g); g = gr[g] ? key(gr[g].ParentGroupName) : ''; } return L; }
    function kindOf(g) { var L = chain(g); for (var i = 0; i < L.length; i++) for (var j = 0; j < GRP.length - 1; j++) if (GRP[j][0].test(L[i])) return { kind: GRP[j][1], near: L[0], at: L[i] }; return { kind: 'oca', near: L[0] || '', at: '' }; }
    var fold = Object.assign({}, SAME);
    Object.keys(B.accounts).forEach(function (k) {
      var a = B.accounts[k], nm = title(a.Name) || a.Name, G2 = kindOf(a.ParentGroup), lower = nm.toLowerCase(), m;
      var gst = lower.match(/\b(cgst|sgst|igst|utgst|cess)\b/);
      if (G2.kind === 'cash') m = { k: 'cash' };
      else if (G2.kind === 'bank' || G2.kind === 'bankod') m = { k: 'bank:' + key(nm), bank: nm };
      else if (/round\s*-?\s*off|rounding/.test(lower)) m = { k: 'round-off' };
      else if (gst && !/payable on|expense|interest|late fee|penalty/.test(lower)) {
        var g = gst[1], io = /input|itc|purc|recoverable|\bin\b/.test(lower) ? 'in' : /output|sale|payable|\bout\b/.test(lower) ? 'out' : '';
        if (g === 'cess') m = { k: 'ocl:gst cess' };
        else { m = { k: 'gst-' + (io || 'out') + '-' + g }; if (!io) { m.both = 1; fold['gst-in-' + g] = 'gst-out-' + g; } }
      }
      else if (/\btds\b/.test(lower)) m = { k: G2.kind === 'oca' ? 'tds-receivable' : 'tds-payable' };
      else if (/\btcs\b/.test(lower)) m = { k: G2.kind === 'oca' ? 'tcs-receivable' : 'tcs-payable' };
      else if (G2.kind === 'debtors' || G2.kind === 'creditors' || partyAcc[k]) {
        var role = G2.kind === 'creditors' || G2.kind !== 'debtors' && partyAcc[k] === 'buy' ? 'supplier' : 'customer';
        if (used[key(nm)]) nm = nm + ' (Busy)'; used[key(nm)] = 1;
        var custom = G2.near && G2.near !== G2.at && (G2.kind === 'debtors' || G2.kind === 'creditors') ? title(gr[G2.near] && gr[G2.near].Name || G2.near) : '';
        m = { k: 'p:' + key(nm), party: nm, role: role, side: role === 'supplier' ? 'pay' : 'recv', grp: custom };
      }
      else if (G2.kind === 'sales') m = { k: 'sales' };
      else if (G2.kind === 'purchases') m = { k: 'purchases' };
      else if (G2.kind === 'exp') m = { k: 'exp:' + key(nm) };
      else if (G2.kind === 'inc') m = { k: 'inc:' + key(nm) };
      else if (G2.kind === 'cap') m = { k: 'cap:' + key(nm) };
      else if (G2.kind === 'loan') m = { k: 'loan:' + key(nm) };
      else if (G2.kind === 'fa') m = { k: 'fa:' + key(nm) };
      else if (G2.kind === 'ocl' || G2.kind === 'tax') m = { k: 'ocl:' + key(nm) };
      else m = { k: 'oca:' + key(nm) };
      m.name = nm; m.group = G2.kind; out[k] = m;
    });
    return { map: out, fold: fold };
  }
  function lineOf(m, dr, cr, narr) {
    if (!m) return null;
    var l = m.party ? { a: 'party', party: m.party, side: m.side } : { a: m.k };
    l.dr = r2(dr); l.cr = r2(cr); if (narr) l.narr = narr;
    return l;
  }

  /* states by name (Busy keeps the state name; NSBiz the GST state code) */
  var STATES = { 'jammu and kashmir': '01', 'himachal pradesh': '02', punjab: '03', chandigarh: '04', uttarakhand: '05', uttaranchal: '05', haryana: '06', delhi: '07',
    rajasthan: '08', 'uttar pradesh': '09', bihar: '10', sikkim: '11', 'arunachal pradesh': '12', nagaland: '13', manipur: '14', mizoram: '15', tripura: '16', meghalaya: '17',
    assam: '18', 'west bengal': '19', jharkhand: '20', odisha: '21', orissa: '21', chhattisgarh: '22', 'madhya pradesh': '23', gujarat: '24', 'daman and diu': '26',
    'dadra and nagar haveli and daman and diu': '26', 'dadra and nagar haveli': '26', maharashtra: '27', karnataka: '29', goa: '30', lakshadweep: '31', kerala: '32',
    'tamil nadu': '33', puducherry: '34', pondicherry: '34', 'andaman and nicobar islands': '35', telangana: '36', 'andhra pradesh': '37', ladakh: '38' };
  function stateCode(name, gstin) { var g = t(gstin); if (/^\d{2}[A-Z]/.test(g)) return g.slice(0, 2); return STATES[key(name).replace(/&/g, 'and').replace(/\s+/g, ' ')] || ''; }

  /* our own state: the state of the parties on bills that carry CGST / SGST, the most common */
  function ownState(B) {
    var M = accountsMap(B, {}).map, c = {};
    B.vouchers.forEach(function (v) {
      if (v.as !== 'sale' && v.as !== 'buy') return;
      var intra = v.acc.some(function (a) { var m = M[key(a.name)]; return m && /-(cgst|sgst|utgst)$/.test(m.k); }); if (!intra) return;
      var a = B.accounts[key(v.party)] || {}, s = stateCode(a.StateName, v.gstin || a.GSTNo); if (s) c[s] = (c[s] || 0) + 1;
    });
    return Object.keys(c).sort(function (x, y) { return c[y] - c[x]; })[0] || '';
  }

  var GSTRATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 12, 18, 28, 40];
  function nearRate(r) { var b = 0, d = 1e9; GSTRATES.forEach(function (g) { if (Math.abs(g - r) < d) { d = Math.abs(g - r); b = g; } }); return d < 0.6 ? b : r2(r); }
  function itemRate(mi, cat) {
    if (mi) { var c = num(mi.TaxRateCentral); if (c) return c; var l = num(mi.TaxRateLocal) + num(mi.TaxRateLocal1); if (l) return l; }
    var m = String(cat || '').match(/(\d+(?:\.\d+)?)\s*%/); return m ? +m[1] : null;
  }

  /* ---------- the plan ---------- */
  function plan(B, opts) {
    opts = opts || {};
    var co = opts.co || 'busy', seller = opts.seller || { name: opts.bizName || co }, have = opts.have || {}, tot = opts.totals, warn = [];
    var partyAcc = {}; B.vouchers.forEach(function (v) { if (/^(sale|buy|sret|pret)$/.test(v.as) && v.items.length && v.party) partyAcc[key(v.party)] = partyAcc[key(v.party)] || (v.as === 'buy' || v.as === 'pret' ? 'buy' : 'sale'); });
    var AM = accountsMap(B, partyAcc), M = AM.map, FOLD = AM.fold, C = calibrate(B), sig = signer(C);
    function F(k) { return FOLD[k] || k; }
    function acct(name) {
      var k = key(name); if (M[k]) return M[k]; if (!k) return null;
      var m = { k: 'oca:busy ' + k, name: title(name) }; M[k] = m; warn.push({ w: 'noacc', name: name }); return m;
    }
    var src = function (id) { return { sw: 'busy', co: co, id: id }; };
    var idOf = function (id) { return 'bz' + hash(co + '|' + id); };
    var out = { parties: [], items: [], groups: [], banks: [], docs: [], warn: warn, counts: {}, skipped: 0, map: M, fold: FOLD, cal: C, unread: {} };
    function add(d) { if (have[d.src.id]) { out.skipped++; return false; } d.id = d.id || idOf(d.src.id); d.seller = seller; d.app = 1; out.docs.push(d); out.counts[d.type] = (out.counts[d.type] || 0) + 1; return true; }

    /* masters */
    var grpSeen = {};
    Object.keys(M).forEach(function (k) {
      var m = M[k], a = B.accounts[k] || {};
      if (m.party) {
        var gid = '';
        if (m.grp) { gid = 'gbz-' + key(co + ' ' + m.grp).replace(/[^a-z0-9]+/g, '-'); if (!grpSeen[gid]) { grpSeen[gid] = 1; out.groups.push({ id: gid, name: m.grp, under: m.side === 'pay' ? 'creditors' : 'debtors', src: src('grp/' + gid) }); } }
        var gstin = t(a.GSTNo).toUpperCase();
        out.parties.push({ name: m.party, role: m.role, group: gid || (m.side === 'pay' ? 'creditors' : 'debtors'), addr: [a.Address1, a.Address2, a.Address3, a.Address4].map(t).filter(Boolean).join(', '),
          city: title(a.AreaName || a.City || ''), pin: t(a.PINCode || a.PinCode || ''), state: stateCode(a.StateName, gstin), gstin: gstin, pan: t(a.ITPAN).toUpperCase(),
          phone: t(a.Mobile || a.TelNo), email: t(a.Email), src: src('acc/' + k) });
      }
      if (m.bank) out.banks.push({ k: m.k, name: m.bank, src: src('acc/' + k) });
    });
    var items = {};
    Object.keys(B.items).forEach(function (k) {
      var it = B.items[k], nm = t(it.Name); if (!nm) return;
      var x = { desc: nm, hsn: t(it.HSNCode) || t(it.HSNCodeGST), unit: t(it.MainUnit), gst: itemRate(it, it.TaxCategory) || 0,
        kind: /^(true|1|y)/i.test(t(it.DoNotMaintainStkBal)) ? 'service' : 'goods', src: src('item/' + k) };
      items[k] = x; out.items.push(x);
    });
    /* opening balances are not in the test export: field names that look like one are read and reported */
    var OPF = /^(op(ening)?bal(ance)?|opbal)$/i;
    function openingOf(a) { var f = Object.keys(a).filter(function (n) { return OPF.test(n); })[0]; if (!f) return null; out.unread.opening = (out.unread.opening || 0) + 1; var v = num(a[f]); if (!v) return 0;
      var ty = Object.keys(a).filter(function (n) { return /^op.*type$|^opbaltype$|^drcr$/i.test(n); })[0]; return ty ? sig({ type: a[ty], amt: v }) : (C.signed && !C.drPositive ? -v : v); }

    /* bill-wise references: <party>|<ref no.> -> the bill they belong to */
    var refBill = {};
    function regRef(party, no, billId) { if (t(no)) refBill[key(party) + '|' + key(no)] = refBill[key(party) + '|' + key(no)] || billId; }
    function allocOf(party, refs) {
      var L = []; (refs || []).forEach(function (r) { var b = refBill[key(r.party || party) + '|' + key(r.no)]; if (b && r.amt) L.push({ id: b, amt: r2(r.amt), no: r.no }); }); return L.length ? L : null;
    }
    function busyLines(v) { var o = {}; v.acc.forEach(function (a) { var m = acct(a.name); if (!m) return; var k = F(SAME[m.k] || m.k); o[k] = r2((o[k] || 0) + sig(a)); }); return o; }
    function partyLine(v) { return v.acc.filter(function (a) { return key(a.name) === key(v.party); })[0] || null; }

    var asDoc = {};
    B.vouchers.forEach(function (v, vi) {
      var id = vid(v), pm = acct(v.party), want = busyLines(v);
      if (v.items.some(function (x) { return x.batch; })) out.unread.batch = (out.unread.batch || 0) + 1;
      if (v.items.some(function (x) { return x.serial; })) out.unread.serial = (out.unread.serial || 0) + 1;
      if (v.tds) out.unread.tds = (out.unread.tds || 0) + 1;
      var isBill = /^(sale|buy|sret|pret)$/.test(v.as) && v.items.length && pm && (pm.party || pm.k === 'cash' || pm.bank);
      if (isBill) { bill(v, id, pm, want); return; }
      if (/^(sale|buy|sret|pret)$/.test(v.as) && v.items.length) warn.push({ w: 'billparty', id: id });
      journal(v, id, want);
    });

    function bill(v, id, pm, want) {
      var a = B.accounts[key(v.party)] || {}, gstin = (v.gstin || t(a.GSTNo)).toUpperCase(), sale = v.as === 'sale' || v.as === 'sret';
      var cashy = !pm.party, pname = pm.party || title(v.pname) || (sale ? 'Cash sale' : 'Cash purchase');
      var party = { name: pname, addr: [a.Address1, a.Address2].map(t).filter(Boolean).join(', '), state: stateCode(a.StateName, gstin), gstin: gstin, phone: t(a.Mobile || a.TelNo) };
      if (cashy) party = { name: pname, state: gstin ? gstin.slice(0, 2) : '', gstin: gstin };
      /* GST as Busy posted it */
      var gst = { cgst: 0, sgst: 0, igst: 0 }, sgn = sale ? -1 : 1, retSign = v.as === 'sret' || v.as === 'pret' ? -1 : 1;
      Object.keys(want).forEach(function (k) { var mm = k.match(/^gst-(?:in|out)-(cgst|sgst|utgst|igst)$/); if (mm) gst[mm[1] === 'utgst' ? 'sgst' : mm[1]] += want[k] * sgn * retSign; });
      var tax = r2(gst.cgst + gst.sgst + gst.igst), inter = gst.igst > 0.004, pl = partyLine(v), total = r2(pl ? Math.abs(sig(pl)) : 0);
      var sumAmt = v.items.reduce(function (s, x) { return s + (x.amt || x.qty * x.price); }, 0), scale = 1;
      if (tax > 0 && sumAmt && Math.abs(sumAmt + tax - total) > 1 && Math.abs(sumAmt - total) <= 1) scale = (total - tax) / sumAmt;   /* prices with GST included */
      var its = v.items.map(function (x) {
        var amt = r2((x.amt || x.qty * x.price) * scale), qty = x.qty || 1, rate = Math.abs(qty * x.price - amt) < 0.01 ? x.price : Math.round(amt / qty * 10000) / 10000, mi = B.items[key(x.name)];
        var g = itemRate(mi, x.cat); if (g == null) g = sumAmt ? nearRate(tax / (sumAmt * scale) * 100) : 0;
        if (!tax) g = 0;
        return { desc: (mi && t(mi.Name)) || x.name || 'Item', hsn: x.hsn || (mi && (t(mi.HSNCode) || t(mi.HSNCodeGST))) || '', qty: qty, unit: x.unit || (mi && t(mi.MainUnit)) || '', rate: rate, disc: '', gst: g };
      });
      /* bill sundries other than GST and round off: charges; their sign and whether GST falls on them is chosen so NSBiz's total is Busy's */
      var other = v.bs.filter(function (b) { var s = B.sundries[key(b.name)] || {}; return !/\b(c|s|i|ut)?gst\b|cess|round/i.test(b.name) && !/gst|tax|round/i.test(t(s.BSNature)); });
      var base = { no: v.no || v.pbill || '', date: v.date, notes: v.narr, items: its, charges: [], round: false, src: src(id) };
      var d;
      if (v.as === 'sale') d = Object.assign(base, { type: 'invoice', kind: 'tax', buyer: party, pos: party.state, rc: false, withGst: true, status: 'unpaid', comp: true, copies: 1, paper: 'a4', design: 'classic' });
      else if (v.as === 'buy' || v.as === 'pret') d = Object.assign(base, { type: 'pbill', kind: v.as === 'pret' ? 'return' : 'bill', buyer: party, noGst: false, no: v.as === 'buy' ? v.pbill || v.no || '' : v.no || '', vno: v.no || '' });
      else d = Object.assign(base, { type: 'note', kind: 'credit', side: 'sale', reason: 'ret', buyer: party, orig: '' });
      var own = t(seller.state);
      if (own) { var st = party.state, isIn = !st || st === own; if (inter && isIn) party.posFix = '97'; else if (!inter && tax && !isIn) party.posFix = own; }
      if (party.posFix) { if (d.type === 'invoice' || d.type === 'note') d.pos = party.posFix; else d.buyer = Object.assign({}, party, { state: party.posFix }); }
      delete party.posFix; if (d.buyer) delete d.buyer.posFix;
      if (other.length && tot) {
        var best = null;
        (other.length === 1 ? [1, -1] : [0]).forEach(function (sg) {
          [0, 'main'].forEach(function (cg) {
            var ch = other.map(function (b) { var s = B.sundries[key(b.name)] || {}, neg = sg ? sg < 0 : /sub|less|minus|deduct|disc|rebate/i.test(t(s.Type) + ' ' + b.name); return { name: title(b.name), amt: r2(Math.abs(b.amt) * (neg ? -1 : 1)), gst: cg }; });
            var x = tot(Object.assign({}, d, { charges: ch, total: null })), score = Math.abs(x.total - total) + Math.abs(x.cgst + x.sgst + x.igst - tax);
            if (!best || score < best.s - 0.001) best = { s: score, ch: ch };
          });
        });
        d.charges = best.ch;
      } else if (other.length) d.charges = other.map(function (b) { return { name: title(b.name), amt: r2(b.amt), gst: 0 }; });
      if (tot && total) {
        var got = tot(Object.assign({}, d, { total: null })).total, gap = r2(total - got);
        if (Math.abs(gap) > 1) { d.charges.push({ name: 'Adjustment (Busy)', amt: gap, gst: 0 }); warn.push({ w: 'billgap', id: id, amt: gap }); }
      }
      d.total = total || (tot ? tot(Object.assign({}, d, { total: null })).total : 0);
      if (cashy && v.as === 'sale') { d.status = 'paid'; d.payMode = pm.bank ? 'bank' : 'cash'; if (pm.bank) d.bacct = pm.k; }
      d.id = idOf(id);
      /* the bill's own reference, and what a return settles */
      var refs = v.refs.concat(pl ? pl.refs : []);
      if (v.as === 'sale' || v.as === 'buy') { refs.forEach(function (r) { regRef(pname, r.no, d.id); }); if (!refs.length) regRef(pname, v.no, d.id); }
      else { var al = allocOf(pname, refs); if (al) d.alloc = al; }
      if (add(d)) { if (opts.postings) fixBill(d, id, want); } else if (have[id + '#fix']) out.skipped++;
    }

    /* a bill must post exactly what Busy posted (its AccDetail lines): NSBiz's own lines for it are compared account by account,
       and any difference becomes a small journal dated with the bill ("Busy posting of X") */
    function fixBill(d, id, want) {
      var got = {}, pk = {};
      opts.postings(d).forEach(function (l) { var k = F(SAME[l.a] || l.a); got[k] = r2((got[k] || 0) + l.dr - l.cr); });
      if (d.buyer && d.buyer.name) pk['p:' + key(d.buyer.name)] = { party: d.buyer.name, side: d.type === 'pbill' ? 'pay' : 'recv' };
      var lines = [], keys = {};
      Object.keys(want).concat(Object.keys(got)).forEach(function (k) { keys[k] = 1; });
      Object.keys(keys).forEach(function (k) {
        var diff = r2((want[k] || 0) - (got[k] || 0)); if (Math.abs(diff) < 0.005) return;
        var m = null; Object.keys(M).some(function (c) { if (F(SAME[M[c].k] || M[c].k) === k) { m = M[c]; return true; } return false; });
        var ln = m ? lineOf(m, diff > 0 ? diff : 0, diff < 0 ? -diff : 0) : pk[k] ? { a: 'party', party: pk[k].party, side: pk[k].side, dr: diff > 0 ? diff : 0, cr: diff < 0 ? -diff : 0 } : { a: k, dr: diff > 0 ? diff : 0, cr: diff < 0 ? -diff : 0 };
        lines.push(ln);
      });
      if (!lines.length) return;
      var sum = lines.reduce(function (a, l) { return r2(a + l.dr - l.cr); }, 0);
      if (Math.abs(sum) >= 0.005) lines.push({ a: 'round-off', dr: sum < 0 ? -sum : 0, cr: sum > 0 ? sum : 0 });
      out.fixed = (out.fixed || 0) + 1;
      add({ type: 'jv', no: (d.no || id) + ' (Busy)', date: d.date, lines: lines, narr: 'Busy posting of ' + (d.no || id), fixOf: d.id, src: src(id + '#fix') });
    }

    /* every other voucher: a journal of Busy's own posting lines; a party line settles the bills its references name */
    function journal(v, id, want) {
      var jid = idOf(id), lines = [], sum = 0;
      v.acc.forEach(function (a) {
        var amt = sig(a); if (!amt) return; sum = r2(sum + amt);
        var m = acct(a.name), l = lineOf(m, amt > 0 ? amt : 0, amt < 0 ? -amt : 0, a.narr); if (!l) return;
        if (l.a === 'party') {
          var makesBill = (l.side === 'recv') === (amt > 0), i = lines.length;
          if (makesBill) { a.refs.forEach(function (r) { regRef(m.party, r.no, jid + '#' + i); }); }
          else { var al = allocOf(m.party, a.refs); if (al) l.alloc = al; }
        }
        lines.push(l);
      });
      if (!lines.length) return;
      if (Math.abs(sum) >= 0.005) { warn.push({ w: 'unbalanced', id: id, amt: sum }); lines.push({ a: 'ocl:busy difference', dr: sum < 0 ? -sum : 0, cr: sum > 0 ? sum : 0 }); }
      add({ type: 'jv', id: jid, no: v.no || (v.series ? v.series + '/' : '') + v.vt, date: v.date, lines: lines, narr: v.narr || v.vt, bztype: v.vt, src: src(id) });
    }

    /* opening balances (only for the first year brought into a business), when the export carries them */
    if (!opts.noOpening) {
      var od = B.fy || (B.vouchers[0] && B.vouchers[0].date) || '', rest = [];
      Object.keys(B.accounts).forEach(function (k) {
        var amt = openingOf(B.accounts[k]); if (!amt) return;
        var m = M[k], sid = 'OP/' + k;
        if (m.party) add({ type: 'ob', date: od, side: amt > 0 ? 'recv' : 'pay', amount: r2(Math.abs(amt)), buyer: { name: m.party }, no: '', total: r2(Math.abs(amt)), src: src(sid) });
        else if (m.k === 'cash' || m.bank) add({ type: 'ob', date: od, side: m.k === 'cash' ? 'cash' : 'bank', bacct: m.k === 'cash' ? '' : m.k, amount: r2(amt), buyer: { name: '' }, no: '', total: r2(Math.abs(amt)), src: src(sid) });
        else rest.push(lineOf(m, amt > 0 ? amt : 0, amt < 0 ? -amt : 0));
      });
      if (rest.length) {
        var s2 = rest.reduce(function (s, l) { return r2(s + l.dr - l.cr); }, 0);
        if (s2) rest.push({ a: 'opening', dr: s2 < 0 ? -s2 : 0, cr: s2 > 0 ? s2 : 0 });
        add({ type: 'jv', no: 'OP', date: od, lines: rest, narr: 'Opening balances from Busy', src: src('OP/ledgers') });
      }
    }
    out.docs.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return out;
  }

  /* ---------- the check: every NSBiz account against Busy's own postings (AccDetail of every voucher, + openings when read)
     books = NSBooks.accounts(docs, biz) of the imported records. -> { rows: [{ k, name, busy, nsbiz, diff }], ok, bad } */
  function check(B, P, books0, opts) {
    opts = opts || {};
    var sig = signer(P.cal), F = function (k) { return P.fold[k] || k; }, bz = {}, names = {}, books = {};
    Object.keys(books0).forEach(function (k) { var c = F(SAME[k] || k); books[c] = r2((books[c] || 0) + books0[k]); });
    B.vouchers.forEach(function (v) { v.acc.forEach(function (a) { var m = P.map[key(a.name)]; if (!m) return; var k = F(SAME[m.k] || m.k); bz[k] = r2((bz[k] || 0) + sig(a)); names[k] = names[k] || m.name; }); });
    if (!opts.noOpening) P.docs.forEach(function (d) {   /* openings came from the masters, so they count on Busy's side too */
      if (!/^OP\//.test(d.src.id)) return;
      (opts.postings ? opts.postings(d) : []).forEach(function (l) { var k = F(SAME[l.a] || l.a); if (k === 'opening') return; bz[k] = r2((bz[k] || 0) + l.dr - l.cr); });
    });
    var rows = [], ok = 0, bad = 0, keys = {};
    Object.keys(bz).concat(Object.keys(books)).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      if (k === 'opening' || k === 'ocl:busy difference') return;
      var e = r2(bz[k] || 0), n = r2(books[k] || 0), d = r2(n - e); if (!e && !n) return;
      if (Math.abs(d) < 0.01) ok++; else bad++;
      rows.push({ k: k, name: names[k] || k, busy: e, nsbiz: n, diff: d });
    });
    rows.sort(function (a, b) { return Math.abs(b.diff) - Math.abs(a.diff); });
    return { rows: rows, ok: ok, bad: bad };
  }
  /* Dr = Cr inside every voucher (a sign that Dr / Cr was read the right way round) */
  function balanced(B, P) {
    var sig = signer(P ? P.cal : calibrate(B)), bad = [];
    B.vouchers.forEach(function (v) { var s = v.acc.reduce(function (a, x) { return r2(a + sig(x)); }, 0); if (Math.abs(s) >= 0.01) bad.push({ id: vid(v), off: s }); });
    return { n: B.vouchers.length, bad: bad };
  }

  var API = { read: read, parse: parse, combine: combine, plan: plan, check: check, balanced: balanced, ownState: ownState, calibrate: calibrate, accountsMap: accountsMap, fileKind: fileKind, company: company, isoDate: isoDate, stateCode: stateCode };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.NSBusy = API;
})(typeof window !== 'undefined' ? window : this);

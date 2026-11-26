/* NSEver: Evershine (FoxPro accounting software, company-year folders fa\DATA<yyyy>\<CO><yyyy>) -> NSBiz records. Pure, no screen;
   runs in the App ("Bring data from other software") and in Node (tests, the Office PC check). Tables come in already read
   (NSDbf.read(...).records), keyed by lower-case table name: T = { account: [...], allentry: [...], gstsb: [...], ... }.

   What Evershine keeps (learnt from its own files on the Office PC, 25 Nov 2026; _import-study/evershine-codes.md):
   - allentry = every ledger line: VOUCHER (type), DATE, SNO (a voucher = rows sharing VOUCHER + DATE + SNO), ACCODE (account),
     ACCODE1 (other side), DRCR (signed: debit +, credit -), MEMO. OP = opening balances on the first day of the year.
     Cash vouchers (C, CR, CP) and a few bank vouchers are one-sided there: the cash / bank side is not a row.
   - setup: VOUCHER -> name, head table (DBF1) and line table (DBF2). Bills (head + lines) join on DATE + SNO:
     S8 tax invoice gstsb/gstsbdt, S9 bill of supply gstsb2/gstsbdt2, SE export gstsb3/gstsbdt3, P9 GST purchase gstpb/gstpbdt,
     P8 import / tax-free purchase gstpb2/gstpbdt2, RS sale return gstsr/gstsrdt, D8 credit note gstsr2/gstsrdt2,
     RP purchase return gstpr/gstprdt, DR debit note gstdr/gstdrdt, RE GST expenses gstexps/gstexpdt.
     Head: SAMOUNT1 taxable, SGST_TAX / CGST_TAX / IGST_TAX / CESS_TAX, S1_FLD1..12 charges, ADJUST, SAMOUNT bill total,
     LOCAL_CENT 1 in-state / 2 other state. Lines: ITEMCODE, PARTI, HSN_CODE, QTY / KGS / PCS, UNIT, RATE, AMOUNT1 taxable,
     SGST_R / CGST_R / IGST_R rates and _A amounts.
   - account: ACCODE, ACNAME, address, CITY, PIN, STATE_CODE, GSTIN, PANGIR, TYPE (13 debtors, 4 creditors, 11 cash / bank,
     9 fixed assets, 16 current assets, 10 deposits, 1 capital, 3 unsecured loans, 6 payables, 7 customer advances,
     8 other liabilities, 17 purchase / expense, 18 sale / income, 19 other), GROUP / GROUP1 = annexure headings (SNO, ANNE_NAME).
   - gstscode / gstpcode: per GST rate the output / input tax accounts (SGST_C, CGST_C, IGST_C) and the sales / purchase
     account (SGST_S in-state, IGST_S other state). item: ITCODE, ITNAME, GST_HSNC, S_UNIT 'CODE-NAME', rates, OPGQTY / OPGVALUE.

   How it comes into NSBiz:
   - parties (debtors, creditors, and any account a bill is made to), items, party groups from the annexure headings, banks.
   - bills -> NSBiz documents with their item lines (invoice / export invoice / purchase bill / return / note; GST expenses as
     expense records), so GST returns and stock work. A bill whose NSBiz total differs from Evershine's SAMOUNT gets an
     "Adjustment (Evershine)" charge for the difference, so party balances stay exact.
   - every other voucher (bank, cash, journal, and any kind not listed above) -> a journal entry with Evershine's own ledger
     lines, so every account comes out the same; one-sided cash / bank vouchers get their missing cash / bank line.
   - OP -> opening balances: parties and cash / bank as NSBiz openings, other accounts in one opening journal.
   Every record carries src = { sw: 'evershine', co, id } so a second run brings only what is new. */
(function (G) {
  'use strict';
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function r2(n) { return Math.round((+n + Number.EPSILON) * 100) / 100; }
  function num(v) { var n = +v; return isFinite(n) ? n : 0; }
  function t(s) { return String(s == null ? '' : s).trim(); }
  function title(s) { s = t(s).replace(/\s+/g, ' '); return s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s.\-(\/&])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }).replace(/\b(Pvt|Ltd|Llp|Co)\b\.?/g, function (m) { return m; }) : s; }

  /* default voucher kinds when setup.dbf is missing */
  var DOCS = {
    S8: { as: 'sale', kind: 'tax', head: 'gstsb', line: 'gstsbdt' }, S9: { as: 'sale', kind: 'supply', head: 'gstsb2', line: 'gstsbdt2' },
    SE: { as: 'export', kind: 'expwop', head: 'gstsb3', line: 'gstsbdt3' },
    P9: { as: 'buy', head: 'gstpb', line: 'gstpbdt' }, P8: { as: 'buy', head: 'gstpb2', line: 'gstpbdt2' },
    RS: { as: 'sret', head: 'gstsr', line: 'gstsrdt' }, D8: { as: 'sret', head: 'gstsr2', line: 'gstsrdt2' },
    RP: { as: 'pret', head: 'gstpr', line: 'gstprdt' }, DR: { as: 'pdeb', head: 'gstdr', line: 'gstdrdt' },
    RE: { as: 'exp', head: 'gstexps', line: 'gstexpdt' }
  };
  var CASHV = { C: 1, CR: 1, CP: 1 };
  /* NSBiz books returns to their own accounts; Evershine to the sales / purchase account itself: compared as one */
  var SAME = { 'sales-return': 'sales', 'purchase-return': 'purchases' };
  /* the tables a plan reads (lower case, without .dbf); the screen asks the folder for these only */
  var TABLES = ['account', 'annexure', 'city', 'item', 'itemunit', 'itemlis9', 'gstscode', 'gstpcode', 'setup', 'allentry', 'bank', 'cash', 'cashr', 'cashp', 'journal', 'jourdet', 'bankdet', 'cashdet', 'open']
    .concat(Object.keys(DOCS).reduce(function (a, v) { return a.concat([DOCS[v].head, DOCS[v].line]); }, []));

  function dkey(v, d, s) { return v + '|' + d + '|' + (+s || 0); }
  function group(rows, f) { var o = {}; (rows || []).forEach(function (r) { var k = f(r); (o[k] = o[k] || []).push(r); }); return o; }
  function fyStart(d) { var y = +d.slice(0, 4); if (+d.slice(5, 7) < 4) y--; return y + '-04-01'; }

  /* ---------- accounts: Evershine code -> NSBiz account ---------- */
  function accountsMap(T) {
    var acc = {}, names = {}, used = {}, out = {};
    (T.account || []).forEach(function (a) { acc[t(a.ACCODE)] = a; });
    /* GST and sales / purchase accounts named in the rate tables */
    var sys = {};
    (T.gstscode || []).forEach(function (r) { sys[t(r.SGST_C)] = 'gst-out-sgst'; sys[t(r.CGST_C)] = 'gst-out-cgst'; sys[t(r.IGST_C)] = 'gst-out-igst'; sys[t(r.SGST_S)] = 'sales'; sys[t(r.IGST_S)] = 'sales'; });
    (T.gstpcode || []).forEach(function (r) { sys[t(r.SGST_C)] = 'gst-in-sgst'; sys[t(r.CGST_C)] = 'gst-in-cgst'; sys[t(r.IGST_C)] = 'gst-in-igst'; sys[t(r.SGST_S)] = 'purchases'; sys[t(r.IGST_S)] = 'purchases'; });
    delete sys[''];
    /* accounts bills are made to are parties, whatever their TYPE */
    var billParty = {};
    Object.keys(DOCS).forEach(function (v) { (T[DOCS[v].head] || []).forEach(function (h) { billParty[t(h.ACCODE)] = DOCS[v].as; }); });
    var anne = {}; (T.annexure || []).forEach(function (r) { anne[+r.SNO] = t(r.ANNE_NAME); });
    /* the accounts bank vouchers are made on are banks, whatever their TYPE (the surest sign) */
    var bankCode = {}; (T.bank || []).forEach(function (r) { var c = t(r.BV_BKCODE); if (c && c.toUpperCase() !== 'CASH') bankCode[c] = 1; });
    Object.keys(acc).forEach(function (code) {
      var a = acc[code], nm = title(a.ACNAME) || code, ty = +a.TYPE || 0, k = key(nm), lower = nm.toLowerCase(), m;
      if (sys[code]) m = { k: sys[code] };
      else if (code.toUpperCase() === 'CASH' || ty === 11 && /\bcash\b/.test(lower)) m = { k: 'cash' };
      else if (bankCode[code]) m = { k: 'bank:' + k, bank: nm };
      else if (ty === 11 && !/\b(bank|bnk|a\/c|account|cc|od)\b/.test(lower) || ty === 11 && /difference|suspense/.test(lower)) m = { k: 'oca:' + k };   /* filed with cash / bank but not one (Difference In Opening Balance) */
      else if (ty === 11 || (ty === 16 || ty === 10) && /\bbank\b/.test(lower) && !/charge|interest|commission/.test(lower)) m = { k: 'bank:' + k, bank: nm };
      else if (ty === 3 && /\bbank\b/.test(lower)) m = { k: 'od:' + k };   /* a cash credit or overdraft with a bank */
      else if (/round\s*-?\s*off|rounding/.test(lower)) m = { k: 'round-off' };
      else if (ty === 13 || ty === 4 || ty === 7 || billParty[code]) {
        var role = ty === 4 || /buy|pret|pdeb|exp/.test(billParty[code] || '') && ty !== 13 ? 'supplier' : 'customer';
        if (used[k]) { nm = nm + ' (' + code + ')'; k = key(nm); }
        used[k] = 1;
        m = { k: 'p:' + k, party: nm, role: role, side: role === 'supplier' ? 'pay' : 'recv', grp: anne[+a.GROUP] || anne[+a.GROUP1] || '' };
      }
      else if (/^(cgst|sgst|igst|utgst)/.test(lower) || /\b(cgst|sgst|igst)\b/.test(lower)) {
        var g = /igst/.test(lower) ? 'igst' : /cgst/.test(lower) ? 'cgst' : /utgst/.test(lower) ? 'utgst' : 'sgst';
        m = { k: (/input|itc|purchase|\bin\b/.test(lower) ? 'gst-in-' : 'gst-out-') + g };
      }
      else if (ty === 18) m = { k: /^sale/.test(lower) ? 'sales' : 'inc:' + k };
      else if (ty === 17) m = { k: /^purchase/.test(lower) ? 'purchases' : 'exp:' + k };
      else if (ty === 1) m = { k: 'cap:' + k };
      else if (ty === 3) m = { k: 'loan:' + k };
      else if (ty === 9) m = { k: 'fa:' + k };
      else if (ty === 6 || ty === 8) m = { k: 'ocl:' + k };
      else m = { k: 'oca:' + k };
      m.code = code; m.name = nm; m.type = ty; out[code] = m; names[code] = nm;
    });
    return out;
  }
  function lineOf(m, dr, cr, narr) {
    if (!m) return null;
    var l = m.party ? { a: 'party', party: m.party, side: m.side } : { a: m.k };
    l.dr = r2(dr); l.cr = r2(cr); if (narr) l.narr = narr;
    return l;
  }

  /* ---------- the plan ---------- */
  function plan(T, opts) {
    opts = opts || {};
    var co = opts.co || 'evershine', seller = opts.seller || { name: opts.bizName || co }, have = opts.have || {}, tot = opts.totals, warn = [];
    var M = accountsMap(T), acc = {}; (T.account || []).forEach(function (a) { acc[t(a.ACCODE)] = a; });
    function acct(code) {
      code = t(code); if (M[code]) return M[code];
      if (!code) return null;
      var m = { k: 'oca:evershine ' + key(code), name: 'Evershine account ' + code, code: code }; M[code] = m;
      warn.push({ w: 'nocode', code: code }); return m;
    }
    var src = function (id) { return { sw: 'evershine', co: co, id: id }; };
    var out = { parties: [], items: [], groups: [], banks: [], docs: [], warn: warn, counts: {}, skipped: 0, map: M };
    function add(d) { if (have[d.src.id]) { out.skipped++; return; } d.seller = seller; d.app = 1; out.docs.push(d); out.counts[d.type] = (out.counts[d.type] || 0) + 1; }

    /* masters */
    var grpSeen = {};
    Object.keys(M).forEach(function (code) {
      var m = M[code], a = acc[code] || {};
      if (m.party) {
        var gid = '';
        if (m.grp) { gid = 'gev-' + key(co + ' ' + m.grp).replace(/[^a-z0-9]+/g, '-'); if (!grpSeen[gid]) { grpSeen[gid] = 1; out.groups.push({ id: gid, name: title(m.grp), under: m.side === 'pay' ? 'creditors' : 'debtors', src: src('grp/' + gid) }); } }
        var gstin = t(a.GSTIN).toUpperCase();
        out.parties.push({ name: m.party, role: m.role, group: gid || (m.side === 'pay' ? 'creditors' : 'debtors'), addr: [a.ADDRESS1, a.ADDRESS2, a.ADDRESS6].map(t).filter(Boolean).join(', '),
          city: title(a.CITY), pin: a.PIN ? String(a.PIN) : '', state: t(a.STATE_CODE) || (/^\d\d/.test(gstin) ? gstin.slice(0, 2) : ''), gstin: gstin, pan: t(a.PANGIR).toUpperCase(),
          phone: t(a.TELEPHONE), email: t(a.E_MAILID), cdays: num(a.DRCRDAY) || '', src: src('acc/' + code) });
      }
      if (m.bank) out.banks.push({ k: m.k, name: m.bank, src: src('acc/' + code) });
    });
    var units = {}; (T.itemunit || []).forEach(function (u) { var c = t(u.UNITCODE).split('-')[0].trim(); if (c) units[c.toUpperCase()] = c; });
    function unit(u) { u = t(u); return u ? u.split('-')[0].trim() : ''; }
    var items = {};
    (T.item || []).forEach(function (it) {
      var nm = t(it.ITNAME) || t(it.ITCODE); if (!nm) return;
      var gst = num(it.IGST_R) || r2(num(it.SGST_R) + num(it.CGST_R));
      var x = { desc: nm, hsn: t(it.GST_HSNC) || t(it.GST_HSNC1), unit: unit(it.S_UNIT) || unit(it.P_UNIT), rate: num(it.S_RATE) || '', prate: num(it.P_RATE) || '', mrp: num(it.MRP_RATE) || '',
        gst: gst, kind: it.SERVICE === true ? 'service' : 'goods', src: src('item/' + t(it.ITCODE)) };
      items[t(it.ITCODE)] = x; out.items.push(x);
    });

    /* which vouchers are bills (from setup, else the defaults) */
    var kinds = {};
    Object.keys(DOCS).forEach(function (v) { kinds[v] = Object.assign({}, DOCS[v]); });
    (T.setup || []).forEach(function (s) { var v = t(s.VOUCHER); if (kinds[v] && t(s.DBF1)) { kinds[v].head = t(s.DBF1).toLowerCase(); kinds[v].line = t(s.DBF2).toLowerCase(); } });

    var postedAsDoc = {};
    var firstDay = '';
    (T.allentry || []).forEach(function (r) { if (r.DATE && (!firstDay || r.DATE < firstDay)) firstDay = r.DATE; });
    firstDay = firstDay ? fyStart(firstDay) : '';

    var evRows = group(T.allentry || [], function (r) { return dkey(t(r.VOUCHER), r.DATE, r.SNO); });
    /* bills */
    Object.keys(kinds).forEach(function (v) {
      var K = kinds[v], heads = T[K.head] || [], lines = group(T[K.line] || [], function (l) { return l.DATE + '|' + (+l.SNO || 0); });
      heads.forEach(function (h) {
        if (h.CAN_CELL === true) return;   /* a cancelled bill: Evershine keeps it, posts nothing */
        var id = v + '/' + h.DATE + '/' + (+h.SNO || 0), L = lines[h.DATE + '|' + (+h.SNO || 0)] || [], p = acct(h.ACCODE);
        postedAsDoc[dkey(v, h.DATE, h.SNO)] = 1;
        if (!p || !p.party) { warn.push({ w: 'billparty', id: id }); delete postedAsDoc[dkey(v, h.DATE, h.SNO)]; return; }   /* bill to a non-party account: its ledger lines come as a journal */
        var a = acc[t(h.ACCODE)] || {}, inter = +h.LOCAL_CENT === 2, gstin = t(a.GSTIN).toUpperCase();
        var party = { name: p.party, addr: [a.ADDRESS1, a.ADDRESS2].map(t).filter(Boolean).join(', '), city: title(a.CITY), pin: a.PIN ? String(a.PIN) : '', state: t(h.STAT_CODE) || t(a.STATE_CODE) || gstin.slice(0, 2), gstin: gstin, phone: t(a.TELEPHONE) };
        var its = L.filter(function (l) { return l.CAN_CELL !== true; }).map(function (l) {
          var amt = num(l.AMOUNT1) || num(l.AMOUNT), qty = num(l.QTY), rate = num(l.RATE), u = t(l.UNIT);
          if (!(qty && Math.abs(qty * rate - amt) < 0.51) && num(l.KGS) && Math.abs(num(l.KGS) * rate - amt) < 0.51) { qty = num(l.KGS); u = u || 'KGS'; }
          if (!qty) qty = 1;
          if (Math.abs(qty * rate - amt) >= 0.01) rate = Math.round(amt / qty * 10000) / 10000;   /* the line's taxable value is what counts */
          var gst = num(l.IGST_R) || r2(num(l.SGST_R) + num(l.CGST_R)), mi = items[t(l.ITEMCODE)];
          return { desc: (mi && mi.desc) || title(l.PARTI) || t(l.ITEMCODE) || 'Item', hsn: t(l.HSN_CODE) || (mi && mi.hsn) || '', qty: qty, unit: u || (mi && mi.unit) || '', rate: rate, disc: '', gst: gst };
        });
        /* in-state or other state as Evershine charged it (LOCAL_CENT), also when a party's state is missing or differs:
           NSBiz decides CGST+SGST / IGST from the states, so the place of supply follows Evershine (97 = other territory) */
        var own = t(seller.state), lc = +h.LOCAL_CENT;
        if (own && (lc === 1 || lc === 2)) {
          var st = party.state, isIn = !st || st === own;
          if (lc === 2 && isIn) { party.posFix = '97'; warn.push({ w: 'statefix', id: id }); }
          else if (lc === 1 && !isIn) { party.posFix = own; warn.push({ w: 'statefix', id: id }); }
        }
        var chg = [];
        for (var i = 1; i <= 12; i++) { var c = num(h['S1_FLD' + i]); if (c) chg.push({ name: chargeName(T, v, i), amt: r2(c), gst: 0 }); }
        if (num(h.ADJUST)) chg.push({ name: 'Adjustment', amt: r2(num(h.ADJUST)), gst: 0 });
        var base = { no: t(h.BILLNO) || String(+h.SNO || ''), date: h.DATE, notes: t(h.NARATION), items: its, charges: chg, round: false, src: src(id) };
        var d;
        if (K.as === 'sale' || K.as === 'export') {
          d = Object.assign(base, { type: K.as === 'export' ? 'expinv' : 'invoice', kind: K.kind, buyer: party, due: h.S_DUEDATE || '', pos: party.state, rc: false, withGst: K.kind !== 'supply', status: 'unpaid', comp: true, copies: 1, paper: 'a4', design: 'classic' });
          if (K.kind === 'supply') d.items.forEach(function (x) { x.gst = 0; });
        } else if (K.as === 'buy' || K.as === 'pret') {
          d = Object.assign(base, { type: 'pbill', kind: K.as === 'pret' ? 'return' : 'bill', buyer: party, noGst: false, bdate: h.BILLDATE || '' });
        } else if (K.as === 'sret' || K.as === 'pdeb') {
          d = Object.assign(base, { type: 'note', kind: K.as === 'sret' ? 'credit' : 'debit', side: K.as === 'sret' ? 'sale' : 'purchase', reason: its.some(function (x) { return x.qty && t(x.hsn); }) ? 'ret' : 'other', buyer: party, orig: '' });
        } else if (K.as === 'exp') {
          /* GST expenses: one expense record per line (head = the line's account, GST rate, input credit), on credit from the supplier */
          var M2 = L.filter(function (l) { return l.CAN_CELL !== true; }), recs = [];
          M2.forEach(function (l, j) {
            var g = num(l.IGST_R) || r2(num(l.SGST_R) + num(l.CGST_R)), tx = r2(num(l.SGST_A) + num(l.CGST_A) + num(l.IGST_A)), ex = acct(l.ACCODE), r;
            if (ex && /^fa:/.test(ex.k))   /* an asset bought on a GST expense bill: a fixed-asset purchase (asset register) */
              r = { type: 'fa', kind: 'buy', date: h.DATE, no: t(h.BILLNO), name: ex.name, amount: r2(num(l.AMOUNT1)), gstAmt: tx, gst: g ? String(g) : '', itc: !!tx, inter: inter, mode: 'credit', buyer: party, notes: t(h.NARATION), total: r2(num(l.AMOUNT1) + tx), src: src(id + '#' + j) };
            else
              r = { type: 'exp', date: h.DATE, no: t(h.BILLNO), cat: ex && /^exp:/.test(ex.k) ? ex.name : title(l.PARTI) || 'Expenses', amount: r2(num(l.AMOUNT1) + tx), gst: g ? String(g) : '', itc: !!tx, inter: inter,
                mode: 'credit', buyer: party, notes: t(h.NARATION), total: r2(num(l.AMOUNT1) + tx), src: src(id + '#' + j) };
            add(r); recs.push(r);
          });
          var rest = r2(num(h.SAMOUNT) - M2.reduce(function (s, l) { return s + num(l.AMOUNT1) + num(l.SGST_A) + num(l.CGST_A) + num(l.IGST_A); }, 0));
          if (rest) { var rj = { type: 'jv', date: h.DATE, no: id, lines: [{ a: 'party', party: party.name, side: 'pay', dr: rest < 0 ? -rest : 0, cr: rest > 0 ? rest : 0 }, { a: 'exp:charges on purchases', dr: rest > 0 ? rest : 0, cr: rest < 0 ? -rest : 0 }], narr: 'Charges on ' + (t(h.BILLNO) || id), src: src(id + '#rest') }; add(rj); recs.push(rj); }
          if (opts.postings && recs.length && !have[recs[0].src.id]) fixBill(recs, id, v, h, t(h.BILLNO) || id);
          return;
        }
        /* the bill total is Evershine's SAMOUNT: up to a rupee of difference is round off (NSBooks posts total - lines to round-off),
           more is an adjustment line on the bill and a warning */
        var want = r2(num(h.SAMOUNT));
        if (tot && want) {
          var got = tot(Object.assign({}, d, { total: null })).total, gap = r2(want - got);
          if (Math.abs(gap) > 1) { d.charges.push({ name: 'Adjustment (Evershine)', amt: gap, gst: 0 }); warn.push({ w: 'billgap', id: id, amt: gap }); }
        }
        d.total = want || (tot ? tot(Object.assign({}, d, { total: null })).total : 0);
        if (party.posFix) { if (d.type === 'invoice' || d.type === 'expinv' || d.type === 'note' && d.side === 'sale') d.pos = party.posFix; else d.buyer = Object.assign({}, d.buyer, { state: party.posFix }); delete d.buyer.posFix; }
        add(d);
        if (opts.postings && !have[d.src.id]) fixBill([d], id, v, h, d.no || id);
      });
    });

    /* a bill must post exactly what Evershine posted: NSBiz's own lines for it are compared with Evershine's rows of that voucher,
       account by account (several Evershine accounts may be one NSBiz account), and any difference becomes a small journal dated
       with the bill ("Evershine posting of bill X"): a fixed asset bought on a purchase bill, a charge Evershine put on another
       account, paise of rounding. The bill itself stays a real bill (GST returns, stock); the books stay Evershine's. */
    function fixBill(ds, id, v, h, label) {
      var d = ds[0];
      var want2 = {}, got2 = {};
      (evRows[dkey(v, h.DATE, h.SNO)] || []).forEach(function (r) { var m = acct(r.ACCODE); if (!m) return; var k = SAME[m.k] || m.k; want2[k] = r2((want2[k] || 0) + num(r.DRCR)); });
      if (!Object.keys(want2).length) return;
      ds.forEach(function (x) { opts.postings(x).forEach(function (l) { var k = SAME[l.a] || l.a; got2[k] = r2((got2[k] || 0) + l.dr - l.cr); }); });
      var lines = [], keys = {};
      Object.keys(want2).concat(Object.keys(got2)).forEach(function (k) { keys[k] = 1; });
      Object.keys(keys).forEach(function (k) {
        var diff = r2((want2[k] || 0) - (got2[k] || 0)); if (Math.abs(diff) < 0.005) return;
        var m = null; Object.keys(M).some(function (c) { if ((SAME[M[c].k] || M[c].k) === k) { m = M[c]; return true; } return false; });
        var ln = m ? lineOf(m, diff > 0 ? diff : 0, diff < 0 ? -diff : 0) : { a: k, dr: diff > 0 ? diff : 0, cr: diff < 0 ? -diff : 0 };
        lines.push(ln);
      });
      if (!lines.length) return;
      var sum = lines.reduce(function (a, l) { return r2(a + l.dr - l.cr); }, 0);
      if (Math.abs(sum) >= 0.005) lines.push({ a: 'round-off', dr: sum < 0 ? -sum : 0, cr: sum > 0 ? sum : 0 });
      out.fixed = (out.fixed || 0) + 1;
      add({ type: 'jv', no: label + ' (Evershine)', date: d.date, lines: lines, narr: 'Evershine posting of ' + label, fixOf: d.src.id, src: src(id + '#fix') });
    }

    /* every other voucher: a journal of Evershine's own ledger lines */
    var bankHead = {}; (T.bank || []).forEach(function (b) { bankHead[b.BV_DATE + '|' + (+b.BV_SNO || 0)] = t(b.BV_BKCODE); });
    var vg = group(T.allentry || [], function (r) { return dkey(t(r.VOUCHER), r.DATE, r.SNO); }), opening = [];
    Object.keys(vg).forEach(function (gk) {
      var rows = vg[gk], v = t(rows[0].VOUCHER), date = rows[0].DATE, sno = +rows[0].SNO || 0, id = v + '/' + date + '/' + sno;
      if (postedAsDoc[gk]) return;
      if (v === 'OP') { opening = opening.concat(rows); return; }
      var lines = [], sum = 0, narr = t(rows[0].MEMO);
      rows.forEach(function (r) { var d = num(r.DRCR); if (!d) return; sum = r2(sum + d); var l = lineOf(acct(r.ACCODE), d > 0 ? d : 0, d < 0 ? -d : 0, t(r.MEMO)); if (l) lines.push(l); });
      if (sum) {   /* one-sided in allentry: the cash or bank side is not a row */
        var other = CASHV[v] ? M.CASH || { k: 'cash' } : v === 'B' && bankHead[date + '|' + sno] ? acct(bankHead[date + '|' + sno]) : null;
        if (!other) { other = { k: 'ocl:evershine difference' }; warn.push({ w: 'onesided', id: id, amt: sum }); }
        lines.push(lineOf(other, sum < 0 ? -sum : 0, sum > 0 ? sum : 0, 'Other side of ' + id));
      }
      if (!lines.length) return;
      add({ type: 'jv', no: v + '/' + sno, date: date, lines: lines, narr: narr, evtype: v, src: src(id) });
    });

    /* opening balances (only for the first year brought into a business) */
    if (opening.length && !opts.noOpening) {
      var od = opening[0].DATE || firstDay, rest2 = [];
      opening.forEach(function (r) {
        var m = acct(r.ACCODE), amt = num(r.DRCR); if (!m || !amt) return;
        var id = 'OP/' + t(r.ACCODE);
        if (m.party) add({ type: 'ob', date: od, side: amt > 0 ? 'recv' : 'pay', amount: r2(Math.abs(amt)), buyer: { name: m.party }, no: '', total: r2(Math.abs(amt)), src: src(id) });
        else if (m.k === 'cash' || /^bank/.test(m.k)) add({ type: 'ob', date: od, side: m.k === 'cash' ? 'cash' : 'bank', bacct: m.k === 'cash' ? '' : m.k, amount: r2(amt), buyer: { name: '' }, no: '', total: r2(Math.abs(amt)), src: src(id) });
        else rest2.push(lineOf(m, amt > 0 ? amt : 0, amt < 0 ? -amt : 0));
      });
      if (rest2.length) {
        var s2 = rest2.reduce(function (s, l) { return r2(s + l.dr - l.cr); }, 0);
        if (s2) rest2.push({ a: 'opening', dr: s2 < 0 ? -s2 : 0, cr: s2 > 0 ? s2 : 0 });
        add({ type: 'jv', no: 'OP', date: od, lines: rest2, narr: 'Opening balances from Evershine', src: src('OP/ledgers') });
      }
    }
    /* opening stock */
    if (!opts.noOpening) {
      var stk = (T.item || []).filter(function (it) { return num(it.OPGQTY); }).map(function (it) {
        var q = num(it.OPGQTY), v2 = num(it.OPGVALUE); return { desc: t(it.ITNAME) || t(it.ITCODE), unit: unit(it.S_UNIT), qty: q, rate: v2 ? Math.round(v2 / q * 10000) / 10000 : num(it.OPGRATE) };
      });
      if (stk.length && firstDay) add({ type: 'stk', kind: 'open', no: 'OPEN/EV', date: firstDay, gd: '', note: 'Opening stock from Evershine', lines: stk, src: src('OP/stock') });
    }
    /* a later year (opts.prior = NSBiz balances of everything brought in before): what Evershine changed when it opened this year
       (GST squared off, its own difference account cleared, balances moved) comes in as one journal on the first day, so NSBiz starts
       the year where Evershine did. Left out and only reported: capital and drawings (the earlier years' profit, which NSBiz moves at its
       own Year end) and stock accounts (NSBiz values stock from the items). The journal balances against the main capital account. */
    if (opts.prior && opts.noOpening) {
      var CRY = carry(T, { map: M }, opts.prior), yl = [], capK = '', capV = 0;
      Object.keys(M).forEach(function (c) { if (/^cap:/.test(M[c].k)) { var v2 = Math.abs((opts.prior[M[c].k] || 0)); if (!capK || v2 > capV) { capK = M[c].k; capV = v2; } } });
      CRY.rows.forEach(function (r) {
        if (!r.diff || /^(cap:|drw:)/.test(r.k) || /stock/.test(key(r.name))) return;
        var m = null; Object.keys(M).some(function (c) { if ((SAME[M[c].k] || M[c].k) === r.k) { m = M[c]; return true; } return false; });
        var d2 = -r.diff, ln = m ? lineOf(m, d2 > 0 ? d2 : 0, d2 < 0 ? -d2 : 0) : { a: r.k, dr: d2 > 0 ? d2 : 0, cr: d2 < 0 ? -d2 : 0 };
        yl.push(ln);
      });
      if (yl.length) {
        var ys = yl.reduce(function (a, l) { return r2(a + l.dr - l.cr); }, 0);
        if (ys) yl.push({ a: capK || 'opening', dr: ys < 0 ? -ys : 0, cr: ys > 0 ? ys : 0 });
        add({ type: 'jv', no: 'Year start (Evershine)', date: firstDay, lines: yl, narr: 'Changes Evershine made when it opened this year', src: src('YS/' + co) });
        out.yearStart = yl.length;
      }
    }
    out.docs.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return out;
  }
  function chargeName(T, v, i) {
    var s = (T.setup || []).filter(function (x) { return t(x.VOUCHER) === v; })[0];
    return (s && t(s['S_TITLE' + i])) || 'Charge ' + i;
  }

  /* ---------- the check: every NSBiz account against Evershine's own postings ----------
     books = NSBiz account balances of the imported records (NSBooks.accounts(docs, biz)); Evershine's = allentry summed per
     account, mapped the same way (several Evershine accounts can be one NSBiz account: all GST output CGST, all sales ...).
     Opening ('opening') and the one-sided fixes are left out of the comparison: Evershine has no such account.
     -> { rows: [{ k, name, evershine, nsbiz, diff }], ok: count matching, bad: count differing } */
  function check(T, P, books0, opts) {
    opts = opts || {};
    var ev = {}, names = {}, books = {};
    Object.keys(books0).forEach(function (k) { var c = SAME[k] || k; books[c] = r2((books[c] || 0) + books0[k]); });
    (T.allentry || []).forEach(function (r) {
      if (opts.noOpening && t(r.VOUCHER) === 'OP') return;
      var m = P.map[t(r.ACCODE)]; if (!m) return;
      var k = SAME[m.k] || m.k; ev[k] = r2((ev[k] || 0) + num(r.DRCR)); names[k] = names[k] || m.name;
    });
    /* one-sided vouchers: Evershine's own books never had that line, so leave the fix out of its side */
    var fix = {};
    (P.docs || []).forEach(function (d) { if (d.type !== 'jv') return; (d.lines || []).forEach(function (l) { if (/^Other side of /.test(l.narr || '')) { var k = l.a === 'party' ? 'p:' + key(l.party) : l.a; fix[k] = r2((fix[k] || 0) + l.dr - l.cr); } }); });
    var rows = [], ok = 0, bad = 0, all = {};
    Object.keys(ev).concat(Object.keys(books)).forEach(function (k) { all[k] = 1; });
    Object.keys(all).forEach(function (k) {
      if (k === 'opening' || /^ocl:evershine difference$/.test(k)) return;
      var e = r2(ev[k] || 0), n = r2((books[k] || 0) - (fix[k] || 0)), d = r2(n - e);
      if (!e && !n) return;
      if (Math.abs(d) < 0.01) ok++; else bad++;
      rows.push({ k: k, name: names[k] || k, evershine: e, nsbiz: n, diff: d });
    });
    rows.sort(function (a, b) { return Math.abs(b.diff) - Math.abs(a.diff); });
    return { rows: rows, ok: ok, bad: bad };
  }

  /* a later year: Evershine's opening (OP) against NSBiz's closing of the years before, for balance-sheet accounts only
     (sales, purchases, expenses and income start each year at nil in Evershine; NSBiz keeps its own profit and loss per year).
     prior = NSBooks.accounts of everything brought in so far, up to the day before. -> { rows, ok, bad } like check() */
  var PL = /^(sales|purchases|round-off|exp:|inc:|sales-return|purchase-return)/;
  function carry(T, P, prior) {
    var ev = {}, names = {}, nb = {};
    Object.keys(prior).forEach(function (k) { var c = SAME[k] || k; if (!PL.test(c)) nb[c] = r2((nb[c] || 0) + prior[k]); });
    (T.allentry || []).forEach(function (r) { if (t(r.VOUCHER) !== 'OP') return; var m = P.map[t(r.ACCODE)]; if (!m) return; var k = SAME[m.k] || m.k; if (PL.test(k)) return; ev[k] = r2((ev[k] || 0) + num(r.DRCR)); names[k] = names[k] || m.name; });
    var rows = [], ok = 0, bad = 0, all = {};
    Object.keys(ev).concat(Object.keys(nb)).forEach(function (k) { all[k] = 1; });
    Object.keys(all).forEach(function (k) {
      if (k === 'opening') return;
      var e = r2(ev[k] || 0), n = r2(nb[k] || 0), d = r2(n - e); if (!e && !n) return;
      if (Math.abs(d) < 0.01) ok++; else bad++;
      rows.push({ k: k, name: names[k] || k, evershine: e, nsbiz: n, diff: d });
    });
    rows.sort(function (a, b) { return Math.abs(b.diff) - Math.abs(a.diff); });
    return { rows: rows, ok: ok, bad: bad };
  }

  /* the company-year folders found under an Evershine folder: names like AIW2223 under DATA2022 (2022-23) */
  function folders(paths) {
    var out = {};
    (paths || []).forEach(function (p) {
      if (/(^|\/)(backup|back\d{2,4})\//i.test(String(p).replace(/\\/g, '/'))) return;   /* Evershine's backup copies of company folders */
      var m = String(p).replace(/\\/g, '/').match(/(?:^|\/)DATA(\d{4})\/([A-Za-z]+)(\d{4})\//i), viaData = !!m;
      if (!m) { var q = String(p).replace(/\\/g, '/').match(/(?:^|\/)([A-Za-z]+)(\d{2})(\d{2})\/[^\/]+\.dbf$/i); if (q && +q[3] === (+q[2] + 1) % 100) m = [q[0], '', q[1], q[2] + q[3]]; }
      if (m && !viaData && out[m[2].toUpperCase() + m[3]]) return;   /* a folder under DATA<yyyy> wins */
      if (m) { var co = m[2].toUpperCase(), yy = m[3]; out[co + yy] = { co: co, year: '20' + yy.slice(0, 2) + '-' + yy.slice(2), dir: p.replace(/\\/g, '/').slice(0, p.replace(/\\/g, '/').indexOf(m[2] + m[3]) + m[2].length + 4) }; }
    });
    return Object.keys(out).sort().map(function (k) { return Object.assign({ id: k }, out[k]); });
  }

  /* our own state: the state of the parties on in-state bills (LOCAL_CENT 1), the most common one */
  function ownState(T) {
    var acc = {}, c = {}; (T.account || []).forEach(function (a) { acc[t(a.ACCODE)] = a; });
    ['gstsb', 'gstpb'].forEach(function (tb) { (T[tb] || []).forEach(function (h) { if (+h.LOCAL_CENT !== 1) return; var a = acc[t(h.ACCODE)] || {}, s = t(a.STATE_CODE) || t(a.GSTIN).slice(0, 2); if (/^\d\d$/.test(s)) c[s] = (c[s] || 0) + 1; }); });
    return Object.keys(c).sort(function (x, y) { return c[y] - c[x]; })[0] || '';
  }
  var API = { plan: plan, carry: carry, ownState: ownState, check: check, folders: folders, accountsMap: accountsMap, TABLES: TABLES, DOCS: DOCS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.NSEver = API;
})(typeof window !== 'undefined' ? window : this);

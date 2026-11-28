/* NSZeefa: ZEEFA (VB6 + password-protected Access, one database per company-year, e.g. SRSI2627.MDB) -> NSBiz records. Pure, no
   screen; runs in the App ("Bring data from other software") and in Node (tests, the real-data check). The App cannot open a
   password-protected Access file, so the ZEEFA Purchase Import tool (button "Make a file for NSBiz") reads one year database READ
   ONLY and writes a JSON file { format: 'zeefa-for-nsbiz', co, year, file, tables: { ACCOUNTS: [...], LEDGER: [...], ... } }.

   What ZEEFA keeps (learnt from its own rows, CLAUDE.md "ZEEFA Purchase Import" + real 2024-27 files read 25 Nov 2026):
   - ACCOUNTS: PCODE (code, NOT stable between year files: an account made later in one year can carry another code next year, so
     years are joined by name), ANAME, ADDRESS, ADDRESS1, CITY, PINCODE, STATECODE, GSTIN, PANNO, MPHONE, EMAIL, CDAYS, BSHEAD (balance
     sheet head: SUNDRY DEBITORS, SUNDRY CREDITORS, CASH AND BANK BALANCES, FIXED ASSETS, SECURED LOAN ...; empty for profit and loss
     accounts), ACCOUNT (0 balance sheet, 1 trading, 2 profit and loss), GNAME (SALES, PURCHASES, BANK), OBAL + OBALTYPE (opening
     balance, 0 debit, 1 credit; there is no opening voucher).
   - GSTHEADS: per head SRTYPE (1 sale, 2 purchase, 3 reverse charge), SACODE (sales / purchase / expense account), SGSTCODE, CGSTCODE,
     IGSTCODE (ONE account each for input and output tax), RSGSTCODE... (reverse charge payable), TCSCODE, ROUNDCODE.
   - GSTMAIN = a bill (BOOKCODE: SB* sales, PB1 purchase, CN1/DN1 notes on sales, DN2/CN2 notes on purchases, RTI reverse charge),
     SRNO (its voucher number in LEDGER), CUT (cancelled: nothing posted), ETYPE (0 items, 1 expense accounts), INVCNO (the number),
     INVDATE (posting date), RDATE (supplier's bill date), ACCODE (party), TAMOUNT taxable, SGST/CGST/IGSTAMOUNT, TCSAMT, ROUNDOFF,
     TOTAL, REFINVNO (original bill of a note), IRNNO / ACKNO / ACKDATE (e-invoice).
   - BILL = the lines (SRNO + EID = book): ITEMID, ITEM, QNTY, UNIT, RATE, AMOUNT, TAXBASE (taxable), STATUS, ACCODE (the expense
     account on ETYPE 1 bills), HSNCODE, SGSTPER / CGSTPER / IGSTPER. Labour and cartage on a sale are lines with QNTY 0.
   - LEDGER = every posting, both sides: ENTRYID (book code, B bank, V cash, J journal, TDS) + VNUMBER = one voucher (bills: SRNO),
     EDATE, PCODE, DAMOUNT / CAMOUNT, NARRATION. Every voucher balances.
   - ITEMS: ID, INAME, UNIT, HSNCODE, IGSTPER, RATE, PRATE, MRP, OBAL (opening quantity), OVALUE / ORATE (opening value / rate).

   How it comes into NSBiz (same way as Evershine, evcore.js, proven account by account):
   - parties (debtors, creditors and any account a bill is made to), banks, items, a few party groups (unusual balance sheet heads).
   - bills -> NSBiz documents with their item lines (invoice / purchase bill / credit or debit note); ETYPE 1 bills and reverse charge
     bills (RTI) as expense records per line; e-invoice IRN kept. Each bill then posts exactly what ZEEFA posted: any difference
     (cartage on its own account, GST TDS, reverse charge tax, paise of rounding) becomes a small journal "ZEEFA posting of bill X".
   - every other voucher (bank, cash, journal, TDS) -> a journal with ZEEFA's own LEDGER lines.
   - first year: OBAL -> opening balances (parties, cash, banks as NSBiz openings, the rest in one opening journal) + opening stock.
     Later years: a "Year start (ZEEFA)" journal for what ZEEFA changed when it opened that year.
   Every record carries src = { sw: 'zeefa', co, id } so a second run brings only what is new. */
(function (G) {
  'use strict';
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function r2(n) { return Math.round((+n + Number.EPSILON) * 100) / 100; }
  function num(v) { var n = +v; return isFinite(n) ? n : 0; }
  function t(s) { return String(s == null ? '' : s).trim(); }
  function title(s) { s = t(s).replace(/\s+/g, ' '); return s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s.\-(\/&])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }) : s; }

  /* books: what kind of document each ZEEFA book becomes (by BOOKTYPE, so a company's own book codes work too) */
  var BOOKS = { 0: 'sale', 2: 'buy', 4: 'sdeb', 5: 'scred', 6: 'pdeb', 7: 'pcred', 8: 'rc' };
  /* ZEEFA keeps one account for input and output GST: NSBiz's two are compared as one; returns go to the sales / purchase account */
  var SAME = { 'sales-return': 'sales', 'purchase-return': 'purchases', 'gst-in-sgst': 'gst-out-sgst', 'gst-in-cgst': 'gst-out-cgst', 'gst-in-igst': 'gst-out-igst', 'gst-in-utgst': 'gst-out-utgst' };
  function same(k) { return SAME[k] || k; }
  var CUST = /^(SUNDRY DEBITORS|SUNDRY DEBTORS|SUNDRY RECEIVEABLES|SUNDRY RECEIVABLES|ADVANCES FROM CUSTOMERS)$/, SUPP = /^(SUNDRY CREDITORS|SUNDRY PAYABLES|ADVANCES TO SUPPLIERS)$/;

  function tablesOf(J) { return (J && J.tables) || J || {}; }
  function amt(l) { return r2(num(l.DAMOUNT) - num(l.CAMOUNT)); }
  function ob(a) { return r2(num(a.OBAL) * (+a.OBALTYPE === 1 ? -1 : 1)); }
  function group(rows, f) { var o = {}; (rows || []).forEach(function (r) { var k = f(r); (o[k] = o[k] || []).push(r); }); return o; }
  function fyStart(d) { var y = +d.slice(0, 4); if (+d.slice(5, 7) < 4) y--; return y + '-04-01'; }
  function vkey(e, n) { return t(e).toUpperCase() + '|' + (+n || 0); }

  /* ---------- accounts: ZEEFA code -> NSBiz account ---------- */
  /* known = accounts of the years brought in before ({ name key: mapping }): an account keeps the kind it had there, so a name that
     ZEEFA filed under another head one year (a TDS account once used as a party) stays one NSBiz account */
  function accountsMap(J, known) {
    var T = tablesOf(J), out = {}, used = {}, sys = {}, bal = {}, billParty = {}, bookOf = {}, banks = {}, cash = {};
    (T.GSTBOOK || []).forEach(function (b) { bookOf[t(b.BOOKCODE).toUpperCase()] = BOOKS[+b.BOOKTYPE]; });
    (T.GSTHEADS || []).forEach(function (h) {
      var st = +h.SRTYPE;
      if (+h.SACODE) sys[+h.SACODE] = st === 1 ? 'sales' : st === 2 ? 'purchases' : sys[+h.SACODE] || '';
      if (+h.SGSTCODE) sys[+h.SGSTCODE] = 'gst-out-sgst'; if (+h.CGSTCODE) sys[+h.CGSTCODE] = 'gst-out-cgst'; if (+h.IGSTCODE) sys[+h.IGSTCODE] = 'gst-out-igst';
      ['RSGSTCODE', 'RCGSTCODE', 'RIGSTCODE'].forEach(function (c) { if (+h[c]) sys[+h[c]] = 'gst-rcm-payable'; });
      if (+h.TCSCODE) sys[+h.TCSCODE] = st === 2 ? 'tcs-receivable' : 'tcs-payable';
      if (+h.ROUNDCODE) sys[+h.ROUNDCODE] = 'round-off';
    });
    Object.keys(sys).forEach(function (c) { if (!sys[c]) delete sys[c]; });
    (T.ACCOUNTS || []).forEach(function (a) { bal[+a.PCODE] = ob(a); });
    (T.LEDGER || []).forEach(function (l) { bal[+l.PCODE] = r2((bal[+l.PCODE] || 0) + amt(l)); });
    (T.GSTMAIN || []).forEach(function (h) { if (h.CUT === true) return; billParty[+h.ACCODE] = bookOf[t(h.BOOKCODE).toUpperCase()] || BOOKS[+h.BOOKTYPE] || 'sale'; });
    (T.BVMAS || []).forEach(function (b) { if (+b.ACCODE) banks[+b.ACCODE] = 1; });
    (T.VOUMAS || []).forEach(function (b) { if (+b.ACCODE) cash[+b.ACCODE] = 1; });
    (T.ACCOUNTS || []).forEach(function (a) {
      var code = +a.PCODE, nm = title(a.ANAME) || 'Account ' + code, lower = nm.toLowerCase(), bs = t(a.BSHEAD).toUpperCase(), gn = t(a.GNAME).toUpperCase(), ac = +a.ACCOUNT || 0, m, b = bal[code] || 0;
      var kn = known && known[key(nm)];
      if (kn && !sys[code]) { m = { k: kn.k }; ['party', 'role', 'side', 'bank', 'grp'].forEach(function (f) { if (kn[f] != null) m[f] = kn[f]; }); if (m.party) used[key(m.party)] = 1; }
      else if (sys[code]) m = { k: sys[code] };
      else if (cash[code] || /^cash( in hand| a\/c| account)?$/.test(lower)) m = { k: 'cash' };
      else if (banks[code] || gn === 'BANK' || bs === 'CASH AND BANK BALANCES' && !/\bcash\b/.test(lower)) m = { k: 'bank:' + key(nm), bank: nm };
      else if (bs === 'CASH AND BANK BALANCES') m = { k: 'cash' };
      else if (/round\s*-?\s*off|rounding/.test(lower)) m = { k: 'round-off' };
      else if (CUST.test(bs) || SUPP.test(bs) || billParty[code]) {
        var bp = billParty[code] || '', role = SUPP.test(bs) || !CUST.test(bs) && /buy|pdeb|pcred|rc/.test(bp) ? 'supplier' : 'customer';
        var pk = key(nm); if (used[pk]) { nm = nm + ' (' + (t(a.GSTIN).toUpperCase() || code) + ')'; pk = key(nm); }
        used[pk] = 1;
        m = { k: 'p:' + pk, party: nm, role: role, side: role === 'supplier' ? 'pay' : 'recv', grp: /^SUNDRY (DEBITORS|DEBTORS|CREDITORS)$/.test(bs) ? '' : bs };
      }
      else if (ac === 0 && /\b(c|s|i|ut)gst\b/.test(lower) && !/\btds\b|portal|\brev\b|reverse/.test(lower)) m = { k: 'gst-out-' + (/igst/.test(lower) ? 'igst' : /utgst/.test(lower) ? 'utgst' : /cgst/.test(lower) ? 'cgst' : 'sgst') };
      else if (ac === 0 && /^tds a\/?c$|^tds payable/.test(lower)) m = { k: 'tds-payable' };
      else if (ac === 0 && /^tds receivable/.test(lower)) m = { k: 'tds-receivable' };
      else if (ac > 0) {
        if (gn === 'SALES' || /^sales?\b/.test(lower)) m = { k: 'sales' };
        else if (gn === 'PURCHASES' && /^purchase/.test(lower)) m = { k: 'purchases' };
        else m = { k: (/\b(received|recd|income|commission recd|interest recd|discount recd)\b/.test(lower) || b < 0 && !/expense|charges|exp\b|repair|salary|wages|rent|fees|interest on/.test(lower) ? 'inc:' : 'exp:') + key(nm) };
      }
      else if (bs === 'CAPITAL ACCOUNT' || bs === 'RESERVES AND SURPLUSES' || bs === 'PROFIT & LOSS ACCOUNT') m = { k: 'cap:' + key(nm) };
      else if (bs === 'SECURED LOAN' || bs === 'UNSECURED LOAN') m = { k: 'loan:' + key(nm) };
      else if (bs === 'FIXED ASSETS') m = { k: 'fa:' + key(nm) };
      else if (/^(CURRENT LIABILITIES|OTHER LIABILITIES|PROVISIONS|DUTIES & TAXES)$/.test(bs)) m = { k: 'ocl:' + key(nm) };
      else if (bs) m = { k: 'oca:' + key(nm) };
      else m = { k: (b < 0 ? 'ocl:' : 'oca:') + key(nm) };
      m.code = code; m.name = nm; m.ac = ac; m.bs = bs; out[code] = m;
    });
    return out;
  }
  function lineOf(m, dr, cr, narr) {
    if (!m) return null;
    var l = m.party ? { a: 'party', party: m.party, side: m.side } : { a: m.k };
    l.dr = r2(dr); l.cr = r2(cr); if (narr) l.narr = narr;
    return l;
  }
  function stateOf(a) { var s = t(a.STATECODE), g = t(a.GSTIN).toUpperCase(); if (/^\d$/.test(s)) s = '0' + s; return /^\d\d$/.test(s) ? s : /^\d\d/.test(g) ? g.slice(0, 2) : ''; }

  /* ---------- the plan ---------- */
  function plan(J, opts) {
    opts = opts || {};
    var T = tablesOf(J), co = opts.co || (J && J.file) || 'zeefa', seller = opts.seller || { name: opts.bizName || co }, have = opts.have || {}, tot = opts.totals, warn = [];
    var M = accountsMap(J, opts.known), acc = {}; (T.ACCOUNTS || []).forEach(function (a) { acc[+a.PCODE] = a; });
    function acct(code) {
      code = +code || 0; if (M[code]) return M[code];
      var m = { k: 'oca:zeefa account ' + code, name: 'ZEEFA account ' + code, code: code }; M[code] = m;
      warn.push({ w: 'nocode', code: code }); return m;
    }
    var src = function (id) { return { sw: 'zeefa', co: co, id: id }; };
    var out = { parties: [], items: [], groups: [], banks: [], docs: [], warn: warn, counts: {}, skipped: 0, map: M };
    function add(d) { if (have[d.src.id]) { out.skipped++; return; } d.seller = seller; d.app = 1; out.docs.push(d); out.counts[d.type] = (out.counts[d.type] || 0) + 1; }

    /* masters */
    var grpSeen = {};
    Object.keys(M).forEach(function (code) {
      var m = M[code], a = acc[code] || {};
      if (m.party) {
        var gid = '';
        if (m.grp) { gid = 'gzf-' + key(m.grp).replace(/[^a-z0-9]+/g, '-'); if (!grpSeen[gid]) { grpSeen[gid] = 1; out.groups.push({ id: gid, name: title(m.grp), under: m.side === 'pay' ? 'creditors' : 'debtors', src: src('grp/' + gid) }); } }
        out.parties.push({ name: m.party, role: m.role, group: gid || (m.side === 'pay' ? 'creditors' : 'debtors'), addr: [a.ADDRESS, a.ADDRESS1].map(t).filter(Boolean).join(', '),
          city: title(a.CITY), pin: t(a.PINCODE), state: stateOf(a), gstin: t(a.GSTIN).toUpperCase(), pan: t(a.PANNO).toUpperCase(),
          phone: t(a.MPHONE) || t(a.PHONE), email: t(a.EMAIL), cdays: num(a.CDAYS) || '', climit: num(a.CRLAMOUNT) || '', src: src('acc/' + key(m.party)) });
      }
      if (m.bank) out.banks.push({ k: m.k, name: m.bank, acc: t(a.BANKAC), ifsc: t(a.IFSC).toUpperCase(), src: src('acc/' + key(m.bank)) });
    });
    var items = {};
    (T.ITEMS || []).forEach(function (it) {
      var nm = t(it.INAME) || t(it.ICODE); if (!nm) return;
      var gst = num(it.IGSTPER) || r2(num(it.SGSTPER) + num(it.CGSTPER));
      var x = { desc: nm, code: t(it.ICODE), hsn: t(it.HSNCODE), unit: t(it.UNIT), rate: num(it.RATE) || '', prate: num(it.PRATE) || '', mrp: num(it.MRP) || '', gst: gst, kind: /^99/.test(t(it.HSNCODE)) ? 'service' : 'goods', src: src('item/' + key(nm)) };
      if (+it.DEACTIVE) x.off = true;
      items[+it.ID] = x; out.items.push(x);
    });

    var firstDay = '';
    (T.LEDGER || []).forEach(function (r) { if (r.EDATE && (!firstDay || r.EDATE < firstDay)) firstDay = r.EDATE; });
    (T.GSTMAIN || []).forEach(function (r) { if (r.INVDATE && (!firstDay || r.INVDATE < firstDay)) firstDay = r.INVDATE; });
    firstDay = firstDay ? fyStart(firstDay) : (J && J.year ? J.year.slice(0, 4) + '-04-01' : '');

    var LG = group(T.LEDGER || [], function (l) { return vkey(l.ENTRYID, l.VNUMBER); }), postedAsDoc = {};
    var bookOf = {}; (T.GSTBOOK || []).forEach(function (b) { bookOf[t(b.BOOKCODE).toUpperCase()] = BOOKS[+b.BOOKTYPE]; });
    var lines = group(T.BILL || [], function (l) { return t(l.EID).toUpperCase() + '|' + (+l.SRNO || 0); });
    var own = t(seller.state);

    /* bills */
    (T.GSTMAIN || []).forEach(function (h) {
      if (h.CUT === true) return;   /* a cancelled bill: ZEEFA keeps it, posts nothing */
      var bk = t(h.BOOKCODE).toUpperCase(), as = bookOf[bk] || BOOKS[+h.BOOKTYPE], vk = vkey(bk, h.SRNO), date = h.INVDATE, id = bk + '/' + date + '/' + (+h.SRNO || 0);
      if (!as) return;   /* orders, challans, proforma: not in the books */
      var p = acct(h.ACCODE), L = lines[bk + '|' + (+h.SRNO || 0)] || [];
      if (!LG[vk]) { warn.push({ w: 'notposted', id: id }); return; }
      if (!p.party) { warn.push({ w: 'billparty', id: id }); return; }   /* its ledger lines come as a journal */
      postedAsDoc[vk] = 1;
      var a = acc[+h.ACCODE] || {}, gstin = t(h.CGSTIN || a.GSTIN).toUpperCase();
      var party = { name: p.party, addr: [a.ADDRESS, a.ADDRESS1].map(t).filter(Boolean).join(', '), city: title(a.CITY), pin: t(a.PINCODE), state: stateOf(a), gstin: gstin, phone: t(a.MPHONE) };
      /* in-state or other state as ZEEFA charged it: NSBiz decides CGST+SGST / IGST from the states (97 = other territory) */
      var inter = num(h.IGSTAMOUNT) > 0, intra = num(h.SGSTAMOUNT) + num(h.CGSTAMOUNT) > 0;
      if (own && (inter || intra)) {
        var isIn = !party.state || party.state === own;
        if (inter && isIn) { party.posFix = '97'; warn.push({ w: 'statefix', id: id }); }
        else if (intra && !isIn) { party.posFix = own; warn.push({ w: 'statefix', id: id }); }
      }
      var no = t(h.INVCNO) || (t(h.INVCHR) + (+h.INVNO || '')) || String(+h.SRNO || ''), label = no || id;
      var notes = t(h.NARRATION);

      /* ETYPE 1 (bills to expense accounts) and reverse charge bills: one expense record per line, on credit from the supplier */
      if (+h.ETYPE === 1 && (as === 'buy' || as === 'rc')) {
        var recs = [], rc = as === 'rc';
        L.forEach(function (l, j) {
          var g = num(l.IGSTPER) || r2(num(l.SGSTPER) + num(l.CGSTPER)), base = r2(num(l.TAXBASE) || num(l.AMOUNT) - num(l.DISCAMT));
          var lt = r2(num(l.SGSTAMOUNT) + num(l.CGSTAMOUNT) + num(l.IGSTAMOUNT));   /* ZEEFA's own tax on the line, else worked out */
          var tx = rc ? 0 : lt || (inter ? r2(base * g / 100) : r2(r2(base * g / 200) * 2)), ex = acct(l.ACCODE), r;
          if (/^fa:/.test(ex.k)) r = { type: 'fa', kind: 'buy', date: date, no: no, name: ex.name, amount: base, gstAmt: tx, gst: g && !rc ? String(g) : '', itc: !!tx, inter: inter, mode: 'credit', buyer: party, notes: notes, total: r2(base + tx), src: src(id + '#' + j) };
          else r = { type: 'exp', date: date, no: no, cat: /^exp:/.test(ex.k) ? ex.name : title(l.ITEM) || 'Expenses', amount: r2(base + tx), gst: g && !rc ? String(g) : '', itc: !!tx, inter: inter, mode: 'credit', buyer: party, notes: notes, total: r2(base + tx), src: src(id + '#' + j) };
          if (rc) r.rcm = true;
          add(r); recs.push(r);
        });
        if (!recs.length) { delete postedAsDoc[vk]; return; }
        if (opts.postings && !have[recs[0].src.id]) fixBill(recs, id, vk, label);
        return;
      }
      var its = L.filter(function (l) { return num(l.AMOUNT) || num(l.TAXBASE) || num(l.QNTY); }).map(function (l) {
        var base = r2(num(l.TAXBASE) || num(l.AMOUNT) - num(l.DISCAMT)), qty = num(l.QNTY), rate = num(l.RATE), mi = items[+l.ITEMID];
        if (!qty) { qty = 1; rate = base; }
        if (Math.abs(qty * rate - base) >= 0.01) rate = Math.round(base / qty * 10000) / 10000;   /* the line's taxable value is what counts */
        var g = num(l.IGSTPER) || r2(num(l.SGSTPER) + num(l.CGSTPER));
        if (!num(h.SGSTAMOUNT) && !num(h.CGSTAMOUNT) && !num(h.IGSTAMOUNT)) g = 0;
        return { desc: t(l.ITEM) || (mi && mi.desc) || (+h.ETYPE === 1 ? acct(l.ACCODE).name : 'Item'), hsn: t(l.HSNCODE) || (mi && mi.hsn) || '', qty: qty, unit: t(l.UNIT) || (mi && mi.unit) || '', rate: rate, disc: '', gst: g };
      });
      var base = { no: no, date: date, notes: notes, items: its, charges: [], round: false, src: src(id) };
      /* TCS collected (sales) or paid (purchases): NSBiz's own TCS, at ZEEFA's rate; the paise follow ZEEFA through the posting fix */
      if (num(h.TCSAMT) && (as === 'sale' || as === 'buy')) {
        var tb = r2(num(h.TAMOUNT) + num(h.SGSTAMOUNT) + num(h.CGSTAMOUNT) + num(h.IGSTAMOUNT));
        base.tcs = { on: true, rate: num(h.TCSP) || (tb ? Math.round(num(h.TCSAMT) / tb * 100000) / 1000 : 0), nopanOk: true };
      } else if (num(h.TCSAMT)) base.charges.push({ name: 'TCS', amt: r2(num(h.TCSAMT)), gst: 0 });
      var d, gstOn = its.some(function (x) { return x.gst; });
      if (as === 'sale') {
        d = Object.assign(base, { type: 'invoice', kind: gstOn ? 'tax' : 'supply', buyer: party, due: h.DUEDATE || '', pos: party.state, rc: false, withGst: gstOn, status: 'unpaid', comp: true, copies: 1, paper: 'a4', design: 'classic' });
        if (t(h.IRNNO)) d.irn = { irn: t(h.IRNNO), ack: t(h.ACKNO), ackDt: t(h.ACKDATE) };
        if (t(h.VEHNO) || t(h.TRANSPORT)) d.disp = { veh: t(h.VEHNO), through: t(h.TRANSPORT), lr: t(h.GRNO) };
      } else if (as === 'buy') {
        d = Object.assign(base, { type: 'pbill', kind: 'bill', buyer: party, noGst: !gstOn, bdate: h.RDATE || '' });
      } else {
        var credit = as === 'scred' || as === 'pcred', sale = as === 'scred' || as === 'sdeb';
        d = Object.assign(base, { type: 'note', kind: credit ? 'credit' : 'debit', side: sale ? 'sale' : 'purchase', reason: +h.DNCNTYPE === 0 && its.some(function (x) { return x.hsn && !/^99/.test(x.hsn); }) ? 'ret' : 'other', buyer: party, orig: t(h.REFINVNO), origDate: h.REFINVDATE || '' });
        if (t(h.IRNNO)) d.irn = { irn: t(h.IRNNO), ack: t(h.ACKNO), ackDt: t(h.ACKDATE) };
      }
      /* the bill total is ZEEFA's TOTAL: up to a rupee is round off (NSBooks posts total - lines to round-off), more is an adjustment */
      var want = r2(num(h.TOTAL));
      if (tot && want) {
        var got = tot(Object.assign({}, d, { total: null })).total, gap = r2(want - got);
        if (Math.abs(gap) > 1) { d.charges.push({ name: 'Adjustment (ZEEFA)', amt: gap, gst: 0 }); warn.push({ w: 'billgap', id: id, amt: gap }); }
      }
      d.total = want || (tot ? tot(Object.assign({}, d, { total: null })).total : 0);
      if (party.posFix) { if (d.type === 'invoice' || d.type === 'note' && d.side === 'sale') d.pos = party.posFix; else d.buyer = Object.assign({}, d.buyer, { state: party.posFix }); }
      delete d.buyer.posFix;
      add(d);
      if (opts.postings && !have[d.src.id]) fixBill([d], id, vk, label);
    });

    /* a bill must post exactly what ZEEFA posted: NSBiz's own lines for it against ZEEFA's LEDGER rows of that voucher, account by
       account (input and output GST as one, as ZEEFA keeps them); any difference is a small journal dated with the bill */
    function fixBill(ds, id, vk, label) {
      var d = ds[0], want2 = {}, got2 = {};
      (LG[vk] || []).forEach(function (r) { var m = acct(r.PCODE), k = same(m.k); want2[k] = r2((want2[k] || 0) + amt(r)); });
      ds.forEach(function (x) { opts.postings(x).forEach(function (l) { var k = same(l.a); got2[k] = r2((got2[k] || 0) + l.dr - l.cr); }); });
      var ls = [], keys = {};
      Object.keys(want2).concat(Object.keys(got2)).forEach(function (k) { keys[k] = 1; });
      Object.keys(keys).forEach(function (k) {
        var diff = r2((want2[k] || 0) - (got2[k] || 0)); if (Math.abs(diff) < 0.005) return;
        var m = null; Object.keys(M).some(function (c) { if (same(M[c].k) === k) { m = M[c]; return true; } return false; });
        ls.push(m ? lineOf(m, diff > 0 ? diff : 0, diff < 0 ? -diff : 0) : { a: k, dr: diff > 0 ? diff : 0, cr: diff < 0 ? -diff : 0 });
      });
      if (!ls.length) return;
      var sum = ls.reduce(function (a, l) { return r2(a + l.dr - l.cr); }, 0);
      if (Math.abs(sum) >= 0.005) ls.push({ a: 'round-off', dr: sum < 0 ? -sum : 0, cr: sum > 0 ? sum : 0 });
      out.fixed = (out.fixed || 0) + 1;
      add({ type: 'jv', no: label + ' (ZEEFA)', date: d.date, lines: ls, narr: 'ZEEFA posting of ' + label, fixOf: d.src.id, src: src(id + '#fix') });
    }

    /* every other voucher (bank, cash, journal, TDS, any bill left out above): a journal of ZEEFA's own ledger lines */
    var NAMES = { B: 'Bank', V: 'Cash', J: 'Journal', TDS: 'TDS' };
    Object.keys(LG).forEach(function (gk) {
      if (postedAsDoc[gk]) return;
      var rows = LG[gk], e = t(rows[0].ENTRYID).toUpperCase(), date = rows.reduce(function (m, r) { return !m || r.EDATE < m ? r.EDATE : m; }, ''), vn = +rows[0].VNUMBER || 0, id = e + '/' + date + '/' + vn;
      var ls = [], narr = t(rows[0].NARRATION);
      rows.sort(function (a, b) { return (+a.ISNO || 0) - (+b.ISNO || 0); }).forEach(function (r) { var d = amt(r); if (!d) return; var l = lineOf(acct(r.PCODE), d > 0 ? d : 0, d < 0 ? -d : 0, t(r.NARRATION) !== narr ? t(r.NARRATION) : ''); if (l) ls.push(l); });
      var s = ls.reduce(function (a, l) { return r2(a + l.dr - l.cr); }, 0);
      if (s) { ls.push({ a: 'ocl:zeefa difference', dr: s < 0 ? -s : 0, cr: s > 0 ? s : 0 }); warn.push({ w: 'onesided', id: id, amt: s }); }
      if (!ls.length) return;
      add({ type: 'jv', no: (NAMES[e] || e) + ' ' + (t(rows[0].REFNO) || vn), date: date, lines: ls, narr: narr, zftype: e, src: src(id) });
    });

    /* opening balances (only for the first year brought into a business) */
    if (!opts.noOpening) {
      var rest = [];
      (T.ACCOUNTS || []).forEach(function (a) {
        var m = acct(a.PCODE), v = ob(a); if (!v) return;
        var oid = 'OB/' + key(m.party || m.name);
        if (m.party) add({ type: 'ob', date: firstDay, side: v > 0 ? 'recv' : 'pay', amount: Math.abs(v), buyer: { name: m.party }, no: '', total: Math.abs(v), src: src(oid) });
        else if (m.k === 'cash' || /^bank:/.test(m.k)) add({ type: 'ob', date: firstDay, side: m.k === 'cash' ? 'cash' : 'bank', bacct: m.k === 'cash' ? '' : m.k, amount: v, buyer: { name: '' }, no: '', total: Math.abs(v), src: src(oid) });
        else rest.push(lineOf(m, v > 0 ? v : 0, v < 0 ? -v : 0));
      });
      if (rest.length) {
        var s2 = rest.reduce(function (s, l) { return r2(s + l.dr - l.cr); }, 0);
        if (s2) rest.push({ a: 'opening', dr: s2 < 0 ? -s2 : 0, cr: s2 > 0 ? s2 : 0 });
        add({ type: 'jv', no: 'Opening', date: firstDay, lines: rest, narr: 'Opening balances from ZEEFA', src: src('OB/ledgers') });
      }
      var stk = (T.ITEMS || []).filter(function (it) { return num(it.OBAL) > 0; }).map(function (it) {
        var q = num(it.OBAL), v2 = num(it.OVALUE); return { desc: t(it.INAME) || t(it.ICODE), unit: t(it.UNIT), qty: q, rate: v2 ? Math.round(v2 / q * 10000) / 10000 : num(it.ORATE) || num(it.PRATE) };
      });
      if (stk.length && firstDay) add({ type: 'stk', kind: 'open', no: 'OPEN/ZEEFA', date: firstDay, gd: '', note: 'Opening stock from ZEEFA', lines: stk, src: src('OB/stock') });
    }
    /* a later year (opts.prior = NSBiz balances of everything brought in before): what ZEEFA changed when it opened this year comes in
       as one journal on the first day. Left out and only reported: capital (the earlier years' profit, which NSBiz moves at its own
       Year end) and stock accounts (NSBiz values stock from the items). The journal balances against the main capital account. */
    if (opts.prior && opts.noOpening) {
      var CRY = carry(J, { map: M }, opts.prior), yl = [], capK = '', capV = 0;
      Object.keys(M).forEach(function (c) { if (/^cap:/.test(M[c].k)) { var v3 = Math.abs(opts.prior[M[c].k] || 0); if (!capK || v3 > capV) { capK = M[c].k; capV = v3; } } });
      CRY.rows.forEach(function (r) {
        if (!r.diff || /^(cap:|drw:)/.test(r.k) || /stock/.test(key(r.name))) return;
        var m = null; Object.keys(M).some(function (c) { if (same(M[c].k) === r.k) { m = M[c]; return true; } return false; });
        var d2 = -r.diff; yl.push(m ? lineOf(m, d2 > 0 ? d2 : 0, d2 < 0 ? -d2 : 0) : { a: r.k, dr: d2 > 0 ? d2 : 0, cr: d2 < 0 ? -d2 : 0 });
      });
      if (yl.length) {
        var ys = yl.reduce(function (a, l) { return r2(a + l.dr - l.cr); }, 0);
        if (ys) yl.push({ a: capK || 'opening', dr: ys < 0 ? -ys : 0, cr: ys > 0 ? ys : 0 });
        add({ type: 'jv', no: 'Year start (ZEEFA)', date: firstDay, lines: yl, narr: 'Changes ZEEFA made when it opened this year', src: src('YS/' + co) });
        out.yearStart = yl.length;
      }
    }
    out.docs.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return out;
  }

  /* ---------- the check: every NSBiz account against ZEEFA's own postings (+ its opening balances in the first year) ---------- */
  function check(J, P, books0, opts) {
    opts = opts || {};
    var T = tablesOf(J), zf = {}, names = {}, books = {};
    Object.keys(books0).forEach(function (k) { var c = same(k); books[c] = r2((books[c] || 0) + books0[k]); });
    function put(code, v) { var m = P.map[+code]; if (!m || !v) return; var k = same(m.k); zf[k] = r2((zf[k] || 0) + v); names[k] = names[k] || m.name; }
    if (!opts.noOpening) (T.ACCOUNTS || []).forEach(function (a) { put(a.PCODE, ob(a)); });
    (T.LEDGER || []).forEach(function (l) { put(l.PCODE, amt(l)); });
    var rows = [], ok = 0, bad = 0, all = {};
    Object.keys(zf).concat(Object.keys(books)).forEach(function (k) { all[k] = 1; });
    Object.keys(all).forEach(function (k) {
      if (k === 'opening') return;
      var e = r2(zf[k] || 0), n = r2(books[k] || 0), d = r2(n - e); if (!e && !n) return;
      if (Math.abs(d) < 0.01) ok++; else bad++;
      rows.push({ k: k, name: names[k] || k, zeefa: e, nsbiz: n, diff: d });
    });
    rows.sort(function (a, b) { return Math.abs(b.diff) - Math.abs(a.diff); });
    return { rows: rows, ok: ok, bad: bad };
  }

  /* a later year: ZEEFA's opening balances (OBAL) against NSBiz's closing of the years before, balance-sheet accounts only */
  var PL = /^(sales|purchases|round-off|exp:|inc:|sales-return|purchase-return)/;
  function carry(J, P, prior) {
    var T = tablesOf(J), zf = {}, names = {}, nb = {};
    Object.keys(prior).forEach(function (k) { var c = same(k); if (!PL.test(c)) nb[c] = r2((nb[c] || 0) + prior[k]); });
    (T.ACCOUNTS || []).forEach(function (a) { var m = P.map[+a.PCODE], v = ob(a); if (!m || !v) return; var k = same(m.k); if (PL.test(k)) return; zf[k] = r2((zf[k] || 0) + v); names[k] = names[k] || m.name; });
    var rows = [], ok = 0, bad = 0, all = {};
    Object.keys(zf).concat(Object.keys(nb)).forEach(function (k) { all[k] = 1; });
    Object.keys(all).forEach(function (k) {
      if (k === 'opening') return;
      var e = r2(zf[k] || 0), n = r2(nb[k] || 0), d = r2(n - e); if (!e && !n) return;
      if (Math.abs(d) < 0.01) ok++; else bad++;
      rows.push({ k: k, name: names[k] || k, zeefa: e, nsbiz: n, diff: d });
    });
    rows.sort(function (a, b) { return Math.abs(b.diff) - Math.abs(a.diff); });
    return { rows: rows, ok: ok, bad: bad };
  }

  /* our own state: the state of the parties on bills that charged CGST + SGST, the most common one */
  /* the accounts of a plan by name, for the next year's opts.known */
  function known(P, into) { into = into || {}; Object.keys(P.map || {}).forEach(function (c) { var m = P.map[c]; if (m.name && !into[key(m.name)]) into[key(m.name)] = m; }); return into; }
  function ownState(J) {
    var T = tablesOf(J), acc = {}, c = {}; (T.ACCOUNTS || []).forEach(function (a) { acc[+a.PCODE] = a; });
    (T.GSTMAIN || []).forEach(function (h) { if (h.CUT === true || !(num(h.SGSTAMOUNT) > 0) || num(h.IGSTAMOUNT) > 0) return; var s = stateOf(acc[+h.ACCODE] || {}); if (s) c[s] = (c[s] || 0) + 1; });
    return Object.keys(c).sort(function (x, y) { return c[y] - c[x]; })[0] || '';
  }
  /* a chosen file: is it a ZEEFA file for NSBiz? -> { co, year, file } or null */
  function info(J) {
    if (!J || J.format !== 'zeefa-for-nsbiz' || !J.tables || !J.tables.ACCOUNTS) return null;
    var y = t(J.year), f = t(J.file), m = f.match(/^([A-Za-z]+)(\d{2})(\d{2})$/);
    if (!y && m) y = '20' + m[2] + '-' + m[3];
    return { co: t(J.co) || (m ? m[1].toUpperCase() : f || 'ZEEFA'), year: y, file: f || t(J.co) + y, id: f || t(J.co) + y };
  }
  var API = { plan: plan, carry: carry, check: check, ownState: ownState, info: info, known: known, accountsMap: accountsMap, BOOKS: BOOKS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.NSZeefa = API;
})(typeof window !== 'undefined' ? window : this);

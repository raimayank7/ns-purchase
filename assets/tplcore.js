/* NSTpl: NSBiz's own import templates (Excel) and any sheet of rows -> NSBiz records. Pure, no screen: the import screen
   ("Bring data from other software", migrate.js), the database route (SQL Server / ODBC through NSBiz for Windows) and Node tests use it.

   Six sheets, one per kind of data, each with a heading row (the template's own headings, or any headings matched to them once and
   remembered: see layout()): Parties, Items, Opening balances, Sales bills, Purchase bills, Receipts and payments; plus "How to fill".
   Bills are one row per item line; the rows of one bill share its bill number (or leave it empty under the first row).
   Out: the same shape as the Tally and Evershine imports ({ parties, items, groups, banks, docs, warn, counts, skipped, left }), so
   the screen's preview, saving and "Take it out again" work unchanged. Every record carries src = { sw, co, id }: a second import of
   the same file brings only what is new. check(): every total of the file against the books NSBiz would make, before saving.
   Designed & Developed by: Nivesh Sahayak (https://www.niveshsahayak.in/) */
(function (G) {
  'use strict';
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function r2(n) { return Math.round((+n + Number.EPSILON) * 100) / 100; }
  function t(s) { return String(s == null ? '' : s).trim(); }
  function hk(s) { return key(s).replace(/[^a-z0-9%]+/g, ''); }   /* heading key: "Bill No." = "billno" */

  /* ---------- the sheets and their columns ---------- k: field, h: heading, need: must be filled, w: what to type, ex: example, a: other headings ---------- */
  var SHEETS = [
    { k: 'parties', name: 'Parties', w: 'Your customers and suppliers. One row each.', cols: [
      { k: 'name', h: 'Name', need: 1, w: 'Name as on their bills', ex: 'Garg Traders', a: ['party', 'party name', 'customer', 'supplier', 'account name', 'ledger', 'cardname'] },
      { k: 'type', h: 'Customer or supplier', w: 'Customer, Supplier or Both (empty = Customer)', ex: 'Customer', a: ['type', 'role', 'party type'] },
      { k: 'group', h: 'Group', w: 'Your own group name, if any (Ludhiana parties, Dealers)', ex: 'Ludhiana dealers', a: ['party group', 'under'] },
      { k: 'gstin', h: 'GSTIN', w: '15 characters, if registered', ex: '03AAACG1234A1Z5', a: ['gst no', 'gst number', 'gstin/uin', 'gst', 'vat'] },
      { k: 'state', h: 'State', w: 'State name or GST state code (empty = from the GSTIN)', ex: 'Punjab', a: ['state name', 'state code'] },
      { k: 'addr', h: 'Address', w: 'Street, area', ex: '12 Mall Road', a: ['address 1', 'address1', 'street'] },
      { k: 'city', h: 'City', w: '', ex: 'Ludhiana', a: ['town', 'place'] },
      { k: 'pin', h: 'PIN code', w: '6 digits', ex: '141001', a: ['pin', 'pincode', 'zip', 'zip code', 'postal code'] },
      { k: 'phone', h: 'Phone', w: 'Mobile or phone', ex: '9876543210', a: ['mobile', 'phone no', 'contact', 'mobile no'] },
      { k: 'email', h: 'Email', w: '', ex: 'garg@example.com', a: ['e-mail', 'email id', 'mail'] },
      { k: 'cdays', h: 'Credit days', w: 'Days you allow for payment', ex: '30', a: ['credit period', 'due days', 'payment terms'] },
      { k: 'climit', h: 'Credit limit', w: 'Rupees', ex: '200000', a: [] },
      { k: 'obal', h: 'Opening balance', w: 'What they owed you (or you owed them) on the first day', ex: '5000', a: ['opening', 'balance', 'op balance', 'opening amount'] },
      { k: 'odrcr', h: 'Dr or Cr', w: 'Dr = they owe you, Cr = you owe them (empty: customers Dr, suppliers Cr)', ex: 'Dr', a: ['drcr', 'dr/cr', 'balance type'] }] },
    { k: 'items', name: 'Items', w: 'Goods and services you sell or buy. One row each.', cols: [
      { k: 'name', h: 'Item name', need: 1, w: '', ex: 'MS Pipe 1 inch', a: ['item', 'name', 'product', 'description', 'stock item', 'itemname'] },
      { k: 'kind', h: 'Goods or service', w: 'Goods or Service (empty = Goods)', ex: 'Goods', a: ['type', 'item type'] },
      { k: 'hsn', h: 'HSN or SAC', w: 'HSN for goods, SAC for services', ex: '7306', a: ['hsn', 'sac', 'hsn code', 'hsn/sac'] },
      { k: 'unit', h: 'Unit', w: 'Nos, Kgs, Box, Mtr...', ex: 'Kgs', a: ['uom', 'units', 'unit of measure'] },
      { k: 'gst', h: 'GST %', w: '0, 5, 12, 18, 28 or 40', ex: '18', a: ['gst rate', 'tax %', 'gst%', 'rate of tax', 'igst %'] },
      { k: 'rate', h: 'Sale rate', w: 'Rupees per unit, before GST', ex: '95', a: ['sale price', 'selling rate', 'price', 'mrp', 'rate'] },
      { k: 'prate', h: 'Purchase rate', w: 'Rupees per unit, before GST', ex: '80', a: ['purchase price', 'cost', 'cost price'] },
      { k: 'oqty', h: 'Opening quantity', w: 'Stock on the first day', ex: '50', a: ['opening qty', 'op qty', 'opening stock'] },
      { k: 'orate', h: 'Opening rate', w: 'Cost per unit of that stock', ex: '80', a: ['opening value rate', 'op rate'] }] },
    { k: 'openings', name: 'Opening balances', w: 'Balances on the first day of every other account: cash, banks, capital, loans, assets. Parties and stock have theirs on their own sheets.', cols: [
      { k: 'acct', h: 'Account', need: 1, w: 'Account name', ex: 'HDFC Bank', a: ['account name', 'ledger', 'name', 'particulars'] },
      { k: 'type', h: 'Kind of account', need: 1, w: 'Cash, Bank, Capital, Loan taken, Loan given, Fixed asset, Other asset, Other liability, Customer, Supplier', ex: 'Bank', a: ['type', 'group', 'account type'] },
      { k: 'amt', h: 'Amount', need: 1, w: 'Rupees', ex: '50000', a: ['balance', 'opening balance', 'amount rs'] },
      { k: 'drcr', h: 'Dr or Cr', need: 1, w: 'Dr (asset, cash, bank) or Cr (capital, loan taken)', ex: 'Dr', a: ['drcr', 'dr/cr'] },
      { k: 'date', h: 'As on date', w: 'The first day of your books (empty = start of the financial year of your first bill)', ex: '01-04-2026', a: ['date', 'as on'] }] },
    { k: 'sales', name: 'Sales bills', w: 'Sale bills and sale returns (credit notes). One row for every item line; the bill number repeats on each line of the same bill.', cols: [
      { k: 'no', h: 'Bill no', need: 1, w: 'Your bill number', ex: 'INV/101', a: ['invoice no', 'bill number', 'voucher no', 'vch no', 'inv no', 'invoice number', 'docnum'] },
      { k: 'date', h: 'Date', need: 1, w: 'Bill date', ex: '10-04-2026', a: ['bill date', 'invoice date', 'voucher date', 'docdate', 'posting date'] },
      { k: 'party', h: 'Party', need: 1, w: 'Customer name (empty = Cash sale)', ex: 'Garg Traders', a: ['customer', 'party name', 'buyer', 'customer name', 'cardname', 'billed to'] },
      { k: 'gstin', h: 'Party GSTIN', w: 'Only for a party not on the Parties sheet', ex: '03AAACG1234A1Z5', a: ['gstin', 'customer gstin', 'buyer gstin'] },
      { k: 'pos', h: 'Place of supply', w: 'State name or code (empty = the party\'s state)', ex: 'Punjab', a: ['pos', 'state', 'supply state'] },
      { k: 'item', h: 'Item', need: 1, w: 'Item or service name', ex: 'MS Pipe 1 inch', a: ['item name', 'description', 'product', 'particulars', 'stock item', 'dscription'] },
      { k: 'hsn', h: 'HSN or SAC', w: '', ex: '7306', a: ['hsn', 'sac', 'hsn code'] },
      { k: 'qty', h: 'Qty', w: 'Empty = 1', ex: '10', a: ['quantity', 'qnty'] },
      { k: 'unit', h: 'Unit', w: '', ex: 'Kgs', a: ['uom', 'unitmsr'] },
      { k: 'rate', h: 'Rate', need: 1, w: 'Per unit, before GST', ex: '100', a: ['price', 'unit price', 'rate per unit', 'pricebefdi'] },
      { k: 'disc', h: 'Discount %', w: '', ex: '', a: ['disc %', 'discount', 'disc', 'discprcnt'] },
      { k: 'gst', h: 'GST %', w: '0, 5, 12, 18, 28 or 40', ex: '18', a: ['gst rate', 'tax %', 'igst %', 'vatprcnt', 'gst%'] },
      { k: 'kind', h: 'Kind', w: 'Tax invoice, Bill of supply or Credit note (empty = Tax invoice)', ex: 'Tax invoice', a: ['bill type', 'type', 'voucher type'] },
      { k: 'against', h: 'Against bill no', w: 'For a credit note: the bill it returns', ex: '', a: ['original bill', 'ref bill', 'reference'] },
      { k: 'total', h: 'Bill total', w: 'The bill\'s total with GST, on its first row; checked against the lines', ex: '1180', a: ['grand total', 'invoice total', 'net amount', 'doctotal', 'total amount'] },
      { k: 'narr', h: 'Narration', w: '', ex: '', a: ['remarks', 'notes', 'comments'] }] },
    { k: 'purchases', name: 'Purchase bills', w: 'Purchase bills and purchase returns (debit notes). One row for every item line.', cols: [
      { k: 'no', h: 'Supplier bill no', need: 1, w: 'The number on the supplier\'s bill', ex: 'DS/55', a: ['bill no', 'invoice no', 'supplier invoice no', 'ref no', 'numatcard', 'vendor bill no'] },
      { k: 'date', h: 'Date', need: 1, w: 'Supplier bill date', ex: '12-04-2026', a: ['bill date', 'invoice date', 'docdate'] },
      { k: 'party', h: 'Supplier', need: 1, w: 'Supplier name', ex: 'Delhi Steels Pvt Ltd', a: ['party', 'party name', 'vendor', 'supplier name', 'cardname'] },
      { k: 'gstin', h: 'Supplier GSTIN', w: 'Only for a supplier not on the Parties sheet', ex: '07AAACD9999B1Z2', a: ['gstin', 'party gstin', 'vendor gstin'] },
      { k: 'item', h: 'Item', need: 1, w: '', ex: 'MS Pipe 1 inch', a: ['item name', 'description', 'product', 'particulars', 'dscription'] },
      { k: 'hsn', h: 'HSN or SAC', w: '', ex: '7306', a: ['hsn', 'sac'] },
      { k: 'qty', h: 'Qty', w: 'Empty = 1', ex: '10', a: ['quantity'] },
      { k: 'unit', h: 'Unit', w: '', ex: 'Kgs', a: ['uom', 'unitmsr'] },
      { k: 'rate', h: 'Rate', need: 1, w: 'Per unit, before GST', ex: '100', a: ['price', 'unit price', 'pricebefdi'] },
      { k: 'disc', h: 'Discount %', w: '', ex: '', a: ['disc %', 'discount', 'discprcnt'] },
      { k: 'gst', h: 'GST %', w: '', ex: '18', a: ['gst rate', 'tax %', 'vatprcnt'] },
      { k: 'kind', h: 'Kind', w: 'Purchase or Return (debit note) (empty = Purchase)', ex: 'Purchase', a: ['type', 'bill type', 'voucher type'] },
      { k: 'against', h: 'Against bill no', w: 'For a return: the supplier bill it returns', ex: '', a: ['original bill', 'reference'] },
      { k: 'vno', h: 'Our entry no', w: 'Your own number for the entry, if any', ex: 'P/7', a: ['voucher no', 'entry no', 'docnum'] },
      { k: 'total', h: 'Bill total', w: 'The bill\'s total with GST, on its first row', ex: '1230', a: ['grand total', 'invoice total', 'doctotal'] },
      { k: 'narr', h: 'Narration', w: '', ex: '', a: ['remarks', 'notes'] }] },
    { k: 'money', name: 'Receipts and payments', w: 'Money received and paid. One row each. For an expense paid (rent, salary) leave Party empty and write the expense in Account.', cols: [
      { k: 'date', h: 'Date', need: 1, w: '', ex: '20-04-2026', a: ['voucher date', 'docdate', 'posting date'] },
      { k: 'dir', h: 'Received or paid', need: 1, w: 'Received or Paid', ex: 'Received', a: ['type', 'in or out', 'receipt or payment', 'voucher type', 'payment type'] },
      { k: 'party', h: 'Party', w: 'Customer or supplier', ex: 'Garg Traders', a: ['party name', 'customer', 'supplier', 'cardname', 'name'] },
      { k: 'acct', h: 'Account', w: 'When there is no party: Rent, Salary, Interest received...', ex: '', a: ['expense', 'head', 'account head', 'ledger'] },
      { k: 'amt', h: 'Amount', need: 1, w: 'Rupees', ex: '900', a: ['amount rs', 'paid amount', 'received amount', 'doctotal'] },
      { k: 'mode', h: 'Mode', w: 'Cash, Bank, UPI, Cheque or Card (empty = Cash)', ex: 'Bank', a: ['payment mode', 'mode of payment', 'by'] },
      { k: 'bank', h: 'Bank account', w: 'Which bank (when you have more than one)', ex: 'HDFC Bank', a: ['bank', 'bank name'] },
      { k: 'against', h: 'Against bill no', w: 'The bill it pays', ex: 'INV/101', a: ['bill no', 'against', 'invoice no'] },
      { k: 'ref', h: 'Cheque or reference no', w: '', ex: 'UTR 123456', a: ['cheque no', 'reference', 'ref no', 'utr'] },
      { k: 'narr', h: 'Narration', w: '', ex: '', a: ['remarks', 'notes'] }] }
  ];
  var BYK = {}; SHEETS.forEach(function (s) { BYK[s.k] = s; });
  /* the sheet a name stands for (the template's own names and the usual words people use) */
  var SHEETWORDS = { parties: /part(y|ies)|customer|supplier|debtor|creditor|ledger/, items: /item|product|stock|goods/, openings: /opening/, sales: /sale|invoice/, purchases: /purchase|buy/, money: /receipt|payment|money|cash|bank/ };

  /* ---------- the blank template: [sheet name, rows, widths, style] for NS.xlsx.write ---------- */
  function template() {
    var how = [['Sheet', 'Column', 'Must fill', 'What to type', 'Example']];
    how.push(['', '', '', 'Fill the sheets you need and leave the others empty. Keep the heading row as it is. Dates as 25-04-2026; amounts without commas or Rs. Then: NSBiz > Utilities > Bring data from other software > NSBiz template > Choose the file.', '']);
    SHEETS.forEach(function (s) {
      how.push([s.name, '', '', s.w, '']);
      s.cols.forEach(function (c) { how.push(['', c.h, c.need ? 'Yes' : '', c.w, c.ex]); });
    });
    var out = [['How to fill', how, [20, 26, 10, 80, 22], 'wrap']];
    SHEETS.forEach(function (s) { out.push([s.name, [s.cols.map(function (c) { return c.h; })], s.cols.map(function (c) { return Math.max(12, Math.min(28, c.h.length + 4)); })]); });
    return out;
  }

  /* ---------- reading a sheet: where the headings are and which column is which ---------- */
  function fieldOf(sheet, heading) {
    var h = hk(heading); if (!h) return '';
    var f = ''; BYK[sheet].cols.some(function (c) { if (hk(c.h) === h || (c.a || []).some(function (a) { return hk(a) === h; })) { f = c.k; return true; } return false; }); return f;
  }
  /* the headings of a sheet as a signature: a remembered layout is used again for a file with the same headings */
  function sig(heads) { return heads.map(hk).filter(Boolean).join('|'); }
  /* which kind of data a sheet holds, the heading row and the column of each field; saved = remembered layouts { sig: { kind, map } } */
  function layout(name, rows, saved) {
    var best = null;
    for (var r = 0; r < Math.min(rows.length, 15); r++) {
      var heads = rows[r] || [], s = sig(heads);
      if (saved && s && saved[s]) return { kind: saved[s].kind, row: r, map: saved[s].map, sig: s, heads: heads, remembered: true };
      SHEETS.forEach(function (S) {
        var map = {}, n = 0, need = 0;
        heads.forEach(function (h, i) { var f = fieldOf(S.k, h); if (f && !(f in map)) { map[f] = i; n++; if (S.cols.some(function (c) { return c.k === f && c.need; })) need++; } });
        var score = n + need * 2 + (SHEETWORDS[S.k].test(key(name)) ? 3 : 0) + (key(name) === key(S.name) ? 10 : 0);
        if (n >= 2 && (!best || score > best.score)) best = { kind: S.k, row: r, map: map, sig: s, heads: heads, score: score };
      });
    }
    return best;
  }
  /* rows of a sheet -> objects by field, with the sheet's row number for messages */
  function objects(rows, L) {
    var out = [];
    for (var r = L.row + 1; r < rows.length; r++) {
      var row = rows[r] || [], o = { _r: r + 1 }, any = false;
      Object.keys(L.map).forEach(function (f) { var v = t(row[L.map[f]]); o[f] = v; if (v) any = true; });
      if (any) out.push(o);
    }
    return out;
  }

  /* ---------- values ---------- */
  var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  /* 25-04-2026, 25/04/26, 2026-04-25, 25-Apr-2026, 25.04.2026, an Excel day number (46137) or 2026-04-25 00:00:00 */
  function date(s) { var d = date0(s); return d && real(d) ? d : ''; }
  function real(d) { var x = new Date(d + 'T00:00:00Z'); return !isNaN(x) && x.toISOString().slice(0, 10) === d && +d.slice(0, 4) > 1950 && +d.slice(0, 4) < 2100; }
  function date0(s) {
    s = t(s); if (!s) return '';
    var m;
    if (/^\d{5}(\.\d+)?$/.test(s)) { var d = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 864e5); return d.toISOString().slice(0, 10); }
    if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
    if ((m = s.match(/^(\d{1,2})[-\/. ]([A-Za-z]{3})[A-Za-z]*[-\/. ,]+(\d{2,4})$/)) && MON[m[2].toLowerCase()]) return yr(m[3]) + '-' + pad(MON[m[2].toLowerCase()]) + '-' + pad(+m[1]);
    if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/))) return yr(m[3]) + '-' + pad(+m[2]) + '-' + pad(+m[1]);
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return m[1] + '-' + m[2] + '-' + m[3];
    return '';
    function yr(y) { y = +y; return y < 100 ? 2000 + y : y; }
  }
  /* 1,23,456.50 / Rs 500 / 500 Dr / (500) -> number; Dr / Cr found in the text comes back in .side */
  function amt(s) {
    s = t(s); if (!s) return { v: 0, side: '' };
    var side = /\bcr\b/i.test(s) ? 'cr' : /\bdr\b/i.test(s) ? 'dr' : '', neg = /^\(.*\)$/.test(s) || /^-/.test(s);
    var m = s.replace(/,/g, '').match(/\d+(\.\d+)?|\.\d+/), n = m ? parseFloat(m[0]) : 0; if (!isFinite(n)) n = 0;
    return { v: neg ? -n : n, side: side };
  }
  function num(s) { return amt(s).v; }
  var STATES = { 'jammu and kashmir': '01', 'himachal pradesh': '02', 'punjab': '03', 'chandigarh': '04', 'uttarakhand': '05', 'haryana': '06', 'delhi': '07', 'rajasthan': '08', 'uttar pradesh': '09',
    'bihar': '10', 'sikkim': '11', 'arunachal pradesh': '12', 'nagaland': '13', 'manipur': '14', 'mizoram': '15', 'tripura': '16', 'meghalaya': '17', 'assam': '18', 'west bengal': '19', 'jharkhand': '20',
    'odisha': '21', 'orissa': '21', 'chhattisgarh': '22', 'madhya pradesh': '23', 'gujarat': '24', 'daman and diu': '26', 'dadra and nagar haveli': '26', 'dadra and nagar haveli and daman and diu': '26',
    'maharashtra': '27', 'karnataka': '29', 'goa': '30', 'lakshadweep': '31', 'kerala': '32', 'tamil nadu': '33', 'puducherry': '34', 'pondicherry': '34', 'andaman and nicobar islands': '35',
    'telangana': '36', 'andhra pradesh': '37', 'ladakh': '38', 'other territory': '97', 'outside india': '96' };
  function stateCode(s, gstin) {
    var k = key(s).replace(/&/g, 'and'), m = k.match(/^(\d{1,2})\b/);
    if (m) return pad(+m[1]);
    if (STATES[k]) return STATES[k];
    var g = t(gstin).toUpperCase(); return /^\d{2}/.test(g) ? g.slice(0, 2) : '';
  }
  var RATES = [0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40];
  /* a rate worked out from totals (17.99 from a database's tax / value) is the GST rate it is nearest to, when within 0.2 */
  function rate(v) { var g = num(v); if (RATES.indexOf(g) >= 0) return g; var n = RATES.filter(function (x) { return Math.abs(x - g) <= 0.2; })[0]; return n == null ? g : n; }

  /* ---------- a whole workbook (or the rows a database query gave) -> data by kind ----------
     book: [{ name, rows: [[...], ...] }]; opts.layouts: remembered layouts; opts.force { sheetName: { kind, map, row } } from the column screen */
  function read(book, opts) {
    opts = opts || {};
    var D = { parties: [], items: [], openings: [], sales: [], purchases: [], money: [] }, found = [], probs = [];
    (book || []).forEach(function (sh) {
      if (key(sh.name) === 'how to fill') return;
      var L = (opts.force && opts.force[sh.name]) || layout(sh.name, sh.rows || [], opts.layouts);
      if (!L) { if ((sh.rows || []).length > 1) found.push({ name: sh.name, kind: '', rows: sh.rows.length, heads: (sh.rows[0] || []).slice(0, 30) }); return; }
      var objs = objects(sh.rows, L), S = BYK[L.kind];
      var miss = S.cols.filter(function (c) { return c.need && !(c.k in L.map); }).map(function (c) { return c.h; });
      found.push({ name: sh.name, kind: L.kind, rows: objs.length, map: L.map, sig: L.sig, heads: L.heads, headRow: L.row, remembered: !!L.remembered, missing: miss });
      if (miss.length && objs.length) { probs.push({ sheet: sh.name, row: L.row + 1, msg: 'No column for ' + miss.join(', ') + ': choose it with Columns.' }); return; }
      objs.forEach(function (o) { o._s = sh.name; D[L.kind].push(o); });
    });
    D.found = found; D.probs = probs;
    return D;
  }

  /* ---------- data -> NSBiz records ----------
     opts: { co (source name for src), sw ('excel'|'sql'...), seller { name, state }, totals (NSBooks.itemTotals), postings (NSBooks.postings),
     have { src.id: 1 } (already in NSBiz), noOpening, from (first day), partiesHave { key(name): party } (already in NSBiz) } */
  function plan(D, opts) {
    opts = opts || {};
    var sw = opts.sw || 'excel', co = opts.co || 'file', seller = opts.seller || { name: 'My business', state: '' }, own = seller.state || '';
    var have = opts.have || {}, tot = opts.totals, warn = [], probs = (D.probs || []).slice();
    var out = { parties: [], items: [], groups: [], banks: [], docs: [], warn: warn, probs: probs, counts: {}, skipped: 0, left: {}, sums: {} };
    function src(id) { return { sw: sw, co: co, id: id }; }
    function add(d) { d.seller = seller; d.app = 1; if (have[d.src.id]) { out.skipped++; return; } out.docs.push(d); out.counts[d.type] = (out.counts[d.type] || 0) + 1; }
    function prob(o, msg) { probs.push({ sheet: o._s, row: o._r, msg: msg }); }
    function sum(k, v) { out.sums[k] = r2((out.sums[k] || 0) + v); }

    /* parties */
    var P = {}, grpSeen = {}, obSeen = {};
    function party(name, role, extra) {
      var k = key(name); if (!k) return null;
      if (P[k]) { if (role && P[k].role !== role && P[k].role !== 'both') P[k].role = 'both'; return P[k]; }
      var known = opts.partiesHave && opts.partiesHave[k];
      var p = Object.assign({ name: t(name), role: role || 'customer', group: '', addr: '', pin: '', state: '', gstin: '', phone: '', email: '', cdays: '', src: src('party/' + k) }, extra || {});
      if (known) { p.state = p.state || known.state || ''; p.gstin = p.gstin || known.gstin || ''; p._known = 1; }
      P[k] = p; if (!known) out.parties.push(p);
      return p;
    }
    var openDate = opts.from || '';
    if (!openDate) {
      var first = ''; ['sales', 'purchases', 'money'].forEach(function (k) { D[k].forEach(function (o) { var d = date(o.date); if (d && (!first || d < first)) first = d; }); });
      if (first) { var y = +first.slice(0, 4); if (+first.slice(5, 7) < 4) y--; openDate = y + '-04-01'; }
      D.openings.forEach(function (o) { var d = date(o.date); if (d && (!openDate || d < openDate)) openDate = d; });
    }
    if (!openDate) openDate = new Date().toISOString().slice(0, 10);
    D.parties.forEach(function (o) {
      if (!o.name) return prob(o, 'Name is empty.');
      var ty = key(o.type), role = /both/.test(ty) ? 'both' : /suppl|credit|vendor|^s$/.test(ty) ? 'supplier' : 'customer';
      var gstin = t(o.gstin).toUpperCase().replace(/\s+/g, '');
      if (gstin && !/^\d{2}[A-Z0-9]{13}$/.test(gstin)) { prob(o, 'GSTIN "' + o.gstin + '" is not 15 characters: kept out.'); gstin = ''; }
      var gname = t(o.group), gid = '';
      if (gname) {
        gid = 'gti-' + key(co + ' ' + gname).replace(/[^a-z0-9]+/g, '-');
        if (!grpSeen[gid]) { grpSeen[gid] = 1; out.groups.push({ id: gid, name: gname, under: role === 'supplier' ? 'creditors' : 'debtors', src: src('grp/' + gid) }); }
      }
      var p = party(o.name, role, { group: gid || (role === 'supplier' ? 'creditors' : 'debtors'), addr: [t(o.addr), t(o.city)].filter(Boolean).join(', '), pin: t(o.pin), state: stateCode(o.state, gstin),
        gstin: gstin, phone: t(o.phone), email: t(o.email), cdays: num(o.cdays) || '', climit: num(o.climit) || '' });
      var ob = amt(o.obal); if (!ob.v) return;
      if (obSeen[key(o.name)]) return prob(o, o.name + ' is on the Parties sheet twice: the opening balance is taken once.');
      obSeen[key(o.name)] = 1;
      var side = key(o.odrcr) === 'cr' || ob.side === 'cr' ? 'cr' : key(o.odrcr) === 'dr' || ob.side === 'dr' ? 'dr' : role === 'supplier' ? 'cr' : 'dr';
      if (ob.v < 0) side = side === 'dr' ? 'cr' : 'dr';
      if (!opts.noOpening) { add({ type: 'ob', date: openDate, side: side === 'dr' ? 'recv' : 'pay', amount: r2(Math.abs(ob.v)), buyer: { name: p.name }, no: '', total: r2(Math.abs(ob.v)), src: src('ob/party/' + key(o.name)) }); sum('ob:' + (side === 'dr' ? 'dr' : 'cr'), Math.abs(ob.v)); }
    });

    /* items */
    var I = {};
    D.items.forEach(function (o) {
      if (!o.name) return prob(o, 'Item name is empty.');
      var k = key(o.name); if (I[k]) return;
      var g = rate(o.gst); if (o.gst && RATES.indexOf(g) < 0) prob(o, 'GST % ' + o.gst + ' is not a GST rate.');
      var x = { desc: t(o.name), hsn: t(o.hsn).replace(/\s+/g, ''), unit: t(o.unit), gst: g, rate: num(o.rate) || '', kind: /serv/i.test(o.kind) ? 'service' : 'goods', src: src('item/' + k) };
      if (num(o.prate)) x.prate = num(o.prate);
      I[k] = x; out.items.push(x);
    });
    function item(name, line) {
      var k = key(name); if (!k || I[k]) return;
      var x = { desc: t(name), hsn: line.hsn || '', unit: line.unit || '', gst: line.gst || 0, rate: '', kind: /^99/.test(line.hsn || '') ? 'service' : 'goods', src: src('item/' + k) };
      I[k] = x; out.items.push(x);
    }
    if (!opts.noOpening) {
      var stk = D.items.filter(function (o) { return num(o.oqty); }).map(function (o) { return { desc: t(o.name), unit: t(o.unit), qty: num(o.oqty), rate: num(o.orate) || num(o.prate) || 0 }; });
      if (stk.length) { add({ type: 'stk', kind: 'open', no: 'OPEN/IMPORT', date: openDate, gd: '', note: 'Opening stock (imported)', lines: stk, src: src('ob/stock') }); sum('stock', stk.reduce(function (a, l) { return a + l.qty * l.rate; }, 0)); }
    }

    /* other openings */
    var banks = {};
    function bankOf(name) { var k = key(name); if (!k) return ''; if (!banks[k]) { banks[k] = 1; out.banks.push({ k: 'bank:' + k, name: t(name), src: src('bank/' + k) }); } return 'bank:' + k; }
    if (!opts.noOpening) {
      var rest = [];
      D.openings.forEach(function (o) {
        var a = amt(o.amt); if (!a.v) return;
        var side = key(o.drcr) === 'cr' || a.side === 'cr' ? 'cr' : key(o.drcr) === 'dr' || a.side === 'dr' ? 'dr' : '';
        if (!side) return prob(o, 'Write Dr or Cr for ' + (o.acct || 'this account') + '.');
        if (a.v < 0) side = side === 'dr' ? 'cr' : 'dr';
        var v = r2(Math.abs(a.v)), ty = key(o.type), nm = t(o.acct), id = 'ob/acct/' + key(nm);
        sum('ob:' + side, v);
        if (/cash/.test(ty)) return add({ type: 'ob', date: openDate, side: 'cash', amount: side === 'dr' ? v : -v, buyer: { name: '' }, no: '', total: v, src: src(id) });
        if (/bank|od|overdraft|cc/.test(ty) && !/loan/.test(ty)) return add({ type: 'ob', date: openDate, side: 'bank', bacct: bankOf(nm), amount: side === 'dr' ? v : -v, buyer: { name: '' }, no: '', total: v, src: src(id) });
        if (/customer|debtor/.test(ty) || /supplier|creditor/.test(ty)) {
          var p = party(nm, /suppl|credit/.test(ty) ? 'supplier' : 'customer');
          return add({ type: 'ob', date: openDate, side: side === 'dr' ? 'recv' : 'pay', amount: v, buyer: { name: p.name }, no: '', total: v, src: src(id) });
        }
        var pre = /capital|reserve|drawing|proprietor|partner/.test(ty) ? 'cap:' : /loan given|advance given|given/.test(ty) ? 'given:' : /loan|borrow|od/.test(ty) ? 'loan:' : /fixed|asset.*fix|machine|furniture|vehicle|building/.test(ty) ? 'fa:' :
          /liab|payable|provision|duty|tax/.test(ty) ? 'ocl:' : /expense/.test(ty) ? 'exp:' : /income/.test(ty) ? 'inc:' : 'oca:';
        rest.push({ a: pre + key(nm), dr: side === 'dr' ? v : 0, cr: side === 'cr' ? v : 0 });
      });
      if (rest.length) {
        var s = rest.reduce(function (a, l) { return r2(a + l.dr - l.cr); }, 0);
        if (s) rest.push({ a: 'opening', dr: s < 0 ? -s : 0, cr: s > 0 ? s : 0 });
        add({ type: 'jv', no: 'OP', date: openDate, lines: rest, narr: 'Opening balances (imported)', src: src('ob/accounts') });
      }
    }

    /* bills: rows grouped by bill number (a row with no number belongs to the bill above it) */
    function bills(rows, buy) {
      var list = [], cur = null;
      rows.forEach(function (o) {
        var no = t(o.no), k = no ? key(no) + '|' + key(o.party || (cur && cur.party)) : '';
        if (!no && cur) { cur.lines.push(o); return; }
        if (cur && k === cur.k && (!o.date || date(o.date) === cur.date)) { cur.lines.push(o); return; }
        cur = { k: k, no: no, date: date(o.date), party: t(o.party), head: o, lines: [o] }; list.push(cur);
      });
      var seen = {};
      list.forEach(function (b) {
        var o = b.head;
        if (!b.no) return prob(o, 'Bill no is empty.');
        if (!b.date) return prob(o, 'Date "' + (o.date || '') + '" is not a date (use 25-04-2026).');
        var kind = key(o.kind), credit = !buy && /credit|return/.test(kind), debit = buy && /debit|return/.test(kind), supply = !buy && /supply/.test(kind);
        var pname = b.party || (buy ? '' : 'Cash sale'); if (!pname) return prob(o, 'Supplier is empty.');
        var p = party(pname, buy ? 'supplier' : 'customer', { gstin: t(o.gstin).toUpperCase(), state: stateCode('', o.gstin) });
        var pos = stateCode(o.pos) || p.state || own;
        var its = [];
        b.lines.forEach(function (l) {
          if (!t(l.item) && !num(l.rate)) return;
          var g = rate(l.gst); if (l.gst && RATES.indexOf(g) < 0) prob(l, 'GST % ' + l.gst + ' is not a GST rate.');
          var q = t(l.qty) === '' ? 1 : num(l.qty); if (credit || debit) q = Math.abs(q);   /* a return written with minus quantities (ERPNext, Odoo) */
          var it = { desc: t(l.item) || 'Item', hsn: t(l.hsn).replace(/\s+/g, ''), qty: q, unit: t(l.unit), rate: num(l.rate), disc: num(l.disc) || '', gst: supply ? 0 : g };
          if (!it.hsn && I[key(it.desc)]) it.hsn = I[key(it.desc)].hsn;
          if (!it.unit && I[key(it.desc)]) it.unit = I[key(it.desc)].unit;
          its.push(it); item(it.desc, it);
        });
        if (!its.length) return prob(o, 'This bill has no item lines with a rate.');
        var sk = (buy ? 'p|' : 's|') + key(p.name) + '|' + key(b.no) + '|' + b.date; if (seen[sk]) { prob(o, 'Bill ' + b.no + ' appears twice; the second is left out.'); return; } seen[sk] = 1;
        var id = (buy ? 'pur/' : 'sale/') + key(p.name) + '/' + key(b.no) + '/' + b.date;
        var d = { no: b.no, date: b.date, notes: t(o.narr), items: its, charges: [], buyer: { name: p.name, state: p.state || pos, gstin: p.gstin }, src: src(id) };
        if (!buy && !credit) Object.assign(d, { type: 'invoice', kind: supply ? 'supply' : 'tax', pos: pos, status: 'unpaid', withGst: !supply, comp: true, copies: 1, paper: 'a4', design: 'classic' });
        else if (!buy) Object.assign(d, { type: 'note', kind: 'credit', side: 'sale', reason: 'ret', orig: t(o.against), pos: pos });
        else if (!debit) Object.assign(d, { type: 'pbill', kind: 'bill', noGst: false, vno: t(o.vno), bdate: b.date });
        else Object.assign(d, { type: 'note', kind: 'debit', side: 'purchase', reason: 'ret', orig: t(o.against) });
        var calc = tot ? tot(Object.assign({}, d, { total: null })).total : 0, given = num(o.total); if (credit || debit) given = Math.abs(given);
        if (given) {
          var gap = r2(given - calc);
          if (tot && Math.abs(gap) > 1) warn.push({ w: 'billgap', id: b.no, amt: gap, sheet: o._s, row: o._r });
          d.total = given;
        } else d.total = calc || null;
        sum((buy ? (debit ? 'pret' : 'pur') : (credit ? 'sret' : 'sale')), d.total || 0);
        add(d);
      });
    }
    bills(D.sales, false); bills(D.purchases, true);

    /* receipts and payments */
    var mseen = {};
    D.money.forEach(function (o) {
      var dt = date(o.date); if (!dt) return prob(o, 'Date "' + (o.date || '') + '" is not a date.');
      var a = num(o.amt); if (!a) return prob(o, 'Amount is empty.');
      var dir = /^(r|rec|in|receipt|received|receive|inbound|cr)/i.test(t(o.dir)) ? 'in' : /^(p|pay|out|payment|paid|outbound|dr)/i.test(t(o.dir)) ? 'out' : '';
      if (!dir) return prob(o, 'Write Received or Paid.');
      if (a < 0) { a = -a; dir = dir === 'in' ? 'out' : 'in'; }
      var mk = key(o.mode), mode = /upi|gpay|phonepe|paytm/.test(mk) ? 'upi' : /cheque|chq|check/.test(mk) ? 'cheque' : /card/.test(mk) ? 'card' : /bank|neft|rtgs|imps|transfer|online|dd/.test(mk) || t(o.bank) ? 'bank' : 'cash';
      var base = dt + '|' + dir + '|' + key(o.party || o.acct) + '|' + a + '|' + key(o.ref), n = mseen[base] = (mseen[base] || 0) + 1, id = 'money/' + base + '|' + n;
      var d = { date: dt, mode: mode, ref: t(o.ref), paper: 'a4', design: 'classic', copies: 1, src: src(id) };
      if (mode !== 'cash') { var bk = t(o.bank) ? bankOf(o.bank) : ''; if (bk) d.bacct = bk; }
      if (t(o.party)) {
        var p = party(o.party, dir === 'in' ? 'customer' : 'supplier');
        if (dir === 'in') Object.assign(d, { type: 'receipt', kind: 'pay', no: t(o.ref) || '', buyer: { name: p.name }, amount: r2(a), tds: '', disc: 0, against: t(o.against), purpose: t(o.narr), alloc: [], total: r2(a) });
        else Object.assign(d, { type: 'voucher', forBill: true, no: t(o.ref) || '', buyer: { name: p.name }, lines: [{ desc: t(o.narr) || ('Payment' + (o.against ? ' against bill ' + t(o.against) : '')), head: 'Supplier payment', amt: r2(a) }], total: r2(a), tdsRate: '' });
      } else if (t(o.acct)) {
        if (dir === 'in') Object.assign(d, { type: 'oinc', no: t(o.ref) || '', head: t(o.acct), amount: r2(a), tds: '', notes: t(o.narr), total: r2(a) });
        else Object.assign(d, { type: 'voucher', forBill: false, no: t(o.ref) || '', buyer: { name: '' }, lines: [{ desc: t(o.narr) || t(o.acct), head: t(o.acct), amt: r2(a) }], total: r2(a), tdsRate: '' });
      } else return prob(o, 'Write the Party, or the Account for money not from a party.');
      sum(dir === 'in' ? 'in' : 'out', a);
      add(d);
    });
    out.from = openDate;
    out.docs.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return out;
  }

  /* ---------- the balance check, before saving ----------
     Each kind of entry: the file's own total against what NSBiz will post for it (the party's side of every bill, the cash and bank side
     of every receipt and payment), the openings' Dr against Cr, and the books as a whole. postings = NSBooks.postings. */
  function check(P, postings, books) {
    var S = P.sums, N = {};
    function put(k, v) { N[k] = r2((N[k] || 0) + v); }
    P.docs.forEach(function (d) {
      if (d.type === 'ob' || d.type === 'stk' || d.no === 'OP') return;
      var L = postings(d), party = 0, money = 0;
      L.forEach(function (l) { var v = (+l.dr || 0) - (+l.cr || 0); if (/^p:/.test(l.a)) party += v; if (/^(cash|bank)(:|$)/.test(l.a)) money += v; });
      if (d.type === 'invoice') put('sale', party);
      else if (d.type === 'note' && d.kind === 'credit') put('sret', -party);
      else if (d.type === 'pbill') put('pur', -party);
      else if (d.type === 'note') put('pret', party);
      else if (d.type === 'receipt' || d.type === 'oinc') put('in', money);
      else if (d.type === 'voucher') put('out', -money);
    });
    var names = { sale: 'Sales bills', sret: 'Sale returns (credit notes)', pur: 'Purchase bills', pret: 'Purchase returns (debit notes)', 'in': 'Money received', out: 'Money paid' }, rows = [];
    Object.keys(names).forEach(function (k) { var f = r2(S[k] || 0), n = r2(N[k] || 0); if (!f && !n) return; rows.push({ k: k, name: names[k], file: f, nsbiz: n, diff: r2(n - f) }); });
    var dr = r2((S['ob:dr'] || 0) + (S.stock || 0)), cr = r2(S['ob:cr'] || 0);
    var total = books ? r2(Object.keys(books).reduce(function (a, k) { return a + books[k]; }, 0)) : 0;
    return { rows: rows, bad: rows.filter(function (r) { return Math.abs(r.diff) > 0.01; }).length, openings: { dr: dr, cr: cr, gap: r2(dr - cr) }, balanced: Math.abs(total) < 0.01,
      gaps: P.warn.filter(function (w) { return w.w === 'billgap'; }).length };
  }

  var API = { SHEETS: SHEETS, template: template, layout: layout, sig: sig, read: read, plan: plan, check: check, date: date, amt: amt, stateCode: stateCode, fieldOf: fieldOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.NSTpl = API;
})(typeof window !== 'undefined' ? window : this);

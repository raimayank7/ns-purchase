/* NSBI: bank statement import for NSBiz (gap-money, 2026-11-14). Pure functions, no screen; node scripts/test_bankimport.js.
   The statement is read by NSBank (bankcore.js: CSV or Excel, columns found by heading or chosen by hand). This file decides, for each line:
     - is it already in the books? (a line posted by an earlier import carries the same key `bsk`; a line that matches a saved receipt,
       payment, expense or contra of the same amount and direction within a few days is "in the books" and left out)
     - what is it? receipt from a party (settling an open bill when the amount is exactly one bill, else the oldest bills as always),
       payment to a party, an expense, other income, cash deposited or withdrawn, or nothing yet
     - by which rule? a rule the user taught before (the narration pattern -> party or head, kept in meta 'bankrules'), the party's name
       found in the narration, an open bill of exactly this amount, or a plain-words hint (bank charges, interest, ATM / cash)
   and builds the records the App's Money screens already make (receipt, voucher with forBill, exp, oinc, contra): books.js reads them
   like any other, so nothing new is stored but a `bsk` on each record, which also protects against posting the same statement twice. */
(function (G) {
  'use strict';
  function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function days(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5); }

  /* ---------- the narration ---------- */
  var STOP = {}; ('upi neft imps rtgs ach nach ecs chq cheque clg clearing by to from transfer trf tfr payment pay paid ref txn trxn mob mobile bank ltd pvt private limited and the ' +
    'inward outward credit debit upiint upiin ybl ibl axl apl okhdfcbank okaxis oksbi okicici paytm phonepe gpay googlepay phone sbi hdfc icici axis pnb bob ifsc utr tpt mmt int self acct account ' +
    'via cash dep deposit wdl withdrawal atm pos ecom towards sent received rec bill bil for with online mps ft fund funds hdfcn sbin icic utib barb punb kkbk').split(' ').forEach(function (w) { STOP[w] = 1; });
  function segments(desc) { return String(desc || '').split(/[\/|~]|\s-\s|-(?=[A-Za-z])/).map(function (s) { return s.trim(); }).filter(Boolean); }
  function words(seg) {
    return String(seg).toLowerCase().replace(/[0-9]+/g, ' ').split(/[^a-z]+/).filter(function (w) { return w.length >= 3 && !STOP[w]; });
  }
  /* all the meaningful words of a line (for finding a party's name in it) */
  function tokens(desc) { var o = {}, out = []; segments(desc).forEach(function (s) { words(s).forEach(function (w) { if (!o[w]) { o[w] = 1; out.push(w); } }); }); return out; }
  /* the pattern a rule is kept under: the first part of the narration that has a name in it, up to three words ('rajesh kumar', 'big bazaar') */
  function pattern(desc) {
    var s = segments(desc);
    for (var j = 0; j < s.length; j++) if (s[j].indexOf('@') > 0) { var v = words(s[j].split('@')[0]); if (v.length) return v.slice(0, 3).join(' '); }   /* a UPI address names the payee better than the remark */
    for (var i = 0; i < s.length; i++) { var w = words(s[i]); if (w.length) return w.slice(0, 3).join(' '); }
    return '';
  }
  function hasAll(toks, pat) { return !!pat && pat.split(' ').every(function (w) { return toks.indexOf(w) >= 0; }); }

  /* ---------- keys of lines (a line posted once is never posted again) ---------- */
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); }
  /* two identical lines on a day (same amount, same text) are two lines: the occurrence number keeps them apart */
  function lineKeys(lines) {
    var seen = {};
    return lines.map(function (l) {
      var base = [l.date, l.dr, l.cr, key(l.ref), key(l.desc)].join('|'); seen[base] = (seen[base] || 0) + 1;
      return hash(base) + '.' + seen[base];
    });
  }

  /* ---------- plain-words hints ---------- */
  var HINT = [
    ['cr', /\b(cash\s*(dep|deposit)|cdm|by\s*cash)\b/i, { kind: 'contra', from: 'cash' }, 'h_cashdep'],
    ['cr', /\b(int(erest)?\.?\s*(credit|paid|pd|cr|on)|credit\s*interest|int\s*pd|savings?\s*interest|fd\s*interest)\b/i, { kind: 'oinc', name: 'Interest received' }, 'h_int'],
    ['dr', /\b(atm\s*(wdl|withdrawal|cash)|cash\s*(wdl|withdrawal)|self\s*(chq|cheque)|chq\s*self|to\s*self|nfs\s*cash)\b/i, { kind: 'contra', from: 'bank' }, 'h_cashwd'],
    ['dr', /\b(sms\s*(chg|charge)s?|chrg|charges?|gst\s*(on|@)|annual\s*maint|amc\s*chg|debit\s*card\s*(fee|annual)|min(imum)?\s*bal|processing\s*fee|cheque\s*book|chq\s*book)\b/i, { kind: 'exp', name: 'Bank charges' }, 'h_chg']
  ];

  /* ---------- suggest what each line is ----------
     ctx: { lines, parties: [names], bills: [{ id, no, date, party, side: 'recv'|'pay', left }] (open bills of NSBooks.bills),
            rules: [{ pat, kind: 'party'|'head', name, dir: 'cr'|'dr', n }], done: { key: 1 } (bsk of records already in the books),
            book: [NSBank bookLines] for "already in the books", days (default 5) }
     returns one entry per line: { i, key, status: 'done' | 'inbooks' | 'new', kind: '' | 'in' | 'out' | 'exp' | 'oinc' | 'contra',
       name, billId, from (contra), why (key of the reason), conf: 'rule' | 'name' | 'bill' | 'hint' | '' } */
  function suggest(ctx) {
    var L = ctx.lines, keys = lineKeys(L), tol = ctx.days == null ? 5 : ctx.days, rules = ctx.rules || [], used = {};
    /* lines already in the books through a saved record of the same amount and direction (and not through this import) */
    var bookUsed = {};
    function inBooks(l) {
      var amt = l.cr || l.dr, hit = null;
      (ctx.book || []).forEach(function (b) {
        if (hit || bookUsed[b.id] || (b.d && b.d.bsk)) return;
        var v = l.cr ? b.inn : b.out; if (Math.abs(v - amt) > 0.005) return;
        var g = Math.abs(days(b.date, l.date)); if (g > tol) return;
        hit = b;
      });
      if (hit) bookUsed[hit.id] = 1;
      return hit;
    }
    var parts = (ctx.parties || []).map(function (n) { return { n: n, t: words(String(n).replace(/\([^)]*\)/g, ' ')).slice(0, 3) }; })   /* (sample), (Delhi) and other bracketed tags are not part of the name in a narration */.filter(function (p) { return p.t.length; });
    return L.map(function (l, i) {
      var e = { i: i, key: keys[i], status: 'new', kind: '', name: '', billId: '', why: '', conf: '' }, dir = l.cr ? 'cr' : 'dr', amt = l.cr || l.dr;
      if (ctx.done && ctx.done[keys[i]]) { e.status = 'done'; return e; }
      var tk = tokens(l.desc + ' ' + l.ref);
      /* 1. a rule the user taught */
      var best = null;
      rules.forEach(function (r) { if (r.dir !== dir || !hasAll(tk, r.pat)) return; var sc = r.pat.split(' ').length * 100 + (r.n || 1); if (!best || sc > best.sc) best = { r: r, sc: sc }; });
      if (best) {
        e.conf = 'rule'; e.why = 'w_rule'; e.name = best.r.name;
        e.kind = best.r.kind === 'head' ? (dir === 'cr' ? 'oinc' : 'exp') : dir === 'cr' ? 'in' : 'out';
        if (best.r.kind === 'cash') { e.kind = 'contra'; e.from = best.r.name; e.name = ''; }
      } else {
        /* 2. a party's name in the narration (one party only) */
        var found = parts.filter(function (p) { return p.t.every(function (w) { return tk.indexOf(w) >= 0; }) && p.t.join('').length >= 5; });
        if (found.length > 1) { var mx = Math.max.apply(null, found.map(function (p) { return p.t.length; })); found = found.filter(function (p) { return p.t.length === mx; }); }
        if (found.length === 1) { e.conf = 'name'; e.why = 'w_name'; e.name = found[0].n; e.kind = dir === 'cr' ? 'in' : 'out'; }
      }
      /* 3. an open bill of exactly this amount (customer for money in, supplier for money out) */
      if (e.kind === 'in' || e.kind === 'out') {
        var side = e.kind === 'in' ? 'recv' : 'pay', ex = (ctx.bills || []).filter(function (b) { return b.side === side && key(b.party) === key(e.name) && Math.abs(b.left - amt) < 0.005 && !used[b.id]; });
        if (ex.length) { ex.sort(function (a, b) { return a.date.localeCompare(b.date); }); e.billId = ex[0].id; used[ex[0].id] = 1; e.why = e.conf === 'rule' ? 'w_rulebill' : 'w_namebill'; }
      } else if (!e.kind) {
        var side2 = dir === 'cr' ? 'recv' : 'pay', ex2 = (ctx.bills || []).filter(function (b) { return b.side === side2 && Math.abs(b.left - amt) < 0.005 && !used[b.id]; });
        if (ex2.length === 1) { var b0 = ex2[0]; e.kind = dir === 'cr' ? 'in' : 'out'; e.name = b0.party; e.billId = b0.id; used[b0.id] = 1; e.conf = 'bill'; e.why = 'w_bill'; }
      }
      /* 4. plain-words hints */
      if (!e.kind) {
        for (var h = 0; h < HINT.length; h++) {
          if (HINT[h][0] !== dir || !HINT[h][1].test(l.desc + ' ' + l.ref)) continue;
          var o = HINT[h][2]; e.kind = o.kind; e.name = o.name || ''; if (o.from) e.from = o.from; e.conf = 'hint'; e.why = HINT[h][3]; break;
        }
      }
      /* already in the books (only when nothing says it is new): a saved record of the same amount and direction within a few days */
      if (e.kind !== 'contra' || true) { var bk = inBooks(l); if (bk) { e.status = 'inbooks'; e.bookId = bk.id; } }
      return e;
    });
  }

  /* ---------- rules taught by the lines the user posted ----------
     entries: [{ line, kind, name, from }] as posted; returns the rules list with the new ones added or counted */
  function learn(rules, entries) {
    var out = (rules || []).map(function (r) { return Object.assign({}, r); });
    entries.forEach(function (e) {
      if (!e.line) return;
      var dir = e.line.cr ? 'cr' : 'dr', pat = pattern(e.line.desc);
      if (!pat) return;
      var kind = e.kind === 'in' || e.kind === 'out' ? 'party' : e.kind === 'exp' || e.kind === 'oinc' ? 'head' : e.kind === 'contra' ? 'cash' : '';
      if (!kind) return;
      var name = kind === 'cash' ? e.from : e.name; if (!name) return;
      var hit = out.filter(function (r) { return r.pat === pat && r.dir === dir; })[0];
      if (hit) { if (hit.name === name && hit.kind === kind) hit.n = (hit.n || 1) + 1; else { hit.name = name; hit.kind = kind; hit.n = 1; } }
      else out.push({ pat: pat, kind: kind, name: name, dir: dir, n: 1 });
    });
    return out.slice(-500);
  }

  /* ---------- the records ----------
     e: { kind, name, billId, from, note }, l: the statement line, o: { seller, no (function (type, prefix, date) -> next number), file, bills (open bills), mode } */
  function modeOf(l) { var t = String(l.desc + ' ' + l.ref).toLowerCase(); return /\bupi\b/.test(t) ? 'upi' : 'bank'; }
  function records(e, l, o) {
    var amt = l.cr || l.dr, mode = modeOf(l), ref = l.ref || (String(l.desc).match(/\b\d{9,16}\b/) || [''])[0] || '', note = e.note || l.desc || '', base = { app: 1, bsk: e.key, bsfile: o.file || '', seller: o.seller, date: l.date };
    var bill = e.billId ? (o.bills || []).filter(function (b) { return b.id === e.billId; })[0] : null, alloc = bill ? [{ id: bill.id, no: bill.no || '', amt: Math.min(amt, bill.left) }] : [];
    if (e.kind === 'in') {
      return Object.assign({ type: 'receipt', no: o.no('receipt', 'RCT', l.date), paper: 'a4', design: 'classic', copies: 1, copyLabel: '', gstAdv: false, rate: '18', pos: '', sac: '', rv: '', rvDate: '', refDate: '', bank: '', balance: '', status: '',
        kind: alloc.length ? 'pay' : 'adv', amount: amt, tds: '', disc: 0, mode: mode, ref: ref, against: bill ? bill.no || '' : '', purpose: note, alloc: alloc,
        buyer: { name: e.name, addr: '', phone: '', gstin: '', pan: '' }, total: amt }, base);
    }
    if (e.kind === 'out') {
      return Object.assign({ type: 'voucher', no: o.no('voucher', 'PV', l.date), paper: 'a4', design: 'classic', copies: 1, copyLabel: 'orig', tdsSec: '', rcm: false, rcmRate: '18', prep: '', appr: '', status: '',
        forBill: true, mode: mode, ref: ref, tdsRate: '', disc: 0, alloc: alloc, lines: [{ desc: bill ? 'Payment against bill ' + (bill.no || '') : 'Payment on account', head: 'Supplier payment', amt: amt }],
        buyer: { name: e.name, addr: '', phone: '', gstin: '', pan: '' }, total: amt }, base);
    }
    if (e.kind === 'exp') {
      return Object.assign({ type: 'exp', cat: e.name, amount: amt, mode: mode, buyer: { name: '' }, no: l.ref || '', gst: '', itc: false, inter: false, notes: note, total: amt }, base);
    }
    if (e.kind === 'oinc') {
      return Object.assign({ type: 'oinc', no: o.no('oinc', 'OI', l.date), head: e.name, amount: amt, tds: '', mode: mode, payer: e.payer || '', ref: ref, notes: note, total: amt, narr: [e.name, note].filter(Boolean).join(' · ') }, base);
    }
    if (e.kind === 'contra') {
      var from = e.from === 'bank' ? 'bank' : 'cash';
      return Object.assign({ type: 'contra', no: '', from: from, to: from === 'cash' ? 'bank' : 'cash', amount: amt, ref: ref, notes: note }, base);
    }
    return null;
  }
  /* what is still missing before an entry can be posted (key of a screen text) or '' */
  function problem(e, l) {
    if (!e.kind) return 'p_kind';
    if ((e.kind === 'in' || e.kind === 'out' || e.kind === 'exp' || e.kind === 'oinc') && !String(e.name || '').trim()) return e.kind === 'exp' || e.kind === 'oinc' ? 'p_head' : 'p_party';
    if (e.kind === 'in' && !l.cr) return 'p_dir_in';
    if (e.kind === 'out' && !l.dr) return 'p_dir_out';
    if (e.kind === 'exp' && !l.dr) return 'p_dir_out';
    if (e.kind === 'oinc' && !l.cr) return 'p_dir_in';
    if (e.kind === 'contra' && !(e.from === 'bank' ? l.dr : l.cr)) return 'p_dir_contra';
    return '';
  }
  /* the bsk keys of the records already in the books (a record can carry one key) */
  function doneKeys(docs) { var o = {}; (docs || []).forEach(function (d) { if (d && d.bsk) o[d.bsk] = 1; }); return o; }

  var API = { key: key, words: words, tokens: tokens, pattern: pattern, lineKeys: lineKeys, suggest: suggest, learn: learn, records: records, problem: problem, doneKeys: doneKeys, modeOf: modeOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.NSBI = API;
})(this);

/* Staff, salary and loans in the Nivesh Sahayak App (Accounts coverage WP-5; after acctx.js, whose form helpers it uses).
   Section 'stf' with four parts (#stf, #stf/emp, #stf/adv, #stf/loan):
     Salary     every salary slip of the business by month: gross, deductions, net, in the accounts or not, paid or not;
                "Add to accounts" ticks an older slip in, "Mark paid" saves payDate / payMode on the slip (books.js posts the payment);
                what is still owed: salary, PF, ESI, professional tax and TDS payable (pay them with Other income and taxes › Pay tax).
     Employees  the employee list (NSStaff, meta 'staff'): add, change, mark as left; the advance each one still owes.
     Advances   record 'sadv' { type, no SA/YY-YY/001, date, seller, emp, kind give | back, amount, mode, notes, narr, total }.
     Loans      record 'loan' { type, no LN/YY-YY/001, date, seller, lender, lt loan | od, amount, rate, months, emi, first, recv, mode }
                and its schedule (NSBooks.schedule); "Pay EMI" saves record 'emi' { type, no EMI/YY-YY/001, date, seller, loanId, lender,
                lt, n, principal, interest, mode, total }, the split suggested from the schedule and editable (banks change rates).
   Screen words: NS.t('sf.*'); record names NS.t('app.d_<type>'). */
(function () {
  'use strict';
  var A = window.NSApp, X = A && A.acx, S = window.NSStaff; if (!A || !X || !S) return;
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, num = NS.num, r2 = NS.r2, money = NS.money, B = NSBooks, key = B.key;
  var fld = X.fld, inp = X.inp, sel = X.sel, val = X.val;
  function F(k, v) { return NS.t('sf.' + k, v); }
  function today() { return NS.today(); }
  function byId(id) { return A.data().doc.filter(function (x) { return x.id === id; })[0]; }
  function ask(msg) { return NS.ask ? NS.ask(msg) : Promise.resolve(window.confirm(msg)); }
  function month(m) { return m ? new Date(m + '-01T00:00:00').toLocaleDateString(NS.lang && NS.lang() !== 'en' ? NS.lang() : 'en-IN', { month: 'long', year: 'numeric' }) : ''; }
  var EMPS = [];   /* this business's employees, loaded before each draw */

  /* ---------- employees ---------- */
  var EARN = ['Basic salary', 'House rent allowance (HRA)', 'Conveyance allowance', 'Special allowance'];
  function empForm(e) {
    e = e || { name: '', earn: EARN.map(function (d) { return { desc: d, amt: '' }; }) };
    var earn = (e.earn && e.earn.length ? e.earn : EARN.map(function (d) { return { desc: d, amt: '' }; }));
    X.open(F(e.id ? 'empedit' : 'empnew'), '<div class="fg">' +
      fld('sf-name', F('name'), inp('sf-name', e.name, { req: 1 })) + fld('sf-code', F('code'), inp('sf-code', e.code, { mode: 'text' })) +
      fld('sf-desig', F('desig'), inp('sf-desig', e.desig)) + fld('sf-dept', F('dept'), inp('sf-dept', e.dept)) +
      fld('sf-doj', F('doj'), inp('sf-doj', e.doj, { type: 'date' })) + fld('sf-left', F('left'), inp('sf-left', e.left, { type: 'date' }), { hint: F('lefth') }) +
      fld('sf-pan', 'PAN', inp('sf-pan', e.pan, { mode: 'text' })) + fld('sf-uan', 'UAN', inp('sf-uan', e.uan, { mode: 'numeric' })) + fld('sf-esi', F('esino'), inp('sf-esi', e.esi, { mode: 'text' })) +
      fld('sf-bank', F('bank'), inp('sf-bank', e.bankName)) + fld('sf-acc', F('acc'), inp('sf-acc', e.bankAcc, { mode: 'numeric' })) + fld('sf-ifsc', 'IFSC', inp('sf-ifsc', e.bankIfsc, { mode: 'text' })) +
      '</div><fieldset><legend>' + esc(F('pay')) + '</legend><p class="soft">' + esc(F('payh')) + '</p><div class="fg">' +
      earn.map(function (l, i) { return fld('sf-e' + i, l.desc, inp('sf-e' + i, l.amt, { mode: 'decimal' })); }).join('') + '</div></fieldset>',
    function () {
      var nm = val('sf-name'); if (!nm) { NS.toast(A.T('need', { f: F('name') }), 'bad'); return; }
      var rec = Object.assign({}, e, { name: nm, biz: e.biz != null ? e.biz : A.bizName(), code: val('sf-code'), desig: val('sf-desig'), dept: val('sf-dept'), doj: val('sf-doj'), left: val('sf-left'),
        pan: val('sf-pan').toUpperCase(), uan: val('sf-uan'), esi: val('sf-esi'), bankName: val('sf-bank'), bankAcc: val('sf-acc'), bankIfsc: val('sf-ifsc').toUpperCase(),
        earn: earn.map(function (l, i) { return { desc: l.desc, amt: val('sf-e' + i) }; }) });
      S.put(rec).then(function () { closeDlg(); NS.toast(A.T('saved')); A.show(); }, function (err) { NS.toast(err && err.message === 'dup' ? F('dup', { n: nm }) : F('nosave'), 'bad'); });
    });
  }
  function closeDlg() { var d = $('.acx-dlg[open]'); if (d) d.close(); }

  /* ---------- staff advances ---------- */
  function advForm(rec, kind, emp) {
    var r = rec || { date: today(), kind: kind || 'give', emp: emp || '', amount: '', mode: 'cash' };
    var names = EMPS.map(function (e) { return e.name; });
    X.open(F(r.kind === 'back' ? 'advback' : 'advgive'), '<p class="soft">' + esc(F(r.kind === 'back' ? 'advbackh' : 'advgiveh')) + '</p><div class="fg">' +
      fld('sf-date', A.T('date'), inp('sf-date', r.date, { type: 'date', req: 1 })) +
      fld('sf-emp', F('emp'), inp('sf-emp', r.emp, { req: 1, list: 'sf-emps' }) + '<datalist id="sf-emps">' + names.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>') +
      fld('sf-amt', A.T('amount'), inp('sf-amt', r.amount, { mode: 'decimal', req: 1 })) + fld('sf-mode', A.T('mode'), sel('sf-mode', r.mode, X.modeOpts())) +
      fld('sf-note', A.T('note'), inp('sf-note', r.notes || ''), { wide: 1 }) + '</div>',
    function () {
      var date = val('sf-date'), who = val('sf-emp'), amt = r2(num(val('sf-amt')));
      if (!date) { NS.toast(A.T('need', { f: A.T('date') }), 'bad'); return; }
      if (!who) { NS.toast(A.T('need', { f: F('emp') }), 'bad'); return; }
      if (!(amt > 0)) { NS.toast(A.T('need', { f: A.T('amount') }), 'bad'); return; }
      if (X.closed(date) || rec && X.closed(rec.date)) return;
      var d = Object.assign(rec ? JSON.parse(JSON.stringify(rec)) : { type: 'sadv', no: X.nextNo('sadv', 'SA', date) }, { date: date, seller: X.sellerCopy(), kind: r.kind, emp: who, amount: amt, mode: val('sf-mode'), notes: val('sf-note'), total: amt });
      d.narr = (r.kind === 'back' ? 'Advance paid back by ' : 'Advance given to ') + who + (d.notes ? ' · ' + d.notes : '');
      X.saved(d);
    });
  }
  /* what each employee still owes as advances (the 'sadv:<name>' accounts) */
  function advLeft() {
    var acc = B.accounts(A.mine(), A.bizName()), out = {};
    Object.keys(acc).forEach(function (a) { if (a.indexOf(B.SADV) === 0 && Math.abs(acc[a]) > 0.004) out[a.slice(B.SADV.length)] = acc[a]; });
    return out;
  }

  /* ---------- loans ---------- */
  function loanForm(rec) {
    var r = rec || { date: today(), lt: 'loan', amount: '', rate: '', months: '', emi: '', first: '', recv: true, mode: 'bank' };
    X.open(A.T('d_loan'), '<p class="soft">' + esc(F('loanh')) + '</p><div class="fg">' +
      fld('sf-lender', F('lender'), inp('sf-lender', r.lender, { req: 1 })) + fld('sf-lt', F('lt'), sel('sf-lt', r.lt, [['loan', F('lt_loan')], ['od', F('lt_od')]])) +
      fld('sf-date', F('ldate'), inp('sf-date', r.date, { type: 'date', req: 1 })) + fld('sf-amt', F('lamt'), inp('sf-amt', r.amount, { mode: 'decimal', req: 1 })) +
      fld('sf-rate', F('rate'), inp('sf-rate', r.rate, { mode: 'decimal' })) + fld('sf-months', F('months'), inp('sf-months', r.months, { mode: 'numeric' })) +
      fld('sf-emi', F('emi'), inp('sf-emi', r.emi, { mode: 'decimal' }), { hint: F('emih') }) + fld('sf-first', F('first'), inp('sf-first', r.first, { type: 'date' })) +
      '<div class="f wide"><label class="chk"><input id="sf-recv" type="checkbox"' + (r.recv ? ' checked' : '') + '> ' + esc(F('recv')) + '</label><small class="soft">' + esc(F('recvh')) + '</small></div>' +
      fld('sf-mode', F('recvin'), sel('sf-mode', r.mode, X.modeOpts())) + fld('sf-note', A.T('note'), inp('sf-note', r.notes || ''), { wide: 1 }) + '</div><p class="acx-sum" data-sfsum aria-live="polite"></p>',
    function () {
      var date = val('sf-date'), who = val('sf-lender'), amt = r2(num(val('sf-amt')));
      if (!who) { NS.toast(A.T('need', { f: F('lender') }), 'bad'); return; }
      if (!date) { NS.toast(A.T('need', { f: F('ldate') }), 'bad'); return; }
      if (!(amt > 0)) { NS.toast(A.T('need', { f: F('lamt') }), 'bad'); return; }
      if (X.closed(date) || rec && X.closed(rec.date)) return;
      var d = Object.assign(rec ? JSON.parse(JSON.stringify(rec)) : { type: 'loan', no: X.nextNo('loan', 'LN', date) }, { date: date, seller: X.sellerCopy(), lender: who, lt: val('sf-lt'), amount: amt,
        rate: val('sf-rate'), months: val('sf-months'), emi: val('sf-emi'), first: val('sf-first'), recv: val('sf-recv'), mode: val('sf-mode'), notes: val('sf-note'), total: amt });
      d.narr = 'Loan from ' + who + (d.rate ? ' at ' + d.rate + '%' : '') + (d.months ? ' for ' + d.months + ' months' : '');
      X.saved(d);
    }, function (f) {
      function upd() {
        var e = B.emiOf(val('sf-amt'), val('sf-rate'), val('sf-months'));
        $('[data-sfsum]', f).textContent = e ? F('emiwork', { e: money(e) }) : '';
        $('#sf-mode', f).closest('.f').hidden = !$('#sf-recv', f).checked;
      }
      f.addEventListener('input', upd); f.addEventListener('change', upd); upd();
    });
  }
  function loanOf(d) { return d.loanId && byId(d.loanId); }
  function emiForm(rec, loan, row) {
    loan = loan || loanOf(rec); if (!loan) { NS.toast(F('noloan'), 'bad'); return; }
    var r = rec || { date: row && row.date || today(), n: row && row.n || 1, principal: row ? row.principal : '', interest: row ? row.interest : '', mode: loan.mode === 'cash' ? 'cash' : 'bank' };
    X.open(F('payemi', { l: loan.lender }), '<p class="soft">' + esc(F('emiformh')) + '</p><div class="fg">' +
      fld('sf-n', F('instno'), inp('sf-n', r.n, { mode: 'numeric' })) + fld('sf-date', A.T('date'), inp('sf-date', r.date, { type: 'date', req: 1 })) +
      fld('sf-pr', F('principal'), inp('sf-pr', r.principal, { mode: 'decimal' })) + fld('sf-int', F('interest'), inp('sf-int', r.interest, { mode: 'decimal' })) +
      fld('sf-mode', A.T('mode'), sel('sf-mode', r.mode, X.modeOpts())) + fld('sf-note', A.T('note'), inp('sf-note', r.notes || ''), { wide: 1 }) + '</div><p class="acx-sum" data-sfsum aria-live="polite"></p>',
    function () {
      var date = val('sf-date'), pr = r2(num(val('sf-pr'))), it = r2(num(val('sf-int')));
      if (!date) { NS.toast(A.T('need', { f: A.T('date') }), 'bad'); return; }
      if (!(pr + it > 0)) { NS.toast(A.T('need', { f: F('principal') }), 'bad'); return; }
      if (X.closed(date) || rec && X.closed(rec.date)) return;
      var d = Object.assign(rec ? JSON.parse(JSON.stringify(rec)) : { type: 'emi', no: X.nextNo('emi', 'EMI', date) }, { date: date, seller: X.sellerCopy(), loanId: loan.id, lender: loan.lender, lt: loan.lt,
        n: Math.round(num(val('sf-n'))) || 1, principal: pr, interest: it, mode: val('sf-mode'), notes: val('sf-note'), total: r2(pr + it) });
      d.narr = 'EMI ' + d.n + ' to ' + loan.lender + ': principal ' + pr + ', interest ' + it;
      X.saved(d);
    }, function (f) {
      function upd() { $('[data-sfsum]', f).textContent = F('emitot', { t: money(r2(num(val('sf-pr')) + num(val('sf-int')))) }); }
      f.addEventListener('input', upd); upd();
    });
  }

  /* ---------- salary slips ---------- */
  function slips() { return A.mine().filter(function (d) { return d.type === 'salary'; }).sort(function (a, b) { return String(b.month || '').localeCompare(String(a.month || '')) || String(B.partyName(a)).localeCompare(String(B.partyName(b))); }); }
  function payForm(d) {
    X.open(F('markpaid'), '<p class="soft">' + esc(F('markpaidh', { e: B.partyName(d), m: month(d.month), n: money(B.salSplit(d).net) })) + '</p><div class="fg">' +
      fld('sf-date', A.T('date'), inp('sf-date', d.payDate || today(), { type: 'date', req: 1 })) + fld('sf-mode', A.T('mode'), sel('sf-mode', d.payMode || 'bank', X.modeOpts())) + '</div>',
    function () {
      var date = val('sf-date'); if (!date) { NS.toast(A.T('need', { f: A.T('date') }), 'bad'); return; }
      if (X.closed(date)) return;
      X.saved(Object.assign(JSON.parse(JSON.stringify(d)), { acct: true, payDate: date, payMode: val('sf-mode') }));
    });
  }
  function slipUrl(d) { return A.siteHome ? A.siteHome('salary-slip') + (d ? '?open=' + encodeURIComponent(d.id) : '?new=1') : ''; }

  /* ---------- the section ---------- */
  var TABS = ['sal', 'emp', 'adv', 'loan'];
  function tabs(cur) {
    return '<div class="seg" role="group">' + TABS.map(function (t) { return '<a class="btn sm" href="#stf' + (t === 'sal' ? '' : '/' + t) + '" aria-pressed="' + (t === cur) + '">' + esc(F('t_' + t)) + '</a>'; }).join('') + '</div>';
  }
  function payables() {
    var acc = B.accounts(A.mine(), A.bizName());
    var L = [['sal-payable', 'p_sal'], ['pf-payable', 'p_pf'], ['esi-payable', 'p_esi'], ['pt-payable', 'p_pt'], ['tds-payable', 'p_tds']].filter(function (x) { return Math.abs(acc[x[0]] || 0) > 0.004; });
    if (!L.length) return '';
    return '<div class="card"><h3>' + esc(F('owed')) + '</h3><ul class="rows">' + L.map(function (x) { return '<li><span>' + esc(F(x[1])) + '</span><b class="amt">' + money(-(acc[x[0]] || 0)) + '</b></li>'; }).join('') +
      '</ul><p class="soft">' + esc(F('owedh')) + '</p><p><a class="btn sm" href="#acx">' + esc(A.T('acx')) + ' ›</a></p></div>';
  }
  function salHtml() {
    var L = slips().filter(A.match);
    return '<p class="soft">' + esc(F('salh')) + '</p>' + payables() + A.searchBar() +
      (L.length ? '<div class="tbl-wrap"><table class="tbl sf-t"><thead><tr><th>' + esc(F('month')) + '</th><th>' + esc(F('emp')) + '</th><th class="n">' + esc(F('gross')) + '</th><th class="n">' + esc(F('ded')) + '</th><th class="n">' + esc(F('net')) + '</th><th>' + esc(F('status')) + '</th><th></th></tr></thead><tbody>' +
        L.slice(0, 400).map(function (d) {
          var s = B.salSplit(d), st = !d.acct ? '<span class="pill">' + esc(F('notin')) + '</span>' : d.payDate ? '<span class="pill ok">' + esc(F('paidon', { d: A.ldate(d.payDate) })) + '</span>' : '<span class="pill warn">' + esc(F('unpaid')) + '</span>';
          return '<tr><td data-l="' + esc(F('month')) + '">' + esc(month(d.month)) + '</td><th scope="row">' + esc(B.partyName(d) || '—') + '</th><td class="n" data-l="' + esc(F('gross')) + '">' + money(s.gross, false) + '</td><td class="n" data-l="' + esc(F('ded')) + '">' + money(s.ded, false) + '</td>' +
            '<td class="n" data-l="' + esc(F('net')) + '"><b>' + money(s.net, false) + '</b></td><td data-l="' + esc(F('status')) + '">' + st + '</td><td class="acts">' +
            (slipUrl(d) ? '<a class="btn sm" data-sfopen href="' + esc(slipUrl(d)) + '">' + esc(A.T('open')) + '</a>' : '') +
            (!d.acct ? '<button type="button" class="btn sm" data-sfin="' + esc(d.id) + '">' + esc(F('addin')) + '</button>' : '<button type="button" class="btn sm" data-sfpay="' + esc(d.id) + '">' + esc(F(d.payDate ? 'chgpaid' : 'markpaid')) + '</button>') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="soft">' + esc(F('noslips')) + '</p>');
  }
  function empHtml() {
    var left = advLeft();
    return '<p class="soft">' + esc(F('emph')) + '</p>' + (EMPS.length ? '<ul class="rows">' + EMPS.map(function (e) {
      var a = left[key(e.name)] || 0;
      return '<li><div class="ln"><span><b>' + esc(e.name) + '</b><span class="soft">' + [e.desig, e.code, e.left ? F('leftp', { d: A.ldate(e.left) }) : ''].filter(Boolean).map(function (x) { return ' · ' + esc(x); }).join('') + '</span></span>' +
        (a ? '<b class="amt">' + esc(F('owes', { a: money(a) })) + '</b>' : '') + '</div><div class="acts"><button type="button" class="btn sm" data-sfemp="' + esc(e.id) + '">' + esc(A.T('edit')) + '</button>' +
        '<button type="button" class="btn sm" data-sfadv="' + esc(e.name) + '">' + esc(F('advgive')) + '</button>' + (a > 0 ? '<button type="button" class="btn sm" data-sfback="' + esc(e.name) + '">' + esc(F('advback')) + '</button>' : '') +
        '<button type="button" class="btn sm danger" data-sfrm="' + esc(e.id) + '">' + esc(A.T('del')) + '</button></div></li>';
    }).join('') + '</ul>' : '<p class="soft">' + esc(F('noemps')) + '</p>');
  }
  function advHtml() {
    var left = advLeft(), L = A.mine().filter(function (d) { return d.type === 'sadv'; }).filter(A.match).sort(A.byDate), names = Object.keys(left);
    return '<p class="soft">' + esc(F('advh')) + '</p>' +
      (names.length ? '<div class="card"><h3>' + esc(F('advleft')) + '</h3><ul class="rows">' + names.map(function (k) { var e = EMPS.filter(function (x) { return key(x.name) === k; })[0]; return '<li><span>' + esc(k === 'staff' ? F('advstaff') : e ? e.name : k) + '</span><b class="amt">' + money(left[k]) + '</b></li>'; }).join('') + '</ul></div>' : '') +
      A.searchBar() + (L.length ? '<ul class="rows">' + L.slice(0, 300).map(function (d) {
        return '<li><div class="ln"><span><b>' + esc(A.docName(d)) + ' ' + esc(d.no || '') + '</b><span class="soft"> · ' + A.ldate(d.date) + ' · ' + esc(F(d.kind === 'back' ? 'k_back' : 'k_give', { e: d.emp })) + '</span></span><b class="amt">' + money(num(d.amount)) + '</b></div>' +
          '<div class="acts"><button type="button" class="btn sm" data-sfedit="' + esc(d.id) + '">' + esc(A.T('edit')) + '</button><button type="button" class="btn sm danger" data-sfdel="' + esc(d.id) + '">' + esc(A.T('del')) + '</button></div></li>';
      }).join('') + '</ul>' : '<p class="soft">' + esc(F('noadv')) + '</p>');
  }
  function loanHtml() {
    var D = A.mine(), L = D.filter(function (d) { return d.type === 'loan'; }).sort(A.byDate);
    return '<p class="soft">' + esc(F('loansh')) + '</p>' + (L.length ? L.map(function (l) {
      var sc = B.schedule(l, D), next = sc.filter(function (x) { return !x.paid; })[0], left = B.loanLeft(l, D);
      return '<div class="card sf-loan"><div class="ln"><h3>' + esc(l.lender) + ' <span class="soft">' + esc(l.no || '') + '</span></h3><b class="amt">' + esc(F('lleft', { a: money(left) })) + '</b></div>' +
        '<p class="soft">' + esc(F('loanline', { a: money(num(l.amount)), r: num(l.rate), m: num(l.months), e: money(num(l.emi) || B.emiOf(l.amount, l.rate, l.months)) })) + (l.recv ? '' : ' ' + esc(F('notposted'))) + '</p>' +
        '<div class="acts">' + (next ? '<button type="button" class="btn sm primary" data-sfemi="' + esc(l.id) + '" data-n="' + next.n + '">' + esc(F('paynext', { n: next.n, d: next.date ? A.ldate(next.date) : '' })) + '</button>' : '<span class="pill ok">' + esc(F('cleared')) + '</span>') +
        '<button type="button" class="btn sm" data-sfedit="' + esc(l.id) + '">' + esc(A.T('edit')) + '</button><button type="button" class="btn sm danger" data-sfdel="' + esc(l.id) + '">' + esc(A.T('del')) + '</button></div>' +
        (sc.length ? '<details><summary>' + esc(F('sched')) + '</summary><div class="tbl-wrap"><table class="tbl sf-t"><thead><tr><th class="n">#</th><th>' + esc(A.T('date')) + '</th><th class="n">' + esc(F('emi')) + '</th><th class="n">' + esc(F('interest')) + '</th><th class="n">' + esc(F('principal')) + '</th><th class="n">' + esc(F('bal')) + '</th><th></th></tr></thead><tbody>' +
          sc.map(function (x) {
            return '<tr' + (x.paid ? ' class="sf-paid"' : '') + '><td class="n">' + x.n + '</td><td data-l="' + esc(A.T('date')) + '">' + (x.date ? A.ldate(x.date) : '') + '</td><td class="n" data-l="' + esc(F('emi')) + '">' + money(x.emi, false) + '</td><td class="n" data-l="' + esc(F('interest')) + '">' + money(x.interest, false) + '</td>' +
              '<td class="n" data-l="' + esc(F('principal')) + '">' + money(x.principal, false) + '</td><td class="n" data-l="' + esc(F('bal')) + '">' + money(x.bal, false) + '</td><td class="acts">' +
              (x.paid ? '<button type="button" class="btn sm" data-sfedit="' + esc(x.paid.id) + '">' + esc(F('paidno', { no: x.paid.no || '' })) + '</button>' : '<button type="button" class="btn sm" data-sfemi="' + esc(l.id) + '" data-n="' + x.n + '">' + esc(F('pay')) + '</button>') + '</td></tr>';
          }).join('') + '</tbody></table></div></details>' : '') + '</div>';
    }).join('') : '<p class="soft">' + esc(F('noloans')) + '</p>');
  }
  var BTN = { sal: [['slip', 'newslip'], ['emp', 'empnew']], emp: [['emp', 'empnew'], ['give', 'advgive']], adv: [['give', 'advgive'], ['back', 'advback']], loan: [['loan', 'loannew']] };
  A.addSection('stf', function (arg) {
    var cur = TABS.indexOf(arg) >= 0 ? arg : 'sal';
    var body = cur === 'emp' ? empHtml() : cur === 'adv' ? advHtml() : cur === 'loan' ? loanHtml() : salHtml();
    return '<div class="pane-hd"><h2>' + esc(A.T('stf')) + '</h2><div class="quick">' + BTN[cur].map(function (b, i) {
      return b[0] === 'slip' ? '<a class="btn' + (i ? '' : ' primary') + '" data-sfopen href="' + esc(slipUrl()) + '">+ ' + esc(F(b[1])) + '</a>' : '<button type="button" class="btn' + (i ? '' : ' primary') + '" data-sfnew="' + b[0] + '">+ ' + esc(F(b[1])) + '</button>';
    }).join('') + '</div></div>' + tabs(cur) + body;
  }, function (pane) {
    $$('[data-sfopen]', pane).forEach(function (a) { a.addEventListener('click', function (e) { if (A.openUrl && A.openUrl(a.href)) e.preventDefault(); }); });
    $$('[data-sfnew]', pane).forEach(function (b) { b.addEventListener('click', function () { var k = b.getAttribute('data-sfnew'); if (k === 'emp') empForm(); else if (k === 'loan') loanForm(); else advForm(null, k); }); });
    $$('[data-sfemp]', pane).forEach(function (b) { b.addEventListener('click', function () { var e = EMPS.filter(function (x) { return x.id === b.getAttribute('data-sfemp'); })[0]; if (e) empForm(e); }); });
    $$('[data-sfadv]', pane).forEach(function (b) { b.addEventListener('click', function () { advForm(null, 'give', b.getAttribute('data-sfadv')); }); });
    $$('[data-sfback]', pane).forEach(function (b) { b.addEventListener('click', function () { advForm(null, 'back', b.getAttribute('data-sfback')); }); });
    $$('[data-sfrm]', pane).forEach(function (b) { b.addEventListener('click', function () {
      var e = EMPS.filter(function (x) { return x.id === b.getAttribute('data-sfrm'); })[0]; if (!e) return;
      ask(F('rmq', { n: e.name })).then(function (yes) { if (yes) S.remove(e.id).then(function () { NS.toast(A.T('deleted')); A.show(); }); });
    }); });
    $$('[data-sfin]', pane).forEach(function (b) { b.addEventListener('click', function () {
      var d = byId(b.getAttribute('data-sfin')); if (!d || X.closed(d.date)) return;
      NSStore.put('doc', Object.assign(JSON.parse(JSON.stringify(d)), { acct: true })).then(function () { NS.toast(F('added')); A.show(); });
    }); });
    $$('[data-sfpay]', pane).forEach(function (b) { b.addEventListener('click', function () { var d = byId(b.getAttribute('data-sfpay')); if (d) payForm(d); }); });
    $$('[data-sfemi]', pane).forEach(function (b) { b.addEventListener('click', function () {
      var l = byId(b.getAttribute('data-sfemi')), n = +b.getAttribute('data-n'); if (!l) return;
      var row = B.schedule(l, A.mine()).filter(function (x) { return x.n === n; })[0]; emiForm(null, l, row);
    }); });
    $$('[data-sfedit]', pane).forEach(function (b) { b.addEventListener('click', function () {
      var d = byId(b.getAttribute('data-sfedit')); if (!d) return;
      if (d.type === 'sadv') advForm(d); else if (d.type === 'loan') loanForm(d); else if (d.type === 'emi') emiForm(d);
    }); });
    $$('[data-sfdel]', pane).forEach(function (b) { b.addEventListener('click', function () {
      var d = byId(b.getAttribute('data-sfdel')); if (!d || X.closed(d.date)) return;
      if (d.type === 'loan' && A.mine().some(function (x) { return x.type === 'emi' && x.loanId === d.id; })) { NS.toast(F('loanused'), 'bad'); return; }
      ask(A.T('cdel', { x: A.enName(d) + ' ' + (d.no || '') })).then(function (yes) { if (yes) NSStore.del('doc', d.id).then(function () { NS.toast(A.T('deleted')); A.show(); }); });
    }); });
  });
  /* the employee list is read before the section draws (meta, not a document store), then the screen is drawn again */
  var loaded = '';
  function refresh() {
    var b = A.bizName() || '';
    S.list(b).then(function (l) { EMPS = l; var was = loaded; loaded = b + '|' + l.length + '|' + l.map(function (e) { return e.updated || 0; }).join(','); if (was !== loaded && /^#stf/.test(location.hash)) A.show(); });
  }
  window.addEventListener('hashchange', function () { if (/^#stf/.test(location.hash)) refresh(); });
  document.addEventListener('ns-data', refresh);
  /* menu link after Other income and taxes (door sites keep their own short menu) */
  function menu() {
    var nav = $('.hub-nav'), app = $('#app'); if (!nav || !app || app.getAttribute('data-secs') || $('[data-sec="stf"]', nav)) return;
    var at = $('[data-sec="acx"]', nav) || $('[data-sec="money"]', nav), a = NS.el('a', { href: '#stf', 'data-sec': 'stf' }, '<span>' + esc(A.T('stf')) + '</span>');
    if (at && at.nextSibling) nav.insertBefore(a, at.nextSibling); else nav.appendChild(a);
  }
  function start() { menu(); refresh(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  A.staff = { empForm: empForm, advForm: advForm, loanForm: loanForm, emiForm: emiForm };
})();

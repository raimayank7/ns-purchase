/* Accounts coverage screens of the Nivesh Sahayak App (after app.js and ledger.js, like money.js and more.js).
     WP-1  the App's expense form suggests the heads of heads.js (NSHeads); under the head it says what kind of head it is, its
           Tally group, blocked GST credit (CGST Act s.17(5)), reverse charge and TDS hints; a new name asks its type once and
           is kept as an own head (meta 'heads' = { custom: [{ name, t }] }).
     WP-2  Other income (section 'acx', buttons on Money in and out): money that does not come from a customer (interest,
           rent, commission, dividend, scrap, insurance claim ...), with the TDS the payer cut. Record 'oinc' in the 'doc'
           store: { type, no OI/YY-YY/001, date, seller, head, amount (received), tds, mode, payer, ref, notes, narr, total };
           books.js posts Dr cash/bank + TDS receivable, Cr inc:<head>.
     WP-4  Pay tax (same section): record 'taxpay' { type, no TX/YY-YY/001, date, seller, kind, mode, ref, period, notes, narr, total }
           kind 'gst' (challan PMT-06: gst.<igst|cgst|sgst|cess>.<tax|int|pen|fee|oth> into the electronic cash ledger),
           'tds' / 'tcs' (sec, tax, int, fee), 'adv' advance or self-assessment tax (amount, to 'drw' for a proprietor else
           'oca'), refunds 'gstref' (gst.<head>.tax) and 'itref' (amount, to). Postings: books.js taxPay(). The GSTR-3B set-off
           ('gstset') is made on gstr3b.niveshsahayak.in after filing (gstr3b.js) and listed here.
     WP-3  "Write off" next to Record payment on every unpaid bill: record 'wo' { type, no WO/YY-YY/001, date, seller, buyer, side recv | pay,
           reason bad | small | disc, amount, alloc [{ id, no, amt }], notes, narr, total }. Provision for doubtful debts (same section):
           record 'pdd' { type, no, date, seller, pct, base (debtors that day), target, change (= target - provision before) }.
           The cash discount box of Money received / Money paid is in app.js (receipt / voucher field disc). Postings: books.js.
   Screen words: NS.t('hd.*'), NS.t('ax.*'), section and record names NS.t('app.acx' / 'app.d_<type>'). */
(function () {
  'use strict';
  var A = window.NSApp, H = window.NSHeads; if (!A || !H) return;
  var $ = NS.$, $$ = NS.$$, esc = NS.esc;
  function tl(k, v) { return NS.t('hd.' + k, v); }

  /* ---------- WP-1: heads on the expense form ---------- */
  function headOpts(types) { return H.list(types).map(function (h) { return '<option value="' + esc(H.label(h)) + '">'; }).join(''); }
  function expHelp(form) {
    var cat = $('#f-cat', form); if (!cat || cat.hasAttribute('data-hd')) return;
    cat.setAttribute('data-hd', '');
    var dl = $('#dl-cat', form); if (dl) dl.innerHTML = headOpts(['dexp', 'iexp']);
    var box = NS.el('div', { 'class': 'f wide hd-help', 'data-hdhelp': '' });
    box.innerHTML = '<p class="soft" data-hdinfo aria-live="polite"></p><label class="hd-new" data-hdnew hidden><span>' + esc(tl('newq')) + '</span> <select id="f-htype">' +
      ['iexp', 'dexp'].map(function (t) { return '<option value="' + t + '">' + esc(tl('t_' + t)) + '</option>'; }).join('') + '</select></label>';
    cat.closest('.f').insertAdjacentElement('afterend', box);
    function upd() {
      var h = H.find(cat.value), itc = $('#f-itc', form), msg = [];
      $('[data-hdnew]', box).hidden = !!h || !cat.value.trim();
      if (h) {
        msg.push(tl('info', { t: tl('t_' + h.t), g: H.tallyGroup(h) }));
        if (h.gst === 'blocked' && itc && itc.checked) msg.push(tl('blockw'));
        if (h.gst === 'rcm') msg.push(tl('rcmw'));
        if (h.tds) msg.push(tl('tdsw', { s: H.tdsLabel(h.tds) }));
        if (h.fa) msg.push(tl('faw'));
      }
      var p = $('[data-hdinfo]', box); p.textContent = msg.join(' '); p.classList.toggle('bad', !!(h && h.gst === 'blocked' && itc && itc.checked));
    }
    form.addEventListener('input', upd); form.addEventListener('change', upd); upd();
  }
  /* a new expense head is kept as an own head when the form is saved (before app.js saves the expense) */
  function keepNew(form) {
    var cat = $('#f-cat', form), ty = $('#f-htype', form); if (!cat || !ty) return;
    var nm = cat.value.trim(); if (!nm || H.find(nm)) return;
    addCustom(nm, ty.value);
  }
  function addCustom(nm, t) {
    return NSStore.meta('heads').then(function (m) {
      m = m && typeof m === 'object' ? m : {}; m.custom = (m.custom || []).filter(function (c) { return H.key(c.name) !== H.key(nm); }).concat([{ name: nm, t: t }]);
      H.setCustom(m.custom);
      return NSStore.meta('heads', m);
    }).catch(function () {});
  }
  function watchForm() {
    var dlg = $('#app-form'); if (!dlg) return;
    var f = $('form', dlg);
    new MutationObserver(function () { if (dlg.open) expHelp($('form', dlg)); }).observe(dlg, { attributes: true, attributeFilter: ['open'], childList: true, subtree: true });
    dlg.addEventListener('submit', function (e) { keepNew(e.target); }, true);
    if (f && dlg.open) expHelp(f);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchForm); else watchForm();
  A.heads = { addCustom: addCustom, headOpts: headOpts };

  /* ---------- shared pieces ---------- */
  var num = NS.num, r2 = NS.r2, money = NS.money, B = NSBooks, key = B.key;
  function T(k, v) { return NS.t('ax.' + k, v); }
  function today() { return NS.today(); }
  function sellerCopy() { var s = JSON.parse(JSON.stringify(A.biz() || {})); delete s.id; delete s.created; delete s.updated; return s; }
  function nextNo(type, pre, date) {
    var fy = NS.fy(date), max = 0;
    A.mine().forEach(function (d) { if (d.type !== type || NS.fy(d.date) !== fy) return; var x = String(d.no || '').match(/(\d+)\s*$/); if (x) max = Math.max(max, +x[1]); });
    return pre + '/' + fy.slice(2, 4) + '-' + fy.slice(5) + '/' + String(max + 1).padStart(3, '0');
  }
  function closed(iso) { var m = A.closedMsg ? A.closedMsg(iso) : ''; if (m) NS.toast(m, 'bad'); return !!m; }
  var MODES = ['cash', 'upi', 'cheque', 'bank', 'card', 'other'];
  function fld(id, label, html, o) { o = o || {}; return '<div class="f' + (o.wide ? ' wide' : '') + '"' + (o.hidden ? ' hidden' : '') + '><label for="' + id + '">' + esc(label) + '</label>' + html + (o.hint ? '<small class="soft">' + esc(o.hint) + '</small>' : '') + '</div>'; }
  function inp(id, v, o) { o = o || {}; return '<input id="' + id + '" value="' + esc(v == null ? '' : v) + '"' + (o.type ? ' type="' + o.type + '"' : '') + (o.mode ? ' inputmode="' + o.mode + '" dir="ltr"' : ' dir="auto"') + (o.req ? ' required' : '') + (o.list ? ' list="' + o.list + '"' : '') + ' autocomplete="off">'; }
  function sel(id, v, opts) { return '<select id="' + id + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
  function modeOpts() { return MODES.map(function (x) { return [x, A.T('m_' + x)]; }); }
  function partyNames() { var o = {}; NS.forBiz(A.data().party, A.biz()).forEach(function (p) { o[key(p.name)] = p.name; }); return Object.keys(o).map(function (k) { return o[k]; }).sort(); }
  function dl(id, list) { return '<datalist id="' + id + '">' + list.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>'; }

  /* a dialog of its own (like more.js) */
  var dlg, form, onSave;
  function open(title, html, save, wire) {
    if (!dlg) {
      dlg = NS.el('dialog', { 'class': 'hub-dlg b2-dlg acx-dlg', 'aria-labelledby': 'acx-dlg-t' });
      dlg.innerHTML = '<div class="dlg-hd"><h2 id="acx-dlg-t"></h2><button type="button" class="icon-btn" data-x aria-label="' + esc(NS.t('close')) + '">✕</button></div><form novalidate></form>';
      document.body.appendChild(dlg); form = $('form', dlg);
      $('[data-x]', dlg).addEventListener('click', function () { dlg.close(); });
      form.addEventListener('submit', function (e) { e.preventDefault(); if (onSave) onSave(); });
    }
    $('#acx-dlg-t', dlg).textContent = title + (A.data().biz.length > 1 && A.bizName() ? ' · ' + A.bizName() : '');
    form.innerHTML = html + '<div class="dlg-foot btns"><button type="submit" class="btn primary">' + esc(A.T('save')) + '</button><button type="button" class="btn" data-cancel>' + esc(A.T('cancel')) + '</button></div>';
    $('[data-cancel]', form).addEventListener('click', function () { dlg.close(); });
    onSave = save;
    if (wire) wire(form);
    dlg.showModal();
    var f1 = $('input:not([type=hidden]):not([type=date]),select', form); if (f1) f1.focus();
  }
  function val(id) { var e = $('#' + id, form); return e ? (e.type === 'checkbox' ? e.checked : e.value.trim()) : ''; }
  function saved(d) { return NSStore.put('doc', d).then(function () { dlg.close(); NS.toast(A.T('saved')); A.show(); }); }

  /* ---------- WP-2: other income ---------- */
  function oincForm(rec) {
    var r = rec || { date: today(), mode: 'bank', head: '', amount: '', tds: '' };
    open(A.T('d_oinc'), '<p class="soft">' + esc(T('oinch')) + '</p><div class="fg">' +
      fld('ax-date', A.T('date'), inp('ax-date', r.date, { type: 'date', req: 1 })) +
      fld('ax-head', T('head'), inp('ax-head', r.head, { req: 1, list: 'ax-heads' }) + '<datalist id="ax-heads">' + headOpts(['oinc', 'dinc']) + '</datalist>', { hint: T('headh') }) +
      '<div class="f wide hd-help"><p class="soft" data-axinfo aria-live="polite"></p><label class="hd-new" data-axnew hidden><span>' + esc(tl('newq')) + '</span> ' + sel('ax-htype', 'oinc', [['oinc', tl('t_oinc')], ['dinc', tl('t_dinc')]]) + '</label></div>' +
      fld('ax-amt', T('amt'), inp('ax-amt', r.amount, { mode: 'decimal', req: 1 })) +
      fld('ax-tds', T('tds'), inp('ax-tds', r.tds, { mode: 'decimal' }), { hint: T('tdsh') }) +
      fld('ax-mode', A.T('mode'), sel('ax-mode', r.mode, modeOpts())) +
      fld('ax-payer', T('payer'), inp('ax-payer', r.payer || '', { list: 'ax-parties' }) + dl('ax-parties', partyNames())) +
      fld('ax-ref', A.T('ref'), inp('ax-ref', r.ref || '', { mode: 'text' })) +
      fld('ax-note', A.T('note'), inp('ax-note', r.notes || ''), { wide: 1 }) + '</div><p class="acx-sum" data-axsum aria-live="polite"></p>',
    function () {
      var date = val('ax-date'), head = val('ax-head'), amt = r2(num(val('ax-amt'))), tds = r2(num(val('ax-tds')));
      if (!date) { NS.toast(A.T('need', { f: A.T('date') }), 'bad'); return; }
      if (!head) { NS.toast(A.T('need', { f: T('head') }), 'bad'); return; }
      if (!(amt > 0) && !(tds > 0)) { NS.toast(A.T('need', { f: T('amt') }), 'bad'); return; }
      if (closed(date) || rec && closed(rec.date)) return;
      var h = H.find(head), job = !h ? addCustom(head, val('ax-htype')) : Promise.resolve();
      var d = Object.assign(rec ? JSON.parse(JSON.stringify(rec)) : { type: 'oinc', no: nextNo('oinc', 'OI', date) }, { date: date, seller: sellerCopy(), head: head, amount: amt, tds: tds, mode: val('ax-mode'),
        payer: val('ax-payer'), ref: val('ax-ref'), notes: val('ax-note'), total: r2(amt + tds) });
      d.narr = [h ? h.en : head, d.payer ? 'from ' + d.payer : '', d.notes].filter(Boolean).join(' · ');
      job.then(function () { return saved(d); });
    }, function (f) {
      function upd() {
        var h = H.find(val('ax-head')), msg = [];
        $('[data-axnew]', f).hidden = !!h || !val('ax-head');
        if (h && !H.isIncome(h)) msg.push(T('notinc'));
        if (h && h.gst === 'inv') msg.push(T('invw'));
        if (h && h.tds) msg.push(T('tdsis', { s: H.tdsLabel(h.tds) }));
        $('[data-axinfo]', f).textContent = msg.join(' ');
        var a = r2(num(val('ax-amt'))), t = r2(num(val('ax-tds')));
        $('[data-axsum]', f).textContent = a || t ? T('total', { a: money(r2(a + t)), r: money(a), t: money(t) }) : '';
      }
      f.addEventListener('input', upd); f.addEventListener('change', upd); upd();
    });
  }

  /* ---------- section: other income and taxes ---------- */
  /* ---------- WP-4: pay tax ---------- */
  var HEADS4 = ['igst', 'cgst', 'sgst', 'cess'], MIN4 = ['tax', 'int', 'pen', 'fee', 'oth'], TAXK = ['gst', 'tds', 'tcs', 'adv', 'gstref', 'itref'];
  var HNAME = { igst: 'IGST', cgst: 'CGST', sgst: 'SGST/UTGST', cess: 'Cess' };
  var TDSSEC = ['194C', '194J', '194I', '194H', '194A', '194Q', '192'];
  function ownerTo() { var b = A.biz() || {}, t = b.btype || 'prop'; return t === 'prop' ? 'drw' : 'oca'; }
  function taxForm(rec) {
    var r = rec || { kind: 'gst', date: today(), mode: 'bank', period: today().slice(0, 7) };
    open(A.T('d_taxpay'), '<div class="fg">' +
      fld('ax-kind', T('kind'), sel('ax-kind', r.kind, TAXK.map(function (k) { return [k, T('k_' + k)]; })), { wide: 1 }) +
      '<p class="soft f wide" data-axkh aria-live="polite"></p>' +
      fld('ax-date', A.T('date'), inp('ax-date', r.date, { type: 'date', req: 1 })) +
      fld('ax-per', T('per'), inp('ax-per', r.period || '', { type: 'month' }), { hint: T('perh') }) +
      fld('ax-mode', A.T('mode'), sel('ax-mode', r.mode, modeOpts())) +
      fld('ax-ref', T('cin'), inp('ax-ref', r.ref || '', { mode: 'text' })) + '</div>' +
      '<fieldset data-axgst><legend>' + esc(T('gstl')) + '</legend><div class="acx-tax" data-axgrid></div></fieldset>' +
      '<div class="fg" data-axtds>' + fld('ax-sec', T('sec'), inp('ax-sec', r.sec ? H.tdsLabel(r.sec) : '', { list: 'ax-secs' }) + dl('ax-secs', TDSSEC.map(H.tdsLabel))) +
      fld('ax-tax', T('taxamt'), inp('ax-tax', r.tax || '', { mode: 'decimal' })) + fld('ax-int', T('int'), inp('ax-int', r['int'] || '', { mode: 'decimal' })) + fld('ax-fee', T('fee'), inp('ax-fee', r.fee || '', { mode: 'decimal' })) + '</div>' +
      '<div class="fg" data-axadv>' + fld('ax-amt', A.T('amount'), inp('ax-amt', r.amount || '', { mode: 'decimal' })) + '</div>' +
      '<div class="fg">' + fld('ax-note', A.T('note'), inp('ax-note', r.notes || ''), { wide: 1 }) + '</div><p class="acx-sum" data-axsum aria-live="polite"></p>',
    function () {
      var k = val('ax-kind'), date = val('ax-date');
      if (!date) { NS.toast(A.T('need', { f: A.T('date') }), 'bad'); return; }
      if (closed(date) || rec && closed(rec.date)) return;
      var d = Object.assign(rec ? JSON.parse(JSON.stringify(rec)) : { type: 'taxpay', no: nextNo('taxpay', 'TX', date) }, { kind: k, date: date, seller: sellerCopy(), mode: val('ax-mode'), ref: val('ax-ref'), period: k === 'adv' || k === 'itref' ? '' : val('ax-per'), notes: val('ax-note') });
      ['gst', 'sec', 'tax', 'int', 'fee', 'amount', 'to'].forEach(function (x) { delete d[x]; });
      if (k === 'gst' || k === 'gstref') d.gst = readGrid(k);
      else if (k === 'tds' || k === 'tcs') { var m = /(19\d\w*|206\w*)/.exec(val('ax-sec')); d.sec = m ? m[1] : val('ax-sec'); d.tax = r2(num(val('ax-tax'))); d['int'] = r2(num(val('ax-int'))); d.fee = r2(num(val('ax-fee'))); }
      else { d.amount = r2(num(val('ax-amt'))); d.to = ownerTo(); }
      d.total = NSBooks.taxPay(d).total;
      if (!(d.total > 0)) { NS.toast(A.T('need', { f: A.T('amount') }), 'bad'); return; }
      d.narr = [ENK[k], d.period ? 'for ' + d.period : '', d.sec ? 'section 393 (old ' + d.sec + ')' : '', d.ref, d.notes].filter(Boolean).join(' · ');
      saved(d);
    }, function (f) {
      function grid(k) {
        var cols = k === 'gst' ? MIN4 : ['tax'], old = rec && rec.kind === k && rec.gst || {};
        $('[data-axgrid]', f).style.setProperty('--n', cols.length);   /* columns in acx.css */
        $('[data-axgrid]', f).innerHTML = '<span class="h"></span>' + cols.map(function (c) { return '<span class="h c">' + esc(T(k === 'gst' ? 'm_' + c : 'refamt')) + '</span>'; }).join('') +
          HEADS4.map(function (h) {
            return '<span class="rl">' + HNAME[h] + '</span>' + cols.map(function (c) { var v = old[h] && old[h][c]; return '<input id="ax-g-' + h + '-' + c + '" inputmode="decimal" dir="ltr" aria-label="' + esc(HNAME[h] + ' ' + T(k === 'gst' ? 'm_' + c : 'refamt')) + '" placeholder="' + esc(T(k === 'gst' ? 'm_' + c : 'refamt')) + '" value="' + esc(v ? v : '') + '">'; }).join('');
          }).join('');
      }
      var shown = '';
      function upd() {
        var k = val('ax-kind');
        if (k !== shown) { shown = k; if (k === 'gst' || k === 'gstref') grid(k); }
        $('[data-axgst]', f).hidden = !(k === 'gst' || k === 'gstref');
        $('[data-axtds]', f).hidden = !(k === 'tds' || k === 'tcs');
        $('[data-axadv]', f).hidden = !(k === 'adv' || k === 'itref');
        $('#ax-per', f).closest('.f').hidden = k === 'adv' || k === 'itref';
        $('[data-axkh]', f).textContent = T('kh_' + k) + (k === 'adv' || k === 'itref' ? ' ' + T(ownerTo() === 'drw' ? 'todrw' : 'tooca') : '');
        var d = { kind: k, gst: readGrid(k), tax: val('ax-tax'), 'int': val('ax-int'), fee: val('ax-fee'), amount: val('ax-amt') };
        var tot = NSBooks.taxPay(d).total;
        $('[data-axsum]', f).textContent = tot ? T(k === 'gstref' || k === 'itref' ? 'gotback' : 'paid', { a: money(tot) }) : '';
      }
      f.addEventListener('input', upd); f.addEventListener('change', upd); upd();
    });
  }
  /* the challan grid as { head: { minor head: amount } } (refunds: only 'tax') */
  function readGrid(k) {
    var o = {}, cols = k === 'gst' ? MIN4 : ['tax'];
    HEADS4.forEach(function (h) { cols.forEach(function (c) { var e = $('#ax-g-' + h + '-' + c, form), v = e ? r2(num(e.value)) : 0; if (v) (o[h] = o[h] || {})[c] = v; }); });
    return o;
  }
  var ENK = { gst: 'GST paid (challan PMT-06)', tds: 'TDS paid', tcs: 'TCS paid', adv: 'Advance or self-assessment tax', gstref: 'GST refund received', itref: 'Income-tax refund received' };
  function gstsetName(d) { return T('setfor', { p: d.label || d.per || '' }); }

  /* ---------- WP-3: write-off of a bill's balance ---------- */
  function W(k, v) { return NS.t('wo.' + k, v); }
  function woForm(rec, billId) {
    var D = A.mine(), id = rec ? (rec.alloc && rec.alloc[0] || {}).id : billId;
    var bl = B.bills(D.filter(function (d) { return !rec || d.id !== rec.id; }), A.bizName()).bills.filter(function (b) { return b.id === id; })[0];
    if (!bl) { NS.toast(W('nobill'), 'bad'); return; }
    var side = bl.side, r = rec || { date: today(), amount: bl.left, reason: side === 'pay' ? 'disc' : 'bad' };
    var reasons = side === 'pay' ? ['disc', 'small'] : ['bad', 'small', 'disc'];
    open(W('t_' + side), '<p class="soft">' + esc(W('bill', { b: bl.no || A.docName(bl), p: bl.party, a: money(bl.left) })) + '</p><div class="fg">' +
      fld('ax-date', A.T('date'), inp('ax-date', r.date, { type: 'date', req: 1 })) +
      fld('ax-amt', A.T('amount'), inp('ax-amt', r.amount, { mode: 'decimal', req: 1 })) +
      fld('ax-why', W('why'), sel('ax-why', r.reason, reasons.map(function (x) { return [x, W('r_' + side + '_' + x)]; })), { wide: 1 }) +
      '<p class="soft f wide" data-wohint aria-live="polite"></p>' +
      fld('ax-note', A.T('note'), inp('ax-note', r.notes || ''), { wide: 1 }) + '</div>',
    function () {
      var date = val('ax-date'), amt = r2(num(val('ax-amt')));
      if (!date) { NS.toast(A.T('need', { f: A.T('date') }), 'bad'); return; }
      if (!(amt > 0) || amt > r2(bl.left) + 0.004) { NS.toast(W('toomuch', { a: money(bl.left) }), 'bad'); return; }
      if (closed(date) || rec && closed(rec.date)) return;
      var why = val('ax-why');
      var d = Object.assign(rec ? JSON.parse(JSON.stringify(rec)) : { type: 'wo', no: nextNo('wo', 'WO', date) }, { date: date, seller: sellerCopy(), buyer: { name: bl.party }, side: side, reason: why, amount: amt,
        alloc: [{ id: bl.id, no: bl.no || '', amt: amt }], notes: val('ax-note'), total: amt });
      d.narr = [ENW[side + '_' + why], bl.no ? 'bill ' + bl.no : '', d.notes].filter(Boolean).join(' · ');
      saved(d);
    }, function (f) {
      function upd() { var why = val('ax-why'); $('[data-wohint]', f).textContent = W('h_' + side + '_' + why) + (side === 'recv' ? ' ' + W('gstnote') : ''); }
      f.addEventListener('change', upd); upd();
    });
  }
  var ENW = { recv_bad: 'Bad debt written off', recv_small: 'Small balance written off', recv_disc: 'Discount allowed', pay_disc: 'Discount received', pay_small: 'Balance written back' };
  /* "Write off" next to every "Record payment" button of an unpaid bill (app.js draws those lists) */
  function woButtons() {
    $$('[data-form="min"][data-for], [data-form="mout"][data-for]').forEach(function (b) {
      if (b.nextElementSibling && b.nextElementSibling.hasAttribute('data-wofor')) return;
      var x = NS.el('button', { type: 'button', 'class': 'btn sm', 'data-wofor': b.getAttribute('data-for'), 'data-i18n': 'wo.btn' }, esc(W('btn')));
      x.addEventListener('click', function () { woForm(null, x.getAttribute('data-wofor')); });
      b.insertAdjacentElement('afterend', x);
    });
  }

  /* ---------- WP-3: provision for doubtful debts ---------- */
  function debtorsOn(date, skipId) {
    var acc = B.accounts(A.mine().filter(function (d) { return d.id !== skipId; }), A.bizName(), date), v = 0;
    Object.keys(acc).forEach(function (a) { if (a.indexOf('p:') === 0 && acc[a] > 0) v += acc[a]; });
    return r2(v);
  }
  function fyEnd(iso) { var fy = NS.fy(iso); return (+fy.slice(0, 4) + 1) + '-03-31'; }
  function pddForm(rec) {
    var typed = false, r = rec || { date: fyEnd(today()), pct: 5 };
    open(A.T('d_pdd'), '<p class="soft">' + esc(W('pddh')) + '</p><div class="fg">' +
      fld('ax-date', W('asat'), inp('ax-date', r.date, { type: 'date', req: 1 })) +
      fld('ax-pct', W('pct'), inp('ax-pct', r.pct, { mode: 'decimal' })) +
      fld('ax-amt', W('target'), inp('ax-amt', r.target != null ? r.target : '', { mode: 'decimal' }), { hint: W('targeth') }) +
      fld('ax-note', A.T('note'), inp('ax-note', r.notes || ''), { wide: 1 }) + '</div><p class="acx-sum" data-pddsum aria-live="polite"></p>',
    function () {
      var date = val('ax-date'); if (!date) { NS.toast(A.T('need', { f: W('asat') }), 'bad'); return; }
      if (closed(date) || rec && closed(rec.date)) return;
      var c = calc(typed), d = Object.assign(rec ? JSON.parse(JSON.stringify(rec)) : { type: 'pdd', no: nextNo('pdd', 'PDD', date) }, { date: date, seller: sellerCopy(), pct: r2(num(val('ax-pct'))), base: c.base, target: c.target, change: c.change, notes: val('ax-note') });
      d.total = Math.abs(c.change); d.narr = 'Provision for doubtful debts ' + d.pct + '% of debtors ' + c.base + (d.notes ? ' · ' + d.notes : '');
      if (!c.change && !rec) { NS.toast(W('nochange'), 'bad'); return; }
      saved(d);
    }, function (f) {
      typed = !!(rec && rec.target != null && r2(num(rec.target)) !== r2(num(rec.base) * num(rec.pct) / 100));
      f.addEventListener('input', function (e) { if (e.target.id === 'ax-amt') typed = !!e.target.value.trim(); upd(); }); f.addEventListener('change', upd); upd();
      function upd() {
        var c = calc(typed); if (!typed) $('#ax-amt', f).value = c.target ? c.target : '';
        $('[data-pddsum]', f).textContent = W('pddsum', { d: money(c.base), p: money(c.before), t: money(c.target), c: (c.change < 0 ? '−' : '+') + money(Math.abs(c.change)) });
      }
    });
    /* typed: the provision amount was typed over (else it is the percentage of the debtors that day) */
    function calc(typed) {
      var date = val('ax-date') || today(), base = debtorsOn(date, rec && rec.id), before = B.provision(A.mine(), A.bizName(), date, rec && rec.id);
      var t = typed ? r2(num($('#ax-amt', form).value)) : r2(base * num(val('ax-pct')) / 100);
      return { base: base, before: before, target: t, change: r2(t - before) };
    }
  }

  var FORMS = { oinc: oincForm, taxpay: taxForm, pdd: pddForm, wo: function (d) { woForm(d); }, gstset: function () { NS.toast(T('seth')); } };
  function list() { return A.mine().filter(function (d) { return FORMS[d.type]; }).filter(A.match).sort(A.byDate); }
  function rowName(d) {
    var h = d.head && H.find(d.head);
    if (d.type === 'oinc') return (h ? H.label(h) : d.head) + (d.payer ? ' · ' + d.payer : '');
    if (d.type === 'taxpay') return T('k_' + d.kind) + (d.period ? ' · ' + d.period : '') + (d.ref ? ' · ' + d.ref : '');
    if (d.type === 'gstset') return gstsetName(d);
    if (d.type === 'wo') return W('r_' + d.side + '_' + d.reason) + ' · ' + (d.buyer && d.buyer.name || '') + (d.alloc && d.alloc[0] && d.alloc[0].no ? ' · ' + d.alloc[0].no : '');
    if (d.type === 'pdd') return W('pddrow', { p: d.pct, t: money(num(d.target)) });
    return d.narr || '';
  }
  function byId(id) { return A.data().doc.filter(function (x) { return x.id === id; })[0]; }
  function buttons(primary) { return (primary ? ['oinc', 'taxpay', 'pdd'] : ['oinc', 'taxpay']).map(function (k, i) { return '<button type="button" class="btn' + (primary && !i ? ' primary' : '') + '" data-acx="' + k + '">+ ' + esc(A.T('d_' + k)) + '</button>'; }).join(''); }
  function wireButtons(box) { $$('[data-acx]', box).forEach(function (b) { if (b.hasAttribute('data-axw')) return; b.setAttribute('data-axw', ''); b.addEventListener('click', function () { FORMS[b.getAttribute('data-acx')](); }); }); }
  A.addSection('acx', function () {
    var L = list();
    return '<div class="pane-hd"><h2>' + esc(A.T('acx')) + '</h2><div class="quick">' + buttons(true) + '</div></div><p class="soft">' + esc(T('h')) + '</p>' + A.searchBar() +
      (L.length ? '<ul class="rows">' + L.slice(0, 300).map(function (d) {
        return '<li><div class="ln"><span><b>' + esc(A.docName(d)) + ' ' + esc(d.no || '') + '</b><span class="soft"> · ' + A.ldate(d.date) + ' · ' + esc(rowName(d)) + '</span></span><b class="amt">' + money(num(d.total)) + '</b></div>' +
          '<div class="acts">' + (d.type === 'gstset' ? '' : '<button type="button" class="btn sm" data-axedit="' + esc(d.id) + '">' + esc(A.T('edit')) + '</button>') + '<button type="button" class="btn sm danger" data-axdel="' + esc(d.id) + '">' + esc(A.T('del')) + '</button></div></li>';
      }).join('') + '</ul>' : '<p class="soft">' + esc(T('none')) + '</p>') +
      '<div class="card"><h3>' + esc(T('seth3')) + '</h3><p>' + esc(T('seth')) + '</p><p><a class="btn" data-axgo href="' + esc((A.siteHome && A.siteHome('gstr3b')) || 'https://gstr3b.niveshsahayak.in/') + '">' + esc(T('open3b')) + '</a></p></div>';
  }, function (pane) {
    wireButtons(pane);
    $$('[data-axedit]', pane).forEach(function (b) { b.addEventListener('click', function () { var d = byId(b.getAttribute('data-axedit')); if (d) FORMS[d.type](d); }); });
    $$('[data-axgo]', pane).forEach(function (a) { a.addEventListener('click', function (e) { if (A.openUrl && A.openUrl(a.href)) e.preventDefault(); }); });
    $$('[data-axdel]', pane).forEach(function (b) { b.addEventListener('click', function () {
      var d = byId(b.getAttribute('data-axdel')); if (!d || closed(d.date)) return;
      var msg = A.T('cdel', { x: A.enName(d) + ' ' + (d.no || '') });
      (NS.ask ? NS.ask(msg) : Promise.resolve(window.confirm(msg))).then(function (yes) {
        if (yes) NSStore.del('doc', d.id).then(function () { NS.toast(A.T('deleted')); A.show(); });
      });
    }); });
  });
  /* Money in and out gets the same buttons next to its own (app.js draws that screen) */
  function moneyButtons() {
    var q = $('[data-form="ob"]'); q = q && q.closest('.quick');
    if (!q || $('[data-acx]', q)) return;
    q.insertAdjacentHTML('beforeend', buttons(false)); wireButtons(q);
  }
  function domChanged() { moneyButtons(); woButtons(); }
  /* menu link after Money in and out (door sites keep their own short menu) */
  function menu() {
    var nav = $('.hub-nav'), app = $('#app'); if (!nav || !app || app.getAttribute('data-secs') || $('[data-sec="acx"]', nav)) return;
    var at = $('[data-sec="money"]', nav), a = NS.el('a', { href: '#acx', 'data-sec': 'acx' }, '<span>' + esc(A.T('acx')) + '</span>');
    if (at && at.nextSibling) nav.insertBefore(a, at.nextSibling); else nav.appendChild(a);
  }
  function startUi() {
    menu();
    new MutationObserver(domChanged).observe($('#app') || document.body, { childList: true, subtree: true }); domChanged();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startUi); else startUi();
  A.acx = { forms: FORMS, open: open, val: val, fld: fld, inp: inp, sel: sel, modeOpts: modeOpts, sellerCopy: sellerCopy, nextNo: nextNo, closed: closed, saved: saved, T: T };
})();


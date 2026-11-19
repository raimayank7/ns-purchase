/* Bill-wise accounting screens of NSBiz (ERP Round 2, r2-billwise; after ledger.js). The sums are in books.js (pure, node-tested).
     bw            Bill-wise and interest settings of the business: strict bill-wise or oldest-first (A-12), several sales and purchase
                   ledgers on bills (A-9), default interest rate; every party's money on account with an Adjust button.
     int           Interest on late payment (A-14, R-13 d): party-wise and bill-wise, as on a day; Make debit note (opens the debit note
                   maker filled in, nothing is saved by itself) or Make journal entry (after a question); Excel.
   Pieces other screens call (all optional, each screen works without this file):
     A.bwBtns(k, p)        buttons on the party ledger: Adjust bills, Credit and interest settings
     A.bwAlloc             journal / general receipt / payment party lines: set the line against bills (more.js jvForm)
     A.obGrid              opening balance typed bill by bill (A-13, app.js ob form)
     A.ledFld(f, v)        sales / purchase ledger box on the App's sale and purchase bills (A-9), only when switched on
   Party record fields used: climit, cdays, cgrace, cpolicy 'warn' | 'block' (A-15, NS.creditAsk in core.js), int { rate, grace, from }.
   Words on these screens are English only (owner rule 19 Nov 2026: screens inside the App). */
(function () {
  'use strict';
  var A = window.NSApp; if (!A) return;
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, num = NS.num, money = NS.money, B = NSBooks, key = B.key, r2 = B.r2;
  function t(k, v) { return NS.t('bw.' + k, v); }
  function cfg() { return A.cfg() || {}; }
  function partyRec(name) { return A.data().party.filter(function (p) { return key(p.name) === key(name); })[0] || null; }
  function docById(id) { return A.data().doc.filter(function (d) { return d.id === id; })[0] || null; }
  function sideOf(name) { var p = partyRec(name); return p && p.role === 'supplier' ? 'pay' : 'recv'; }
  function ld(d) { return d ? A.ldate(d) : ''; }

  /* ---------- a dialog of its own ---------- */
  var dlg, form, onSave;
  function open(title, html, save, wire) {
    if (!dlg) {
      dlg = NS.el('dialog', { 'class': 'hub-dlg b2-dlg bw-dlg', 'aria-labelledby': 'bw-dlg-t' });
      dlg.innerHTML = '<div class="dlg-hd"><h2 id="bw-dlg-t"></h2><button type="button" class="icon-btn" data-x aria-label="' + esc(NS.t('close')) + '">✕</button></div><form novalidate></form>';
      document.body.appendChild(dlg); form = $('form', dlg);
      $('[data-x]', dlg).addEventListener('click', function () { dlg.close(); });
      form.addEventListener('submit', function (e) { e.preventDefault(); if (onSave) onSave(); });
    }
    $('#bw-dlg-t', dlg).textContent = title;
    form.innerHTML = html + '<div class="dlg-foot btns"><button type="submit" class="btn primary">' + esc(A.T('save')) + '</button><button type="button" class="btn" data-cancel>' + esc(A.T('cancel')) + '</button></div>';
    $('[data-cancel]', form).addEventListener('click', function () { dlg.close(); });
    onSave = save; if (wire) wire(form);
    dlg.showModal();
    var f1 = $('input:not([type=hidden]):not([type=checkbox]),select', form); if (f1) f1.focus();
  }
  function fld(id, label, html, hint) { return '<div class="f"><label for="' + id + '">' + esc(label) + '</label>' + html + (hint ? '<small class="soft">' + esc(hint) + '</small>' : '') + '</div>'; }
  function inp(id, v, o) { o = o || {}; return '<input id="' + id + '" value="' + esc(v == null ? '' : v) + '"' + (o.type ? ' type="' + o.type + '"' : '') + (o.mode ? ' inputmode="' + o.mode + '" dir="ltr"' : ' dir="auto"') + (o.list ? ' list="' + o.list + '"' : '') + ' autocomplete="off">'; }
  function sel(id, v, opts) { return '<select id="' + id + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
  function val(id) { var e = $('#' + id, form); return e ? (e.type === 'checkbox' ? e.checked : e.value.trim()) : ''; }
  function vname(x) { return (A.enName ? A.enName(x) : x.type || '') + (x.no ? ' ' + x.no : ''); }

  /* ---------- A-15 / A-14: credit and interest settings of a party ---------- */
  function partyForm(name) {
    var p = partyRec(name) || { name: name, role: 'customer' }, I = p.int || {};
    open(t('ps_t', { p: p.name }),
      '<p class="soft">' + esc(t('ps_h')) + '</p><div class="fg">' +
      fld('bw-cl', t('ps_climit'), inp('bw-cl', p.climit || '', { mode: 'decimal' }), t('ps_climith')) +
      fld('bw-cd', t('ps_cdays'), inp('bw-cd', p.cdays || '', { mode: 'numeric' }), t('ps_cdaysh')) +
      fld('bw-cg', t('ps_cgrace'), inp('bw-cg', p.cgrace || '', { mode: 'numeric' }), t('ps_cgraceh')) +
      fld('bw-cp', t('ps_cpol'), sel('bw-cp', p.cpolicy || 'warn', [['warn', t('ps_warn')], ['block', t('ps_block')]])) + '</div>' +
      '<h3>' + esc(t('ps_int')) + '</h3><div class="fg">' +
      fld('bw-ir', t('ps_rate'), inp('bw-ir', I.rate == null ? '' : I.rate, { mode: 'decimal' }), t('ps_rateh', { r: cfg().intRate || 18 })) +
      fld('bw-ig', t('ps_igrace'), inp('bw-ig', I.grace || '', { mode: 'numeric' })) +
      fld('bw-if', t('ps_from'), sel('bw-if', I.from || 'due', [['due', t('ps_fromdue')], ['date', t('ps_fromdate')]])) + '</div>',
      function () {
        var rec = Object.assign({}, partyRec(name) || { name: name, role: 'customer' });
        rec.climit = num(val('bw-cl')) || ''; rec.cdays = num(val('bw-cd')) || ''; rec.cgrace = num(val('bw-cg')) || ''; rec.cpolicy = val('bw-cp');
        var ir = val('bw-ir'); rec.int = ir === '' && !num(val('bw-ig')) && val('bw-if') === 'due' ? undefined : { rate: ir === '' ? '' : num(ir), grace: num(val('bw-ig')), from: val('bw-if') };
        if (!rec.int) delete rec.int;
        NSStore.put('party', rec).then(function () { dlg.close(); NS.toast(A.T('saved')); A.show(); });
      });
  }

  /* ---------- A-12: Adjust bills (give money on account, an advance, a note or a journal line its bills) ---------- */
  /* every credit of a party: what it settles now and what is left on account. [{ id, no, date, type, kind, side, amt, used: { billId: amt }, left }] */
  function creditsOf(k) {
    var R = B.bills(A.mine(), A.bizName(), k), by = {}, order = [];
    function get(x, side) { var c = by[x.id]; if (!c) { c = by[x.id] = { id: x.id, no: x.no || '', date: x.date, type: x.type, kind: x.kind, side: side, used: {}, usedAmt: 0, left: 0 }; order.push(c); } return c; }
    R.every.forEach(function (b) { if (key(b.party) !== k) return; (b.by || []).forEach(function (x) { if (x.type === 'paid') return; var c = get(x, b.side); c.used[b.id] = r2((c.used[b.id] || 0) + x.amt); c.usedAmt = r2(c.usedAmt + x.amt); }); });
    R.onacc.forEach(function (o) { if (o.pkey !== k || o.type === 'paid') return; var c = get(o, o.side); c.left = r2(c.left + o.left); });
    order.forEach(function (c) { c.amt = r2(c.usedAmt + c.left); });
    return { list: order.filter(function (c) { return c.amt > 0.004 && editable(c.id); }).sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); }), bills: R.every.filter(function (b) { return key(b.party) === k; }) };
  }
  function srcOf(id) { var m = /^(.*)#(\d+)$/.exec(id), d = docById(m ? m[1] : id); return d ? { d: d, line: m ? +m[2] : -1 } : null; }
  function editable(id) { var s = srcOf(id); return !!(s && (s.line >= 0 ? s.d.lines && s.d.lines[s.line] : /^(receipt|voucher|note|wo|pbill)$/.test(s.d.type || ''))); }
  function adjustForm(k, pick) {
    var C = creditsOf(k), name = (partyRec(k) || {}).name || (C.bills[0] && C.bills[0].party) || k;
    if (!C.list.length) { NS.toast(t('adj_none', { p: name }), 'warn'); return; }
    var cur = C.list.filter(function (c) { return c.id === pick; })[0] || C.list.filter(function (c) { return c.left > 0.004; })[0] || C.list[0];
    function rows(c) {
      var L = C.bills.filter(function (b) { return b.side === c.side && (b.left > 0.004 || c.used[b.id]); }).sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
      if (!L.length) return '<p class="soft">' + esc(t('adj_nobills')) + '</p>';
      return '<table class="tbl bw-adj"><thead><tr><th>' + esc(t('c_bill')) + '</th><th>' + esc(A.T('date')) + '</th><th class="n">' + esc(t('c_open')) + '</th><th class="n">' + esc(t('c_set')) + '</th></tr></thead><tbody>' +
        L.map(function (b) { var u = c.used[b.id] || 0, mx = r2(b.left + u); return '<tr><td>' + esc(vname(b)) + (b.due ? '<br><span class="soft">' + esc(t('due', { d: ld(b.due) })) + '</span>' : '') + '</td><td>' + ld(b.date) + '</td><td class="n">' + money(mx, false) + '</td><td class="n"><input data-adj="' + esc(b.id) + '" data-no="' + esc(b.no || '') + '" data-max="' + mx + '" inputmode="decimal" dir="ltr" value="' + (u || '') + '" aria-label="' + esc(t('c_set') + ' ' + (b.no || '')) + '"></td></tr>'; }).join('') + '</tbody></table>';
    }
    function info(c) { return t('adj_info', { v: vname(c), d: ld(c.date), a: money(c.amt) }); }
    open(t('adj_t', { p: name }),
      '<p class="soft">' + esc(t(B.isStrict(A.bizName()) ? 'adj_hs' : 'adj_hf')) + '</p>' +
      fld('bw-cr', t('adj_pick'), sel('bw-cr', cur.id, C.list.map(function (c) { return [c.id, vname(c) + ' · ' + ld(c.date) + ' · ' + money(c.amt, false) + (c.left > 0.004 ? ' (' + t('onacc_s', { a: money(c.left, false) }) + ')' : '')]; }))) +
      '<p data-adjinfo>' + esc(info(cur)) + '</p><div data-adjrows>' + rows(cur) + '</div><p class="soft" data-adjleft></p>',
      function () {
        var c = C.list.filter(function (x) { return x.id === val('bw-cr'); })[0]; if (!c) return;
        var alloc = $$('[data-adj]', form).map(function (i) { return { id: i.getAttribute('data-adj'), no: i.getAttribute('data-no'), amt: r2(Math.min(num(i.value), num(i.getAttribute('data-max')))), ref: 'agst' }; }).filter(function (a) { return a.amt > 0; });
        var tot = r2(alloc.reduce(function (s, a) { return s + a.amt; }, 0));
        if (tot > c.amt + 0.004) { NS.toast(t('adj_over', { a: money(c.amt) }), 'bad'); return; }
        var s = srcOf(c.id); if (!s) return;
        var lock = A.closedMsg && A.closedMsg(s.d.date); if (lock) { NS.toast(lock, 'bad'); return; }
        var d = JSON.parse(JSON.stringify(s.d));
        if (s.line >= 0) d.lines[s.line].alloc = alloc; else { d.alloc = alloc; if (d.type === 'receipt' && d.kind === 'adv' && !d.gstAdv && alloc.length) d.kind = 'pay'; if (d.type === 'receipt') d.against = alloc.map(function (a) { return a.no; }).filter(Boolean).join(', '); }
        NSStore.put('doc', d).then(function (saved) { return A.markPaid ? A.markPaid({ id: saved.id, alloc: alloc }) : null; }).then(function () { dlg.close(); NS.toast(t('adj_done')); A.show(); });
      },
      function (f) {
        function left() { var c = C.list.filter(function (x) { return x.id === $('#bw-cr', f).value; })[0]; var used = r2($$('[data-adj]', f).reduce(function (s, i) { return s + num(i.value); }, 0)); $('[data-adjleft]', f).textContent = c ? t('adj_left', { a: money(r2(c.amt - used)) }) : ''; }
        $('#bw-cr', f).addEventListener('change', function () { var c = C.list.filter(function (x) { return x.id === $('#bw-cr', f).value; })[0]; $('[data-adjinfo]', f).textContent = info(c); $('[data-adjrows]', f).innerHTML = rows(c); left(); });
        f.addEventListener('input', function (e) { if (e.target.hasAttribute('data-adj')) left(); });
        left();
      });
  }

  /* ---------- buttons on the party ledger (ledger.js) ---------- */
  A.bwBtns = function (k, p) {
    return '<button type="button" class="btn" data-bwadj="' + esc(k) + '">' + esc(t('adj_btn')) + '</button><button type="button" class="btn" data-bwps="' + esc(p && p.name || k) + '">' + esc(t('ps_btn')) + '</button>';
  };
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-bwadj],[data-bwps],[data-obadd],[data-bwgen]'); if (!b) return;
    if (b.hasAttribute('data-bwadj')) adjustForm(b.getAttribute('data-bwadj'), b.getAttribute('data-bwpick'));
    else if (b.hasAttribute('data-bwps')) partyForm(b.getAttribute('data-bwps'));
    else if (b.hasAttribute('data-bwgen')) { if (A.genForm) A.genForm(b.getAttribute('data-bwgen')); }
    else if (b.hasAttribute('data-obadd')) { var box = b.closest('[data-obgrid]'), list = $('[data-obl]', box), n = $$('[data-obrow]', list).length; list.insertAdjacentHTML('beforeend', obRow({}, n)); var f1 = $('[data-obrow="' + n + '"] input', list); if (f1) f1.focus(); }
  });

  /* ---------- A-12 on journal and general voucher party lines (more.js jvForm) ---------- */
  A.bwAlloc = {
    html: function (l, i, rec) {
      var side = sideOf(l.nm), k = key(l.nm), D = A.mine().filter(function (d) { return !rec || d.id !== rec.id; });
      var open = B.bills(D, A.bizName(), k).bills.filter(function (b) { return b.side === side && key(b.party) === k; }).sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
      if (!open.length) return '';
      var had = {}; (l.alloc || []).forEach(function (a) { had[a.id] = num(a.amt); });
      return '<div class="bw-al" data-bwline="' + i + '" data-side="' + side + '"><span class="soft">' + esc(t(side === 'pay' ? 'al_hp' : 'al_hr')) + '</span>' +
        open.map(function (b) { var v = had[b.id] || 0; return '<span class="bw-alr"><label class="chk"><input type="checkbox" data-bwck="' + i + '" data-id="' + esc(b.id) + '" data-max="' + b.left + '"' + (v ? ' checked' : '') + '> ' + esc(b.no || vname(b)) + ' <span class="soft">' + ld(b.date) + ' · ' + money(b.left, false) + '</span></label>' +
          '<input data-bwamt="' + i + '" data-id="' + esc(b.id) + '" data-no="' + esc(b.no || '') + '" data-max="' + b.left + '" inputmode="decimal" dir="ltr" value="' + (v || '') + '" aria-label="' + esc(t('c_set') + ' ' + (b.no || '')) + '"></span>'; }).join('') +
        (B.isStrict(A.bizName()) ? '<small class="soft">' + esc(t('al_strict')) + '</small>' : '') + '</div>';
    },
    read: function (l, i, f) {
      var box = $('[data-bwline="' + i + '"]', f); if (!box) { if (l.t !== 'party') delete l.alloc; return; }
      var al = $$('[data-bwamt]', box).map(function (x) { return { id: x.getAttribute('data-id'), no: x.getAttribute('data-no'), amt: r2(Math.min(num(x.value), num(x.getAttribute('data-max')))), ref: 'agst' }; }).filter(function (a) { return a.amt > 0; });
      if (al.length) l.alloc = al; else delete l.alloc;
    }
  };
  document.addEventListener('change', function (e) {
    var c = e.target; if (!c.hasAttribute || !c.hasAttribute('data-bwck')) return;
    var box = c.closest('[data-bwline]'), i = c.getAttribute('data-bwck'), f = c.closest('form'), amt = $('[data-bwamt="' + i + '"][data-id="' + c.getAttribute('data-id') + '"]', box);
    if (!amt) return;
    if (!c.checked) { amt.value = ''; return; }
    var side = box.getAttribute('data-side'), lineAmt = num(($('#jl-' + (side === 'pay' ? 'd' : 'c') + '-' + i, f) || {}).value);
    var used = $$('[data-bwamt]', box).reduce(function (s, x) { return x === amt ? s : s + num(x.value); }, 0), mx = num(c.getAttribute('data-max'));
    amt.value = String(r2(lineAmt ? Math.max(0, Math.min(mx, lineAmt - used)) : mx) || mx);
  });

  /* ---------- A-13: opening balance typed bill by bill (app.js ob form) ---------- */
  function obRow(b, i) {
    return '<div class="bw-obr" data-obrow="' + i + '"><label><span class="vh">' + esc(t('ob_no')) + '</span><input data-ob="no" value="' + esc(b.no || '') + '" placeholder="' + esc(t('ob_no')) + '" dir="ltr"></label>' +
      '<label><span>' + esc(A.T('date')) + '</span><input type="date" data-ob="date" value="' + esc(b.date || '') + '"></label><label><span>' + esc(t('ob_due')) + '</span><input type="date" data-ob="due" value="' + esc(b.due || '') + '"></label>' +
      '<label><span class="vh">' + esc(A.T('amount')) + '</span><input data-ob="amt" inputmode="decimal" dir="ltr" value="' + esc(b.amt || '') + '" placeholder="' + esc(A.T('amount')) + '"></label></div>';
  }
  A.obGrid = {
    html: function (ob) {
      var L = (ob && ob.bills) || [];
      return '<details class="bw-ob" data-obgrid' + (L.length ? ' open' : '') + '><summary>' + esc(t('ob_t')) + '</summary><p class="soft">' + esc(t('ob_h')) + '</p>' +
        '<div data-obl>' + (L.length ? L : [{}]).map(obRow).join('') + '</div><button type="button" class="btn sm" data-obadd>' + esc(t('ob_add')) + '</button></details>';
    },
    read: function (f, d) {
      var box = $('[data-obgrid]', f); if (!box || box.hidden || /^(cash|bank)$/.test(d.side)) { delete d.bills; return true; }
      var L = $$('[data-obrow]', box).map(function (r) { var g = function (k) { return String(($('[data-ob="' + k + '"]', r) || {}).value || '').trim(); }; return { no: g('no'), date: g('date'), due: g('due'), amt: r2(num(g('amt'))) }; }).filter(function (b) { return b.amt > 0; });
      var sum = r2(L.reduce(function (s, b) { return s + b.amt; }, 0));
      if (sum > num(d.amount) + 0.004) { NS.toast(t('ob_over', { a: money(sum) }), 'bad'); return false; }
      if (L.length) d.bills = L; else delete d.bills;
      return true;
    }
  };
  document.addEventListener('input', function (e) {
    var g = e.target.closest && e.target.closest('[data-obgrid]'); if (!g || e.target.getAttribute('data-ob') !== 'amt') return;
    var f = g.closest('form'), a = f && $('#f-amt', f); if (!a) return;
    var sum = r2($$('[data-ob="amt"]', g).reduce(function (s, x) { return s + num(x.value); }, 0));
    if (!a.value.trim() || a.hasAttribute('data-obsum')) { a.value = sum ? String(sum) : ''; a.setAttribute('data-obsum', '1'); }
  });

  /* ---------- A-26: Ctrl+R in a Narration box fills in the last narration of the same kind of voucher (Tally's repeat narration).
     Only while the cursor is in a narration box (#f-narr, #jv-narr): everywhere else Ctrl+R stays the browser's reload. ---------- */
  function narrKind(box) {
    if (box.id === 'jv-narr') { var f = box.form, acct = f && $('#gv-acct', f), h2 = box.closest('dialog') && $('h2', box.closest('dialog')); if (!acct) return { type: 'jv' }; return { type: h2 && h2.textContent.indexOf(t('gv_pymt')) === 0 ? 'voucher' : 'receipt', gen: 1 }; }
    var F = A.vh && A.vh().cur && A.vh().cur(); if (!F) return null;
    if (F.vd) return { type: F.vd.ty === 'exp' ? 'expinv' : F.vd.ty };
    return { type: F.kind === 'sale' ? 'invoice' : 'pbill', kind: F.kind === 'pret' ? 'return' : F.kind === 'pbill' ? 'bill' : '' };
  }
  function lastNarr(k, skipId) {
    var L = A.mine().filter(function (d) { return d.id !== skipId && String(d.narr || '').trim() && (d.type || 'invoice') === k.type && (!k.gen || d.gen) && (k.type !== 'jv' || !d.gen) && (!k.kind || (d.kind || 'bill') === k.kind); })
      .sort(function (a, b) { return (b.updated || b.created || 0) - (a.updated || a.created || 0); });
    return L.length ? String(L[0].narr) : '';
  }
  document.addEventListener('keydown', function (e) {
    var box = e.target;
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || (e.key || '').toLowerCase() !== 'r' || !box || !/^(f-narr|jv-narr)$/.test(box.id)) return;
    e.preventDefault(); e.stopPropagation();
    var k = narrKind(box), F = A.vh && A.vh().cur && A.vh().cur(), v = k ? lastNarr(k, F && F.rec && F.rec.id) : '';
    if (!v) { NS.toast(t('narr_none'), 'warn'); return; }
    box.value = v; box.dispatchEvent(new Event('input', { bubbles: true })); box.setSelectionRange && box.setSelectionRange(v.length, v.length);
  }, true);
  document.addEventListener('focusin', function (e) { var b = e.target; if (b && b.id === 'jv-narr' && !b.title) b.title = t('narr_key'); });

  /* ---------- A-9: sales / purchase ledger box on the App's bills ---------- */
  function ledNames(f) {
    var o = {}; A.mine().forEach(function (d) { if (d[f]) o[key(d[f])] = d[f]; (d.items || []).forEach(function (it) { if (it && it[f]) o[key(it[f])] = it[f]; }); });
    A.data().item.forEach(function (m) { if (m && m[f]) o[key(m[f])] = m[f]; });
    (f === 'sl' ? ['Sales - Local', 'Sales - Interstate', 'Sales - Exempt', 'Export sales', 'Job work income'] : ['Purchase - Local', 'Purchase - Interstate', 'Purchase - Exempt', 'Import purchases']).forEach(function (n) { o[key(n)] = o[key(n)] || n; });
    return Object.keys(o).map(function (k) { return o[k]; }).sort();
  }
  A.bwLedList = function (f) { return '<datalist id="dl-' + f + '">' + ledNames(f).map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>'; };
  A.ledFld = function (f, v) {
    if (!cfg().multiLed) return '';
    var id = 'f-' + f;
    return '<div class="f"><label for="' + id + '">' + esc(t(f === 'sl' ? 'sl' : 'pl')) + '</label><input id="' + id + '" value="' + esc(v || '') + '" list="dl-' + f + '" dir="auto" autocomplete="off" placeholder="' + esc(t(f === 'sl' ? 'sl_ph' : 'pl_ph')) + '">' +
      '<datalist id="dl-' + f + '">' + ledNames(f).map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist></div>';
  };

  /* ---------- section bw: Bill-wise and interest settings ---------- */
  A.addSection('bw', function () {
    var c = cfg(), strict = c.billwise === 'strict', R = B.bills(A.mine(), A.bizName());
    var oa = R.onacc.filter(function (o) { return o.type !== 'paid' && editable(o.id); }).sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
    return '<div class="pane-hd"><h2>' + esc(t('bw_t')) + '</h2><div class="quick"><a class="btn" href="#int">' + esc(t('int_t')) + '</a><button type="button" class="btn" data-bwgen="rcpt">+ ' + esc(t('gv_rcpt')) + '</button><button type="button" class="btn" data-bwgen="pymt">+ ' + esc(t('gv_pymt')) + '</button></div></div>' +
      '<div class="card bw-set"><h3>' + esc(t('mode_t')) + '</h3>' +
        '<label class="chk"><input type="radio" name="bw-mode" value="fifo"' + (strict ? '' : ' checked') + '> <span><b>' + esc(t('mode_fifo')) + '</b><br><span class="soft">' + esc(t('mode_fifoh')) + '</span></span></label>' +
        '<label class="chk"><input type="radio" name="bw-mode" value="strict"' + (strict ? ' checked' : '') + '> <span><b>' + esc(t('mode_strict')) + '</b><br><span class="soft">' + esc(t('mode_stricth')) + '</span></span></label>' +
        '<label class="chk"><input type="checkbox" data-bwml' + (c.multiLed ? ' checked' : '') + '> <span><b>' + esc(t('ml')) + '</b><br><span class="soft">' + esc(t('mlh')) + '</span></span></label>' +
        '<label class="f"><span>' + esc(t('defrate')) + '</span><input data-bwrate inputmode="decimal" dir="ltr" value="' + esc(c.intRate == null ? '' : c.intRate) + '" placeholder="18"></label>' +
        '<p><button type="button" class="btn primary" data-bwsave>' + esc(A.T('save')) + '</button></p></div>' +
      '<h3>' + esc(t('oa_t')) + ' <small class="soft">(' + oa.length + ')</small></h3><p class="soft">' + esc(t('oa_h')) + '</p>' +
      (oa.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + esc(A.T('party')) + '</th><th>' + esc(t('c_vch')) + '</th><th>' + esc(A.T('date')) + '</th><th>' + esc(t('c_side')) + '</th><th class="n">' + esc(t('c_left')) + '</th><th></th></tr></thead><tbody>' +
        oa.map(function (o) { return '<tr><td><a class="link" href="#st/' + encodeURIComponent(o.pkey) + '">' + esc(o.party) + '</a></td><td>' + esc(vname(o)) + (o.kind === 'adv' ? ' <span class="pill">' + esc(t('adv')) + '</span>' : '') + '</td><td>' + ld(o.date) + '</td><td>' + esc(t(o.side === 'recv' ? 's_recv' : 's_pay')) + '</td><td class="n">' + money(o.left) + '</td><td><button type="button" class="btn sm" data-bwadj="' + esc(o.pkey) + '" data-bwpick="' + esc(o.id) + '">' + esc(t('adj_btn')) + '</button></td></tr>'; }).join('') +
        '</tbody></table></div>' : '<p class="soft">' + esc(t('oa_none')) + '</p>');
  }, function (pane) {
    var s = $('[data-bwsave]', pane); if (!s) return;
    s.addEventListener('click', function () {
      var mode = ($('input[name="bw-mode"]:checked', pane) || {}).value || 'fifo', ml = $('[data-bwml]', pane).checked, rt = $('[data-bwrate]', pane).value.trim();
      NS.cfgEdit(A.biz() || A.bizName(), function (v) { v.billwise = mode; v.multiLed = ml; v.intRate = rt === '' ? '' : num(rt); }, { why: 'Bill-wise settings' }).then(function () {
        var C = cfg(); C.billwise = mode; C.multiLed = ml; C.intRate = rt === '' ? '' : num(rt); B.setBillwise(A.bizName(), mode);
        NS.toast(A.T('saved')); A.show();
      });
    });
  });

  /* ---------- section int: interest on late payment (A-14, R-13 d) ---------- */
  var iSide = 'recv', iAsOn = '', iShown = false;
  function setFor(p) { var I = (p && p.int) || {}, def = cfg().intRate; return { rate: I.rate !== '' && I.rate != null ? num(I.rate) : def === '' || def == null ? 18 : num(def), grace: num(I.grace), from: I.from || 'due', cdays: p ? num(p.cdays) : 0, side: iSide }; }
  function intData() {
    var asOn = iAsOn || NS.today(), parties = {};
    B.bills(A.mine().filter(function (d) { return !d.date || d.date <= asOn; }), A.bizName()).every.forEach(function (b) { if (b.side === iSide) parties[key(b.party)] = b.party; });
    var out = [];
    Object.keys(parties).sort().forEach(function (k) {
      var p = partyRec(parties[k]), st = setFor(p); if (!(st.rate > 0)) return;
      var I = B.interest(A.mine(), A.bizName(), k, asOn, st);
      var L = I.bills.filter(function (b) { return b.interest > 0; });
      if (L.length) out.push({ k: k, name: (p && p.name) || parties[k], set: st, bills: L, total: r2(L.reduce(function (s, b) { return s + b.interest; }, 0)) });
    });
    return { asOn: asOn, list: out, total: r2(out.reduce(function (s, x) { return s + x.total; }, 0)) };
  }
  A.addSection('int', function () {
    var X = intData();
    return '<div class="pane-hd"><h2>' + esc(t('int_t')) + '</h2><div class="quick"><button type="button" class="btn" data-intprint>' + esc(A.T('print')) + '</button><button type="button" class="btn" data-intpdf>' + esc(A.T('pdf')) + '</button><button type="button" class="btn" data-intxl>' + esc(t('xl')) + '</button><a class="btn" href="#bw">' + esc(t('bw_t')) + '</a></div></div>' +
      '<p class="soft">' + esc(t('int_h')) + '</p>' +
      '<div class="tools-row"><div class="seg" role="group"><button type="button" class="btn sm" data-intside="recv" aria-pressed="' + (iSide === 'recv') + '">' + esc(t('s_recv')) + '</button><button type="button" class="btn sm" data-intside="pay" aria-pressed="' + (iSide === 'pay') + '">' + esc(t('s_pay')) + '</button></div>' +
        '<label>' + esc(t('ason')) + ' <input type="date" data-intas value="' + X.asOn + '"></label></div>' +
      (iSide === 'pay' ? '<p class="note">' + esc(t('int_msme')) + ' <a class="link" href="#msme">' + esc(t('int_msmego')) + '</a></p>' : '') +   /* MSMED Act s.16 interest (3 x bank rate, monthly rests) is worked out on the MSME payables screen (msmecore.js) */
      '<p class="big">' + esc(t('int_tot', { a: money(X.total) })) + '</p>' +
      (X.list.length ? X.list.map(function (P) {
        return '<div class="card bw-int"><div class="pane-hd"><h3><a class="link" href="#st/' + encodeURIComponent(P.k) + '">' + esc(P.name) + '</a> <small class="soft">' + esc(t('int_set', { r: P.set.rate, g: P.set.grace, f: t(P.set.from === 'date' ? 'ps_fromdate' : 'ps_fromdue') })) + '</small></h3><div class="quick">' +
          '<b>' + money(P.total) + '</b>' + (iSide === 'recv' ? '<button type="button" class="btn sm" data-intdn="' + esc(P.k) + '">' + esc(t('mk_dn')) + '</button>' : '') + '<button type="button" class="btn sm" data-intjv="' + esc(P.k) + '">' + esc(t('mk_jv')) + '</button><button type="button" class="btn sm" data-bwps="' + esc(P.name) + '">' + esc(t('ps_btn')) + '</button></div></div>' +
          '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + esc(t('c_bill')) + '</th><th>' + esc(A.T('date')) + '</th><th>' + esc(t('c_from')) + '</th><th class="n">' + esc(t('c_amt')) + '</th><th class="n">' + esc(t('c_unpaid')) + '</th><th class="n">' + esc(t('c_days')) + '</th><th class="n">' + esc(t('c_int')) + '</th></tr></thead><tbody>' +
          P.bills.map(function (b) { return '<tr><td>' + esc(vname(b)) + '</td><td>' + ld(b.date) + '</td><td>' + ld(b.start) + '</td><td class="n">' + money(b.total, false) + '</td><td class="n">' + money(b.left, false) + '</td><td class="n">' + b.days + '</td><td class="n">' + money(b.interest, false) + '</td></tr>'; }).join('') +
          '</tbody></table></div></div>';
      }).join('') : '<p class="soft">' + esc(t('int_none')) + '</p>') +
      (iShown ? '<div class="tbl-wrap"><div class="lg-print">' + intSheet(X) + '</div></div>' : '');
  }, function (pane) {
    var pp = $('[data-intprint]', pane); if (pp) pp.addEventListener('click', function () { if (iShown) { window.print(); return; } iShown = true; A.show(); setTimeout(function () { window.print(); }, 350); });
    var pf = $('[data-intpdf]', pane); if (pf) pf.addEventListener('click', function () {
      function go() { var n = $('[data-pane] .lg-print > .stsheet') || $('.lg-print > .stsheet'); if (!n) return; var c = n.cloneNode(true); c.classList.add('lg-paper'); NS.sharePdf([c], 'interest-' + iSide + '-' + (iAsOn || NS.today()), 'a4', t('int_t'), ''); }
      if (iShown) go(); else { iShown = true; A.show(); setTimeout(go, 400); }
    });
    $$('[data-intside]', pane).forEach(function (b) { b.addEventListener('click', function () { iSide = b.getAttribute('data-intside'); A.show(); }); });
    var as = $('[data-intas]', pane); if (as) as.addEventListener('change', function () { iAsOn = as.value; A.show(); });
    function party(k) { return intData().list.filter(function (x) { return x.k === k; })[0]; }
    $$('[data-intjv]', pane).forEach(function (b) { b.addEventListener('click', function () { var P = party(b.getAttribute('data-intjv')); if (P) makeJv(P); }); });
    $$('[data-intdn]', pane).forEach(function (b) { b.addEventListener('click', function () { var P = party(b.getAttribute('data-intdn')); if (P) makeDn(P); }); });
    var xb = $('[data-intxl]', pane); if (xb) xb.addEventListener('click', function () {
      var X = intData(), rows = [['Interest on late payment', 'As on ' + X.asOn, iSide === 'recv' ? 'Receivable (customers)' : 'Payable (suppliers)'], ['Party', 'Rate % a year', 'Bill', 'Bill date', 'Interest from', 'Bill amount', 'Unpaid', 'Days', 'Interest']];
      X.list.forEach(function (P) { P.bills.forEach(function (b) { rows.push([P.name, P.set.rate, (A.enName ? A.enName(b) : '') + ' ' + (b.no || ''), b.date, b.start, b.total, b.left, b.days, b.interest]); }); });
      rows.push(['Total', '', '', '', '', '', '', '', X.total]);
      NS.xlsx('interest-' + iSide + '-' + X.asOn + '.xlsx', [{ name: 'Interest', rows: rows }]);
    });
  });
  /* the printed sheet: English like every printed report */
  function intSheet(X) {
    var Z = A.biz() || {}, m2 = function (v) { return money(v, false); };
    return '<div class="stsheet sh" dir="ltr" data-sheet><div class="st-hd"><div><b>' + esc(A.bizName()) + '</b>' + (Z.gstin ? '<br>GSTIN ' + esc(Z.gstin) : '') + '</div><div class="r"><b>INTEREST ON LATE PAYMENT</b><br>' + (iSide === 'recv' ? 'Due from customers' : 'Due to suppliers') + '<br>As on ' + ld(X.asOn) + '</div></div>' +
      (X.list.length ? X.list.map(function (P) {
        return '<h4 class="lg-h">' + esc(P.name) + ' <small>(' + P.set.rate + '% a year, simple, ' + P.set.grace + ' grace days, from the ' + (P.set.from === 'date' ? 'bill date' : 'due date') + ')</small></h4>' +
          '<table class="tbl st lg-tbl"><thead><tr><th>Bill</th><th>Date</th><th>Interest from</th><th class="n">Amount</th><th class="n">Unpaid</th><th class="n">Days</th><th class="n">Interest</th></tr></thead><tbody>' +
          P.bills.map(function (b) { return '<tr><td>' + esc((A.enName ? A.enName(b) : '') + ' ' + (b.no || '')) + '</td><td>' + ld(b.date) + '</td><td>' + ld(b.start) + '</td><td class="n">' + m2(b.total) + '</td><td class="n">' + m2(b.left) + '</td><td class="n">' + b.days + '</td><td class="n">' + m2(b.interest) + '</td></tr>'; }).join('') +
          '</tbody><tfoot><tr><th colspan="6">Total</th><th class="n">' + m2(P.total) + '</th></tr></tfoot></table>';
      }).join('') + '<p><b>Interest in all: ' + money(X.total) + '</b></p>' : '<p>No interest due.</p>') +
      '<p class="small">Interest is worked out on what was unpaid each day, between payments, at the yearly rate / 365.</p>' + (NS.creditLine ? NS.creditLine('st-ft') : '') + '</div>';
  }
  function narrOf(P) { return 'Interest on late payment up to ' + ld(iAsOn || NS.today()) + ' at ' + P.set.rate + '% a year on ' + P.bills.map(function (b) { return (b.no || 'bill') + ' (' + b.days + ' days)'; }).join(', '); }
  /* a journal entry: customer Dr / Interest received Cr, or Interest on late payment Dr / supplier Cr. Asked first, never by itself. */
  function makeJv(P) {
    var recv = iSide === 'recv', amt = Math.round(P.total * 100) / 100;
    NS.ask(t(recv ? 'jv_askr' : 'jv_askp', { a: money(amt), p: P.name })).then(function (ok) {
      if (!ok) return;
      var pl = { t: 'party', nm: P.name, a: 'party', party: P.name, side: recv ? 'recv' : 'pay', dr: recv ? amt : 0, cr: recv ? 0 : amt };
      var il = recv ? { t: 'inc', nm: 'Interest received', a: 'inc:interest received', dr: 0, cr: amt } : { t: 'exp', nm: 'Interest on late payment', a: 'exp:interest on late payment', dr: amt, cr: 0 };
      var s = JSON.parse(JSON.stringify(A.biz() || { name: A.bizName() })); delete s.id; delete s.created; delete s.updated;
      var d = { type: 'jv', app: 1, no: '', date: iAsOn || NS.today(), narr: narrOf(P), seller: s, lines: recv ? [pl, il] : [il, pl], total: amt, intOf: P.bills.map(function (b) { return b.id; }) };
      var lock = A.closedMsg && A.closedMsg(d.date); if (lock) { NS.toast(lock, 'bad'); return; }
      return NSStore.put('doc', d).then(function () { NS.toast(t('jv_done')); A.show(); });
    });
  }
  /* a debit note to the customer for the interest (GST at the rate of each bill's main supply: interest for late payment is part of
     the value of supply, CGST Act s.15(2)(d)): the debit note maker opens filled in, the user checks, numbers and saves it there */
  function makeDn(P) {
    var pr = partyRec(P.name) || {}, s = JSON.parse(JSON.stringify(A.biz() || { name: A.bizName() })); delete s.id; delete s.created; delete s.updated;
    var items = P.bills.map(function (b) {
      var d = docById(String(b.id).split('#')[0]) || {}, m = (d.items || []).slice().sort(function (x, y) { return num(y.qty || 1) * num(y.rate) - num(x.qty || 1) * num(x.rate); })[0] || {};
      return { desc: 'Interest on late payment of bill ' + (b.no || '') + ' (' + b.days + ' days at ' + P.set.rate + '% a year)', hsn: m.hsn || '', qty: 1, unit: 'Nos', rate: b.interest, gst: d.items ? B.mainRate(d) : 0 };
    });
    var buyer = { name: P.name, addr: pr.addr || '', city: pr.city || '', pin: pr.pin || '', state: pr.state || '', gstin: pr.gstin || '', phone: pr.phone || '' }, b0 = P.bills[0];
    /* in the App: its own debit note screen, filled in (the user checks and saves); elsewhere the debit note maker reads a handoff */
    if (window.NSVDocs && A.biz()) { A.openForm('vdoc', { copy: { type: 'note', kind: 'debit', side: 'sale', reason: 'other', orig: { no: b0.no || '', date: b0.date || '' }, buyer: buyer, items: items, notes: narrOf(P), round: true } }); return; }
    NSStore.meta('handoff', { type: 'note', t: Date.now(), seller: s, buyer: buyer, items: items }).then(function () {
      var u = A.toolUrl('debit-note'); u = (u === '#' ? A.siteHome('debit-note') : u) + '?hand=1';
      if (!A.openUrl(u)) location.href = u;
    });
  }
})();

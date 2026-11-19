/* TDS when a purchase bill or an expense is booked in the App (ERP round 2: S-20, S-21, T-B12). Hooks of app.js:
   NSApp.formTail(kind, rec) adds the "TDS on this bill" part to the Purchase bill and Expense forms, NSApp.formWire(kind, form, F)
   keeps it worked out while the bill is typed, NSApp.formSave(kind, d, form) writes d.tds = { sec, rate, base, billBase, amt, catchup,
   ldc, ldcBase } (books.js then credits the supplier less TDS and credits TDS payable).
   The section comes from the bill, else the supplier's usual section (Masters), else the expense head's section (heads.js).
   The year-to-date check per supplier and section, the base without GST, no-PAN rate and the lower-deduction certificate are in
   tdscore.js (NSTds.due). Screen words: NS.t('tb.*') (App: English only). */
(function () {
  'use strict';
  var A = window.NSApp, T = window.NSTds, B = window.NSBooks; if (!A || !T || !B) return;
  var $ = NS.$, esc = NS.esc, num = NS.num, money = NS.money;
  function F(k, v) { return NS.t('tb.' + k, v); }
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function party(name) { return (A.data().party || []).filter(function (p) { return key(p.name) === key(name); })[0] || null; }
  var on = { pbill: 1, exp: 1 };
  var prevTail = A.formTail, prevWire = A.formWire, prevSave = A.formSave;
  A.formTail = function (kind, rec) {
    var h = prevTail ? prevTail(kind, rec) || '' : ''; if (!on[kind]) return h;
    var t = rec && rec.tds || {};
    return h + '<details class="more tb-box"' + (t.sec ? ' open' : '') + '><summary>' + esc(F('sum')) + '</summary><div class="fg">' +
      '<div class="f"><label for="tb-sec">' + esc(F('sec')) + '</label><select id="tb-sec"><option value="">' + esc(F('none')) + '</option>' + T.SEC.map(function (s) { return '<option value="' + s[0] + '"' + (T.secOf(t.sec) === s[0] ? ' selected' : '') + '>' + esc(s[6] + ' (old ' + s[1] + ') · ' + s[7]) + '</option>'; }).join('') + '</select></div>' +
      '<div class="f"><label for="tb-rate">' + esc(F('rate')) + '</label><input id="tb-rate" inputmode="decimal" dir="ltr" value="' + esc(t.sec ? t.rate : '') + '" autocomplete="off"></div>' +
      '<div class="f"><label for="tb-amt">' + esc(F('amt')) + '</label><input id="tb-amt" inputmode="decimal" dir="ltr" value="' + esc(t.sec ? t.amt : '') + '" autocomplete="off"><small class="soft">' + esc(F('amth')) + '</small></div>' +
      '</div><p class="soft" data-tbmsg aria-live="polite"></p></details>';
  };
  /* the base of this bill without GST: purchase bill = taxable value of its lines; expense = amount less the GST inside it */
  function baseOf(kind, form, F0) {
    if (kind === 'pbill') { var items = (F0 && F0.lines || []).map(function (l) { return { qty: l.qty === '' ? 1 : num(l.qty), rate: num(l.rate), disc: num(l.disc), gst: num(l.gst), desc: l.desc }; }); return B.itemTotals({ type: 'pbill', items: items, buyer: {}, seller: {}, noGst: true }).taxable; }
    var a = num(($('#f-amt', form) || {}).value), g = num(($('#f-gst', form) || {}).value); return g ? Math.round(a * 100 / (100 + g) * 100) / 100 : a;
  }
  function work(kind, form, F0) {
    var box = $('.tb-box', form); if (!box) return null;
    var nm = ($('#f-party', form) || {}).value || '', p = party(nm) || {}, date = ($('#f-date', form) || {}).value || NS.today();
    var sel = $('#tb-sec', box);
    if (!sel.value && !box._touched) {   /* the supplier's usual section, else the expense head's */
      var s = T.secOf(p.tdsSec); if (!s && kind === 'exp' && window.NSHeads) { var h = NSHeads.find(($('#f-cat', form) || {}).value); s = h && T.secOf(h.tds); }
      if (s) { sel.value = s; box.open = true; }
    }
    var sec = sel.value, base = baseOf(kind, form, F0), msg = $('[data-tbmsg]', box);
    if (!sec) { msg.textContent = ''; return null; }
    var skip = F0 && F0.rec && F0.rec.id, y = T.ytd(A.mine(), nm, sec, date, skip);
    var r = T.due({ sec: sec, pan: p.pan, panOp: p.panOp === 'inoperative' ? false : undefined, deductee: p.deductee, amt: base, ytd: y.base, free: y.free, monthTotal: y.month, ldc: p.ldc, ldcUsed: T.ldcUsed(A.mine(), nm), date: date });
    var ri = $('#tb-rate', box), ai = $('#tb-amt', box);
    if (!box._typed) { ri.value = r.apply ? r.rate : 0; ai.value = r.tds; }
    var bits = [];
    if (!nm.trim()) bits.push(F('noparty'));
    if (r.apply) bits.push(F('due', { t: money(r.tds), b: money(r.base), r: r.rate }));
    else bits.push(F('why_' + r.why, { y: money(y.base), l: money((T.sec(sec) || [])[5] || 0) }));
    if (r.catchup) bits.push(F('catch', { y: money(r.base - base) }));
    if (r.nopan) bits.push(F('nopan'));
    if (r.ldc) bits.push(F('ldc', { n: r.ldc }));
    if (y.base) bits.push(F('ytd', { y: money(y.base), t: money(y.tds) }));
    msg.textContent = bits.join(' ');
    return { r: r, base: base, sec: sec };
  }
  A.formWire = function (kind, form, F0) {
    if (prevWire) prevWire(kind, form, F0); if (!on[kind]) return;
    var box = $('.tb-box', form); if (!box) return;
    var go = function () { work(kind, form, F0); };
    form.addEventListener('input', function (e) { if (e.target.id === 'tb-rate' || e.target.id === 'tb-amt') { box._typed = true; if (e.target.id === 'tb-rate') $('#tb-amt', box).value = Math.round(baseOf(kind, form, F0) * num(e.target.value) / 100); return; } go(); });
    form.addEventListener('change', function (e) { if (e.target.id === 'tb-sec') { box._touched = true; box._typed = false; } go(); });
    form.addEventListener('click', function () { setTimeout(go, 0); });   /* lines added or removed */
    go();
  };
  A.formSave = function (kind, d, form, F0) {
    if (prevSave) prevSave(kind, d, form, F0); if (!on[kind]) return;
    var w = work(kind, form, F0), amt = num(($('#tb-amt', form) || {}).value);
    if (!w || !(amt > 0) && !w.r.base) { delete d.tds; return; }
    var r = w.r, rate = num(($('#tb-rate', form) || {}).value);
    d.tds = { sec: w.sec, rate: rate, base: r.apply ? r.base : w.base, billBase: w.base, amt: Math.round(amt), catchup: !!r.catchup };
    if (r.ldc) { d.tds.ldc = r.ldc; d.tds.ldcBase = r.ldcBase; }
    if (!(amt > 0)) d.tds.amt = 0;   /* below the limit: kept (amount 0) so the year's total counts it */
  };
})();

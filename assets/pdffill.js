/* PDF tools (owner 20 Nov, from the open-source shortlist): Utilities › PDF tools: fill a form, join PDFs, split a PDF.
   pdf-lib (@cantoo/pdf-lib 2.11.1, the maintained fork of pdf-lib, MIT), a copy kept in /assets/vendor/ so it works offline. Any PDF with fillable boxes (government forms,
   bank and insurance forms): NSBiz lists every box, fills the ones it recognises from the business (or a chosen party), the
   user checks and corrects them, and a NEW filled PDF is saved; the file chosen is only read. Boxes are matched by their
   names inside the PDF (name, PAN, GSTIN, TAN, address, city, PIN, state, phone, email, date, place); nothing is guessed
   beyond that. A PDF without fillable boxes (a scanned or printed form) cannot be filled this way and NSBiz says so.
   The App is English only. */
(function () {
  'use strict';
  var A = window.NSApp; if (!A) return;
  var $ = NS.$, $$ = NS.$$, esc = NS.esc;
  var LIB = '/assets/vendor/pdf-lib-cantoo-2.11.1.min.js';
  var ST = { file: null, name: '', bytes: null, fields: [], vals: {}, who: 'biz', flat: false };
  /* what each kind of box means, by words in its name (lower case, letters only) */
  var MAP = [
    ['gstin', /gstin|gst ?no|gstn/], ['tan', /\btan\b|tan ?no/], ['pan', /\bpan\b|pan ?no|permanent ?account/],
    ['email', /e-?mail/], ['phone', /phone|mobile|contact ?no|tel/], ['pin', /\bpin\b|pin ?code|postal|zip/],
    ['state', /\bstate\b/], ['city', /city|town|district/], ['addr', /address|addr/], ['date', /\bdate\b|dated/], ['place', /\bplace\b/],
    ['name', /name|deductor|assessee|applicant|firm|company/]
  ];
  function kindOf(n) { var s = String(n || '').toLowerCase().replace(/[_.\-\[\]0-9]+/g, ' '); for (var i = 0; i < MAP.length; i++) if (MAP[i][1].test(s)) return MAP[i][0]; return ''; }
  function source() {
    if (ST.who === 'biz') return A.biz() || {};
    var p = (A.data().party || []).filter(function (x) { return x && x.name === ST.who; })[0] || {};
    return p;
  }
  function valueFor(k, o) {
    var st = o.state && window.NS.stateName ? NS.stateName(o.state) : o.state;
    return ({ name: o.name, pan: o.pan || (o.gstin ? String(o.gstin).slice(2, 12) : ''), gstin: o.gstin, tan: o.tan, email: o.email, phone: o.phone || o.mobile,
      pin: o.pin, state: st, city: o.city, addr: o.addr || o.address, date: NS.fmtDate ? NS.fmtDate(NS.today()) : NS.today(), place: o.city })[k] || '';
  }
  function autofill(overwrite) {
    var o = source();
    ST.fields.forEach(function (f) { if (f.type !== 'text' && f.type !== 'drop') return; var k = kindOf(f.name); if (!k) return; var v = valueFor(k, o); if (v && (overwrite || !ST.vals[f.name])) ST.vals[f.name] = v; });
  }
  function html() {
    var parties = (A.data().party || []).filter(function (p) { return p && p.name; }).map(function (p) { return p.name; }).sort();
    var head = '<div class="pane-hd"><h2>Fill a PDF form</h2></div>' +
      '<p class="soft">Open a PDF form that has fillable boxes (many government, bank and insurance forms do). NSBiz fills the boxes it recognises from your business or a party; check every box, then save a new filled PDF. The file you open is not changed, and nothing leaves this computer.</p>' +
      '<div class="pr-bar"><label class="btn primary" for="pf-file">' + (ST.name ? 'Open another PDF' : 'Open a PDF form') + '</label><input type="file" id="pf-file" class="sr" accept=".pdf,application/pdf">' +
      (ST.fields.length ? '<label>Fill from <select id="pf-who"><option value="biz">' + esc((A.biz() || {}).name || 'My business') + '</option>' + parties.map(function (n) { return '<option' + (n === ST.who ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select></label>' +
        '<button type="button" class="btn" id="pf-auto">Fill again from it</button><label><input type="checkbox" id="pf-flat"' + (ST.flat ? ' checked' : '') + '> Lock the boxes (flatten)</label><button type="button" class="btn primary" id="pf-save" data-ic="download">Save filled PDF</button>' : '') + '</div>';
    if (!ST.name) return head;
    if (!ST.fields.length) return head + '<div class="card"><b>' + esc(ST.name) + '</b><p>This PDF has no fillable boxes, so it cannot be filled here. It is probably a scanned or printed form: fill it by hand or ask the issuer for the fillable version.</p></div>';
    var rows = ST.fields.map(function (f, i) {
      var v = ST.vals[f.name], k = kindOf(f.name), lab = '<td><b>' + esc(f.name) + '</b>' + (k ? ' <small class="soft">(' + k + ')</small>' : '') + '</td>', box;
      if (f.type === 'check') box = '<input type="checkbox" data-pf="' + i + '"' + (v ? ' checked' : '') + '>';
      else if (f.type === 'drop' || f.type === 'radio') box = '<select data-pf="' + i + '"><option value=""></option>' + f.opts.map(function (o) { return '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>';
      else box = '<input data-pf="' + i + '" value="' + esc(v || '') + '"' + (f.max ? ' maxlength="' + f.max + '"' : '') + '>';
      return '<tr>' + lab + '<td>' + box + '</td><td class="soft">' + esc(f.type === 'check' ? 'Tick box' : f.type === 'drop' ? 'List' : f.type === 'radio' ? 'Choice' : f.type === 'sign' ? 'Signature (sign on paper)' : 'Text') + '</td></tr>';
    }).join('');
    var filled = ST.fields.filter(function (f) { return ST.vals[f.name]; }).length;
    return head + '<p><b>' + esc(ST.name) + '</b>: ' + ST.fields.length + ' boxes, ' + filled + ' filled. Box names come from the PDF itself; check each value before saving.</p>' +
      '<div class="tbl-wrap"><table class="tbl pf-t"><thead><tr><th>Box in the PDF</th><th>Value</th><th>Kind</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }
  function readPdf(file) {
    NS.toast('Reading ' + file.name + '…');
    NS.loadJs(LIB).then(function () { return file.arrayBuffer(); }).then(function (buf) {
      var L = window.PDFLib; ST.bytes = buf; ST.name = file.name; ST.vals = {}; ST.fields = [];
      return L.PDFDocument.load(buf, { ignoreEncryption: true }).then(function (pdf) {
        pdf.getForm().getFields().forEach(function (f) {
          var n = f.getName(), c = f.constructor.name, o = { name: n, type: 'text', opts: [] };
          try {
            if (f instanceof L.PDFCheckBox) { o.type = 'check'; ST.vals[n] = f.isChecked(); }
            else if (f instanceof L.PDFDropdown || f instanceof L.PDFOptionList) { o.type = 'drop'; o.opts = f.getOptions(); ST.vals[n] = (f.getSelected() || [])[0] || ''; }
            else if (f instanceof L.PDFRadioGroup) { o.type = 'radio'; o.opts = f.getOptions(); ST.vals[n] = f.getSelected() || ''; }
            else if (f instanceof L.PDFTextField) { o.max = f.getMaxLength() || 0; ST.vals[n] = f.getText() || ''; }
            else if (f instanceof L.PDFSignature) o.type = 'sign';
            else if (f instanceof L.PDFButton) return;
          } catch (e) {}
          ST.fields.push(o);
        });
        autofill(false); A.show();
      });
    }).catch(function () { NS.toast('Could not read this PDF. It may be damaged or protected against changes.', 'bad'); });
  }
  function savePdf() {
    var L = window.PDFLib; if (!L || !ST.bytes) return;
    L.PDFDocument.load(ST.bytes, { ignoreEncryption: true }).then(function (pdf) {
      var form = pdf.getForm(), bad = [];
      ST.fields.forEach(function (f) {
        var v = ST.vals[f.name]; if (f.type === 'sign') return;
        try {
          var x = form.getField(f.name);
          if (f.type === 'check') { if (v) x.check(); else x.uncheck(); }
          else if (f.type === 'drop') { if (v) x.select(v); }
          else if (f.type === 'radio') { if (v) x.select(v); }
          else x.setText(v == null ? '' : String(v));
        } catch (e) { bad.push(f.name); }
      });
      if (ST.flat) try { form.flatten(); } catch (e) {}
      return pdf.save().then(function (out) {
        var nm = ST.name.replace(/\.pdf$/i, '') + ' filled.pdf';
        NS.saveFile(new Blob([out], { type: 'application/pdf' }), nm);
        NS.toast('Saved as "' + nm + '"' + (bad.length ? '. ' + bad.length + ' box(es) could not take the value: ' + bad.slice(0, 3).join(', ') : ''), bad.length ? 'bad' : '');
      });
    }).catch(function () { NS.toast('Could not save the filled PDF.', 'bad'); });
  }
  function wire(pane) {
    var fi = $('#pf-file', pane); if (fi) fi.addEventListener('change', function () { if (fi.files[0]) readPdf(fi.files[0]); fi.value = ''; });
    var w = $('#pf-who', pane); if (w) w.addEventListener('change', function () { ST.who = w.value; autofill(true); A.show(); });
    var au = $('#pf-auto', pane); if (au) au.addEventListener('click', function () { autofill(true); A.show(); });
    var fl = $('#pf-flat', pane); if (fl) fl.addEventListener('change', function () { ST.flat = fl.checked; });
    var sv = $('#pf-save', pane); if (sv) sv.addEventListener('click', savePdf);
    $$('[data-pf]', pane).forEach(function (el) { el.addEventListener('change', function () { var f = ST.fields[+el.getAttribute('data-pf')]; ST.vals[f.name] = el.type === 'checkbox' ? el.checked : el.value; }); });
  }
  /* ---------- Join PDFs and Split a PDF (owner 20 Nov): same screen, own tabs; files are only read, new files are saved ---------- */
  var JN = { files: [] }, SP = { name: '', bytes: null, pages: 0, ranges: '', each: false };
  function tabs() {
    var m = ST.mode || 'fill', t = function (k, l) { return '<button type="button" class="btn' + (m === k ? ' primary' : '') + '" data-pfm="' + k + '">' + l + '</button>'; };
    return '<div class="pr-bar pf-tabs">' + t('fill', 'Fill a form') + t('join', 'Join PDFs') + t('split', 'Split a PDF') + t('sign', 'Sign with DSC') + '</div>';
  }
  function joinHtml() {
    var rows = JN.files.map(function (f, i) {
      return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(f.name) + '</b></td><td>' + (f.pages || '?') + '</td><td class="nowrap">' +
        '<button type="button" class="btn" data-jn="up" data-i="' + i + '"' + (i ? '' : ' disabled') + ' title="Move up">↑</button> ' +
        '<button type="button" class="btn" data-jn="dn" data-i="' + i + '"' + (i < JN.files.length - 1 ? '' : ' disabled') + ' title="Move down">↓</button> ' +
        '<button type="button" class="btn" data-jn="rm" data-i="' + i + '">Remove</button></td></tr>';
    }).join('');
    var tot = JN.files.reduce(function (s, f) { return s + (f.pages || 0); }, 0);
    return '<div class="pane-hd"><h2>Join PDFs</h2></div><p class="soft">Put several PDFs one after the other in one new file, for example bills, a statement and a letter. Change the order with the arrows. The files you open are not changed, and nothing leaves this computer.</p>' +
      '<div class="pr-bar"><label class="btn primary" for="jn-file">Add PDF files</label><input type="file" id="jn-file" class="sr" accept=".pdf,application/pdf" multiple>' +
      (JN.files.length > 1 ? '<button type="button" class="btn primary" id="jn-save" data-ic="download">Join and save</button>' : '') + (JN.files.length ? '<button type="button" class="btn" id="jn-clear">Start again</button>' : '') + '</div>' +
      (JN.files.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>File</th><th>Pages</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div><p>' + JN.files.length + ' files, ' + tot + ' pages in all.' + (JN.files.length < 2 ? ' Add at least one more file to join.' : '') + '</p>' : '');
  }
  function splitHtml() {
    var h = '<div class="pane-hd"><h2>Split a PDF</h2></div><p class="soft">Take some pages out of a PDF as a new file, or save every page as its own file. The file you open is not changed, and nothing leaves this computer.</p>' +
      '<div class="pr-bar"><label class="btn primary" for="sp-file">' + (SP.name ? 'Open another PDF' : 'Open a PDF') + '</label><input type="file" id="sp-file" class="sr" accept=".pdf,application/pdf"></div>';
    if (!SP.name) return h;
    return h + '<p><b>' + esc(SP.name) + '</b>: ' + SP.pages + ' page' + (SP.pages === 1 ? '' : 's') + '.</p>' +
      '<div class="card"><label>Pages to take out <input id="sp-r" value="' + esc(SP.ranges) + '" placeholder="for example 1-3, 5, 8- (8 to the end)" dir="ltr"></label>' +
      '<p class="soft">Use page numbers and ranges with commas. Leave it empty to take every page.</p>' +
      '<p><label><input type="radio" name="sp-k" value="one"' + (SP.each ? '' : ' checked') + '> All these pages in one new PDF</label><br><label><input type="radio" name="sp-k" value="each"' + (SP.each ? ' checked' : '') + '> Each range (or each page, when empty) as its own PDF</label></p>' +
      '<button type="button" class="btn primary" id="sp-save" data-ic="download">Split and save</button></div>';
  }
  function pageCount(buf) { return window.PDFLib.PDFDocument.load(buf, { ignoreEncryption: true }).then(function (p) { return p.getPageCount(); }); }
  function addJoin(files) {
    NS.loadJs(LIB).then(function () {
      return Promise.all([].map.call(files, function (f) { return f.arrayBuffer().then(function (b) { return pageCount(b).then(function (n) { return { name: f.name, bytes: b, pages: n }; }, function () { NS.toast('Could not read ' + f.name + '. It may be damaged or protected.', 'bad'); return null; }); }); }));
    }).then(function (l) { l.forEach(function (x) { if (x) JN.files.push(x); }); A.show(); });
  }
  function saveJoin() {
    var L = window.PDFLib;
    L.PDFDocument.create().then(function (out) {
      return JN.files.reduce(function (pr, f) {
        return pr.then(function () { return L.PDFDocument.load(f.bytes, { ignoreEncryption: true }).then(function (src) { return out.copyPages(src, src.getPageIndices()).then(function (pg) { pg.forEach(function (p) { out.addPage(p); }); }); }); });
      }, Promise.resolve()).then(function () { return out.save(); });
    }).then(function (b) {
      var nm = JN.files[0].name.replace(/\.pdf$/i, '') + ' and ' + (JN.files.length - 1) + ' more joined.pdf';
      NS.saveFile(new Blob([b], { type: 'application/pdf' }), nm); NS.toast('Saved as "' + nm + '"');
    }).catch(function () { NS.toast('Could not join these PDFs. One of them may be protected against changes.', 'bad'); });
  }
  /* "1-3, 5" -> [[0,1,2],[4]]; null when something is wrong */
  function parseRanges(txt, n) {
    var s = String(txt || '').trim(); if (!s) return null;
    var out = [], bad = false;
    s.split(/[,;]+/).forEach(function (part) {
      part = part.trim(); if (!part) return;
      /* an open end runs to the last page ("6-" = 6 to the end), an open start from page 1 ("-3" = 1 to 3) */
      var m = part.match(/^(\d+)?\s*(?:-|to)\s*(\d+)?$/i), a, b;
      if (m && (m[1] || m[2])) { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : n; } else if (/^\d+$/.test(part)) { a = b = +part; } else { bad = true; return; }
      if (a < 1 || b > n || a > b) { bad = true; return; }
      var g = []; for (var i = a; i <= b; i++) g.push(i - 1); out.push(g);
    });
    return bad || !out.length ? false : out;
  }
  function readSplit(file) {
    NS.loadJs(LIB).then(function () { return file.arrayBuffer(); }).then(function (b) {
      return pageCount(b).then(function (n) { SP.name = file.name; SP.bytes = b; SP.pages = n; SP.ranges = ''; A.show(); });
    }).catch(function () { NS.toast('Could not read this PDF. It may be damaged or protected against changes.', 'bad'); });
  }
  function saveSplit() {
    var L = window.PDFLib, r = parseRanges(SP.ranges, SP.pages);
    if (r === false) { NS.toast('Check the page numbers: this PDF has pages 1 to ' + SP.pages + '.', 'bad'); return; }
    var groups;
    if (!r) { groups = []; for (var i = 0; i < SP.pages; i++) groups.push([i]); if (!SP.each) groups = [groups.map(function (g) { return g[0]; })]; }
    else groups = SP.each ? r : [[].concat.apply([], r)];
    var base = SP.name.replace(/\.pdf$/i, '');
    L.PDFDocument.load(SP.bytes, { ignoreEncryption: true }).then(function (src) {
      return groups.reduce(function (pr, g) {
        return pr.then(function () {
          return L.PDFDocument.create().then(function (out) {
            return out.copyPages(src, g).then(function (pg) { pg.forEach(function (p) { out.addPage(p); }); return out.save(); }).then(function (b) {
              var lab = g.length === 1 ? 'page ' + (g[0] + 1) : 'pages ' + (g[0] + 1) + '-' + (g[g.length - 1] + 1);
              if (!SP.each && r) lab = 'pages ' + r.map(function (x) { return x.length === 1 ? x[0] + 1 : (x[0] + 1) + '-' + (x[x.length - 1] + 1); }).join(',');   /* "4-" names the real last page */
              NS.saveFile(new Blob([b], { type: 'application/pdf' }), base + ' ' + lab + '.pdf');
            });
          });
        });
      }, Promise.resolve());
    }).then(function () { NS.toast(groups.length === 1 ? 'Saved the new PDF' : 'Saved ' + groups.length + ' PDF files'); }, function () { NS.toast('Could not split this PDF. It may be protected against changes.', 'bad'); });
  }
  /* ---------- Sign a PDF with the person's DSC (USB token), through the NSBiz Helper program (phase 9): pdfsign.js ---------- */
  var SG = { name: '', bytes: null, certs: null, thumb: '', reason: 'Approved', place: '', stamp: true, err: '' };
  function signHtml() {
    var h = '<div class="pane-hd"><h2>Sign a PDF with your DSC</h2></div><p class="soft">Sign a bill, letter or return PDF with your Class 3 DSC (USB token), the standard PDF signature that Adobe Reader and the portals check. The token\u2019s own window asks for your PIN: NSBiz never sees it. The file you open is not changed; the signed copy is saved as a new file.</p>';
    if (!NS.helperUp) return h + '<div class="card"><p class="note">This needs the <b>NSBiz Helper program</b> on this PC, with the browser add-on (in the add-on\u2019s window: Helper program on this PC), and your token\u2019s own software (its driver) installed, as for the GST or MCA portal.</p><button type="button" class="btn" id="sg-again">Check again</button></div>';
    h += '<div class="pr-bar"><label class="btn primary" for="sg-file">' + (SG.name ? 'Open another PDF' : 'Open a PDF') + '</label><input type="file" id="sg-file" class="sr" accept=".pdf,application/pdf"></div>';
    if (!SG.name) return h;
    var C = SG.certs;
    return h + '<p><b>' + esc(SG.name) + '</b></p><div class="card">' +
      (C === null ? '<p class="soft">Looking for your certificates\u2026</p>' : !C.length ? '<p class="note">No signing certificate found. Plug in the token and check that its software shows the certificate, then press Check again.</p>' :
        '<label>Certificate <select id="sg-cert">' + C.map(function (c) { return '<option value="' + esc(c.thumb) + '"' + (c.thumb === SG.thumb ? ' selected' : '') + '>' + esc(c.name + ' \u00b7 ' + c.issuer + ' \u00b7 valid till ' + c.till + (c.where === 'test' ? ' (test)' : '')) + '</option>'; }).join('') + '</select></label>') +
      '<p><label>Reason <input id="sg-reason" value="' + esc(SG.reason) + '"></label> <label>Place <input id="sg-place" value="' + esc(SG.place) + '" placeholder="City"></label></p>' +
      '<p><label><input type="checkbox" id="sg-stamp"' + (SG.stamp ? ' checked' : '') + '> Show "Digitally signed by \u2026" on the last page</label></p>' +
      (SG.err ? '<p class="note bad">' + esc(SG.err) + '</p>' : '') +
      '<div class="pr-bar"><button type="button" class="btn primary" id="sg-go" data-ic="download"' + (C && C.length ? '' : ' disabled') + '>Sign and save</button><button type="button" class="btn" id="sg-again">Check again</button></div></div>';
  }
  function signCerts() { SG.certs = null; return NS.helper('certs').then(function (r) { SG.certs = r.certs || []; if (!SG.thumb && SG.certs[0]) SG.thumb = SG.certs[0].thumb; }, function (e) { SG.certs = []; SG.err = e.message; }).then(function () { A.show(); }); }
  function signGo() {
    var S = window.NSPdfSign, c = (SG.certs || []).filter(function (x) { return x.thumb === SG.thumb; })[0];
    if (!S || !c || !SG.bytes) return;
    SG.err = ''; NS.toast('Signing\u2026 your token may ask for its PIN in its own window.');
    var p = null;
    NS.loadJs(LIB).then(function () { return S.prepare(SG.bytes, { name: c.name, reason: SG.reason, place: SG.place, stamp: SG.stamp }); }).then(function (x) {
      p = x; return NS.helper('signCms', { thumb: c.thumb, b64: NS.u8b64(S.toSign(p)), reason: SG.reason });
    }).then(function (r) {
      var out = S.finish(p, NS.b64u8(r.cms)), nm = SG.name.replace(/\.pdf$/i, '') + ' (signed).pdf';
      NS.saveFile(new Blob([out], { type: 'application/pdf' }), nm); NS.toast('Signed by ' + (r.name || c.name) + ': saved as "' + nm + '".');
    }).catch(function (e) { SG.err = String(e && e.message || e); A.show(); });
  }
  function wireSign(pane) {
    var f = $('#sg-file', pane); if (f) f.addEventListener('change', function () {
      var x = f.files[0]; f.value = ''; if (!x) return;
      x.arrayBuffer().then(function (b) { SG.name = x.name; SG.bytes = new Uint8Array(b); SG.err = window.NSPdfSign && NSPdfSign.signedAlready(SG.bytes) ? 'This PDF is already signed. Signing it again here would break the earlier signature.' : ''; return signCerts(); });
    });
    var ag = $('#sg-again', pane); if (ag) ag.addEventListener('click', function () { SG.err = ''; NS.helperCheck().then(function () { return NS.helperUp && SG.name ? signCerts() : A.show(); }); });
    var sc = $('#sg-cert', pane); if (sc) sc.addEventListener('change', function () { SG.thumb = sc.value; });
    var sr = $('#sg-reason', pane); if (sr) sr.addEventListener('input', function () { SG.reason = sr.value; });
    var sp = $('#sg-place', pane); if (sp) sp.addEventListener('input', function () { SG.place = sp.value; });
    var st = $('#sg-stamp', pane); if (st) st.addEventListener('change', function () { SG.stamp = st.checked; });
    var go = $('#sg-go', pane); if (go) go.addEventListener('click', signGo);
  }
  document.addEventListener('ns-helper', function () { if (/^#pdffill/.test(location.hash) && ST.mode === 'sign') A.show(); });
  function wireJS(pane) {
    $$('[data-pfm]', pane).forEach(function (b) { b.addEventListener('click', function () { ST.mode = b.getAttribute('data-pfm'); A.show(); }); });
    var jf = $('#jn-file', pane); if (jf) jf.addEventListener('change', function () { if (jf.files.length) addJoin([].slice.call(jf.files)); jf.value = '';   /* copy first: clearing the box empties its live file list */ });
    var js = $('#jn-save', pane); if (js) js.addEventListener('click', saveJoin);
    var jc = $('#jn-clear', pane); if (jc) jc.addEventListener('click', function () { JN.files = []; A.show(); });
    $$('[data-jn]', pane).forEach(function (b) { b.addEventListener('click', function () {
      var i = +b.getAttribute('data-i'), k = b.getAttribute('data-jn'), f = JN.files;
      if (k === 'rm') f.splice(i, 1); else { var j = k === 'up' ? i - 1 : i + 1; var x = f[i]; f[i] = f[j]; f[j] = x; }
      A.show();
    }); });
    var sf = $('#sp-file', pane); if (sf) sf.addEventListener('change', function () { if (sf.files[0]) readSplit(sf.files[0]); sf.value = ''; });
    var sr = $('#sp-r', pane); if (sr) sr.addEventListener('input', function () { SP.ranges = sr.value; });
    $$('[name=sp-k]', pane).forEach(function (x) { x.addEventListener('change', function () { SP.each = x.value === 'each' && x.checked; }); });
    var ss = $('#sp-save', pane); if (ss) ss.addEventListener('click', saveSplit);
  }
  window.NSPdfTools = { parseRanges: parseRanges };
  A.addSection('pdffill', function () { var m = ST.mode || 'fill'; return tabs() + (m === 'join' ? joinHtml() : m === 'split' ? splitHtml() : m === 'sign' ? signHtml() : html()); }, function (pane) { wireJS(pane); if (ST.mode === 'sign') wireSign(pane); if ((ST.mode || 'fill') === 'fill') wire(pane); });
  function menu() {
    var nav = $('.hub-nav'), app = $('#app'); if (!nav || !app || app.getAttribute('data-secs') || $('[data-sec="pdffill"]', nav)) return;
    nav.appendChild(NS.el('a', { href: '#pdffill', 'data-sec': 'pdffill' }, '<span>' + esc(NS.t('app.pdffill')) + '</span>'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', menu); else menu();
  setTimeout(menu, 400);
})();

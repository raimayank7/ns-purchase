/* NSMsg: the engine of NSBiz's SMS and WhatsApp messages (owner, 26 Nov 2026). Pure, no screen; the "Messages" screen (msgs.js),
   NSBiz for Windows and the tests use it.
   NSBiz works like bulk SMS software: the business buys SMS (or WhatsApp) from any company, enters that company's API details once,
   and NSBiz only manages and sends: contacts, DLT templates, personalised messages, campaigns, reports. Nothing goes through an
   account of Nivesh Sahayak's own.
   A company = { method, url, headers, body, mobile ('91'|'10'|'+91'), ok (words of a good reply), bad (words of a refusal) } where
   {mobile} {message} {sender} {template} {entity} {key} {user} {password} {vars} {var1}..{var9} {vars_json} {lang} {name} are filled per
   message (secrets stay as placeholders until the sending side fills them: NSBiz for Windows keeps them locked with DPAPI).
   Designed & Developed by: Nivesh Sahayak (https://www.niveshsahayak.in/) */
(function (G) {
  'use strict';
  function t(s) { return String(s == null ? '' : s).trim(); }

  /* ---------- ready settings for well-known companies (their published APIs); anything else: paste its address (parseUrl) ---------- */
  var PRESETS = [
    { id: 'fast2sms', name: 'Fast2SMS', ch: 'sms', need: ['key', 'sender'], note: 'DLT route: the "Message ID" Fast2SMS shows for each approved template goes in Template ID.',
      method: 'GET', url: 'https://www.fast2sms.com/dev/bulkV2?authorization={key}&route=dlt&sender_id={sender}&message={template}&variables_values={vars}&numbers={mobile}&flash=0', mobile: '10', ok: '"return":true', bad: '"return":false' },
    { id: 'msg91', name: 'MSG91', ch: 'sms', need: ['key'], note: 'MSG91 sends through its "Flow": its Template / Flow ID goes in Template ID; the fill-in places are var1, var2...',
      method: 'POST', url: 'https://control.msg91.com/api/v5/flow', headers: { authkey: '{key}', 'content-type': 'application/json', accept: 'application/json' },
      body: '{"template_id":"{template}","short_url":"0","recipients":[{"mobiles":"{mobile}"{vars_kv}}]}', mobile: '91', ok: '"type":"success"', bad: '"type":"error"' },
    { id: 'smsalert', name: 'SMS Alert', ch: 'sms', need: ['key', 'sender'], method: 'GET',
      url: 'https://www.smsalert.co.in/api/push.json?apikey={key}&sender={sender}&mobileno={mobile}&text={message}&template_id={template}', mobile: '10', ok: '"status":"success"', bad: '"status":"error"' },
    { id: 'textlocal', name: 'Textlocal (India)', ch: 'sms', need: ['key', 'sender'], method: 'GET',
      url: 'https://api.textlocal.in/send/?apikey={key}&numbers={mobile}&sender={sender}&message={message}', mobile: '91', ok: '"status":"success"', bad: '"status":"failure"' },
    { id: 'panel', name: 'A reseller SMS panel (user name and password)', ch: 'sms', need: ['user', 'password', 'sender'], note: 'Most Indian SMS panels look like this. Better: paste the address your panel gave you and NSBiz reads it.',
      method: 'GET', url: 'http://example-panel.in/api/sendhttp.php?user={user}&password={password}&sender={sender}&mobile={mobile}&message={message}&templateid={template}&entityid={entity}', mobile: '10', ok: '', bad: 'error|invalid|fail' },
    { id: 'meta', name: 'WhatsApp: Meta Cloud API (official)', ch: 'wa', need: ['key', 'phoneid'], note: 'From Meta\'s WhatsApp Manager: the permanent access token (key) and the Phone number ID. Most WhatsApp providers (Gupshup, Interakt, AiSensy, WATI) also give the same official API.',
      method: 'POST', url: 'https://graph.facebook.com/v21.0/{phoneid}/messages', headers: { authorization: 'Bearer {key}', 'content-type': 'application/json' },
      body: '{"messaging_product":"whatsapp","to":"{mobile}","type":"template","template":{"name":"{template}","language":{"code":"{lang}"},"components":[{"type":"body","parameters":{vars_wa}}]}}', mobile: '91', ok: '"messages"', bad: '"error"' }
  ];

  /* ---------- reading the address an SMS company gives ("use this link to send") ---------- */
  var ROLES = [
    ['mobile', /^(mobile|mobiles|mobileno|mobile_no|mob|number|numbers|phone|phoneno|to|msisdn|dest|destination|receiver|recipient|recipients|contacts|tonumber)$/],
    ['message', /^(message|msg|text|sms|content|smstext|body|msgtext|textmessage)$/],
    ['sender', /^(sender|senderid|sender_id|from|header|source|sid|senderids|signature)$/],
    ['template', /^(templateid|template_id|tempid|temp_id|dlt_te_id|dlttemplateid|dlt_template_id|te_id|tid|dlttempid|template)$/],
    ['entity', /^(entityid|entity_id|peid|pe_id|dlt_pe_id|dltentityid|principal_entity_id|pe)$/],
    ['key', /^(apikey|api_key|authkey|auth_key|key|token|apitoken|api_token|authorization|access_token|secret|apiid|api_id)$/],
    ['user', /^(user|username|uname|userid|user_id|loginid|login|account|usr)$/],
    ['password', /^(password|pass|pwd|passwd|api_password)$/]
  ];
  function roleOf(name) { var k = String(name || '').toLowerCase(), r = ''; ROLES.some(function (x) { if (x[1].test(k)) { r = x[0]; return true; } return false; }); return r; }
  /* the pasted address with real values -> a company setting: which part is which, the values found (secrets kept apart), fixed parts kept */
  function parseUrl(s) {
    s = t(s); var m = s.match(/^(https?:\/\/[^?#\s]+)(\?([^#\s]*))?/i); if (!m) return null;
    var base = m[1], q = m[3] || '', parts = [], found = {}, secrets = {};
    q.split('&').forEach(function (p) {
      if (!p) return; var i = p.indexOf('='), k = decodeURIComponent((i < 0 ? p : p.slice(0, i)).replace(/\+/g, ' ')), v = i < 0 ? '' : decodeURIComponent(p.slice(i + 1).replace(/\+/g, ' '));
      var role = roleOf(k);
      if (role && !found[role]) { found[role] = k; if (role === 'key' || role === 'password' || role === 'user') secrets[role] = v; else if (role === 'sender' || role === 'entity') secrets[role] = v; parts.push(encodeURIComponent(k) + '={' + role + '}'); }
      else parts.push(p);
    });
    var url = base + (parts.length ? '?' + parts.join('&') : '');
    var missing = ['mobile', 'message'].filter(function (r) { return !found[r]; });
    return { method: 'GET', url: url, found: found, values: secrets, missing: missing, mobile: '10', ok: '', bad: 'error|invalid|fail|wrong|insufficient' };
  }

  /* ---------- DLT / WhatsApp templates ---------- */
  /* the places to fill: DLT writes {#var#}; WhatsApp {{1}} {{2}} */
  function slots(text) { var n = 0; String(text || '').replace(/\{#var#\}|\{\{\d+\}\}/gi, function () { n++; return ''; }); return n; }
  /* NSBiz's own fields a place can take */
  var FIELDS = [['name', 'Party name'], ['due', 'Amount due'], ['billno', 'Bill number'], ['billamt', 'Bill amount'], ['date', 'Date'], ['duedate', 'Due date'], ['paid', 'Amount received'],
    ['business', 'Your business name'], ['phone', 'Your phone'], ['upi', 'UPI ID'], ['link', 'Payment / bill link'], ['text', 'Text typed on the send screen']];
  function fill(text, vals) {
    var i = 0; return String(text || '').replace(/\{#var#\}|\{\{\d+\}\}/gi, function () { var v = vals[i++]; return v == null ? '' : String(v); });
  }
  /* each value DLT allows in a {#var#}: up to 30 characters */
  function checkVals(vals, ch) { var bad = []; vals.forEach(function (v, i) { if (ch === 'sms' && String(v).length > 30) bad.push(i + 1); }); return bad; }
  /* ready wordings to get approved on DLT (service = transactional / service implicit) and on WhatsApp; the business may change them */
  var SUGGEST = [
    { id: 'due', kind: 'service', name: 'Payment reminder', vars: ['name', 'due', 'business', 'phone'],
      en: 'Dear {#var#}, Rs {#var#} is due to {#var#}. Kindly pay at the earliest. For queries call {#var#}.',
      hi: 'प्रिय {#var#}, {#var#} को रु {#var#} का भुगतान बाकी है। कृपया जल्द भुगतान करें। जानकारी के लिए {#var#} पर कॉल करें।', hiVars: ['name', 'business', 'due', 'phone'],
      pa: 'ਪਿਆਰੇ {#var#}, {#var#} ਦਾ ਰੁ {#var#} ਬਕਾਇਆ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਜਲਦੀ ਭੁਗਤਾਨ ਕਰੋ। ਜਾਣਕਾਰੀ ਲਈ {#var#} ਤੇ ਕਾਲ ਕਰੋ।', paVars: ['name', 'business', 'due', 'phone'] },
    { id: 'bill', kind: 'service', name: 'Bill sent', vars: ['name', 'billno', 'billamt', 'business'],
      en: 'Dear {#var#}, bill no {#var#} for Rs {#var#} has been issued by {#var#}. Thank you for your business.',
      hi: 'प्रिय {#var#}, बिल नं {#var#} रु {#var#} का {#var#} द्वारा जारी किया गया है। धन्यवाद।', hiVars: ['name', 'billno', 'billamt', 'business'],
      pa: 'ਪਿਆਰੇ {#var#}, ਬਿੱਲ ਨੰ {#var#} ਰੁ {#var#} ਦਾ {#var#} ਵੱਲੋਂ ਜਾਰੀ ਕੀਤਾ ਗਿਆ ਹੈ। ਧੰਨਵਾਦ।', paVars: ['name', 'billno', 'billamt', 'business'] },
    { id: 'paid', kind: 'service', name: 'Payment received', vars: ['name', 'paid', 'date', 'business'],
      en: 'Dear {#var#}, we have received Rs {#var#} on {#var#}. Thank you. {#var#}',
      hi: 'प्रिय {#var#}, हमें {#var#} को रु {#var#} प्राप्त हुए। धन्यवाद। {#var#}', hiVars: ['name', 'date', 'paid', 'business'],
      pa: 'ਪਿਆਰੇ {#var#}, ਸਾਨੂੰ {#var#} ਨੂੰ ਰੁ {#var#} ਮਿਲ ਗਏ ਹਨ। ਧੰਨਵਾਦ। {#var#}', paVars: ['name', 'date', 'paid', 'business'] },
    { id: 'greet', kind: 'promo', name: 'Greeting / offer', vars: ['name', 'text', 'business'],
      en: 'Dear {#var#}, {#var#} - {#var#}',
      hi: 'प्रिय {#var#}, {#var#} - {#var#}', hiVars: ['name', 'text', 'business'],
      pa: 'ਪਿਆਰੇ {#var#}, {#var#} - {#var#}', paVars: ['name', 'text', 'business'] }
  ];

  /* ---------- message length: SMS parts (GSM-7: 160 / 153 a part; any Hindi, Punjabi or other letter: Unicode, 70 / 67) ---------- */
  var GSM = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
  var GSMX = '^{}\\[~]|€';
  function parts(text) {
    var s = String(text || ''), uni = false, len = 0;
    for (var i = 0; i < s.length; i++) { var c = s[i]; if (GSM.indexOf(c) >= 0) len++; else if (GSMX.indexOf(c) >= 0) len += 2; else { uni = true; break; } }
    if (uni) { len = s.length; return { unicode: true, chars: len, parts: len <= 70 ? 1 : Math.ceil(len / 67) }; }
    return { unicode: false, chars: len, parts: len <= 160 ? 1 : Math.ceil(len / 153) };
  }

  /* ---------- mobile numbers (India) ---------- */
  function mobile(s, style) {
    var d = String(s || '').replace(/\D/g, '');
    if (d.length === 12 && d.slice(0, 2) === '91') d = d.slice(2); else if (d.length === 11 && d[0] === '0') d = d.slice(1); else if (d.length === 13 && d.slice(0, 3) === '091') d = d.slice(3);
    if (!/^[6-9]\d{9}$/.test(d)) return '';
    return style === '91' ? '91' + d : style === '+91' ? '+91' + d : d;
  }

  /* ---------- promotional hours (TRAI): 10 am to 9 pm, India time ---------- */
  function promoOk(when) {
    var d = when ? new Date(when) : new Date(), ist = new Date(d.getTime() + (330 + d.getTimezoneOffset()) * 60000), h = ist.getHours();
    return h >= 10 && h < 21;
  }

  /* ---------- a batch: recipients x template -> messages, with every reason a row is left out ----------
     rcp: [{ name, mobile, fields: { due, billno, ... } }]; tpl: { text, vars: [field per place], ch, kind, lang, tid }; ctx: { business, phone, upi, text };
     opts: { stop: { mobile10: 1 }, cap (daily limit left), style }
     -> { msgs: [{ to, name, text, vals, parts }], left: [{ name, mobile, why }], totalParts } */
  function batch(rcp, tpl, ctx, opts) {
    opts = opts || {}; ctx = ctx || {};
    var seen = {}, out = [], left = [], total = 0, cap = opts.cap == null ? Infinity : opts.cap;
    (rcp || []).forEach(function (r) {
      var m10 = mobile(r.mobile, '10');
      if (!m10) return left.push({ name: r.name, mobile: r.mobile, why: r.mobile ? 'not a mobile number' : 'no mobile number' });
      if (opts.stop && opts.stop[m10]) return left.push({ name: r.name, mobile: r.mobile, why: 'asked not to get messages' });
      if (seen[m10]) return left.push({ name: r.name, mobile: r.mobile, why: 'same number twice' });
      seen[m10] = 1;
      var f = Object.assign({ name: r.name }, ctx, r.fields || {}), vals = (tpl.vars || []).map(function (k) { return f[k] == null ? '' : String(f[k]); });
      var empty = vals.map(function (v, i) { return v === '' ? i + 1 : 0; }).filter(Boolean);
      if (empty.length) return left.push({ name: r.name, mobile: r.mobile, why: 'nothing to fill in place ' + empty.join(', ') });
      var long = checkVals(vals, tpl.ch);
      if (long.length) return left.push({ name: r.name, mobile: r.mobile, why: 'place ' + long.join(', ') + ' is longer than 30 letters (DLT limit)' });
      if (out.length >= cap) return left.push({ name: r.name, mobile: r.mobile, why: 'over the daily limit' });
      var text = fill(tpl.text, vals), p = parts(text);
      total += p.parts;
      out.push({ to: mobile(m10, opts.style || '10'), m10: m10, name: r.name, text: text, vals: vals, parts: p.parts, unicode: p.unicode });
    });
    return { msgs: out, left: left, totalParts: total };
  }

  /* ---------- one message -> the request to the company (secrets left as {key} {password} {user} unless given) ---------- */
  function enc(s) { return encodeURIComponent(String(s == null ? '' : s)); }
  function jstr(s) { return JSON.stringify(String(s == null ? '' : s)).slice(1, -1); }
  function request(acct, tpl, msg, secrets) {
    var S = secrets || {}, A = acct || {}, vals = msg.vals || [];
    var V = { mobile: msg.to, message: msg.text, sender: tpl.kind === 'promo' ? (A.senderPromo || A.sender) : A.sender, template: tpl.tid || '', entity: A.entity || '', lang: tpl.lang || 'en',
      phoneid: A.phoneid || '', vars: vals.join('|'), vars_json: JSON.stringify(vals), name: msg.name || '' };
    vals.forEach(function (v, i) { V['var' + (i + 1)] = v; });
    ['key', 'user', 'password'].forEach(function (k) { if (S[k] != null) V[k] = S[k]; });
    function sub(s, how) {
      return String(s || '').replace(/\{(vars_kv|vars_wa|[a-z_]+\d*)\}/g, function (all, k) {
        if (k === 'vars_kv') return vals.map(function (v, i) { return ',"var' + (i + 1) + '":"' + jstr(v) + '"'; }).join('');
        if (k === 'vars_wa') return JSON.stringify(vals.map(function (v) { return { type: 'text', text: String(v) }; }));
        if (!(k in V)) return all;   /* a secret the sending side fills */
        return how === 'url' ? enc(V[k]) : how === 'json' ? jstr(V[k]) : String(V[k]);
      });
    }
    var h = {}; Object.keys(A.headers || {}).forEach(function (k) { h[k] = sub(A.headers[k], 'raw'); });
    var json = /json/i.test(h['content-type'] || h['Content-Type'] || '');
    return { method: A.method || 'GET', url: sub(A.url, 'url'), headers: h, body: A.body ? sub(A.body, json ? 'json' : 'url') : '' };
  }
  /* the company's reply: sent or not (its own words) */
  function verdict(acct, status, text) {
    var s = String(text || ''), bad = acct.bad ? new RegExp(acct.bad.replace(/[.*+?^${}()[\]\\]/g, function (c) { return c === '|' ? c : '\\' + c; }), 'i') : null;
    var ok = acct.ok ? s.indexOf(acct.ok) >= 0 : true;
    if (!(status >= 200 && status < 300)) return { ok: false, why: 'HTTP ' + status + ': ' + s.slice(0, 200) };
    if (bad && bad.test(s) && !(acct.ok && s.indexOf(acct.ok) >= 0)) return { ok: false, why: s.slice(0, 200) };
    if (!ok) return { ok: false, why: 'Unexpected reply: ' + s.slice(0, 200) };
    return { ok: true, ref: refOf(s) };
  }
  /* the company's message id for the report: WhatsApp {"messages":[{"id":"wamid..."}]}, JSON "request_id" / "message_id" / "id", else the reply itself */
  function refOf(s) {
    try {
      var j = JSON.parse(s), m = j && j.messages && j.messages[0];
      var v = (m && m.id) || j.request_id || j.message_id || j.messageId || j.msgid || j.id || (j.data && (j.data.message_id || j.data.id || j.data.request_id));
      if (v != null && typeof v !== 'object') return String(v).slice(0, 120);
    } catch (e) {}
    return s.slice(0, 120);
  }

  /* ---------- free sending through the user's own WhatsApp or phone (like Busy, Vyapar, myBillBook) ----------
     'mywa' = the business's own WhatsApp number, 'mysms' = the SIM in its own phone. No company, no account, no cost:
     NSBiz opens WhatsApp (or the SMS app) with the number and the message filled in, and the user presses Send there.
     how: 'app' (WhatsApp on this computer), 'web' (WhatsApp Web), 'phone' (wa.me: the phone's WhatsApp), 'ios' (iPhone SMS) */
  var OWN = { mywa: 1, mysms: 1 };
  function ownLink(ch, to, text, how) {
    var d = String(to || '').replace(/\D/g, ''), t = encodeURIComponent(String(text || ''));
    if (d.length === 10) d = '91' + d;
    if (ch === 'mysms') return 'sms:+' + d + (how === 'ios' ? '&' : '?') + 'body=' + t;
    if (how === 'app') return 'whatsapp://send?phone=' + d + '&text=' + t;
    if (how === 'web') return 'https://web.whatsapp.com/send?phone=' + d + '&text=' + t;
    return 'https://wa.me/' + d + '?text=' + t;
  }

  var API = { OWN: OWN, ownLink: ownLink, PRESETS: PRESETS, FIELDS: FIELDS, SUGGEST: SUGGEST, parseUrl: parseUrl, roleOf: roleOf, slots: slots, fill: fill, parts: parts, mobile: mobile, promoOk: promoOk, batch: batch, request: request, verdict: verdict };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.NSMsg = API;
})(typeof window !== 'undefined' ? window : this);

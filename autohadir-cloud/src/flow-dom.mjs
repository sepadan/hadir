// Port of IdMeLoginWebView2 + AplikasiIdMe. This self-contained function is
// shipped verbatim over CDP; dom-browser.test.mjs exercises it in Chromium.
// No href, phrase, page text, credential value or exception leaves the page.
function portalDom(action, account) {
  try {
    const trusted = (raw, host) => {
      try { const u=new URL(raw); return u.protocol==='https:' && u.hostname===host && !u.port && !u.username && !u.password; } catch { return false; }
    };
    const visible = e => !!e && !e.disabled && e.getClientRects().length>0 && getComputedStyle(e).visibility!=='hidden' && getComputedStyle(e).display!=='none';
    const first = sel => Array.from(document.querySelectorAll(sel)).find(visible);
    // Location's native unforgeable fields, not a page-replaceable URL
    // constructor, guard every credential/click action in this same script.
    const here=window.location;
    const secure=here.protocol==='https:'&&!here.port;
    const host=secure&&here.hostname==='idme.moe.gov.my'&&here.href.startsWith('https://idme.moe.gov.my/')?'idme':secure&&here.hostname==='moeispel.moe.gov.my'&&here.href.startsWith('https://moeispel.moe.gov.my/')?'moeis':'untrusted';
    const result = code => ({code,host,login:false,verification:false,dashboard:false,application:false,attendance:false,school:false});
    if(host==='untrusted') return result('untrusted-page');
    const text = document.body?.innerText || '';
    if(/access denied|forbidden|requested url was rejected|imperva|incapsula|perkhidmatan tidak tersedia|sekatan atas faktor keselamatan|checking your browser|verify you are human/i.test(text)) return result('portal-blocked');
    // #captcha canvas is the normal security phrase, never an OTP challenge.
    if(Array.from(document.querySelectorAll('.g-recaptcha, iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"], #cf-turnstile, input[name*="otp" i], input[name*="tac" i], input[name*="captcha" i], input[id*="captcha" i], input[autocomplete="one-time-code"]')).some(visible) || /sila masukkan kod otp|two.factor authentication|pengesahan dua faktor/i.test(text)) return result('human-required');
    if(!document.body || !text.trim()) return result('unknown-page');
    const ic = first('input[placeholder*="KAD PENGENALAN" i],input[placeholder*="pengenalan" i],input[name*="pengenalan" i],input[name="username"],input[name="no_kp"]');
    const checkbox = first('input#check_log[type="checkbox"],input[name="check"][type="checkbox"]');
    const password = first('input#password[type="password"],input[name="password"][type="password"]');
    const buttons = Array.from(document.querySelectorAll('button,input[type="submit"]')).filter(e=>visible(e)&&e.id!=='log_disbale_form');
    const label = e => (e.innerText||e.value||'').trim();
    const next = buttons.find(e=>/^(seterusnya|teruskan|continue|next|daftar masuk)$/i.test(label(e)));
    const submit = buttons.find(e=>/^daftar masuk$/i.test(label(e)));
    const list = Array.from(document.querySelectorAll('a[href]')).find(e=>visible(e)&&trusted(e.href,'idme.moe.gov.my')&&new URL(e.href).pathname==='/list_aplikasi');
    const candidates = Array.from(document.querySelectorAll('a[href]')).filter(e=>visible(e)&&trusted(e.href,'moeispel.moe.gov.my'));
    const app = candidates.find(e=>/pengurusan murid|modul murid|moeis/i.test(label(e))) || candidates[0];
    const login = host==='idme' && location.pathname==='/login' && !!ic && !!next && !checkbox;
    const verification = host==='idme' && /^\/loginverification(?:\/|$)/.test(location.pathname) && !!checkbox;
    const dashboard = host==='idme' && !ic && !checkbox && !!list;
    const application = host==='idme' && location.pathname==='/list_aplikasi' && !ic && !checkbox && !!app;
    const attendance = host==='moeis' && location.pathname==='/sahsiah/kehadiran/pkhem/tabguru' && visible(document.querySelector('#kehadiran')) && !!first('#kehadiran input.case-hadir[data-idpelajar],#kehadiran input.idpelajarthadir,#kehadiran select.selectsebab');
    // Identity must be in an explicit current-school header or selected option,
    // never arbitrary body/footer text or an unselected school-picker option.
    const identityNodes=Array.from(document.querySelectorAll('header,h1,.school-identity,[data-school-code],#namaSekolah,#kodSekolah,.nama-sekolah'))
      .filter(e=>visible(e)&&!e.closest('footer,select,[role="listbox"]')&&!e.querySelector('select,[role="listbox"]'));
    const identities=identityNodes.map(e=>(e.innerText||'')+' '+(e.getAttribute('data-school-code')||''));
    for(const select of document.querySelectorAll('select[name*="sekolah" i],select[id*="sekolah" i],select[data-school-picker]')) {
      if(visible(select)) {const option=select.selectedOptions[0];if(option)identities.push((option.textContent||'')+' '+(option.getAttribute('data-school-code')||''));}
    }
    const school = host==='moeis' && identities.some(value=>/\bJBA5054\b/i.test(value)&&/\b(?:SK|SEKOLAH\s+KEBANGSAAN)\s+Paya\s+Redan\b/i.test(value));
    const observation = {...result('observed'),login,verification,dashboard,application,attendance,school};
    if(action==='observe') {
      if(host==='idme' && (ic||checkbox) && /kata laluan (tidak betul|salah)|incorrect password|wrong password|invalid password|no\.?\s*kad pengenalan[^.\n]{0,40}(salah|tidak betul)/i.test(text)) observation.code='credential-rejected';
      return observation;
    }
    function fill(e,value) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);
      e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true}));
    }
    if(action==='identifier') {
      if(!login || typeof account?.identifier!=='string') return result('wrong-stage');
      fill(ic,account.identifier); next.click(); return result('acted');
    }
    if(action==='checkbox' || action==='password') {
      if(!verification || typeof account?.phrase!=='string') return result('wrong-stage');
      const hint=/kunci keselamatan|security phrase|security key|frasa keselamatan/i;
      let phrase = null;
      const box=first('.security-phrase,.kunci-keselamatan,.kata-kunci-box');
      if(box) { const t=box.textContent.trim(); if(t&&!hint.test(t)) phrase=t; }
      if(phrase===null) {
        const labels=Array.from(document.querySelectorAll('body *')).filter(e=>visible(e)&&e.children.length===0&&e.textContent.length<=80&&hint.test(e.textContent));
        for(const e of labels) { const sibling=e.nextElementSibling; if(sibling && visible(sibling) && !/^(INPUT|LABEL|CANVAS|IMG)$/.test(sibling.tagName)) { const t=sibling.textContent.trim(); if(t&&!hint.test(t)) {phrase=t;break;} } }
      }
      if(phrase!==null && phrase!==account.phrase) return result('phrase-mismatch');
      if(phrase===null && account.allowUnreadablePhrase!==true) return result('phrase-unreadable');
      if(action==='checkbox') {
        if(!checkbox.checked) checkbox.click();
        return result(checkbox.checked && !!first('input#password[type="password"],input[name="password"][type="password"]') ? 'acted' : 'checkbox-required');
      }
      if(!checkbox.checked || !password) return result('checkbox-required');
      if(!submit || typeof account.password!=='string') return result('button-missing');
      fill(password,account.password); submit.click(); return result('acted');
    }
    if(action==='applications' && dashboard) { list.click(); return result('acted'); }
    if(action==='handoff' && application) { app.click(); return result('acted'); }
    // Only called AFTER a successful handoff; the durable runner enforces that.
    if(action==='attendance' && host==='moeis') { location.assign('https://moeispel.moe.gov.my/sahsiah/kehadiran/pkhem/tabguru'); return result('acted'); }
    return result('wrong-stage');
  } catch { return {code:'unknown-page',host:'untrusted',login:false,verification:false,dashboard:false,application:false,attendance:false,school:false}; }
}
export const PORTAL_FUNCTION = portalDom.toString();
export const PORTAL_ACTIONS = Object.freeze(['observe','identifier','checkbox','password','applications','handoff','attendance']);
export const PORTAL_CODES = Object.freeze(['observed','acted','untrusted-page','portal-blocked','human-required','unknown-page','credential-rejected','wrong-stage','phrase-mismatch','phrase-unreadable','checkbox-required','button-missing']);
export function sanitizePortalResult(raw) {
  if(!raw || typeof raw!=='object' || Array.isArray(raw) || !PORTAL_CODES.includes(raw.code) || !['idme','moeis','untrusted'].includes(raw.host)) return null;
  const clean={code:raw.code,host:raw.host};
  for(const k of ['login','verification','dashboard','application','attendance','school']) {
    if(typeof raw[k]!=='boolean') return null;
    clean[k]=raw[k];
  }
  return clean;
}
export function validPortalCall(params) {
  if(params?.functionDeclaration!==PORTAL_FUNCTION || params.returnByValue!==true || params.awaitPromise!==false) return false;
  if(Object.keys(params).some(k=>!['objectId','functionDeclaration','arguments','returnByValue','awaitPromise'].includes(k)) || typeof params.objectId!=='string' || params.objectId.length>256) return false;
  const args=params.arguments;
  if(!Array.isArray(args) || args.length!==2 || args.some(a=>!a || Object.keys(a).length!==1 || !Object.hasOwn(a,'value'))) return false;
  const action=args[0].value, a=args[1].value;
  if(!PORTAL_ACTIONS.includes(action)) return false;
  if(!['identifier','checkbox','password'].includes(action)) return a===null;
  if(!a || typeof a!=='object' || Array.isArray(a)) return false;
  const fields=action==='identifier'?['identifier']:action==='checkbox'?['phrase','allowUnreadablePhrase']:['password','phrase','allowUnreadablePhrase'];
  if(Object.keys(a).length!==fields.length || Object.keys(a).some(k=>!fields.includes(k))) return false;
  return fields.every(k=>k==='allowUnreadablePhrase'?typeof a[k]==='boolean':typeof a[k]==='string' && a[k].length>0 && a[k].length<=512);
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {localBrowser} from './helpers/local-browser.mjs';
import {PORTAL_FUNCTION} from '../src/flow-dom.mjs';
import {renderAuthenticatedHtml,renderAppJs,renderStyleCss} from '../src/ui.mjs';
const IDME='https://idme.moe.gov.my',MOEIS='https://moeispel.moe.gov.my';
const ATTENDANCE=MOEIS+'/sahsiah/kehadiran/pkhem/tabguru';
const ACCOUNT={identifier:'fixture-owner',password:'fixture-password',phrase:'fixture phrase',allowUnreadablePhrase:false};
const LOGIN='<form onsubmit="event.preventDefault();location.href=\'/loginverification\'"><input name="username" placeholder="NO KAD PENGENALAN"><button type="submit">Seterusnya</button></form>';
const VERIFY=`<h2>Kata Kunci Keselamatan</h2><div class="security-phrase">fixture phrase</div><canvas id="captcha"></canvas>
<label><input id="check_log" type="checkbox" onclick="document.querySelector('#submit_form').style.display=this.checked?'block':'none'">Ya, ini adalah Kata Kunci Keselamatan saya.</label>
<button id="log_disbale_form" disabled>Daftar Masuk</button><div id="submit_form" style="display:none"><form onsubmit="event.preventDefault();location.href='/home'"><input id="password" type="password"><button type="submit">Daftar Masuk</button></form></div>`;
const HOME='<a href="/list_aplikasi">Pilih aplikasi</a>';
const APPS='<a href="https://evil.invalid/">Pengurusan Murid</a><a href="'+MOEIS+'/other">Lain</a><a TARGET href="'+MOEIS+'/?token_idms=fixture-once">Pengurusan Murid MOEIS</a>';
const READY='<h1>SK Paya Redan JBA5054</h1><div id="kehadiran"><input class="case-hadir" data-idpelajar="fixture-row"></div>';

test('hostile page cannot spoof the credential origin by replacing URL',async t=>{
  const b=await localBrowser(url=>url==='https://evil.invalid/login'?LOGIN:null);t.after(()=>b.close());
  const p=await b.newPage();await b.navigate(p,'https://evil.invalid/login');
  await b.evaluate(p,`globalThis.URL=class{constructor(){this.protocol='https:';this.hostname='idme.moe.gov.my';this.port='';this.username='';this.password='';}}`);
  assert.equal((await b.call(p,PORTAL_FUNCTION,'identifier',ACCOUNT)).code,'untrusted-page');
});

test('readiness requires selected/header school identity and attendance controls scoped to its panel',async t=>{
  let html='';const b=await localBrowser(url=>url===ATTENDANCE?html:null);t.after(()=>b.close());const p=await b.newPage();
  const rows='<div id="kehadiran"><input class="case-hadir" data-idpelajar="fixture-row"></div>';
  for(const [identity,expected] of [
    ['<header><h1>SK BUKAN SEKOLAH INI XYZ1234</h1></header><footer>SK Paya Redan JBA5054</footer>',false],
    ['<header><h1>SEKOLAH KEBANGSAAN PAYA REDAN JBA5054</h1></header>',true],
    ['<select name="sekolah"><option selected>SK Lain XYZ1234</option><option>SK Paya Redan JBA5054</option></select>',false],
    ['<select name="sekolah"><option selected>SK Paya Redan JBA5054</option><option>SK Lain XYZ1234</option></select>',true]
  ]) {
    html=identity+rows;await b.navigate(p,'about:blank');await b.navigate(p,ATTENDANCE);
    assert.equal((await b.call(p,PORTAL_FUNCTION,'observe')).school,expected);
  }
  html='<header>SK Paya Redan JBA5054</header><div id="kehadiran"></div><input class="idpelajarthadir">';
  await b.navigate(p,'about:blank');await b.navigate(p,ATTENDANCE);
  assert.equal((await b.call(p,PORTAL_FUNCTION,'observe')).attendance,false);
});

test('production DOM in real Chromium: staged login, reused wrong tab, popup, guards and phone UI', {timeout:60000},async t=>{
  let popup=false;
  const html=new Map([[IDME+'/login',LOGIN],[IDME+'/loginverification',VERIFY],[IDME+'/home',HOME],[ATTENDANCE,READY],[MOEIS+'/?token_idms=fixture-once','<h1>MOEIS</h1>']]);
  const b=await localBrowser(url=>url===IDME+'/list_aplikasi'?APPS.replace('TARGET',popup?'target="_blank"':''):html.get(url)??null);
  t.after(()=>b.close());
  const call=(p,action,account=null)=>b.call(p,PORTAL_FUNCTION,action,account);
  const waitUrl=(p,url)=>b.until(async()=>await b.evaluate(p,'location.href')===url && await b.evaluate(p,'document.readyState')==='complete');
  for(const newWindow of [false,true]) {
    popup=newWindow;
    const stale=await b.newPage();await b.navigate(stale,ATTENDANCE);
    const p=await b.newPage();await b.navigate(p,IDME+'/login');
    const before=b.visits.length;
    assert.equal((await call(p,'observe')).login,true);
    assert.equal((await call(p,'identifier',ACCOUNT)).code,'acted');await waitUrl(p,IDME+'/loginverification');
    assert.equal((await call(p,'observe')).verification,true);
    assert.equal(await b.evaluate(p,"document.querySelector('#password').getClientRects().length"),0);
    assert.equal((await call(p,'checkbox',ACCOUNT)).code,'acted');
    assert.ok(await b.evaluate(p,"document.querySelector('#password').getClientRects().length>0"));
    assert.equal((await call(p,'password',ACCOUNT)).code,'acted');await waitUrl(p,IDME+'/home');
    assert.equal((await call(p,'observe')).dashboard,true);
    assert.equal((await call(p,'applications')).code,'acted');await waitUrl(p,IDME+'/list_aplikasi');
    const ids=new Set(b.pages.keys());
    assert.equal((await call(p,'handoff')).code,'acted');
    let target=p;
    if(newWindow) target=await b.until(()=>[...b.pages.values()].find(p=>!ids.has(p.id)&&p.ready));
    await waitUrl(target,MOEIS+'/?token_idms=fixture-once');
    assert.equal((await call(target,'attendance')).code,'acted');await waitUrl(target,ATTENDANCE);
    const proof=await call(target,'observe');assert.ok(proof.attendance&&proof.school);
    assert.ok(!JSON.stringify(proof).includes('token_idms'));
    const visits=b.visits.slice(before);
    assert.equal(visits.filter(x=>x.includes('token_idms')).length,1);
    assert.ok(visits.indexOf(MOEIS+'/?token_idms=fixture-once')<visits.indexOf(ATTENDANCE));
    assert.ok(!visits.includes(MOEIS+'/other'));
  }
  const p=await b.newPage();
  async function set(url,content) {html.set(url,content);await b.navigate(p,'about:blank');await b.navigate(p,url);}
  await set(IDME+'/loginverification',VERIFY);
  assert.equal((await call(p,'password',ACCOUNT)).code,'checkbox-required');
  assert.equal((await call(p,'checkbox',{...ACCOUNT,phrase:'wrong',allowUnreadablePhrase:true})).code,'phrase-mismatch');
  assert.equal(await b.evaluate(p,"document.querySelector('#check_log').checked"),false);
  await b.evaluate(p,"document.querySelector('.security-phrase').remove()");
  assert.equal((await call(p,'checkbox',ACCOUNT)).code,'phrase-unreadable');
  assert.equal((await call(p,'checkbox',{...ACCOUNT,allowUnreadablePhrase:true})).code,'acted');
  for(const [content,code] of [[LOGIN+'<p>Sekatan atas faktor keselamatan.</p>','portal-blocked'],[LOGIN+'<input name="otp">','human-required'],[LOGIN+'<input name="captcha">','human-required']]) {
    await set(IDME+'/login',content);assert.equal((await call(p,'identifier',ACCOUNT)).code,code);
    assert.equal(await b.evaluate(p,'document.querySelector("[name=username]").value'),'');
  }
  await set(IDME+'/home','<div class="breadcrumb">Dashboard Aplikasi</div>');assert.equal((await call(p,'observe')).dashboard,false);
  await set(ATTENDANCE,'<div id="kehadiran"></div>');const o=await call(p,'observe');assert.ok(!o.attendance&&!o.school);
  await set(ATTENDANCE,LOGIN);assert.equal((await call(p,'identifier',ACCOUNT)).code,'wrong-stage');
  const ui=await b.newPage();const origin='https://fixture.invalid';
  const fixtureStatus={ok:true,csrf:'fixture-csrf',session:{phase:'idle'},dailyLaunches:{count:0,max:8},account:{configured:false},flow:null};
  html.set(origin+'/',renderAuthenticatedHtml().replace('<link rel="stylesheet" href="/style.css">','<style>'+renderStyleCss()+'</style>').replace('<script src="/app.js"></script>','<script>window.fetch=async()=>({ok:true,status:200,json:async()=>('+JSON.stringify(fixtureStatus)+')});'+renderAppJs()+'</script>'));
  await b.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},ui.sessionId);
  await b.navigate(ui,origin+'/');
  assert.equal(await b.evaluate(ui,'document.documentElement.scrollWidth<=390'),true);
  assert.ok(!b.events.some(e=>e.method==='Runtime.exceptionThrown'));
});

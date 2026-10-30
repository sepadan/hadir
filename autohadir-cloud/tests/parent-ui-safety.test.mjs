import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUi } from './ui-harness.mjs';
import { renderAuthenticatedHtml } from '../src/ui.mjs';
import { requestLiveView } from '../src/browser.mjs';

test('expired local deadline never leaves active green badge while refresh fails', async () => {
  const ui = await runUi(null, 'active', true);
  assert.notEqual(ui.nodes.get('badgeSessionStatus').textContent, 'Aktif');
});

for (const [kind,blocked] of [['moeis-attendance',true],['moeis-other',false],['idme-other',false]]) {
  test(`URL ${kind}, blocked=${blocked} is NOT proof of login`,async()=>{
    const ui=await runUi({pageKind:kind,normalizedUrl:'https://moeispel.moe.gov.my/',
      isBlocked:blocked,isIdMeLoginForm:false,isIdMePasswordStep:false,
      hasCaptchaOrOtp:false,moeisAttendanceSelectorCount:0});
    assert.equal(ui.nodes.get('indIdMe').textContent,'?');
    assert.ok(!ui.nodes.get('indIdMe').className.includes('step-yes'));
  });
}
test('idle status polling does not keep Durable Object awake',async()=>{
  const ui=await runUi(null,'idle');const before=ui.fetchCount;
  for(const timer of ui.timers) if(timer.ms>1000) await timer.fn();
  await new Promise(setImmediate);
  assert.equal(ui.fetchCount,before);
});
test('manual view uses full Chrome UI so SSO popup tabs are accessible',async()=>{
  let opts;
  const browser={getLiveView:async(s,o)=>{opts=o;return {devtoolsFrontendUrl:'https://live.browser.run/ui/view?fixture=1'};}};
  await requestLiveView(browser,'fixture-session','fixture-target','manual');
  assert.equal(opts.mode,'full');
});
test('Live View link is not falsely described as one-use',()=>{
  assert.ok(!renderAuthenticatedHtml().includes('sekali guna, 60 saat'));
});

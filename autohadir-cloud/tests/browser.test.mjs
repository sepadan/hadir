import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  acquireBrowserSession,
  ALLOWED_DOMAINS,
  validateLiveViewUrl,
  validatePngBase64,
  MAX_SNAPSHOT_BYTES
} from '../src/browser.mjs';
import { SchoolSession } from '../src/session.mjs';
import { FakeBrowser, makeSessionDO, SAFE_LIVE_URL, TINY_PNG_B64 } from './helpers/fakes.mjs';

const GAP = 12 * 1000;

describe('acquireBrowserSession', () => {
  it('memohon keepAlive 5 minit, tanpa rakaman, targets, dan guardrails domain tepat', async () => {
    const fake = new FakeBrowser();
    const res = await acquireBrowserSession(fake);
    assert.ok(res.sessionId);
    const call = fake.callsOf('acquire')[0];
    assert.equal(call.opts.keepAlive, 300000);
    assert.equal(call.opts.recording, false);
    assert.equal(call.opts.targets, true);
    assert.deepEqual(call.opts.guardrails.allowedDomains, ALLOWED_DOMAINS);
    assert.deepEqual([...ALLOWED_DOMAINS].sort(), ['example.com', 'idme.moe.gov.my', 'moeispel.moe.gov.my']);
    assert.ok(!ALLOWED_DOMAINS.some((d) => d.includes('*')));
  });
});

describe('validateLiveViewUrl', () => {
  it('menerima hanya https://live.browser.run/ui/...', () => {
    assert.equal(validateLiveViewUrl(SAFE_LIVE_URL), SAFE_LIVE_URL);
    assert.ok(validateLiveViewUrl('https://live.browser.run/ui/inspector?wss=live.browser.run/x?jwt=y'));
  });

  it('menolak skema, asal penyerang, userinfo, port dan laluan lain', () => {
    const bad = [
      'javascript:alert(1)',
      'data:text/html,hi',
      'http://live.browser.run/ui/view?x=1',
      'https://live.browser.run.attacker.example/ui/view',
      'https://attacker.example/ui/view?u=https://live.browser.run',
      'https://user:pw@live.browser.run/ui/view',
      'https://live.browser.run:8443/ui/view',
      'https://live.browser.run/api/devtools/browser/x',
      'https://browser-view.cloudflare.com/live?jwt=x',
      '//live.browser.run/ui/view',
      '',
      null,
      42
    ];
    for (const u of bad) assert.equal(validateLiveViewUrl(u), null, `mesti ditolak: ${u}`);
  });
});

describe('validatePngBase64', () => {
  it('menerima PNG sah dan menolak bukan-PNG atau terlalu besar', () => {
    assert.equal(validatePngBase64(TINY_PNG_B64), TINY_PNG_B64);
    assert.equal(validatePngBase64(Buffer.from('GIF89a-not-png').toString('base64')), null);
    assert.equal(validatePngBase64('%%%not-base64%%%'), null);
    assert.equal(validatePngBase64(''), null);
    const big = Buffer.alloc(MAX_SNAPSHOT_BYTES + 1);
    Buffer.from(TINY_PNG_B64, 'base64').copy(big);
    assert.equal(validatePngBase64(big.toString('base64')), null);
    assert.ok(MAX_SNAPSHOT_BYTES <= 3 * 1024 * 1024);
  });
});

describe('getLiveView melalui DO', () => {
  it('readonly tanpa echo guardrails: jatuh balik ke tangkapan skrin, BUKAN pautan interaktif', async () => {
    const { session, clock, browser } = makeSessionDO(SchoolSession);
    await session.startSession('control');
    clock.advance(GAP);
    const res = await session.getLiveView({ mode: 'readonly' });
    assert.equal(res.mode, 'snapshot');
    assert.equal(res.url, undefined);
    assert.ok(res.image.startsWith('data:image/png;base64,'));
    assert.match(res.warning, /Tangkapan semasa, bukan siaran langsung/);
    const lv = browser.callsOf('getLiveView')[0];
    assert.equal(lv.opts.guardrails.mode, 'readonly');
    assert.equal(browser.callsOf('cdp:Page.captureScreenshot').length, 1);
    const shot = browser.callsOf('cdp:Page.captureScreenshot')[0];
    assert.equal(shot.params.format, 'png');
    for (const ws of browser.sockets) {
      assert.equal(ws.closed, true);
      assert.equal(ws.listenerCount(), 0, 'tiada kebocoran pendengar');
    }
  });

  it('readonly dengan echo options.guardrails.mode=readonly dan URL dipercayai: pulangkan URL', async () => {
    const { session, clock, browser } = makeSessionDO(SchoolSession);
    browser.liveViewResult = (sid, opts) => ({ devtoolsFrontendUrl: SAFE_LIVE_URL, options: { ...opts } });
    await session.startSession('control');
    clock.advance(GAP);
    const res = await session.getLiveView({ mode: 'readonly' });
    assert.equal(res.mode, 'readonly');
    assert.equal(res.url, SAFE_LIVE_URL);
  });

  it('readonly dengan echo tetapi URL tidak dipercayai: jatuh balik ke tangkapan skrin', async () => {
    const { session, clock, browser } = makeSessionDO(SchoolSession);
    browser.liveViewResult = (sid, opts) => ({ devtoolsFrontendUrl: 'https://attacker.example/ui/view', options: { ...opts } });
    await session.startSession('control');
    clock.advance(GAP);
    const res = await session.getLiveView({ mode: 'readonly' });
    assert.equal(res.mode, 'snapshot');
    assert.ok(!JSON.stringify(res).includes('attacker'));
  });

  it('tangkapan skrin bukan PNG / terlalu besar: gagal tertutup 503 tanpa URL', async () => {
    const { session, clock, browser } = makeSessionDO(SchoolSession);
    browser.screenshotB64 = Buffer.from('<html>not png</html>').toString('base64');
    await session.startSession('control');
    clock.advance(GAP);
    await assert.rejects(session.getLiveView({ mode: 'readonly' }), (err) => {
      assert.equal(err.status, 503);
      assert.equal(err.code, 'snapshot-unavailable');
      return true;
    });
  });

  it('tangkapan skrin dan imej tidak disimpan dalam storan DO', async () => {
    const { session, clock, storage } = makeSessionDO(SchoolSession);
    await session.startSession('control');
    clock.advance(GAP);
    await session.getLiveView({ mode: 'readonly' });
    const dump = JSON.stringify([...storage.data.entries()]);
    assert.ok(!dump.includes(TINY_PNG_B64.slice(0, 20)));
    assert.ok(!dump.includes('live.browser.run'));
  });

  it('manual memerlukan manualConsent === true dan tidak menghantar guardrails', async () => {
    const { session, clock, browser } = makeSessionDO(SchoolSession);
    await session.startSession('control');
    clock.advance(GAP);
    for (const consent of [false, 'true', 1, undefined]) {
      await assert.rejects(session.getLiveView({ mode: 'manual', manualConsent: consent }), (err) => {
        assert.equal(err.code, 'manual-consent-required');
        return true;
      });
    }
    assert.equal(browser.callsOf('getLiveView').length, 0);
    const res = await session.getLiveView({ mode: 'manual', manualConsent: true });
    assert.equal(res.mode, 'manual');
    assert.equal(res.url, SAFE_LIVE_URL);
    assert.match(res.warning, /boleh MENULIS/);
    assert.equal(browser.callsOf('getLiveView')[0].opts.guardrails, undefined);
  });

  it('manual: URL tidak selamat (javascript:, asal penyerang, userinfo) ditolak 502', async () => {
    for (const u of ['javascript:alert(1)', 'https://evil.example/ui/view', 'https://a:b@live.browser.run/ui/view']) {
      const { session, clock, browser } = makeSessionDO(SchoolSession);
      browser.liveViewResult = () => ({ devtoolsFrontendUrl: u });
      await session.startSession('control');
      clock.advance(GAP);
      await assert.rejects(session.getLiveView({ mode: 'manual', manualConsent: true }), (err) => {
        assert.equal(err.status, 502);
        assert.equal(err.code, 'liveview-url-untrusted');
        assert.ok(!err.message.includes(u));
        return true;
      });
    }
  });

  it('liveview menggunakan jeda kadar walaupun gagal', async () => {
    const { session, clock, browser } = makeSessionDO(SchoolSession);
    await session.startSession('control');
    clock.advance(GAP);
    browser.liveViewThrows = true;
    browser.cdpMode = 'error';
    await assert.rejects(session.getLiveView({ mode: 'readonly' }));
    browser.liveViewThrows = false;
    browser.cdpMode = 'ok';
    await assert.rejects(session.getLiveView({ mode: 'readonly' }), (err) => err.status === 429);
  });

  it('mod tidak sah ditolak sebelum panggilan jauh', async () => {
    const { session, clock, browser } = makeSessionDO(SchoolSession);
    await session.startSession('control');
    clock.advance(GAP);
    const before = browser.remoteCallCount();
    await assert.rejects(session.getLiveView({ mode: 'full' }), (err) => err.code === 'invalid-mode');
    assert.equal(browser.remoteCallCount(), before);
  });
});

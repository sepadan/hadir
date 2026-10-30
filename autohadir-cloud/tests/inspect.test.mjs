import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyUrl,
  sanitizeEvalResult,
  selectInspectTarget,
  inspectActivePage,
  SAFE_EVALUATE_SCRIPT
} from '../src/inspect.mjs';
import { runCdpCommand, ALLOWED_CDP_METHODS } from '../src/cdp.mjs';
import { SchoolSession } from '../src/session.mjs';
import { FakeBrowser, makeSessionDO } from './helpers/fakes.mjs';

const GAP = 12 * 1000;

const IDME_EVAL = {
  href: 'https://idme.moe.gov.my/login?token=fixture-secret',
  isIdMeLoginForm: true,
  isIdMePasswordStep: false,
  isBlocked: false,
  hasCaptchaOrOtp: false,
  moeisAttendanceSelectorCount: 0
};

describe('classifyUrl', () => {
  it('hanya hos tepat + laluan enum; tiada query, hash atau segmen tak dikenali', () => {
    assert.deepEqual(classifyUrl('https://idme.moe.gov.my/login?session=abc#x'), {
      host: 'idme.moe.gov.my',
      pageKind: 'idme-login',
      normalizedUrl: 'https://idme.moe.gov.my/login'
    });
    assert.equal(classifyUrl('https://moeispel.moe.gov.my/sahsiah/kehadiran/pkhem/tabguru?k=1').pageKind, 'moeis-attendance');
    const other = classifyUrl('https://moeispel.moe.gov.my/murid/NAMA-REKAAN/000000000000');
    assert.equal(other.pageKind, 'moeis-other');
    assert.equal(other.normalizedUrl, 'https://moeispel.moe.gov.my/…');
    assert.equal(classifyUrl('https://example.com/').pageKind, 'control');
    assert.equal(classifyUrl('about:blank').pageKind, 'blank');
    assert.equal(classifyUrl('https://evil.example/login').pageKind, 'disallowed');
    assert.equal(classifyUrl('https://evil.example/login').normalizedUrl, null);
    assert.equal(classifyUrl('https://idme.moe.gov.my.evil.example/login').pageKind, 'disallowed');
    assert.equal(classifyUrl('http://idme.moe.gov.my/login').pageKind, 'disallowed');
    assert.equal(classifyUrl('https://u:p@idme.moe.gov.my/login').pageKind, 'disallowed');
    assert.equal(classifyUrl(undefined).pageKind, 'unknown');
  });
});

describe('selectInspectTarget', () => {
  it('memilih tab MOEIS baharu selepas popup SSO berbanding sasaran idMe yang disimpan', () => {
    const targets = [
      { id: 'T1', type: 'page', url: 'https://idme.moe.gov.my/dashboard' },
      { id: 'T9', type: 'page', url: 'https://moeispel.moe.gov.my/sahsiah/kehadiran/pkhem/tabguru' },
      { id: 'W1', type: 'service_worker', url: 'https://moeispel.moe.gov.my/sw.js' }
    ];
    const sel = selectInspectTarget(targets, 'T1');
    assert.equal(sel.targetId, 'T9');
    assert.equal(sel.selection, 'moeis-tab');
    assert.equal(sel.pageCount, 2);
    assert.equal(sel.ambiguous, false);
  });

  it('beberapa tab MOEIS ditanda samar-samar', () => {
    const targets = [
      { id: 'A', type: 'page', url: 'https://moeispel.moe.gov.my/a' },
      { id: 'B', type: 'page', url: 'https://moeispel.moe.gov.my/b' }
    ];
    assert.equal(selectInspectTarget(targets, 'X').ambiguous, true);
  });

  it('tanpa MOEIS: guna sasaran disimpan jika masih wujud', () => {
    const targets = [
      { id: 'T1', type: 'page', url: 'https://idme.moe.gov.my/login' },
      { id: 'T2', type: 'page', url: 'about:blank' }
    ];
    const sel = selectInspectTarget(targets, 'T1');
    assert.equal(sel.targetId, 'T1');
    assert.equal(sel.selection, 'saved');
  });

  it('tiada halaman yang dibenarkan: tiada sasaran', () => {
    const sel = selectInspectTarget([{ id: 'E', type: 'page', url: 'https://evil.example/' }], 'Z');
    assert.equal(sel.targetId, null);
  });
});

describe('sanitizeEvalResult', () => {
  it('jenis disahkan dengan ketat; nilai DOM tidak dipercayai tidak dipulangkan', () => {
    const out = sanitizeEvalResult({
      href: 'https://moeispel.moe.gov.my/x',
      isIdMeLoginForm: 'true',
      isIdMePasswordStep: 1,
      isBlocked: true,
      hasCaptchaOrOtp: false,
      moeisAttendanceSelectorCount: '<img src=x onerror=alert(1)>',
      title: 'NAMA REKAAN 000000-00-0000',
      cookies: 'sid=fixture'
    });
    assert.equal(out.isIdMeLoginForm, false);
    assert.equal(out.isIdMePasswordStep, false);
    assert.equal(out.isBlocked, true);
    assert.equal(out.moeisAttendanceSelectorCount, null);
    assert.equal(out.title, undefined);
    assert.equal(out.cookies, undefined);
    assert.equal(sanitizeEvalResult({ moeisAttendanceSelectorCount: 1e9 }).moeisAttendanceSelectorCount, null);
    assert.equal(sanitizeEvalResult({ moeisAttendanceSelectorCount: -1 }).moeisAttendanceSelectorCount, null);
    assert.equal(sanitizeEvalResult({ moeisAttendanceSelectorCount: 2.5 }).moeisAttendanceSelectorCount, null);
    assert.equal(sanitizeEvalResult({ moeisAttendanceSelectorCount: 30 }).moeisAttendanceSelectorCount, 30);
    assert.equal(sanitizeEvalResult(null), null);
    assert.equal(sanitizeEvalResult('string'), null);
  });

  it('skrip penilaian tetap hanya mengira pemilih MOEIS pada hos tepat', () => {
    assert.match(SAFE_EVALUATE_SCRIPT, /location\.hostname === 'moeispel\.moe\.gov\.my'/);
    assert.ok(!/innerHTML|document\.cookie|localStorage|\.value\b/.test(SAFE_EVALUATE_SCRIPT));
  });
});

describe('inspectActivePage', () => {
  it('memeriksa tab MOEIS selepas SSO dan melaporkan halaman yang diperiksa', async () => {
    const browser = new FakeBrowser();
    const { sessionId, targets } = await browser.acquire({});
    const s = browser.sessions.get(sessionId);
    s.targets[0].url = 'https://idme.moe.gov.my/dashboard';
    s.targets.push({ id: 'POP', type: 'page', url: 'https://moeispel.moe.gov.my/sahsiah/kehadiran/pkhem/tabguru' });
    browser.evalByUrl['https://moeispel.moe.gov.my/sahsiah/kehadiran/pkhem/tabguru'] = {
      href: 'https://moeispel.moe.gov.my/sahsiah/kehadiran/pkhem/tabguru?jwt=x',
      isIdMeLoginForm: false,
      isIdMePasswordStep: false,
      isBlocked: false,
      hasCaptchaOrOtp: false,
      moeisAttendanceSelectorCount: 31
    };
    const res = await inspectActivePage(browser, sessionId, targets[0].id);
    assert.equal(res.targetSelection, 'moeis-tab');
    assert.equal(res.pageKind, 'moeis-attendance');
    assert.equal(res.moeisAttendanceSelectorCount, 31);
    assert.equal(browser.callsOf('connectSession').at(-1).targetId, 'POP');
    assert.ok(!JSON.stringify(res).includes('jwt'));
    assert.ok(!JSON.stringify(res).includes('TAJUK'));
  });

  it('href DOM berbeza hos daripada metadata sasaran: ditanda samar-samar', async () => {
    const browser = new FakeBrowser();
    const { sessionId, targets } = await browser.acquire({});
    browser.sessions.get(sessionId).targets[0].url = 'https://idme.moe.gov.my/login';
    browser.evalByUrl['*'] = { ...IDME_EVAL, href: 'https://example.com/' };
    const res = await inspectActivePage(browser, sessionId, targets[0].id);
    assert.equal(res.ambiguous, true);
  });

  it('ralat CDP tidak membocorkan rentetan mentah (JWT/IC)', async () => {
    const browser = new FakeBrowser();
    const { sessionId, targets } = await browser.acquire({});
    browser.cdpMode = 'error';
    await assert.rejects(inspectActivePage(browser, sessionId, targets[0].id), (err) => {
      assert.equal(err.code, 'cdp-failed');
      assert.ok(!err.message.includes('jwt'));
      assert.ok(!err.message.includes('000000'));
      return true;
    });
    for (const ws of browser.sockets) {
      assert.equal(ws.closed, true);
      assert.equal(ws.listenerCount(), 0);
    }
  });
});

describe('runCdpCommand', () => {
  it('tamat masa membersihkan pendengar dan menutup soket', async () => {
    const browser = new FakeBrowser();
    const { sessionId, targets } = await browser.acquire({});
    browser.cdpMode = 'hang';
    await assert.rejects(
      runCdpCommand(browser, sessionId, targets[0].id, 'Runtime.evaluate', { expression: SAFE_EVALUATE_SCRIPT, returnByValue: true }, { timeoutMs: 50 }),
      (err) => err.code === 'cdp-timeout' && err.status === 504
    );
    const ws = browser.sockets.at(-1);
    assert.equal(ws.closed, true);
    assert.equal(ws.listenerCount(), 0);
  });

  it('soket ditutup sebelum jawapan: ralat dan pembersihan', async () => {
    const browser = new FakeBrowser();
    const { sessionId, targets } = await browser.acquire({});
    browser.cdpMode = 'close';
    await assert.rejects(
      runCdpCommand(browser, sessionId, targets[0].id, 'Page.navigate', { url: 'https://example.com' }),
      (err) => err.code === 'cdp-failed'
    );
    assert.equal(browser.sockets.at(-1).listenerCount(), 0);
  });

  it('kaedah CDP di luar senarai tetap ditolak tanpa sambungan', async () => {
    const browser = new FakeBrowser();
    const { sessionId, targets } = await browser.acquire({});
    for (const m of ['Network.getAllCookies', 'Runtime.callFunctionOn', 'Input.dispatchMouseEvent', 'Target.createTarget']) {
      await assert.rejects(runCdpCommand(browser, sessionId, targets[0].id, m, {}), (err) => err.code === 'cdp-method-denied');
    }
    assert.equal(browser.callsOf('connectSession').length, 0);
    assert.deepEqual([...ALLOWED_CDP_METHODS].sort(), ['Page.captureScreenshot', 'Page.navigate', 'Runtime.callFunctionOn', 'Runtime.evaluate']);
  });

  it('Runtime.evaluate hanya menerima ungkapan tetap SAFE_EVALUATE_SCRIPT', async () => {
    const browser = new FakeBrowser();
    const { sessionId, targets } = await browser.acquire({});
    await assert.rejects(
      runCdpCommand(browser, sessionId, targets[0].id, 'Runtime.evaluate', { expression: 'document.cookie' }),
      (err) => err.code === 'cdp-method-denied'
    );
  });
});

describe('inspectPage melalui DO', () => {
  it('menyimpan status selamat sahaja dan melaporkan halaman diperiksa', async () => {
    const { session, clock, browser, storage } = makeSessionDO(SchoolSession);
    browser.evalByUrl['https://idme.moe.gov.my/login'] = IDME_EVAL;
    await session.startSession('idme');
    clock.advance(GAP);
    const res = await session.inspectPage();
    assert.equal(res.pageStatus.pageKind, 'idme-login');
    assert.equal(res.pageStatus.isIdMeLoginForm, true);
    const dump = JSON.stringify([...storage.data.entries()]);
    assert.ok(!dump.includes('fixture-secret'));
    assert.ok(!dump.includes('TAJUK'));
  });
});

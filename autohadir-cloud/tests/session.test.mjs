import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SchoolSession, TARGET_ENUMS } from '../src/session.mjs';
import { FakeClock, FakeStorage, FakeBrowser, makeSessionDO, T0 } from './helpers/fakes.mjs';

const MIN = 60 * 1000;
const GAP = 12 * 1000;

async function rejectsCode(promise, code, status) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.code, code, `jangkaan kod ${code}, dapat ${err.code} (${err.message})`);
    if (status) assert.equal(err.status, status);
    return true;
  });
}

describe('startSession: navigasi sebenar ke URL enum tetap', () => {
  it('menghantar CDP Page.navigate dengan URL tepat SELEPAS sid disimpan', async () => {
    const { session, storage, browser } = makeSessionDO(SchoolSession);
    let sidPersistedBeforeNavigate = false;
    const origHandle = browser.handleCdp.bind(browser);
    browser.handleCdp = (target, msg) => {
      if (msg.method === 'Page.navigate') {
        const st = storage.data.get('session_state');
        sidPersistedBeforeNavigate = Boolean(st && st.sessionId && st.phase === 'active');
      }
      return origHandle(target, msg);
    };

    const res = await session.startSession('idme');
    assert.equal(res.ok, true);
    assert.equal(res.navigation, 'sent');
    const nav = browser.callsOf('cdp:Page.navigate');
    assert.equal(nav.length, 1);
    assert.equal(nav[0].params.url, TARGET_ENUMS.idme);
    assert.equal(nav[0].params.url, 'https://idme.moe.gov.my/login');
    assert.ok(sidPersistedBeforeNavigate, 'sid mesti disimpan sebelum navigasi');
    // Tiada dakwaan halaman dimuatkan: hanya inspect yang mengklasifikasi.
    const status = await session.getStatus();
    assert.equal(status.pageStatus, null);
    assert.equal(status.session.requestedTarget, 'idme');
    assert.equal(status.session.navigation, 'sent');
  });

  it('menggunakan devtools.newTarget dengan URL tepat jika acquire tiada sasaran', async () => {
    const { session, browser } = makeSessionDO(SchoolSession);
    browser.acquireMode = 'no-targets';
    await session.startSession('control');
    const nt = browser.callsOf('devtools.newTarget');
    assert.equal(nt.length, 1);
    assert.equal(nt[0].url, 'https://example.com');
  });

  it('kegagalan navigasi mengekalkan sid milik sendiri + penggera keras dan melaporkan gagal secara jujur', async () => {
    const { session, storage, browser } = makeSessionDO(SchoolSession);
    browser.navigateErrorText = 'net::ERR_BLOCKED_BY_CLIENT';
    await rejectsCode(session.startSession('idme'), 'navigation-failed', 502);
    const st = storage.data.get('session_state');
    assert.ok(st.sessionId, 'sid dikekalkan');
    assert.equal(st.phase, 'active');
    assert.equal(storage.alarm, T0 + 15 * MIN);
    const status = await session.getStatus();
    assert.equal(status.session.navigation, 'failed');
    assert.equal(status.session.hasSession, true);
  });

  it('enum tidak sah ditolak sebelum sebarang tindakan berbayar atau belanjawan', async () => {
    const { session, browser } = makeSessionDO(SchoolSession);
    for (const bad of ['https://attacker.example/evil', 'javascript:alert(1)', '', null, 'IDME', '__proto__', 'constructor']) {
      await rejectsCode(session.startSession(bad), 'invalid-target', 400);
    }
    assert.equal(browser.remoteCallCount(), 0);
    const status = await session.getStatus();
    assert.equal(status.dailyLaunches.count, 0);
  });
});

describe('startSession: ketidakpastian carian & pemerolehan', () => {
  it('carian getSession yang membaling tidak melancar pelayar baharu dan mengekalkan sid', async () => {
    const { session, clock, storage, browser } = makeSessionDO(SchoolSession);
    await session.startSession('control');
    const sid = storage.data.get('session_state').sessionId;
    clock.advance(GAP);
    browser.lookupMode = 'throw';
    await rejectsCode(session.startSession('control'), 'lookup-unavailable', 503);
    assert.equal(browser.callsOf('acquire').length, 1);
    assert.equal(storage.data.get('session_state').sessionId, sid);
  });

  it('null berwibawa daripada getSession menandakan tamat lalu membenarkan pelancaran baharu', async () => {
    const { session, clock, browser } = makeSessionDO(SchoolSession);
    await session.startSession('control');
    browser.killAll();
    clock.advance(GAP);
    const res = await session.startSession('control');
    assert.equal(res.reused, false);
    assert.equal(browser.callsOf('acquire').length, 2);
  });

  it('start serentak hanya memanggil acquire sekali', async () => {
    const { session, browser } = makeSessionDO(SchoolSession);
    const [a, b] = await Promise.all([session.startSession('idme'), session.startSession('idme')]);
    assert.equal(browser.callsOf('acquire').length, 1);
    assert.equal([a.reused, b.reused].filter(Boolean).length, 1);
  });

  it('belanjawan, jeda dan keadaan acquiring disimpan SEBELUM acquire ditunggu', async () => {
    const { session, storage, browser } = makeSessionDO(SchoolSession);
    let snapshot = null;
    browser.acquire = async () => {
      snapshot = {
        budget: storage.data.get('daily_budget'),
        state: storage.data.get('session_state'),
        rate: storage.data.get('rate_gate'),
        alarm: storage.alarm
      };
      throw new Error('crash');
    };
    await rejectsCode(session.startSession('idme'), 'acquire-uncertain', 503);
    assert.equal(snapshot.budget.count, 1);
    assert.equal(snapshot.state.phase, 'acquiring');
    assert.equal(snapshot.rate.lastAt, T0);
    assert.equal(snapshot.alarm, T0 + 15 * MIN);
  });

  it('acquire membaling: kekal acquire-uncertain merentas instans DO baharu sehingga 15 minit', async () => {
    const clock = new FakeClock();
    const storage = new FakeStorage();
    const browser = new FakeBrowser();
    browser.acquireMode = 'throw';
    const first = makeSessionDO(SchoolSession, { clock, storage, browser });
    await rejectsCode(first.session.startSession('idme'), 'acquire-uncertain', 503);

    browser.acquireMode = 'ok';
    clock.advance(5 * MIN);
    const cold = makeSessionDO(SchoolSession, { clock, storage, browser });
    await rejectsCode(cold.session.startSession('idme'), 'acquire-uncertain', 409);
    // Tutup tidak boleh memadam tempahan yang tidak diketahui.
    const closed = await cold.session.closeSession();
    assert.equal(closed.ok, false);
    assert.equal(closed.status, 'acquire-uncertain');
    assert.equal(storage.data.get('session_state').phase, 'acquiring');
    assert.equal(browser.callsOf('acquire').length, 1);

    const status = await cold.session.getStatus();
    assert.equal(status.session.phase, 'acquiring');
    assert.equal(status.session.acquireBlockedUntil, T0 + 15 * MIN);

    clock.advance(10 * MIN);
    const res = await cold.session.startSession('idme');
    assert.equal(res.ok, true);
    assert.equal(browser.callsOf('acquire').length, 2);
    assert.equal((await cold.session.getStatus()).dailyLaunches.count, 2);
  });

  it('acquire yang tergantung tamat masa sebagai tidak pasti; keadaan acquiring dikekalkan', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { session, storage, browser } = makeSessionDO(SchoolSession);
    browser.acquire = () => new Promise(() => {});
    const pending = session.startSession('idme');
    await new Promise((r) => setImmediate(r));
    t.mock.timers.tick(30000);
    await rejectsCode(pending, 'acquire-uncertain', 503);
    assert.equal(storage.data.get('session_state').phase, 'acquiring');
  });

  it('acquire tanpa sessionId dianggap tidak pasti, bukan ralat yang boleh dicuba semula', async () => {
    const { session, clock, browser } = makeSessionDO(SchoolSession);
    browser.acquireMode = 'no-sid';
    await rejectsCode(session.startSession('idme'), 'acquire-uncertain', 503);
    clock.advance(GAP);
    browser.acquireMode = 'ok';
    await rejectsCode(session.startSession('idme'), 'acquire-uncertain', 409);
  });

  it('had 8 cubaan sehari termasuk pelancaran yang gagal', async () => {
    const { session, clock, browser } = makeSessionDO(SchoolSession);
    browser.acquireMode = 'throw';
    for (let i = 0; i < 8; i++) {
      await rejectsCode(session.startSession('idme'), 'acquire-uncertain', 503);
      clock.advance(15 * MIN + 1);
      await session.alarm();
    }
    browser.acquireMode = 'ok';
    await rejectsCode(session.startSession('idme'), 'daily-cap', 429);
    assert.equal(browser.callsOf('acquire').length, 8);
  });

  it('kiraan harian ditetapkan semula pada tengah malam Asia/Kuala_Lumpur', async () => {
    const clock = new FakeClock(Date.parse('2026-10-30T15:50:00Z')); // 23:50 KL
    const { session, browser } = makeSessionDO(SchoolSession, { clock });
    await session.startSession('control');
    await session.closeSession();
    assert.equal((await session.getStatus()).dailyLaunches.count, 1);
    clock.advance(15 * MIN); // 00:05 KL hari esok
    const status = await session.getStatus();
    assert.equal(status.dailyLaunches.count, 0);
    assert.equal(status.dailyLaunches.date, '2026-10-31');
    assert.equal(browser.callsOf('acquire').length, 1);
  });
});

describe('Had kadar berterusan (tiada pintasan)', () => {
  it('jeda 12 saat kekal selepas tindakan jauh yang GAGAL', async () => {
    const { session, clock, browser } = makeSessionDO(SchoolSession);
    await session.startSession('control');
    clock.advance(GAP);
    browser.cdpMode = 'error';
    await rejectsCode(session.inspectPage(), 'cdp-failed', 502);
    browser.cdpMode = 'ok';
    const before = browser.remoteCallCount();
    await rejectsCode(session.inspectPage(), 'rate-limited', 429);
    assert.equal(browser.remoteCallCount(), before, 'tiada panggilan jauh semasa 429');
  });

  it('jeda dikekalkan pada instans DO sejuk (tiada reset dalam memori)', async () => {
    const clock = new FakeClock();
    const storage = new FakeStorage();
    const browser = new FakeBrowser();
    const a = makeSessionDO(SchoolSession, { clock, storage, browser });
    await a.session.startSession('control');
    clock.advance(1000);
    const b = makeSessionDO(SchoolSession, { clock, storage, browser });
    await rejectsCode(b.session.inspectPage(), 'rate-limited', 429);
    clock.advance(GAP);
    const res = await b.session.inspectPage();
    assert.equal(res.ok, true);
  });

  it('kaedah tidak menerima pilihan pintasan daripada pemanggil', async () => {
    const { session } = makeSessionDO(SchoolSession);
    await session.startSession('control');
    await rejectsCode(session.inspectPage({ bypassRateLimitGap: true }), 'rate-limited', 429);
    await rejectsCode(session.navigateSession('idme', { bypassRateLimitGap: true }), 'rate-limited', 429);
  });
});

describe('closeSession: penutupan tak segerak disahkan', () => {
  it("'closing' tidak dilaporkan idle; sid dikekalkan, start disekat, penggera mencuba semula", async () => {
    const { session, clock, storage, browser } = makeSessionDO(SchoolSession);
    await session.startSession('control');
    const sid = storage.data.get('session_state').sessionId;
    browser.closeMode = 'closing';
    const res = await session.closeSession();
    assert.equal(res.ok, false);
    assert.equal(res.status, 'closing');
    assert.equal(storage.data.get('session_state').sessionId, sid);
    assert.equal((await session.getStatus()).session.phase, 'closing');
    assert.ok(storage.alarm > clock.now() && storage.alarm <= clock.now() + 60 * 1000);

    clock.advance(GAP);
    await rejectsCode(session.startSession('control'), 'close-pending', 409);
    assert.equal(browser.callsOf('acquire').length, 1);

    browser.finishClosing();
    clock.advance(30 * 1000);
    await session.alarm();
    const st = await session.getStatus();
    assert.equal(st.session.phase, 'idle');
    assert.equal(storage.data.get('session_state').sessionId, null);
  });

  it('closeSession membaling: kekal closing; cubaan semula penggera menutup sid yang SAMA sekali sahaja', async () => {
    const { session, clock, storage, browser } = makeSessionDO(SchoolSession);
    await session.startSession('control');
    const sid = storage.data.get('session_state').sessionId;
    browser.closeMode = 'throw';
    const res = await session.closeSession();
    assert.equal(res.status, 'closing');
    assert.equal(storage.data.get('session_state').sessionId, sid);

    browser.closeMode = 'closed';
    clock.advance(30 * 1000);
    await session.alarm();
    const closes = browser.callsOf('closeSession');
    assert.equal(closes.length, 2, 'satu cubaan asal + satu cubaan semula');
    assert.ok(closes.every((c) => c.sid === sid));
    assert.equal((await session.getStatus()).session.phase, 'idle');
  });

  it('getSession membaling selepas close: status closing, bukan idle', async () => {
    const { session, storage, browser } = makeSessionDO(SchoolSession);
    await session.startSession('control');
    browser.lookupMode = 'throw';
    const res = await session.closeSession();
    assert.equal(res.status, 'closing');
    assert.ok(storage.data.get('session_state').sessionId);
  });

  it('close berjaya (null berwibawa) mengosongkan keadaan', async () => {
    const { session, storage } = makeSessionDO(SchoolSession);
    await session.startSession('control');
    const res = await session.closeSession();
    assert.equal(res.ok, true);
    assert.equal(res.status, 'closed');
    assert.equal(storage.data.get('session_state').sessionId, null);
    assert.equal(storage.alarm, null);
  });
});

describe('Hayat dinding 15 minit', () => {
  it('penggera tidak menutup awal; ia menjadual semula ke tarikh akhir yang disimpan', async () => {
    const { session, clock, storage, browser } = makeSessionDO(SchoolSession);
    await session.startSession('control');
    clock.advance(2 * MIN);
    await session.alarm();
    assert.equal(browser.callsOf('closeSession').length, 0);
    assert.equal(storage.alarm, T0 + 15 * MIN);
    clock.advance(13 * MIN);
    await session.alarm();
    assert.equal(browser.callsOf('closeSession').length, 1);
    assert.equal((await session.getStatus()).session.phase, 'idle');
  });

  it('tindakan selepas 15 minit disekat walaupun penggera belum berbunyi', async () => {
    const { session, clock, browser } = makeSessionDO(SchoolSession);
    await session.startSession('control');
    clock.advance(15 * MIN + 1);
    await rejectsCode(session.inspectPage(), 'session-expired', 409);
    await rejectsCode(session.navigateSession('idme'), 'session-expired', 409);
    await rejectsCode(session.getLiveView({ mode: 'readonly' }), 'session-expired', 409);
    assert.equal(browser.callsOf('cdp:Runtime.evaluate').length, 0);
    assert.equal(browser.callsOf('getLiveView').length, 0);
    assert.ok(browser.callsOf('closeSession').length >= 1, 'tamat tempoh mencetuskan penutupan');
  });

  it('status cache tidak menunjukkan aktif selepas tarikh akhir dan tidak membangunkan pelayar', async () => {
    const { session, clock, browser } = makeSessionDO(SchoolSession);
    await session.startSession('control');
    clock.advance(15 * MIN + 1);
    const before = browser.remoteCallCount();
    const status = await session.getStatus();
    assert.equal(browser.remoteCallCount(), before, 'getStatus tidak memanggil pelayar');
    assert.equal(status.session.phase, 'expired');
    assert.equal(status.session.hasSession, true);
    assert.equal(status.session.active, false);
    assert.ok(!JSON.stringify(status).includes('fixture-sid'), 'sid tidak didedahkan');
  });
});

describe('navigateSession', () => {
  it('hanya enum tetap; URL penyerang ditolak tanpa panggilan jauh', async () => {
    const { session, clock, browser } = makeSessionDO(SchoolSession);
    await session.startSession('control');
    for (const target of Object.keys(TARGET_ENUMS)) {
      clock.advance(GAP);
      const res = await session.navigateSession(target);
      assert.equal(res.navigation, 'sent');
      assert.equal(browser.callsOf('cdp:Page.navigate').at(-1).params.url, TARGET_ENUMS[target]);
    }
    clock.advance(GAP);
    const before = browser.remoteCallCount();
    await rejectsCode(session.navigateSession('https://attacker.example/x'), 'invalid-target', 400);
    assert.equal(browser.remoteCallCount(), before);
  });
});

describe('claimNonce', () => {
  it('serentak: tepat satu tuntutan berjaya', async () => {
    const { session, clock } = makeSessionDO(SchoolSession);
    const exp = Math.floor(clock.now() / 1000) + 90;
    const results = await Promise.allSettled([
      session.claimNonce('nonce-aaaaaaaaaaaaaaaa', exp),
      session.claimNonce('nonce-aaaaaaaaaaaaaaaa', exp)
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  });

  it('storan nonce terbatas dan dicantas', async () => {
    const { session, clock, storage } = makeSessionDO(SchoolSession);
    const exp = Math.floor(clock.now() / 1000) + 90;
    for (let i = 0; i < 64; i++) await session.claimNonce(`nonce-${String(i).padStart(16, '0')}`, exp);
    await rejectsCode(session.claimNonce('nonce-overflow-000000', exp), 'nonce-store-full', 429);
    clock.advance(121 * 1000);
    await session.claimNonce('nonce-after-prune-0000', Math.floor(clock.now() / 1000) + 90);
    assert.equal(Object.keys(storage.data.get('claimed_nonces')).length, 1);
  });
});

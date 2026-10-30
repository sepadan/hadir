// Palsu (fake) bersama untuk ujian Autohadir Cloud. Data rekaan sahaja —
// tiada sid, JWT, nama murid atau URL sebenar.

export const T0 = Date.parse('2026-10-30T00:00:00Z'); // 08:00 waktu KL

export class FakeClock {
  constructor(t = T0) {
    this.t = t;
    this.now = () => this.t;
  }
  advance(ms) {
    this.t += ms;
  }
}

export class FakeStorage {
  constructor() {
    this.data = new Map();
    this.alarm = null;
    this.alarmHistory = [];
  }
  async get(key) {
    const v = this.data.get(key);
    return v === undefined ? undefined : structuredClone(v);
  }
  async put(key, val) {
    this.data.set(key, structuredClone(val));
  }
  async delete(key) {
    return this.data.delete(key);
  }
  async setAlarm(time) {
    this.alarm = time;
    this.alarmHistory.push(time);
  }
  async getAlarm() {
    return this.alarm;
  }
  async deleteAlarm() {
    this.alarm = null;
  }
}

// PNG 1x1 sah yang kecil (piksel lutsinar), dikodkan base64.
export const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

export const SAFE_LIVE_URL =
  'https://live.browser.run/ui/view?mode=tab&wss=live.browser.run/api/devtools/browser/S/page/T?jwt=fixture-not-a-real-jwt';

export class FakeWebSocket {
  constructor(handler) {
    this.handler = handler;
    this.listeners = new Map();
    this.closed = false;
    this.accepted = false;
    this.sent = [];
  }
  accept() {
    this.accepted = true;
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) {
    this.listeners.get(type)?.delete(fn);
  }
  listenerCount() {
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  }
  emit(type, event) {
    for (const fn of [...(this.listeners.get(type) || [])]) fn(event);
  }
  send(raw) {
    if (this.closed) throw new Error('socket closed');
    const msg = JSON.parse(raw);
    this.sent.push(msg);
    let reply;
    try {
      reply = this.handler(msg);
    } catch (err) {
      reply = { error: { message: err.message } };
    }
    if (reply === 'hang') return;
    if (reply === 'close') {
      queueMicrotask(() => this.emit('close', {}));
      return;
    }
    queueMicrotask(() => this.emit('message', { data: JSON.stringify({ id: msg.id, ...reply }) }));
  }
  close() {
    this.closed = true;
  }
}

/**
 * Binding BROWSER palsu yang meniru API binding Browser Run:
 * acquire/getSession/closeSession/connectSession/getLiveView/devtools.*.
 */
export class FakeBrowser {
  constructor(opts = {}) {
    this.opts = opts;
    this.sessions = new Map();
    this.calls = [];
    this.sockets = [];
    this.seq = 0;
    this.acquireMode = 'ok'; // ok | throw | no-sid | no-targets
    this.lookupMode = 'ok'; // ok | throw
    this.closeMode = 'closed'; // closed | closing | throw
    this.cdpMode = 'ok'; // ok | error | hang | close
    this.navigateErrorText = null;
    this.liveViewResult = null; // fungsi (sid, opts) => hasil
    this.liveViewThrows = false;
    this.screenshotB64 = TINY_PNG_B64;
    this.evalByUrl = {};
    this.devtools = {
      listTargets: async (sid) => {
        this.calls.push({ method: 'devtools.listTargets', sid });
        const s = this.sessions.get(sid);
        if (!s) throw new Error('session not found');
        return s.targets.map((t) => ({ ...t, title: 'TAJUK RAHSIA', devtoolsFrontendUrl: SAFE_LIVE_URL }));
      },
      newTarget: async (sid, url) => {
        this.calls.push({ method: 'devtools.newTarget', sid, url });
        const s = this.sessions.get(sid);
        if (!s) throw new Error('session not found');
        const t = { id: `T${++this.seq}`, type: 'page', url: url || 'about:blank' };
        s.targets.push(t);
        return { ...t };
      }
    };
  }

  remoteCallCount() {
    return this.calls.length;
  }

  callsOf(method) {
    return this.calls.filter((c) => c.method === method);
  }

  async acquire(opts) {
    this.calls.push({ method: 'acquire', opts });
    if (this.acquireMode === 'throw') throw new Error('upstream 500 jwt=fixture-secret');
    const sid = `fixture-sid-${++this.seq}`;
    const targets = this.acquireMode === 'no-targets' ? [] : [{ id: `T${++this.seq}`, type: 'page', url: 'about:blank' }];
    this.sessions.set(sid, { sid, opts, targets, closing: false });
    if (this.acquireMode === 'no-sid') return { targets };
    return { sessionId: sid, targets: targets.map((t) => ({ ...t })) };
  }

  async getSession(sid) {
    this.calls.push({ method: 'getSession', sid });
    if (this.lookupMode === 'throw') throw new Error('lookup failed token=fixture');
    const s = this.sessions.get(sid);
    return s ? { sessionId: sid } : null;
  }

  async closeSession(sid) {
    this.calls.push({ method: 'closeSession', sid });
    if (this.closeMode === 'throw') throw new Error('close failed');
    if (this.closeMode === 'closing') {
      const s = this.sessions.get(sid);
      if (s) s.closing = true;
      return 'closing';
    }
    this.sessions.delete(sid);
    return 'closed';
  }

  /** Tamatkan sesi yang sedang "closing" (meniru penutupan tak segerak). */
  finishClosing() {
    for (const [sid, s] of this.sessions) if (s.closing) this.sessions.delete(sid);
  }

  /** Sesi mati sendiri (keepAlive tamat). */
  killAll() {
    this.sessions.clear();
  }

  async getLiveView(sid, opts) {
    this.calls.push({ method: 'getLiveView', sid, opts });
    if (this.liveViewThrows) throw new Error('live view error jwt=fixture');
    if (this.liveViewResult) return this.liveViewResult(sid, opts);
    // Lalai: binding menggugurkan guardrails (tiada echo options).
    return { devtoolsFrontendUrl: SAFE_LIVE_URL };
  }

  async connectSession(sid, options = {}) {
    this.calls.push({ method: 'connectSession', sid, targetId: options.targetId });
    const s = this.sessions.get(sid);
    if (!s) throw new Error('session not found');
    const target = s.targets.find((t) => t.id === options.targetId) || s.targets[0];
    return {
      sessionId: sid,
      webSocket: {
        fetch: async (url, init) => {
          if (init?.headers?.Upgrade !== 'websocket') throw new Error('Upgrade websocket required');
          const ws = new FakeWebSocket((msg) => this.handleCdp(target, msg));
          this.sockets.push(ws);
          return { webSocket: ws };
        }
      }
    };
  }

  handleCdp(target, msg) {
    this.calls.push({ method: `cdp:${msg.method}`, targetId: target?.id, params: msg.params });
    if (this.cdpMode === 'hang') return 'hang';
    if (this.cdpMode === 'close') return 'close';
    if (this.cdpMode === 'error') return { error: { message: 'Runtime error with jwt=fixture-secret and IC 000000-00-0000' } };
    if (msg.method === 'Page.navigate') {
      if (this.navigateErrorText) return { result: { frameId: 'F', errorText: this.navigateErrorText } };
      target.url = msg.params.url;
      return { result: { frameId: 'F', loaderId: 'L' } };
    }
    if (msg.method === 'Runtime.evaluate') {
      const value = this.evalByUrl[target.url] ?? this.evalByUrl['*'] ?? {
        href: target.url,
        isIdMeLoginForm: false,
        isIdMePasswordStep: false,
        isBlocked: false,
        hasCaptchaOrOtp: false,
        moeisAttendanceSelectorCount: 0
      };
      return { result: { result: { type: 'object', value } } };
    }
    if (msg.method === 'Page.captureScreenshot') {
      return { result: { data: this.screenshotB64 } };
    }
    return { error: { message: 'unsupported' } };
  }
}

export function makeSessionDO(SchoolSession, { clock = new FakeClock(), storage = new FakeStorage(), browser = new FakeBrowser() } = {}) {
  const ctx = { storage, waitUntil() {} };
  const env = { BROWSER: browser };
  const session = new SchoolSession(ctx, env, { now: clock.now });
  return { session, clock, storage, browser, ctx, env };
}

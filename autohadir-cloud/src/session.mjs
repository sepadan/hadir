import { AppError, toSafeError } from './errors.mjs';
import { TARGET_ENUMS, resolveTarget } from './targets.mjs';
import { acquireBrowserSession, requestLiveView, captureSnapshot } from './browser.mjs';
import { inspectActivePage, resolveInspectTarget } from './inspect.mjs';
import { runCdpCommand, withTimeout, CDP_TIMEOUT_MS } from './cdp.mjs';
import { parseJsonBody, jsonResponse, readBoundedBody } from './http.mjs';

export { TARGET_ENUMS };

export const MAX_LAUNCHES_PER_DAY = 8;
export const MAX_WALL_LIFETIME_MS = 15 * 60 * 1000;
// Selepas acquire yang tidak pasti, tunggu tempoh penuh sebelum melancar lagi
// (lebih panjang daripada keepAlive 5 minit, sama dengan had hayat dinding).
export const ACQUIRE_GRACE_MS = MAX_WALL_LIFETIME_MS;
export const RATE_LIMIT_GAP_MS = 12000;
export const ACQUIRE_TIMEOUT_MS = 30000;
export const CLOSE_RETRY_MS = 30000;
export const CLOSE_RETRY_MAX_MS = 5 * 60 * 1000;
export const MAX_CLAIMED_NONCES = 64;
export const MAX_TICKET_LIFETIME_S = 120;

const STATE_KEY = 'session_state';
const BUDGET_KEY = 'daily_budget';
const RATE_KEY = 'rate_gate';
const NONCE_KEY = 'claimed_nonces';

const IDLE_STATE = Object.freeze({
  phase: 'idle', // idle | acquiring | active | closing
  sessionId: null,
  targetId: null,
  requestedTarget: null,
  navigation: null, // sent | failed | uncertain
  startedAt: null,
  deadline: null,
  acquireStartedAt: null,
  closeAttempts: 0,
  endedReason: null, // user | expired | gone | acquire-expired
  lastSafeStatus: null
});

const READONLY_WARNING = 'Pautan Live View baca-sahaja (guardrail readonly disahkan oleh Cloudflare). Pautan masih memaparkan data halaman: jangan kongsi.';
const SNAPSHOT_WARNING = 'Tangkapan semasa, bukan siaran langsung. Guardrail readonly tidak dapat disahkan, jadi tiada pautan interaktif dikeluarkan.';
const MANUAL_WARNING =
  'KAWALAN PENUH: pautan ini boleh MENULIS rekod di portal (termasuk butang Simpan kehadiran). Dihoskan oleh Cloudflare; tiada kata laluan idMe disimpan oleh Autohadir Cloud. Penghantaran automatik kekal MATI. Jangan tekan Simpan.';

const ROUTE_FIELDS = Object.freeze({
  '/start': ['target'],
  '/navigate': ['target'],
  '/inspect': [],
  '/liveview': ['mode', 'manualConsent'],
  '/close': [],
  '/claim-nonce': ['nonce', 'exp']
});

export function getKualaLumpurDate(epochMs) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(epochMs));
}

export function isSessionEnded(metadata, ownedId) {
  if (metadata === null) return true;
  if (!metadata || typeof metadata !== 'object' || metadata.sessionId !== ownedId) throw new AppError('lookup-unavailable');
  if (metadata.endTime === undefined || metadata.endTime === null || metadata.endTime === 0) return false;
  if (typeof metadata.endTime !== 'number' || !Number.isFinite(metadata.endTime) || metadata.endTime < 0) throw new AppError('lookup-unavailable');
  return true; // positive endTime is the provider's authoritative session-end record
}

async function lookupOwnedSession(browser, sessionId) {
  try {
    return await withTimeout(browser.getSession(sessionId), CDP_TIMEOUT_MS);
  } catch (error) {
    // Only the fixed, trusted getSession call is interpreted here; never a page error.
    if (error && typeof error.message === 'string' && error.message.toLowerCase().includes('session not found')) return null;
    throw new AppError('lookup-unavailable');
  }
}

export class SchoolSession {
  /**
   * @param {object} ctx DurableObjectState
   * @param {object} env bindings (BROWSER)
   * @param {{now?: () => number}} [deps] jam disuntik untuk ujian; produksi guna Date.now
   */
  constructor(ctx, env, deps = {}) {
    this.ctx = ctx;
    this.env = env;
    this.storage = ctx.storage;
    this.now = typeof deps.now === 'function' ? deps.now : () => Date.now();
    this.queue = Promise.resolve();
  }

  // Semua operasi yang mengubah keadaan atau menyentuh pelayar disirikan.
  enqueue(fn) {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => {});
    return next;
  }

  async loadState() {
    const s = await this.storage.get(STATE_KEY);
    return s ? { ...IDLE_STATE, ...s } : { ...IDLE_STATE };
  }

  async saveState(state) {
    await this.storage.put(STATE_KEY, state);
    return state;
  }

  async resetState(endedReason) {
    await this.storage.deleteAlarm();
    return this.saveState({ ...IDLE_STATE, endedReason });
  }

  async loadBudget(now) {
    const today = getKualaLumpurDate(now);
    const b = await this.storage.get(BUDGET_KEY);
    return b && b.date === today ? b : { date: today, count: 0 };
  }

  /** Tempah jeda kadar (disimpan) SEBELUM panggilan jauh; kekal walaupun panggilan gagal. */
  async reserveRate(now) {
    const gate = await this.storage.get(RATE_KEY);
    if (gate && Number.isFinite(gate.lastAt)) {
      const elapsed = now - gate.lastAt;
      if (elapsed < RATE_LIMIT_GAP_MS) {
        const retryAfterSec = Math.max(1, Math.ceil((RATE_LIMIT_GAP_MS - Math.max(0, elapsed)) / 1000));
        throw new AppError('rate-limited', { retryAfterSec });
      }
    }
    await this.storage.put(RATE_KEY, { lastAt: now });
  }

  publicSession(state, now) {
    let phase = state.phase;
    if (phase === 'active' && now >= state.deadline) phase = 'expired';
    return {
      phase,
      active: phase === 'active',
      hasSession: Boolean(state.sessionId),
      requestedTarget: state.requestedTarget,
      navigation: state.navigation,
      startedAt: state.startedAt,
      expiresAt: state.deadline,
      acquireBlockedUntil: state.phase === 'acquiring' ? state.acquireStartedAt + ACQUIRE_GRACE_MS : null,
      endedReason: state.endedReason
    };
  }

  /**
   * Tutup sid milik sendiri dan sahkan kematian secara berwibawa
   * (null, terminal Session not found, atau rekod endTime positif yang sepadan).
   * Jika belum disahkan, sid dikekalkan dalam fasa 'closing' dan penggera cubaan semula dijadualkan.
   */
  async closeAndVerify(state, reason) {
    const sid = state.sessionId;
    state = await this.saveState({
      ...state,
      phase: 'closing',
      closeAttempts: (state.closeAttempts || 0) + 1,
      endedReason: state.endedReason === 'expired' ? 'expired' : reason
    });
    try {
      await withTimeout(this.env.BROWSER.closeSession(sid), CDP_TIMEOUT_MS);
    } catch {
      // disahkan di bawah
    }
    let gone = false;
    try {
      gone = isSessionEnded(await lookupOwnedSession(this.env.BROWSER, sid), sid);
    } catch {
      gone = false;
    }
    if (gone) {
      await this.resetState(state.endedReason);
      return { ok: true, status: 'closed' };
    }
    const delay = Math.min(CLOSE_RETRY_MS * 2 ** Math.min(state.closeAttempts - 1, 4), CLOSE_RETRY_MAX_MS);
    await this.storage.setAlarm(this.now() + delay);
    return { ok: false, status: 'closing' };
  }

  /** Pastikan ada sesi aktif yang belum tamat; tamat tempoh → tutup serta-merta. */
  async requireActive(now) {
    const state = await this.loadState();
    if (state.phase === 'active' && state.sessionId) {
      if (now < state.deadline) return state;
      await this.closeAndVerify(state, 'expired');
      throw new AppError('session-expired');
    }
    if (state.endedReason === 'expired' && (state.phase === 'idle' || state.phase === 'closing')) throw new AppError('session-expired');
    if (state.phase === 'closing') throw new AppError('close-pending');
    if (state.phase === 'acquiring') throw new AppError('acquire-uncertain', { status: 409 });
    throw new AppError('no-session');
  }

  /** Navigasi ke URL enum tetap; keputusan disimpan; kegagalan mengekalkan sesi. */
  async navigateTo(state, url) {
    let navigation;
    if (state.targetId) {
      try {
        const r = await runCdpCommand(this.env.BROWSER, state.sessionId, state.targetId, 'Page.navigate', { url });
        navigation = r && typeof r.errorText === 'string' && r.errorText ? 'failed' : 'sent';
      } catch (err) {
        navigation = err.code === 'cdp-timeout' ? 'uncertain' : 'failed';
      }
    } else {
      try {
        const t = await withTimeout(this.env.BROWSER.devtools.newTarget(state.sessionId, url), CDP_TIMEOUT_MS);
        if (t && typeof t.id === 'string') {
          state.targetId = t.id;
          navigation = 'sent';
        } else {
          navigation = 'uncertain';
        }
      } catch (err) {
        navigation = err.code === 'cdp-timeout' ? 'uncertain' : 'failed';
      }
    }
    state.navigation = navigation;
    state.lastSafeStatus = null; // semakan lama tidak lagi sah
    await this.saveState(state);
    if (navigation !== 'sent') throw new AppError('navigation-failed');
    return navigation;
  }

  async startSession(targetKey = 'idme') {
    const url = resolveTarget(targetKey); // ditolak sebelum sebarang tindakan berbayar
    return this.enqueue(async () => {
      const now = this.now();
      let state = await this.loadState();

      if (state.phase === 'acquiring') {
        const until = state.acquireStartedAt + ACQUIRE_GRACE_MS;
        if (now < until) throw new AppError('acquire-uncertain', { status: 409, retryAfterSec: Math.ceil((until - now) / 1000) });
        state = await this.resetState('acquire-expired');
      }
      if (state.phase === 'closing') throw new AppError('close-pending');
      if (state.phase === 'active' && state.sessionId) {
        if (now >= state.deadline) {
          await this.closeAndVerify(state, 'expired');
          throw new AppError('session-expired');
        }
        let live;
        try {
          live = await lookupOwnedSession(this.env.BROWSER, state.sessionId);
        } catch {
          throw new AppError('lookup-unavailable'); // sid dikekalkan
        }
        if (!isSessionEnded(live, state.sessionId)) {
          return { ok: true, reused: true, navigation: 'existing', session: this.publicSession(state, now) };
        }
        state = await this.resetState('gone'); // null or authoritative positive endTime
      }

      const budget = await this.loadBudget(now);
      if (budget.count >= MAX_LAUNCHES_PER_DAY) throw new AppError('daily-cap');
      await this.reserveRate(now);

      // Tempahan disimpan SEBELUM acquire: belanjawan, keadaan acquiring, penggera keras.
      await this.storage.put(BUDGET_KEY, { date: budget.date, count: budget.count + 1 });
      state = await this.saveState({ ...IDLE_STATE, phase: 'acquiring', acquireStartedAt: now, requestedTarget: targetKey });
      await this.storage.setAlarm(now + ACQUIRE_GRACE_MS);

      let acquired;
      try {
        acquired = await withTimeout(acquireBrowserSession(this.env.BROWSER), ACQUIRE_TIMEOUT_MS);
      } catch {
        throw new AppError('acquire-uncertain'); // keadaan acquiring dikekalkan
      }
      if (!acquired.sessionId) throw new AppError('acquire-uncertain');

      // sid disimpan serta-merta, sebelum navigasi.
      state = await this.saveState({
        ...state,
        phase: 'active',
        sessionId: acquired.sessionId,
        targetId: acquired.targetId,
        startedAt: now,
        deadline: now + MAX_WALL_LIFETIME_MS,
        acquireStartedAt: null
      });
      // Penggera sedia ada (now + 15 minit) sama dengan tarikh akhir.

      const navigation = await this.navigateTo(state, url);
      return { ok: true, reused: false, navigation, session: this.publicSession(state, now) };
    });
  }

  async navigateSession(targetKey) {
    const url = resolveTarget(targetKey);
    return this.enqueue(async () => {
      const now = this.now();
      const state = await this.requireActive(now);
      await this.reserveRate(now);
      state.requestedTarget = targetKey;
      const navigation = await this.navigateTo(state, url);
      return { ok: true, navigation, session: this.publicSession(state, now) };
    });
  }

  async inspectPage() {
    return this.enqueue(async () => {
      const now = this.now();
      const state = await this.requireActive(now);
      await this.reserveRate(now);
      const pageStatus = await inspectActivePage(this.env.BROWSER, state.sessionId, state.targetId, { now: this.now });
      state.lastSafeStatus = pageStatus;
      await this.saveState(state);
      return { ok: true, pageStatus };
    });
  }

  async getLiveView(options = {}) {
    const mode = options && options.mode;
    if (mode !== 'readonly' && mode !== 'manual') throw new AppError('invalid-mode');
    if (mode === 'manual' && options.manualConsent !== true) throw new AppError('manual-consent-required');
    return this.enqueue(async () => {
      const now = this.now();
      const state = await this.requireActive(now);
      await this.reserveRate(now);
      const sel = await resolveInspectTarget(this.env.BROWSER, state.sessionId, state.targetId);
      const targetId = sel.targetId || state.targetId;

      if (mode === 'manual') {
        const { url } = await requestLiveView(this.env.BROWSER, state.sessionId, targetId, 'manual');
        return { ok: true, mode: 'manual', url, warning: MANUAL_WARNING };
      }

      let live = null;
      try {
        live = await requestLiveView(this.env.BROWSER, state.sessionId, targetId, 'readonly');
      } catch {
        live = null;
      }
      if (live && live.verified) return { ok: true, mode: 'readonly', url: live.url, warning: READONLY_WARNING };
      // Gagal tertutup untuk pautan: jangan sekali-kali pulangkan URL interaktif
      // di bawah label baca-sahaja. Jatuh balik ke tangkapan skrin statik.
      const image = await captureSnapshot(this.env.BROWSER, state.sessionId, targetId);
      return { ok: true, mode: 'snapshot', image, warning: SNAPSHOT_WARNING };
    });
  }

  async closeSession() {
    return this.enqueue(async () => {
      const now = this.now();
      const state = await this.loadState();
      if (state.phase === 'acquiring') {
        if (now < state.acquireStartedAt + ACQUIRE_GRACE_MS) {
          // Tiada sid diketahui: tempahan tidak boleh dipadam.
          return { ok: false, status: 'acquire-uncertain', session: this.publicSession(state, now) };
        }
        await this.resetState('acquire-expired');
        return { ok: true, status: 'idle' };
      }
      if (!state.sessionId) {
        if (state.phase !== 'idle') await this.resetState(state.endedReason);
        return { ok: true, status: 'idle' };
      }
      return this.closeAndVerify(state, 'user');
    });
  }

  async alarm() {
    return this.enqueue(async () => {
      const now = this.now();
      const state = await this.loadState();
      if (state.phase === 'acquiring') {
        const until = state.acquireStartedAt + ACQUIRE_GRACE_MS;
        if (now >= until) await this.resetState('acquire-expired');
        else await this.storage.setAlarm(until);
        return;
      }
      if (state.phase === 'closing' && state.sessionId) {
        await this.closeAndVerify(state, state.endedReason || 'user');
        return;
      }
      if (state.phase === 'active' && state.sessionId) {
        if (now >= state.deadline) await this.closeAndVerify(state, 'expired');
        else await this.storage.setAlarm(state.deadline); // jangan tutup awal
      }
    });
  }

  async claimNonce(nonce, exp) {
    if (typeof nonce !== 'string' || nonce.length < 16 || nonce.length > 128 || !/^[A-Za-z0-9_-]+$/.test(nonce)) {
      throw new AppError('invalid-request');
    }
    if (!Number.isInteger(exp)) throw new AppError('invalid-request');
    return this.enqueue(async () => {
      const nowS = Math.floor(this.now() / 1000);
      if (exp < nowS || exp > nowS + MAX_TICKET_LIFETIME_S) throw new AppError('ticket-invalid');
      const stored = (await this.storage.get(NONCE_KEY)) || {};
      const live = {};
      for (const [n, e] of Object.entries(stored)) if (e >= nowS) live[n] = e;
      if (Object.hasOwn(live, nonce)) throw new AppError('ticket-replayed');
      if (Object.keys(live).length >= MAX_CLAIMED_NONCES) throw new AppError('nonce-store-full');
      live[nonce] = exp;
      await this.storage.put(NONCE_KEY, live);
      return { ok: true };
    });
  }

  /** Status cache sahaja: tiada panggilan pelayar, tiada penulisan, tiada had kadar. */
  async getStatus() {
    const now = this.now();
    const state = await this.loadState();
    const budget = await this.loadBudget(now);
    const gate = await this.storage.get(RATE_KEY);
    return {
      ok: true,
      school: 'SK Paya Redan',
      schoolCode: 'JBA5054',
      automaticSending: false,
      dailyLaunches: { count: budget.count, max: MAX_LAUNCHES_PER_DAY, date: budget.date },
      nextActionAt: gate && gate.lastAt + RATE_LIMIT_GAP_MS > now ? gate.lastAt + RATE_LIMIT_GAP_MS : null,
      session: this.publicSession(state, now),
      pageStatus: state.lastSafeStatus || null
    };
  }

  async fetch(request) {
    try {
      const path = new URL(request.url).pathname;
      if (path === '/status' && request.method === 'GET') return jsonResponse(await this.getStatus());
      if (request.method !== 'POST' || !Object.hasOwn(ROUTE_FIELDS, path)) throw new AppError('not-found');
      const body = parseJsonBody(await readBoundedBody(request), ROUTE_FIELDS[path]);
      let result;
      switch (path) {
        case '/start':
          result = await this.startSession(body.target === undefined ? 'idme' : body.target);
          break;
        case '/navigate':
          result = await this.navigateSession(body.target);
          break;
        case '/inspect':
          result = await this.inspectPage();
          break;
        case '/liveview':
          result = await this.getLiveView({ mode: body.mode, manualConsent: body.manualConsent });
          break;
        case '/close':
          result = await this.closeSession();
          break;
        case '/claim-nonce':
          result = await this.claimNonce(body.nonce, body.exp);
          break;
      }
      return jsonResponse(result);
    } catch (err) {
      const safe = toSafeError(err);
      const { status, ...payload } = safe;
      return jsonResponse({ ok: false, ...payload }, status);
    }
  }
}

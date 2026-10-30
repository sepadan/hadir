import { VERSION } from './version.mjs';

const HEAD = `<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="referrer" content="no-referrer">
  <title>Autohadir Cloud — SK Paya Redan</title>
  <link rel="stylesheet" href="/style.css">
</head>`;

const HEADER = `<header class="header">
      <div class="brand">
        <h1 class="title">Autohadir Cloud</h1>
        <div class="subtitle">SK Paya Redan (JBA5054)</div>
      </div>
      <div class="badge badge-warning">Perintis • Penghantaran automatik MATI</div>
    </header>`;

const FOOTER = `<footer class="footer">
      <p>Autohadir Cloud v${VERSION} • Fasa 1 perintis: sesi pelayar + diagnostik sahaja, bukan automasi kehadiran.</p>
    </footer>`;

export function renderNotConfiguredHtml() {
  return `${HEAD}
<body>
  <div class="container">
    ${HEADER}
    <main class="main-content">
      <div class="card card-locked">
        <h2>Panel belum dikonfigurasi</h2>
        <p class="desc">Panel ini terkunci sehingga pentadbir menyediakan konfigurasinya.</p>
      </div>
    </main>
    ${FOOTER}
  </div>
</body>
</html>`;
}

export function renderLockedHtml() {
  return `${HEAD}
<body>
  <div class="container">
    ${HEADER}
    <main class="main-content">
      <div class="card card-locked">
        <div class="card-header">
          <h2>🔒 Panel Terkunci (Akses Pemilik Sahaja)</h2>
        </div>
        <p class="desc">
          Panel ini hanya untuk pentadbir SK Paya Redan. Log masuk menggunakan tiket bertandatangan satu-kali guna
          yang dijana pada PC pemilik — bukan kata laluan.
        </p>
        <div class="instruction-box">
          <h3>Cara membuka panel:</h3>
          <ol>
            <li>Pada PC pemilik, buka folder <code>autohadir-cloud</code>.</li>
            <li>Klik dua kali <code>Buka-Panel.cmd</code>.</li>
            <li>Pelayar membuka panel ini secara automatik (tiket sah 90 saat, sekali guna).</li>
          </ol>
        </div>
        <div class="notice-box">
          Kunci pemilik disulit dengan Windows DPAPI pada PC pentadbir. Tiada kata laluan idMe/MOEIS disimpan di awan.
          Penghantaran kehadiran automatik disekat sepenuhnya dalam Fasa 1.
        </div>
      </div>
    </main>
    ${FOOTER}
  </div>
</body>
</html>`;
}

export function renderAuthenticatedHtml() {
  return `${HEAD}
<body>
  <div class="container">
    <header class="header">
      <div class="brand">
        <h1 class="title">Autohadir Cloud</h1>
        <div class="subtitle">SK Paya Redan (JBA5054)</div>
      </div>
      <div class="header-badges">
        <span class="badge badge-warning">Perintis • Penghantaran automatik MATI</span>
        <button id="btnLogout" class="btn btn-secondary btn-sm" type="button">Log keluar</button>
      </div>
    </header>

    <div id="liveAlert" class="sr-only" role="status" aria-live="polite"></div>

    <main class="main-content">
      <section class="card" aria-labelledby="heading-status">
        <div class="card-header">
          <h2 id="heading-status">Keadaan sesi</h2>
          <span id="badgeSessionStatus" class="badge badge-neutral">Memuatkan…</span>
        </div>
        <div class="grid grid-2">
          <div class="stat-item">
            <span class="stat-label">Cubaan pelancaran hari ini (waktu KL)</span>
            <span id="valLaunches" class="stat-value">– / 8</span>
            <span class="stat-hint">Had kiraan, bukan anggaran kos.</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Baki had 15 minit</span>
            <span id="valExpiry" class="stat-value">–</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Sasaran diminta / navigasi</span>
            <span id="valTarget" class="stat-value">–</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Penghantaran automatik</span>
            <span class="stat-value text-danger">MATI (disekat)</span>
          </div>
        </div>
      </section>

      <section class="card" aria-labelledby="heading-actions">
        <h2 id="heading-actions">Tindakan pelayar Cloudflare</h2>
        <p class="desc text-sm">Setiap tindakan pelayar mesti berjarak sekurang-kurangnya 12 saat. Muat semula status tidak menyentuh pelayar.</p>
        <div class="button-group">
          <button id="btnStartIdme" class="btn btn-primary" type="button">Mulakan sesi idMe</button>
          <button id="btnStartControl" class="btn btn-outline" type="button">Uji laman kawalan (example.com)</button>
          <button id="btnNavMoeis" class="btn btn-outline" type="button">Navigasi ke halaman kehadiran MOEIS</button>
          <button id="btnInspect" class="btn btn-outline" type="button">Semak halaman</button>
          <button id="btnReadonly" class="btn btn-secondary" type="button">Lihat sahaja</button>
          <button id="btnCloseSession" class="btn btn-danger" type="button">Tutup sesi</button>
        </div>
        <div id="actionStatus" class="status-msg" role="status" aria-live="polite"></div>
      </section>

      <section class="card card-warning" aria-labelledby="heading-manual">
        <div class="card-header">
          <h2 id="heading-manual">Kawalan manual</h2>
          <span class="badge badge-danger">Kawalan penuh — boleh MENULIS</span>
        </div>
        <div class="warning-callout">
          <strong>Baca dahulu:</strong> pautan kawalan manual memberi kawalan penuh kepada pelayar awan (dihoskan oleh Cloudflare).
          Anda boleh menaip, klik dan <strong>MENULIS rekod di portal, termasuk menyimpan kehadiran</strong>.
          Autohadir Cloud tidak menyimpan kata laluan idMe anda. Penghantaran automatik kekal MATI; panel ini tidak pernah klik apa-apa bagi pihak anda.
          <strong>Jangan tekan Simpan kehadiran.</strong>
        </div>
        <div class="checkbox-container">
          <input type="checkbox" id="checkManualConsent">
          <label for="checkManualConsent">Saya faham pautan ini memberi kawalan penuh yang boleh menulis rekod, dan saya sendiri yang bertindak di portal.</label>
        </div>
        <button id="btnManual" class="btn btn-warning" type="button" disabled>Jana pautan kawalan manual (sambung dalam 60 saat)</button>
        <div id="manualResult" class="manual-url-container"></div>
      </section>

      <section class="card" aria-labelledby="heading-workflow">
        <h2 id="heading-workflow">Diagnostik halaman (agregat sahaja)</h2>
        <p class="desc text-sm">Diisi hanya oleh "Semak halaman". Tiada nama murid, IC, tajuk, kuki atau kata laluan dibaca keluar.</p>
        <ul class="workflow-steps">
          <li class="workflow-step"><span class="step-indicator" id="indIdMe">?</span>
            <div class="step-details"><strong>1. Log masuk idMe</strong><div class="step-status" id="statusIdMe">Belum disemak (UNKNOWN)</div></div></li>
          <li class="workflow-step"><span class="step-indicator" id="indApp">?</span>
            <div class="step-details"><strong>2. Pilih aplikasi</strong><div class="step-status" id="statusApp">Belum disemak (UNKNOWN)</div></div></li>
          <li class="workflow-step"><span class="step-indicator" id="indMoeis">?</span>
            <div class="step-details"><strong>3. Halaman kehadiran MOEIS</strong><div class="step-status" id="statusMoeis">Belum disemak (UNKNOWN)</div></div></li>
        </ul>
        <div class="diagnostics-panel">
          <div class="diag-row"><span class="diag-label">Halaman diperiksa</span><code id="diagUrl" class="diag-val">–</code></div>
          <div class="diag-row"><span class="diag-label">Pemilihan tab</span><span id="diagSelection" class="diag-val">–</span></div>
          <div class="diag-row"><span class="diag-label">Peringkat borang</span><span id="diagForm" class="diag-val">–</span></div>
          <div class="diag-row"><span class="diag-label">Sekatan / 403 / Imperva</span><span id="diagBlocked" class="diag-val">–</span></div>
          <div class="diag-row"><span class="diag-label">CAPTCHA / OTP</span><span id="diagCaptcha" class="diag-val">–</span></div>
          <div class="diag-row"><span class="diag-label">Pemilih kehadiran MOEIS</span><span id="diagMoeisCount" class="diag-val">–</span></div>
          <div class="diag-row"><span class="diag-label">Disemak pada</span><span id="diagAt" class="diag-val">–</span></div>
        </div>
      </section>
    </main>

    ${FOOTER}
  </div>

  <div id="snapshotModal" class="modal" hidden role="dialog" aria-modal="true" aria-labelledby="snapshotTitle">
    <div class="modal-box">
      <div class="card-header">
        <h2 id="snapshotTitle">Lihat sahaja</h2>
        <button id="btnSnapshotClose" class="btn btn-secondary btn-sm" type="button">Tutup</button>
      </div>
      <p id="snapshotWarning" class="warning-callout"></p>
      <img id="snapshotImg" class="snapshot-img" alt="Tangkapan skrin semasa pelayar awan">
      <button id="btnSnapshotRefresh" class="btn btn-outline" type="button">Muat semula tangkapan (12 saat jeda)</button>
    </div>
  </div>

  <script src="/app.js"></script>
</body>
</html>`;
}

export function renderStyleCss() {
  return `
/* Autohadir Cloud - Skema Warna & Susun Atur Mobile 390px Mesra */
:root {
  --primary: #1e3a8a;
  --primary-hover: #172554;
  --bg: #f8fafc;
  --card-bg: #ffffff;
  --text: #0f172a;
  --text-muted: #64748b;
  --border: #e2e8f0;
  --success: #15803d;
  --success-bg: #f0fdf4;
  --warning: #b45309;
  --warning-bg: #fffbeb;
  --danger: #b91c1c;
  --danger-bg: #fef2f2;
  --font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-family);
  background-color: var(--bg);
  color: var(--text);
  line-height: 1.5;
  padding: 12px;
}

.container {
  max-width: 640px;
  margin: 0 auto;
}

.header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 0 16px 0;
  border-bottom: 1px solid var(--border);
  margin-bottom: 16px;
}

.header-badges {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--primary);
}

.subtitle {
  font-size: 0.875rem;
  color: var(--text-muted);
}

.badge {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 9999px;
  border: 1px solid transparent;
}

.badge-warning {
  background-color: var(--warning-bg);
  color: var(--warning);
  border-color: #fde68a;
}

.badge-danger {
  background-color: var(--danger-bg);
  color: var(--danger);
  border-color: #fecaca;
}

.badge-success {
  background-color: var(--success-bg);
  color: var(--success);
  border-color: #bbf7d0;
}

.badge-neutral {
  background-color: #f1f5f9;
  color: var(--text-muted);
  border-color: var(--border);
}

.main-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card {
  background-color: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.card-warning {
  border-color: #fde68a;
  background-color: #fffdfa;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.card-header h2 {
  font-size: 1rem;
  font-weight: 600;
}

.desc {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.text-sm {
  font-size: 0.8125rem;
}

.text-danger {
  color: var(--danger);
  font-weight: 600;
}

.grid {
  display: grid;
  gap: 12px;
}

.grid-2 {
  grid-template-columns: repeat(2, 1fr);
}

@media (max-width: 420px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }
}

.stat-item {
  display: flex;
  flex-direction: column;
  padding: 8px;
  background-color: #f8fafc;
  border-radius: 6px;
  border: 1px solid #f1f5f9;
}

.stat-label {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.stat-value {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text);
}

.button-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.btn {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  padding: 10px 16px;
  font-size: 0.875rem;
  font-weight: 600;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  text-decoration: none;
  transition: background-color 0.15s ease;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background-color: var(--primary);
  color: #ffffff;
}

.btn-primary:hover:not(:disabled) {
  background-color: var(--primary-hover);
}

.btn-secondary {
  background-color: #f1f5f9;
  color: var(--text);
  border-color: var(--border);
}

.btn-secondary:hover:not(:disabled) {
  background-color: #e2e8f0;
}

.btn-outline {
  background-color: transparent;
  color: var(--primary);
  border-color: var(--primary);
}

.btn-danger {
  background-color: var(--danger-bg);
  color: var(--danger);
  border-color: #fecaca;
}

.btn-danger:hover:not(:disabled) {
  background-color: #fee2e2;
}

.btn-warning {
  background-color: #d97706;
  color: #ffffff;
}

.btn-warning:hover:not(:disabled) {
  background-color: #b45309;
}

.btn-sm {
  padding: 4px 10px;
  font-size: 0.75rem;
}

.warning-callout {
  padding: 10px;
  background-color: #fffbeb;
  border: 1px solid #fef3c7;
  border-left: 4px solid var(--warning);
  font-size: 0.8125rem;
  margin-bottom: 12px;
  border-radius: 4px;
}

.checkbox-container {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 0.8125rem;
}

.checkbox-container input {
  margin-top: 3px;
}

.status-msg {
  margin-top: 8px;
  font-size: 0.8125rem;
  padding: 6px 8px;
  border-radius: 4px;
  display: none;
}

.workflow-steps {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0;
}

.workflow-step {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  background-color: #f8fafc;
  border: 1px solid var(--border);
  border-radius: 6px;
}

.step-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background-color: #e2e8f0;
  font-weight: 700;
  font-size: 0.875rem;
}

.step-status {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.diagnostics-panel {
  padding: 10px;
  background-color: #f8fafc;
  border-radius: 6px;
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.8125rem;
}

.diag-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.diag-label {
  color: var(--text-muted);
}

.diag-val {
  font-weight: 600;
  word-break: break-all;
}

.instruction-box {
  background-color: #f8fafc;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px;
  margin: 12px 0;
}

.instruction-box ol {
  padding-left: 20px;
  font-size: 0.875rem;
}

.instruction-box pre {
  background-color: #1e293b;
  color: #f8fafc;
  padding: 6px 10px;
  border-radius: 4px;
  margin: 4px 0;
  font-size: 0.8125rem;
}

.notice-box {
  background-color: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
  padding: 10px;
  font-size: 0.8125rem;
  color: #166534;
}

.footer {
  text-align: center;
  padding: 20px 0;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.stat-hint { font-size: 0.6875rem; color: var(--text-muted); }
.status-msg.status-ok { display: block; background-color: var(--success-bg); color: var(--success); }
.status-msg.status-error { display: block; background-color: var(--danger-bg); color: var(--danger); }
.step-indicator.step-yes { background-color: #bbf7d0; }
.step-indicator.step-no { background-color: #fecaca; }
.manual-url-container { margin-top: 10px; }
.modal { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.7); display: flex; align-items: flex-start; justify-content: center; padding: 12px; overflow-y: auto; z-index: 10; }
.modal[hidden] { display: none; }
.modal-box { background: var(--card-bg); border-radius: 8px; padding: 12px; width: 100%; max-width: 960px; display: flex; flex-direction: column; gap: 10px; }
.snapshot-img { width: 100%; height: auto; border: 1px solid var(--border); border-radius: 4px; }
code { word-break: break-all; }
`;
}

export function renderAppJs() {
  return `// Autohadir Cloud — UI panel pemilik. Tiada rangka kerja, tiada aset luar,
// tiada innerHTML, tiada localStorage. URL Live View dan imej tidak disimpan.
(() => {
  'use strict';
  let csrfToken = null;
  let lastStatus = null;
  const $ = (id) => document.getElementById(id);
  const el = {
    badge: $('badgeSessionStatus'), launches: $('valLaunches'), expiry: $('valExpiry'), target: $('valTarget'),
    startIdme: $('btnStartIdme'), startControl: $('btnStartControl'), navMoeis: $('btnNavMoeis'),
    inspect: $('btnInspect'), readonly: $('btnReadonly'), close: $('btnCloseSession'), logout: $('btnLogout'),
    status: $('actionStatus'), alert: $('liveAlert'), consent: $('checkManualConsent'), manual: $('btnManual'),
    manualResult: $('manualResult'), modal: $('snapshotModal'), modalImg: $('snapshotImg'),
    modalWarning: $('snapshotWarning'), modalClose: $('btnSnapshotClose'), modalRefresh: $('btnSnapshotRefresh'),
    indIdMe: $('indIdMe'), statusIdMe: $('statusIdMe'), indApp: $('indApp'), statusApp: $('statusApp'),
    indMoeis: $('indMoeis'), statusMoeis: $('statusMoeis'), diagUrl: $('diagUrl'), diagSelection: $('diagSelection'),
    diagForm: $('diagForm'), diagBlocked: $('diagBlocked'), diagCaptcha: $('diagCaptcha'),
    diagMoeisCount: $('diagMoeisCount'), diagAt: $('diagAt')
  };

  const PHASE_LABEL = {
    idle: ['Tiada sesi', 'badge-neutral'],
    acquiring: ['Pelancaran tidak pasti — disekat', 'badge-warning'],
    active: ['Aktif', 'badge-success'],
    expired: ['Tamat 15 minit — sedang ditutup', 'badge-warning'],
    closing: ['Penutupan belum disahkan', 'badge-warning']
  };
  const NAV_LABEL = { sent: 'arahan dihantar (belum disahkan)', failed: 'GAGAL', uncertain: 'tidak pasti', existing: 'sesi sedia ada' };
  const SELECTION_LABEL = {
    'moeis-tab': 'tab MOEIS', saved: 'tab asal sesi', 'first-allowed': 'tab pertama dibenarkan',
    'saved-unlisted': 'tab asal (senarai tab gagal)', none: 'tiada tab dibenarkan'
  };

  function say(msg, isError) {
    el.status.textContent = msg;
    el.status.className = 'status-msg ' + (isError ? 'status-error' : 'status-ok');
    el.alert.textContent = msg;
  }

  async function api(path, method, body) {
    const headers = { Accept: 'application/json' };
    if (method !== 'GET') {
      headers['X-Autohadir-CSRF'] = csrfToken || '';
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(path, {
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify(body || {}),
      cache: 'no-store',
      credentials: 'same-origin',
      referrerPolicy: 'no-referrer'
    });
    if (res.status === 401) {
      window.location.replace('/');
      throw new Error('Sesi pemilik tamat.');
    }
    let data = {};
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok) {
      const wait = data.retryAfterSec ? ' (cuba lagi dalam ' + data.retryAfterSec + ' s)' : '';
      throw new Error((data.error || 'Ralat komunikasi.') + wait);
    }
    return data;
  }

  function fmtRemaining(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 's';
  }

  function renderStatus(data) {
    lastStatus = data;
    const s = data.session || {};
    const phase = PHASE_LABEL[s.phase] ? s.phase : 'idle';
    el.badge.textContent = PHASE_LABEL[phase][0];
    el.badge.className = 'badge ' + PHASE_LABEL[phase][1];
    if (data.dailyLaunches) el.launches.textContent = data.dailyLaunches.count + ' / ' + data.dailyLaunches.max;
    renderExpiry(s);
    el.target.textContent = s.requestedTarget ? s.requestedTarget.toUpperCase() + ' · ' + (NAV_LABEL[s.navigation] || '–') : '–';
    renderDiagnostics(data.pageStatus || null);
  }

  function renderExpiry(s) {
    if (s.phase === 'active' && s.expiresAt && Date.now() >= s.expiresAt) {
      el.badge.textContent = PHASE_LABEL.expired[0];
      el.badge.className = 'badge ' + PHASE_LABEL.expired[1];
    }
    if (s.phase === 'active' && s.expiresAt) el.expiry.textContent = fmtRemaining(s.expiresAt - Date.now());
    else if (s.phase === 'acquiring' && s.acquireBlockedUntil) el.expiry.textContent = 'disekat ' + fmtRemaining(s.acquireBlockedUntil - Date.now());
    else el.expiry.textContent = '–';
  }

  function setStep(ind, label, state, text) {
    ind.textContent = state === 'yes' ? '✓' : state === 'no' ? '✗' : '?';
    ind.className = 'step-indicator step-' + state;
    label.textContent = text;
  }

  function renderDiagnostics(d) {
    if (!d) {
      el.diagUrl.textContent = '–'; el.diagSelection.textContent = '–'; el.diagForm.textContent = '–';
      el.diagBlocked.textContent = '–'; el.diagCaptcha.textContent = '–'; el.diagMoeisCount.textContent = '–'; el.diagAt.textContent = '–';
      setStep(el.indIdMe, el.statusIdMe, 'unknown', 'Belum disemak (UNKNOWN)');
      setStep(el.indApp, el.statusApp, 'unknown', 'Belum disemak (UNKNOWN)');
      setStep(el.indMoeis, el.statusMoeis, 'unknown', 'Belum disemak (UNKNOWN)');
      return;
    }
    el.diagUrl.textContent = (d.normalizedUrl || d.pageKind || '–') + (d.ambiguous ? ' (samar-samar)' : '');
    el.diagSelection.textContent = (SELECTION_LABEL[d.targetSelection] || '–') + (d.pageCount != null ? ' · ' + d.pageCount + ' tab' : '');
    el.diagForm.textContent = d.isIdMePasswordStep ? 'Peringkat kata laluan' : d.isIdMeLoginForm ? 'Peringkat No. Kad Pengenalan' : 'Tiada borang idMe dikesan';
    el.diagBlocked.textContent = d.isBlocked ? 'YA (disekat)' : 'Tidak dikesan';
    el.diagCaptcha.textContent = d.hasCaptchaOrOtp ? 'Dikesan — perlu manusia' : 'Tidak dikesan';
    el.diagMoeisCount.textContent = d.moeisAttendanceSelectorCount == null ? '–' : String(d.moeisAttendanceSelectorCount);
    el.diagAt.textContent = d.inspectedAt ? new Date(d.inspectedAt).toLocaleTimeString('ms-MY') : '–';

    const kind = d.pageKind;
    // URL alone (even a MOEIS Forbidden page) does not prove authentication.
    setStep(el.indIdMe, el.statusIdMe, 'unknown', d.isIdMePasswordStep ? 'Langkah kata laluan — belum login' : d.isIdMeLoginForm ? 'Borang pengenalan — belum login' : 'Login belum disahkan');
    if (kind === 'moeis-attendance' || kind === 'moeis-other') setStep(el.indApp, el.statusApp, 'unknown', 'Tab MOEIS ditemui; akses belum disahkan');
    else setStep(el.indApp, el.statusApp, 'unknown', 'Belum dikesan (UNKNOWN)');
    if (kind === 'moeis-attendance' && d.moeisAttendanceSelectorCount > 0 && !d.isBlocked) {
      setStep(el.indMoeis, el.statusMoeis, 'yes', 'Halaman dicapai: ' + d.moeisAttendanceSelectorCount + ' pemilih dikesan. BUKAN pengesahan kehadiran.');
    } else if (d.isBlocked) {
      setStep(el.indMoeis, el.statusMoeis, 'no', 'Disekat oleh portal');
    } else {
      setStep(el.indMoeis, el.statusMoeis, 'unknown', 'Belum dicapai (UNKNOWN)');
    }
  }

  async function refreshStatus() {
    try {
      const data = await api('/api/status', 'GET');
      if (data.csrf) csrfToken = data.csrf;
      renderStatus(data);
    } catch (e) {
      // tinjauan senyap; mesej tindakan kekal
    }
  }

  function action(button, busyMsg, fn) {
    if (!button) return;
    button.addEventListener('click', async () => {
      button.disabled = true;
      say(busyMsg, false);
      try {
        say(await fn(), false);
      } catch (e) {
        say(e.message, true);
      } finally {
        button.disabled = button === el.manual ? !el.consent.checked : false;
        refreshStatus();
      }
    });
  }

  action(el.startIdme, 'Memulakan sesi idMe…', async () => {
    const r = await api('/api/session/start', 'POST', { target: 'idme' });
    return r.reused ? 'Sesi sedia ada digunakan semula (tiada pelancaran baharu).' : 'Sesi dibuka; arahan navigasi ke idMe dihantar. Guna "Semak halaman" untuk mengesahkan.';
  });
  action(el.startControl, 'Memulakan sesi kawalan…', async () => {
    const r = await api('/api/session/start', 'POST', { target: 'control' });
    return r.reused ? 'Sesi sedia ada digunakan semula.' : 'Sesi dibuka; arahan navigasi ke example.com dihantar.';
  });
  action(el.navMoeis, 'Menavigasi ke MOEIS…', async () => {
    await api('/api/session/navigate', 'POST', { target: 'moeis' });
    return 'Arahan navigasi ke MOEIS dihantar. Guna "Semak halaman" untuk melihat halaman sebenar.';
  });
  action(el.inspect, 'Menyemak halaman…', async () => {
    const r = await api('/api/session/inspect', 'POST', {});
    renderDiagnostics(r.pageStatus);
    return 'Semakan selesai.';
  });
  action(el.close, 'Menutup sesi…', async () => {
    const r = await api('/api/session/close', 'POST', {});
    if (r.status === 'closed' || r.status === 'idle') return 'Sesi ditutup dan disahkan.';
    if (r.status === 'acquire-uncertain') return 'Pelancaran terdahulu tidak pasti; tiada sid untuk ditutup. Pelancaran baharu disekat sehingga tempoh selamat berlalu.';
    return 'Penutupan belum disahkan; cubaan semula automatik dijadualkan.';
  });

  function closeModal() {
    el.modal.hidden = true;
    el.modalImg.removeAttribute('src');
    el.modalWarning.textContent = '';
  }

  async function readonlyView() {
    const r = await api('/api/session/liveview', 'POST', { mode: 'readonly' });
    if (r.mode === 'snapshot' && typeof r.image === 'string' && r.image.indexOf('data:image/png;base64,') === 0) {
      el.modalImg.src = r.image;
      el.modalWarning.textContent = r.warning || 'Tangkapan semasa, bukan siaran langsung.';
      el.modal.hidden = false;
      el.modalClose.focus();
      return 'Tangkapan skrin dipaparkan (bukan siaran langsung).';
    }
    if (r.mode === 'readonly' && typeof r.url === 'string') {
      showLink(r.url, 'Buka Live View baca-sahaja', el.status);
      return 'Pautan baca-sahaja sedia (sah 60 saat).';
    }
    throw new Error('Paparan baca-sahaja tidak tersedia.');
  }
  action(el.readonly, 'Meminta paparan baca-sahaja…', readonlyView);
  action(el.modalRefresh, 'Memuat semula tangkapan…', readonlyView);
  if (el.modalClose) el.modalClose.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.modal.hidden) closeModal(); });

  // Pautan dibina melalui DOM (bukan innerHTML), dibuka hanya oleh klik pengguna,
  // dibuang selepas 60 saat; tidak disimpan di mana-mana.
  function showLink(url, label, after) {
    el.manualResult.textContent = '';
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.referrerPolicy = 'no-referrer';
    a.className = 'btn btn-warning';
    a.textContent = label + ' (tab baharu)';
    a.addEventListener('click', () => setTimeout(() => { el.manualResult.textContent = ''; }, 0));
    el.manualResult.appendChild(a);
    setTimeout(() => { if (a.isConnected) el.manualResult.textContent = ''; }, 60000);
  }

  if (el.consent) el.consent.addEventListener('change', () => { el.manual.disabled = !el.consent.checked; });
  action(el.manual, 'Menjana pautan kawalan manual…', async () => {
    if (!el.consent.checked) throw new Error('Tandakan persetujuan dahulu.');
    const r = await api('/api/session/liveview', 'POST', { mode: 'manual', manualConsent: true });
    el.consent.checked = false; // persetujuan semula diperlukan untuk setiap pautan
    if (r.mode !== 'manual' || typeof r.url !== 'string') throw new Error('Pautan tidak sah.');
    showLink(r.url, 'Buka kawalan manual — boleh MENULIS', el.manualResult);
    return 'Pautan kawalan manual sedia. Klik untuk membuka; jangan kongsi. Jangan tekan Simpan kehadiran.';
  });

  if (el.logout) el.logout.addEventListener('click', async () => {
    try { await api('/auth/logout', 'POST', {}); } catch (e) { /* tetap muat semula */ }
    window.location.replace('/');
  });

  refreshStatus();
  setInterval(() => {
    const phase = lastStatus && lastStatus.session && lastStatus.session.phase;
    if (document.visibilityState === 'visible' && phase && phase !== 'idle') refreshStatus();
  }, 15000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshStatus();
  });
  setInterval(() => { if (lastStatus) renderExpiry(lastStatus.session || {}); }, 1000);
})();
`;
}

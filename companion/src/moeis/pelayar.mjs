// Helper pelancaran Edge DIKONGSI (companion/src/moeis/pelayar.mjs).
// Digunakan oleh bin/jalan-push.mjs, bin/uji-login.mjs dan
// bin/log-masuk-manual.mjs supaya konfigurasi pelancaran (profil berasingan,
// channel msedge, headed) hanya ditakrifkan SATU tempat. TIDAK diuji
// terhadap Edge/MOEIS sebenar — larangan keras brief pelaksanaan; import
// playwright-core sentiasa lewat (dynamic) supaya modul ini selamat
// diimport oleh kod yang diuji tanpa memerlukan pakej itu wujud.
import path from 'node:path';

// Profil Playwright BERASINGAN daripada profil Edge harian pengguna —
// companion tidak pernah menyalin/menyahsulit kredensial Edge sedia ada.
export async function bukaKonteks(dirData, opsyen) {
  const { chromium } = await import('playwright-core');
  const profilDir = path.join(dirData, 'profil-pelayar');
  return chromium.launchPersistentContext(profilDir, {
    channel: 'msedge', headless: false, viewport: null, ...opsyen
  });
}

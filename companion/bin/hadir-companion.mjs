#!/usr/bin/env node
// CLI companion HADIR-MOEIS (companion/bin/hadir-companion.mjs).
// Guna: hadir-companion <perintah> [--data-dir <laluan>]
//   serve              mulakan pelayan loopback (guru biarkan tetingkap ini terbuka)
//   kod-pasangan       jana kod pasangan 8 aksara (sah 10 minit) untuk HADIR Admin
//   log-masuk-manual   buka Edge headed untuk log masuk idMe sendiri
//   status             papar status ringkas di terminal
//   autostart-hidup    daftar Run key HKCU (opt-in eksplisit)
//   autostart-mati     buang Run key HKCU
//   bina-artifak       panggil install/bina-artifak.ps1
import os from 'node:os';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { dapatkanDirData, bacaTetapan, tulisTetapanAtomik, bacaJson, tulisJsonAtomik } from '../src/tetapan.mjs';
import { buatSimpananRahsia, buatSimpananApi } from '../src/simpanan.mjs';
import { buatStoranKredensial } from '../src/kredensial.mjs';
import { buatPengurusLoginAuto, cubaLoginAutoStartup } from '../src/moeis/login-auto.mjs';
import { buatPengurusPasangan } from '../src/pasangan.mjs';
import { buatLog } from '../src/log.mjs';
import { buatKlienHadir } from '../src/klien-hadir.mjs';
import { buatGiliran } from '../src/giliran.mjs';
import { nilaiKelayakanTugasan } from '../src/auto-mula.mjs';
import { cubaAutoMula } from '../src/orchestrasi-auto.mjs';
import { dengarSelepasBind } from '../src/permulaan.mjs';
import { buatPengurusAutostartWindows } from '../src/autostart-windows.mjs';
import { buangIc } from '../src/moeis/payload.mjs';
import { keupayaanLogMasuk } from '../src/moeis/keupayaan.mjs';
import { buatPelayanHttp, buatNonceLokal } from '../src/server.mjs';
import { halamanLokalHtml, halamanLokalJs } from '../src/ui/render.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const perintah = process.argv[2] || 'serve';
const pengurusAutostart = buatPengurusAutostartWindows({
  platform: process.platform,
  execFileSync,
  exePath: process.execPath,
  scriptPath: path.join(HERE, 'hadir-companion.mjs')
});

function argFlag(nama, lalai) {
  const i = process.argv.indexOf('--' + nama);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : lalai;
}

const dirData = dapatkanDirData(argFlag('data-dir', process.env.HADIR_COMPANION_DATA_DIR || null));
const pemilikEnjin = `${os.hostname()}:${process.pid}`;

function buatTetapanApi() {
  return {
    baca: () => bacaTetapan(dirData),
    tulis: (patch) => tulisTetapanAtomik(dirData, { ...bacaTetapan(dirData), ...patch })
  };
}

function buatKlienDaripadaTetapan(tetapanApi, simpananApi) {
  const t = tetapanApi.baca();
  return buatKlienHadir({ apiUrl: t.apiUrl, rahsia: simpananApi.dapatkanRahsiaEnjin() });
}

// Probe: moeisJobKlaim akan melontar 'Fungsi tidak dibenarkan.' jika backend
// HADIR belum diterbitkan semula dengan kaedah baharu (fail-closed).
//
// PENTING: tanpa rahsia enjin, panggilan ini ditolak oleh kelayakan dan BUKAN
// kerana kaedah tiada — jadi ia TIDAK boleh ditafsirkan sebagai sokongan.
// Pulangan: true (disokong), false (kaedah tiada), null (tidak dapat ditentukan).
// Ketat secara sengaja (penemuan semakan bebas: heuristik lama menganggap
// apa-apa ralat yang tidak dikenali sebagai "disokong"). Hanya satu jawapan
// yang membuktikan kaedah klaim wujud dan responsif dianggap `true`:
// 'Tugasan tidak ditemui.' daripada moeisJobKlaim yang sah. Apa-apa yang lain
// = `false` (kaedah tiada) atau `null` (tidak dapat ditentukan, jangan ambil
// risiko). Giliran hanya dihidupkan apabila jawapannya `true`.
async function klaimDisokong(klien, simpananApi) {
  if (!simpananApi.adaRahsiaEnjin()) return null;
  try {
    await klien.klaim('__companion_probe__', 'probe', false);
    // Kaedah menjawab tanpa ralat untuk id probe yang tidak wujud — tidak
    // sepatutnya berlaku; anggap tidak dapat ditentukan.
    return null;
  } catch (ralat) {
    const mesej = String((ralat && ralat.message) || '');
    if (/Tugasan tidak ditemui/i.test(mesej)) return true;
    if (/Fungsi tidak dibenarkan/i.test(mesej)) return false;
    return null;
  }
}

// Menjalankan push.mjs sebagai proses anak berasingan supaya satu kegagalan
// pelayar tidak menjatuhkan pelayan companion. stdout+stderr penuh dikembalikan
// untuk log.tulisKerja(); baris terakhir 'HASIL:' dihuraikan sebagai keputusan.
//
// Payload tugasan dihantar melalui STDIN, bukan argumen CLI: baris arahan
// proses boleh dibaca oleh proses lain pengguna yang sama (Task Manager, WMI),
// dan payload itu membawa nama murid tidak hadir. Medan `ic` turut dibuang oleh
// buangIc() — enjin memadankan murid mengikut nama dan `data-idpelajar` sahaja
// (penemuan semakan bebas: PII yang boleh dielak sepenuhnya).
function jalankanTugasanAnak(job, opsyen) {
  return new Promise((selesai) => {
    const args = [
      path.join(HERE, 'jalan-push.mjs'),
      '--mod', opsyen.mod,
      '--data-dir', dirData
    ];
    if (opsyen.sahkan) args.push('--sahkan');
    if (opsyen.paksa) args.push('--paksa');
    const anak = execFile(process.execPath, args, { timeout: 15 * 60 * 1000, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const teks = String(stdout || '');
        const barisHasilTeks = teks.trim().split('\n').filter((l) => l.startsWith('HASIL:')).pop();
        let hasil = null;
        try { hasil = barisHasilTeks ? JSON.parse(barisHasilTeks.slice('HASIL:'.length)) : null; } catch { hasil = null; }
        if (!hasil) hasil = { status: 'gagal', sebab: 'Tiada penanda HASIL daripada proses anak.', kod: 2 };
        selesai({ kod: err && typeof err.code === 'number' ? err.code : (err ? 1 : 0), stdout: teks, stderr: String(stderr || ''), hasil });
      });
    // Tulis payload ke STDIN, tetapi jangan sekali-kali membiarkan EPIPE
    // (proses anak keluar lebih awal) menjatuhkan pelayan companion.
    anak.stdin.on('error', () => {});
    try { anak.stdin.end(JSON.stringify(buangIc(job))); } catch { /* anak sudah tiada; keputusan datang daripada callback */ }
  });
}

// Jalankan satu skrip anak (uji-login.mjs / log-masuk-manual.mjs) dan
// huraikan baris terakhir 'HASIL:' sebagai JSON. Ralat proses anak (kod
// keluar bukan 0 TANPA baris HASIL) dilontar sebagai Error supaya pemanggil
// (endpoint HTTP) memulangkan ralat yang jelas, bukan diam-diam gagal.
function jalankanAnakSkrip(skripRelatif, args, timeoutMs) {
  return new Promise((selesai, tolak) => {
    const semuaArgs = [path.join(HERE, skripRelatif), ...args];
    execFile(process.execPath, semuaArgs, { timeout: timeoutMs || 60000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const teks = String(stdout || '');
        const barisHasilTeks = teks.trim().split('\n').filter((l) => l.startsWith('HASIL:')).pop();
        let hasil = null;
        try { hasil = barisHasilTeks ? JSON.parse(barisHasilTeks.slice('HASIL:'.length)) : null; } catch { hasil = null; }
        if (!hasil) {
          tolak(new Error('Tiada penanda HASIL daripada ' + skripRelatif + (stderr ? ': ' + String(stderr).slice(0, 300) : '')));
          return;
        }
        selesai(hasil);
      });
  });
}

async function main() {
  if (perintah === 'kod-pasangan') {
    // Kod pasangan hidup dalam MEMORI proses `serve` sahaja. Menjananya di sini
    // menghasilkan kod dalam proses yang terus keluar — pelayan tidak pernah
    // melihatnya, jadi ia sentiasa gagal. Arahkan pengguna ke UI tempatan.
    console.log('Kod pasangan tidak boleh dijana dari terminal.');
    console.log('Kod hidup dalam memori proses `serve`. Langkah betul:');
    console.log('  1. Jalankan: node bin/hadir-companion.mjs serve');
    console.log('  2. Buka URL "Buka tetapan tempatan" yang dipaparkan (mengandungi nonce)');
    console.log('  3. Tekan "Jana kod pasangan" di situ, kemudian masukkan kod di HADIR Admin → Sambung PC');
    return;
  }

  if (perintah === 'autostart-hidup' || perintah === 'autostart-mati') {
    const statusAutostart = pengurusAutostart.tetapkan(perintah === 'autostart-hidup');
    console.log('Autostart:', statusAutostart.berdaftar && statusAutostart.sepadan ? 'DIHIDUPKAN' : 'DIMATIKAN');
    console.log(statusAutostart.sebab);
    return;
  }

  if (perintah === 'bina-artifak') {
    execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      path.join(HERE, '..', 'install', 'bina-artifak.ps1')], { stdio: 'inherit' });
    return;
  }

  if (perintah === 'status') {
    console.log('Direktori data:', dirData);
    console.log('Tetapan:', JSON.stringify(bacaTetapan(dirData), null, 2));
    console.log('Autostart HKCU sebenar:', JSON.stringify(pengurusAutostart.status(), null, 2));
    console.log('Keupayaan log masuk:', JSON.stringify(keupayaanLogMasuk(), null, 2));
    try {
      console.log('Kredensial idMe:', JSON.stringify(buatStoranKredensial({ dirData }).status(), null, 2));
    } catch { console.log('Kredensial idMe: tidak dapat dibaca.'); }
    return;
  }

  if (perintah === 'log-masuk-manual') {
    console.log('Membuka Edge untuk log masuk manual idMe. Log masuk sendiri; tetingkap ditutup automatik selepas berjaya (had 20 minit).');
    const hasil = await jalankanAnakSkrip('log-masuk-manual.mjs', ['--data-dir', dirData], 21 * 60 * 1000);
    console.log(JSON.stringify(hasil, null, 2));
    return;
  }

  if (perintah !== 'serve') {
    console.error('Perintah tidak dikenali:', perintah);
    process.exit(1);
  }

  const tetapanApi = buatTetapanApi();
  const t0 = tetapanApi.baca();
  // Sempadan startup sengaja konservatif: kerja yang dicipta ketika PC mati
  // tidak diambil automatik selepas logon.
  const sempadanProsesMs = Date.now();
  const autoMulaStatus = {
    diminta: t0.autoMulaGiliran === true,
    bermula: false,
    sebab: 'Menunggu pelayan loopback berjaya bind.'
  };
  const simpananGeneric = buatSimpananRahsia({ dirData });
  const simpananApi = buatSimpananApi(simpananGeneric);
  const storeKredensial = buatStoranKredensial({ dirData });
  const pasangan = buatPengurusPasangan({ simpanan: simpananGeneric });
  const log = buatLog({ dirData });
  const nonceLokal = buatNonceLokal();

  const giliran = buatGiliran({
    klien: buatKlienDaripadaTetapan(tetapanApi, simpananApi),
    pemilik: pemilikEnjin,
    log,
    jalankanTugasanAnak,
    // Pengawal ini HANYA dipanggil untuk giliran AUTO: `masihLayak` dalam
    // giliran.mjs hanya berjalan apabila `automatik === true` (iaitu
    // state.modMula === 'auto'). Giliran manual (POST /api/mula, butang Mula)
    // TIDAK pernah melalui semakan ini — kalendar/kesegaran tidak menapis
    // giliran manual (penemuan semakan bebas).
    // Dibaca semula SETIAP kali: sebelum klaim, selepas klaim dan tepat
    // sebelum mutasi MOEIS. Tarikh/kalendar/togol tidak dicache ketika startup.
    semakKelayakanAutomatik: async (job, tahap) => {
      const t = tetapanApi.baca();
      if (t.autoMulaGiliran !== true) {
        return { boleh: false, sebab: 'Auto-mula telah dimatikan pada PC ini; tugasan tidak disentuh.' };
      }
      const keputusan = nilaiKelayakanTugasan(job, {
        tetapan: t,
        sekarangMs: Date.now(),
        sempadanProsesMs
      });
      if (!keputusan.boleh) log.tulis(`KELAYAKAN_${tahap}: ${keputusan.sebab}`);
      return keputusan;
    }
  });

  // --- Cache status (penemuan semakan bebas) ---
  // /api/status dipanggil setiap kali kad admin dibuka atau selepas setiap
  // tindakan. Ia TIDAK BOLEH melancarkan Edge headed atau membuat panggilan
  // keluar pada setiap poll: itu melambatkan PC dan (lebih buruk) membuka
  // tetingkap pelayar berulang kali. Hanya tindakan eksplisit manusia
  // (/api/uji-login, /api/mula, /api/lokal/log-masuk-manual) memicu pemeriksaan
  // sebenar; status lain dibaca daripada cache.
  const TTL_KLAIM_MS = 5 * 60 * 1000;
  const TTL_SESI_MS = 30 * 60 * 1000;
  const NAMA_STATUS_SESI = 'status-sesi.json';
  let cacheKlaim = { masa: 0, nilai: null };

  function tulisStatusSesi(hasil) {
    try {
      // Keputusan teknikal ('gagal', cth playwright-core tidak dipasang) BUKAN
      // jawapan tentang sesi idMe — jangan cache ia sebagai "tiada sesi".
      // Status kekal "belum diperiksa" supaya laporan jujur.
      if (!hasil || hasil.status === 'gagal') return;
      tulisJsonAtomik(dirData, NAMA_STATUS_SESI, {
        masa: Date.now(),
        status: hasil && hasil.status ? hasil.status : 'tidak-diketahui',
        sesiAda: !!(hasil && hasil.status === 'sesi-sah'),
        hos: (hasil && hasil.hos) || ''
      });
    } catch { /* cache tidak kritikal — jangan gagalkan tindakan utama */ }
  }

  function bacaStatusSesi() {
    const c = bacaJson(dirData, NAMA_STATUS_SESI, null);
    if (!c || typeof c.masa !== 'number') return null;
    return { ...c, umurSaat: Math.max(0, Math.round((Date.now() - c.masa) / 1000)) };
  }

  // Uji log masuk/log masuk manual memerlukan Edge headed dengan profil yang
  // SAMA seperti push.mjs (satu profil Playwright per PC). Jika giliran
  // sedang memproses satu tugasan, profil itu sedang digunakan oleh proses
  // anak lain — menolak dengan mesej jelas daripada melancar Edge kedua yang
  // akan bertembung pada kunci profil.
  function pastikanProfilBebas() {
    if (giliran.status().sedangProses) {
      throw new Error('Giliran sedang memproses satu tugasan; profil Edge sedang digunakan. Cuba lagi selepas selesai.');
    }
  }
  async function jalankanUjiLoginSebenar() {
    pastikanProfilBebas();
    const hasil = await jalankanAnakSkrip(
      'uji-login.mjs',
      ['--data-dir', dirData, '--kunci-dijangka', tetapanApi.baca().kunciKeselamatanDijangka || ''],
      5 * 60 * 1000
    );
    tulisStatusSesi(hasil);
    return hasil;
  }
  async function jalankanLogMasukManualSebenar() {
    pastikanProfilBebas();
    const hasil = await jalankanAnakSkrip('log-masuk-manual.mjs', ['--data-dir', dirData], 21 * 60 * 1000);
    // Log masuk manual yang berjaya bermakna sesi wujud dalam profil pelayar.
    if (hasil && hasil.status === 'sesi-aktif-dalam-profil') {
      tulisStatusSesi({ status: 'sesi-sah', hos: 'moeispel.moe.gov.my', bukti: ['log-masuk-manual'] });
    }
    return hasil;
  }

  // Log masuk idMe AUTOMATIK opt-in. Nilai kredensial dibaca dalam PROSES ANAK
  // (bin/login-auto.mjs) daripada vault — tidak melalui proses pelayan ini dan
  // tidak melalui argumen CLI/env.
  async function jalankanLoginAutoSebenar() {
    pastikanProfilBebas();
    const hasil = await jalankanAnakSkrip('login-auto.mjs', ['--data-dir', dirData], 5 * 60 * 1000);
    if (hasil && hasil.status === 'sesi-sah') {
      tulisStatusSesi({ status: 'sesi-sah', hos: 'moeispel.moe.gov.my', bukti: ['login-auto'] });
    }
    return hasil;
  }

  // Penguatkuasa had 2 cubaan automatik per proses + backoff (perlindungan kunci akaun).
  const pengurusLoginAuto = buatPengurusLoginAuto({
    adaKredensial: () => storeKredensial.ada(),
    jalankan: jalankanLoginAutoSebenar,
    tulisLog: (jenis, status, sebab) => log.tulis(`${jenis}: ${status}: ${sebab}`),
    jedaMs: 5000
  });

  async function sesiStartupDisahkan() {
    const c = bacaStatusSesi();
    if (c && Date.now() - c.masa < TTL_SESI_MS && c.sesiAda === true) {
      return { ada: true, sebab: 'Sesi SSO persisten masih sah menurut cache tempatan.' };
    }
    const hasil = await jalankanUjiLoginSebenar();
    return {
      ada: hasil && hasil.status === 'sesi-sah',
      sebab: (hasil && hasil.sebab) ||
        `Status sesi: ${(hasil && hasil.status) || 'tidak diketahui'}; log masuk manual diperlukan.`
    };
  }

  const konteks = {
    port: t0.port, nonceLokal, pasangan, tetapan: tetapanApi, simpanan: simpananApi,
    kredensial: storeKredensial,
    giliran, log, versi: '1.0.0', pcNama: os.hostname(),
    halamanLokalHtml, halamanLokalJs,
    sekarangMs: () => Date.now(),
    autoMulaStatus,
    keupayaanLogMasuk: keupayaanLogMasuk(),
    autostart: pengurusAutostart,
    // `segarkan: true` hanya daripada tindakan eksplisit manusia; status
    // rutin menggunakan cache (tiada panggilan keluar, tiada pelayar).
    klaimDisokong: async (opsyen) => {
      const segarkan = !!(opsyen && opsyen.segarkan);
      if (!segarkan && cacheKlaim.nilai !== null && Date.now() - cacheKlaim.masa < TTL_KLAIM_MS) {
        return cacheKlaim.nilai;
      }
      const nilai = await klaimDisokong(buatKlienDaripadaTetapan(tetapanApi, simpananApi), simpananApi);
      if (nilai !== null) cacheKlaim = { masa: Date.now(), nilai };
      return nilai;
    },
    // /api/mula memicu pemeriksaan SESI sebenar (tindakan manusia eksplisit);
    // /api/status membaca cache sahaja dan tidak pernah melancarkan Edge.
    adaSesiMoeis: async () => {
      const c = bacaStatusSesi();
      if (c && Date.now() - c.masa < TTL_SESI_MS) return c.sesiAda;
      try {
        const hasil = await jalankanUjiLoginSebenar();
        return hasil.status === 'sesi-sah';
      } catch {
        return false;
      }
    },
    statusSesiMoeis: async () => {
      const c = bacaStatusSesi();
      if (!c) return { sesiAda: null, umurSesi: null, belumDiperiksa: true };
      return { sesiAda: c.sesiAda, umurSesi: c.umurSaat, status: c.status, hos: c.hos, dariCache: c.umurSaat < TTL_SESI_MS / 1000 };
    },
    ujiLogin: jalankanUjiLoginSebenar,
    logMasukManual: jalankanLogMasukManualSebenar,
    // Klaim manual "Jalankan sekarang" satu tugasan sahaja (bukan seluruh
    // giliran) — benarkanCubaSemula:true membolehkan tugasan 'gagal' dicuba
    // semula secara eksplisit oleh admin. Tiada --paksa automatik.
    kerjaJalan: (id) => giliran.jalankanTugasan(id, { benarkanCubaSemula: true }),
    // Pemulihan baca sahaja bagi tugasan 'tersimpan' — tidak pernah menekan
    // simpan semula.
    kerjaSah: (id) => giliran.sahkanTugasan(id),
    kerjaSenaraiDisensor: async () => {
      try {
        const klien = buatKlienDaripadaTetapan(tetapanApi, simpananApi);
        const senarai = await klien.senarai();
        return (senarai || []).map((j) => ({
          id: j.id, kelas: j.kelas, tarikhIso: j.tarikhIso, status: j.status, mesej: j.mesej,
          diciptaEpochMs: j.diciptaEpochMs,
          bilTidakHadir: Array.isArray(j.murid) ? j.murid.length : 0
        }));
      } catch {
        return [];
      }
    }
  };

  const pelayan = buatPelayanHttp(konteks);
  dengarSelepasBind({
    pelayan,
    port: t0.port,
    apabilaBind: () => {
      console.log(`Companion HADIR-MOEIS mendengar pada http://127.0.0.1:${t0.port}/ (loopback sahaja)`);
      console.log(`Buka tetapan tempatan: http://127.0.0.1:${t0.port}/?n=${nonceLokal}`);
      log.tulis('Companion dimulakan; bind loopback berjaya.');
    },
    selepasBind: async () => {
      // 1) Log masuk idMe automatik opt-in (maks 1 cubaan startup), SEBELUM
      //    auto-mula giliran dinilai — supaya giliran auto melihat sesi baharu
      //    jika log masuk automatik berjaya. loginAuto lalai MATI = tiada kesan.
      const loginAuto = await cubaLoginAutoStartup({
        bacaTetapan: tetapanApi.baca,
        adaKredensial: () => storeKredensial.ada(),
        sesiDisahkan: sesiStartupDisahkan,
        cubaSekaliLogin: () => pengurusLoginAuto.cubaAuto(),
        tulisLog: (jenis, status, sebab) => log.tulis(`${jenis}: ${status}: ${sebab}`)
      });
      if (loginAuto.cuba) {
        log.tulis(`LOGIN_AUTO_STARTUP: ${loginAuto.hasil ? loginAuto.hasil.status : 'tidak-diketahui'}`);
      }
      // 2) Auto-mula giliran (pengawal sedia ada, tidak disentuh).
      const hasil = await cubaAutoMula({
        bacaTetapan: tetapanApi.baca,
        sekarangMs: () => Date.now(),
        sempadanProsesMs,
        adaRahsiaEnjin: simpananApi.adaRahsiaEnjin,
        klaimDisokong: () => konteks.klaimDisokong({ segarkan: true }),
        sesiDisahkan: sesiStartupDisahkan,
        mulakanGiliran: giliran.mulakan,
        tulisLog: (jenis, mesej) => log.tulis(`${jenis}: ${mesej}`)
      });
      Object.assign(autoMulaStatus, hasil);
      if (!hasil.bermula) console.error('Auto-mula giliran tidak bermula:', hasil.sebab);
    },
    apabilaRalat: (ralat, fasa) => {
      const mesej = `PERMULAAN_${fasa.toUpperCase()}: ${ralat.message}`;
      console.error(mesej);
      try { log.tulis(mesej); } catch { /* stdout masih memaparkan ralat */ }
      if (fasa === 'bind') process.exitCode = 1;
      autoMulaStatus.bermula = false;
      autoMulaStatus.sebab = mesej;
    }
  });
}

main().catch((ralat) => {
  console.error('Ralat companion:', ralat.message);
  process.exit(1);
});

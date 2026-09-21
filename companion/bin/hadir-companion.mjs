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

import { dapatkanDirData, bacaTetapan, tulisTetapanAtomik, bacaJson, tulisJsonAtomik, bacaAtauCiptaIdEnjin } from '../src/tetapan.mjs';
import { buatSimpananRahsia, buatSimpananApi } from '../src/simpanan.mjs';
import { buatStoranKredensial } from '../src/kredensial.mjs';
import {
  buatPengurusLoginAuto, cubaLoginAutoStartup, buatStatusLoginAuto,
  cubaLoginAutoKerja as cubaLoginAutoKerjaTerpandu, snapshotLoginAutoStatus
} from '../src/moeis/login-auto.mjs';
import { buatPengurusPasangan } from '../src/pasangan.mjs';
import { buatLog } from '../src/log.mjs';
import { buatKlienHadir } from '../src/klien-hadir.mjs';
import { buatGiliran } from '../src/giliran.mjs';
import { nilaiKelayakanTugasan, bolehHariSekolah } from '../src/auto-mula.mjs';
import { cubaAutoMula, pasangPemulihanAutoMula } from '../src/orchestrasi-auto.mjs';
import { dengarSelepasBind } from '../src/permulaan.mjs';
import { buatPengurusAutostartWindows } from '../src/autostart-windows.mjs';
import { buangIc } from '../src/moeis/payload.mjs';
import { keupayaanLogMasuk } from '../src/moeis/keupayaan.mjs';
import { buatPenjagaSesi, JEDA_JAGA_SESI_MS } from '../src/moeis/jaga-sesi.mjs';
import { buatKunciPelayar } from '../src/kunci-pelayar.mjs';
import { buatPelayanHttp, buatNonceLokal } from '../src/server.mjs';
import { halamanLokalHtml, halamanLokalJs } from '../src/ui/render.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Kunci eksklusif pelayar (proses-tunggal): SATU profil Edge dikongsi oleh
// uji-login, log-masuk-manual, login-auto DAN tugasan push.mjs. Ia menyambung
// kepada dua fungsi pelancar anak (jalankanAnakSkrip / jalankanTugasanAnak)
// supaya pemeriksaan-dan-set adalah atomik — tiada tetingkap TOCTOU antara
// semakan `sedangProses` dan pelancaran pelayar kedua.
const kunciPelayar = buatKunciPelayar();
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
// `pemilik` klaim mesti STABIL merentasi restart supaya enjin yang dimulakan
// semula (crash/restart OS/autostart) dapat mengambil semula tugasan
// 'sedang_dihantar' yang ditinggalkan proses sebelumnya dengan SEGERA (klaim
// pemilik sama), bukan menunggu lease 15 minit luput. ID disimpan di
// <dirData>/id-enjin.json (UUID rawak tempatan, bukan rahsia).
const pemilikEnjin = bacaAtauCiptaIdEnjin(dirData);

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
  // Kunci eksklusif pelayar: jika siasatan/login sedang memegang profil Edge,
  // JANGAN lancarkan push.mjs kedua (akan bertembung pada kunci profil).
  // Langkau dengan status 'langkau' — giliran melepaskan lease dan mencuba
  // semula pada kitaran seterusnya. TIADA paksa-bunuh pelayar aktif.
  //
  // `pastiTiadaSpawn: true` ialah JAMINAN EKSPLISIT kepada giliran.mjs bahawa
  // fungsi ini pulang SEBELUM mana-mana execFile/tulisan dibuat — kunci gagal
  // diperoleh serta-merta, tiada kesan sampingan mungkin berlaku. Ini
  // membenarkan giliran.mjs membuang id daripada pernahDiklaimAutomatik supaya
  // auto-mula boleh mencuba semula tugasan yang sama pada kitaran seterusnya
  // (tanpa jaminan ini, sekali langkau bermakna tugasan itu TIDAK PERNAH
  // dicuba semula secara automatik). JANGAN tetapkan medan ini pada
  // mana-mana laluan selepas execFile() dipanggil.
  const kunci = kunciPelayar.cubaKunci('tugasan');
  if (!kunci.boleh) {
    return Promise.resolve({
      kod: 0, stdout: '', stderr: '',
      hasil: {
        status: 'langkau',
        sebab: 'Profil Edge sedang digunakan oleh ' + kunci.pemegang + '; tugasan dilangkau (tiada pelayar kedua dilancarkan).',
        pastiTiadaSpawn: true
      }
    });
  }
  return new Promise((selesai) => {
    const bebaskan = () => kunciPelayar.lepaskan(kunci.pemegang);
    // Seluruh pelancaran dibungkus try/catch: jika execFile() sendiri
    // melontar secara SEGERA (bukan melalui panggil balik) atau penyediaan
    // args melontar, kunci MESTI tetap dibebaskan di sini — jika tidak,
    // kunci tersekat selama-lamanya (sehingga proses companion dimulakan
    // semula) kerana panggil balik yang membebaskannya tidak akan dipanggil.
    try {
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
          bebaskan();
          selesai({ kod: err && typeof err.code === 'number' ? err.code : (err ? 1 : 0), stdout: teks, stderr: String(stderr || ''), hasil });
        });
      // Tulis payload ke STDIN, tetapi jangan sekali-kali membiarkan EPIPE
      // (proses anak keluar lebih awal) menjatuhkan pelayan companion.
      anak.stdin.on('error', () => {});
      try {
        anak.stdin.end(JSON.stringify(buangIc(job)));
      } catch {
        // Penyirian payload gagal SELEPAS anak sudah dilancarkan — anak sudah
        // wujud dan panggil balik execFile di atas akan membebaskan kunci,
        // tetapi anak akan menunggu STDIN yang tidak pernah tiba. Bunuh anak
        // SEGERA (mencetuskan panggil balik dengan ralat) supaya kunci tidak
        // tersekat sehingga had masa 15 minit.
        try { anak.kill(); } catch { /* anak mungkin sudah keluar */ }
      }
    } catch (ralatSync) {
      // execFile()/penyediaan args melontar sebelum sempat mendaftar
      // panggil balik — TIADA proses anak dilancarkan. Bebaskan kunci di sini
      // (satu-satunya laluan) dan laporkan 'gagal' teknikal biasa (BUKAN
      // 'langkau'/pastiTiadaSpawn) supaya tugasan ini tidak diam-diam
      // dianggap layak cuba semula automatik tanpa pemeriksaan kelayakan biasa.
      bebaskan();
      selesai({
        kod: 1, stdout: '', stderr: String((ralatSync && ralatSync.stack) || ralatSync),
        hasil: { status: 'gagal', sebab: 'Ralat runner (pelancaran proses anak gagal): ' + ((ralatSync && ralatSync.message) || String(ralatSync)), kod: 1 }
      });
    }
  });
}

// Jalankan satu skrip anak (uji-login.mjs / log-masuk-manual.mjs) dan
// huraikan baris terakhir 'HASIL:' sebagai JSON. Ralat proses anak (kod
// keluar bukan 0 TANPA baris HASIL) dilontar sebagai Error supaya pemanggil
// (endpoint HTTP) memulangkan ralat yang jelas, bukan diam-diam gagal.
function jalankanAnakSkrip(skripRelatif, args, timeoutMs) {
  // Kunci eksklusif pelayar: jika tugasan (push.mjs) sedang memegang profil
  // Edge, siasatan/login mesti dilangkau, bukan melancarkan pelayar kedua.
  // Ralat ditanda `langkau` supaya penjaga sesi dapat membezakan "dilangkau
  // kerana sibuk" daripada kegagalan sebenar.
  const kunci = kunciPelayar.cubaKunci('siasatan:' + skripRelatif);
  if (!kunci.boleh) {
    const ralat = new Error('Profil Edge sedang digunakan oleh ' + kunci.pemegang + '; cuba sebentar lagi.');
    ralat.langkau = true;
    return Promise.reject(ralat);
  }
  return new Promise((selesai, tolak) => {
    const bebaskan = () => kunciPelayar.lepaskan(kunci.pemegang);
    // Sama seperti jalankanTugasanAnak: bungkus pelancaran supaya lontaran
    // SEGERA daripada execFile() (tiada proses anak dilancarkan) tidak
    // meninggalkan kunci pelayar tersekat selama-lamanya.
    try {
      const semuaArgs = [path.join(HERE, skripRelatif), ...args];
      execFile(process.execPath, semuaArgs, { timeout: timeoutMs || 60000, maxBuffer: 8 * 1024 * 1024 },
        (err, stdout, stderr) => {
          const teks = String(stdout || '');
          const barisHasilTeks = teks.trim().split('\n').filter((l) => l.startsWith('HASIL:')).pop();
          let hasil = null;
          try { hasil = barisHasilTeks ? JSON.parse(barisHasilTeks.slice('HASIL:'.length)) : null; } catch { hasil = null; }
          if (!hasil) {
            bebaskan();
            tolak(new Error('Tiada penanda HASIL daripada ' + skripRelatif + (stderr ? ': ' + String(stderr).slice(0, 300) : '')));
            return;
          }
          bebaskan();
          selesai(hasil);
        });
    } catch (ralatSync) {
      bebaskan();
      tolak(new Error('Ralat pelancaran ' + skripRelatif + ': ' + ((ralatSync && ralatSync.message) || String(ralatSync))));
    }
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
  const statusLoginAuto = buatStatusLoginAuto();

  let cubaLoginAutoKerja = async () => ({ diminta: false, cuba: false, sebab: 'Belum tersedia (pelayan belum siap).' });

  // Tetingkap 'segar' untuk keputusan sesi MASA-KERJA (kitaran giliran). Sesi
  // idMe SSO diperhatikan luput dalam ~10 minit, jadi keputusan cache 'sesi
  // sah' yang lebih tua daripada ini TIDAK lagi dipercayai untuk keputusan
  // masa-kitaran, dan cache disegarkan melalui siasatan uji-login baca-sahaja
  // (tiada kredensial ditaip) pada selang ini — paling banyak satu setiap
  // selang dan hanya semasa giliran aktif. Pilihan 10 minit: padan dengan
  // kadar luput yang diperhatikan, jadi keputusan kitaran tidak lapuk >~10
  // minit tanpa churn pelayar setiap-poll.
  const TTL_SEGAR_SESI_MS = 10 * 60 * 1000;

  const giliran = buatGiliran({
    klien: buatKlienDaripadaTetapan(tetapanApi, simpananApi),
    pemilik: pemilikEnjin,
    log,
    jalankanTugasanAnak,
    cubaLoginAutoKerja: (opsyen) => cubaLoginAutoKerja(opsyen),
    segarkanSesiCache,
    jedaSegarSesiMs: TTL_SEGAR_SESI_MS,
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
    // Tiada pastikanProfilBebas() di sini dengan sengaja: log masuk automatik
    // hanya PERNAH dipicu pada tiga titik yang profil Edge sudah pasti bebas
    // (tiada proses anak lain memegangnya) — startup (sebelum giliran wujud),
    // job-time kitaran (sebelum state.sedangProses ditetapkan) dan job-time
    // percubaan semula (selepas proses anak push.mjs sudah keluar). Endpoint
    // uji-login/log-masuk-manual manual kekal dengan pengawal pastikanProfilBebas
    // sendiri kerana ia boleh dipicu bila-bila masa oleh admin.
    const hasil = await jalankanAnakSkrip('login-auto.mjs', ['--data-dir', dirData], 5 * 60 * 1000);
    if (hasil && (hasil.status === 'sesi-sah' || hasil.sesiSah === true)) {
      tulisStatusSesi({ status: 'sesi-sah', hos: 'moeispel.moe.gov.my', bukti: ['login-auto'] });
    }
    return hasil;
  }

  // Had kadar log masuk automatik: 2 cubaan per PROSES (perlindungan kunci
  // akaun idMe). Ini ialah had asal yang diluluskan — kaunter dalam ingatan,
  // ditetapkan semula pada setiap restart proses. (Modul `had-login.mjs` yang
  // menawarkan siling PERSISTEN merentas restart kekal TERSEDIA tetapi TIDAK
  // disambungkan dalam pengeluaran: ia mengubah rejim kadar yang pemilik belum
  // luluskan. Ia hanya diuji sebagai modul bebas.)
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

  // Job-time: semakan CACHE SAHAJA (tiada Edge dilancarkan) — berbeza daripada
  // sesiStartupDisahkan() yang boleh memicu uji-login sebenar. Semakan kitaran
  // dipanggil pada setiap kitaran giliran; ia mesti murah dan tidak pernah
  // membuka pelayar sendiri (cubaSekaliLogin/pengurusLoginAuto sahaja yang
  // membuka Edge, dan itu pun hanya apabila sesi tidak sah menurut cache).
  async function sesiKerjaDisahkan() {
    const c = bacaStatusSesi();
    if (c && Date.now() - c.masa < TTL_SESI_MS && c.sesiAda === true) {
      return { ada: true, sebab: 'Sesi idMe sah menurut cache tempatan.' };
    }
    return { ada: false, sebab: 'Sesi idMe tidak sah/tidak diketahui menurut cache; log masuk automatik akan cuba memulihkan.' };
  }

  // Segaran cache sesi baca-sahaja (uji-login sebenar, TIADA kredensial
  // ditaip). Dipanggil oleh giliran pada selang bersempadan (TTL_SEGAR_SESI_MS)
  // supaya keputusan masa-kitaran tidak kekal lapuk; hasil ditulis ke cache
  // oleh jalankanUjiLoginSebenar (tulisStatusSesi). Best-effort: kegagalan
  // teknikal tidak menggagalkan tindakan utama.
  async function segarkanSesiCache() {
    try { return await jalankanUjiLoginSebenar(); } catch { return null; }
  }

  // Penjaga sesi idMe/MOEIS (keep-alive bersempadan). Semasa giliran aktif, sesi
  // SSO diperhatikan luput selepas ~15-20 minit tidak aktif; penjaga menyentuh
  // sesi MOEIS secara berkala (siasatan baca-sahaja, TIADA kredensial) pada
  // selang JEDA_JAGA_SESI_MS (5 minit) supaya sesi tidak mati di tengah giliran.
  // Poke penjaga sesi: sama seperti uji-login sebenar, tetapi memetakan ralat
  // "langkau" (profil Edge sedang digunakan oleh tugasan) kepada status
  // `langkau` dan bukannya melontar — supaya penjaga merekod "dilangkau" dan
  // bukannya "gagal". Kunci pelayar di dalam jalankanAnakSkrip kekal sebagai
  // pengawal sebenar (atomik); peta di sini hanyalah untuk pelaporan jujur.
  async function pokePenjagaSesi() {
    try {
      return await jalankanUjiLoginSebenar();
    } catch (ralat) {
      if (ralat && ralat.langkau) return { status: 'langkau', sebab: ralat.message };
      throw ralat;
    }
  }

  // BERSEMPADAN: hanya poke semasa giliran aktif DAN suis jagaSesi HIDUP,
  // dilangkau semasa tugasan diproses (profil Edge digunakan), tiada
  // pertindihan, lantai selang keras.
  const penjagaSesi = buatPenjagaSesi({
    aktif: () => tetapanApi.baca().jagaSesi === true && giliran.status().aktif,
    sedangProses: () => giliran.status().sedangProses,
    // Siasatan sebenar (baca-sahaja) — juga menyegar cache sesi. Melontar pada
    // kegagalan sebenar supaya penjaga boleh merekod poke-ok vs poke-gagal
    // dengan jujur; ralat `langkau` dipetakan kepada status `langkau`.
    poke: pokePenjagaSesi,
    sekarangMs: () => Date.now(),
    jedaMs: JEDA_JAGA_SESI_MS,
    tulisLog: (jenis, mesej) => log.tulis(`${jenis}: ${mesej}`)
  });

  cubaLoginAutoKerja = (opsyen) => cubaLoginAutoKerjaTerpandu({
    paksa: !!(opsyen && opsyen.paksa),
    bacaTetapan: tetapanApi.baca,
    adaKredensial: () => storeKredensial.ada(),
    sesiDisahkan: sesiKerjaDisahkan,
    cubaSekaliLogin: () => pengurusLoginAuto.cubaAuto(),
    tulisLog: (jenis, status, sebab) => log.tulis(`${jenis}: ${status}: ${sebab}`),
    status: statusLoginAuto,
    bilCubaan: () => pengurusLoginAuto.bilCubaan()
  });

  const konteks = {
    port: t0.port, nonceLokal, pasangan, tetapan: tetapanApi, simpanan: simpananApi,
    kredensial: storeKredensial,
    giliran, log, versi: '1.0.0', pcNama: os.hostname(),
    halamanLokalHtml, halamanLokalJs,
    sekarangMs: () => Date.now(),
    autoMulaStatus,
    keupayaanLogMasuk: keupayaanLogMasuk(),
    autostart: pengurusAutostart,
    loginAutoStatus: () => snapshotLoginAutoStatus(statusLoginAuto, {
      bacaTetapan: tetapanApi.baca,
      adaKredensial: () => storeKredensial.ada(),
      bilCubaan: () => pengurusLoginAuto.bilCubaan()
    }),
    jagaSesi: () => ({ ...penjagaSesi.status(), didayakan: tetapanApi.baca().jagaSesi === true }),
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
      // 0) Penjaga sesi idMe/MOEIS (keep-alive bersempadan). Dimulakan selepas
      //    bind; ia hanya menyentuh sesi apabila giliran AKTIF (tinjau sendiri
      //    `giliran.status().aktif`), jadi ia no-op sehingga giliran dimulakan.
      penjagaSesi.mula();
      // 1) Log masuk idMe automatik opt-in (maks 1 cubaan startup), SEBELUM
      //    auto-mula giliran dinilai — supaya giliran auto melihat sesi baharu
      //    jika log masuk automatik berjaya. loginAuto lalai MATI = tiada kesan.
      const loginAuto = await cubaLoginAutoStartup({
        bacaTetapan: tetapanApi.baca,
        adaKredensial: () => storeKredensial.ada(),
        sesiDisahkan: sesiStartupDisahkan,
        cubaSekaliLogin: () => pengurusLoginAuto.cubaAuto(),
        tulisLog: (jenis, status, sebab) => log.tulis(`${jenis}: ${status}: ${sebab}`),
        status: statusLoginAuto,
        bilCubaan: () => pengurusLoginAuto.bilCubaan()
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
      if (!hasil.bermula) {
        console.error('Auto-mula giliran tidak bermula:', hasil.sebab);
        // 3) Pemulihan bounded: jika suis auto-mula masih ON tetapi startup
        //    gagal (cth sesi idMe tidak sah semasa bind), pasang gelung
        //    pemulihan supaya giliran boleh bermula kemudian TANPA melonggarkan
        //    sebarang pengawal — setiap kitaran menilai semula SEMUA pengawal
        //    (kalendar/hujung minggu/umur tugasan/sempadan aktivasi) daripada
        //    awal melalui cubaAutoMula yang sama. Guna sesiKerjaDisahkan
        //    (cache-sahaja) supaya gelung ini sendiri tidak melancarkan Edge —
        //    satu-satunya tindakan pelayar di sini ialah cubaLoginAutoKerja
        //    job-time (terikat had 2 cubaan sedia ada).
        if (tetapanApi.baca().autoMulaGiliran === true) {
          const pemulihan = pasangPemulihanAutoMula({
            bacaTetapan: tetapanApi.baca,
            giliranAktif: () => giliran.status().aktif,
            bolehHariIni: () => bolehHariSekolah({ tetapan: tetapanApi.baca(), sekarangMs: Date.now() }),
            cubaLoginAutoKerja: () => cubaLoginAutoKerja(),
            cubaAutoMula: async () => {
              const hasilPemulihan = await cubaAutoMula({
                bacaTetapan: tetapanApi.baca,
                sekarangMs: () => Date.now(),
                sempadanProsesMs,
                adaRahsiaEnjin: simpananApi.adaRahsiaEnjin,
                klaimDisokong: () => konteks.klaimDisokong({ segarkan: true }),
                sesiDisahkan: sesiKerjaDisahkan,
                mulakanGiliran: giliran.mulakan,
                tulisLog: (jenis, mesej) => log.tulis(`${jenis}: ${mesej}`)
              });
              Object.assign(autoMulaStatus, hasilPemulihan);
              return hasilPemulihan;
            },
            tulisLog: (jenis, mesej) => log.tulis(`${jenis}: ${mesej}`)
          });
          pemulihan.mula();
        }
      }
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

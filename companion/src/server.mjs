// Pelayan HTTP loopback (companion/src/server.mjs).
//
// Keselamatan (WAJIB tepat, lihat brief bahagian 3.3):
//   - Hanya 127.0.0.1 (bin/hadir-companion.mjs yang memanggil server.listen).
//   - Host check: Host mesti 127.0.0.1:<port> atau localhost:<port>.
//   - Origin allowlist tepat, tiada wildcard, tiada padanan awalan.
//   - CORS hanya dipantulkan bagi Origin yang sepadan tepat; permintaan Origin
//     tidak dibenarkan -> 403 TANPA header CORS (fail closed).
//   - Permintaan tanpa Origin dibenarkan hanya dengan nonce UI tempatan sah
//     atau token klien sah.
//   - Auth Bearer dengan timingSafeEqual (di dalam pasangan.mjs) + had kadar.
//   - Badan maks 32 KB, JSON sahaja untuk POST.
//   - Tiada endpoint arahan sewenang-wenangnya: tiada exec/nama fail/URL dari klien.
import crypto from 'node:crypto';
import http from 'node:http';
import { hostSah, originDibenarkan, tetapkanHeaderCorsPenuh, tetapkanHeaderPreflight } from './cors.mjs';
import {
  adaMedanRahsiaDilarang, tapisTetapanDibenarkan, tapisTetapanLokalDibenarkan,
  sahkanApiUrl, sahkanKalendarSekolah
} from './tetapan.mjs';
import { ringkasanKalendar } from './auto-mula.mjs';

// Medan tetapan yang hanya boleh diubah pada PC itu sendiri (fail tetapan.json
// atau UI tempatan dengan nonce). Klien jauh yang mencubanya ditolak dengan
// mesej jelas — bukan diabaikan secara senyap.
const MEDAN_LOKAL_SAHAJA = [
  'originDibenarkan', 'apiUrl', 'kunciKeselamatanDijangka',
  'autoMulaGiliran', 'kalendarSekolah', 'autoMulaDiaktifkanPada', 'autostart', 'loginAuto',
  'benarkanTerusTanpaFrasa', 'jagaSesi', 'hadKadarLogin'
];

const HAD_BADAN_BYTES = 32 * 1024;
const HAD_GAGAL_AUTH = 10;
const TETINGKAP_GAGAL_AUTH_MS = 5 * 60 * 1000;

export function buatNonceLokal() {
  return crypto.randomBytes(24).toString('hex');
}

// GET halaman: nonce diterima melalui header X-HADIR-Lokal ATAU parameter
// query ?n= (pelayar tidak boleh menghantar header tersuai pada navigasi
// <script src> / permintaan alamat terus, jadi ?n= diperlukan untuk memuatkan
// UI buat kali pertama). Halaman itu sendiri membuang query daripada
// location/history sebaik sahaja dimuatkan — lihat src/ui/render.mjs.
const LALUAN_LOKAL_HALAMAN = new Set(['/', '/lokal.js']);

// Laluan API tempatan yang MENGUBAH KEADAAN atau mendedahkan status: header
// X-HADIR-Lokal SAHAJA. Parameter query TIDAK PERNAH diterima di sini —
// query string boleh tersimpan dalam log pelayan proksi/sejarah pelayar,
// jadi laluan yang menulis/mendedahkan mesti melalui header sahaja.
const LALUAN_LOKAL_API = new Set([
  '/api/lokal/rahsia', '/api/lokal/kod-pasangan', '/api/lokal/log-masuk-manual',
  '/api/lokal/autostart', '/api/lokal/keluar', '/api/lokal/tetapan',
  '/api/lokal/status', '/api/lokal/uji-login',
  '/api/lokal/kredensial', '/api/lokal/kredensial-padam'
]);

function bacaBadan(req) {
  return new Promise((selesai, gagal) => {
    let jumlah = 0;
    const bahagian = [];
    req.on('data', (c) => {
      jumlah += c.length;
      if (jumlah > HAD_BADAN_BYTES) {
        gagal(Object.assign(new Error('Badan permintaan terlalu besar.'), { kod: 413 }));
        req.destroy();
        return;
      }
      bahagian.push(c);
    });
    req.on('end', () => selesai(Buffer.concat(bahagian)));
    req.on('error', gagal);
  });
}

function hantarJson(res, status, obj, headerTambahan) {
  const teks = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headerTambahan });
  res.end(teks);
}

export function buatPelayanHttp(konteks) {
  const { port, nonceLokal, pasangan, tetapan, simpanan, kredensial, giliran, log, versi, pcNama } = konteks;
  // Had kadar DIPISAHKAN mengikut jenis kelayakan (penemuan semakan bebas):
  // satu kaunter global membenarkan gelung kegagalan token menyekat pasangan
  // (lockout silang). Setiap baldi mempunyai tetingkap gelongsor sendiri.
  const kegagalanAuth = new Map(); // baldi -> cap masa kegagalan

  function dibenarkanKadarAuth(baldi) {
    const kunci = String(baldi || 'token');
    const senarai = kegagalanAuth.get(kunci) || [];
    const sekarang = Date.now();
    while (senarai.length && sekarang - senarai[0] > TETINGKAP_GAGAL_AUTH_MS) senarai.shift();
    kegagalanAuth.set(kunci, senarai);
    return senarai.length < HAD_GAGAL_AUTH;
  }
  function catatGagalAuth(baldi) {
    const kunci = String(baldi || 'token');
    const senarai = kegagalanAuth.get(kunci) || [];
    senarai.push(Date.now());
    kegagalanAuth.set(kunci, senarai);
  }

  function originDibenarkanSenarai() {
    return tetapan.baca().originDibenarkan;
  }

  async function sahkanAdmin(req) {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return null;
    return pasangan.sahkanToken(token);
  }

async function pengendali(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const laluan = url.pathname;

    // Jejak diagnostik: sesetengah pelayar menghalang halaman awam daripada
    // membuka 127.0.0.1, jadi kita perlu tahu sama ada permintaan itu sampai
    // ke sini langsung (baris ini menjawab "pelayar sekat" vs "companion tolak").
    // Hanya halaman dijejak; panggilan /api/* (giliran/heartbeat) terlalu kerap.
    if (!laluan.startsWith('/api/')) {
      console.log(
        '[req]', new Date().toISOString(), req.method, laluan,
        'origin=' + (req.headers.origin || '-'),
        'referer=' + (req.headers.referer || '-'),
        'sec-fetch-site=' + (req.headers['sec-fetch-site'] || '-')
      );
    }

    if (!hostSah(req.headers.host, port)) {
      res.writeHead(403); res.end(); return;
    }

    const origin = req.headers.origin || '';
    const senaraiOrigin = originDibenarkanSenarai();
    const originOk = origin ? originDibenarkan(origin, senaraiOrigin) : false;
    // Halaman "Tetapan Companion" dihidangkan dari origin loopback ini sendiri,
    // dan pelayar menghantar Origin itu pada setiap POST serta preflight yang
    // dicetuskan oleh header X-HADIR-Lokal. Origin ini dibenarkan HANYA untuk
    // laluan /api/lokal/* yang masih mewajibkan nonce sah (LALUAN_LOKAL_API).
    // Laluan lain dengan origin loopback kekal ditolak seperti origin asing.
    const originLokalUI =
      !!origin && (origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`);
    const laluanLokal = LALUAN_LOKAL_API.has(laluan);
    const originDiterima = originOk || (originLokalUI && laluanLokal);

    if (req.method === 'OPTIONS') {
      if (originDiterima) {
        tetapkanHeaderPreflight(res, origin);
        res.writeHead(204); res.end();
      } else {
        res.writeHead(403); res.end();
      }
      return;
    }

    if (origin && !originDiterima) {
      res.writeHead(403); res.end(JSON.stringify({ ok: false, ralat: 'Origin tidak dibenarkan.' })); return;
    }
    if (origin && originDiterima) tetapkanHeaderCorsPenuh(res, origin);

    function nonceCocok(diberi) {
      const s = String(diberi || '');
      return s.length === nonceLokal.length && s.length > 0 &&
        crypto.timingSafeEqual(Buffer.from(s), Buffer.from(nonceLokal));
    }
    const nonceHeader = req.headers['x-hadir-lokal'];
    const nonceSahHeader = nonceCocok(nonceHeader);

    if (LALUAN_LOKAL_HALAMAN.has(laluan)) {
      const nonceQuery = url.searchParams.get('n');
      if (!nonceSahHeader && !nonceCocok(nonceQuery)) {
        // Butang "Buka tetapan tempatan" dalam HADIR Admin membuka "/" TANPA
        // nonce, dan pelayar memaparkan "Access to 127.0.0.1 was denied".
        //
        // Bukti sebenar (log [req] companion, 18 Sep 2026): permintaan sampai
        // ke sini dengan `referer=-` — pelayar MEMBUANG Referer apabila halaman
        // HTTPS menuju ke HTTP (downgrade). Jadi apa-apa semakan berasaskan
        // Referer tidak boleh berfungsi, dan butang itu akan sentiasa gagal.
        //
        // Penyelesaian: alihkan "/" ke URL bernonce untuk SEMUA navigasi tanpa
        // nonce. Ini tidak melemahkan perlindungan kerana:
        //   - halaman pembuka (cth. laman asing) TIDAK boleh membaca URL atau
        //     kandungan tetingkap 127.0.0.1 (asal berbeza) — nonce tidak bocor;
        //   - semua panggilan /api/lokal/* masih WAJIB membawa header
        //     X-HADIR-Lokal bernonce (tidak boleh dipalsukan halaman web);
        //   - halaman UI dihidangkan dengan X-Frame-Options/CSP anti-iframe
        //     supaya ia tidak boleh dibingkaikan untuk clickjacking.
        // no-store WAJIB: tanpanya pelayar menyimpan 302/403 dan memaparkan
        // semula tanpa meminta kepada companion ("masih access denied").
        if (laluan === '/' && req.method === 'GET') {
          res.writeHead(302, {
            Location: '/?n=' + encodeURIComponent(nonceLokal),
            'Cache-Control': 'no-store'
          });
          res.end();
          return;
        }
        res.writeHead(403, { 'Cache-Control': 'no-store' });
        res.end();
        return;
      }
      return layanLokalHalaman(req, res, laluan);
    }

    if (LALUAN_LOKAL_API.has(laluan)) {
      // Header sahaja — lihat nota LALUAN_LOKAL_API di atas.
      if (!nonceSahHeader) { res.writeHead(403); res.end(); return; }
      return layanLokal(req, res, laluan);
    }

    if (!origin) {
      const klienSah = !nonceSahHeader ? await sahkanAdmin(req) : null;
      if (!nonceSahHeader && !klienSah) { res.writeHead(403); res.end(); return; }
    }

    return layanUtama(req, res, laluan, url);
  }

  function layanLokalHalaman(req, res, laluan) {
    const teks = laluan === '/' ? konteks.halamanLokalHtml() : konteks.halamanLokalJs();
    const jenis = laluan === '/' ? 'text/html; charset=utf-8' : 'application/javascript; charset=utf-8';
    // Halaman ini boleh dicapai melalui alihan 302 daripada "/" (lihat nota di
    // pengendali), jadi ia MESTI tidak boleh dibingkaikan (clickjacking) dan
    // tidak boleh dicache (URL bernonce tidak boleh bertakung dalam cache).
    res.writeHead(200, {
      'Content-Type': jenis,
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "frame-ancestors 'none'"
    });
    res.end(teks);
  }

  async function layanLokal(req, res, laluan) {
    if (req.method !== 'POST' && req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    let payload = {};
    if (req.method === 'POST') {
      const badan = await bacaBadan(req).catch((e) => { hantarJson(res, e.kod || 400, { ok: false, ralat: e.message }); return null; });
      if (badan === null) return;
      try { payload = badan.length ? JSON.parse(badan.toString('utf8')) : {}; }
      catch { hantarJson(res, 400, { ok: false, ralat: 'JSON tidak sah.' }); return; }
    }
    try {
      if (laluan === '/api/lokal/kredensial') {
        if (req.method === 'GET') {
          const st = kredensial ? kredensial.status() : { ada: false, rosak: false, pengguna: '', kunciAda: false };
          hantarJson(res, 200, { ok: true, ...st, loginAuto: tetapan.baca().loginAuto === true });
          return;
        }
        // POST set: nilai diterima, TIDAK PERNAH dipulangkan/digemakan.
        try {
          kredensial.simpan({
            idMePengguna: payload.idMePengguna,
            idMeKataLaluan: payload.idMeKataLaluan,
            idMeKunciKeselamatan: payload.idMeKunciKeselamatan
          });
        } catch (ralat) {
          hantarJson(res, 400, { ok: false, ralat: ralat.message });
          return;
        }
        hantarJson(res, 200, { ok: true, ...kredensial.status() });
        return;
      }
      if (laluan === '/api/lokal/kredensial-padam') {
        kredensial.padam();
        hantarJson(res, 200, { ok: true, ada: false, pengguna: '', kunciAda: false });
        return;
      }
      if (laluan === '/api/lokal/rahsia') {
        if (req.method === 'GET') { hantarJson(res, 200, { ok: true, ada: simpanan.adaRahsiaEnjin() }); return; }
        simpanan.simpanRahsiaEnjin(String(payload.rahsiaEnjin || ''));
        hantarJson(res, 200, { ok: true, ada: true });
        return;
      }
      if (laluan === '/api/lokal/kod-pasangan') {
        hantarJson(res, 200, { ok: true, kod: pasangan.janaKodPasangan() });
        return;
      }
      if (laluan === '/api/lokal/log-masuk-manual') {
        const hasil = await konteks.logMasukManual();
        hantarJson(res, 200, { ok: true, hasil });
        return;
      }
      if (laluan === '/api/lokal/uji-login') {
        const hasil = await konteks.ujiLogin();
        hantarJson(res, 200, { ok: true, ...hasil });
        return;
      }
      if (laluan === '/api/lokal/tetapan') {
        if (adaMedanRahsiaDilarang(payload)) { hantarJson(res, 400, { ok: false, ralat: 'Medan rahsia tidak dibenarkan pada endpoint ini.' }); return; }
        if (Object.prototype.hasOwnProperty.call(payload, 'originDibenarkan')) {
          hantarJson(res, 400, { ok: false, ralat: 'originDibenarkan hanya boleh diubah dengan menyunting tetapan.json pada PC ini.' });
          return;
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'apiUrl')) {
          const sahUrl = sahkanApiUrl(payload.apiUrl);
          if (!sahUrl.ok) { hantarJson(res, 400, { ok: false, ralat: sahUrl.sebab }); return; }
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'kalendarSekolah')) {
          const kalendar = sahkanKalendarSekolah(payload.kalendarSekolah);
          if (!Array.isArray(payload.kalendarSekolah) ||
              (payload.kalendarSekolah.length && !kalendar.length)) {
            hantarJson(res, 400, { ok: false, ralat: 'kalendarSekolah mesti senarai tarikh tepat YYYY-MM-DD yang sah.' });
            return;
          }
        }
        const sebelum = tetapan.baca();
        const patch = tapisTetapanLokalDibenarkan(payload);
        if (Object.prototype.hasOwnProperty.call(patch, 'autoMulaGiliran')) {
          patch.autoMulaGiliran = patch.autoMulaGiliran === true;
          if (patch.autoMulaGiliran && sebelum.autoMulaGiliran !== true) {
            const kini = typeof konteks.sekarangMs === 'function' ? konteks.sekarangMs() : Date.now();
            patch.autoMulaDiaktifkanPada = new Date(kini).toISOString();
          }
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'kalendarSekolah')) {
          patch.kalendarSekolah = sahkanKalendarSekolah(patch.kalendarSekolah);
        }
        tetapan.tulis(patch);
        if (Object.prototype.hasOwnProperty.call(patch, 'autoMulaGiliran')) {
          if (patch.autoMulaGiliran === false) {
            if (giliran.status().modMula === 'auto') giliran.hentikan();
            Object.assign(konteks.autoMulaStatus, {
              diminta: false,
              bermula: false,
              sebab: 'Auto-mula dimatikan pada UI tempatan; giliran auto dihentikan sehingga diminta atau proses dimulakan semula mengikut tetapan.'
            });
          } else if (sebelum.autoMulaGiliran !== true) {
            Object.assign(konteks.autoMulaStatus, {
              diminta: true,
              bermula: false,
              sebab: 'Opt-in disimpan. Auto-mula hanya dinilai selepas restart; giliran kekal MATI sehingga diminta atau proses dimulakan semula.'
            });
          }
        }
        hantarJson(res, 200, { ok: true, tetapan: tetapan.baca() });
        return;
      }
      if (laluan === '/api/lokal/status') {
        const klaimDisokong = await konteks.klaimDisokong();
        const t = tetapan.baca();
        const kini = typeof konteks.sekarangMs === 'function' ? konteks.sekarangMs() : Date.now();
        hantarJson(res, 200, {
          ok: true, versi, pc: pcNama,
          giliran: { ...giliran.status(), klaimDisokong },
          moeis: await konteks.statusSesiMoeis(),
          rahsiaEnjinAda: simpanan.adaRahsiaEnjin(),
          autostart: konteks.autostart.status(),
          autoMula: konteks.autoMulaStatus || { diminta: t.autoMulaGiliran === true, bermula: false, sebab: 'Belum dinilai.' },
          keupayaanLogMasuk: konteks.keupayaanLogMasuk,
          kredensial: kredensial ? kredensial.status() : { ada: false, rosak: false, pengguna: '', kunciAda: false },
          kalendar: ringkasanKalendar(t, kini),
          tetapan: {
            autoMulaGiliran: t.autoMulaGiliran === true,
            loginAuto: t.loginAuto === true,
            benarkanTerusTanpaFrasa: t.benarkanTerusTanpaFrasa === true,
            jagaSesi: t.jagaSesi === true,
            hadKadarLogin: t.hadKadarLogin === true,
            kalendarSekolah: t.kalendarSekolah || []
          },
          loginAutoStatus: (typeof konteks.loginAutoStatus === 'function'
            ? konteks.loginAutoStatus()
            : { diminta: t.loginAuto === true, adaKredensial: kredensial ? kredensial.ada() === true : false, sesiSah: null, percubaan: 0, had: 2, hasilTerakhir: '', sebab: 'Belum dinilai.' }),
          jagaSesi: (typeof konteks.jagaSesi === 'function' ? konteks.jagaSesi() : null),
          hadKadarLoginStatus: (typeof konteks.hadKadarLoginStatus === 'function' ? konteks.hadKadarLoginStatus() : null)
        });
        return;
      }
      if (laluan === '/api/lokal/autostart') {
        const statusAutostart = konteks.autostart.tetapkan(payload.aktif === true);
        hantarJson(res, 200, { ok: true, autostart: statusAutostart });
        return;
      }
      if (laluan === '/api/lokal/keluar') {
        hantarJson(res, 200, { ok: true });
        setTimeout(() => process.exit(0), 50);
        return;
      }
      res.writeHead(404); res.end();
    } catch (ralat) {
      hantarJson(res, 500, { ok: false, ralat: ralat.message });
    }
  }

  async function layanUtama(req, res, laluan, url) {
    if (laluan === '/api/pair' && req.method === 'POST') {
      if (!dibenarkanKadarAuth('pair')) { hantarJson(res, 429, { ok: false, ralat: 'Terlalu banyak percubaan pasangan.' }); return; }
      const badan = await bacaBadan(req).catch((e) => { hantarJson(res, e.kod || 400, { ok: false, ralat: e.message }); return null; });
      if (badan === null) return;
      let payload;
      try { payload = badan.length ? JSON.parse(badan.toString('utf8')) : {}; }
      catch { hantarJson(res, 400, { ok: false, ralat: 'JSON tidak sah.' }); return; }
      try {
        const token = pasangan.pasang(payload.kod, payload.label);
        hantarJson(res, 200, { ok: true, token, companion: { versi, pc: pcNama, port }, origin: req.headers.origin || '' });
      } catch (ralat) {
        catatGagalAuth('pair');
        hantarJson(res, 401, { ok: false, ralat: ralat.message });
      }
      return;
    }

    // Selebihnya semua endpoint admin: perlukan token Bearer sah.
    if (!dibenarkanKadarAuth('token')) { hantarJson(res, 429, { ok: false, ralat: 'Terlalu banyak percubaan token.' }); return; }
    const klien = await sahkanAdmin(req);
    if (!klien) {
      catatGagalAuth('token');
      hantarJson(res, 401, { ok: false, ralat: 'Token tidak sah.' });
      return;
    }

    let payload = {};
    if (req.method === 'POST') {
      const ct = String(req.headers['content-type'] || '');
      if (!ct.includes('application/json')) { hantarJson(res, 400, { ok: false, ralat: 'Content-Type mesti application/json.' }); return; }
      const badan = await bacaBadan(req).catch((e) => { hantarJson(res, e.kod || 400, { ok: false, ralat: e.message }); return null; });
      if (badan === null) return;
      try { payload = badan.length ? JSON.parse(badan.toString('utf8')) : {}; }
      catch { hantarJson(res, 400, { ok: false, ralat: 'JSON tidak sah.' }); return; }
    }

    try {
      if (laluan === '/api/status' && req.method === 'GET') {
        const klaimDisokong = await konteks.klaimDisokong();
        const t = tetapan.baca();
        const kini = typeof konteks.sekarangMs === 'function' ? konteks.sekarangMs() : Date.now();
        hantarJson(res, 200, {
          ok: true,
          versi, pc: pcNama,
          adaRahsiaEnjin: simpanan.adaRahsiaEnjin(),
          giliran: { ...giliran.status(), klaimDisokong },
          pasangan: pasangan.senaraiKlien(),
          moeis: await konteks.statusSesiMoeis(),
          autoMula: konteks.autoMulaStatus || { diminta: t.autoMulaGiliran === true, bermula: false, sebab: 'Belum dinilai.' },
          loginAuto: t.loginAuto === true,
          keupayaanLogMasuk: konteks.keupayaanLogMasuk,
          kredensial: { ada: kredensial ? kredensial.status().ada === true : false },
          kalendar: ringkasanKalendar(t, kini),
          log: log.bacaTerakhir(10),
          loginAutoStatus: (typeof konteks.loginAutoStatus === 'function'
            ? konteks.loginAutoStatus()
            : { diminta: t.loginAuto === true, adaKredensial: kredensial ? kredensial.ada() === true : false, sesiSah: null, percubaan: 0, had: 2, hasilTerakhir: '', sebab: 'Belum dinilai.' }),
          jagaSesi: (typeof konteks.jagaSesi === 'function' ? konteks.jagaSesi() : null)
        });
        return;
      }
      if (laluan === '/api/uji-sambungan' && req.method === 'POST') {
        hantarJson(res, 200, { ok: true, versi, masa: new Date().toISOString() });
        return;
      }
      if (laluan === '/api/uji-login' && req.method === 'POST') {
        const hasil = await konteks.ujiLogin();
        hantarJson(res, 200, { ok: true, ...hasil });
        return;
      }
      if (laluan === '/api/mula' && req.method === 'POST') {
        // Urutan penting: periksa rahsia enjin DAHULU. Tanpa rahsia, probe klaim
        // backend tidak bermakna (ia gagal atas sebab kelayakan, bukan kerana
        // kaedah tiada), jadi jangan sekali-kali tafsirkannya sebagai sokongan.
        if (!simpanan.adaRahsiaEnjin()) { hantarJson(res, 409, { ok: false, ralat: 'Rahsia enjin belum ditetapkan pada PC ini (UI tetapan tempatan).' }); return; }
        const klaimDisokong = await konteks.klaimDisokong({ segarkan: true });
        if (klaimDisokong !== true) {
          hantarJson(res, 409, {
            ok: false,
            ralat: klaimDisokong === false
              ? 'Backend HADIR belum dikemas kini (klaim atomik tiada).'
              : 'Sokongan klaim backend tidak dapat ditentukan (tiada sambungan/kelayakan). Giliran kekal MATI.'
          });
          return;
        }
        const sesiOk = await konteks.adaSesiMoeis();
        if (!sesiOk) { hantarJson(res, 409, { ok: false, ralat: 'Sesi idMe tiada; log masuk manual diperlukan.' }); return; }
        giliran.mulakan(tetapan.baca().intervalSaat);
        hantarJson(res, 200, { ok: true });
        return;
      }
      if (laluan === '/api/henti' && req.method === 'POST') {
        giliran.hentikan();
        hantarJson(res, 200, { ok: true });
        return;
      }
      if (laluan === '/api/kerja-jalan' && req.method === 'POST') {
        if (payload.sah !== true || !payload.id) { hantarJson(res, 400, { ok: false, ralat: 'Pengesahan diperlukan.' }); return; }
        if (!simpanan.adaRahsiaEnjin()) { hantarJson(res, 409, { ok: false, ralat: 'Rahsia enjin belum ditetapkan pada PC ini.' }); return; }
        const klaimDisokong = await konteks.klaimDisokong({ segarkan: true });
        if (klaimDisokong !== true) { hantarJson(res, 409, { ok: false, ralat: 'Klaim atomik backend tidak dapat disahkan; tiada apa dijalankan.' }); return; }
        const hasil = await konteks.kerjaJalan(payload.id).catch((ralat) => ({ diproses: 0, sebab: 'Ralat backend: ' + ralat.message }));
        hantarJson(res, 200, { ok: true, hasil });
        return;
      }
      if (laluan === '/api/kerja-sah' && req.method === 'POST') {
        // Pemulihan BACA SAHAJA bagi tugasan 'tersimpan': tidak pernah
        // menekan simpan/menghantar semula — lihat giliran.sahkanTugasan().
        if (payload.sah !== true || !payload.id) { hantarJson(res, 400, { ok: false, ralat: 'Pengesahan diperlukan.' }); return; }
        if (!simpanan.adaRahsiaEnjin()) { hantarJson(res, 409, { ok: false, ralat: 'Rahsia enjin belum ditetapkan pada PC ini.' }); return; }
        const klaimDisokong = await konteks.klaimDisokong({ segarkan: true });
        if (klaimDisokong !== true) { hantarJson(res, 409, { ok: false, ralat: 'Klaim atomik backend tidak dapat disahkan; tiada apa dijalankan.' }); return; }
        const hasil = await konteks.kerjaSah(payload.id).catch((ralat) => ({ diproses: 0, sebab: 'Ralat backend: ' + ralat.message }));
        hantarJson(res, 200, { ok: true, hasil });
        return;
      }
      if (laluan === '/api/kerja' && req.method === 'GET') {
        if (!simpanan.adaRahsiaEnjin()) { hantarJson(res, 200, { ok: true, senarai: [], nota: 'Rahsia enjin belum ditetapkan pada PC ini.' }); return; }
        const senarai = await konteks.kerjaSenaraiDisensor();
        hantarJson(res, 200, { ok: true, senarai });
        return;
      }
      if (laluan === '/api/tetapan' && req.method === 'POST') {
        if (adaMedanRahsiaDilarang(payload)) { hantarJson(res, 400, { ok: false, ralat: 'Medan rahsia tidak dibenarkan pada endpoint ini.' }); return; }
        const lokalSahaja = MEDAN_LOKAL_SAHAJA.filter((k) => Object.prototype.hasOwnProperty.call(payload, k));
        if (lokalSahaja.length) {
          hantarJson(res, 400, {
            ok: false,
            ralat: 'Medan berikut hanya boleh diubah pada PC companion: ' + lokalSahaja.join(', ')
          });
          return;
        }
        tetapan.tulis(tapisTetapanDibenarkan(payload));
        hantarJson(res, 200, { ok: true, tetapan: tetapan.baca() });
        return;
      }
      if (laluan === '/api/pasangan/batal' && req.method === 'POST') {
        if (payload.id) pasangan.batalSatu(payload.id); else pasangan.batalSemua();
        hantarJson(res, 200, { ok: true });
        return;
      }
      res.writeHead(404); res.end();
    } catch (ralat) {
      hantarJson(res, 500, { ok: false, ralat: ralat.message });
    }
  }

  return http.createServer((req, res) => {
    pengendali(req, res).catch((ralat) => {
      try { hantarJson(res, 500, { ok: false, ralat: ralat.message }); } catch { /* respons sudah dihantar */ }
    });
  });
}

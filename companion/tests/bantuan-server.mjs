// Bantuan ujian bersama: konteks pelayan minimum + pembantu permintaan HTTP
// mentah (supaya ujian boleh mengawal header Host secara eksplisit — sesuatu
// yang tidak boleh dilakukan dengan fetch() piawai). Port OS-diagihkan (0)
// digunakan supaya fail ujian yang berjalan selari (proses berasingan
// `node --test`) tidak berlanggar pada satu port tetap.
import http from 'node:http';
import { buatPelayanHttp, buatNonceLokal } from '../src/server.mjs';

export const TOKEN_SAH = 'token-ujian-sah-1234567890abcdef';
export const NONCE_UJIAN = buatNonceLokal();

export function konteksAsas(port, override) {
  const tetapanData = {
    port, apiUrl: 'https://contoh.invalid/exec', label: '', intervalSaat: 20,
    autostart: false, originDibenarkan: ['https://sepadan.github.io']
  };
  const asas = {
    port,
    nonceLokal: NONCE_UJIAN,
    versi: 'ujian-1.0.0',
    pcNama: 'PC-UJIAN',
    pasangan: {
      sahkanToken: (token) => (token === TOKEN_SAH ? { id: 'klien-1', label: 'Ujian' } : null),
      janaKodPasangan: () => 'ABCD1234',
      pasang: (kod) => { if (kod !== 'ABCD1234') throw new Error('Kod tidak sah.'); return TOKEN_SAH; },
      senaraiKlien: () => [{ id: 'klien-1', label: 'Ujian' }],
      batalSemua: () => {}, batalSatu: () => {}
    },
    tetapan: { baca: () => ({ ...tetapanData }), tulis: (patch) => Object.assign(tetapanData, patch) },
    simpanan: { adaRahsiaEnjin: () => true, simpanRahsiaEnjin: () => {}, dapatkanRahsiaEnjin: () => 'rahsia-ujian' },
    kredensial: {
      _kred: null,
      ada() { return !!this._kred; },
      status() {
        if (!this._kred) return { ada: false, rosak: false, pengguna: '', kunciAda: false };
        return { ada: true, rosak: false, pengguna: (this._kred.pengguna[0] || '') + '***', kunciAda: !!this._kred.kunciKeselamatan };
      },
      simpan({ idMePengguna, idMeKataLaluan, idMeKunciKeselamatan }) {
        if (!idMePengguna || !idMeKataLaluan || !idMeKunciKeselamatan) {
          throw new Error('Pengguna, kata laluan dan frasa kunci keselamatan idMe diperlukan.');
        }
        this._kred = { pengguna: idMePengguna, kataLaluan: idMeKataLaluan, kunciKeselamatan: idMeKunciKeselamatan };
      },
      padam() { this._kred = null; }
    },
    giliran: { status: () => ({ aktif: false, sedangProses: false }), mulakan: () => {}, hentikan: () => {}, jalankanSatuKitaran: async () => ({}) },
    log: { tulis: () => {}, tulisKerja: () => {}, bacaTerakhir: () => [] },
    halamanLokalHtml: () => '<html>lokal</html>',
    halamanLokalJs: () => '// lokal.js',
    klaimDisokong: async () => true,
    adaSesiMoeis: async () => true,
    statusSesiMoeis: async () => ({ sesiAda: true, umurSesi: 10 }),
    ujiLogin: async () => ({ status: 'sesi-sah' }),
    logMasukManual: async () => ({ status: 'ok' }),
    kerjaJalan: async () => ({ diproses: 0 }),
    kerjaSah: async () => ({ diproses: 0 }),
    kerjaSenaraiDisensor: async () => [],
    sekarangMs: () => Date.now(),
    autoMulaStatus: { diminta: false, bermula: false, sebab: 'Dimatikan.' },
    keupayaanLogMasuk: {
      automatik: true, mod: 'automatik-optin',
      sebab: 'Log masuk idMe automatik tersedia secara opt-in (suis loginAuto, lalai MATI) melalui vault kredensial DPAPI tempatan. Belum disahkan terhadap idMe hidup; frasa "Kata Kunci Keselamatan" mesti padan dan CAPTCHA/OTP/2FA memerlukan manusia.'
    },
    autostart: {
      status: () => ({ disokong: true, berdaftar: false, sepadan: false, sebab: 'Tidak didaftarkan.' }),
      tetapkan: () => ({ disokong: true, berdaftar: false, sepadan: false, sebab: 'Tidak didaftarkan.' })
    },
    loginAutoStatus: () => ({
      diminta: false, adaKredensial: false, sesiSah: null, percubaan: 0, had: 2,
      hasilTerakhir: '', benarkanTerusTanpaFrasa: false, sebab: 'Belum dinilai.'
    }),
    jagaSesi: () => ({
      berjalan: false, didayakan: false, hasilPokeTerakhir: 'belum', sihatTerakhir: false,
      bilPoke: 0, bilLangkau: 0, masaPokeTerakhir: 0, jedaEfektif: 300000, sedangPoke: false
    }),
    hadKadarLoginStatus: () => ({
      bilJam: 0, hadJam: 6, bilHariIni: 0, silingHarian: 24, kegagalanBerturut: 0, hadKegagalanBerturut: 3,
      diblok: false, sebab: null, hariIso: null, jenisSekat: null, cubaSemulaSelepasMs: null, cubaSemulaHariIso: null,
      didayakan: false
    }),
    // v1.11.22 Gap 5: tindakan pemilik tempatan — mengosongkan HANYA latch
    // kegagalanBerturut. Fixture ujian merekod panggilan supaya ujian boleh
    // menegaskan endpoint benar-benar menyeru tindakan ini (bukan no-op).
    _tetapkanSemulaLatchPanggilan: 0,
    tetapkanSemulaLatchKegagalan() {
      this._tetapkanSemulaLatchPanggilan++;
      return { bilJam: 0, hadJam: 6, bilHariIni: 3, silingHarian: 24, kegagalanBerturut: 0, hadKegagalanBerturut: 3, diblok: false, sebab: null, hariIso: '2026-09-22', jenisSekat: null, cubaSemulaSelepasMs: null, cubaSemulaHariIso: null };
    }
  };
  return Object.assign(asas, override);
}

export function mulakanPelayanUjian(override) {
  return new Promise((selesai) => {
    // Bina konteks selepas port diketahui (listen(0) memilih port bebas).
    const pelayanSementara = http.createServer();
    pelayanSementara.listen(0, '127.0.0.1', () => {
      const port = pelayanSementara.address().port;
      pelayanSementara.close(() => {
        const konteks = konteksAsas(port, override);
        const pelayan = buatPelayanHttp(konteks);
        pelayan.listen(port, '127.0.0.1', () => selesai({ pelayan, konteks, port }));
      });
    });
  });
}

// Permintaan HTTP mentah dengan kawalan penuh ke atas header Host/Origin.
export function mintaMentah(port, { method = 'GET', laluan = '/', host, headers = {}, badan = null }) {
  return new Promise((selesai, gagal) => {
    const req = http.request({
      host: '127.0.0.1', port, path: laluan, method,
      headers: { Host: host || `127.0.0.1:${port}`, ...headers }
    }, (res) => {
      const bahagian = [];
      res.on('data', (c) => bahagian.push(c));
      res.on('end', () => {
        const teks = Buffer.concat(bahagian).toString('utf8');
        let json = null;
        try { json = teks ? JSON.parse(teks) : null; } catch { /* bukan JSON, biarkan null */ }
        selesai({ status: res.statusCode, headers: res.headers, teks, json });
      });
    });
    req.on('error', gagal);
    if (badan) req.write(badan);
    req.end();
  });
}

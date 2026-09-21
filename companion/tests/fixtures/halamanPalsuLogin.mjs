// HalamanPalsuLogin — adapter log masuk idMe palsu untuk ujian login-auto.mjs.
import { tentukanStatusSelepasHantar } from '../../src/moeis/sesi.mjs';
// Tiada rangkaian, tiada pelayar. Nilai kredensial dalam ujian sentiasa PALSU
// (cth 'PENGGUNA-UJIAN', 'KATA-LALUAN-PALSU-TAK-SAH'). Adapter merekod setiap
// panggilan supaya ujian boleh menegaskan urutan ("belum menaip kata laluan",
// "frasa dibaca hanya selepas lanjutkanPengesahan") apabila diperlukan.
//
// Model dua peringkat idMe sebenar melalui `peringkat`: 'log-masuk' pada
// mulanya (frasa TIDAK wujud di sini — bacaKunciKeselamatan() pulangkan null),
// bertukar 'pengesahan' selepas lanjutkanPengesahan() dipanggil (frasa wujud,
// atau null jika `kunciAdaImej:true` — model kes frasa dipaparkan sebagai
// imej, bukan teks).
export function buatHalamanLoginPalsu({
  kunciHalaman = 'FRASA-CONTOH-SELAMAT',
  kunciAdaImej = false,
  captchaAwal = false,
  otpSelepasHantar = false,
  urlAwal = 'https://idme.moe.gov.my/',
  sesiSah = true,
  // Senario SELEPAS hantar "Daftar Masuk" (memodel klasifikasi sebenar dalam
  // `tentukanStatusSelepasHantar`):
  //   sesiSah=true (lalai) -> MOEIS dicapai terus (#kehadiran ada) -> sesi-sah.
  //   dashboardIdMe=true   -> papan pemuka idMe (hos idme, borang log masuk
  //                           hilang) -> sesi-sah WALAUPUN hos masih idMe.
  //   borangKekal=true     -> borang log masuk masih dipaparkan -> sesi-tamat.
  //   (kedua-dua dashboardIdMe=false & borangKekal=false, hos idme) ->
  //     sesi-tamat (hos idme tanpa borang mahupun papan pemuka).
  dashboardIdMe = false,
  borangKekal = false,
  lanjutGagal = false,
  kotakGagal = false,
  hantarGagal = false,
  hantarSebab = 'Tiada butang "Daftar Masuk" yang aktif dan kelihatan (ujian).',
  isiPenggunaGagal = false,
  isiPenggunaSebab = 'Medan IC tidak muncul (ujian).',
  isiKataLaluanGagal = false,
  isiKataLaluanSebab = 'Medan kata laluan tidak muncul (ujian).'
} = {}) {
  const panggilan = [];
  let semakKe = 0;
  let peringkat = 'log-masuk';
  let kotakSemak = false;
  return {
    async navigasiLoginIdMe() { panggilan.push('navigasiLoginIdMe'); },
    async semakCaptchaOtp() {
      semakKe += 1;
      panggilan.push('semakCaptchaOtp');
      if (semakKe === 1 && captchaAwal) return { sebab: 'CAPTCHA dikesan (ujian).' };
      if (semakKe > 1 && otpSelepasHantar) return { sebab: 'OTP/2FA dikesan selepas hantar (ujian).' };
      return null;
    },
    async urlHalaman() { panggilan.push('urlHalaman'); return urlAwal; },
    // Adapter PRODUKSI kini memulangkan {ok,sebab} (menunggu medan menjadi
    // sedia). Adapter palsu meniru kontrak ini: {ok:true} pada laluan gembira,
    // {ok:false} apabila isiPenggunaGagal (meniru medan IC tidak muncul).
    async isiPenggunaIdMe() {
      panggilan.push('isiPenggunaIdMe');
      if (isiPenggunaGagal) return { ok: false, status: 'medan-ic-tiada', sebab: isiPenggunaSebab };
      return { ok: true };
    },
    async lanjutkanPengesahan() {
      panggilan.push('lanjutkanPengesahan');
      if (lanjutGagal) return { ok: false, sebab: 'Halaman pengesahan tidak muncul (ujian).' };
      peringkat = 'pengesahan';
      return { ok: true };
    },
    async bacaKunciKeselamatan() {
      panggilan.push('bacaKunciKeselamatan');
      if (peringkat !== 'pengesahan') return null; // frasa TIDAK wujud pada halaman IC
      if (kunciAdaImej) return null; // frasa dipaparkan sebagai imej, bukan teks
      return kunciHalaman;
    },
    // Adapter PRODUKSI memulangkan boolean (true = kotak ditanda DAN kata
    // laluan disahkan kelihatan). Adapter palsu meniru kontrak ini: true pada
    // laluan gembira, false apabila `kotakGagal` (meniru kotak tidak dijumpai
    // atau kata laluan tidak didedahkan).
    async tandakanKunciKeselamatan() {
      panggilan.push('tandakanKunciKeselamatan');
      if (kotakGagal) return false;
      kotakSemak = true;
      return true;
    },
    async isiKataLaluanIdMe() {
      panggilan.push('isiKataLaluanIdMe');
      if (isiKataLaluanGagal) return { ok: false, status: 'medan-kata-laluan-tiada', sebab: isiKataLaluanSebab };
      return { ok: true };
    },
    async hantarBorangLogMasuk() {
      panggilan.push('hantarBorangLogMasuk');
      if (hantarGagal) return { ok: false, status: 'tiada-butang-hantar', sebab: hantarSebab };
      return { ok: true };
    },
    async sahkanSesiSelepasLogin() {
      panggilan.push('sahkanSesiSelepasLogin');
      if (sesiSah) return { status: 'sesi-sah', hos: 'moeispel.moe.gov.my' };
      if (dashboardIdMe) {
        return tentukanStatusSelepasHantar({ hos: 'idme.moe.gov.my', borangLogin: false, dashboardIdMe: true });
      }
      if (borangKekal) {
        return tentukanStatusSelepasHantar({ hos: 'idme.moe.gov.my', borangLogin: true, dashboardIdMe: false });
      }
      return tentukanStatusSelepasHantar({ hos: 'idme.moe.gov.my', borangLogin: false, dashboardIdMe: false });
    },
    _panggilan: panggilan,
    get _kotakSemak() { return kotakSemak; },
    get _peringkat() { return peringkat; }
  };
}

// Kredensial PALSU untuk ujian (bukan nilai sebenar — larangan keras brief).
export const KREDENSIAL_PALSU = Object.freeze({
  pengguna: 'PENGGUNA-UJIAN',
  kataLaluan: 'KATA-LALUAN-PALSU-TAK-SAH',
  kunciKeselamatan: 'FRASA-CONTOH-SELAMAT'
});

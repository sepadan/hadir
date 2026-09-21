// HalamanPalsuLogin — adapter log masuk idMe palsu untuk ujian login-auto.mjs.
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
  lanjutGagal = false
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
    async isiPenggunaIdMe() { panggilan.push('isiPenggunaIdMe'); },
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
    async tandakanKunciKeselamatan() { panggilan.push('tandakanKunciKeselamatan'); kotakSemak = true; },
    async isiKataLaluanIdMe() { panggilan.push('isiKataLaluanIdMe'); },
    async hantarBorangLogMasuk() { panggilan.push('hantarBorangLogMasuk'); },
    async sahkanSesiSelepasLogin() {
      panggilan.push('sahkanSesiSelepasLogin');
      if (sesiSah) return { status: 'sesi-sah', hos: 'moeispel.moe.gov.my' };
      return { status: 'sesi-tamat', hos: 'idme.moe.gov.my', sebab: 'Masih pada idMe (ujian).' };
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

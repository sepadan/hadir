// HalamanPalsuLogin — adapter log masuk idMe palsu untuk ujian login-auto.mjs.
// Tiada rangkaian, tiada pelayar. Nilai kredensial dalam ujian sentiasa PALSU
// (cth 'PENGGUNA-UJIAN', 'KATA-LALUAN-PALSU-TAK-SAH'). Adapter merekod setiap
// panggilan supaya ujian boleh menegaskan "belum menaip" (isiBorangLogMasuk
// tidak dipanggil) apabila frasa tidak padan.
export function buatHalamanLoginPalsu({
  kunciHalaman = 'FRASA-CONTOH-SELAMAT',
  captchaAwal = false,
  otpSelepasHantar = false,
  urlAwal = 'https://idme.moe.gov.my/',
  sesiSah = true
} = {}) {
  const panggilan = [];
  let semakKe = 0;
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
    async bacaKunciKeselamatan() { panggilan.push('bacaKunciKeselamatan'); return kunciHalaman; },
    async isiBorangLogMasuk() { panggilan.push('isiBorangLogMasuk'); },
    async hantarBorangLogMasuk() { panggilan.push('hantarBorangLogMasuk'); },
    async sahkanSesiSelepasLogin() {
      panggilan.push('sahkanSesiSelepasLogin');
      if (sesiSah) return { status: 'sesi-sah', hos: 'moeispel.moe.gov.my' };
      return { status: 'sesi-tamat', hos: 'idme.moe.gov.my', sebab: 'Masih pada idMe (ujian).' };
    },
    _panggilan: panggilan
  };
}

// Kredensial PALSU untuk ujian (bukan nilai sebenar — larangan keras brief).
export const KREDENSIAL_PALSU = Object.freeze({
  pengguna: 'PENGGUNA-UJIAN',
  kataLaluan: 'KATA-LALUAN-PALSU-TAK-SAH',
  kunciKeselamatan: 'FRASA-CONTOH-SELAMAT'
});

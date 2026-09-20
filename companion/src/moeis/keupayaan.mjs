// Keupayaan log masuk idMe companion (companion/src/moeis/keupayaan.mjs).
//
// Selepas kelulusan pemilik (Sept 2026), companion kini mempunyai vault
// kredensial DPAPI tempatan sendiri dan log masuk idMe AUTOMATIK yang OPT-IN.
// Laporan ini JUJUR: automatik kini `true` (disokong), tetapi ia opt-in
// (suis `loginAuto`, lalai MATI) dan BELUM disahkan terhadap idMe/MOEIS hidup
// (pengesahan hidup berlaku kemudian dengan kehadiran pemilik). Pengawal kekal
// ketat: frasa kunci keselamatan mesti padan, CAPTCHA/OTP/2FA memerlukan
// manusia, maks 2 cubaan automatik per proses.
export function keupayaanLogMasuk() {
  return {
    automatik: true,
    mod: 'automatik-optin',
    sebab:
      'Log masuk idMe automatik tersedia secara opt-in (suis loginAuto, lalai MATI) ' +
      'melalui vault kredensial DPAPI tempatan. Belum disahkan terhadap idMe hidup; ' +
      'frasa "Kata Kunci Keselamatan" mesti padan dan CAPTCHA/OTP/2FA memerlukan manusia.'
  };
}

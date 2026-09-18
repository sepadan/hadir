// Pautan aplikasi MOEIS pada portal idMe (companion/src/moeis/aplikasi.mjs).
//
// Selepas guru log masuk idMe, membuka URL MOEIS secara terus dilencongkan
// kembali ke dashboard idMe — sesi MOEIS hanya terbentuk apabila pautan
// aplikasi pada halaman `list_aplikasi` diikuti (pautan itu membawa token SSO
// sekali guna `token_idms=...` yang menuju ke moeispel.moe.gov.my).
//
// Perhatikan: ini NAVIGASI sahaja. companion tidak pernah menaip kata laluan,
// tidak menekan kotak semak log masuk, dan tidak menghantar borang.
//
// Logik pemilihan diasingkan sebagai fungsi tulen supaya boleh diuji tanpa
// pelayar.

export const HOS_MOEIS = 'moeispel.moe.gov.my';
export const URL_APLIKASI_IDME = 'https://idme.moe.gov.my/list_aplikasi';

// Hanya HTTPS + hos TEPAT moeispel.moe.gov.my diterima (bukan padanan awalan,
// bukan subrentetan) supaya pautan penyerang tidak boleh dipilih.
export function pautanMoeisSah(href) {
  try {
    const u = new URL(String(href || ''));
    return u.protocol === 'https:' && u.hostname.toLowerCase() === HOS_MOEIS;
  } catch {
    return false;
  }
}

// Pilih pautan aplikasi MOEIS daripada senarai { teks, href }. Utamakan pautan
// berlabel "Pengurusan Murid"; jika tiada, pautan moeispel pertama.
export function pilihPautanAplikasiMoeis(senarai) {
  const calon = (Array.isArray(senarai) ? senarai : []).filter((x) => x && pautanMoeisSah(x.href));
  const berlabel = calon.find((x) => /pengurusan murid|modul murid|moeis/i.test(String(x.teks || '')));
  return berlabel || calon[0] || null;
}

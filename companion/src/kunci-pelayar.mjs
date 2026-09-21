// Kunci eksklusif pelayar (companion/src/kunci-pelayar.mjs).
//
// SATU profil Edge dikongsi oleh SEMUA operasi pelayar companion: uji-login
// (siasatan sesi), log-masuk-manual, login-auto, dan tugasan push.mjs. Dua
// operasi yang bertindih akan bertembung pada kunci profil Playwright dan
// boleh merosakkan sesi atau melancarkan tetingkap kedua yang tidak dijangka.
//
// Kunci ini ialah sumber-benar TUNGGAL "adakah profil Edge sedang digunakan".
// Ia diperoleh secara SINCHRONOUS (sebelum mana-mana `await`) supaya
// pemeriksaan-dan-set adalah atomik dalam gelung acara Node — tiada tetingkap
// TOCTOU antara semakan `sedangProses` dan pelancaran anak pelayar. Menyemak
// `sedangProses` sahaja SEBELUM siasatan async TIDAK menghalang satu tugasan
// bermula SEMASA siasatan itu berjalan: siasatan melancarkan Edge, dan pada
// masa yang sama giliran boleh memulakan push.mjs pada profil yang sama.
//
// Semantik:
//   - cubaKunci(label) cuba memperoleh kunci TANPA menunggu (skip, bukan
//     queue). Jika sibuk, pulangkan { boleh:false, pemegang } supaya pemanggil
//     boleh melangkau dengan mesej jelas.
//   - lepaskan(label) membebaskan kunci HANYA jika label sepadan — pemegang
//     sebenar yang membebaskan. Ini ialah "serialize ATAU skip, TIADA
//     paksa-bunuh": tiada operasi pernah membunuh pelayar aktif milik operasi
//     lain.
//
// Tulen: tiada kebergantungan luar; boleh diuji sepenuhnya tanpa pelayar.
export function buatKunciPelayar() {
  let pemegang = null; // label pemegang semasa, atau null

  function cubaKunci(label) {
    if (pemegang !== null) return { boleh: false, pemegang };
    pemegang = String(label || 'pelayar');
    return { boleh: true, pemegang };
  }

  function lepaskan(label) {
    if (pemegang === null) return false;
    if (label === undefined || pemegang === String(label)) {
      pemegang = null;
      return true;
    }
    return false;
  }

  function sibuk() {
    return pemegang !== null;
  }

  function status() {
    return { sibuk: pemegang !== null, pemegang };
  }

  return { cubaKunci, lepaskan, sibuk, status };
}

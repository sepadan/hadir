// Penjaga sesi idMe/MOEIS — KEEP-ALIVE BERSEMPADAN (companion/src/moeis/jaga-sesi.mjs).
//
// Sesi idMe/MOEIS SSO diperhatikan LUPUT selepas kira-kira 15-20 minit tidak
// aktif (bukti ujian hidup pemilik 2026-09-21). Semasa giliran aktif, satu baris
// tugasan boleh berjalan lebih lama daripada itu (banyak kelas, tugasan lambat),
// dan satu jurang 15-20 minit tanpa sentuhan boleh menyebabkan sesi tamat di
// tengah-tengah giliran. Penjaga ini MENYENTUH (poke) sesi MOEIS secara berkala
// dengan siasatan BACA-SAHJA (uji-login, TIADA kredensial ditaip) pada selang
// bersempadan — jauh lebih pendek daripada masa luput — supaya sesi tidak mati
// semasa giliran berjalan.
//
// BERSEMPADAN (bound) bermakna:
//   - hanya poke semasa giliran AKTIF (`aktif()` benar);
//   - dilangkau semasa satu tugasan sedang diproses (`sedangProses()` benar —
//     profil Edge sedang digunakan oleh proses anak push.mjs);
//   - tiada pertindihan (satu poke pada satu masa; `sedangPoke` pengawal);
//   - selang dikekang pada nilai MINIMUM (lantai) supaya siasatan tidak boleh
//     dipadatkan menjadi spam;
//   - rantai setTimeout (BUKAN setInterval) supaya poke yang lambat tidak
//     bertindih dengan kitaran seterusnya;
//   - timer `unref` supaya penjaga tidak menahan proses daripada keluar.
//
// KETAHANAN: `jadual` dipanggil dalam `finally` supaya ralat dalam panggilan
// balik/log tidak memutuskan rantai; `tulisLog` diasingkan (`selamatLog`) supaya
// ia tidak boleh melontar ke pemanggil; pembilang `generasi` dinaikkan pada
// `mula`/`hentikan` supaya kitaran dalam-penerbangan yang tamat selepas
// hentikan/mula-semula tidak menjadualkan rantai tambahan (stop-safe).
//
// Tulen: semua kebergantungan disuntik; boleh diuji tanpa pelayar/rangkaian.

export const JEDA_JAGA_SESI_MS = 5 * 60 * 1000;      // selang sasaran (5 minit)
export const JEDA_JAGA_SESI_MIN_MS = 60 * 1000;       // lantai keras (1 minit)

export function buatPenjagaSesi({
  aktif,                                              // () -> boolean  (giliran aktif?)
  sedangProses,                                       // () -> boolean  (tugasan diproses?)
  poke,                                               // async () -> apa-apa (siasatan baca-sahaja)
  sekarangMs = () => Date.now(),
  jedaMs = JEDA_JAGA_SESI_MS,
  jedaMinMs = JEDA_JAGA_SESI_MIN_MS,
  tulisLog
}) {
  let timer = null;
  let generasi = 0;
  let sedangPoke = false;
  let masaPokeTerakhir = 0;
  let bilPoke = 0;
  let bilLangkau = 0;
  // Klasifikasi hasil poke TERAKHIR — jujur, tidak sekali-kali mengaku sihat
  // hanya kerana promise poke selesai. `sihatTerakhir` BENAR HANYA apabila poke
  // memulangkan `status === 'sesi-sah'`. `sesi-tamat`/`perlu-manusia`/
  // `hos-tidak-sah`/`idme-sah-moeis-belum`/`langkau`/`ralat` = TIDAK sihat.
  let hasilPokeTerakhir = 'belum';
  let sihatTerakhir = false;

  const jedaEfektif = Math.max(jedaMinMs, Number(jedaMs) || JEDA_JAGA_SESI_MS);

  // Log tidak boleh merobohkan penjaga: sebarang ralat dalam tulisLog ditelan.
  function selamatLog(jenis, mesej) {
    if (typeof tulisLog !== 'function') return;
    try { tulisLog(jenis, mesej); } catch { /* abaikan */ }
  }

  async function kitar(gen) {
    if (timer === null || gen !== generasi) return; // dihentikan / generasi lapuk
    let jadualSemula = true;
    try {
      // Pertindihan tidak sepatutnya berlaku pada rantai berjujukan, tetapi jika
      // ia berlaku (poke masih dalam penerbangan), biarkan poke itu yang
      // menjadualkan seterusnya — jangan jadualkan rantai kedua.
      if (sedangPoke) { jadualSemula = false; return; }

      const adalahAktif = typeof aktif === 'function' ? !!aktif() : true;
      if (!adalahAktif) { bilLangkau++; return; }

      if (typeof sedangProses === 'function' && sedangProses()) { bilLangkau++; return; }

      const sekarang = sekarangMs();
      if (masaPokeTerakhir && sekarang - masaPokeTerakhir < jedaEfektif) return;

      masaPokeTerakhir = sekarang;
      sedangPoke = true;
      bilPoke++;
      try {
        // Poke BACA-SAHJA. Kejayaan TIDAK ditakrifkan oleh "promise selesai" —
        // ia ditakrifkan oleh status: `sesi-sah` = sihat; `sesi-tamat`,
        // `perlu-manusia` dan seumpamanya = TIDAK sihat (sesi sebenarnya sudah
        // luput / memerlukan manusia). Ini menghalang penjaga daripada
        // melaporkan sesi sihat hanya kerana siasatan tidak melontar.
        const hasil = await poke();
        const statusPoke = (hasil && hasil.status) ? String(hasil.status) : 'tidak-diketahui';
        hasilPokeTerakhir = statusPoke;
        sihatTerakhir = (statusPoke === 'sesi-sah');
        selamatLog('JAGA_SESI', sihatTerakhir ? 'poke-sesi-ok' : ('poke-sesi-tidak-sihat: ' + statusPoke));
      } catch (ralat) {
        hasilPokeTerakhir = 'ralat';
        sihatTerakhir = false;
        selamatLog('JAGA_SESI', 'poke-sesi-gagal: ' + String((ralat && ralat.message) || ralat));
      } finally {
        sedangPoke = false;
      }
    } finally {
      if (jadualSemula) jadual(gen);
    }
  }

  function jadual(gen) {
    if (timer === null || gen !== generasi) return;
    timer = setTimeout(() => { kitar(gen).catch(() => {}); }, jedaEfektif);
    if (timer.unref) timer.unref();
  }

  function mula() {
    if (timer) return;
    generasi++;
    const gen = generasi;
    timer = setTimeout(() => { kitar(gen).catch(() => {}); }, jedaEfektif);
    if (timer.unref) timer.unref();
  }

  function hentikan() {
    generasi++; // buat sebarang kitaran/jadual dalam-penerbangan menjadi lapuk
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function berjalan() {
    return timer !== null;
  }

  function status() {
    return {
      berjalan: timer !== null,
      bilPoke,
      bilLangkau,
      masaPokeTerakhir,
      hasilPokeTerakhir,
      sihatTerakhir,
      jedaEfektif,
      sedangPoke
    };
  }

  return { mula, hentikan, berjalan, status, _kitar: () => kitar(generasi) };
}

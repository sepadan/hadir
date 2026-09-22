// Probe sesi LANGSUNG untuk gerbang had kadar log masuk automatik
// (companion/src/moeis/probe-sesi.mjs).
//
// Ini ialah probe yang disuntik sebagai `sesiSah` ke dalam
// buatPengurusLoginAuto (rejim hadKadarLogin HIDUP sahaja). Berbeza daripada
// `sesiKerjaDisahkan` (cache-sahaja) DAN daripada probe cache-dahulu lama
// (`sesiSahProbeLangsung` v1.11.22): ia TIDAK PERNAH membaca cache. Setiap
// panggilan melakukan siasatan SEBENAR (baca-sahaja) melalui `probeLangsung`.
//
// Sebab (pembetulan sempit — regresi cache lapuk): laluan pemulihan PAKSA
// (cubaLoginAutoKerjaTerpandu paksa:true) memintas gerbang cache luar
// (sesiKerjaDisahkan) tetapi pengurus kemudian memanggil semula probe yang
// MEMBACA cache yang SAMA — stale positif (ditulis sebelum tugasan mendedahkan
// sesi-tamat) — jadi probe itu melaporkan {ada:true} dan log masuk sebenar
// TIDAK pernah dicuba: cache lapuk mengalahkan pemulihan paksa berulang kali.
// Dengan probe LANGSUNG sahaja, hasil sebenar siasatan menang: sesi sah ->
// guna-semula tanpa belanjawan; sesi sebenarnya tamat -> log masuk sebenar.
//
// `tangguh` (defer): apabila siasatan TIDAK dapat dijalankan (profil sibuk/
// ralat tidak diketahui), probe memulangkan {ada:false, tangguh:true} supaya
// pengurus MENANGGUH secara sementara SEBELUM merizab percubaan (catatPercubaan)
// — bukan membelanjakan belanjawan untuk "tamat" palsu yang kemudiannya juga
// gagal pada kunci profil. Ini berbeza daripada {ada:false} (sesi benar-benar
// tamat) yang MEMANG layak membelanjakan belanjawan untuk log masuk sebenar.
//
// TULEN: tiada kebergantungan luar; `probeLangsung` disuntik, jadi boleh diuji
// sepenuhnya dengan double tanpa pelayar.
export function buatProbeSesiLangsung({ probeLangsung }) {
  return async function probeSesiLangsung() {
    try {
      const hasil = await probeLangsung();
      const sesiSah = !!(hasil && hasil.status === 'sesi-sah');
      return {
        ada: sesiSah,
        sebab: sesiSah
          ? 'Sesi idMe sah (probe langsung).'
          : ((hasil && hasil.sebab) || `Status sesi (probe langsung): ${(hasil && hasil.status) || 'tidak diketahui'}.`)
      };
    } catch (ralat) {
      return {
        ada: false,
        tangguh: true,
        sebab: 'Probe langsung sesi tidak dapat dijalankan (profil sibuk/ralat): ' + String((ralat && ralat.message) || ralat)
      };
    }
  };
}

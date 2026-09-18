// RPC ke Apps Script HADIR (companion/src/klien-hadir.mjs).
// User-Agent pelayar WAJIB — tanpa ini Apps Script memulangkan lencongan 404
// pada /exec dan badan balasan bukan JSON (nota daripada moeis-bot).
// Hanya panggilan BACA (moeisJobSenarai) yang dicuba semula automatik;
// panggilan yang mengubah keadaan (klaim/lepas/selesai) tidak diulang secara
// membuta supaya tidak mencipta kesan sampingan berganda pada rangkaian tidak
// stabil — pemanggil (giliran.mjs) yang menentukan tindakan selepas ralat.
const UA_PELAYAR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function panggilRpc(apiUrl, kaedah, argumen, { timeoutMs = 20000, cubaanMaks = 1, fetchImpl } = {}) {
  const fetchGuna = fetchImpl || fetch;
  let ralatTerakhir;
  for (let cubaan = 1; cubaan <= cubaanMaks; cubaan++) {
    const kawalan = new AbortController();
    const masaHabis = setTimeout(() => kawalan.abort(), timeoutMs);
    try {
      const r = await fetchGuna(apiUrl, {
        method: 'POST',
        redirect: 'follow',
        signal: kawalan.signal,
        headers: { 'Content-Type': 'text/plain;charset=utf-8', 'User-Agent': UA_PELAYAR },
        body: JSON.stringify({ mode: 'hadir', kaedah, argumen })
      });
      const teks = await r.text();
      let j;
      try { j = JSON.parse(teks); }
      catch { throw new Error('Balasan bukan JSON (status ' + r.status + ').'); }
      if (!j.ok) throw new Error(j.ralat || 'Permintaan HADIR gagal.');
      return j.hasil;
    } catch (ralat) {
      ralatTerakhir = ralat;
      if (cubaan < cubaanMaks) continue;
    } finally {
      clearTimeout(masaHabis);
    }
  }
  throw ralatTerakhir;
}

export function buatKlienHadir({ apiUrl, rahsia, fetchImpl }) {
  return {
    async senarai() {
      return panggilRpc(apiUrl, 'moeisJobSenarai', ['', rahsia], { cubaanMaks: 3, fetchImpl });
    },
    // benarkanCubaSemula dihantar TANPA paksaan jenis: `true` (cuba semula
    // tugasan gagal), `false` (klaim biasa) atau rentetan `'verifikasi'`
    // (klaim baca-sahaja bagi tugasan 'tersimpan' — lihat hadirMoeisJobKlaim_
    // di backend). `!!` akan memutarbelitkan 'verifikasi' menjadi `true`.
    async klaim(id, pemilik, benarkanCubaSemula) {
      return panggilRpc(apiUrl, 'moeisJobKlaim', [id, pemilik, benarkanCubaSemula, rahsia], { cubaanMaks: 1, fetchImpl });
    },
    async lepas(id, pemilik) {
      return panggilRpc(apiUrl, 'moeisJobLepas', [id, pemilik, rahsia], { cubaanMaks: 1, fetchImpl });
    },
    // `pemilik` dihantar supaya backend boleh menolak laporan daripada enjin
    // yang bukan pemegang klaim (penemuan semakan bebas).
    async selesai(id, keputusan, mesej, bilHadirSelepas, pemilik) {
      return panggilRpc(apiUrl, 'moeisJobSelesai', [id, keputusan, mesej, bilHadirSelepas ?? '', pemilik || '', rahsia], { cubaanMaks: 1, fetchImpl });
    }
  };
}

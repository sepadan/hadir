// Penyediaan payload tugasan untuk proses anak enjin (src/moeis/payload.mjs).
//
// Semakan bebas menemui bahawa payload `moeisJobKlaim` membawa `ic` penuh setiap
// murid tidak hadir dan payload itu dihantar sebagai argumen CLI — baris arahan
// proses boleh dibaca oleh proses lain pengguna Windows yang sama. Enjin TIDAK
// pernah memerlukan IC (padanan murid dibuat mengikut nama ternormal dan
// `data-idpelajar`), jadi IC dibuang di sini dan payload dihantar melalui STDIN.
//
// Fungsi ini TULEN (tiada I/O) supaya boleh diuji terus.

export function buangIc(job) {
  const murid = Array.isArray(job && job.murid) ? job.murid : [];
  return {
    id: (job && job.id) || '',
    kelas: (job && job.kelas) || '',
    tarikhIso: (job && job.tarikhIso) || '',
    kelasMoeisId: (job && job.kelasMoeisId) || '',
    murid: murid
      .filter((m) => m && m.nama)
      .map((m) => ({ nama: m.nama, kategori: m.kategori || '', sebab: m.sebab || '' }))
  };
}

// Medan yang TIDAK boleh kekal dalam payload yang dihantar ke proses anak.
export function adaMedanSensitif(objek) {
  return /"ic"\s*:/i.test(JSON.stringify(objek || {}));
}

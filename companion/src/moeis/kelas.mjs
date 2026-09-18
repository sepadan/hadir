// Peta nama kelas HADIR ("4 BIJAK", "PRASEKOLAH BIJAK") ke tahun/kelas MOEIS
// ("TAHUN EMPAT" / "BIJAK"). Rujukan: moeis-bot/tugas.mjs pecahKelas_().
const TAHUN_MOEIS = {
  '1': 'TAHUN SATU', '2': 'TAHUN DUA', '3': 'TAHUN TIGA',
  '4': 'TAHUN EMPAT', '5': 'TAHUN LIMA', '6': 'TAHUN ENAM'
};

export function petakanKelasMoeis(namaKelasHadir) {
  const k = String(namaKelasHadir || '').trim().toUpperCase();
  if (!k) return null;
  if (k.startsWith('PRASEKOLAH')) {
    const sisa = k.replace(/^PRASEKOLAH\s*/, '').trim();
    return { tahun: 'PRASEKOLAH', kelas: sisa ? 'PRASEKOLAH ' + sisa : 'PRASEKOLAH' };
  }
  const m = k.match(/^([1-6])\s+(.+)$/);
  if (!m) return null;
  const tahun = TAHUN_MOEIS[m[1]];
  if (!tahun) return null;
  return { tahun, kelas: m[2].trim() };
}

// HalamanPalsu — DOM mini dalam ingatan yang melaksanakan antara muka adapter
// digunakan oleh companion/src/moeis/halaman.mjs dan push.mjs. Tiada rangkaian,
// tiada pelayar sebenar. Nama murid dalam ujian sentiasa palsu
// ("MURID CONTOH SATU"...).
export function buatHalamanPalsu({
  muridAwal, tajuk = 'Sistem MOEIS - Kehadiran', terimaFormatTarikh = true,
  urlAwal = 'https://moeispel.moe.gov.my/sahsiah/kehadiran/pkhem/tabguru',
  kunciKeselamatan = null, adaCaptchaOtp = false
}) {
  const panggilan = [];
  let tabDibuka = false;
  let tarikhInput = '';
  let tahunTerpilih = null;
  let kelasTerpilih = null;
  let dialogSimpanTampil = false;
  let tindakanSimpanDitekan = null;
  let dimuatSemulaBil = 0;
  const murid = muridAwal.map((m) => ({ ...m }));

  function periksaTabDibuka(nama) {
    if (!tabDibuka) throw new Error('Cubaan "' + nama + '" sebelum tab Kehadiran Harian dibuka.');
  }

  return {
    async navigasiHarian() { panggilan.push('navigasiHarian'); },
    async semakSesiDanCaptcha() { return null; },
    async urlHalaman() { panggilan.push('urlHalaman'); return urlAwal; },
    async bacaKunciKeselamatan() { panggilan.push('bacaKunciKeselamatan'); return kunciKeselamatan; },
    async semakCaptchaOtp() { panggilan.push('semakCaptchaOtp'); return adaCaptchaOtp ? { sebab: 'CAPTCHA/OTP dikesan (ujian).' } : null; },
    async bacaBilanganMurid() { panggilan.push('bacaBilanganMurid'); return murid.length; },
    async tajuk() { return tajuk; },
    async klikTabHarian() { tabDibuka = true; panggilan.push('klikTabHarian'); },
    async tungguKemaskiniKelihatan() { periksaTabDibuka('tungguKemaskiniKelihatan'); panggilan.push('tungguKemaskiniKelihatan'); },
    async bacaTarikhInput() { periksaTabDibuka('bacaTarikhInput'); return tarikhInput; },
    async tetapkanTarikhInput(paparan) {
      periksaTabDibuka('tetapkanTarikhInput');
      panggilan.push('tetapkanTarikhInput:' + paparan);
      tarikhInput = terimaFormatTarikh ? paparan : '00/00/0000';
    },
    async pilihTahun(label) { periksaTabDibuka('pilihTahun'); tahunTerpilih = label; return { ok: true, mentah: label }; },
    async pilihKelas(label) { periksaTabDibuka('pilihKelas'); kelasTerpilih = label; return { ok: true, mentah: label }; },
    async bacaRingkasanKelas(tahun, kelas) {
      periksaTabDibuka('bacaRingkasanKelas');
      if (tahun !== tahunTerpilih || kelas !== kelasTerpilih) return null;
      const hadir = murid.filter((m) => m.hadir).length;
      return { hadir, jumlah: murid.length, status: hadir === murid.length ? 'Semua hadir' : 'Ada tidak hadir' };
    },
    async bacaSenaraiMurid() { periksaTabDibuka('bacaSenaraiMurid'); return murid.map((m) => ({ id: m.id, nama: m.nama, hadir: m.hadir })); },
    async jeda() {},
    async bacaKiraanSkrin() {
      return { bilHadir: murid.filter((m) => m.hadir).length, bilTidakHadir: murid.filter((m) => !m.hadir).length };
    },
    async tandaTidakHadir(id, kategori, sebab) {
      const m = murid.find((x) => x.id === id);
      if (!m) return { ralat: 'tiada murid dengan id ' + id };
      m.hadir = false; m.kategoriValue = kategori; m.kategoriText = kategori; m.sebabValue = sebab; m.sebabText = sebab;
      panggilan.push('tandaTidakHadir:' + id);
      return { kategoriValue: kategori, kategoriText: kategori, sebabValue: sebab, sebabText: sebab, ralat: null };
    },
    async pulihkanKeHadir(id) { const m = murid.find((x) => x.id === id); if (m) m.hadir = true; },
    async bacaSebabMurid(id) {
      const m = murid.find((x) => x.id === id);
      if (!m) return null;
      return { kategoriValue: m.kategoriValue || '', kategoriText: m.kategoriText || '', sebabValue: m.sebabValue || '', sebabText: m.sebabText || '' };
    },
    async tekanKemaskini() { periksaTabDibuka('tekanKemaskini'); dialogSimpanTampil = true; panggilan.push('tekanKemaskini'); },
    async dialogSimpanKelihatan() { return dialogSimpanTampil; },
    async klikSimpan() { tindakanSimpanDitekan = 'simpan'; panggilan.push('klikSimpan'); },
    async klikSimpanSahkan() { tindakanSimpanDitekan = 'simpansah'; panggilan.push('klikSimpanSahkan'); },
    async dialogBerjayaKelihatan() { return dialogSimpanTampil; },
    async muatSemula() {
      dimuatSemulaBil++; panggilan.push('muatSemula');
      tabDibuka = false; tarikhInput = ''; tahunTerpilih = null; kelasTerpilih = null; dialogSimpanTampil = false;
    },
    async tangkapSkrin() {},
    _panggilan: panggilan,
    _murid: () => murid,
    _tindakanSimpanDitekan: () => tindakanSimpanDitekan,
    _dimuatSemulaBil: () => dimuatSemulaBil
  };
}

export const JOB_CONTOH = Object.freeze({
  id: 'job-contoh-1', kelas: '4 BIJAK', tarikhIso: '2026-09-18',
  murid: [{ ic: '', nama: 'MURID CONTOH SATU', kategori: 'D', sebab: 'DEMAM' }]
});

export const MURID_MOEIS_CONTOH = [
  { id: 'm1', nama: 'MURID CONTOH SATU', hadir: true },
  { id: 'm2', nama: 'MURID CONTOH DUA', hadir: true },
  { id: 'm3', nama: 'MURID CONTOH TIGA', hadir: true }
];

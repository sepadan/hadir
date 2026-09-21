// Ujian sempadan kumpulan pelayar dalam giliran.mjs (companion/tests/giliran-batch.test.mjs).
//
// `tutupKumpulanPelayar` ialah suntikan BAHARU (opsyenal, lalai tiada-op) —
// giliran.mjs sendiri TIDAK tahu/tidak peduli tentang dispatcher/kunci
// pelayar; ia hanya memanggil hook ini pada dua sempadan:
//   1. AKHIR setiap kitaran/tugasan (finally) — kumpulan ditutup selepas
//      SEMUA calon dalam kitaran itu diproses, bukan selepas setiap tugasan.
//   2. SEBELUM memanggil pengurus log masuk induk (cubaLoginAutoKerja) apabila
//      sesi idMe tamat dikesan — elak deadlock kunci reentrant (pengurus log
//      masuk memperoleh kunci pelayar sendiri untuk siasatan/log masuk).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buatGiliran } from '../src/giliran.mjs';

function klienPalsu(senaraiAwal) {
  const dikunci = new Set();
  const selesaiPanggilan = [];
  return {
    senarai: async () => senaraiAwal,
    klaim: async (id) => {
      if (dikunci.has(id)) return null;
      dikunci.add(id);
      const job = senaraiAwal.find((j) => j.id === id);
      return { id, kelas: job.kelas, tarikhIso: job.tarikhIso, murid: job.murid || [] };
    },
    lepas: async (id) => { dikunci.delete(id); },
    selesai: async (id, keputusan, mesej, bilHadir) => { selesaiPanggilan.push({ id, keputusan, mesej, bilHadir }); },
    _selesaiPanggilan: selesaiPanggilan
  };
}

function logPalsu() {
  return { tulis: () => {}, tulisKerja: () => {}, bacaTerakhir: () => [] };
}

test('giliran+kumpulan: tutupKumpulanPelayar dipanggil SEKALI sahaja per kitaran, selepas SEMUA calon diproses', async () => {
  const klien = klienPalsu([
    { id: 'j1', status: 'menunggu', kelas: '1 BIJAK', tarikhIso: '2026-09-21', murid: [] },
    { id: 'j2', status: 'menunggu', kelas: '2 BIJAK', tarikhIso: '2026-09-21', murid: [] },
    { id: 'j3', status: 'menunggu', kelas: '3 BIJAK', tarikhIso: '2026-09-21', murid: [] }
  ]);
  let bilTutup = 0;
  const urutan = [];
  const jalankanTugasanAnak = async (job) => {
    urutan.push('tugasan:' + job.id);
    return { stdout: '', stderr: '', hasil: { status: 'tidak-berubah', sebab: 'tiada perubahan', kod: 0 } };
  };
  const tutupKumpulanPelayar = async () => { bilTutup++; urutan.push('tutup'); };
  const g = buatGiliran({ klien, pemilik: 'runner-1', log: logPalsu(), jalankanTugasanAnak, tutupKumpulanPelayar });

  await g.jalankanSatuKitaran();

  assert.equal(bilTutup, 1, 'tutupKumpulanPelayar mesti dipanggil SEKALI sahaja untuk 3 tugasan dalam satu kitaran');
  assert.deepEqual(urutan, ['tugasan:j1', 'tugasan:j2', 'tugasan:j3', 'tutup'], 'tutup mesti berlaku SELEPAS semua calon diproses, bukan selepas setiap satu');
});

test('giliran+kumpulan: kitaran tanpa calon masih memanggil tutupKumpulanPelayar (tiada-op selamat jika kumpulan tidak pernah dibuka)', async () => {
  const klien = klienPalsu([]);
  let bilTutup = 0;
  const jalankanTugasanAnak = async () => { throw new Error('tidak dijangka dipanggil'); };
  const tutupKumpulanPelayar = async () => { bilTutup++; };
  const g = buatGiliran({ klien, pemilik: 'runner-1', log: logPalsu(), jalankanTugasanAnak, tutupKumpulanPelayar });

  await g.jalankanSatuKitaran();
  assert.equal(bilTutup, 1);
});

test('giliran+kumpulan: sesi TAMAT semasa verifikasi -> tutupKumpulanPelayar dipanggil SEBELUM cubaLoginAutoKerja(paksa)', async () => {
  const klien = klienPalsu([{ id: 'j1', status: 'menunggu', kelas: '1 BIJAK', tarikhIso: '2026-09-21', murid: [] }]);
  const urutan = [];
  let panggilanVerifikasi = 0;
  const jalankanTugasanAnak = async (job, opsyen) => {
    if (opsyen.mod === 'verifikasi') {
      panggilanVerifikasi++;
      if (panggilanVerifikasi === 1) {
        urutan.push('verifikasi-sesi-tamat');
        return { stdout: '', stderr: '', hasil: { status: 'gagal', punca: 'sesi-tamat', sebab: 'sesi tamat (ujian)' } };
      }
      urutan.push('verifikasi-ulang');
      return { stdout: '', stderr: '', hasil: { status: 'tidak-berubah', sebab: 'tiada perubahan', kod: 0 } };
    }
    throw new Error('tidak dijangka mod ' + opsyen.mod);
  };
  const tutupKumpulanPelayar = async () => { urutan.push('tutup-kumpulan'); };
  const cubaLoginAutoKerja = async (opsyen) => {
    urutan.push('login-auto:' + JSON.stringify(opsyen));
    return { hasil: { perluManusia: false, sebab: '' } };
  };
  const g = buatGiliran({
    klien, pemilik: 'runner-1', log: logPalsu(), jalankanTugasanAnak, tutupKumpulanPelayar, cubaLoginAutoKerja
  });

  await g.jalankanSatuKitaran();

  // NOTA: `urutan` juga mengandungi satu panggilan login-auto RUTIN (tanpa
  // paksa) pada permulaan setiap kitaran (lihat jalankanSatuKitaran) — itu
  // BUKAN laluan sesi-tamat yang diuji di sini, jadi carian mesti khusus
  // kepada mesej "paksa":true.
  const idxPaksa = urutan.indexOf('login-auto:{"paksa":true}');
  const idxTutupSesiTamat = urutan.lastIndexOf('tutup-kumpulan', idxPaksa === -1 ? urutan.length : idxPaksa);
  assert.ok(idxPaksa !== -1, 'login-auto PAKSA mesti dipanggil selepas sesi-tamat dikesan');
  assert.ok(idxTutupSesiTamat !== -1 && idxTutupSesiTamat < idxPaksa, 'tutupKumpulanPelayar MESTI berlaku SEBELUM cubaLoginAutoKerja(paksa) (elak deadlock kunci reentrant)');
  assert.deepEqual(urutan.slice(idxTutupSesiTamat - 1, idxPaksa + 1), ['verifikasi-sesi-tamat', 'tutup-kumpulan', 'login-auto:{"paksa":true}']);
});

test('giliran+kumpulan: sesi TAMAT semasa hantar -> tutupKumpulanPelayar dipanggil SEBELUM cubaLoginAutoKerja(paksa)', async () => {
  const klien = klienPalsu([{ id: 'j1', status: 'menunggu', kelas: '1 BIJAK', tarikhIso: '2026-09-21', murid: [{ nama: 'MURID CONTOH SATU', kategori: 'D', sebab: 'DEMAM' }] }]);
  const urutan = [];
  let panggilanHantar = 0;
  const jalankanTugasanAnak = async (job, opsyen) => {
    if (opsyen.mod === 'verifikasi') return { stdout: '', stderr: '', hasil: { status: 'perlu-hantar', perubahan: 1, kod: 0 } };
    panggilanHantar++;
    if (panggilanHantar === 1) {
      urutan.push('hantar-sesi-tamat');
      return { stdout: '', stderr: '', hasil: { status: 'gagal', punca: 'sesi-tamat', sebab: 'sesi tamat (ujian)' } };
    }
    urutan.push('hantar-ulang');
    return { stdout: '', stderr: '', hasil: { status: 'disahkan', sebab: 'ok', bilHadir: 5, kod: 0 } };
  };
  const tutupKumpulanPelayar = async () => { urutan.push('tutup-kumpulan'); };
  const cubaLoginAutoKerja = async (opsyen) => {
    urutan.push('login-auto:' + JSON.stringify(opsyen));
    return { hasil: { perluManusia: false, sebab: '' } };
  };
  const g = buatGiliran({
    klien, pemilik: 'runner-1', log: logPalsu(), jalankanTugasanAnak, tutupKumpulanPelayar, cubaLoginAutoKerja
  });

  await g.jalankanSatuKitaran();

  const idxPaksa = urutan.indexOf('login-auto:{"paksa":true}');
  const idxTutup = urutan.lastIndexOf('tutup-kumpulan', idxPaksa === -1 ? urutan.length : idxPaksa);
  assert.ok(idxPaksa !== -1 && idxTutup !== -1 && idxTutup < idxPaksa, 'laluan sesi-tamat mod hantar juga mesti tutup kumpulan sebelum login-auto PAKSA');
});

test('giliran+kumpulan: jalankanTugasan (F2 manual) memanggil tutupKumpulanPelayar dalam finally', async () => {
  const klien = klienPalsu([{ id: 'j1', status: 'menunggu', kelas: '1 BIJAK', tarikhIso: '2026-09-21', murid: [] }]);
  let bilTutup = 0;
  const jalankanTugasanAnak = async () => ({ stdout: '', stderr: '', hasil: { status: 'tidak-berubah', sebab: 'tiada perubahan', kod: 0 } });
  const tutupKumpulanPelayar = async () => { bilTutup++; };
  const g = buatGiliran({ klien, pemilik: 'runner-1', log: logPalsu(), jalankanTugasanAnak, tutupKumpulanPelayar });

  await g.jalankanTugasan('j1');
  assert.equal(bilTutup, 1);
});

test('giliran+kumpulan: sahkanTugasan (F3 manual) memanggil tutupKumpulanPelayar dalam finally', async () => {
  let statusJob = 'tersimpan';
  const klien = {
    senarai: async () => [],
    klaim: async (id, pemilik, mod) => (mod === 'verifikasi' && statusJob === 'tersimpan' ? { id, kelas: '1 BIJAK', tarikhIso: '2026-09-21', murid: [] } : null),
    lepas: async () => {},
    selesai: async () => { statusJob = 'berjaya'; }
  };
  let bilTutup = 0;
  const jalankanTugasanAnak = async () => ({ stdout: '', stderr: '', hasil: { status: 'tidak-berubah', sebab: 'padan', kod: 0, bilHadir: 5 } });
  const tutupKumpulanPelayar = async () => { bilTutup++; };
  const g = buatGiliran({ klien, pemilik: 'runner-1', log: logPalsu(), jalankanTugasanAnak, tutupKumpulanPelayar });

  await g.sahkanTugasan('j1');
  assert.equal(bilTutup, 1);
});

test('giliran+kumpulan: tanpa tutupKumpulanPelayar disuntik, kitaran berfungsi seperti biasa (lalai tiada-op)', async () => {
  const klien = klienPalsu([{ id: 'j1', status: 'menunggu', kelas: '1 BIJAK', tarikhIso: '2026-09-21', murid: [] }]);
  const jalankanTugasanAnak = async () => ({ stdout: '', stderr: '', hasil: { status: 'tidak-berubah', sebab: 'tiada perubahan', kod: 0 } });
  const g = buatGiliran({ klien, pemilik: 'runner-1', log: logPalsu(), jalankanTugasanAnak });
  const r = await g.jalankanSatuKitaran();
  assert.equal(r.diproses, 1);
});

test('giliran+kumpulan: sedangProses KEKAL benar sepanjang penutupan kumpulan (tiada tugasan baharu bermula semasa tutup)', async () => {
  const klien = klienPalsu([{ id: 'j1', status: 'menunggu', kelas: '1 BIJAK', tarikhIso: '2026-09-21', murid: [] }]);
  let lepaskanTutup;
  const tutupGerai = new Promise((r) => { lepaskanTutup = r; });
  let tutupDipanggil = false;
  const jalankanTugasanAnak = async () => ({ stdout: '', stderr: '', hasil: { status: 'tidak-berubah', sebab: 'tiada perubahan', kod: 0 } });
  const tutupKumpulanPelayar = async () => { tutupDipanggil = true; await tutupGerai; };
  const g = buatGiliran({ klien, pemilik: 'runner-1', log: logPalsu(), jalankanTugasanAnak, tutupKumpulanPelayar });

  const janji = g.jalankanSatuKitaran();
  // Tunggu sehingga kitaran mencapai finally dan sedang menunggu penutupan.
  for (let i = 0; i < 50 && !tutupDipanggil; i++) await new Promise((r) => setTimeout(r, 5));
  assert.equal(tutupDipanggil, true, 'kitaran mesti sudah mencapai penutupan kumpulan');
  assert.equal(g.status().sedangProses, true, 'sedangProses mesti KEKAL benar semasa penutupan (elak race tugasan baharu)');

  lepaskanTutup();
  await janji;
  assert.equal(g.status().sedangProses, false);
});

test('giliran+kumpulan: berhenti() menghentikan timer (tiada tugasan seterusnya) dan menutup kumpulan sekali', async () => {
  const klien = klienPalsu([{ id: 'j1', status: 'menunggu', kelas: '1 BIJAK', tarikhIso: '2026-09-21', murid: [] }]);
  let bilTutup = 0;
  const jalankanTugasanAnak = async () => ({ stdout: '', stderr: '', hasil: { status: 'tidak-berubah', sebab: 'tiada perubahan', kod: 0 } });
  const tutupKumpulanPelayar = async () => { bilTutup++; };
  const g = buatGiliran({ klien, pemilik: 'runner-1', log: logPalsu(), jalankanTugasanAnak, tutupKumpulanPelayar });

  g.mulakan(30);
  assert.equal(g.status().aktif, true);

  await g.berhenti({ tungguMs: 1000 });
  assert.equal(g.status().aktif, false, 'berhenti mesti mematikan giliran');
  assert.equal(g.status().modMula, 'mati');
  assert.equal(bilTutup, 1, 'berhenti mesti menutup kumpulan sekali');
});

test('giliran+kumpulan: kegagalan penutupan kumpulan DIREKOD (gagal-tertutup), bukan ditelan senyap', async () => {
  const klien = klienPalsu([{ id: 'j1', status: 'menunggu', kelas: '1 BIJAK', tarikhIso: '2026-09-21', murid: [] }]);
  const jalankanTugasanAnak = async () => ({ stdout: '', stderr: '', hasil: { status: 'tidak-berubah', sebab: 'tiada perubahan', kod: 0 } });
  const tutupKumpulanPelayar = async () => { throw new Error('tutup gagal (ujian)'); };
  const g = buatGiliran({ klien, pemilik: 'runner-1', log: logPalsu(), jalankanTugasanAnak, tutupKumpulanPelayar });

  await g.jalankanSatuKitaran();  // tidak melontar; kegagalan tutup direkod
  assert.match(g.status().ralatTerakhir, /Penutupan kumpulan pelayar gagal/);
  assert.equal(g.status().sedangProses, false, 'sedangProses mesti kembali palsu selepas penutupan (walaupun gagal)');
});

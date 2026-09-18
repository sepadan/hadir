import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buatGiliran } from '../src/giliran.mjs';
import { mulakanPelayanUjian, mintaMentah, TOKEN_SAH } from './bantuan-server.mjs';

function klienPalsu(senaraiAwal) {
  const selesaiPanggilan = [];
  const lepasPanggilan = [];
  const dikunci = new Set();
  return {
    senarai: async () => senaraiAwal,
    klaim: async (id, pemilik) => {
      if (dikunci.has(id)) return null;
      dikunci.add(id);
      const job = senaraiAwal.find((j) => j.id === id);
      return { id, kelas: job.kelas, tarikhIso: job.tarikhIso, murid: job.murid || [] };
    },
    lepas: async (id, pemilik) => { lepasPanggilan.push({ id, pemilik }); dikunci.delete(id); },
    selesai: async (id, keputusan, mesej, bilHadir) => { selesaiPanggilan.push({ id, keputusan, mesej, bilHadir }); },
    _selesaiPanggilan: selesaiPanggilan, _lepasPanggilan: lepasPanggilan
  };
}

// Klien palsu yang mengekalkan status/pemilik satu tugasan dan meniru
// peraturan klaim backend (hadirMoeisJobKlaim_) supaya jalankanTugasan()/
// sahkanTugasan() (F2/F3) boleh diuji dengan realistik.
function klienPalsuLengkap(jobAwal) {
  const job = { pemilik: '', ...jobAwal };
  const selesaiPanggilan = [];
  const lepasPanggilan = [];
  const klaimPanggilan = [];
  return {
    senarai: async () => [{ id: job.id, status: job.status, kelas: job.kelas, tarikhIso: job.tarikhIso, murid: job.murid }],
    klaim: async (id, pemilik, benarkanCubaSemula) => {
      klaimPanggilan.push({ id, pemilik, benarkanCubaSemula });
      if (id !== job.id) return null;
      const verifikasiSahaja = job.status === 'tersimpan' && benarkanCubaSemula === 'verifikasi';
      let boleh = false;
      if (job.status === 'menunggu') boleh = true;
      else if (job.status === 'sedang_dihantar' && job.pemilik === pemilik) boleh = true;
      else if (job.status === 'gagal' && benarkanCubaSemula === true) boleh = true;
      else if (verifikasiSahaja) boleh = true;
      if (!boleh) return null;
      if (!verifikasiSahaja) job.status = 'sedang_dihantar';
      job.pemilik = pemilik;
      return { id: job.id, kelas: job.kelas, tarikhIso: job.tarikhIso, murid: job.murid || [] };
    },
    lepas: async (id, pemilik) => { lepasPanggilan.push({ id, pemilik }); if (job.id === id) job.status = 'menunggu'; },
    selesai: async (id, keputusan, mesej, bilHadir) => {
      selesaiPanggilan.push({ id, keputusan, mesej, bilHadir });
      if (job.id === id) job.status = keputusan;
    },
    _job: () => job, _selesaiPanggilan: selesaiPanggilan, _lepasPanggilan: lepasPanggilan, _klaimPanggilan: klaimPanggilan
  };
}

function logPalsu() {
  const kerja = [];
  return { tulis: () => {}, tulisKerja: (id, teks) => kerja.push({ id, teks }), bacaTerakhir: () => [], _kerja: kerja };
}

test('klaim atomik: dua runner cuba job sama, hanya satu memproses', async () => {
  const klien = klienPalsu([{ id: 'j1', status: 'menunggu', kelas: '1 BIJAK', tarikhIso: '2026-09-18', murid: [] }]);
  const jalankanTugasanAnak = async () => ({ stdout: '', stderr: '', hasil: { status: 'tidak-berubah', sebab: 'tiada perubahan', kod: 0 } });
  const log = logPalsu();
  const g1 = buatGiliran({ klien, pemilik: 'runner-1', log, jalankanTugasanAnak });
  const g2 = buatGiliran({ klien, pemilik: 'runner-2', log, jalankanTugasanAnak });

  const [r1, r2] = await Promise.all([g1.jalankanSatuKitaran(), g2.jalankanSatuKitaran()]);
  const jumlahDiproses = r1.diproses + r2.diproses;
  assert.equal(jumlahDiproses, 1, 'hanya satu runner sepatutnya berjaya memproses job yang sama');
  assert.equal(klien._selesaiPanggilan.length, 1);
});

test('hasil tersimpan dilaporkan sebagai tersimpan, bukan berjaya, tiada ulang', async () => {
  const klien = klienPalsu([{ id: 'j2', status: 'menunggu', kelas: '1 BIJAK', tarikhIso: '2026-09-18', murid: [{ nama: 'MURID CONTOH SATU', kategori: 'D', sebab: 'DEMAM' }] }]);
  let panggilan = 0;
  const jalankanTugasanAnak = async (job, opsyen) => {
    panggilan++;
    if (opsyen.mod === 'verifikasi') return { stdout: '', stderr: '', hasil: { status: 'perlu-hantar', perubahan: 1, kod: 0 } };
    // Kunci tingkah laku: giliran mesti menekan "Simpan & Sahkan", bukan
    // "Simpan" sahaja — jika tidak, rekod MOEIS tinggal "Menunggu pengesahan"
    // dan guru terpaksa menyelesaikannya secara manual.
    assert.equal(opsyen.sahkan, true, 'mod hantar giliran mesti sahkan');
    return { stdout: '', stderr: '', hasil: { status: 'tersimpan', sebab: 'dialog berjaya, pengesahan tidak lengkap', bilHadir: 10, kod: 6 } };
  };
  const log = logPalsu();
  const g = buatGiliran({ klien, pemilik: 'runner-1', log, jalankanTugasanAnak });
  await g.jalankanSatuKitaran();
  assert.equal(klien._selesaiPanggilan.length, 1);
  assert.equal(klien._selesaiPanggilan[0].keputusan, 'tersimpan');
  assert.notEqual(klien._selesaiPanggilan[0].keputusan, 'berjaya');
  assert.equal(panggilan, 2, 'verifikasi + hantar sahaja, tiada cubaan ulang automatik selepas tersimpan');
});

test('konflik (semua hadir tetapi MOEIS ada murid tidak hadir tambahan) dilaporkan gagal, bukan berjaya', async () => {
  const klien = klienPalsu([{ id: 'j3', status: 'menunggu', kelas: '1 BIJAK', tarikhIso: '2026-09-18', murid: [] }]);
  const jalankanTugasanAnak = async (job, opsyen) => {
    assert.equal(opsyen.mod, 'verifikasi', 'kerja semua-hadir dengan konflik tidak boleh sampai ke mod hantar');
    return { stdout: '', stderr: '', hasil: { status: 'konflik', sebab: 'MOEIS ada murid tidak hadir tambahan', kod: 10 } };
  };
  const log = logPalsu();
  const g = buatGiliran({ klien, pemilik: 'runner-1', log, jalankanTugasanAnak });
  await g.jalankanSatuKitaran();
  assert.equal(klien._selesaiPanggilan[0].keputusan, 'gagal');
});

test('kerja semua-hadir yang padan -> berjaya tiada perubahan, tiada klik simpan (mod hantar tidak dipanggil)', async () => {
  const klien = klienPalsu([{ id: 'j4', status: 'menunggu', kelas: '1 BIJAK', tarikhIso: '2026-09-18', murid: [] }]);
  let modDipanggil = [];
  const jalankanTugasanAnak = async (job, opsyen) => {
    modDipanggil.push(opsyen.mod);
    return { stdout: '', stderr: 'ERR-BARIS-UJIAN', hasil: { status: 'tidak-berubah', sebab: 'tiada perubahan', kod: 0 } };
  };
  const log = logPalsu();
  const g = buatGiliran({ klien, pemilik: 'runner-1', log, jalankanTugasanAnak });
  await g.jalankanSatuKitaran();
  assert.deepEqual(modDipanggil, ['verifikasi']);
  assert.equal(klien._selesaiPanggilan[0].keputusan, 'berjaya');
});

test('stderr anak dikekalkan dalam log kerja', async () => {
  const klien = klienPalsu([{ id: 'j5', status: 'menunggu', kelas: '1 BIJAK', tarikhIso: '2026-09-18', murid: [] }]);
  const jalankanTugasanAnak = async () => ({ stdout: 'stdout biasa', stderr: 'ERR-BARIS-UJIAN', hasil: { status: 'tidak-berubah', sebab: 'x', kod: 0 } });
  const log = logPalsu();
  const g = buatGiliran({ klien, pemilik: 'runner-1', log, jalankanTugasanAnak });
  await g.jalankanSatuKitaran();
  const gabungan = log._kerja.map((k) => k.teks).join('\n');
  assert.match(gabungan, /ERR-BARIS-UJIAN/);
});

test('tiada job menunggu -> tiada panggilan hantar/selesai', async () => {
  const klien = klienPalsu([]);
  let dipanggil = false;
  const jalankanTugasanAnak = async () => { dipanggil = true; return { hasil: { status: 'tidak-berubah', kod: 0 } }; };
  const g = buatGiliran({ klien, pemilik: 'runner-1', log: logPalsu(), jalankanTugasanAnak });
  const r = await g.jalankanSatuKitaran();
  assert.equal(r.diproses, 0);
  assert.equal(dipanggil, false);
});

// ---------------- F2: /api/kerja-jalan mesti jalankan SATU tugasan sahaja ----------------

test('giliran.jalankanTugasan: memproses hanya id yang diminta, mengabaikan tugasan lain', async () => {
  const klien = klienPalsuLengkap({ id: 'jx', status: 'menunggu', kelas: '1 BIJAK', tarikhIso: '2026-09-18', murid: [] });
  const jalankanTugasanAnak = async () => ({ stdout: '', stderr: '', hasil: { status: 'tidak-berubah', sebab: 'x', kod: 0 } });
  const g = buatGiliran({ klien, pemilik: 'admin-manual', log: logPalsu(), jalankanTugasanAnak });
  const r = await g.jalankanTugasan('jx', { benarkanCubaSemula: true });
  assert.equal(r.diproses, 1);
  assert.equal(klien._selesaiPanggilan.length, 1);
  assert.equal(klien._selesaiPanggilan[0].id, 'jx');
});

test('giliran.jalankanTugasan: klaim gagal (dipegang enjin lain) -> diproses 0, tiada tulisan ke HADIR', async () => {
  const klien = klienPalsuLengkap({ id: 'jy', status: 'sedang_dihantar', pemilik: 'enjin-lain', kelas: '1 BIJAK', tarikhIso: '2026-09-18', murid: [] });
  const jalankanTugasanAnak = async () => { throw new Error('tidak sepatutnya dipanggil apabila klaim gagal'); };
  const g = buatGiliran({ klien, pemilik: 'admin-manual', log: logPalsu(), jalankanTugasanAnak });
  const r = await g.jalankanTugasan('jy', { benarkanCubaSemula: true });
  assert.equal(r.diproses, 0);
  assert.match(r.sebab, /Tidak boleh diklaim/);
  assert.equal(klien._selesaiPanggilan.length, 0);
});

test('giliran.jalankanTugasan: benarkanCubaSemula=true membolehkan cuba semula tugasan gagal', async () => {
  const klien = klienPalsuLengkap({ id: 'jz', status: 'gagal', kelas: '1 BIJAK', tarikhIso: '2026-09-18', murid: [] });
  const jalankanTugasanAnak = async () => ({ stdout: '', stderr: '', hasil: { status: 'tidak-berubah', sebab: 'x', kod: 0 } });
  const g = buatGiliran({ klien, pemilik: 'admin-manual', log: logPalsu(), jalankanTugasanAnak });
  const r = await g.jalankanTugasan('jz', { benarkanCubaSemula: true });
  assert.equal(r.diproses, 1);
  assert.equal(klien._klaimPanggilan[0].benarkanCubaSemula, true);
});

test('giliran.jalankanTugasan: mod hantar manual tidak pernah membawa --paksa', async () => {
  const klien = klienPalsuLengkap({
    id: 'jp', status: 'menunggu', kelas: '1 BIJAK', tarikhIso: '2026-09-18',
    murid: [{ nama: 'MURID CONTOH SATU', kategori: 'D', sebab: 'DEMAM' }]
  });
  const opsyenDipanggil = [];
  const jalankanTugasanAnak = async (job, opsyen) => {
    opsyenDipanggil.push(opsyen);
    if (opsyen.mod === 'verifikasi') return { stdout: '', stderr: '', hasil: { status: 'perlu-hantar', perubahan: 1, kod: 0 } };
    return { stdout: '', stderr: '', hasil: { status: 'disahkan', sebab: 'ok', kod: 0 } };
  };
  const g = buatGiliran({ klien, pemilik: 'admin-manual', log: logPalsu(), jalankanTugasanAnak });
  await g.jalankanTugasan('jp', { benarkanCubaSemula: true });
  opsyenDipanggil.forEach((o) => assert.ok(!o.paksa, 'giliran tidak boleh menghantar --paksa secara automatik: ' + JSON.stringify(o)));
});

// ---------------- F3: /api/kerja-sah — pemulihan baca sahaja tugasan 'tersimpan' ----------------

test('giliran.sahkanTugasan: hanya jalankan mod verifikasi, tidak pernah mod hantar', async () => {
  const klien = klienPalsuLengkap({
    id: 'jt', status: 'tersimpan', kelas: '1 BIJAK', tarikhIso: '2026-09-18',
    murid: [{ nama: 'MURID CONTOH SATU', kategori: 'D', sebab: 'DEMAM' }]
  });
  const modDipanggil = [];
  const jalankanTugasanAnak = async (job, opsyen) => {
    modDipanggil.push(opsyen.mod);
    return { stdout: '', stderr: '', hasil: { status: 'tidak-berubah', sebab: 'padan', bilHadir: 5, kod: 0 } };
  };
  const g = buatGiliran({ klien, pemilik: 'admin-manual', log: logPalsu(), jalankanTugasanAnak });
  const r = await g.sahkanTugasan('jt');
  assert.deepEqual(modDipanggil, ['verifikasi']);
  assert.equal(klien._selesaiPanggilan[0].keputusan, 'berjaya');
  assert.equal(r.diproses, 1);
});

test('giliran.sahkanTugasan: tugasan bukan status tersimpan tidak boleh diklaim', async () => {
  const klien = klienPalsuLengkap({ id: 'ju', status: 'menunggu', kelas: '1 BIJAK', tarikhIso: '2026-09-18', murid: [] });
  const jalankanTugasanAnak = async () => { throw new Error('tidak sepatutnya dipanggil'); };
  const g = buatGiliran({ klien, pemilik: 'admin-manual', log: logPalsu(), jalankanTugasanAnak });
  const r = await g.sahkanTugasan('ju');
  assert.equal(r.diproses, 0);
});

test('giliran.sahkanTugasan: masih ada perubahan/konflik -> gagal (tindakan manusia), tiada hantar automatik', async () => {
  const klien = klienPalsuLengkap({
    id: 'jv', status: 'tersimpan', kelas: '1 BIJAK', tarikhIso: '2026-09-18',
    murid: [{ nama: 'MURID CONTOH SATU', kategori: 'D', sebab: 'DEMAM' }]
  });
  const modDipanggil = [];
  const jalankanTugasanAnak = async (job, opsyen) => {
    modDipanggil.push(opsyen.mod);
    return { stdout: '', stderr: '', hasil: { status: 'konflik', sebab: 'MOEIS ada murid tidak hadir tambahan', kod: 10 } };
  };
  const g = buatGiliran({ klien, pemilik: 'admin-manual', log: logPalsu(), jalankanTugasanAnak });
  const r = await g.sahkanTugasan('jv');
  assert.deepEqual(modDipanggil, ['verifikasi']);
  assert.equal(klien._selesaiPanggilan[0].keputusan, 'gagal');
  assert.match(klien._selesaiPanggilan[0].mesej, /manusia/);
  assert.equal(r.diproses, 1);
});

test('POST /api/mula -> 409 apabila klaim atomik tidak disokong; giliran kekal mati', async () => {
  let mulaDipanggil = false;
  const { pelayan, port } = await mulakanPelayanUjian({
    klaimDisokong: async () => false,
    giliran: { status: () => ({ aktif: false }), mulakan: () => { mulaDipanggil = true; }, hentikan: () => {}, jalankanSatuKitaran: async () => ({}) }
  });
  try {
    const r = await mintaMentah(port, {
      method: 'POST', laluan: '/api/mula',
      headers: { Origin: 'https://sepadan.github.io', Authorization: `Bearer ${TOKEN_SAH}`, 'Content-Type': 'application/json' },
      badan: '{}'
    });
    assert.equal(r.status, 409);
    assert.match(r.json.ralat, /klaim atomik/);
    assert.equal(mulaDipanggil, false);
  } finally { pelayan.close(); }
});

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
      else if (job.status === 'sedang_dihantar' && job.pemilik !== pemilik && typeof job.leaseMs === 'number' && job.leaseMs < Date.now()) boleh = true; // lease luput -> runner mati
      else if (job.status === 'sedang_dihantar' && job.pemilik === '' && (job.leaseMs === undefined || job.leaseMs === null || job.leaseMs === '')) boleh = true; // tiada pemilik & tiada lease
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

// Pepijat nyata (18 Sep 2026): penulisan kehadiran BERJAYA di MOEIS (status
// 'disahkan', 23 hadir / 1 tidak hadir) tetapi laporan ke HADIR gagal kerana
// Apps Script memulangkan 404, jadi HADIR memaparkan "Ralat runner" sedangkan
// rekod sudah siap. Laporan status ialah kemas kini idempoten — ia boleh dan
// mesti dicuba semula; penulisan MOEIS TIDAK boleh diulang.
test('laporan ke HADIR dicuba semula selepas 404, penulisan MOEIS tidak diulang', async () => {
  const klien = klienPalsu([{ id: 'j9', status: 'menunggu', kelas: '2 CERDIK', tarikhIso: '2026-09-18', murid: [] }]);
  const selesaiAsal = klien.selesai.bind(klien);
  let panggilanLapor = 0;
  klien.selesai = async (...args) => {
    panggilanLapor++;
    if (panggilanLapor <= 2) throw new Error('Balasan bukan JSON (status 404).');
    return selesaiAsal(...args);
  };
  let modHantar = 0;
  const jalankanTugasanAnak = async (job, opsyen) => {
    if (opsyen.mod === 'hantar') modHantar++;
    if (opsyen.mod === 'verifikasi') return { stdout: '', stderr: '', hasil: { status: 'perlu-hantar', perubahan: 1, kod: 0 } };
    return { stdout: '', stderr: '', hasil: { status: 'disahkan', sebab: 'Pengesahan selepas muat semula berjaya.', bilHadir: 23, kod: 0 } };
  };
  const g = buatGiliran({ klien, pemilik: 'runner-1', log: logPalsu(), jalankanTugasanAnak });
  await g.jalankanSatuKitaran();

  assert.equal(panggilanLapor, 3, 'laporan dicuba semula sehingga berjaya');
  assert.equal(klien._selesaiPanggilan.length, 1, 'hanya satu laporan berjaya dicatat');
  assert.equal(klien._selesaiPanggilan[0].keputusan, 'berjaya', 'hasil sebenar MOEIS mesti dilaporkan sebagai berjaya');
  assert.equal(modHantar, 1, 'penulisan MOEIS tidak boleh diulang');
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

// ---------------- Log masuk idMe automatik job-time (retry semasa sesi tamat) ----------------

test('cycle-time: cubaLoginAutoKerja dipanggil TEPAT SEKALI setiap jalankanSatuKitaran, tugasan diteruskan', async () => {
  const klien = klienPalsu([{ id: 'jla1', status: 'menunggu', kelas: '1 BIJAK', tarikhIso: '2026-09-18', murid: [] }]);
  let panggilanLoginAuto = 0;
  const cubaLoginAutoKerjaFake = async () => { panggilanLoginAuto++; return { diminta: true, cuba: true }; };
  const modDipanggil = [];
  const jalankanTugasanAnak = async (job, opsyen) => {
    modDipanggil.push(opsyen.mod);
    if (opsyen.mod === 'verifikasi') return { stdout: '', stderr: '', hasil: { status: 'perlu-hantar', perubahan: 1, kod: 0 } };
    return { stdout: '', stderr: '', hasil: { status: 'disahkan', sebab: 'ok', bilHadir: 5, kod: 0 } };
  };
  const log = logPalsu();
  const g = buatGiliran({ klien, pemilik: 'runner-1', log, jalankanTugasanAnak, cubaLoginAutoKerja: cubaLoginAutoKerjaFake });
  const r = await g.jalankanSatuKitaran();
  assert.equal(panggilanLoginAuto, 1, 'cubaLoginAutoKerja mesti dipanggil tepat sekali (titik kitaran, sebelum klaim)');
  assert.deepEqual(modDipanggil, ['verifikasi', 'hantar']);
  assert.equal(klien._selesaiPanggilan[0].keputusan, 'berjaya');
  assert.equal(r.diproses, 1);
});

test('loginAuto tidak disuntik: jalankanSatuKitaran berjalan seperti biasa, tiada percubaan log masuk', async () => {
  const klien = klienPalsu([{ id: 'jla2', status: 'menunggu', kelas: '1 BIJAK', tarikhIso: '2026-09-18', murid: [] }]);
  let panggilanLoginAuto = 0;
  const jalankanTugasanAnak = async () => ({ stdout: '', stderr: '', hasil: { status: 'tidak-berubah', sebab: 'x', kod: 0 } });
  const log = logPalsu();
  // cubaLoginAutoKerja SENGAJA tidak dihantar ke buatGiliran (opsyen).
  const g = buatGiliran({ klien, pemilik: 'runner-1', log, jalankanTugasanAnak });
  const r = await g.jalankanSatuKitaran();
  assert.equal(panggilanLoginAuto, 0, 'fungsi tempatan yang tidak disuntik tidak boleh dipanggil oleh giliran');
  assert.equal(r.diproses, 1);
  assert.equal(klien._selesaiPanggilan[0].keputusan, 'berjaya');
});

test('sesi tamat semasa verifikasi: SATU percubaan log masuk automatik, kerja berjaya selepas cuba semula', async () => {
  const klien = klienPalsuLengkap({ id: 'jse1', status: 'menunggu', kelas: '1 BIJAK', tarikhIso: '2026-09-18', murid: [] });
  let panggilanLoginAuto = 0;
  const cubaLoginAutoKerjaFake = async () => { panggilanLoginAuto++; return { diminta: true, cuba: true }; };
  let panggilan = 0;
  const jalankanTugasanAnak = async (job, opsyen) => {
    panggilan++;
    if (panggilan === 1) {
      assert.equal(opsyen.mod, 'verifikasi');
      return { stdout: '', stderr: '', hasil: { status: 'gagal', kod: 11, punca: 'sesi-tamat', perluManusia: true, sebab: 'Sesi idMe tamat.' } };
    }
    if (panggilan === 2) {
      assert.equal(opsyen.mod, 'verifikasi');
      return { stdout: '', stderr: '', hasil: { status: 'perlu-hantar', perubahan: 1, kod: 0 } };
    }
    assert.equal(opsyen.mod, 'hantar');
    return { stdout: '', stderr: '', hasil: { status: 'disahkan', sebab: 'ok', bilHadir: 5, kod: 0 } };
  };
  const g = buatGiliran({ klien, pemilik: 'runner-1', log: logPalsu(), jalankanTugasanAnak, cubaLoginAutoKerja: cubaLoginAutoKerjaFake });
  const r = await g.jalankanTugasan('jse1', { benarkanCubaSemula: true });
  assert.equal(panggilanLoginAuto, 1, 'log masuk automatik dicuba tepat sekali');
  assert.equal(panggilan, 3, 'verifikasi, verifikasi-ulang, hantar');
  assert.equal(klien._selesaiPanggilan[klien._selesaiPanggilan.length - 1].keputusan, 'berjaya');
  assert.equal(r.diproses, 1);
});

test('sesi tamat berterusan: tidak lebih daripada SATU cubaan semula tugasan, kemudian gagal', async () => {
  const klien = klienPalsuLengkap({ id: 'jse2', status: 'menunggu', kelas: '1 BIJAK', tarikhIso: '2026-09-18', murid: [] });
  let panggilanLoginAuto = 0;
  const cubaLoginAutoKerjaFake = async () => { panggilanLoginAuto++; return { diminta: true, cuba: true }; };
  let panggilan = 0;
  const jalankanTugasanAnak = async () => {
    panggilan++;
    return { stdout: '', stderr: '', hasil: { status: 'gagal', kod: 11, punca: 'sesi-tamat', perluManusia: true, sebab: 'Sesi idMe tamat.' } };
  };
  const g = buatGiliran({ klien, pemilik: 'runner-1', log: logPalsu(), jalankanTugasanAnak, cubaLoginAutoKerja: cubaLoginAutoKerjaFake });
  await g.jalankanTugasan('jse2', { benarkanCubaSemula: true });
  assert.equal(panggilanLoginAuto, 1, 'log masuk automatik tidak boleh dicuba lebih daripada sekali per tugasan');
  assert.equal(panggilan, 2, 'verifikasi + satu cubaan semula sahaja, tiada gelung tanpa hujung');
  assert.equal(klien._selesaiPanggilan.filter((p) => p.keputusan === 'gagal').length, 1);
});

test('CAPTCHA (punca captcha) TIDAK PERNAH dicuba log masuk semula automatik', async () => {
  const klien = klienPalsuLengkap({ id: 'jse3', status: 'menunggu', kelas: '1 BIJAK', tarikhIso: '2026-09-18', murid: [] });
  let panggilanLoginAuto = 0;
  const cubaLoginAutoKerjaFake = async () => { panggilanLoginAuto++; return { diminta: true, cuba: true }; };
  let panggilan = 0;
  const jalankanTugasanAnak = async () => {
    panggilan++;
    return { stdout: '', stderr: '', hasil: { status: 'gagal', kod: 11, punca: 'captcha', perluManusia: true, sebab: 'CAPTCHA dikesan.' } };
  };
  const g = buatGiliran({ klien, pemilik: 'runner-1', log: logPalsu(), jalankanTugasanAnak, cubaLoginAutoKerja: cubaLoginAutoKerjaFake });
  await g.jalankanTugasan('jse3', { benarkanCubaSemula: true });
  assert.equal(panggilanLoginAuto, 0, 'CAPTCHA memerlukan manusia; tiada log masuk automatik dicuba');
  assert.equal(panggilan, 1);
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

// ---------------- Log masuk idMe PAKSA pada isyarat sesi-tamat hidup ----------------

test('sesi tamat: cubaLoginAutoKerja dipanggil dengan {paksa:true} (bypass cache)', async () => {
  const klien = klienPalsuLengkap({ id: 'jpf1', status: 'menunggu', kelas: '1 BIJAK', tarikhIso: '2026-09-18', murid: [] });
  const opsyenDipanggil = [];
  const cubaLoginAutoKerjaFake = async (opsyen) => { opsyenDipanggil.push(opsyen); return { diminta: true, cuba: true }; };
  let panggilan = 0;
  const jalankanTugasanAnak = async (job, opsyen) => {
    panggilan++;
    if (panggilan === 1) {
      assert.equal(opsyen.mod, 'verifikasi');
      return { stdout: '', stderr: '', hasil: { status: 'gagal', kod: 11, punca: 'sesi-tamat', perluManusia: true, sebab: 'Sesi idMe tamat.' } };
    }
    if (panggilan === 2) {
      assert.equal(opsyen.mod, 'verifikasi');
      return { stdout: '', stderr: '', hasil: { status: 'perlu-hantar', perubahan: 1, kod: 0 } };
    }
    assert.equal(opsyen.mod, 'hantar');
    return { stdout: '', stderr: '', hasil: { status: 'disahkan', sebab: 'ok', bilHadir: 5, kod: 0 } };
  };
  const g = buatGiliran({ klien, pemilik: 'runner-1', log: logPalsu(), jalankanTugasanAnak, cubaLoginAutoKerja: cubaLoginAutoKerjaFake });
  await g.jalankanTugasan('jpf1', { benarkanCubaSemula: true });
  assert.equal(opsyenDipanggil.length, 1, 'tepat satu log masuk paksa');
  assert.deepEqual(opsyenDipanggil[0], { paksa: true });
  assert.equal(panggilan, 3, 'verifikasi + satu cubaan semula + hantar');
  assert.equal(klien._selesaiPanggilan[klien._selesaiPanggilan.length - 1].keputusan, 'berjaya');
});

test('sesi tamat + log masuk paksa perlu-manusia -> TIADA cubaan semula tugasan, gagal dengan sebab jelas', async () => {
  const klien = klienPalsuLengkap({ id: 'jpm1', status: 'menunggu', kelas: '1 BIJAK', tarikhIso: '2026-09-18', murid: [] });
  let panggilanLoginAuto = 0;
  const cubaLoginAutoKerjaFake = async () => { panggilanLoginAuto++; return { diminta: true, cuba: true, hasil: { status: 'perlu-manusia', perluManusia: true, sebab: 'CAPTCHA dikesan.' } }; };
  let panggilan = 0;
  const jalankanTugasanAnak = async () => {
    panggilan++;
    return { stdout: '', stderr: '', hasil: { status: 'gagal', kod: 11, punca: 'sesi-tamat', perluManusia: true, sebab: 'Sesi idMe tamat.' } };
  };
  const g = buatGiliran({ klien, pemilik: 'runner-1', log: logPalsu(), jalankanTugasanAnak, cubaLoginAutoKerja: cubaLoginAutoKerjaFake });
  await g.jalankanTugasan('jpm1', { benarkanCubaSemula: true });
  assert.equal(panggilanLoginAuto, 1, 'SATU log masuk paksa');
  assert.equal(panggilan, 1, 'tiada cubaan semula tugasan (perlu-manusia)');
  const selesaiGagal = klien._selesaiPanggilan.filter((p) => p.keputusan === 'gagal');
  assert.equal(selesaiGagal.length, 1);
  assert.match(selesaiGagal[0].mesej, /memerlukan manusia/);
});

test('sesi tamat + log masuk paksa GAGAL teknikal (had cubaan) -> tiada cubaan semula senyap, sebab jelas', async () => {
  const klien = klienPalsuLengkap({ id: 'jpt1', status: 'menunggu', kelas: '1 BIJAK', tarikhIso: '2026-09-18', murid: [] });
  const cubaLoginAutoKerjaFake = async () => ({ diminta: true, cuba: true, hasil: { status: 'gagal', perluManusia: true, sebab: 'had cubaan tercapai.' } });
  let panggilan = 0;
  const jalankanTugasanAnak = async () => { panggilan++; return { stdout: '', stderr: '', hasil: { status: 'gagal', kod: 11, punca: 'sesi-tamat', perluManusia: true, sebab: 'Sesi idMe tamat.' } }; };
  const g = buatGiliran({ klien, pemilik: 'runner-1', log: logPalsu(), jalankanTugasanAnak, cubaLoginAutoKerja: cubaLoginAutoKerjaFake });
  await g.jalankanTugasan('jpt1', { benarkanCubaSemula: true });
  assert.equal(panggilan, 1, 'tiada cubaan semula tugasan');
  assert.equal(klien._selesaiPanggilan.filter((p) => p.keputusan === 'gagal').length, 1);
});

test('cycle-time: segarkanSesiCache dithrottle kepada sekali setiap selang (bounded refresh)', async () => {
  const klien = klienPalsu([]);
  let panggilanSegar = 0;
  const segarkanSesiCache = async () => { panggilanSegar++; };
  let masa = 10_000;
  const sekarangMs = () => masa;
  const cubaLoginAutoKerjaFake = async () => ({ diminta: true, cuba: true });
  const jalankanTugasanAnak = async () => ({ stdout: '', stderr: '', hasil: { status: 'tidak-berubah', sebab: 'x', kod: 0 } });
  const g = buatGiliran({ klien, pemilik: 'runner-1', log: logPalsu(), jalankanTugasanAnak, cubaLoginAutoKerja: cubaLoginAutoKerjaFake, segarkanSesiCache, jedaSegarSesiMs: 10_000, sekarangMs });
  await g.jalankanSatuKitaran();
  assert.equal(panggilanSegar, 1, 'segaran pertama pada kitaran pertama');
  masa = 15_000;
  await g.jalankanSatuKitaran();
  assert.equal(panggilanSegar, 1, 'tidak segar semula dalam selang');
  masa = 20_000;
  await g.jalankanSatuKitaran();
  assert.equal(panggilanSegar, 2, 'segar semula selepas selang luput');
});

test('cycle-time: tiada segarkanSesiCache disuntik -> tiada perubahan kelakuan', async () => {
  const klien = klienPalsu([{ id: 'jns1', status: 'menunggu', kelas: '1 BIJAK', tarikhIso: '2026-09-18', murid: [] }]);
  let panggilanLoginAuto = 0;
  const cubaLoginAutoKerjaFake = async () => { panggilanLoginAuto++; return { diminta: true, cuba: true }; };
  const jalankanTugasanAnak = async () => ({ stdout: '', stderr: '', hasil: { status: 'tidak-berubah', sebab: 'x', kod: 0 } });
  const g = buatGiliran({ klien, pemilik: 'runner-1', log: logPalsu(), jalankanTugasanAnak, cubaLoginAutoKerja: cubaLoginAutoKerjaFake });
  const r = await g.jalankanSatuKitaran();
  assert.equal(panggilanLoginAuto, 1);
  assert.equal(r.diproses, 1);
});

// --- Pemulihan tugasan tersekat ('sedang_dihantar' oleh enjin mati/restart) ---

test('pemulihan tersekat: tugasan sedang_dihantar dengan lease luput diklaim semula oleh enjin lain', async () => {
  const klien = klienPalsuLengkap({ id: 'jstuck1', status: 'sedang_dihantar', pemilik: 'runner-lama', leaseMs: Date.now() - 60 * 1000, kelas: '3 BIJAK', tarikhIso: '2026-09-21', murid: [] });
  const jalankanTugasanAnak = async (job, opsyen) => opsyen.mod === 'verifikasi'
    ? { stdout: '', stderr: '', hasil: { status: 'perlu-hantar', sebab: 'x', kod: 0 } }
    : { stdout: '', stderr: '', hasil: { status: 'disahkan', sebab: 'ok', bilHadir: 0, kod: 0 } };
  const g = buatGiliran({ klien, pemilik: 'runner-baharu', log: logPalsu(), jalankanTugasanAnak });
  const r = await g.jalankanSatuKitaran();
  assert.equal(r.diproses, 1, 'tugasan sedang_dihantar dengan lease luput mesti diklaim semula');
  assert.equal(klien._klaimPanggilan.length, 1);
  assert.equal(klien._klaimPanggilan[0].id, 'jstuck1');
  assert.equal(klien._selesaiPanggilan[0].keputusan, 'berjaya');
});

test('pemulihan tersekat: restart (pemilik sama) klaim semula tugasan sedang_dihantar SEGERA tanpa tunggu lease luput', async () => {
  // Enjin dimulakan semula dengan `pemilik` STABIL yang sama -> klaim pemilik
  // sama dibenarkan walau lease belum luput (heartbeat lease baris 940).
  const klien = klienPalsuLengkap({ id: 'jstuck2', status: 'sedang_dihantar', pemilik: 'id-enjin-stabil', leaseMs: Date.now() + 10 * 60 * 1000, kelas: '3 BIJAK', tarikhIso: '2026-09-21', murid: [] });
  const jalankanTugasanAnak = async () => ({ stdout: '', stderr: '', hasil: { status: 'tidak-berubah', sebab: 'tiada perubahan', kod: 0 } });
  const g = buatGiliran({ klien, pemilik: 'id-enjin-stabil', log: logPalsu(), jalankanTugasanAnak });
  const r = await g.jalankanSatuKitaran();
  assert.equal(r.diproses, 1);
  assert.equal(klien._selesaiPanggilan[0].keputusan, 'berjaya');
});

test('pemulihan tersekat: tugasan sedang_dihantar dipegang enjin HIDUP (lease sah) TIDAK dirampas', async () => {
  const klien = klienPalsuLengkap({ id: 'jstuck3', status: 'sedang_dihantar', pemilik: 'runner-hidup', leaseMs: Date.now() + 10 * 60 * 1000, kelas: '3 BIJAK', tarikhIso: '2026-09-21', murid: [] });
  let dipanggil = false;
  const jalankanTugasanAnak = async () => { dipanggil = true; return { hasil: { status: 'tidak-berubah', kod: 0 } }; };
  const g = buatGiliran({ klien, pemilik: 'runner-baharu', log: logPalsu(), jalankanTugasanAnak });
  const r = await g.jalankanSatuKitaran();
  assert.equal(r.diproses, 0, 'lease sah oleh enjin lain tidak boleh dirampas');
  assert.equal(dipanggil, false, 'tiada kerja dijalankan untuk tugasan yang masih dipegang');
});

test('pemulihan tersekat: tugasan sedang_dihantar tanpa pemilik & tanpa lease boleh diklaim', async () => {
  const klien = klienPalsuLengkap({ id: 'jstuck4', status: 'sedang_dihantar', pemilik: '', leaseMs: '', kelas: '3 BIJAK', tarikhIso: '2026-09-21', murid: [] });
  const jalankanTugasanAnak = async () => ({ stdout: '', stderr: '', hasil: { status: 'tidak-berubah', sebab: 'tiada perubahan', kod: 0 } });
  const g = buatGiliran({ klien, pemilik: 'runner-baharu', log: logPalsu(), jalankanTugasanAnak });
  const r = await g.jalankanSatuKitaran();
  assert.equal(r.diproses, 1, 'tugasan yatim tanpa pemilik/lease mesti boleh diklaim');
});

test('pemulihan tersekat: lease korup (bukan nombor) dengan pemilik bukan kosong TIDAK dirampas (fail tertutup)', async () => {
  // leaseMs bukan nombor (cth rentetan sampah) + pemilik bukan kosong mesti kekal
  // gagal-tertutup: enjin lain tidak boleh merampas tugasan yang lease-nya tidak
  // boleh ditafsir (penemuan semakan bebas sebelum ini).
  const klien = klienPalsuLengkap({ id: 'jstuck5', status: 'sedang_dihantar', pemilik: 'runner-lama', leaseMs: 'abc', kelas: '3 BIJAK', tarikhIso: '2026-09-21', murid: [] });
  let dipanggil = false;
  const jalankanTugasanAnak = async () => { dipanggil = true; return { hasil: { status: 'tidak-berubah', kod: 0 } }; };
  const g = buatGiliran({ klien, pemilik: 'runner-baharu', log: logPalsu(), jalankanTugasanAnak });
  const r = await g.jalankanSatuKitaran();
  assert.equal(r.diproses, 0, 'lease korup + pemilik bukan kosong tidak boleh dirampas');
  assert.equal(dipanggil, false);
});

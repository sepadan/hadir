import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buatGiliran } from '../src/giliran.mjs';

function logPalsu() {
  return { tulis: () => {}, tulisKerja: () => {}, bacaTerakhir: () => [] };
}

function klienPalsu(senarai) {
  const panggilan = { klaim: [], lepas: [], selesai: [] };
  return {
    senarai: async () => senarai,
    klaim: async (id) => {
      panggilan.klaim.push(id);
      const j = senarai.find((x) => x.id === id);
      return j ? { ...j, murid: j.murid || [] } : null;
    },
    lepas: async (id) => { panggilan.lepas.push(id); },
    selesai: async (id, keputusan) => { panggilan.selesai.push({ id, keputusan }); },
    panggilan
  };
}

test('poll automatik melangkau job lapuk tetapi masih memproses job segar', async () => {
  const klien = klienPalsu([
    { id: 'lapuk', status: 'menunggu', tarikhIso: '2026-09-20' },
    { id: 'segar', status: 'menunggu', tarikhIso: '2026-09-21' },
    { id: 'gagal', status: 'gagal', tarikhIso: '2026-09-21' },
    { id: 'lease-luput', status: 'sedang_dihantar', tarikhIso: '2026-09-21' }
  ]);
  const fasa = [];
  const g = buatGiliran({
    klien, pemilik: 'runner', log: logPalsu(),
    semakKelayakanAutomatik: async (job, tahap) => {
      fasa.push(`${job.id}:${tahap}`);
      return job.id === 'segar' ? { boleh: true, sebab: 'layak' } : { boleh: false, sebab: 'tidak layak' };
    },
    jalankanTugasanAnak: async () => ({ stdout: '', stderr: '', hasil: { status: 'tidak-berubah', sebab: 'padan' } })
  });
  g.mulakan(30, { automatik: true });
  const hasil = await g.jalankanSatuKitaran();
  assert.equal(hasil.diproses, 1);
  assert.deepEqual(klien.panggilan.klaim, ['segar']);
  assert.ok(fasa.includes('lapuk:sebelum-klaim'));
  assert.ok(fasa.includes('segar:selepas-klaim'));
  g.hentikan();
});

test('kelayakan diperiksa lagi tepat sebelum mutasi; penolakan melepaskan klaim tanpa hantar', async () => {
  const klien = klienPalsu([{ id: 'j1', status: 'menunggu', tarikhIso: '2026-09-21' }]);
  const mod = [];
  const g = buatGiliran({
    klien, pemilik: 'runner', log: logPalsu(),
    semakKelayakanAutomatik: async (_job, tahap) => tahap === 'sebelum-mutasi'
      ? { boleh: false, sebab: 'Kalendar berubah; gagal tertutup.' }
      : { boleh: true, sebab: 'layak' },
    jalankanTugasanAnak: async (_job, opsyen) => {
      mod.push(opsyen.mod);
      return { stdout: '', stderr: '', hasil: { status: 'perlu-hantar', sebab: 'perlu' } };
    }
  });
  g.mulakan(30, { automatik: true });
  const hasil = await g.jalankanSatuKitaran();
  assert.equal(hasil.diproses, 0);
  assert.deepEqual(mod, ['verifikasi']);
  assert.deepEqual(klien.panggilan.lepas, ['j1']);
  assert.deepEqual(klien.panggilan.selesai, []);
  g.hentikan();
});

test('job yang pernah diklaim oleh poll automatik tidak dicuba lagi selepas ralat runner', async () => {
  const klien = klienPalsu([{ id: 'sekali', status: 'menunggu', tarikhIso: '2026-09-21' }]);
  const g = buatGiliran({
    klien, pemilik: 'runner', log: logPalsu(),
    semakKelayakanAutomatik: async () => ({ boleh: true, sebab: 'layak' }),
    jalankanTugasanAnak: async () => { throw new Error('ralat proses anak'); }
  });
  g.mulakan(30, { automatik: true });
  await g.jalankanSatuKitaran();
  await g.jalankanSatuKitaran();
  assert.deepEqual(klien.panggilan.klaim, ['sekali']);
  assert.deepEqual(klien.panggilan.lepas, ['sekali']);
  g.hentikan();
});

test('[penemuan semakan bebas] poll MANUAL tidak ditapis kalendar auto', async () => {
  const klien = klienPalsu([{ id: 'manual1', status: 'menunggu', tarikhIso: '2026-09-20' }]);
  let dipanggil = 0;
  const g = buatGiliran({
    klien, pemilik: 'runner', log: logPalsu(),
    semakKelayakanAutomatik: async () => {
      dipanggil++;
      return { boleh: false, sebab: 'kalendar kosong / hujung minggu' };
    },
    jalankanTugasanAnak: async () => ({ stdout: '', stderr: '', hasil: { status: 'tidak-berubah', sebab: 'padan' } })
  });
  g.mulakan(30); // mod manual — tiada { automatik: true }
  const hasil = await g.jalankanSatuKitaran();
  assert.equal(hasil.diproses, 1);
  assert.deepEqual(klien.panggilan.klaim, ['manual1']);
  assert.deepEqual(klien.panggilan.selesai.map((x) => x.id), ['manual1']);
  assert.equal(dipanggil, 0); // pengawal kalendar auto TIDAK dipanggil untuk giliran manual
  g.hentikan();
});

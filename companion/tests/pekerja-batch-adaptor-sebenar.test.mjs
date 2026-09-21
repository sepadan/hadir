// Ujian pekerja-batch.mjs terhadap adapter Playwright SEBENAR (bukan double
// HalamanPalsu) menggunakan fixture HTML tempatan sahaja.
//
// Melancarkan SATU pelayar Chromium sistem headless (Chrome, fallback Edge)
// dan menyuntikkan `bukaKonteks` yang membalut `browser.newContext()` sebenar
// supaya bilangan pelancaran konteks dapat dikira. `buatAdaptorPlaywright`
// yang disuntik ke `buatPekerjaBatch` juga SEBENAR (diimport terus daripada
// adaptorPlaywright.mjs), bukan double.
//
// TIDAK memanggil `pekerja.jalankan()`/`jalankanPengisian` kerana itu
// menggoto MOEIS/idMe sebenar (navigasiHarian) — larangan keras brief. Ujian
// sebaliknya menyasarkan lapisan yang `jalankan()` sendiri gunakan: satu
// konteks dikongsi (`pekerja.mulakan()`, sama seperti `pastikanKonteks()`
// dalaman), SATU halaman baharu setiap "tugasan" (`konteks.newPage()`),
// `setContent` fixture pemilih-kelas MOEIS berbeza per tugasan, dan
// `buatAdaptorPlaywright(halaman)` sebenar membaca kelas/murid daripada DOM
// tempatan itu — membuktikan tiada keadaan kelas/murid terwaris merentas
// tugasan walaupun konteks dikongsi.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { buatPekerjaBatch } from '../src/moeis/pekerja-batch.mjs';
import { buatAdaptorPlaywright } from '../src/moeis/adaptorPlaywright.mjs';

let browser = null;

before(async () => {
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  }
});

after(async () => {
  if (browser) await browser.close();
});

// Sama seperti fixture dalam adaptor-playwright.test.mjs: halaman pemilih
// MOEIS (tahun + kelas + jadual ringkasan kelas). Kelas/baris berbeza per
// panggilan supaya setiap "tugasan" mempunyai DOM yang boleh dibezakan.
function htmlPemilihMoeis({ kelasOpsyen, baris }) {
  const barisHtml = baris
    .map((r, i) => '<tr><td>' + (i + 1) + '</td><td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] + '</td><td>' + r[3] + '</td></tr>')
    .join('');
  return (
    '<!doctype html><html><body>' +
    '<select id="txtThnting"><option value="">Pilih</option><option value="PRA">PRASEKOLAH</option><option value="T4">TAHUN EMPAT</option></select>' +
    '<select id="txtNamakelas"><option value="">Pilih</option>' +
    kelasOpsyen.map((o) => '<option value="' + o + '">' + o + '</option>').join('') +
    '</select>' +
    '<table><tbody>' + barisHtml + '</tbody></table>' +
    '</body></html>'
  );
}

test('buatPekerjaBatch + adaptor sebenar: SATU konteks dikongsi, SETIAP tugasan mendapat halaman baharu + membaca kelas/murid BERBEZA betul daripada fixture tempatan tanpa keadaan terwaris', async () => {
  let bilBukaKonteks = 0;
  const bukaKonteks = async () => {
    bilBukaKonteks++;
    return browser.newContext();
  };

  const pekerja = buatPekerjaBatch({ bukaKonteks, buatAdaptorPlaywright, dirData: 'ujian-tidak-digunakan' });

  const tugasan = [
    {
      kelasOpsyen: ['PRASEKOLAH BIJAK'],
      baris: [['PRASEKOLAH', 'PRASEKOLAH BIJAK', 'BELUM DIHANTAR', '19/19']],
      cari: 'PRASEKOLAH',
      jangkaKelas: 'PRASEKOLAH BIJAK',
      jangkaHadir: 19,
      jangkaJumlah: 19
    },
    {
      kelasOpsyen: ['TAHUN EMPAT CERGAS'],
      baris: [['TAHUN EMPAT', 'TAHUN EMPAT CERGAS', 'BELUM DIHANTAR', '25/28']],
      cari: 'TAHUN EMPAT',
      jangkaKelas: 'TAHUN EMPAT CERGAS',
      jangkaHadir: 25,
      jangkaJumlah: 28
    },
    {
      kelasOpsyen: ['TAHUN LIMA GEMILANG'],
      baris: [['TAHUN LIMA', 'TAHUN LIMA GEMILANG', 'BELUM DIHANTAR', '12/15']],
      cari: 'TAHUN LIMA',
      jangkaKelas: 'TAHUN LIMA GEMILANG',
      jangkaHadir: 12,
      jangkaJumlah: 15
    }
  ];

  const konteks = await pekerja.mulakan();
  const halamanDigunakan = new Set();

  for (const t of tugasan) {
    const halaman = await konteks.newPage();
    assert.equal(halamanDigunakan.has(halaman), false, 'halaman mestilah baharu, bukan digunakan semula');
    halamanDigunakan.add(halaman);

    await halaman.setContent(htmlPemilihMoeis({ kelasOpsyen: t.kelasOpsyen, baris: t.baris }));
    const adapter = buatAdaptorPlaywright(halaman);

    const hasilPilih = await adapter.pilihKelas(t.cari);
    assert.equal(hasilPilih.ok, true);
    assert.equal(hasilPilih.padan, t.jangkaKelas);

    const ringkasan = await adapter.bacaRingkasanKelas(t.cari, t.cari);
    assert.equal(ringkasan.kelasPadan, t.jangkaKelas);
    assert.equal(ringkasan.hadir, t.jangkaHadir);
    assert.equal(ringkasan.jumlah, t.jangkaJumlah);

    await halaman.close();
  }

  assert.equal(halamanDigunakan.size, tugasan.length, 'setiap tugasan mesti dapat halaman berasingan');
  assert.equal(bilBukaKonteks, 1, 'hanya SATU pelancaran konteks untuk semua tugasan (Option 2)');
  assert.equal(pekerja.status().bilLancar, 1);

  await pekerja.tutup();
});

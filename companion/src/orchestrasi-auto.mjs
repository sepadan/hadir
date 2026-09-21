import { bolehAutoMula } from './auto-mula.mjs';

// Orkestrasi startup dengan semua kebergantungan disuntik. Pemanggil WAJIB
// memanggil fungsi ini hanya selepas bind loopback berjaya (permulaan.mjs).
export async function cubaAutoMula({
  bacaTetapan, sekarangMs, sempadanProsesMs, adaRahsiaEnjin,
  klaimDisokong, sesiDisahkan, mulakanGiliran, tulisLog
}) {
  const t = bacaTetapan();
  if (t.autoMulaGiliran !== true) {
    return { diminta: false, bermula: false, sebab: 'Auto-mula giliran dimatikan (lalai).' };
  }

  try {
    // Semak pengawal tempatan dahulu supaya kalendar kosong/hujung minggu tidak
    // mencetuskan rangkaian atau membuka Edge semasa startup.
    const awal = bolehAutoMula({
      tetapan: t, sekarangMs: sekarangMs(), sempadanProsesMs,
      sesiAda: true, klaimDisokong: true, rahsiaEnjinAda: adaRahsiaEnjin()
    });
    if (!awal.boleh) {
      tulisLog('AUTO_MULA', awal.sebab);
      return { diminta: true, bermula: false, sebab: awal.sebab };
    }

    const klaim = await klaimDisokong();
    if (klaim !== true) {
      const sebab = klaim === false
        ? 'Backend HADIR belum menyokong klaim atomik; auto-mula disekat.'
        : 'Sokongan klaim atomik tidak dapat ditentukan (rangkaian/kelayakan); auto-mula disekat.';
      tulisLog('AUTO_MULA', sebab);
      return { diminta: true, bermula: false, sebab };
    }

    const sesi = await sesiDisahkan();
    const akhir = bolehAutoMula({
      tetapan: bacaTetapan(), sekarangMs: sekarangMs(), sempadanProsesMs,
      sesiAda: sesi && sesi.ada === true, klaimDisokong: klaim,
      rahsiaEnjinAda: adaRahsiaEnjin()
    });
    if (!akhir.boleh) {
      const sebab = (sesi && sesi.sebab) || akhir.sebab;
      tulisLog('AUTO_MULA', sebab);
      return { diminta: true, bermula: false, sebab };
    }

    mulakanGiliran(t.intervalSaat, { automatik: true });
    tulisLog('AUTO_MULA', akhir.sebab);
    return { diminta: true, bermula: true, sebab: akhir.sebab };
  } catch (ralat) {
    const sebab = 'Auto-mula gagal: ' + String((ralat && ralat.message) || ralat);
    tulisLog('AUTO_MULA', sebab);
    return { diminta: true, bermula: false, sebab };
  }
}

// Pemulihan giliran auto (bounded, mengekalkan semua pengawal sedia ada).
//
// Senario: startup auto-mula gagal (cth sesi idMe tidak sah semasa bind) dan
// suis `autoMulaGiliran` masih ON — tanpa ini, giliran kekal MATI selama-lama
// walaupun log masuk automatik kemudian berjaya memulihkan sesi. Fungsi ini
// TIDAK melonggarkan sebarang pengawal (kalendar/hujung minggu/umur
// tugasan/sempadan aktivasi/attendance): setiap kitaran memanggil semula
// `cubaAutoMula` yang sama, yang menyemak semula SEMUA pengawal dari awal.
//
// Satu-satunya tindakan pelayar langsung di sini ialah `cubaLoginAutoKerja`
// (terikat oleh had 2 cubaan sedia ada; jika sesi cache sudah sah ia menjadi
// no-op). `cubaAutoMula` yang disuntik oleh pemanggil MESTI menggunakan
// semakan sesi cache-sahaja (sesiKerjaDisahkan), BUKAN semakan startup yang
// boleh melancarkan pelayar sendiri — supaya gelung pemulihan ini tidak
// menjadi laluan kedua yang membuka Edge tanpa sebab.
//
// Reka bentuk kitaran (rondaan 2, pembetulan 4 kecacatan):
//   1. RANTAI setTimeout (BUKAN setInterval) — kitaran seterusnya dijadualkan
//      HANYA selepas kitaran semasa selesai sepenuhnya, supaya log masuk +
//      auto-mula yang mengambil masa lebih lama daripada `jedaMs` tidak
//      pernah bertindih (dua kitaran serentak). Pengawal `sedangBerjalan`
//      turut menghalang pertindihan jika `_kitar()` dipanggil semula semasa
//      satu kitaran masih dalam penerbangan (ujian/pemanggil luaran).
//   2. BENAR-BENAR bersempadan: `hadKitaran` (lalai 12 = 1 jam pada 5 minit)
//      — berhenti + log apabila dicapai, walaupun auto-mula terus gagal.
//   3. Berhenti-untuk-manusia: jika `cubaLoginAutoKerja()` memulangkan
//      keputusan yang `hasil.perluManusia === true` (cth OTP/CAPTCHA, frasa
//      tidak padan/tiada, had cubaan dicapai), gelung BERHENTI serta-merta
//      tanpa memanggil `cubaAutoMula` dan tanpa menjadualkan kitaran
//      seterusnya — keperluan manusia tidak pernah dicuba semula secara
//      senyap.
//   4. Hari dahulu: `bolehHariIni` (pilihan) disemak PALING AWAL setiap
//      kitaran (sebelum log masuk automatik disentuh langsung) — jika
//      `!boleh`, berhenti + log tanpa mencuba log masuk automatik pun. Ini
//      mengelakkan log masuk pada hari yang tidak dibenarkan (hujung
//      minggu/cuti/allowlist kosong).
export function pasangPemulihanAutoMula({
  bacaTetapan, giliranAktif, cubaLoginAutoKerja, cubaAutoMula, bolehHariIni, tulisLog,
  jedaMs = 5 * 60 * 1000, hadKitaran = 12
}) {
  let timer = null;
  let sedangBerjalan = false;
  let bilKitaran = 0;

  async function kitar() {
    if (sedangBerjalan) return; // pertindihan: satu kitaran sudah dalam penerbangan
    sedangBerjalan = true;
    try {
      bilKitaran += 1;
      if (bilKitaran > hadKitaran) {
        tulisLog('PEMULIHAN_AUTO_MULA', `Had ${hadKitaran} kitaran pemulihan dicapai; berhenti (tindakan manual diperlukan).`);
        hentikan();
        return;
      }

      const t = bacaTetapan();
      if (!t || t.autoMulaGiliran !== true) {
        tulisLog('PEMULIHAN_AUTO_MULA', 'Auto-mula giliran dimatikan; pemulihan berhenti.');
        hentikan();
        return;
      }
      if (giliranAktif()) {
        tulisLog('PEMULIHAN_AUTO_MULA', 'Giliran sudah aktif; pemulihan berhenti.');
        hentikan();
        return;
      }

      // Hari dahulu — SEBELUM menyentuh log masuk automatik langsung.
      if (typeof bolehHariIni === 'function') {
        let hari;
        try {
          hari = await bolehHariIni();
        } catch (ralat) {
          hari = { boleh: false, sebab: 'Ralat semakan hari sekolah: ' + String((ralat && ralat.message) || ralat) };
        }
        if (!hari || hari.boleh !== true) {
          tulisLog('PEMULIHAN_AUTO_MULA', (hari && hari.sebab) || 'Hari ini tidak dibenarkan (kalendar/hujung minggu); pemulihan berhenti.');
          hentikan();
          return;
        }
      }

      let hasilLogin = null;
      try {
        hasilLogin = await cubaLoginAutoKerja();
      } catch { /* best-effort; jangan gagalkan kitaran */ }
      if (hasilLogin && hasilLogin.hasil && hasilLogin.hasil.perluManusia === true) {
        tulisLog('PEMULIHAN_AUTO_MULA',
          'Log masuk automatik memerlukan manusia (' +
          (hasilLogin.hasil.sebab || hasilLogin.hasil.status || 'tidak diketahui') +
          '); pemulihan berhenti — TIADA cubaan semula senyap.');
        hentikan();
        return;
      }

      let hasil;
      try {
        hasil = await cubaAutoMula();
      } catch (ralat) {
        hasil = { bermula: false, sebab: 'Ralat pemulihan auto-mula: ' + String((ralat && ralat.message) || ralat) };
      }
      tulisLog('PEMULIHAN_AUTO_MULA', (hasil && hasil.sebab) || 'Tiada sebab dilaporkan.');
      if (hasil && hasil.bermula === true) {
        hentikan();
        return;
      }
    } finally {
      sedangBerjalan = false;
    }
    jadualSeterusnya();
  }

  function jadualSeterusnya() {
    if (timer === null) return; // dihentikan semasa kitaran (hentikan() menetapkan timer=null)
    timer = setTimeout(() => { kitar().catch(() => {}); }, jedaMs);
    if (timer.unref) timer.unref();
  }

  function mula() {
    if (timer) return;
    timer = setTimeout(() => { kitar().catch(() => {}); }, jedaMs);
    if (timer.unref) timer.unref();
  }

  function hentikan() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function berjalan() {
    return timer !== null;
  }

  return { mula, hentikan, berjalan, _kitar: kitar };
}


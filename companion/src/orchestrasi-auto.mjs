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


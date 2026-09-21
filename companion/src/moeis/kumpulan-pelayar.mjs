// Pengurus kumpulan pelayar (companion/src/moeis/kumpulan-pelayar.mjs).
//
// Glu antara kunci eksklusif pelayar (kunci-pelayar.mjs), dispatcher IPC
// (dispatcher-kumpulan.mjs — disuntik di sini melalui `buatDispatcher`, satu
// fabrik tanpa argumen) dan laluan sejuk lama (`jalankanTugasanAnakSejuk`,
// tandatangan SAMA seperti `jalankanTugasanAnak` asal:
// (job, opsyen) -> {kod, stdout, stderr, hasil}).
//
// Mendedahkan `jalankanTugasanAnak` dengan TANDATANGAN YANG SAMA seperti
// laluan sejuk lama — ini membolehkan `src/giliran.mjs` kekal TIDAK berubah
// dari segi cara ia memanggil `jalankanTugasanAnak`; hanya satu suntikan
// baharu (`tutupKumpulanPelayar`) ditambah untuk menutup kumpulan pada
// sempadan yang betul (akhir kitaran, dan SEBELUM log masuk semula).
//
// Seni bina diluluskan (Option 2):
//   - Mula LEWAT: kumpulan (dispatcher + kunci) hanya dicipta pada panggilan
//     PERTAMA `jalankanTugasanAnak` — bukan lebih awal.
//   - Kunci 'kumpulan' dipegang MERENTAS HAYAT KUMPULAN (bukan setiap
//     tugasan) — dilepaskan hanya oleh `tutupKumpulanPelayar()` selepas
//     pembersihan TERBUKTI berjaya.
//   - Kumpulan gagal dibuka SEBELUM sebarang mutasi (dispatcher memulangkan
//     `pembukaanGagal:true`, lihat pekerja-batch.mjs) -> tutup + lepas kunci
//     + jatuh balik ke laluan sejuk untuk TUGASAN INI SAHAJA (job/opsyen
//     asal dihantar tanpa diubah).
//   - `tutupKumpulanPelayar()` idempoten dan selamat dipanggil tanpa kumpulan
//     aktif (tiada-op).
//
// MESIN KEADAAN EKSPLISIT (penemuan semakan Astra — elak kunci bocor):
//   `ditutup` -> `dibuka` -> `menutup` -> `ditutup` | `gagal`
//   - Kegagalan `buatDispatcher()` (lontaran sinkron) TIDAK melancarkan apa-apa,
//     jadi kunci DILEPASKAN dengan selamat dan hasil 'gagal' dipulangkan.
//   - Kegagalan `d.tutup()` (pembersihan gagal) TIDAK melepaskan kunci secara
//     senyap — Edge yatim mungkin masih memegang profil; kunci DIKEKALKAN
//     (gagal-tertutup) supaya pelancar kedua tidak bertembung. Keadaan kekal
//     `gagal` dan tugasan seterusnya dilangkau (block dikekalkan).
export function buatPengurusKumpulanPelayar({ kunciPelayar, buatDispatcher, jalankanTugasanAnakSejuk, label = 'kumpulan' }) {
  let dispatcher = null;
  let fasa = 'ditutup'; // 'ditutup' | 'dibuka' | 'menutup' | 'gagal'
  let tutupSedang = null; // janji tutup dalam penerbangan (reentrant guard)

  async function jalankanTugasanAnak(job, opsyen) {
    if (fasa === 'menutup' || fasa === 'gagal') {
      // Gagal-tertutup: kumpulan sedang ditutup ATAU gagal ditutup sebelum ini —
      // profil Edge mungkin masih dipegang. Langkau TANPA melancarkan pelayar
      // kedua. pastiTiadaSpawn:true membenarkan giliran.mjs mencuba semula pada
      // kitaran seterusnya (tiada spawn berlaku di sini).
      return {
        kod: 0, stdout: '', stderr: '',
        hasil: {
          status: 'langkau',
          sebab: fasa === 'menutup'
            ? 'Kumpulan pelayar sedang ditutup; tugasan dilangkau (tiada pelayar kedua dilancarkan).'
            : 'Kumpulan pelayar gagal ditutup sebelum ini; kunci dikekalkan (gagal-tertutup). Tugasan dilangkau.',
          pastiTiadaSpawn: true
        }
      };
    }
    if (!dispatcher) {
      const kunci = kunciPelayar.cubaKunci(label);
      if (!kunci.boleh) {
        return {
          kod: 0, stdout: '', stderr: '',
          hasil: {
            status: 'langkau',
            sebab: 'Profil Edge sedang digunakan oleh ' + kunci.pemegang + '; tugasan dilangkau (tiada pelayar kedua dilancarkan).',
            pastiTiadaSpawn: true
          }
        };
      }
      try {
        dispatcher = buatDispatcher();
      } catch (ralat) {
        // Tiada apa dilancarkan — lepaskan kunci dengan selamat dan lapor
        // kegagalan teknikal (BUKAN langkau/pastiTiadaSpawn).
        kunciPelayar.lepaskan(label);
        return {
          kod: 1, stdout: '', stderr: String((ralat && ralat.message) || ralat),
          hasil: {
            status: 'gagal', kod: 1,
            sebab: 'Ralat membuka kumpulan pelayar: ' + ((ralat && ralat.message) || String(ralat))
          }
        };
      }
      fasa = 'dibuka';
    }
    const hasil = await dispatcher.hantar(job, opsyen);
    if (hasil && hasil.pembukaanGagal === true) {
      await tutupKumpulanPelayar();
      return jalankanTugasanAnakSejuk(job, opsyen);
    }
    return { kod: 0, stdout: '', stderr: '', hasil };
  }

  async function tutupKumpulanPelayar() {
    if (fasa === 'ditutup') return;
    if (tutupSedang) return tutupSedang; // reentrant: sertai penutupan sedia ada
    if (fasa === 'gagal') {
      // Penutupan sebelumnya GAGAL dan kunci dikekalkan (gagal-tertutup).
      // Tiada dispatcher untuk ditutup; permukaan blok yang dikekalkan secara jujur.
      throw new Error('Kumpulan pelayar gagal ditutup sebelum ini; kunci dikekalkan (gagal-tertutup). Mulakan semula proses untuk memulihkan.');
    }
    const d = dispatcher;
    dispatcher = null;
    fasa = 'menutup';
    tutupSedang = (async () => {
      try {
        await d.tutup();
        // Pembersihan TERBUKTI berjaya — baharu lepaskan kunci.
        kunciPelayar.lepaskan(label);
        fasa = 'ditutup';
      } catch (ralat) {
        // Pembersihan gagal — JANGAN lepaskan kunci secara senyap (Edge yatim
        // mungkin masih memegang profil). Kekalkan blok (gagal-tertutup).
        fasa = 'gagal';
        throw ralat;
      } finally {
        tutupSedang = null;
      }
    })();
    return tutupSedang;
  }

  function status() {
    const dasar = { aktif: fasa === 'dibuka', fasa };
    if (dispatcher && typeof dispatcher.status === 'function') return { ...dasar, ...dispatcher.status() };
    return dasar;
  }

  return { jalankanTugasanAnak, tutupKumpulanPelayar, status };
}

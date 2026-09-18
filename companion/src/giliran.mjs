// Runner giliran MOEIS (companion/src/giliran.mjs).
//
// Lalai MATI. Hanya POST /api/mula (admin) atau UI tempatan menghidupkannya.
// Idempotent, satu kerja aktif pada satu masa (tiada selari), klaim atomik +
// lease, log anak penuh (stdout+stderr), hasil dibezakan
// disahkan/tersimpan/tidak-berubah/konflik/gagal.
//
// `klien` (lihat klien-hadir.mjs) dan `jalankanTugasanAnak` (spawn push.mjs
// sebenar dalam produksi) kedua-duanya disuntik supaya seluruh gelung boleh
// diuji dengan double palsu (tests/giliran.test.mjs) tanpa rangkaian atau
// pelayar sebenar.
const LEASE_HEARTBEAT_MS = 5 * 60 * 1000;

export function buatGiliran({ klien, pemilik, log, jalankanTugasanAnak }) {
  const state = {
    aktif: false, sedangProses: false, kerjaSemasa: null, ralatTerakhir: '',
    keputusanTerakhir: null, timer: null
  };

  async function prosesSatuTugasan(ringkasan, benarkanCubaSemula) {
    const klaim = await klien.klaim(ringkasan.id, pemilik, benarkanCubaSemula === true);
    if (!klaim) return null; // sudah diambil enjin lain, atau tidak layak diklaim

    state.kerjaSemasa = { id: klaim.id, kelas: klaim.kelas, tarikhIso: klaim.tarikhIso };
    let heartbeat = null;
    try {
      const jalan = (mod, opsyen) => jalankanTugasanAnak(klaim, { mod, ...opsyen });

      const verifikasi = await jalan('verifikasi', {});
      log.tulisKerja(klaim.id + '-verifikasi', (verifikasi.stdout || '') + (verifikasi.stderr || ''));

      if (verifikasi.hasil.status === 'tidak-berubah') {
        await klien.selesai(klaim.id, 'berjaya', verifikasi.hasil.sebab || 'Tiada perubahan diperlukan.', verifikasi.hasil.bilHadir ?? '', pemilik);
        return { id: klaim.id, keputusan: 'berjaya', mesej: 'tiada perubahan' };
      }
      if (verifikasi.hasil.status === 'konflik') {
        await klien.selesai(klaim.id, 'gagal', verifikasi.hasil.sebab, '', pemilik);
        return { id: klaim.id, keputusan: 'gagal', mesej: verifikasi.hasil.sebab };
      }
      if (verifikasi.hasil.status === 'gagal') {
        await klien.selesai(klaim.id, 'gagal', verifikasi.hasil.sebab, '', pemilik);
        return { id: klaim.id, keputusan: 'gagal', mesej: verifikasi.hasil.sebab };
      }

      // perlu-hantar: jalankan mod hantar sebenar. Lease diperbaharui setiap 5
      // minit semasa kerja ini (kerja panjang) — heartbeat terbaik-usaha;
      // ia TIDAK menghentikan pelayar anak yang sudah berjalan jika
      // pembaharuan gagal (had reka bentuk proses berasingan, lihat
      // PEMASANGAN.md).
      heartbeat = setInterval(() => {
        klien.klaim(klaim.id, pemilik, false).catch((ralat) => {
          // Best-effort dan DIREKOD dengan jujur: lease boleh luput semasa kerja
          // panjang. Ia TIDAK menghentikan proses anak yang sudah berjalan
          // (proses berasingan tidak menerima isyarat henti). Kesannya terbatas:
          // runner lain hanya boleh mengambil alih selepas lease benar-benar
          // luput, dan enjin pengisian sentiasa membaca semula keadaan MOEIS
          // dahulu — jadi percubaan kedua menjadi 'tidak-berubah' (idempotent),
          // bukan penghantaran kedua yang membuta.
          log.tulis('LEASE_HEARTBEAT_GAGAL', klaim.id, String((ralat && ralat.message) || ralat));
        });
      }, LEASE_HEARTBEAT_MS);

      // Matlamat pengguna: selepas admin tekan "Hantar" dan giliran hidup,
      // rekod mesti siap SEPENUHNYA dalam MOEIS tanpa langkah manual —
      // iaitu "Simpan & Sahkan", bukan "Simpan" sahaja. Tanpa `sahkan`,
      // rekod tinggal berstatus "Menunggu pengesahan" di MOEIS dan guru
      // masih perlu menekan butang pengesahan sendiri.
      const hantar = await jalankanTugasanAnak(klaim, { mod: 'hantar', sahkan: true });
      log.tulisKerja(klaim.id + '-hantar', (hantar.stdout || '') + (hantar.stderr || ''));

      const h = hantar.hasil;
      if (h.status === 'disahkan') {
        await laporHasil(klaim.id, 'berjaya', h.sebab, h.bilHadir);
        return { id: klaim.id, keputusan: 'berjaya', mesej: h.sebab };
      }
      if (h.status === 'tersimpan') {
        await laporHasil(klaim.id, 'tersimpan', h.sebab, h.bilHadir);
        return { id: klaim.id, keputusan: 'tersimpan', mesej: h.sebab };
      }
      await laporHasil(klaim.id, 'gagal', h.sebab, '');
      return { id: klaim.id, keputusan: 'gagal', mesej: h.sebab };
    } catch (ralat) {
      log.tulisKerja(klaim.id + '-ralat', String(ralat && ralat.stack || ralat));
      await klien.lepas(klaim.id, pemilik).catch(() => {});
      return { id: klaim.id, keputusan: 'gagal', mesej: 'Ralat runner: ' + ralat.message };
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      state.kerjaSemasa = null;
    }
  }

  // Laporan status ke HADIR ialah kemas kini IDEMPOTEN (id tugasan + status
  // sama) — berbeza daripada penulisan kehadiran ke MOEIS. Apps Script kadang
  // memulangkan 404/halaman HTML sementara, dan kita tidak boleh melaporkan
  // penulisan MOEIS yang SUDAH BERJAYA sebagai gagal hanya kerana laporan itu
  // tersekat. Pepijat nyata 18 Sep 2026: tugas 2 CERDIK "disahkan" di MOEIS
  // tetapi HADIR menerima "Ralat runner: Balasan bukan JSON (status 404)".
  // Jadi laporan dicuba semula sehingga 3 kali; penulisan MOEIS tidak pernah
  // diulang.
  async function laporHasil(id, keputusan, mesej, bilHadir) {
    let ralatTerakhir = null;
    for (let cubaan = 1; cubaan <= 3; cubaan++) {
      try {
        await klien.selesai(id, keputusan, mesej, bilHadir ?? '', pemilik);
        return true;
      } catch (ralat) {
        ralatTerakhir = ralat;
        await new Promise((r) => setTimeout(r, 2000 * cubaan));
      }
    }
    throw ralatTerakhir;
  }

  async function jalankanSatuKitaran() {
    if (state.sedangProses) return { dilangkau: true };
    state.sedangProses = true;
    try {
      const senarai = await klien.senarai();
      const menunggu = (senarai || []).filter((j) => j.status === 'menunggu');
      const keputusan = [];
      for (const j of menunggu) {
        const r = await prosesSatuTugasan(j, false);
        if (r) { keputusan.push(r); state.keputusanTerakhir = r; }
      }
      state.ralatTerakhir = '';
      return { diproses: keputusan.length, keputusan };
    } catch (ralat) {
      state.ralatTerakhir = ralat.message;
      throw ralat;
    } finally {
      state.sedangProses = false;
    }
  }

  // Klaim + proses SATU tugasan yang diminta secara eksplisit (admin menekan
  // "Jalankan sekarang"). Tidak menyentuh mana-mana tugasan lain, walaupun
  // ada beberapa tugasan 'menunggu' yang lain sedang wujud. `benarkanCubaSemula`
  // dibiarkan lalai `true` supaya admin boleh mencuba semula tugasan 'gagal'
  // secara eksplisit; jika klaim gagal (null) — tugasan itu bukan 'menunggu'
  // atau sedang dipegang enjin lain — TIADA apa ditulis ke HADIR.
  async function jalankanTugasan(id, opsyen) {
    if (state.sedangProses) return { diproses: 0, sebab: 'Giliran sedang memproses tugasan lain; cuba sebentar lagi.' };
    state.sedangProses = true;
    try {
      const benarkanCubaSemula = opsyen && opsyen.benarkanCubaSemula !== undefined ? opsyen.benarkanCubaSemula : true;
      const r = await prosesSatuTugasan({ id }, benarkanCubaSemula);
      if (!r) return { diproses: 0, sebab: 'Tidak boleh diklaim (tugasan tidak menunggu atau dipegang enjin lain).' };
      state.keputusanTerakhir = r;
      return { diproses: 1, keputusan: [r] };
    } finally {
      state.sedangProses = false;
    }
  }

  // Pemulihan SELAMAT (baca sahaja) bagi tugasan berstatus 'tersimpan':
  // klaim khas 'verifikasi' (status tugasan KEKAL 'tersimpan' di backend,
  // lihat hadirMoeisJobKlaim_) — laluan ini TIDAK PERNAH memanggil mod
  // 'hantar' walau apa pun keputusan verifikasi. Perubahan yang masih
  // diperlukan atau konflik dilaporkan 'gagal' supaya admin bertindak
  // secara manual (cipta tugasan baharu mengikut peraturan sedia ada),
  // bukan dihantar semula secara automatik.
  async function sahkanTugasan(id) {
    if (state.sedangProses) return { diproses: 0, sebab: 'Giliran sedang memproses tugasan lain; cuba sebentar lagi.' };
    state.sedangProses = true;
    try {
      const klaim = await klien.klaim(id, pemilik, 'verifikasi');
      if (!klaim) return { diproses: 0, sebab: 'Tidak boleh disahkan semula (bukan status tersimpan, atau sedang dipegang enjin lain).' };
      state.kerjaSemasa = { id: klaim.id, kelas: klaim.kelas, tarikhIso: klaim.tarikhIso };
      try {
        const verifikasi = await jalankanTugasanAnak(klaim, { mod: 'verifikasi' });
        log.tulisKerja(klaim.id + '-sah', (verifikasi.stdout || '') + (verifikasi.stderr || ''));
        const h = verifikasi.hasil;
        if (h.status === 'tidak-berubah') {
          const mesej = 'Pengesahan semula: MOEIS sudah padan dengan HADIR.';
          await klien.selesai(klaim.id, 'berjaya', mesej, h.bilHadir ?? '', pemilik);
          const r = { id: klaim.id, keputusan: 'berjaya', mesej };
          state.keputusanTerakhir = r;
          return { diproses: 1, keputusan: [r] };
        }
        if (h.status === 'konflik' || h.status === 'perlu-hantar') {
          const sebabAsas = h.status === 'konflik' ? h.sebab : 'Masih ada perubahan diperlukan di MOEIS berbanding HADIR.';
          const mesej = sebabAsas + ' Tindakan manusia diperlukan — semak MOEIS, kemudian admin boleh cipta tugasan baharu mengikut peraturan sedia ada.';
          await klien.selesai(klaim.id, 'gagal', mesej, '', pemilik);
          const r = { id: klaim.id, keputusan: 'gagal', mesej };
          state.keputusanTerakhir = r;
          return { diproses: 1, keputusan: [r] };
        }
        // status 'gagal' teknikal (cth kelas tidak dapat dipetakan, sesi
        // tamat) — lepaskan lease tanpa merekod keputusan supaya tugasan
        // 'tersimpan' itu boleh dicuba sahkan semula kemudian.
        await klien.lepas(klaim.id, pemilik).catch(() => {});
        return { diproses: 0, sebab: h.sebab || 'Ralat semasa pengesahan semula.' };
      } catch (ralat) {
        log.tulisKerja(klaim.id + '-sah-ralat', String(ralat && ralat.stack || ralat));
        await klien.lepas(klaim.id, pemilik).catch(() => {});
        return { diproses: 0, sebab: 'Ralat runner: ' + ralat.message };
      } finally {
        state.kerjaSemasa = null;
      }
    } finally {
      state.sedangProses = false;
    }
  }

  function mulakan(intervalSaat) {
    if (state.aktif) return;
    state.aktif = true;
    // Had bawah 30 saat: selang lebih rapat daripada ini membebankan Apps Script
    // dan boleh mencetuskan sekatan sementara IP (lihat TETAPAN_LALAI.tetapan).
    const jeda = Math.max(30, Number(intervalSaat) || 90) * 1000;
    state.timer = setInterval(() => { jalankanSatuKitaran().catch(() => {}); }, jeda);
    if (state.timer.unref) state.timer.unref();
  }

  function hentikan() {
    state.aktif = false;
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  }

  function status() {
    return {
      aktif: state.aktif, sedangProses: state.sedangProses,
      kerjaSemasa: state.kerjaSemasa, ralatTerakhir: state.ralatTerakhir,
      keputusanTerakhir: state.keputusanTerakhir
    };
  }

  return { mulakan, hentikan, status, jalankanSatuKitaran, jalankanTugasan, sahkanTugasan };
}

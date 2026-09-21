// Dispatcher IPC kumpulan pelayar (companion/src/moeis/dispatcher-kumpulan.mjs).
//
// Sisi PENGURUS (induk) bagi protokol permintaan/hasil dengan pekerja kumpulan
// (bin/pekerja-batch.mjs, dijalankan sebagai proses anak berterusan — bukan
// satu proses per tugasan). `spawnPekerja` disuntik (memulangkan objek serupa
// ChildProcess Node: .stdin.write/.end, .stdout 'data' events, .on('exit'|
// 'error'), .kill()) supaya modul ini boleh diuji sepenuhnya dengan double
// palsu tanpa proses anak sebenar. Produksi menyuntik `spawnPekerja` yang
// memanggil node:child_process `spawn` (bin/hadir-companion.mjs).
//
// Protokol NDJSON (satu mesej = satu baris):
//   induk -> anak (stdin) : {"id":"<n>","job":{...},"opsyen":{...}}
//   anak -> induk (stdout): HASIL:{"id":"<n>","hasil":{...}}
// (Baris lain pada stdout, cth log console.log biasa, DIABAIKAN.)
//
// Payload job dibersihkan (`buangIc`) SEBELUM ditulis ke stdin — nama/butiran
// murid tidak hadir mungkin ada, tetapi IC TIDAK PERNAH dihantar (sama
// invarian seperti laluan sejuk lama, src/moeis/payload.mjs).
//
// KESELAMATAN / HAYAT (penemuan semakan Astra, pusingan kedua):
//   - SATU anak ditangkap (`a`) dan dirujuk dalam SEMUA handler — TIDAK PERNAH
//     merujuk pemboleh ubah `anak` boleh-ubah dalam handler, supaya keluar/ralat
//     LEWAT daripada pekerja LAMA tidak mengosongkan keadaan pekerja BAHARU.
//   - KEADAAN RACUN TERMINAL (diracun): pekerja keluar/putus/ralat stdin/
//     tamat masa/limpaan protokol menetapkan dispatcher GAGAL KEKAL — hantar()
//     seterusnya pulang `{status:'gagal', tidakDiketahui:true}` TANPA spawn
//     automatik baharu (spawn semula boleh memegang semula profil Edge dan
//     menulis semula tugasan yang hasilnya tidak diketahui).
//   - PEMBUNUHAN POKOK DAHULU: `bunuhPokokProses` (taskkill /T /F pada PID
//     pekerja) dipanggil SEBELUM `kill()` langsung supaya keturunan Edge/
//     Playwright TIDAK menjadi yatim (diparurkan semula) sebelum pokok ditemui.
//   - PEGANG HANDLE SEHINGGA PEMBERSIHAN TERBUKTI: `tutup()` MENUNGGU
//     pembunuhan pokok DAN mengesahkan pekerja benar-benar keluar (bounded)
//     SEBELUM menyelesaikan; jika tidak dapat disahkan, `tutup()` MENOLAK
//     (gagal-tertutup) supaya pengurus kumpulan mengekalkan kunci (Edge yatim
//     mungkin masih memegang profil). Tiada pelepasan kunci senyap.
//   - STDERR pekerja DIKONSUMSI (pencegah deadlock paip) tetapi TIDAK PERNAH
//     dilog mentah (boleh membawa nama/token). Hanya KOD DIAGNOSTIK BERSTRUKTUR
//     yang dibenarkan (allowlist) diekstrak dan dilog, bersama kiraan bait.
//   - STDOUT BERSEMPADAN: penimbal baris yang melebihi had = limpaan protokol
//     → gagal tertutup (racun + tamatkan pekerja), bukan penimbal tanpa had.
//   - PENUTUPAN BERSIH DISAHKAN MELALUI HANDSHAKE: pekerja memancarkan ack
//     `BERSIH:` HANYA selepas context.close selesai, kemudian keluar 0. tutup()
//     melepaskan handle HANYA jika ack + keluar 0 diperhatikan; sebaliknya bunuh
//     pokok + kill (tepat sekali, janji dikongsi) dan SAHKAN — MENOLAK jika
//     tidak disahkan. Keluar tanpa ack (termasuk kod bukan sifar) TIDAK dikira
//     bersih.
export function buatDispatcherKumpulan({
  spawnPekerja, buangIc, tulisLog,
  tamatMasaMs = 15 * 60 * 1000,
  bunuhPokokProses = null,
  tungguKeluarMs = 3000
}) {
  const HAD_BUFFER_STDOUT = 1024 * 1024;      // 1 MiB — limpaan = gagal tertutup
  const HAD_TUNGGU_KELUAR_MS = tungguKeluarMs; // tunggu bersempadan untuk sahkan keluar
  const HAD_KOD_DIAGNOSTIK = 16;              // had bilangan kod diagnostik dikumpul
  // Allowlist kod diagnostik berstruktur yang SELAMAT dilog. Kandungan stderr
  // mentah (yang mungkin membawa nama murid, token, atau nilai rahsia) TIDAK
  // PERNAH dilog — hanya padanan tepat kod ini diekstrak.
  const POLA_KOD_DIAGNOSTIK = /BERHENTI|KUMPULAN_PELAYAR_[A-Z_]{2,}/g;

  let anak = null;               // SATU anak ditangkap (single captured child)
  let bufer = '';
  let seterusnya = 0;
  const tertunda = new Map();     // id -> { selesai, batalkanPemasa }
  let ditutup = false;
  let diracun = false;
  let sebabRacun = '';
  let bilLancar = 0;
  const kodDiagnostik = new Set();
  let bilBaitStderr = 0;

  const HASIL_PUTUS = {
    status: 'gagal', kod: 2, tidakDiketahui: true,
    sebab: 'Pekerja kumpulan pelayar terputus/keluar sebelum hasil diterima; tugasan ini TIDAK diulang secara automatik.'
  };

  function selesaikanSatu(id, hasil) {
    const p = tertunda.get(id);
    if (!p) return;
    tertunda.delete(id);
    if (typeof p.batalkanPemasa === 'function') p.batalkanPemasa();
    p.selesai(hasil);
  }

  function selesaikanSemuaTertunda(hasil) {
    for (const id of [...tertunda.keys()]) selesaikanSatu(id, hasil);
  }

  function catatLog(jenis, status, sebab) {
    if (typeof tulisLog !== 'function') return;
    const kod = kodDiagnostik.size
      ? [...kodDiagnostik].slice(0, HAD_KOD_DIAGNOSTIK).join(',')
      : 'tiada-kod';
    // Hanya kiraan bait + kod allowlist dilog — TIDAK PERNAH kandungan stderr mentah.
    tulisLog(jenis, status, sebab + ' | stderr-dikonsumsi: ' + bilBaitStderr + ' bait | kod: ' + kod);
  }

  // Bunuh pokok proses MILIK pekerja (disuntik). Memulangkan Promise yang
  // membezakan true (pokok dibunuh), false (gagal), null (tidak disediakan).
  // DIBATASI MASA: jika panggilan balik bunuh pokok gantung, ia TIDAK boleh
  // menggantung tutup() selama-lamanya — ditamatkan selepas HAD_TUNGGU_KELUAR_MS.
  function bunuhPokokPekerja(a) {
    if (!a.pid || typeof bunuhPokokProses !== 'function') return Promise.resolve(null);
    return new Promise((selesai) => {
      let sudah = false;
      const t = setTimeout(() => { if (!sudah) { sudah = true; selesai(false); } }, HAD_TUNGGU_KELUAR_MS);
      const tamat = (v) => { if (!sudah) { sudah = true; clearTimeout(t); selesai(v); } };
      try {
        // Tangkap kedua-dua lontaran sinkron DAN penolakan async — kegagalan
        // bunuh pokok tidak boleh membiarkan tutup() menolak dengan ralat mentah
        // (pemanggil perlu tahu pembersihan tidak sah, bukan punca dalaman).
        Promise.resolve(bunuhPokokProses(a.pid)).then((v) => tamat(v === true), () => tamat(false));
      } catch {
        tamat(false);
      }
    });
  }

  // Tunggu (bersempadan) sehingga `a` benar-benar keluar. Pulang true jika
  // keluar diperhatikan, false jika tamat masa tanpa keluar.
  function tungguKeluar(a, ms) {
    if (a._sudahKeluar) return Promise.resolve(true);
    return new Promise((selesai) => {
      let sudah = false;
      const t = setTimeout(() => { if (!sudah) { sudah = true; selesai(false); } }, ms);
      a.on('exit', () => { if (!sudah) { sudah = true; clearTimeout(t); selesai(true); } });
    });
  }

  // Satu janji pembersihan DIKONGSI bagi setiap anak: racun (racunDanTamatkan)
  // dan tutup() kedua-duanya menunggu janji yang SAMA, supaya bunuh pokok +
  // kill langsung berlaku TEPAT SEKALI (tiada bunuh berulang dan tiada risiko
  // guna semula PID akar selepas ia keluar). Pulang true hanya jika akar
  // terbukti keluar DAN keturunan tidak yatim (bunuh pokok tidak disediakan
  // ATAU berjaya); false jika tidak dapat disahkan.
  function mulakanPembersihan(a) {
    if (a._pembersihan) return a._pembersihan;
    a._pembersihan = (async () => {
      const pokok = await bunuhPokokPekerja(a);   // pokok dahulu — sebelum kill langsung
      if (!a._sudahKeluar) {
        try { a.kill(); } catch { /* pekerja mungkin sudah keluar */ }
      }
      const sah = await tungguKeluar(a, HAD_TUNGGU_KELUAR_MS);
      if (sah !== true) return false;             // akar tidak disahkan keluar
      if (pokok === false) return false;          // bunuh pokok gagal → keturunan mungkin yatim
      return true;
    })();
    return a._pembersihan;
  }

  // Racun (keadaan gagal terminal) + tamatkan pekerja yang mungkin masih hidup.
  // Menyelesaikan semua permintaan tertunda secara jujur dan memulakan
  // penamatan bersempadan. Handle TIDAK dibuang sehingga keluar disahkan.
  function racunDanTamatkan(a, sebab) {
    if (a !== anak) return; // defensif: sudah diganti
    diracun = true;
    sebabRacun = sebab;
    selesaikanSemuaTertunda(HASIL_PUTUS);
    catatLog('KUMPULAN_PELAYAR', 'putus', sebab);
    // Mulakan penamatan bersempadan melalui janji DIKONGSI. Handle TIDAK
    // dibuang di sini sehingga pembersihan terbukti; tutup() menyertai janji
    // yang sama. Gagal → handle kekal dan tutup() menolak (gagal-tertutup).
    mulakanPembersihan(a).then((sah) => {
      if (sah === true) {
        a._sudahKeluar = true;
        if (anak === a) anak = null;
      }
    });
  }

  function pasangPemantau(a) {
    // PENTING: tangkap `a` dalam SEMUA handler — jangan rujuk `anak` boleh-ubah.
    a.on('exit', (kod) => {
      if (a !== anak) return; // keluar lewat daripada pekerja lama — abaikan
      // REKOD SAHAJA — handler keluar TIDAK PERNAH membuang handle. Handle
      // kekal sehingga pembersihan TERBUKTI (tutup()/pembersihan yang null anak)
      // supaya pembersihan yang gagal mengekalkan kunci (gagal-tertutup).
      a._sudahKeluar = true;
      a._kodKeluar = kod;
      if (ditutup || diracun) return; // keluar dijangkakan (tutup) / selepas racun — pembersihan uruskannya
      // Kejatuhan SEMULA JADI (crash) tanpa isyarat terdahulu. Racun (tiada
      // spawn baharu) tetapi KEKALKAN handle supaya tutup() boleh bunuh pokok
      // keturunan yatim dan SAHKAN.
      bufer = '';
      diracun = true;
      sebabRacun = 'Pekerja kumpulan keluar (kod ' + kod + ').';
      selesaikanSemuaTertunda(HASIL_PUTUS);
      catatLog('KUMPULAN_PELAYAR', 'putus', sebabRacun);
    });
    a.on('error', (ralat) => {
      if (a !== anak) return;
      // Ralat pengangkutan (spawn gagal dll): pekerja mungkin TIDAK hidup,
      // tetapi mungkin juga hidup. Racun + tamatkan (bukan hanya null handle).
      racunDanTamatkan(a, 'Ralat pekerja kumpulan: ' + ((ralat && ralat.message) || ralat));
    });
    if (a.stdin && typeof a.stdin.on === 'function') {
      a.stdin.on('error', (ralat) => {
        if (a !== anak) return;
        // EPIPE bermakna paip stdin putus — pekerja mungkin masih HIDUP
        // (kegagalan pengangkutan separa). Mesti DITAMATKAN, bukan hanya
        // dibuang handle, jika tidak profil Edge kekal dipegang sementara
        // pengurus melepaskan kunci.
        racunDanTamatkan(a, 'Ralat stdin pekerja kumpulan (mungkin EPIPE): ' + ((ralat && ralat.message) || ralat));
      });
    }
  }

  function pastikanAnak() {
    if (anak) return anak;
    const a = spawnPekerja();
    bilLancar++;
    anak = a;
    a._sudahKeluar = false;
    bufer = '';
    kodDiagnostik.clear();
    bilBaitStderr = 0;
    a.stdout.on('data', (chunk) => {
      if (a !== anak) return;
      bufer += chunk.toString('utf8');
      if (bufer.length > HAD_BUFFER_STDOUT) {
        // Limpaan protokol: satu baris melebihi had bermakna pekerja tidak
        // bercakap NDJSON dengan betul. Gagal tertutup.
        bufer = '';
        racunDanTamatkan(a, 'Limpaan penimbal stdout pekerja kumpulan (protokol melebihi ' + HAD_BUFFER_STDOUT + ' aksara).');
        return;
      }
      let idx;
      while ((idx = bufer.indexOf('\n')) >= 0) {
        const baris = bufer.slice(0, idx).trim();
        bufer = bufer.slice(idx + 1);
        // ACK PEMBERSIHAN BERSIH: handshake "context.close selesai" daripada
        // pekerja. Diperlukan (bersama keluar kod 0) untuk tutup() melepaskan
        // kunci — tanpa ack ini tutup() melakukan pembunuhan pokok yang disahkan.
        if (baris.startsWith('BERSIH:')) {
          a._ackBersih = true;
          a.emit('bersih');
          continue;
        }
        if (!baris.startsWith('HASIL:')) continue;
        let mesej;
        try { mesej = JSON.parse(baris.slice('HASIL:'.length)); } catch { continue; }
        selesaikanSatu(String(mesej.id), mesej.hasil);
      }
    });
    // Salirkan STDERR (pencegah deadlock paip) tetapi JANGAN simpan kandungan
    // mentah (boleh membawa nama/token). Hanya kod diagnostik allowlist
    // diekstrak; kandungan selebihnya dibuang selepas dikira baitnya.
    if (a.stderr && typeof a.stderr.on === 'function') {
      a.stderr.on('data', (chunk) => {
        if (a !== anak) return;
        bilBaitStderr += Buffer.byteLength(chunk);
        const teks = chunk.toString('utf8');
        const re = new RegExp(POLA_KOD_DIAGNOSTIK.source, 'g');
        let m;
        while ((m = re.exec(teks)) !== null) {
          if (kodDiagnostik.size < HAD_KOD_DIAGNOSTIK) kodDiagnostik.add(m[0]);
        }
      });
    }
    pasangPemantau(a);
    return a;
  }

  function hantar(job, opsyen) {
    if (ditutup) {
      return Promise.resolve({ status: 'gagal', kod: 2, sebab: 'Pekerja kumpulan pelayar sudah ditutup.' });
    }
    if (diracun) {
      return Promise.resolve({
        status: 'gagal', kod: 2, tidakDiketahui: true,
        sebab: 'Dispatcher kumpulan pelayar dalam keadaan gagal (tiada spawn automatik baharu): ' + sebabRacun
      });
    }
    const a = pastikanAnak();
    const id = String(++seterusnya);
    const payload = typeof buangIc === 'function' ? buangIc(job) : job;
    return new Promise((selesai) => {
      let pemasa = null;
      const batalkanPemasa = () => { if (pemasa) { clearTimeout(pemasa); pemasa = null; } };
      tertunda.set(id, { selesai, batalkanPemasa });
      pemasa = setTimeout(() => {
        if (!tertunda.has(id)) return;
        tertunda.delete(id);
        batalkanPemasa();
        // GAGAL JUJUR, TIADA MAIN-SEMULA MEMBUTA.
        selesai({
          status: 'gagal', kod: 2, tidakDiketahui: true,
          sebab: 'Pekerja kumpulan tidak membalas dalam ' + tamatMasaMs + 'ms; tugasan ini TIDAK diulang secara automatik.'
        });
        // Pekerja yang gantung tidak boleh dipercayai: racun (tiada spawn
        // baharu) dan tamatkan.
        racunDanTamatkan(a, 'tamat masa permintaan (' + tamatMasaMs + 'ms)');
      }, tamatMasaMs);
      try {
        a.stdin.write(JSON.stringify({ id, job: payload, opsyen: opsyen || {} }) + '\n');
      } catch (ralat) {
        if (!tertunda.has(id)) return; // sudah tamat masa / diselesaikan
        tertunda.delete(id);
        batalkanPemasa();
        selesai({ status: 'gagal', kod: 2, sebab: 'Ralat menulis permintaan ke pekerja kumpulan: ' + ((ralat && ralat.message) || ralat) });
      }
    });
  }

  // Tunggu (bersempadan) bukti penutupan BERSIH: ack BERSIH: DARI pekerja
  // (context.close selesai) DAN keluar dengan kod 0. Pulang true hanya jika
  // kedua-duanya diperhatikan; false jika tamat masa, atau pekerja sudah keluar
  // tanpa ack (tidak boleh bersih lagi).
  function tungguAckBersih(a, ms) {
    if (a._ackBersih && a._sudahKeluar && a._kodKeluar === 0) return Promise.resolve(true);
    if (a._sudahKeluar) return Promise.resolve(false);
    return new Promise((selesai) => {
      let sudah = false;
      const t = setTimeout(() => { if (!sudah) { sudah = true; selesai(false); } }, ms);
      const tamat = (v) => { if (!sudah) { sudah = true; clearTimeout(t); selesai(v); } };
      const semak = () => { if (a._ackBersih && a._sudahKeluar && a._kodKeluar === 0) tamat(true); };
      a.on('bersih', semak);
      a.on('exit', semak);
    });
  }

  // Tutup pekerja secara BERSIH dan SAHKAN pembersihan. stdin.end() dahulu;
  // penutupan BERSIH memerlukan BUKTI ack BERSIH: (context.close selesai) DAN
  // keluar kod 0 dalam graceMs. Tanpa bukti itu (tiada ack, keluar bukan sifar,
  // atau enggan keluar), bunuh pokok + kill langsung dan SAHKAN — MENOLAK jika
  // pembersihan tidak dapat disahkan (gagal-tertutup) supaya pemanggil
  // mengekalkan kunci.
  async function tutup({ graceMs = 5000 } = {}) {
    ditutup = true;
    if (!anak) return;
    const a = anak;
    try { a.stdin.end(); } catch { /* pekerja mungkin sudah keluar */ }

    const bersih = await tungguAckBersih(a, graceMs);
    if (bersih) {
      // Pembersihan TERBUKTI bersih (ack + keluar 0) — selamat lepaskan handle.
      a._sudahKeluar = true;
      if (anak === a) anak = null;
      return;
    }

    // Tiada bukti bersih: sahkan pembunuhan pokok + keluar melalui janji
    // DIKONGSI (jika racun sudah memulakan pembersihan, sertai janji yang sama).
    const sah = await mulakanPembersihan(a);
    if (sah === true) {
      if (anak === a) anak = null;
      return;
    }
    // Pembersihan TIDAK dapat disahkan (akar tidak terbukti lenyap ATAU bunuh
    // pokok gagal meninggalkan keturunan yatim) — gagal tertutup. Jangan buang
    // handle dan JANGAN mendakwa bersih; pemanggil (kumpulan-pelayar.mjs) mesti
    // mengekalkan kunci.
    throw new Error('Tidak dapat mengesahkan pekerja kumpulan ditamatkan (akar/keturunan tidak terbukti lenyap); kunci mesti dikekalkan.');
  }

  function status() {
    return { aktif: !!anak && !anak._sudahKeluar, ditutup, diracun, bilLancar, bilTertunda: tertunda.size };
  }

  return { hantar, tutup, status };
}

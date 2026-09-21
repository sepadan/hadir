// Ujian dispatcher IPC kumpulan pelayar (companion/src/moeis/dispatcher-kumpulan.mjs).
//
// TULEN — `spawnPekerja` disuntik sebagai double palsu (EventEmitter kecil yang
// meniru antara muka ChildProcess: .stdin.write/.end, .stdout 'data', .on('exit'|
// 'error'), .kill()). Tiada proses anak sebenar dilancarkan.
//
// Membuktikan: protokol NDJSON permintaan/hasil (satu baris = satu mesej),
// SATU spawn dikongsi merentas beberapa hantar(), putus sambungan/keluar/
// ralat stdin/tamat masa/limpaan protokol menyelesaikan SEMUA promise tertunda
// dengan hasil 'gagal' jujur (tiada tulisan diulang secara membuta), keadaan
// RACUN TERMINAL (tiada spawn automatik baharu), pembunuhan POKOK DAHULU
// sebelum kill langsung, penahanan handle sehingga pembersihan TERBUKTI
// (tutup() MENOLAK jika tidak dapat disahkan), saliran stderr TANPA log
// mentah (allowlist kod sahaja), dan stdout bersempadan (limpaan = gagal
// tertutup).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { buatDispatcherKumpulan } from '../src/moeis/dispatcher-kumpulan.mjs';

// Pekerja anak PALSU: EventEmitter dengan stdin/stdout tiruan. `bunuhAutotamat`
// menentukan sama ada `kill()` secara automatik memancarkan 'exit' (mensimulasi
// proses benar-benar mati selepas kill) atau tidak (proses enggan mati — untuk
// ujian pembersihan yang tidak dapat disahkan).
function buatAnakPalsu({ bunuhAutotamat = true } = {}) {
  const anak = new EventEmitter();
  const ditulisKeStdin = [];
  let stdinDitutup = false;
  let stdinErrorHandler = null;
  const urutan = []; // jejak urutan tindakan (kill/pokok) untuk sahkan susunan
  anak.stdout = new EventEmitter();
  anak.stdin = {
    write(s) { ditulisKeStdin.push(s); return true; },
    end() { stdinDitutup = true; },
    on(evt, cb) { if (evt === 'error') stdinErrorHandler = cb; }
  };
  anak.kill = () => {
    anak._dibunuh = true;
    urutan.push('kill');
    if (bunuhAutotamat) anak._tamat(null);
  };
  anak._ditulisKeStdin = ditulisKeStdin;
  anak._stdinDitutup = () => stdinDitutup;
  anak._stdinError = (e) => { if (stdinErrorHandler) stdinErrorHandler(e); };
  anak._hantarBaris = (obj) => anak.stdout.emit('data', Buffer.from('HASIL:' + JSON.stringify(obj) + '\n'));
  anak._hantarMentah = (s) => anak.stdout.emit('data', Buffer.from(s));
  anak._tamat = (kod = 0) => { if (!anak._sudahKeluar) { anak._sudahKeluar = true; anak.emit('exit', kod); } };
  anak._ralat = (e) => anak.emit('error', e);
  anak._urutan = urutan;
  anak._sudahKeluar = false;
  return anak;
}

test('dispatcher-kumpulan: SATU spawn dikongsi merentas beberapa hantar() berurutan', async () => {
  const anak = buatAnakPalsu();
  let bilSpawn = 0;
  const spawnPekerja = () => { bilSpawn++; return anak; };
  const d = buatDispatcherKumpulan({ spawnPekerja });

  const p1 = d.hantar({ id: 'j1' }, { mod: 'baca' });
  const mesej1 = JSON.parse(anak._ditulisKeStdin[0]);
  anak._hantarBaris({ id: mesej1.id, hasil: { status: 'tidak-berubah' } });
  assert.deepEqual(await p1, { status: 'tidak-berubah' });

  const p2 = d.hantar({ id: 'j2' }, { mod: 'baca' });
  const mesej2 = JSON.parse(anak._ditulisKeStdin[1]);
  assert.notEqual(mesej2.id, mesej1.id, 'setiap permintaan mesti ada id unik');
  anak._hantarBaris({ id: mesej2.id, hasil: { status: 'tidak-berubah' } });
  await p2;

  assert.equal(bilSpawn, 1, 'spawnPekerja mesti dipanggil SATU kali sahaja untuk 2 permintaan berurutan');
});

test('dispatcher-kumpulan: payload job dibersihkan (buangIc) sebelum ditulis ke stdin', async () => {
  const anak = buatAnakPalsu();
  const spawnPekerja = () => anak;
  let panggilanBuangIc = 0;
  const buangIc = (job) => { panggilanBuangIc++; return { id: job.id, kelas: job.kelas, murid: [] }; };
  const d = buatDispatcherKumpulan({ spawnPekerja, buangIc });

  const p = d.hantar({ id: 'j1', kelas: '1 BIJAK', murid: [{ nama: 'X', ic: '123456789012' }] }, { mod: 'baca' });
  assert.equal(panggilanBuangIc, 1);
  const tertulis = JSON.parse(anak._ditulisKeStdin[0]);
  assert.equal(JSON.stringify(tertulis).includes('123456789012'), false, 'IC tidak boleh muncul dalam permintaan yang ditulis ke stdin');
  anak._hantarBaris({ id: tertulis.id, hasil: { status: 'tidak-berubah' } });
  await p;
});

test('dispatcher-kumpulan: pekerja keluar semasa permintaan tertunda -> gagal jujur, TIADA lontaran/gantung', async () => {
  const anak = buatAnakPalsu();
  const d = buatDispatcherKumpulan({ spawnPekerja: () => anak });

  const p = d.hantar({ id: 'j1' }, { mod: 'hantar' });
  anak._tamat(1); // pekerja keluar sebelum HASIL: sempat dihantar
  const hasil = await p;
  assert.equal(hasil.status, 'gagal');
  assert.equal(hasil.tidakDiketahui, true, 'putus/keluar mesti ditandakan tidakDiketahui (tiada main-semula membuta)');
  assert.match(hasil.sebab, /terputus|keluar/i);
});

test('dispatcher-kumpulan: ralat proses anak (error event) menyelesaikan permintaan tertunda dengan gagal + pekerja ditamatkan', async () => {
  const anak = buatAnakPalsu();
  const d = buatDispatcherKumpulan({ spawnPekerja: () => anak });

  const p = d.hantar({ id: 'j1' }, { mod: 'hantar' });
  anak._ralat(new Error('ENOENT ujian'));
  const hasil = await p;
  assert.equal(hasil.status, 'gagal');
  assert.equal(anak._dibunuh, true, 'pekerja yang mungkin masih hidup mesti ditamatkan (bukan hanya dibuang handle)');
});

test('dispatcher-kumpulan: keadaan RACUN TERMINAL — selepas pekerja putus, hantar() seterusnya TIDAK spawn baharu', async () => {
  let bilSpawn = 0;
  const anakSenarai = [];
  const spawnPekerja = () => { bilSpawn++; const a = buatAnakPalsu(); anakSenarai.push(a); return a; };
  const d = buatDispatcherKumpulan({ spawnPekerja });

  const p1 = d.hantar({ id: 'j1' }, {});
  anakSenarai[0]._tamat(1);
  await p1;

  const hasil2 = await d.hantar({ id: 'j2' }, {});
  assert.equal(hasil2.status, 'gagal');
  assert.equal(hasil2.tidakDiketahui, true);
  assert.match(hasil2.sebab, /keadaan gagal|tiada spawn/i);
  assert.equal(bilSpawn, 1, 'TIADA pekerja baharu mesti dilancar selepas pekerja lama putus (racun terminal)');
  assert.equal(d.status().diracun, true);
});

test('dispatcher-kumpulan: tutup() menghantar stdin.end() dan melepaskan handle apabila ack BERSIH + keluar 0', async () => {
  const anak = buatAnakPalsu();
  const spawnPekerja = () => anak;
  const d = buatDispatcherKumpulan({ spawnPekerja });

  const p1 = d.hantar({ id: 'j1' }, {});
  const mesej = JSON.parse(anak._ditulisKeStdin[0]);
  anak._hantarBaris({ id: mesej.id, hasil: { status: 'tidak-berubah' } });
  await p1;

  const janjiTutup = d.tutup({ graceMs: 5000 });
  assert.equal(anak._stdinDitutup(), true, 'tutup() mesti memanggil stdin.end() serta-merta');
  anak._hantarMentah('BERSIH:{}\n'); // ack pembersihan bersih
  anak._tamat(0);
  await janjiTutup;
  assert.equal(d.status().aktif, false, 'handle dilepaskan selepas ack + keluar 0');
});

test('dispatcher-kumpulan: tutup() membunuh pekerja jika tidak keluar dalam graceMs (dan sahkan keluar)', async () => {
  const anak = buatAnakPalsu();
  const spawnPekerja = () => anak;
  const d = buatDispatcherKumpulan({ spawnPekerja });

  const p1 = d.hantar({ id: 'j1' }, {});
  const mesej = JSON.parse(anak._ditulisKeStdin[0]);
  anak._hantarBaris({ id: mesej.id, hasil: { status: 'tidak-berubah' } });
  await p1;

  await d.tutup({ graceMs: 20 }); // pekerja tidak keluar sendiri -> dibunuh + disahkan
  assert.equal(anak._dibunuh, true, 'kill() mesti dipanggil selepas grace jika pekerja tidak keluar sendiri');
});

test('dispatcher-kumpulan: tutup() MENOLAK jika pembersihan tidak dapat disahkan (kill tidak membawa kepada keluar)', async () => {
  const anak = buatAnakPalsu({ bunuhAutotamat: false }); // kill dipanggil tetapi proses enggan mati
  const d = buatDispatcherKumpulan({ spawnPekerja: () => anak, tungguKeluarMs: 20 });

  const p1 = d.hantar({ id: 'j1' }, {});
  const mesej = JSON.parse(anak._ditulisKeStdin[0]);
  anak._hantarBaris({ id: mesej.id, hasil: { status: 'tidak-berubah' } });
  await p1;

  await assert.rejects(() => d.tutup({ graceMs: 20 }), /tidak dapat mengesahkan|pembersihan tidak sah/i);
  assert.equal(anak._dibunuh, true, 'kill() mesti dicuba walaupun pembersihan akhirnya tidak disahkan');
  assert.equal(d.status().aktif, true, 'handle pekerja TIDAK dibuang apabila keluar tidak disahkan (gagal-tertutup)');
});

test('dispatcher-kumpulan: hantar() selepas tutup() ditolak dengan hasil gagal (tiada spawn baharu)', async () => {
  let bilSpawn = 0;
  const spawnPekerja = () => { bilSpawn++; return buatAnakPalsu(); };
  const d = buatDispatcherKumpulan({ spawnPekerja });
  await d.tutup();
  const hasil = await d.hantar({ id: 'j1' }, {});
  assert.equal(hasil.status, 'gagal');
  assert.equal(bilSpawn, 0);
});

test('dispatcher-kumpulan: stderr pekerja disalirkan (tiada deadlock) dan tidak menjejaskan hasil', async () => {
  const anak = buatAnakPalsu();
  anak.stderr = new EventEmitter();
  const d = buatDispatcherKumpulan({ spawnPekerja: () => anak });
  const p = d.hantar({ id: 'j1' }, {});
  const mesej = JSON.parse(anak._ditulisKeStdin[0]);
  for (let i = 0; i < 200; i++) anak.stderr.emit('data', Buffer.from('X'.repeat(1000)));
  anak._hantarBaris({ id: mesej.id, hasil: { status: 'tidak-berubah' } });
  const hasil = await p;
  assert.equal(hasil.status, 'tidak-berubah');
});

test('dispatcher-kumpulan: stderr MENTAH TIDAK dilog (rahsia/token tidak bocor); hanya kod allowlist dilog', async () => {
  const anak = buatAnakPalsu();
  anak.stderr = new EventEmitter();
  const log = [];
  const d = buatDispatcherKumpulan({
    spawnPekerja: () => anak,
    tulisLog: (jenis, status, sebab) => log.push(sebab)
  });
  const p = d.hantar({ id: 'j1' }, {});
  const mesej = JSON.parse(anak._ditulisKeStdin[0]);
  // stderr mengandungi nilai seperti rahsia/token/nama murid + SATU kod allowlist.
  anak.stderr.emit('data', Buffer.from('TOKEN_RAHSIA=abc123def456 BERHENTI nama-murid-sebenar 900101015533'));
  anak._hantarBaris({ id: mesej.id, hasil: { status: 'tidak-berubah' } });
  await p;

  anak._tamat(1); // cetuskan log putus
  const semuaLog = log.join('\n');
  assert.equal(semuaLog.includes('TOKEN_RAHSIA'), false, 'rahsia tidak boleh dilog');
  assert.equal(semuaLog.includes('900101015533'), false, 'IC tidak boleh dilog');
  assert.equal(semuaLog.includes('nama-murid-sebenar'), false, 'nama mentah tidak boleh dilog');
  assert.ok(semuaLog.includes('BERHENTI'), 'kod diagnostik allowlist mesti dilog');
});

test('dispatcher-kumpulan: ralat stdin (EPIPE) menyelesaikan permintaan tertunda jujur DAN menamatkan pekerja yang mungkin masih hidup', async () => {
  const anak = buatAnakPalsu({ bunuhAutotamat: false }); // EPIPE tetapi pekerja masih hidup (tiada exit)
  const d = buatDispatcherKumpulan({ spawnPekerja: () => anak });
  const p = d.hantar({ id: 'j1' }, {});
  anak._stdinError(new Error('write EPIPE'));
  const hasil = await p;
  assert.equal(hasil.status, 'gagal');
  assert.equal(hasil.tidakDiketahui, true);
  assert.match(hasil.sebab, /terputus|keluar|stdin/i);
  // Tunggu penamatan async bersempadan diselesaikan.
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(anak._dibunuh, true, 'pekerja yang masih hidup selepas EPIPE mesti DITAMATKAN (bukan hanya handle dibuang)');
});

test('dispatcher-kumpulan: permintaan tidak pernah dibalas -> tamat masa bersempadan -> gagal jujur + pekerja dibunuh, TIADA main-semula', async () => {
  const anak = buatAnakPalsu();
  const d = buatDispatcherKumpulan({ spawnPekerja: () => anak, tamatMasaMs: 30 });
  const p = d.hantar({ id: 'j1' }, {});
  const hasil = await p;
  assert.equal(hasil.status, 'gagal');
  assert.equal(hasil.tidakDiketahui, true, 'tamat masa mesti ditandakan tidakDiketahui (tiada main-semula membuta)');
  await new Promise((r) => setTimeout(r, 50)); // benarkan penamatan async bersempadan selesai
  assert.equal(anak._dibunuh, true, 'pekerja yang gantung mesti dibunuh');
  assert.equal(anak._ditulisKeStdin.length, 1, 'permintaan mesti ditulis SEKALI sahaja (tiada main-semula tulisan)');
});

test('dispatcher-kumpulan: tamat masa MERACUN dispatcher — hantar() seterusnya gagal tanpa spawn baharu', async () => {
  let bilSpawn = 0;
  const spawnPekerja = () => { bilSpawn++; return buatAnakPalsu(); };
  const d = buatDispatcherKumpulan({ spawnPekerja, tamatMasaMs: 20 });
  await d.hantar({ id: 'j1' }, {});
  const hasil2 = await d.hantar({ id: 'j2' }, {});
  assert.equal(hasil2.status, 'gagal');
  assert.equal(bilSpawn, 1, 'tamat masa mesti meracun dispatcher (tiada spawn semula automatik)');
});

test('dispatcher-kumpulan: bunuhPokokProses dipanggil SEBELUM kill (pokok dahulu, elak yatim)', async () => {
  const anak = buatAnakPalsu({ bunuhAutotamat: false });
  anak.pid = 4242;
  const d = buatDispatcherKumpulan({
    spawnPekerja: () => anak,
    bunuhPokokProses: () => { anak._urutan.push('pokok'); return true; },
    tungguKeluarMs: 20
  });
  const p1 = d.hantar({ id: 'j1' }, {});
  const mesej = JSON.parse(anak._ditulisKeStdin[0]);
  anak._hantarBaris({ id: mesej.id, hasil: { status: 'tidak-berubah' } });
  await p1;

  await assert.rejects(() => d.tutup({ graceMs: 20 }), /tidak dapat mengesahkan/i);
  assert.deepEqual(anak._urutan, ['pokok', 'kill'], 'pembunuhan pokok MESTI berlaku SEBELUM kill langsung');
});

test('dispatcher-kumpulan: bunuhPokokProses async ditolak -> masih dicuba kill + pembersihan gagal-tertutup', async () => {
  const anak = buatAnakPalsu({ bunuhAutotamat: false });
  anak.pid = 4242;
  const d = buatDispatcherKumpulan({
    spawnPekerja: () => anak,
    bunuhPokokProses: async () => { throw new Error('taskkill gagal (ujian)'); },
    tungguKeluarMs: 20
  });
  const p1 = d.hantar({ id: 'j1' }, {});
  const mesej = JSON.parse(anak._ditulisKeStdin[0]);
  anak._hantarBaris({ id: mesej.id, hasil: { status: 'tidak-berubah' } });
  await p1;

  await assert.rejects(() => d.tutup({ graceMs: 20 }), /tidak dapat mengesahkan/i);
  assert.equal(anak._dibunuh, true, 'kill langsung mesti masih dicuba walaupun bunuh pokok gagal');
});

test('dispatcher-kumpulan: keluar LEWAT (pendua) selepas pembersihan ialah no-op (pengawal a !== anak)', async () => {
  let bilSpawn = 0;
  const anakSenarai = [];
  const spawnPekerja = () => { bilSpawn++; const a = buatAnakPalsu(); anakSenarai.push(a); return a; };
  const d = buatDispatcherKumpulan({ spawnPekerja });

  const p = d.hantar({ id: 'j1' }, {});
  anakSenarai[0]._tamat(1); // kejatuhan semula jadi
  await p;
  assert.equal(bilSpawn, 1);
  await d.tutup(); // pembersihan (akar terbukti keluar) → handle dibuang

  // Keluar LEWAT daripada pekerja mati selepas handle dibersihkan: pengawal
  // `a !== anak` mesti mengabaikannya (tiada lontaran, tiada spawn, tiada kesan).
  anakSenarai[0].emit('exit', 1);
  assert.equal(bilSpawn, 1, 'keluar lewat tidak boleh mencetuskan spawn baharu');
  assert.equal(d.status().aktif, false);
  assert.equal(d.status().diracun, true, 'keadaan diracun kekal');
});

test('dispatcher-kumpulan: kejatuhan semula jadi + bunuh pokok GAGAL -> tutup() MENOLAK (keturunan yatim, gagal-tertutup)', async () => {
  const anak = buatAnakPalsu();
  anak.pid = 4242;
  const d = buatDispatcherKumpulan({ spawnPekerja: () => anak, bunuhPokokProses: () => false });

  const p = d.hantar({ id: 'j1' }, {});
  anak._tamat(1); // kejatuhan semula jadi (akar keluar, keturunan mungkin yatim)
  await p;

  await assert.rejects(() => d.tutup(), /tidak dapat mengesahkan/i);
  assert.equal(d.status().aktif, false, 'akar sudah keluar');
  assert.equal(d.status().diracun, true);
});

test('dispatcher-kumpulan: limpaan stdout (satu baris melebihi had) -> gagal tertutup + pekerja ditamatkan', async () => {
  const anak = buatAnakPalsu();
  const d = buatDispatcherKumpulan({ spawnPekerja: () => anak });
  const p = d.hantar({ id: 'j1' }, {});
  // Hantar baris HASIL: yang sangat panjang (tiada newline) untuk mencetuskan limpaan.
  anak._hantarMentah('HASIL:' + 'A'.repeat(1024 * 1024 + 100));
  const hasil = await p;
  assert.equal(hasil.status, 'gagal');
  assert.equal(hasil.tidakDiketahui, true);
  assert.equal(d.status().diracun, true, 'limpaan protokol mesti meracun dispatcher');
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(anak._dibunuh, true, 'pekerja yang menulis limpahan mesti ditamatkan');
});

test('dispatcher-kumpulan: EPIPE + bunuh pokok GAGAL -> anak keluar sebelum tutup -> tutup() MENOLAK (handle dikekalkan)', async () => {
  const anak = buatAnakPalsu({ bunuhAutotamat: true }); // kill membawa keluar
  anak.pid = 4242;
  const d = buatDispatcherKumpulan({
    spawnPekerja: () => anak,
    bunuhPokokProses: () => false, // bunuh pokok gagal -> keturunan yatim
    tungguKeluarMs: 20
  });

  const p = d.hantar({ id: 'j1' }, {});
  anak._stdinError(new Error('write EPIPE'));
  await p;

  // EPIPE -> racunDanTamatkan -> pembersihan: bunuh pokok false + kill -> anak
  // keluar, tetapi pokok false -> pembersihan GAGAL -> handle TIDAK dibuang.
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(anak._sudahKeluar, true, 'akar keluar selepas kill');
  assert.equal(d.status().diracun, true);

  // tutup() TIDAK boleh mendakwa bersih hanya kerana anak sudah null/keluar —
  // pembersihan tidak disahkan -> MENOLAK (kunci dikekalkan).
  await assert.rejects(() => d.tutup(), /tidak dapat mengesahkan/i);
  assert.equal(d.status().aktif, false, 'akar sudah keluar');
});

test('dispatcher-kumpulan: tamat masa + tutup serentak dengan bunuh pokok DITOLAK (lewat) -> tutup() MENOLAK', async () => {
  const anak = buatAnakPalsu({ bunuhAutotamat: false }); // kill TIDAK membawa keluar
  anak.pid = 4242;
  const d = buatDispatcherKumpulan({
    spawnPekerja: () => anak,
    tamatMasaMs: 20,
    bunuhPokokProses: () => new Promise((_, tolak) => setTimeout(() => tolak(new Error('taskkill lewat gagal')), 10)),
    tungguKeluarMs: 20
  });

  const p = d.hantar({ id: 'j1' }, {});
  await p; // tamat masa -> racun + mula pembersihan (pokok DITOLAK lewat, kill tiada keluar)

  const janjiTutup = d.tutup({ graceMs: 5 });
  await assert.rejects(() => janjiTutup, /tidak dapat mengesahkan/i);
  assert.equal(d.status().diracun, true);
});

test('dispatcher-kumpulan: keluar BUKAN SIFAR semasa grace TIDAK dikira bersih (bunuh pokok tetap disahkan)', async () => {
  const anak = buatAnakPalsu();
  anak.pid = 4242;
  let bilPokok = 0;
  const d = buatDispatcherKumpulan({
    spawnPekerja: () => anak,
    bunuhPokokProses: () => { bilPokok++; return false; }
  });

  const p1 = d.hantar({ id: 'j1' }, {});
  const mesej = JSON.parse(anak._ditulisKeStdin[0]);
  anak._hantarBaris({ id: mesej.id, hasil: { status: 'tidak-berubah' } });
  await p1;

  const janjiTutup = d.tutup({ graceMs: 50 });
  assert.equal(anak._stdinDitutup(), true);
  anak._tamat(1); // keluar BUKAN sifar, TANPA ack, semasa grace
  await assert.rejects(() => janjiTutup, /tidak dapat mengesahkan/i);
  assert.equal(bilPokok, 1, 'keluar bukan sifar mesti tetap mencetuskan pembunuhan pokok (bukan dianggap bersih)');
});

test('dispatcher-kumpulan: ack BERSIH + keluar 0 -> tutup() melepaskan handle TANPA kill', async () => {
  const anak = buatAnakPalsu();
  const d = buatDispatcherKumpulan({ spawnPekerja: () => anak });

  const p1 = d.hantar({ id: 'j1' }, {});
  const mesej = JSON.parse(anak._ditulisKeStdin[0]);
  anak._hantarBaris({ id: mesej.id, hasil: { status: 'tidak-berubah' } });
  await p1;

  const janjiTutup = d.tutup({ graceMs: 5000 });
  assert.equal(anak._stdinDitutup(), true);
  anak._hantarMentah('BERSIH:{}\n'); // ack pembersihan bersih
  anak._tamat(0);
  await janjiTutup;
  assert.equal(anak._dibunuh, undefined, 'tiada kill perlu — ack + keluar 0 = bersih');
  assert.equal(d.status().aktif, false);
});

test('dispatcher-kumpulan: kill BERJAYA berlaku TEPAT SEKALI (janji pembersihan dikongsi antara racun dan tutup)', async () => {
  const anak = buatAnakPalsu({ bunuhAutotamat: true }); // kill -> auto keluar
  anak.pid = 4242;
  let bilPokok = 0;
  let bilKill = 0;
  const asalKill = anak.kill;
  anak.kill = () => { bilKill++; asalKill.call(anak); };
  const d = buatDispatcherKumpulan({
    spawnPekerja: () => anak,
    tamatMasaMs: 20,
    bunuhPokokProses: () => { bilPokok++; return true; },
    tungguKeluarMs: 50
  });

  const p = d.hantar({ id: 'j1' }, {});
  await p; // tamat masa -> racun + pembersihan (kill -> keluar -> bersih)
  await new Promise((r) => setTimeout(r, 30)); // biar pembersihan selesai (null anak)

  await d.tutup(); // anak sudah null -> tiada kill kedua
  assert.equal(bilKill, 1, 'kill mesti berlaku TEPAT SEKALI');
  assert.equal(bilPokok, 1, 'bunuh pokok mesti berlaku TEPAT SEKALI');
});

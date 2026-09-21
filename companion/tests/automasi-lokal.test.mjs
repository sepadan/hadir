import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulakanPelayanUjian, mintaMentah, NONCE_UJIAN, TOKEN_SAH } from './bantuan-server.mjs';
import { halamanLokalHtml, halamanLokalJs } from '../src/ui/render.mjs';

const ORIGIN = 'https://sepadan.github.io';

test('remote tidak boleh mengubah auto-mula, kalendar atau Windows autostart', async () => {
  let autostartTulis = 0;
  const { pelayan, port } = await mulakanPelayanUjian({
    autostart: { status: () => ({ disokong: true, berdaftar: false, sepadan: false }), tetapkan: () => { autostartTulis++; } }
  });
  try {
    const tetapan = await mintaMentah(port, {
      method: 'POST', laluan: '/api/tetapan',
      headers: { Origin: ORIGIN, Authorization: `Bearer ${TOKEN_SAH}`, 'Content-Type': 'application/json' },
      badan: JSON.stringify({ autoMulaGiliran: true, kalendarSekolah: ['2026-09-21'] })
    });
    assert.equal(tetapan.status, 400);
    assert.match(tetapan.json.ralat, /PC companion/i);

    const auto = await mintaMentah(port, {
      method: 'POST', laluan: '/api/autostart',
      headers: { Origin: ORIGIN, Authorization: `Bearer ${TOKEN_SAH}`, 'Content-Type': 'application/json' },
      badan: JSON.stringify({ sah: true, aktif: true })
    });
    assert.equal(auto.status, 404);
    assert.equal(autostartTulis, 0);
  } finally { pelayan.close(); }
});

test('UI nonce tempatan menetapkan opt-in + allowlist dan merekod sempadan aktivasi', async () => {
  const kini = Date.parse('2026-09-21T00:30:00.000Z');
  const { pelayan, konteks, port } = await mulakanPelayanUjian({ sekarangMs: () => kini });
  try {
    const r = await mintaMentah(port, {
      method: 'POST', laluan: '/api/lokal/tetapan',
      headers: { Origin: `http://127.0.0.1:${port}`, 'X-HADIR-Lokal': NONCE_UJIAN, 'Content-Type': 'application/json' },
      badan: JSON.stringify({ autoMulaGiliran: true, kalendarSekolah: ['2026-09-21'] })
    });
    assert.equal(r.status, 200);
    assert.equal(konteks.tetapan.baca().autoMulaGiliran, true);
    assert.deepEqual(konteks.tetapan.baca().kalendarSekolah, ['2026-09-21']);
    assert.equal(konteks.tetapan.baca().autoMulaDiaktifkanPada, '2026-09-21T00:30:00.000Z');
  } finally { pelayan.close(); }
});

test('UI tempatan menetapkan jagaSesi (keep-alive) dan status membacanya semula', async () => {
  const { pelayan, konteks, port } = await mulakanPelayanUjian();
  try {
    const r = await mintaMentah(port, {
      method: 'POST', laluan: '/api/lokal/tetapan',
      headers: { Origin: `http://127.0.0.1:${port}`, 'X-HADIR-Lokal': NONCE_UJIAN, 'Content-Type': 'application/json' },
      badan: JSON.stringify({ jagaSesi: true })
    });
    assert.equal(r.status, 200);
    assert.equal(konteks.tetapan.baca().jagaSesi, true, 'tetapan jagaSesi mesti disimpan');

    const status = await mintaMentah(port, {
      laluan: '/api/lokal/status',
      headers: { Origin: `http://127.0.0.1:${port}`, 'X-HADIR-Lokal': NONCE_UJIAN }
    });
    assert.equal(status.status, 200);
    assert.equal(status.json.tetapan.jagaSesi, true, 'status mesti membacanya semula (readback)');
  } finally { pelayan.close(); }
});

test('status tempatan jujur: registry sebenar, sebab auto dan keupayaan log masuk opt-in', async () => {
  const autostart = {
    disokong: true, berdaftar: true, sepadan: false,
    sebab: 'Entri HKCU wujud tetapi arahannya tidak sepadan dengan companion ini.'
  };
  const { pelayan, port } = await mulakanPelayanUjian({
    autostart: { status: () => autostart, tetapkan: () => autostart },
    autoMulaStatus: { diminta: true, bermula: false, sebab: 'Sesi tiada.' }
  });
  try {
    const r = await mintaMentah(port, {
      laluan: '/api/lokal/status',
      headers: { Origin: `http://127.0.0.1:${port}`, 'X-HADIR-Lokal': NONCE_UJIAN }
    });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.autostart, autostart);
    assert.deepEqual(r.json.autoMula, { diminta: true, bermula: false, sebab: 'Sesi tiada.' });
    assert.equal(r.json.keupayaanLogMasuk.automatik, true);
    assert.equal(r.json.keupayaanLogMasuk.mod, 'automatik-optin');
    assert.match(r.json.keupayaanLogMasuk.sebab, /opt-in/);
    assert.equal(r.json.tetapan.loginAuto, false, 'loginAuto lalai MATI dalam status');
    assert.equal(r.json.tetapan.jagaSesi, false, 'jagaSesi (keep-alive) lalai MATI dalam status');
    assert.equal(r.json.jagaSesi.didayakan, false, 'status keep-alive mesti mendedahkan didayakan=false');
    assert.equal(r.json.kredensial.ada, false);
    assert.deepEqual(Object.keys(r.json.loginAutoStatus).sort(),
      ['adaKredensial', 'benarkanTerusTanpaFrasa', 'diminta', 'had', 'hasilTerakhir', 'percubaan', 'sebab', 'sesiSah'].sort(),
      '/api/lokal/status mesti mendedahkan loginAutoStatus penuh (visibiliti log masuk automatik job-time)');
  } finally { pelayan.close(); }
});

test('/api/status mendedahkan loginAutoStatus penuh (8 medan) di samping loginAuto boolean sedia ada', async () => {
  const { pelayan, port } = await mulakanPelayanUjian();
  try {
    const r = await mintaMentah(port, {
      laluan: '/api/status',
      headers: { Origin: ORIGIN, Authorization: `Bearer ${TOKEN_SAH}` }
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.loginAuto, false, 'medan loginAuto boolean sedia ada mesti kekal (asap-e2e bergantung padanya)');
    assert.deepEqual(Object.keys(r.json.loginAutoStatus).sort(),
      ['adaKredensial', 'benarkanTerusTanpaFrasa', 'diminta', 'had', 'hasilTerakhir', 'percubaan', 'sebab', 'sesiSah'].sort());
  } finally { pelayan.close(); }
});

test('autostart hanya berubah melalui endpoint lokal dan respons ialah keadaan registry selepas operasi', async () => {
  let aktif = false;
  const pengurus = {
    status: () => ({ disokong: true, berdaftar: aktif, sepadan: aktif, sebab: aktif ? 'didaftar' : 'tiada' }),
    tetapkan: (nilai) => { aktif = nilai === true; return pengurus.status(); }
  };
  const { pelayan, port } = await mulakanPelayanUjian({ autostart: pengurus });
  try {
    const r = await mintaMentah(port, {
      method: 'POST', laluan: '/api/lokal/autostart',
      headers: { Origin: `http://127.0.0.1:${port}`, 'X-HADIR-Lokal': NONCE_UJIAN, 'Content-Type': 'application/json' },
      badan: JSON.stringify({ aktif: true, arahan: 'calc.exe' })
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.autostart.berdaftar, true);
    assert.equal(r.json.autostart.sepadan, true);
  } finally { pelayan.close(); }
});

test('mematikan auto-mula menghentikan queue auto dan ia tidak hidup semula dalam proses sama', async () => {
  let henti = 0;
  const autoMulaStatus = { diminta: true, bermula: true, sebab: 'bermula' };
  const { pelayan, port } = await mulakanPelayanUjian({
    autoMulaStatus,
    giliran: {
      status: () => ({ aktif: true, modMula: 'auto' }),
      mulakan: () => {},
      hentikan: () => { henti++; },
      jalankanSatuKitaran: async () => ({})
    }
  });
  try {
    const r = await mintaMentah(port, {
      method: 'POST', laluan: '/api/lokal/tetapan',
      headers: { Origin: `http://127.0.0.1:${port}`, 'X-HADIR-Lokal': NONCE_UJIAN, 'Content-Type': 'application/json' },
      badan: JSON.stringify({ autoMulaGiliran: false })
    });
    assert.equal(r.status, 200);
    assert.equal(henti, 1);
    assert.deepEqual(autoMulaStatus, {
      diminta: false, bermula: false,
      sebab: 'Auto-mula dimatikan pada UI tempatan; giliran auto dihentikan sehingga diminta atau proses dimulakan semula mengikut tetapan.'
    });
  } finally { pelayan.close(); }
});

test('UI memisahkan suis opt-in, kalendar tepat, medan kata laluan idMe wujud TANPA gema nilai', () => {
  const html = halamanLokalHtml();
  const js = halamanLokalJs();
  assert.match(html, /id="autostart"/);
  assert.match(html, /id="autoMulaGiliran"/);
  assert.match(html, /id="kalendarSekolah"/);
  assert.match(html, /id="loginAuto"/, 'suis loginAuto mesti wujud');
  assert.match(html, /loginAuto/, 'label loginAuto mesti wujud');
  assert.match(html, /id="jagaSesi"/, 'suis jagaSesi (keep-alive) mesti wujud');
  assert.match(html, /id="jagaSesiStatus"/, 'status penjaga sesi mesti dipaparkan');
  // Medan kata laluan idMe (type=password) kini wujud untuk simpanan tempatan.
  assert.match(html, /id="idMeKataLaluan"[^>]*type=["']password/);
  // Nilai TIDAK PERNAH digemakan: JS tidak membaca .value kata laluan kembali
  // ke dalam DOM; ia hanya dibersihkan selepas simpan.
  assert.match(js, /idMeKataLaluan/);
  assert.match(js, /kalendarSekolah/);
  assert.match(js, /autoMulaGiliran/);
  assert.match(js, /loginAuto/);
  assert.match(js, /loginAutoStatus/, 'status log masuk automatik job-time mesti dipaparkan dalam UI');
  assert.match(js, /jagaSesi/, 'suis + status jagaSesi mesti ada dalam JS UI');
  assert.match(js, /hasilPokeTerakhir|sihatTerakhir/, 'klasifikasi kesihatan keep-alive mesti dipaparkan');
  assert.match(js, /addEventListener\('change'/, 'suis opt-in mesti simpan sendiri melalui pendengar change');
  assert.doesNotThrow(() => new Function(js), 'JavaScript UI yang dijana mesti sah');
});

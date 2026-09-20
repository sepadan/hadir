import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulakanPelayanUjian, mintaMentah, NONCE_UJIAN } from './bantuan-server.mjs';

const KRED = {
  idMePengguna: 'PENGGUNA-UJIAN',
  idMeKataLaluan: 'KATA-LALUAN-PALSU-TAK-SAH',
  idMeKunciKeselamatan: 'FRASA-CONTOH-SELAMAT'
};

test('GET /api/lokal/kredensial -> status boolean + pengguna tersamar, tiada nilai', async () => {
  const { pelayan, port } = await mulakanPelayanUjian();
  try {
    const r = await mintaMentah(port, {
      laluan: '/api/lokal/kredensial',
      headers: { Origin: `http://127.0.0.1:${port}`, 'X-HADIR-Lokal': NONCE_UJIAN }
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.ada, false);
    assert.equal(r.json.loginAuto, false);
    assert.equal(r.teks.includes(KRED.idMeKataLaluan), false);
  } finally { pelayan.close(); }
});

test('POST /api/lokal/kredensial set -> 200, respons tersamar TANPA gema nilai', async () => {
  const { pelayan, konteks, port } = await mulakanPelayanUjian();
  try {
    const r = await mintaMentah(port, {
      method: 'POST', laluan: '/api/lokal/kredensial',
      headers: { Origin: `http://127.0.0.1:${port}`, 'X-HADIR-Lokal': NONCE_UJIAN, 'Content-Type': 'application/json' },
      badan: JSON.stringify(KRED)
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.ada, true);
    assert.equal(r.json.pengguna, 'P***');
    assert.equal(r.json.kunciAda, true);
    // Respons TIDAK PERNAH mengandungi nilai kata laluan/pengguna.
    assert.equal(r.teks.includes(KRED.idMeKataLaluan), false);
    assert.equal(r.teks.includes(KRED.idMePengguna), false);
    // Nilai sebenar disimpan (untuk semakan), tetapi tidak dipulangkan.
    assert.equal(konteks.kredensial._kred.kataLaluan, KRED.idMeKataLaluan);
  } finally { pelayan.close(); }
});

test('POST /api/lokal/kredensial medan kosong -> 400, mesej tanpa nilai', async () => {
  const { pelayan, port } = await mulakanPelayanUjian();
  try {
    const r = await mintaMentah(port, {
      method: 'POST', laluan: '/api/lokal/kredensial',
      headers: { Origin: `http://127.0.0.1:${port}`, 'X-HADIR-Lokal': NONCE_UJIAN, 'Content-Type': 'application/json' },
      badan: JSON.stringify({ idMePengguna: 'PENGGUNA-UJIAN', idMeKataLaluan: '' })
    });
    assert.equal(r.status, 400);
    assert.match(r.json.ralat, /diperlukan/);
    assert.equal(r.teks.includes('PENGGUNA-UJIAN'), false, 'mesej ralat tidak boleh membocorkan nilai');
  } finally { pelayan.close(); }
});

test('POST /api/lokal/kredensial-padam -> 200 dan status kembali kosong', async () => {
  const { pelayan, konteks, port } = await mulakanPelayanUjian();
  try {
    await mintaMentah(port, {
      method: 'POST', laluan: '/api/lokal/kredensial',
      headers: { Origin: `http://127.0.0.1:${port}`, 'X-HADIR-Lokal': NONCE_UJIAN, 'Content-Type': 'application/json' },
      badan: JSON.stringify(KRED)
    });
    assert.equal(konteks.kredensial.ada(), true);
    const padam = await mintaMentah(port, {
      method: 'POST', laluan: '/api/lokal/kredensial-padam',
      headers: { Origin: `http://127.0.0.1:${port}`, 'X-HADIR-Lokal': NONCE_UJIAN, 'Content-Type': 'application/json' },
      badan: '{}'
    });
    assert.equal(padam.status, 200);
    assert.equal(padam.json.ada, false);
    assert.equal(konteks.kredensial.ada(), false);
  } finally { pelayan.close(); }
});

test('POST /api/lokal/kredensial TANPA nonce -> 403 (hanya header sah)', async () => {
  const { pelayan, port } = await mulakanPelayanUjian();
  try {
    const r = await mintaMentah(port, {
      method: 'POST', laluan: '/api/lokal/kredensial',
      headers: { Origin: `http://127.0.0.1:${port}`, 'Content-Type': 'application/json' },
      badan: JSON.stringify(KRED)
    });
    assert.equal(r.status, 403);
  } finally { pelayan.close(); }
});

test('Origin asing pada /api/lokal/kredensial -> 403', async () => {
  const { pelayan, port } = await mulakanPelayanUjian();
  try {
    const r = await mintaMentah(port, {
      method: 'POST', laluan: '/api/lokal/kredensial',
      headers: { Origin: 'https://jahat.invalid', 'X-HADIR-Lokal': NONCE_UJIAN, 'Content-Type': 'application/json' },
      badan: JSON.stringify(KRED)
    });
    assert.equal(r.status, 403);
  } finally { pelayan.close(); }
});

test('remote HADIR Admin (Origin sepadan.github.io) TIDAK boleh baca/set kredensial', async () => {
  const { pelayan, port } = await mulakanPelayanUjian();
  try {
    const r = await mintaMentah(port, {
      method: 'POST', laluan: '/api/lokal/kredensial',
      headers: { Origin: 'https://sepadan.github.io', Authorization: 'Bearer x', 'Content-Type': 'application/json' },
      badan: JSON.stringify(KRED)
    });
    assert.equal(r.status, 403);
  } finally { pelayan.close(); }
});

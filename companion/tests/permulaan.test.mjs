import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { dengarSelepasBind } from '../src/permulaan.mjs';

class PelayanPalsu extends EventEmitter {
  listen(port, host, cb) { this.port = port; this.host = host; this.cb = cb; }
  berjayaBind() { this.cb(); }
}

test('auto-mula tidak pernah berjalan sebelum bind loopback berjaya', async () => {
  const pelayan = new PelayanPalsu();
  const urutan = [];
  dengarSelepasBind({
    pelayan, port: 8747,
    selepasBind: async () => { urutan.push('auto'); },
    apabilaBind: () => { urutan.push('bind'); },
    apabilaRalat: (e) => { throw e; }
  });
  assert.deepEqual(urutan, []);
  assert.equal(pelayan.host, '127.0.0.1');
  pelayan.berjayaBind();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(urutan, ['bind', 'auto']);
});

test('ralat bind kelihatan dan tidak memanggil auto-mula', () => {
  const pelayan = new PelayanPalsu();
  const urutan = [];
  dengarSelepasBind({
    pelayan, port: 8747,
    selepasBind: async () => { urutan.push('auto'); },
    apabilaRalat: (e, fasa) => urutan.push(`${fasa}:${e.message}`)
  });
  pelayan.emit('error', new Error('EADDRINUSE'));
  assert.deepEqual(urutan, ['bind:EADDRINUSE']);
});


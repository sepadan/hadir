import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { verifyOwnerTicket } from '../src/crypto.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', 'scripts', 'open-panel.py');
const PY_TESTS = join(HERE, 'test_open_panel.py');
const PYTHON = process.env.PYTHON || 'python';
const FAKE_KEY = 'fixture-owner-key-0123456789abcdef0123456789abcdef'; // rekaan ujian sahaja

function runPython(args, input) {
  return new Promise((resolve) => {
    const child = execFile(PYTHON, ['-I', ...args], { timeout: 60000 }, (error, stdout, stderr) =>
      resolve({ code: error ? error.code ?? 1 : 0, stdout, stderr })
    );
    if (input !== undefined) child.stdin.end(input);
  });
}

describe('Pelancar pemilik (scripts/open-panel.py)', () => {
  it('ujian unit Python lulus (konfigurasi, DPAPI palsu, pelayan satu-kali)', async () => {
    const { code, stderr } = await runPython([PY_TESTS]);
    assert.equal(code, 0, stderr);
  });

  it('tiket dijana Python disahkan oleh WebCrypto Worker (kunci rekaan)', async () => {
    const snippet = [
      'import importlib.util, sys',
      `spec = importlib.util.spec_from_file_location("op", ${JSON.stringify(SCRIPT)})`,
      'm = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)',
      'sys.stdout.write(m.mint_owner_ticket(sys.stdin.read().strip()))'
    ].join('\n');
    const { code, stdout, stderr } = await runPython(['-c', snippet], FAKE_KEY);
    assert.equal(code, 0, stderr);
    const verified = await verifyOwnerTicket(FAKE_KEY, stdout.trim());
    assert.equal(verified.kind, 'owner-login');
    assert.equal(verified.exp - verified.iat, 90);
  });
});

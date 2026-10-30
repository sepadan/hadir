// Semakan sintaks SEMUA modul (node --check hanya menyemak satu fail setiap
// panggilan), JS UI yang dijana, dan skrip Python pelancar.
import { execFileSync } from 'node:child_process';
import { readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function listFiles(dir, exts) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(p, exts));
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(p);
  }
  return out;
}

const jsFiles = [...listFiles(join(ROOT, 'src'), ['.mjs']), ...listFiles(join(ROOT, 'tests'), ['.mjs']), ...listFiles(join(ROOT, 'scripts'), ['.mjs'])];
let failed = 0;
for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    failed++;
    process.stderr.write(`GAGAL: ${file}\n${err.stderr}\n`);
  }
}

// JS UI yang dihidangkan pada /app.js.
const { renderAppJs } = await import('../src/ui.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'autohadir-check-'));
try {
  const appJs = join(tmp, 'app.js');
  writeFileSync(appJs, renderAppJs());
  execFileSync(process.execPath, ['--check', appJs], { stdio: 'pipe' });
} catch (err) {
  failed++;
  process.stderr.write(`GAGAL: /app.js dijana\n${err.stderr || err.message}\n`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const pyFiles = [join(ROOT, 'scripts', 'open-panel.py'), join(ROOT, 'tests', 'test_open_panel.py')];
const python = process.env.PYTHON || 'python';
for (const file of pyFiles) {
  try {
    execFileSync(python, ['-I', '-c', 'import ast,sys; ast.parse(open(sys.argv[1], encoding="utf-8").read(), sys.argv[1])', file], { stdio: 'pipe' });
  } catch (err) {
    failed++;
    process.stderr.write(`GAGAL: ${file}\n${err.stderr}\n`);
  }
}

const total = jsFiles.length + 1 + pyFiles.length;
if (failed) {
  process.stderr.write(`${failed}/${total} fail gagal semakan sintaks\n`);
  process.exit(1);
}
process.stdout.write(`Semakan sintaks lulus: ${total} fail (${jsFiles.length} modul JS, /app.js dijana, ${pyFiles.length} Python)\n`);

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = JSON.parse(readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

describe('Konfigurasi Worker & alat', () => {
  it('wrangler.jsonc: akaun, nama, DO SQLite, binding BROWSER, tiada cron, pemerhatian mati', () => {
    assert.equal(wrangler.name, 'autohadir-skpr-cloud');
    assert.equal(wrangler.account_id, 'dcb3aa58b278e9a5c46103139fbb3367');
    assert.equal(wrangler.main, 'src/index.mjs');
    assert.deepEqual(wrangler.browser, { binding: 'BROWSER' });
    assert.deepEqual(wrangler.durable_objects.bindings, [{ name: 'SESSION', class_name: 'SchoolSession' }]);
    assert.deepEqual(wrangler.migrations, [{ tag: 'v1', new_sqlite_classes: ['SchoolSession'] }]);
    assert.equal(wrangler.triggers, undefined);
    assert.equal(wrangler.observability.enabled, false);
    assert.equal(wrangler.upload_source_maps, false);
    for (const k of ['d1_databases', 'kv_namespaces', 'r2_buckets', 'vars']) assert.equal(wrangler[k], undefined, k);
  });

  it('wrangler dipin tepat 4.156.0', () => {
    assert.equal(pkg.devDependencies.wrangler, '4.156.0');
  });

  it('skrip check meliputi semua modul src (bukan hanya fail pertama)', () => {
    assert.equal(pkg.scripts.check, 'node scripts/check.mjs');
    const checker = readFileSync(join(ROOT, 'scripts', 'check.mjs'), 'utf8');
    assert.match(checker, /readdirSync/);
    assert.match(checker, /renderAppJs/);
    assert.ok(readdirSync(join(ROOT, 'src')).length >= 7);
  });
});

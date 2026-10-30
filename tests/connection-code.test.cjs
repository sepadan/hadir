const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const source = fs.readFileSync('apps-script/HadirWeb.gs', 'utf8');
const endpoint = 'https://script.google.com/macros/s/SYNTHETIC_DEPLOYMENT/exec';
function fixture(data = new Map()) {
  let locked = false; let hook; let failWrite = false;
  const props = {
    getProperty: k => data.get(k) ?? null,
    setProperty(k, v) { assert(locked); if (failWrite) throw Error('synthetic storage failure'); data.set(k, v); if (hook && k === 'HADIR_SAMBUNG_V1') { const h = hook; hook = null; h(); } },
  };
  const k = vm.createContext({
    Date, JSON, PropertiesService: { getScriptProperties: () => props },
    LockService: { getScriptLock: () => ({ waitLock() { if (locked) throw Error('busy'); locked = true; }, releaseLock() { assert(locked); locked = false; } }) },
    ScriptApp: { getService: () => ({ getUrl: () => endpoint }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (_, s) => [...crypto.createHash('sha256').update(s).digest()],
      base64EncodeWebSafe: s => Buffer.from(s).toString('base64url'),
      base64DecodeWebSafe: s => [...Buffer.from(s, 'base64url')],
      newBlob: b => ({ getDataAsString: () => Buffer.from(b).toString('utf8') }),
    },
    ss: { getSheetByName: () => null },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType() { return this; }, getContent: () => s }) },
  });
  if (!data.has('HADIR_SAMBUNG_EXEC_URL')) data.set('HADIR_SAMBUNG_EXEC_URL', endpoint);
  vm.runInContext(source, k);
  k.hadirSesi_ = token => { if (token !== 'synthetic-admin') throw Error('admin denied'); return { peranan: 'admin' }; };
  k.hadirBacaJobBaris_ = () => [];
  return { k, data, hook: h => hook = h, fail: () => failWrite = true };
}
function generate(f) { return f.k.hadirSambungJana_('synthetic-admin'); }
test('admin generates encoded endpoint + high entropy code; hashes only, no expiry', () => {
  const f = fixture(), a = generate(f), b = generate(f);
  assert.notEqual(a.kod, b.kod);
  const [url, secret] = JSON.parse(Buffer.from(a.kod.slice(4), 'base64url'));
  assert.equal(url, endpoint); assert.match(secret, /^[a-f0-9]{64}$/);
  const stored = JSON.stringify([...f.data.values()]);
  assert(!stored.includes(a.kod)); assert(!stored.includes(secret)); assert(!stored.includes('luput'));
  const list = f.k.hadirSambungSenarai_('synthetic-admin');
  assert(!JSON.stringify(list).includes('hash')); assert(!JSON.stringify(list).includes(secret));
});
test('single use and serialized competing redemption: exactly one credential', () => {
  const f = fixture(), a = generate(f); let loser;
  let commitObserved = false;
  f.hook(() => {
    const commit = JSON.parse(f.data.get('HADIR_SAMBUNG_V1'));
    assert.equal(commit.kod.find(r=>r.id===a.id).status, 'digunakan');
    assert.equal(commit.peranti.length, 1); commitObserved = true;
    try { f.k.hadirSambungTukar_(a.kod); } catch (e) { loser = e; }
  });
  const device = f.k.hadirSambungTukar_(a.kod);
  assert(commitObserved); assert(loser); assert.match(device.tokenPeranti, /^HD1\.[a-f0-9]{32}\.[a-f0-9]{64}$/);
  assert.throws(() => f.k.hadirSambungTukar_(a.kod));
  assert.equal(f.k.hadirSambungSenarai_('synthetic-admin').peranti.length, 1);
  assert(!JSON.stringify([...f.data.values()]).includes(device.tokenPeranti));
});
test('no expiry even after years; code revoke, device revoke and scoped auth', () => {
  const f = fixture(), a = generate(f), b = generate(f);
  f.k.hadirSambungBatal_('kod', b.id, 'synthetic-admin');
  assert.throws(() => f.k.hadirSambungTukar_(b.kod));
  const OriginalDate = Date;
  f.k.Date = class extends OriginalDate { static now() { return OriginalDate.now() + 20 * 365 * 86400000; } };
  const d = f.k.hadirSambungTukar_(a.kod);
  assert.equal(f.k.hadirSahRahsiaMoeis_(d.tokenPeranti), true);
  assert.equal(f.k.hadirMoeisJobSenarai_('', d.tokenPeranti).length, 0);
  assert.throws(() => f.k.hadirSambungJana_(d.tokenPeranti));
  assert.throws(() => f.k.hadirSambungSenarai_(d.tokenPeranti));
  assert.throws(() => f.k.hadirMoeisJobKlaim_('job', 'another-owner', false, d.tokenPeranti));
  f.k.hadirSambungBatal_('peranti', d.idPeranti, 'synthetic-admin');
  for (const op of [() => f.k.hadirSahRahsiaMoeis_(d.tokenPeranti), () => f.k.hadirMoeisJobSenarai_('', d.tokenPeranti),
    () => f.k.hadirMoeisJobKlaim_('job', d.idPeranti, false, d.tokenPeranti),
    () => f.k.hadirMoeisJobLepas_('job', d.idPeranti, d.tokenPeranti),
    () => f.k.hadirMoeisJobSelesai_('job', 'gagal', '', '', d.idPeranti, d.tokenPeranti)]) assert.throws(op);
});
test('admin auth, legacy secret compatibility and corrupt/quota storage fail closed', () => {
  const f = fixture();
  for (const op of [() => f.k.hadirSambungJana_('bad'), () => f.k.hadirSambungSenarai_('bad'), () => f.k.hadirSambungBatal_('kod', 'bad', 'bad')]) assert.throws(op);
  f.data.set('HADIR_MOEIS_ENGINE_SECRET', 'synthetic-legacy');
  assert.equal(f.k.hadirSahRahsiaMoeis_('synthetic-legacy'), true);
  assert.throws(() => f.k.hadirSahRahsiaMoeis_('invalid'));
  generate(f); f.data.set('HADIR_SAMBUNG_V1', '{broken');
  assert.throws(() => generate(f)); assert.throws(() => f.k.hadirSambungSenarai_('synthetic-admin'));
  const g = fixture(), a = generate(g); g.fail();
  assert.throws(() => g.k.hadirSambungTukar_(a.kod));
});
test('persistent bounded rate limit includes invalid attempts and survives contexts', () => {
  const f = fixture();
  for (let i = 0; i < 20; i++) assert.throws(() => f.k.hadirSambungTukar_('invalid'));
  const a = generate(f);
  const cold = fixture(f.data);
  assert.throws(() => cold.k.hadirSambungTukar_(a.kod), /kadar/i);
});
test('strict URL allowlist and invalid UUID source fail closed', () => {
  const f = fixture();
  for (const url of ['http://script.google.com/macros/s/a/exec', endpoint + '?x=1', endpoint + '#x', endpoint + '\n',
    'https://user@script.google.com/macros/s/a/exec', 'https://script.google.com.evil.test/macros/s/a/exec',
    'https://script.googleusercontent.com/macros/echo', 'https://script.google.com/macros/s/a/../exec',
    'https://script.google.com:444/macros/s/a/exec']) assert.equal(f.k.hadirSambungUrlSah_(url), false, url);
  assert.equal(f.k.hadirSambungUrlSah_(endpoint), true);
  f.k.Utilities.getUuid = () => 'not-random'; assert.throws(() => generate(f));
});
test('bounded registry: pending code limit, active device limit, corrupted rate state', () => {
  const f = fixture();
  for(let i=0;i<12;i++) generate(f);
  assert.throws(()=>generate(f));
  assert.equal(f.k.hadirSambungSenarai_('synthetic-admin').kod.length,12);
  const g=fixture();
  for(let i=0;i<12;i++) g.k.hadirSambungTukar_(generate(g).kod);
  assert.throws(()=>generate(g));
  assert.equal(g.k.hadirSambungSenarai_('synthetic-admin').peranti.length,12);
  const h=fixture(), a=generate(h);
  h.data.set('HADIR_SAMBUNG_KADAR_V1','{"mula":0,"n":"bad"}');
  assert.throws(()=>h.k.hadirSambungTukar_(a.kod));
  assert.equal(h.k.hadirSambungSenarai_('synthetic-admin').kod[0].status,'menunggu');
});
test('authoritative endpoint required; getService is never a source of trust', () => {
  const f=fixture(); f.data.delete('HADIR_SAMBUNG_EXEC_URL');
  assert.throws(()=>generate(f), /ENDPOINT/);
  f.data.set('HADIR_SAMBUNG_EXEC_URL',endpoint);
  f.k.ScriptApp.getService=()=>{throw Error('must not be called');};
  assert.equal(JSON.parse(Buffer.from(generate(f).kod.slice(4),'base64url'))[0],endpoint);
});
test('redeemed codes link device and cannot be misleadingly revoked as pending codes', () => {
  const f=fixture(), a=generate(f), d=f.k.hadirSambungTukar_(a.kod);
  assert.throws(()=>f.k.hadirSambungBatal_('kod',a.id,'synthetic-admin'), /USED_CODE/);
  generate(f);
  const record=f.k.hadirSambungSenarai_('synthetic-admin').kod.find(r=>r.id===a.id);
  assert.equal(record.status,'digunakan'); assert.equal(record.idPeranti,d.idPeranti);
  f.k.hadirSambungBatal_('peranti',record.idPeranti,'synthetic-admin');
  assert.throws(()=>f.k.hadirSahRahsiaMoeis_(d.tokenPeranti));
});
test('fixed sanitized errors distinguish admin auth, invalid code, rate, corruption and limits', () => {
  const f=fixture(); assert.throws(()=>f.k.hadirSambungJana_('bad'), /AUTH/);
  assert.throws(()=>f.k.hadirSambungTukar_('synthetic-secret-invalid'), /INVALID_CODE/);
  f.data.set('HADIR_SAMBUNG_V1','corrupt-synthetic-secret');
  assert.throws(()=>generate(f),e=> /CORRUPT/.test(e.message) && !e.message.includes('synthetic-secret'));
});
test('exchange fails closed if authority disappears or differs from the embedded deployment', () => {
  const f=fixture(), a=generate(f);
  f.data.delete('HADIR_SAMBUNG_EXEC_URL'); assert.throws(()=>f.k.hadirSambungTukar_(a.kod),/ENDPOINT/);
  f.data.set('HADIR_SAMBUNG_EXEC_URL','https://script.google.com/macros/s/OTHER_DEPLOYMENT/exec');
  assert.throws(()=>f.k.hadirSambungTukar_(a.kod),/ENDPOINT/);
  assert.equal(f.k.hadirSambungSenarai_('synthetic-admin').kod[0].status,'menunggu');
  f.data.set('HADIR_SAMBUNG_EXEC_URL',endpoint); assert.match(f.k.hadirSambungTukar_(a.kod).tokenPeranti,/^HD1\./);
});

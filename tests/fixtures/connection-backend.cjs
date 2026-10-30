const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
const endpoint = 'https://script.google.com/macros/s/SYNTHETIC_DEPLOYMENT/exec';
function fixture() {
  const data = new Map(); let locked = false; let hook; let failWrite = false;
  const props = {
    getProperty: k => data.get(k) ?? null,
    deleteProperty: k => data.delete(k),
    setProperty(k, v) { assert(locked); if (failWrite) throw Error('synthetic storage failure'); data.set(k, v); if (hook) { const h = hook; hook = null; h(); } },
  };
  const rows = [['ID','DATE','CLASS','STATUS','MESSAGE','CREATED','UPDATED','DONE','COUNT','PUPILS','CLASS_ID','OWNER','LEASE'],
    ['synthetic-job','2026-10-30','KELAS REKAAN','menunggu','',new Date(),'', '', '', JSON.stringify([{id:'synthetic-pupil',nama:'MURID REKAAN',kategori:'D',sebab:'DEMAM'}]),'', '', '']];
  const sheet = { getLastRow: () => rows.length, getRange(r,c,n=1,w=1) { return {
    getValues: () => Array.from({length:n}, (_,i) => Array.from({length:w}, (_,j) => rows[r-1+i]?.[c-1+j] ?? '')),
    getDisplayValues() { return this.getValues().map(row => row.map(String)); },
    getValue() { return this.getValues()[0][0]; },
    setValue(v) { rows[r-1][c-1] = v; },
    setValues(v) { v.forEach((row,i) => row.forEach((x,j) => rows[r-1+i][c-1+j]=x)); },
  }; } };
  const k = vm.createContext({
    Date, JSON, PropertiesService: { getScriptProperties: () => props },
    LockService: { getScriptLock: () => ({ waitLock() { if (locked) throw Error('busy'); locked = true; }, releaseLock() { assert(locked); locked = false; } }) },
    ScriptApp: { getService: () => ({ getUrl: () => endpoint }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (_, s) => [...crypto.createHash('sha256').update(s).digest()],
      base64EncodeWebSafe: s => Buffer.from(s).toString('base64url'),
      base64DecodeWebSafe: s => [...Buffer.from(s,'base64url')],
      newBlob: b => ({ getDataAsString: () => Buffer.from(b).toString('utf8') }),
    },
    ss: { getSheetByName: n => n === 'HADIR_MOEIS_JOB' ? sheet : null },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType() { return this; }, getContent: () => s }) },
  });
  if (!data.has('HADIR_SAMBUNG_EXEC_URL')) data.set('HADIR_SAMBUNG_EXEC_URL', endpoint);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../../apps-script/HadirWeb.gs'), 'utf8'), k);
  data.set('HADIR_SESI_synthetic-admin', JSON.stringify({ peranan:'admin', luput:Date.now()+3600000 }));
  k.hadirLog_ = k.hadirPadamCacheInit_ = () => {};
  return { k, data, rows, locked: () => locked, hook: h => hook = h, fail: () => failWrite = true };
}
module.exports = { fixture, endpoint };
if (require.main === module) {
  const f = fixture();
  f.data.set('HADIR_MOEIS_ENGINE_SECRET', 'synthetic-legacy');
  require('node:readline').createInterface({input:process.stdin}).on('line', line => {
    const payload = JSON.parse(line);
    process.stdout.write(f.k.hadirDoPost_({hadirPayload_:payload}).getContent() + '\n');
  });
}

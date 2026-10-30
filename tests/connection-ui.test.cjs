const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync('app.js', 'utf8').replace(/\r\n/g, '\n');
function fn(name) {
  const m = app.match(new RegExp('  function ' + name + '\\([^]*?(?=\\n  function |\\n  var )'));
  assert(m, name + ' must exist'); return m[0];
}
test('leaving pairing clears bearer code and invalidates outstanding responses', () => {
  const fields = { sambungKod: { value: 'synthetic-bearer' }, sambungHasil: { hidden: false }, sambungSenarai: { textContent: 'private-registry' }, sambungJana: { disabled: true } };
  const c = { $: id => fields[id], sambungVersi: 0, sambungSenaraiVersi: 0 };
  vm.runInNewContext(fn('bersihSambungan_'), c);
  c.bersihSambungan_();
  assert.equal(c.sambungVersi, 1); assert.equal(fields.sambungKod.value, '');
  assert.equal(fields.sambungHasil.hidden, true); assert.equal(fields.sambungSenarai.textContent, '');
});
test('out-of-order registry reads cannot overwrite newer device revocation state', async () => {
  function el() { return { textContent:'', children:[], appendChild(c){this.children.push(c);}, addEventListener(){} }; }
  const root=el(), pending=[];
  const c={sambungVersi:0,sambungSenaraiVersi:0,state:{token:'synthetic-admin',paneAktif:'moeisPane'},
    $:()=>root, document:{createElement:el}, panggil:()=>new Promise(resolve=>pending.push(resolve)),status:()=>{}};
  vm.runInNewContext(fn('sambungMasihSah_')+'\n'+fn('muatSambungan_'),c);
  c.muatSambungan_(); c.muatSambungan_();
  pending[1]({kod:[],peranti:[{id:'synthetic-device',masa:1,status:'dibatalkan'}]});
  await new Promise(resolve=>setImmediate(resolve));
  const newer=JSON.stringify(root);
  pending[0]({kod:[],peranti:[{id:'synthetic-device',masa:1,status:'aktif'}]});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(JSON.stringify(root),newer); assert.match(newer,/Dibatalkan/); assert.doesNotMatch(newer,/Dibenarkan/);
});
test('clipboard history warning is visible and error reasons never echo arbitrary backend text', () => {
  const html=fs.readFileSync('index.html','utf8'); assert.match(html,/sejarah papan klip/); assert.match(html,/awan Windows/);
  const c={}; vm.runInNewContext(fn('ralatSambunganUi_'),c);
  assert.match(c.ralatSambunganUi_({message:'[SAMBUNG_RATE] synthetic-secret'}),/seminit/);
  assert(!c.ralatSambunganUi_({message:'synthetic-secret'}).includes('synthetic-secret'));
});
test('pairing UI is admin RPC, one-time display, responsive and never stored', () => {
  const html = fs.readFileSync('index.html', 'utf8'), css = fs.readFileSync('styles.css', 'utf8');
  assert.match(html, /id="sambungJana"/); assert.match(html, /id="sambungKod"[^>]*readonly/);
  assert.match(app, /moeisSambungJana/); assert.match(app, /moeisSambungBatal/); assert.match(app, /moeisSambungSenarai/);
  assert.match(fn('janaSambungan_'), /state\.token/);
  assert.doesNotMatch(fn('janaSambungan_'), /localStorage|sessionStorage|console\./);
  assert.match(css, /\.sambung-card textarea[^}]*width:\s*100%/);
});


test('revoked-device quarantine requires confirmation and current admin session; linked-PC label has no question mark',async()=>{
  function el(){return {textContent:'',children:[],listeners:{},appendChild(c){this.children.push(c);},addEventListener(n,f){this.listeners[n]=f;}};}
  const root=el(),calls=[]; let confirm=false;
  const c={sambungVersi:0,sambungSenaraiVersi:0,state:{token:'synthetic-admin',paneAktif:'moeisPane'},$:()=>root,
    document:{createElement:el},window:{confirm:()=>confirm},status:()=>{},
    panggil:(m,args)=>{calls.push([m,args]);return Promise.resolve(m==='moeisSambungSenarai'?{kod:[{id:'code',masa:1,status:'digunakan',idPeranti:'old'}],peranti:[{id:'old',masa:1,status:'dibatalkan'}]}:{bilangan:1});}};
  vm.runInNewContext(fn('sambungMasihSah_')+'\n'+fn('muatSambungan_'),c);
  c.muatSambungan_(); await new Promise(r=>setImmediate(r));
  const all=[]; function visit(e){all.push(e); e.children.forEach(visit);} visit(root);
  assert(all.some(e=>e.textContent.includes('PC terpaut:'))); assert(!all.some(e=>e.textContent.includes('? PC terpaut:')));
  const button=all.find(e=>e.textContent==='Asingkan tugasan untuk semakan manual'); assert(button);
  button.listeners.click(); assert.equal(calls.length,1);
  confirm=true; button.listeners.click(); await new Promise(r=>setImmediate(r));
  const action=calls.find(([m])=>m==='moeisSambungAsingTugas'); assert.deepEqual(Array.from(action[1]),['old','ASINGKAN TUGASAN UNTUK SEMAKAN MANUAL','synthetic-admin']);
});

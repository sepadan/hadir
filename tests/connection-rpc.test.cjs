const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./fixtures/connection-backend.cjs');
function rpc(f, kaedah, argumen) { return JSON.parse(f.k.hadirDoPost_({hadirPayload_:{kaedah,argumen}}).getContent()); }
test('actual dispatcher + existing admin sessions: generate -> redeem -> job list/claim/complete -> revoke', () => {
  const f = fixture(), admin='synthetic-admin';
  const a = rpc(f,'moeisSambungJana',[admin]); assert.equal(a.ok,true);
  const d = rpc(f,'moeisSambungTukar',[a.hasil.kod]).hasil;
  assert.equal(rpc(f,'moeisSambungTukar',[a.hasil.kod]).ok,false);
  assert.equal(rpc(f,'moeisJobSenarai',['',d.tokenPeranti]).hasil.length,1);
  assert.equal(rpc(f,'moeisJobKlaim',['synthetic-job','different-owner',false,d.tokenPeranti]).ok,false);
  assert.equal(rpc(f,'moeisJobKlaim',['synthetic-job',d.idPeranti,false,d.tokenPeranti]).hasil.id,'synthetic-job');
  assert.equal(rpc(f,'moeisJobLepas',['synthetic-job',d.idPeranti,d.tokenPeranti]).ok,true);
  assert.equal(rpc(f,'moeisJobKlaim',['synthetic-job',d.idPeranti,false,d.tokenPeranti]).ok,true);
  assert.equal(rpc(f,'moeisJobSelesai',['synthetic-job','gagal','fixture only','',d.idPeranti,d.tokenPeranti]).ok,true);
  assert.equal(f.rows[1][3],'gagal');
  assert.equal(rpc(f,'moeisSambungBatal',['peranti',d.idPeranti,admin]).ok,true);
  assert.equal(rpc(f,'moeisJobSenarai',['',d.tokenPeranti]).ok,false);
});
test('all new admin endpoints reject missing, non-admin and expired existing sessions', () => {
  const f=fixture();
  f.data.set('HADIR_SESI_teacher',JSON.stringify({peranan:'guru',luput:Date.now()+3600000}));
  f.data.set('HADIR_SESI_expired',JSON.stringify({peranan:'admin',luput:1}));
  for (const token of ['', 'invalid','teacher','expired']) for (const [method,args] of [
    ['moeisSambungAsingTugas',['a'.repeat(32),'ASINGKAN TUGASAN UNTUK SEMAKAN MANUAL',token]],['moeisSambungJana',[token]],['moeisSambungSenarai',[token]],['moeisSambungBatal',['peranti','a'.repeat(32),token]]
  ]) assert.equal(rpc(f,method,args).ok,false);
});
test('list sheet read is unlocked; revocation during read prevents delivery and subsequent writes', () => {
  const f=fixture(), a=rpc(f,'moeisSambungJana',['synthetic-admin']).hasil;
  const d=rpc(f,'moeisSambungTukar',[a.kod]).hasil;
  f.k.hadirBacaJobBaris_=()=> {
    assert.equal(f.locked(),false);
    f.k.hadirSambungBatal_('peranti',d.idPeranti,'synthetic-admin');
    return [];
  };
  assert.equal(rpc(f,'moeisJobSenarai',['',d.tokenPeranti]).ok,false);
  const before=JSON.stringify(f.rows);
  assert.equal(rpc(f,'moeisJobKlaim',['synthetic-job',d.idPeranti,false,d.tokenPeranti]).ok,false);
  assert.equal(JSON.stringify(f.rows),before);
  f.k.hadirBacaJobBaris_=()=> { assert.equal(f.locked(),false); return []; };
  assert.equal(rpc(f,'moeisJobSenarai',['synthetic-admin']).ok,true);
});
test('owner corruption repair is explicit, locked, backed up, and unavailable to RPC', () => {
  const f=fixture(), a=rpc(f,'moeisSambungJana',['synthetic-admin']).hasil;
  const d=rpc(f,'moeisSambungTukar',[a.kod]).hasil;
  f.data.set('HADIR_SAMBUNG_KADAR_V1','synthetic-corrupt-rate');
  assert.equal(rpc(f,'hadirSambungPulihStoranPemilik_',['kadar','SET SEMULA HAD KADAR DESKTOP']).ok,false);
  assert.throws(()=>f.k.hadirSambungPulihStoranPemilik_('kadar','wrong'));
  assert.equal(f.data.get('HADIR_SAMBUNG_KADAR_V1'),'synthetic-corrupt-rate');
  f.k.hadirSambungPulihStoranPemilik_('kadar','SET SEMULA HAD KADAR DESKTOP');
  assert.equal(f.data.get('HADIR_SAMBUNG_PEMULIHAN_KADAR'),'synthetic-corrupt-rate');
  assert.equal(f.k.hadirSahRahsiaMoeis_(d.tokenPeranti),true);
  f.data.set('HADIR_SAMBUNG_V1','synthetic-corrupt-registry');
  f.k.hadirSambungPulihStoranPemilik_('daftar','BATALKAN SEMUA KOD DAN TOKEN DESKTOP');
  assert.equal(f.data.get('HADIR_SAMBUNG_PEMULIHAN_DAFTAR'),'synthetic-corrupt-registry');
  assert.throws(()=>f.k.hadirSahRahsiaMoeis_(d.tokenPeranti));
  assert.throws(()=>f.k.hadirSambungTukar_(a.kod));
});
test('replacement exchange checks active jobs atomically even when old desktop storage is unreadable', () => {
  const f=fixture(), a=rpc(f,'moeisSambungJana',['synthetic-admin']).hasil;
  f.rows[1][3]='sedang_dihantar';
  const denied=rpc(f,'moeisSambungTukar',[a.kod,true]);
  assert.equal(denied.ok,false); assert.match(denied.ralat,/ACTIVE_JOB/);
  assert.equal(rpc(f,'moeisSambungSenarai',['synthetic-admin']).hasil.kod[0].status,'menunggu');
  f.rows[1][3]='tersimpan'; assert.equal(rpc(f,'moeisSambungTukar',[a.kod,true]).ok,false);
  f.rows[1][3]='gagal'; assert.equal(rpc(f,'moeisSambungTukar',[a.kod,true]).ok,true);
});


test('revoked old device re-pairs; unrelated owner active jobs do not block', () => {
  const f=fixture(), admin='synthetic-admin';
  const enroll=()=>rpc(f,'moeisSambungTukar',[rpc(f,'moeisSambungJana',[admin]).hasil.kod]).hasil;
  const old=enroll(), other=enroll();
  assert.equal(rpc(f,'moeisJobKlaim',['synthetic-job',other.idPeranti,false,other.tokenPeranti]).ok,true);
  rpc(f,'moeisSambungBatal',['peranti',old.idPeranti,admin]);
  assert.equal(rpc(f,'moeisJobSenarai',['',old.tokenPeranti]).ok,false);
  const code=rpc(f,'moeisSambungJana',[admin]).hasil.kod;
  const next=rpc(f,'moeisSambungTukar',[code,true,old.idPeranti]);
  assert.equal(next.ok,true); assert.notEqual(next.hasil.idPeranti,old.idPeranti);
  assert.equal(rpc(f,'moeisJobSenarai',['',next.hasil.tokenPeranti]).ok,true);
  assert.equal(f.rows[1][11],other.idPeranti); assert.equal(f.rows[1][3],'sedang_dihantar');
});

test('old-owned uncertain jobs block until explicitly quarantined by admin, never completed or requeued', () => {
  for (const status of ['sedang_dihantar','tersimpan']) {
    const f=fixture(), admin='synthetic-admin';
    const old=rpc(f,'moeisSambungTukar',[rpc(f,'moeisSambungJana',[admin]).hasil.kod]).hasil;
    rpc(f,'moeisJobKlaim',['synthetic-job',old.idPeranti,false,old.tokenPeranti]); f.rows[1][3]=status;
    rpc(f,'moeisSambungBatal',['peranti',old.idPeranti,admin]);
    const code=rpc(f,'moeisSambungJana',[admin]).hasil.kod;
    assert.match(rpc(f,'moeisSambungTukar',[code,true,old.idPeranti]).ralat,/ACTIVE_JOB/);
    const before=JSON.stringify(f.rows);
    for (const [confirm,token] of [['wrong',admin],['ASINGKAN TUGASAN UNTUK SEMAKAN MANUAL','bad']])
      assert.equal(rpc(f,'moeisSambungAsingTugas',[old.idPeranti,confirm,token]).ok,false);
    assert.equal(JSON.stringify(f.rows),before);
    const recovered=rpc(f,'moeisSambungAsingTugas',[old.idPeranti,'ASINGKAN TUGASAN UNTUK SEMAKAN MANUAL',admin]);
    assert.equal(recovered.ok,true); assert.equal(recovered.hasil.bilangan,1);
    assert.equal(f.k.hadirMoeisBolehCiptaJob_('semakan_manual'),false);
    assert.equal(f.rows[1][3],'semakan_manual'); assert.equal(f.rows[1][11],old.idPeranti);
    assert.match(f.rows[1][4],new RegExp(status)); assert.equal(f.rows[1][7],'');
    const next=rpc(f,'moeisSambungTukar',[code,true,old.idPeranti]); assert.equal(next.ok,true);
    for (const mode of [false,true,'verifikasi']) assert.equal(rpc(f,'moeisJobKlaim',['synthetic-job',next.hasil.idPeranti,mode,next.hasil.tokenPeranti]).hasil,null);
    assert.equal(rpc(f,'moeisJobSelesai',['synthetic-job','berjaya','',1,old.idPeranti,old.tokenPeranti]).ok,false);
  }
});


test('revoked unresolved owner stays visible after unrelated pairing; active devices cannot be quarantined',()=>{
  const f=fixture(),admin='synthetic-admin';
  const enroll=()=>rpc(f,'moeisSambungTukar',[rpc(f,'moeisSambungJana',[admin]).hasil.kod]).hasil;
  const old=enroll(); rpc(f,'moeisJobKlaim',['synthetic-job',old.idPeranti,false,old.tokenPeranti]);
  assert.equal(rpc(f,'moeisSambungAsingTugas',[old.idPeranti,'ASINGKAN TUGASAN UNTUK SEMAKAN MANUAL',admin]).ok,false);
  rpc(f,'moeisSambungBatal',['peranti',old.idPeranti,admin]); enroll();
  assert.equal(rpc(f,'moeisSambungSenarai',[admin]).hasil.peranti.find(d=>d.id===old.idPeranti).status,'dibatalkan');
});


test('revoked owner uncertain jobs cannot be stolen after lease expiry, including saved verification',()=>{
  for(const status of ['sedang_dihantar','tersimpan']) {
    const f=fixture(),admin='synthetic-admin';
    const enroll=()=>rpc(f,'moeisSambungTukar',[rpc(f,'moeisSambungJana',[admin]).hasil.kod]).hasil;
    const old=enroll(), other=enroll(); rpc(f,'moeisJobKlaim',['synthetic-job',old.idPeranti,false,old.tokenPeranti]);
    f.rows[1][3]=status; f.rows[1][12]=Date.now()-1000;
    rpc(f,'moeisSambungBatal',['peranti',old.idPeranti,admin]); const before=JSON.stringify(f.rows);
    for(const mode of [false,true,'verifikasi']) assert.equal(rpc(f,'moeisJobKlaim',['synthetic-job',other.idPeranti,mode,other.tokenPeranti]).hasil,null);
    assert.equal(JSON.stringify(f.rows),before);
  }
});

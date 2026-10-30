// Local synthetic fixture ONLY. config.js is replaced before app.js can run;
// real backend, portal, secrets and attendance are never accessed.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('./connection-backend.cjs');
const f = fixture(), root = path.resolve(__dirname, '../..');
const initial = { kelas: [], tarikhIso:'2026-10-30', tarikhPaparan:'30 Oktober 2026', sekolah:'SEKOLAH REKAAN', peranan:'guru' };
f.k.hadirInit_ = token => ({...initial, peranan:token?'admin':'guru'});
f.k.hadirLogin_ = () => ({token:'synthetic-admin',peranan:'admin'});
f.k.hadirMoeisSenaraiKelas_ = () => [];
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url,'http://127.0.0.1');
  res.setHeader('Cache-Control','no-store');
  if(url.pathname === '/rpc' && req.method === 'POST') {
    const chunks=[]; for await(const c of req) chunks.push(c);
    const payload=JSON.parse(Buffer.concat(chunks));
    res.setHeader('Content-Type','application/json');
    res.end(f.k.hadirDoPost_({hadirPayload_:payload}).getContent()); return;
  }
  if(url.pathname === '/config.js') { res.setHeader('Content-Type','text/javascript'); res.end('window.HADIR_CONFIG={apiUrl:"/rpc",versi:"SINTETIK"};'); return; }
  const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if(!/^(index\.html|styles\.css|app\.js|manifest\.webmanifest|icons\/[A-Za-z0-9_.-]+)$/.test(name)) {res.writeHead(404);res.end();return;}
  const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.webmanifest':'application/manifest+json'}[path.extname(name)];
  res.setHeader('Content-Type',mime || 'application/octet-stream'); res.end(fs.readFileSync(path.join(root,name)));
});
server.listen(53917,'127.0.0.1',()=>process.stdout.write('Synthetic fixture listening at 127.0.0.1:53917\n'));

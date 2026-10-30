import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {localBrowser} from './helpers/local-browser.mjs';

test('actual Wrangler bundle settings produce a self-contained portal function executable in Chromium',async t=>{
  const root=new URL('../',import.meta.url);
  const config=JSON.parse(await readFile(new URL('wrangler.jsonc',root),'utf8'));
  const result=await build({stdin:{contents:'export {PORTAL_FUNCTION} from "./src/flow-dom.mjs"',resolveDir:fileURLToPath(root)},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',keepNames:config.keep_names??true});
  const module=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
  assert.ok(!module.PORTAL_FUNCTION.includes('__name('),'serialized function cannot reference bundler-scope helpers');
  const b=await localBrowser(url=>url==='https://idme.moe.gov.my/login'?'<body>Fixture<input name="username"><button>Daftar Masuk</button></body>':null);
  t.after(()=>b.close());const p=await b.newPage();await b.navigate(p,'https://idme.moe.gov.my/login');
  const proof=await b.call(p,module.PORTAL_FUNCTION,'observe');
  assert.equal(proof.code,'observed');assert.equal(proof.login,true);
});

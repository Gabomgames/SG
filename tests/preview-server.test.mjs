import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPreviewServer} from '../scripts/preview-server.mjs';
test('portable preview serves the selected build and rejects hidden files and writes',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'sg-preview-fixture-'));await writeFile(join(dir,'index.html'),'<h1>synthetic preview fixture</h1>');await writeFile(join(dir,'.env'),'test-only-fixture');
 const server=createPreviewServer(dir);await new Promise((ok,no)=>server.once('error',no).listen(0,'127.0.0.1',ok));
 t.after(async()=>{await new Promise(ok=>server.close(ok));await rm(dir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`;
 const response=await fetch(base+'/');assert.equal(response.status,200);assert.equal(await response.text(),'<h1>synthetic preview fixture</h1>');assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal((await fetch(base+'/',{method:'HEAD'})).status,200);
 for(const file of ['/.env','/%2eenv','/missing','/%5c..%5coutside'])assert.equal((await fetch(base+file)).status,404,file);
 assert.equal((await fetch(base+'/',{method:'POST',body:'fixture'})).status,405);
});

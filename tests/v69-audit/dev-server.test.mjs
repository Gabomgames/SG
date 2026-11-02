// Integração HTTP real do servidor de desenvolvimento; nenhum SDK é simulado.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
const root=resolve(import.meta.dirname,'../..');
test('dev server entrega fonte e bloqueia caminhos internos e métodos de escrita', async t=>{
  const reservation=createServer();
  await new Promise((ok,no)=>reservation.once('error',no).listen(0,'127.0.0.1',ok));
  const port=reservation.address().port;
  await new Promise(ok=>reservation.close(ok));
  const child=spawn(process.execPath,[resolve(root,'scripts/dev-server.mjs')],{cwd:root,env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(child.exitCode===null){const ended=new Promise(ok=>child.once('exit',ok));child.kill();await ended;}});
  await new Promise((ok,no)=>{const timer=setTimeout(()=>no(new Error('Servidor não iniciou')),5000);child.once('error',e=>{clearTimeout(timer);no(e)});child.once('exit',code=>{clearTimeout(timer);no(new Error(`Servidor encerrou: ${code}`))});child.stdout.once('data',()=>{clearTimeout(timer);ok()});});
  const base=`http://127.0.0.1:${port}`;
  const home=await fetch(base+'/');assert.equal(home.status,200);
  assert.equal(await home.text(),await readFile(resolve(root,'index.html'),'utf8'));
  assert.equal(home.headers.get('cache-control'),'no-store');
  assert.equal(home.headers.get('x-content-type-options'),'nosniff');
  for(const path of ['/functions/index.js','/something-gamer-api/wrangler.jsonc','/.env','/.git/config','/tests/unit.test.js','/docs/CONFIGURACAO_V60.md','/%2eenv']) {
    assert.equal((await fetch(base+path)).status,404,path);
  }
  assert.equal((await fetch(base+'/',{method:'POST',body:'audit-only'})).status,405);
  assert.equal((await fetch(base+'/feed.html',{method:'HEAD'})).status,200);
});

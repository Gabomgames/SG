import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {parse} from 'acorn';
import * as sdk from './fixtures/firebase-sdk.js';
test('browser fixture exports match the actual Firebase imports',()=>{
  const root=new URL('../',import.meta.url);
  let checked=0;
  for(const file of readdirSync(root).filter(n=>n.endsWith('.js'))){
    const ast=parse(readFileSync(new URL(file,root),'utf8'),{sourceType:'module',ecmaVersion:'latest'});
    for(const node of ast.body){
      if(node.type!=='ImportDeclaration'||!node.source.value.startsWith('https://www.gstatic.com/firebasejs/'))continue;
      for(const spec of node.specifiers){
        if(!spec.imported)continue;
        checked++;
        assert.ok(Object.hasOwn(sdk,spec.imported.name),`${file} imports ${spec.imported.name}`);
      }
    }
  }
  assert.ok(checked>0,'actual Firebase imports must be checked');
});
test('unconfigured browser fixtures reject upload and account mutations',async()=>{
  for(const name of ['uploadBytes','getDownloadURL','createUserWithEmailAndPassword','signInWithEmailAndPassword','sendEmailVerification','sendPasswordResetEmail'])await assert.rejects(sdk[name](),/fixture not configured/);
});

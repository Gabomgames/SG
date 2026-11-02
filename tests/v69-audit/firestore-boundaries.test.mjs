// Casos novos para a fase de segurança. PREPARADOS, ainda não executados:
// o emulador não pôde ser baixado pela política de rede desta sessão.
// Espera-se que exponham as lacunas do baseline; não relaxar asserts para passar.
import test,{before,after,beforeEach} from 'node:test';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8085') throw new Error('Use somente emulador local 127.0.0.1:8085.');
const root=resolve(import.meta.dirname,'../..'),require=createRequire(resolve(root,'package.json'));
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,serverTimestamp,writeBatch}=require('firebase/firestore');
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-sg',firestore:{host:'127.0.0.1',port:8085,rules:readFileSync(resolve(root,'firestore.rules'),'utf8')}})});
after(async()=>{await env?.cleanup()});
beforeEach(async()=>{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await setDoc(doc(db,'users','audit-user'),{uid:'audit-user',name:'Audit',username:'audit',photoURL:'',moderation:{status:'active'},legal:{termsAccepted:true,termsVersion:'2026-09-16',privacyVersion:'2026-09-16',communityRulesVersion:'2026-09-16'}});
    await setDoc(doc(db,'posts','audit-poll'),{uid:'someone-else',type:'poll',pollOptions:['A','B']});
  });
});
test('voto fora das opções existentes deve ser recusado pelo servidor',async()=>{
  const db=env.authenticatedContext('audit-user').firestore();
  await assertFails(setDoc(doc(db,'posts','audit-poll','votes','audit-user'),{uid:'audit-user',option:999,updatedAt:serverTimestamp()}));
});
test('enquete com apenas uma opção deve ser recusada mesmo em escrita direta',async()=>{
  const db=env.authenticatedContext('audit-user').firestore(),batch=writeBatch(db);
  batch.set(doc(db,'posts','audit-invalid-poll'),{uid:'audit-user',authorName:'Audit',authorUsername:'audit',authorPhoto:'',type:'poll',title:'Enquete',description:'Qual jogo?',mediaUrl:'',pollOptions:['Uma opção'],createdAt:serverTimestamp()});
  batch.set(doc(db,'limites','audit-user'),{post:serverTimestamp()});
  await assertFails(batch.commit());
});

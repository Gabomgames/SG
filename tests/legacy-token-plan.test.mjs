import test from 'node:test';
import assert from 'node:assert/strict';
import * as planner from '../scripts/legacy-token-plan.mjs';
const object=patch=>({bucket:'demo-sg.appspot.com',name:'chat/alice/alice_bob/test.png',generation:'1001',metageneration:'3',metadata:{firebaseStorageDownloadTokens:'synthetic-token-never-a-credential'},...patch});
test('S03 plano recusa objeto sem generation para não atingir uma substituição concorrente',()=>{
 const row=object();delete row.generation;assert.throws(()=>planner.revocationPlan([row]),/Generation|generation/);
});
test('S03 plano vincula a versão exata e as duas precondições, sem expor o token',()=>{
 const [operation]=planner.revocationPlan([object()]);assert.equal(operation.generation,'1001');assert.equal(operation.ifGenerationMatch,'1001');assert.equal(operation.ifMetagenerationMatch,'3');assert.equal(JSON.stringify(operation).includes('synthetic-token-never-a-credential'),false);
});
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const envelope=(items=[],patch={})=>({schemaVersion:1,projectId:'demo-sg',bucket:'demo-sg.appspot.com',capturedAt:'2026-11-03T00:00:00Z',sourceKind:'synthetic',listing:{complete:true,allVersions:true,nextPageToken:null},items,...patch});
for(const value of [0,-1,0.5,9007199254740992,'0','-1','1e3','01'])test(`S03 recusa generation inválida ${value}`,()=>assert.throws(()=>planner.revocationPlan([object({generation:value})]),/Generation/));
test('S03 gera precondições distintas para versões diferentes do mesmo objeto',()=>{
 const plans=planner.revocationPlan([object(),object({generation:'1002',metageneration:'3'})]);assert.deepEqual(plans.map(p=>p.ifGenerationMatch),['1001','1002']);assert.ok(plans.every(p=>p.ifMetagenerationMatch==='3'&&p.preserveObjectBytes));
});
test('S03 rejeita duplicação de objeto/versão em páginas sobrepostas',()=>assert.throws(()=>planner.buildLegacyInventory(envelope([object(),object()])),/duplicado/));
test('S03 ausência de metadados não significa ausência de tokens',()=>{
 const row=object();delete row.metadata;const out=planner.buildLegacyInventory(envelope([row]));assert.equal(out.totals.tokenUnknown,1);assert.equal(out.totals.tokenAbsent,0);assert.equal(out.operations.length,0);assert.ok(out.blockers.includes('TOKEN_METADATA_UNKNOWN'));assert.equal(out.phase1Approved,false);
});
test('S03 versão incompleta não gera operação candidata',()=>{
 const row=object();delete row.generation;const out=planner.buildLegacyInventory(envelope([row]));assert.equal(out.operations.length,0);assert.equal(out.records[0].versionReady,false);assert.ok(out.blockers.includes('OBJECT_VERSION_METADATA_MISSING'));
});
test('S03 inventário vazio sem escopo e sem paginação não aprova risco',()=>{
 const out=planner.buildLegacyInventory([]);assert.equal(out.totals.privateObjects,0);assert.equal(out.listingCompleteDeclared,false);assert.equal(out.phase1Approved,false);assert.ok(out.blockers.includes('SCOPE_NOT_DECLARED'));assert.ok(out.blockers.includes('LISTING_COMPLETENESS_NOT_CONFIRMED'));
});
test('S03 declaração de listagem completa não comprova IAM ou encerra a Fase 1',()=>{
 const out=planner.buildLegacyInventory(envelope());assert.equal(out.listingCompleteDeclared,true);assert.equal(out.phase1Approved,false);assert.ok(out.blockers.includes('BUCKET_IAM_REVIEW_PENDING'));assert.ok(out.blockers.includes('AUTHORITATIVE_INVENTORY_REVIEW_PENDING'));assert.equal(out.executionImplemented,false);
});
test('S03 paginação pendente e cobertura apenas da versão atual ficam registradas',()=>{
 const out=planner.buildLegacyInventory(envelope([],{listing:{complete:false,allVersions:false,nextPageToken:'synthetic-next-page'}}));assert.ok(out.blockers.includes('LISTING_COMPLETENESS_NOT_CONFIRMED'));assert.ok(out.blockers.includes('OBJECT_VERSIONS_NOT_CONFIRMED'));assert.equal(JSON.stringify(out).includes('synthetic-next-page'),false);
 assert.throws(()=>planner.buildLegacyInventory(envelope([],{listing:{complete:true,nextPageToken:'still-pending'}})),/nextPageToken/);
});
test('S03 recusa dados fora do bucket do inventário',()=>assert.throws(()=>planner.buildLegacyInventory(envelope([object({bucket:'other.appspot.com'})])),/fora do bucket/));
test('S03 registra ACL pública e cache público como pendências adicionais',()=>{
 const out=planner.buildLegacyInventory(envelope([object({acl:[{entity:'allUsers',role:'READER'}],cacheControl:'public, max-age=86400'})]));assert.ok(out.blockers.includes('PUBLIC_OBJECT_ACL'));assert.ok(out.blockers.includes('PUBLIC_CACHE_REVIEW_PENDING'));assert.equal(out.records[0].publicAcl,'present');
});
test('S03 inventário e plano nunca retornam valores de tokens ou outros metadados privados',()=>{
 const out=planner.buildLegacyInventory(envelope([object({metadata:{firebaseStorageDownloadTokens:'synthetic-redact-me',privateNote:'synthetic-sensitive-note'},acl:[]}),object({name:'reports/alice/report1/test.png',metadata:{},acl:[]}),object({name:'posts/alice/public.png'})]));
 assert.deepEqual(out.totals,{received:3,privateObjects:2,otherObjects:1,tokenPresent:1,tokenAbsent:1,tokenUnknown:0});assert.equal(out.operations.length,1);const encoded=JSON.stringify(out);assert.ok(!encoded.includes('synthetic-redact-me')&&!encoded.includes('synthetic-sensitive-note'));assert.deepEqual(out.operations[0].patch,{metadata:{firebaseStorageDownloadTokens:null}});
});
test('S03 entradas malformadas falham sem plano parcial',()=>{
 for(const input of [null,{},[null],[{name:12}],[object({metadata:[]})],[object({metadata:{firebaseStorageDownloadTokens:true}})]])assert.throws(()=>planner.buildLegacyInventory(input));
 assert.throws(()=>planner.buildLegacyInventory(envelope([],{listing:{complete:'true'}})),/paginação/);
});
test('S03 CLI gera inventário e plano privados, mantém input e não altera produção',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sg-s03-plan-'));
 try{
  const input=path.join(dir,'input.json'),raw=JSON.stringify(envelope([object()]));fs.writeFileSync(input,raw);
  const script=fileURLToPath(new URL('../scripts/legacy-token-plan.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[script,input],{cwd:dir,encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(fs.readFileSync(input,'utf8'),raw);
  const summaryText=fs.readFileSync(path.join(dir,'.local/legacy-token-inventory.json'),'utf8'),planText=fs.readFileSync(path.join(dir,'.local/legacy-token-revocation-plan.json'),'utf8');
  const summary=JSON.parse(summaryText),plan=JSON.parse(planText);assert.equal(summary.productionReadPerformed,false);assert.equal(summary.productionWritePerformed,false);assert.equal(plan.executionImplemented,false);assert.equal(plan.phase1Approved,false);assert.equal(plan.operations.length,1);
  assert.equal(plan.sourceFileSha256,createHash('sha256').update(raw).digest('hex'));assert.ok(![summaryText,planText,result.stdout,result.stderr].some(s=>s.includes('synthetic-token-never-a-credential')));
  if(process.platform!=='win32')assert.equal(fs.statSync(path.join(dir,'.local/legacy-token-revocation-plan.json')).mode&0o777,0o600);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

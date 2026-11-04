// Offline only: no cloud SDK, network request or production executor.
// Raw download tokens never leave the input file in any output/report.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const privateName=name=>/^(chat|reports|profile-review)\//.test(name);
const bucketOk=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(value);
function counter(value){
 if(typeof value==='number'&&(!Number.isSafeInteger(value)||value<=0))throw new Error('Generation/Metageneration devem ser inteiros positivos sem perda de precisão.');
 const text=String(value??'');if(!/^[1-9][0-9]{0,19}$/.test(text))throw new Error('Generation/Metageneration ausentes ou inválidas; não é seguro preparar revogação.');return text;
}
function tokenState(object){
 if(object.metadata==null)return 'unknown';
 if(typeof object.metadata!=='object'||Array.isArray(object.metadata))throw new Error('Metadados inválidos.');
 const value=object.metadata.firebaseStorageDownloadTokens;
 if(value==null||value==='')return 'absent';
 if(typeof value!=='string')throw new Error('Campo de download tokens inválido.');
 return 'present';
}
function objectsFrom(input){
 if(!Array.isArray(input))throw new Error('Forneça uma lista de metadados exportados.');
 const seen=new Set();
 for(const row of input){
  if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.name!=='string'||!row.name||/[\u0000-\u001f]/.test(row.name))throw new Error('Registro de inventário inválido.');
  if(!privateName(row.name))continue;
  if(!bucketOk(row.bucket))throw new Error('Bucket ausente ou inválido.');
  const generation=row.generation==null?null:counter(row.generation);
  if(row.metageneration!=null)counter(row.metageneration);
  const key=JSON.stringify([row.bucket,row.name,generation]);if(seen.has(key))throw new Error('Objeto/geração duplicado; revise a paginação do inventário.');seen.add(key);
  tokenState(row);
 }
 return input;
}
export function revocationPlan(objects){
 return objectsFrom(objects).filter(row=>privateName(row.name)&&tokenState(row)==='present').map(row=>{
  const generation=counter(row.generation),metageneration=counter(row.metageneration);
  return {bucket:row.bucket,name:row.name,generation,ifGenerationMatch:generation,ifMetagenerationMatch:metageneration,
   patch:{metadata:{firebaseStorageDownloadTokens:null}},preserveObjectBytes:true};
 });
}
export function buildLegacyInventory(input){
 const legacy=Array.isArray(input),source=legacy?{items:input}:input;
 if(!source||typeof source!=='object'||Array.isArray(source))throw new Error('Inventário inválido.');
 if(!legacy&&(source.schemaVersion!==1||!bucketOk(source.bucket)||typeof source.projectId!=='string'||!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(source.projectId)||typeof source.capturedAt!=='string'||!Number.isFinite(Date.parse(source.capturedAt))))throw new Error('Declare schemaVersion, projectId, bucket e capturedAt válidos.');
 const objects=objectsFrom(source.items),listing=source.listing||{};
 if(typeof listing!=='object'||Array.isArray(listing)||['complete','allVersions'].some(k=>listing[k]!==undefined&&typeof listing[k]!=='boolean')||(listing.nextPageToken!=null&&typeof listing.nextPageToken!=='string'))throw new Error('Metadados de paginação inválidos.');
 if(source.sourceKind!==undefined&&!['synthetic','authorized-export','unverified-export'].includes(source.sourceKind))throw new Error('Origem do inventário inválida.');
 if(listing.complete===true&&listing.nextPageToken)throw new Error('Listagem incompleta: nextPageToken ainda presente.');
 if(!legacy&&objects.some(row=>row.bucket!==source.bucket))throw new Error('Objeto fora do bucket declarado.');
 const records=objects.filter(row=>privateName(row.name)).map(row=>{
  const generation=row.generation==null?null:counter(row.generation),metageneration=row.metageneration==null?null:counter(row.metageneration);
  return {bucket:row.bucket,name:row.name,kind:row.name.split('/')[0],generation,metageneration,tokenState:tokenState(row),
   publicAcl:Array.isArray(row.acl)?row.acl.some(a=>['allUsers','allAuthenticatedUsers'].includes(a?.entity))?'present':'absent':'unknown',
   publicCaching:typeof row.cacheControl==='string'?/\bpublic\b/i.test(row.cacheControl):null,
   versionReady:Boolean(generation&&metageneration)};
 });
 const totals={received:objects.length,privateObjects:records.length,otherObjects:objects.length-records.length,
  tokenPresent:records.filter(r=>r.tokenState==='present').length,tokenAbsent:records.filter(r=>r.tokenState==='absent').length,tokenUnknown:records.filter(r=>r.tokenState==='unknown').length};
 const blockers=[];
 if(legacy)blockers.push('SCOPE_NOT_DECLARED');
 if(listing.complete!==true)blockers.push('LISTING_COMPLETENESS_NOT_CONFIRMED');
 if(listing.allVersions!==true)blockers.push('OBJECT_VERSIONS_NOT_CONFIRMED');
 if(records.some(r=>!r.versionReady))blockers.push('OBJECT_VERSION_METADATA_MISSING');
 if(totals.tokenUnknown)blockers.push('TOKEN_METADATA_UNKNOWN');
 if(totals.tokenPresent)blockers.push('TOKEN_REVOCATION_NOT_EXECUTED');
 if(records.some(r=>r.publicAcl==='present'))blockers.push('PUBLIC_OBJECT_ACL');
 if(records.some(r=>r.publicAcl==='unknown'))blockers.push('OBJECT_ACL_NOT_REVIEWED');
 if(records.some(r=>r.publicCaching===true))blockers.push('PUBLIC_CACHE_REVIEW_PENDING');
 // A supplied JSON cannot prove IAM, listing completeness or real revocation.
 blockers.push('AUTHORITATIVE_INVENTORY_REVIEW_PENDING','BUCKET_IAM_REVIEW_PENDING','GATEWAY_AND_REVOCATION_VERIFICATION_PENDING');
 const candidates=objects.filter(row=>privateName(row.name)&&tokenState(row)==='present'&&row.generation!=null&&row.metageneration!=null);
 return {schemaVersion:1,mode:'offline-inventory-and-plan',scope:legacy?null:{projectId:source.projectId,bucket:source.bucket,capturedAt:source.capturedAt,sourceKind:source.sourceKind||'unverified-export'},
  listingCompleteDeclared:listing.complete===true,allVersionsDeclared:listing.allVersions===true,totals,records,operations:revocationPlan(candidates),blockers,
  phase1Approved:false,productionReadPerformed:false,productionWritePerformed:false,executionImplemented:false,requiresSeparateProductionAuthorization:true};
}
function writePrivate(file,data){
 const temporary=file+'.'+crypto.randomUUID()+'.tmp';
 fs.writeFileSync(temporary,JSON.stringify(data,null,2)+'\n',{mode:0o600});fs.renameSync(temporary,file);
}
function main(){
 const file=process.argv[2];if(!file||process.argv.length!==3)throw new Error('Use node scripts/legacy-token-plan.mjs <inventario-local.json>. Nenhuma chamada remota será feita.');
 const raw=fs.readFileSync(file,'utf8'),inventory=buildLegacyInventory(JSON.parse(raw)),out=path.resolve('.local');fs.mkdirSync(out,{recursive:true,mode:0o700});
 inventory.sourceFileSha256=createHash('sha256').update(raw).digest('hex');
 const {operations,...summary}=inventory;
 writePrivate(path.join(out,'legacy-token-inventory.json'),summary);
 writePrivate(path.join(out,'legacy-token-revocation-plan.json'),{schemaVersion:1,mode:'offline-plan-only',sourceFileSha256:inventory.sourceFileSha256,scope:inventory.scope,requiresSeparateProductionAuthorization:true,executionImplemented:false,phase1Approved:false,operations,blockers:inventory.blockers});
 console.log(`Inventário local: ${inventory.totals.privateObjects} objetos privados; ${operations.length} operações candidatas; ${inventory.blockers.length} pendências. Nenhum token impresso, acesso remoto, alteração ou exclusão. Fase 1 não aprovada.`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main();}catch(error){console.error(error.message);process.exitCode=1;}
}

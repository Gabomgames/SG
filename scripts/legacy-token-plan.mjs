// Offline inventory only. Never contacts production or prints token values.
// Applying a plan to a real bucket is deliberately not implemented here.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function revocationPlan(objects){
 if(!Array.isArray(objects))throw new Error('Forneça uma lista de metadados exportados.');
 return objects.filter(o=>typeof o.name==='string'&&/^(chat|reports|profile-review)\//.test(o.name)&&o.metadata?.firebaseStorageDownloadTokens).map(o=>{
  if(typeof o.bucket!=='string'||!/^\d+$/.test(String(o.metageneration||'')))throw new Error('Metageneration/bucket ausentes; não é seguro preparar revogação.');
  return {bucket:o.bucket,name:o.name,ifMetagenerationMatch:String(o.metageneration),patch:{metadata:{firebaseStorageDownloadTokens:null}},preserveObjectBytes:true};
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const input=process.argv[2];if(!input)throw new Error('Use node scripts/legacy-token-plan.mjs <exportacao-local.json>. Nenhuma chamada remota será feita.');
 const plan=revocationPlan(JSON.parse(fs.readFileSync(input,'utf8'))),out=path.resolve('.local');fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'legacy-token-revocation-plan.json'),JSON.stringify({mode:'offline-plan-only',requiresSeparateProductionAuthorization:true,operations:plan},null,2)+'\n',{mode:0o600});
 console.log(`Plano local preparado para ${plan.length} objetos privados. Nenhum token impresso, metadado alterado ou arquivo excluído.`);
}

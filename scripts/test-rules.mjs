import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function assertTestConfig(config){
 if(config.firestore?.rules!=='firestore.rules'||config.firestore?.indexes!=='firestore.indexes.json'||config.emulators?.firestore?.host!=='127.0.0.1'||config.emulators.firestore.port!==8085||config.emulators.ui?.enabled!==false||config.emulators.singleProjectMode!==true||config.storage?.rules!=='storage.rules'||config.emulators.storage?.host!=='127.0.0.1'||config.emulators.storage.port!==9199)throw new Error('Testes exigem regras locais e Firestore em 127.0.0.1:8085, UI desativada e projeto demo-sg.');
}
export function testTarget(args){
 if(args.some(arg=>!['--security','--founders'].includes(arg))||args.length>1)throw new Error('Somente --security ou --founders é permitido. Projeto fixo: demo-sg.');
 return args.includes('--founders')?'tests/founders-emulator.test.mjs':args.includes('--security')?'tests/v69-audit/firestore-boundaries.test.mjs':'tests/firestore.test.js';
}
function main(){
 const root=fileURLToPath(new URL('../',import.meta.url));
 const config=JSON.parse(readFileSync(new URL('../firebase.test.json',import.meta.url)));assertTestConfig(config);
 const target=testTarget(process.argv.slice(2));
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../node_modules/firebase-tools/lib/bin/firebase.js',import.meta.url)),'emulators:exec','--only',target==='tests/firestore.test.js'?'firestore,storage':'firestore','--project','demo-sg','--config','firebase.test.json',`node --test --experimental-test-isolation=none ${target}`],{cwd:root,encoding:'utf8',stdio:['inherit','pipe','pipe'],maxBuffer:32*1024*1024,env:{...process.env,GCLOUD_PROJECT:'demo-sg',GOOGLE_CLOUD_PROJECT:'demo-sg',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8085',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199'}});
 process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
 if(result.error)throw result.error;
 if(result.status!==0&&/Failed to make request to https:\/\/storage\.googleapis\.com\//.test((result.stdout||'')+(result.stderr||''))){
  console.error('[SG_TEST_BLOCKED] Download oficial do Firestore Emulator indisponível. Nenhum resultado de regras foi aprovado.');process.exitCode=78;
 }else process.exitCode=result.status??1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();

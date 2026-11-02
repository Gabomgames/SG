// Cross-platform, no shell interpolation and no deploy/push commands. Each gate
// keeps its own exit status; one blocked gate cannot turn the overall run green.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export const gates=[
 {name:'dependencies',script:'audit:high'},
 {name:'fast',script:'check:fast'},
 {name:'runtime',script:'test:runtime'},
 {name:'firestore',script:'test:rules'},
 {name:'security-s01',script:'test:rules:security'},
 {name:'founders-emulator',script:'test:rules:founders'},
 {name:'browser',script:'test:e2e'}
];
export function runGates(plan,run,{writeLog=()=>{}}={}){
 return plan.map(gate=>{
  const result=run(gate),output=(result.stdout||'')+(result.stderr||'');writeLog(gate.name,output);
  const blocked=result.status===78||output.includes('[SG_TEST_BLOCKED]');
  return {name:gate.name,script:gate.script,exitCode:result.status??null,status:blocked?'blocked':result.status===0&&!result.error?'passed':'failed',...(result.error?{error:result.error.message}:{}),log:gate.name+'.log'};
 });
}
function main(){
 const root=fileURLToPath(new URL('../',import.meta.url));
 const args=process.argv.slice(2);
 if(args.length&&!(args.length===2&&args[0]==='--only'&&gates.some(g=>g.name===args[1])))throw new Error('Use sem argumentos ou --only '+gates.map(g=>g.name).join('|'));
 if(process.versions.node!=='24.19.0')throw new Error('Ative Node 24.19.0 conforme .node-version antes da validação.');
 const candidates=[process.env.npm_execpath,path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),path.resolve(path.dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js')].filter(Boolean);
 const npm=candidates.find(p=>p.endsWith('npm-cli.js')&&fs.existsSync(p));
 if(!npm)throw new Error('npm-cli.js não encontrado. Execute com npm run validate:phase1.');
 const base=path.join(root,'artifacts');fs.mkdirSync(base,{recursive:true});const output=fs.mkdtempSync(path.join(base,'phase1-'));
 const trackedInputs=['firestore.rules','firebase.test.json','package.json','package-lock.json','functions/package-lock.json',
  'poll-domain.js','feed.js','feed-composer.js','dashboard.js','events.js','playwright.config.js',
  'scripts/test-rules.mjs','scripts/validate-phase1.mjs','scripts/check-browser.mjs','scripts/preview-server.mjs',
  'tests/v69-audit/firestore-boundaries.test.mjs','tests/firestore.test.js','tests/founders-emulator.test.mjs','tests/browser/visual.spec.js'];
 const inputSha256=Object.fromEntries(trackedInputs.map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')]));
 const commit=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});
 const dirty=spawnSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'});
 const plan=args.length?gates.filter(g=>g.name===args[1]):gates;
 const results=runGates(plan,gate=>{
  console.log(`Running ${gate.name}: npm run ${gate.script}`);
  return spawnSync(process.execPath,[npm,'run',gate.script],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024,env:{...process.env,CI:'1',GH_PROMPT_DISABLED:'1'}});
 },{writeLog:(name,text)=>fs.writeFileSync(path.join(output,name+'.log'),text)});
 const passed=results.every(r=>r.status==='passed');
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({completedAt:new Date().toISOString(),node:process.version,gitCommit:commit.status===0?commit.stdout.trim():null,gitDirty:dirty.status===0?Boolean(dirty.stdout.trim()):null,inputSha256,allSelectedGatesPassed:passed,completePhase1Run:plan.length===gates.length,results},null,2)+'\n');
 for(const result of results)console.log(`${result.name}: ${result.status} (exit ${result.exitCode})`);
 console.log('Evidence: '+output);
 process.exitCode=passed?0:1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();

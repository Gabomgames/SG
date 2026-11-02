import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {runGates} from '../scripts/validate-phase1.mjs';
test('a failed or blocked child cannot be reported as passed, and later gates still run',()=>{
 const plan=[{name:'pass',script:'fixture'},{name:'fail',script:'fixture'},{name:'blocked',script:'fixture'},{name:'last',script:'fixture'}];
 const codes={pass:0,fail:2,blocked:78,last:0};const logs=[];
 const results=runGates(plan,gate=>spawnSync(process.execPath,['-e',`console.log('synthetic gate'); process.exit(${codes[gate.name]})`],{encoding:'utf8'}),{writeLog:(name,text)=>logs.push([name,text])});
 assert.deepEqual(results.map(r=>r.status),['passed','failed','blocked','passed']);assert.deepEqual(results.map(r=>r.exitCode),[0,2,78,0]);assert.equal(logs.length,4);
});
test('spawn failure remains a failure even with a missing process exit code',()=>{
 const results=runGates([{name:'missing',script:'fixture'}],()=>spawnSync('sg-nonexistent-executable-test-only',[],{encoding:'utf8'}));assert.equal(results[0].status,'failed');assert.equal(results[0].exitCode,null);
});

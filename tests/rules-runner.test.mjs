import test from 'node:test';
import assert from 'node:assert/strict';
import {assertTestConfig,testTarget} from '../scripts/test-rules.mjs';
const local={firestore:{rules:'firestore.rules',indexes:'firestore.indexes.json'},emulators:{firestore:{host:'127.0.0.1',port:8085},ui:{enabled:false},singleProjectMode:true}};
test('Firestore runner rejects external hosts, different ports and unexpected rule paths',()=>{
 assert.doesNotThrow(()=>assertTestConfig(local));
 for(const change of [c=>{c.emulators.firestore.host='0.0.0.0';},c=>{c.emulators.firestore.host='production.example.test';},c=>{c.emulators.firestore.port=8080;},c=>{c.emulators.ui.enabled=true;},c=>{c.emulators.singleProjectMode=false;},c=>{c.firestore.rules='../other.rules';},c=>{c.firestore.indexes='other.json';}]){
  const config=structuredClone(local);change(config);assert.throws(()=>assertTestConfig(config));
 }
});
test('only known suites can run and no project or target override is accepted',()=>{
 assert.equal(testTarget([]),'tests/firestore.test.js');assert.equal(testTarget(['--security']),'tests/v69-audit/firestore-boundaries.test.mjs');assert.equal(testTarget(['--founders']),'tests/founders-emulator.test.mjs');
 for(const args of [['--project','something-gamer'],['--security','--founders'],['arbitrary.js'],['--config','firebase.json']])assert.throws(()=>testTarget(args));
});

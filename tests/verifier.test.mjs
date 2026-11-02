import test from 'node:test';
import assert from 'node:assert/strict';
import {unboundLibraryCalls} from '../scripts/library-bindings.mjs';
const missing = source => unboundLibraryCalls(source,['getDoc']);
test('static imports and aliases bind only their local name',()=>{
  assert.deepEqual(missing('import {getDoc} from "sdk"; getDoc();'),[]);
  assert.deepEqual(missing('import {getDoc as read} from "sdk"; getDoc();').map(x=>x.name),['getDoc']);
});
test('dynamic import destructuring resolves in its function',()=>{
  assert.deepEqual(missing('async function submit(){const {getDoc}=await import("sdk"); await getDoc();}'),[]);
  assert.equal(missing('async function submit(){const {getDoc}=await import("sdk");} getDoc();').length,1);
});
test('sibling and nested declarations cannot hide a missing import',()=>{
  assert.equal(missing('{const getDoc=()=>{};} getDoc();').length,1);
  assert.equal(missing('function other(getDoc){getDoc();} getDoc();').length,1);
  assert.equal(missing('getDoc();').length,1);
});
test('parameters, destructuring, catch and function-scoped var are recognized',()=>{
  for(const s of ['function f({getDoc}){getDoc();}', 'try{}catch(getDoc){getDoc();}', 'function f(){if(true){var getDoc=()=>{};} getDoc();}', 'function getDoc(){}; getDoc();']) assert.deepEqual(missing(s),[]);
});
test('comments strings and member calls do not count as global references',()=>{
  assert.deepEqual(missing('// getDoc()\nconst s="getDoc()"; sdk.getDoc();'),[]);
});
test('loop-scoped binding does not leak outside the loop',()=>{
  assert.equal(missing('for(let getDoc of []){getDoc();} getDoc();').length,1);
});

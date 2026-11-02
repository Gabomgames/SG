import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=f=>readFileSync(new URL(`../${f}`,import.meta.url),'utf8');
test('login and registration include explicit accessible password visibility toggle',()=>{
 for(const page of ['login.html','register.html']){
  const html=read(page);assert.match(html,/sg67-password-field/);assert.match(html,/data-sg67-password/);assert.match(html,/aria-pressed="false"/);assert.match(html,/sg-v67-password\.js/);
 }
 const js=read('sg-v67-password.js');assert.match(js,/aria-label/);assert.match(js,/field\.type/);
});
test('admin uses its own navigation without injected global sidebar',()=>{
 assert.doesNotMatch(read('admin.html'),/src="sg-v65-shell\.js/);
 assert.match(read('admin.html'),/class="app-header"/);
 assert.match(read('admin.js'),/sg67-admin-locked/);
});
test('notifications use real content and constrained layout',()=>{
 assert.match(read('dashboard.js'),/activity-description/);
 assert.match(read('sg-v67.css'),/activity-item/);
 assert.match(read('dashboard.js'),/document\.body\.append/);
});
test('account closure protected by super admin, separate backend and cooling-off period',()=>{
 const worker=read('something-gamer-api/src/admin.js');
 const fn=read('functions/sg-v66-functions.js');
 assert.match(worker,/actor\.claims\?\.role!=='super_admin'/);
 assert.match(worker,/uid===actor\.uid/);
 assert.match(worker,/30\*86400000/);
 assert.match(worker,/auditedCommit\(env,actor,action/);
 assert.match(worker,/cancelAccountRemoval/);
 assert.match(fn,/finalizeModeratedAccounts/);
 assert.match(fn,/getAuth\(\)\.deleteUser/);
 assert.match(fn,/customClaims\?\.admin/);
});
test('appeals remain available from support and are attached to a sanction',()=>{
 const support=read('support.js');const worker=read('something-gamer-api/src/admin.js');
 assert.match(read('support.html'),/value="appeal"/);
 assert.match(support,/sanctionId:latest\.id/);
 assert.match(worker,/queue\.sanctionId===sanction\.id/);
 assert.match(read('firestore.rules'),/function recursoOk/);
});
test('dist preview includes updated pages and styles',()=>{
 for(const name of ['support.html','login.html','register.html','sg-v67.css','sg-v67-password.js','dashboard.js'])assert.ok(existsSync(new URL(`../dist/${name}`,import.meta.url)),name);
 const route=JSON.parse(read('.local/admin-route.json')).path;
 assert.match(route,/^\d+\.html$/);
 assert.ok(existsSync(new URL(`../dist/${route}`,import.meta.url)),'generated admin route exists');
 assert.equal(existsSync(new URL('../dist/admin.html',import.meta.url)),false,'legacy public admin filename is removed');
 assert.match(read(`dist/${route}`),/admin\.js/);
});

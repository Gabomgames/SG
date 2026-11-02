import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const read=name=>fs.readFileSync(new URL(`../${name}`,import.meta.url),'utf8');
test('feed usa um só fluxo de publicações',()=>{
  assert.doesNotMatch(read('feed.js'),/import\s+["']\.\/social-studio\.js/);
  assert.match(read('feed.js'),/collection\(db,"posts"\)/);
  assert.match(read('feed.html'),/id="feedList"/);
});
test('repair stylesheet é carregado em páginas afetadas',()=>{
  for(const x of ['feed.html','chat.html','dashboard.html','edit-profile.html','admin.html'])assert.match(read(x),/sg-v651-repair\.css\?v=651/);
});
test('modal de criar servidor cabe dentro da viewport',()=>{
  const css=read('sg-v651-repair.css');assert.match(css,/dialog\.server-quick-dialog/);assert.match(css,/max-height:calc\(100dvh - 28px\)/);assert.match(css,/overflow-y:auto/);
});
test('ADMIN não concede privilégio pelo cliente',()=>{
  const js=read('admin.js');assert.match(js,/ADMIN_CLAIM_MISSING/);assert.match(js,/getIdTokenResult\(true\)/);assert.match(js,/adminFunction\("dashboard"\)/);assert.doesNotMatch(js,/localStorage\.setItem\(["']admin/);
});
test('conquistas são geradas a partir de seguidores e verificação ativa',()=>{
  const js=read('dashboard.js');assert.match(js,/\.filter\(item=>followers>=item\[0\]\)/);assert.match(js,/profile\.verification\?\.status==='active'/);assert.doesNotMatch(js,/milestones\.push\(\[0,"A Now segue/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>readFileSync(resolve(root,name),'utf8');
const prices=['R$ 14,90','R$ 79,90','R$ 149,90'];
test('V69 preserves all three original verified gamer plans and payment logic',()=>{
 const html=read('verification.html'),js=read('verification.js');
 for(const price of prices){assert.ok(html.includes(price),price);for(const page of ['index.html','feed.html','dashboard.html'])assert.ok(read(page).includes(price),`${page} ${price}`);}
 for(const key of ['monthly','semiannual','annual'])assert.ok(js.includes(key));
 assert.match(js,/\/payments\/create/);
 assert.match(js,/\/payments\/status/);
 assert.match(html,/aprovação administrativa/);
});
test('new slogans are exact and public navigation exposes verification',()=>{
 const html=read('index.html');
 assert.ok(html.includes('YES, SOMETHING FOR YOU ;)'));
 assert.ok(html.includes('O FUTURO É AGORA ;)'));
 assert.match(html,/href="verification.html"/);
 assert.match(read('sg-v65-shell.js'),/Verificado Gamer/);
});
test('feed has an actual composer with picture video poll file selection',()=>{
 const h=read('feed.html'),js=read('feed-composer.js');
 for(const id of ['sg69Composer','sg69ComposerForm','sg69File','sg69FilePreview','sg69Caption','sg69PollField','sg69Publish','sg69ComposerError'])assert.ok(h.includes(`id="${id}"`),id);
 for(const type of ['image','video','poll','text'])assert.ok(h.includes(`data-compose-type="${type}"`));
 assert.match(h,/src="feed-composer.js\?v=6901"/);
 assert.match(js,/uploadMedia\(ready/);
 assert.match(js,/publishPost/);
 assert.match(read('post-publication-client.js'),/publicationApprovals/);
 assert.match(js,/authorVerified:profile.verification\?\.status==='active'/);
});
test('media publication uses quarantine and has no client Firebase fallback',()=>{
 const media=read('media-upload.js'),rules=read('storage.rules'),firestore=read('firestore.rules');
 assert.doesNotMatch(media,/uploadBytes/);
 assert.doesNotMatch(media,/getDownloadURL/);
 assert.match(media,/purpose=\$\{encodeURIComponent\(purpose\)/);
 assert.match(read('something-gamer-api/src/publication-media.js'),/pending_review/);
 assert.match(rules,/match \/posts\/\{userId\}\/\{fileName\}/);
 assert.match(firestore,/urlOk\(request.resource.data.get\('mediaUrl'/);
 assert.match(media,/MEDIA_NOT_CONFIGURED/);
});
test('old dashboard creation IDs are preserved and preview was added',()=>{
 const html=read('dashboard.html'),script=read('dashboard.js');
 for(const id of ['openPostCreator','postImageBtn','postVideoBtn','postModal','postFile','publishPost','sg69DashboardMediaPreview'])assert.ok(html.includes(`id="${id}"`),id);
 assert.match(script,/updateDashboardPreview/);
});
test('mobile verification and legacy hidden card are fixed in final CSS',()=>{
 const css=read('sg-v69.css');
 assert.match(css,/\.verification-card-mini.sg69-verification-card\{display:block!important/);
 assert.match(css,/body.sg-v65.verification-page\{padding-left:0!important/);
 assert.match(css,/\.sg69-profile-verification\{order:1!important/);
 assert.match(css,/\.profile-main\{position:relative!important/);
});
test('local resources for the changed routes exist',()=>{
 for(const page of ['index.html','feed.html','dashboard.html','edit-profile.html','verification.html']){
  const html=read(page);
  for(const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^\"]+)"/g)){
    const ref=match[1].split('?')[0];if(ref.startsWith('http')||ref.startsWith('//'))continue;
    if(ref.match(/\.(?:js|css)$/))assert.ok(existsSync(resolve(root,ref)),`${page}: ${ref}`);
  }
 }
});

test('public profile is responsive and uses final V69 styles',()=>{
 assert.match(read('profile.html'),/sg-v69.css\?v=6901/);
 assert.match(read('sg-v69.css'),/public-profile-page \.public-profile-content\{position:relative!important/);
});
test('brand text differentiates SG slogan from NOW slogan',()=>{
 const index=read('index.html');
 assert.match(index,/Something Gamer — Yes, Something for you ;\)/);
 assert.match(index,/Por NOW: O FUTURO É AGORA ;\)/);
 assert.match(read('sg-v65-shell.js'),/YES, SOMETHING FOR YOU ;\)/);
});

// Real local D1/R2. Remote identity, AI and Firestore are isolated fixtures;
// this suite does NOT claim that Firebase Security Rules have been exercised.
import test,{before,beforeEach,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {quarantineUpload,previewQuarantine,serveApprovedMedia,expireQuarantine,mediaRecord,checkedObject} from '../something-gamer-api/src/publication-media.js';
import {authorizePost,reviewPosts,postsMine,publicationStore} from '../something-gamer-api/src/publication.js';
import {readLegacyChat,readLegacyAdmin} from '../something-gamer-api/src/legacy-media.js';
import {adoptLegacyPublic} from '../something-gamer-api/src/legacy-public-media.js';
import {field} from '../something-gamer-api/src/firestore-server.js';
let mf,db,bucket,env,documents,commits,approvals,serviceAccount;
const originalFetch=globalThis.fetch;
const bytes=new Uint8Array([137,80,78,71,13,10,26,10,0]);
const legal={termsAccepted:true,termsVersion:'2026-09-16',privacyVersion:'2026-09-16',communityRulesVersion:'2026-09-16'};
const profile={name:'Alice',username:'alice',legal,moderation:{status:'active'},_updateTime:'2026-01-01T00:00:00.000000Z'};
const draft={type:'text',title:'Jogo de fixture',description:'Testando publicação segura',tags:[],pollOptions:[]};
const request=(path,body)=>new Request('https://api.test'+path,{method:'POST',headers:{Authorization:'Bearer participant-test-token','X-Firebase-AppCheck':'test-appcheck','Content-Type':'application/json'},body:JSON.stringify(body)});
const store={get:async path=>documents.get(path)||null,authorize:async(postId,uid,post)=>{approvals.push({postId,uid,post});return {used:false};},audit:async(actor,id,action,reason)=>{commits.push({actor,id,action,reason});},publish:async(postId,uid,post,admin,reason)=>{assert.equal(admin.uid,'admin');assert.ok(reason.length>=10);documents.set('posts/'+postId,post);}};
function remoteFixture(url,init={}){
 const u=new URL(url);
 if(u.origin==='https://oauth2.googleapis.com')return Response.json({access_token:'server-test-token'});
 if(u.origin==='https://firestore.googleapis.com'){
  if(u.pathname.endsWith(':commit')){commits.push(JSON.parse(init.body));return Response.json({commitTime:'2026-01-01T00:00:00Z'});}
  const path=u.pathname.split('/documents/')[1];const value=documents.get(path);
  return value?Response.json({name:'projects/demo-sg/databases/(default)/documents/'+path,fields:Object.fromEntries(Object.entries(value).filter(([k])=>k!=='_updateTime').map(([k,v])=>[k,field(v)])),updateTime:value._updateTime||'2026-01-01T00:00:00.000000Z'}):new Response('{}',{status:404});
 }
 throw Error('UNEXPECTED_NETWORK');
}
before(async()=>{
 mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'publication-tests',modules:true,script:'export default {fetch(){return new Response("local fixture")}}',d1Databases:['SG_DB'],r2Buckets:['SG_MEDIA'],compatibilityDate:'2026-09-11'}]}));
 db=await mf.getD1Database('SG_DB');bucket=await mf.getR2Bucket('SG_MEDIA');
 for(const name of fs.readdirSync('something-gamer-api/migrations').sort()){
  const sql=fs.readFileSync('something-gamer-api/migrations/'+name,'utf8').replace(/^--.*$/gm,'');
  for(const statement of sql.match(/CREATE TRIGGER[^\n]*END;|CREATE TRIGGER[\s\S]*?^END;|CREATE(?: TABLE| INDEX)[\s\S]*?;/gm)||[])await db.prepare(statement).run();
 }
 const key=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const encoded=Buffer.from(await crypto.subtle.exportKey('pkcs8',key.privateKey)).toString('base64');
 serviceAccount=JSON.stringify({project_id:'demo-sg',client_email:'local-test@example.test',private_key:encoded});
});
beforeEach(async()=>{
 for(const table of ['post_submissions','quarantined_media','api_limits'])await db.prepare('DELETE FROM '+table).run();
 const objects=await bucket.list();for(const object of objects.objects)await bucket.delete(object.key);
 documents=new Map([['users/alice',profile],['users/bob',{...profile,name:'Bob',username:'bob'}]]);commits=[];approvals=[];
 env={SG_DB:db,SG_MEDIA:bucket,FIREBASE_PROJECT_ID:'demo-sg',FIRESTORE_SERVICE_ACCOUNT:serviceAccount,API_URL:'https://api.test',PUBLIC_MEDIA_ENABLED:'true',POST_MODERATION_ENABLED:'true'};
 globalThis.fetch=async(...args)=>remoteFixture(...args);
});
afterEach(()=>{globalThis.fetch=originalFetch;});after(async()=>{await mf?.dispose();});
const upload=async(purpose='post',review=async()=>({state:'pending_review'}),uid='alice')=>quarantineUpload(new Request('https://api.test/media/upload?purpose='+purpose+(purpose==='report'?'&contextId=report-fixture':''),{method:'POST',headers:{'Content-Type':'image/png'},body:bytes}),env,{uid},review);
const authorize=(id,post=draft,moderate=async()=>({flagged:false}),uid='alice')=>authorizePost(request('/posts/authorize',{postId:id,post}),env,{uid},moderate,{store});
const publicRead=id=>serveApprovedMedia(new Request('https://api.test/media/'+id),env,id);
async function expireAll(){await db.prepare('UPDATE quarantined_media SET expires_at=0').run();await expireQuarantine(env);}
test('S02 R2: AI indisponível mantém bytes privados; só autor/admin veem prévia',async()=>{
 const media=await upload('post',async()=>{throw Error('AI offline');});assert.equal(media.state,'pending_review');
 await assert.rejects(()=>publicRead(media.mediaId),/MEDIA_NOT_FOUND/);await assert.rejects(()=>previewQuarantine(env,media.mediaId,{uid:'bob'}),/FORBIDDEN/);
 assert.deepEqual(new Uint8Array(await (await previewQuarantine(env,media.mediaId,{uid:'alice'})).arrayBuffer()),bytes);
 assert.equal((await previewQuarantine(env,media.mediaId,{uid:'admin'},{admin:true})).headers.get('Cache-Control'),'private, no-store');
});
test('S02 R2: aprovação isolada não torna órfão público; referência canônica libera e remoção revoga',async()=>{
 const media=await upload('post',async()=>({state:'approved'}));await assert.rejects(()=>publicRead(media.mediaId),/MEDIA_NOT_FOUND/);
 await db.prepare('UPDATE quarantined_media SET bound_post=? WHERE id=?').bind('post-safe',media.mediaId).run();documents.set('posts/post-safe',{uid:'alice',mediaId:media.mediaId,mediaUrl:media.url});
 assert.deepEqual(new Uint8Array(await (await publicRead(media.mediaId)).arrayBuffer()),bytes);
 documents.delete('posts/post-safe');await assert.rejects(()=>publicRead(media.mediaId),/MEDIA_NOT_FOUND/);
});
test('S02 R2: MIME falso e classificação recusada não deixam bytes órfãos',async()=>{
 await assert.rejects(()=>quarantineUpload(new Request('https://api.test/media/upload',{method:'POST',headers:{'Content-Type':'image/png'},body:'<script>fixture</script>'}),env,{uid:'alice'}),/MEDIA_SIGNATURE_INVALID/);
 await assert.rejects(()=>upload('post',async()=>({state:'rejected'})),/CONTENT_REJECTED/);assert.equal((await bucket.list()).objects.length,0);
});
test('S02 R2: integridade de bytes é conferida após a aprovação',async()=>{
 const media=await upload('post',async()=>({state:'approved'})),row=await mediaRecord(env,media.mediaId);
 await bucket.put('private/'+media.mediaId,new Uint8Array([1,2,3]));await assert.rejects(()=>checkedObject(env,row),/MEDIA_NOT_READY/);
});
test('S02 perfil mantém revisão anterior; somente foto efetivada é pública',async()=>{
 const media=await upload('profile',async()=>({state:'approved'}));documents.set('users/alice',{...profile,pendingPhotoURL:media.url});await assert.rejects(()=>publicRead(media.mediaId),/MEDIA_NOT_FOUND/);
 documents.set('users/alice',{...profile,photoURL:media.url});assert.equal((await publicRead(media.mediaId)).status,200);
});
test('S02 evidência de denúncia nunca é pública e é retida com seu relato',async()=>{
 const media=await upload('report');documents.set('reports/report-fixture',{fromUid:'alice',evidenceURLs:[media.url]});await expireAll();
 assert.equal((await mediaRecord(env,media.mediaId)).purpose,'report');await assert.rejects(()=>publicRead(media.mediaId),/MEDIA_NOT_FOUND/);
});
test('S02 limpeza remove só órfão novo; publicação e estado remoto incerto preservam bytes',async()=>{
 const orphan=await upload(),linked=await upload(),uncertain=await upload();
 await db.prepare('UPDATE quarantined_media SET bound_post=? WHERE id=?').bind('kept',linked.mediaId).run();documents.set('posts/kept',{uid:'alice'});
 await db.prepare('UPDATE quarantined_media SET bound_post=? WHERE id=?').bind('unknown',uncertain.mediaId).run();
 globalThis.fetch=async(url,init)=>{if(String(url).endsWith('/posts/unknown'))throw Error('offline');return remoteFixture(url,init);};
 await expireAll();await assert.rejects(()=>mediaRecord(env,orphan.mediaId),/MEDIA_NOT_FOUND/);assert.ok(await mediaRecord(env,linked.mediaId));assert.ok(await mediaRecord(env,uncertain.mediaId));
});
test('S02 D1: backend emite recibo canônico; não publica nem aceita identidade do cliente',async()=>{
 const out=await authorize('valid');assert.equal(out.state,'authorized');assert.equal(out.post.uid,'alice');assert.equal(out.post.authorName,'Alice');assert.equal(approvals.length,1);assert.equal(documents.has('posts/valid'),false);
 await assert.rejects(()=>authorize('forged',{...draft,uid:'bob'}),/INVALID_POST_INPUT/);
});
for(const [label,moderate,state] of [['falha de AI',async()=>{throw Error('offline');},'pending_review'],['abuso',async()=>({flagged:true}),'rejected'],['resposta vazia',async()=>({}),'pending_review']])test(`S02 D1: ${label} não emite recibo`,async()=>{assert.equal((await authorize('decision',draft,moderate)).state,state);assert.equal(approvals.length,0);});
test('S02 D1: mídia não revisada vai para fila; mídia alheia é recusada',async()=>{
 const media=await upload();const post={...draft,type:'image',mediaId:media.mediaId,mediaUrl:media.url,mediaType:'image/png'};
 assert.equal((await authorize('pending',post)).state,'pending_review');assert.equal(approvals.length,0);
 await assert.rejects(()=>authorize('stolen',post,async()=>({flagged:false}),'bob'),/FORBIDDEN/);
});
test('S02 D1: autor/draft/id de mídia não podem mudar em retry',async()=>{
 const media=await upload('post',async()=>({state:'approved'})),post={...draft,type:'image',mediaId:media.mediaId};
 assert.equal((await authorize('one',post)).state,'authorized');await assert.rejects(()=>authorize('one',{...post,title:'alterado'}),/IDEMPOTENCY_CONFLICT/);
 await assert.rejects(()=>authorize('one',post,async()=>({flagged:false}),'bob'),/IDEMPOTENCY_CONFLICT/);await assert.rejects(()=>authorize('two',post),/RESOURCE_CONFLICT/);
});
test('S02 D1: concorrência do mesmo ID concede autoridade a um único autor',async()=>{
 const results=await Promise.allSettled([authorize('racing',draft,async()=>({flagged:false}),'alice'),authorize('racing',draft,async()=>({flagged:false}),'bob')]);
 assert.equal(results.filter(r=>r.status==='fulfilled'&&r.value.state==='authorized').length,1);assert.equal(approvals.length,1);assert.equal(new Set(approvals.map(a=>a.uid)).size,1);
});
test('S02 D1: conta suspensa após envio não passa por revisão administrativa',async()=>{
 await authorize('suspended',draft,async()=>{throw Error('offline');});documents.set('users/alice',{...profile,moderation:{status:'banned'}});
 await assert.rejects(()=>reviewPosts(request('/admin/posts',{action:'approve',id:'suspended',reason:'Revisão sintética do teste.'}),env,{uid:'admin'},{store}),/ACCOUNT_RESTRICTED/);assert.equal(documents.has('posts/suspended'),false);
 assert.equal((await db.prepare('SELECT state FROM post_submissions WHERE id=?').bind('suspended').first()).state,'pending_review');
});
test('S02 D1: revisão de mídia preserva análise/admin; decisões concorrentes são exclusivas',async()=>{
 const media=await upload();await authorize('review', {...draft,type:'image',mediaId:media.mediaId});
 const calls=await Promise.allSettled([reviewPosts(request('/admin/posts',{action:'approve',id:'review',reason:'Conteúdo sintético aprovado.'}),env,{uid:'admin'},{store}),reviewPosts(request('/admin/posts',{action:'reject',id:'review',reason:'Decisão concorrente sintética.'}),env,{uid:'admin'},{store})]);
 assert.equal(calls.filter(r=>r.status==='fulfilled').length,1);const state=(await db.prepare('SELECT state FROM post_submissions WHERE id=?').bind('review').first()).state;assert.ok(['published','rejected'].includes(state));assert.equal(documents.has('posts/review'),state==='published');
});
test('S02 D1: rejeição exige justificativa e deixa auditoria; autor não ressuscita aprovação',async()=>{
 await authorize('reject',draft,async()=>{throw Error('offline');});await reviewPosts(request('/admin/posts',{action:'reject',id:'reject',reason:'Conteúdo recusado por motivo de teste.'}),env,{uid:'admin'},{store});
 assert.equal(commits[0].action,'post_publication_rejected');assert.equal((await authorize('reject')).state,'rejected');assert.equal(approvals.length,0);
});
test('S02 D1: publicações concluídas saem da fila do autor e não retornam receipt novo',async()=>{
 const out=await authorize('complete');documents.set('posts/complete',out.post);assert.deepEqual((await postsMine(request('/posts/mine',{}),env,{uid:'alice'},{store})).items,[]);assert.equal((await authorize('complete')).state,'published');assert.equal(approvals.length,1);
});
test('S02 REST: revisão usa precondições de perfil/post/rate e timestamps de servidor, sem apagar outros limites',async()=>{
 await publicationStore(env).publish('rest-proof','alice',{...draft,eventId:'',mediaId:'',mediaUrl:'',mediaType:''},{uid:'admin'},'Revisão sintética auditável.');
 const writes=commits.find(c=>c.writes)?.writes;assert.ok(writes);assert.ok(writes.some(w=>w.verify?.endsWith('/users/alice')&&w.currentDocument.updateTime));
 const post=writes.find(w=>w.update?.name.endsWith('/posts/rest-proof'));assert.equal(post.currentDocument.exists,false);assert.deepEqual(post.updateTransforms,[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}]);
 const limit=writes.find(w=>w.update?.name.endsWith('/limites/alice'));assert.deepEqual(limit.updateMask.fieldPaths,[]);assert.equal(limit.updateTransforms[0].fieldPath,'post');
 assert.ok(writes.some(w=>w.update?.name.includes('/adminAuditLogs/')&&w.update.fields.reason.stringValue));
});
const legacyUrl=(owner='alice')=>'https://firebasestorage.googleapis.com/v0/b/demo-sg.appspot.com/o/'+encodeURIComponent(`chat/${owner}/alice_bob/test.png`)+'?alt=media&token=legacy-fixture-token';
test('S03 gateway: autorização atual, AppCheck e token do participante precedem GCS; token legado nunca é enviado',async()=>{
 let reads=0;documents.set('conversations/alice_bob',{members:['alice','bob']});
 globalThis.fetch=async(url,init)=>{
  if(String(url).startsWith('https://storage.googleapis.com/')){reads++;assert.equal(String(url).includes('legacy-fixture-token'),false);assert.equal(init.headers.Authorization,'Bearer server-test-token');assert.equal(init.redirect,'error');return new Response(bytes,{headers:{'Content-Type':'image/png'}});}
  if(String(url).includes('/conversations/')){assert.equal(init.headers.Authorization,'Bearer participant-test-token');assert.equal(init.headers['X-Firebase-AppCheck'],'test-appcheck');}
  return remoteFixture(url,init);
 };
 const response=await readLegacyChat(request('/media/legacy/read',{url:legacyUrl()}),env,{uid:'bob'});assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(reads,1);
});
test('S03 gateway: bloqueio/terceiro impede leitura antes de consultar bytes; bucket/owner forjado também',async()=>{
 let reads=0;globalThis.fetch=async(url,init)=>{if(String(url).startsWith('https://storage.googleapis.com/')){reads++;throw Error('bytes must not be read');}if(String(url).includes('/conversations/'))return new Response('{}',{status:403});return remoteFixture(url,init);};
 await assert.rejects(()=>readLegacyChat(request('/media/legacy/read',{url:legacyUrl()}),env,{uid:'bob'}),/FORBIDDEN/);
 documents.set('conversations/alice_bob',{members:['alice','bob']});globalThis.fetch=async(...args)=>{if(String(args[0]).startsWith('https://storage.googleapis.com/')){reads++;throw Error('bytes must not be read');}return remoteFixture(...args);};
 await assert.rejects(()=>readLegacyChat(request('/media/legacy/read',{url:legacyUrl('eve')}),env,{uid:'bob'}),/FORBIDDEN/);await assert.rejects(()=>readLegacyChat(request('/media/legacy/read',{url:legacyUrl().replace('demo-sg.appspot.com','other.appspot.com')}),env,{uid:'bob'}),/INVALID_MEDIA_CONTEXT/);assert.equal(reads,0);
});
test('S03 gateway admin preserva evidência privada e não permite SSRF',async()=>{
 globalThis.fetch=async(url,init)=>String(url).startsWith('https://storage.googleapis.com/')?new Response(bytes,{headers:{'Content-Type':'image/png'}}):remoteFixture(url,init);
 const url=legacyUrl().replace(encodeURIComponent('chat/alice/alice_bob/test.png'),encodeURIComponent('reports/alice/r1/test.png'));
 assert.equal((await readLegacyAdmin(request('/admin/media/legacy/read',{url}),env)).status,200);await assert.rejects(()=>readLegacyAdmin(request('/admin/media/legacy/read',{url:'https://evil.test/private'}),env),/INVALID_MEDIA_CONTEXT/);
});
test('S02 legado KV: adoção explícita preserva bytes/URL e exige vínculo da autoria real',async()=>{
 const id='b'.repeat(48),url='https://api.test/media/'+id;
 env.SG_AUTH={getWithMetadata:async()=>({value:bytes.buffer,metadata:{uid:'alice',contentType:'image/png'}})};
 documents.set('posts/legacy',{uid:'bob',mediaId:id,mediaUrl:url});const body={id,purpose:'post',resourceId:'legacy',reason:'Objeto legado conferido no teste.'};
 await assert.rejects(()=>adoptLegacyPublic(request('/admin/media/adopt-legacy',body),env,{uid:'admin'}),/FORBIDDEN/);
 documents.set('posts/legacy',{uid:'alice',mediaId:id,mediaUrl:url});await adoptLegacyPublic(request('/admin/media/adopt-legacy',body),env,{uid:'admin'});
 assert.deepEqual(new Uint8Array(await (await publicRead(id)).arrayBuffer()),bytes);assert.equal(commits[0].writes[0].update.fields.action.stringValue,'legacy_media_adoption');
});

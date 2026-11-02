// Somente shell público. Dados autenticados e páginas privadas nunca vão ao Cache API.
const CACHE='sg-public-v67-20261101';
const SHELL=['./offline.html','./offline.js','./sg-home.css?v=65','./sg-v67.css?v=6701','./assets/logo.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('sg-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin||req.headers.has('Authorization'))return;
 if(req.mode==='navigate'){
  event.respondWith(fetch(req).catch(()=>caches.match('./offline.html').then(r=>r||new Response('Sem conexão',{status:503}))));return;
 }
 // Apenas recursos explicitamente públicos; não coletar mídia privada nem HTML.
 if(!SHELL.some(path=>new URL(path,self.location.href).href===url.href))return;
 event.respondWith(fetch(req).then(async response=>{if(response.ok){const cache=await caches.open(CACHE);await cache.put(req,response.clone())}return response}).catch(()=>caches.match(req).then(r=>r||new Response('Sem conexão',{status:503}))));
});

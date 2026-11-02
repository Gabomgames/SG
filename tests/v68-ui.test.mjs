import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=(name)=>readFileSync(resolve(root,name),'utf8');
test('Landing V68 tem cadastro, chat e áreas reais do SG',()=>{
 const html=read('index.html');
 for(const route of ['register.html','login.html','feed.html','chat.html','marketplace.html','communities.html'])assert.ok(html.includes(`href="${route}"`),route);
 assert.match(html,/sg-v68-home\.css/);
 assert.match(html,/PRÉVIA/);
});
test('Now Call real mantém todos os seletores usados pelo JavaScript V67',()=>{
 const html=read('chat.html');
 for(const id of ['chatShell','channelList','messageList','messageForm','messageInput','mobileSpaces','createServer','joinServer','callDialog','audioCallButton','videoCallButton'])assert.ok(html.includes(`id="${id}"`),id);
 assert.match(html,/chat\.js\?v=58/);
 assert.match(html,/sg-v68-app\.css/);
});
test('Rotas modificadas resolvem seus recursos locais',()=>{
 for(const name of ['index.html','chat.html','edit-profile.html','call-now.html','dashboard.html']){
  const html=read(name);
  const srcs=[...html.matchAll(/<(?:link|script)[^>]*(?:href|src)="([^"]+)"/g)].map(m=>m[1]).filter(u=>!u.startsWith('http'));
  for(const src of srcs){assert.ok(existsSync(resolve(root,src.split('?')[0])),`${name}: ${src}`)}
 }
});
test('Now Call mobile tem layout sem sobreposição do V57',()=>{
 const css=read('sg-v68-app.css');
 assert.match(css,/\.discord-shell:not\(\.show-spaces\) \.server-rail/);
 assert.match(css,/transform:none!important/);
 assert.match(css,/\.discord-sidebar \.chat-me/);
});
test('landing não força redirecionamento em sessão autenticada',()=>{
 assert.doesNotMatch(read('home.js'),/location\.replace/);
});

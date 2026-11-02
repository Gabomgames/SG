// Idempotent across page bundles that import the shared theme.
if(!document.querySelector(".sg-sunset-scene")){
// Shared presentation; no payment, identity or permission decisions live here.
const stylesheet=document.createElement('link');
stylesheet.rel='stylesheet';stylesheet.href=new URL('./professional-ui.css',import.meta.url).href;
document.head.append(stylesheet);
const scene=document.createElement('div');
scene.className='sg-sunset-scene';scene.setAttribute('aria-hidden','true');
const palm='<path d="M112 300Q146 178 127 94" fill="none" stroke="currentColor" stroke-width="12"/><g class="palm-crown"><path d="M127 95Q70 29 17 87Q75 57 127 95M127 95Q69 71 18 139Q71 102 127 95M127 95Q110 17 160 14Q128 55 127 95M127 95Q184 24 218 69Q164 55 127 95M127 95Q204 74 228 133Q171 93 127 95M127 95Q165 112 183 166Q142 128 127 95" fill="currentColor"/></g>';
scene.innerHTML=`<div class="sunset-orb"></div><div class="sunset-water"></div><svg class="sunset-palm palm-left" viewBox="0 0 240 320">${palm}</svg><svg class="sunset-palm palm-right" viewBox="0 0 240 320">${palm}</svg><div class="sunset-grain"></div>`;
document.body.prepend(scene);
function syncMotion(){scene.classList.toggle('paused',document.hidden);}
document.addEventListener('visibilitychange',syncMotion);syncMotion();
const shell=document.getElementById('chatShell');
if(shell){
 const chatScene=scene.cloneNode(true);chatScene.className='sg-chat-sunset';shell.querySelector('.discord-chat')?.prepend(chatScene);
 const pauseChat=()=>chatScene.classList.toggle('paused',document.hidden);document.addEventListener('visibilitychange',pauseChat);pauseChat();
 const status=document.createElement('div');status.className='chat-network-state';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 shell.querySelector('.discord-chat')?.prepend(status);
 const update=()=>{status.hidden=navigator.onLine;status.textContent='Sem conexão · mensagens pendentes aguardam reconexão';};
 addEventListener('online',update);addEventListener('offline',update);update();
 const toggle=document.getElementById('mobileSpaces');
 const sync=()=>toggle?.setAttribute('aria-expanded',String(shell.classList.contains('show-spaces')));
 new MutationObserver(sync).observe(shell,{attributes:true,attributeFilter:['class']});sync();
 document.addEventListener('keydown',event=>{if(event.key==='Escape')shell.classList.remove('show-spaces');});
 const input=document.getElementById('messageInput');
 if(input?.tagName==='TEXTAREA')input.addEventListener('input',()=>{input.style.height='auto';input.style.height=`${Math.min(input.scrollHeight,144)}px`;});
}

}

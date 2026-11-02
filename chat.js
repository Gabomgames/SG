import './channel-tools.js';
import "./voice-room.js";
import "./community-tools.js";
import {api} from './api-client.js';
import { auth, db, appCheckHeaders } from "./firebase.js";
import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, deleteField, doc, getDoc, getDocFromServer, getDocs, endBefore, limit, limitToLast, Timestamp, writeBatch, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { openSafetyReport } from "./reports.js";
import { assertModeratedPublicText, assertModeratedImageUrl } from "./moderation.js";
import { APP_CONFIG } from "./config.js";
import { hrefSeguro, srcSeguro } from "./seguranca-web.js";
import { icone } from "./icones.js";
import { postBadges, profileBadges } from "./badges.js";
import { initCalls, refreshCallAvailability, getActiveCallAudioStream, hangupCall } from "./calls.js";
import { uploadMedia, prepareImage, resolvePrivateMedia, revokePrivateMedia } from "./media-upload.js";
import { language } from "./i18n.js";
const $=id=>document.getElementById(id),pair=(a,b)=>[a,b].sort().join("_");
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const emojis=["😀","😂","😍","🥰","😎","🤔","😭","😡","👍","👎","👏","🙏","🔥","🎮","🏆","❤️","💜","✅","👀","🚀","🎉","💀","🤝","⭐"];
const stickerArt=(emoji,label,color)=>`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180" viewBox="0 0 240 180"><path fill="${color}" stroke="white" stroke-width="8" d="M28 20h184a18 18 0 0 1 18 18v92a18 18 0 0 1-18 18h-61l-31 23-31-23H28a18 18 0 0 1-18-18V38a18 18 0 0 1 18-18z"/><text x="120" y="88" text-anchor="middle" font-size="54">${emoji}</text><text x="120" y="127" text-anchor="middle" font-family="Arial" font-size="21" font-weight="800" fill="white">${label}</text></svg>`)}`;
const stickers=[
  {label:"Bora jogar!",url:stickerArt("🎮","BORA JOGAR!","#5b3df5")},
  {label:"GG!",url:stickerArt("🏆","GG!","#1479d1")},
  {label:"Mandou bem",url:stickerArt("🔥","MANDOU BEM","#e34b3f")},
  {label:"Tô chegando",url:stickerArt("🚀","TÔ CHEGANDO","#106b61")},
  {label:"Partiu",url:stickerArt("😎","PARTIU!","#8b3cc7")},
  {label:"Fechado",url:stickerArt("🤝","FECHADO","#1b8699")},
  {label:"Amei",url:stickerArt("🥰","AMEI!","#d43e86")},
  {label:"Boa noite",url:stickerArt("🌙","BOA NOITE","#31428d")},
  {label:"Parabéns",url:stickerArt("🎉","PARABÉNS!","#9b3fb3")},
  {label:"Valeu",url:stickerArt("💜","VALEU!","#603bd0")},
  {label:"Calma",url:stickerArt("😅","CALMA AÍ","#b66a20")},
  {label:"Só mais uma",url:stickerArt("👀","SÓ MAIS UMA","#225d83")},
  {label:"Eu te amo",url:stickerArt("❤️","EU TE AMO","#c52f61")},
  {label:"Saudades",url:stickerArt("🥺","SAUDADES","#6447a9")},
  {label:"Bom dia",url:stickerArt("☀️","BOM DIA!","#c7861b")},
  {label:"Boa tarde",url:stickerArt("🌤️","BOA TARDE","#377daf")},
  {label:"Tô online",url:stickerArt("🟢","TÔ ONLINE","#187a58")},
  {label:"Já volto",url:stickerArt("⏳","JÁ VOLTO","#6e5b9b")},
  {label:"Perdemo",url:stickerArt("😭","PERDEMO","#4d5d86")},
  {label:"Vitória",url:stickerArt("🥇","VITÓRIA!","#9b7315")},
  {label:"Manda convite",url:stickerArt("✉️","MANDA CONVITE","#286aa0")},
  {label:"Sem lag",url:stickerArt("⚡","SEM LAG!","#6f5c14")},
  {label:"Que susto",url:stickerArt("😱","QUE SUSTO","#763c8b")},
  {label:"Até amanhã",url:stickerArt("👋","ATÉ AMANHÃ","#31587c")}
];
function customStickers(){try{return JSON.parse(localStorage.getItem("sgCustomStickers")||"[]").filter(item=>item?.url&&item?.label).slice(0,24)}catch{return[]}}
const chatPreferences=new Map();let showArchived=false,unsubscribePreferences=null;
let me=null,myProfile={},friends=[],mentionProfiles=[],servers=[],activeMode="dm",activeTarget=null,activeFriendship=null,activeMessagePath=null,unsubscribeMessages=null,unsubscribeServers=null,messageFallbackTimer=null,serverDialogMode="create",serverIconData="",searchTerm="";
let activeReply=null;
let olderDocs=new Map(), liveSnap=null, hasOlder=true, streamGeneration=0, conversationActivity=new Map(), unsubscribeInbox=null;
const messageRecords=new Map();
let lastMessageSig=null,lastSnap=null,messageLimit=50,loadingOlder=false,olderRestore=null,convoData={},unsubscribeConvo=null,unreadMark=0,typingSeen={value:0,at:0},lastReadWrite=0,lastTypingWrite=0;
const tsMs=t=>t?.toMillis?.()||0;
const savedKey=()=>`sg_saved_${me?.uid}`;
function loadSaved(){try{return JSON.parse(localStorage.getItem(savedKey())||"[]")}catch{return[]}}
const isSaved=id=>loadSaved().some(x=>x.id===id);
function reactionsHtml(id,m){const r=m.reactions||{},counts={},mine=r[me.uid];for(const e of Object.values(r))counts[e]=(counts[e]||0)+1;const chips=Object.entries(counts).map(([e,n])=>`<button type="button" class="msg-reaction ${mine===e?"mine":""}" data-react="${esc(e)}" data-react-id="${id}">${esc(e)} ${n}</button>`).join("");return chips?`<div class="msg-reactions">${chips}</div>`:""}
const seenKey=path=>`sg_seen_${me?.uid}_${path.join("/")}`;
const failedKey=()=>`sg_failed_${me?.uid}`;
function loadFailed(){try{return JSON.parse(localStorage.getItem(failedKey())||"[]")}catch{return[]}}
function saveFailed(item){const list=loadFailed().filter(f=>f.id!==item.id);list.push(item);try{localStorage.setItem(failedKey(),JSON.stringify(list.slice(-50)))}catch{}}
function removeFailed(id){try{localStorage.setItem(failedKey(),JSON.stringify(loadFailed().filter(f=>f.id!==id)))}catch{}}
function repaintMessages(){lastMessageSig=null;if(lastSnap)renderMessages(lastSnap);else renderMessages({docs:[],docChanges:()=>[],size:0,metadata:{}})}
function paintTyping(){let el=$("typingIndicator");if(!el){el=document.createElement("div");el.id="typingIndicator";el.className="typing-indicator";el.setAttribute("aria-live","polite");$("messageForm").append(el)}const on=activeMode==="dm"&&activeTarget&&Date.now()-typingSeen.at<4000;el.hidden=!on;el.textContent=on?`${activeTarget.name||"Amigo"} está digitando…`:""}
function toast(text){$("appToast").textContent=text;$("appToast").classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>$("appToast").classList.remove("show"),3000)}
function avatar(p){return p?.photoURL?`<img src="${srcSeguro(p.photoURL)}" alt="">`:esc((p?.name||"G")[0])}
function dateLabel(value){if(!value?.toDate)return"agora";const date=value.toDate(),today=new Date();return date.toDateString()===today.toDateString()?date.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}):date.toLocaleDateString("pt-BR",{day:"2-digit",month:"short"})}
function renderServers(){$("serverList").innerHTML=servers.map(s=>`<button class="server-icon ${activeMode==="server"&&activeTarget?.serverId===s.id?"active":""}" data-server="${s.id}" title="${esc(s.name)}">${s.icon?`<img src="${srcSeguro(s.icon)}" alt="">`:esc(s.name.slice(0,2).toUpperCase())}</button>`).join("");paintGamerFriend()}
function renderFriends(){const visible=[...friends].sort((a,b)=>(conversationActivity.get(b.conversationId||pair(me.uid,b.uid))?.updatedAt?.toMillis?.()||0)-(conversationActivity.get(a.conversationId||pair(me.uid,a.uid))?.updatedAt?.toMillis?.()||0)).filter(p=>Boolean(chatPreferences.get(p.conversationId||pair(me.uid,p.uid))?.archived)===showArchived).filter(p=>!searchTerm||`${p.name} ${p.username}`.toLowerCase().includes(searchTerm));$("spaceKind").textContent="CONVERSAS";$("spaceTitle").textContent="Mensagens diretas";$("shareServer").hidden=true;$("deleteServer").hidden=true;$("leaveServer").hidden=true;$("channelList").innerHTML=visible.length?visible.map(p=>`<button class="dm-row ${activeMode==="dm"&&activeTarget?.uid===p.uid&&(activeTarget?.conversationId||"")===(p.conversationId||"")?"active":""}" data-user="${p.uid}" data-conversation="${esc(p.conversationId||'')}"><span class="person-avatar">${avatar(p)}</span><span><strong>${esc(p.name||p.username||"Gamer")}${profileBadges(p,{compact:true})}</strong><small>${p.marketChat?"Negociação · Now Market":"@"+esc(p.username||"gamer")}</small></span><span class="dm-unread" aria-label="Nova atividade">${(conversationActivity.get(p.conversationId||pair(me.uid,p.uid))?.lastSenderUid===p.uid && (conversationActivity.get(p.conversationId||pair(me.uid,p.uid))?.updatedAt?.toMillis?.()||0)>(conversationActivity.get(p.conversationId||pair(me.uid,p.uid))?.reads?.[me.uid]?.toMillis?.()||0))?"●":""}</span></button>`).join(""):'<div class="chat-hint"><strong>Nenhuma conversa aqui</strong><span>Adicione amigos na Comunidade para começar.</span><a href="social.html">Encontrar pessoas</a></div>'}
function voiceWave(){return '<span class="voice-note-wave" aria-hidden="true">'+Array.from({length:28},(_,i)=>`<i style="--h:${18+((i*17)%38)}%"></i>`).join('')+'</span>'}
function messageBody(m){
  if(m.type==="market_offer"&&m.offer){const value=m.offer;return `<div class="market-offer-message"><strong>Negociação · Now Market</strong><p>R$ ${(Number(value.amountCents)/100).toFixed(2).replace(".",",")} por unidade · ${Number(value.quantity)} unidade(s)</p><small>${esc(value.state)}</small><button type="button" data-market-offer="${esc(value.id)}">Consultar proposta atual</button></div>`;}
  if (!m.deleted && String(m.mediaUrl || '').includes('/private-media/')) {
    const kind = m.type === 'image' ? 'img' : m.type === 'video' ? 'video' : 'audio';
    return `<div class="private-attachment"><${kind} data-private-src="${srcSeguro(m.mediaUrl)}" ${kind === 'img' ? 'alt="Imagem privada"' : 'controls preload="none"'} class="chat-media"></${kind}><small role="status">Carregando arquivo privado…</small></div>`;
  }
  if(m.type==="gif")return `<img class="chat-media chat-gif" src="${srcSeguro(m.mediaUrl)}" alt="GIF animado" loading="lazy">`;
  if(m.type==="sticker"){const src=srcSeguro(m.mediaUrl),label=String(m.text||"");if(src)return `<img class="chat-sticker-image" src="${src}" alt="${esc(label||"Figurinha")}" loading="lazy">`;return /\p{L}/u.test(label)?`<p>${esc(label)}</p>`:`<span class="chat-sticker" role="img" aria-label="Figurinha">${esc(label||"🙂")}</span>`}
  if(m.type==="image"&&m.viewOnce)return viewOnceHtml(m);
  if(m.type==="image")return `<div class="chat-media-wrap"><img class="chat-media" src="${srcSeguro(m.mediaUrl)}" alt="Foto enviada" loading="lazy"><a class="chat-media-download" href="${srcSeguro(m.mediaUrl)}" download target="_blank" rel="noopener noreferrer" aria-label="Baixar foto" title="Baixar foto"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.6v11.4M7.4 10.6l4.6 4.6 4.6-4.6"/><path d="M4.6 18.4h14.8"/></svg></a></div>`;
  if(m.type==="video")return `<video class="chat-media chat-video" src="${srcSeguro(m.mediaUrl)}" controls playsinline preload="metadata"></video>`;
  if(m.type==="audio")return `<div class="voice-note"><button class="voice-note-play" type="button" aria-label="Reproduzir áudio">▶</button><div class="voice-note-main"><span class="voice-note-label">Mensagem de voz</span>${voiceWave()}<span class="voice-note-progress"><i></i></span></div><time class="voice-note-time">0:00</time><button class="voice-note-speed" type="button" aria-label="Velocidade de reprodução">1x</button><audio preload="metadata" src="${srcSeguro(m.mediaUrl)}"></audio></div>`;
  if(m.type==="link")return `<a class="chat-attachment-link" href="${hrefSeguro(m.mediaUrl)}" target="_blank" rel="noopener noreferrer">${esc(m.text||m.mediaUrl)}</a>`;
  return `<p>${esc(m.text)}</p>`
}
function viewOnceHtml(m){
  const openedByMe=(m.viewOnceOpenedBy||[]).includes(me.uid),expired=m.viewOnceExpired||(m.uid!==me.uid&&openedByMe);
  if(expired)return `<div class="view-once view-once--expired"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M8 8l8 8M16 8l-8 8"/></svg><span>Foto de visualização única${m.uid===me.uid?" — visualizada":" — já foi vista"}</span></div>`;
  return `<button type="button" class="view-once" data-view-once="${srcSeguro(m.mediaUrl)}"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M12 3.4a8.6 8.6 0 0 1 0 17.2"/></svg><span>${m.uid===me.uid?"Foto de visualização única enviada":"Toque para ver • some depois de aberta"}</span></button>`
}
function dayLabelFrom(ms){if(!ms)return"Hoje";const d=new Date(ms),today=new Date(),yesterday=new Date();yesterday.setDate(today.getDate()-1);if(d.toDateString()===today.toDateString())return"Hoje";if(d.toDateString()===yesterday.toDateString())return"Ontem";return d.toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:d.getFullYear()!==today.getFullYear()?"numeric":undefined})}
function renderMessages(snap){
  const other=activeMode==="dm"&&activeTarget?activeTarget.uid:"";
  const otherRead=other?tsMs(convoData.reads?.[other]):0;
  const failed=activeMessagePath?loadFailed().filter(f=>f.path===activeMessagePath.join("/")):[];
  const sig=snap.docs.map(d=>{const x=d.data();return [d.id,d.metadata.hasPendingWrites?1:0,x.text,x.mediaUrl,x.edited?1:0,x.deleted?1:0,JSON.stringify(x.reactions||{}),isSaved(d.id)?1:0,x.createdAt?.toMillis?.()||x.clientCreatedAt||0].join("~")}).join("|")+`#${otherRead}#${failed.map(f=>f.id).join(",")}#${navigator.onLine?1:0}#${unreadMark}`;
  if(sig===lastMessageSig)return;lastMessageSig=sig;
  const list=$("messageList"),nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<180;messageRecords.clear();
  const rows=[];let previous=null,previousDay="",dividerDone=false,lastOwnId="";
  for(const item of snap.docs){const x=item.data();if(x.uid===me.uid&&!x.deleted)lastOwnId=item.id}
  const olderNote=hasOlder&&snap.size>0?'<div class="message-load-older"><button type="button" data-load-older>Carregar mensagens anteriores</button></div>':"";
  if(olderNote)rows.push(olderNote);
  for(const item of snap.docs){
    const m=item.data();if(currentPreferences().hiddenIds.includes(item.id))continue;const own=m.uid===me.uid,pending=item.metadata.hasPendingWrites,millis=m.createdAt?.toMillis?.()||m.clientCreatedAt||Date.now(),day=new Date(millis).toDateString();messageRecords.set(item.id,m);
    if(day!==previousDay){rows.push(`<div class="message-day"><span>${esc(dayLabelFrom(millis))}</span></div>`);previousDay=day;previous=null}
    if(!dividerDone&&unreadMark>0&&!own&&!pending&&millis>unreadMark){rows.push('<div class="unread-divider" role="separator"><span>Novas mensagens</span></div>');dividerDone=true;previous=null}
    const compact=Boolean(previous&&previous.uid===m.uid&&millis-previous.millis<5*60*1000);
    const reply=m.replyTo?`<button type="button" class="message-reply-ref" data-reply-ref="${esc(m.replyTo.id||"")}"><strong>${esc(m.replyTo.authorName||"Gamer")}</strong><span>${esc(m.replyTo.text||"Mensagem")}</span></button>`:"";
    const body=m.deleted?'<p class="deleted-message">Mensagem apagada</p>':messageBody(m);
    let status="",statusClass="";
    if(own&&pending){status=navigator.onLine?"Enviando…":"Aguardando conexão…";statusClass="pending"}
    else if(own&&item.id===lastOwnId&&!m.deleted){if(other&&tsMs(m.createdAt)&&tsMs(m.createdAt)<=otherRead){status="✓✓ Lida";statusClass="read"}else{status="✓ Enviada";statusClass="sent"}}
    const edited=m.edited&&!m.deleted?"editada":"";
    rows.push(`<article class="message ${own?"mine":""} ${pending?"sending":""} ${m.edited?"edited":""} ${compact?"compact":""}" data-message="${item.id}" data-author="${esc(m.uid)}"><span class="message-avatar">${avatar(own?myProfile:{name:m.authorName,photoURL:m.authorPhoto})}</span><div class="message-bubble"><header><b>${esc(own?"Você":m.authorName||"Gamer")}${postBadges(m)}</b><time>${dateLabel(m.createdAt)}${isSaved(item.id)?" ⭐":""}</time></header>${reply}${body}${m.deleted?"":reactionsHtml(item.id,m)}<small class="msg-status ${statusClass}">${[edited,status].filter(Boolean).join(" · ")}</small></div></article>`);
    previous={uid:m.uid,millis};
  }
  for(const f of failed){
    const preview=f.payload?.text||(f.payload?.type==="audio"?"Mensagem de voz":f.payload?.type==="image"?"Imagem":f.payload?.type==="sticker"?"Figurinha":"Mensagem");
    rows.push(`<article class="failed-message" data-failed="${esc(f.id)}"><span class="message-avatar">${avatar(myProfile)}</span><div class="message-bubble"><header><b>Você</b></header><p>${esc(String(preview).slice(0,300))}</p><small class="msg-status failed">Falha ao enviar</small><div class="failed-actions"><button type="button" data-retry="${esc(f.id)}">Tentar novamente</button><button type="button" data-discard="${esc(f.id)}">Descartar</button></div></div></article>`);
  }
  revokePrivateMedia();
  list.innerHTML=rows.join("")||'<div class="chat-empty"><strong>Comece a conversa</strong><span>Envie texto, áudio, mídia ou inicie uma chamada.</span></div>';
  const newestAdded=snap.docChanges().some(c=>c.type==="added"&&c.newIndex===snap.size-1);
  if(olderRestore){list.scrollTop=list.scrollHeight-olderRestore.h+olderRestore.t;if(snap.size>olderRestore.prevSize||!snap.metadata.fromCache){olderRestore=null;loadingOlder=false}}
  else if(nearBottom||(!lastSnap&&newestAdded))requestAnimationFrame(()=>list.scrollTo({top:list.scrollHeight,behavior:"smooth"}));
  if(snap.docChanges().some(c=>c.type==="added"&&c.doc.data().uid===other&&!c.doc.metadata.fromCache)){typingSeen.at=0;paintTyping()}
  hydratePrivateMedia(list);applySearchFilter();afterRender(snap)
}
function afterRender(snap){
  if(!activeMessagePath||document.visibilityState!=="visible")return;
  try{localStorage.setItem(seenKey(activeMessagePath),String(Date.now()))}catch{}
  if(activeMode!=="dm"||!activeTarget)return;
  let newest=0;for(const d of snap.docs){const x=d.data();if(x.uid===activeTarget.uid&&!d.metadata.hasPendingWrites)newest=Math.max(newest,tsMs(x.createdAt))}
  if(newest&&newest>tsMs(convoData.reads?.[me.uid])&&Date.now()-lastReadWrite>1500){lastReadWrite=Date.now();updateDoc(doc(db,...activeMessagePath),{["reads."+me.uid]:serverTimestamp()}).catch(()=>{})}
}
function isGamerFriend(){return activeMode==="dm"&&activeFriendship?.gamerStatus==="accepted"}
async function ensureConversation(id,members){
 const ref=doc(db,'conversations',id);
 try{const prior=await getDoc(ref);if(prior.exists())return;}catch(error){if(error.code!=='permission-denied')throw error;}
 await setDoc(ref,{members,updatedAt:serverTimestamp()},{merge:true});
}
function canSendRichMedia(){return activeMode==="server"||isGamerFriend()||activeTarget?.marketChat===true}
function paintGamerFriend(){const button=$("gamerFriendAction");if(activeMode!=="dm"||!activeTarget){button.hidden=true;return}button.hidden=false;const status=activeFriendship?.gamerStatus;if(status==="accepted"){button.innerHTML=icone("confere",16)+" Amigos Gamers";button.disabled=true;button.classList.add("accepted")}else if(status==="pending"&&activeFriendship?.gamerRequestedBy===me.uid){button.textContent="Convite Gamer enviado";button.disabled=true;button.classList.remove("accepted")}else if(status==="pending"){button.innerHTML=icone("amigos",16)+" Aceitar Amizade Gamer";button.disabled=false;button.classList.remove("accepted")}else{button.innerHTML=icone("amigos",16)+" Virar Amigos Gamers";button.disabled=false;button.classList.remove("accepted")}}
function setComposerEnabled(enabled){paintPreferenceControls(enabled);const blockAction=document.querySelector(".chat-block-button");if(blockAction)blockAction.hidden=!enabled||activeMode!=="dm";["messageInput","emojiButton","stickerButton","gifButton"].forEach(id=>$(id).disabled=!enabled);$("mediaButton").disabled=!enabled;$("voiceButton").disabled=!enabled;$("mediaButton").title="Enviar anexo privado";$("voiceButton").title="Gravar mensagem de voz";document.querySelector(".send-message").disabled=!enabled;refreshCallAvailability()}
function subscribeMessages(){
  unsubscribeMessages?.();clearInterval(messageFallbackTimer);
  const generation=streamGeneration;
  const messagesQuery=query(collection(db,...activeMessagePath,"messages"),orderBy("createdAt","asc"),limitToLast(messageLimit));
  unsubscribeMessages=onSnapshot(messagesQuery,{includeMetadataChanges:true},snap=>{if(generation!==streamGeneration)return;liveSnap=snap;if(olderDocs.size===0&&snap.size<50&&!snap.metadata.fromCache)hasOlder=false;mergeHistory(snap)},error=>{if(generation!==streamGeneration)return;console.error(error);setComposerEnabled(false);messageRecords.clear();revokePrivateMedia();$("messageList").innerHTML='<div class="chat-empty" role="alert"><strong>Conversa indisponível</strong><span>Verifique suas permissões e abra a conversa novamente.</span></div>';toast("Não foi possível sincronizar esta conversa. Verifique a conexão e suas permissões.")});
  // rede de segurança leve: o listener em tempo real já entrega tudo; isto só cobre um listener que morreu em silêncio
  // O SDK reconecta o listener. Não fazer polling concorrente.
}
function openMessageStream(path,title,subtitle){
  streamGeneration++;olderDocs.clear();liveSnap=null;hasOlder=true;lastMessageSig=null;lastSnap=null;messageLimit=50;loadingOlder=false;olderRestore=null;convoData={};typingSeen={value:0,at:0};
  revokePrivateMedia();messageRecords.clear();$("messageList").innerHTML='<div class="chat-empty" role="status"><strong>Carregando conversa…</strong><span>Sincronizando mensagens.</span></div>';const generation=streamGeneration;activeMessagePath=path;$("chatShell").classList.add("conversation-open");$("chatHeader").innerHTML=`<strong>${esc(title)}</strong><span>${esc(subtitle)}</span>`;setComposerEnabled(true);
  try{unreadMark=Number(localStorage.getItem(seenKey(path)))||0}catch{unreadMark=0}
  unsubscribeConvo?.();unsubscribeConvo=null;paintTyping();
  if(path[0]==="conversations")unsubscribeConvo=onSnapshot(doc(db,...path),snap=>{
    if(generation!==streamGeneration)return;convoData=snap.data()||{};
    const other=activeTarget?.uid,t=other?tsMs(convoData.typing?.[other]):0;
    if(t&&t!==typingSeen.value){typingSeen={value:t,at:Date.now()};paintTyping();setTimeout(paintTyping,4200)}
    repaintMessages()
  },()=>{});
  subscribeMessages()
}
async function openDm(friend){if(!friend)return toast("Essa pessoa ainda não está na sua lista de amigos.");activeMode="dm";activeTarget=friend;const id=friend.conversationId||pair(me.uid,friend.uid),friendshipSnap=friend.marketChat?null:await getDoc(doc(db,"friendships",id));activeFriendship=friendshipSnap?.exists()?friendshipSnap.data():null;$("directMessages").classList.add("active");$("chatProfileLink").hidden=false;$("chatProfileLink").href=`profile.html?u=${encodeURIComponent(friend.uid)}`;renderServers();renderFriends();paintGamerFriend();const members=[me.uid,friend.uid].sort();await ensureConversation(id,members);openMessageStream(["conversations",id],friend.name||friend.username||"Gamer",friend.marketChat?"Negociação no Now Market":`@${friend.username||"gamer"} · ${isGamerFriend()?"Amigos Gamers":"amigos"}`);history.replaceState(null,"",friend.marketChat?`chat.html?conversation=${encodeURIComponent(id)}`:`chat.html?u=${encodeURIComponent(friend.uid)}`);closeMobileSidebar()}
async function serverMembers(server){return Promise.all((server.members||[]).map(async uid=>{const snap=await getDoc(doc(db,"publicProfiles",uid));return{uid,...(snap.data()||{name:"Gamer",username:"gamer"})}}))}
async function openServer(server){if(!server)return;activeMode="server";activeTarget={serverId:server.id};$("directMessages").classList.remove("active");$("chatProfileLink").hidden=true;renderServers();$("spaceKind").textContent="SERVIDOR";$("spaceTitle").textContent=server.name;$("shareServer").hidden=false;$("deleteServer").hidden=server.ownerUid!==me.uid;$("leaveServer").hidden=server.ownerUid===me.uid;$("chatSearch").placeholder="Pesquisar canal ou integrante";const [channels,members]=await Promise.all([getDocs(query(collection(db,"servers",server.id,"channels"),orderBy("createdAt","asc"))),serverMembers(server)]),rows=channels.docs.map(d=>({id:d.id,...d.data()})).filter(c=>c.audience!=='staff'||server.ownerUid===me.uid||server.roles?.[me.uid]==='moderator'),term=searchTerm.toLowerCase(),visibleMembers=members.filter(p=>!term||`${p.name} ${p.username}`.toLowerCase().includes(term));$("channelList").innerHTML=`<div class="server-about"><strong>${esc(server.name)}</strong><span>${esc(server.description||"Comunidade no Something Gamer")}</span><small>${members.length} integrante${members.length===1?"":"s"}</small></div>`+rows.filter(c=>!term||c.name.toLowerCase().includes(term)).map(c=>`<button class="channel-row" data-channel="${c.id}"><span>#</span> ${esc(c.name)}</button>`).join("")+`${server.ownerUid===me.uid?'<button class="new-channel" data-new-channel>＋ Criar canal</button>':""}<section class="server-members"><header>INTEGRANTES · ${members.length}</header>${visibleMembers.map(p=>`<article data-member="${p.uid}"><span class="person-avatar">${avatar(p)}</span><span><strong>${esc(p.name||"Gamer")}${profileBadges(p,{compact:true})}</strong><small>@${esc(p.username||"gamer")}${p.uid===server.ownerUid?" · dono":""}</small></span>${server.ownerUid===me.uid&&p.uid!==me.uid?`<button data-remove-member="${p.uid}" title="Remover integrante">×</button>`:""}</article>`).join("")||"<p>Nenhum integrante encontrado.</p>"}</section>`;if(rows[0]&&!activeTarget.channelId)openChannel(server,rows[0]);closeMobileSidebar()}
function openChannel(server,channel){activeTarget={serverId:server.id,channelId:channel.id};refreshCallAvailability();document.querySelectorAll(".channel-row").forEach(b=>b.classList.toggle("active",b.dataset.channel===channel.id));openMessageStream(["servers",server.id,"channels",channel.id],`# ${channel.name}`,server.name);history.replaceState(null,"",`chat.html?s=${server.id}&c=${channel.id}`)}
async function loadFriends(){const snap=await getDocs(query(collection(db,"friendships"),where("members","array-contains",me.uid)));const states=new Map(snap.docs.map(x=>[x.id,x.data()])),ids=snap.docs.map(x=>x.data().members.find(id=>id!==me.uid)).filter(Boolean);friends=await Promise.all(ids.map(async id=>({uid:id,friendship:states.get(pair(me.uid,id)),...((await getDoc(doc(db,"publicProfiles",id))).data()||{name:"Gamer"})})));renderFriends();const requested=new URLSearchParams(location.search).get("u");if(requested)await openDm(friends.find(p=>p.uid===requested))}
async function loadMentionProfiles(){const publicSnap=await getDocs(query(collection(db,"publicProfiles"),where("visibility","==","public"))).catch(()=>({docs:[]})),all=[...publicSnap.docs.map(item=>({uid:item.id,...item.data()})),...friends];mentionProfiles=[...new Map(all.filter(item=>item.uid&&item.uid!==me.uid).map(item=>[item.uid,item])).values()]}
function watchServers(){unsubscribeServers?.();unsubscribeServers=onSnapshot(query(collection(db,"servers"),where("members","array-contains",me.uid)),snap=>{servers=snap.docs.map(d=>({id:d.id,...d.data()}));renderServers();const requested=new URLSearchParams(location.search).get("s");if(requested&&activeMode!=="server"){const found=servers.find(s=>s.id===requested);if(found)openServer(found)}})}
function closeMobileSidebar(){$("chatShell").classList.remove("show-spaces")}
$("directMessages").onclick=()=>{activeMode="dm";activeTarget=null;activeMessagePath=null;refreshCallAvailability();$("directMessages").classList.add("active");$("chatProfileLink").hidden=true;$("chatSearch").placeholder="Buscar conversa";renderServers();renderFriends();history.replaceState(null,"","chat.html");closeMobileSidebar()};
$("serverList").onclick=e=>{const b=e.target.closest("[data-server]");if(b)openServer(servers.find(s=>s.id===b.dataset.server))};
$("channelList").onclick=async e=>{const user=e.target.closest("[data-user]");if(user)return openDm(friends.find(p=>p.uid===user.dataset.user&&(p.conversationId||"")===user.dataset.conversation));const server=servers.find(s=>s.id===activeTarget?.serverId),removeMember=e.target.closest("[data-remove-member]");if(removeMember&&server?.ownerUid===me.uid){if(confirm("Remover este integrante do servidor?")){await updateDoc(doc(db,"servers",server.id),{members:arrayRemove(removeMember.dataset.removeMember),updatedAt:serverTimestamp()});toast("Integrante removido.");}return}const member=e.target.closest("[data-member]");if(member&&!removeMember)return location.assign(`profile.html?u=${encodeURIComponent(member.dataset.member)}`);const channel=e.target.closest("[data-channel]");if(channel){const snap=await getDoc(doc(db,"servers",server.id,"channels",channel.dataset.channel));return openChannel(server,{id:snap.id,...snap.data()})}if(e.target.closest("[data-new-channel]")){const raw=prompt("Nome do novo canal:");const name=raw?.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9-]/g,"-").replace(/-+/g,"-");if(name)await addDoc(collection(db,"servers",activeTarget.serverId,"channels"),{name:name.slice(0,30),createdAt:serverTimestamp()}).then(()=>openServer(servers.find(s=>s.id===activeTarget.serverId)))}};
function renderServerFriendChoices(){const wrap=$("serverFriendChoices");if(!wrap)return;const term=String($("serverFriendSearch")?.value||"").trim().toLowerCase(),selected=new Set([...wrap.querySelectorAll('input:checked')].map(input=>input.value)),rows=friends.filter(friend=>!term||`${friend.name||""} ${friend.username||""}`.toLowerCase().includes(term));wrap.innerHTML=rows.length?rows.map(friend=>`<label class="server-friend-option"><input type="checkbox" value="${esc(friend.uid)}" ${selected.has(friend.uid)?"checked":""}><span class="person-avatar">${avatar(friend)}</span><span><strong>${esc(friend.name||friend.username||"Gamer")}</strong><small>@${esc(friend.username||"gamer")}</small></span><i>Convidar</i></label>`).join(""):'<p class="server-no-friends">Nenhum amigo encontrado.</p>';updateServerFriendCount()}
function updateServerFriendCount(){const count=$("serverFriendChoices")?.querySelectorAll('input:checked').length||0;if($("serverFriendSelected"))$("serverFriendSelected").textContent=`${count} selecionado${count===1?"":"s"}`}
function openServerDialog(mode){serverDialogMode=mode;serverIconData="";const create=mode==="create";$("serverDialogTitle").textContent=create?"Crie seu servidor":"Entre em um servidor";$("serverDialogText").textContent=create?"Dê um nome, selecione seus amigos e comece. O resto pode ser configurado depois.":"Use um link ou código de convite.";$("serverNameLabel").hidden=!create;$("serverDescriptionLabel").hidden=!create;$("serverVisibilityLabel").hidden=!create;$("serverTagsLabel").hidden=!create;$("serverIconLabel").hidden=!create;$("serverFriendPickerWrap").hidden=!create;$("serverAdvanced").hidden=!create;$("serverCreateNote").hidden=!create;$("serverCodeLabel").hidden=create;$("serverDialogSubmit").textContent=create?"Criar servidor e começar":"Entrar no servidor";$("serverName").value="";$("serverDescription").value="";$("serverVisibility").value="private";$("serverTags").value="";$("serverIcon").value="";$("serverCode").value="";if($("serverFriendSearch"))$("serverFriendSearch").value="";if(create)renderServerFriendChoices();$("serverDialog").showModal();setTimeout(()=>$(create?"serverName":"serverCode").focus(),50)}
$("serverFriendSearch")?.addEventListener("input",renderServerFriendChoices);$("serverFriendChoices")?.addEventListener("change",updateServerFriendCount);
$("createServer").onclick=()=>openServerDialog("create");$("joinServer").onclick=()=>openServerDialog("join");$("messageList").onclick=e=>{if(e.target.closest("[data-welcome-create]"))return openServerDialog("create");if(e.target.closest("[data-welcome-join]"))return openServerDialog("join")};
$("serverIcon").onchange=async event=>{const file=event.target.files?.[0];if(!file)return;if(file.size>5*1024*1024){toast("Escolha uma imagem de até 5 MB.");event.target.value="";return}try{serverIconData=await new Promise((resolve,reject)=>{const image=new Image(),reader=new FileReader();reader.onerror=reject;reader.onload=()=>{image.onload=()=>{const canvas=document.createElement("canvas");canvas.width=canvas.height=160;const context=canvas.getContext("2d"),side=Math.min(image.width,image.height),x=(image.width-side)/2,y=(image.height-side)/2;context.drawImage(image,x,y,side,side,0,0,160,160);resolve(canvas.toDataURL("image/webp",.72))};image.onerror=reject;image.src=reader.result};reader.readAsDataURL(file)});toast("Imagem pronta.")}catch{serverIconData="";toast("Não foi possível processar a imagem.")}};
function inviteId(value){const raw=String(value||"").trim();try{const url=new URL(raw);return url.searchParams.get("invite")||url.searchParams.get("s")||""}catch{return raw.replace(/\s/g,"").split("/").pop().split("?").pop().replace(/^invite=/,"")}}
$("serverDialogSubmit").onclick=async()=>{const button=$("serverDialogSubmit");button.disabled=true;try{if(serverDialogMode==="create"){const name=$("serverName").value.trim(),description=$("serverDescription").value.trim();if(name.length<2){toast("Digite um nome com pelo menos 2 caracteres.");return}const selected=[...$("serverFriendChoices").querySelectorAll('input:checked')].map(input=>input.value).filter(uid=>uid!==me.uid),ref=doc(collection(db,"servers")),server={name:name.slice(0,40),description:description.slice(0,120),icon:serverIconData,visibility:$("serverVisibility").value==="public"?"public":"private",tags:$("serverTags").value.split(/[,#]+/).map(v=>v.trim().toLowerCase()).filter(Boolean).slice(0,5),ownerUid:me.uid,members:[me.uid],createdAt:serverTimestamp(),updatedAt:serverTimestamp()};await setDoc(ref,server);await addDoc(collection(db,"servers",ref.id,"channels"),{name:"geral",createdAt:serverTimestamp()});if(selected.length){for(const uid of selected){await createServerInvite(server.id||ref.id,uid);await addDoc(collection(db,"notifications"),{toUid:uid,fromUid:me.uid,type:"server_invite",title:`Convite para ${server.name}`,message:`${myProfile.name||"Um amigo"} convidou você para entrar no servidor.`,serverId:ref.id,special:true,read:false,createdAt:serverTimestamp()}).catch(()=>{})}}$("serverDialog").close();toast(selected.length?`Servidor criado. ${selected.length} convite(s) enviado(s).`:"Servidor criado. Adicione seus amigos quando quiser.");await openServer({id:ref.id,...server,members:[me.uid]})}else{const id=inviteId($("serverCode").value);if(!id){toast("Cole o link ou código do convite.");return}if(servers.some(item=>item.id===id)){$("serverDialog").close();toast("Você já está nesse servidor.");return}await updateDoc(doc(db,"servers",id),{members:arrayUnion(me.uid),updatedAt:serverTimestamp()});$("serverDialog").close();toast("Você entrou no servidor.")}}catch(error){console.error(error);toast(serverDialogMode==="create"?"Não foi possível criar o servidor.":"Convite inválido ou expirado.")}finally{button.disabled=false}};
function openServerAction(mode,title,text,content,submit="Confirmar"){const dialog=$("serverActionDialog");dialog.dataset.mode=mode;$("serverActionTitle").textContent=title;$("serverActionText").textContent=text;$("serverActionContent").innerHTML=content;$("serverActionSubmit").textContent=submit;$("serverActionSubmit").hidden=false;dialog.showModal()}
$("shareServer").onclick=()=>{const server=servers.find(item=>item.id===activeTarget?.serverId);if(!server)return;const inviteUrl=`${location.origin}${location.pathname.replace(/[^/]+$/,'')}chat.html?invite=${encodeURIComponent(server.id)}`;openServerAction("invite","Adicionar ou convidar pessoas",`Escolha amigos para ${server.name}. O link continua disponível como opção.`,`<div class="invite-pro-tools">${server.visibility==="public"?`<button type="button" data-copy-invite="${esc(inviteUrl)}">Copiar link do servidor público</button>`:"<span>Servidor privado: envie convites individuais para seus amigos. Links privados com token ainda não estão disponíveis.</span>"}</div><div class="invite-search"><input type="search" data-invite-search placeholder="Buscar amigo"></div><div class="invite-friend-list">${friends.map(friend=>`<label data-invite-friend="${esc(`${friend.name||""} ${friend.username||""}`.toLowerCase())}"><input type="checkbox" value="${esc(friend.uid)}"><span class="person-avatar">${avatar(friend)}</span><span><strong>${esc(friend.name||friend.username||"Gamer")}</strong><small>@${esc(friend.username||"gamer")}</small></span></label>`).join("")||"<p>Adicione amigos para poder convidá-los.</p>"}</div>`,"Enviar convites")};
async function createServerInvite(serverId,uid){
  await setDoc(doc(db,"serverInvites",`${serverId}_${uid}`),{serverId,toUid:uid,createdAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+7*86400000)});
}
$("serverActionSubmit").onclick=async()=>{const mode=$("serverActionDialog").dataset.mode,server=servers.find(item=>item.id===activeTarget?.serverId),button=$("serverActionSubmit");if(!server)return;if(mode!=="invite")return $("serverActionDialog").close();const selected=[...$("serverActionContent").querySelectorAll('.invite-friend-list input:checked')].map(input=>input.value).filter(uid=>uid!==me.uid&&!server.members?.includes(uid));if(!selected.length)return toast("Selecione pelo menos um amigo que ainda não esteja no servidor.");button.disabled=true;try{for(const uid of selected){await createServerInvite(server.id||ref.id,uid);await addDoc(collection(db,"notifications"),{toUid:uid,fromUid:me.uid,type:"server_invite",title:`Convite para ${server.name}`,message:`${myProfile.name||"Um amigo"} convidou você para entrar no servidor.`,serverId:server.id,special:true,read:false,createdAt:serverTimestamp()})}toast(`${selected.length} convite${selected.length===1?"":"s"} enviado${selected.length===1?"":"s"}.`);$("serverActionDialog").close()}catch(error){console.error(error);toast("Não foi possível enviar os convites.")}finally{button.disabled=false}};
$("leaveServer").onclick=async()=>{const server=servers.find(item=>item.id===activeTarget?.serverId);if(!server)return;if(server.ownerUid===me.uid){toast("O proprietário não pode sair antes de transferir a propriedade.");return}if(!confirm(`Sair de “${server.name}”? Você perderá acesso aos canais até ser convidado novamente.`))return;const button=$("leaveServer");button.disabled=true;try{await updateDoc(doc(db,"servers",server.id),{members:arrayRemove(me.uid),updatedAt:serverTimestamp()});unsubscribeMessages?.();clearInterval(messageFallbackTimer);$("directMessages").click();toast("Você saiu do servidor.")}catch(error){console.error(error);toast("Não foi possível sair do servidor.")}finally{button.disabled=false}};
$("deleteServer").onclick=async()=>{const server=servers.find(item=>item.id===activeTarget?.serverId);if(!server||server.ownerUid!==me.uid)return;if(!confirm(`Excluir o servidor “${server.name}”, seus canais e mensagens? Essa ação não pode ser desfeita.`))return;try{const channels=await getDocs(collection(db,"servers",server.id,"channels"));for(const channel of channels.docs){const messages=await getDocs(collection(db,"servers",server.id,"channels",channel.id,"messages"));for(const message of messages.docs)await deleteDoc(message.ref);await deleteDoc(channel.ref)}await deleteDoc(doc(db,"servers",server.id));activeMode="dm";activeTarget=null;activeMessagePath=null;unsubscribeMessages?.();clearInterval(messageFallbackTimer);$("directMessages").click();toast("Servidor excluído por completo.")}catch(error){console.error(error);toast("Não foi possível excluir todo o servidor.")}};
$("mobileSpaces").onclick=()=>$("chatShell").classList.toggle("show-spaces");$("chatShell").addEventListener("click",e=>{if(e.target===e.currentTarget)closeMobileSidebar()});
$("messageList").addEventListener("error",e=>{const img=e.target;if(!(img instanceof HTMLImageElement)||img.dataset.failed)return;img.dataset.failed="1";if(img.classList.contains("chat-sticker-image")){const label=img.alt&&img.alt!=="Figurinha"?img.alt:"";const node=document.createElement(/\p{L}/u.test(label)?"p":"span");if(node.tagName==="SPAN"){node.className="chat-sticker";node.setAttribute("role","img");node.setAttribute("aria-label","Figurinha")}node.textContent=label||"🙂";img.replaceWith(node)}else if(img.classList.contains("chat-media")){const node=document.createElement("span");node.className="chat-media-missing";node.textContent="Imagem indisponível";img.replaceWith(node)}},true);$("emojiPicker").innerHTML=emojis.map(x=>`<button type="button">${x}</button>`).join("");$("emojiButton").onclick=()=>$("emojiPicker").hidden=!$("emojiPicker").hidden;$("emojiPicker").onclick=e=>{const b=e.target.closest("button");if(b){$("messageInput").value+=b.textContent;$("emojiPicker").hidden=true;$("messageInput").dispatchEvent(new Event("input"));$("messageInput").focus()}};
function closeMediaPicker(){$("mediaPicker").hidden=true;$("mediaPicker").innerHTML=""}
function showPicker(html){$("mediaPicker").innerHTML=html;$("mediaPicker").hidden=false}
async function sendPayload(payload,preview,retry){
  if(!activeMessagePath)return;
  const ctx={mode:activeMode,target:activeTarget,path:[...activeMessagePath]},replyTo=retry?retry.replyTo:activeReply;
  const message={uid:me.uid,authorName:String(myProfile.name||myProfile.username||"Gamer").slice(0,60),authorUsername:myProfile.username||"",authorPhoto:myProfile.photoURL||"",authorVerified:myProfile.verification?.status==="active",authorAccountType:myProfile.accountType||"gamer",authorBadgeTheme:myProfile.verificationBadgeTheme||"blue",authorBadges:myProfile.badges||{},type:payload.type||"text",text:payload.text||"",mediaUrl:payload.mediaUrl||"",clientCreatedAt:Date.now(),createdAt:serverTimestamp(),...(replyTo?{replyTo:{...replyTo}}:{})};
  // a mensagem aparece na hora (o Firestore aplica a escrita local); o servidor confirma depois
  const clientId=retry?.id||crypto.randomUUID();
  const messageRef=doc(db,...ctx.path,"messages",clientId);
  message.clientId=clientId;
  if(retry){
    // Um timeout pode esconder uma gravação confirmada: consultar antes de reenviar.
    const existing=await getDocFromServer(messageRef);
    if(existing.exists()){removeFailed(clientId);repaintMessages();return}
  }
  const batch=writeBatch(db);batch.set(messageRef,message);
  if(ctx.mode==="dm")batch.update(doc(db,...ctx.path),{updatedAt:serverTimestamp(),lastMessage:"Nova mensagem",lastSenderUid:me.uid});
  const write=batch.commit();
  if(!retry)clearReply();
  try { await write; removeFailed(clientId); await afterSend(ctx,message,preview); }
  catch(error){
    saveFailed({id:clientId,path:ctx.path.join("/"),payload,preview,replyTo:replyTo||null,at:Date.now(),code:String(error?.code||"")});
    toast("Falha ao enviar. Use Tentar novamente na mensagem.");repaintMessages();throw error;
  }
}
async function afterSend(ctx,message,preview){
  try{if(ctx.mode==="dm"){const title=`${message.authorName} enviou uma mensagem`.slice(0,120);await setDoc(doc(db,"notifications",`msg_${message.clientId}`),{toUid:ctx.target.uid,fromUid:me.uid,type:"message",title,message:"Nova mensagem no Chat SG. Abra a conversa para ler.",conversationId:ctx.path[1],special:false,read:false,createdAt:serverTimestamp()})}else if(message.type==="text"){const usernames=[...message.text.matchAll(/@([a-z0-9_.-]{2,30})/gi)].map(match=>match[1].toLowerCase()),targets=mentionProfiles.filter(profile=>usernames.includes(String(profile.username||"").toLowerCase()));for(const target of targets){const privateProfile=target.visibility==="private";await addDoc(collection(db,"notifications"),{toUid:target.uid,fromUid:me.uid,type:privateProfile?"mention_request":"mention",title:privateProfile?`${message.authorName} quer mencionar você`:`${message.authorName} mencionou você`,message:privateProfile?"Seu perfil é privado. Abra o SG para decidir sobre a marcação.":message.text.slice(0,200),serverId:ctx.target?.serverId||"",special:true,read:false,createdAt:serverTimestamp()}).catch(error=>console.warn("mention notification",error))}}}catch(error){console.warn("pós-envio",error)}
}
function retryFailed(id){const f=loadFailed().find(x=>x.id===id);if(!f)return;if(!activeMessagePath||activeMessagePath.join("/")!==f.path)return;sendPayload(f.payload,f.preview||"",{id:f.id,replyTo:f.replyTo}).catch(()=>{})}
function gifGrid(items){return `<div class="gif-grid">${items.map(item=>{const url=typeof item==="string"?item:item.url;const title=typeof item==="string"?"GIF":item.title||"GIF";return `<button type="button" data-gif="${srcSeguro(url)}" aria-label="${esc(title)}"><img src="${srcSeguro(url)}" alt="${esc(title)}" loading="lazy"></button>`}).join("")||"<p>Nenhum GIF encontrado.</p>"}</div>`}
function cleanGifGrid(target){target?.querySelectorAll(".gif-grid img").forEach(img=>img.addEventListener("error",()=>{img.closest("button")?.remove();if(!target.querySelector(".gif-grid button"))target.innerHTML="<p>Nenhum GIF disponível agora.</p>"},{once:true}))}
function giphyLang(){const value=String(language||"pt-BR").toLowerCase();if(value.startsWith("pt"))return"pt";if(value.startsWith("es"))return"es";if(value.startsWith("fr"))return"fr";if(value.startsWith("de"))return"de";if(value.startsWith("it"))return"it";if(value.startsWith("ja"))return"ja";return"en"}
async function requestGifs(path,payload={}){if(!me)throw new Error("Faça login novamente.");const token=await me.getIdToken(),headers={Authorization:`Bearer ${token}`,"Content-Type":"application/json",...(await appCheckHeaders())};let response=await fetch(`${APP_CONFIG.steamApiBaseUrl}${path}`,{method:"POST",headers,body:JSON.stringify({...payload,lang:giphyLang()})}).catch(()=>null);if(!response?.ok){const query=payload.query||(path.endsWith("/trending")?"gaming trending":"");response=await fetch(`${APP_CONFIG.functionsBaseUrl}/searchGifs`,{method:"POST",headers,body:JSON.stringify({query})}).catch(()=>null)}const data=await response?.json().catch(()=>({}))||{};if(!response?.ok)throw new Error(data.error||"Configure GIPHY_API_KEY no Worker ou nas Functions.");return Array.isArray(data.gifs)?data.gifs:[]}
async function loadTrendingGifs(){const target=$("gifResults");if(!target)return;target.innerHTML='<p>Carregando GIFs...</p>';try{const found=await requestGifs("/giphy/trending");target.innerHTML=gifGrid(found);cleanGifGrid(target)}catch(error){console.error("GIPHY trending",error);target.innerHTML='<p>Não foi possível carregar os GIFs agora. Tente pesquisar novamente.</p>'}}
$("gifButton").onclick=()=>{showPicker(`<header><strong>GIFs da internet</strong><button type="button" data-close-picker>×</button></header><form class="gif-search" id="gifSearchForm"><input id="gifSearchInput" maxlength="50" placeholder="Pesquisar GIFs..."><button>Buscar</button></form><small class="gif-credit">Powered by GIPHY</small><div id="gifResults"><p>Carregando GIFs...</p></div>`);loadTrendingGifs()};
$("stickerButton").onclick=()=>{const all=[...stickers,...customStickers()];showPicker(`<header><strong>Figurinhas SG</strong><button type="button" data-close-picker>×</button></header><div class="sticker-create"><label for="customStickerInput">Criar figurinha</label><button type="button" data-create-sticker>Escolher imagem</button><input id="customStickerInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden><small>A imagem fica salva neste dispositivo e pode ser enviada no chat.</small></div><div class="sticker-grid">${all.map((item,index)=>`<button type="button" data-sticker="${index}" aria-label="${esc(item.label)}"><img src="${item.url}" alt="${esc(item.label)}"></button>`).join("")}</div>`)};
$("mediaButton").onclick=()=>{if(!canSendRichMedia())return toast("Em conversa direta, ative a Amizade Gamer para compartilhar fotos, vídeos e links.");showPicker(`<header><strong>${activeMode==="server"?"Compartilhar no servidor":"Compartilhar com Amigo Gamer"}</strong><button type="button" data-close-picker>×</button></header><div class="media-actions"><button type="button" data-photo><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2.6 9.6a2 2 0 0 1 2-2h1.9l1.5-2.2h8l1.5 2.2h1.9a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-14.8a2 2 0 0 1-2-2Z"/><circle cx="12" cy="13.6" r="3.3"/></svg> Enviar foto</button><button type="button" data-video><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M8.4 5.6 18.6 12 8.4 18.4Z"/></svg> Enviar vídeo</button><button type="button" data-link><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M10.4 13.6a3.8 3.8 0 0 0 5.7.4l2.4-2.4a3.8 3.8 0 0 0-5.4-5.4l-1.4 1.4"/><path d="M13.6 10.4a3.8 3.8 0 0 0-5.7-.4l-2.4 2.4a3.8 3.8 0 0 0 5.4 5.4l1.4-1.4"/></svg> Enviar link</button></div>`)};
$("mediaPicker").onclick=async event=>{if(event.target.closest("[data-close-picker]"))return closeMediaPicker();if(event.target.closest("[data-create-sticker]"))return $("customStickerInput")?.click();const gif=event.target.closest("[data-gif]"),sticker=event.target.closest("[data-sticker]");try{if(gif){gif.disabled=true;await sendPayload({type:"gif",mediaUrl:gif.dataset.gif},"Enviou um GIF");closeMediaPicker();toast("GIF enviado.")}if(sticker){const item=[...stickers,...customStickers()][Number(sticker.dataset.sticker)];await sendPayload({type:"sticker",text:item.label,mediaUrl:item.url},"Enviou uma figurinha");closeMediaPicker()}if(event.target.closest("[data-photo]")){showPicker(`<header><strong>Enviar foto</strong><button type="button" data-close-picker>×</button></header><div class="media-actions"><button type="button" data-photo-mode="normal"><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2.6 9.6a2 2 0 0 1 2-2h1.9l1.5-2.2h8l1.5 2.2h1.9a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-14.8a2 2 0 0 1-2-2Z"/><circle cx="12" cy="13.6" r="3.3"/></svg> Foto normal <small>fica salva na conversa e pode ser baixada</small></button></div>`);return}
if(event.target.closest("[data-photo-mode]")){pendingPhotoMode=event.target.closest("[data-photo-mode]").dataset.photoMode;$("photoInput").click();return}if(event.target.closest("[data-video]"))$("videoInput").click();if(event.target.closest("[data-link]")){const url=prompt("Cole o link HTTPS:")?.trim();if(url&&/^https:\/\//i.test(url)){await sendPayload({type:"text",mediaUrl:"",text:url},"Enviou um link");closeMediaPicker()}else if(url)toast("Use um link HTTPS válido.")}}catch(error){console.error(error);if(gif)gif.disabled=false;toast(error?.code==="permission-denied"?"As regras do Firestore recusaram o GIF. Publique as regras atuais.":error.message||"Não foi possível enviar.")}};
$("mediaPicker").addEventListener("change",async event=>{if(event.target.id!=="customStickerInput")return;const file=event.target.files?.[0];if(!file)return;if(file.size>700*1024)return toast("A figurinha deve ter no máximo 700 KB.");const reader=new FileReader();reader.onload=()=>{const label=(prompt("Dê um nome para a figurinha:","Minha figurinha")||"Minha figurinha").trim().slice(0,40),items=customStickers();items.unshift({label,url:String(reader.result)});localStorage.setItem("sgCustomStickers",JSON.stringify(items.slice(0,24)));toast("Figurinha criada.");$("stickerButton").click()};reader.onerror=()=>toast("Não foi possível ler a imagem.");reader.readAsDataURL(file)});
$("mediaPicker").addEventListener("submit",async event=>{if(event.target.id!=="gifSearchForm")return;event.preventDefault();const term=$("gifSearchInput").value.trim(),target=$("gifResults");if(!term)return;target.innerHTML='<p>Buscando GIFs...</p>';try{const found=await requestGifs("/giphy/search",{query:term});target.innerHTML=gifGrid(found);cleanGifGrid(target)}catch(error){console.error(error);target.innerHTML=`<p>${esc(error.message||"Não foi possível pesquisar GIFs agora.")}</p>`}});
async function uploadChatBlob(blob, prefix="arquivo") {
  if (!me || !activeMessagePath || !["dm","server"].includes(activeMode)) throw new Error("Selecione uma conversa para enviar mídia.");
  if (prefix !== "audio" && activeMode === "dm" && !isGamerFriend()&&!activeTarget?.marketChat) throw new Error("Ative a Amizade Gamer para enviar fotos, vídeos e links.");
  const limits = { audio: 8*1024*1024, foto: 8*1024*1024, video: APP_CONFIG.maxPostFileSize };
  const result = await uploadMedia(blob, { maxBytes: limits[prefix] || 8*1024*1024, label: prefix === "foto" ? "imagem" : prefix === "audio" ? "áudio" : prefix, scope: "private", conversation: activeMessagePath.join('/') });
  return result.url;
}
let pendingPhotoMode="normal";
$("photoInput").onchange=async event=>{const file=event.target.files?.[0];if(!file)return;const once=pendingPhotoMode==="once";pendingPhotoMode="normal";if(file.size>12*1024*1024){toast("Escolha uma foto de até 12 MB.");event.target.value="";return}try{toast(once?"Preparando foto de visualização única...":"Preparando foto...");const ready=await prepareImage(file,{maxDimension:1800,quality:.78,maxOutputBytes:5*1024*1024});const url=await uploadChatBlob(ready,"foto");await sendPayload({type:"image",mediaUrl:url,...(once?{viewOnce:true}:{})},once?"Enviou uma foto de visualização única":"Enviou uma foto");closeMediaPicker();toast(once?"Foto de visualização única enviada.":"Foto enviada.")}catch(error){console.error(error);toast(error.message||"Não foi possível processar a foto.")}finally{event.target.value=""}};
$("videoInput").onchange=async event=>{const file=event.target.files?.[0];if(!file)return;try{toast("Enviando vídeo...");const url=await uploadChatBlob(file,"video");await sendPayload({type:"video",mediaUrl:url},"Enviou um vídeo");closeMediaPicker();toast("Vídeo enviado.")}catch(error){console.error(error);toast(error.message||"Não foi possível enviar o vídeo.")}finally{event.target.value=""}};
$("chatSearch").oninput=e=>{searchTerm=e.target.value.trim().toLowerCase();if(activeMode==="dm")renderFriends();else openServer(servers.find(s=>s.id===activeTarget?.serverId))};
function resizeComposer(){const input=$("messageInput");input.style.height="auto";input.style.height=`${Math.min(input.scrollHeight,112)}px`;$("messageCounter").textContent=`${input.value.length}/1000`}
$("gamerFriendAction").onclick=async()=>{if(!activeTarget||activeMode!=="dm")return;const ref=doc(db,"friendships",pair(me.uid,activeTarget.uid)),pending=activeFriendship?.gamerStatus==="pending";try{if(pending&&activeFriendship.gamerRequestedBy!==me.uid){await updateDoc(ref,{gamerStatus:"accepted",gamerAcceptedBy:me.uid,gamerUpdatedAt:serverTimestamp()});toast("Agora vocês são Amigos Gamers!")}else if(!pending){await updateDoc(ref,{gamerStatus:"pending",gamerRequestedBy:me.uid,gamerAcceptedBy:"",gamerUpdatedAt:serverTimestamp()});await addDoc(collection(db,"notifications"),{toUid:activeTarget.uid,fromUid:me.uid,type:"gamer_friend",title:"Convite de Amizade Gamer",message:`${myProfile.name||"Seu amigo"} quer liberar fotos, vídeos e links com você.`,special:true,read:false,createdAt:serverTimestamp()});toast("Convite de Amizade Gamer enviado.")}const snap=await getDoc(ref);activeFriendship=snap.data();paintGamerFriend();setComposerEnabled(true);refreshCallAvailability()}catch(error){console.error(error);toast(error.code==="permission-denied"?"Publique as novas regras do Firestore.":"Não foi possível atualizar a Amizade Gamer.")}};
let voiceRecorder=null,voiceParts=[],voiceTimer=null,voiceTicker=null,voiceStartedAt=0,voiceCancelled=false;
function paintVoiceTime(){const elapsed=Math.floor((Date.now()-voiceStartedAt)/1000),m=Math.floor(elapsed/60),sec=elapsed%60;$("voiceRecordingTime").textContent=`${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`}
function resetVoiceUi(){clearTimeout(voiceTimer);clearInterval(voiceTicker);voiceTimer=voiceTicker=null;$("voiceRecordingBar").hidden=true;$("voiceButton").classList.remove("recording");$("voiceButton").innerHTML=icone("microfone");$("voiceRecordingTime").textContent="00:00"}
function recorderMime(){if(typeof MediaRecorder==="undefined")return"";const options=["audio/webm;codecs=opus","audio/ogg;codecs=opus","audio/mp4","audio/webm","audio/ogg"];return options.find(type=>MediaRecorder.isTypeSupported?.(type))||""}
async function startVoiceRecording(){if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined")return toast("Este navegador não oferece gravação de áudio. Atualize o navegador.");try{const callStream=getActiveCallAudioStream?.();const stream=callStream||await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1,sampleRate:{ideal:48000}}});voiceParts=[];voiceCancelled=false;const preferred=recorderMime();voiceRecorder=preferred?new MediaRecorder(stream,{mimeType:preferred,audioBitsPerSecond:96000}):new MediaRecorder(stream);voiceRecorder.ondataavailable=e=>{if(e.data?.size)voiceParts.push(e.data)};voiceRecorder.onerror=event=>{console.error("MediaRecorder",event.error||event);toast("A gravação de áudio foi interrompida.")};voiceRecorder.onstop=async()=>{stream.getTracks().forEach(track=>track.stop());const type=voiceRecorder?.mimeType||voiceParts[0]?.type||preferred||"audio/webm",blob=new Blob(voiceParts,{type});voiceRecorder=null;resetVoiceUi();if(voiceCancelled)return toast("Gravação cancelada.");if(!blob.size)return toast("Nenhum áudio foi gravado.");if(blob.size>8*1024*1024)return toast("O áudio ficou grande demais. Grave uma mensagem menor.");try{toast("Enviando mensagem de voz...");const url=await uploadChatBlob(blob,"audio");await sendPayload({type:"audio",mediaUrl:url},"Enviou uma mensagem de voz");toast("Áudio enviado.")}catch(error){console.error(error);toast(error.message||"Não foi possível enviar o áudio.")}};voiceRecorder.start(250);voiceStartedAt=Date.now();$("voiceRecordingBar").hidden=false;$("voiceButton").classList.add("recording");$("voiceButton").innerHTML=icone("parar");paintVoiceTime();voiceTicker=setInterval(paintVoiceTime,500);voiceTimer=setTimeout(()=>voiceRecorder?.state==="recording"&&voiceRecorder.stop(),120000)}catch(error){console.error(error);resetVoiceUi();toast(error?.name==="NotAllowedError"?"Permita o microfone para gravar áudio.":"Não foi possível iniciar o microfone.")}}
$("voiceButton").onclick=async()=>{if(voiceRecorder?.state==="recording"){voiceRecorder.stop();return}await startVoiceRecording()};
$("voiceCancel").onclick=()=>{if(voiceRecorder?.state!=="recording")return;voiceCancelled=true;voiceRecorder.stop()};
const mentionMenu=document.createElement("div");mentionMenu.id="mentionMenu";mentionMenu.className="mention-menu";mentionMenu.hidden=true;$("messageForm").append(mentionMenu);
function updateMentions(){resizeComposer();const input=$("messageInput"),before=input.value.slice(0,input.selectionStart),match=before.match(/(?:^|\s)@([\w.-]{0,30})$/);if(!match){mentionMenu.hidden=true;return}const term=match[1].toLowerCase(),choices=mentionProfiles.filter(profile=>`${profile.username||""} ${profile.name||""}`.toLowerCase().includes(term)).slice(0,8);mentionMenu.innerHTML=choices.map(profile=>`<button type="button" data-mention="${esc(profile.username||"gamer")}"><span class="person-avatar">${avatar(profile)}</span><span><strong>${esc(profile.name||profile.username||"Gamer")}</strong><small>@${esc(profile.username||"gamer")}${profile.visibility==="private"?" · pedir permissão":""}</small></span></button>`).join("")||"<p>Nenhum perfil público ou amigo encontrado.</p>";mentionMenu.hidden=false}
mentionMenu.addEventListener("click",event=>{const button=event.target.closest("[data-mention]");if(!button)return;const input=$("messageInput"),start=input.selectionStart,before=input.value.slice(0,start).replace(/@([\w.-]*)$/, `@${button.dataset.mention} `);input.value=before+input.value.slice(start);input.setSelectionRange(before.length,before.length);mentionMenu.hidden=true;resizeComposer();input.focus()});
$("messageInput").addEventListener("input",updateMentions);$("messageInput").addEventListener("keydown",e=>{if(e.key==="Escape")mentionMenu.hidden=true;if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){e.preventDefault();mentionMenu.hidden=true;$("messageForm").requestSubmit()}});
$("messageForm").onsubmit=async e=>{e.preventDefault();const input=$("messageInput"),raw=input.value.trim(),button=document.querySelector(".send-message");if(!activeMessagePath||!raw)return;let text;try{text=activeMode==="dm"?raw:await assertModeratedPublicText(raw,{field:"A mensagem",max:1000});if(text.length>1000)throw new Error("A mensagem deve ter até 1.000 caracteres.");if(/https?:\/\//i.test(text)&&activeMode==="dm"&&!isGamerFriend()&&!activeTarget?.marketChat)throw new Error("Links só podem ser enviados depois que os dois aceitarem a Amizade Gamer.")}catch(error){toast(error.message);return}input.value="";resizeComposer();button.classList.add("sending");input.focus();try{await sendPayload({type:"text",text,mediaUrl:""},text)}catch(error){toast(error.message||"Não foi possível enviar.");}finally{button.classList.remove("sending")}};
$("serverActionContent").addEventListener("input",event=>{if(!event.target.matches("[data-invite-search]"))return;const term=event.target.value.trim().toLowerCase();$("serverActionContent").querySelectorAll("[data-invite-friend]").forEach(label=>label.hidden=Boolean(term&&!label.dataset.inviteFriend.includes(term)))});
$("serverActionContent").addEventListener("click",async event=>{const copy=event.target.closest("[data-copy-invite]"),add=event.target.closest("[data-add-selected]");if(copy){await navigator.clipboard.writeText(copy.dataset.copyInvite).catch(()=>{});toast("Link de convite copiado.");return}},true);
$("messageList").addEventListener("click",event=>{const play=event.target.closest(".voice-note-play");if(!play)return;const note=play.closest(".voice-note"),audio=note.querySelector("audio"),progress=note.querySelector(".voice-note-progress i"),time=note.querySelector(".voice-note-time");if(!audio)return;if(audio.paused){document.querySelectorAll(".voice-note audio").forEach(other=>{if(other!==audio){other.pause();const b=other.closest(".voice-note")?.querySelector(".voice-note-play");if(b)b.textContent="▶"}});audio.play().catch(()=>toast("Não foi possível reproduzir o áudio."));play.textContent="❚❚"}else{audio.pause();play.textContent="▶"}audio.ontimeupdate=()=>{const ratio=audio.duration?audio.currentTime/audio.duration:0;progress.style.width=`${Math.round(ratio*100)}%`;const total=Math.floor(audio.currentTime||0);time.textContent=`${Math.floor(total/60)}:${String(total%60).padStart(2,"0")}`};audio.onended=()=>{play.textContent="▶";progress.style.width="0%"}},true);
auth.onAuthStateChanged(async user=>{if(!user)return location.replace("login.html");me=user;myProfile=(await getDoc(doc(db,"publicProfiles",user.uid))).data()||{name:"Gamer",username:"gamer",photoURL:""};watchPreferences();initCalls({getPeer:()=>activeMode==="dm"?activeTarget:null,canCall:()=>isGamerFriend(),notify:toast});$("myAvatar").innerHTML=avatar(myProfile);$("myName").textContent=myProfile.name||"Gamer";$("myUsername").textContent=`@${myProfile.username||"gamer"} · sua conta`;const invitation=new URLSearchParams(location.search).get("invite");if(invitation){let joined=false;if(confirm("Deseja entrar neste servidor do Something Gamer?")){try{await updateDoc(doc(db,"servers",invitation),{members:arrayUnion(user.uid),updatedAt:serverTimestamp()});toast("Você entrou no servidor.");joined=true}catch(error){console.warn("invite join",error);toast("Não foi possível entrar. Servidores privados exigem convite individual válido.")}}history.replaceState(null,"",joined?`chat.html?s=${encodeURIComponent(invitation)}`:"chat.html")}await loadFriends();
  unsubscribeInbox?.();unsubscribeInbox=onSnapshot(query(collection(db,"conversations"),where("members","array-contains",me.uid),orderBy("updatedAt","desc"),limit(100)),async snap=>{conversationActivity=new Map(snap.docs.map(d=>[d.id,d.data()]));await refreshMarketContacts(snap);if(activeMode==="dm")renderFriends()},()=>{});
  await loadMentionProfiles();watchServers();if(new URLSearchParams(location.search).get("new")==="server")setTimeout(()=>openServerDialog("create"),120)});

// Respostas, edição e exclusão segura (v40).
function messageMillis(m){return m.createdAt?.toMillis?.()||m.clientCreatedAt||0}
function replyLabel(m){if(m.deleted)return"Mensagem apagada";if(m.type==="image")return"Foto";if(m.type==="video")return"Vídeo";if(m.type==="audio")return"Áudio";if(m.type==="gif")return"GIF";if(m.type==="sticker")return"Figurinha";return String(m.text||"Mensagem").slice(0,100)}
function chooseReply(id){const m=messageRecords.get(id);if(!m||m.deleted)return;activeReply={id,authorName:m.uid===me.uid?"Você":m.authorName||"Gamer",text:replyLabel(m)};$("replyComposerTitle").textContent=`Respondendo a ${activeReply.authorName}`;$("replyComposerText").textContent=activeReply.text;$("replyComposer").hidden=false;$("messageInput").focus()}
function clearReply(){activeReply=null;$("replyComposer").hidden=true}
$("cancelReply").onclick=clearReply;
function openMessageActionsBase(row){const m=messageRecords.get(row.dataset.message);if(!m||m.deleted)return;const own=m.uid===me.uid,age=Date.now()-messageMillis(m),edit=own&&m.type==="text"&&age<=120000,remove=own&&age<=300000;$("messageActionTitle").textContent="Opções da mensagem";$("messageActionText").textContent=own?(remove?"Você pode editar por 2 minutos e apagar por 5 minutos.":"O prazo para alterar esta mensagem terminou."):"Responda ou denuncie esta mensagem.";$("messageActionContent").innerHTML=`<div class="message-actions"><button type="button" data-msg-action="reply"><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9 6.6 3.8 12 9 17.4"/><path d="M3.8 12h9.6a6.4 6.4 0 0 1 6.4 6.4v1"/></svg> Responder</button>${edit?'<button type="button" data-msg-action="edit"><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M16.4 3.9a2.2 2.2 0 0 1 3.1 3.1L8.1 18.4l-4.1 1 1-4.1Z"/><path d="M14.8 5.5 18 8.7"/></svg> Editar</button>':""}${remove?'<button type="button" data-msg-action="delete"><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 6.4h16M9.6 6.4V4.8a1.3 1.3 0 0 1 1.3-1.3h2.2a1.3 1.3 0 0 1 1.3 1.3v1.6"/><path d="M6.4 6.4 7.3 19a1.6 1.6 0 0 0 1.6 1.5h6.2a1.6 1.6 0 0 0 1.6-1.5l.9-12.6"/><path d="M10.4 10.4v6.2M13.6 10.4v6.2"/></svg> Apagar para todos</button>':""}${!own?'<button type="button" data-msg-action="report"><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 20.6V3.8M5 4.6h10.6l-1.6 3.2 1.6 3.2H5"/></svg> Denunciar</button>':""}</div>`;$("messageActionDialog").dataset.message=row.dataset.message;$("messageActionDialog").showModal()}
$("messageActionContent").onclick=async event=>{const action=event.target.closest("[data-msg-action]")?.dataset.msgAction,id=$("messageActionDialog").dataset.message,m=messageRecords.get(id);if(!action||!m)return;if(action==="reply"){chooseReply(id);$("messageActionDialog").close()}if(action==="edit"){$("messageActionTitle").textContent="Editar mensagem";$("messageActionText").textContent="Disponível por até 2 minutos após o envio.";$("messageActionContent").innerHTML=`<div class="message-edit"><textarea id="editMessageText" maxlength="1000">${esc(m.text||"")}</textarea><button type="button" data-msg-action="save-edit">Salvar edição</button></div>`}if(action==="save-edit"){const text=$("editMessageText").value.trim();if(!text)return toast("A mensagem não pode ficar vazia.");try{await updateDoc(doc(db,...activeMessagePath,"messages",id),{text,edited:true,editedAt:serverTimestamp()});$("messageActionDialog").close();toast("Mensagem editada.")}catch{toast("O prazo de 2 minutos terminou.")}}if(action==="delete"){try{await updateDoc(doc(db,...activeMessagePath,"messages",id),{deleted:true,deletedAt:serverTimestamp(),text:"",mediaUrl:""});$("messageActionDialog").close();toast("Mensagem apagada para todos.")}catch{toast("O prazo de 5 minutos terminou.")}}if(action==="report"){try{await openSafetyReport({targetType:"chat_message",targetId:id,targetUid:m.uid,contentPath:[...activeMessagePath,"messages",id].join("/"),context:"Denúncia de uma mensagem do chat."});$("messageActionDialog").close();toast("Denúncia enviada.")}catch(error){toast(error.message||"Não foi possível denunciar.")}}};
let pressTimer=null,startX=0,startY=0,swipeRow=null;
$("messageList").addEventListener("pointerdown",e=>{const row=e.target.closest(".message");if(!row)return;swipeRow=row;startX=e.clientX;startY=e.clientY;pressTimer=setTimeout(()=>openMessageActions(row),520)});
$("messageList").addEventListener("pointermove",e=>{if(!swipeRow)return;const dx=Math.max(0,Math.min(82,e.clientX-startX)),dy=Math.abs(e.clientY-startY);if(dy>18){clearTimeout(pressTimer);return}if(dx>8){clearTimeout(pressTimer);swipeRow.classList.add("swiping");swipeRow.style.transform=`translateX(${dx}px)`}});
function finishSwipe(e){clearTimeout(pressTimer);if(!swipeRow)return;const dx=e.clientX-startX;swipeRow.style.transform="";swipeRow.classList.remove("swiping");if(dx>58)chooseReply(swipeRow.dataset.message);swipeRow=null}
$("messageList").addEventListener("pointerup",finishSwipe);$("messageList").addEventListener("pointercancel",e=>{clearTimeout(pressTimer);if(swipeRow){swipeRow.style.transform="";swipeRow.classList.remove("swiping")}swipeRow=null});
$("messageList").addEventListener("contextmenu",e=>{const row=e.target.closest(".message");if(row){e.preventDefault();openMessageActions(row)}});
$("messageList").addEventListener("click",e=>{const ref=e.target.closest("[data-reply-ref]");if(ref){const target=$("messageList").querySelector(`[data-message="${CSS.escape(ref.dataset.replyRef)}"]`);target?.scrollIntoView({behavior:"smooth",block:"center"})}},true);

// ---------- V58: fila/retry, paginação, digitando, teclado no celular ----------
$("messageList").addEventListener("click",event=>{
  const retry=event.target.closest("[data-retry]"),discard=event.target.closest("[data-discard]"),older=event.target.closest("[data-load-older]");
  if(retry){retryFailed(retry.dataset.retry);return}
  if(discard){removeFailed(discard.dataset.discard);repaintMessages();return}
  if(older)loadOlderMessages()
});
function mergeHistory(snap){
  const map=new Map(olderDocs);for(const d of snap.docs)map.set(d.id,d);
  const docs=[...map.values()].sort((a,b)=>((a.data().createdAt?.toMillis?.()||a.data().clientCreatedAt||0)-(b.data().createdAt?.toMillis?.()||b.data().clientCreatedAt||0))||a.id.localeCompare(b.id));
  lastSnap={docs,size:docs.length,metadata:snap.metadata,docChanges:()=>snap.docChanges()};renderMessages(lastSnap);
}
async function loadOlderMessages(){
  const list=$("messageList");if(loadingOlder||!lastSnap||!activeMessagePath||!hasOlder)return;
  loadingOlder=true;const generation=streamGeneration,first=lastSnap.docs[0];if(!first){loadingOlder=false;return}
  olderRestore={h:list.scrollHeight,t:list.scrollTop,prevSize:lastSnap.size};
  try{const snap=await getDocs(query(collection(db,...activeMessagePath,"messages"),orderBy("createdAt","asc"),endBefore(first),limitToLast(50)));
    if(generation!==streamGeneration)return;hasOlder=snap.size===50;for(const d of snap.docs)olderDocs.set(d.id,d);lastMessageSig=null;mergeHistory(liveSnap);
  }catch{toast("Não foi possível carregar o histórico. Tente novamente.");olderRestore=null}
  finally{if(generation===streamGeneration)loadingOlder=false}
}
$("messageList").addEventListener("scroll",()=>{if($("messageList").scrollTop<60)loadOlderMessages()},{passive:true});
$("messageInput").addEventListener("input",()=>{
  if(localStorage.getItem("sgChatTypingConsent")!=="1"||activeMode!=="dm"||!activeMessagePath||!$("messageInput").value.trim()||Date.now()-lastTypingWrite<5000)return;
  lastTypingWrite=Date.now();
  updateDoc(doc(db,...activeMessagePath),{["typing."+me.uid]:serverTimestamp()}).catch(()=>{})
});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&lastSnap){lastMessageSig=null;renderMessages(lastSnap)}});
addEventListener("online",()=>{repaintMessages();toast("Conexão restabelecida. Enviando o que ficou na fila…")});
addEventListener("offline",()=>{repaintMessages();toast("Sem conexão. As mensagens ficam na fila e são enviadas ao reconectar.")});
if(window.visualViewport){
  const fit=()=>{document.documentElement.style.setProperty("--sg-vh",`${Math.round(window.visualViewport.height)}px`);if(document.activeElement===$("messageInput")){const l=$("messageList");l.scrollTop=l.scrollHeight}};
  visualViewport.addEventListener("resize",fit);visualViewport.addEventListener("scroll",fit);fit()
}

// ---------- V58.1: reações, copiar, encaminhar, salvar, busca, velocidade do áudio ----------
function openMessageActions(row){
  openMessageActionsBase(row);
  const m=messageRecords.get(row.dataset.message);if(!m||m.deleted)return;
  const box=$("messageActionContent").querySelector(".message-actions");if(!box)return;
  const id=row.dataset.message;
  box.insertAdjacentHTML("beforebegin",`<div class="reaction-picker">${["👍","❤️","😂","😮","😢","🔥"].map(e=>`<button type="button" data-msg-react="${e}" aria-label="Reagir com ${e}">${e}</button>`).join("")}</div>`);
  box.insertAdjacentHTML("beforeend",`<button type="button" data-msg-action2="hide">Apagar só para mim</button><button type="button" data-msg-action2="copy">Copiar</button><button type="button" data-msg-action2="forward">Encaminhar</button><button type="button" data-msg-action2="save">${isSaved(id)?"Remover dos salvos":"Salvar"}</button>`)
}
async function toggleReaction(id,emoji){
  const m=messageRecords.get(id);if(!m||!activeMessagePath)return;
  try{await updateDoc(doc(db,...activeMessagePath,"messages",id),{["reactions."+me.uid]:m.reactions?.[me.uid]===emoji?deleteField():emoji})}
  catch(error){console.error(error);toast("Não foi possível reagir.")}
}
function toggleSaved(id,m){
  let list=loadSaved();
  if(list.some(x=>x.id===id)){list=list.filter(x=>x.id!==id);toast("Removida dos salvos.")}
  else{list.push({id,path:activeMessagePath.join("/"),text:m.text||"",type:m.type,mediaUrl:m.mediaUrl||"",author:m.authorName||"",at:Date.now()});toast("Mensagem salva neste aparelho.")}
  try{localStorage.setItem(savedKey(),JSON.stringify(list.slice(-200)))}catch{}
  repaintMessages()
}
async function forwardTo(uid,m){
  if (String(m.mediaUrl || '').includes('/private-media/')) return toast('Arquivos privados pertencem à conversa original. Envie um novo arquivo na outra conversa.');
  const cid=pair(me.uid,uid),friend=friends.find(x=>x.uid===uid);
  try{
    await setDoc(doc(db,"conversations",cid),{members:[me.uid,uid].sort(),updatedAt:serverTimestamp()},{merge:true});
    await addDoc(collection(db,"conversations",cid,"messages"),{
      uid:me.uid,authorName:String(myProfile.name||myProfile.username||"Gamer").slice(0,60),authorUsername:myProfile.username||"",authorPhoto:myProfile.photoURL||"",
      authorVerified:myProfile.verification?.status==="active",authorAccountType:myProfile.accountType||"gamer",authorBadgeTheme:myProfile.verificationBadgeTheme||"blue",authorBadges:myProfile.badges||{},
      type:m.type,text:m.type==="text"?`↪ ${m.text}`.slice(0,1000):(m.text||""),mediaUrl:m.mediaUrl||"",clientCreatedAt:Date.now(),createdAt:serverTimestamp()
    });
    toast(`Encaminhada para ${friend?.name||"seu amigo"}.`)
  }catch(error){console.error(error);toast("Não foi possível encaminhar essa mensagem.")}
}
$("messageActionContent").addEventListener("click",async event=>{
  const id=$("messageActionDialog").dataset.message,m=messageRecords.get(id);if(!m)return;
  const react=event.target.closest("[data-msg-react]"),act=event.target.closest("[data-msg-action2]"),fwd=event.target.closest("[data-forward-to]");
  if(react){$("messageActionDialog").close();toggleReaction(id,react.dataset.msgReact);return}
  if(fwd){$("messageActionDialog").close();await forwardTo(fwd.dataset.forwardTo,m);return}
  if(!act)return;
  const kind=act.dataset.msgAction2;
  if(kind==="hide"){try{const prefs=currentPreferences();await savePreferences({hiddenIds:[...new Set([...prefs.hiddenIds,id])].slice(-1000)});$("messageActionDialog").close();repaintMessages();toast("Mensagem ocultada só para sua conta.");}catch(error){toast(error.message);}return;}
  if(kind==="copy"){await navigator.clipboard.writeText(m.type==="text"?m.text:(m.mediaUrl||m.text||"")).then(()=>toast("Copiado.")).catch(()=>toast("Não foi possível copiar."));$("messageActionDialog").close()}
  if(kind==="save"){$("messageActionDialog").close();toggleSaved(id,m)}
  if(kind==="forward"){
    $("messageActionTitle").textContent="Encaminhar para…";$("messageActionText").textContent="Escolha um amigo.";
    $("messageActionContent").innerHTML=`<div class="message-actions">${friends.slice(0,40).map(f=>`<button type="button" data-forward-to="${esc(f.uid)}">${esc(f.name||f.username||"Amigo")}</button>`).join("")||"<p>Você ainda não tem amigos para encaminhar.</p>"}</div>`
  }
});
$("messageList").addEventListener("click",async event=>{
  const once=event.target.closest("[data-view-once]");
  if(once){
    const row=once.closest("[data-message]"),id=row?.dataset.message,m=id?messageRecords.get(id):null;
    openViewOnce(once.dataset.viewOnce);
    if(m&&activeMessagePath&&!(m.viewOnceOpenedBy||[]).includes(me.uid)){
      try{await updateDoc(doc(db,...activeMessagePath,"messages",id),{viewOnceOpenedBy:arrayUnion(me.uid),...(m.uid!==me.uid?{viewOnceExpired:true}:{})})}
      catch(error){console.warn("view-once",error)}
    }
    return
  }
  const chip=event.target.closest("[data-react]");
  if(chip){toggleReaction(chip.dataset.reactId,chip.dataset.react);return}
  const speed=event.target.closest(".voice-note-speed");
  if(speed){const audio=speed.closest(".voice-note")?.querySelector("audio");if(!audio)return;const next={"1x":1.5,"1.5x":2,"2x":1}[speed.textContent]??1;audio.playbackRate=next;speed.textContent=next===1?"1x":`${next}x`;return}
  const bar=event.target.closest(".voice-note-progress");
  if(bar){const audio=bar.closest(".voice-note")?.querySelector("audio");if(audio?.duration){const r=bar.getBoundingClientRect();audio.currentTime=Math.max(0,Math.min(1,(event.clientX-r.left)/r.width))*audio.duration}}
});

// busca dentro da conversa (nas mensagens já carregadas) e filtro de salvas
const chatFilter={text:"",saved:false};
function applySearchFilter(){
  const rows=document.querySelectorAll("#messageList .message");
  const term=chatFilter.text.trim().toLowerCase(),savedIds=new Set(loadSaved().map(x=>x.id));
  let shown=0;
  rows.forEach(row=>{
    const hide=Boolean((term&&!row.textContent.toLowerCase().includes(term))||(chatFilter.saved&&!savedIds.has(row.dataset.message)));
    row.classList.toggle("search-hidden",hide);if(!hide)shown++
  });
  const count=document.querySelector("#chatSearchBar [data-count]");
  if(count)count.textContent=(term||chatFilter.saved)?`${shown} resultado${shown===1?"":"s"}`:""
}
(function installChatSearch(){
  const header=$("chatHeader")?.parentElement;if(!header||$("chatSearchToggle"))return;
  const toggle=document.createElement("button");toggle.type="button";toggle.id="chatSearchToggle";toggle.className="chat-search-toggle";toggle.setAttribute("aria-label","Buscar na conversa");toggle.textContent="🔎";
  const bar=document.createElement("div");bar.id="chatSearchBar";bar.hidden=true;
  bar.innerHTML='<input type="search" placeholder="Buscar nesta conversa" aria-label="Buscar nesta conversa" autocomplete="off"><button type="button" data-saved-filter aria-pressed="false">⭐ Salvas</button><span data-count></span>';
  header.append(toggle,bar);
  toggle.onclick=()=>{bar.hidden=!bar.hidden;if(!bar.hidden)bar.querySelector("input").focus();else{chatFilter.text="";chatFilter.saved=false;bar.querySelector("input").value="";applySearchFilter()}};
  bar.querySelector("input").addEventListener("input",e=>{chatFilter.text=e.target.value;applySearchFilter()});
  bar.querySelector("[data-saved-filter]").onclick=e=>{chatFilter.saved=!chatFilter.saved;e.currentTarget.setAttribute("aria-pressed",String(chatFilter.saved));applySearchFilter()}
})();

// ---------- Visualização única: visor de tela cheia (sem baixar/copiar/print) ----------
function openViewOnce(url){
  let box=document.getElementById("viewOnceOverlay");
  if(!box){
    box=document.createElement("div");box.id="viewOnceOverlay";box.className="view-once-overlay";box.setAttribute("role","dialog");box.setAttribute("aria-modal","true");
    box.innerHTML=`<button type="button" class="view-once-close" aria-label="Fechar">×</button><img alt="Foto de visualização única" draggable="false"><p>Esta foto some depois de fechada. Capturas de tela não são impedidas pelo navegador — combine com quem confia.</p>`;
    document.body.append(box);
    box.addEventListener("click",e=>{if(e.target===box||e.target.closest(".view-once-close"))closeViewOnce()});
    box.addEventListener("contextmenu",e=>e.preventDefault());
    box.querySelector("img").addEventListener("dragstart",e=>e.preventDefault());
  }
  box.querySelector("img").src=url;box.classList.add("open");document.documentElement.style.overflow="hidden"
}
function closeViewOnce(){const box=document.getElementById("viewOnceOverlay");if(!box)return;box.classList.remove("open");box.querySelector("img").src="";document.documentElement.style.overflow=""}

const blockButton=document.createElement("button");blockButton.type="button";blockButton.className="chat-block-button";blockButton.textContent="Bloquear pessoa";blockButton.setAttribute("aria-label","Bloquear pessoa desta conversa");blockButton.hidden=true;document.querySelector(".discord-chat>header").append(blockButton);
blockButton.addEventListener("click",async()=>{
 if(activeMode!=="dm"||!activeTarget)return toast("Abra uma conversa direta para bloquear alguém.");
 if(!confirm("Bloquear esta pessoa? Novas mensagens e chamadas serão impedidas."))return;
 try{await hangupCall();await setDoc(doc(db,"users",me.uid,"blocks",activeTarget.uid),{createdAt:serverTimestamp()});unsubscribeMessages?.();unsubscribeConvo?.();activeMessagePath=null;setComposerEnabled(false);$("messageList").textContent="Pessoa bloqueada. Gerencie bloqueios em Configurações.";toast("Pessoa bloqueada.")}
 catch{toast("Não foi possível bloquear agora.")}
});
addEventListener("pagehide",()=>{unsubscribeMessages?.();unsubscribeConvo?.();unsubscribeServers?.();unsubscribeInbox?.();clearInterval(messageFallbackTimer)});

async function hydratePrivateMedia(root){
 for(const node of root.querySelectorAll('[data-private-src]')){
  try{const url=await resolvePrivateMedia(node.dataset.privateSrc);if(!node.isConnected){URL.revokeObjectURL(url);continue;}node.src=url;node.parentElement.querySelector('small').textContent='Arquivo privado · expira após 30 dias';}
  catch(error){if(node.isConnected)node.parentElement.querySelector('small').textContent=error.message;}
 }
}

function preferenceId(path=activeMessagePath){return path?path.length===2?path[1]:`server_${path[1]}_${path[3]}`:'';}
function currentPreferences(){return {muted:false,archived:false,hiddenIds:[],...(chatPreferences.get(preferenceId())||{})};}
async function savePreferences(patch){if(!activeMessagePath||!me)throw new Error('Selecione uma conversa.');const value={...currentPreferences(),...patch,path:activeMessagePath.join('/'),updatedAt:serverTimestamp()};await setDoc(doc(db,'users',me.uid,'chatPreferences',preferenceId()),value);chatPreferences.set(preferenceId(),value);paintPreferenceControls(true);if(activeMode==="dm")renderFriends();}
function watchPreferences(){unsubscribePreferences?.();unsubscribePreferences=onSnapshot(collection(db,'users',me.uid,'chatPreferences'),snap=>{chatPreferences.clear();for(const d of snap.docs)chatPreferences.set(d.id,d.data());if(activeMode==="dm")renderFriends();paintPreferenceControls(Boolean(activeMessagePath));repaintMessages();},()=>toast('As preferências não puderam ser sincronizadas.'));}
function paintPreferenceControls(enabled){const root=document.querySelector(".chat-preference-tools");if(root)root.hidden=!enabled;const prefs=currentPreferences();document.querySelectorAll('[data-chat-pref]').forEach(b=>{b.hidden=!enabled;b.disabled=!enabled;});const mute=document.querySelector('[data-chat-pref="mute"]'),archive=document.querySelector('[data-chat-pref="archive"]');if(mute)mute.textContent=prefs.muted?'Reativar avisos':'Silenciar avisos';if(archive)archive.textContent=prefs.archived?'Desarquivar':'Arquivar';}
const preferenceTools=document.createElement('details');preferenceTools.className='chat-preference-tools';preferenceTools.hidden=true;preferenceTools.innerHTML='<summary>Conversa</summary><button type="button" data-chat-pref="mute" hidden>Silenciar avisos</button><button type="button" data-chat-pref="archive" hidden>Arquivar</button><button type="button" data-chat-pref="export" hidden>Exportar mensagens carregadas</button>';document.querySelector('.discord-chat>header').append(preferenceTools);
preferenceTools.addEventListener('click',async event=>{const action=event.target.closest('[data-chat-pref]')?.dataset.chatPref;if(!action)return;try{if(action==='mute')await savePreferences({muted:!currentPreferences().muted});if(action==='archive')await savePreferences({archived:!currentPreferences().archived});if(action==='export'){const messages=(lastSnap?.docs||[]).filter(d=>!currentPreferences().hiddenIds.includes(d.id)).map(d=>({id:d.id,...d.data()}));const url=URL.createObjectURL(new Blob([JSON.stringify({scope:'Mensagens carregadas nesta conversa; arquivos binários não incluídos.',exportedAt:new Date().toISOString(),messages},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='chat-sg.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}catch(error){toast(error.message);}});
const archivedSwitch=document.createElement('button');archivedSwitch.type='button';archivedSwitch.className='chat-archived-switch';archivedSwitch.textContent='Ver arquivadas';document.querySelector('.discord-sidebar>header').append(archivedSwitch);archivedSwitch.onclick=()=>{showArchived=!showArchived;archivedSwitch.textContent=showArchived?'Ver conversas':'Ver arquivadas';$('directMessages').click();renderFriends();};
addEventListener('pagehide',()=>unsubscribePreferences?.());

async function refreshMarketContacts(snap){
 const rooms=snap.docs.filter(d=>d.data().kind==='market');friends=friends.filter(p=>!p.marketChat);
 for(const d of rooms){const data=d.data(),uid=data.members.find(id=>id!==me.uid);if(!uid)continue;let profile={};try{profile=(await getDoc(doc(db,'publicProfiles',uid))).data()||{};}catch{}friends.push({...profile,uid,name:profile.name||'Contato do Market',conversationId:d.id,marketChat:true,marketProductId:data.marketProductId});}
 const requested=new URLSearchParams(location.search).get('conversation');if(requested&&activeMessagePath?.[1]!==requested){const friend=friends.find(p=>p.conversationId===requested);if(friend)await openDm(friend);}
}
$('messageList').addEventListener('click',async event=>{const button=event.target.closest('[data-market-offer]');if(!button)return;try{const out=await api('/market/offers/list'),offer=out.offers.find(x=>x.id===button.dataset.marketOffer);if(!offer)return toast('Proposta indisponível.');const dialog=document.createElement('dialog');dialog.className='market-product-dialog';dialog.innerHTML=`<h2>${esc(offer.title)}</h2><p>Preço combinado: R$ ${(offer.amount_cents/100).toFixed(2).replace('.',',')} por unidade · ${offer.quantity} unidade(s)</p><p>Estado atual: ${esc(offer.state)}</p><p>Válida até ${new Date(offer.expires_at).toLocaleString('pt-BR')}</p>${['proposed','countered'].includes(offer.state)&&offer.last_actor!==me.uid?'<button type="button" data-respond="accepted">Aceitar</button><button type="button" data-respond="countered">Contraproposta</button><button type="button" data-respond="rejected">Recusar</button>':''}<a href="marketplace.html#pedidos">Ver negociação e pagar na plataforma</a><button type="button" data-close>Fechar</button>`;document.body.append(dialog);dialog.showModal();dialog.addEventListener('close',()=>dialog.remove());dialog.addEventListener('click',async e=>{if(e.target.closest('[data-close]'))dialog.close();const action=e.target.closest('[data-respond]');if(action){try{let amountCents;if(action.dataset.respond==='countered'){const raw=prompt('Novo preço por unidade (R$):');if(raw===null)return;amountCents=Math.round(Number(raw.replace(',','.'))*100);}await api('/market/offers/respond',{id:offer.id,decision:action.dataset.respond,amountCents});dialog.close();toast('Resposta registrada no Market.');}catch(error){toast(error.message);}}});}catch(error){toast(error.message);}});

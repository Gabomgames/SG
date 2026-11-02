import "./professional-ui.js";
import { auth, db } from "./firebase.js";
import { srcSeguro } from "./seguranca-web.js";
import { signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { installSanctionGate } from "./sanction-gate.js";
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

export const defaults={theme:"default",logo:"color",density:"comfortable",motion:"full",incomingBubble:"#17345f",outgoingBubble:"#1565b8"};
const escapeHtml=value=>{const node=document.createElement("div");node.textContent=value??"";return node.innerHTML};
const nested=()=>location.pathname.includes("/Games/")||location.pathname.includes("/Onboarding/");
export function getAppearance(){try{return {...defaults,...JSON.parse(localStorage.getItem("sgAppearance")||"{}")};}catch{return {...defaults}}}
function readableText(hex){const c=String(hex||"").replace("#","");if(!/^[0-9a-f]{6}$/i.test(c))return"#fff";const [r,g,b]=[0,2,4].map(i=>parseInt(c.slice(i,i+2),16));return ((r*299+g*587+b*114)/1000)>155?"#10131a":"#fff"}
export function applyAppearance(value=getAppearance()){const root=document.documentElement;root.dataset.theme=value.theme;root.dataset.logo=value.logo;root.dataset.density=value.density;root.dataset.motion=value.motion;root.style.setProperty("--chat-incoming",value.incomingBubble);root.style.setProperty("--chat-outgoing",value.outgoingBubble);root.style.setProperty("--chat-incoming-text",readableText(value.incomingBubble));root.style.setProperty("--chat-outgoing-text",readableText(value.outgoingBubble));const logoPath=nested()?"../assets/logo.png?v=31":"assets/logo.png?v=31";document.querySelectorAll('link[rel="icon"],link[rel="apple-touch-icon"]').forEach(link=>link.href=logoPath)}
export function saveAppearance(value){localStorage.setItem("sgAppearance",JSON.stringify({...defaults,...value}));applyAppearance({...defaults,...value});window.dispatchEvent(new CustomEvent("sgappearancechange",{detail:value}))}
const notificationDefaults={soundMode:"sg",soundUrl:"",vibration:true};
export function getNotificationPreferences(){try{return{...notificationDefaults,...JSON.parse(localStorage.getItem("sgNotificationPreferences")||"{}")}}catch{return{...notificationDefaults}}}
export function saveNotificationPreferences(value){localStorage.setItem("sgNotificationPreferences",JSON.stringify({...notificationDefaults,...value}))}
export function playNotificationFeedback(){const p=getNotificationPreferences();if(p.vibration&&navigator.vibrate)navigator.vibrate([140,70,140]);if(p.soundMode==="silent")return;if((p.soundMode==="url"||p.soundMode==="device")&&p.soundUrl){new Audio(p.soundUrl).play().catch(()=>{});return}try{const C=window.AudioContext||window.webkitAudioContext,c=new C(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.setValueAtTime(660,c.currentTime);o.frequency.exponentialRampToValueAtTime(920,c.currentTime+.12);g.gain.setValueAtTime(.12,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.28);o.start();o.stop(c.currentTime+.28)}catch{}}
applyAppearance();

function installAccountMenu(user){
    const header=document.querySelector(".sg-header,.app-header,.profile-editor-topbar,.topbar");
    if(!header||header.querySelector(".account-menu"))return;
    const clean=value=>String(value||"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
    const name=user.displayName||user.email?.split("@")[0]||"Conta";
    const photo=user.photoURL||(nested()?"../assets/logo.png":"assets/logo.png");
    const menu=document.createElement("div");
    menu.className="account-menu";
    menu.innerHTML=`<button class="account-trigger" type="button" aria-label="Abrir menu da conta"><img src="${srcSeguro(photo)}" alt=""><span>${clean(name)}</span></button><div class="account-dropdown" hidden><strong>${clean(name)}</strong><small>${clean(user.email)}</small><a href="${nested()?"../dashboard.html":"dashboard.html"}">Meu perfil</a><button type="button" data-enable-notifications><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M18.2 9.6a6.2 6.2 0 1 0-12.4 0c0 6-2.4 7.6-2.4 7.6h17.2s-2.4-1.6-2.4-7.6Z"/><path d="M13.8 20.4a2 2 0 0 1-3.6 0"/></svg> Ativar notificações</button><button type="button" data-switch-account>Trocar de conta</button><button type="button" data-sign-out>Sair da conta</button></div>`;
    header.appendChild(menu);
    const dropdown=menu.querySelector(".account-dropdown");
    menu.querySelector(".account-trigger").onclick=()=>dropdown.hidden=!dropdown.hidden;
    menu.querySelector("[data-sign-out]").onclick=async()=>{await signOut(auth);location.replace(nested()?"../login.html":"login.html")};
    rememberAccount(user);
    menu.querySelector("[data-switch-account]").onclick=()=>location.assign(nested()?"../account-switcher.html":"account-switcher.html");
    menu.querySelector("[data-enable-notifications]").onclick=async()=>{if(window.SGAndroidNotifications){window.SGAndroidNotifications.requestPermission();alert("Pedido enviado. Confirme a permissão de notificações do SG no celular.");return}if(!("Notification" in window))return alert("Este navegador não oferece notificações.");const permission=await Notification.requestPermission();alert(permission==="granted"?"Notificações ativadas.":"Permissão de notificação não concedida.")};
    document.addEventListener("click",event=>{if(!menu.contains(event.target))dropdown.hidden=true});
}
const NOTIFICATION_LIMIT=30;
function notificationPath(item){
    if(["message","gamer_friend"].includes(item.type)&&item.fromUid)return `chat.html?u=${encodeURIComponent(item.fromUid)}`;
    if(item.type==="server_invite"&&item.serverId)return `chat.html?invite=${encodeURIComponent(item.serverId)}`;
    return "dashboard.html";
}
function notificationId(docId){return Math.abs([...docId].reduce((sum,char)=>((sum<<5)-sum)+char.charCodeAt(0),0))}
export async function markNotificationRead(id){try{await updateDoc(doc(db,"notifications",id),{read:true,readAt:serverTimestamp()})}catch(error){console.warn("Não foi possível marcar a notificação como lida",error)}}
function showNotificationBanner(title,message,onOpen){
    const banner=document.createElement("button");
    banner.type="button";banner.className="sg-live-notification";
    const strong=document.createElement("strong");strong.textContent=title;
    const span=document.createElement("span");span.textContent=message;
    banner.append(strong,span);
    banner.onclick=onOpen;
    document.body.appendChild(banner);
    setTimeout(()=>banner.remove(),7000);
    return banner;
}
function lookingAtConversation(item){
    if(item.type!=="message"||!item.fromUid)return false;
    if(!location.pathname.endsWith("chat.html")||document.hidden)return false;
    return new URLSearchParams(location.search).get("u")===item.fromUid;
}
function installNotifications(user){
    let first=true;
    const notifications=query(collection(db,"notifications"),where("toUid","==",user.uid),orderBy("createdAt","desc"),limit(NOTIFICATION_LIMIT));
    onSnapshot(notifications,snapshot=>{
        if(first){
            first=false;
            const unread=snapshot.docs.filter(item=>item.data().read===false).length;
            if(unread)showNotificationBanner("Something Gamer",`Você tem ${unread} novidade${unread===1?"":"s"} para ver.`,()=>location.assign((nested()?"../":"")+"dashboard.html"));
            return;
        }
        snapshot.docChanges().filter(change=>change.type==="added").forEach(change=>{
            const item=change.doc.data();
            if(item.read===true||lookingAtConversation(item))return;
            const title=String(item.title||"Nova notificação").slice(0,120);
            const message=String(item.message||"").slice(0,200);
            const destino=notificationPath(item);
            const abrir=()=>{markNotificationRead(change.doc.id);location.assign((nested()?"../":"")+destino)};
            const banner=showNotificationBanner(title,message,abrir);
            playNotificationFeedback();
            if(document.hidden&&"Notification" in window&&Notification.permission==="granted"){
                const notice=new Notification(title,{body:message,icon:(nested()?"../":"")+"assets/logo.png",tag:item.type==="message"?`chat-${item.fromUid}`:change.doc.id});
                notice.onclick=()=>{window.focus();banner.click()};
            }
            if(document.hidden&&window.SGAndroidNotifications)window.SGAndroidNotifications.show(title,message,`${location.origin}/${destino}`,notificationId(change.doc.id));
        })
    },error=>console.warn("Notificações indisponíveis",error));
}
function rememberAccount(user){try{const key="sgRememberedAccounts",items=JSON.parse(localStorage.getItem(key)||"[]").filter(item=>item.uid!==user.uid);items.unshift({uid:user.uid,email:user.email||"",name:user.displayName||user.email?.split("@")[0]||"Conta",photoURL:user.photoURL||"",lastUsedAt:Date.now()});localStorage.setItem(key,JSON.stringify(items.slice(0,8)))}catch{}}
function installSafetyState(user){installSanctionGate(user)}
auth.onAuthStateChanged(user=>{if(user){installAccountMenu(user);installSafetyState(user);installNotifications(user)}});
if("serviceWorker" in navigator&&location.protocol.startsWith("http"))window.addEventListener("load",()=>navigator.serviceWorker.register(nested()?"../service-worker.js":"service-worker.js").catch(()=>{}));

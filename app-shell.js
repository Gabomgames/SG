import {applyTranslations,t} from "./i18n.js";

function installCriticalShellStyles(){
  if(document.getElementById("sg-shell-critical")) return;
  const style=document.createElement("style");
  style.id="sg-shell-critical";
  style.textContent=`
    .sg-loading-screen{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:#080914;transition:.25s opacity,.25s visibility;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}.sg-loading-screen.done{opacity:0;visibility:hidden;pointer-events:none}.sg-loading-mark{display:grid;justify-items:center;gap:14px;color:#f5f3ff;font:700 13px/1.2 Inter,system-ui,sans-serif}.sg-loading-mark img{width:64px;height:64px;border-radius:18px;box-shadow:0 0 58px rgba(107,76,255,.38)}.sg-loading-mark i{display:block;width:180px;height:3px;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.09)}.sg-loading-mark i:after{content:"";display:block;width:42%;height:100%;border-radius:inherit;background:linear-gradient(90deg,#7965ff,#5fc7ff);animation:sg-critical-load 1s ease-in-out infinite}@keyframes sg-critical-load{0%{transform:translateX(-100%)}100%{transform:translateX(340%)}}
    .sg-offline-banner{position:fixed!important;left:50%!important;top:16px!important;right:auto!important;bottom:auto!important;z-index:2147483646!important;transform:translate(-50%,-160%)!important;width:min(560px,calc(100% - 24px))!important;box-sizing:border-box!important;display:grid!important;grid-template-columns:auto minmax(0,1fr) auto!important;align-items:center!important;gap:12px!important;padding:12px 12px 12px 14px!important;border:1px solid rgba(255,184,77,.28)!important;border-radius:16px!important;background:rgba(26,19,10,.96)!important;color:#fff7e8!important;box-shadow:0 18px 60px rgba(0,0,0,.38)!important;backdrop-filter:blur(18px)!important;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif!important;transition:transform .24s ease,opacity .24s ease!important;opacity:0!important;pointer-events:none!important}.sg-offline-banner.show{transform:translate(-50%,0)!important;opacity:1!important;pointer-events:auto!important}.sg-offline-icon{width:36px;height:36px;display:grid;place-items:center;border-radius:11px;background:rgba(255,184,77,.12);font-size:18px}.sg-offline-copy{min-width:0}.sg-offline-copy strong{display:block!important;margin:0 0 3px!important;color:#fff7e8!important;font:800 12px/1.25 Inter,system-ui,sans-serif!important;letter-spacing:.03em!important}.sg-offline-copy span{display:block;color:#ccbfa9;font:500 11px/1.35 Inter,system-ui,sans-serif}.sg-offline-banner button{appearance:none!important;min-height:36px!important;padding:0 13px!important;border:0!important;border-radius:10px!important;background:#ffb84d!important;color:#211507!important;font:800 11px/1 Inter,system-ui,sans-serif!important;cursor:pointer!important;white-space:nowrap!important}.sg-offline-banner button:hover{filter:brightness(1.05)}.sg-offline-banner.shake{animation:sg-critical-shake .22s 2}@keyframes sg-critical-shake{50%{margin-left:7px}}
    @media(max-width:620px){.sg-offline-banner{top:10px!important;grid-template-columns:auto 1fr!important}.sg-offline-banner button{grid-column:1/-1!important;width:100%!important}}
  `;
  document.head.append(style);
}

function shell(){
  installCriticalShellStyles();
  applyTranslations();
  const nav=document.querySelector(".sg-header nav");
  if(nav && !nav.querySelector('[href="marketplace.html"]') && !location.pathname.includes('/Games/') && !location.pathname.includes('/Onboarding/')){
    const market=document.createElement("a"); market.href="marketplace.html"; market.textContent="Market";
    const ads=document.createElement("a"); ads.href="ads.html"; ads.textContent="NOW ADS";
    nav.append(market,ads);
  }
  if(!document.querySelector(".sg-loading-screen")){
    const load=document.createElement("div");
    load.className="sg-loading-screen";
    load.innerHTML=`<div class="sg-loading-mark"><img src="${location.pathname.includes('/Onboarding/')||location.pathname.includes('/Games/')?'../':''}assets/logo.png" alt=""><span>${t('loading')}</span><i></i></div>`;
    document.body.append(load);
    const done=()=>{load.classList.add("done");setTimeout(()=>load.remove(),320)};
    if(document.readyState==="complete") done(); else addEventListener("load",done,{once:true});
    setTimeout(done,4500);
  }
  if(!document.querySelector(".sg-offline-banner")){
    const banner=document.createElement("div");
    banner.className="sg-offline-banner";
    banner.setAttribute("role","status");
    banner.setAttribute("aria-live","polite");
    banner.innerHTML=`<span class="sg-offline-icon" aria-hidden="true">⌁</span><div class="sg-offline-copy"><strong>${t('offline')}</strong><span>${t('offline.copy')}</span></div><button type="button">${t('retry')}</button>`;
    banner.querySelector("button").onclick=()=>{if(navigator.onLine) location.reload(); else {banner.classList.remove("shake"); void banner.offsetWidth; banner.classList.add("shake")}};
    document.body.append(banner);
    const sync=()=>{const offline=!navigator.onLine;banner.classList.toggle("show",offline);banner.querySelector("strong").textContent=t('offline');banner.querySelector(".sg-offline-copy span").textContent=t('offline.copy');banner.querySelector("button").textContent=t('retry')};
    addEventListener("online",sync);addEventListener("offline",sync);document.addEventListener("sg:language",sync);sync();
  }
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",shell,{once:true});else shell();
if("serviceWorker" in navigator&&!location.hostname.includes("localhost"))addEventListener("load",()=>navigator.serviceWorker.register(`${location.pathname.includes('/Onboarding/')||location.pathname.includes('/Games/')?'../':''}service-worker.js?v=60`).catch(()=>{}),{once:true});

import {installMarketReview} from './admin-market.js';
import {installSocialReview} from "./admin-social.js";
import {installPaymentReview,installCommerceReview} from "./admin-payments.js";
import { auth, db, appCheckHeaders } from "./firebase.js";
import { APP_CONFIG } from "./config.js";
import { hrefSeguro } from "./seguranca-web.js";
import { RULES, applySanction as applySanctionDoc, revokeSanction, changeSuspension, listSanctions, listAppeals, decideAppeal } from "./sanctions.js";
import { addDoc, collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
// Le um documento de uma colecao que so o administrador enxerga. Se as
// regras deixarem, e admin; se recusarem, nao e. O navegador nao precisa
// saber de nenhum e-mail para isso, e a resposta vem de quem manda.
async function adminFunction(action,payload={}) {
  const current=auth.currentUser||user;if(!current)throw new Error("Sessão administrativa indisponível.");
  const response=await fetch(`${APP_CONFIG.steamApiBaseUrl}/adminApi`,{method:"POST",credentials:"include",
    headers:{Authorization:`Bearer ${await current.getIdToken()}`,"Content-Type":"application/json",...(await appCheckHeaders())},
    body:JSON.stringify({action,...payload}),signal:AbortSignal.timeout(15000)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"Painel indisponível: configure MFA e política de dispositivo no servidor.");
  return hydrateAdminDates(data);
}
function hydrateAdminDates(value){if(!value||typeof value!=="object")return value;if(typeof value.seconds==="number")return {...value,toMillis:()=>value.seconds*1000};if(Array.isArray(value))return value.map(hydrateAdminDates);return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,hydrateAdminDates(v)]));}
async function bootstrapAdminClaim(current){
  user=current;
  const tokenResult=await current.getIdTokenResult(true);
  if(tokenResult.claims?.admin!==true && tokenResult.claims?.role!=="super_admin"){
    throw new Error("ADMIN_CLAIM_MISSING: esta conta não possui permissão de administrador no token Firebase. A permissão deve ser atribuída no servidor por um administrador autorizado.");
  }
  await adminFunction("dashboard");
  return {ok:true,admin:true,role:tokenResult.claims?.role||"admin"};
}

// A lista de administradores NAO mora aqui: este arquivo e publico e
// entregar os e-mails e entregar o alvo. Quem responde quem e admin e o
// servidor, pelas regras do Firestore (veja ehAdministrador abaixo).
const $=id=>document.getElementById(id);let isSuperAdmin=false;let user=null;let users=[];let promotions=[];let companyApplications=[];let communityReports=[];let purchases=[];let marketListings=[];let adCampaigns=[];const toast=$("appToast");const access={verification:"",promotion:"",community:"",release:""};
$("refreshFounders")?.addEventListener('click',async()=>{
 const button=$("refreshFounders"),status=$("founderMonitorStatus"),list=$("founderMonitorList");
 button.disabled=true;status.textContent='Consultando concessões...';list.replaceChildren();
 try{
  const result=await adminFunction('founderPromotion');
  status.textContent=`${result.granted} de ${result.limit} vagas concedidas. ${result.closed?'Vagas encerradas.':result.enabled?'Campanha habilitada no backend; a ativação de lançamento exige também a configuração da Function.':'Campanha desativada.'}`;
  for(const grant of result.grants){const item=document.createElement('li');item.textContent=`#${grant.sequence} · ${grant.uid} · ${grant.status} · expira em ${grant.expiresAt?.seconds?new Date(grant.expiresAt.seconds*1000).toLocaleString('pt-BR'):'data indisponível'}`;list.append(item);}
 }catch{status.textContent='Não foi possível consultar as concessões. Verifique sua sessão e o acesso administrativo.';}
 finally{button.disabled=false;}
});
const discountField=document.createElement("label");discountField.innerHTML='Chamada curta (opcional)<input id="promotionDiscount" maxlength="40" placeholder="Ex.: Oferta de lançamento">';$("promotionTitle").closest("label").insertAdjacentElement("afterend",discountField);
const ISO_CODES="AD AE AF AG AI AL AM AO AR AT AU AW AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PR PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS YE ZA ZM ZW".split(" ");
const countryNames=new Intl.DisplayNames(["pt-BR"],{type:"region"});
const pricingFields=document.createElement("div");pricingFields.className="promotion-pricing";pricingFields.innerHTML='<div class="country-picker"><div class="country-picker-head"><div><strong>Onde a promoção aparecerá?</strong><small>Escolha o mundo inteiro ou um ou mais países.</small></div><button id="toggleCountries" type="button">Selecionar países</button></div><label class="world-option"><input id="promotionWorldwide" type="checkbox" checked> Mundialmente</label><div id="countryPanel" class="country-panel" hidden><input id="countrySearch" type="search" placeholder="Pesquisar país..."><div id="countryOptions" class="country-options"></div></div><div id="selectedCountries" class="selected-countries"><span>Mundialmente</span></div></div><div class="form-grid"><label>Moeda<select id="promotionCurrency"><option value="BRL">Real (R$)</option><option value="USD">Dólar (US$)</option><option value="EUR">Euro (€)</option></select></label><label>Preço original<input id="promotionOriginalPrice" type="number" min="0" step="0.01" required placeholder="14,90"></label></div><div class="form-grid"><label>Tipo de desconto<select id="promotionDiscountType"><option value="fixed">Valor fixo</option><option value="percent">Porcentagem</option></select></label><label>Valor do desconto<input id="promotionDiscountValue" type="number" min="0" step="0.01" required placeholder="2,00"></label></div><div class="promotion-price-preview"><span>Preço final</span><strong id="promotionFinalPrice">R$ 0,00</strong></div>';
discountField.insertAdjacentElement("afterend",pricingFields);
const sortedCountries=ISO_CODES.map(code=>({code,name:countryNames.of(code)||code})).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")),selectedCountryCodes=new Set();
function renderCountryOptions(search=""){$("countryOptions").innerHTML=sortedCountries.filter(item=>item.name.toLowerCase().includes(search.toLowerCase())).map(item=>`<label><input type="checkbox" name="promotionCountry" value="${item.code}" ${selectedCountryCodes.has(item.code)?"checked":""}><span>${escapeHtml(item.name)}</span><small>${item.code}</small></label>`).join("")}
function selectedRegions(){return $("promotionWorldwide").checked?["world"]:[...selectedCountryCodes]}
function updateCountryPicker(){if($("promotionWorldwide").checked)selectedCountryCodes.clear();const regions=selectedRegions();$("countryPanel").hidden=$("promotionWorldwide").checked;$("selectedCountries").innerHTML=regions[0]==="world"?"<span>Mundialmente</span>":regions.map(code=>`<span>${escapeHtml(countryNames.of(code)||code)}</span>`).join("")||"<em>Nenhum país selecionado</em>"}
renderCountryOptions();$("toggleCountries").onclick=()=>{$("promotionWorldwide").checked=false;$("countryPanel").hidden=!$("countryPanel").hidden;updateCountryPicker()};$("promotionWorldwide").onchange=()=>{if($("promotionWorldwide").checked){selectedCountryCodes.clear();renderCountryOptions($("countrySearch").value)}updateCountryPicker()};$("countrySearch").oninput=event=>renderCountryOptions(event.target.value);$("countryOptions").onchange=event=>{if(event.target.name==="promotionCountry"){event.target.checked?selectedCountryCodes.add(event.target.value):selectedCountryCodes.delete(event.target.value);updateCountryPicker()}};
function calculatePromotionPrice(){const original=Number($("promotionOriginalPrice").value||0),discount=Number($("promotionDiscountValue").value||0),type=$("promotionDiscountType").value,currency=$("promotionCurrency").value;const final=Math.max(0,type==="percent"?original*(1-discount/100):original-discount);$("promotionFinalPrice").textContent=new Intl.NumberFormat("pt-BR",{style:"currency",currency}).format(final);return{originalPrice:original,discountValue:discount,discountType:type,finalPrice:Number(final.toFixed(2)),currency}}
pricingFields.addEventListener("input",calculatePromotionPrice);
function notify(message,type="info"){toast.textContent=message;toast.dataset.type=type;toast.classList.add("show");clearTimeout(notify.timeout);notify.timeout=setTimeout(()=>toast.classList.remove("show"),3500);}
function escapeHtml(value){const div=document.createElement("div");div.textContent=value||"";return div.innerHTML;}
function verificationLabel(item){return {active:"Ativa",pending:"Em análise",payment_pending:"Aguardando pagamento",suspended:"Suspensa",expired:"Expirada"}[item.verification?.status]||"Sem selo";}
function renderUsers(list=users){$("usersTable").innerHTML=list.map(item=>`<tr><td><strong>${escapeHtml(item.name||"Sem nome")}</strong><span>${item.username?"@"+escapeHtml(item.username):"sem username"}</span><small>${item.moderation?.status==="banned"?"BANIDO":item.moderation?.status==="suspended"?"SUSPENSO":`${item.moderation?.warningCount||0} advertência(s)`}</small></td><td><span>${escapeHtml(item.email||"sem e-mail")}</span><small>${item.accountType==="official_now"?"Conta oficial Now":item.accountType==="official_sg"?"Conta oficial SG":item.accountType==="creator"?"Criador de conteúdo":"Conta gamer"}</small>${item.photoModeration?.status==="pending"?`<a href="${hrefSeguro(item.pendingPhotoURL)}" target="_blank" rel="noopener">Revisar nova foto <svg class="ico" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14.2 4.2h5.6v5.6M19.8 4.2 11.4 12.6"/><path d="M17.8 13.8V19a1.6 1.6 0 0 1-1.6 1.6H5a1.6 1.6 0 0 1-1.6-1.6V7.8A1.6 1.6 0 0 1 5 6.2h5.2"/></svg></a>`:""}</td><td><span class="status-pill status-${item.verification?.status||"none"}">${verificationLabel(item)}</span><small>${item.badges?.nowFollowed?"Now segue · ":""}${item.badges?.sgFollowed?"SG segue · ":""}${item.badges?.dev?"DEV":""}</small></td><td><details class="admin-user-actions"><summary>Gerenciar <svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6.4 9.4 12 15l5.6-5.6"/></svg></summary><div class="admin-action-popover"><section><strong>Segurança</strong><div><button data-sanction="warning" data-uid="${item.uid}">Advertir</button><button data-sanction="suspend" data-uid="${item.uid}">Suspender</button><button class="danger" data-sanction="ban" data-uid="${item.uid}">Banir</button></div></section>${item.photoModeration?.status==="pending"?`<section><strong>Foto pendente</strong><div><button data-photo="approve" data-uid="${item.uid}">Aprovar</button><button data-photo="reject" data-uid="${item.uid}">Recusar</button></div></section>`:""}<section><strong>Conta e verificação</strong><div><button data-verify="active" data-uid="${item.uid}">Verificar</button><button data-official="official_now" data-uid="${item.uid}">Oficial Now</button><button data-official="official_sg" data-uid="${item.uid}">Oficial SG</button></div></section><section><strong>Reconhecimentos</strong><div><button data-badge="nowFollowed" data-enabled="${!item.badges?.nowFollowed}" data-uid="${item.uid}">${item.badges?.nowFollowed?"Remover Now":"Dar selo Now"}</button><button data-badge="sgFollowed" data-enabled="${!item.badges?.sgFollowed}" data-uid="${item.uid}">${item.badges?.sgFollowed?"Remover SG":"Dar selo SG"}</button><button data-dev data-enabled="${!item.badges?.dev}" data-uid="${item.uid}">${item.badges?.dev?"Remover DEV":"Dar selo DEV"}</button></div></section><button class="remove-verification" data-verify="none" data-uid="${item.uid}">Remover verificação</button>${isSuperAdmin?`<section class="sg67-danger-section"><strong>Medidas graves</strong>${item.deletionRequest?.status==="pending"?`<button class="sg67-cancel-removal" data-cancel-account="${item.uid}">Cancelar exclusão agendada</button>`:`<button class="sg67-danger-button" data-remove-account="${item.uid}">Encerrar conta (com prazo de recurso)</button>`}</section>`:""}</div></details></td></tr>`).join("")||`<tr><td colspan="4">Nenhum usuário encontrado.</td></tr>`;}
function renderPromotions(){$("promotionList").innerHTML=promotions.map(item=>{const regions=item.regions||[item.region||"world"],place=regions.includes("world")?"Mundial":regions.map(code=>countryNames.of(code)||code).join(", ");return`<article><div><strong>${escapeHtml(item.discount||"OFERTA")} · ${escapeHtml(item.title)}</strong><p>${escapeHtml(item.description)}</p><small>${escapeHtml(place)} · ${item.finalPrice!=null?new Intl.NumberFormat("pt-BR",{style:"currency",currency:item.currency||"BRL"}).format(item.finalPrice)+" · ":""}${item.quantityLimit?`${item.remainingQuantity??item.quantityLimit} de ${item.quantityLimit} disponíveis`:"Quantidade ilimitada"}</small></div><button data-promotion="${item.id}" data-active="${item.active!==false}">${item.active!==false?"Encerrar":"Reativar"}</button></article>`}).join("")||"<p>Nenhuma promoção criada.</p>";}
function renderCommunity(){if(!$("companyApplications"))return;$("companyApplications").innerHTML=companyApplications.map(item=>`<article class="moderation-item"><div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.category)} · ${escapeHtml(item.website)}</span><p>${escapeHtml(item.goal)}</p></div><button data-company-approve="${item.id}">Aprovar</button><button data-company-reject="${item.id}">Recusar</button></article>`).join("")||"<p>Nenhuma solicitação pendente.</p>";$("communityReports").innerHTML=communityReports.map(item=>`<article class="moderation-item"><div><strong>${escapeHtml(item.category||item.type)}</strong><span>Alvo: ${escapeHtml(item.targetUid||item.targetId)}</span><p>${escapeHtml(item.reason)}</p>${(item.evidenceURLs||[]).map((url,index)=>`<a href="${hrefSeguro(url)}" target="_blank" rel="noopener">Prova ${index+1} <svg class="ico" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14.2 4.2h5.6v5.6M19.8 4.2 11.4 12.6"/><path d="M17.8 13.8V19a1.6 1.6 0 0 1-1.6 1.6H5a1.6 1.6 0 0 1-1.6-1.6V7.8A1.6 1.6 0 0 1 5 6.2h5.2"/></svg></a>`).join(" ")}</div><button data-report-resolve="${item.id}">Resolver</button>${item.targetUid?`<button data-report-sanction="${item.targetUid}" data-report-id="${item.id}">Punir usuário</button>`:""}${item.type==="event"?`<button data-event-remove="${item.targetId}" data-report-id="${item.id}">Remover evento</button>`:""}</article>`).join("")||"<p>Nenhuma denúncia aberta.</p>"}
function moneyBRL(value){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value)||0)}
function renderCommerce(){if(!$("commercePurchases"))return;const approved=purchases.filter(p=>p.status==="approved"),volume=approved.reduce((sum,p)=>sum+Number(p.amount||0),0);$("commerceRevenue").textContent=moneyBRL(volume);$("commercePayments").textContent=purchases.length;$("commerceListings").textContent=marketListings.length;$("commerceCampaigns").textContent=adCampaigns.length;const ordered=[...purchases].sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0)).slice(0,12);$("commercePurchases").innerHTML=ordered.length?ordered.map(p=>`<article class="admin-list-row"><div><strong>${escapeHtml(p.label||p.kind||"Pagamento SG")}</strong><small>${moneyBRL(p.amount)} · ${escapeHtml(p.kind||"")}</small></div><span class="pill">${escapeHtml(p.status||"pending")}</span></article>`).join(""):"<p>Nenhum pagamento registrado.</p>";const activity=[...marketListings.map(x=>({type:"Market",name:x.title,status:x.status||"active",time:x.createdAt})),...adCampaigns.map(x=>({type:"Ads",name:x.name,status:x.status||"pending",time:x.createdAt}))].sort((a,b)=>(b.time?.toMillis?.()||0)-(a.time?.toMillis?.()||0)).slice(0,14);$("commerceActivity").innerHTML=activity.length?activity.map(x=>`<article class="admin-list-row"><div><strong>${escapeHtml(x.name||x.type)}</strong><small>${escapeHtml(x.type)}</small></div><span class="pill">${escapeHtml(x.status)}</span></article>`).join(""):"<p>Nenhuma atividade comercial.</p>"}
async function load(){
  const data=await adminFunction("dashboard");
  users=Array.isArray(data.users)?data.users:[];
  promotions=Array.isArray(data.promotions)?data.promotions:[];
  companyApplications=Array.isArray(data.companyApplications)?data.companyApplications:[];
  communityReports=Array.isArray(data.reports)?data.reports:[];purchases=Array.isArray(data.purchases)?data.purchases:[];marketListings=Array.isArray(data.listings)?data.listings:[];adCampaigns=Array.isArray(data.campaigns)?data.campaigns:[];
  renderUsers();renderPromotions();renderCommunity();renderCommerce();initModeration();
  if(!document.querySelector("[data-payment-queue]")){installPaymentReview();installCommerceReview();installSocialReview();installMarketReview();}
  $("totalUsers").textContent=data.stats?.total??users.length;
  $("totalUsers").title="Contagem da página carregada (até 100). Use a busca/paginação para consultar mais.";
  $("verifiedUsers").textContent=data.stats?.verified??users.filter(item=>item.verification?.status==="active").length;
  $("pendingUsers").textContent=data.stats?.pending??users.filter(item=>["pending","payment_pending"].includes(item.verification?.status)).length;
}

async function authenticatedAdmin(){
  const current=auth.currentUser||user;
  if(!current)throw new Error("Sua sessão ainda não foi carregada. Entre novamente no painel.");
  user=current;
  await current.reload().catch(()=>{});
  const tokenResult=await current.getIdTokenResult(true);
  if(tokenResult.claims?.admin!==true && tokenResult.claims?.role!=="super_admin") throw new Error("ADMIN_CLAIM_MISSING: esta conta não possui permissão de administrador no token Firebase. A permissão deve ser atribuída no servidor por um administrador autorizado.");
  return current;
}

async function accessRequest(path,body={}){
  const current=await authenticatedAdmin();
  const token=await current.getIdToken(true);
  const response=await fetch(`${APP_CONFIG.steamApiBaseUrl}/adminAccess/${path}`,{
    method:"POST",credentials:"include",
    headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json",...(await appCheckHeaders())},
    body:JSON.stringify(body)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"Não foi possível liberar o acesso.");
  return data;
}

async function requireArea(area){
  await authenticatedAdmin();
  return true;
}

async function applySanction(targetUid,requestedType,reportId=""){
  const target=users.find(item=>item.uid===targetUid);
  if(!target)throw new Error("Usuário não encontrado.");
  const form=$("sanctionForm");
  form.target.value=target.username?"@"+target.username:target.uid;
  form.type.value=requestedType==="suspend"?"suspension":requestedType==="ban"?"ban":"warning";
  form.dataset.reportId=reportId||"";
  syncSanctionForm();
  document.querySelector('.admin-tab[data-panel="moderationPanel"]').click();
  form.reason.focus();
  loadHistory(target.uid);
}

// ---------- moderação (V58) ----------
const escMod=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtMod=t=>{const m=t?.toMillis?.()??0;return m?new Date(m).toLocaleString("pt-BR"):"—"};
function resolveTarget(text){
  const v=String(text||"").trim().replace(/^@/,"").toLowerCase();
  return users.find(u=>u.uid===text.trim()||String(u.username||"").toLowerCase()===v);
}
function syncSanctionForm(){
  const form=$("sanctionForm"),type=form.type.value;
  form.querySelectorAll("[data-for]").forEach(el=>el.hidden=el.dataset.for!==type);
}
async function loadHistory(uid){
  const box=$("sanctionHistory");box.innerHTML="<p>Carregando...</p>";
  const list=await listSanctions(uid);
  if(!list.length){box.innerHTML="<p>Sem punições registradas.</p>";return}
  box.innerHTML=list.map(s=>{
    const revoked=s.revoked?`<p class="mod-revoked">Revogada em ${fmtMod(s.revoked.at)} — ${escMod(s.revoked.reason)}</p>`:"";
    const kind={warning:"Advertência",suspension:"Suspensão",ban:"Banimento"}[s.type]||s.type;
    const ends=s.type==="suspension"?` · até ${fmtMod(s.endsAt)}`:"";
    const actions=s.revoked?"":`<button type="button" data-revoke="${s.id}">Reverter</button>${s.type==="suspension"?`<button type="button" data-duration="${s.id}">Alterar duração</button>`:""}`;
    return `<article class="mod-item ${s.revoked?"revoked":""}"><div><strong>${kind}</strong> <span>${escMod(s.caseNumber||s.id)}</span><small>${fmtMod(s.createdAt)}${ends}</small><p>${escMod(s.ruleLabel||"")} — ${escMod(s.reason||"")}</p>${revoked}</div><div class="mod-actions">${actions}</div></article>`;
  }).join("");
}
async function loadAppeals(){
  const box=$("appealList");
  try{
    const list=await listAppeals();
    if(!list.length){box.innerHTML="<p>Nenhum recurso enviado.</p>";return}
    const label={open:"Enviado",in_review:"Em análise",info_requested:"Aguardando usuário",accepted:"Aceito",denied:"Negado"};
    box.innerHTML=list.map(t=>`<article class="mod-item"><div><strong>${escMod(t.title||"Recurso")}</strong> <span>${label[t.status]||t.status}</span><small>${fmtMod(t.createdAt)} · ${escMod(t.reasonType||"")}</small><p>${escMod(t.message||"")}</p>${t.userReply?`<p><em>Resposta do usuário:</em> ${escMod(t.userReply)}</p>`:""}${(t.evidence||[]).map(l=>`<a href="${escMod(hrefSeguro(l))}" target="_blank" rel="noopener noreferrer">${escMod(l)}</a>`).join("<br>")}</div><div class="mod-actions">${["accepted","denied"].includes(t.status)?"":`<button type="button" data-appeal="in_review" data-ticket="${t.id}">Em análise</button><button type="button" data-appeal="info_requested" data-ticket="${t.id}">Pedir informações</button><button type="button" data-appeal="accepted" data-ticket="${t.id}">Aceitar</button><button type="button" data-appeal="denied" data-ticket="${t.id}">Negar</button>`}</div></article>`).join("");
    box._tickets=new Map(list.map(t=>[t.id,t]));
  }catch(error){console.error(error);box.innerHTML="<p>Não foi possível carregar os recursos.</p>"}
}
function initModeration(){
  const form=$("sanctionForm");if(!form||form.dataset.ready)return;form.dataset.ready="1";
  $("modRule").innerHTML=RULES.map(([id,label])=>`<option value="${id}">${escMod(label)}</option>`).join("");
  $("modUsers").innerHTML=users.slice(0,500).map(u=>`<option value="${escMod(u.username?"@"+u.username:u.uid)}">${escMod(u.name||"")}</option>`).join("");
  syncSanctionForm();
  form.type.addEventListener("change",syncSanctionForm);
  form.target.addEventListener("change",()=>{const t=resolveTarget(form.target.value);if(t)loadHistory(t.uid)});
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    const err=$("sanctionError");err.textContent="";
    const t=resolveTarget(form.target.value);
    if(!t){err.textContent="Usuário não encontrado. Use @username ou UID.";return}
    if(form.type.value==="ban"&&!confirm(`Banir ${t.name||t.username||t.uid}? A pessoa perde o acesso ao app (poderá recorrer).`))return;
    const btn=form.querySelector("button[type=submit]");btn.disabled=true;
    try{
      const result=await applySanctionDoc(auth.currentUser||user,{uid:t.uid,type:form.type.value,ruleId:form.ruleId.value,reason:form.reason.value,durationHours:Number(form.durationHours.value),permanent:form.permanent.value==="true",relatedContent:form.relatedContent.value,internalNote:form.internalNote.value,evidence:form.evidence.value.split("\n"),reportId:form.dataset.reportId||""});
      notify(`Punição aplicada. Caso ${result.caseNumber}.`,"success");
      form.reason.value="";form.relatedContent.value="";form.internalNote.value="";form.evidence.value="";form.dataset.reportId="";
      await loadHistory(t.uid);await load();
    }catch(error){console.error(error);err.textContent=error.message||"Não foi possível aplicar."}
    finally{btn.disabled=false}
  });
  $("sanctionHistory").addEventListener("click",async event=>{
    const rev=event.target.closest("[data-revoke]"),dur=event.target.closest("[data-duration]");
    const t=resolveTarget(form.target.value);
    try{
      if(rev){const reason=prompt("Motivo da reversão (fica registrado):")?.trim();if(!reason)return;await revokeSanction(auth.currentUser||user,rev.dataset.revoke,reason);notify("Punição revogada. O registro original foi mantido.","success");}
      if(dur){const hours=Number(prompt("Nova duração total em horas (contada desde o início):"));if(!(hours>0))return;const reason=prompt("Motivo da alteração:")?.trim();if(!reason)return;await changeSuspension(auth.currentUser||user,dur.dataset.duration,hours,reason);notify("Duração alterada.","success");}
      if(t)await loadHistory(t.uid);await load();
    }catch(error){console.error(error);notify(error.message||"Falha na operação.","error")}
  });
  $("appealList").addEventListener("click",async event=>{
    const b=event.target.closest("[data-appeal]");if(!b)return;
    const ticket=$("appealList")._tickets?.get(b.dataset.ticket);if(!ticket)return;
    try{
      const status=b.dataset.appeal;
      const msg=status==="in_review"?"":prompt(status==="accepted"?"Mensagem ao usuário (opcional):":"Mensagem ao usuário:")?.trim()||"";
      if(status!=="in_review"&&status!=="accepted"&&!msg)return;
      await decideAppeal(auth.currentUser||user,ticket,status,msg);notify("Recurso atualizado.","success");await loadAppeals();
    }catch(error){console.error(error);notify(error.message||"Falha ao decidir o recurso.","error")}
  });
  loadAppeals();
}

auth.onAuthStateChanged(async current=>{
  if(!current)return window.location.replace("login.html?return=admin.html");
  user=current;
  try{
    const bootstrap=await bootstrapAdminClaim(current);
    isSuperAdmin=bootstrap.role==='super_admin';
    await load();document.querySelectorAll(".admin-lock").forEach(el=>el.hidden=true);document.querySelectorAll(".admin-protected").forEach(el=>el.hidden=false);
    if(bootstrap?.localFallback){const b=document.createElement("div");b.className="admin-offline-banner";b.textContent="Modo local: Functions indisponíveis. Os dados são lidos diretamente do Firestore e continuam protegidos pelas regras administrativas.";document.querySelector(".admin-main")?.prepend(b);}
  }catch(error){
    console.error("admin auth",error);
    const main=document.querySelector('.admin-main');
    document.body.classList.add('sg67-admin-locked');
    const banner=document.createElement('section');banner.className='v651-admin-error';banner.setAttribute('role','alert');
    const code=String(error?.message||'');
    let title='Não foi possível carregar o painel';
    let detail='O serviço administrativo não respondeu. Confira o Worker, o App Check e as permissões do projeto.';
    if(code.includes('ADMIN_CLAIM_MISSING')){
      title='Permissão de administrador não encontrada';
      detail='A conta autenticada não possui a custom claim admin. A configuração deve ser feita com segurança no backend; não é possível ativar acesso administrativo pelo navegador.';
    }else if(/fetch|network|Failed to fetch|timed out/i.test(code)){
      title='Falha de conexão com a API administrativa';
      detail='Verifique a disponibilidade e a configuração do Worker, do App Check e das origens autorizadas.';
    }else if(/mfa|dispositivo|device/i.test(code)){
      title='Verificação de segurança pendente';
      detail='O servidor exige autenticação reforçada. Confira a configuração de MFA e a política de dispositivos.';
    }
    const heading=document.createElement('h2');heading.textContent=title;
    const info=document.createElement('p');info.textContent=detail;
    const errorCode=document.createElement('code');errorCode.textContent=code.slice(0,350)||'Erro sem detalhes';
    const back=document.createElement('a');back.href='dashboard.html';back.textContent='Voltar ao perfil';
    banner.append(heading,info,errorCode,back);
    main?.prepend(banner);
    document.querySelectorAll('.admin-protected').forEach(el=>el.hidden=true);
    $("usersTable").innerHTML='<tr><td colspan="4">Dados administrativos indisponíveis até a verificação de acesso.</td></tr>';
    notify(title,'error');
  }
});

document.querySelectorAll(".admin-tab").forEach(button=>button.addEventListener("click",()=>{
  document.querySelectorAll(".admin-tab").forEach(item=>item.classList.toggle("active",item===button));
  document.querySelectorAll(".admin-panel").forEach(panel=>panel.classList.toggle("active",panel.id===button.dataset.panel));
}));

fetch("build-info.json").then(r=>r.json()).then(info=>{
  document.getElementById("lastBuild").textContent=new Date(info.updatedAt).toLocaleString("pt-BR");
  document.getElementById("buildVersion").textContent=info.version;
}).catch(()=>{document.getElementById("lastBuild").textContent="Informação indisponível"});

document.querySelectorAll("[data-unlock]").forEach(form=>form.addEventListener("submit",async event=>{
  event.preventDefault();const area=form.dataset.unlock,button=form.querySelector("button"),password=form.querySelector('input[type="password"]').value,recoveryCode=form.querySelector(".admin-recovery-code")?.value.trim();
  button.disabled=true;button.textContent="Verificando...";
  try{
    let result;
    if(recoveryCode)result=await accessRequest("recover",{area,password,recoveryCode});
    else result=await accessRequest("verify",{area,password});
    access[area]=result.accessToken;
    document.querySelector(`[data-lock="${area}"]`).hidden=true;
    document.querySelector(`[data-area="${area}"]`).hidden=false;
    form.reset();notify("Área liberada com segurança.","success");
  }catch(error){
    const message=error.message==="Senha incorreta."
      ?"Senha incorreta. Se for o primeiro acesso ou se você esqueceu a senha, preencha também o código mestre para criar uma nova."
      :error.message;
    notify(message,"error");
  }
  finally{button.disabled=false;button.textContent="Entrar";}
}));

$("repairProfiles")?.addEventListener("click",async()=>{const button=$("repairProfiles");button.disabled=true;button.textContent="Sincronizando...";try{await requireArea("verification");const result=await adminFunction("repairProfiles");notify(`${result.count||0} perfis sincronizados.`,"success");await load()}catch(error){console.error(error);notify(error.message||"Não foi possível sincronizar os usuários.","error")}finally{button.disabled=false;button.textContent="Sincronizar usuários"}});

$("adminUserSearch").addEventListener("input",event=>{
  const q=event.target.value.toLowerCase();
  renderUsers(users.filter(item=>[item.name,item.username,item.email].some(value=>(value||"").toLowerCase().includes(q))));
});

$("usersTable").addEventListener("click",async event=>{
  const button=event.target.closest("button[data-verify]");if(!button)return;
  button.disabled=true;
  try{
    await requireArea("verification");
    const status=button.dataset.verify==="none"?"none":"active";
    let durationDays=null;
    if(status==="active"){
      const selected=prompt("Por quantos dias o selo ficará ativo?\nUse 0 para não expirar.","30");
      if(selected===null){button.disabled=false;return}
      durationDays=Number(selected);
      if(!Number.isInteger(durationDays)||durationDays<0||durationDays>3650)throw new Error("Informe um prazo entre 0 e 3650 dias.");
    }
    await adminFunction("setVerification",{uid:button.dataset.uid,status,durationDays});
    notify("Verificação atualizada.","success");await load();
  }catch(error){console.error(error);notify(error.message||"Não foi possível atualizar a verificação.","error");button.disabled=false;}
});

$("usersTable").addEventListener("click",async event=>{
  const button=event.target.closest("button[data-badge]");if(!button)return;
  button.disabled=true;
  try{
    await requireArea("verification");
    await adminFunction("setBadge",{uid:button.dataset.uid,badge:button.dataset.badge,enabled:button.dataset.enabled==="true"});
    notify(button.dataset.enabled==="true"?"Selo concedido.":"Selo removido.","success");await load();
  }catch(error){console.error(error);notify(error.message||"Não foi possível atualizar o selo.","error");button.disabled=false;}
});

$("usersTable").addEventListener("click",async event=>{
  const button=event.target.closest("button[data-dev]");if(!button)return;
  button.disabled=true;
  try{
    await requireArea("verification");
    await adminFunction("setDevRole",{uid:button.dataset.uid,enabled:button.dataset.enabled==="true"});
    notify(button.dataset.enabled==="true"?"Selo DEV concedido.":"Selo DEV removido.","success");await load();
  }catch(error){console.error(error);notify(error.message||"Não foi possível atualizar o selo DEV.","error");button.disabled=false;}
});

$("usersTable").addEventListener("click",async event=>{
  const button=event.target.closest("button[data-official]");if(!button)return;
  button.disabled=true;
  try{
    await requireArea("verification");
    await adminFunction("setOfficial",{uid:button.dataset.uid,accountType:button.dataset.official});
    notify(button.dataset.official==="official_now"?"Conta oficial da Now ativada.":"Conta oficial do SG ativada.","success");await load();
  }catch(error){console.error(error);notify(error.message||"Não foi possível ativar a conta oficial.","error");button.disabled=false;}
});

$("usersTable").addEventListener("click",async event=>{
  const sanction=event.target.closest("[data-sanction]"),photo=event.target.closest("[data-photo]");
  try{
    if(sanction){sanction.disabled=true;await applySanction(sanction.dataset.uid,sanction.dataset.sanction);return;}
    if(photo){
      photo.disabled=true;await requireArea("verification");
      await adminFunction("reviewPhoto",{uid:photo.dataset.uid,decision:photo.dataset.photo});
      notify(photo.dataset.photo==="approve"?"Foto aprovada e publicada.":"Foto recusada.",photo.dataset.photo==="approve"?"success":"info");
      await load();
    }
  }catch(error){console.error(error);notify(error.message||"Não foi possível concluir.","error");if(sanction)sanction.disabled=false;if(photo)photo.disabled=false;}
});

$("promotionDuration").addEventListener("change",event=>$("durationCustomLabel").hidden=event.target.value!=="custom");
$("promotionQuantity").addEventListener("change",event=>$("quantityCustomLabel").hidden=event.target.value!=="custom");

$("promotionForm").addEventListener("submit",async event=>{
  event.preventDefault();
  const url=$("promotionButtonUrl").value.trim(),duration=$("promotionDuration").value,quantityChoice=$("promotionQuantity").value,pricing=calculatePromotionPrice(),regions=selectedRegions();
  if(!regions.length)return notify("Escolha pelo menos um país ou selecione Mundialmente.","error");
  if(url&&!/^https:\/\//i.test(url))return notify("Por segurança, o link deve começar com https://.","error");
  if(pricing.originalPrice<=0)return notify("Informe um preço original maior que zero.","error");
  if(pricing.discountValue<0||(pricing.discountType==="percent"&&pricing.discountValue>100)||(pricing.discountType==="fixed"&&pricing.discountValue>pricing.originalPrice))return notify("O desconto informado não é válido para esse preço.","error");
  let endsAt=null;
  if(duration==="custom"){
    if(!$("promotionEndsAt").value)return notify("Escolha a data de encerramento.","error");
    endsAt=new Date($("promotionEndsAt").value);
  }else endsAt=new Date(Date.now()+Number(duration)*86400000);
  const quantityLimit=quantityChoice==="unlimited"?null:Number(quantityChoice==="custom"?$("promotionCustomQuantity").value:quantityChoice);
  if(quantityChoice==="custom"&&(!quantityLimit||quantityLimit<1))return notify("Informe uma quantidade válida.","error");
  const automaticDiscount=pricing.discountType==="percent"?`${pricing.discountValue}% OFF`:`${new Intl.NumberFormat("pt-BR",{style:"currency",currency:pricing.currency}).format(pricing.discountValue)} DE DESCONTO`;
  try{
    await requireArea("promotion");
    await adminFunction("createPromotion",{
      title:$("promotionTitle").value.trim(),discount:$("promotionDiscount").value.trim()||automaticDiscount,
      description:$("promotionDescription").value.trim(),buttonLabel:$("promotionButtonLabel").value.trim()||"Aproveitar",buttonUrl:url,
      regions,...pricing,endsAt:endsAt.toISOString(),quantityLimit
    });
    event.target.reset();$("promotionWorldwide").checked=true;renderCountryOptions();updateCountryPicker();$("durationCustomLabel").hidden=true;$("quantityCustomLabel").hidden=true;calculatePromotionPrice();
    notify("Promoção publicada para os países selecionados.","success");await load();
  }catch(error){console.error(error);notify(error.message||"Não foi possível publicar a promoção.","error");}
});

$("promotionList").addEventListener("click",async event=>{
  const button=event.target.closest("button[data-promotion]");if(!button)return;
  button.disabled=true;
  try{
    await requireArea("promotion");
    await adminFunction("togglePromotion",{id:button.dataset.promotion,active:button.dataset.active!=="true"});
    notify("Promoção atualizada.","success");await load();
  }catch(error){console.error(error);notify(error.message||"Não foi possível atualizar a promoção.","error");button.disabled=false;}
});

document.querySelector("#communityPanel").addEventListener("click",async event=>{
  const approve=event.target.closest("[data-company-approve]"),reject=event.target.closest("[data-company-reject]"),resolve=event.target.closest("[data-report-resolve]"),remove=event.target.closest("[data-event-remove]"),punish=event.target.closest("[data-report-sanction]");
  try{
    if(approve||reject||resolve||remove||punish){await requireArea("community");}
    if(approve){await adminFunction("reviewCompany",{id:approve.dataset.companyApprove,decision:"approve"});notify("Empresa aprovada e publicada.","success");}
    if(reject){await adminFunction("reviewCompany",{id:reject.dataset.companyReject,decision:"reject"});notify("Solicitação recusada.","info");}
    if(resolve){await adminFunction("resolveReport",{id:resolve.dataset.reportResolve});notify("Denúncia resolvida.","success");}
    if(remove){await adminFunction("removeEvent",{eventId:remove.dataset.eventRemove,reportId:remove.dataset.reportId});notify("Evento removido da comunidade.","success");}
    if(punish){const choice=prompt("Ação: digite advertir, suspender ou banir","advertir")?.toLowerCase(),map={advertir:"warning",suspender:"suspend",banir:"ban"};if(map[choice])await applySanction(punish.dataset.reportSanction,map[choice],punish.dataset.reportId);}
    if(!punish)await load();
  }catch(error){console.error(error);notify(error.message||"Não foi possível concluir a moderação.","error");}
});

$("refreshCommerce")?.addEventListener("click",()=>load().then(()=>notify("Operação atualizada.","success")).catch(error=>notify(error.message||"Não foi possível atualizar.","error")));

// Encerramento moderado: 30 dias para recurso, log de auditoria obrigatório e autorização no Worker.
$("usersTable")?.addEventListener('click',async event=>{
 const button=event.target.closest('[data-remove-account]');if(!button)return;
 const target=users.find(u=>u.uid===button.dataset.removeAccount);if(!target)return;
 const confirmation=prompt(`ENCERRAR CONTA\n\nUsuário: @${target.username||target.name||target.uid}\nO acesso será bloqueado e a exclusão será agendada para 30 dias. A pessoa poderá recorrer pelo suporte.\n\nDigite o nome de usuário para confirmar:`);
 if(confirmation===null)return;
 if(confirmation.trim().toLowerCase()!==String(target.username||target.name||target.uid).trim().toLowerCase()){notify('Confirmação incorreta. Nenhuma ação executada.','error');return;}
 const reason=prompt('Informe o motivo da infração (mínimo 20 caracteres; será exibido ao usuário):');
 if(reason===null)return;
 if(reason.trim().length<20){notify('Informe um motivo fundamentado de pelo menos 20 caracteres.','error');return;}
 if(!confirm('Confirma o bloqueio imediato e o agendamento de exclusão após 30 dias? Esta ação é auditada.'))return;
 button.disabled=true;
 try{await adminFunction('scheduleAccountRemoval',{uid:target.uid,reason:reason.trim(),confirmation:target.username||target.name||target.uid});notify('Conta desativada. Exclusão agendada; recurso disponível por 30 dias.','success');await load();}
 catch(error){notify(error.message||'Não foi possível encerrar a conta.','error');}
 finally{button.disabled=false;}
});

$("usersTable")?.addEventListener('click',async event=>{
 const button=event.target.closest('[data-cancel-account]');if(!button)return;
 const target=users.find(u=>u.uid===button.dataset.cancelAccount);if(!target)return;
 const reason=prompt('Informe o motivo da revogação (mínimo 10 caracteres):');
 if(reason===null)return;if(reason.trim().length<10){notify('Explique o motivo da revogação.','error');return;}
 if(!confirm('Cancelar a exclusão e restaurar a situação anterior da conta?'))return;
 button.disabled=true;
 try{await adminFunction('cancelAccountRemoval',{uid:target.uid,reason:reason.trim()});notify('Exclusão cancelada e registrada.','success');await load();}
 catch(error){notify(error.message||'Falha ao cancelar exclusão.','error');}
 finally{button.disabled=false;}
});

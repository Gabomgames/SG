import { auth, db, appCheckHeaders } from "../firebase.js";
import { APP_CONFIG } from "../config.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { srcSeguro } from "../seguranca-web.js";
import { icone } from "../icones.js";

const $ = id => document.getElementById(id);
const state = { user:null, profile:{}, results:[], saved:[], view:"discover", timer:null };
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
const gameKey = game => `${game.source || "catalog"}:${game.id || game.appid || game.name}`;
const normalizedGame = game => typeof game === "string" ? { id:game.toLowerCase().replace(/[^a-z0-9]+/g,"-"), name:game, source:"legacy", cover:"" } : game;

function coverFor(game) {
    if (game.cover) return game.cover;
    if (game.backgroundImage) return game.backgroundImage;
    if (game.appid) return `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`;
    return "";
}

function cardMarkup(game, removable = true) {
    const selected = state.saved.some(item => gameKey(item) === gameKey(game));
    const genre = game.genre || game.genres?.join(" • ") || (game.source === "steam" ? `${Math.round((game.playtimeForever || 0) / 60)} h jogadas` : "Jogo");
    const rating = game.rating ? `<span class="game-rating"><svg class="ico" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8Z"/></svg> ${Number(game.rating).toFixed(1)}</span>` : "";
    const cover = coverFor(game);
    const artwork = cover ? `<img class="game-cover-img" src="${srcSeguro(cover)}" alt="Capa de ${escapeHtml(game.name)}" loading="lazy">` : `<div class="game-placeholder">${escapeHtml(game.name.slice(0,2).toUpperCase())}</div>`;
    return `<article class="game-card"><div class="game-cover">${artwork}<span class="source-badge">${escapeHtml(game.source === "steam" ? "STEAM" : "CATÁLOGO")}</span>${rating}</div><div class="game-info"><h3>${escapeHtml(game.name)}</h3><p>${escapeHtml(genre)}</p>${game.released ? `<small>${escapeHtml(game.released)}</small>` : ""}</div>${removable ? `<button class="add-game ${selected ? "added" : ""}" data-key="${escapeHtml(gameKey(game))}" aria-label="${selected ? "Remover" : "Adicionar"} ${escapeHtml(game.name)}">${selected ? icone("confere", 15) : icone("mais", 15)}</button>` : ""}</article>`;
}

function renderResults() {
    $("loadingState").classList.remove("visible");
    $("gamesGrid").innerHTML = state.results.map(game => cardMarkup(game)).join("");
    $("resultCount").textContent = `${state.results.length} ${state.results.length === 1 ? "jogo" : "jogos"}`;
    $("emptyState").classList.toggle("visible", !state.results.length);
}

function renderCollection() {
    $("collectionGrid").innerHTML = state.saved.map(game => cardMarkup(game)).join("");
    $("collectionEmpty").classList.toggle("visible", !state.saved.length);
    $("savedCount").textContent = state.saved.length;
}

function achievementSummary() {
    return [state.profile.steamAchievements].flatMap(value => Array.isArray(value) ? value : []).reduce((sum, game) => sum + Number(game.unlocked || game.earned || 0), 0);
}

function platformPanel({name, logo, connected, account, games = [], achievements = [], accent, note}) {
    const recent = games.slice(0, 8);
    const achieved = achievements.slice(0, 6);
    return `<article class="platform-panel" style="--platform:${accent}"><header><img src="${logo}" alt=""><div><span>${connected ? "CONECTADA" : "NÃO CONECTADA"}</span><h3>${name}</h3><p>${escapeHtml(account || note)}</p></div>${name === "Steam" && !connected ? `<button id="libraryConnectSteam">Conectar</button>` : ""}</header>${connected ? `<div class="platform-stats"><span><strong>${games.length}</strong> jogos</span><span><strong>${achievements.reduce((sum,item)=>sum+Number(item.unlocked||0),0)}</strong> conquistas</span></div><div class="platform-game-row">${recent.map(game=>`<article><img class="platform-game-cover" data-fallback="../assets/game-placeholder.svg" src="${srcSeguro(coverFor({...game,source:name.toLowerCase()}))}" alt=""><div><strong>${escapeHtml(game.name)}</strong><small>${Math.round((game.playtimeForever||0)/60)} h jogadas</small></div></article>`).join("") || `<p class="muted-copy">Os jogos ficam visíveis quando o perfil da plataforma permite.</p>`}</div>${achieved.length ? `<div class="achievement-list"><h4>Progresso de conquistas</h4>${achieved.map(item=>`<div><span>${escapeHtml(item.name)}</span><progress max="100" value="${Number(item.percentage||0)}"></progress><strong>${Number(item.unlocked||0)}/${Number(item.total||0)}</strong></div>`).join("")}</div>`:""}` : `<div class="platform-empty"><p>${escapeHtml(note)}</p></div>`}</article>`;
}

function renderPlatforms() {
    const p = state.profile;
    const providers = [
        {name:"Steam",logo:"../assets/steam.png",accent:"#4ba3e3",connected:!!p.steamConnected,account:p.steamProfile?.personaname,games:p.steamGames||[],achievements:p.steamAchievements||[],note:"Conecte com segurança para importar jogos, horas e conquistas públicas."}
    ];
    $("platformPanels").innerHTML = providers.map(platformPanel).join("");
    $("connectedCount").textContent = providers.filter(item=>item.connected).length;
    $("achievementCount").textContent = achievementSummary();
    $("libraryConnectSteam")?.addEventListener("click", connectSteam);
}

async function api(path, body={}) {
    const token = await state.user.getIdToken();
    const response = await fetch(`${APP_CONFIG.functionsBaseUrl}/${path}`, {method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json",...(await appCheckHeaders())},body:JSON.stringify(body)});
    const data = await response.json().catch(()=>({}));
    if (!response.ok) {
        const error = new Error(data.error || (response.status === 404 ? "Função ainda não publicada." : "Serviço indisponível."));
        error.status = response.status;
        throw error;
    }
    return data;
}

async function searchGames(query="") {
    $("libraryNotice").innerHTML = ""; $("libraryNotice").className = "library-notice"; $("loadingState").classList.add("visible"); $("gamesGrid").innerHTML=""; $("emptyState").classList.remove("visible");
    try { const data = await api("searchGames",{query}); state.results = data.games || []; if(!query)localStorage.setItem("sgCatalogCache",JSON.stringify(state.results)); renderResults(); }
    catch (error) {
        const cache=!query?JSON.parse(localStorage.getItem("sgCatalogCache")||"[]"):[];
        state.results=cache; renderResults();
        const setupPending = error.status === 404;
        $("libraryNotice").classList.add(setupPending ? "setup" : "offline");
        $("libraryNotice").innerHTML = `<div><strong>${setupPending ? "Catálogo aguardando ativação" : "Catálogo temporariamente indisponível"}</strong><span>${cache.length ? "Mostrando a última versão salva." : (setupPending ? "O administrador precisa publicar a integração antes do primeiro uso." : "Confira sua conexão e tente novamente.")}</span></div><button type="button" id="retryCatalog">Tentar novamente</button>`;
        $("retryCatalog")?.addEventListener("click",()=>searchGames($("gameSearch").value.trim()),{once:true});
        console.error(error);
    }
}

async function persistCollection() {
    await setDoc(doc(db,"users",state.user.uid),{games:state.saved.map(game=>({id:game.id||game.appid,name:game.name,cover:coverFor(game),genre:game.genre||game.genres?.join(" • ")||"",source:game.source||"catalog"})),updatedAt:serverTimestamp()},{merge:true});
}

async function toggleGame(key) {
    const source = [...state.results,...state.saved].find(game=>gameKey(game)===key); if(!source)return;
    const exists = state.saved.some(game=>gameKey(game)===key);
    state.saved = exists ? state.saved.filter(game=>gameKey(game)!==key) : [...state.saved,source];
    try { await persistCollection(); showToast(exists ? `${source.name} removido.` : `${source.name} adicionado!`); }
    catch { showToast("Não foi possível salvar agora."); }
    renderResults(); renderCollection();
}

async function connectSteam() {
    try { const token=await state.user.getIdToken(true),response=await fetch(`${APP_CONFIG.functionsBaseUrl}/steamStart`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json",...(await appCheckHeaders())}}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Não foi possível abrir a Steam.");window.location.assign(data.url); }
    catch(error){ showToast(error.message); }
}

let toastTimer;
function showToast(message){$("toastMessage").textContent=message;$("toast").classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("toast").classList.remove("show"),2800)}

document.querySelectorAll(".library-tab").forEach(button=>button.addEventListener("click",()=>{state.view=button.dataset.view;document.querySelectorAll(".library-tab").forEach(item=>item.classList.toggle("active",item===button));document.querySelectorAll(".library-view").forEach(view=>view.classList.toggle("active",view.id===`${state.view}View`));if(state.view==="collection")renderCollection();if(state.view==="platforms")renderPlatforms()}));
$("gameSearch").addEventListener("input",event=>{clearTimeout(state.timer);const query=event.target.value.trim();$("clearSearch").classList.toggle("visible",!!query);$("resultsTitle").textContent=query?"Resultados da busca":"Jogos em destaque";state.timer=setTimeout(()=>searchGames(query),450)});
$("clearSearch").addEventListener("click",()=>{$("gameSearch").value="";$("clearSearch").classList.remove("visible");$("resultsTitle").textContent="Jogos em destaque";searchGames();$("gameSearch").focus()});
$("gamesGrid").addEventListener("click",event=>{const button=event.target.closest(".add-game");if(button)toggleGame(button.dataset.key)});$("collectionGrid").addEventListener("click",event=>{const button=event.target.closest(".add-game");if(button)toggleGame(button.dataset.key)});

auth.onAuthStateChanged(async user=>{if(!user){window.location.replace("../login.html");return}state.user=user;try{const snapshot=await getDoc(doc(db,"users",user.uid));state.profile=snapshot.exists()?snapshot.data():{};state.saved=(Array.isArray(state.profile.games)?state.profile.games:[]).map(normalizedGame).filter(game=>game?.name)}catch(error){console.error(error);showToast("Não foi possível carregar seu perfil.")}renderCollection();renderPlatforms();searchGames()});

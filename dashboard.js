import {publishPost as publishApprovedPost,installPendingPosts} from "./post-publication.js";
import {assertPublicText} from "./safety.js";
import { auth, db } from "./firebase.js";
import { APP_CONFIG } from "./config.js";
import { signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, updateDoc, where } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

import { srcSeguro } from "./seguranca-web.js";
import { escreverComLimite, mensagemDeLimite } from "./limites.js";
import { icone, coracaoCheio } from "./icones.js";
import { profileBadges, postBadges } from "./badges.js";
import { uploadMedia, prepareImage } from "./media-upload.js";
import {validatePollOptions,voteIndex,assertVoteIndex} from "./poll-domain.js";

const $ = id => document.getElementById(id);
const modal = $("postModal");
const toast = $("appToast");
let currentUser = null;
let currentProfile = null;
let activePostType = "text";
let feedPosts = [];
let activeFeedFilter = "all";

function notify(message, type = "info") {
    toast.textContent = message;
    toast.dataset.type = type;
    toast.classList.add("show");
    window.clearTimeout(notify.timeout);
    notify.timeout = window.setTimeout(() => toast.classList.remove("show"), 3600);
}

$("shareProfileButton")?.addEventListener("click", async () => {
    if (!currentUser) return;
    await navigator.clipboard.writeText(`${location.origin}/profile.html?u=${encodeURIComponent(currentUser.uid)}`);
    notify("Link do seu perfil copiado.", "success");
});

function setAvatar(element, profile, user) {
    const photo = profile?.photoURL || user?.photoURL;
    if (photo) {
        element.textContent = "";
        const img = document.createElement("img");
        img.src = photo;
        img.alt = `Foto de ${profile?.name || "usuário"}`;
        element.appendChild(img);
        if (element.id === "profileAvatar") {
            const dot = document.createElement("span");
            dot.className = "online-dot";
            element.appendChild(dot);
        }
    } else {
        element.firstChild.textContent = (profile?.name || user?.email || "G").charAt(0).toUpperCase();
    }
}

async function loadDashboard(user) {
    const snapshot = await getDoc(doc(db, "users", user.uid));
    if (!snapshot.exists() || snapshot.data().profileCompleted !== true) {
        window.location.replace("Onboarding/onboarding.html");
        return;
    }
    currentProfile = snapshot.data();
    try {
        await setDoc(doc(db, "publicProfiles", user.uid), publicProfile(currentProfile, user), { merge: true });
    } catch (error) {
        // se o perfil publico nao sincronizar, o resto da pagina ainda monta
        console.error("Perfil público não sincronizou:", error);
    }
    $("profileUsername").textContent = currentProfile.name || currentProfile.username || "Jogador";
    $("profileHandle").textContent = `@${currentProfile.username || "jogador"}`;
    $("profileEmail").textContent = currentProfile.bio || user.email || "Seu perfil gamer no Something Gamer.";
    $("gamesCount").textContent = Array.isArray(currentProfile.games) ? currentProfile.games.length : 0;
    const [followers,following]=await Promise.all([getDocs(query(collection(db,"follows"),where("toUid","==",user.uid))),getDocs(query(collection(db,"follows"),where("fromUid","==",user.uid)))]);
    $("followersCount").textContent = followers.size;
    $("followingCount").textContent = following.size;
    renderAchievements(followers.size,currentProfile);
    $("levelCount").textContent = currentProfile.level || 1;
    setAvatar($("profileAvatar"), currentProfile, user);
    if ($("postAvatar")) setAvatar($("postAvatar"), currentProfile, user);
    renderLibrary(currentProfile);
    renderConnections(currentProfile);
    renderVerification(currentProfile);
    watchActivity(user.uid);
    await loadPromotion();
    if (currentProfile.welcomeSeen !== true) openWelcome();
}

function watchActivity(uid){const target=$("activityList");if(!target)return;onSnapshot(query(collection(db,"notifications"),where("toUid","==",uid),orderBy("createdAt","desc"),limit(30)),snapshot=>{const items=snapshot.docs,unread=items.filter(entry=>entry.data().read===false);$("notificationCount").textContent=String(Math.min(99,unread.length));$("notificationLauncher").classList.toggle("has-unread",unread.length>0);target.innerHTML=items.length?items.map(entry=>{const item=entry.data();return `<button type="button" class="activity-item ${item.special?"special":""} ${item.read===false?"unread":""}" data-notification="${entry.id}"><span class="activity-dot"></span><span class="activity-body"><strong>${escapeHtml(String(item.title||"Nova notificação").slice(0,100))}</strong><span class="activity-description">${escapeHtml(String(item.message||"").slice(0,320))}</span></span></button>`}).join(""):`<div class="notification-empty"><span>🔔</span><strong>Tudo em dia</strong><p>Suas novas notificações aparecerão aqui.</p></div>`;},error=>console.warn("Atividade indisponível",error));}

document.body.append($("notificationCenter"));
$("notificationLauncher")?.addEventListener("click",()=>$("notificationCenter")?.classList.add("open"));
$("notificationClose")?.addEventListener("click",()=>$("notificationCenter")?.classList.remove("open"));
$("activityList")?.addEventListener("click",async event=>{const row=event.target.closest("[data-notification]");if(!row||!currentUser)return;row.classList.remove("unread");await updateDoc(doc(db,"notifications",row.dataset.notification),{read:true,readAt:serverTimestamp()}).catch(()=>{});});

function renderAchievements(followers,profile={}){
    const milestones=[
      [0,"Conta criada","Perfil no Something Gamer"],
      [1,"Primeiro seguidor","1 pessoa acompanha seu perfil"],
      [10,"10 seguidores","Sua comunidade está crescendo"],
      [100,"100 seguidores","Sua comunidade alcançou 100 pessoas"],
      [1000,"1.000 seguidores","Mil pessoas acompanham seu perfil"],
      [10000,"10.000 seguidores","Dez mil seguidores"],
      [100000,"100.000 seguidores","Cem mil seguidores"],
      [1000000,"1 milhão de seguidores","Um milhão de seguidores"]
    ].filter(item=>followers>=item[0]);
    if(profile.verification?.status==='active')milestones.push([0,'Conta verificada','Verificação ativa no Something Gamer']);
    const list=$("achievementList");
    list.innerHTML=milestones.reverse().map(([n,title,description])=>`<article class="achievement-card"><span class="v651-ach-icon" aria-hidden="true">✓</span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p></div></article>`).join("");
}

function publicProfile(profile, user) {
    return { uid:user.uid, name:profile.name||user.displayName||"Gamer", username:profile.username||"gamer", bio:profile.bio||"", photoURL:profile.photoURL||"", accountType:profile.accountType||"gamer", verification:profile.verification||{}, verificationBadgeTheme:profile.verificationBadgeTheme||"blue", badges:profile.badges||{}, visibility:profile.profileVisibility||"public", updatedAt:serverTimestamp() };
}

function renderVerification(profile) {
    const verified = profile.verification?.status === "active" && (!profile.verification.expiresAt || profile.verification.expiresAt.toMillis?.() > Date.now());
    const type = document.querySelector(".profile-type");
    const seals = profileBadges(profile);
    type.innerHTML = `${profile.accountType==="official_now"?"NOW OFICIAL":profile.accountType==="official_sg"?"SG OFICIAL":"GAMER"} ${seals}`;
    document.querySelector(".profile-card").classList.toggle("is-verified", verified);
    const state = document.getElementById("sg69VerificationState");
    if (state) state.textContent = verified ? "Selo ativo no seu perfil. Consulte o período e detalhes da verificação." : profile.verification?.status === "pending" ? "Sua solicitação está em análise. Acompanhe o status sem enviar novos pagamentos." : "Escolha um período, solicite análise e acompanhe seu status. O selo não é ativado automaticamente pelo pagamento.";
}

async function loadPromotion() {
    try {
        const snapshot = await getDocs(collection(db, "promotions"));
        const active = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => item.active !== false && (item.remainingQuantity == null || item.remainingQuantity > 0) && (!item.endsAt?.toMillis || item.endsAt.toMillis() > Date.now())).sort((a,b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))[0];
        if (!active) return;
        const banner = $("promotionBanner");
        const promotionUrl = safeExternalUrl(active.buttonUrl);
        banner.innerHTML = `<div><span>PROMOÇÃO${active.quantityLimit?` · ${active.remainingQuantity??active.quantityLimit} DISPONÍVEIS`:" · ILIMITADA"}</span><strong>${escapeHtml(active.title)}</strong><p>${escapeHtml(active.description)}</p></div><button type="button" data-promotion-id="${active.id}">${escapeHtml(active.buttonLabel || "Aproveitar")}</button>`;
        banner.querySelector("button").addEventListener("click",async()=>{if(active.quantityLimit){try{await runTransaction(db,async transaction=>{const ref=doc(db,"promotions",active.id),claimRef=doc(db,"promotionClaims",`${active.id}_${currentUser.uid}`),snap=await transaction.get(ref),claim=await transaction.get(claimRef);if(claim.exists())throw new Error("JA_RESERVADA");const remaining=snap.data()?.remainingQuantity;if(!snap.exists()||remaining<1)throw new Error("ESGOTADA");transaction.set(claimRef,{uid:currentUser.uid,promotionId:active.id,createdAt:serverTimestamp()});transaction.update(ref,{remainingQuantity:remaining-1});});}catch(error){return notify(error.message==="JA_RESERVADA"?"Você já reservou esta promoção.":"Esta promoção esgotou.","error");}}if(promotionUrl)window.open(promotionUrl,"_blank","noopener");else notify("Promoção reservada com sucesso.","success");});
        banner.hidden = false;
    } catch (error) { console.warn("Promoção indisponível", error); }
}

const welcomeSlides = [
    ["Sua identidade gamer começa aqui.", "Reúna seu perfil, seus jogos, suas conquistas e sua comunidade em um único lugar."],
    ["Conecte sua Steam.", "Sincronize sua biblioteca e mostre sua trajetória nos jogos com segurança."],
    ["Ganhe visibilidade.", "Publique, participe de eventos e ative a Verificação Gamer para destacar sua conta."]
];
let welcomeStep = 0;
function paintWelcome() {
    $("welcomeTitle").textContent = welcomeSlides[welcomeStep][0];
    $("welcomeText").textContent = welcomeSlides[welcomeStep][1];
    $("welcomeProgress").style.width = `${((welcomeStep + 1) / welcomeSlides.length) * 100}%`;
    $("welcomeNext").textContent = welcomeStep === welcomeSlides.length - 1 ? "Entrar no Something Gamer" : "Continuar";
}
function openWelcome() { $("welcomeExperience").classList.add("active"); $("welcomeExperience").setAttribute("aria-hidden", "false"); paintWelcome(); }
async function finishWelcome() { $("welcomeExperience").classList.remove("active"); $("welcomeExperience").setAttribute("aria-hidden", "true"); try { await updateDoc(doc(db,"users",currentUser.uid), { welcomeSeen: true, updatedAt: serverTimestamp() }); } catch (error) { console.warn(error); } }

function renderLibrary(profile) {
    const container = document.querySelector(".empty-library");
    const manual = Array.isArray(profile.games) ? profile.games : [];
    const steamGames = Array.isArray(profile.steamGames) ? profile.steamGames.slice(0, 4) : [];
    const names = [...new Set([...manual.map(game => typeof game === "string" ? game : game.name), ...steamGames.map(game => game.name)])].filter(Boolean).slice(0, 6);
    if (!names.length) return;
    container.className = "library-preview";
    container.innerHTML = names.map(name => `<span>${escapeHtml(name)}</span>`).join("");
}

function renderConnections(profile) {
    const connected = Boolean(profile.steamConnected && profile.steamProfile?.steamid);
    $("steamStatus").textContent = connected ? `${profile.steamProfile.personaname} · ${profile.steamGames?.length || 0} jogos` : "Não conectada";
    $("connectSteam").textContent = connected ? "Atualizar" : "Conectar";
    $("connectSteam").classList.toggle("connected", connected);
}

function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value || "";
    return div.innerHTML;
}

function safeExternalUrl(value) {
    try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch { return ""; }
}

function selectPostType(type) {
    activePostType = type;
    document.querySelectorAll(".post-type").forEach(button => button.classList.toggle("active", button.dataset.type === type));
    $("mediaUpload").style.display = ["image", "video"].includes(type) ? "flex" : "none";
    const fileInput=$("postFile");
    if (fileInput) fileInput.accept = type === "video" ? "video/mp4,video/webm,video/quicktime" : "image/jpeg,image/png,image/webp,image/gif";
    if (fileInput) fileInput.value="";
    updateDashboardPreview();
    $("pollFields").style.display = type === "poll" ? "flex" : "none";
}

function openPostModal(type = "text") {
    selectPostType(type);
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    $("postTitle").focus();
    updateDashboardPreview();
}

function closePostModal() {
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
}

let dashboardPreviewUrl = "";
function updateDashboardPreview() {
    const preview = $("sg69DashboardMediaPreview");
    if (!preview) return;
    if (dashboardPreviewUrl) { URL.revokeObjectURL(dashboardPreviewUrl); dashboardPreviewUrl = ""; }
    const file = $("postFile")?.files?.[0];
    preview.replaceChildren();
    preview.hidden = !file;
    if (!file) return;
    const isImage=file.type.startsWith("image/");
    if (!isImage && !file.type.startsWith("video/")) { preview.textContent="Formato inválido."; return; }
    if (file.size > APP_CONFIG.maxPostFileSize) { preview.textContent="Arquivo acima de 20 MB. Escolha um menor."; return; }
    dashboardPreviewUrl = URL.createObjectURL(file);
    const item=document.createElement(isImage?"img":"video");
    item.src=dashboardPreviewUrl;
    if (isImage) item.alt="Prévia da imagem selecionada";
    else { item.controls=true;item.preload="metadata"; }
    preview.append(item,document.createTextNode(`${file.name} · ${(file.size/1048576).toFixed(1)} MB`));
}
$("postFile")?.addEventListener("change",updateDashboardPreview);
async function uploadPostFile(file) {
    if (!file) return { url: "", mediaId: "", file };
    const expected = activePostType === "image" ? "image/" : activePostType === "video" ? "video/" : "";
    if (expected && !file.type.startsWith(expected)) throw new Error(activePostType === "image" ? "Escolha um arquivo de imagem." : "Escolha um arquivo de vídeo.");
    $("publishPost").textContent = "Preparando mídia...";
    const ready = file.type.startsWith("image/") ? await prepareImage(file) : file;
    $("publishPost").textContent = "Enviando mídia...";
    const uploaded = await uploadMedia(ready, { maxBytes: APP_CONFIG.maxPostFileSize, label: ready.type.startsWith("video/") ? "vídeo" : "imagem" });
    return { ...uploaded, file: ready };
}

async function publishPost() {
    let title, description;
    try {
        const rawTitle=$("postTitle").value.trim(),rawDescription=$("postDescription").value.trim();
        title = rawTitle ? await assertPublicText(rawTitle, {field:"O título",min:2,max:100}) : (activePostType==="text"?"":`Publicação de ${currentProfile.name||currentProfile.username||"Gamer"}`);
        description = rawDescription ? await assertPublicText(rawDescription, {field:"A publicação",min:2,max:2000}) : "";
    } catch (error) {
        return notify(error.message, "error");
    }
    const button = $("publishPost");
    if (activePostType==="text"&&!description) return notify("Escreva algo para publicar.", "error");
    if (["image","video"].includes(activePostType)&&!$("postFile").files[0]) return notify(activePostType==="image"?"Escolha uma imagem.":"Escolha um vídeo.","error");
    const pollOptions = activePostType === "poll" ? [...$("pollFields").querySelectorAll("input")].map(input => input.value.trim()).filter(Boolean) : [];
    if(activePostType === "poll"){try{validatePollOptions(pollOptions);}catch(error){return notify(error.message,"error");}}
    try {
        button.disabled = true;
        button.textContent = "Publicando...";
        const uploaded = await uploadPostFile($("postFile").files[0]);
        const mediaUrl = uploaded.url || "";

        const publication=await publishApprovedPost(currentUser.uid, doc(collection(db, "posts")), {
            uid: currentUser.uid,
            authorName: currentProfile.name || currentProfile.username,
            authorUsername: currentProfile.username || "",
            authorPhoto: currentProfile.photoURL || "",
            type: activePostType,
            title,
            description,
            tags: $("postTags").value.split(/[ ,]+/).map(tag => tag.replace(/^#/, "").trim()).filter(Boolean).slice(0, 10),
            pollOptions,
            mediaUrl,
            mediaType: uploaded.file?.type || "",
            mediaId: uploaded.mediaId || "",
            authorVerified: currentProfile.verification?.status === "active",
            authorAccountType: currentProfile.accountType || "gamer",
            authorBadgeTheme: currentProfile.verificationBadgeTheme || "blue",
            authorBadges: currentProfile.badges || {},
            createdAt: serverTimestamp()
        });
        document.querySelector(".post-form").querySelectorAll("input, textarea").forEach(field => { if (field.type !== "file") field.value = ""; });
        $("postFile").value = "";
        updateDashboardPreview();
        closePostModal();
        notify(publication.published?"Publicação criada com sucesso.":"Publicação enviada para análise. Ainda não está no feed.", "success");
    } catch (error) {
        console.error(error);
        const friendly=error?.code==="permission-denied"?"Sua sessão ou as regras impediram a publicação. Atualize a página e tente novamente.":error?.code==="unavailable"?"Sem conexão com o servidor. Verifique a internet e tente novamente.":"";
        notify(mensagemDeLimite(error, "uma publicação") || friendly || error.message || "Não foi possível publicar.", "error");
    } finally {
        button.disabled = false;
        button.textContent = "Publicar";
    }
}

function relativeTime(value) {
    const milliseconds = value?.toMillis?.() || Date.now();
    const minutes = Math.max(0, Math.floor((Date.now() - milliseconds) / 60000));
    if (minutes < 1) return "agora";
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h`;
    return `${Math.floor(hours / 24)} d`;
}

function postMedia(post) {
    const media = safeExternalUrl(post.mediaUrl);
    if (!media) return "";
    if (post.mediaType?.startsWith("video")) return `<video class="feed-media" src="${srcSeguro(media)}" controls preload="metadata"></video>`;
    return `<img class="feed-media" src="${srcSeguro(media)}" alt="Imagem da publicação de ${escapeHtml(post.authorName)}" loading="lazy">`;
}

function pollMarkup(post) {
    if (post.type !== "poll" || !post.pollOptions?.length) return "";
    return `<div class="feed-poll">${post.pollOptions.map((option,index) => `<button type="button" data-poll="${index}"><span>${escapeHtml(option)}</span><i></i></button>`).join("")}</div>`;
}

function renderFeed() {
    const filtered = feedPosts.filter(post => activeFeedFilter === "all" || (activeFeedFilter === "video" ? post.type === "video" || post.mediaType?.startsWith("video") : post.tags?.some(tag => ["noticia","noticias","news","novidade"].includes(tag.toLowerCase()))));
    $("feedList").innerHTML = filtered.length ? filtered.map(post => `<article class="feed-post" data-post-id="${post.id}">
        <header><div class="feed-avatar">${post.authorPhoto ? `<img src="${srcSeguro(post.authorPhoto)}" alt="">` : escapeHtml((post.authorName || "G").charAt(0).toUpperCase())}</div><div><strong>${escapeHtml(post.authorName || "Gamer")}${postBadges(post)}</strong><span>@${escapeHtml(post.authorUsername || "gamer")} · ${relativeTime(post.createdAt)}</span></div><button class="post-menu" aria-label="Mais opções">•••</button></header>
        <div class="feed-copy"><h3>${escapeHtml(post.title)}</h3><p>${escapeHtml(post.description)}</p>${post.tags?.length ? `<div class="feed-tags">${post.tags.map(tag => `<span>#${escapeHtml(tag)}</span>`).join("")}</div>` : ""}</div>
        ${postMedia(post)}${pollMarkup(post)}
        <footer><button class="feed-action like-action" data-action="like"><span class="acao-icone"><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 20.2S4.4 15.4 4.4 10.4A4.2 4.2 0 0 1 12 7.7a4.2 4.2 0 0 1 7.6 2.7c0 5-7.6 9.8-7.6 9.8Z"/></svg></span> Curtir <b data-like-count>0</b></button><button class="feed-action" data-action="comment"><span class="acao-icone"><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4.2 5.4h15.6a1.6 1.6 0 0 1 1.6 1.6v8.2a1.6 1.6 0 0 1-1.6 1.6H9.6L5 20.6v-3.8H4.2a1.6 1.6 0 0 1-1.6-1.6V7a1.6 1.6 0 0 1 1.6-1.6Z"/></svg></span> Comentar</button><button class="feed-action" data-action="share"><span class="acao-icone"><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="18" cy="6" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="18" r="2.6"/><path d="M8.3 10.7 15.7 7.2M8.3 13.3l7.4 3.5"/></svg></span> Compartilhar</button></footer>
        <form class="comment-form" hidden><input type="text" maxlength="240" placeholder="Escreva um comentário..."><button>Enviar</button></form>
    </article>`).join("") : `<div class="feed-empty"><strong>Nenhuma publicação aqui ainda.</strong><p>Publique uma imagem, vídeo ou notícia para iniciar a conversa.</p></div>`;
    refreshFeedSocialState(filtered);
    renderFriendSuggestions();
}

async function refreshFeedSocialState(posts) {
    await Promise.all(posts.map(async post => {
        try {
            const [likes, ownLike, ownVote] = await Promise.all([getDocs(collection(db,"posts",post.id,"likes")), getDoc(doc(db,"posts",post.id,"likes",currentUser.uid)), getDoc(doc(db,"posts",post.id,"votes",currentUser.uid))]);
            const card = document.querySelector(`[data-post-id="${post.id}"]`);
            if (!card) return;
            card.querySelector("[data-like-count]").textContent = likes.size || "";
            card.querySelector(".like-action").classList.toggle("active", ownLike.exists());
            card.querySelector(".like-action .acao-icone").innerHTML = ownLike.exists() ? coracaoCheio(16) : icone("coracao", 16);
            if(ownVote.exists()){
                const selected=voteIndex(ownVote.data().option,post.pollOptions);
                card.querySelectorAll('[data-poll]').forEach(button=>{button.disabled=true;button.classList.toggle('selected',selected!==null&&Number(button.dataset.poll)===selected);});
            }
        } catch (error) { console.warn("Interações indisponíveis", error); }
    }));
}

function renderFriendSuggestions() {
    const people = [...new Map(feedPosts.filter(post => post.uid && post.uid !== currentUser.uid).map(post => [post.uid,post])).values()].slice(0,5);
    $("friendSuggestions").innerHTML = people.length ? people.map(person => `<article><div class="suggestion-avatar">${person.authorPhoto ? `<img src="${srcSeguro(person.authorPhoto)}" alt="">` : escapeHtml((person.authorName || "G").charAt(0))}</div><div><strong>${escapeHtml(person.authorName || "Gamer")}</strong><span>@${escapeHtml(person.authorUsername || "gamer")}</span></div><button data-friend="${person.uid}">Adicionar</button></article>`).join("") : `<p>As sugestões aparecerão conforme a comunidade publicar.</p>`;
}

function startFeed() {
    const postsQuery = query(collection(db,"posts"),orderBy("createdAt","desc"),limit(30));
    onSnapshot(postsQuery,snapshot=>{feedPosts=snapshot.docs.map(item=>({id:item.id,...item.data()}));renderFeed()},error=>{console.error(error);$("feedList").innerHTML=`<div class="feed-empty"><strong>Não foi possível carregar o feed.</strong><p>Verifique sua conexão e tente novamente.</p></div>`});
}

async function handleFeedClick(event) {
    const card = event.target.closest(".feed-post");
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (card && action === "like") {
        const likeRef=doc(db,"posts",card.dataset.postId,"likes",currentUser.uid); const liked=(await getDoc(likeRef)).exists();
        if(liked) await deleteDoc(likeRef); else await setDoc(likeRef,{uid:currentUser.uid,createdAt:serverTimestamp()});
        refreshFeedSocialState(feedPosts.filter(post=>post.id===card.dataset.postId));
    }
    if (card && action === "comment") { const form=card.querySelector(".comment-form");form.hidden=!form.hidden;if(!form.hidden)form.querySelector("input").focus(); }
    if (card && action === "share") { await navigator.clipboard.writeText(`${location.origin}${location.pathname}#post-${card.dataset.postId}`); notify("Link da publicação copiado.","success"); }
    const friend=event.target.closest("[data-friend]");
    if(friend){await setDoc(doc(db,"friendRequests",`${currentUser.uid}_${friend.dataset.friend}`),{fromUid:currentUser.uid,toUid:friend.dataset.friend,status:"pending",createdAt:serverTimestamp()});friend.textContent="Enviado";friend.disabled=true;notify("Pedido de amizade enviado.","success")}
    const poll=event.target.closest("[data-poll]");if(poll&&card){poll.disabled=true;try{const post=feedPosts.find(item=>item.id===card.dataset.postId);const option=assertVoteIndex(Number(poll.dataset.poll),post);await setDoc(doc(db,"posts",card.dataset.postId,"votes",currentUser.uid),{uid:currentUser.uid,option,updatedAt:serverTimestamp()});poll.closest(".feed-poll").querySelectorAll("button").forEach(item=>item.disabled=true);poll.classList.add("selected");notify("Voto registrado.","success")}catch(error){poll.disabled=false;notify(error.message||"Não foi possível registrar o voto.","error")}}
}

async function handleComment(event) {
    const form=event.target.closest(".comment-form");if(!form)return;event.preventDefault();const input=form.querySelector("input");const text=input.value.trim();if(!text)return;
    const postId=form.closest(".feed-post").dataset.postId;await escreverComLimite(currentUser.uid,"comentario",doc(collection(db,"posts",postId,"comments")),{uid:currentUser.uid,authorName:currentProfile.name||currentProfile.username,text,createdAt:serverTimestamp()});input.value="";form.hidden=true;notify("Comentário enviado.","success");
}

async function connectSteam() {
    try {
        const button = $("connectSteam");
        button.disabled = true;
        button.textContent = "Abrindo Steam...";
        const token = await currentUser.getIdToken(true);
        const response = await fetch(`${APP_CONFIG.functionsBaseUrl}/steamStart`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(await appCheckHeaders()) } });
        const payload = await response.json();
        if (!response.ok || !payload.url) throw new Error(payload.error || "Não foi possível iniciar a conexão.");
        window.location.assign(payload.url);
    } catch (error) {
        $("connectSteam").disabled = false;
        $("connectSteam").textContent = currentProfile?.steamConnected ? "Atualizar" : "Conectar";
        notify(error.message, "error");
    }
}

auth.onAuthStateChanged(async user => {
    if (!user) return window.location.replace("login.html");
    currentUser = user;
    try { await loadDashboard(user); } catch (error) { console.error(error); notify("Não foi possível carregar seu perfil.", "error"); }
});

$("profileButton").addEventListener("click", async () => { await signOut(auth); window.location.replace("login.html"); });
$("viewAllGames").addEventListener("click", () => window.location.assign("Games/Games.html"));
$("connectSteam").addEventListener("click", connectSteam);
$("openPostCreator").addEventListener("click", () => openPostModal("text"));
$("postFile")?.addEventListener("change", event => {
    const file = event.target.files?.[0];
    const box = $("mediaUpload");
    box.querySelector("[data-media-preview]")?.remove();
    if (!file) return;
    const preview = document.createElement(file.type.startsWith("video/") ? "video" : "img");
    preview.dataset.mediaPreview = "1";
    preview.className = "post-media-preview";
    preview.src = URL.createObjectURL(file);
    if (preview.tagName === "VIDEO") { preview.controls = true; preview.muted = true; }
    preview.onload = preview.onloadedmetadata = () => URL.revokeObjectURL(preview.src);
    box.appendChild(preview);
});

$("postImageBtn").addEventListener("click", () => openPostModal("image"));
$("postVideoBtn").addEventListener("click", () => openPostModal("video"));
$("postPollBtn").addEventListener("click", () => openPostModal("poll"));
$("closePostButton").addEventListener("click", closePostModal);
$("closePostModal").addEventListener("click", closePostModal);
$("publishPost").addEventListener("click", publishPost);
document.querySelectorAll(".post-type").forEach(button => button.addEventListener("click", () => selectPostType(button.dataset.type)));
document.addEventListener("keydown", event => { if (event.key === "Escape") closePostModal(); });
$("welcomeSkip").addEventListener("click", finishWelcome);
$("welcomeNext").addEventListener("click", async () => { if (welcomeStep < welcomeSlides.length - 1) { welcomeStep += 1; paintWelcome(); } else await finishWelcome(); });
$("feedList").addEventListener("click",event=>handleFeedClick(event).catch(error=>notify(error.message||"Não foi possível concluir.","error")));
$("feedList").addEventListener("submit",event=>handleComment(event).catch(error=>notify(error.message||"Não foi possível comentar.","error")));
$("friendSuggestions").addEventListener("click",event=>handleFeedClick(event).catch(error=>notify(error.message||"Não foi possível adicionar.","error")));
document.querySelectorAll(".feed-filter").forEach(button=>button.addEventListener("click",()=>{activeFeedFilter=button.dataset.feed;document.querySelectorAll(".feed-filter").forEach(item=>item.classList.toggle("active",item===button));renderFeed()}));

installPendingPosts();

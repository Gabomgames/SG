const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { createFoundersService } = require("./founders");
const { defineSecret, defineBoolean } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getAppCheck } = require("firebase-admin/app-check");
const { FieldValue, Timestamp, getFirestore } = require("firebase-admin/firestore");
const crypto = require("node:crypto");

initializeApp();
const db = getFirestore();
const steamApiKey = defineSecret("STEAM_API_KEY");
const rawgApiKey = defineSecret("RAWG_API_KEY");
const mercadoPagoToken = defineSecret("MERCADO_PAGO_ACCESS_TOKEN");
const resendApiKey = defineSecret("RESEND_API_KEY");
const emailFrom = defineSecret("EMAIL_FROM");
const resetCodeSecret = defineSecret("RESET_CODE_SECRET");
const mercadoPagoWebhookSecret = defineSecret("MERCADO_PAGO_WEBHOOK_SECRET");
const giphyApiKey = defineSecret("GIPHY_API_KEY");
const appCheckEnforced = defineBoolean("APP_CHECK_ENFORCED", { default: false });
const foundersLaunchEnabled = defineBoolean("SG_FOUNDERS_LAUNCH_ENABLED", { default: false });
const founders = createFoundersService({db,auth:getAuth(),Timestamp,enabled:()=>foundersLaunchEnabled.value()});

// Both gates default closed. No client can turn on the official launch.
exports.syncFounderEligibility = onRequest({region:"us-central1"},async(req,res)=>{
    cors(req,res);
    if(req.method==='OPTIONS')return res.status(204).end();
    if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
    try {
        const header=req.get('authorization')||'';
        if(!header.startsWith('Bearer '))return res.status(401).json({error:'UNAUTHENTICATED'});
        const token=await getAuth().verifyIdToken(header.slice(7),true);
        const localDemo=process.env.FUNCTIONS_EMULATOR==='true' && String(process.env.GCLOUD_PROJECT||'').startsWith('demo-');
        if(!localDemo)await getAppCheck().verifyToken(req.get('X-Firebase-AppCheck')||'');
        // uid, email, verification state and eligibility time never come from body.
        return res.json(await founders.sync(token.uid));
    } catch(error){
        console.warn('founder_sync_failed',{code:error.code||'FOUNDER_SYNC_FAILED'});
        return res.status(503).json({error:'FOUNDER_SYNC_UNAVAILABLE'});
    }
});
exports.founderProfileCreated=onDocumentCreated({region:'us-central1',document:'users/{uid}'},event=>founders.sync(event.params.uid));
exports.founderRiskReviewed=onDocumentWritten({region:'us-central1',document:'founderRisk/{uid}'},event=>founders.sync(event.params.uid));
exports.expireFounderGrants=onSchedule({region:'us-central1',schedule:'every 1 minutes'},()=>founders.expire());
const APP_URL = "https://something-gamer.web.app";
const FUNCTIONS_BASE = "https://us-central1-something-gamer.cloudfunctions.net";
const allowedOrigins = new Set([APP_URL, "https://something-gamer.firebaseapp.com", "http://localhost:5000", "http://127.0.0.1:5000", "http://localhost:5500", "http://127.0.0.1:5500"]);

function cors(req, res) {
    const origin = req.get("origin");
    if (origin && !allowedOrigins.has(origin)) { res.status(403).json({error:"Origem não autorizada."}); throw new Error("FORBIDDEN"); }
    if (origin && allowedOrigins.has(origin)) res.set("Access-Control-Allow-Origin", origin);
    res.set("Cache-Control", "no-store");
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Firebase-AppCheck");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
}

async function requireFirebaseUser(req) {
    const header = req.get("authorization") || "";
    if (!header.startsWith("Bearer ")) throw new Error("UNAUTHENTICATED");
    return getAuth().verifyIdToken(header.slice(7));
}
const TERMS_VERSION = "2026-09-16";
const PRIVACY_VERSION = "2026-09-16";
const COMMUNITY_RULES_VERSION = "2026-09-16";

function legalAccepted(data = {}) {
    const legal = data.legal || {};
    return legal.termsAccepted === true
        && legal.termsVersion === TERMS_VERSION
        && legal.privacyVersion === PRIVACY_VERSION
        && legal.communityRulesVersion === COMMUNITY_RULES_VERSION;
}

async function requireParticipatingUser(req) {
    const user = await requireFirebaseUser(req);
    const snapshot = await db.collection("users").doc(user.uid).get();
    if (!snapshot.exists || !legalAccepted(snapshot.data() || {})) throw new Error("TERMS_REQUIRED");
    const moderation = snapshot.data()?.moderation || {};
    if (moderation.status === "banned") throw new Error("FORBIDDEN");
    if (moderation.status === "suspended" && moderation.suspendedUntil?.toMillis?.() > Date.now()) throw new Error("FORBIDDEN");
    return user;
}


// Começa em modo de observação para não bloquear usuários antes da chave
// reCAPTCHA Enterprise ser cadastrada no Firebase App Check. Depois de validar
// as métricas, troque para true e publique novamente para exigir token também
// nestes endpoints HTTP personalizados. Firestore/Storage são controlados pelo
// enforcement do próprio Firebase Console.
async function verifyAppCheck(req) {
    const token = req.get("X-Firebase-AppCheck") || "";
    if (!token) {
        if (appCheckEnforced.value()) throw new Error("APP_CHECK_REQUIRED");
        return null;
    }
    try {
        return await getAppCheck().verifyToken(token);
    } catch (error) {
        console.warn("App Check inválido", error.message);
        if (appCheckEnforced.value()) throw new Error("APP_CHECK_INVALID");
        return null;
    }
}

function callbackUrl() {
    return `${FUNCTIONS_BASE}/steamCallback`;
}

// Limite simples por usuário para não queimar a cota das APIs externas.
async function limitarUso(uid, acao, janelaMs, maximo) {
    const ref = db.collection("rateLimits").doc(`${acao}_${uid}`);
    const agora = Date.now();
    await db.runTransaction(async transaction => {
        const atual = (await transaction.get(ref)).data();
        if (atual && agora - atual.inicio < janelaMs) {
            if (atual.total >= maximo) throw new Error("RATE_LIMITED");
            transaction.update(ref, { total: FieldValue.increment(1) });
        } else {
            transaction.set(ref, { inicio: agora, total: 1 });
        }
    });
}

exports.steamStart = onRequest({ region: "us-central1", cors: false }, async (req, res) => {
    cors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });
    try {
        await verifyAppCheck(req);
        const user = await requireParticipatingUser(req);
        await limitarUso(user.uid, "steamStart", 60 * 60 * 1000, 10);
        const state = crypto.randomBytes(32).toString("hex");
        const requestOrigin = req.get("origin");
        await db.collection("steamAuthStates").doc(state).set({ uid: user.uid, returnOrigin: allowedOrigins.has(requestOrigin) ? requestOrigin : APP_URL, createdAt: FieldValue.serverTimestamp(), expiresAt: Date.now() + 10 * 60 * 1000 });
        const returnTo = `${callbackUrl()}?state=${state}`;
        const params = new URLSearchParams({
            "openid.ns": "http://specs.openid.net/auth/2.0",
            "openid.mode": "checkid_setup",
            "openid.return_to": returnTo,
            "openid.realm": FUNCTIONS_BASE,
            "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
            "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select"
        });
        return res.json({ url: `https://steamcommunity.com/openid/login?${params}` });
    } catch (error) {
        console.error("steamStart", error);
        if (error.message === "RATE_LIMITED") return res.status(429).json({ error: "Muitas tentativas seguidas. Tente de novo mais tarde." });
        if (error.message === "TERMS_REQUIRED") return res.status(403).json({ error: "Aceite os Termos de Uso atuais para continuar." });
        return res.status(error.message === "UNAUTHENTICATED" ? 401 : 500).json({ error: "Não foi possível iniciar a conexão com a Steam." });
    }
});

async function verifySteamOpenId(query) {
    const verification = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (key.startsWith("openid.")) verification.set(key, String(value));
    }
    verification.set("openid.mode", "check_authentication");
    const response = await fetch("https://steamcommunity.com/openid/login", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: verification });
    const text = await response.text();
    return response.ok && /is_valid\s*:\s*true/i.test(text);
}

async function steamJson(path, params) {
    const url = new URL(`https://api.steampowered.com/${path}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url);
    if (!response.ok) throw new Error(`STEAM_API_${response.status}`);
    return response.json();
}

async function steamJsonOptional(path, params) {
    try { return await steamJson(path, params); }
    catch (error) { console.warn("Steam optional data unavailable", path, error.message); return { response: {} }; }
}

async function steamAchievementSummary(key, steamid, game) {
    try {
        const data = await steamJson("ISteamUserStats/GetPlayerAchievements/v1/", { key, steamid, appid: String(game.appid), l: "brazilian" });
        const achievements = data.playerstats?.achievements || [];
        const unlocked = achievements.filter(item => item.achieved === 1).length;
        return { appid: game.appid, name: game.name, total: achievements.length, unlocked, percentage: achievements.length ? Math.round(unlocked / achievements.length * 100) : 0 };
    } catch (error) {
        console.warn("Steam achievements unavailable", game.appid, error.message);
        return null;
    }
}

exports.searchGames = onRequest({ region: "us-central1", secrets: [rawgApiKey] }, async (req, res) => {
    cors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });
    try {
        await verifyAppCheck(req);
        const buscador = await requireParticipatingUser(req);
        await limitarUso(buscador.uid, "searchGames", 60 * 1000, 20);
        const query = String(req.body?.query || "").trim().slice(0, 80);
        const url = new URL("https://api.rawg.io/api/games");
        url.searchParams.set("key", rawgApiKey.value());
        url.searchParams.set("page_size", "24");
        url.searchParams.set("ordering", query ? "-rating" : "-added");
        if (query) { url.searchParams.set("search", query); url.searchParams.set("search_precise", "true"); }
        const response = await fetch(url, { headers: { "User-Agent": "Something Gamer/1.0" } });
        if (!response.ok) throw new Error(`RAWG_${response.status}`);
        const data = await response.json();
        const games = (data.results || []).filter(item => item.name).map(item => ({
            id: String(item.id), name: item.name, source: "rawg", cover: item.background_image || "",
            rating: Number(item.rating || 0), released: item.released || "",
            genres: (item.genres || []).map(genre => genre.name).filter(Boolean).slice(0, 3),
            platforms: (item.parent_platforms || []).map(entry => entry.platform?.name).filter(Boolean)
        }));
        res.set("Cache-Control", "private, max-age=300");
        return res.json({ games });
    } catch (error) {
        console.error("searchGames", error);
        if (error.message === "RATE_LIMITED") return res.status(429).json({ error: "Muitas buscas seguidas. Aguarde um minuto." });
        if (error.message === "TERMS_REQUIRED") return res.status(403).json({ error: "Aceite os Termos de Uso atuais para continuar." });
        return res.status(error.message === "UNAUTHENTICATED" ? 401 : 502).json({ error: "O catálogo de jogos está temporariamente indisponível." });
    }
});

exports.steamCallback = onRequest({ region: "us-central1", secrets: [steamApiKey] }, async (req, res) => {
    const state = String(req.query.state || "");
    const stateRef = db.collection("steamAuthStates").doc(state);
    try {
        if (!state) throw new Error("INVALID_STATE");
        const stateSnapshot = await stateRef.get();
        const authState = stateSnapshot.data();
        if (!stateSnapshot.exists || !authState || authState.expiresAt < Date.now()) throw new Error("EXPIRED_STATE");
        await stateRef.delete();
        if (!(await verifySteamOpenId(req.query))) throw new Error("INVALID_OPENID");
        const claimedId = String(req.query["openid.claimed_id"] || "");
        const match = claimedId.match(/\/openid\/id\/(\d{17})$/);
        if (!match) throw new Error("INVALID_STEAM_ID");
        const steamid = match[1];
        const key = steamApiKey.value();
        const [summaryData, gamesData, recentData] = await Promise.all([
            steamJson("ISteamUser/GetPlayerSummaries/v2/", { key, steamids: steamid }),
            steamJsonOptional("IPlayerService/GetOwnedGames/v1/", { key, steamid, include_appinfo: "true", include_played_free_games: "true", format: "json" }),
            steamJsonOptional("IPlayerService/GetRecentlyPlayedGames/v1/", { key, steamid, count: "10", format: "json" })
        ]);
        const player = summaryData.response?.players?.[0];
        if (!player) throw new Error("PROFILE_NOT_FOUND");
        const games = (gamesData.response?.games || []).map(game => ({ appid: game.appid, name: game.name, playtimeForever: game.playtime_forever || 0, playtimeTwoWeeks: game.playtime_2weeks || 0, iconUrl: game.img_icon_url ? `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg` : "" })).sort((a, b) => b.playtimeForever - a.playtimeForever);
        const recentGames = (recentData.response?.games || []).map(game => ({ appid: game.appid, name: game.name, playtimeTwoWeeks: game.playtime_2weeks || 0, playtimeForever: game.playtime_forever || 0 }));
        const achievementResults = await Promise.all(games.slice(0, 12).map(game => steamAchievementSummary(key, steamid, game)));
        const achievements = achievementResults.filter(Boolean);
        await db.collection("users").doc(authState.uid).set({
            steamConnected: true,
            steamProfile: { steamid, personaname: player.personaname, profileurl: player.profileurl, avatar: player.avatarfull, personaState: player.personastate, countryCode: player.loccountrycode || "", lastLogoff: player.lastlogoff || null },
            steamGames: games,
            steamRecentGames: recentGames,
            steamAchievements: achievements,
            steamUpdatedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        return res.redirect(302, `${authState.returnOrigin || APP_URL}/steam-callback.html?status=success`);
    } catch (error) {
        console.error("steamCallback", error);
        if (state) await stateRef.delete().catch(() => {});
        return res.redirect(302, `${APP_URL}/steam-callback.html?status=error&reason=${encodeURIComponent(error.message)}`);
    }
});

async function mercadoPago(path, options = {}) {
    const response = await fetch(`https://api.mercadopago.com${path}`, {
        ...options,
        headers: { Authorization: `Bearer ${mercadoPagoToken.value()}`, "Content-Type": "application/json", ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `MERCADO_PAGO_${response.status}`);
    return data;
}

function htmlEscape(value) {
    return String(value || "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

async function sendEmail({ to, subject, heading, message, code = "" }) {
    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey.value()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            from: emailFrom.value(), to: [to], subject,
            html: `<div style="margin:0;padding:36px 16px;background:#07070a;font-family:Arial,sans-serif;color:#fff"><div style="max-width:560px;margin:auto;padding:34px;border:1px solid #292a35;border-radius:20px;background:#111218"><div style="color:#8070ff;font-size:12px;font-weight:800;letter-spacing:2px">SOMETHING GAMER</div><h1 style="margin:14px 0;font-size:30px">${htmlEscape(heading)}</h1><p style="color:#b5b6c0;font-size:16px;line-height:1.65">${htmlEscape(message)}</p>${code ? `<div style="margin:28px 0;padding:20px;text-align:center;border-radius:14px;background:#1b1c27;font-size:36px;font-weight:900;letter-spacing:10px">${htmlEscape(code)}</div>` : ""}<p style="margin-top:28px;color:#6f707a;font-size:12px;line-height:1.5">Se você não realizou esta ação, ignore esta mensagem e proteja sua conta.</p></div></div>`
        })
    });
    if (!response.ok) throw new Error(`EMAIL_${response.status}`);
    return response.json();
}

function resetHash(email, code) {
    return crypto.createHmac("sha256", resetCodeSecret.value()).update(`${email}:${code}`).digest("hex");
}

exports.requestPasswordResetCode = onRequest({ region: "us-central1", secrets: [resendApiKey, emailFrom, resetCodeSecret] }, async (req, res) => {
    cors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });
    const email = String(req.body?.email || "").trim().toLowerCase().slice(0, 254);
    const generic = { ok: true, message: "Se o e-mail estiver cadastrado, o código será enviado." };
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.json(generic);
    const ref = db.collection("passwordResetCodes").doc(crypto.createHash("sha256").update(email).digest("hex"));
    try {
        await verifyAppCheck(req);
        const previous = await ref.get();
        if (previous.exists && Date.now() - Number(previous.data()?.sentAt || 0) < 60000) return res.json(generic);
        const account = await getAuth().getUserByEmail(email).catch(() => null);
        if (!account || !account.providerData?.some(provider => provider.providerId === "password")) return res.json(generic);
        const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
        await ref.set({ uid: account.uid, email, hash: resetHash(email, code), attempts: 0, sentAt: Date.now(), expiresAt: Date.now() + 10 * 60 * 1000 });
        await sendEmail({ to: email, subject: "Código para redefinir sua senha", heading: "Redefinição de senha", message: "Digite este código no Something Gamer. Ele é válido por 10 minutos e pode ser usado uma única vez.", code });
        return res.json(generic);
    } catch (error) {
        console.error("requestPasswordResetCode", error);
        return res.status(500).json({ error: "Não foi possível enviar o código agora." });
    }
});

exports.confirmPasswordResetCode = onRequest({ region: "us-central1", secrets: [resetCodeSecret] }, async (req, res) => {
    cors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });
    const email = String(req.body?.email || "").trim().toLowerCase().slice(0, 254);
    const code = String(req.body?.code || "").replace(/\D/g, "").slice(0, 6);
    const password = String(req.body?.password || "");
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return res.status(400).json({ error: "A senha deve ter pelo menos 8 caracteres, uma letra e um número." });
    const ref = db.collection("passwordResetCodes").doc(crypto.createHash("sha256").update(email).digest("hex"));
    try {
        await verifyAppCheck(req);
        const snapshot = await ref.get(); const data = snapshot.data();
        if (!snapshot.exists || !data || data.expiresAt < Date.now() || data.attempts >= 5 || code.length !== 6) return res.status(400).json({ error: "Código inválido ou expirado." });
        const received = Buffer.from(resetHash(email, code), "hex"), stored = Buffer.from(String(data.hash), "hex");
        if (received.length !== stored.length || !crypto.timingSafeEqual(received, stored)) { await ref.update({ attempts: FieldValue.increment(1) }); return res.status(400).json({ error: "Código inválido ou expirado." }); }
        await getAuth().updateUser(data.uid, { password });
        await getAuth().revokeRefreshTokens(data.uid);
        await ref.delete();
        return res.json({ ok: true });
    } catch (error) {
        console.error("confirmPasswordResetCode", error);
        return res.status(500).json({ error: "Não foi possível redefinir a senha agora." });
    }
});

exports.createVerificationSubscription = onRequest({ region: "us-central1" }, async (req,res) => {
    cors(req,res); if (req.method === "OPTIONS") return res.status(204).end();
    return res.status(503).json({ error: "A verificação agora usa compra avulsa no Worker. Atualize o aplicativo.", code: "CHECKOUT_DISABLED" });
});

exports.getVerificationSubscription = onRequest({ region: "us-central1", secrets: [mercadoPagoToken] }, async (req, res) => {
    cors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    try {
        await verifyAppCheck(req);
        const user = await requireParticipatingUser(req);
        const snapshot = await db.collection("users").doc(user.uid).get();
        const verification = snapshot.data()?.paidVerification || snapshot.data()?.verification;
        if (!verification?.subscriptionId) return res.json({ message: "Nenhuma assinatura encontrada." });
        const subscription = await mercadoPago(`/preapproval/${encodeURIComponent(verification.subscriptionId)}`);
        const paymentStatus = subscription.status || "unknown";
        const nextStatus = paymentStatus === "authorized" ? "payment_pending" : (["cancelled", "paused"].includes(paymentStatus) ? "suspended" : "payment_pending");
        await founders.writePaid(user.uid,{ status: nextStatus, paymentStatus, subscriptionId: verification.subscriptionId, provider: "mercado_pago", paymentUpdatedAt: FieldValue.serverTimestamp() });
        const messages = { active: "Verificação ativa.", pending: "Pagamento confirmado. Seu perfil está em análise.", payment_pending: "Pagamento ainda não concluído.", suspended: "Assinatura pausada ou cancelada." };
        return res.json({ status: nextStatus, paymentStatus, message: messages[nextStatus], subscriptionUrl: subscription.init_point || "" });
    } catch (error) {
        console.error("getVerificationSubscription", error);
        if (error.message === "TERMS_REQUIRED") return res.status(403).json({ error: "Aceite os Termos de Uso atuais para continuar." });
        return res.status(error.message === "UNAUTHENTICATED" ? 401 : 500).json({ error: "Não foi possível consultar a assinatura." });
    }
});


exports.cancelVerificationSubscription = onRequest({ region: "us-central1", secrets: [mercadoPagoToken] }, async (req, res) => {
    cors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });
    try {
        await verifyAppCheck(req);
        const user = await requireParticipatingUser(req);
        const userRef = db.collection("users").doc(user.uid);
        const snapshot = await userRef.get();
        const verification = snapshot.data()?.paidVerification || snapshot.data()?.verification || {};
        if (!verification.subscriptionId) return res.status(404).json({ error: "Nenhuma assinatura encontrada." });
        await mercadoPago(`/preapproval/${encodeURIComponent(verification.subscriptionId)}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
        await founders.writePaid(user.uid,{ status: "suspended", paymentStatus: "cancelled", cancelledAt: FieldValue.serverTimestamp() });
        return res.json({ ok: true, status: "suspended", message: "Assinatura cancelada." });
    } catch (error) {
        console.error("cancelVerificationSubscription", error);
        return res.status(error.message === "UNAUTHENTICATED" ? 401 : 500).json({ error: "Não foi possível cancelar a assinatura." });
    }
});

function assinaturaMercadoPagoValida(req, dataId) {
    const bruta = req.get("x-signature") || "";
    const requestId = req.get("x-request-id") || "";
    const partes = Object.fromEntries(bruta.split(",").map(item => item.split("=").map(valor => valor.trim())).filter(item => item.length === 2));
    if (!/^\d{10,13}$/.test(partes.ts || "") || !/^[a-f0-9]{64}$/i.test(partes.v1 || "") || !requestId || /[;\r\n]/.test(requestId)) return false;
    if (String(req.query["data.id"] || "").toLowerCase() !== String(dataId).toLowerCase()) return false;
    const manifesto = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${partes.ts};`;
    const esperado = crypto.createHmac("sha256", mercadoPagoWebhookSecret.value()).update(manifesto).digest();
    let recebido;
    try { recebido = Buffer.from(partes.v1, "hex"); } catch { return false; }
    return recebido.length === esperado.length && crypto.timingSafeEqual(recebido, esperado);
}

exports.mercadoPagoWebhook = onRequest({ region: "us-central1", secrets: [mercadoPagoToken, resendApiKey, emailFrom, mercadoPagoWebhookSecret] }, async (req, res) => {
    try {
        const subscriptionId = String(req.query["data.id"] || req.body?.data?.id || req.body?.id || "");
        if (!subscriptionId) return res.status(200).json({ received: true });
        if (!assinaturaMercadoPagoValida(req, subscriptionId)) {
            console.error("mercadoPagoWebhook: assinatura inválida", { requestId: req.get("x-request-id") || "" });
            return res.status(401).json({ error: "Assinatura inválida." });
        }
        const subscription = await mercadoPago(`/preapproval/${encodeURIComponent(subscriptionId)}`);
        const uid = String(subscription.external_reference || "");
        if (!uid) return res.status(200).json({ received: true });
        const paid = false; // autorização de recorrência não comprova cobrança recebida
        const userRef = db.collection("users").doc(uid);
        const before = await userRef.get();
        await founders.writePaid(uid,{
            status: paid ? "pending" : (["cancelled", "paused"].includes(subscription.status) ? "suspended" : "payment_pending"),
            paymentStatus: subscription.status || "unknown",
            subscriptionId,
            provider: "mercado_pago",
            reviewed: false,
            paymentUpdatedAt: FieldValue.serverTimestamp()
        });
        if (paid && !before.data()?.verification?.purchaseEmailSentAt) {
            const account = await getAuth().getUser(uid).catch(() => null);
            if (account?.email) {
                await sendEmail({ to: account.email, subject: "Pagamento confirmado da Verificação Gamer", heading: "Pagamento confirmado", message: "Sua assinatura da Verificação Gamer foi confirmada. Seu perfil agora seguirá para análise administrativa." });
                await founders.writePaid(uid,{ purchaseEmailSentAt: FieldValue.serverTimestamp() });
            }
        }
        return res.status(200).json({ received: true });
    } catch (error) {
        console.error("mercadoPagoWebhook", error);
        return res.status(500).json({ error: "Webhook não processado." });
    }
});

exports.syncVerificationSubscriptions = onSchedule({ region: "us-central1", schedule: "every 24 hours", secrets: [mercadoPagoToken] }, async () => {
    const snapshot = await db.collection("users").where("verification.provider", "==", "mercado_pago").limit(500).get();
    for (const item of snapshot.docs) {
        const verification = item.data().paidVerification || item.data().verification;
        if (!verification?.subscriptionId) continue;
        try {
            const subscription = await mercadoPago(`/preapproval/${encodeURIComponent(verification.subscriptionId)}`);
            const authorized = subscription.status === "authorized";
            const nextStatus = authorized ? verification.status : (["cancelled", "paused"].includes(subscription.status) ? "suspended" : verification.status);
            const validityDays = verification.billingCycle === "annual" ? 370 : verification.billingCycle === "semiannual" ? 185 : 32;
            await founders.writePaid(item.id,{status: nextStatus,paymentStatus:subscription.status||"unknown",expiresAt:verification.expiresAt||null,paymentUpdatedAt:FieldValue.serverTimestamp()});
        } catch (error) { console.error("syncVerificationSubscriptions", item.id, error); }
    }
});

exports.searchGifs = onRequest({ region: "us-central1", secrets: [giphyApiKey] }, async (req, res) => {
    cors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });
    try {
        await verifyAppCheck(req);
        const user = await requireParticipatingUser(req);
        await limitarUso(user.uid, "giphy", 60 * 1000, 30);
        const termo = String(req.body?.query || "").trim().slice(0, 50);
        if (!termo) return res.json({ gifs: [] });
        const url = new URL("https://api.giphy.com/v1/gifs/search");
        url.searchParams.set("api_key", giphyApiKey.value());
        url.searchParams.set("q", termo);
        url.searchParams.set("limit", "24");
        url.searchParams.set("rating", "pg-13");
        url.searchParams.set("lang", "pt");
        const response = await fetch(url, { headers: { "User-Agent": "Something Gamer/1.0" } });
        if (!response.ok) throw new Error(`GIPHY_${response.status}`);
        const data = await response.json();
        const gifs = (data.data || []).map(item => ({
            id: String(item.id || ""),
            url: item.images?.fixed_height?.url || item.images?.original?.url || "",
            title: String(item.title || "GIF").slice(0, 120)
        })).filter(item => /^https:\/\//i.test(item.url));
        res.set("Cache-Control", "private, max-age=60");
        return res.json({ gifs });
    } catch (error) {
        console.error("searchGifs", error);
        const status = error.message === "UNAUTHENTICATED" ? 401 : error.message === "TERMS_REQUIRED" ? 403 : error.message === "RATE_LIMITED" ? 429 : error.message?.startsWith("APP_CHECK_") ? 401 : 502;
        return res.status(status).json({ error: status === 429 ? "Muitas buscas. Aguarde um minuto." : status === 403 ? "Aceite os Termos de Uso atuais para continuar." : "Não foi possível pesquisar GIFs agora." });
    }
});

async function requireAdmin(req) {
    const user = await requireFirebaseUser(req);
    if (user.admin !== true) throw new Error("FORBIDDEN");
    if (process.env.SG_ADMIN_ENABLED !== "true") throw new Error("FORBIDDEN");
    if (!user.firebase?.sign_in_second_factor || Date.now()/1000 - Number(user.auth_time || 0) > 900) throw new Error("FORBIDDEN");
    // O header não é suficiente: verificar assinatura e identidade do Access.
    const team = process.env.CF_ACCESS_TEAM_DOMAIN || "", audience = process.env.CF_ACCESS_AUD || "";
    if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team) || !audience) throw new Error("FORBIDDEN");
    const parts = String(req.get("Cf-Access-Jwt-Assertion") || "").split(".");
    if (parts.length !== 3) throw new Error("FORBIDDEN");
    const header = JSON.parse(Buffer.from(parts[0],"base64url")), claims = JSON.parse(Buffer.from(parts[1],"base64url"));
    if (header.alg !== "RS256" || claims.iss !== `https://${team}` || !claims.aud?.includes(audience)
        || !Number.isFinite(claims.exp) || claims.exp <= Date.now()/1000 || claims.email !== user.email) throw new Error("FORBIDDEN");
    const jwksResponse = await fetch(`https://${team}/cdn-cgi/access/certs`, {signal:AbortSignal.timeout(10000)});
    const jwks = await jwksResponse.json(), jwk = jwks.keys?.find(k=>k.kid===header.kid);
    if (!jwksResponse.ok || !jwk || !crypto.verify("RSA-SHA256",Buffer.from(`${parts[0]}.${parts[1]}`),crypto.createPublicKey({key:jwk,format:"jwk"}),Buffer.from(parts[2],"base64url"))) throw new Error("FORBIDDEN");
    return user;
}

async function setDeveloperRole(uid, enabled) {
    const record = await getAuth().getUser(uid);
    const claims = { ...(record.customClaims || {}) };
    if (enabled) claims.dev = true;
    else delete claims.dev;
    await getAuth().setCustomUserClaims(uid, claims);

    const userRef = db.collection("users").doc(uid);
    const userSnapshot = await userRef.get();
    const userData = userSnapshot.data() || {};
    const badges = { ...(userData.badges || {}), dev: Boolean(enabled) };
    await userRef.set({ badges, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await db.collection("publicProfiles").doc(uid).set({ badges, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

async function auditAdmin(actorUid, action, targetUid = "", details = {}) {
    await db.collection("adminAuditLogs").add({
        actorUid, action, targetUid, details, createdAt: FieldValue.serverTimestamp()
    }).catch(error => console.error("admin audit", error));
}

// As notificações não tinham fim: nasciam, eram lidas e ficavam. Trinta dias e saem.
exports.limparNotificacoesAntigas = onSchedule({ region: "us-central1", schedule: "every 24 hours" }, async () => {
    const corte = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let removidas = 0;
    for (let volta = 0; volta < 25; volta++) {
        const lote = await db.collection("notifications").where("createdAt", "<", corte).limit(400).get();
        if (lote.empty) break;
        const batch = db.batch();
        lote.docs.forEach(item => batch.delete(item.ref));
        await batch.commit();
        removidas += lote.size;
        if (lote.size < 400) break;
    }
    console.log(`notificações antigas removidas: ${removidas}`);
});

// Mesma coisa para os contadores de uso.
exports.limparRateLimits = onSchedule({ region: "us-central1", schedule: "every 24 hours" }, async () => {
    const lote = await db.collection("rateLimits").where("inicio", "<", Date.now() - 24 * 60 * 60 * 1000).limit(400).get();
    if (lote.empty) return;
    const batch = db.batch();
    lote.docs.forEach(item => batch.delete(item.ref));
    await batch.commit();
});

function cleanText(value, max = 300) {
    return String(value ?? "").trim().slice(0, max);
}

function safeHttps(value) {
    const text = cleanText(value, 2048);
    if (!text) return "";
    try {
        const url = new URL(text);
        return url.protocol === "https:" ? url.toString() : "";
    } catch {
        return "";
    }
}

async function createAdminNotification(actorUid, targetUid, type, title, message) {
    await db.collection("notifications").add({
        toUid: targetUid,
        fromUid: actorUid,
        type,
        title: cleanText(title, 120),
        message: cleanText(message, 300),
        special: true,
        read: false,
        createdAt: FieldValue.serverTimestamp()
    });
}

async function sendAccountEmail(uid, subject, heading, message) {
    const account = await getAuth().getUser(uid).catch(() => null);
    if (!account?.email) return false;
    await sendEmail({ to: account.email, subject, heading, message });
    return true;
}

exports.adminApi = onRequest({ region: "us-central1", secrets: [resendApiKey, emailFrom] }, async (req, res) => {
    cors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });
    try {
        await verifyAppCheck(req);
        const actor = await requireAdmin(req);
        const action = String(req.body?.action || "");

        if (action === "dashboard") {
            const [usersSnapshot, promotionsSnapshot, applicationsSnapshot, reportsSnapshot] = await Promise.all([
                db.collection("users").limit(500).get(),
                db.collection("promotions").orderBy("createdAt", "desc").limit(50).get(),
                db.collection("companyApplications").orderBy("createdAt", "desc").limit(100).get(),
                db.collection("reports").orderBy("createdAt", "desc").limit(100).get()
            ]);
            const users = usersSnapshot.docs.map(item => {
                const data = item.data();
                return { uid: item.id, ...data, accountCreatedAtMillis: data.accountCreatedAt?.toMillis?.() || 0 };
            }).sort((a, b) => b.accountCreatedAtMillis - a.accountCreatedAtMillis);
            const promotions = promotionsSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
            const companyApplications = applicationsSnapshot.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => item.status === "pending");
            const reports = reportsSnapshot.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => item.status === "open");
            return res.json({
                users,
                promotions,
                companyApplications,
                reports,
                stats: {
                    total: users.length,
                    verified: users.filter(item => item.verification?.status === "active").length,
                    pending: users.filter(item => ["pending", "payment_pending"].includes(item.verification?.status)).length
                }
            });
        }

        if (action === "repairProfiles") {
            const snapshot = await db.collection("users").limit(500).get();
            let batch = db.batch(), count = 0, pending = 0;
            for (const item of snapshot.docs) {
                const data = item.data() || {};
                const ref = db.collection("publicProfiles").doc(item.id);
                batch.set(ref, {
                    uid: item.id,
                    name: data.name || data.username || "Gamer",
                    username: data.username || "gamer",
                    bio: data.bio || "",
                    photoURL: data.photoURL || "",
                    accountType: data.accountType || "gamer",
                    verification: data.verification || {},
                    verificationBadgeTheme: data.verificationBadgeTheme || "blue",
                    badges: data.badges || {},
                    visibility: data.profileVisibility || "public",
                    updatedAt: FieldValue.serverTimestamp()
                }, { merge: true });
                pending++; count++;
                if (pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
            }
            if (pending) await batch.commit();
            await auditAdmin(actor.uid, "repairProfiles", "", { count });
            return res.json({ ok: true, count });
        }

        if (action === "setVerification") {
            if (req.body?.status === "active") return res.status(409).json({error:"Aprovação financeira e de identidade deve usar /payments/review no Worker."});
            const uid = String(req.body?.uid || "");
            const status = String(req.body?.status || "");
            const requestedDays = Number(req.body?.durationDays);
            if (!uid || !["active", "suspended", "none"].includes(status)) return res.status(400).json({ error: "Dados inválidos." });
            if (status === "active" && (!Number.isInteger(requestedDays) || requestedDays < 0 || requestedDays > 3650)) return res.status(400).json({ error: "Prazo de verificação inválido." });
            const targetRef = db.collection("users").doc(uid);
            const targetSnapshot = await targetRef.get();
            if (!targetSnapshot.exists) return res.status(404).json({ error: "Usuário não encontrado." });
            const current = targetSnapshot.data() || {};
            if (status === "active" && current.verification?.provider === "mercado_pago" && current.verification?.paymentStatus !== "authorized") return res.status(409).json({ error: "O pagamento desta verificação ainda não foi confirmado." });
            const validityDays = status === "active" ? requestedDays : 0;
            if (status === "none") {
                await founders.writePaid(uid,{}, {replace:true,revokeFounder:true});
                await sendAccountEmail(uid, "Verificação removida", "Verificação atualizada", "Seu selo de verificação do Something Gamer foi removido pela equipe administrativa.").catch(error => console.error("verification removed email", error));
            } else {
                const verification = {
                    ...(current.verification || {}),
                    status,
                    reviewed: true,
                    reviewedAt: FieldValue.serverTimestamp(),
                    source: "admin",
                    expiresAt: status === "active" && validityDays > 0 ? Timestamp.fromMillis(Date.now() + validityDays * 24 * 60 * 60 * 1000) : null
                };
                await founders.writePaid(uid,verification,{replace:true,revokeFounder:status!=="active"});
                if (status === "active") {
                    const prazo = validityDays > 0 ? ` por ${validityDays} dia(s)` : " sem prazo de expiração";
                    await createAdminNotification(actor.uid, uid, "verification", "Você recebeu a Verificação Gamer", `Seu selo foi ativado${prazo}.`);
                    await sendAccountEmail(uid, "Seu selo Something Gamer foi aprovado", "Você agora é Gamer Verificado", `Seu perfil foi aprovado. O selo foi ativado${prazo}.`).catch(error => console.error("verification approval email", error));
                }
            }
            await auditAdmin(actor.uid, "setVerification", uid, { status });
            return res.json({ ok: true });
        }

        if (action === "setBadge") {
            const uid = String(req.body?.uid || "");
            const badge = String(req.body?.badge || "");
            const enabled = Boolean(req.body?.enabled);
            if (!uid || !["nowFollowed", "sgFollowed"].includes(badge)) return res.status(400).json({ error: "Selo inválido." });
            const userRef = db.collection("users").doc(uid);
            const userSnapshot = await userRef.get();
            if (!userSnapshot.exists) return res.status(404).json({ error: "Usuário não encontrado." });
            await userRef.update({ [`badges.${badge}`]: enabled, updatedAt: FieldValue.serverTimestamp() });
            await db.collection("publicProfiles").doc(uid).set({ badges: { ...(userSnapshot.data()?.badges || {}), [badge]: enabled }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            if (enabled) {
                const isNow = badge === "nowFollowed";
                await createAdminNotification(actor.uid, uid, badge, isNow ? "A Now segue você" : "O SG segue você", isNow ? "A NOW começou a seguir seu perfil." : "O perfil oficial do Something Gamer começou a seguir você.");
                await sendAccountEmail(uid, isNow ? "A Now segue você no Something Gamer" : "O SG segue você", isNow ? "A Now segue você" : "O SG segue você", isNow ? "Seu perfil recebeu o reconhecimento da NOW." : "Seu perfil recebeu o reconhecimento oficial do Something Gamer.").catch(error => console.error("badge email", error));
            }
            await auditAdmin(actor.uid, "setBadge", uid, { badge, enabled });
            return res.json({ ok: true });
        }

        if (action === "setDevRole") {
            const uid = String(req.body?.uid || "");
            if (!uid) return res.status(400).json({ error: "Usuário inválido." });
            const enabled = Boolean(req.body?.enabled);
            await setDeveloperRole(uid, enabled);
            await auditAdmin(actor.uid, "setDevRole", uid, { enabled });
            return res.json({ ok: true });
        }

        if (action === "setOfficial") {
            const uid = String(req.body?.uid || "");
            const accountType = String(req.body?.accountType || "");
            if (!uid || !["official_now", "official_sg"].includes(accountType)) return res.status(400).json({ error: "Tipo de conta inválido." });
            const userRef = db.collection("users").doc(uid);
            const snapshot = await userRef.get();
            if (!snapshot.exists) return res.status(404).json({ error: "Usuário não encontrado." });
            const current = snapshot.data() || {};
            const badges = { ...(current.badges || {}), officialNow: accountType === "official_now", officialSg: accountType === "official_sg" };
            const verification = { ...(current.paidVerification || current.verification || {}), status: "active", reviewed: true, source: "official", reviewedAt: FieldValue.serverTimestamp() };
            await userRef.set({ accountType, badges, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            await db.collection("publicProfiles").doc(uid).set({
                uid,
                name: current.name || "Gamer",
                username: current.username || "gamer",
                bio: current.bio || "",
                photoURL: current.photoURL || "",
                accountType,
                badges,
                verificationBadgeTheme: current.verificationBadgeTheme || "blue",
                visibility: current.profileVisibility || "public",
                updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });
            await founders.writePaid(uid,verification,{replace:true});
            await auditAdmin(actor.uid, "setOfficial", uid, { accountType });
            return res.json({ ok: true });
        }

        if (action === "moderateUser") {
            const uid = String(req.body?.uid || "");
            const requestedType = String(req.body?.type || "");
            const reportId = String(req.body?.reportId || "");
            const reason = cleanText(req.body?.reason, 300);
            if (!uid || !["warning", "suspend", "ban"].includes(requestedType) || !reason) return res.status(400).json({ error: "Dados de moderação inválidos." });
            const userRef = db.collection("users").doc(uid);
            let moderationResult;
            await db.runTransaction(async transaction => {
                const snapshot = await transaction.get(userRef);
                if (!snapshot.exists) throw new Error("USER_NOT_FOUND");
                const previous = snapshot.data()?.moderation || {};
                let type = requestedType;
                let status = "active";
                let warningCount = Number(previous.warningCount || 0);
                let suspensionCount = Number(previous.suspensionCount || 0);
                let suspendedUntil = null;
                if (type === "warning") {
                    warningCount++;
                    if (warningCount >= 3) {
                        type = "suspension";
                        status = "suspended";
                        suspensionCount++;
                        suspendedUntil = Timestamp.fromMillis(Date.now() + 2 * 86400000);
                    }
                } else if (type === "suspend") {
                    if (suspensionCount >= 2) {
                        type = "ban";
                        status = "banned";
                    } else {
                        status = "suspended";
                        suspensionCount++;
                        suspendedUntil = Timestamp.fromMillis(Date.now() + (suspensionCount === 1 ? 2 : 7) * 86400000);
                    }
                } else {
                    status = "banned";
                }
                moderationResult = { type, status, warningCount, suspensionCount, suspendedUntil };
                transaction.set(userRef, { moderation: { ...moderationResult, lastReason: reason, lastNotice: status === "banned" ? "SUA CONTA FOI BANIDA" : status === "suspended" ? "SUA CONTA FOI SUSPENSA" : "VOCÊ RECEBEU UMA ADVERTÊNCIA!", updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            });
            const title = moderationResult.status === "banned" ? "SUA CONTA FOI BANIDA" : moderationResult.status === "suspended" ? "SUA CONTA FOI SUSPENSA" : "VOCÊ RECEBEU UMA ADVERTÊNCIA!";
            const untilText = moderationResult.suspendedUntil?.toDate?.().toLocaleString("pt-BR") || "";
            const message = moderationResult.status === "banned" ? `Motivo: ${reason}. O banimento é permanente.` : moderationResult.status === "suspended" ? `Motivo: ${reason}. Sua conta ficará suspensa até ${untilText}.` : `Motivo: ${reason}.`;
            await db.collection("sanctions").add({ targetUid: uid, ...moderationResult, reason, reportId, createdBy: actor.uid, createdAt: FieldValue.serverTimestamp() });
            await createAdminNotification(actor.uid, uid, "moderation", title, message);
            if (moderationResult.status === "banned") await db.collection("publicProfiles").doc(uid).set({ visibility: "private", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            if (reportId) await db.collection("reports").doc(reportId).set({ status: "resolved", resolution: moderationResult.type, resolvedAt: FieldValue.serverTimestamp() }, { merge: true });
            await sendAccountEmail(uid, title, title, message).catch(error => console.error("moderation email", error));
            await auditAdmin(actor.uid, "moderateUser", uid, { type: moderationResult.type, status: moderationResult.status, reportId });
            return res.json({ ok: true, title, status: moderationResult.status });
        }

        if (action === "reviewPhoto") {
            const uid = String(req.body?.uid || "");
            const decision = String(req.body?.decision || "");
            if (!uid || !["approve", "reject"].includes(decision)) return res.status(400).json({ error: "Revisão inválida." });
            const userRef = db.collection("users").doc(uid);
            const snapshot = await userRef.get();
            if (!snapshot.exists) return res.status(404).json({ error: "Usuário não encontrado." });
            const current = snapshot.data() || {};
            if (decision === "approve") {
                const photoURL = safeHttps(current.pendingPhotoURL);
                if (!photoURL) return res.status(400).json({ error: "A foto pendente não possui URL HTTPS válida." });
                await userRef.set({ photoURL, pendingPhotoURL: "", photoModeration: { status: "approved", reviewedAt: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
                await db.collection("publicProfiles").doc(uid).set({ photoURL, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            } else {
                await userRef.set({ pendingPhotoURL: "", photoModeration: { status: "rejected", reason: "A imagem não segue as regras do SG.", reviewedAt: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
                await createAdminNotification(actor.uid, uid, "photo_rejected", "Foto de perfil recusada", "A imagem enviada não segue as regras do SG. Escolha outra foto.");
            }
            await auditAdmin(actor.uid, "reviewPhoto", uid, { decision });
            return res.json({ ok: true });
        }

        if (action === "createPromotion") {
            const title = cleanText(req.body?.title, 70);
            const discount = cleanText(req.body?.discount, 40);
            const description = cleanText(req.body?.description, 180);
            const buttonLabel = cleanText(req.body?.buttonLabel || "Aproveitar", 30);
            const buttonUrlRaw = cleanText(req.body?.buttonUrl, 2048);
            const buttonUrl = buttonUrlRaw ? safeHttps(buttonUrlRaw) : "";
            const regions = Array.isArray(req.body?.regions) ? [...new Set(req.body.regions.map(value => String(value).toUpperCase()).filter(value => value === "WORLD" || /^[A-Z]{2}$/.test(value)))].slice(0, 250) : [];
            const currency = ["BRL", "USD", "EUR"].includes(String(req.body?.currency || "")) ? String(req.body.currency) : "BRL";
            const originalPrice = Number(req.body?.originalPrice);
            const discountValue = Number(req.body?.discountValue);
            const discountType = ["fixed", "percent"].includes(String(req.body?.discountType || "")) ? String(req.body.discountType) : "fixed";
            const finalPrice = Number(req.body?.finalPrice);
            const rawQuantity = req.body?.quantityLimit;
            const quantityNumber = rawQuantity == null ? null : Number(rawQuantity);
            const quantityLimit = quantityNumber == null ? null : Math.floor(quantityNumber);
            const endsAtDate = req.body?.endsAt ? new Date(req.body.endsAt) : null;
            if (!title || !description || !regions.length || !Number.isFinite(originalPrice) || originalPrice <= 0 || !Number.isFinite(discountValue) || discountValue < 0 || !Number.isFinite(finalPrice) || finalPrice < 0) return res.status(400).json({ error: "Revise os dados da promoção." });
            if (quantityLimit != null && (!Number.isFinite(quantityLimit) || quantityLimit < 1)) return res.status(400).json({ error: "Quantidade inválida." });
            if (buttonUrlRaw && !buttonUrl) return res.status(400).json({ error: "O link da promoção precisa usar HTTPS." });
            if (discountType === "percent" && discountValue > 100) return res.status(400).json({ error: "Desconto percentual inválido." });
            if (discountType === "fixed" && discountValue > originalPrice) return res.status(400).json({ error: "Desconto maior que o preço original." });
            if (endsAtDate && Number.isNaN(endsAtDate.getTime())) return res.status(400).json({ error: "Data de encerramento inválida." });
            const normalizedRegions = regions.map(value => value === "WORLD" ? "world" : value);
            await db.collection("promotions").add({
                title, discount, description, buttonLabel, buttonUrl,
                regions: normalizedRegions, region: normalizedRegions[0],
                currency, originalPrice, discountValue, discountType, finalPrice,
                endsAt: endsAtDate ? Timestamp.fromDate(endsAtDate) : null,
                quantityLimit, remainingQuantity: quantityLimit,
                active: true, createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid
            });
            await auditAdmin(actor.uid, "createPromotion", "", { title, regions: normalizedRegions });
            return res.json({ ok: true });
        }

        if (action === "togglePromotion") {
            const id = String(req.body?.id || "");
            if (!id) return res.status(400).json({ error: "Promoção inválida." });
            await db.collection("promotions").doc(id).update({ active: Boolean(req.body?.active), updatedAt: FieldValue.serverTimestamp() });
            await auditAdmin(actor.uid, "togglePromotion", id, { active: Boolean(req.body?.active) });
            return res.json({ ok: true });
        }

        if (action === "reviewCompany") {
            const id = String(req.body?.id || "");
            const decision = String(req.body?.decision || "");
            if (!id || !["approve", "reject"].includes(decision)) return res.status(400).json({ error: "Solicitação inválida." });
            const ref = db.collection("companyApplications").doc(id);
            const snapshot = await ref.get();
            if (!snapshot.exists) return res.status(404).json({ error: "Solicitação não encontrada." });
            const item = snapshot.data() || {};
            if (decision === "approve") {
                await db.collection("companies").doc(id).set({ name: cleanText(item.name, 120), category: cleanText(item.category, 80), website: safeHttps(item.website), description: cleanText(item.goal, 1200), status: "approved", ownerUid: item.uid, approvedAt: FieldValue.serverTimestamp(), approvedBy: actor.uid });
            }
            await ref.update({ status: decision === "approve" ? "approved" : "rejected", reviewedAt: FieldValue.serverTimestamp(), reviewedBy: actor.uid });
            await auditAdmin(actor.uid, "reviewCompany", String(item.uid || ""), { id, decision });
            return res.json({ ok: true });
        }

        if (action === "resolveReport") {
            const id = String(req.body?.id || "");
            if (!id) return res.status(400).json({ error: "Denúncia inválida." });
            await db.collection("reports").doc(id).update({ status: "resolved", resolvedAt: FieldValue.serverTimestamp(), resolvedBy: actor.uid });
            await auditAdmin(actor.uid, "resolveReport", id);
            return res.json({ ok: true });
        }

        if (action === "removeEvent") {
            const eventId = String(req.body?.eventId || "");
            const reportId = String(req.body?.reportId || "");
            if (!eventId) return res.status(400).json({ error: "Evento inválido." });
            await db.collection("events").doc(eventId).update({ status: "removed", moderatedAt: FieldValue.serverTimestamp(), moderatedBy: actor.uid });
            if (reportId) await db.collection("reports").doc(reportId).set({ status: "resolved", resolution: "event_removed", resolvedAt: FieldValue.serverTimestamp(), resolvedBy: actor.uid }, { merge: true });
            await auditAdmin(actor.uid, "removeEvent", eventId, { reportId });
            return res.json({ ok: true });
        }

        return res.status(400).json({ error: "Ação inválida." });
    } catch (error) {
        console.error("adminApi", error);
        const status = error.message === "FORBIDDEN" ? 403 : error.message === "UNAUTHENTICATED" ? 401 : error.message === "USER_NOT_FOUND" ? 404 : error.message?.startsWith("APP_CHECK_") ? 401 : 500;
        return res.status(status).json({ error: status === 403 ? "Acesso restrito ao administrador." : status === 404 ? "Usuário não encontrado." : "Não foi possível concluir a operação." });
    }
});

// ---------- V52: checkout unificado do ecossistema ----------
// O preço efetivo é recalculado no backend para planos/destaques; compras do
// marketplace usam o preço gravado no anúncio, evitando adulteração no cliente.
exports.createEcosystemCheckout = onRequest({ region: "us-central1" }, async (req,res) => {
    cors(req,res); if (req.method === "OPTIONS") return res.status(204).end();
    return res.status(503).json({ error: "Checkout do Market e ADS indisponível até validação de split, entrega e políticas comerciais.", code: "CHECKOUT_DISABLED" });
});

exports.ecosystemPaymentWebhook = onRequest({ region:"us-central1", secrets:[mercadoPagoToken, mercadoPagoWebhookSecret] }, async (req,res) => {
    try {
        if(req.method!=="POST")return res.status(405).json({error:"Método não permitido."});
        const paymentId=String(req.query["data.id"]||"");
        if(!/^\d{4,30}$/.test(paymentId)||!assinaturaMercadoPagoValida(req,paymentId))return res.status(401).json({error:"Assinatura inválida."});
        if(req.body?.data?.id&&String(req.body.data.id)!==paymentId)return res.status(401).json({error:"Assinatura inválida."});
        const payment=await mercadoPago(`/v1/payments/${encodeURIComponent(paymentId)}`);
        const purchaseId=String(payment.external_reference||"");
        if(!/^[a-zA-Z0-9_-]{1,160}$/.test(purchaseId))return res.json({received:true,ignored:true});
        if(!process.env.MERCADOPAGO_COLLECTOR_ID)return res.status(503).json({error:"Recebedor não configurado."});
        const ref=db.collection("ecosystemPurchases").doc(purchaseId);
        await db.runTransaction(async tx=>{
            const snap=await tx.get(ref);if(!snap.exists)return;
            const p=snap.data(),amount=Number(payment.transaction_amount),stored=Number(p.amount);
            if(String(payment.id)!==paymentId||payment.currency_id!=="BRL"||String(payment.collector_id)!==process.env.MERCADOPAGO_COLLECTOR_ID
                ||!Number.isFinite(amount)||Math.round(amount*100)!==Math.round(stored*100)||payment.external_reference!==snap.id)throw new Error("PAYMENT_MISMATCH");
            const revoked=["refunded","charged_back","in_mediation"].includes(payment.status);
            // Nunca retroceder estorno. Duplicação não prorroga destaque/benefícios.
            if(["refunded","charged_back"].includes(p.status))return;
            if(p.status==="approved"&&payment.status!=="approved"&&!revoked)return;
            tx.update(ref,{status:payment.status,paymentId,updatedAt:FieldValue.serverTimestamp(),
                ...(payment.status==="approved"&&!p.approvedAt?{approvedAt:FieldValue.serverTimestamp()}:{}),
                ...(p.kind==="market_purchase"?{requiresManualReview:true}: {})});
            if(p.kind==="market_boost") {
                if(revoked)tx.set(db.collection("marketListings").doc(p.targetId),{featured:false,featuredUntil:Timestamp.fromMillis(0)},{merge:true});
                else if(payment.status==="approved"&&p.status!=="approved")tx.set(db.collection("marketListings").doc(p.targetId),{featured:true,featuredUntil:Timestamp.fromMillis(Date.now()+7*86400000)},{merge:true});
            }
            if(p.kind==="ad_credit")tx.set(db.collection("adCampaigns").doc(p.targetId),{status:revoked?"payment_revoked":payment.status==="approved"?"pending_review":"awaiting_payment",paidAmount:payment.status==="approved"?stored:0},{merge:true});
            if(p.kind==="creator_plan")tx.set(db.collection("users").doc(p.uid),{monetization:{[p.targetId]:{status:revoked?"suspended":"pending_review",purchaseId}}},{merge:true});
            // Compras legadas não criam repasse manual nem fingem reserva de estoque.
        });
        return res.json({received:true});
    }catch(error){console.warn("ecosystemPaymentWebhook",error.message==="PAYMENT_MISMATCH"?"PAYMENT_MISMATCH":"PROCESSING_FAILED");return res.status(502).json({error:"Webhook não processado."});}
});

// ---------- V55: assinaturas recorrentes do ecossistema ----------
const SG_ECOSYSTEM_PLANS = {
    creator_plus: { amount: 19.90, label: "SG Creator+" },
    community_pro: { amount: 29.90, label: "SG Community Pro" },
    seller_pro: { amount: 24.90, label: "SG Seller Pro" }
};

exports.createEcosystemSubscription = onRequest({ region: "us-central1" }, async (req,res) => {
    cors(req,res); if (req.method === "OPTIONS") return res.status(204).end();
    return res.status(503).json({ error: "Novas assinaturas aguardam validação dos benefícios e das cobranças. Nenhuma cobrança foi iniciada.", code: "CHECKOUT_DISABLED" });
});

exports.cancelEcosystemSubscription = onRequest({ region: "us-central1", secrets: [mercadoPagoToken] }, async (req, res) => {
    cors(req, res); if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });
    try {
        await verifyAppCheck(req); const user = await requireParticipatingUser(req);
        const planId=String(req.body?.planId||""), plan=SG_ECOSYSTEM_PLANS[planId]; if(!plan)return res.status(400).json({error:"Plano inválido."});
        const ref=db.collection("users").doc(user.uid), snap=await ref.get(), current=snap.data()?.monetization?.[planId]||{};
        if(!current.subscriptionId)return res.status(404).json({error:"Assinatura não encontrada."});
        await mercadoPago(`/preapproval/${encodeURIComponent(current.subscriptionId)}`,{method:"PUT",body:JSON.stringify({status:"cancelled"})});
        await ref.set({monetization:{[planId]:{...current,status:"cancelled",cancelledAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()}},updatedAt:FieldValue.serverTimestamp()},{merge:true});
        return res.json({ok:true,status:"cancelled"});
    } catch(error){console.error("cancelEcosystemSubscription",error);return res.status(error.message==="UNAUTHENTICATED"?401:500).json({error:"Não foi possível cancelar a assinatura."});}
});

exports.ecosystemSubscriptionWebhook = onRequest({ region:"us-central1", secrets:[mercadoPagoToken, mercadoPagoWebhookSecret] }, async (req,res) => {
    try {
        const subscriptionId=String(req.query["data.id"]||req.body?.data?.id||req.body?.id||""); if(!subscriptionId)return res.status(200).json({received:true});
        if(!assinaturaMercadoPagoValida(req,subscriptionId))return res.status(401).json({error:"Assinatura inválida."});
        const subscription=await mercadoPago(`/preapproval/${encodeURIComponent(subscriptionId)}`), [uid,planId]=String(subscription.external_reference||"").split(":");
        if(!uid||!SG_ECOSYSTEM_PLANS[planId])return res.status(200).json({received:true});
        const status=subscription.status==="authorized"?"payment_pending":["cancelled","paused"].includes(subscription.status)?"cancelled":"payment_pending";
        await db.collection("users").doc(uid).set({monetization:{[planId]:{status,provider:"mercado_pago",subscriptionId,amount:SG_ECOSYSTEM_PLANS[planId].amount,interval:"monthly",paymentStatus:subscription.status||"unknown",updatedAt:FieldValue.serverTimestamp()}},updatedAt:FieldValue.serverTimestamp()},{merge:true});
        return res.status(200).json({received:true});
    }catch(error){console.error("ecosystemSubscriptionWebhook",error);return res.status(500).json({error:"Webhook não processado."});}
});
// Fluxos SG V66: exclusão protegida e menções verificadas no servidor.
Object.assign(exports,require('./sg-v66-functions.js'));

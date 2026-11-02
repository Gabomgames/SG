import {expireSfu} from './now-call.js';
import {reviewMarket} from './market-discovery.js';
import {resolveDispute} from './market.js';
import {socialApi,socialAdmin,uploadSocial,socialMedia,expireSocial} from './social.js';
import {communityApi} from './community.js';
import {subscriptionApi,subscriptionWebhook,reconcileSubscriptions} from './subscriptions.js';
import {adsApi,reviewAd,adWebhook,reconcileAds} from './ads.js';
import {marketApi,marketWebhook,marketRefund,expireMarket} from './market.js';
import {sellerStart,sellerCallback} from './seller-oauth.js';
import {adminApi} from './admin.js';
import { createOrder, statusOrder, listOrders, webhookOrder, reviewOrder, reconcilePending } from './payments.js';
import { safeRemoteImage, validateMediaSignature, verifyAccess } from './security.js';
import { uploadPrivate, readPrivate, deletePrivate, expirePrivate } from './private-media.js';
// Something Gamer API: apoio ao painel administrativo.
//
// O fluxo da Steam vivia aqui E em functions/index.js, duas implementações da
// mesma coisa. Ficou a das Cloud Functions, que grava no Firestore com o Admin
// SDK: os dados da Steam não passam mais pelo navegador, então não dá para
// forjar biblioteca nem conquistas. Este Worker cuida só do painel.

async function readJson(request) {
  const reader=request.body?.getReader();if(!reader)return {};
  const chunks=[];let total=0;
  while(true){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>32768){await reader.cancel();throw new Error("PAYLOAD_TOO_LARGE")}chunks.push(value)}
  const bytes=new Uint8Array(total);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
  return JSON.parse(new TextDecoder().decode(bytes));
}
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });

const origemLiberada = (env, origin) => {
  if ([env.APP_URL, "https://something-gamer.web.app", "https://something-gamer.firebaseapp.com"].includes(origin)) return true;
  // Live Server e outros servidores locais escolhem portas diferentes.
  return env.ALLOW_LOCAL_ORIGINS === "true" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d{2,5})?$/.test(origin);
};

function cors(env, request) {
  const origin = request.headers.get("Origin") || "";
  return {
    ...(origemLiberada(env, origin) ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" } : {}),
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Firebase-AppCheck",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin"
  };
}

const hex = bytes => [...new Uint8Array(bytes)].map(valor => valor.toString(16).padStart(2, "0")).join("");
const desHex = texto => {
  if (!/^[0-9a-f]*$/i.test(texto) || texto.length % 2) return null;
  return new Uint8Array(texto.match(/../g)?.map(par => parseInt(par, 16)) || []);
};
function randomCode(bytes = 24) {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

// Comparação em tempo constante: o Worker não tem crypto.timingSafeEqual.
function iguaisEmTempoConstante(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a[i] ^ b[i];
  return diferenca === 0;
}

// ---------- senhas do painel ----------
// Antes era SHA-256 puro, sem sal: uma tabela arco-íris resolvia. Agora é
// PBKDF2 com sal por senha. Hashes antigos continuam aceitos uma única vez e
// são regravados no formato novo assim que o administrador acerta a senha.
const PBKDF2_ITERACOES = 310000;

async function derivar(senha, sal, iteracoes = PBKDF2_ITERACOES) {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(senha)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: sal, iterations: iteracoes, hash: "SHA-256" }, chave, 256);
  return new Uint8Array(bits);
}

async function gerarHash(senha) {
  const sal = crypto.getRandomValues(new Uint8Array(32));
  const derivado = await derivar(senha, sal);
  return `pbkdf2$${PBKDF2_ITERACOES}$${hex(sal)}$${hex(derivado)}`;
}

async function sha256Legado(valor) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(valor))));
}

async function conferirSenha(senha, guardado) {
  if (!guardado) return { ok: false, legado: false };
  if (!guardado.startsWith("pbkdf2$")) {
    const antigo = await sha256Legado(senha);
    return { ok: iguaisEmTempoConstante(desHex(antigo), desHex(guardado)), legado: true };
  }
  const [, iteracoes, salHex, hashHex] = guardado.split("$");
  const sal = desHex(salHex);
  const esperado = desHex(hashHex);
  if (!sal || !esperado) return { ok: false, legado: false };
  const derivado = await derivar(senha, sal, Number(iteracoes) || PBKDF2_ITERACOES);
  return { ok: iguaisEmTempoConstante(derivado, esperado), legado: false };
}

// ---------- identidade ----------
// ---------- App Check / reCAPTCHA Enterprise ----------
// O navegador envia o token do Firebase App Check em X-Firebase-AppCheck.
// Enquanto APP_CHECK_ENFORCED=false, tokens presentes são validados mas a
// ausência não bloqueia. Isso permite ativar reCAPTCHA sem derrubar usuários
// durante a fase de observação.
let appCheckJwksCache = { expiresAt: 0, keys: [] };

function base64UrlBytes(value) {
  const base64 = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function jwtJson(segment) {
  return JSON.parse(new TextDecoder().decode(base64UrlBytes(segment)));
}

async function appCheckJwks() {
  if (appCheckJwksCache.keys.length && Date.now() < appCheckJwksCache.expiresAt) return appCheckJwksCache.keys;
  const response = await fetch("https://firebaseappcheck.googleapis.com/v1/jwks", { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("APP_CHECK_JWKS_FAILED");
  const data = await response.json();
  const cacheControl = response.headers.get("Cache-Control") || "";
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 21600);
  appCheckJwksCache = { expiresAt: Date.now() + Math.max(300, maxAge) * 1000, keys: Array.isArray(data.keys) ? data.keys : [] };
  return appCheckJwksCache.keys;
}

async function verifyAppCheckToken(token, env) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("APP_CHECK_INVALID");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = jwtJson(encodedHeader);
  const payload = jwtJson(encodedPayload);
  if (header.alg !== "RS256" || (header.typ && header.typ !== "JWT") || !header.kid) throw new Error("APP_CHECK_INVALID");

  const keys = await appCheckJwks();
  const jwk = keys.find(item => item.kid === header.kid);
  if (!jwk) throw new Error("APP_CHECK_INVALID");
  const publicKey = await crypto.subtle.importKey(
    "jwk", jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["verify"]
  );
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5", publicKey, base64UrlBytes(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  );
  if (!verified) throw new Error("APP_CHECK_INVALID");

  const projectNumber = String(env.FIREBASE_PROJECT_NUMBER || "").trim();
  const webAppId = String(env.FIREBASE_WEB_APP_ID || "").trim();
  const now = Math.floor(Date.now() / 1000);
  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud].filter(Boolean);
  if (!projectNumber || payload.iss !== `https://firebaseappcheck.googleapis.com/${projectNumber}`) throw new Error("APP_CHECK_INVALID");
  if (!audience.includes(`projects/${projectNumber}`)) throw new Error("APP_CHECK_INVALID");
  if (!Number.isFinite(payload.exp) || payload.exp <= now) throw new Error("APP_CHECK_INVALID");
  if (payload.iat && payload.iat > now + 60) throw new Error("APP_CHECK_INVALID");
  if (webAppId && payload.sub !== webAppId) throw new Error("APP_CHECK_INVALID");
  return payload;
}

async function requireAppCheck(request, env) {
  const enforced = String(env.APP_CHECK_ENFORCED || "false").toLowerCase() === "true";
  const token = request.headers.get("X-Firebase-AppCheck") || "";
  if (!token) {
    if (enforced) throw new Error("APP_CHECK_REQUIRED");
    return null;
  }
  try {
    return await verifyAppCheckToken(token, env);
  } catch (error) {
    console.warn("APP_CHECK", error?.message || error);
    if (enforced) throw new Error("APP_CHECK_INVALID");
    return null;
  }
}

async function firebaseUser(request, env) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) throw new Error("UNAUTHENTICATED");
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: header.slice(7) })
  });
  const data = await response.json();
  const conta = data.users?.[0];
  if (!response.ok || !conta?.localId) throw new Error("UNAUTHENTICATED");
  const claims = jwtJson(header.slice(7).split(".")[1]);
  if (claims.aud !== env.FIREBASE_PROJECT_ID || claims.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`) throw new Error("UNAUTHENTICATED");
  return { uid: conta.localId, email: conta.email || "", emailVerificado: conta.emailVerified === true, claims };
}

async function requireAdmin(request, env) {
  const admin = await firebaseUser(request, env);
  const configured = String(env.ADMIN_UIDS || env.ADMIN_UID || "").split(",").map(v => v.trim()).filter(Boolean);
  if (!configured.length) throw new Error("ADMIN_NOT_CONFIGURED");
  const allowed = new Set(configured);
  if (!allowed.has(admin.uid) || admin.claims.admin !== true || !admin.emailVerificado) throw new Error("FORBIDDEN");
  if (env.ADMIN_ENABLED !== "true") throw new Error("ADMIN_NOT_CONFIGURED");
  if (!admin.claims.firebase?.sign_in_second_factor || Date.now()/1000 - Number(admin.claims.auth_time || 0) > 900) throw new Error("ADMIN_REAUTH_REQUIRED");
  await verifyAccess(request, env, admin.email);
  return admin;
}


// ---------- reCAPTCHA v2 Checkbox (cadastro público) ----------
async function verifyRegistrationRecaptcha(request, env) {
  if (!env.RECAPTCHA_V2_SECRET) throw new Error("RECAPTCHA_NOT_CONFIGURED");

  const body = await readJson(request).catch(() => ({}));
  const token = String(body.token || "").trim();
  if (!token || token.length > 10000) throw new Error("RECAPTCHA_REQUIRED");

  const form = new URLSearchParams();
  form.set("secret", env.RECAPTCHA_V2_SECRET);
  form.set("response", token);

  const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: form.toString()
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("RECAPTCHA_VERIFY_FAILED");
  if (result.success !== true) throw new Error("RECAPTCHA_REJECTED");

  const allowedHostnames = new Set([
    "something-gamer.web.app",
    "something-gamer.firebaseapp.com",
    "localhost",
    "127.0.0.1"
  ]);
  try {
    if (env.APP_URL) allowedHostnames.add(new URL(env.APP_URL).hostname);
  } catch {}

  if (result.hostname && !allowedHostnames.has(String(result.hostname))) {
    throw new Error("RECAPTCHA_HOSTNAME");
  }

  return { ok: true };
}

// ---------- mídia social (KV) ----------
// Usa o namespace SG_AUTH já existente para evitar Firebase Storage/billing nesta fase.
// IDs aleatórios de 192 bits impedem enumeração prática. Para escala alta, migrar a R2.
const MEDIA_TYPES = new Set([
  "image/jpeg","image/png","image/webp","image/gif",
  "video/mp4","video/webm","video/quicktime",
  "audio/webm","audio/ogg","audio/mpeg","audio/mp4","audio/aac","audio/x-m4a"
]);
const MEDIA_MAX_BYTES = 20 * 1024 * 1024;

async function uploadMedia(request, env) {
  const user = await firebaseUser(request, env);
  await requireAppCheck(request, env);
  const contentType = String(request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (!MEDIA_TYPES.has(contentType)) throw new Error("MEDIA_TYPE_NOT_ALLOWED");
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length && length > MEDIA_MAX_BYTES) throw new Error("MEDIA_TOO_LARGE");
  const throttleKey = `media-throttle:${user.uid}`;
  if (await env.SG_AUTH.get(throttleKey)) throw new Error("MEDIA_RATE_LIMITED");
  if (new URL(request.url).searchParams.get("scope") === "private") throw new Error("PRIVATE_MEDIA_NOT_CONFIGURED");
  if (env.PUBLIC_MEDIA_ENABLED !== "true") throw new Error("MEDIA_NOT_CONFIGURED");
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MEDIA_MAX_BYTES) throw new Error("MEDIA_TOO_LARGE");
  validateMediaSignature(new Uint8Array(bytes), contentType);
  const mediaId = randomCode(24);
  const name = decodeURIComponent(new URL(request.url).searchParams.get("name") || "media").replace(/[\r\n]/g, "").slice(0,120);
  await env.SG_AUTH.put(`media:${mediaId}`, bytes, { metadata: { uid:user.uid, contentType, name, size:bytes.byteLength, createdAt:Date.now() } });
  await env.SG_AUTH.put(throttleKey, "1", { expirationTtl: 60 });
  return { ok:true, mediaId, url:`${new URL(request.url).origin}/media/${mediaId}`, contentType, size:bytes.byteLength };
}

async function serveMedia(request, env, mediaId) {
  if (env.PUBLIC_MEDIA_ENABLED !== "true") return new Response("Media unavailable", {status:503, headers:{"Cache-Control":"no-store"}});
  if (!/^[0-9a-f]{48}$/i.test(mediaId)) return new Response("Not found", { status:404 });
  const result = await env.SG_AUTH.getWithMetadata(`media:${mediaId}`, { type:"arrayBuffer", cacheTtl:300 });
  if (!result?.value) return new Response("Not found", { status:404 });
  const type = String(result.metadata?.contentType || "application/octet-stream");
  return new Response(result.value, { status:200, headers:{
    "Content-Type":type,
    "Cache-Control":"public, max-age=31536000, immutable",
    "X-Content-Type-Options":"nosniff",
    "Access-Control-Allow-Origin":"*",
    "Cross-Origin-Resource-Policy":"cross-origin"
  }});
}

// ---------- e-mails ----------
function safe(value) {
  return String(value || "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function moldura(env, titulo, corpo, botao = "") {
  return `<!doctype html><html><body style="margin:0;background:#07080c;color:#f7f7fa;font-family:Arial,sans-serif"><table role="presentation" width="100%"><tr><td align="center" style="padding:36px 16px"><table role="presentation" width="100%" style="max-width:560px;background:#111218;border:1px solid #292b35;border-radius:18px"><tr><td style="padding:34px"><div style="color:#7965ff;font-size:12px;font-weight:700;letter-spacing:2px">SOMETHING GAMER</div><h1 style="font-size:28px;margin:18px 0 12px">${titulo}</h1><p style="color:#b9bbc8;line-height:1.7">${corpo}</p>${botao}<p style="margin-top:28px;color:#777b8c;font-size:12px">Mensagem automática. Não responda a este e-mail.</p></td></tr></table></td></tr></table></body></html>`;
}

async function enviarEmail(env, { to, subject, html }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.RESEND_FROM, to: [to], subject, html })
  });
  const resultado = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("RESEND", response.status);
    throw new Error("EMAIL_SEND_FAILED");
  }
  return resultado;
}


// ---------- senha por área do painel ----------
const areaValida = area => ["verification", "promotion", "community", "release"].includes(area);

async function adminAccess(request, env, action) {
  const body = await readJson(request);
  const area = String(body.area || "");
  if (!areaValida(area)) throw new Error("INVALID_ACCESS_AREA");

  const admin = await requireAdmin(request, env);

  if (action === "recover") throw new Error("RECOVERY_NOT_CONFIGURED"); // recuperação somente pelo provedor de identidade

  if (action === "verify") {
    const tentativasKey = `admin-attempts:${admin.uid}:${area}`;
    const tentativas = Number(await env.SG_AUTH.get(tentativasKey) || 0);
    if (tentativas >= 5) throw new Error("TOO_MANY_ATTEMPTS");

    const guardado = await env.SG_AUTH.get(`admin-password:${area}`);
    let confere;
    if (guardado) {
      confere = await conferirSenha(body.password || "", guardado);
    } else confere = { ok: false, legado: false };

    if (!confere.ok) {
      await env.SG_AUTH.put(tentativasKey, String(tentativas + 1), { expirationTtl: 900 });
      throw new Error("INVALID_ADMIN_PASSWORD");
    }
    // acertou com hash antigo (ou senha de arranque): regrava já no formato novo
    if (confere.legado) await env.SG_AUTH.put(`admin-password:${area}`, await gerarHash(body.password));

    await env.SG_AUTH.delete(tentativasKey);
    const accessToken = randomCode(32);
    await env.SG_AUTH.put(`admin-access:${accessToken}`, JSON.stringify({ uid: admin.uid, area }), { expirationTtl: 1800 });
    return { ok: true, accessToken, expiresIn: 1800 };
  }

  if (action === "check") {
    const bruto = await env.SG_AUTH.get(`admin-access:${String(body.accessToken || "")}`);
    const sessao = bruto ? JSON.parse(bruto) : null;
    if (!sessao || sessao.uid !== admin.uid || sessao.area !== area) throw new Error("ADMIN_SESSION_EXPIRED");
    return { ok: true };
  }

  throw new Error("INVALID_ACCESS_ACTION");
}


// ---------- SG Shield: moderação por IA + GIF proxy ----------
function textoSeguroEntrada(valor, maximo = 5000) {
  const texto = String(valor || "").trim();
  if (!texto || texto.length > maximo) throw new Error("INVALID_MODERATION_REQUEST");
  return texto;
}

async function imagemParaDataUrl(imageUrl) {
  if (!/^https:\/\//i.test(imageUrl) || imageUrl.length > 2048) throw new Error("INVALID_MODERATION_REQUEST");

  safeRemoteImage(imageUrl);
  const response = await fetch(imageUrl, {
    redirect: "error", signal: AbortSignal.timeout(10000),
    headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,image/*" }
  });
  if (!response.ok) throw new Error("MODERATION_FAILED");

  const contentType = String(response.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (!/^image\/(png|jpeg|jpg|webp|gif|avif)$/.test(contentType)) throw new Error("INVALID_MODERATION_REQUEST");

  const length = Number(response.headers.get("Content-Length") || 0);
  if (length > 5 * 1024 * 1024) throw new Error("INVALID_MODERATION_REQUEST");

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > 5 * 1024 * 1024) throw new Error("INVALID_MODERATION_REQUEST");

  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

const categoriasLlamaGuard = {
  S1: "violent_crimes",
  S2: "non_violent_crimes",
  S3: "sex_related_crimes",
  S4: "child_sexual_exploitation",
  S5: "defamation",
  S6: "specialized_advice",
  S7: "privacy",
  S8: "intellectual_property",
  S9: "weapons",
  S10: "hate",
  S11: "self_harm",
  S12: "sexual_content",
  S13: "elections",
  S14: "code_interpreter_abuse"
};

function interpretarLlamaGuard(resultado) {
  const bruto = String(resultado?.response || resultado || "").trim();
  const normalizado = bruto.toLowerCase();
  const codigos = [...new Set(bruto.toUpperCase().match(/\bS(?:1[0-4]|[1-9])\b/g) || [])];
  const categories = codigos.map(codigo => categoriasLlamaGuard[codigo] || codigo);

  if (/^safe\b/.test(normalizado)) {
    return { flagged: false, categories: [], raw: bruto };
  }
  if (/^unsafe\b/.test(normalizado)) {
    return { flagged: true, categories, raw: bruto };
  }
  throw new Error("MODERATION_FAILED");
}

async function classificarTextoComLlamaGuard(env, texto) {
  if (!env.AI) throw new Error("MODERATION_NOT_CONFIGURED");

  const resultado = await env.AI.run("@cf/meta/llama-guard-3-8b", {
    messages: [
      {
        role: "user",
        content: texto
      }
    ],
    max_tokens: 80,
    temperature: 0
  });

  return interpretarLlamaGuard(resultado);
}

async function descreverImagemParaModeracao(env, imageUrl) {
  const image = await imagemParaDataUrl(imageUrl);
  const resultado = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", {
    messages: [
      {
        role: "system",
        content: "Analise a imagem apenas para moderacao de uma rede social gamer. Descreva objetivamente qualquer nudez ou conteudo sexual, exploracao de menores, violencia grafica, armas, drogas, odio ou simbolos extremistas, automutilacao, dados pessoais visiveis, fraude ou atividade criminosa. Nao invente detalhes. Se nada disso estiver presente, diga que nao ha conteudo de risco evidente."
      },
      {
        role: "user",
        content: "Descreva somente os elementos relevantes para seguranca desta imagem."
      }
    ],
    image,
    max_tokens: 220,
    temperature: 0
  });

  const descricao = String(resultado?.response || "").trim();
  if (!descricao) throw new Error("MODERATION_FAILED");
  return descricao.slice(0, 4000);
}

async function moderateContent(request, env) {
  await firebaseUser(request, env);
  await requireAppCheck(request, env);
  if (!env.AI) throw new Error("MODERATION_NOT_CONFIGURED");

  const body = await readJson(request).catch(() => ({}));
  const text = body.text ? textoSeguroEntrada(body.text, 5000) : "";
  const imageUrl = String(body.imageUrl || "").trim();
  if (!text && !imageUrl) throw new Error("INVALID_MODERATION_REQUEST");

  let textoParaAnalise = text;
  let imageChecked = false;

  if (imageUrl) {
    const descricaoImagem = await descreverImagemParaModeracao(env, imageUrl);
    imageChecked = true;
    textoParaAnalise = [
      text ? `Texto enviado pelo usuario:\n${text}` : "",
      `Descricao de seguranca da imagem:\n${descricaoImagem}`
    ].filter(Boolean).join("\n\n");
  }

  const resultado = await classificarTextoComLlamaGuard(env, textoParaAnalise);

  return {
    ok: true,
    allowed: resultado.flagged !== true,
    flagged: resultado.flagged === true,
    categories: resultado.categories,
    risk: resultado.flagged === true ? "review" : "low",
    provider: "cloudflare-workers-ai",
    model: "@cf/meta/llama-guard-3-8b",
    imageChecked
  };
}

const GIPHY_LANGS = new Set(["en","es","pt","fr","de","it","ja"]);
function giphyLanguage(value){const lang=String(value||"pt").toLowerCase().split("-")[0];return GIPHY_LANGS.has(lang)?lang:"en"}
function giphyItems(data, origin){
  return (data.data||[]).map(item=>{
    const id=String(item.id||"");
    return {id,title:String(item.title||"GIF").slice(0,120),url:id?`${origin}/giphy/media/${encodeURIComponent(id)}`:""};
  }).filter(item=>item.id&&item.url)
}
async function serveGiphyMedia(request, id) {
  if (!/^[a-zA-Z0-9_-]{3,80}$/.test(id)) return new Response("Not found", { status:404 });
  const upstream=await fetch(`https://media.giphy.com/media/${encodeURIComponent(id)}/giphy.gif`,{headers:{Accept:"image/avif,image/webp,image/gif,image/*"},cf:{cacheEverything:true,cacheTtl:86400}});
  if(!upstream.ok)return new Response("GIF unavailable",{status:upstream.status});
  const headers=new Headers(upstream.headers);headers.set("Cache-Control","public, max-age=86400, stale-while-revalidate=604800");headers.set("Access-Control-Allow-Origin","*");headers.delete("Set-Cookie");
  return new Response(upstream.body,{status:200,headers});
}
async function giphyRequest(request, env, mode) {
  const user = await firebaseUser(request, env);
  await requireAppCheck(request, env);
  const body = await readJson(request).catch(() => ({}));
  if (!env.GIPHY_API_KEY) throw new Error("GIPHY_NOT_CONFIGURED");
  const lang = giphyLanguage(body.lang);
  const endpoint = mode === "trending" ? "trending" : "search";
  const url = new URL(`https://api.giphy.com/v1/gifs/${endpoint}`);
  url.searchParams.set("api_key", env.GIPHY_API_KEY);
  url.searchParams.set("limit", "24");
  url.searchParams.set("rating", "pg-13");
  if (mode === "search") {
    const query = String(body.query || "").trim().slice(0, 60);
    if (!query) throw new Error("INVALID_GIF_REQUEST");
    url.searchParams.set("q", query);
    url.searchParams.set("lang", lang);
  }
  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("GIPHY", response.status);
    throw new Error("GIF_SEARCH_FAILED");
  }
  return { ok:true, gifs:giphyItems(data, new URL(request.url).origin) };
}
async function searchGifs(request, env) { return giphyRequest(request, env, "search"); }
async function trendingGifs(request, env) { return giphyRequest(request, env, "trending"); }

// ---------- Cloudflare Realtime TURN ----------
async function turnCredentials(request, env) {
  const user = await firebaseUser(request, env);
  await requireAppCheck(request, env);
  if (!env.CLOUDFLARE_TURN_KEY_ID || !env.CLOUDFLARE_TURN_KEY_API_TOKEN) throw new Error("TURN_NOT_CONFIGURED");
  const throttleKey = `turn-throttle:${user.uid}`;
  if (await env.SG_AUTH.get(throttleKey)) throw new Error("RATE_LIMITED");
  const body = await readJson(request).catch(() => ({}));
  const ttl = Math.max(600, Math.min(86400, Number(body.ttl || 7200)));
  const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.CLOUDFLARE_TURN_KEY_ID)}/credentials/generate-ice-servers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_TURN_KEY_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ ttl })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(data.iceServers)) {
    console.error("TURN", response.status);
    throw new Error("TURN_PROVIDER_FAILED");
  }
  const iceServers = data.iceServers.map(server => {
    const urls = (Array.isArray(server.urls) ? server.urls : [server.urls]).filter(Boolean).filter(url => !/:53(?:\?|$)/.test(String(url)));
    return { ...server, urls };
  }).filter(server => server.urls.length);
  await env.SG_AUTH.put(throttleKey, "1", { expirationTtl: 60 });
  return { ok:true, iceServers, ttl, provider:"cloudflare-realtime" };
}

// ---------- Mercado Pago: módulos transacionais ----------
async function mercadoPago(path, env, init = {}) {
  if (!env.MERCADOPAGO_ACCESS_TOKEN) throw new Error("MERCADOPAGO_NOT_CONFIGURED");
  const isTest = String(env.MERCADOPAGO_ACCESS_TOKEN).startsWith("TEST-");
  if (!['test','production'].includes(env.PAYMENT_ENV) || (env.PAYMENT_ENV === 'test') !== isTest) throw new Error("PAYMENT_ENV_MISMATCH");
  let response;
  try { response = await fetch(`https://api.mercadopago.com${path}`, {
    ...init, signal: AbortSignal.timeout(12000), headers: { Accept: "application/json", "Content-Type": "application/json",
    Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`, ...(init.headers || {}) }
  }); } catch { throw new Error("MERCADOPAGO_FAILED"); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { console.warn(JSON.stringify({ event: "provider_failed", provider: "mercado_pago", status: response.status })); throw new Error("MERCADOPAGO_FAILED"); }
  return data;
}
async function participatingUser(request, env) {
  const user = await firebaseUser(request, env);
  await requireAppCheck(request, env);
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(user.uid)}`, {
    headers: { Authorization: request.headers.get("Authorization") }, signal: AbortSignal.timeout(10000)
  });
  const data = await response.json().catch(() => ({}));
  const fields = data.fields || {}, legal = fields.legal?.mapValue?.fields || {}, moderation = fields.moderation?.mapValue?.fields || {};
  const suspended = moderation.status?.stringValue === 'suspended' && Date.parse(moderation.suspendedUntil?.timestampValue || '') <= Date.now();
  if (!response.ok || legal.termsAccepted?.booleanValue !== true || legal.termsVersion?.stringValue !== '2026-09-16'
      || legal.privacyVersion?.stringValue !== '2026-09-16' || legal.communityRulesVersion?.stringValue !== '2026-09-16'
      || (moderation.status?.stringValue && moderation.status.stringValue !== 'active' && !suspended)) throw new Error("ACCOUNT_RESTRICTED");
  return user;
}
export default {
  async scheduled(event, env, ctx) {
    if(new Date(event.scheduledTime||Date.now()).getUTCMinutes()%15!==0){ctx.waitUntil(expireSfu(env));return;}
    ctx.waitUntil(Promise.allSettled([reconcilePending(env, mercadoPago), expirePrivate(env),expireMarket(env),reconcileSubscriptions(env),reconcileAds(env),expireSocial(env),expireSfu(env)]));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = { ...cors(env, request), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
    const origin = request.headers.get("Origin");
    const requestId = crypto.randomUUID();
    headers["X-Request-ID"] = requestId;
    if (origin && !origemLiberada(env, origin)) return json({ error: "Origem não autorizada.", code: "ORIGIN_NOT_ALLOWED" }, 403, headers);
    if (Number(request.headers.get("Content-Length")) > MEDIA_MAX_BYTES) return json({ error: "Requisição muito grande." }, 413, headers);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    try {
      if (request.method === "POST" && url.pathname !== "/media/upload") await readJson(request.clone());
      if (url.pathname === "/health") return json({ ok: true, service: "Something Gamer API", shield: Boolean(env.AI), moderation: "cloudflare-workers-ai", media: env.PUBLIC_MEDIA_ENABLED === "true", privateMedia: Boolean((env.SG_MEDIA || env.SG_AUTH) && env.SG_DB), payments: env.PAYMENTS_ENABLED === "true" && Boolean(env.SG_DB), marketplaceCheckout: false }, 200, headers);
      if (url.pathname.startsWith("/giphy/media/") && request.method === "GET") return serveGiphyMedia(request, url.pathname.split("/").pop());
      if (url.pathname.startsWith("/media/") && request.method === "GET") return serveMedia(request, env, url.pathname.split("/").pop());
      if (url.pathname === "/media/upload" && request.method === "POST") return json(await (url.searchParams.get('scope') === 'public-social' ? uploadSocial(request,env,await participatingUser(request,env)) : url.searchParams.get('scope') === 'private' ? uploadPrivate(request, env, await participatingUser(request, env)) : uploadMedia(request, env)), 200, headers);
      if (url.pathname === "/media/read" && request.method === "POST") {
        const response = await readPrivate(request, env, await firebaseUser(request, env));
        Object.entries(headers).forEach(([key,value]) => response.headers.set(key,value));
        return response;
      }
      if (url.pathname === "/media/delete" && request.method === "POST") return json(await deletePrivate(request,env,await firebaseUser(request,env)),200,headers);
      if (url.pathname.startsWith("/social/media/") && request.method === "GET") {const response=await socialMedia(env,url.pathname.split('/').pop());Object.entries(headers).forEach(([k,v])=>response.headers.set(k,v));return response;}
      if (url.pathname === "/social/media/read" && request.method === "POST") {const user=await participatingUser(request,env);const b=await request.json();const response=await socialMedia(env,b.id,{user});Object.entries(headers).forEach(([k,v])=>response.headers.set(k,v));return response;}
      if (url.pathname === "/admin/social/media" && request.method === "POST") {await requireAdmin(request,env);const b=await request.json();const response=await socialMedia(env,b.id,{admin:true});Object.entries(headers).forEach(([k,v])=>response.headers.set(k,v));return response;}
      if (url.pathname === "/admin/social" && request.method === "POST") return json(await socialAdmin(request,env,await requireAdmin(request,env)),200,headers);
      if (url.pathname.startsWith("/social/") && request.method === "POST") return json(await socialApi(request,env,await participatingUser(request,env),async text=>{if(!env.AI)throw new Error("MODERATION_NOT_CONFIGURED");return !(await classificarTextoComLlamaGuard(env,text)).flagged;}),200,headers);
      if (url.pathname === "/recaptcha/verify" && request.method === "POST") return json(await verifyRegistrationRecaptcha(request, env), 200, headers);
      if (url.pathname === "/moderate" && request.method === "POST") return json(await moderateContent(request, env), 200, headers);
      if (url.pathname === "/giphy/search" && request.method === "POST") return json(await searchGifs(request, env), 200, headers);
      if (url.pathname === "/giphy/trending" && request.method === "POST") return json(await trendingGifs(request, env), 200, headers);
      if (url.pathname === "/turn/credentials" && request.method === "POST") return json(await turnCredentials(request, env), 200, headers);
      if (url.pathname === "/market/seller/callback" && request.method === "GET") return sellerCallback(request,env);
      if (url.pathname === "/market/seller/connect" && request.method === "POST") return json(await sellerStart(env,await participatingUser(request,env)),200,headers);
      if (url.pathname === "/market/webhook" && ["GET","POST"].includes(request.method)) return json(await marketWebhook(request,env),200,headers);
      if (url.pathname === "/market/refund" && request.method === "POST") return json(await marketRefund(request,env,await requireAdmin(request,env)),200,headers);
      if (url.pathname.startsWith("/community/") && request.method === "POST") return json(await communityApi(request,env,await participatingUser(request,env),async text=>{if(!env.AI)throw new Error("MODERATION_NOT_CONFIGURED");return !(await classificarTextoComLlamaGuard(env,text)).flagged;}),200,headers);
      if (url.pathname === "/market/disputes/resolve" && request.method === "POST") return json(await resolveDispute(request,env,await requireAdmin(request,env)),200,headers);
      if (url.pathname === "/market/listing/review" && request.method === "POST") return json(await reviewMarket(env,await requireAdmin(request,env),await request.json()),200,headers);
      if (url.pathname.startsWith("/market/") && request.method === "POST") return json(await marketApi(request,env,await participatingUser(request,env)),200,headers);
      if (url.pathname === "/subscriptions/public" && request.method === "GET") {const uid=url.searchParams.get("uid")||"";if(!/^[a-zA-Z0-9_-]{1,128}$/.test(uid))throw new Error("INVALID_SUBSCRIPTION");if(!env.SG_DB)return json({ok:true,plans:[]},200,headers);const publicProfile=await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/publicProfiles/${encodeURIComponent(uid)}`);if(!publicProfile.ok)return json({ok:true,plans:[]},200,headers);const profile=await publicProfile.json();if(profile.fields?.visibility?.stringValue!=="public")return json({ok:true,plans:[]},200,headers);const rows=await env.SG_DB.prepare("SELECT DISTINCT s.plan FROM subscriptions s JOIN subscription_charges c ON c.subscription_id=s.id WHERE s.uid=? AND c.status='approved' AND c.expires_at>?").bind(uid,Date.now()).all();return json({ok:true,plans:rows.results.map(x=>x.plan)},200,headers);}
      if (url.pathname === "/subscriptions/webhook" && ["GET","POST"].includes(request.method)) return json(await subscriptionWebhook(request,env),200,headers);
      if (url.pathname.startsWith("/subscriptions/") && request.method === "POST") return json(await subscriptionApi(request,env,await participatingUser(request,env)),200,headers);
      if (url.pathname === "/ads/webhook" && ["GET","POST"].includes(request.method)) return json(await adWebhook(request,env),200,headers);
      if (url.pathname === "/ads/review" && request.method === "POST") return json(await reviewAd(request,env,await requireAdmin(request,env)),200,headers);
      if (url.pathname.startsWith("/ads/") && request.method === "POST") return json(await adsApi(request,env,await participatingUser(request,env)),200,headers);
      if (url.pathname === "/admin/commerce" && request.method === "POST") {await requireAdmin(request,env);if(!env.SG_DB)throw new Error("MARKET_NOT_CONFIGURED");const tables=["market_orders","market_disputes","ad_campaigns"];const out=await Promise.all(tables.map(table=>env.SG_DB.prepare(table==="ad_campaigns"?"SELECT c.*,x.media_id,m.type AS media_type FROM ad_campaigns c LEFT JOIN ad_creatives x ON x.campaign_id=c.id LEFT JOIN social_media m ON m.id=x.media_id ORDER BY c.created_at DESC LIMIT 100":`SELECT * FROM ${table} ORDER BY created_at DESC LIMIT 100`).all()));return json({ok:true,orders:out[0].results,disputes:out[1].results,campaigns:await Promise.all(out[2].results.map(async c=>({...c,nativeAds:(await env.SG_DB.prepare("SELECT a.name,a.headline,a.body,a.format,a.media_ids,a.target_url FROM now_ads a JOIN now_ad_sets s ON s.id=a.set_id WHERE s.campaign_id=? ORDER BY a.created_at LIMIT 100").bind(c.id).all()).results})))},200,headers);}
      if (url.pathname === "/payments/create" && request.method === "POST") return json(await createOrder(request,env,await participatingUser(request, env),mercadoPago),200,headers);
      if (url.pathname === "/payments/status" && request.method === "POST") return json(await statusOrder(request,env,await firebaseUser(request, env),mercadoPago),200,headers);
      if (url.pathname === "/payments/webhook" && ["POST","GET"].includes(request.method)) return json(await webhookOrder(request,env,mercadoPago),200,headers);
      if (url.pathname === "/payments/list" && request.method === "POST") return json(await listOrders(env,await firebaseUser(request,env)),200,headers);
      if (url.pathname === "/payments/review" && request.method === "POST") return json(await reviewOrder(request,env,await requireAdmin(request,env)),200,headers);
      if (url.pathname === "/adminApi" && request.method === "POST") return json(await adminApi(request,env,await requireAdmin(request,env)),200,headers);
      if (url.pathname === "/admin/payments" && request.method === "POST") {await requireAdmin(request,env);if(!env.SG_DB)throw new Error("PAYMENT_STORAGE_NOT_CONFIGURED");const payments=(await env.SG_DB.prepare("SELECT * FROM payments ORDER BY CASE WHEN state='approved' AND review='pending' THEN 0 ELSE 1 END,created_at DESC LIMIT 100").all()).results;const audit=(await env.SG_DB.prepare("SELECT * FROM admin_audit ORDER BY created_at DESC LIMIT 100").all()).results;return json({ok:true,payments,audit},200,headers);}
      if (url.pathname === "/adminNotify" && request.method === "POST") return json(await adminNotify(request, env), 200, headers);
      if (url.pathname.startsWith("/adminAccess/") && request.method === "POST") return json(await adminAccess(request, env, url.pathname.split("/").pop()), 200, headers);
      return json({ error: "Rota não encontrada." }, 404, headers);
    } catch (error) {
      const code = error.message;
      console.error(JSON.stringify({ event: "request_failed", requestId, code: /^[A-Z_]+$/.test(code) ? code : "INTERNAL_ERROR", path: url.pathname }));
      const status =
        ["SOCIAL_NOT_CONFIGURED","SOCIAL_MEDIA_DISABLED"].includes(code) ? 503 :
        code === "INVALID_WEBHOOK_SIGNATURE" || code === "UNAUTHENTICATED" || code === "ADMIN_REAUTH_REQUIRED" ? 401 :
        code === "PAYLOAD_TOO_LARGE" ? 413 :
        ["IDEMPOTENCY_CONFLICT","PAYMENT_NOT_REVIEWABLE","RESOURCE_CONFLICT"].includes(code) ? 409 :
        code === "ACCOUNT_RESTRICTED" ? 403 :
        ["PAYMENTS_DISABLED", "PAYMENTS_NOT_CONFIGURED", "PAYMENT_STORAGE_NOT_CONFIGURED", "WEBHOOK_NOT_CONFIGURED", "PAYMENT_ENV_MISMATCH", "FIRESTORE_NOT_CONFIGURED", "ADMIN_NOT_CONFIGURED", "PRIVATE_MEDIA_NOT_CONFIGURED", "MEDIA_NOT_CONFIGURED", "MEDIA_NOT_READY", "MARKET_NOT_CONFIGURED", "MARKET_CHECKOUT_DISABLED", "SELLER_NOT_CONNECTED", "SUBSCRIPTIONS_NOT_CONFIGURED", "SUBSCRIPTIONS_DISABLED", "ADS_NOT_CONFIGURED", "ADS_CHECKOUT_DISABLED"].includes(code) ? 503 :
        code === "FIRESTORE_FAILED" ? 502 :
        ["AUDIENCE_TOO_SMALL","INVALID_SOCIAL_INPUT", "INVALID_COMMUNITY_INPUT", "CONTENT_REJECTED", "INVALID_AD_INPUT", "INVALID_SUBSCRIPTION", "INVALID_MARKET_INPUT", "MULTIPLE_SELLERS", "INVALID_ADMIN_ACTION", "INVALID_MEDIA_CONTEXT", "INVALID_REVIEW", "INVALID_IDEMPOTENCY_KEY", "MEDIA_SIGNATURE_INVALID"].includes(code) ? 400 :
        code === "APP_CHECK_REQUIRED" || code === "APP_CHECK_INVALID" ? 401 :
        code === "FORBIDDEN" ? 403 :
        code === "INVALID_RESET_TOKEN" ? 410 :
        code === "RATE_LIMITED" || code === "TOO_MANY_ATTEMPTS" || code === "MEDIA_RATE_LIMITED" ? 429 :
        ["INVALID_EMAIL_REQUEST", "INVALID_ACCESS_AREA", "WEAK_PASSWORD", "INVALID_ADMIN_PASSWORD", "INVALID_RECOVERY_CODE", "INVALID_ACCESS_ACTION", "INVALID_MODERATION_REQUEST", "INVALID_GIF_REQUEST", "RECAPTCHA_REQUIRED", "RECAPTCHA_REJECTED", "RECAPTCHA_HOSTNAME", "MEDIA_TYPE_NOT_ALLOWED", "MEDIA_TOO_LARGE", "INVALID_PAYMENT_PLAN", "INVALID_PAYMENT_ORDER", "PAYMENT_MISMATCH"].includes(code) ? 400 :
        code === "GIPHY_NOT_CONFIGURED" ? 503 :
        code === "TURN_NOT_CONFIGURED" ? 503 :
        code === "TURN_PROVIDER_FAILED" ? 502 :
        code === "MERCADOPAGO_NOT_CONFIGURED" ? 503 :
        ["PAYMENT_NOT_FOUND","MEDIA_NOT_FOUND","RESOURCE_NOT_FOUND"].includes(code) ? 404 :
        code === "RECOVERY_NOT_CONFIGURED" ? 503 :
        code === "RECAPTCHA_NOT_CONFIGURED" ? 503 :
        code === "RECAPTCHA_VERIFY_FAILED" ? 502 :
        code === "ADMIN_SESSION_EXPIRED" ? 401 :
        code === "MODERATION_NOT_CONFIGURED" ? 503 :
        code === "MODERATION_FAILED" || code === "GIF_SEARCH_FAILED" || code === "MERCADOPAGO_FAILED" ? 502 : 500;
      const mensagens = {
        SOCIAL_NOT_CONFIGURED: "Stories e vídeos aguardam configuração do banco de homologação.",
        SOCIAL_MEDIA_DISABLED: "Uploads sociais ainda não foram habilitados neste ambiente.",
        SUBSCRIPTIONS_NOT_CONFIGURED: "Assinaturas aguardam configuração do banco e do provedor.",
        SUBSCRIPTIONS_DISABLED: "As cobranças recorrentes ainda não foram habilitadas neste ambiente.",
        ADS_NOT_CONFIGURED: "Campanhas aguardam o banco transacional.",
        ADS_CHECKOUT_DISABLED: "Cobrança de campanhas ainda não habilitada neste ambiente.",
        MARKET_NOT_CONFIGURED: "O Market aguarda o banco transacional e as configurações de integração.",
        MARKET_CHECKOUT_DISABLED: "Checkout de homologação não habilitado. Nenhuma cobrança foi iniciada.",
        SELLER_NOT_CONNECTED: "O vendedor precisa conectar sua conta Mercado Pago para receber pela plataforma.",
        RESOURCE_CONFLICT: "O registro mudou ou o estoque está indisponível. Atualize e tente novamente.",
        INVALID_MARKET_INPUT: "Confira os dados do anúncio ou pedido.",
        PAYMENTS_DISABLED: "Checkout em preparação. Nenhuma cobrança foi iniciada.",
        PAYMENTS_NOT_CONFIGURED: "O pagamento aguarda configuração e validação do servidor.",
        PAYMENT_STORAGE_NOT_CONFIGURED: "O registro seguro de pedidos ainda não foi configurado.",
        PRIVATE_CALL_SFU_NOT_CONFIGURED: "Servidor de mídia não configurado.",
        CALL_SFU_FAILED: "Não foi possível conectar ao servidor de mídia.",
        MEDIA_NOT_CONFIGURED: "Anexos privados indisponíveis. Use mensagens de texto enquanto o armazenamento seguro é configurado.",
        CALL_SFU_NOT_CONFIGURED: "Servidor de mídia não configurado.",
        CALL_SFU_FAILED: "Não foi possível conectar ao servidor de mídia.",
        MEDIA_NOT_CONFIGURED: "Uploads aguardam configuração e revisão de privacidade.",
        ADMIN_NOT_CONFIGURED: "O painel aguarda configuração de MFA e política de dispositivo.",
        INVALID_ADMIN_PASSWORD: "Senha incorreta.",
        WEAK_PASSWORD: "Use pelo menos 10 caracteres.",
        INVALID_RECOVERY_CODE: "Código mestre incorreto.",
        RECOVERY_NOT_CONFIGURED: "O código mestre ainda não foi configurado no Worker.",
        ADMIN_SESSION_EXPIRED: "A sessão desta área expirou. Digite a senha novamente.",
        TOO_MANY_ATTEMPTS: "Muitas tentativas. Aguarde 15 minutos.",
        MODERATION_NOT_CONFIGURED: "A moderação automática ainda não foi configurada.",
        MODERATION_FAILED: "O moderador automático está temporariamente indisponível.",
        INVALID_MODERATION_REQUEST: "Conteúdo inválido para moderação.",
        INVALID_GIF_REQUEST: "Pesquisa de GIF inválida.",
        GIF_SEARCH_FAILED: "A pesquisa de GIFs está temporariamente indisponível.",
        TURN_NOT_CONFIGURED: "O servidor TURN ainda não foi configurado.",
        TURN_PROVIDER_FAILED: "O relay de chamadas está temporariamente indisponível.",
        MEDIA_TYPE_NOT_ALLOWED: "Formato de mídia não suportado.",
        MEDIA_TOO_LARGE: "A mídia deve ter no máximo 20 MB.",
        MEDIA_RATE_LIMITED: "Aguarde alguns segundos antes de enviar outra mídia.",
        RECAPTCHA_REQUIRED: "Marque a caixa Não sou um robô.",
        RECAPTCHA_REJECTED: "A verificação Não sou um robô não foi aceita. Tente novamente.",
        RECAPTCHA_HOSTNAME: "A origem da verificação de segurança não é válida.",
        RECAPTCHA_NOT_CONFIGURED: "A verificação de segurança ainda não foi configurada no servidor.",
        RECAPTCHA_VERIFY_FAILED: "O serviço de verificação de segurança está temporariamente indisponível.",
        APP_CHECK_REQUIRED: "Verificação de segurança necessária. Atualize a página e tente novamente.",
        APP_CHECK_INVALID: "A verificação de segurança não foi aceita. Atualize a página e tente novamente.",
        400: "Dados inválidos.",
        401: "Faça login novamente.",
        403: "Acesso restrito ao administrador.",
        410: "O link expirou. Peça outro.",
        429: "Aguarde antes de tentar novamente."
      };
      return json({ error: mensagens[code] || mensagens[status] || "Não foi possível concluir a solicitação.", code: /^[A-Z_]+$/.test(code) ? code : "INTERNAL_ERROR", requestId }, status, headers);
    }
  }
};

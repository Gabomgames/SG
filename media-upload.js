import { auth, appCheckHeaders } from "./firebase.js";
import { APP_CONFIG } from "./config.js";
import {legacyChatObject,protectedLegacyReference} from "./legacy-media-policy.js";

const TYPES = new Set(["image/jpeg","image/png","image/webp","image/gif","video/mp4","video/webm","video/quicktime","audio/webm","audio/ogg","audio/mpeg","audio/mp4","audio/aac","audio/x-m4a","audio/wav"]);
const baseMime = value => String(value || "").toLowerCase().split(";")[0].trim();

export async function uploadMedia(file, { maxBytes = APP_CONFIG.maxPostFileSize, label = "arquivo", scope = "public", conversation = "", purpose = "post", contextId = "" } = {}) {
  if (scope === "private" && !conversation) throw new Error("Selecione a conversa para enviar o arquivo.");
  const user = auth.currentUser;
  if (!user) throw new Error("Faça login novamente.");
  if (!file || !(file instanceof Blob)) throw new Error(`Selecione um ${label} válido.`);
  if (!TYPES.has(baseMime(file.type))) throw new Error("Formato de mídia não suportado.");
  if (file.size <= 0) throw new Error("O arquivo está vazio.");
  if (file.size > maxBytes) throw new Error(`O ${label} deve ter no máximo ${Math.round(maxBytes/1024/1024)} MB.`);
  if (!APP_CONFIG.steamApiBaseUrl) throw new Error("O envio seguro de mídia está indisponível.");
  const token = await user.getIdToken();
  const name = encodeURIComponent(String(file.name || `${label}-${Date.now()}`).slice(0,120));
  let response;
  try {
    response = await fetch(`${APP_CONFIG.steamApiBaseUrl}/media/upload?${scope === "private" ? "" : `name=${name}&`}scope=${encodeURIComponent(scope)}&conversation=${encodeURIComponent(conversation)}&purpose=${encodeURIComponent(purpose)}&contextId=${encodeURIComponent(contextId)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": file.type || "application/octet-stream", ...(await appCheckHeaders()) },
      body: file
    });
  } catch (error) {
    throw new Error("Não foi possível conectar ao servidor de mídia.", {cause:error});
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.url) {
    const errors={MEDIA_TOO_LARGE:"Arquivo maior que o limite permitido.",MEDIA_TYPE_NOT_ALLOWED:"Formato não permitido.",MEDIA_RATE_LIMITED:"Aguarde um minuto antes de enviar outra mídia.",MEDIA_NOT_CONFIGURED:"Upload indisponível: configure o armazenamento do site."};
    throw new Error(errors[data.error] || data.message || data.error || `Falha ao enviar mídia (HTTP ${response.status}).`);
  }
  return data;
}

export async function prepareImage(file, { maxDimension = 2200, quality = .82, maxOutputBytes = 5 * 1024 * 1024 } = {}) {
  if (!file?.type?.startsWith("image/") || file.type === "image/gif") return file;
  if (file.size <= maxOutputBytes && file.size <= 2.5 * 1024 * 1024) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  let q = quality, blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", q));
  while (blob && blob.size > maxOutputBytes && q > .48) {
    q -= .1;
    blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", q));
  }
  if (!blob) throw new Error("Não foi possível preparar a imagem.");
  if (blob.size > maxOutputBytes) throw new Error("A imagem ficou grande demais mesmo após a otimização.");
  return new File([blob], String(file.name || "imagem").replace(/\.[^.]+$/, "") + ".jpg", { type:"image/jpeg" });
}

const privateBlobs = new Set();
export async function resolvePrivateMedia(value) {
  const url = new URL(value), base = new URL(APP_CONFIG.steamApiBaseUrl), legacy=legacyChatObject(value);
  if (!legacy && (url.origin !== base.origin || !/^\/private-media\/[a-f0-9-]{36}$/.test(url.pathname))) throw new Error("Mídia privada inválida.");
  const user = auth.currentUser;
  if (!user) throw new Error("Faça login novamente.");
  let response;
  for(let attempt=0;attempt<3;attempt++){
  response = await fetch(`${base.origin}${legacy?"/media/legacy/read":"/media/read"}`, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json", ...(await appCheckHeaders()) },
    body: JSON.stringify(legacy?{url:protectedLegacyReference(value)}:{ id: url.pathname.split('/').pop() })
  });
  if(response.status!==503||attempt===2)break;
  await new Promise(resolve=>setTimeout(resolve,400*(attempt+1)));
  }
  if (!response.ok) throw new Error(response.status===503?"Arquivo ainda indisponível. Tente novamente em instantes.":"Arquivo expirado ou acesso indisponível.");
  const local = URL.createObjectURL(await response.blob());
  privateBlobs.add(local);
  return local;
}
export function revokePrivateMedia() {
  for (const url of privateBlobs) URL.revokeObjectURL(url);
  privateBlobs.clear();
}
addEventListener('pagehide', revokePrivateMedia);

auth.onAuthStateChanged(user=>{if(!user)revokePrivateMedia();});

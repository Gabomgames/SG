import { auth, appCheckHeaders } from "./firebase.js";
import { APP_CONFIG } from "./config.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";

const TYPES = new Set(["image/jpeg","image/png","image/webp","image/gif","video/mp4","video/webm","video/quicktime","audio/webm","audio/ogg","audio/mpeg","audio/mp4","audio/aac","audio/x-m4a"]);
const baseMime = value => String(value || "").toLowerCase().split(";")[0].trim();

export async function uploadMedia(file, { maxBytes = APP_CONFIG.maxPostFileSize, label = "arquivo", scope = "public", conversation = "" } = {}) {
  if (scope === "private" && !conversation) throw new Error("Selecione a conversa para enviar o arquivo.");
  const user = auth.currentUser;
  if (!user) throw new Error("Faça login novamente.");
  if (!file || !(file instanceof Blob)) throw new Error(`Selecione um ${label} válido.`);
  if (!TYPES.has(baseMime(file.type))) throw new Error("Formato de mídia não suportado.");
  if (file.size <= 0) throw new Error("O arquivo está vazio.");
  if (file.size > maxBytes) throw new Error(`O ${label} deve ter no máximo ${Math.round(maxBytes/1024/1024)} MB.`);
  if (!APP_CONFIG.steamApiBaseUrl && scope !== "public") throw new Error("O servidor de mídia não está configurado.");

  // Backend SG é a via principal. Quando o Worker retorna MEDIA_NOT_CONFIGURED,
  // usa a rota posts/{uid} já prevista nas regras do Firebase Storage.
  async function firebaseStorageFallback() {
    if (scope !== "public") throw new Error("Este tipo de mídia exige o servidor SG configurado.");
    const ext = ({"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif","video/mp4":"mp4","video/webm":"webm","video/quicktime":"mov"})[baseMime(file.type)];
    if (!ext) throw new Error("Formato de mídia não permitido para publicações.");
    const dest=storageRef(getStorage(),`posts/${user.uid}/${crypto.randomUUID()}.${ext}`);
    const object=await uploadBytes(dest,file,{contentType:baseMime(file.type),customMetadata:{ownerUid:user.uid}});
    const url=await getDownloadURL(object.ref);
    return { url, mediaId:"", contentType:baseMime(file.type), storagePath:object.ref.fullPath };
  }
  if (!APP_CONFIG.steamApiBaseUrl) return firebaseStorageFallback();
  const token = await user.getIdToken();
  const name = encodeURIComponent(String(file.name || `${label}-${Date.now()}`).slice(0,120));
  let response;
  try {
    response = await fetch(`${APP_CONFIG.steamApiBaseUrl}/media/upload?${scope === "private" ? "" : `name=${name}&`}scope=${encodeURIComponent(scope)}&conversation=${encodeURIComponent(conversation)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": file.type || "application/octet-stream", ...(await appCheckHeaders()) },
      body: file
    });
  } catch (error) {
    if (scope === "public") return firebaseStorageFallback();
    throw new Error("Não foi possível conectar ao servidor de mídia.", {cause:error});
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.url) {
    if (scope === "public" && ([404,501,502,503,504].includes(response.status) || ["MEDIA_NOT_CONFIGURED","MEDIA_STORAGE_NOT_CONFIGURED"].includes(data.error))) {
      try { return await firebaseStorageFallback(); }
      catch (error) { throw new Error(`Worker indisponível e Firebase Storage não concluiu o envio: ${error.message}`); }
    }
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
  const url = new URL(value), base = new URL(APP_CONFIG.steamApiBaseUrl);
  if (url.origin !== base.origin || !/^\/private-media\/[a-f0-9-]{36}$/.test(url.pathname)) throw new Error("Mídia privada inválida.");
  const user = auth.currentUser;
  if (!user) throw new Error("Faça login novamente.");
  let response;
  for(let attempt=0;attempt<3;attempt++){
  response = await fetch(`${base.origin}/media/read`, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json", ...(await appCheckHeaders()) },
    body: JSON.stringify({ id: url.pathname.split('/').pop() })
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

import { auth, appCheckHeaders } from "./firebase.js";
import { APP_CONFIG } from "./config.js";
import { assertPublicText } from "./safety.js";

const cache = new Map();

function moderationMessage(categories = []) {
  const joined = categories.join(" ");
  if (/self-harm/i.test(joined)) return "Esse conteúdo pode incentivar automutilação ou suicídio. Reformule a mensagem.";
  if (/sexual\/minors|sexual_minors/i.test(joined)) return "Esse conteúdo não pode ser publicado no Something Gamer.";
  if (/hate/i.test(joined)) return "Esse conteúdo pode violar as regras contra ódio ou discriminação.";
  if (/violence/i.test(joined)) return "Esse conteúdo pode violar as regras sobre ameaças ou violência.";
  if (/sexual/i.test(joined)) return "Esse conteúdo pode violar as regras sobre conteúdo sexual.";
  return "Esse conteúdo foi bloqueado pelo moderador automático do SG.";
}

async function remoteModerate(payload, cacheKey = "") {
  const user = auth.currentUser;
  if (!user || !APP_CONFIG.steamApiBaseUrl) return { allowed: true, flagged: false, categories: [], source: "local" };
  if (cacheKey) {
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < 30000) return cached.value;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const token = await user.getIdToken();
    const response = await fetch(`${APP_CONFIG.steamApiBaseUrl}/moderate`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(await appCheckHeaders())
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.warn("SG Shield indisponível", response.status, data?.error || "");
      return { allowed: true, flagged: false, categories: [], source: "local-fallback" };
    }
    const value = {
      allowed: data.allowed !== false,
      flagged: data.flagged === true,
      categories: Array.isArray(data.categories) ? data.categories : [],
      risk: data.risk || "low",
      source: "sg-shield"
    };
    if (cacheKey) cache.set(cacheKey, { time: Date.now(), value });
    return value;
  } catch (error) {
    if (error?.name !== "AbortError") console.warn("SG Shield", error);
    return { allowed: true, flagged: false, categories: [], source: "local-fallback" };
  } finally {
    clearTimeout(timeout);
  }
}

async function aiModerate(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return { allowed: true, flagged: false, categories: [], source: "empty" };
  return remoteModerate({ text: normalized }, `text:${normalized}`);
}

export async function assertModeratedPublicText(value, options = {}) {
  const text = assertPublicText(value, options);
  const result = await aiModerate(text);
  if (!result.allowed) {
    const error = new Error(moderationMessage(result.categories));
    error.code = "SG_AI_CONTENT_BLOCKED";
    error.categories = result.categories;
    error.risk = result.risk;
    throw error;
  }
  return text;
}

export async function inspectWithAi(value) {
  const text = String(value || "").trim();
  if (!text) return { allowed: true, flagged: false, categories: [] };
  return aiModerate(text);
}

export async function assertModeratedImageUrl(imageUrl) {
  const url = String(imageUrl || "").trim();
  if (!url) return url;
  if (!/^https:\/\//i.test(url)) return url;
  const result = await remoteModerate({ imageUrl: url }, `image:${url}`);
  if (!result.allowed) {
    const error = new Error(moderationMessage(result.categories));
    error.code = "SG_AI_IMAGE_BLOCKED";
    error.categories = result.categories;
    error.risk = result.risk;
    throw error;
  }
  return url;
}

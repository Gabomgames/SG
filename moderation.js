import {createModerator} from "./moderation-client.js";
import { auth, appCheckHeaders } from "./firebase.js";
import { APP_CONFIG } from "./config.js";
import { assertPublicText } from "./safety.js";

const remoteModerate=createModerator({currentUser:()=>auth.currentUser,baseUrl:APP_CONFIG.steamApiBaseUrl,headers:appCheckHeaders});

function moderationMessage(categories = []) {
  const joined = categories.join(" ");
  if (/self-harm/i.test(joined)) return "Esse conteúdo pode incentivar automutilação ou suicídio. Reformule a mensagem.";
  if (/sexual\/minors|sexual_minors/i.test(joined)) return "Esse conteúdo não pode ser publicado no Something Gamer.";
  if (/hate/i.test(joined)) return "Esse conteúdo pode violar as regras contra ódio ou discriminação.";
  if (/violence/i.test(joined)) return "Esse conteúdo pode violar as regras sobre ameaças ou violência.";
  if (/sexual/i.test(joined)) return "Esse conteúdo pode violar as regras sobre conteúdo sexual.";
  return "Esse conteúdo foi bloqueado pelo moderador automático do SG.";
}


async function aiModerate(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return { allowed: true, flagged: false, categories: [], source: "empty" };
  return remoteModerate({ text: normalized }, `text:${normalized}`);
}

export async function assertModeratedPublicText(value, options = {}) {
  const text = assertPublicText(value, options);
  const result = await aiModerate(text);
  if(result.unavailable){const error=new Error("A verificação de segurança está indisponível. Tente novamente mais tarde.");error.code="SG_MODERATION_UNAVAILABLE";throw error;}
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
  if (!/^https:\/\//i.test(url)) throw new Error("Mídia inválida para análise.");
  const result = await remoteModerate({ imageUrl: url }, `image:${url}`);
  if(result.unavailable){const error=new Error("A verificação de segurança está indisponível. Tente novamente mais tarde.");error.code="SG_MODERATION_UNAVAILABLE";throw error;}
  if (!result.allowed) {
    const error = new Error(moderationMessage(result.categories));
    error.code = "SG_AI_IMAGE_BLOCKED";
    error.categories = result.categories;
    error.risk = result.risk;
    throw error;
  }
  return url;
}

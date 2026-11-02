export const APP_CONFIG = Object.freeze({
    // Remains false until the official launch is explicitly authorized.
    foundersPromotionEnabled: false,
    functionsBaseUrl: "https://us-central1-something-gamer.cloudfunctions.net",
    steamApiBaseUrl: "https://something-gamer-api.something-gamer-nowtech.workers.dev",
    // Chave pública Web do reCAPTCHA Enterprise usada pelo Firebase App Check.
    // Cadastre a mesma chave em Firebase Console > App Check antes de preencher.
    recaptchaEnterpriseSiteKey: "6LdsAcEtAAAAAPSRsFIU0h-aiNCD9yu0T1CK0y6-",

    // reCAPTCHA v2 CHECKBOX (visível: “Não sou um robô”).
    // Esta é uma CHAVE PÚBLICA diferente da chave do App Check/Enterprise acima.
    // Crie uma chave reCAPTCHA v2 Checkbox para something-gamer.web.app
    // e something-gamer.firebaseapp.com e cole APENAS a site key aqui.
    recaptchaV2SiteKey: "6LetpMUtAAAAAFyb0aW2xDcRHkHTmKRpxAJfhEUC",
    termsVersion: "2026-09-16",
    privacyVersion: "2026-09-16",
    communityRulesVersion: "2026-09-16",
    maxPostFileSize: 20 * 1024 * 1024,

    // STUN funciona em muitas redes. Para garantir chamadas entre redes
    // corporativas, CGNAT e alguns provedores móveis, acrescente aqui um TURN
    // temporário emitido pelo seu backend. Nunca grave senha TURN permanente.
    rtcIceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun.cloudflare.com:3478" }
    ]
});

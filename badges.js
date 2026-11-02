const VERSION = "41";

const ASSETS = Object.freeze({
  verified: `assets/verified-badge.png?v=${VERSION}`,
  sg: `assets/sg-follow-badge.png?v=${VERSION}`,
  now: `assets/now-follow-badge.png?v=${VERSION}`
});

function img(src, cls, alt, title) {
  return `<img class="${cls}" src="${src}" alt="${alt}" title="${title}">`;
}

export function profileBadges(profile = {}, { compact = false } = {}) {
  const accountType = profile.accountType || "gamer";
  const badges = profile.badges || {};
  const out = [];
  const cls = compact ? "ecosystem-badge badge-compact" : "ecosystem-badge";

  // Conta oficial usa o mesmo selo institucional, mas nunca duplica o selo
  // de acompanhamento da mesma marca.
  if (accountType === "official_now") {
    out.push(img(ASSETS.now, "official-account-badge", "Conta oficial da Now", "Conta oficial da NOW"));
  } else if (badges.nowFollowed) {
    out.push(img(ASSETS.now, cls, "A Now segue", "A NOW segue este perfil"));
  }

  if (accountType === "official_sg") {
    out.push(img(ASSETS.sg, "official-account-badge", "Conta oficial do Something Gamer", "Conta oficial do Something Gamer"));
  } else if (badges.sgFollowed) {
    out.push(img(ASSETS.sg, cls, "O SG segue", "O Something Gamer segue este perfil"));
  }

  const expiry = profile.verification?.expiresAt;
  const expiryMs = expiry?.toMillis?.() ?? (expiry?.seconds ? expiry.seconds * 1000 : typeof expiry === "number" ? expiry : Date.parse(expiry));
  if (profile.verification?.status === "active" && (!expiry || expiryMs > Date.now())) {
    out.push(img(ASSETS.verified, "verified-rosette", "Verificado", "Perfil verificado pelo Something Gamer"));
  }

  if (badges.dev) {
    out.push('<span class="dev-badge" title="Desenvolvedor do Something Gamer" aria-label="Desenvolvedor do Something Gamer">DEV</span>');
  }
  for(const plan of profile.proPlans||[]){const label={creator_plus:"Creator+",seller_pro:"Seller Pro",community_pro:"Community Pro"}[plan];if(label)out.push(`<span class="pro-plan-badge">${label}</span>`);}
  return out.join("");
}

export function postBadges(post = {}) {
  return profileBadges({
    accountType: post.authorAccountType || "gamer",
    verification: { status: post.authorVerified ? "active" : "none" },
    badges: post.authorBadges || {}
  }, { compact: true });
}

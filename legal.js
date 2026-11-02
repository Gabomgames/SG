import { APP_CONFIG } from "./config.js";

export const LEGAL_VERSIONS = Object.freeze({
  terms: APP_CONFIG.termsVersion,
  privacy: APP_CONFIG.privacyVersion,
  community: APP_CONFIG.communityRulesVersion
});

export function hasAcceptedCurrentLegal(data = {}) {
  const legal = data.legal || {};
  return legal.termsAccepted === true
    && legal.termsVersion === LEGAL_VERSIONS.terms
    && legal.privacyVersion === LEGAL_VERSIONS.privacy
    && legal.communityRulesVersion === LEGAL_VERSIONS.community;
}

export function legalAcceptance(makeTimestamp) {
  return {
    termsAccepted: true,
    termsVersion: LEGAL_VERSIONS.terms,
    privacyVersion: LEGAL_VERSIONS.privacy,
    communityRulesVersion: LEGAL_VERSIONS.community,
    acceptedAt: makeTimestamp()
  };
}

export function safeReturnTarget(value, fallback = "feed.html") {
  const text = String(value || "");
  return /^(feed|dashboard|chat|social|settings|verification|events|companies|profile|edit-profile|admin|Games\/Games|Onboarding\/onboarding)\.html(?:[?#].*)?$/.test(text) ? text : fallback;
}

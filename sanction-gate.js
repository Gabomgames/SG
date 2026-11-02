// Liga a tela obrigatória de sanção (sanction-ui.js) ao Firestore.
// Carregado por theme.js em todas as páginas.
import { auth, db } from "./firebase.js";
import { signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { mountSanctionGate, unmountSanctionGate } from "./sanction-ui.js";

// Páginas que continuam legíveis mesmo com a conta suspensa/banida.
const OPEN_PAGES = /(^|\/)(regras|termos|privacidade|login|404|offline)\.html$/i;
let stop = [];
let currentUid = "";

const ms = t => t?.toMillis?.() ?? (typeof t === "number" ? t : 0);
const norm = (id, d) => ({
  id,
  ...d,
  type: d.type === "suspend" ? "suspension" : d.type,
  createdAtMs: ms(d.createdAt),
  startsAtMs: ms(d.startsAt) || ms(d.createdAt),
  endsAtMs: ms(d.endsAt) || ms(d.suspendedUntil),
  caseNumber: d.caseNumber || `SG-${id.slice(0, 8).toUpperCase()}`
});

export function installSanctionGate(user) {
  if (!user || currentUid === user.uid) return;
  stop.forEach(fn => fn());
  stop = [];
  currentUid = user.uid;

  let moderation = {}, sanctions = [], appeals = [], userReady = false, sanctionsReady = false;

  const decide = () => {
    if (!userReady || !sanctionsReady || auth.currentUser?.uid !== user.uid) return;
    const now = Date.now();
    const live = sanctions.filter(s => !s.revoked);
    let kind = "", sanction = null;
    if (moderation.status === "banned") {
      kind = "ban";
      sanction = live.filter(s => s.type === "ban").sort((a, b) => b.createdAtMs - a.createdAtMs)[0] || fallback("ban");
    } else if (moderation.status === "suspended" && ms(moderation.suspendedUntil) > now) {
      kind = "suspension";
      sanction = live.filter(s => s.type === "suspension").sort((a, b) => b.createdAtMs - a.createdAtMs)[0] || fallback("suspension");
      sanction = { ...sanction, endsAtMs: ms(moderation.suspendedUntil) || sanction.endsAtMs };
    } else {
      const pending = live.filter(s => s.type === "warning" && !s.acknowledgedAt).sort((a, b) => b.createdAtMs - a.createdAtMs)[0];
      if (pending) { kind = "warning"; sanction = pending; }
    }
    if (!kind || (kind !== "warning" && OPEN_PAGES.test(location.pathname))) return unmountSanctionGate();
    if (kind === "warning" && OPEN_PAGES.test(location.pathname)) return unmountSanctionGate();
    mountSanctionGate({ kind, sanction, appeals }, handlers(kind, sanction));
  };

  const fallback = type => norm(moderation.activeSanctionId || "legado", {
    type, reason: moderation.lastReason, ruleLabel: moderation.ruleLabel, caseNumber: moderation.caseNumber,
    createdAt: moderation.startedAt || moderation.updatedAt, endsAt: moderation.suspendedUntil
  });

  const handlers = (kind, sanction) => ({
    onAck: async () => {
      await updateDoc(doc(db, "sanctions", sanction.id), { acknowledgedAt: serverTimestamp() });
    },
    onAppeal: async ({ reasonType, explanation, evidence }) => {
      await addDoc(collection(db, "supportTickets"), {
        uid: user.uid, category: "appeal", sanctionId: sanction.id, caseNumber: sanction.caseNumber,
        title: `Recurso — caso ${sanction.caseNumber}`, message: explanation, reasonType, evidence,
        status: "open", createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
    },
    onReply: async (ticketId, text) => {
      await updateDoc(doc(db, "supportTickets", ticketId), { userReply: text, status: "open", updatedAt: serverTimestamp() });
    },
    onSignOut: async () => { await signOut(auth); location.replace(location.pathname.includes("/Games/") || location.pathname.includes("/Onboarding/") ? "../login.html" : "login.html"); },
    onExpired: () => { setTimeout(() => { if (!document.hidden) location.reload(); }, 1500); }
  });

  stop.push(onSnapshot(doc(db, "users", user.uid), snap => {
    moderation = snap.data()?.moderation || {};
    userReady = true;
    decide();
  }, () => {}));
  stop.push(onSnapshot(query(collection(db, "sanctions"), where("targetUid", "==", user.uid)), snap => {
    sanctions = snap.docs.map(d => norm(d.id, d.data()));
    sanctionsReady = true;
    decide();
  }, () => { sanctionsReady = true; decide(); }));
  stop.push(onSnapshot(query(collection(db, "supportTickets"), where("uid", "==", user.uid), where("category", "==", "appeal")), snap => {
    appeals = snap.docs.map(d => ({ id: d.id, ...d.data(), createdAtMs: ms(d.data().createdAt) })).sort((a, b) => b.createdAtMs - a.createdAtMs);
    decide();
  }, () => {}));
}

auth.onAuthStateChanged(user => {
  if (!user) { stop.forEach(fn => fn()); stop = []; currentUid = ""; unmountSanctionGate(); }
});

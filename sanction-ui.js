// Tela obrigatória de advertência / suspensão / banimento (V58).
// Este módulo só monta DOM: não conhece Firebase. Quem o alimenta é o
// sanction-gate.js. Assim dá para testar a interface sozinha.

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const APPEAL_STATUS = {
  open: ["Recurso enviado", "Recebemos o seu recurso. Ele entra na fila da equipe."],
  in_review: ["Em análise", "A equipe está analisando o seu caso."],
  info_requested: ["Informações adicionais solicitadas", "A equipe precisa de mais informações para decidir."],
  accepted: ["Aceito", "O recurso foi aceito e a punição foi revertida."],
  denied: ["Negado", "O recurso foi analisado e a decisão foi mantida."]
};

const TITLES = {
  warning: "Você recebeu uma advertência.",
  suspension: "Sua conta está temporariamente suspensa.",
  ban: "Sua conta foi banida do Something Gamer."
};

export function formatDate(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatRemaining(ms) {
  if (ms <= 0) return "encerrando…";
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (d || h) parts.push(`${h}h`);
  parts.push(`${String(m).padStart(2, "0")}min`);
  if (!d) parts.push(`${String(sec).padStart(2, "0")}s`);
  return parts.join(" ");
}

const CSS = `
#sgSanctionGate{position:fixed;inset:0;z-index:2147483600;display:grid;place-items:center;padding:16px;overflow-y:auto;background:radial-gradient(circle at 20% 0%,rgba(112,87,255,.28),transparent 45%),#070811;color:#eceefb;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
#sgSanctionGate *{box-sizing:border-box}
#sgSanctionGate .sg-sg-card{width:min(560px,100%);margin:auto;padding:26px 22px;border:1px solid rgba(255,255,255,.12);border-radius:20px;background:rgba(18,20,36,.96);box-shadow:0 30px 80px rgba(0,0,0,.55)}
#sgSanctionGate .sg-sg-tag{display:inline-flex;align-items:center;gap:8px;padding:5px 11px;border-radius:999px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
#sgSanctionGate.warning .sg-sg-tag{background:rgba(255,193,7,.16);color:#ffd166}
#sgSanctionGate.suspension .sg-sg-tag{background:rgba(255,120,60,.16);color:#ff9a5c}
#sgSanctionGate.ban .sg-sg-tag{background:rgba(255,70,90,.18);color:#ff6b7d}
#sgSanctionGate h1{margin:14px 0 6px;font-size:clamp(22px,5vw,28px);line-height:1.2}
#sgSanctionGate p.lead{margin:0 0 16px;color:#aeb3cc;font-size:15px;line-height:1.5}
#sgSanctionGate dl{margin:0 0 18px;display:grid;grid-template-columns:auto 1fr;gap:9px 14px;font-size:14px}
#sgSanctionGate dt{color:#8b90ad}
#sgSanctionGate dd{margin:0;font-weight:600;overflow-wrap:anywhere}
#sgSanctionGate .sg-sg-remaining{font-variant-numeric:tabular-nums;color:#ff9a5c}
#sgSanctionGate .sg-sg-actions{display:grid;gap:10px}
#sgSanctionGate button,#sgSanctionGate a.sg-sg-link{appearance:none;display:block;width:100%;padding:13px 16px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fff;font:inherit;font-weight:700;text-align:center;text-decoration:none;cursor:pointer}
#sgSanctionGate button.primary{border:0;background:linear-gradient(135deg,#25c4ff,#7057ff)}
#sgSanctionGate button:disabled{opacity:.55;cursor:default}
#sgSanctionGate label{display:grid;gap:6px;margin-bottom:12px;font-size:13px;color:#aeb3cc;font-weight:600}
#sgSanctionGate select,#sgSanctionGate textarea{width:100%;padding:11px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:#0d0f1e;color:#fff;font:inherit;font-size:15px}
#sgSanctionGate textarea{min-height:110px;resize:vertical}
#sgSanctionGate .sg-sg-note{margin:0 0 12px;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.05);color:#aeb3cc;font-size:13px;line-height:1.5}
#sgSanctionGate .sg-sg-error{color:#ff8090;font-size:13px;margin:0 0 10px;min-height:0}
#sgSanctionGate .sg-sg-status{padding:12px 14px;border-radius:12px;background:rgba(112,87,255,.14);border:1px solid rgba(112,87,255,.35);margin-bottom:12px}
#sgSanctionGate .sg-sg-status strong{display:block;margin-bottom:3px}
#sgSanctionGate .sg-sg-status.accepted{background:rgba(46,204,113,.13);border-color:rgba(46,204,113,.4)}
#sgSanctionGate .sg-sg-status.denied{background:rgba(255,70,90,.12);border-color:rgba(255,70,90,.4)}
#sgSanctionGate .sg-sg-back{margin-top:10px}
`;

function ensureStyle() {
  if (document.getElementById("sgSanctionGateStyle")) return;
  const style = document.createElement("style");
  style.id = "sgSanctionGateStyle";
  style.textContent = CSS;
  document.head.append(style);
}

/**
 * model: { kind:"warning"|"suspension"|"ban", sanction:{...}, appeals:[...] }
 * handlers: { onAck(), onAppeal(data), onReply(ticketId,text), onSignOut() }
 */
export function mountSanctionGate(model, handlers) {
  ensureStyle();
  let root = document.getElementById("sgSanctionGate");
  if (!root) {
    root = document.createElement("div");
    root.id = "sgSanctionGate";
    root.setAttribute("role", "alertdialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "sgSanctionTitle");
    document.body.append(root);
    document.documentElement.style.overflow = "hidden";
  }
  const state = root._state || (root._state = { view: "main" });
  root._model = model;
  root._handlers = handlers;
  if (state.view === "appeal" && root.querySelector("[data-appeal-form]")) {
    // não recria o formulário enquanto a pessoa digita
    updateLive(root);
    return root;
  }
  paint(root);
  return root;
}

export function unmountSanctionGate() {
  const root = document.getElementById("sgSanctionGate");
  if (!root) return;
  clearInterval(root._timer);
  root.remove();
  document.documentElement.style.overflow = "";
}

function facts(sanction, kind) {
  const rows = [];
  rows.push(["Motivo", sanction.reason || "Violação das regras da comunidade"]);
  rows.push(["Regra violada", sanction.ruleLabel || "Regras da comunidade"]);
  if (kind !== "suspension") rows.push(["Data", formatDate(sanction.startsAtMs || sanction.createdAtMs)]);
  if (sanction.relatedContent) rows.push(["Conteúdo relacionado", sanction.relatedContent]);
  if (kind === "suspension") {
    rows.push(["Início", formatDate(sanction.startsAtMs || sanction.createdAtMs)]);
    rows.push(["Término", formatDate(sanction.endsAtMs)]);
    rows.push(["Tempo restante", `<span class="sg-sg-remaining" data-remaining>${esc(formatRemaining((sanction.endsAtMs || 0) - Date.now()))}</span>`]);
  }
  if (kind === "ban") rows.push(["Tipo", sanction.permanent === false ? "Banimento temporário" : "Banimento permanente"]);
  rows.push(["Número do caso", sanction.caseNumber || "—"]);
  return rows.map(([k, v], i) => `<dt>${esc(k)}</dt><dd>${k === "Tempo restante" ? v : esc(v)}</dd>`).join("");
}

function latestAppeal(model) {
  const list = (model.appeals || []).filter(a => !model.sanction?.id || a.sanctionId === model.sanction.id);
  return list[0] || null;
}

function paint(root) {
  const { kind, sanction } = root._model;
  const state = root._state;
  root.className = kind;
  clearInterval(root._timer);
  const appeal = latestAppeal(root._model);
  let body = "";
  if (state.view === "appeal") body = appealForm(root._model);
  else if (state.view === "status") body = statusView(root._model);
  else if (state.view === "help") body = helpView(kind);
  else body = mainView(root._model, appeal);
  const tag = kind === "warning" ? "Advertência" : kind === "suspension" ? "Suspensão" : "Banimento";
  root.innerHTML = `<section class="sg-sg-card"><span class="sg-sg-tag">${tag}</span>${body}</section>`;
  wire(root);
  updateLive(root);
  if (kind === "suspension") root._timer = setInterval(() => updateLive(root), 1000);
}

function mainView(model, appeal) {
  const { kind, sanction } = model;
  const lead = kind === "warning"
    ? "Isso não impede o uso do Something Gamer, mas fica registrado no seu histórico. Leia com atenção antes de continuar."
    : kind === "suspension"
      ? "Enquanto durar a suspensão, o uso normal do SG fica bloqueado. Quando o prazo acabar, o acesso volta sozinho."
      : "O acesso ao restante do aplicativo está bloqueado. Se você acredita que houve um erro, pode recorrer da decisão.";
  const appealLine = appeal ? `<div class="sg-sg-status ${esc(appeal.status)}"><strong>${esc((APPEAL_STATUS[appeal.status] || ["Recurso"])[0])}</strong>${esc((APPEAL_STATUS[appeal.status] || ["", ""])[1])}</div>` : "";
  let actions = "";
  if (kind === "warning") {
    actions = `<button class="primary" data-act="ack">Entendi</button>
      <button data-act="appeal">Acho que houve um erro</button>
      <a class="sg-sg-link" href="regras.html">Ler as regras da comunidade</a>`;
  } else {
    actions = `${appeal ? `<button class="primary" data-act="status">Acompanhar recurso</button>` : `<button class="primary" data-act="appeal">${kind === "ban" ? "Recorrer da decisão" : "Acho que houve um erro — abrir recurso"}</button>`}
      <button data-act="help">Central de ajuda</button>
      <button data-act="signout">Sair da conta</button>`;
  }
  return `<h1 id="sgSanctionTitle">${esc(TITLES[kind])}</h1><p class="lead">${esc(lead)}</p><dl>${facts(sanction, kind)}</dl>${appealLine}<div class="sg-sg-actions">${actions}</div>`;
}

function appealForm(model) {
  return `<h1 id="sgSanctionTitle">Abrir recurso</h1>
  <p class="lead">Caso ${esc(model.sanction.caseNumber || "—")}. Explique por que você acha que a decisão foi um erro. A equipe responde por aqui.</p>
  <form data-appeal-form novalidate>
    <label>Motivo do recurso
      <select name="reasonType"><option value="not_me">Não cometi essa infração</option><option value="context">O contexto foi ignorado</option><option value="compromised">Minha conta foi invadida</option><option value="disproportionate">A punição foi exagerada</option><option value="other">Outro motivo</option></select></label>
    <label>Explicação
      <textarea name="explanation" maxlength="2000" placeholder="Conte o que aconteceu com o máximo de detalhes." required></textarea></label>
    <label>Evidências (um link https por linha, até 5)
      <textarea name="evidence" maxlength="1000" style="min-height:70px" placeholder="https://…"></textarea></label>
    <p class="sg-sg-error" data-error role="alert"></p>
    <div class="sg-sg-actions"><button type="submit" class="primary">Enviar recurso</button><button type="button" data-act="back">Voltar</button></div>
  </form>`;
}

function statusView(model) {
  const list = (model.appeals || []).filter(a => !model.sanction?.id || a.sanctionId === model.sanction.id);
  const items = list.map(a => {
    const [label, hint] = APPEAL_STATUS[a.status] || ["Recurso", ""];
    const reply = a.status === "info_requested" ? `<form data-reply-form="${esc(a.id)}"><label>Sua resposta<textarea name="reply" maxlength="2000" required></textarea></label><p class="sg-sg-error" data-error role="alert"></p><button type="submit" class="primary">Enviar resposta</button></form>` : "";
    const staff = a.staffMessage ? `<p style="margin:8px 0 0;font-weight:500">${esc(a.staffMessage)}</p>` : "";
    return `<div class="sg-sg-status ${esc(a.status)}"><strong>${esc(label)}</strong>${esc(hint)}<br><small>Enviado em ${esc(formatDate(a.createdAtMs))}</small>${staff}${reply}</div>`;
  }).join("") || `<p class="sg-sg-note">Você ainda não enviou recurso para este caso.</p>`;
  return `<h1 id="sgSanctionTitle">Seu recurso</h1><p class="lead">Caso ${esc(model.sanction.caseNumber || "—")}</p>${items}<div class="sg-sg-actions sg-sg-back"><button data-act="back">Voltar</button></div>`;
}

function helpView(kind) {
  return `<h1 id="sgSanctionTitle">Central de ajuda</h1>
  <p class="sg-sg-note">Durante ${kind === "ban" ? "um banimento" : "uma suspensão"} você pode ver os detalhes da decisão, abrir e acompanhar um recurso e sair da conta. Nada mais fica disponível.</p>
  <p class="sg-sg-note"><strong>Como funciona o recurso:</strong> você descreve o que aconteceu, a equipe analisa e responde aqui mesmo. O recurso passa por: enviado → em análise → aceito ou negado. Se faltar informação, a equipe pede e você responde na mesma tela.</p>
  <div class="sg-sg-actions"><a class="sg-sg-link" href="regras.html">Regras da comunidade</a><a class="sg-sg-link" href="termos.html">Termos de uso</a><button data-act="back">Voltar</button></div>`;
}

function updateLive(root) {
  const { kind, sanction } = root._model;
  const el = root.querySelector("[data-remaining]");
  if (el && kind === "suspension") {
    const left = (sanction.endsAtMs || 0) - Date.now();
    el.textContent = formatRemaining(left);
    if (left <= 0) root._handlers.onExpired?.();
  }
}

function wire(root) {
  const h = root._handlers, state = root._state;
  root.querySelectorAll("[data-act]").forEach(btn => btn.addEventListener("click", async () => {
    const act = btn.dataset.act;
    if (act === "ack") { btn.disabled = true; try { await h.onAck(); } catch (e) { btn.disabled = false; btn.textContent = "Não foi possível registrar. Tentar de novo"; } return; }
    if (act === "signout") { h.onSignOut(); return; }
    state.view = act === "back" ? "main" : act;
    paint(root);
  }));
  const form = root.querySelector("[data-appeal-form]");
  form?.addEventListener("submit", async e => {
    e.preventDefault();
    const err = form.querySelector("[data-error]"), btn = form.querySelector("button[type=submit]");
    const explanation = form.explanation.value.trim();
    const evidence = form.evidence.value.split("\n").map(x => x.trim()).filter(Boolean);
    if (explanation.length < 20) { err.textContent = "Explique com pelo menos 20 caracteres."; return; }
    if (evidence.length > 5 || evidence.some(x => !/^https:\/\/\S+$/i.test(x))) { err.textContent = "Use até 5 links, cada um começando com https://"; return; }
    err.textContent = ""; btn.disabled = true; btn.textContent = "Enviando…";
    try { await h.onAppeal({ reasonType: form.reasonType.value, explanation, evidence }); state.view = "status"; paint(root); }
    catch (error) { console.error(error); err.textContent = "Não foi possível enviar agora. Tente novamente."; btn.disabled = false; btn.textContent = "Enviar recurso"; }
  });
  root.querySelectorAll("[data-reply-form]").forEach(rf => rf.addEventListener("submit", async e => {
    e.preventDefault();
    const err = rf.querySelector("[data-error]"), text = rf.reply.value.trim();
    if (text.length < 5) { err.textContent = "Escreva a resposta."; return; }
    try { await h.onReply(rf.dataset.replyForm, text); } catch (error) { console.error(error); err.textContent = "Não foi possível enviar a resposta."; }
  }));
}

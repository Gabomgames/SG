// A importação da Steam é feita pela Cloud Function steamCallback, que grava
// direto no Firestore com o Admin SDK. Esta página só mostra o resultado:
// nenhum dado da Steam passa pelo navegador, por isso não dá para forjar.

const params = new URLSearchParams(window.location.search);
const title = document.getElementById("callbackTitle");
const message = document.getElementById("callbackMessage");
const button = document.getElementById("callbackButton");

const motivos = {
    EXPIRED_STATE: "A solicitação expirou. Comece a conexão de novo pelo painel.",
    INVALID_STATE: "A solicitação expirou. Comece a conexão de novo pelo painel.",
    INVALID_OPENID: "A Steam não confirmou o login. Tente novamente.",
    INVALID_STEAM_ID: "A Steam não devolveu um perfil válido.",
    PROFILE_NOT_FOUND: "Não encontramos esse perfil na Steam."
};

const status = params.get("status");

if (status === "success") {
    title.textContent = "Steam conectada!";
    message.textContent = "Seu perfil, sua biblioteca e suas conquistas públicas foram importados.";
    setTimeout(() => window.location.replace("dashboard.html"), 1800);
} else {
    const reason = params.get("reason") || "";
    title.textContent = "Não foi possível conectar";
    message.textContent = motivos[reason] || "A Steam não autorizou a conexão. A biblioteca e as conquistas precisam estar públicas no seu perfil.";
    button.textContent = "Voltar e tentar novamente";
}

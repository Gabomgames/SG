import {
    auth,
    db,
    googleProvider,
    signInWithPopup
} from "./firebase.js";

import { APP_CONFIG } from "./config.js";

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendEmailVerification,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { validateBirthDate, validateEmail } from "./safety.js";
import { hasAcceptedCurrentLegal, legalAcceptance, safeReturnTarget } from "./legal.js";


// ======================================================
// ELEMENTOS
// ======================================================

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

const googleLogin = document.getElementById("googleLogin");
const forgotPassword = document.getElementById("forgotPassword");

const loginMessage = document.getElementById("loginMessage");
const registerMessage = document.getElementById("registerMessage");

const loginSubmit = document.getElementById("loginSubmit");
const registerSubmit = document.getElementById("registerSubmit");
const rememberedEmail=new URLSearchParams(location.search).get("email");if(rememberedEmail&&document.getElementById("email"))document.getElementById("email").value=rememberedEmail;
const registerBirthDate = document.getElementById("registerBirthDate");
if (registerBirthDate) {
    const latest = new Date(), earliest = new Date();
    latest.setFullYear(latest.getFullYear() - 13);
    earliest.setFullYear(earliest.getFullYear() - 120);
    registerBirthDate.max = latest.toISOString().slice(0, 10);
    registerBirthDate.min = earliest.toISOString().slice(0, 10);
}
const resetModal = document.getElementById("resetModal");
const resetEmailStep = document.getElementById("resetEmailStep");
const resetMessage = document.getElementById("resetMessage");

const isDeveloperMode = ["localhost", "127.0.0.1"].includes(window.location.hostname) || localStorage.getItem("sgDeveloperMode") === "true";
const loginParams=new URLSearchParams(location.search),requestedReturn=loginParams.get("return")||"",safeReturn=safeReturnTarget(requestedReturn, "feed.html");
if (loginParams.get("switch") === "1") googleProvider.setCustomParameters({prompt:"select_account"});

if (isDeveloperMode) {
    document.documentElement.dataset.developerMode = "true";
    const chip = document.createElement("div");
    chip.className = "developer-mode-chip";
    chip.textContent = "Modo developer";
    document.body.appendChild(chip);
}

auth.onAuthStateChanged(async user => {
    if (!user) return;
    const page = window.location.pathname.split("/").pop() || "index.html";
    let snapshot = null;
    try { snapshot = await getDoc(doc(db, "users", user.uid)); } catch {}
    const data = snapshot?.exists() ? snapshot.data() : null;
    const legalOk = data ? hasAcceptedCurrentLegal(data) : false;
    const hasProfile = data?.profileCompleted === true;
    const destination = !legalOk
        ? `aceitar-termos.html?return=${encodeURIComponent(hasProfile ? (safeReturn || "feed.html") : "Onboarding/onboarding.html")}`
        : (hasProfile ? (safeReturn || "feed.html") : "Onboarding/onboarding.html");

    if (["login.html", "register.html"].includes(page) && !isDeveloperMode) {
        // Um login social novo ainda não possui /users/{uid}; o próprio fluxo
        // do botão conclui o cadastro ou envia para a tela de aceite.
        if (!data && page === "register.html") return;
        window.location.replace(destination);
        return;
    }

    if (page === "index.html" || page === "") {
        document.querySelectorAll('nav a[href="index.html"]').forEach(link => { link.href = destination; link.textContent = "Início"; });
        const loginButton = document.querySelector("header .login-btn");
        if (loginButton) { loginButton.textContent = "Ir para o feed"; loginButton.onclick = () => window.location.assign(destination); }
        document.querySelectorAll('button[onclick*="register.html"]').forEach(button => { button.onclick = () => window.location.assign(destination); const textNode=[...button.childNodes].find(node=>node.nodeType===Node.TEXT_NODE&&node.textContent.trim()); if(textNode)textNode.textContent=" Ir para o feed "; });
    }
});


// ======================================================
// MENSAGENS
// ======================================================

function showMessage(element, message, type = "error") {

    if (!element) return;

    element.textContent = message;

    element.className = `auth-message ${type}`;
}



// ======================================================
// reCAPTCHA v2 CHECKBOX — CADASTRO
// ======================================================

const registerRecaptcha = document.getElementById("registerRecaptcha");
let registerRecaptchaWidgetId = null;

function waitForRecaptcha(timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const timer = setInterval(() => {
            if (globalThis.grecaptcha?.render && globalThis.grecaptcha?.getResponse) {
                clearInterval(timer);
                resolve(globalThis.grecaptcha);
                return;
            }
            if (Date.now() - startedAt >= timeoutMs) {
                clearInterval(timer);
                reject(new Error("RECAPTCHA_LOAD_FAILED"));
            }
        }, 100);
    });
}

async function ensureRegistrationRecaptcha() {
    if (!registerRecaptcha) return null;

    if (["localhost", "127.0.0.1", "::1"].includes(location.hostname)) {
        registerRecaptcha.innerHTML = '<div class="recaptcha-dev-note">Modo local: reCAPTCHA será exigido no site publicado.</div>';
        return "local-development";
    }

    const siteKey = String(APP_CONFIG.recaptchaV2SiteKey || "").trim();
    if (!siteKey || siteKey.startsWith("COLE_AQUI")) {
        throw new Error("RECAPTCHA_NOT_CONFIGURED");
    }

    const grecaptcha = await waitForRecaptcha();
    if (registerRecaptchaWidgetId === null) {
        registerRecaptchaWidgetId = grecaptcha.render(registerRecaptcha, {
            sitekey: siteKey,
            theme: "dark",
            size: "normal"
        });
    }
    return registerRecaptchaWidgetId;
}

function resetRegistrationRecaptcha() {
    try {
        if (registerRecaptchaWidgetId !== null && globalThis.grecaptcha?.reset) {
            globalThis.grecaptcha.reset(registerRecaptchaWidgetId);
        }
    } catch {}
}

async function verifyHumanForRegistration() {
    if (!registerRecaptcha) return true;

    if (["localhost", "127.0.0.1", "::1"].includes(location.hostname)) return true;

    const widgetId = await ensureRegistrationRecaptcha();
    const token = String(globalThis.grecaptcha.getResponse(widgetId) || "").trim();

    if (!token) throw new Error("RECAPTCHA_REQUIRED");

    const endpoint = `${String(APP_CONFIG.steamApiBaseUrl || "").replace(/\/$/, "")}/recaptcha/verify`;
    const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok !== true) {
        resetRegistrationRecaptcha();
        throw new Error(data.error || "RECAPTCHA_REJECTED");
    }

    return true;
}

function recaptchaErrorMessage(error) {
    switch (error?.message) {
        case "RECAPTCHA_REQUIRED":
            return "Marque a caixa “Não sou um robô” para continuar.";
        case "RECAPTCHA_LOAD_FAILED":
            return "Não foi possível carregar a verificação de segurança. Atualize a página e tente novamente.";
        case "RECAPTCHA_NOT_CONFIGURED":
            return "A verificação “Não sou um robô” ainda não foi configurada.";
        case "RECAPTCHA_REJECTED":
            return "A verificação “Não sou um robô” não foi aceita. Marque novamente e tente outra vez.";
        default:
            return null;
    }
}

if (registerRecaptcha) {
    ensureRegistrationRecaptcha().catch(error => {
        console.error("reCAPTCHA:", error);
        const message = recaptchaErrorMessage(error);
        if (message) showMessage(registerMessage, message, "error");
    });
}

// ======================================================
// ERROS FIREBASE
// ======================================================

function getFirebaseErrorMessage(error) {

    switch (error.code) {

        case "auth/invalid-credential":
        case "auth/invalid-login-credentials":
            return "E-mail ou senha incorretos.";

        case "auth/user-not-found":
            return "Não encontramos uma conta com este e-mail.";

        case "auth/wrong-password":
            return "A senha está incorreta.";

        case "auth/invalid-email":
            return "Digite um e-mail válido.";

        case "auth/user-disabled":
            return "Esta conta foi desativada.";

        case "auth/email-already-in-use":
            return "Este e-mail já possui uma conta. Tente entrar.";

        case "auth/weak-password":
            return "Sua senha precisa ter pelo menos 6 caracteres.";

        case "auth/too-many-requests":
            return "Muitas tentativas. Aguarde um pouco e tente novamente.";

        case "auth/popup-closed-by-user":
            return "A janela do Google foi fechada.";

        case "auth/popup-blocked":
            return "O navegador bloqueou a janela do Google.";

        case "auth/network-request-failed":
            return "Erro de conexão. Verifique sua internet.";

        default:
            return error.message || "Ocorreu um erro. Tente novamente.";
    }
}


// ======================================================
// VERIFICAR PERFIL
// ======================================================

async function userHasProfile(user) {

    const userRef = doc(db, "users", user.uid);

    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
        return false;
    }

    const data = snapshot.data();

    /*
        A conta existe, mas o perfil só é considerado
        completo quando o usuário terminou o onboarding.
    */

    return data.profileCompleted === true;
}


// ======================================================
// CRIAR DOCUMENTO DA CONTA
// ======================================================

async function createUserAccount(user, birthData = null) {

    const userRef = doc(db, "users", user.uid);

    const snapshot = await getDoc(userRef);


    // Se já existe, não recria

    if (snapshot.exists()) {
        return;
    }


    await setDoc(userRef, {

        uid: user.uid,

        email: user.email || "",

        birthDate: birthData?.birthDate || "",

        ageVerified: birthData?.ageVerified === true,

        accountCreatedAt: serverTimestamp(),

        updatedAt: serverTimestamp(),


        // PERFIL AINDA NÃO CONFIGURADO

        profileCompleted: false,

        username: "",

        name: "",

        bio: "",

        photoURL: "",


        // JOGOS

        games: [],


        // REDES / PLATAFORMAS

        twitch: "",

        youtube: "",

        steam: "",
// GAMIFICAÇÃO

        level: 1,

        xp: 0,

        followers: 0,

        following: 0,

        // ACEITE JURÍDICO VERSIONADO
        legal: legalAcceptance(serverTimestamp)

    });
}

async function ensureBirthForNewAccount(user, supplied = null) {
    const existing = await getDoc(doc(db, "users", user.uid));
    if (existing.exists()) return null;
    if (supplied?.ok) return supplied;
    const entered = prompt("Para proteger a comunidade, informe sua data de nascimento (AAAA-MM-DD):");
    const checked = validateBirthDate(entered, 13);
    if (!checked.ok) throw new Error(checked.message);
    return checked;
}


// ======================================================
// GOOGLE LOGIN / REGISTER
// ======================================================

if (googleLogin) {

    googleLogin.addEventListener("click", async () => {

        try {

            const birthInput = document.getElementById("registerBirthDate");
            const birthData = birthInput ? validateBirthDate(birthInput.value, 13) : null;
            if (birthInput && !birthData.ok) {
                showMessage(registerMessage, birthData.message, "error");
                return;
            }
            if (birthInput && !document.getElementById("registerSafetyConsent")?.checked) {
                showMessage(registerMessage, "Aceite os Termos de Uso, as Regras da Comunidade e a Política de Privacidade para continuar.", "error");
                return;
            }

            // Na tela de cadastro, até o Google só prossegue depois do
            // checkbox reCAPTCHA ser validado no Worker. Na tela de login
            // registerRecaptcha não existe e esta função simplesmente retorna.
            await verifyHumanForRegistration();

            googleLogin.disabled = true;

            googleLogin.innerHTML = "Entrando...";


            const result = await signInWithPopup(
                auth,
                googleProvider
            );


            const user = result.user;
            const existing = await getDoc(doc(db, "users", user.uid));

            if (!existing.exists()) {
                if (birthInput) {
                    await createUserAccount(user, birthData);
                    window.location.href = "Onboarding/onboarding.html";
                } else {
                    window.location.href = `aceitar-termos.html?return=${encodeURIComponent("Onboarding/onboarding.html")}`;
                }
                return;
            }

            const data = existing.data();
            if (!hasAcceptedCurrentLegal(data)) {
                window.location.href = `aceitar-termos.html?return=${encodeURIComponent(data.profileCompleted === true ? (safeReturn || "feed.html") : "Onboarding/onboarding.html")}`;
                return;
            }
            window.location.href = data.profileCompleted === true ? (safeReturn || "feed.html") : "Onboarding/onboarding.html";


        } catch (error) {

            console.error(
                "Erro no Google:",
                error
            );


            const message =
                recaptchaErrorMessage(error) || getFirebaseErrorMessage(error);


            showMessage(
                registerMessage || loginMessage,
                message,
                "error"
            );


            googleLogin.disabled = false;

            googleLogin.innerHTML = `
                <span class="google-icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="#4285F4" d="M21.35 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h5.22a4.46 4.46 0 0 1-1.94 2.93v2.43h3.14c1.84-1.69 2.93-4.18 2.93-7.39z"></path>
                        <path fill="#34A853" d="M12 21.96c2.63 0 4.84-.87 6.45-2.36l-3.14-2.43c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.29v2.5A9.74 9.74 0 0 0 12 21.96z"></path>
                        <path fill="#FBBC05" d="M6.54 14.06A5.86 5.86 0 0 1 6.23 12c0-.72.12-1.42.31-2.06v-2.5H3.29A9.98 9.98 0 0 0 2.24 12c0 1.61.39 3.13 1.05 4.56l3.25-2.5z"></path>
                        <path fill="#EA4335" d="M12 5.91c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.83 2.98 14.63 2.04 12 2.04a9.74 9.74 0 0 0-8.71 5.4l3.25 2.5C7.31 7.63 9.46 5.91 12 5.91z"></path>
                    </svg>
                </span>
                Continuar com Google
            `;
        }

    });

}


// ======================================================
// LOGIN COM E-MAIL
// ======================================================

if (loginForm) {

    loginForm.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();


            const email =
                document.getElementById("email")
                    ?.value
                    .trim();

            const password =
                document.getElementById("password")
                    ?.value;


            if (!email || !password) {

                showMessage(
                    loginMessage,
                    "Preencha seu e-mail e sua senha."
                );

                return;
            }


            try {

                if (loginSubmit) {

                    loginSubmit.disabled = true;

                    loginSubmit.innerHTML = `
                        <span>Entrando...</span>
                    `;
                }


                const result =
                    await signInWithEmailAndPassword(
                        auth,
                        email,
                        password
                    );


                const user = result.user;
                const snapshot = await getDoc(doc(db, "users", user.uid));
                if (!snapshot.exists()) {
                    window.location.href = `aceitar-termos.html?return=${encodeURIComponent("Onboarding/onboarding.html")}`;
                    return;
                }
                const data = snapshot.data();
                if (!hasAcceptedCurrentLegal(data)) {
                    window.location.href = `aceitar-termos.html?return=${encodeURIComponent(data.profileCompleted === true ? (safeReturn || "feed.html") : "Onboarding/onboarding.html")}`;
                    return;
                }
                auth.languageCode = "pt-BR";
                await sendEmailVerification(user, { url: `${location.origin}/login.html` }).catch(error => console.warn("E-mail de confirmação não enviado:", error));
                window.location.href = data.profileCompleted === true ? (safeReturn || "feed.html") : "Onboarding/onboarding.html";

            } catch (error) {

                console.error(
                    "Erro no login:",
                    error
                );


                showMessage(
                    loginMessage,
                    getFirebaseErrorMessage(error),
                    "error"
                );


                if (loginSubmit) {

                    loginSubmit.disabled = false;

                    loginSubmit.innerHTML = `
                        <span>Entrar</span>
                    `;
                }
            }
        }
    );
}


// ======================================================
// CRIAR CONTA COM E-MAIL
// ======================================================

if (registerForm) {

    registerForm.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();


            const email =
                document.getElementById("registerEmail")
                    ?.value
                    .trim();

            const password =
                document.getElementById("registerPassword")
                    ?.value;

            const birthData = validateBirthDate(
                document.getElementById("registerBirthDate")?.value,
                13
            );


            if (!email || !password) {

                showMessage(
                    registerMessage,
                    "Preencha seu e-mail e sua senha."
                );

                return;
            }
            if (!birthData.ok) {
                showMessage(registerMessage, birthData.message, "error");
                return;
            }

            // o <input type="email"> do navegador aceita "alguem@gmail.com3":
            // a conta nasce e ninguem consegue recuperar depois
            const conferirEmail = validateEmail(email);
            if (!conferirEmail.ok) {
                showMessage(registerMessage, conferirEmail.message, "error");
                return;
            }
            if (conferirEmail.suggestion) {
                const trocar = confirm(
                    `Você quis dizer ${conferirEmail.suggestion}?\n\n` +
                    "Com o e-mail errado você não consegue recuperar a conta depois.\n\n" +
                    "OK troca pelo sugerido. Cancelar mantém o que você digitou."
                );
                if (trocar) {
                    document.getElementById("registerEmail").value = conferirEmail.suggestion;
                    showMessage(registerMessage, "E-mail corrigido. Confira e envie de novo.", "success");
                    return;
                }
            }
            if (!document.getElementById("registerSafetyConsent")?.checked) {
                showMessage(registerMessage, "Aceite os Termos de Uso, as Regras da Comunidade e a Política de Privacidade para continuar.", "error");
                return;
            }

            try {
                // O token do checkbox é conferido no Worker ANTES de chamar
                // createUserWithEmailAndPassword. Sem “Não sou um robô”,
                // o fluxo normal do site não cria a conta.
                await verifyHumanForRegistration();

                if (registerSubmit) {

                    registerSubmit.disabled = true;

                    registerSubmit.innerHTML = `
                        <span>Criando conta...</span>
                    `;
                }


                const result =
                    await createUserWithEmailAndPassword(
                        auth,
                        email,
                        password
                    );


                const user = result.user;


                // CRIA SOMENTE A CONTA

                await createUserAccount(user, birthData);


                // VAI PARA PERSONALIZAÇÃO

                window.location.href =
                    "Onboarding/onboarding.html";


            } catch (error) {

                console.error(
                    "Erro ao criar conta:",
                    error
                );


                showMessage(
                    registerMessage,
                    recaptchaErrorMessage(error) || getFirebaseErrorMessage(error),
                    "error"
                );
                resetRegistrationRecaptcha();


                if (registerSubmit) {

                    registerSubmit.disabled = false;

                    registerSubmit.innerHTML = `
                        <span>Criar minha conta</span>
                    `;
                }
            }
        }
    );
}


// ======================================================
// ESQUECI A SENHA
// ======================================================

if (forgotPassword) {
    const resetEmail = document.getElementById("resetEmail");
    const sendResetCode = document.getElementById("sendResetCode");

    function openReset() {
        resetEmail.value = document.getElementById("email")?.value.trim() || "";
        resetModal.classList.add("active");
        resetModal.setAttribute("aria-hidden", "false");
        resetEmailStep.classList.add("active");
        showMessage(resetMessage, "", "success");
        setTimeout(() => resetEmail.focus(), 50);
    }

    function closeReset() { resetModal.classList.remove("active"); resetModal.setAttribute("aria-hidden", "true"); }

    async function requestReset() {
        const email = resetEmail.value.trim().toLowerCase();
        if (!email) return showMessage(resetMessage, "Informe seu e-mail.");
        try {
            sendResetCode.disabled = true; sendResetCode.textContent = "Enviando...";
            auth.languageCode = "pt-BR";
            await sendPasswordResetEmail(auth, email, { url: `${location.origin}/login.html` });
            showMessage(resetMessage, "Enviamos um link seguro para seu e-mail. Verifique também a caixa de spam ou lixo eletrônico.", "success");
        } catch (error) { showMessage(resetMessage, getFirebaseErrorMessage(error)); }
        finally { sendResetCode.disabled = false; sendResetCode.textContent = "Enviar link"; }
    }

    forgotPassword.addEventListener("click", openReset);
    document.getElementById("closeReset").addEventListener("click", closeReset);
    document.getElementById("closeResetOverlay").addEventListener("click", closeReset);
    sendResetCode.addEventListener("click", requestReset);
    document.addEventListener("keydown", event => { if (event.key === "Escape") closeReset(); });
}

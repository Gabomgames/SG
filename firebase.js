import { APP_CONFIG } from "./config.js";
import { hasAcceptedCurrentLegal } from "./legal.js";
import { installFounderSync } from "./founders-client.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
    initializeAppCheck,
    ReCaptchaEnterpriseProvider,
    getToken as getAppCheckToken
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app-check.js";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    onAuthStateChanged,
    onIdTokenChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDd43TsFijT8zwyzlWlaikYMdrxNOeOabo",
    authDomain: "something-gamer.firebaseapp.com",
    projectId: "something-gamer",
    storageBucket: "something-gamer.firebasestorage.app",
    messagingSenderId: "1070139990422",
    appId: "1:1070139990422:web:45697a1f96ef4d03ae7db7",
    measurementId: "G-2NQJ3KDY5F"
};

const app = initializeApp(firebaseConfig);

// Em desenvolvimento local, o token de debug só é ativado quando o próprio
// desenvolvedor opta por isso. O token exibido no console deve ser cadastrado
// em Firebase Console > App Check > Debug tokens; nunca reutilize em produção.
if (["localhost", "127.0.0.1"].includes(location.hostname) && localStorage.getItem("sgAppCheckDebug") === "1") {
    globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

// App Check usa reCAPTCHA Enterprise invisível. A site key é pública; nunca
// coloque aqui uma secret key. Enquanto a site key estiver vazia, o app segue
// funcionando normalmente para permitir configurar e validar sem derrubar produção.
let appCheck = null;
if (APP_CONFIG.recaptchaEnterpriseSiteKey) {
    try {
        appCheck = initializeAppCheck(app, {
            provider: new ReCaptchaEnterpriseProvider(APP_CONFIG.recaptchaEnterpriseSiteKey),
            isTokenAutoRefreshEnabled: true
        });
    } catch (error) {
        console.error("Firebase App Check não pôde ser inicializado.", error);
    }
}

async function appCheckHeaders() {
    if (!appCheck) return {};
    try {
        const result = await getAppCheckToken(appCheck, false);
        return result?.token ? { "X-Firebase-AppCheck": result.token } : {};
    } catch (error) {
        console.warn("App Check token indisponível.", error);
        return {};
    }
}

const auth = getAuth(app);
// Cache persistente (IndexedDB): mensagens enviadas sem internet ficam guardadas no aparelho
// e seguem para o servidor quando a conexão volta, mesmo que a aba seja recarregada.
let firestore;
try {
    if (localStorage.getItem("sgTrustedDevice") !== "1") throw new Error("Cache persistente não autorizado neste dispositivo");
    firestore = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch (error) {
    // Modo de memória é o padrão em computadores compartilhados.
    firestore = getFirestore(app);
}
const db = firestore;
const googleProvider = new GoogleAuthProvider();

// Gate jurídico global para páginas autenticadas. Uma nova versão dos Termos
// invalida somente novas ações; a pessoa pode abrir os documentos legais e
// registrar a aceitação novamente em aceitar-termos.html.
const legalGateSkip = new Set(["", "index.html", "login.html", "register.html", "aceitar-termos.html", "termos.html", "regras.html", "privacidade.html", "support.html"]);
if(APP_CONFIG.foundersPromotionEnabled){
    installFounderSync({auth,subscribe:onIdTokenChanged,endpoint:`${APP_CONFIG.functionsBaseUrl}/syncFounderEligibility`,headers:appCheckHeaders});
}
onAuthStateChanged(auth, async user => {
    if (!user) return;
    const pathname = location.pathname.replace(/^\/+/, "");
    const page = pathname.split("/").pop() || "";
    if (legalGateSkip.has(page)) return;
    try {
        const snapshot = await getDoc(doc(db, "users", user.uid));
        if (snapshot.exists() && hasAcceptedCurrentLegal(snapshot.data())) return;
        const current = `${pathname || "feed.html"}${location.search || ""}${location.hash || ""}`;
        location.replace(`aceitar-termos.html?return=${encodeURIComponent(current)}`);
    } catch (error) {
        console.warn("Não foi possível validar os Termos de Uso.", error);
    }
});

export {
    auth,
    db,
    appCheck,
    appCheckHeaders,
    googleProvider,
    signInWithPopup
};

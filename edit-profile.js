import {
    auth,
    db,
    appCheckHeaders
} from "./firebase.js";

import { APP_CONFIG } from "./config.js";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    runTransaction,
    updateDoc,
    serverTimestamp,
    setDoc,
    where
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

import { assertModeratedPublicText, assertModeratedImageUrl } from "./moderation.js";
import { uploadMedia, prepareImage } from "./media-upload.js";


const displayName = document.getElementById("displayName");
const username = document.getElementById("username");
const bio = document.getElementById("bio");
const games = document.getElementById("games");
const visibilityField = document.createElement("label");
visibilityField.className = "field";
visibilityField.innerHTML = '<span>Privacidade do perfil</span><select id="profileVisibility" class="privacy-native" aria-hidden="true"><option value="public">Público</option><option value="private">Privado</option></select><div class="privacy-choices"><button type="button" data-privacy="public"><svg class="ico" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2M12 3.4a13 13 0 0 1 0 17.2 13 13 0 0 1 0-17.2Z"/></svg><strong>Público</strong><small>Aparece na comunidade e pode ser compartilhado.</small></button><button type="button" data-privacy="private"><svg class="ico" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="4.6" y="10" width="14.8" height="10.2" rx="2.4"/><path d="M8.4 10V7.2a3.6 3.6 0 0 1 7.2 0V10"/></svg><strong>Privado</strong><small>Somente você abre o perfil completo.</small></button></div>';
document.querySelector(".profile-fields").appendChild(visibilityField);
const profileVisibility = document.getElementById("profileVisibility");
function paintPrivacy(){document.querySelectorAll("[data-privacy]").forEach(button=>button.classList.toggle("active",button.dataset.privacy===profileVisibility.value))}
document.querySelector(".privacy-choices").addEventListener("click",event=>{const button=event.target.closest("[data-privacy]");if(button){profileVisibility.value=button.dataset.privacy;paintPrivacy()}});

const twitch = document.getElementById("twitch");
const youtube = document.getElementById("youtube");
const creatorAccount = document.getElementById("creatorAccount");
const verificationBadgeTheme = document.getElementById("verificationBadgeTheme");
const badgeThemePreview = document.createElement("img");
badgeThemePreview.className = "verified-rosette theme-blue badge-theme-live-preview";
badgeThemePreview.src = "assets/verified-badge.png?v=41";
badgeThemePreview.alt = "Prévia da cor do selo";
verificationBadgeTheme.insertAdjacentElement("afterend", badgeThemePreview);

function updateBadgeThemePreview() {
    badgeThemePreview.className = `verified-rosette theme-${verificationBadgeTheme.value || "blue"} badge-theme-live-preview`;
}

const profilePreview = document.getElementById("profilePreview");

const profileImage = document.getElementById("profileImage");

const saveProfile = document.getElementById("saveProfile");
const saveMessage = document.getElementById("saveMessage");

const bioCount = document.getElementById("bioCount");


let currentUser = null, savedAccountType = "gamer", savedPhotoURL = "";


// Verifica login
auth.onAuthStateChanged(async (user) => {

    if (!user) {

        window.location.href = "login.html";

        return;
    }

    currentUser = user;

    await loadProfile();

});


// Carregar perfil
async function loadProfile() {

    try {

        const userRef = doc(
            db,
            "users",
            currentUser.uid
        );

        const snapshot = await getDoc(userRef);


        if (!snapshot.exists()) {

            console.error(
                "Perfil não encontrado."
            );

            return;
        }


        const data = snapshot.data();
        savedPhotoURL = data.photoURL || "";


        displayName.value =
            data.name || currentUser.displayName || "";

        username.value =
            data.username || "";

        bio.value =
            data.bio || "";
        profileVisibility.value = data.profileVisibility || "public";paintPrivacy();

        games.value = Array.isArray(data.games)
            ? data.games.map(game => typeof game === "string" ? game : game.name).filter(Boolean).join(", ")
            : data.games || "";

        twitch.value =
            data.twitch || "";

        youtube.value =
            data.youtube || "";

        savedAccountType = data.accountType || "gamer";
        creatorAccount.checked = savedAccountType === "creator";
        if (savedAccountType.startsWith("official_")) { creatorAccount.disabled = true; creatorAccount.closest("label").title = "O tipo da conta oficial é protegido pelo painel administrativo."; }
        verificationBadgeTheme.value = data.verificationBadgeTheme || "blue";
        updateBadgeThemePreview();
        const canCustomize = creatorAccount.checked && data.verification?.status === "active";
        verificationBadgeTheme.dataset.verified = data.verification?.status === "active" ? "true" : "false";
        verificationBadgeTheme.disabled = !canCustomize;
        document.getElementById("badgeThemeHelp").textContent = canCustomize ? "A cor escolhida será aplicada ao perfil e a todas as suas publicações." : "Disponível somente para criadores verificados.";


        profilePreview.src =
            data.photoURL ||
            currentUser.photoURL ||
            "assets/logo.png";

        document.getElementById("steamStatus").textContent = data.steamConnected
            ? `${data.steamProfile?.personaname || "Conectada"} · ${data.steamGames?.length || 0} jogos`
            : "Não conectada";

        document.getElementById("editConnectSteam").textContent = data.steamConnected ? "Atualizar" : "Conectar";


        updateBioCounter();

    } catch (error) {

        console.error(
            "Erro ao carregar perfil:",
            error
        );

    }

}


// Contador da bio
bio.addEventListener(
    "input",
    updateBioCounter
);


function updateBioCounter() {

    bioCount.textContent =
        bio.value.length;

}


// Pré-visualização da imagem
profileImage.addEventListener(
    "change",
    () => {

        const file =
            profileImage.files[0];

        if (!file) return;


        const imageURL =
            URL.createObjectURL(file);

        profilePreview.src =
            imageURL;

    }
);


// Salvar perfil
saveProfile.addEventListener(
    "click",
    async () => {

        if (!currentUser) return;


        try {

            saveProfile.disabled = true;

            saveProfile.textContent =
                "Salvando...";


            const userRef = doc(
                db,
                "users",
                currentUser.uid
            );

            let photoURL = savedPhotoURL;
            let pendingPhotoURL = "";
            const imageFile = profileImage.files[0];
            if (imageFile) {
                if (imageFile.size > 5 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 5 MB.");
                if (!["image/png","image/jpeg","image/webp"].includes(imageFile.type)) throw new Error("Use uma imagem PNG, JPG ou WEBP.");
                const readyImage = await prepareImage(imageFile, { maxDimension: 1600, quality: .8, maxOutputBytes: 4 * 1024 * 1024 });
                const uploaded = await uploadMedia(readyImage, { maxBytes: 5 * 1024 * 1024, label: "imagem" });
                pendingPhotoURL = uploaded.url;
                await assertModeratedImageUrl(pendingPhotoURL);
            }

            const safeName=await assertModeratedPublicText(displayName.value,{field:"O nome",min:2,max:60});
            const safeUsername=await assertModeratedPublicText(username.value.replace("@",""),{field:"O nome de usuário",min:3,max:24});
            const safeBio=bio.value.trim()?await assertModeratedPublicText(bio.value,{field:"A bio",max:160}):"";


            const selectedBadgeTheme = creatorAccount.checked && !verificationBadgeTheme.disabled
                ? verificationBadgeTheme.value
                : "blue";

            // Trocar o @ nao reservava nada na colecao usernames: dava para
            // assumir o apelido de outra pessoa e se passar por ela. Reservar o
            // novo e liberar o antigo vao juntos, na mesma transacao.
            await runTransaction(db, async transaction => {
                const meu = await transaction.get(userRef);
                const atual = meu.data()?.username || "";
                if (atual === safeUsername) return;
                const alvo = doc(db, "usernames", safeUsername);
                const ocupado = await transaction.get(alvo);
                if (ocupado.exists() && ocupado.data()?.uid !== currentUser.uid) throw new Error("USERNAME_EM_USO");
                transaction.set(alvo, { uid: currentUser.uid, createdAt: serverTimestamp() });
                if (atual) transaction.delete(doc(db, "usernames", atual));
            });

            await updateDoc(
                userRef,
                {

                    name:
                        safeName,

                    username:
                        safeUsername,

                    bio:
                        safeBio,

                    games: games.value.split(",").map(item => item.trim()).filter(Boolean),

                    twitch:
                        twitch.value.trim(),

                    youtube:
                        youtube.value.trim(),

                    accountType: savedAccountType.startsWith("official_") ? savedAccountType : creatorAccount.checked ? "creator" : "gamer",

                    verificationBadgeTheme: selectedBadgeTheme,

                    profileVisibility: profileVisibility.value,

                    photoURL,

                    ...(pendingPhotoURL?{pendingPhotoURL,photoModeration:{status:"pending",submittedAt:serverTimestamp()}}:{}),

                    updatedAt: serverTimestamp()

                }
            );
            const accountType=savedAccountType.startsWith("official_")?savedAccountType:creatorAccount.checked?"creator":"gamer";
            await setDoc(doc(db,"publicProfiles",currentUser.uid),{uid:currentUser.uid,name:safeName,username:safeUsername,bio:safeBio,photoURL,accountType,verificationBadgeTheme:selectedBadgeTheme,visibility:profileVisibility.value,updatedAt:serverTimestamp()},{merge:true});

            const ownPosts = await getDocs(query(collection(db,"posts"),where("uid","==",currentUser.uid)));
            await Promise.all(ownPosts.docs.map(post => updateDoc(post.ref,{authorBadgeTheme:selectedBadgeTheme,authorAccountType:accountType})));


            saveMessage.textContent =
                pendingPhotoURL ? "Perfil salvo. A nova foto está aguardando análise." : "Perfil atualizado com sucesso!";


            saveMessage.className =
                "success-message";


        } catch (error) {

            if (error?.message === "USERNAME_EM_USO") {
                saveMessage.textContent = "Esse nome de usuário já é de outra pessoa. Escolha outro.";
                saveMessage.className = "error-message";
                return;
            }

            console.error(
                "Erro ao salvar perfil:",
                error
            );


            saveMessage.textContent =
                "Não foi possível salvar o perfil.";

            saveMessage.className =
                "error-message";


        } finally {

            saveProfile.disabled = false;

            saveProfile.textContent =
                "Salvar alterações";

        }

    }
);

creatorAccount.addEventListener("change",()=>{if(!creatorAccount.checked){verificationBadgeTheme.value="blue";}verificationBadgeTheme.disabled=!creatorAccount.checked||verificationBadgeTheme.dataset.verified!=="true";});
verificationBadgeTheme.addEventListener("change",updateBadgeThemePreview);

document.getElementById("editConnectSteam").addEventListener("click", async event => {
    if (!currentUser) return;
    const button = event.currentTarget;
    try {
        button.disabled = true;
        button.textContent = "Abrindo Steam...";
        const token = await currentUser.getIdToken(true);
        const response = await fetch(`${APP_CONFIG.functionsBaseUrl}/steamStart`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(await appCheckHeaders()) } });
        const payload = await response.json();
        if (!response.ok || !payload.url) throw new Error(payload.error || "Não foi possível conectar.");
        window.location.assign(payload.url);
    } catch (error) {
        saveMessage.textContent = error.message;
        saveMessage.className = "error-message";
        button.disabled = false;
        button.textContent = "Conectar";
    }
});

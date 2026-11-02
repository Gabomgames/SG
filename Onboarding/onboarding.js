import {
    auth,
    db
} from "../firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
    doc,
    getDoc,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { assertPublicText } from "../safety.js";
import { hasAcceptedCurrentLegal } from "../legal.js";



// =====================================================
// ESTADO
// =====================================================

let currentStep = 1;
const totalSteps = 7;

let currentUser = null;
let usernameAvailable = false;
let selectedGames = [];
let avatarData = "";



// =====================================================
// ELEMENTOS
// =====================================================

const steps = document.querySelectorAll(".step");

const currentStepElement =
    document.getElementById("currentStep");

const progressBar =
    document.getElementById("progressBar");

const backButton =
    document.getElementById("back");

const finishButton =
    document.getElementById("finish");

const usernameInput =
    document.getElementById("username");

const usernameStatus =
    document.getElementById("usernameStatus");

const bioInput =
    document.getElementById("bio");

const bioCounter =
    document.getElementById("bioCounter");

const avatarInput =
    document.getElementById("avatar");

const avatarPreview =
    document.getElementById("avatarPreview");

const avatarPlaceholder =
    document.getElementById("avatarPlaceholder");

const finishMessage =
    document.getElementById("finishMessage");

const profileSummary =
    document.getElementById("profileSummary");



// =====================================================
// VERIFICAR LOGIN
// =====================================================

onAuthStateChanged(auth, async (user) => {

    if (!user) {
        window.location.href = "../login.html";
        return;
    }

    currentUser = user;

    const canContinue = await loadExistingProfile();

    if (!canContinue) {
        return;
    }

    updateProgress();
});



// =====================================================
// CARREGAR PERFIL EXISTENTE
// =====================================================

async function loadExistingProfile() {

    try {

        const userRef =
            doc(db, "users", currentUser.uid);

        const snapshot =
            await getDoc(userRef);

        if (!snapshot.exists()) {
            window.location.replace(
                `../aceitar-termos.html?return=${encodeURIComponent("Onboarding/onboarding.html")}`
            );
            return false;
        }

        const data = snapshot.data();

        if (!hasAcceptedCurrentLegal(data)) {
            window.location.replace(
                `../aceitar-termos.html?return=${encodeURIComponent("Onboarding/onboarding.html")}`
            );
            return false;
        }

        if (data.profileCompleted === true) {

            window.location.href =
                "../tutorial.html";

            return false;
        }



        // =================================================
        // NOME
        // =================================================

        if (data.name) {

            const nameInput =
                document.getElementById("name");

            if (nameInput) {
                nameInput.value = data.name;
            }
        }



        // =================================================
        // USERNAME
        // =================================================

        if (data.username) {

            usernameInput.value =
                data.username;

            usernameAvailable = true;

            setUsernameStatus(
                "Username disponível.",
                "success"
            );
        }



        // =================================================
        // BIO
        // =================================================

        if (data.bio) {

            bioInput.value =
                data.bio;

            updateBioCounter();
        }



        // =================================================
        // JOGOS
        // =================================================

        if (Array.isArray(data.games)) {

            selectedGames =
                data.games;

            updateGameButtons();
        }



        // =================================================
        // TWITCH
        // =================================================

        const twitchInput =
            document.getElementById("twitch");

        if (twitchInput && data.twitch) {

            twitchInput.value =
                data.twitch;
        }



        // =================================================
        // YOUTUBE
        // =================================================

        const youtubeInput =
            document.getElementById("youtube");

        if (youtubeInput && data.youtube) {

            youtubeInput.value =
                data.youtube;
        }



        // =================================================
        // STEAM
        // =================================================

        const steamInput =
            document.getElementById("steam");

        if (steamInput && data.steam) {

            steamInput.value =
                data.steam;
        }



        // =================================================
        // FOTO
        // =================================================

        if (data.photoURL) {

            avatarData =
                data.photoURL;

            showAvatar(
                data.photoURL
            );
        }

        return true;

    } catch (error) {

        console.error(
            "Erro ao carregar perfil:",
            error
        );

        showFinishError(
            "Não foi possível carregar seu perfil. Tente novamente."
        );

        return false;
    }
}



// =====================================================
// PROGRESSO
// =====================================================

function updateProgress() {

    if (currentStepElement) {

        currentStepElement.textContent =
            String(currentStep).padStart(2, "0");
    }

    if (progressBar) {

        const progress =
            (currentStep / totalSteps) * 100;

        progressBar.style.width =
            `${progress}%`;
    }
}



// =====================================================
// TROCAR ETAPA
// =====================================================

function goToStep(step) {

    if (
        step < 1 ||
        step > totalSteps
    ) {
        return;
    }

    steps.forEach((section) => {

        section.classList.remove("active");

    });

    const nextSection =
        document.querySelector(
            `.step[data-step="${step}"]`
        );

    if (nextSection) {

        nextSection.classList.add("active");

    }

    currentStep =
        step;

    updateProgress();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

    if (step === 7) {

        updateSummary();

    }
}



// =====================================================
// BOTÕES CONTINUAR
// =====================================================

document
    .querySelectorAll("[data-next]")
    .forEach((button) => {

        button.addEventListener(
            "click",
            async () => {

                const next =
                    Number(
                        button.dataset.next
                    );

                const valid =
                    await validateStep(
                        currentStep
                    );

                if (!valid) {
                    return;
                }

                goToStep(next);

            }
        );

    });



// =====================================================
// VALIDAR ETAPA
// =====================================================

async function validateStep(step) {

    // =================================================
    // ETAPA 1: NOME
    // =================================================

    if (step === 1) {

        const nameInput =
            document.getElementById("name");

        const name =
            nameInput.value.trim();

        if (!name) {

            showError(
                "Digite seu nome para continuar."
            );

            return false;
        }

        if (name.length < 2) {

            showError(
                "Seu nome precisa ter pelo menos 2 caracteres."
            );

            return false;
        }
    }



    // =================================================
    // ETAPA 2: USERNAME
    // =================================================

    if (step === 2) {

        return await checkUsername();

    }



    // =================================================
    // ETAPA 5: JOGOS
    // =================================================

    if (step === 5) {

        if (selectedGames.length === 0) {

            showError(
                "Escolha pelo menos um jogo."
            );

            return false;
        }
    }

    return true;
}



// =====================================================
// USERNAME: DIGITAÇÃO
// =====================================================

usernameInput.addEventListener(
    "input",
    () => {

        usernameAvailable =
            false;

        const value =
            usernameInput.value
                .toLowerCase()
                .trim()
                .replace(/\s+/g, "");

        usernameInput.value =
            value;

        usernameStatus.textContent =
            "";

        usernameStatus.className =
            "status";

    }
);



// =====================================================
// USERNAME: VERIFICAÇÃO
// =====================================================

let usernameTimeout = null;

async function checkUsername() {

    const username =
        usernameInput.value
            .trim()
            .toLowerCase();



    // =================================================
    // VAZIO
    // =================================================

    if (!username) {

        setUsernameStatus(
            "Escolha um username.",
            "error"
        );

        return false;
    }



    // =================================================
    // FORMATO
    // =================================================

    if (
        !/^[a-z0-9_]{3,20}$/.test(username)
    ) {

        setUsernameStatus(
            "Use de 3 a 20 caracteres: letras, números e _.",
            "error"
        );

        return false;
    }



    // =================================================
    // SE JÁ FOI VERIFICADO
    // =================================================

    if (usernameAvailable) {

        return true;

    }



    setUsernameStatus(
        "Verificando disponibilidade...",
        ""
    );



    if (usernameTimeout) {

        clearTimeout(
            usernameTimeout
        );

    }



    return new Promise((resolve) => {

        usernameTimeout =
            setTimeout(
                async () => {

                    try {

                        if (!currentUser) {

                            setUsernameStatus(
                                "Sua sessão ainda não foi carregada.",
                                "error"
                            );

                            resolve(false);

                            return;
                        }



                        // =================================================
                        // BUSCAR DIRETAMENTE EM usernames/{username}
                        // =================================================

                        const usernameRef =
                            doc(
                                db,
                                "usernames",
                                username
                            );



                        const snapshot =
                            await getDoc(
                                usernameRef
                            );



                        // =================================================
                        // NÃO EXISTE
                        // =================================================

                        if (!snapshot.exists()) {

                            usernameAvailable =
                                true;

                            setUsernameStatus(
                                "Username disponível.",
                                "success"
                            );

                            resolve(true);

                            return;
                        }



                        // =================================================
                        // EXISTE
                        // =================================================

                        const usernameData =
                            snapshot.data();



                        // Se pertence ao próprio usuário,
                        // continua válido.

                        if (
                            usernameData.uid ===
                            currentUser.uid
                        ) {

                            usernameAvailable =
                                true;

                            setUsernameStatus(
                                "Username disponível.",
                                "success"
                            );

                            resolve(true);

                            return;
                        }



                        // Username pertence a outra pessoa.

                        usernameAvailable =
                            false;

                        setUsernameStatus(
                            "Esse username já está sendo usado.",
                            "error"
                        );

                        resolve(false);

                    } catch (error) {

                        console.error(
                            "ERRO COMPLETO VERIFICANDO USERNAME:",
                            error
                        );

                        console.error(
                            "CÓDIGO:",
                            error?.code
                        );

                        console.error(
                            "MENSAGEM:",
                            error?.message
                        );

                        usernameAvailable =
                            false;

                        setUsernameStatus(
                            `Erro ao verificar: ${error?.code || error?.message || "desconhecido"}`,
                            "error"
                        );

                        resolve(false);
                    }

                },
                400
            );

    });
}



// =====================================================
// STATUS DO USERNAME
// =====================================================

function setUsernameStatus(
    message,
    type
) {

    if (!usernameStatus) {
        return;
    }

    usernameStatus.textContent =
        message;

    usernameStatus.className =
        `status ${type}`;
}



// =====================================================
// BIO
// =====================================================

function updateBioCounter() {

    if (
        !bioInput ||
        !bioCounter
    ) {
        return;
    }

    bioCounter.textContent =
        bioInput.value.length;
}



if (bioInput) {

    bioInput.addEventListener(
        "input",
        updateBioCounter
    );

}



// =====================================================
// AVATAR
// =====================================================

if (avatarInput) {

    avatarInput.addEventListener(
        "change",
        () => {

            const file =
                avatarInput.files[0];

            if (!file) {
                return;
            }



            // =================================================
            // TAMANHO
            // =================================================

            if (
                file.size >
                5 * 1024 * 1024
            ) {

                showError(
                    "A imagem precisa ter no máximo 5 MB."
                );

                avatarInput.value =
                    "";

                return;
            }



            // =================================================
            // FORMATO
            // =================================================

            if (
                ![
                    "image/jpeg",
                    "image/png",
                    "image/webp"
                ].includes(file.type)
            ) {

                showError(
                    "Escolha uma imagem PNG, JPG ou WEBP."
                );

                avatarInput.value =
                    "";

                return;
            }



            const reader =
                new FileReader();



            reader.onload =
                async (event) => {

                    try {

                        avatarData =
                            await compressImage(
                                event.target.result
                            );

                        showAvatar(
                            avatarData
                        );

                        if (finishMessage) {
                            finishMessage.textContent =
                                "Foto carregada para prévia. O envio definitivo será ativado com o backend de mídia.";
                            finishMessage.className =
                                "finish-message";
                        }

                    } catch (error) {

                        console.error(
                            "Erro ao processar imagem:",
                            error
                        );

                        showError(
                            "Não foi possível processar essa imagem."
                        );
                    }

                };

            reader.readAsDataURL(file);

        }
    );

}



// =====================================================
// COMPRIMIR IMAGEM
// =====================================================

function compressImage(dataUrl) {

    return new Promise(
        (resolve, reject) => {

            const image =
                new Image();

            image.onload =
                () => {

                    const canvas =
                        document.createElement(
                            "canvas"
                        );

                    const maxSize =
                        500;

                    let width =
                        image.width;

                    let height =
                        image.height;



                    if (
                        width > height
                    ) {

                        if (
                            width > maxSize
                        ) {

                            height =
                                Math.round(
                                    height *
                                    maxSize /
                                    width
                                );

                            width =
                                maxSize;
                        }

                    } else {

                        if (
                            height > maxSize
                        ) {

                            width =
                                Math.round(
                                    width *
                                    maxSize /
                                    height
                                );

                            height =
                                maxSize;
                        }
                    }



                    canvas.width =
                        width;

                    canvas.height =
                        height;



                    const context =
                        canvas.getContext(
                            "2d"
                        );

                    context.drawImage(
                        image,
                        0,
                        0,
                        width,
                        height
                    );



                    resolve(
                        canvas.toDataURL(
                            "image/jpeg",
                            0.82
                        )
                    );

                };



            image.onerror =
                reject;

            image.src =
                dataUrl;

        }
    );
}



// =====================================================
// MOSTRAR AVATAR
// =====================================================

function showAvatar(src) {

    if (!avatarPreview) {
        return;
    }

    avatarPreview.src =
        src;

    avatarPreview.classList.add(
        "visible"
    );

    if (avatarPlaceholder) {

        avatarPlaceholder.style.display =
            "none";
    }
}



// =====================================================
// JOGOS
// =====================================================

document
    .querySelectorAll(".game")
    .forEach((button) => {

        button.addEventListener(
            "click",
            () => {

                const game =
                    button.dataset.game;

                if (
                    selectedGames.includes(
                        game
                    )
                ) {

                    selectedGames =
                        selectedGames.filter(
                            (item) =>
                                item !== game
                        );

                } else {

                    selectedGames.push(
                        game
                    );
                }

                updateGameButtons();

            }
        );

    });



// =====================================================
// ATUALIZAR BOTÕES DE JOGOS
// =====================================================

function updateGameButtons() {

    document
        .querySelectorAll(".game")
        .forEach((button) => {

            const game =
                button.dataset.game;

            button.classList.toggle(
                "selected",
                selectedGames.includes(
                    game
                )
            );

        });
}



// =====================================================
// RESUMO FINAL
// =====================================================

function updateSummary() {

    if (!profileSummary) {
        return;
    }

    const name =
        document
            .getElementById("name")
            .value
            .trim();

    const username =
        usernameInput.value
            .trim();

    const games =
        selectedGames.length;



    profileSummary.innerHTML = `

        <div class="summary-item">

            <span>Nome</span>

            <strong>
                ${escapeHtml(
                    name || "Sem nome"
                )}
            </strong>

        </div>



        <div class="summary-item">

            <span>Username</span>

            <strong>
                ${username ? "@" + escapeHtml(username) : "Sem username"}
            </strong>

        </div>



        <div class="summary-item">

            <span>Jogos</span>

            <strong>
                ${games}
            </strong>

        </div>

    `;
}



// =====================================================
// FINALIZAR
// =====================================================

if (finishButton) {

    finishButton.addEventListener(
        "click",
        async () => {

            if (!currentUser) {

                showFinishError(
                    "Sua sessão ainda não foi carregada."
                );

                return;
            }



            const valid =
                await validateAll();



            if (!valid) {
                return;
            }



            try {

                finishButton.disabled =
                    true;

                finishButton.innerHTML = `
                    <span>Salvando perfil...</span>
                `;



                if (finishMessage) {

                    finishMessage.textContent =
                        "";
                }



                // =================================================
                // DADOS
                // =================================================

                const name =
                    document
                        .getElementById("name")
                        .value
                        .trim();

                const username =
                    usernameInput.value
                        .trim()
                        .toLowerCase();

                const bio =
                    bioInput.value
                        .trim();

                const twitch =
                    document
                        .getElementById("twitch")
                        .value
                        .trim();

                const youtube =
                    document
                        .getElementById("youtube")
                        .value
                        .trim();

                const steamInput =
                    document.getElementById(
                        "steam"
                    );

                const steam =
                    steamInput
                        ? steamInput.value.trim()
                        : "";

                assertPublicText(name, {field:"O nome", min:2, max:60});
                assertPublicText(username, {field:"O nome de usuário", min:3, max:24});
                if (bio) assertPublicText(bio, {field:"A bio", min:1, max:160});



                // =================================================
                // REFERÊNCIA
                // =================================================

                const userRef =
                    doc(
                        db,
                        "users",
                        currentUser.uid
                    );



                const usernameRef =
                    doc(
                        db,
                        "usernames",
                        username
                    );



                // =================================================
                // SALVAR USERNAME + PERFIL
                // ATOMICAMENTE
                // =================================================

                await runTransaction(
                    db,
                    async (transaction) => {

                        const usernameSnapshot =
                            await transaction.get(
                                usernameRef
                            );



                        // Username já existe

                        if (
                            usernameSnapshot.exists()
                        ) {

                            const usernameData =
                                usernameSnapshot.data();



                            // Pertence a outra conta

                            if (
                                usernameData.uid !==
                                currentUser.uid
                            ) {

                                throw new Error(
                                    "USERNAME_TAKEN"
                                );
                            }

                        } else {

                            // Reservar username

                            transaction.set(
                                usernameRef,
                                {
                                    uid:
                                        currentUser.uid,

                                    createdAt:
                                        serverTimestamp()
                                }
                            );

                        }



                        // =================================================
                        // SALVAR PERFIL
                        // =================================================

                        const profileUpdate = {
                            name,
                            username,
                            bio,
                            games: selectedGames,
                            twitch,
                            youtube,
                            steam,
                            profileCompleted: true,
                            updatedAt: serverTimestamp()
                        };

                        // A regra atual aceita pendingPhotoURL apenas em HTTPS.
                        // Imagem local vira data:image/...; gravar isso causaria
                        // permission-denied. A prévia continua funcionando, mas
                        // a gravação definitiva da foto fica para o backend de mídia.
                        if (
                            avatarData &&
                            /^https:\/\//i.test(avatarData)
                        ) {
                            profileUpdate.pendingPhotoURL = avatarData;
                            profileUpdate.photoModeration = {
                                status: "pending",
                                submittedAt: serverTimestamp()
                            };
                        }

                        transaction.set(
                            userRef,
                            profileUpdate,
                            {
                                merge: true
                            }
                        );

                    }
                );



                // =================================================
                // SUCESSO
                // =================================================

                if (finishMessage) {

                    finishMessage.textContent =
                        "Perfil criado com sucesso!";

                    finishMessage.className =
                        "finish-message success";
                }



                finishButton.innerHTML = `
                    <span>Entrando no Something Gamer...</span>
                `;



                setTimeout(
                    () => {

                        window.location.href =
                            "../tutorial.html";

                    },
                    900
                );



            } catch (error) {

                console.error(
                    "Erro ao salvar perfil:",
                    error
                );



                if (
                    error.message ===
                    "USERNAME_TAKEN"
                ) {

                    usernameAvailable =
                        false;

                    goToStep(2);

                    setUsernameStatus(
                        "Esse username acabou de ser usado por outra pessoa.",
                        "error"
                    );

                    finishButton.disabled =
                        false;

                    finishButton.innerHTML = `
                        <span>Criar meu perfil</span>
                    `;

                    return;
                }



                showFinishError(
                    `Não foi possível salvar seu perfil: ${error?.code || error?.message || "erro desconhecido"}`
                );



                finishButton.disabled =
                    false;

                finishButton.innerHTML = `
                    <span>Criar meu perfil</span>
                `;
            }

        }
    );

}



// =====================================================
// VALIDAR TUDO
// =====================================================

async function validateAll() {

    const name =
        document
            .getElementById("name")
            .value
            .trim();

    const username =
        usernameInput.value
            .trim()
            .toLowerCase();



    // =================================================
    // NOME
    // =================================================

    if (!name) {

        goToStep(1);

        showError(
            "Digite seu nome."
        );

        return false;
    }



    // =================================================
    // USERNAME
    // =================================================

    if (
        !username ||
        !/^[a-z0-9_]{3,20}$/.test(
            username
        )
    ) {

        goToStep(2);

        showError(
            "Escolha um username válido."
        );

        return false;
    }



    // =================================================
    // VERIFICAR USERNAME
    // =================================================

    const usernameIsValid =
        await checkUsername();



    if (!usernameIsValid) {

        goToStep(2);

        return false;
    }



    // =================================================
    // JOGOS
    // =================================================

    if (
        selectedGames.length === 0
    ) {

        goToStep(5);

        showError(
            "Escolha pelo menos um jogo."
        );

        return false;
    }



    return true;
}



// =====================================================
// VOLTAR
// =====================================================

if (backButton) {

    backButton.addEventListener(
        "click",
        () => {

            if (currentStep > 1) {

                goToStep(
                    currentStep - 1
                );

            } else {

                window.location.href =
                    "../index.html";

            }

        }
    );

}



// =====================================================
// ERRO DA ETAPA
// =====================================================

function showError(message) {

    const activeStep =
        document.querySelector(
            ".step.active"
        );

    if (!activeStep) {
        return;
    }



    let error =
        activeStep.querySelector(
            ".local-error"
        );



    if (!error) {

        error =
            document.createElement(
                "div"
            );

        error.className =
            "local-error";



        const button =
            activeStep.querySelector(
                ".continue"
            );



        if (button) {

            activeStep.insertBefore(
                error,
                button
            );

        } else {

            activeStep.appendChild(
                error
            );
        }
    }



    error.textContent =
        message;



    setTimeout(
        () => {

            if (error) {

                error.textContent =
                    "";
            }

        },
        3500
    );
}



// =====================================================
// ERRO FINAL
// =====================================================

function showFinishError(message) {

    if (!finishMessage) {

        alert(message);

        return;
    }



    finishMessage.textContent =
        message;



    finishMessage.className =
        "finish-message error";
}



// =====================================================
// ESCAPAR HTML
// =====================================================

function escapeHtml(value) {

    return String(value)
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );
}

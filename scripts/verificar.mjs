// Verificação do Something Gamer: sem framework, só node.
//
// Existe porque a v40 foi publicada com um "}" faltando no chat.js. Como é
// módulo ES, o arquivo inteiro não carregava e a página de chat ficava morta,
// sem erro visível em lugar nenhum. Um parse teria pego em um segundo.
//
//   node scripts/verificar.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "acorn";
import {unboundLibraryCalls} from "./library-bindings.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignorar = new Set(["node_modules", ".git", "build", "dist", ".firebase", ".wrangler", "scripts", "tests", "test-results", "playwright-report", "docs"]);

const falhas = [];
const avisos = [];
let conferidos = 0;

function varrer(dir, extensoes) {
    const achados = [];
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ignorar.has(item.name)) continue;
        const completo = path.join(dir, item.name);
        if (item.isDirectory()) achados.push(...varrer(completo, extensoes));
        else if (extensoes.some(ext => item.name.endsWith(ext))) achados.push(completo);
    }
    return achados;
}

const relativo = arquivo => path.relative(raiz, arquivo).replace(/\\/g, "/");

// ---------- 1. todo JavaScript precisa ao menos compilar ----------
for (const arquivo of varrer(raiz, [".js", ".mjs"])) {
    const codigo = fs.readFileSync(arquivo, "utf8");
    const nome = relativo(arquivo);
    // functions/ e desktop-app/ são CommonJS; o resto é módulo ES.
    const commonjs = nome.startsWith("functions/") || nome.startsWith("desktop-app/");
    conferidos++;
    try {
        parse(codigo,{ecmaVersion:"latest",sourceType:commonjs?"script":"module",allowHashBang:true,allowReturnOutsideFunction:commonjs});
    } catch (erro) {
        const saida = String(erro.stderr || erro.message).split("\n").find(linha => /Error/.test(linha)) || String(erro.message);
        falhas.push(`${nome}: ${saida.trim()}`);
    }
}

// ---------- 2. todo JSON precisa ser JSON ----------
for (const arquivo of varrer(raiz, [".json", ".webmanifest"])) {
    const nome = relativo(arquivo);
    if (nome.endsWith("package-lock.json")) continue;
    conferidos++;
    try {
        JSON.parse(fs.readFileSync(arquivo, "utf8").replace(/^﻿/, ""));
    } catch (erro) {
        falhas.push(`${nome}: ${erro.message}`);
    }
}

// ---------- 3. módulo ES carregado sem type="module" não roda ----------
const modulos = new Set();
for (const arquivo of varrer(raiz, [".js"])) {
    const codigo = fs.readFileSync(arquivo, "utf8");
    if (/^\s*(import|export)\s/m.test(codigo)) modulos.add(path.basename(arquivo));
}
for (const arquivo of varrer(raiz, [".html"])) {
    const html = fs.readFileSync(arquivo, "utf8");
    const nome = relativo(arquivo);
    conferidos++;
    for (const tag of html.match(/<script\b[^>]*>/g) || []) {
        const src = (tag.match(/src="([^"]+)"/) || [])[1];
        if (!src) {
            avisos.push(`${nome}: script inline (a CSP em firebase.json bloqueia)`);
            continue;
        }
        const base = path.basename(src.split("?")[0]);
        if (modulos.has(base) && !/type="module"/.test(tag)) {
            falhas.push(`${nome}: ${base} é módulo ES mas está sem type="module", então não vai carregar`);
        }
    }
}


// ---------- 3b. CSP: sem handlers inline ou javascript: ----------
// A política de segurança do Hosting não libera unsafe-inline para scripts.
// Portanto onclick/onerror/etc. em HTML (inclusive HTML montado em strings JS)
// ficam bloqueados e também reabrem superfície de XSS se a CSP mudar.
for (const arquivo of [...varrer(raiz, [".html"]), ...varrer(raiz, [".js"])]) {
    const codigo = fs.readFileSync(arquivo, "utf8");
    const nome = relativo(arquivo);
    conferidos++;
    if (/\son[a-z]+\s*=\s*["']/i.test(codigo)) {
        falhas.push(`${nome}: contém handler inline (onclick/onerror/etc.), incompatível com a CSP`);
    }
    if (/javascript\s*:/i.test(codigo) && !nome.endsWith("seguranca-web.js")) {
        falhas.push(`${nome}: contém esquema javascript:, que não deve aparecer em navegação/mídia`);
    }
}

// ---------- 3c. App Check, privacidade e segredos do cliente ----------
{
    const ler = arquivo => fs.readFileSync(path.join(raiz, arquivo), "utf8");
    const firebase = ler("firebase.js");
    const config = ler("config.js");
    const functions = ler("functions/index.js");
    const cadastro = ler("register.html");
    const privacidade = path.join(raiz, "privacidade.html");
    conferidos++;

    if (!/ReCaptchaEnterpriseProvider/.test(firebase) || !/initializeAppCheck/.test(firebase)) {
        falhas.push("firebase.js: Firebase App Check com reCAPTCHA Enterprise não está inicializado");
    }
    if (!/recaptchaEnterpriseSiteKey/.test(config)) {
        falhas.push("config.js: falta recaptchaEnterpriseSiteKey para App Check");
    } else if (/recaptchaEnterpriseSiteKey:\s*["']\s*["']/.test(config)) {
        avisos.push("config.js: recaptchaEnterpriseSiteKey ainda está vazia; cadastre a site key pública antes de ativar enforcement");
    }
    if (/giphyApiKey/i.test(config) || /api[_-]?key[^\n]*giphy/i.test(config)) {
        falhas.push("config.js: chave GIPHY não pode ficar no frontend");
    }
    if (!/defineSecret\(["']GIPHY_API_KEY["']\)/.test(functions)) {
        falhas.push("functions/index.js: GIPHY_API_KEY deve ficar no Secret Manager");
    }
    if (!/APP_CHECK_ENFORCED/.test(functions) || !/verifyAppCheck/.test(functions)) {
        falhas.push("functions/index.js: endpoints próprios não estão preparados para exigir App Check");
    }
    if (!fs.existsSync(privacidade)) {
        falhas.push("privacidade.html: Política de Privacidade/LGPD ausente");
    }
    if (!/privacidade\.html/.test(cadastro)) {
        falhas.push("register.html: cadastro não referencia a Política de Privacidade");
    }

    const termos = path.join(raiz, "termos.html");
    const aceite = path.join(raiz, "aceitar-termos.html");
    const legal = path.join(raiz, "legal.js");
    const regras = ler("firestore.rules");
    const storage = ler("storage.rules");
    if (!fs.existsSync(termos) || !fs.existsSync(aceite) || !fs.existsSync(legal)) {
        falhas.push("Termos de Uso: faltam termos.html, aceitar-termos.html ou legal.js");
    }
    if (!/termos\.html/.test(cadastro) || !/registerSafetyConsent/.test(cadastro)) {
        falhas.push("register.html: o cadastro precisa exigir aceite dos Termos de Uso");
    }
    if (!/termsVersion:\s*["']2026-09-16["']/.test(config) || !/communityRulesVersion/.test(config)) {
        falhas.push("config.js: versões jurídicas atuais não estão definidas");
    }
    if (!/function hasAcceptedTerms\(\)/.test(regras) || !/legalOk\(request\.resource\.data\.get\('legal'/.test(regras)) {
        falhas.push("firestore.rules: aceite versionado dos Termos não está sendo exigido");
    }
    if (!/function acceptedTerms\(userId\)/.test(storage)) {
        falhas.push("storage.rules: uploads não estão condicionados ao aceite dos Termos");
    }
    if (!/requireParticipatingUser/.test(functions) || !/TERMS_REQUIRED/.test(functions)) {
        falhas.push("functions/index.js: endpoints de usuário não verificam Termos atuais");
    }
}

// ---------- 4. notificação sem read:false é recusada pelas regras ----------
for (const arquivo of varrer(raiz, [".js"])) {
    const codigo = fs.readFileSync(arquivo, "utf8");
    const nome = relativo(arquivo);
    const re = /(setDoc\(doc\(collection\(db,\s*["']notifications["']\)\)|addDoc\(collection\(db,\s*["']notifications["']\))\s*,\s*\{/g;
    let achado;
    while ((achado = re.exec(codigo))) {
        let i = re.lastIndex - 1, prof = 0, fim = i;
        for (let k = i; k < codigo.length; k++) {
            if (codigo[k] === "{") prof++;
            else if (codigo[k] === "}" && --prof === 0) { fim = k; break; }
        }
        if (!codigo.slice(i, fim + 1).includes("read:false")) {
            falhas.push(`${nome}: notificação criada sem read:false, e as regras do Firestore recusam`);
        }
    }
}

// ---------- 5. consultas com limit() precisam de orderBy ----------
// Sem orderBy o Firestore ordena por ID do documento, que é aleatório: a v40
// parava de entregar notificação depois das 30 primeiras.
for (const arquivo of varrer(raiz, [".js"])) {
    const codigo = fs.readFileSync(arquivo, "utf8");
    const nome = relativo(arquivo);
    for (const trecho of codigo.match(/query\((?:[^()]|\([^()]*\))*\)/g) || []) {
        if (trecho.includes("limit(") && !trecho.includes("orderBy(") && !trecho.includes("sem-orderby")) {
            falhas.push(`${nome}: query com limit() e sem orderBy(), então ordena por ID aleatório: ${trecho.slice(0, 90)}`);
        }
    }
}

// ---------- 5b. identificador usado sem import ----------
// Um import apagado por engano não é erro de sintaxe: o arquivo compila e só
// quebra em produção, na hora que a função é chamada.
{
    const daBiblioteca = [
        "auth", "db", "storage", "googleProvider", "signInWithPopup", "APP_CONFIG",
        "collection", "doc", "getDoc", "getDocs", "query", "where", "limit", "orderBy",
        "setDoc", "addDoc", "updateDoc", "deleteDoc", "onSnapshot", "runTransaction",
        "serverTimestamp", "arrayUnion", "arrayRemove", "Timestamp",
        "ref", "uploadBytes", "getDownloadURL", "signOut",
        "assertPublicText", "inspectPublicText", "openSafetyReport",
        "escaparHtml", "urlSegura", "urlDeMidia", "hrefSeguro", "srcSeguro"
    ];
    for (const arquivo of varrer(raiz, [".js"])) {
        const nome = relativo(arquivo);
        if (nome.startsWith("functions/") || nome.startsWith("desktop-app/") || nome.startsWith("something-gamer-api/")) continue;
        const codigo = fs.readFileSync(arquivo, "utf8");
        conferidos++;
        try {
            for (const {name,line} of unboundLibraryCalls(codigo,daBiblioteca)) {
                falhas.push(`${nome}:${line}: usa "${name}()" sem declaração no escopo`);
            }
        } catch {
            // Erros de parse já são reportados pela verificação de sintaxe.
        }
    }
}

// ---------- 6. regras de segurança: estrutura ----------
// Não dá para rodar o emulador sem Java, então aqui vai o que dá para conferir
// sem ele. Um erro nas regras derruba TODA escrita do app de uma vez.
for (const arquivo of ["firestore.rules", "storage.rules"]) {
    const bruto = fs.readFileSync(path.join(raiz, arquivo), "utf8");
    // Uma varredura só, da esquerda para a direita. Com dois replace separados
    // dava errado dos dois jeitos: apagar comentário antes comia o resto da
    // linha em matches('https://.*'), e apagar string antes fazia um apóstrofo
    // solto dentro de um comentário engolir o arquivo até a próxima aspa.
    const limpo = (() => {
        let saida = "", modo = "codigo";
        for (let i = 0; i < bruto.length; i++) {
            const ch = bruto[i];
            if (modo === "codigo") {
                if (ch === "/" && bruto[i + 1] === "/") { modo = "comentario"; continue; }
                if (ch === "'") { modo = "texto"; saida += "''"; continue; }
                saida += ch;
            } else if (modo === "comentario") {
                if (ch === "\n") { modo = "codigo"; saida += ch; }
            } else {
                if (ch === "\\") { i++; continue; }
                if (ch === "'") modo = "codigo";
                else if (ch === "\n") saida += ch; // string não fechada: não engole o arquivo
            }
        }
        return saida;
    })();
    conferidos++;

    // delimitadores equilibrados
    const pilha = [];
    const pares = { "}": "{", ")": "(", "]": "[" };
    let linha = 1;
    for (const ch of limpo) {
        if (ch === "\n") linha++;
        else if ("{([".includes(ch)) pilha.push({ ch, linha });
        else if (ch in pares) {
            const topo = pilha.pop();
            if (!topo || topo.ch !== pares[ch]) falhas.push(`${arquivo}:${linha} fecha "${ch}" sem abrir`);
        }
    }
    if (pilha.length) falhas.push(`${arquivo}: ${pilha.length} delimitador(es) sem fechar (primeiro na linha ${pilha[0].linha})`);

    // toda função chamada precisa existir
    const definidas = new Set([...limpo.matchAll(/function\s+([a-zA-Z][a-zA-Z0-9]*)\s*\(/g)].map(m => m[1]));
    const embutidas = new Set(["get", "exists", "getAfter", "existsAfter", "debug", "float", "int", "string", "duration", "hashing", "latlng", "math", "timestamp", "path", "value", "firestore"]);
    const palavras = new Set(["if", "return", "in", "is", "allow", "match", "service", "rules_version"]);
    for (const m of limpo.matchAll(/(?:^|[^.\w])([a-zA-Z][a-zA-Z0-9]*)\s*\(/g)) {
        const nome = m[1];
        if (!definidas.has(nome) && !embutidas.has(nome) && !palavras.has(nome)) {
            falhas.push(`${arquivo}: chama "${nome}()" que não é função definida nem embutida`);
        }
    }

    // indexar mapa com variável não é construção garantida da linguagem de regras
    for (const m of limpo.matchAll(/data\[\s*([a-zA-Z][a-zA-Z0-9]*)\s*\]/g)) {
        falhas.push(`${arquivo}: indexa mapa com a variável "${m[1]}" : use .get('campo', padrão)`);
    }

    // as expressões regulares precisam compilar
    for (const m of bruto.matchAll(/\.matches\('([^']*)'\)/g)) {
        try { new RegExp(m[1].replace(/^\(\?s\)/, ""), "s"); }
        catch (erro) { falhas.push(`${arquivo}: regex inválida em matches(): ${erro.message}`); }
    }
}

// o filtro de termos graves casa a string inteira: sem .* nas pontas não pega nada
{
  const regras = fs.readFileSync(path.join(raiz, "firestore.rules"), "utf8");
  const filtro = (regras.match(/function semTermoGrave[\s\S]*?matches\('([^']*)'\)/) || [])[1];
  if (!filtro) falhas.push("firestore.rules: semTermoGrave() sumiu, e a validação de conteúdo no servidor depende dela");
  else if (!/\.\*\)?$/.test(filtro) || !filtro.includes(".*(")) {
      falhas.push(`firestore.rules: semTermoGrave() precisa de .* nas duas pontas, porque o Firestore casa a string inteira`);
  }
}

// ---------- 7. identidade administrativa não pode depender de e-mail ----------
{
    const ler = arquivo => fs.readFileSync(path.join(raiz, arquivo), "utf8");
    const fontes = {
        "firestore.rules": ler("firestore.rules"),
        "storage.rules": ler("storage.rules"),
        "functions/index.js": ler("functions/index.js"),
        "worker": ler("something-gamer-api/src/index.js"),
        "wrangler.jsonc": ler("something-gamer-api/wrangler.jsonc")
    };
    conferidos++;
    for (const [onde, texto] of Object.entries(fontes)) {
        if (/ADMIN_EMAILS|adminEmails\s*\(|token\.email\s+in\s+\[/.test(texto)) {
            falhas.push(`${onde}: autorização administrativa ainda depende de lista de e-mails`);
        }
    }
    if (!/return false; \/\/ Administração somente via backend/.test(fontes["firestore.rules"])) {
        falhas.push("firestore.rules: acesso administrativo direto deve estar negado");
    }
    if (!/return false; \/\/ acesso privilegiado/.test(fontes["storage.rules"])) {
        falhas.push("storage.rules: acesso administrativo direto deve estar negado");
    }
    if (/ADMIN_UIDS/.test(fontes["functions/index.js"]) || /bootstrapAdmin/.test(fontes["functions/index.js"]) || !/user\.admin !== true/.test(fontes["functions/index.js"])) {
        falhas.push("functions/index.js: admin deve depender de Custom Claim e não de bootstrap/UID hardcoded");
    }
    if (!/allowed\.has\(admin\.uid\)/.test(fontes.worker) && !/admin\.uid !== String\(env\.ADMIN_UID\)/.test(fontes.worker)) {
        falhas.push("Worker: acesso admin deve validar UID permitido");
    }
}


// ---------- 7b. painel admin: autorização forte sem exigir plano Blaze ----------
{
    const admin = fs.readFileSync(path.join(raiz, "admin.js"), "utf8");
    const regras = fs.readFileSync(path.join(raiz, "firestore.rules"), "utf8");
    conferidos++;
    if (!/steamApiBaseUrl.*adminApi/.test(admin) || /const publicPatch=async/.test(admin)) {
        falhas.push("admin.js: escrita direta deve estar protegida por Custom Claim nas Firestore Rules");
    }
    if (/fb8SBLghn8WayLE6nHinJyZpetP2|QJ9lKySV3UfEoCLYfaNE7cfF6Io1/.test(admin) || /request\.auth\.uid in \[/.test(regras)) {
        falhas.push("admin: remover UIDs administrativos hardcoded do cliente/regras");
    }
    if (!/get\('badges', \{\}\) == perfilPrivado\(userId\)\.get\('badges', \{\}\)/.test(regras)) {
        falhas.push("firestore.rules: badges públicos devem espelhar integralmente o documento privado");
    }
    if (!/campoNaoRetrocede\('post'\)/.test(regras) || !/affectedKeys\(\)\.hasOnly\(\['post', 'comentario', 'denuncia'\]\)/.test(regras)) {
        falhas.push("firestore.rules: rate limit pode ser contornado se limites/{uid} aceitar carimbo arbitrário");
    }
    if (/allow write:\s*if\s+isAdmin\(\)/.test(regras) || /allow create, delete:\s*if\s+isAdmin\(\)/.test(regras)) {
        falhas.push("firestore.rules: operações administrativas críticas ainda podem ser feitas direto pelo navegador");
    }
}

// ---------- 7c. selos: uma fonte visual e nenhuma autoatribuição ----------
{
    const badgesPath = path.join(raiz, "badges.js");
    const regras = fs.readFileSync(path.join(raiz, "firestore.rules"), "utf8");
    conferidos++;
    if (!fs.existsSync(badgesPath)) {
        falhas.push("badges.js: renderizador central de selos ausente");
    } else {
        const badges = fs.readFileSync(badgesPath, "utf8");
        for (const asset of ["verified-badge.png", "sg-follow-badge.png", "now-follow-badge.png"]) {
            if (!badges.includes(asset) || !fs.existsSync(path.join(raiz, "assets", asset))) {
                falhas.push(`Selos: asset ${asset} não está integrado ao renderizador central`);
            }
        }
    }
    for (const arquivo of ["profile.js", "social.js", "feed.js", "dashboard.js", "chat.js", "events.js"]) {
        const codigo = fs.readFileSync(path.join(raiz, arquivo), "utf8");
        if (!/from ["']\.\/badges\.js["']/.test(codigo)) falhas.push(`${arquivo}: ainda não usa badges.js`);
    }
    if (!/snapshotDeAutorOk\(request\.resource\.data\)/.test(regras)) {
        falhas.push("firestore.rules: publicação ainda pode falsificar snapshot de selo/autor");
    }
}

// ---------- 8. getElementById de id que não existe na página ----------
// O painel admin ficou morto por isso: renderCountryOptions() roda no topo
// do admin.js e faz $("countryOptions").innerHTML. O elemento não existe no
// admin.html, então dá TypeError, o módulo para ali e NADA depois é
// registrado: nem o login, nem as abas, nem a tabela. Mesmo estrago do "}"
// que faltava no chat.js, por outro caminho.
{
    const paginas = varrer(raiz, [".html"]);
    const modulos = varrer(raiz, [".js"]);

    // o que cada módulo importa, para seguir a cadeia a partir da página
    const importa = new Map();
    for (const arquivo of modulos) {
        const codigo = fs.readFileSync(arquivo, "utf8");
        const pasta = path.posix.dirname(relativo(arquivo));
        importa.set(relativo(arquivo), [...codigo.matchAll(/from\s+"(\.[^"]+\.js)"/g)]
            .map(m => path.posix.normalize(path.posix.join(pasta, m[1]))));
    }

    function cadeia(inicio, vistos = new Set()) {
        if (vistos.has(inicio)) return vistos;
        vistos.add(inicio);
        for (const dep of importa.get(inicio) || []) cadeia(dep, vistos);
        return vistos;
    }

    // um id pode nascer em tempo de execução (innerHTML), e aí não está no HTML
    const criadosEmJs = new Set();
    for (const arquivo of modulos) {
        for (const m of fs.readFileSync(arquivo, "utf8").matchAll(/id=\\?"([A-Za-z][\w-]*)/g)) {
            criadosEmJs.add(m[1]);
        }
    }

    // um script compartilhado (script.js) pode usar um id que só existe em
    // uma das páginas, dentro de um if. Só reclamamos se o id não existe em
    // NENHUMA página que carrega aquele script.
    const idsPorPagina = new Map();
    const scriptsPorPagina = new Map();
    for (const pagina of paginas) {
        const html = fs.readFileSync(pagina, "utf8");
        const pasta = path.posix.dirname(relativo(pagina));
        idsPorPagina.set(relativo(pagina), new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1])));
        const scripts = new Set();
        for (const m of html.matchAll(/<script[^>]*src="([^"]+\.js)"/g)) {
            if (/^https?:/.test(m[1])) continue;
            for (const dep of cadeia(path.posix.normalize(path.posix.join(pasta, m[1])))) scripts.add(dep);
        }
        scriptsPorPagina.set(relativo(pagina), scripts);
    }

    for (const pagina of paginas) {
        const nome = relativo(pagina);
        const meusIds = idsPorPagina.get(nome);
        for (const js of scriptsPorPagina.get(nome)) {
            const caminho = path.join(raiz, js);
            if (!fs.existsSync(caminho)) continue;
            const codigo = fs.readFileSync(caminho, "utf8");
            const protegidos = new Set([...codigo.matchAll(/if\s*\(\s*!?\s*\$\("([A-Za-z][\w-]*)"\)/g)].map(m => m[1]));
            for (const m of codigo.matchAll(/(?:\$|document\.getElementById)\(\s*"([A-Za-z][\w-]*)"\s*\)\s*\./g)) {
                const id = m[1];
                if (meusIds.has(id) || criadosEmJs.has(id) || protegidos.has(id)) continue;
                // existe em outra página que carrega o mesmo script?
                let existeEmOutra = false;
                for (const [outra, scripts] of scriptsPorPagina) {
                    if (outra !== nome && scripts.has(js) && idsPorPagina.get(outra).has(id)) { existeEmOutra = true; break; }
                }
                if (existeEmOutra) continue;
                falhas.push(`${js}: usa #${id}, que não existe em ${nome} (nem é criado em tempo de execução)`);
            }
        }
    }
}

// ---------- resultado ----------
console.log(`${conferidos} arquivos conferidos.`);
for (const aviso of avisos) console.log(`  aviso: ${aviso}`);
if (falhas.length) {
    console.error(`\n${falhas.length} problema(s):`);
    for (const falha of falhas) console.error(`  - ${falha}`);
    process.exit(1);
}
console.log("Tudo certo.");

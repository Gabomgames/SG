// Build do Something Gamer: gera a pasta dist/ que vai para o Firebase Hosting.
//
// O que ele faz e por quê:
//   1. copia o site estático para dist/
//   2. junta cada página num arquivo só (esbuild) e minifica
//   3. ofusca o resultado (javascript-obfuscator)
//
// Um aviso honesto: ofuscar JavaScript NÃO é controle de segurança. O
// navegador precisa executar o código, então quem quiser lê. Quem protege o
// app são as regras do Firestore e do Storage. Isto aqui encarece a cópia
// casual e diminui o peso; quem guarda a porta é o servidor.
//
// O código-fonte continua legível no repositório. Só o dist/ é ofuscado, e
// o dist/ não vai para o git.
//
//   npm install && npm run build

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";
import { randomBytes } from "node:crypto";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const saida = path.join(raiz, "dist");

// pastas que nunca entram no site publicado
const foraDoSite = new Set([
    "node_modules", "dist", "scripts", ".git", ".github", ".claude",
    "functions", "something-gamer-api", "android-app", "desktop-app", "tests", "docs", "test-results", "playwright-report", "artifacts", "PREVIEWS"
]);
const arquivosForaDoSite = new Set([
    "package.json", "package-lock.json", "firebase.json", "firestore.rules",
    "firestore.indexes.json", "storage.rules", "playwright.config.js", "firebase.test.json"
]);
const extensoesForaDoSite = new Set([".md", ".ps1", ".patch", ".log", ".py", ".sql"]);
// .txt fica de fora por padrão (LEIA-ME e afins), menos os que o site precisa servir
const txtQueVaoProSite = new Set(["robots.txt", "security.txt"]);

function listar(dir, base = "") {
    const saida = [];
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        if (item.name.startsWith(".") && item.name !== ".well-known") continue;
        // atalho/symlink (node_modules do pnpm, por exemplo) nao entra no site
        if (item.isSymbolicLink()) continue;
        const rel = base ? `${base}/${item.name}` : item.name;
        if (item.isDirectory()) {
            if (foraDoSite.has(item.name)) continue;
            saida.push(...listar(path.join(dir, item.name), rel));
        } else {
            if (arquivosForaDoSite.has(item.name)) continue;
            if (extensoesForaDoSite.has(path.extname(item.name))) continue;
            if (path.extname(item.name) === ".txt" && !txtQueVaoProSite.has(item.name)) continue;
            saida.push(rel);
        }
    }
    return saida;
}

// ---------- 1. limpa e copia ----------
fs.rmSync(saida, { recursive: true, force: true });
fs.mkdirSync(saida, { recursive: true });

const todos = listar(raiz);
for (const rel of todos) {
    const destino = path.join(saida, rel);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.copyFileSync(path.join(raiz, rel), destino);
}
console.log(`copiados ${todos.length} arquivos para dist/`);

// ---------- 2. descobre as entradas a partir dos <script src> ----------
const entradas = new Set();
for (const rel of todos.filter(f => f.endsWith(".html"))) {
    const html = fs.readFileSync(path.join(raiz, rel), "utf8");
    const pasta = path.posix.dirname(rel);
    for (const m of html.matchAll(/<script[^>]*src="([^"]+\.js(?:\?[^"]*)?)"/g)) {
        const src = m[1].split("?")[0];
        const alvo = path.posix.normalize(pasta === "." ? src : `${pasta}/${src}`);
        if (fs.existsSync(path.join(raiz, alvo))) entradas.add(alvo);
    }
}
// o service worker não é módulo: entra como script clássico
const temServiceWorker = todos.includes("service-worker.js");
console.log(`${entradas.size} páginas para empacotar`);

// ---------- 3. empacota ----------
let bytesAntes = 0, bytesDepois = 0;

for (const entrada of [...entradas, ...(temServiceWorker ? ["service-worker.js"] : [])]) {
    const origem = path.join(raiz, entrada);
    const destino = path.join(saida, entrada);
    const ehServiceWorker = entrada === "service-worker.js";

    bytesAntes += fs.statSync(origem).size;

    const resultado = await esbuild.build({
        entryPoints: [origem],
        bundle: true,
        write: false,
        format: ehServiceWorker ? "iife" : "esm",
        target: "es2022",
        minify: true,
        legalComments: "none",
        // as importações do Firebase vêm da CDN e precisam continuar externas
        external: ["https://*", "http://*"]
    });

    const empacotado = resultado.outputFiles[0].text;
    const ofuscado = empacotado; // minificação suficiente; ofuscação não aumenta segurança

    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, ofuscado);
    bytesDepois += Buffer.byteLength(ofuscado);
}

// ---------- 4. remove os módulos que viraram parte dos pacotes ----------
// Depois do bundle, um arquivo importado por outro não é mais pedido pelo
// navegador. Deixá-lo em dist/ seria publicar o fonte legível ao lado do
// pacote ofuscado, que é o oposto do que este build faz.
const importadosSomente = todos.filter(f =>
    f.endsWith(".js") &&
    !entradas.has(f) &&
    f !== "service-worker.js"
);
for (const rel of importadosSomente) {
    fs.rmSync(path.join(saida, rel), { force: true });
}
if (importadosSomente.length) {
    console.log(`removidos de dist/ (já estão dentro dos pacotes): ${importadosSomente.join(", ")}`);
}

const kb = n => (n / 1024).toFixed(0);
console.log(`\njavascript: ${kb(bytesAntes)} KB de fonte -> ${kb(bytesDepois)} KB empacotado e minificado`);
console.log("dist/ pronto. O fonte no repositório continua legível.");

// Nome de painel aleatório é camada complementar. As APIs continuam negando
// acesso sem UID, MFA, reautenticação e JWT Access verificado.
const adminPath = `${BigInt('0x'+randomBytes(24).toString('hex')).toString(10)}.html`;
const adminSource = path.join(saida,'admin.html');
if(fs.existsSync(adminSource)){
  fs.renameSync(adminSource,path.join(saida,adminPath));
  fs.mkdirSync(path.join(raiz,'.local'),{recursive:true});
  fs.writeFileSync(path.join(raiz,'.local','admin-route.json'),JSON.stringify({path:adminPath},null,2),{mode:0o600});
}

# Executar a validação após 6052659 — Windows / VS Code

Use uma pasta nova e a branch codex/v69-phase1-local. 6052659 deve continuar ancestral; esta revisão acrescenta correções sem reescrever o histórico. Não usar main, deploy, Firebase login, contas/dados reais ou credenciais de produção para os testes.

Pré-requisitos: Git, VS Code, Node 24.19.0, Node 20.20.2 (Functions), Java 21 e Python 3.11+. As instruções de instalação estão em ../final/WINDOWS-VSCODE.md. Nesta revisão, use o clone abaixo em vez de restaurar um bundle antigo, que contém o código anterior ao ajuste S03.

```powershell
git clone --single-branch --branch codex/v69-phase1-local https://github.com/Gabomgames/SG.git SG-validacao
if ($LASTEXITCODE -ne 0) { throw "Clone falhou." }
Set-Location SG-validacao
git fsck --full
if ($LASTEXITCODE -ne 0) { throw "Integridade Git reprovada." }
git merge-base --is-ancestor 605265933686b64bbbfd5334a166c2231d9c5c9d HEAD
if ($LASTEXITCODE -ne 0) { throw "6052659 não foi preservado." }
code .
nvm use 24.19.0
npm.cmd ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "Instalação web falhou." }
nvm use 20.20.2
npm.cmd ci --prefix functions --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "Instalação Functions falhou." }
foreach ($TesteFunctions in @("tests/founders.test.mjs", "tests/founders-client.test.mjs", "tests/founders-mirror.test.mjs")) {
    node $TesteFunctions
    if ($LASTEXITCODE -ne 0) { throw "Falha em $TesteFunctions" }
}
nvm use 24.19.0
npx.cmd playwright install chromium
if ($LASTEXITCODE -ne 0) { throw "Chromium indisponível; navegador continua pendente." }
npm.cmd run validate:phase1
$Resultado = $LASTEXITCODE
Write-Host "Exit da validação completa: $Resultado"
```

O agregador executa build, verificadores, regressões, segurança/planejamento S03, domínio dos Fundadores, SQL, D1/R2 e os quatro gates de integração. Não executa push, merge, deploy ou cobranças.

Para repetir apenas os gates pendentes:

```powershell
npm.cmd run validate:phase1 -- --only firestore
npm.cmd run validate:phase1 -- --only security-s01
npm.cmd run validate:phase1 -- --only founders-emulator
npm.cmd run validate:phase1 -- --only browser
```

Runners: primeira suíte inicia Firestore+Storage em demo-sg, 127.0.0.1:8085/9199; outras duas iniciam só Firestore; Chromium tem 26 casos, preview 127.0.0.1:4173 e fixtures que bloqueiam tráfego externo não previsto. Nunca remover os guards nem trocar o projeto demo pelo projeto real. Instalação/listagem/preflight não são testes de produto aprovados.

Um resultado válido para o aceite exige uma execução completa da mesma árvore com exit 0, completePhase1Run true, allSelectedGatesPassed true e todos os sete gates passed. Registre results.json/logs em artifacts/phase1-*, compare inputSha256, preserve traces e screenshots e revise qualquer reprovação. Exit 78 ou blocked significa não executado. Uma falha de asserção ou compilação de regra deve ser registrada como reprovada.

S03 real não é resolvido por rodar os emuladores. Use S03-INVENTARIO-E-PLANO.md para preparar os metadados e as precondições. Não revogar tokens reais sem autorização separada.

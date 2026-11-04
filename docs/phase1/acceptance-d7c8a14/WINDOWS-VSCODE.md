# Executar a validação real no Windows / VS Code

A rodada desta instância ficou bloqueada. Este procedimento foi preparado a partir dos runners portáveis, mas não foi executado em Windows nesta tarefa. Use uma pasta de teste nova, sem credenciais/dados reais, e mantenha o projeto demo-sg dos scripts. Não executar deploy, merge, Firebase login, cobranças ou revogações reais.

## Pré-requisitos

Git, VS Code, nvm-windows, Java 21 e Python 3.11+. Caso faltem, estes são os identificadores dos instaladores winget:

```powershell
winget install --exact --id Git.Git
winget install --exact --id Microsoft.VisualStudioCode
winget install --exact --id CoreyButler.NVMforWindows
winget install --exact --id Microsoft.OpenJDK.21
winget install --exact --id Python.Python.3.13
```

Reabra o terminal após instalar. Resolva eventual conflito entre Node independente e nvm-windows conforme o instalador, sem apagar projetos. Confira Java 21/JAVA_HOME e instale as versões fixadas:

```powershell
git --version
java -version
py -3 --version
nvm install 24.19.0
nvm install 20.20.2
```

## Obter a branch e conferir o histórico

O repositório privado exige seu acesso normal ao GitHub; não colocar tokens nos comandos ou no projeto.

```powershell
git clone --single-branch --branch codex/v69-phase1-local https://github.com/Gabomgames/SG.git SG-validacao-fase1
if ($LASTEXITCODE -ne 0) { throw "Clone falhou." }
Set-Location SG-validacao-fase1
git fsck --full
if ($LASTEXITCODE -ne 0) { throw "Integridade Git reprovada." }
git merge-base --is-ancestor d7c8a14999549eeb5b8568e2597e2a111a20e106 HEAD
if ($LASTEXITCODE -ne 0) { throw "Referência d7c8a14 não preservada." }
git log -1 --oneline
code .
```

Esta entrega acrescenta apenas documentação. Se futuramente a branch contiver novas mudanças de implementação, a execução pertencerá ao novo commit e deverá ter seus próprios hashes/resultados.

## Instalar e executar os testes de Functions

```powershell
nvm use 24.19.0
if ((node --version) -ne "v24.19.0") { throw "Node web incorreto." }
npm.cmd ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "Instalação web falhou." }
nvm use 20.20.2
npm.cmd ci --prefix functions --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "Instalação Functions falhou." }
foreach ($Teste in @("tests/founders.test.mjs", "tests/founders-client.test.mjs", "tests/founders-mirror.test.mjs")) {
    node $Teste
    if ($LASTEXITCODE -ne 0) { throw "Teste reprovado: $Teste" }
}
node -e "require('./functions/index.js'); console.log('Exports carregados localmente.');"
if ($LASTEXITCODE -ne 0) { throw "Functions não carregaram." }
nvm use 24.19.0
```

Não usar --experimental-test-isolation=none no Node 20; os scripts Node 24 já incluem essa opção quando necessária. npm.cmd/npx.cmd evitam o bloqueio dos scripts PowerShell do npm, sem alterar a política de execução.

## Chromium oficial e três suítes Firebase/Storage

Feche apenas servidores de teste seus que ocupem 8085, 9199 ou 4173; não encerre processos desconhecidos. Os runners iniciam/param os emuladores sequencialmente. Não substitua seus hosts, portas, projeto ou arquivo firebase.test.json.

```powershell
npx.cmd playwright install chromium
if ($LASTEXITCODE -ne 0) { throw "Download oficial bloqueado; navegador continua pendente." }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "Build reprovado." }
npx.cmd playwright test --list
# Esperado nesta revisão: 26 casos. Listagem não é execução.

npm.cmd run validate:phase1 -- --only firestore
$Firebase = $LASTEXITCODE
npm.cmd run validate:phase1 -- --only security-s01
$Seguranca = $LASTEXITCODE
npm.cmd run validate:phase1 -- --only founders-emulator
$Fundadores = $LASTEXITCODE
npm.cmd run validate:phase1 -- --only browser
$Browser = $LASTEXITCODE
Write-Host "Gates: Firebase=$Firebase S01-S02=$Seguranca Fundadores=$Fundadores Chromium=$Browser"
```

Comandos diretos equivalentes: npm.cmd run test:rules; npm.cmd run test:rules:security; npm.cmd run test:rules:founders; npm.cmd run test:e2e. A primeira suíte inicia Firestore+Storage; as demais usam Firestore. A .firebaserc histórica aponta ao projeto real, mas os runners fixam demo-sg explicitamente; não trocar esses scripts por firebase emulators:exec sem projeto/config.

Se a instalação do Chromium falhar, as três suítes Firebase ainda podem ser executadas independentemente; o gate browser continuará bloqueado. Não repetir downloads indefinidamente: preserve a primeira falha completa e ajuste a liberação normal da rede. Nunca desativar TLS/proxy, usar binários alternativos ou alterar checksums.

## Execução completa e coleta

Após os quatro gates necessários estarem disponíveis, execute uma validação completa sobre a mesma árvore:

```powershell
npm.cmd run validate:phase1
$Resultado = $LASTEXITCODE
$Evidencias = Get-ChildItem artifacts -Directory -Filter "phase1-*" |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
Get-Content (Join-Path $Evidencias.FullName "results.json")
Write-Host "Exit=$Resultado; evidências=$($Evidencias.FullName)"
git status --short
```

O agregador registra logs e status independentes em artifacts/phase1-*/. Para o aceite: exit 0, completePhase1Run true, allSelectedGatesPassed true, todos os sete gates passed e os 26 casos de navegador executados/aprovados. Compare inputSha256 com o código avaliado. Bloqueado/78 significa não executado; asserção reprovada ou regra que não compila é reprovação, não bloqueio. Preserve traces/screenshots de falhas para análise.

Se persistir falha de rede, registre o erro oficial do JAR storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.22.0.jar ou a saída do instalador Playwright, sem contornar a política. Java deve ser 21. Get-NetTCPConnection -State Listen -LocalPort 8085,9199,4173 ajuda a identificar conflitos de portas.

## S03 somente sintético nesta etapa

```powershell
node scripts/legacy-token-plan.mjs docs/phase1/validation-6052659/inventory.synthetic.example.json
```

Esse exemplo gera somente inventário/plano locais em .local/, com dados falsos e pendências deliberadas. Não é prova de inventário real completo. Os testes de tokens no Storage Emulator não revogam tokens de produção e não comprovam IAM/precondições GCS reais. Siga ../validation-6052659/S03-INVENTARIO-E-PLANO.md para preparar exportação de leitura previamente autorizada; não enviar valores de tokens ao chat ou Git. O desconhecido continua desconhecido, não zero.

Os resultados locais devem ser submetidos à revisão antes de encerrar a Fase 1. Nenhuma execução desta sequência autoriza Fase 2, deploy, merge, cobranças, ativação dos Fundadores ou revogação real.

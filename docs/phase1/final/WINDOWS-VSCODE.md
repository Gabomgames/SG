# Concluir a validação no Windows / VS Code

Use uma cópia de teste separada, sem dados/segredos reais. Os comandos abaixo não fazem login, push, merge, deploy ou cobrança. Foram preparados a partir dos runners portáveis exercitados em Linux; Windows nativo ainda não foi executado nesta tarefa. O pacote só deverá ser baixado por link GitHub confirmado depois de envio autorizado; não há link disponível nesta entrega.

## Pré-requisitos

PowerShell no terminal integrado do VS Code. Instale Git, VS Code, nvm-windows, Java 21 e Python 3.11+ caso faltem. Exemplo com winget; reabra o terminal após instalar:

```powershell
winget install --exact --id Microsoft.VisualStudioCode
winget install --exact --id Git.Git
winget install --exact --id CoreyButler.NVMforWindows
winget install --exact --id Microsoft.OpenJDK.21
winget install --exact --id Python.Python.3.13
```

Resolva eventual conflito entre uma instalação independente de Node e nvm-windows conforme o instalador, sem excluir projetos. Ative as versões fixadas:

```powershell
git --version
java -version
py -3 --version
py -3 -c "import sqlite3; print(sqlite3.sqlite_version)"
nvm install 24.19.0
nvm install 20.20.2
nvm use 24.19.0
node --version
npm.cmd --version
```

Java precisa ser 21 e Node web/Worker precisa ser 24.19.0. Se necessário, ajuste JAVA_HOME/PATH para o Java instalado e reabra o terminal. `npm.cmd`/`npx.cmd` evitam o bloqueio de scripts npm.ps1; não é necessário desativar a política do PowerShell.

## Restaurar o bundle com histórico

Depois de extrair o ZIP em diretório novo, ajuste apenas `$Pacote` abaixo. A pasta extraída contém `projeto`, `backup/repository-phase1-final.bundle`, `dist-verificado`, `evidencias` e artefatos anteriores. Não use reset/clean sobre trabalho seu.

```powershell
$Pacote = "C:\SG\SG-Fase1-Final-release"
$Projeto = Join-Path $Pacote "SG-restaurado"
$Bundle = Join-Path $Pacote "backup\repository-phase1-final.bundle"
Get-FileHash -Algorithm SHA256 $Bundle
# Compare com CHECKSUMS.json da entrega, antes de restaurar.
git clone --branch codex/v69-phase1-local $Bundle $Projeto
if ($LASTEXITCODE -ne 0) { throw "Falha ao restaurar o bundle." }
git -C $Projeto fsck --full
if ($LASTEXITCODE -ne 0) { throw "Histórico inválido." }
git -C $Projeto bundle verify $Bundle
if ($LASTEXITCODE -ne 0) { throw "Bundle inválido." }
foreach ($CommitPreservado in @("9445442", "a797418")) {
    git -C $Projeto cat-file -e "$CommitPreservado^{commit}"
    if ($LASTEXITCODE -ne 0) { throw "Commit preservado ausente." }
    git -C $Projeto merge-base --is-ancestor $CommitPreservado HEAD
    if ($LASTEXITCODE -ne 0) { throw "Ancestralidade não preservada." }
}
Set-Location $Projeto
code .
```

O origin do clone será o arquivo bundle. Isso não envia nada ao GitHub. O ZIP inclui as fontes para consulta, mas o clone acima é a cópia de teste com histórico recuperável.

## Instalar pelos lockfiles

```powershell
nvm use 24.19.0
if ((node --version) -ne "v24.19.0") { throw "Ative Node 24.19.0." }
npm.cmd ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "Instalação web/Worker falhou." }
nvm use 20.20.2
npm.cmd ci --prefix functions --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "Instalação Functions falhou." }
foreach ($TesteFunctions in @("tests/founders.test.mjs", "tests/founders-client.test.mjs", "tests/founders-mirror.test.mjs")) {
    node $TesteFunctions
    if ($LASTEXITCODE -ne 0) { throw "Teste Functions/domínio falhou: $TesteFunctions" }
}
node -e "require('./functions/index.js'); console.log('Exports carregados localmente.');"
if ($LASTEXITCODE -ne 0) { throw "Functions não carregaram." }
nvm use 24.19.0
```

Não copie `.env`, `.dev.vars`, service accounts, tokens nem credenciais Firebase reais. Não execute firebase login nem os scripts deploy. A `.firebaserc` legada aponta para o projeto real; os runners de teste ignoram esse default e fixam `--project demo-sg`. Não substitua esses runners por comandos sem projeto/config explícitos.

## Baixar ferramentas oficiais e rodar os quatro gates pendentes

Mantenha livres as portas locais 8085 (Firestore), 9199 (Storage) e 4173 (preview Chromium). Feche apenas servidores seus antes de testar; não encerre processos desconhecidos. Os emuladores iniciam/param automaticamente em cada suíte, que deve rodar sequencialmente.

```powershell
nvm use 24.19.0
npx.cmd playwright install chromium
if ($LASTEXITCODE -ne 0) { throw "Download oficial do Chromium falhou; navegador continua pendente." }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "Build falhou." }
npx.cmd playwright test --list
# Esperado: 26 casos. Listagem não é execução nem aprovação.

npm.cmd run validate:phase1 -- --only firestore
$RegressaoFirebase = $LASTEXITCODE
npm.cmd run validate:phase1 -- --only security-s01
$SegurancaFirebase = $LASTEXITCODE
npm.cmd run validate:phase1 -- --only founders-emulator
$FundadoresFirebase = $LASTEXITCODE
npm.cmd run validate:phase1 -- --only browser
$Chromium = $LASTEXITCODE
Write-Host "Gates: Firebase=$RegressaoFirebase S01-S02=$SegurancaFirebase Fundadores=$FundadoresFirebase Chromium=$Chromium"
```

Mapeamento exato:

| Gate | Comando direto equivalente | O que deve ser comprovado |
|---|---|---|
| firestore | `npm.cmd run test:rules` | Regressões Firestore e 3 casos Storage (nega uploads, preserva leitura pública antiga, demonstra revogação local de token) |
| security-s01 | `npm.cmd run test:rules:security` | Matriz S01, recibos S02 e commit REST administrativo no Firestore real |
| founders-emulator | `npm.cmd run test:rules:founders` | Concorrência transacional real, máximo 50, duplicidade/ordem/riscos e espelho pago |
| browser | `npm.cmd run test:e2e` | Preflight e execução dos 26 casos Chromium com fixtures e rede externa bloqueada |

O runner inicia Firebase CLI 15.33.0 instalada no lockfile, que baixa o JAR oficial automaticamente. Primeira suíte: `firestore,storage`, projeto `demo-sg`, configuração `firebase.test.json`, hosts fixos 127.0.0.1:8085/9199. Demais suítes: só Firestore. O teste rejeita caminhos/hosts/portas/projetos alternativos. Não há Auth Emulator: identidades são fixtures; transações/regras usam o Firestore real local.

**Exit 78 ou status blocked significa NÃO EXECUTADO.** Exit 1 do agregador significa que algum gate falhou/está bloqueado. Falha de asserção, regra que não compila ou controle positivo negado é REPROVAÇÃO, não bloqueio de download. Não edite testes para forçar aprovação. Corrija a implementação e repita os gates afetados.

## Validação completa e evidências finais

Após resolver os quatro gates acima, faça uma execução única de todos os gates sobre a mesma árvore de código:

```powershell
npm.cmd run validate:phase1
$ValidacaoCompleta = $LASTEXITCODE
$PastaEvidencias = Get-ChildItem artifacts -Directory -Filter "phase1-*" |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
Get-Content (Join-Path $PastaEvidencias.FullName "results.json")
Write-Host "Validação completa: exit $ValidacaoCompleta; evidências em $($PastaEvidencias.FullName)"
git status --short
```

Aprovação exige exit 0, `completePhase1Run:true`, `allSelectedGatesPassed:true`, todos os sete gates `passed` e 26 casos de navegador aprovados. Compare `inputSha256` com os arquivos da cópia testada. Envie os logs e results.json reais para revisão antes do aceite; preserve traces/screenshots de falhas em artifacts/test-results. Não some os 16 repetidos em Node 20 como testes distintos.

## Se continuar bloqueado no PC

- Mensagem de JAR: consulte `artifacts/phase1-*/firestore.log` e verifique acesso HTTPS oficial a `storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.22.0.jar`. Storage também usa artefato oficial do Firebase; mantenha o erro completo caso esse download falhe depois do Firestore.
- Chromium: preserve a saída de `npx.cmd playwright install chromium`. Hosts oficiais incluem `cdn.playwright.dev`; o instalador pode informar outros hosts oficiais/redirecionamentos. Use as liberações normais da sua rede; não desative TLS, verificação de certificados ou proxy.
- Porta ocupada: use `Get-NetTCPConnection -State Listen -LocalPort 8085,9199,4173` para identificar o conflito, feche o serviço de teste correspondente e repita. Não troque o runner para um host remoto.
- Java: confirme `java -version` e JAVA_HOME. O emulador exige Java 21 neste projeto.
- Falha de regra/asserção não é falha de download: encaminhe o log e preserve o resultado reprovado.

Não use IDs reais, billing, dados da comunidade nem credenciais de produção para tentar destravar os testes. As pendências de inventário/revogação de tokens e homologação de IAM/AI estão descritas em `MIGRACAO-LEGADO.md`, exigem ambiente autorizado próprio e não são automaticamente resolvidas pelos testes locais.

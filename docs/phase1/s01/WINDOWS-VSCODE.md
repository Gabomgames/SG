# Fase 1 / S01 — Windows com VS Code

Este procedimento é para um diretório de teste separado. Não executa deploy, push, merge, cobranças, login real nem alterações de produção. O download do projeto será entregue exclusivamente no GitHub quando o envio for possível e autorizado; não há URL de artefato enviada nesta tarefa.

As instruções abaixo foram preparadas para PowerShell no Windows. O código portátil foi testado em Linux nesta instância; nenhuma execução nativa Windows foi realizada aqui. Envie os resultados reais da execução Windows antes de considerá-la comprovada.

## 1. Instalar pré-requisitos

Se já estiverem instalados, apenas confirme as versões. Para instalações via winget, abra um PowerShell com as permissões exigidas pelos instaladores:

```powershell
winget install --exact --id Microsoft.VisualStudioCode
winget install --exact --id Git.Git
winget install --exact --id CoreyButler.NVMforWindows
winget install --exact --id Microsoft.OpenJDK.21
winget install --exact --id Python.Python.3.13
```

Feche e reabra o terminal depois das instalações. Não mantenha servidores Node em execução ao trocar a versão com nvm-windows. Se houver uma instalação independente antiga de Node, resolva o conflito conforme as instruções do nvm-windows, sem excluir projetos.

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

Node 24.19.0 é o runtime web/Worker fixado. Node 20.20.2 valida as Functions, cujo engines.node permanece 20. Java deve ser 21; se o comando ainda localizar outro Java, corrija JAVA_HOME/PATH para a instalação 21 e reabra o terminal. Python 3.11+ é necessário aos 11 testes SQL; o runner escolhe py -3, python ou python3 no Windows. Nenhum banco externo é usado.

## 2. Restaurar o pacote em diretório novo

Extraia o pacote completo recebido pelo GitHub numa pasta sem alterações suas. O projeto está em projeto; o bundle atualizado está em backup/repository-s01.bundle. É preferível restaurar o Git pelo bundle para ter histórico e evidência de ancestralidade:

```powershell
$Pacote = "C:\SG\Something-Gamer-Fase1-S01"
$Projeto = Join-Path $Pacote "SG-restaurado"
git clone --branch codex/v69-phase1-local (Join-Path $Pacote "backup\repository-s01.bundle") $Projeto
if ($LASTEXITCODE -ne 0) { throw "Clone do bundle falhou." }
git -C $Projeto fsck --full
if ($LASTEXITCODE -ne 0) { throw "Histórico Git inválido." }
git -C $Projeto cat-file -e "9445442^{commit}"
if ($LASTEXITCODE -ne 0) { throw "Commit 9445442 ausente." }
git -C $Projeto merge-base --is-ancestor 9445442 HEAD
if ($LASTEXITCODE -ne 0) { throw "9445442 não é ancestral de HEAD." }
git -C $Projeto bundle verify (Join-Path $Pacote "backup\repository-s01.bundle")
if ($LASTEXITCODE -ne 0) { throw "Bundle inválido." }
Set-Location $Projeto
code .
```

O clone de um bundle usa o arquivo local como origin; isso não autoriza nem efetua envio ao GitHub. Não execute reset --hard ou clean sobre trabalho existente. O arquivo ZIP anterior e o bundle 9445442 permanecem preservados separadamente no backup do pacote. O projeto atualizado não contém o antigo link de node_modules específico da nuvem.

## 3. Instalar pelos lockfiles

No terminal PowerShell integrado do VS Code:

```powershell
nvm use 24.19.0
if ((node --version) -ne "v24.19.0") { throw "Ative Node 24.19.0." }
npm.cmd ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "Instalação web/Worker falhou." }
nvm use 20.20.2
if ((node --version) -ne "v20.20.2") { throw "Ative Node 20.20.2." }
npm.cmd ci --prefix functions --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "Instalação Functions falhou." }
node tests/founders.test.mjs
if ($LASTEXITCODE -ne 0) { throw "Domínio dos fundadores falhou." }
node tests/founders-client.test.mjs
if ($LASTEXITCODE -ne 0) { throw "Sincronização dos fundadores falhou." }
node tests/founders-mirror.test.mjs
if ($LASTEXITCODE -ne 0) { throw "Espelho pago/promocional falhou." }
nvm use 24.19.0
node --version
```

Use npm.cmd/npx.cmd para não depender da política de execução do npm.ps1. Não desative TLS, validação de certificados ou integridade de pacotes. Se um addon nativo falhar em node-gyp, instale as ferramentas C++ oficiais e tente novamente a instalação; não ignore o erro:

```powershell
winget install --exact --id Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Reabra o terminal, confirme Node 24.19.0 e repita npm.cmd ci. Guarde o log da falha e da correção.

## 4. Instalar o navegador oficial

```powershell
npx.cmd playwright install chromium
if ($LASTEXITCODE -ne 0) { Write-Warning "Chromium não foi instalado; o gate de navegador continuará bloqueado." }
```

A instalação deve usar os destinos oficiais informados pelo Playwright. O pretest executa um lançamento real e fecha o Chromium sem abrir o app; se faltar binário/dependência, retorna 78. Esse preflight não conta como teste do produto. No Windows não se usa a opção Linux --with-deps.

## 5. Executar todos os gates e preservar os resultados

```powershell
npm.cmd run validate:phase1
$CodigoValidacao = $LASTEXITCODE
Write-Host "Código geral: $CodigoValidacao"
$Resultado = Get-ChildItem -Path artifacts\phase1-*\results.json | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $Resultado) { throw "Nenhum resultado foi gerado; confira os pré-requisitos." }
Get-Content -Raw $Resultado.FullName
```

O runner executa dependencies, fast, runtime, firestore, security-s01, founders-emulator e browser. Não encerra no primeiro gate bloqueado: registra o exit code e o log de cada um num diretório novo artifacts/phase1-*. O resultado geral é 1 se qualquer gate falhar ou ficar bloqueado. results.json registra versões, commit/árvore suja, hashes dos arquivos de entrada e estados passed/failed/blocked. Um resultado de seleção parcial não aprova a Fase 1.

A comparação dos hashes entre plataformas deve considerar a conversão de finais de linha do Git: os hashes registram os bytes efetivamente testados. Preserve os logs, o commit e os arquivos correspondentes; não altere asserts para obter aprovação.

Comandos individuais para diagnóstico:

```powershell
npm.cmd run audit:high
npm.cmd run check:fast
npm.cmd run test:runtime
npm.cmd run test:rules
npm.cmd run test:rules:security
npm.cmd run test:rules:founders
npm.cmd run build
npm.cmd run test:e2e
```

As três suítes Firestore devem ser executadas sequencialmente, nunca em paralelo no mesmo projeto/porta. O runner fixa demo-sg e 127.0.0.1:8085, valida os caminhos das regras e desativa a UI. Não usa credenciais de produção e não exige firebase login. Os testes limpam apenas o banco do emulador demo. O teste backend dos fundadores usa transações Firestore reais com identidades Auth sintéticas; não homologa Auth/App Check remoto.

O navegador usa apenas o build local em 127.0.0.1:4173, servido pelo Node. Não requer Python para servir o site. Nenhum servidor anterior é reutilizado, e a suíte bloqueia requisições externas não simuladas. A descoberta lista 26 casos; essa listagem não significa que foram executados.

## 6. Quando houver bloqueio

- JAR: o Firebase CLI precisa alcançar storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.22.0.jar. Um erro de download produz blocked/78 antes da suíte; não é aprovação das regras.
- Chromium: libere os hosts oficiais mostrados pelo instalador (incluindo cdn.playwright.dev e eventuais destinos oficiais de redirecionamento, como storage.googleapis.com) pela política da rede. Não troque rotas/mirrors para contornar uma negativa.
- Codex Cloud: revise/salve/publique a configuração do ambiente com os domínios já registrados no rascunho; isso é publicação do ambiente, não do site. Esta instância continuava na revisão 1.
- Porta ocupada: identifique qual processo seu usa 8085/4173 e feche somente o servidor de teste iniciado por você. Não use outra porta sem revisar em conjunto configuração e guardas.
- Falha de regra ou asserção com JAR disponível: guarde o log e o trace. É falha real até diagnóstico; não marque como bloqueio de rede.

## 7. Encerramento

Envie results.json, todos os logs da execução, runtime e SHA Git para revisão. Veja CRITERIOS-ACEITE.md e SEGURANCA.md. Mesmo com todos os comandos aprovados, a existência de riscos altos/críticos sem tratamento ou a falta de aprovação explícita impede o aceite. A promoção dos 50 Fundadores permanece desativada. Não há nenhum comando de deploy, push, merge ou ativação neste procedimento.

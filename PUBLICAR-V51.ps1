$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $raiz

Write-Host "[1/4] Conferindo o projeto..." -ForegroundColor Cyan
npm run verificar

Write-Host "[2/4] Gerando a versão de produção..." -ForegroundColor Cyan
npm run build

Write-Host "[3/4] Publicando Worker..." -ForegroundColor Cyan
Push-Location ".\something-gamer-api"
try { npx wrangler deploy } finally { Pop-Location }

Write-Host "[4/4] Publicando site e regras..." -ForegroundColor Cyan
firebase deploy --only hosting,firestore:rules,firestore:indexes --project something-gamer

Write-Host "V51 publicada com sucesso: https://something-gamer.web.app" -ForegroundColor Green

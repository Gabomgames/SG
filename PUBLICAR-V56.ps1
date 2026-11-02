$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $raiz

Write-Host "[1/6] Preparando dependências..." -ForegroundColor Cyan
if (-not (Test-Path ".\node_modules\esbuild")) { npm ci }

Write-Host "[2/6] Conferindo o projeto..." -ForegroundColor Cyan
npm run verificar

Write-Host "[3/6] Gerando dist de produção..." -ForegroundColor Cyan
npm run build

Write-Host "[4/6] Conferindo Functions..." -ForegroundColor Cyan
Push-Location ".\functions"
try { if (-not (Test-Path ".\node_modules")) { npm ci } } finally { Pop-Location }

Write-Host "[5/6] Publicando Cloudflare Worker..." -ForegroundColor Cyan
Push-Location ".\something-gamer-api"
try { npx wrangler deploy } finally { Pop-Location }

Write-Host "[6/6] Publicando Firebase (site, regras, storage e functions)..." -ForegroundColor Cyan
firebase deploy --only hosting,firestore:rules,firestore:indexes,storage,functions --project something-gamer

Write-Host "V56 publicada: https://something-gamer.web.app" -ForegroundColor Green

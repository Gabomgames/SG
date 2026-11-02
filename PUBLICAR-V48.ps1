param(
  [switch]$SemWorker,
  [switch]$SemFunctions
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "[1/5] Conferindo o projeto..." -ForegroundColor Cyan
npm run verificar

Write-Host "[2/5] Gerando a versao de producao..." -ForegroundColor Cyan
npm run build

if (-not $SemWorker) {
  Write-Host "[3/5] Publicando o Worker (reCAPTCHA, GIFs, midia e acesso admin)..." -ForegroundColor Cyan
  Push-Location ".\something-gamer-api"
  try { npx wrangler deploy } finally { Pop-Location }
} else {
  Write-Host "[3/5] Worker ignorado por opcao." -ForegroundColor Yellow
}

if (-not $SemFunctions) {
  Write-Host "[4/5] Publicando Firebase Functions (painel admin, Steam e verificacao)..." -ForegroundColor Cyan
  firebase deploy --only functions --project something-gamer
} else {
  Write-Host "[4/5] Functions ignoradas por opcao." -ForegroundColor Yellow
}

Write-Host "[5/5] Publicando site, regras, indices e Storage..." -ForegroundColor Cyan
firebase deploy --only hosting,firestore:rules,firestore:indexes,storage --project something-gamer

Write-Host "V48 publicada. Abra https://something-gamer.web.app e pressione Ctrl+Shift+R uma vez." -ForegroundColor Green

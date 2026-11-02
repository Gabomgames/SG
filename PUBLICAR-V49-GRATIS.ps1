param(
    [switch]$SomenteTeste
)

$ErrorActionPreference = "Stop"
$Raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Raiz

Write-Host "[1/4] Conferindo o projeto..." -ForegroundColor Cyan
npm run verificar
npm run build

if ($SomenteTeste) {
    Write-Host "Build concluido. Nada foi publicado." -ForegroundColor Yellow
    exit 0
}

Write-Host "[2/4] Publicando o Worker gratuito..." -ForegroundColor Cyan
Push-Location (Join-Path $Raiz "something-gamer-api")
try {
    npx wrangler deploy
} finally {
    Pop-Location
}

Write-Host "[3/4] Publicando regras e indices do Firestore..." -ForegroundColor Cyan
firebase deploy --only firestore:rules,firestore:indexes --project something-gamer

Write-Host "[4/4] Publicando o site..." -ForegroundColor Cyan
firebase deploy --only hosting --project something-gamer

Write-Host "V50 publicada com Mercado Pago, sem Firebase Functions e sem exigir o plano Blaze." -ForegroundColor Green
Write-Host "Abra https://something-gamer.web.app e use Ctrl+F5 para limpar a versao antiga." -ForegroundColor Green

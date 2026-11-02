$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $raiz

Write-Host "[1/7] Preparando dependencias..." -ForegroundColor Cyan
if (-not (Test-Path ".\node_modules\esbuild")) { npm ci }

Write-Host "[2/7] Conferindo o projeto..." -ForegroundColor Cyan
npm run verificar

Write-Host "[3/7] Gerando dist de producao..." -ForegroundColor Cyan
npm run build

Write-Host "[4/7] Conferindo Functions..." -ForegroundColor Cyan
Push-Location ".\functions"
try { if (-not (Test-Path ".\node_modules")) { npm ci } } finally { Pop-Location }

Write-Host "[5/7] Conferindo secrets TURN do Worker..." -ForegroundColor Cyan
Push-Location ".\something-gamer-api"
try {
    $secrets = (npx wrangler secret list 2>$null | Out-String)
    if ($secrets -notmatch "CLOUDFLARE_TURN_KEY_ID" -or $secrets -notmatch "CLOUDFLARE_TURN_KEY_API_TOKEN") {
        Write-Host "ATENCAO: configure CLOUDFLARE_TURN_KEY_ID e CLOUDFLARE_TURN_KEY_API_TOKEN antes de usar TURN em producao." -ForegroundColor Yellow
        Write-Host "Veja CONFIGURAR-TURN-V57-PRO.md" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Nao foi possivel listar os secrets. Confira CONFIGURAR-TURN-V57-PRO.md." -ForegroundColor Yellow
}

Write-Host "[6/7] Publicando Cloudflare Worker..." -ForegroundColor Cyan
try { npx wrangler deploy } finally { Pop-Location }

Write-Host "[7/7] Publicando Firebase (site, regras, storage e functions)..." -ForegroundColor Cyan
firebase deploy --only hosting,firestore:rules,firestore:indexes,storage,functions --project something-gamer

Write-Host "V57 Chat + Call Pro publicada: https://something-gamer.web.app" -ForegroundColor Green

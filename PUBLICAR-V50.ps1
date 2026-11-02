param([switch]$SomenteTeste)
$ErrorActionPreference = "Stop"
$Raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Raiz
npm run verificar
npm run build
if ($SomenteTeste) { Write-Host "V50 validada. Nada foi publicado." -ForegroundColor Yellow; exit 0 }
Push-Location (Join-Path $Raiz "something-gamer-api")
try { npx wrangler deploy } finally { Pop-Location }
firebase deploy --only firestore:rules,firestore:indexes --project something-gamer
firebase deploy --only hosting --project something-gamer
Write-Host "V50 publicada. Abra o site com Ctrl+F5." -ForegroundColor Green

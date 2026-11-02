$ErrorActionPreference = "Stop"
Write-Host "Something Gamer V59 - validando"
npm ci
npm run verificar
npm run build
Write-Host "Publicando Firebase"
firebase deploy --only hosting,firestore:rules,firestore:indexes,storage,functions --project something-gamer
Write-Host "Publicando Worker"
Push-Location something-gamer-api
npm ci
npx wrangler deploy
Pop-Location
Write-Host "V59 publicada."

$ErrorActionPreference = "Stop"
Write-Host "Something Gamer V58.2 - validação e publicação" -ForegroundColor Cyan
npm ci
npm run verificar
npm run build
firebase deploy --only hosting,firestore:rules,firestore:indexes,storage,functions --project something-gamer
Push-Location something-gamer-api
npx wrangler deploy
Pop-Location
Write-Host "Publicação concluída. Teste admin, chat, sanções, amizade e Now Mark com duas contas." -ForegroundColor Green

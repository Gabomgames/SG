param(
  [Parameter(Mandatory=$true)]
  [string]$SiteKey
)

$ErrorActionPreference = 'Stop'
if ($SiteKey.Length -lt 20 -or $SiteKey -match '[\s"''<>]') {
  throw 'Site Key do reCAPTCHA v2 parece inválida.'
}

$config = Join-Path $PSScriptRoot 'config.js'
$texto = Get-Content $config -Raw
$novo = [regex]::Replace($texto, 'recaptchaV2SiteKey:\s*"[^"]*"', 'recaptchaV2SiteKey: "' + $SiteKey + '"')
if ($novo -eq $texto) { throw 'Campo recaptchaV2SiteKey não encontrado em config.js.' }
Set-Content $config $novo -Encoding UTF8
Write-Host 'Site Key pública aplicada em config.js.' -ForegroundColor Green
Write-Host 'Agora, dentro de something-gamer-api, execute: npx wrangler secret put RECAPTCHA_V2_SECRET' -ForegroundColor Yellow

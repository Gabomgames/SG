$ErrorActionPreference = "Stop"
Write-Host "Configurando Java 17 para o Something Gamer..." -ForegroundColor Cyan

$candidates = @(
  "C:\Program Files\Android\Android Studio\jbr",
  "C:\Program Files\Eclipse Adoptium"
)

$jdk = $null
foreach ($base in $candidates) {
  if (Test-Path $base) {
    $jdk = Get-ChildItem $base -Directory -ErrorAction SilentlyContinue |
      Where-Object { Test-Path (Join-Path $_.FullName "bin\java.exe") } |
      Where-Object Name -Match "17|jbr" |
      Select-Object -First 1
    if ($base -Like "*Android Studio*" -and (Test-Path (Join-Path $base "bin\java.exe"))) {
      $jdk = Get-Item $base
    }
    if ($jdk) { break }
  }
}

if (-not $jdk) {
  Write-Host "Java 17 não encontrado. Instalando Temurin 17 pelo winget..." -ForegroundColor Yellow
  winget install EclipseAdoptium.Temurin.17.JDK --accept-package-agreements --accept-source-agreements
  $jdk = Get-ChildItem "C:\Program Files\Eclipse Adoptium" -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -Like "jdk-17*" -and (Test-Path (Join-Path $_.FullName "bin\java.exe")) } |
    Sort-Object Name -Descending | Select-Object -First 1
}

if (-not $jdk) { throw "O Java 17 não foi encontrado após a instalação." }
$javaHome = $jdk.FullName
[Environment]::SetEnvironmentVariable("JAVA_HOME", $javaHome, "User")
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$cleanPath = (($userPath -split ";") | Where-Object { $_ -and $_ -notmatch "\\Java\\|Eclipse Adoptium|Android Studio\\jbr" }) -join ";"
[Environment]::SetEnvironmentVariable("Path", "$javaHome\bin;$cleanPath", "User")
$env:JAVA_HOME = $javaHome
$env:Path = "$javaHome\bin;" + $env:Path

$settings = @{ "java.import.gradle.java.home" = $javaHome; "java.configuration.runtimes" = @(@{ name="JavaSE-17"; path=$javaHome; default=$true }) } | ConvertTo-Json -Depth 5
$settings | Set-Content -Encoding UTF8 ".vscode\settings.json"
Write-Host "Java configurado: $javaHome" -ForegroundColor Green
java -version
Write-Host "Feche e abra o VS Code. Depois abra somente a pasta android-app." -ForegroundColor Cyan

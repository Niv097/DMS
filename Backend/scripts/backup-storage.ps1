param(
  [string]$Source = "",
  [string]$OutputDir = ".\\backups\\storage",
  [string]$Timestamp = (Get-Date -Format "yyyyMMdd_HHmmss")
)

$envFile = Join-Path $PSScriptRoot "..\\.env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match "^\s*#") { return }
    if ($_ -match "^\s*$") { return }
    $parts = $_ -split "=", 2
    if ($parts.Length -eq 2) {
      [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim())
    }
  }
}

if (-not $Source) {
  if ($env:STORAGE_ROOT) {
    $Source = $env:STORAGE_ROOT
  } else {
    $Source = ".\\uploads"
  }
}

if (-not (Test-Path $Source)) {
  throw "Storage source not found: $Source"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$zipPath = Join-Path $OutputDir "dms_storage_$Timestamp.zip"
Compress-Archive -Path (Join-Path $Source "*") -DestinationPath $zipPath -Force
Write-Host "Storage backup created at $zipPath"

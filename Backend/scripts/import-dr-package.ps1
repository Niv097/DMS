param(
  [Parameter(Mandatory = $true)]
  [string]$PackageDir,
  [switch]$RestoreStorage
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

if (-not (Test-Path $PackageDir)) {
  throw "Package directory not found: $PackageDir"
}

$manifestPath = Join-Path $PackageDir "manifest.json"
if (-not (Test-Path $manifestPath)) {
  throw "manifest.json not found in package directory."
}

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$dbFile = Join-Path (Join-Path $PackageDir "db") $manifest.database_backup
if (-not (Test-Path $dbFile)) {
  throw "Database backup file not found: $dbFile"
}

& (Join-Path $PSScriptRoot "restore-db.ps1") -BackupFile $dbFile
if ($LASTEXITCODE -ne 0) {
  throw "Database restore failed."
}

if ($RestoreStorage) {
  $storageZip = Join-Path (Join-Path $PackageDir "storage") $manifest.storage_backup
  if (-not (Test-Path $storageZip)) {
    throw "Storage archive not found: $storageZip"
  }

  if (-not $env:STORAGE_ROOT) {
    throw "STORAGE_ROOT is not configured in .env"
  }

  New-Item -ItemType Directory -Force -Path $env:STORAGE_ROOT | Out-Null
  Expand-Archive -Path $storageZip -DestinationPath $env:STORAGE_ROOT -Force
}

Write-Host "DR package import completed from $PackageDir"

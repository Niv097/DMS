param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile
)

. (Join-Path $PSScriptRoot "postgres-tools.ps1")

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

if (-not $env:DATABASE_URL) {
  throw "DATABASE_URL is not available in environment."
}

if (-not (Test-Path $BackupFile)) {
  throw "Backup file not found: $BackupFile"
}

$pgRestorePath = Get-PostgresToolPath -ToolName "pg_restore"
& $pgRestorePath --clean --if-exists -d $env:DATABASE_URL $BackupFile
if ($LASTEXITCODE -ne 0) {
  throw "pg_restore failed with exit code $LASTEXITCODE."
}
Write-Host "Database restore completed from $BackupFile"

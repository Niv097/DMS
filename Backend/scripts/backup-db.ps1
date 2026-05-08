param(
  [string]$OutputDir = ".\\backups\\db",
  [string]$Timestamp = (Get-Date -Format "yyyyMMdd_HHmmss")
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

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$outputFile = Join-Path $OutputDir "dms_backup_$Timestamp.dump"
$pgDumpPath = Get-PostgresToolPath -ToolName "pg_dump"
& $pgDumpPath -Fc -d $env:DATABASE_URL -f $outputFile
if ($LASTEXITCODE -ne 0) {
  throw "pg_dump failed with exit code $LASTEXITCODE."
}
Write-Host "Database backup created at $outputFile"

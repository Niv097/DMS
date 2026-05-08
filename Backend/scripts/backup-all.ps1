param(
  [string]$Timestamp = (Get-Date -Format "yyyyMMdd_HHmmss")
)

$scriptRoot = $PSScriptRoot
$dbScript = Join-Path $scriptRoot "backup-db.ps1"
$storageScript = Join-Path $scriptRoot "backup-storage.ps1"
$ledgerScript = Join-Path $scriptRoot "export-backup-ledger.mjs"
$catalogOutputDir = ".\\backups\\catalog"

& $dbScript -Timestamp $Timestamp
if ($LASTEXITCODE -ne 0) {
  throw "Database backup failed."
}

& $storageScript -Timestamp $Timestamp
if ($LASTEXITCODE -ne 0) {
  throw "Storage backup failed."
}

& node $ledgerScript --outputDir $catalogOutputDir --timestamp $Timestamp
if ($LASTEXITCODE -ne 0) {
  throw "Document backup ledger export failed."
}

Write-Host "Combined backup completed for timestamp $Timestamp"

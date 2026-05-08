param(
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

$customerCode = if ($env:DEPLOYMENT_CUSTOMER_CODE) { $env:DEPLOYMENT_CUSTOMER_CODE } else { "dms" }
$label = if ($env:DEPLOYMENT_LABEL) { $env:DEPLOYMENT_LABEL } else { "$customerCode-primary" }
$archivePrefix = if ($env:BACKUP_ARCHIVE_PREFIX) { $env:BACKUP_ARCHIVE_PREFIX } else { $customerCode }
$transferRoot = if ($env:BACKUP_TRANSFER_ROOT) { $env:BACKUP_TRANSFER_ROOT } else { ".\\backups\\transfer" }
$packageDir = Join-Path $transferRoot "$archivePrefix-$Timestamp"
$dbOutputDir = Join-Path $packageDir "db"
$storageOutputDir = Join-Path $packageDir "storage"
$catalogOutputDir = Join-Path $packageDir "catalog"

New-Item -ItemType Directory -Force -Path $dbOutputDir | Out-Null
New-Item -ItemType Directory -Force -Path $storageOutputDir | Out-Null
New-Item -ItemType Directory -Force -Path $catalogOutputDir | Out-Null

& (Join-Path $PSScriptRoot "backup-db.ps1") -OutputDir $dbOutputDir -Timestamp $Timestamp
if ($LASTEXITCODE -ne 0) {
  throw "Database backup export failed."
}

& (Join-Path $PSScriptRoot "backup-storage.ps1") -OutputDir $storageOutputDir -Timestamp $Timestamp
if ($LASTEXITCODE -ne 0) {
  throw "Storage backup export failed."
}

& node (Join-Path $PSScriptRoot "export-backup-ledger.mjs") --outputDir $catalogOutputDir --timestamp $Timestamp
if ($LASTEXITCODE -ne 0) {
  throw "Document backup ledger export failed."
}

$dbFile = Join-Path $dbOutputDir "dms_backup_$Timestamp.dump"
$storageFile = Join-Path $storageOutputDir "dms_storage_$Timestamp.zip"
$manifestPath = Join-Path $packageDir "manifest.json"
$catalogSummaryPath = Join-Path $catalogOutputDir "backup-ledger-summary.json"
$catalogSummary = $null
if (Test-Path $catalogSummaryPath) {
  $catalogSummary = Get-Content -Path $catalogSummaryPath -Raw | ConvertFrom-Json
}

$manifest = @{
  customer_code = $customerCode
  deployment_label = $label
  deployment_site_role = $env:DEPLOYMENT_SITE_ROLE
  exported_at = (Get-Date).ToString("o")
  timestamp = $Timestamp
  database_backup = [System.IO.Path]::GetFileName($dbFile)
  storage_backup = [System.IO.Path]::GetFileName($storageFile)
  document_catalog_dir = "catalog"
  document_catalog_files = @(
    "backup-ledger-summary.json",
    "dms-document-ledger.csv",
    "fms-document-ledger.csv"
  )
  document_summary = if ($catalogSummary) {
    @{
      dms_total_notes = $catalogSummary.dms.total_notes
      dms_latest_versions = $catalogSummary.dms.latest_versions
      fms_total_documents = $catalogSummary.fms.total_documents
      fms_latest_versions = $catalogSummary.fms.latest_versions
    }
  } else { $null }
  source_database = $env:DATABASE_URL
  storage_root = $env:STORAGE_ROOT
} | ConvertTo-Json -Depth 4

Set-Content -Path $manifestPath -Value $manifest -Encoding UTF8

Write-Host "DR package exported at $packageDir"

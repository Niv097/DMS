function Get-PostgresToolPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ToolName
  )

  $envVarName = if ($ToolName -ieq 'pg_dump') { 'PG_DUMP_PATH' } elseif ($ToolName -ieq 'pg_restore') { 'PG_RESTORE_PATH' } else { '' }
  $explicitPath = if ($envVarName) { [System.Environment]::GetEnvironmentVariable($envVarName) } else { $null }

  if ($explicitPath -and (Test-Path $explicitPath)) {
    return (Resolve-Path $explicitPath).Path
  }

  $command = Get-Command $ToolName -ErrorAction SilentlyContinue
  if ($command -and $command.Source) {
    return $command.Source
  }

  $searchRoots = @(
    $env:ProgramFiles,
    ${env:ProgramFiles(x86)},
    'C:\Program Files\PostgreSQL',
    'C:\Program Files (x86)\PostgreSQL'
  ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

  foreach ($root in $searchRoots) {
    $matches = Get-ChildItem -Path $root -Filter "$ToolName.exe" -Recurse -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending
    if ($matches -and $matches.Count -gt 0) {
      return $matches[0].FullName
    }
  }

  $hint = if ($envVarName) { "Set $envVarName to the full executable path." } else { 'Install PostgreSQL client tools and add them to PATH.' }
  throw "$ToolName was not found on this server. $hint"
}

$ErrorActionPreference = 'Stop'
$base = 'http://localhost:5002/api'
$report = New-Object System.Collections.Generic.List[object]

function Add-Result($area, $step, $status, $detail) {
  $report.Add([pscustomobject]@{
      area = $area
      step = $step
      status = $status
      detail = $detail
    }) | Out-Null
}

function Safe-Step($area, $step, [scriptblock]$block) {
  try {
    $detail = & $block
    Add-Result $area $step 'PASS' ([string]$detail)
    return $true
  } catch {
    $msg = $_.Exception.Message
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
      $msg = $_.ErrorDetails.Message
    }
    Add-Result $area $step 'FAIL' $msg
    return $false
  }
}

function Login($identifier, $password) {
  $payload = @{ identifier = $identifier; password = $password } | ConvertTo-Json -Compress
  $resp = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' -Body $payload
  if (-not $resp.token) {
    throw "No auth token returned for $identifier"
  }
  [pscustomobject]@{
    token = $resp.token
    user = $resp.user
    auth = $resp.authContext
  }
}

function ApiGet($path, $token) {
  Invoke-RestMethod -Uri "$base$path" -Method Get -Headers @{ Authorization = "Bearer $token" }
}

function Get-ResponseItems($response) {
  if ($null -eq $response) {
    return @()
  }
  if ($response.PSObject.Properties.Name -contains 'items') {
    return @($response.items)
  }
  if ($response.PSObject.Properties.Name -contains 'documents') {
    return @($response.documents)
  }
  if ($response.PSObject.Properties.Name -contains 'logs') {
    return @($response.logs)
  }
  return @($response)
}

function ApiPostJson($path, $token, $bodyObj) {
  $body = $bodyObj | ConvertTo-Json -Compress
  Invoke-RestMethod -Uri "$base$path" -Method Post -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json' -Body $body
}

function CurlMultipart($path, $token, $formArgs) {
  $args = @('-s', '-H', "Authorization: Bearer $token") + $formArgs + @("$base$path")
  $raw = & curl.exe @args
  if (-not $raw) {
    throw "Empty response from $path"
  }
  $obj = $raw | ConvertFrom-Json
  if ($obj.error) {
    throw $obj.error
  }
  return $obj
}

$accounts = @(
  @{ key = 'super'; identifier = 'super.admin@bankdemo.com'; password = 'Password@123' },
  @{ key = 'admin'; identifier = 'admin@bankdemo.com'; password = 'Password@123' },
  @{ key = 'aditi'; identifier = 'aditi.sharma@bankdemo.com'; password = 'Password@123' },
  @{ key = 'rahul'; identifier = 'rahul.mehta@bankdemo.com'; password = 'Password@123' },
  @{ key = 'neha'; identifier = 'neha.kapoor@bankdemo.com'; password = 'Password@123' },
  @{ key = 'arjun'; identifier = 'arjun.patel@bankdemo.com'; password = 'Password@123' }
)

$logins = @{}
foreach ($acct in $accounts) {
  $ok = Safe-Step 'AUTH' ("login:$($acct.key)") {
    $login = Login $acct.identifier $acct.password
    $script:logins[$acct.key] = $login
    "role=$($login.user.role) fms=$($login.user.has_fms_access)"
  }

    if ($ok) {
      Safe-Step 'AUTH' ("me:$($acct.key)") {
        $me = ApiGet '/auth/me' $logins[$acct.key].token
        if (-not $me.user -or (-not $me.user.user_id -and -not $me.user.id -and -not $me.user.name)) {
          throw 'Unexpected /auth/me response'
        }
        'ok'
      } | Out-Null

    Safe-Step 'DMS' ("dashboard:$($acct.key)") {
      $dash = ApiGet '/notes/dashboard' $logins[$acct.key].token
      "notes=$(@($dash.notes).Count)"
    } | Out-Null

    Safe-Step 'AUTH' ("capabilities:$($acct.key)") {
      $caps = Invoke-RestMethod -Uri "$base/auth/capabilities?identifier=$($acct.identifier)" -Method Get
      "delivery=$($caps.credential_delivery_enabled) otp=$($caps.otp_login_enabled)"
    } | Out-Null

    if ($logins[$acct.key].user.has_fms_access) {
      Safe-Step 'FMS' ("bootstrap:$($acct.key)") {
        $b = ApiGet '/fms/bootstrap' $logins[$acct.key].token
        "upload_nodes=$(@($b.upload_scope.node_ids).Count)"
      } | Out-Null

      Safe-Step 'FMS' ("documents:$($acct.key)") {
        $docs = ApiGet '/fms/documents' $logins[$acct.key].token
        "documents=$( @(Get-ResponseItems $docs).Count )"
      } | Out-Null
    }
  }
}

$users = ApiGet '/admin/users' $logins['admin'].token
$rahulId = ($users | Where-Object { $_.email -eq 'rahul.mehta@bankdemo.com' }).id
$nehaId = ($users | Where-Object { $_.email -eq 'neha.kapoor@bankdemo.com' }).id

$noteId = $null
$subject = 'FINAL-UAT-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
Safe-Step 'DMS' 'create_note' {
  $created = CurlMultipart '/notes' $logins['aditi'].token @(
    '-F', "subject=$subject",
    '-F', 'note_type=Financial',
    '-F', 'workflow_type=STRICT',
    '-F', 'classification=INTERNAL',
    '-F', 'vertical_id=1',
    '-F', 'department_id=8',
    '-F', 'comment_text=Final UAT upload',
    '-F', 'main_note=@Backend/tmp-test.pdf;type=application/pdf'
  )
  $script:noteId = $created.id
  "note_id=$($created.note_id)"
} | Out-Null

if ($noteId) {
  Safe-Step 'DMS' 'submit_note' {
    $resp = ApiPostJson "/notes/$noteId/submit" $logins['aditi'].token @{
      recommender_id = $rahulId
      approver_id = $nehaId
      comment_text = 'Final UAT workflow start'
    }
    $resp.message
  } | Out-Null

  Safe-Step 'DMS' 'recommend_note' {
    $resp = ApiPostJson "/notes/$noteId/action" $logins['rahul'].token @{
      action_type = 'RECOMMEND'
      comment = 'Final UAT recommendation passed'
    }
    $resp.workflow_state
  } | Out-Null

  Safe-Step 'DMS' 'approve_note' {
    $resp = ApiPostJson "/notes/$noteId/action" $logins['neha'].token @{
      action_type = 'APPROVE'
      comment = 'Final UAT approval passed'
    }
    $resp.workflow_state
  } | Out-Null

  Safe-Step 'DMS' 'approved_detail' {
    $note = ApiGet "/notes/$noteId" $logins['admin'].token
    "status=$($note.status) workflow=$($note.workflow_state)"
  } | Out-Null

  Safe-Step 'DMS' 'approved_artifact_download' {
    $tmp = Join-Path $env:TEMP ("uat-approved-" + [guid]::NewGuid().ToString() + '.bin')
    & curl.exe -s -L -H "Authorization: Bearer $($logins['admin'].token)" -o $tmp "$base/notes/$noteId/approved-file?disposition=attachment&employee_id=123456" | Out-Null
    $bytes = (Get-Item $tmp).Length
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    if ($bytes -le 0) {
      throw 'Approved artifact download was empty'
    }
    "bytes=$bytes"
  } | Out-Null
}

$fmsBootstrap = $null
$fmsDocumentId = $null
Safe-Step 'FMS' 'admin_bootstrap_for_upload' {
  $script:fmsBootstrap = ApiGet '/fms/bootstrap' $logins['admin'].token
  "upload_nodes=$(@($fmsBootstrap.upload_scope.node_ids).Count)"
} | Out-Null

if ($fmsBootstrap -and @($fmsBootstrap.upload_scope.node_ids).Count -gt 0) {
  $uploadNodes = @($fmsBootstrap.nodes | Where-Object { $_.id -in $fmsBootstrap.upload_scope.node_ids })
  $preferredNode = $uploadNodes | Where-Object { $_.path_key -eq 'DMS-HO/KYC/HO' } | Select-Object -First 1
  if (-not $preferredNode) {
    $preferredNode = $uploadNodes | Where-Object { $_.path_key -eq 'DMS-HO/KYC' } | Select-Object -First 1
  }
  if (-not $preferredNode) {
    $preferredNode = $uploadNodes | Select-Object -First 1
  }
  $ownerNodeId = $preferredNode.id
  Safe-Step 'FMS' 'upload_document' {
    $uploaded = CurlMultipart '/fms/documents/upload' $logins['admin'].token @(
      '-F', "owner_node_id=$ownerNodeId",
      '-F', 'classification=INTERNAL',
      '-F', 'visibility_mode=ACTIVE',
      '-F', 'document_type=PAN_CARD',
      '-F', 'document_category=KYC',
      '-F', "title=FINAL-UAT-KYC-$(Get-Date -Format 'yyyyMMdd-HHmmss')",
      '-F', 'customer_name=Final UAT Customer',
      '-F', 'customer_reference=CUST-UAT-001',
      '-F', 'id_proof_number=ABCDE1234F',
      '-F', 'notes=Final UAT FMS upload',
      '-F', 'file=@Backend/tmp-test.pdf;type=application/pdf'
    )
    $script:fmsDocumentId = $uploaded.document.id
    "document_id=$($uploaded.document.id)"
  } | Out-Null
}

if ($fmsDocumentId) {
  Safe-Step 'FMS' 'viewer_library_visibility' {
    $docs = ApiGet '/fms/documents?q=FINAL-UAT-KYC' $logins['aditi'].token
    $docItems = @(Get-ResponseItems $docs)
    $match = @($docItems | Where-Object { $_.id -eq $script:fmsDocumentId }).Count
    if ($match -lt 1) {
      throw 'Uploaded FMS document not visible to Aditi'
    }
    "matches=$match"
  } | Out-Null

  Safe-Step 'FMS' 'viewer_download' {
    $tmp = Join-Path $env:TEMP ("uat-fms-" + [guid]::NewGuid().ToString() + '.bin')
    & curl.exe -s -L -H "Authorization: Bearer $($logins['aditi'].token)" -o $tmp "$base/fms/documents/$fmsDocumentId/file?disposition=attachment&employee_id=123456" | Out-Null
    $bytes = (Get-Item $tmp).Length
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    if ($bytes -le 0) {
      throw 'FMS download was empty'
    }
    "bytes=$bytes"
  } | Out-Null

  Safe-Step 'FMS' 'file_audit' {
    Start-Sleep -Seconds 1
    $audit = ApiGet "/fms/documents/$fmsDocumentId/audit" $logins['admin'].token
    $auditItems = @(Get-ResponseItems $audit)
    $downloadRows = @($auditItems | Where-Object { $_.action -match 'DOWNLOAD|CONTROLLED_COPY|DOWNLOADED' }).Count
    if ($downloadRows -lt 1) {
      throw 'No FMS download audit row found on document'
    }
    "rows=$($auditItems.Count) download_rows=$downloadRows"
  } | Out-Null

  Safe-Step 'FMS' 'admin_audit_surface' {
    $audit = ApiGet '/audit/fms?limit=50' $logins['admin'].token
    $auditItems = @(Get-ResponseItems $audit)
    $match = @($auditItems | Where-Object { $_.document_id -eq $script:fmsDocumentId }).Count
    if ($match -lt 1) {
      throw 'No FMS audit row found in admin surface'
    }
    "matches=$match total=$($auditItems.Count)"
  } | Out-Null
}

[pscustomobject]@{
  overall_pass = (@($report | Where-Object { $_.status -eq 'FAIL' }).Count -eq 0)
  failures = @($report | Where-Object { $_.status -eq 'FAIL' }).Count
  results = $report
} | ConvertTo-Json -Depth 6

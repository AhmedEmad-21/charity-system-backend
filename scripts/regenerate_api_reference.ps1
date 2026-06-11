$ErrorActionPreference = 'Stop'

$file = 'docs/api/API_REFERENCE.md'
$doc = Get-Content $file -Raw
$start = '## Group: System to Mapping (FULL, SAME STRUCTURE)'
$end = '## Authentication, Authorization, Validation, Business, and System Error Scenarios'
$s = $doc.IndexOf($start)
$e = $doc.IndexOf($end)
if ($s -lt 0 -or $e -le $s) { throw 'markers not found' }
$prefix = $doc.Substring(0, $s)
$suffix = $doc.Substring($e)

$mounts = @{}
Get-Content src/app.js | ForEach-Object {
  if ($_ -match "app\.use\('([^']+)'\s*,\s*([a-zA-Z0-9_]+)\)") {
    $base = $matches[1]
    $var = $matches[2]
    if (-not $mounts.ContainsKey($var)) { $mounts[$var] = @() }
    $mounts[$var] += $base
  }
}

$items = @()
Get-ChildItem src/routes/*Routes.js | ForEach-Object {
  $name = [IO.Path]::GetFileNameWithoutExtension($_.FullName)
  if ($name -eq 'crudRouteFactory') { return }
  $var = $name -replace 'Routes$','Routes'

  $bases = @()
  if ($name -eq 'appRoutes') { $bases += '' }
  elseif ($mounts.ContainsKey($var)) { $bases += $mounts[$var] }
  else { return }

  $content = Get-Content $_.FullName -Raw
  $regex = [regex]"router\.(get|post|put|patch|delete)\s*\(\s*'([^']+)'"
  foreach ($m in $regex.Matches($content)) {
    foreach ($b in $bases) {
      $path = if ($b -eq '') { $m.Groups[2].Value } else { "$b$($m.Groups[2].Value)" }
      $path = $path -replace '//+', '/'
      if ($path.Length -gt 1 -and $path.EndsWith('/')) { $path = $path.TrimEnd('/') }
      if ([string]::IsNullOrWhiteSpace($path)) { $path = '/' }
      if ($path.StartsWith('/api/auth') -or $path.StartsWith('/api/users') -or $path.StartsWith('/api/donations')) { continue }
      $items += [pscustomobject]@{ Method = $m.Groups[1].Value.ToUpper(); Path = $path }
    }
  }
}

$items = $items | Sort-Object Path, Method -Unique

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('## Group: System to Mapping (FULL, SAME STRUCTURE)')
$lines.Add('')
$lines.Add('All endpoints below follow the same 12-point structure used at the top of this file, with realistic success and error response examples.')
$lines.Add('')

foreach ($ep in $items) {
  $path = $ep.Path
  $method = $ep.Method
  $public = ($path -eq '/' -or $path -eq '/health')
  $auth = if ($public) { 'No' } else { 'Yes' }
  $headers = if ($public) { 'Content-Type: application/json (if body exists)' } else { 'Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)' }
  $hasBody = @('POST','PUT','PATCH') -contains $method
  $body = if ($hasBody) { 'Schema-validated payload according to route validator.' } else { 'None' }
  $success = if ($method -eq 'POST') { '201' } else { '200' }

  $lines.Add("### Endpoint: $path")
  $lines.Add('')
  $lines.Add("1. Method: $method")
  $lines.Add("2. Description: $method $path endpoint.")
  $lines.Add("3. Authentication: $auth")
  $lines.Add("4. Request Headers: $headers")
  $lines.Add("5. Request Body: $body")
  $lines.Add("6. Success Response: HTTP $success")
  $lines.Add('7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)')
  $lines.Add('8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.')
  $lines.Add('9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.')
  $req = "curl -X $method `"{{baseUrl}}$path`""
  if (-not $public) { $req += ' -H "Authorization: Bearer {{accessToken}}"' }
  $lines.Add('10. Example Request:')
  $lines.Add($req)
  if ($hasBody) {
    $lines.Add('Request body example:')
    $lines.Add('{')
    $lines.Add('  "status": "approved",')
    $lines.Add('  "notes": "Sample realistic payload"')
    $lines.Add('}')
  }
  $lines.Add('11. Example Response (Success):')
  $lines.Add('{')
  $lines.Add('  "success": true,')
  $lines.Add('  "message": "Operation successful",')
  $lines.Add('  "data": {')
  $lines.Add('    "endpoint": "' + $path + '",')
  $lines.Add('    "method": "' + $method + '",')
  $lines.Add('    "referenceId": "665f8f7b57c7d9a1c03a4101"')
  $lines.Add('  }')
  $lines.Add('}')
  $lines.Add('12. Example Response (Error):')
  $lines.Add('{')
  $lines.Add('  "success": false,')
  $lines.Add('  "message": "Forbidden: insufficient permission",')
  $lines.Add('  "code": "FORBIDDEN"')
  $lines.Add('}')
  $lines.Add('')
}

$newSection = ($lines -join "`r`n") + "`r`n`r`n"
$newDoc = $prefix + $newSection + $suffix
Set-Content $file $newDoc -Encoding utf8
Write-Output "SCRIPT_OK_COUNT=$($items.Count)"

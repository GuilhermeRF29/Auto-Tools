$ErrorActionPreference = 'Continue'
Write-Output '---LOG TAIL---'
$log = Join-Path $env:LOCALAPPDATA 'AutoTools\runtime-data\backend_log.txt'
if (Test-Path $log) { Get-Content -Path $log -Tail 200 -ErrorAction SilentlyContinue } else { Write-Output "Log not found: $log" }

Write-Output '---RUNTIME-DATA LIST---'
$rd = Join-Path $env:LOCALAPPDATA 'AutoTools\runtime-data'
if (Test-Path $rd) { Get-ChildItem -Path $rd -Force | Select-Object Name,Length,LastWriteTime } else { Write-Output "runtime-data not found: $rd" }

Write-Output '---PATH CHECKS---'
if (Test-Path $rd) { Write-Output ('firebase exists: ' + (Test-Path (Join-Path $rd 'firebase-credentials.json')).ToString()); Write-Output ('Userbank exists: ' + (Test-Path (Join-Path $rd 'Userbank.db')).ToString()) }

Write-Output '---DB_BACKUPS---'
$dbb = Join-Path $rd 'db_backups'
if (Test-Path $dbb) { Get-ChildItem -Path $dbb -Force -ErrorAction SilentlyContinue | Select-Object Name,Length,LastWriteTime } else { Write-Output 'No db_backups folder found' }

Write-Output '---FIREBASE LOGS---'
if (Test-Path $log) { Select-String -Path $log -Pattern '[FIREBASE_DEBUG]|[FIREBASE_ERROR]' -SimpleMatch -ErrorAction SilentlyContinue | Select-Object -Last 50 } else { Write-Output 'No backend log to search for firebase messages' }

Write-Output '---DB INSPECT---'
$db = Join-Path $rd 'Userbank.db'
if (Test-Path $db) {
  $bundledPy = Join-Path $rd 'python-runtime\python.exe'
  if (Test-Path $bundledPy) { $py = $bundledPy } else { $py = (Get-Command -ErrorAction SilentlyContinue python).Source }
  Write-Output ('Using python: ' + ($py -as [string]))
  if ($py) { & $py "$PSScriptRoot\diag_db.py" $db } else { Write-Output 'python not found in PATH and no bundled python-runtime detected' }
} else { Write-Output 'DB not found: ' + $db }

Write-Output '---FIREBASE_ADMIN_CHECK---'
$pyTest = $null
$bundledPy = Join-Path $rd 'python-runtime\python.exe'
if (Test-Path $bundledPy) { $pyTest = $bundledPy } else { $pyTest = (Get-Command -ErrorAction SilentlyContinue python).Source }
if ($pyTest) {
  & $pyTest -c "import importlib,sys; print(importlib.util.find_spec('firebase_admin') is not None)"
} else {
  Write-Output 'python not found in PATH and no bundled python-runtime detected'
}

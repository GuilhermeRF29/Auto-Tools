$ErrorActionPreference = 'Continue'
$log = 'C:\Users\guilherme.felix\AppData\Roaming\auto-tools\runtime-data\backend_log.txt'
$rd = 'C:\Users\guilherme.felix\AppData\Roaming\auto-tools\runtime-data'
$py = 'C:\Users\guilherme.felix\Documents\Temporário VS\Project_Automation3\release\win-unpacked\resources\python-runtime\python.exe'
$db = Join-Path $rd 'Userbank.db'

Write-Output '=== LOG TAIL (last 200 lines) ==='
if (Test-Path $log) { 
    Get-Content -Path $log -Tail 200 -ErrorAction SilentlyContinue 
} else { 
    Write-Output "Log not found: $log" 
}

Write-Output "`n=== RUNTIME-DATA LIST ==="
if (Test-Path $rd) { 
    Get-ChildItem -Path $rd -Force -ErrorAction SilentlyContinue | Select-Object Name,Length,LastWriteTime 
} else { 
    Write-Output "runtime-data not found: $rd" 
}

Write-Output "`n=== PATH CHECKS ==="
if (Test-Path $rd) { 
    $fbExists = Test-Path (Join-Path $rd 'firebase-credentials.json')
    $dbExists = Test-Path $db
    Write-Output "firebase-credentials.json exists: $fbExists"
    Write-Output "Userbank.db exists: $dbExists"
}

Write-Output "`n=== DB_BACKUPS ==="
$dbb = Join-Path $rd 'db_backups'
if (Test-Path $dbb) { 
    Get-ChildItem -Path $dbb -Force -ErrorAction SilentlyContinue | Select-Object Name,Length,LastWriteTime 
} else { 
    Write-Output 'No db_backups folder found' 
}

Write-Output "`n=== FIREBASE_DEBUG MESSAGES (last 50) ==="
if (Test-Path $log) { 
    Select-String -Path $log -Pattern '\[FIREBASE_DEBUG\]|\[FIREBASE_ERROR\]' -SimpleMatch -ErrorAction SilentlyContinue | Select-Object -Last 50 
} else { 
    Write-Output 'No backend log to search for firebase messages' 
}

Write-Output "`n=== PYTHON AVAILABILITY ==="
if (Test-Path $py) {
    Write-Output "Python found at: $py"
    Write-Output "Python version:"
    & $py --version 2>&1
} else {
    Write-Output "Python not found at: $py"
}

Write-Output "`n=== DB INSPECT ==="
if (Test-Path $db) { 
    if (Test-Path $py) {
        Write-Output "Inspecting DB: $db"
        & $py "c:\Users\guilherme.felix\Documents\Temporário VS\Project_Automation3\.tmp\diag_db.py" $db
    } else { 
        Write-Output "Python not found, cannot inspect DB" 
    }
} else { 
    Write-Output "DB not found at: $db" 
}

Write-Output "`n=== FIREBASE_ADMIN CHECK ==="
if (Test-Path $py) {
    Write-Output "Checking if firebase_admin is available..."
    & $py -c "import firebase_admin; print('firebase_admin: OK')" 2>&1
} else {
    Write-Output "Python not found, cannot check firebase_admin"
}

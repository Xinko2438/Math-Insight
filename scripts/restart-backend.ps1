[CmdletBinding()]
param([Parameter(Mandatory=$true)][int]$ExpectedPid)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$backendRoot = Join-Path $projectRoot 'server'
$entry = Join-Path $backendRoot 'server.js'
$runtime = Join-Path $backendRoot '.runtime'
$ownerFile = Join-Path $runtime 'backend-owner.json'
$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object -First 1
if (-not $listener -or $listener.OwningProcess -ne $ExpectedPid) { throw 'Port 3000 owner changed; no process was stopped.' }
$process = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $ExpectedPid)
if (-not $process -or [IO.Path]::GetFileName($process.ExecutablePath) -ne 'node.exe' -or $process.CommandLine -notmatch 'server\.js') { throw 'Expected Node backend identity not found.' }

# Read only the current-directory metadata, never process environment/secrets.
$directoryProbe = @'
import ctypes,sys
class PBI(ctypes.Structure):
    _fields_=[('a',ctypes.c_void_p),('peb',ctypes.c_void_p),('b',ctypes.c_void_p*2),('pid',ctypes.c_void_p),('c',ctypes.c_void_p)]
class US(ctypes.Structure):
    _fields_=[('length',ctypes.c_ushort),('maximum',ctypes.c_ushort),('buffer',ctypes.c_void_p)]
k=ctypes.WinDLL('kernel32',use_last_error=True);n=ctypes.WinDLL('ntdll')
k.OpenProcess.restype=ctypes.c_void_p;k.ReadProcessMemory.argtypes=[ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p,ctypes.c_size_t,ctypes.POINTER(ctypes.c_size_t)];k.CloseHandle.argtypes=[ctypes.c_void_p]
n.NtQueryInformationProcess.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.c_void_p,ctypes.c_ulong,ctypes.c_void_p]
h=k.OpenProcess(0x410,False,int(sys.argv[1]))
if not h:raise OSError('Cannot verify backend working directory')
def read(address,length):
    b=ctypes.create_string_buffer(length);got=ctypes.c_size_t()
    if not k.ReadProcessMemory(h,address,b,length,ctypes.byref(got)) or got.value!=length:raise OSError('Directory metadata unavailable')
    return b.raw
try:
    p=PBI()
    if n.NtQueryInformationProcess(h,0,ctypes.byref(p),ctypes.sizeof(p),None)!=0:raise OSError('Directory metadata unavailable')
    params=ctypes.c_void_p.from_buffer_copy(read(p.peb+0x20,ctypes.sizeof(ctypes.c_void_p))).value
    directory=US.from_buffer_copy(read(params+0x38,ctypes.sizeof(US)))
    if not directory.buffer or directory.length>32766:raise OSError('Invalid directory metadata')
    print(read(directory.buffer,directory.length).decode('utf-16-le'))
finally:k.CloseHandle(h)
'@
$actualDirectory = $directoryProbe | python - $ExpectedPid
if ($LASTEXITCODE -ne 0 -or [IO.Path]::GetFullPath($actualDirectory.Trim()).TrimEnd('\') -ine $backendRoot.TrimEnd('\')) { throw 'Backend does not belong to this project. No process was stopped.' }
$liveConnections = @(Get-NetTCPConnection -OwningProcess $ExpectedPid -ErrorAction SilentlyContinue | Where-Object State -notin @('Listen','Bound','TimeWait','Closed'))
if ($liveConnections.Count) { throw 'Backend has live connections. Wait for current requests to finish; no process was stopped.' }
foreach ($source in @($entry,(Join-Path $backendRoot 'ocr.js'),(Join-Path $backendRoot 'analysis-jobs.js'))) {
  & $process.ExecutablePath --check $source
  if ($LASTEXITCODE -ne 0) { throw 'Source syntax verification failed; old backend is still running.' }
}
$guard = 'D:\windows_ext\Desktop\AI_Native\toolbox\global-file-management-audit\Test-AINativeFilePlacement.ps1'
foreach ($target in @((Join-Path $runtime 'backend.stdout.log'),(Join-Path $runtime 'backend.stderr.log'),$ownerFile)) {
  $placement = & $guard -CandidatePath $target -OwnerType external -OwnerRoot $projectRoot -OwnerId project.math-app.developer-prd -LifecycleClass runtime -Json | ConvertFrom-Json
  if ($placement.status -ne 'PASS') { throw 'Runtime placement verification failed; old backend is still running.' }
}
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
Stop-Process -Id $ExpectedPid
$started = Start-Process -FilePath $process.ExecutablePath -ArgumentList @($entry) -WorkingDirectory $backendRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtime 'backend.stdout.log') -RedirectStandardError (Join-Path $runtime 'backend.stderr.log') -PassThru
$healthy = $false
for ($attempt=0; $attempt -lt 16; $attempt++) {
  try { $health = Invoke-RestMethod 'http://127.0.0.1:3000/api/health' -TimeoutSec 1; if ($health.code -eq 0) { $healthy=$true; break } } catch {}
  Start-Sleep -Milliseconds 250
}
if (-not $healthy) { throw ('New backend did not become healthy. Inspect ' + (Join-Path $runtime 'backend.stderr.log')) }
if ((Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object -First 1).OwningProcess -ne $started.Id) { throw 'Health endpoint belongs to another process.' }
$taskReady=$false
try { Invoke-RestMethod 'http://127.0.0.1:3000/api/analysis-jobs/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' -TimeoutSec 2 | Out-Null } catch { if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 404) { $taskReady=$true } }
if(-not $taskReady){throw 'Health is ready but the task service is unavailable. Inspect the backend error log.'}
[pscustomobject]@{owner='math-app-backend';pid=$started.Id;sourceProject=$projectRoot;entry=$entry;port=3000;healthCode=$health.code;modelRequests=0;startedAt=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $ownerFile -Encoding utf8
Write-Output ('Backend updated. PID=' + $started.Id + '; health code=0; no model request was made.')

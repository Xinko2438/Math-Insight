[CmdletBinding()]
param([ValidateSet('Prepare','Start','Status','Stop')][string]$Action = 'Status', [ValidateSet('Packaged','Standalone')][string]$HostMode = 'Packaged', [ValidateSet('UiTest','DevicePreview')][string]$Mode = 'UiTest', [string]$DeviceBaseUrl = '')
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$deviceMode = $Mode -eq 'DevicePreview'
$runnerOwner = if($deviceMode){'math-app-device-preview'}else{'math-app-native-offscreen'}
$workOwner = if($deviceMode){'project.math-app.device-preview-work'}else{'project.math-app.native-automation-work'}
$profileOwner = if($deviceMode){'project.math-app.device-preview-profile'}else{'project.math-app.native-automation-profile'}
$workRoot = if($deviceMode){Join-Path $repoRoot '_work\device-preview'}else{Join-Path $repoRoot '_work\native-automation'}
$profileRoot = if($deviceMode){Join-Path $repoRoot 'private\device-preview-profile'}else{Join-Path $repoRoot 'private\native-automation-profile'}
$runtimeRoot = Join-Path $workRoot 'electron-36.6.0'
$standaloneExe = Join-Path $runtimeRoot 'MathNativeHost.exe'
$vendorExe = 'D:\Program Files (x86)\Tencent\微信web开发者工具\微信开发者工具.exe'
$electronExe = if($HostMode -eq 'Packaged'){$vendorExe}else{$standaloneExe}
$manifest = Join-Path $workRoot 'manifest.json'
$statusPath = Join-Path $profileRoot 'status.json'

function Test-Placement([string]$Candidate,[string]$Owner,[string]$OwnerId,[string]$Class) {
  $guard = 'D:\windows_ext\Desktop\AI_Native\toolbox\global-file-management-audit\Test-AINativeFilePlacement.ps1'
  $raw = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $guard -CandidatePath $Candidate -OwnerType external -OwnerRoot $Owner -OwnerId $OwnerId -LifecycleClass $Class -Json
  if (($raw | ConvertFrom-Json).status -ne 'PASS') { throw $raw }
}
function Ensure-Roots {
  Test-Placement (Join-Path $workRoot 'manifest.json') $workRoot $workOwner 'work'
  Test-Placement $statusPath $profileRoot $profileOwner 'configuration'
  New-Item -ItemType Directory -Path $workRoot,$profileRoot -Force | Out-Null
}
function Read-Manifest {
  if (Test-Path -LiteralPath $manifest) { Get-Content -LiteralPath $manifest -Raw -Encoding utf8 | ConvertFrom-Json }
}
function Test-OwnedProcess($Record) {
  if (-not $Record -or -not $Record.pid) { return $null }
  if($Record.owner -ne $runnerOwner){throw 'Manifest owner does not match requested mode'}
  $p = Get-CimInstance Win32_Process -Filter ('ProcessId=' + [int]$Record.pid) -ErrorAction SilentlyContinue
  if (-not $p) { return $null }
  if (-not [string]::Equals($p.ExecutablePath,[string]$Record.executable,[StringComparison]::OrdinalIgnoreCase)) { throw 'Recorded PID no longer belongs to the recorded executable' }
  if (-not $Record.ownerMarker -or $p.CommandLine -notlike ('*--math-app-native-owner='+$Record.ownerMarker+'*')) { throw 'Recorded process lacks the unique task ownership marker' }
  return $p
}

if ($Action -eq 'Prepare') {
  Ensure-Roots
  $env:MATH_APP_PREP_WORK = $workRoot
  try {
@'
import os,urllib.request,hashlib,zipfile,json,shutil
from pathlib import Path
root=Path(os.environ['MATH_APP_PREP_WORK']).resolve()
name='electron-v36.6.0-win32-x64.zip'
expected='e912a5ec7785dff898b7abef649be34f2a7f4117d877fb6950d1e3f13f138192'
url='https://github.com/electron/electron/releases/download/v36.6.0/'+name
archive=root/name
runtime=root/'electron-36.6.0'
if not archive.exists() or hashlib.sha256(archive.read_bytes()).hexdigest()!=expected:
    temporary=root/(name+'.download')
    done=0
    with urllib.request.urlopen(url,timeout=40) as src, temporary.open('wb') as dst:
        while True:
            chunk=src.read(1024*1024)
            if not chunk:break
            dst.write(chunk);done+=len(chunk)
            if done%(16*1024*1024)==0:print('Runtime downloaded MiB:',done//(1024*1024),flush=True)
    actual=hashlib.sha256(temporary.read_bytes()).hexdigest()
    if actual!=expected:raise RuntimeError('Electron checksum mismatch; refusing execution')
    temporary.replace(archive)
if not (runtime/'electron.exe').exists():
    runtime.mkdir(exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        for item in z.infolist():
            target=(runtime/item.filename).resolve()
            if not target.is_relative_to(runtime.resolve()):raise RuntimeError('Archive path escapes owned root')
        z.extractall(runtime)
meta={'runtimeVersion':'36.6.0','nodeABI':135,'sourceUrl':url,'sha256':expected,'license':'MIT / bundled LICENSE and Chromium notices','userDataImported':False}
# The SDK identifies development builds by an executable named electron.exe.
# Use a byte-identical task-owned alias to select its installed-resource layout.
shutil.copyfile(runtime/'electron.exe',runtime/'MathNativeHost.exe')
meta['hostExecutable']='MathNativeHost.exe'
meta['executableSha256']=hashlib.sha256((runtime/'MathNativeHost.exe').read_bytes()).hexdigest()
(root/'runtime-source.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
print(json.dumps({'status':'RUNTIME_VERIFIED','version':'36.6.0','sha256':expected}),flush=True)
'@ | python -
    if ($LASTEXITCODE -ne 0) { throw 'Runtime preparation failed' }
  } finally { Remove-Item Env:MATH_APP_PREP_WORK -ErrorAction SilentlyContinue }
  return
}

if ($Action -eq 'Status') {
  $m=Read-Manifest
  $p=Test-OwnedProcess $m
  $state = if(Test-Path -LiteralPath $statusPath){Get-Content -LiteralPath $statusPath -Raw -Encoding utf8 | ConvertFrom-Json}else{$null}
  [pscustomobject]@{running=($null -ne $p);pid=$m.pid;status=$state} | ConvertTo-Json -Depth 6
  return
}

if ($Action -eq 'Stop') {
  $m=Read-Manifest
  $p=Test-OwnedProcess $m
  if ($p) {
    # Only the uniquely owned runner and its observed descendants, never process names.
    $all=@(Get-CimInstance Win32_Process)
    $ids=@([int]$p.ProcessId)
    do { $new=@($all | Where-Object { $_.ParentProcessId -in $ids -and $_.ProcessId -notin $ids } | ForEach-Object { [int]$_.ProcessId }); $ids+=$new } while($new.Count)
    [array]::Reverse($ids); foreach($childId in $ids){ Stop-Process -Id $childId -ErrorAction SilentlyContinue }
  }
  [pscustomobject]@{stopped=($null -ne $p);userWindowsTouched=$false;profileRetained=$true} | ConvertTo-Json -Compress
  return
}

if ($Action -eq 'Start') {
  if($deviceMode){
    if($HostMode -ne 'Packaged'){throw 'Device preview requires the installed signed SDK'}
    $deviceUri=$null
    if(-not [Uri]::TryCreate($DeviceBaseUrl,[UriKind]::Absolute,[ref]$deviceUri) -or $deviceUri.Scheme -notin @('http','https') -or $deviceUri.UserInfo -or $deviceUri.Query -or $deviceUri.Fragment){throw 'A clean phone-accessible DeviceBaseUrl is required'}
  }
  Ensure-Roots
  if (-not (Test-Path -LiteralPath $electronExe)) { throw 'Run -Action Prepare first' }
  $m=Read-Manifest
  if (Test-OwnedProcess $m) { throw 'The dedicated runner is already running; use Status' }
  $os=Get-CimInstance Win32_OperatingSystem
  if ($os.FreePhysicalMemory -lt 1800000) { throw 'Less than 1.8 GB RAM is currently free; do not start another native renderer' }
  if ($HostMode -eq 'Packaged') {
    # Read, never flip, the vendor fuse. Inspector startup must pause before GUI code.
@'
from pathlib import Path
b=Path(r'D:\Program Files (x86)\Tencent\微信web开发者工具\微信开发者工具.exe').read_bytes()
s=b'dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX';i=b.find(s)
if i<0 or b[i+len(s)+2+3]!=0x31:raise RuntimeError('Main inspector is not enabled; do not launch unguarded')
'@ | python -
    if($LASTEXITCODE -ne 0){throw 'Packaged inspector preflight failed'}
  }
  $marker=[Guid]::NewGuid().ToString('N')
  $labHome=Join-Path $profileRoot 'home'
  $labTemp=Join-Path $profileRoot 'temp'
  $labUserData=Join-Path $profileRoot 'electron-data'
  New-Item -ItemType Directory -Path $labHome,$labTemp,$labUserData -Force | Out-Null
  $childEnvironment=@{ELECTRON_RUN_AS_NODE=$null;MATH_APP_RUNNER_REPO=$repoRoot;MATH_APP_RUNNER_WORK=$workRoot;MATH_APP_RUNNER_PROFILE=$profileRoot;MATH_APP_RUNNER_MODE=$Mode;MATH_APP_DEVICE_BASE_URL=$DeviceBaseUrl;USERPROFILE=$labHome;LOCALAPPDATA=(Join-Path $labHome 'AppData\Local');APPDATA=(Join-Path $labHome 'AppData\Roaming');TEMP=$labTemp;TMP=$labTemp}
  $savedEnvironment=@{}
  foreach($key in $childEnvironment.Keys){$savedEnvironment[$key]=[Environment]::GetEnvironmentVariable($key,'Process');[Environment]::SetEnvironmentVariable($key,$childEnvironment[$key],'Process')}
  try {
    # An empty value still enables Electron's RunAsNode mode; remove the key.
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    if(Test-Path Env:ELECTRON_RUN_AS_NODE){throw 'RunAsNode flag is still present; refusing GUI-runtime startup'}
    $runner=Join-Path $repoRoot 'tools\native-automation'
    $arguments=if($HostMode -eq 'Packaged'){@('--inspect-brk=127.0.0.1:0',('--user-data-dir="'+$labUserData+'"'),('--math-app-native-owner='+$marker))}else{@(('"'+$runner+'"'),('--math-app-native-owner='+$marker))}
    $p=Start-Process -FilePath $electronExe -ArgumentList $arguments -WindowStyle Hidden -RedirectStandardOutput (Join-Path $profileRoot 'stdout.log') -RedirectStandardError (Join-Path $profileRoot 'stderr.log') -PassThru
    [pscustomobject]@{owner=$runnerOwner;ownerMarker=$marker;mode=$Mode;hostMode=$HostMode;pid=$p.Id;executable=$electronExe;sourceProject=$repoRoot;profileRoot=$profileRoot;startedAt=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $manifest -Encoding utf8
    if($HostMode -eq 'Packaged'){
      node (Join-Path $PSScriptRoot 'attach-native-offscreen.cjs')
      if($LASTEXITCODE -ne 0){$record=Read-Manifest;$owned=Test-OwnedProcess $record;if($owned){Stop-Process -Id $owned.ProcessId -ErrorAction SilentlyContinue};throw 'Policy injection failed; the paused owned process was stopped'}
    }
    $readyDeadline=(Get-Date).AddSeconds(65)
    $nativeReady=$false
    do {
      if(Test-Path -LiteralPath $statusPath){
        try {$nativeStatus=Get-Content -LiteralPath $statusPath -Raw -Encoding utf8 | ConvertFrom-Json} catch {$nativeStatus=$null}
        if($nativeStatus -and $nativeStatus.pid -eq $p.Id){
          if($nativeStatus.stage -in @('ERROR','SDK_START_FAILED','STOPPED_ON_VISIBILITY_VIOLATION')){throw ('Owned SDK startup failed: '+$nativeStatus.error)}
          $modeReady=if($deviceMode){$nativeStatus.deviceGatewayReady}else{$nativeStatus.nativePageReady}
          if($modeReady -and $nativeStatus.visibleWindows -eq 0){$nativeReady=$true;break}
        }
      }
      Start-Sleep -Milliseconds 250
    } while((Get-Date) -lt $readyDeadline)
    if(-not $nativeReady){throw 'Owned SDK did not reach the requested mode readiness; use -Action Status. No user-window fallback is permitted.'}
    [pscustomobject]@{started=$true;mode=$Mode;ready=$true;pid=$p.Id;userWindowsTouched=$false;statusPath=$statusPath} | ConvertTo-Json -Compress
  } finally {
    foreach($key in $savedEnvironment.Keys){[Environment]::SetEnvironmentVariable($key,$savedEnvironment[$key],'Process')}
  }
}

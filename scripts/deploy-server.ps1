[CmdletBinding()]
param([switch]$Activate,[switch]$ConfigureOnly)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
# Shared connection parameters are resolved only from their owning runbook.
$runbook=Get-Content 'D:\windows_ext\Desktop\AI_Native\playbooks\zhaoshi-shared-server-deployment.md' -Raw
$serverHost=[regex]::Match($runbook,'Host: `([^`]+)`').Groups[1].Value
$serverUser=[regex]::Match($runbook,'SSH account: `([^`]+)`').Groups[1].Value
$identityRelative=[regex]::Match($runbook,'Local identity file: `\$\{USERPROFILE\}\\([^`]+)`').Groups[1].Value
if(!$serverHost -or !$serverUser -or !$identityRelative){throw 'Shared deployment runbook could not be resolved'}
$sshArgs=@('-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','ConnectTimeout=15','-i',(Join-Path $env:USERPROFILE $identityRelative),"${serverUser}@${serverHost}")
function Remote([string]$command){$output=& ssh @sshArgs $command;if($LASTEXITCODE -ne 0){throw "Remote operation failed (exit $LASTEXITCODE)"};return $output}
function Send-Input([string]$command,[string]$text,[string]$file){
 $start=[Diagnostics.ProcessStartInfo]::new('ssh');$start.UseShellExecute=$false;$start.RedirectStandardInput=$true
 foreach($arg in $sshArgs){$start.ArgumentList.Add($arg)};$start.ArgumentList.Add($command)
 $process=[Diagnostics.Process]::Start($start)
 if($file){$stream=[IO.File]::OpenRead($file);try{$stream.CopyTo($process.StandardInput.BaseStream)}finally{$stream.Dispose()}}else{$bytes=[Text.Encoding]::UTF8.GetBytes($text);$process.StandardInput.BaseStream.Write($bytes,0,$bytes.Length)}
 $process.StandardInput.Close();$process.WaitForExit();if($process.ExitCode -ne 0){throw 'Remote stream operation failed'}
}
$envValues=@{}
foreach($line in (Get-Content (Join-Path $projectRoot 'server/.env'))){if($line -match '^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$'){$envValues[$Matches[1]]=$Matches[2].Trim()}}
if(!$envValues['MATH_APP_MIMO_API_KEY']){throw 'Model credential is not configured locally'}
$appId=(Get-Content (Join-Path $projectRoot 'project.config.json') -Raw|ConvertFrom-Json).appid
if($ConfigureOnly){
 if(!$envValues['MATH_APP_WECHAT_APP_SECRET']){throw 'Fill MATH_APP_WECHAT_APP_SECRET locally before configuring the deployed service'}
 # Safe first activation only. Never restart an already-authenticated, potentially busy service here.
 $guardPython="import pathlib; p=pathlib.Path('/etc/math-app/backend.env'); d=dict(line.split('=',1) for line in p.read_text().splitlines() if '=' in line); assert not d.get('MATH_APP_WECHAT_APP_SECRET'), 'Already configured: perform a separate idle/restart check'"
 $guard64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($guardPython))
 Remote ('sudo -n python3 -c "import base64;exec(base64.b64decode(''{0}''))"' -f $guard64)|Out-Null
}
# Never output credential values. Send selected credentials only over the approved SSH connection.
if(!$ConfigureOnly){
Remote "test ! -d /opt/math-app || sudo -n test -f /opt/math-app/.owner; ! systemctl cat math-app-backend.service >/dev/null 2>&1"|Out-Null

$release='r'+(Get-Date -Format 'yyyyMMdd-HHmmss')
$remoteRoot="/opt/math-app/releases/$release"
Remote "sudo -n install -d -m 755 /opt/math-app $remoteRoot; sudo -n sh -c 'printf math-app > /opt/math-app/.owner'; sudo -n install -d -m 700 /etc/math-app; sudo -n sh -c 'id math-app >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin math-app'; sudo -n install -d -m 700 -o math-app -g math-app /opt/math-app/data"|Out-Null
$archive=[IO.Path]::GetTempFileName()
try{
 $files=@('server/package.json','server/package-lock.json','微信小程序/utils/math-document.js','微信小程序/vendor/math/runtime.js')+@(Get-ChildItem (Join-Path $projectRoot 'server') -Filter '*.js' -File|ForEach-Object{'server/'+$_.Name})
 & tar -cf $archive -C $projectRoot @files;if($LASTEXITCODE -ne 0){throw 'Source archive failed'}
 Send-Input "sudo -n tar -xf - -C '$remoteRoot'" '' $archive
}finally{Remove-Item -LiteralPath $archive -Force}
}
$credentials=@{MATH_APP_MIMO_API_KEY=$envValues['MATH_APP_MIMO_API_KEY'];MATH_APP_WECHAT_APP_ID=$appId;MATH_APP_WECHAT_APP_SECRET=($envValues['MATH_APP_WECHAT_APP_SECRET']??'')}
$configPython=@'
import sys,json,os,secrets
values=json.load(sys.stdin);target='/etc/math-app/backend.env';old={}
if os.path.isfile(target):
 for line in open(target):
  if '=' in line:
   k,v=line.rstrip('\n').split('=',1);old[k]=v
values.update(HOST='127.0.0.1',PORT='17836',NODE_ENV='production',MATH_APP_PUBLIC_ACCESS='1',MATH_APP_SESSION_SECRET=old.get('MATH_APP_SESSION_SECRET') or secrets.token_hex(32),MATH_APP_USER_DAILY='30',MATH_APP_GLOBAL_DAILY='150')
for k,v in values.items():
 if '\n' in v or '\r' in v:raise SystemExit('Invalid environment value')
with open(target,'w') as f:
 for k,v in values.items():f.write(k+'='+v+'\n')
os.chmod(target,0o600)
print(json.dumps({'credentialsInstalled':True,'wechatSecretConfigured':bool(values['MATH_APP_WECHAT_APP_SECRET'])}))
'@
$encoded=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($configPython))
$configCommand='sudo -n python3 -c "import base64;exec(base64.b64decode(''{0}''))"' -f $encoded
Send-Input $configCommand ($credentials|ConvertTo-Json -Compress) ''
if($ConfigureOnly){
 Remote "sudo -n systemctl restart math-app-backend.service; for n in 1 2 3 4 5 6 7 8 9 10; do curl -fsS http://127.0.0.1:17836/api/health && exit 0; sleep 1; done; exit 1"|Out-Host
 Write-Output '{"configured":true,"modelCalls":0}'
 return
}
# Official runtime is checksum-verified and installed only within this project's root.
$runtimeScript=@'
set -eu
sudo install -d -m 755 /opt/math-app/runtime
cd /opt/math-app/runtime
test -s node-v24.13.1-linux-x64.tar.xz || sudo curl -fsSL --max-time 120 -x http://172.19.0.1:7890 https://nodejs.org/dist/v24.13.1/node-v24.13.1-linux-x64.tar.xz -o node-v24.13.1-linux-x64.tar.xz
test -s SHASUMS256.txt || sudo curl -fsSL --max-time 30 -x http://172.19.0.1:7890 https://nodejs.org/dist/v24.13.1/SHASUMS256.txt -o SHASUMS256.txt
grep ' node-v24.13.1-linux-x64.tar.xz$' SHASUMS256.txt | sha256sum -c -
sudo tar -xf node-v24.13.1-linux-x64.tar.xz
sudo env PATH=/opt/math-app/runtime/node-v24.13.1-linux-x64/bin:/usr/bin:/bin /opt/math-app/runtime/node-v24.13.1-linux-x64/bin/npm --prefix ROOT/server ci --omit=dev --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org --https-proxy=http://172.19.0.1:7890 --fetch-retries=0 --fetch-timeout=20000
sudo ln -s /opt/math-app/data ROOT/server/.runtime
'@
$runtimeScript=$runtimeScript.Replace('ROOT',$remoteRoot).Replace("`r`n","`n")
$runtime64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($runtimeScript))
Remote "printf %s '$runtime64' | base64 -d | sh"|Out-Host
$unit=@'
[Unit]
Description=Math APP experience-member backend
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=math-app
Group=math-app
WorkingDirectory=ROOT/server
ExecStart=/opt/math-app/runtime/node-v24.13.1-linux-x64/bin/node ROOT/server/server.js
EnvironmentFile=/etc/math-app/backend.env
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/math-app/data
CapabilityBoundingSet=
RestrictSUIDSGID=true
MemoryMax=384M
CPUQuota=75%
TasksMax=128
[Install]
WantedBy=multi-user.target
'@
$unit=$unit.Replace('ROOT',$remoteRoot).Replace("`r`n","`n")
$unit64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($unit))
Remote "printf %s '$unit64' | base64 -d | sudo -n tee /etc/systemd/system/math-app-backend.service >/dev/null; sudo -n systemctl daemon-reload; sudo -n systemctl enable --now math-app-backend.service; for n in 1 2 3 4 5 6 7 8 9 10; do curl -fsS http://127.0.0.1:17836/api/health && exit 0; sleep 1; done; exit 1"|Out-Host
if($Activate){
 $nginx=@'
# owner: math-app; model credentials stay in the isolated backend
location ^~ /math-app/api/ {
 client_max_body_size 12m;
 proxy_pass http://127.0.0.1:17836/api/;
 proxy_http_version 1.1;
 proxy_set_header Host $host;
 proxy_set_header X-Real-IP $remote_addr;
 proxy_set_header X-Forwarded-For $remote_addr;
 proxy_set_header X-Forwarded-Proto $scheme;
 proxy_read_timeout 100s;
 proxy_send_timeout 30s;
 proxy_buffering off;
 add_header Cache-Control "no-store" always;
}
'@
 $nginx64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($nginx))
 Remote "test ! -f /www/server/panel/vhost/nginx/extension/sparkye.cn/math-app.conf || grep -q 'owner: math-app' /www/server/panel/vhost/nginx/extension/sparkye.cn/math-app.conf; printf %s '$nginx64' | base64 -d | sudo -n tee /www/server/panel/vhost/nginx/extension/sparkye.cn/math-app.conf >/dev/null; sudo -n nginx -t; sudo -n nginx -s reload"|Out-Host
}
Write-Output (@{release=$release;deployment_target='infrastructure.zhaoshi-shared-server';publicActivated=[bool]$Activate;modelCalls=0;sourceRoot=$remoteRoot}|ConvertTo-Json -Compress)

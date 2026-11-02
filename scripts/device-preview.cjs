// Controller for the separately owned real-AppID preview instance only.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, '_work/device-preview/manifest.json');
const command = process.argv[2] || 'status';
if (command === 'prepare') {
  const crypto = require('node:crypto');
  const base = new URL(process.argv[3] || '');
  if (!['http:','https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw Error('A clean phone-accessible backend URL is required');
  const source = path.join(root, '微信小程序');
  const project = path.join(root, '_work/device-preview/project');
  const destination = path.join(project, 'miniprogram');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
  if (!/^wx[0-9a-f]{16}$/.test(config.appid)) throw Error('Registered AppID required');
  const files = [];
  function copy(directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      if (item.name.startsWith('.') || item.name === 'node_modules' || item.name === 'project.private.config.json') continue;
      const input = path.join(directory, item.name);
      if (item.isDirectory()) copy(input);
      else if (/\.(js|json|wxml|wxss|wxs|png|jpg|jpeg|svg|webp)$/.test(item.name)) {
        const relative = path.relative(source, input);const target = path.join(destination, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });const bytes=fs.readFileSync(input);fs.writeFileSync(target,bytes);
        files.push({ path: relative, sourceSha256: crypto.createHash('sha256').update(bytes).digest('hex') });
      }
    }
  }
  copy(source);
  const backend = base.href.replace(/\/$/, '');
  fs.writeFileSync(path.join(destination, 'utils/config.js'), '// Generated LAN preview config. No secrets.\nmodule.exports = { baseUrl: ' + JSON.stringify(backend) + ' }\n');
  config.miniprogramRoot = 'miniprogram/';config.libVersion = '3.17.6';
  fs.writeFileSync(path.join(project, 'project.config.json'), JSON.stringify(config,null,2));
  fs.writeFileSync(path.join(root,'_work/device-preview/source-snapshot.json'),JSON.stringify({sourceProject:root,sourceFiles:files,appid:config.appid,deviceBackend:backend,copiedUserHistory:false,copiedSecrets:false,scope:'source-only phone preview; no SDK startup/login/upload'},null,2));
  console.log(JSON.stringify({prepared:true,appid:config.appid,project,deviceBackend:backend,sourceFiles:files.length,appSecretUsed:false}));
  process.exit(0);
}
const methods = { status: 'Device.getStatus', login: 'Device.prepareLogin', preview: 'Device.preview' };
if (!methods[command]) throw Error('Use status, login or preview');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
if (manifest.owner !== 'math-app-device-preview' || path.resolve(manifest.sourceProject) !== root || path.resolve(manifest.profileRoot) !== path.join(root, 'private/device-preview-profile') || !Number.isInteger(manifest.controlPort) || manifest.controlPort === 9420) throw Error('Owned device preview manifest required');
const control = JSON.parse(fs.readFileSync(path.join(manifest.profileRoot, 'control.json'), 'utf8'));
if (typeof control.controlToken !== 'string' || control.controlToken.length < 24) throw Error('Private control token required');
const socket = new WebSocket('ws://127.0.0.1:' + manifest.controlPort);
const pending = new Map();
function send(method) { return new Promise((resolve,reject)=>{const id=randomUUID();const timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' did not finish; inspect status before retrying'))},120000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,controlToken:control.controlToken}));}); }
socket.onmessage = event => {const m=JSON.parse(event.data);if(!pending.has(m.id))return;const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);};
socket.onerror = () => {console.error('Owned device preview connection failed');process.exitCode=1;socket.close();};
socket.onopen = async () => {
  try {
    const status = await send('Device.getStatus');
    if (status.owner !== manifest.owner || status.pid !== manifest.pid || status.visibleWindows !== 0) throw Error('Endpoint identity/hidden-window check failed');
    const result = command === 'status' ? status : await send(methods[command]);
    const keys=['owner','pid','stage','authenticated','tourist','loginQrReady','previewReady','handoffUrl','appid','visibleWindows','deviceBackend','success','pending','message','errorMessage'];
    console.log(JSON.stringify(Object.fromEntries(keys.filter(k=>result[k]!==undefined).map(k=>[k,result[k]])),null,2));
  } catch(error) { console.error(error.message); process.exitCode=1; }
  finally { for(const p of pending.values())clearTimeout(p.timer);pending.clear();socket.close(); }
};

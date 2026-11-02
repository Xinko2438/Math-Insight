// Scoped control for the independently owned SDK device-preview instance.
// Browser handoff is read-only. Control nonce never enters HTML or public status.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

async function start({ sdk, get, ids, state, publish, profile, work, labProject, clean }) {
  const profileRoot = path.resolve(profile);
  const projectRoot = path.resolve(labProject);
  const loginFile = path.join(profileRoot, 'login.jpg');
  const previewFile = path.join(profileRoot, 'preview.jpg');
  const loginApi = sdk('./js/bef24913413ebf463d13c190774a4d64.js');
  const loginStatus = sdk('./js/d9456d78bca59f40a85f1293c91e163d.js').default.LOGIN_STATUS;
  const controlToken = crypto.randomBytes(32).toString('hex');
  const ws = sdk('ws');
  let authenticated = false;
  let tourist = false;
  let loginStarted = false;
  let loginFailed = false;
  let previewReady = false;
  let qrKind = 'none';
  let loginPromise;
  let previewPromise;
  let authRead;
  let handoffUrl = '';

  function rememberError(error) {
    state.deviceLastError = clean(String(error && error.message || error))
      .replace(/https?:\/\/\S+/gi, '[WeChat endpoint]')
      .replace(/(?:openid|uin|signature|encrypt_ticket)\s*[:=]\s*[^\s,;]+/gi, '[identity redacted]');
    publish(true);
  }
  function publicStatus() {
    return {
      stage: state.stage,
      authenticated,
      tourist,
      loginQrReady: qrKind === 'login' && fs.existsSync(loginFile),
      previewReady,
      loginPending: loginStarted && !authenticated && !loginFailed,
      loginFailed,
      busy: !!loginPromise || !!previewPromise,
      qrKind
    };
  }
  function controlStatus() {
    return {
      ...publicStatus(), owner: state.owner, pid: process.pid,
      visibleWindows: state.visibleWindows || 0,
      deviceGatewayReady: !!state.deviceGatewayReady,
      handoffUrl, appid: state.appid, deviceBackend: state.deviceBackend
    };
  }
  async function refreshAuthentication() {
    if (authRead) return authRead;
    authRead = (async () => {
      const [login, user] = await Promise.all([
        loginApi.isLogin(), get(ids.IGlobalStoreService).get('userInfo')
      ]);
      tourist = !!(user && user.isTourist);
      authenticated = !!login.login && !!user && !tourist;
      const attempt = loginApi.getLoginResult();
      loginFailed = loginStarted && attempt.loginStatus === loginStatus.FAIL;
      state.deviceAuthenticated = authenticated;
      state.deviceTourist = tourist;
      if (authenticated) {
        if (qrKind === 'login') qrKind = 'none';
        state.stage = previewReady ? 'DEVICE_PREVIEW_READY' : 'DEVICE_AUTHENTICATED';
      } else {
        previewReady = false;
        if (qrKind === 'preview') qrKind = 'none';
        state.stage = 'DEVICE_LOGIN_REQUIRED';
      }
      publish(true);
      return controlStatus();
    })().finally(() => { authRead = undefined; });
    return authRead;
  }
  async function prepareLogin() {
    await refreshAuthentication();
    if (authenticated) return { ...controlStatus(), success: true, prepared: false };
    if (loginPromise) return loginPromise;
    if (qrKind === 'login' && !loginFailed) return { ...controlStatus(), success: true, prepared: true };
    loginPromise = (async () => {
      await loginApi.login({ cli: true, from: 'math-app-device-preview', 'qr-format': 'image', 'qr-output': loginFile });
      if (!fs.existsSync(loginFile)) throw Error('Official login QR was not saved');
      loginStarted = true; loginFailed = false; qrKind = 'login';
      state.stage = 'DEVICE_LOGIN_REQUIRED';
      publish(true);
      return { ...controlStatus(), success: true, prepared: true };
    })().finally(() => { loginPromise = undefined; });
    return loginPromise;
  }
  async function preview() {
    await refreshAuthentication();
    if (!authenticated) throw Object.assign(Error('请先用有该 AppID 权限的微信扫码登录。'), { publicCode: 'DEVICE_LOGIN_REQUIRED' });
    if (previewReady) return { ...controlStatus(), success: true };
    if (previewPromise) return previewPromise;
    previewPromise = (async () => {
      const project = await get(ids.ICLIUtilsService).formatProject(projectRoot);
      if (path.resolve(project.projectpath) !== projectRoot || project.appid !== state.appid) {
        throw Error('Preview project does not match this isolated instance');
      }
      // The official helper sets uploadType:'test' for isPreview:true. Never
      // call its separate upload() / uploadType:'upload' experience workflow.
      const result = await sdk('./js/13ff54aebf81f1760f82320713227f2b.js').preview({
        project, 'qr-format': 'image', 'qr-output': previewFile,
        cli: true, from: 'math-app-device-preview'
      });
      if (!result || !result.websocket || !result.websocket.success || !fs.existsSync(previewFile)) {
        throw Error('Official preview did not produce a QR image');
      }
      previewReady = true; qrKind = 'preview';
      state.stage = 'DEVICE_PREVIEW_READY'; state.devicePreviewReady = true;
      publish(true);
      return { ...controlStatus(), success: true };
    })().finally(() => { previewPromise = undefined; });
    return previewPromise;
  }

  await refreshAuthentication().catch(error => { state.stage = 'DEVICE_LOGIN_REQUIRED'; rememberError(error); });
  const controlServer = new ws.Server({
    host: '127.0.0.1', port: 0, maxPayload: 16 * 1024,
    verifyClient(info, done) {
      done(!Object.prototype.hasOwnProperty.call(info.req.headers, 'origin'), 403, 'Browser control is disabled');
    }
  });
  await new Promise((resolve, reject) => { controlServer.once('listening', resolve); controlServer.once('error', reject); });
  const controlAddress = typeof controlServer.address === 'function' ? controlServer.address() : controlServer._server.address();
  const controlPort = controlAddress.port;
  let handoffPort;
  const handoffServer = http.createServer(async (request, response) => {
    const host = request.headers.host || '';
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const allowedHost = host === '127.0.0.1:' + handoffPort || host === 'localhost:' + handoffPort;
    const allowedOrigin = !request.headers.origin || request.headers.origin === 'http://' + host;
    const topLevelHandoff = pathname === '/' && request.headers['sec-fetch-mode'] === 'navigate' && request.headers['sec-fetch-dest'] === 'document';
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (!allowedHost || !allowedOrigin || (request.headers['sec-fetch-site'] === 'cross-site' && !topLevelHandoff)) {
      response.writeHead(403); response.end('Forbidden'); return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405); response.end('Read-only'); return;
    }
    if (pathname === '/') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(request.method === 'HEAD' ? undefined : handoffHtml); return;
    }
    if (pathname === '/status') {
      await refreshAuthentication().catch(rememberError);
      response.setHeader('Content-Type', 'application/json');
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify(publicStatus())); return;
    }
    if (pathname === '/code.jpg') {
      const file = qrKind === 'login' ? loginFile : qrKind === 'preview' && previewReady ? previewFile : null;
      if (!file || !fs.existsSync(file)) { response.writeHead(404); response.end('QR not ready'); return; }
      const bytes = fs.readFileSync(file);
      const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      const jpeg = bytes[0] === 255 && bytes[1] === 216;
      if (!png && !jpeg) { response.writeHead(503); response.end('QR not ready'); return; }
      response.setHeader('Content-Type', png ? 'image/png' : 'image/jpeg');
      response.end(request.method === 'HEAD' ? undefined : bytes); return;
    }
    response.writeHead(404); response.end('Not found');
  });
  await new Promise((resolve, reject) => { handoffServer.once('error', reject); handoffServer.listen(0, '127.0.0.1', resolve); });
  handoffPort = handoffServer.address().port;
  handoffUrl = 'http://127.0.0.1:' + handoffPort + '/';
  fs.writeFileSync(path.join(profileRoot, 'control.json'), JSON.stringify({ controlToken }, null, 2), { mode: 0o600 });
  const manifestFile = path.join(work, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8').replace(/^\uFEFF/, ''));
  Object.assign(manifest, { controlPort, handoffUrl });
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
  Object.assign(state, { controlPort, handoffUrl, deviceGatewayReady: true });
  publish(true);

  controlServer.on('connection', socket => socket.on('message', async bytes => {
    let request;
    try {
      request = JSON.parse(String(bytes));
      const supplied = typeof request.controlToken === 'string' ? Buffer.from(request.controlToken) : Buffer.alloc(0);
      const expected = Buffer.from(controlToken);
      if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) throw Object.assign(Error('Control authentication failed'), { publicCode: 'CONTROL_AUTH_REQUIRED' });
      let result;
      if (request.method === 'Device.getStatus') { await refreshAuthentication(); result = controlStatus(); }
      else if (request.method === 'Device.prepareLogin') result = await prepareLogin();
      else if (request.method === 'Device.preview') result = await preview();
      else throw Object.assign(Error('Device command excluded'), { publicCode: 'METHOD_EXCLUDED' });
      if (socket.readyState === ws.OPEN) socket.send(JSON.stringify({ id: request.id, result }));
    } catch (error) {
      rememberError(error);
      const code = error.publicCode || (/^[A-Z0-9_]{1,60}$/.test(error.code || '') ? error.code : 'DEVICE_ACTION_FAILED');
      const message = code === 'DEVICE_LOGIN_REQUIRED' ? '请先扫码登录独立实例。' : code === 'CONTROL_AUTH_REQUIRED' ? 'Control authentication required' : code === 'METHOD_EXCLUDED' ? 'Device command excluded' : '微信开发工具未能完成本次操作；诊断已留在独立资料目录。';
      if (socket.readyState === ws.OPEN) socket.send(JSON.stringify({ id: request && request.id, error: { code, message } }));
    }
  }));
  const poll = setInterval(() => { refreshAuthentication().catch(rememberError); }, 1800);
  poll.unref();
  return { controlPort, handoffUrl };
}

const handoffHtml = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>小程序手机预览</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#182237;font:16px/1.7 system-ui,"Microsoft YaHei",sans-serif}main{max-width:680px;margin:45px auto;padding:28px}h1{font-size:24px;font-weight:600;margin:0 0 12px}p{margin:12px 0;color:#526178}#code{display:none;width:290px;max-width:100%;height:auto;padding:12px;background:#fff;border:1px solid #dce4ef;border-radius:12px}#status{font-weight:600;color:#2455d6}.small{font-size:14px}</style><main><h1>小程序手机预览</h1><p id="status" role="status">正在连接独立测试实例…</p><img id="code" alt="微信官方二维码"><p id="help">请稍候。</p><p class="small">这是独立后台实例。此页只显示官方二维码和状态，不读取或修改你的现有开发者工具窗口。</p></main><script>let lastKind='none',lastReload=0;async function update(){try{const s=await(await fetch('/status',{cache:'no-store'})).json();const code=document.getElementById('code');let title,help;if(s.previewReady){title='预览二维码已就绪';help='用该小程序管理员或开发者的微信扫码，在手机上打开预览。'}else if(s.authenticated){title=s.busy?'正在生成手机预览…':'已登录，等待生成手机预览';help='登录已完成，无需再扫登录二维码。'}else{title=s.loginFailed?'登录未完成或二维码已过期':'需要扫码登录独立实例';help='使用有该小程序权限的微信扫描下方二维码，并在手机上确认登录。'}document.getElementById('status').textContent=title;document.getElementById('help').textContent=help;if(s.qrKind!=='none'){if(lastKind!==s.qrKind||Date.now()-lastReload>6000){code.src='/code.jpg?t='+Date.now();lastKind=s.qrKind;lastReload=Date.now();}code.style.display='block';code.alt=s.qrKind==='login'?'微信官方登录二维码':'微信官方小程序预览二维码';}else{code.style.display='none';lastKind='none';}}catch{document.getElementById('status').textContent='暂时无法连接独立实例';}}update();setInterval(update,1800);</script></html>`;

module.exports = { start };

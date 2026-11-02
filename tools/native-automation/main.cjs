// Dedicated, never-visible host for the installed native DevTools engine.
// No attachment to the user's Electron process, profile, windows or clipboard.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const crypto = require('node:crypto');
const realElectron = require('electron');
const { createFacade } = require('./policy.cjs');
const repo = path.resolve(process.env.MATH_APP_RUNNER_REPO || '');
const work = path.resolve(process.env.MATH_APP_RUNNER_WORK || '');
const profile = path.resolve(process.env.MATH_APP_RUNNER_PROFILE || '');
const vendor = process.env.MATH_APP_VENDOR_ASAR || 'D:/Program Files (x86)/Tencent/微信web开发者工具/resources/app.asar';
const deviceMode = process.env.MATH_APP_RUNNER_MODE === 'DevicePreview';
const fixtureProfile = process.env.MATH_APP_NATIVE_FIXTURE || '';
if (fixtureProfile && (!['multiline-bare', 'text-matrix', 'supported-text', 'supported-all'].includes(fixtureProfile) || deviceMode)) throw Error('Unknown or unsupported UI-only diagnostic fixture');
const sourceLibVersion = JSON.parse(fs.readFileSync(path.join(repo, 'project.config.json'), 'utf8')).libVersion || '3.17.6';
const targetLibVersion = process.env.MATH_APP_NATIVE_LIB_VERSION || sourceLibVersion;
if (!['3.17.6', '3.12.1'].includes(targetLibVersion) || targetLibVersion !== sourceLibVersion && !fixtureProfile) throw Error('Library override is restricted to named diagnostic profiles');
const blockOverride = process.env.MATH_APP_NATIVE_BLOCK_DEFAULT || '';
if (blockOverride && (!fixtureProfile || !['true', 'false'].includes(blockOverride))) throw Error('Layout override is restricted to named diagnostic profiles');
if (!repo || !work.startsWith(repo + path.sep) || !profile.startsWith(repo + path.sep)) throw Error('Owned isolation roots are required');
if (process.versions.electron !== '36.6.0' || process.versions.modules !== '135') throw Error('Native ABI does not match the installed engine');
const statusPath = path.join(profile, 'status.json');
const manifestPath = path.join(work, 'manifest.json');
const labProject = path.join(work, 'project');
const state = { owner: deviceMode ? 'math-app-device-preview' : 'math-app-native-offscreen', pid: process.pid, stage: 'STARTING', sourceProject: repo, project: labProject, profileRoot: profile, hiddenOnly: true, windows: [], frames: 0, blockedHostEffects: 0, visibleWindows: 0, copiedUserProfile: false, modelRequests: 0 };
let lastWrite = 0;
function publish(force = false) {
  if (!force && Date.now() - lastWrite < 700) return;
  lastWrite = Date.now();
  fs.writeFileSync(statusPath, JSON.stringify(state, null, 2));
}
function note(type, details) {
  if (type === 'owned-window-created') state.windows.push({ ...details, frames: 0 });
  if (type === 'owned-window-closed') { const window = state.windows.find(w => w.id === details.id); if (window) window.closed = true; }
  if (type === 'owned-frame') { state.frames++; const w = state.windows.find(w => w.id === details.id); if (w) Object.assign(w, { frames: w.frames + 1, width: details.width, height: details.height }); }
  if (type === 'blocked-host-effect') state.blockedHostEffects++;
  if (type === 'manual-action-required') state.manualAction = details;
  if (type === 'visibility-violation') { state.visibleWindows++; state.stage = 'STOPPED_ON_VISIBILITY_VIOLATION'; publish(true); realElectron.app.exit(91); }
  publish();
}
fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync(work, { recursive: true });
publish(true);
process.on('uncaughtException', error => { state.stage = 'ERROR'; state.error = clean(error.message); publish(true); realElectron.app.exit(90); });
process.on('unhandledRejection', error => { state.lastError = clean(String(error && error.message || error)); publish(true); });
function clean(text) { return text.replace(/(token|secret|password|skey|ticket)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]').slice(0, 450); }

// Bootstrap paths before loading any SDK module. In particular, both home AND
// temp must be isolated: the vendor bootstrap contains a legacy-data migration.
const labHome = path.join(profile, 'home');
const locations = { home: labHome, userData: path.join(profile, 'electron-data'), sessionData: path.join(profile, 'session-data'), temp: path.join(profile, 'temp'), appData: path.join(labHome, 'AppData/Roaming'), logs: path.join(profile, 'logs'), crashDumps: path.join(profile, 'crashes') };
for (const [name, directory] of Object.entries(locations)) { fs.mkdirSync(directory, { recursive: true }); realElectron.app.setPath(name, directory); }
process.env.USERPROFILE = labHome;
process.env.LOCALAPPDATA = path.join(labHome, 'AppData/Local');
process.env.APPDATA = locations.appData;
process.env.TEMP = locations.temp;
process.env.TMP = locations.temp;
realElectron.app.setAppPath(vendor);
realElectron.app.setName('微信开发者工具');
const facade = createFacade(realElectron, note, { profileRoot: profile });
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron' || request === 'electron/main') return facade;
  return originalLoad.call(this, request, parent, isMain);
};
global.__mathNativePolicyReady = true;
const sdk = Module.createRequire(path.join(vendor, 'package.json'));

function copySources() {
  const miniSource = path.join(repo, '微信小程序');
  const destination = path.join(labProject, 'miniprogram');
  const entries = [];
  function copy(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name === 'project.private.config.json') continue;
      const source = path.join(directory, entry.name);
      if (entry.isDirectory()) copy(source);
      else if (/\.(js|json|wxml|wxss|wxs|png|jpg|jpeg|svg|webp)$/.test(entry.name)) {
        const relative = path.relative(miniSource, source); const target = path.join(destination, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true }); const bytes = fs.readFileSync(source); fs.writeFileSync(target, bytes);
        entries.push({ path: relative, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
      }
    }
  }
  copy(miniSource);
  // Explicit diagnostic projection, never product-source changes. The connector
  // must opt into this named fixture and verify original AND projected hashes.
  if (fixtureProfile) {
    let overrides = {
      'app.wxss': '',
      'pages/input/input.wxss': '',
      'pages/input/input.wxml': '<view style="padding-top:100px"><textarea class="form-textarea" value="{{question}}" bindinput="onQuestionInput" auto-height /></view>',
      'pages/result/result.wxss': '',
      'pages/result/result.wxml': '<view style="padding-top:100px"><text class="solution">{{result.solution}}</text></view>'
    };
    if (fixtureProfile === 'text-matrix') {
      const cases = [
        ['native-default', '', 'lf'], ['sans-serif', 'font-family:sans-serif;', 'lf'],
        ['arial', 'font-family:Arial;', 'lf'], ['yahei', 'font-family:Microsoft YaHei;', 'lf'],
        ['cjk-first', 'font-family:Microsoft YaHei,Arial;', 'lf'], ['arial-first', 'font-family:Arial,Microsoft YaHei;', 'lf'],
        ['block', 'display:block;', 'lf'], ['pre-line', 'white-space:pre-line;', 'lf'],
        ['unicode-ls', '', 'ls'], ['unicode-ps', '', 'ps'], ['crlf', '', 'crlf'], ['chinese-first', '', 'zh'],
        ['wx-pre-edit', 'white-space:-wx-pre-edit;', 'lf'], ['yahei-pre-edit', 'font-family:Microsoft YaHei;white-space:-wx-pre-edit;', 'lf'],
        ['apple-system', 'font-family:-apple-system-font;', 'lf'], ['system-ui', 'font-family:system-ui;', 'lf'],
        ['max-lines', '', 'lf', ' max-lines="{{99}}"']
      ];
      const markup = cases.map(([name, style, value, attrs = ''], index) => '<view class="case-' + index + '" style="padding:10px;box-sizing:border-box;border-bottom:1px solid #ddd"><text style="display:block;font-size:12px;color:#555">' + name + '</text><text class="text-' + index + '"' + attrs + ' style="font-size:18px;line-height:1.8;' + style + '">{{' + value + '}}</text><textarea class="input-' + index + '" style="width:340px;min-height:24px;font-size:18px;line-height:1.8;' + style + '" value="{{' + value + '}}" auto-height /></view>').join('');
      overrides['pages/input/input.wxml'] = '<view style="padding-top:90px"><scroll-view class="probe-scroll" type="list" scroll-y style="height:650px"><view>' + markup + '</view></scroll-view></view>';
      state.fixtureCases = cases.map(([name, style, value]) => ({ name, style, value }));
    }
    if (fixtureProfile === 'supported-text') {
      overrides = {};
      for (const name of ['input', 'result']) {
        const relative = 'pages/' + name + '/' + name + '.json';
        const config = JSON.parse(fs.readFileSync(path.join(miniSource, relative), 'utf8'));
        config.renderer = 'webview';
        overrides[relative] = JSON.stringify(config);
      }
      state.fixtureOptions = { pageRenderers: { input: 'webview', result: 'webview' } };
    }
    if (fixtureProfile === 'supported-all') {
      const config = JSON.parse(fs.readFileSync(path.join(miniSource, 'app.json'), 'utf8'));
      config.renderer = 'webview';
      overrides = { 'app.json': JSON.stringify(config) };
      state.fixtureOptions = { renderer: 'webview', componentFramework: config.componentFramework };
    }
    if (['multiline-bare', 'text-matrix', 'supported-text'].includes(fixtureProfile)) {
      const config = JSON.parse(fs.readFileSync(path.join(miniSource, 'app.json'), 'utf8'));
      config.renderer = 'skyline';
      config.componentFramework = 'glass-easel';
      overrides['app.json'] = JSON.stringify(config);
    }
    if (blockOverride) {
      const app = JSON.parse(overrides['app.json'] || fs.readFileSync(path.join(miniSource, 'app.json'), 'utf8'));
      app.rendererOptions.skyline.defaultDisplayBlock = blockOverride === 'true';
      overrides['app.json'] = JSON.stringify(app);
      state.fixtureOptions = { defaultDisplayBlock: blockOverride === 'true' };
    }
    for (const [relative, text] of Object.entries(overrides)) {
      const item = entries.find(entry => entry.path === relative.split('/').join(path.sep));
      if (!item) throw Error('Diagnostic source missing: ' + relative);
      const bytes = Buffer.from(text);
      item.sourceSha256 = item.sha256;
      item.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      item.fixtureProfile = fixtureProfile;
      fs.writeFileSync(path.join(destination, relative), bytes);
    }
    state.fixtureProfile = fixtureProfile;
  }
  const config = JSON.parse(fs.readFileSync(path.join(repo, 'project.config.json'), 'utf8'));
  config.miniprogramRoot = 'miniprogram/'; config.libVersion = targetLibVersion;
  // Official local UI test mode. Never replace the source project's AppID.
  if (deviceMode) {
    if (!/^wx[0-9a-f]{16}$/.test(config.appid)) throw Error('A registered source AppID is required');
    const baseUrl = new URL(process.env.MATH_APP_DEVICE_BASE_URL || '');
    if (!['http:','https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) throw Error('Invalid device backend URL');
    const override = Buffer.from('// Generated device-preview configuration. No secrets.\nmodule.exports = { baseUrl: ' + JSON.stringify(baseUrl.href.replace(/\/$/,'')) + ' }\n');
    fs.writeFileSync(path.join(destination,'utils/config.js'),override);
    const item=entries.find(x=>x.path===path.join('utils','config.js')); if(item){item.sourceSha256=item.sha256;item.sha256=crypto.createHash('sha256').update(override).digest('hex');item.deviceOverride=true;}
    state.projectMode = 'registered-appid-device-preview';state.appid=config.appid;state.deviceBackend=baseUrl.href.replace(/\/$/,'');
  } else {
    config.appid = 'touristappid';
    state.projectMode = 'official-tourist-ui-only';
  }
  fs.writeFileSync(path.join(labProject, 'project.config.json'), JSON.stringify(config, null, 2));
  fs.writeFileSync(path.join(work, 'source-snapshot.json'), JSON.stringify({ sourceProject: repo, fixtureProfile, libVersion: targetLibVersion, copiedFiles: entries, copiedServerSecrets: false, copiedPrivateConfig: false }, null, 2));
  state.sourceFiles = entries.length;
}
copySources();

if (!process.env.MATH_APP_RUNNER_INJECTED) require(path.join(vendor, 'js/electron/main.js'));
realElectron.app.whenReady().then(async () => {
  state.stage = 'SDK_INITIALIZING'; publish(true);
  // In the packaged-host path our policy is loaded before the actual SDK entry.
  // Let that entry establish its own runtime context before importing services.
  if (process.env.MATH_APP_RUNNER_INJECTED) {
    const until = Date.now() + 30000;
    while (typeof global.directRequire !== 'function' && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 100));
    if (typeof global.directRequire !== 'function') throw Error('Packaged SDK main did not initialize');
  }
  const get = sdk('./js/9eee66f818065fa6881814a83bcfe0cf.js').default;
  const interfaces = sdk('./js/36bdd018ddae3596c5b9230a8f320bb2.js');
  const backendInterface = sdk('./js/4fdee3ffa4f4ee7d078032463baf85dc.js');
  const bridgeInterface = sdk('./js/7c6904c45555b535152eb890ace1ac1e.js');
  const deadline = Date.now() + 50000;
  let windows;
  while (Date.now() < deadline) {
    try { windows = get(interfaces.IWindowService); const list = await windows.getAllWindowInfos(); if (list.length && state.frames) break; } catch { }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  if (!windows || !state.frames) throw Error('SDK did not produce an offscreen frame');
  state.stage = 'SDK_HIDDEN_FRAME_READY'; publish(true);
  if (deviceMode) {
    await require('./device-preview.cjs').start({sdk,get,ids:interfaces,state,publish,profile,work,labProject,clean});
    return;
  }
  const all = realElectron.BrowserWindow.getAllWindows();
  const entrance = all.find(w => !w.isDestroyed());
  if (entrance) {
    const text = await entrance.webContents.executeJavaScript('document.body ? document.body.innerText : ""').catch(() => '');
    if (/扫码登录|扫描二维码.*登录|微信扫码|微信登录/.test(text)) {
      state.stage = 'USER_LOGIN_REQUIRED';
      const image = await entrance.capturePage();
      fs.writeFileSync(path.join(profile, 'authorization.png'), image.toPNG());
      state.authorizationImage = path.join(profile, 'authorization.png');
      publish(true);
      return;
    }
  }
  state.stage = 'OPENING_ISOLATED_PROJECT'; publish(true);
  const cfg = await get(interfaces.IProjectConfigService).getProjectMergeConfig({ projectpath: labProject });
  state.resolvedProjectMode = cfg.appid === 'touristappid' ? 'tourist' : 'other';
  sdk('./js/652f0ce7061ea61b4665d3545d9d76ec.js').setMcpBootstrapEnabled(cfg.projectid || labProject, true);
  const winId = await windows.openProjectWindow(labProject, {
    projectid: cfg.projectid || labProject, projectname: encodeURIComponent('Math-APP dedicated acceptance'), projectpath: labProject,
    query: { appid: cfg.appid, trustProject: '1', openSource: 'cli' }, show: false
  });
  await windows.waitWindowRealOpend(winId);
  // An empty tourist profile initially selects 2.31.0 even when the public
  // project config requests 3.17.6. Use the SDK's own renderer action (which
  // also persists its private project selection) before starting automation.
  const projectWindow = realElectron.BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && /electron-project\.html/.test(w.webContents.getURL()));
  if (!projectWindow || projectWindow.isVisible()) throw Error('Owned hidden project renderer required');
  const initialized = await projectWindow.webContents.executeJavaScript(`(async () => {
    const local = require('module').createRequire(${JSON.stringify(path.join(vendor, 'package.json'))})
    const get = local('./js/9eee66f818065fa6881814a83bcfe0cf.js').default
    const ids = local('./js/36bdd018ddae3596c5b9230a8f320bb2.js')
    const store = get(ids.IStoreService)
    if (store.getState().project.current.projectpath !== ${JSON.stringify(labProject)}) throw Error('Project trust is limited to the source-only test copy')
    if (!store.getState().user.isTourist) await store.dispatch(local('./js/2714be6cfa3eef7ae9c1934282860836.js').default.loginAsTouristUser())
    // This is our reviewed source copy, whose execution the user authorized.
    // Never trust a project or accept a dialog in the user's SDK profile.
    await store.dispatch(local('./js/dccf81697d09871142273f7c1e53d534.js').setProjectTrusted(true))
    await store.dispatch(local('./js/dccf81697d09871142273f7c1e53d534.js').setProjectLibVersion(${JSON.stringify(targetLibVersion)}))
    return { tourist: !!store.getState().user.isTourist, version: store.getState().project.current.libVersion }
  })()`);
  if (!initialized.tourist || initialized.version !== targetLibVersion) throw Error('Tourist / target library initialization failed');
  state.guestSelected = initialized.tourist;
  state.sdkVersion = initialized.version;
  // Same logical panel initialization performed by the installed CLI helper.
  // These are panels inside our hidden instance, never host-window show/focus.
  const actions = sdk('./js/7f5f6188729adda606437b8a916cd517.js').ean;
  const transfer = get(interfaces.ITransferActionService);
  transfer.dispatchClientAction(winId, actions.window.setSimulatorShowSetting, true);
  transfer.dispatchClientAction(winId, actions.window.setDebugShowSetting, true);
  const backends = get(backendInterface.IBackendProcessManagerService);
  let backendId;
  for (let i = 0; i < 50; i++) { backendId = await backends.getBackendWinIdByWebWinId(winId).catch(() => null); if (backendId) break; await new Promise(resolve => setTimeout(resolve, 250)); }
  if (!backendId) throw Error('Isolated project backend not ready');
  state.stage = 'WAITING_FOR_NATIVE_PAGE'; publish(true);
  await projectWindow.webContents.executeJavaScript(`(async () => {
    const local = require('module').createRequire(${JSON.stringify(path.join(vendor, 'package.json'))})
    const get = local('./js/9eee66f818065fa6881814a83bcfe0cf.js').default
    const ids = local('./js/36bdd018ddae3596c5b9230a8f320bb2.js')
    const store = get(ids.IStoreService)
    await get(local('./js/7c6904c45555b535152eb890ace1ac1e.js').IAutomatorBridgeService).ensureStarted()
    // No editor drafts exist in this source-only test copy. Immediate compile
    // avoids the editor-save message path, which can wait on editor startup.
    await store.dispatch(local('./js/6bb292016bb562d1abc8f84dc151a082.js').default.compileImmediate({ origin: local('./js/d9456d78bca59f40a85f1293c91e163d.js').default.COMPILE_ORIGIN.HTTP }))
    const until = Date.now() + 45000
    while (Date.now() < until) {
      const s = store.getState().simulator
      if (s.appLaunched && s.oneWebviewReady) return true
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    throw Error('Native page never reached appLaunched / oneWebviewReady')
  })()`);
  state.bootstrapRequested = true;
  state.nativePageReady = true;
  const wsPackage = sdk('ws');
  const server = new wsPackage.Server({ host: '127.0.0.1', port: 0, maxPayload: 32 * 1024 * 1024 });
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = typeof server.address === 'function' ? server.address() : server._server.address();
  state.automationPort = address.port;
  state.projectWindowReady = true; state.stage = 'NATIVE_PAGE_READY';
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
  Object.assign(manifest, { automationPort: state.automationPort, hiddenOnly: true }); fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  server.on('connection', socket => socket.on('message', async data => {
    let request;
    try {
      request = JSON.parse(String(data));
      if (request.method === 'Lab.getStatus') { socket.send(JSON.stringify({ id: request.id, result: state })); return; }
      if (request.method === 'Lab.selectTourist') {
        if (state.resolvedProjectMode !== 'tourist') throw Error('Guest action is limited to the isolated tourist test project');
        const win = realElectron.BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && /electron-project\.html/.test(w.webContents.getURL()));
        if (!win) throw Error('Dedicated project renderer not ready');
        const result = await win.webContents.executeJavaScript(`(async () => {
          const local = require('module').createRequire(${JSON.stringify(path.join(vendor,'package.json'))})
          const get = local('./js/9eee66f818065fa6881814a83bcfe0cf.js').default
          const ids = local('./js/36bdd018ddae3596c5b9230a8f320bb2.js')
          const actions = local('./js/2714be6cfa3eef7ae9c1934282860836.js').default
          const store = get(ids.IStoreService)
          await store.dispatch(actions.loginAsTouristUser())
          return { tourist: !!store.getState().user.isTourist }
        })()`);
        state.guestSelected = result.tourist; publish(true);
        socket.send(JSON.stringify({ id: request.id, result })); return;
      }
      if (request.method === 'Lab.getLoginStatus') {
        const api = sdk('./js/bef24913413ebf463d13c190774a4d64.js');
        const login = await api.isLogin();
        socket.send(JSON.stringify({ id: request.id, result: { login: login.login, attempt: api.getLoginResult() } })); return;
      }
      if (request.method === 'Lab.prepareLogin') {
        const api = sdk('./js/bef24913413ebf463d13c190774a4d64.js');
        if ((await api.isLogin()).login) { socket.send(JSON.stringify({ id: request.id, result: { login: true } })); return; }
        const authorizationImage = path.join(profile, 'authorization.jpg');
        // Official QR login API: the user scans/confirms; no automated login UI.
        await api.login({ cli: true, from: 'math-app-isolated-acceptance', 'qr-format': 'image', 'qr-output': authorizationImage });
        state.stage = 'USER_AUTHORIZATION_REQUIRED'; state.authorizationImage = authorizationImage;
        publish(true);
        socket.send(JSON.stringify({ id: request.id, result: { authorizationImage, provider: 'WeChat DevTools', existingProfileImported: false } })); return;
      }
      if (request.method === 'Lab.getOwnedWindows') {
        const list = [];
        for (const win of realElectron.BrowserWindow.getAllWindows()) {
          if (win.isDestroyed()) continue;
          const url = win.webContents.getURL();
          const filename = (() => { try { return path.basename(new URL(url).pathname); } catch { return 'initializing'; } })();
          const text = await win.webContents.executeJavaScript('document.body ? document.body.innerText : ""').catch(() => '');
          list.push({ id: win.id, page: filename, title: win.getTitle(), visible: win.isVisible(), loginPrompt: /扫码|扫一扫|登录|log.?in/i.test(text) });
        }
        socket.send(JSON.stringify({ id: request.id, result: list })); return;
      }
      if (!/^(Tool\.getInfo|App\.(getCurrentPage|getPageStack|callFunction|callWxMethod|mockWxMethod|captureScreenshot|enableLog|CDPEnable|CDPListProtocol|CDPCommand)|Page\.(getElement|getElements|getData|setData|callMethod)|Element\.(getElement|getElements|getDOMProperties|getStyles|getOffset|getWXML|getData|callMethod|callFunction))$/.test(request.method)) throw Error('Method excluded from isolated UI acceptance');
      const result = await transfer.callClientService(backendId, bridgeInterface.IAutomatorBridgeService, 'request', [JSON.stringify(request)]);
      if (socket.readyState === wsPackage.OPEN) socket.send(result);
    } catch (error) { if (socket.readyState === wsPackage.OPEN) socket.send(JSON.stringify({ id: request && request.id, error: { message: clean(error.message) } })); }
  }));
  for (const win of realElectron.BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    const page = win.webContents.getURL();
    if (/login/i.test(page)) {
      const image = await win.capturePage();
      fs.writeFileSync(path.join(profile, 'authorization.png'), image.toPNG());
      state.authorizationImage = path.join(profile, 'authorization.png');
      state.userLoginMayBeRequired = true;
    }
  }
  publish(true);
}).catch(error => { state.stage = 'SDK_START_FAILED'; state.error = clean(error.message); publish(true); });

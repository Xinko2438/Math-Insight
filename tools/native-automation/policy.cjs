// Applied only inside the independently launched Electron process.
// Never attaches to or changes the user's running DevTools process.
const path = require('node:path');

function createFacade(real, report = () => {}, options = {}) {
  const blockedWindowMethods = ['show','showInactive','focus','restore','maximize','setFullScreen','setAlwaysOnTop'];
  const HiddenWindow = new Proxy(real.BrowserWindow, {
    construct(Target, args) {
      const config = args[0] || {};
      const window = Reflect.construct(Target, [{ ...config, show: false, skipTaskbar: true, focusable: false,
        webPreferences: { ...(config.webPreferences || {}), offscreen: true, backgroundThrottling: false } }]);
      report('owned-window-created', { id: window.id, show: false, offscreen: true });
      for (const method of blockedWindowMethods) Object.defineProperty(window, method, {
        configurable: true,
        value: () => report('blocked-host-effect', { method: 'window.' + method, id: window.id })
      });
      Object.defineProperty(window, 'capturePage', { configurable: true,
        value: (rect, captureOptions = {}) => window.webContents.capturePage(rect, { ...captureOptions, stayHidden: true, stayAwake: true }) });
      window.webContents.setFrameRate(3);
      window.webContents.setWindowOpenHandler(details => { report('manual-action-required', { type: 'new-window', urlOrigin: safeOrigin(details.url) }); return { action: 'deny' }; });
      if (typeof window.webContents.openDevTools === 'function') window.webContents.openDevTools = () => report('blocked-host-effect', { method: 'openDevTools' });
      window.webContents.on('paint', (_event, rect, frame) => {
        const size = frame.getSize();
        report('owned-frame', { id: window.id, width: size.width, height: size.height });
      });
      window.on('show', () => report('visibility-violation', { id: window.id }));
      window.on('closed', () => report('owned-window-closed', { id: window.id }));
      return window;
    }
  });
  const facadeObjects = {
    app: new Proxy(real.app, { get(target, name) {
      if (['focus','relaunch','addRecentDocument','setJumpList'].includes(name)) return () => report('blocked-host-effect', { method: 'app.' + name });
      if (name === 'setPath' && options.profileRoot) return (key, value) => {
        if (['home','userData','sessionData','temp','appData','logs','crashDumps'].includes(key)) {
          const relative = path.relative(options.profileRoot, value);
          if (relative.startsWith('..') || path.isAbsolute(relative)) throw Error('ISOLATED_PROFILE_ESCAPE: ' + key);
        }
        return target.setPath(key, value);
      };
      const value = target[name]; return typeof value === 'function' ? value.bind(target) : value;
    }}),
    shell: new Proxy(real.shell || {}, { get(target, name) {
      if (['openExternal','openPath','showItemInFolder'].includes(name)) return () => { report('manual-action-required', { type: 'shell', method: name }); return Promise.reject(Error('MANUAL_ACTION_REQUIRED: external navigation')); };
      const value=target[name];return typeof value==='function'?value.bind(target):value;
    }}),
    clipboard: new Proxy(real.clipboard || {}, { get(_target, name) {
      if (String(name).startsWith('read')) return () => '';
      return () => report('blocked-host-effect', { method: 'clipboard.' + String(name) });
    }}),
    dialog: new Proxy(real.dialog || {}, { get(target, name) {
      if (String(name).startsWith('show')) return () => { report('manual-action-required', { type: 'native-dialog', method: name }); throw Error('MANUAL_ACTION_REQUIRED: native dialog'); };
      const value=target[name];return typeof value==='function'?value.bind(target):value;
    }}),
    desktopCapturer: { getSources: async () => { throw Error('Host desktop capture is excluded from this runner'); } }
  };
  return new Proxy(real, { get(target, key) { if (key === 'BrowserWindow') return HiddenWindow; if (Object.hasOwn(facadeObjects,key)) return facadeObjects[key]; return target[key]; } });
}
function safeOrigin(value) { try { return new URL(value).origin; } catch { return 'local'; } }
module.exports = { createFacade };

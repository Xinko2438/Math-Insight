// Attach only to the newly launched, paused, task-owned SDK main process.
// Install the hidden/profile policy before the SDK's own entry executes.
const fs = require('node:fs');
const path = require('node:path');
const repo = path.resolve(__dirname, '..');
const work = path.resolve(process.env.MATH_APP_RUNNER_WORK || path.join(repo, '_work/native-automation'));
if (![path.join(repo, '_work/native-automation'),path.join(repo, '_work/device-preview')].includes(work)) throw Error('Unexpected owned work root');
const manifestPath = path.join(work, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
if (!['math-app-native-offscreen','math-app-device-preview'].includes(manifest.owner) || !manifest.ownerMarker || manifest.hostMode !== 'Packaged' || path.resolve(manifest.sourceProject)!==repo) throw Error('Dedicated packaged-host manifest required');
const stderr = path.join(manifest.profileRoot, 'stderr.log');
const until = Date.now() + 15000;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  let endpoint;
  while (Date.now() < until) {
    const text = fs.existsSync(stderr) ? fs.readFileSync(stderr, 'utf8') : '';
    const match = text.match(/Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[^\s]+)/);
    if (match) { endpoint = match[1]; break; }
    await delay(100);
  }
  if (!endpoint) throw Error('No owned paused-main debugger; do not resume the SDK');
  const socket = new WebSocket(endpoint); const pending = new Map(); const scripts = new Map(); const pauses = [];
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => {
    const m = JSON.parse(event.data);
    if (m.method === 'Debugger.scriptParsed') scripts.set(m.params.scriptId, m.params.url);
    if (m.method === 'Debugger.paused') pauses.push(m.params);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); }
  };
  let id = 0;
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(Error(method + ' timeout')); }, 10000); pending.set(n, { resolve, reject, timer }); socket.send(JSON.stringify({ id: n, method, params })); });
  try {
    await send('Debugger.enable');
    await send('Debugger.setBreakpointByUrl', { lineNumber: 0, urlRegex: String.raw`[\\/]js[\\/]electron[\\/]main\.js$` });
    await send('Runtime.runIfWaitingForDebugger');
    let paused;
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      const next = pauses.shift();
      if (!next) { await delay(50); continue; }
      const frame = next.callFrames[0]; const url = frame.url || scripts.get(frame.location.scriptId) || '';
      if (/[\\/]js[\\/]electron[\\/]main\.js$/.test(url)) { paused = { frame, url }; break; }
      // Core startup may pause first; the explicit SDK-entry breakpoint remains armed.
      await send('Debugger.resume');
    }
    if (!paused) throw Error('SDK entry was not reached under the debugger; refusing unguarded startup');
    const entry = path.join(repo, 'tools/native-automation/main.cjs');
    const expression = `(() => {
      if (process.pid !== ${Number(manifest.pid)}) throw new Error('Owned PID mismatch')
      process.env.MATH_APP_RUNNER_INJECTED = '1'
      process.env.MATH_APP_VENDOR_ASAR = require('path').resolve(__dirname, '..', '..')
      process.execArgv = process.execArgv.filter(x => !/^--inspect/.test(x))
      require(${JSON.stringify(entry)})
      return {pid:process.pid,policyInstalled:global.__mathNativePolicyReady === true}
    })()`;
    const result = await send('Debugger.evaluateOnCallFrame', { callFrameId: paused.frame.callFrameId, expression, returnByValue: true });
    if (result.exceptionDetails || !result.result || !result.result.value || !result.result.value.policyInstalled) throw Error('Offscreen policy was not installed: ' + (result.exceptionDetails && result.exceptionDetails.text || 'missing confirmation'));
    await send('Debugger.setSkipAllPauses', { skip: true });
    await send('Debugger.resume');
    console.log(JSON.stringify({ status: 'POLICY_INSTALLED_BEFORE_SDK_ENTRY', pid: manifest.pid, userWindowAttached: false, binaryPatched: false }));
  } finally { for (const p of pending.values()) clearTimeout(p.timer); socket.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });

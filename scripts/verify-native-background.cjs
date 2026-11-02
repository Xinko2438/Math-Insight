// Official miniprogram-automator 0.13 wire protocol, no desktop input or focus calls.
// Connect only to the dedicated never-visible SDK host, never the user's window.
// --fixtures seeds and restores only that isolated profile. No real AI calls.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const SAFE_METHODS = new Set(['onShow', 'goInput', 'goDrafts', 'goHistory', 'goStats', 'viewRecent', 'viewRecord', 'onSearch', 'onFilterTap', 'onQuestionInput', 'onAnswerInput', 'switchReportTab', 'toggleHint', 'toggleDetail', 'toggleSolution', 'toggleVariant', 'toggleBranch', 'goAgain']);

async function connect(port, options = {}) {
  const manifestPath = path.join(root, '_work/native-automation/manifest.json');
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, '')); }
  catch { throw Error('The dedicated runner manifest is required; no user-window fallback is allowed'); }
  port = Number(port || process.env.MATH_APP_AUTOMATION_PORT || manifest.automationPort);
  if (!Number.isInteger(port) || port <= 0 || port === 9420) {
    throw Error('A dedicated isolated automation endpoint is required; the user window on 9420 is excluded');
  }
  if (manifest.owner !== 'math-app-native-offscreen' || path.resolve(manifest.sourceProject) !== root || manifest.automationPort !== port) {
    throw Error('Endpoint does not match this project\'s dedicated runner');
  }
  const snapshot = JSON.parse(fs.readFileSync(path.join(root, '_work/native-automation/source-snapshot.json'), 'utf8'));
  if (path.resolve(snapshot.sourceProject) !== root) throw Error('Source snapshot owner mismatch');
  const sourceLibVersion = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8')).libVersion || '3.17.6';
  const expectedLibVersion = options.libVersion || sourceLibVersion;
  if (options.libVersion && !options.fixtureProfile || (snapshot.libVersion || sourceLibVersion) !== expectedLibVersion) throw Error('Library diagnostic requires an explicit matching version');
  if ((snapshot.fixtureProfile || '') !== (options.fixtureProfile || '') || options.fixtureProfile && !['multiline-bare', 'text-matrix', 'supported-text', 'supported-all'].includes(options.fixtureProfile)) throw Error('Diagnostic fixture requires an explicit matching connector; it is not product UI evidence');
  for (const file of snapshot.copiedFiles) {
    for (const base of [path.join(root, '微信小程序'), path.join(root, '_work/native-automation/project/miniprogram')]) {
      const source = path.resolve(base, file.path);
      if (!source.startsWith(base + path.sep)) throw Error('Invalid source snapshot path');
      const expected = base === path.join(root, '微信小程序') && file.fixtureProfile ? file.sourceSha256 : file.sha256;
      if (createHash('sha256').update(fs.readFileSync(source)).digest('hex') !== expected) {
        throw Error('Source copy is stale; restart the dedicated runner before acceptance: ' + file.path);
      }
    }
  }
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  const pending = new Map();
  const events = [];
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Automation endpoint is not ready; enable the official service first')), 8000);
    socket.onopen = () => { clearTimeout(timer); resolve(); };
    socket.onerror = () => { clearTimeout(timer); reject(Error('Automation connection failed')); };
  });
  socket.onmessage = event => {
    let message; try { message = JSON.parse(event.data); } catch { return; }
    if (!message.id) { events.push(message); return; }
    if (!pending.has(message.id)) return;
    const callback = pending.get(message.id); pending.delete(message.id); clearTimeout(callback.timer);
    message.error ? callback.reject(Error(callback.method + ': ' + message.error.message)) : callback.resolve(message.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = randomUUID(); const timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timed out')); }, 12000);
    pending.set(id, { resolve, reject, timer, method }); socket.send(JSON.stringify({ id, method, params }));
  });
  const client = {
    events,
    send,
    async currentPage() {
      const until = Date.now() + 12000;
      let lastError;
      while (Date.now() < until) {
        try {
          const page = await send('App.getCurrentPage');
          if (page && page.path) return page;
        } catch (error) {
          if (!/rawPath|not ready|initializ/i.test(error.message)) throw error;
          lastError = error;
        }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      throw Error('Native page is still initializing: ' + (lastError ? lastError.message : 'no page metadata'));
    },
    async pageData(page, name) { return (await send('Page.getData', { pageId: page.pageId, ...(name ? { path: name } : {}) })).data; },
    async call(page, method, ...args) {
      if (!SAFE_METHODS.has(method)) throw Error('Not a read/navigation/UI-only method: ' + method);
      return send('App.callFunction', { functionDeclaration: 'function(route,method,args){var page=getCurrentPages().slice(-1)[0];if(!page||page.route!==route||typeof page[method]!=="function")throw Error("Isolated page method is not ready");return page[method].apply(page,args)}', args: [page.path, method, args] });
    },
    async inspect(page, selector, scope) {
      const querySelector = selector === 'study-tabs' ? '.main-tabs' : selector === 'navigation-bar' ? '.main-navigation' : selector;
      let element;
      try { element = await send(scope ? 'Element.getElement' : 'Page.getElement', { pageId: page.pageId, selector: querySelector, ...(scope || {}) }); }
      catch (error) { return { selector, missing: true, error: error.message }; }
      if (!element || !element.elementId) return { selector, missing: true };
      const params = { pageId: page.pageId, elementId: element.elementId, ...(element.nodeId ? { nodeId: element.nodeId } : {}) };
      const result = { selector, tagName: element.tagName, params };
      for (const [label, method, names] of [
        ['dimensions', 'Element.getDOMProperties', ['offsetWidth', 'offsetHeight']],
        ['styles', 'Element.getStyles', ['display', 'width', 'height', 'flex-direction', 'margin-left', 'margin-right']]
      ]) {
        try { const values = await send(method, { ...params, names }); result[label] = values; }
        catch (error) { result[label] = { error: error.message }; }
      }
      try { result.offset = await send('Element.getOffset', params); } catch (error) { result.offset = { error: error.message }; }
      return result;
    },
    async capture(page, filename) {
      const allowed = ['native-home.png', 'native-input.png', 'native-result.png', 'native-history.png', 'native-stats.png'];
      if (!allowed.includes(filename)) throw Error('Screenshot path not declared');
      const before = await client.currentPage();
      assert.equal(before.path, page.path);
      assert.equal(before.pageId, page.pageId);
      const shot = await send('App.captureScreenshot');
      const after = await client.currentPage();
      assert.equal(after.path, before.path, 'Route changed during capture');
      assert.equal(after.pageId, before.pageId, 'Native page changed during capture');
      const bytes = Buffer.from(shot.data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      const destination = path.join(root, 'docs/ui-implementation', filename);
      fs.writeFileSync(destination, bytes);
      return { page: page.path, pageId: page.pageId, file: destination, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), capturedAt: new Date().toISOString(), routeStableDuringCapture: true };
    },
    close() { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error('Inspection completed')); } pending.clear(); socket.close(); }
  };
  try {
    const lab = await send('Lab.getStatus');
    if (lab.owner !== manifest.owner || lab.pid !== manifest.pid || path.resolve(lab.sourceProject) !== root || !lab.hiddenOnly || lab.visibleWindows !== 0 || !lab.nativePageReady || lab.sdkVersion !== expectedLibVersion) {
      throw Error('Endpoint ownership/hidden-window checks failed');
    }
    if ((lab.fixtureProfile || '') !== (options.fixtureProfile || '')) throw Error('Unexpected diagnostic fixture runtime');
    client.lab = lab;
  } catch (error) { client.close(); throw error; }
  return client;
}

async function inspectCurrent() {
  const client = await connect();
  try {
    if (client.lab.resolvedProjectMode !== 'tourist' && !(await client.send('Lab.getLoginStatus')).login) throw Error('User authorization required for the dedicated instance; scan its private QR first');
    const info = await client.send('Tool.getInfo'); const page = await client.currentPage();
    const selectors = ['.page', '.page-body', '.manual-button', '.recent-row', 'study-tabs'];
    const elements = [];
    for (const selector of selectors) elements.push(await client.inspect(page, selector));
    const host = elements.find(e => e.selector === 'study-tabs' && !e.missing);
    if (host) elements.push(await client.inspect(page, '.study-tabs', host.params));
    const report = { status: 'INSPECTED_NOT_ACCEPTED', layer: 'actual WeChat mini-program simulator via official automation protocol', sdkVersion: info.SDKVersion, page: page.path, desktopInputActions: 0, modelRequests: 0, elements };
    fs.writeFileSync(path.join(root, 'docs/ui-implementation/background-verification.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { client.close(); }
}
module.exports = { connect };

async function verifyLayout(options = {}) {
  const client = await connect();
  const checks = [];
  const layouts = {};
  const screenshots = [];
  const stateScreenshots = [];
  const draftScreenshots = [];
  let beforeHistory;
  let globals;
  let initial;
  let fixtureSnapshot;
  let report;
  const history = async () => (await client.send('App.callWxMethod', { method: 'getStorageSync', args: ['errorHistory'] })).result || [];
  const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const callFunction = async (fn, ...args) => (await client.send('App.callFunction', { functionDeclaration: fn.toString(), args })).result;
  const capture = async (page, filename) => { if (options.screenshots) screenshots.push(await client.capture(page, filename)); };
  const captureDraft = async (page, name, title) => {
    if (!options.draftUi) return;
    const before = await client.currentPage(); assert.equal(before.pageId, page.pageId);
    await new Promise(resolve => setTimeout(resolve, 500));
    const shot = await client.send('App.captureScreenshot');
    const after = await client.currentPage(); assert.equal(after.pageId, before.pageId); assert.equal(after.path, before.path);
    const bytes = Buffer.from(shot.data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const file = path.join(root, '_work/native-automation', 'draft-feature-' + name + '.png');
    fs.writeFileSync(file, bytes);
    draftScreenshots.push({file, title, page: page.path, sha256:createHash('sha256').update(bytes).digest('hex')});
  };
  const captureState = async (page, label) => {
    if (!options.states) return;
    if (!/^[a-z][a-z0-9-]{0,40}$/.test(label)) throw Error('Invalid state capture label');
    const before = await client.currentPage();
    assert.equal(before.pageId, page.pageId);
    const shot = await client.send('App.captureScreenshot');
    const after = await client.currentPage();
    assert.equal(after.pageId, before.pageId);
    assert.equal(after.path, before.path);
    const bytes = Buffer.from(shot.data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const directory = path.join(root, '_work/native-automation/ui-states');
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, label + '.png'); fs.writeFileSync(file, bytes);
    stateScreenshots.push({ state: label, page: page.path, file, sha256: createHash('sha256').update(bytes).digest('hex'), capturedAt: new Date().toISOString(), routeStableDuringCapture: true });
  };
  const scroll = async (page, y) => {
    const view = await element(page, '.page');
    await client.send('Element.callFunction', { ...view.params, functionName: 'scroll-view.scrollTo', args: [0, y] });
    let top = 0;
    for (let i = 0; i < 20; i++) {
      top = (await client.send('Element.callFunction', { ...view.params, functionName: 'scroll-view.scrollTop', args: [] })).result;
      if (y === 0 ? top < 1 : top > 0) return top;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw Error('Native scroll-view did not move to the requested region');
  };
  const waitData = async (page, path, predicate, description) => {
    const deadline = Date.now() + 8000;
    let value;
    do {
      value = await client.pageData(page, path);
      if (predicate(value)) return value;
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    throw Error('Native data did not settle: ' + description);
  };
  const pageAt = async expected => {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      const page = await client.currentPage();
      if (page.path === expected) return page;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw Error('Unexpected native route; expected ' + expected);
  };
  const element = async (page, selector, scope) => {
    let e;
    const deadline = Date.now() + 4000;
    do { e = await client.inspect(page, selector, scope); if (!e.missing) break; await new Promise(resolve => setTimeout(resolve, 80)); } while (Date.now() < deadline);
    assert.ok(!e.missing, page.path + ': missing ' + selector);
    assert.ok(Array.isArray(e.dimensions.properties), selector + ': no native dimensions');
    return e;
  };
  const common = async page => {
    const scroll = await element(page, '.page');
    const body = await element(page, '.page-body');
    const footer = await element(page, 'study-tabs');
    assert.ok(footer.dimensions.properties[1] > 50, page.path + ': zero-height navigation');
    assert.ok(scroll.offset.top + scroll.dimensions.properties[1] <= footer.offset.top + 2, page.path + ': content overlaps navigation');
    const markup = await client.send('Element.getWXML', { ...footer.params, type: 'outer' });
    assert.ok(!markup.wxml.includes('default-component'), page.path + ': navigation not registered');
    const children = await client.send('Element.getElements', { ...footer.params, selector: '.study-tab' });
    assert.equal(children.elements.length, 3);
    const tabs = [];
    for (const tab of children.elements) {
      const params = { pageId: page.pageId, elementId: tab.elementId, ...(tab.nodeId ? { nodeId: tab.nodeId } : {}) };
      const dims = (await client.send('Element.getDOMProperties', { ...params, names: ['offsetWidth', 'offsetHeight'] })).properties;
      const offset = await client.send('Element.getOffset', params);
      assert.ok(dims[0] >= body.dimensions.properties[0] / 4 && dims[1] >= 40, 'Navigation touch target collapsed');
      tabs.push({ width: dims[0], height: dims[1], left: offset.left, top: offset.top });
    }
    assert.ok(tabs[0].left < tabs[1].left && tabs[1].left < tabs[2].left, 'Navigation is not a horizontal row');
    layouts[page.path] = { viewportWidth: body.dimensions.properties[0], scrollHeight: scroll.dimensions.properties[1], footerHeight: footer.dimensions.properties[1], tabs };
    return footer;
  };
  const gapBetween = async (page, leftSelector, rightSelector, scope) => {
    const left = await element(page, leftSelector, scope);
    const right = await element(page, rightSelector, scope);
    return right.offset.left - left.offset.left - left.dimensions.properties[0];
  };
  const statsStructure = async page => {
    await scroll(page, 0);
    const nav = await element(page, 'navigation-bar');
    const metrics = await element(page, '.metrics-summary');
    assert.ok(metrics.offset.top >= nav.offset.top + nav.dimensions.properties[1], 'Statistics summary overlaps top navigation at scrollTop=0');
    const found = await client.send('Page.getElements', { pageId: page.pageId, selector: '.bar-row' });
    assert.equal(found.elements.length, 12, 'Both zero and populated views retain all twelve canonical topics');
    const positions = [];
    for (const item of found.elements.slice(0, 3)) positions.push(await client.send('Element.getOffset', { pageId: page.pageId, elementId: item.elementId, ...(item.nodeId ? { nodeId: item.nodeId } : {}) }));
    assert.ok(Math.abs(positions[0].top - positions[1].top) < 1 && positions[1].left > positions[0].left + 100, 'Topic distribution must render two native columns');
    assert.ok(positions[2].top > positions[0].top + 20 && Math.abs(positions[2].left - positions[0].left) < 1, 'Third topic must start the next row');
    const labels = await client.send('Page.getElements', { pageId: page.pageId, selector: '.bar-label' });
    const labelBounds = [];
    for (const label of labels.elements.slice(0, 2)) {
      const scope = { pageId: page.pageId, elementId: label.elementId, ...(label.nodeId ? { nodeId: label.nodeId } : {}) };
      const children = await client.send('Element.getElements', { ...scope, selector: 'text' });
      const boxes = [];
      for (const text of children.elements) {
        const params = { pageId: page.pageId, elementId: text.elementId, ...(text.nodeId ? { nodeId: text.nodeId } : {}) };
        const dimensions = await client.send('Element.getDOMProperties', { ...params, names: ['offsetWidth', 'offsetHeight'] });
        boxes.push({ ...(await client.send('Element.getOffset', params)), width: dimensions.properties[0] });
      }
      assert.equal(boxes.length, 2);
      assert.ok(boxes[1].left >= boxes[0].left + boxes[0].width + 3, 'Topic count overlaps its label during library hydration');
      assert.ok(boxes[1].width > 30, 'Topic count is clipped');
      labelBounds.push(boxes);
    }
    const causes = await client.send('Page.getElements', { pageId: page.pageId, selector: '.cause-row' });
    assert.equal(causes.elements.length, 4, 'Both views retain the same four cause categories');
    assert.ok((await client.inspect(page, '.review-button')).missing, 'Conditional call-to-action reintroduced a second layout');
    return { chartRows: found.elements.length, causeRows: causes.elements.length, positions, labelBounds, summaryTop: metrics.offset.top, summaryHeight: metrics.dimensions.properties[1] };
  };
  const tab = async (page, key) => {
    const footer = await element(page, 'study-tabs');
    await callFunction(function (key) { const p=getCurrentPages().slice(-1)[0]; const tabs=p.selectComponent('.main-tabs'); if (!tabs || typeof tabs.open !== 'function') throw Error('Main tabs are not ready'); tabs.open({currentTarget:{dataset:{page:key}}}); }, key);
  };
  try {
    if (client.lab.resolvedProjectMode !== 'tourist' && !(await client.send('Lab.getLoginStatus')).login) throw Error('User authorization required for the dedicated instance; scan its private QR first');
    initial = await client.currentPage();
    assert.equal(initial.path, 'pages/index/index', 'Start the acceptance pass from home to avoid discarding a user draft');
    assert.equal((await client.send('Tool.getInfo')).SDKVersion, '3.17.6', 'Wrong native base library');
    if (options.fixtures) {
      const source = require('../server/causeNodes.js');
      const library = { kpOrder: source.KP_ORDER, categories: source.CAUSE_CATEGORIES, nodes: source.ERROR_CAUSE_NODES };
      const result = { source: 'rule', question: '解方程：2(x − 3) = x + 4。', knowledgePoint: '方程', diagnosis: '移项时需要保持等式两边相等。把 −6 移到右边时，应变成 +6。', confidence: 97, causeNodes: [{ id: 'E41', name: '计算过程粗心出错' }], steps: [{ question: '先去括号，等式会变成什么？', hint: '用 2 分别乘括号里的两项。', detail: '2x − 6 = x + 4' }, { question: '怎样把含 x 的项放在同一边？', hint: '等式两边同时减去 x，再加上 6。', detail: '2x − x = 4 + 6，所以 x = 10。' }], solution: '2x − 6 = x + 4\n2x − x = 4 + 6\nx = 10\n代回原式，左右两边都等于 14。', variants: [{ level: '巩固一步', question: '解方程：3(x − 2) = x + 1。', answer: 'x = 7 / 2', analysis: '3x − 6 = x + 1，整理得 2x = 7。' }] };
      const records = [
        { id: 900001, time: '2026-10-31 20:00', question: result.question, wrongAnswer: '2x − x = 4 − 6，所以 x = −2。', result },
        { id: 900002, time: '2026-10-30 19:30', question: '已知等比数列 a₁ = 1，q = 2，求 a₄。', wrongAnswer: 'a₄ = 2⁴ = 16。', result: { ...result, question: '已知等比数列 a₁ = 1，q = 2，求 a₄。', knowledgePoint: '数列', causeNodes: [{ id: 'E27', name: '等差等比公式记混' }], diagnosis: '通项中的指数应为 n − 1。', steps: [{ question: '从第一项到第四项，乘了几次公比？', hint: '把四项依次写出来。', detail: '1，2，4，8。' }], solution: 'a₄ = 1 × 2³ = 8。', variants: [] } }
      ];
      fixtureSnapshot = await callFunction(function (records, library) {
        const app = getApp();
        if (app.__nativeAcceptance) throw Error('An acceptance fixture is already active');
        const keys = wx.getStorageInfoSync().keys;
        const ownedKeys = keys.filter(key => key.indexOf('mathDraft:') === 0 || key.indexOf('mathJob:') === 0);
        const snapshot = ['errorHistory', 'causeNodeLib', 'userQuestionTags', 'mathDraftIndex'].concat(ownedKeys).map(key => ({ key, present: keys.includes(key), value: wx.getStorageSync(key) }));
        app.__nativeAcceptance = { request: wx.request, uploadFile: wx.uploadFile, networkAttempts: [] };
        // Every request from this isolated Mini Program is answered locally or
        // rejected, including unexpected analysis/chat/OCR/upload calls.
        wx.request = function (o) {
          const path = String(o.url || '').split('?')[0].replace(/^https?:\/\/[^/]+/, '');
          app.__nativeAcceptance.networkAttempts.push(path);
          const allowed = path === '/api/cause-nodes';
          const response = allowed ? { statusCode: 200, data: { code: 0, data: library } } : { errMsg: 'request:fail blocked by isolated UI acceptance' };
          setTimeout(function () { if (allowed && o.success) o.success(response); if (!allowed && o.fail) o.fail(response); if (o.complete) o.complete(response); }, 0);
          return { abort: function () {}, onHeadersReceived: function () {}, onChunkReceived: function () {} };
        };
        wx.uploadFile = function (o) { app.__nativeAcceptance.networkAttempts.push('BLOCKED_UPLOAD'); const r = { errMsg: 'uploadFile:fail excluded from UI acceptance' }; if (o.fail) o.fail(r); if (o.complete) o.complete(r); return { abort: function () {} }; };
        wx.setStorageSync('errorHistory', records); wx.setStorageSync('causeNodeLib', library); wx.setStorageSync('userQuestionTags', { version: 1, tags: [], assignments: {} });
        return snapshot;
      }, records, library);
      await client.call(initial, 'onShow');
      checks.push('fixtures and local request responses installed only in dedicated profile');
    }
    beforeHistory = await history();
    globals = await callFunction(function () { const d = getApp().globalData; return { lastResult: d.lastResult, lastWrongAnswer: d.lastWrongAnswer, pendingPhoto: d.pendingPhoto }; });
    let page = initial;
    await common(page);
    for (const selector of [...(beforeHistory.length ? ['.recent-row'] : [])]) {
      const box = await element(page, selector);
      assert.ok(box.dimensions.properties[0] > layouts[page.path].viewportWidth * .75, selector + ': native preset width still wins');
      assert.ok(box.offset.left < 40, selector + ': unexpected automatic centering');
    }
    const manual = await element(page, '.manual-button');
    const draftEntry = await element(page, '.draft-entry');
    assert.ok(manual.dimensions.properties[1] >= 44 && draftEntry.dimensions.properties[1] >= 44, 'Home actions must have accessible tap heights');
    assert.ok(Math.abs(manual.offset.top - draftEntry.offset.top) <= 2, 'Home actions must share one row');
    assert.ok(draftEntry.offset.left - (manual.offset.left + manual.dimensions.properties[0]) >= 4, 'Home actions overlap');
    assert.ok(draftEntry.offset.left + draftEntry.dimensions.properties[0] <= layouts[page.path].viewportWidth, 'Draft action exceeds viewport');
    const iconTextGap = await gapBetween(page, '.icon-edit', 'text', manual.params);
    assert.ok(iconTextGap >= 10, 'Manual entry icon touches its label: ' + iconTextGap + 'px');
    layouts[page.path].manualIconTextGap = iconTextGap;
    const card = await element(page, '.scan-card');
    const photoButton = await element(page, '.scan-button');
    const paper = await element(page, '.scan-art');
    assert.ok(photoButton.offset.left >= card.offset.left && photoButton.offset.top >= card.offset.top, 'Photo action escapes selected A card');
    assert.ok(photoButton.offset.top + photoButton.dimensions.properties[1] <= card.offset.top + card.dimensions.properties[1], 'Photo action is cut off');
    assert.ok(paper.offset.left - photoButton.offset.left - photoButton.dimensions.properties[0] >= 8, 'Selected A paper overlaps the photo action');
    layouts[page.path].selectedACard = { height: card.dimensions.properties[1], photoButtonHeight: photoButton.dimensions.properties[1], paperButtonGap: paper.offset.left - photoButton.offset.left - photoButton.dimensions.properties[0] };
    if (beforeHistory.length) {
      const row = await element(page, '.recent-row');
      layouts[page.path].firstRecordTop = row.offset.top;
      assert.ok(row.offset.top < 91 + layouts[page.path].scrollHeight * .55, 'Recent questions remain below oversized introduction');
    }
    checks.push('home has two distinct, aligned tap targets and live history');
    await capture(page, 'native-home.png');
    if (options.draftUi) {
      assert.ok(options.fixtures, 'Draft UI inspection requires isolated fixtures');
      await captureDraft(page, 'home', '首页 · 草稿入口');
      await callFunction(function () {
        const id = 'draft-fixture'; const taskId = 'a'.repeat(32);
        wx.setStorageSync('mathDraft:' + id, {id,revision:1,question:'解方程：2x + 1 = 7',wrongAnswer:'x = 2',ocrReview:[],updatedAt:Date.now()});
        wx.setStorageSync('mathJob:' + taskId, {taskId,token:'b'.repeat(64),draftId:id,revision:1,snapshot:{question:'解方程：2x + 1 = 7',wrongAnswer:'x = 2'},status:'complete',createdAt:Date.now(),result:{question:'解方程：2x + 1 = 7',diagnosis:'检查移项后的计算。',steps:[],variants:[]}});
      });
      await client.call(page, 'goDrafts'); const draftPage = await pageAt('pages/drafts/drafts');
      await common(draftPage); await waitData(draftPage, 'drafts', rows => rows.some(row => row.id === 'draft-fixture'), 'draft list');
      await waitData(draftPage, 'tasks', rows => rows.some(row => row.id === 'a'.repeat(32) && row.ready), 'task list');
      await element(draftPage, '.draft-row'); await element(draftPage, '.task-row');
      await captureDraft(draftPage, 'list', '草稿与任务 · 隔离示例');
      await callFunction(function () { wx.navigateBack(); }); page = await pageAt('pages/index/index');
      checks.push('dedicated native draft and task page displays isolated entries');
    }
    await client.call(page, 'goInput'); page = await pageAt('pages/input/input');
    await common(page);
    const primary = await element(page, '.action-primary');
    assert.ok(primary.dimensions.properties[0] > 290);
    const firstField = await element(page, '.field');
    await captureDraft(page, 'input', '录入题目 · 自动保存');
    const fieldGap = await gapBetween(page, '.field-label', '.field-mark', firstField.params);
    assert.ok(fieldGap >= 8, 'Required marker touches field label: ' + fieldGap + 'px');
    layouts[page.path].fieldLabelGap = fieldGap;
    layouts[page.path].firstFieldTop = firstField.offset.top;
    layouts[page.path].submitTop = primary.offset.top;
    assert.ok(primary.offset.top + primary.dimensions.properties[1] <= 742, 'Short-form submit is not fully visible above navigation');
    await captureState(page, 'input-empty');
    const originalQuestion = await client.pageData(page, 'question');
    const originalAnswer = await client.pageData(page, 'wrongAnswer');
    const inputQuestion = options.fixtures ? beforeHistory[0].question : '界面验收文本，不提交分析';
    const inputAnswer = options.fixtures ? beforeHistory[0].wrongAnswer : '临时作答';
    await client.call(page, 'onQuestionInput', { detail: { value: inputQuestion } });
    assert.equal(await client.pageData(page, 'question'), inputQuestion);
    await client.call(page, 'onAnswerInput', { detail: { value: inputAnswer } });
    assert.equal(await client.pageData(page, 'wrongAnswer'), inputAnswer);
    await capture(page, 'native-input.png');
    if (options.states) {
      const textarea = await element(page, 'textarea');
      const longQuestion = Array(18).fill('已知函数 f(x) = log₂(x − 1)，请写出定义域，并说明变形时需要保留的条件。').join('\n');
      await client.send('Element.callFunction', { ...textarea.params, functionName: 'textarea.input', args: [longQuestion] });
      await waitData(page, 'questionLen', n => n === longQuestion.length, 'native textarea input event');
      assert.equal(await client.pageData(page, 'question'), longQuestion, 'Long-text input content or line breaks changed');
      let longField;
      const sizeDeadline = Date.now() + 4000;
      do { longField = await element(page, '.form-textarea'); if (longField.dimensions.properties[1] > 300) break; await new Promise(resolve => setTimeout(resolve, 80)); } while (Date.now() < sizeDeadline);
      assert.ok(longField.dimensions.properties[1] > 300, 'Long question did not expand the native textarea');
      const scrollTop = await scroll(page, 100000);
      const scrolledSubmit = await element(page, '.action-primary');
      assert.ok(scrolledSubmit.offset.top >= 91 && scrolledSubmit.offset.top + scrolledSubmit.dimensions.properties[1] <= 742.5, 'Long-form submit cannot be reached above navigation');
      layouts[page.path].longForm = { inputEventLength: longQuestion.length, textareaHeight: longField.dimensions.properties[1], scrollTop, submitTop: scrolledSubmit.offset.top };
      await captureState(page, 'input-long-bottom');
      await client.call(page, 'onQuestionInput', { detail: { value: inputQuestion } });
      await scroll(page, 0);
      await client.send('Page.setData', { pageId: page.pageId, data: { submitting: true, streamChars: 128 } });
      await captureState(page, 'input-analysis-state');
      await client.send('Page.setData', { pageId: page.pageId, data: { submitting: false, streamChars: 0 } });
      checks.push('native long-text input expands, scrolls to reachable submit, and restores; loading is a UI-only simulated state');
    }
    await client.call(page, 'onQuestionInput', { detail: { value: originalQuestion } });
    await client.call(page, 'onAnswerInput', { detail: { value: originalAnswer } });
    checks.push('native input bindings update and restore without submitting');
    await tab(page, 'home'); page = await pageAt('pages/index/index');
    await tab(page, 'history'); page = await pageAt('pages/history/history');
    await common(page);
    await capture(page, 'native-history.png');
    if (beforeHistory.length) {
      const filters = await element(page, '.filter-tabs'); assert.ok(filters.dimensions.properties[1] >= 40);
      const record = await element(page, '.record-open'); assert.ok(record.dimensions.properties[0] > 200);
      layouts[page.path].firstRecordTop = record.offset.top;
      assert.ok(record.offset.top < 91 + layouts[page.path].scrollHeight * .4, 'History controls push records below the useful viewport');
      const question = await element(page, '.record-question'); const time = await element(page, '.record-time');
      assert.ok(time.offset.top > question.offset.top, 'History content is incorrectly arranged in columns');
      await client.call(page, 'onSearch', { detail: { value: '几何证明' } });
      await waitData(page, 'filtered', value => value.length === 0, 'empty history search');
      await captureState(page, 'history-no-results');
      await client.call(page, 'onSearch', { detail: { value: '' } });
      await waitData(page, 'filtered', value => value.length === beforeHistory.length, 'history search reset');
      if (options.fixtures) {
        await client.call(page, 'onFilterTap', { currentTarget: { dataset: { kp: '数列' } } });
        await waitData(page, 'filtered', value => value.length === 1, 'knowledge point filter');
        await client.call(page, 'onFilterTap', { currentTarget: { dataset: { kp: '全部' } } });
        await waitData(page, 'filtered', value => value.length === beforeHistory.length, 'knowledge point reset');
      }
    }
    checks.push('history search and vertical record layout use real stored rows');
    if (beforeHistory.length && beforeHistory[0].result) {
      await client.call(page, 'viewRecord', { currentTarget: { dataset: { id: beforeHistory[0].id } } });
      page = await pageAt('pages/result/result');
      await waitData(page, 'result', value => !!value, 'report library hydration');
      await common(page);
      assert.equal(await client.pageData(page, 'activeTab'), 'steps');
      assert.equal(await client.pageData(page, 'wrongAnswer'), beforeHistory[0].wrongAnswer || '');
      assert.equal(await client.pageData(page, 'solutionExpanded'), false);
      const firstStep = await element(page, '.step');
      const actions = await element(page, '.step-actions');
      const actionGap = await gapBetween(page, '.hint-action', '.detail-action', actions.params);
      assert.ok(actionGap >= 12, 'Report actions are too close: ' + actionGap + 'px');
      layouts[page.path].reportActionGap = actionGap;
      layouts[page.path].firstStepTop = firstStep.offset.top;
      assert.ok(firstStep.offset.top < 91 + layouts[page.path].scrollHeight * .65, 'Thinking steps are buried below report introduction');
      await capture(page, 'native-result.png');
      if (options.fixtures) {
        const indexEvent = { currentTarget: { dataset: { index: 0 } } };
        await client.call(page, 'toggleHint', indexEvent);
        assert.equal((await client.pageData(page, 'result')).steps[0].showHint, true);
        await captureState(page, 'report-hint');
        await client.call(page, 'toggleHint', indexEvent);
        await client.call(page, 'toggleSolution');
        assert.equal(await client.pageData(page, 'solutionExpanded'), true);
        if (options.states) {
          assert.equal((await client.pageData(page, 'result')).solution, beforeHistory[0].result.solution, 'Solution source changed');
          const solution = await element(page, '.solution');
          await scroll(page, Math.max(1, solution.offset.top - 180));
          await captureState(page, 'report-full-solution');
          await scroll(page, 0);
        }
        await client.call(page, 'toggleSolution');
      }
      await client.call(page, 'switchReportTab', { currentTarget: { dataset: { tab: 'diagnosis' } } });
      assert.equal(await client.pageData(page, 'activeTab'), 'diagnosis');
      await captureState(page, 'report-diagnosis');
      await client.call(page, 'switchReportTab', { currentTarget: { dataset: { tab: 'variants' } } });
      assert.equal(await client.pageData(page, 'activeTab'), 'variants');
      if (options.fixtures) {
        await client.call(page, 'toggleVariant', { currentTarget: { dataset: { index: 0 } } });
        assert.equal((await client.pageData(page, 'result')).variants[0].expanded, true);
        await captureState(page, 'report-variant-answer');
      }
      await client.call(page, 'switchReportTab', { currentTarget: { dataset: { tab: 'steps' } } });
      checks.push('stored report opens with matching work and switches content without AI');
    } else checks.push('report coverage pending: no existing report; no synthetic history was written');
    await tab(page, 'stats'); page = await pageAt('pages/stats/stats');
    await common(page);
    await waitData(page, 'total', value => value === beforeHistory.length, 'statistics library hydration');
    const populatedStatsStructure = options.fixtures ? await statsStructure(page) : null;
    if (populatedStatsStructure) layouts[page.path].populatedStats = populatedStatsStructure;
    if (options.fixtures) {
      const tree = await client.pageData(page, 'causeTree');
      assert.equal(tree.flatMap(b => b.categories.flatMap(c => c.children)).filter(n => n.id).length, 50);
      checks.push('full 50-node cause tree data includes untriggered nodes from the source library');
    }
    await capture(page, 'native-stats.png');
    if (options.states) {
      const tree = await element(page, '.tree-branch');
      await client.call(page, 'toggleBranch', { currentTarget: { dataset: { index: 0 } } });
      await scroll(page, Math.max(1, tree.offset.top - 120));
      await captureState(page, 'stats-cause-tree');
      await client.call(page, 'toggleBranch', { currentTarget: { dataset: { index: 0 } } });
      await scroll(page, 0);
    }
    checks.push('native statistics match unchanged stored history');
    await tab(page, 'home'); await pageAt('pages/index/index');
    assert.equal(digest(await history()), digest(beforeHistory), 'Real history changed during acceptance');
    if (options.states) {
      assert.ok(options.fixtures, 'Empty-state coverage requires the dedicated fixture sandbox');
      await callFunction(function () { wx.setStorageSync('errorHistory', []); });
      page = await pageAt('pages/index/index'); await client.call(page, 'onShow');
      await waitData(page, 'totalRecords', n => n === 0, 'empty home');
      await captureState(page, 'home-empty');
      await tab(page, 'history'); page = await pageAt('pages/history/history');
      await waitData(page, 'records', rows => rows.length === 0, 'empty history');
      await captureState(page, 'history-empty');
      await tab(page, 'stats'); page = await pageAt('pages/stats/stats');
      await waitData(page, 'total', n => n === 0, 'empty statistics');
      const zeroStatsStructure = await statsStructure(page);
      layouts[page.path].zeroStats = zeroStatsStructure;
      assert.equal(zeroStatsStructure.chartRows, populatedStatsStructure.chartRows);
      assert.equal(zeroStatsStructure.causeRows, populatedStatsStructure.causeRows);
      assert.ok(Math.abs(zeroStatsStructure.summaryHeight - populatedStatsStructure.summaryHeight) < 1, 'Summary height changes with data');
      assert.ok(Math.abs(zeroStatsStructure.positions[0].top - populatedStatsStructure.positions[0].top) < 1, 'Chart position changes with data');
      checks.push('native zero and populated statistics share twelve two-column topics, four cause rows and matching geometry');
      await captureState(page, 'stats-empty');
      await callFunction(function (records) { wx.setStorageSync('errorHistory', records); }, beforeHistory);
      await tab(page, 'home'); page = await pageAt('pages/index/index');
      await client.call(page, 'onShow');
      assert.equal(digest(await history()), digest(beforeHistory));
      checks.push('empty home/history/statistics and no-match state captured with fixture history restored');
    }
    checks.push('native component navigation returns to home; history hash unchanged');
    if (options.screenshots) {
      assert.equal(screenshots.length, options.fixtures ? 5 : beforeHistory.length ? 5 : 4);
      assert.equal(new Set(screenshots.map(s => s.sha256)).size, screenshots.length, 'Duplicate native frames');
    }
    const lab = await client.send('Lab.getStatus');
    assert.equal(lab.visibleWindows, 0);
    const network = options.fixtures ? await callFunction(function () { return getApp().__nativeAcceptance.networkAttempts; }) : [];
    assert.ok(network.every(p => p === '/api/cause-nodes'), 'An excluded API was attempted');
    report = { status: options.screenshots ? 'NATIVE_LAYOUT_PASS_PIXELS_CAPTURED_REVIEW_PENDING' : 'LIVE_LAYOUT_PASS_SCREENSHOTS_PENDING', layer: 'dedicated actual WeChat mini-program simulator API, layout and pixels', capturedAt: new Date().toISOString(), isolatedPid: lab.pid, desktopInputActions: 0, visibleWindows: lab.visibleWindows, modelRequests: 0, fixtures: !!options.fixtures, isolatedHistoryRestoredAfterStateChecks: true, sdkVersion: (await client.send('Tool.getInfo')).SDKVersion, layouts, checks, screenshots, stateScreenshots, localMockedRequests: network, routing: { decision: 'no-delegation', reason: 'one owned SDK runtime and sequential page state; parallel writers add conflicts', parallelBenefit: 0, models: [], usage: 'not separately measured' }, remaining: 'Inspect captured pixels against their routes. Device keyboard, real-device touch and user visual acceptance remain separate.' };
  } finally {
    if (globals) await callFunction(function (snapshot) { Object.assign(getApp().globalData, snapshot); }, globals).catch(() => {});
    if (fixtureSnapshot) {
      const cleanup = await callFunction(function (snapshot) {
      const app = getApp(); const fixtures = app.__nativeAcceptance;
      const originalKeys = snapshot.map(function (s) { return s.key; });
      wx.getStorageInfoSync().keys.filter(function (key) { return (key.indexOf('mathDraft:') === 0 || key.indexOf('mathJob:') === 0) && originalKeys.indexOf(key) < 0; }).forEach(function (key) { wx.removeStorageSync(key); });
      snapshot.forEach(function (s) { if (s.present) wx.setStorageSync(s.key, s.value); else wx.removeStorageSync(s.key); });
      wx.request = fixtures.request; wx.uploadFile = fixtures.uploadFile; delete app.__nativeAcceptance;
      const current = getCurrentPages().slice(-1)[0]; if (current && current.route === 'pages/index/index') current.onShow();
      const keys = wx.getStorageInfoSync().keys;
      return { restored: snapshot.every(function (s) { return keys.includes(s.key) === s.present && (!s.present || JSON.stringify(wx.getStorageSync(s.key)) === JSON.stringify(s.value)); }) && keys.filter(function (key) { return (key.indexOf('mathDraft:') === 0 || key.indexOf('mathJob:') === 0) && originalKeys.indexOf(key) < 0; }).length === 0, mockRemoved: !app.__nativeAcceptance };
      }, fixtureSnapshot).catch(error => ({ restored: false, error: error.message }));
      if (!cleanup.restored || !cleanup.mockRemoved) { client.close(); throw Error('Fixture cleanup was not verified: ' + JSON.stringify(cleanup)); }
      if (report) report.fixtureCleanup = cleanup;
    }
    client.close();
  }
  if (report) {
    fs.writeFileSync(path.join(root, 'docs/ui-implementation/background-verification.json'), JSON.stringify(report, null, 2));
    if (options.draftUi) {
      const snapshot = JSON.parse(fs.readFileSync(path.join(root, '_work/native-automation/source-snapshot.json'), 'utf8'));
      fs.writeFileSync(path.join(root, '_work/native-automation/draft-ui.json'), JSON.stringify({status:'PASS',capturedAt:report.capturedAt,modelRequests:0,fixtureCleanup:report.fixtureCleanup,sourceHashes:snapshot.copiedFiles.map(file=>({file:file.path,sha256:file.sourceSha256 || file.sha256})),screenshots:draftScreenshots}, null, 2));
    }
    // Screenshot delivery is a single gallery; the existing loopback viewer
    // serves the rebuilt file on refresh without touching any user window.
    if (options.screenshots) require('./build-screenshot-gallery.cjs').build();
    console.log(JSON.stringify({ status: report.status, sdkVersion: report.sdkVersion, checks: report.checks.length, screenshots: report.screenshots.length, stateScreenshots: report.stateScreenshots.length, visibleWindows: report.visibleWindows, modelRequests: report.modelRequests, fixtureCleanup: report.fixtureCleanup }, null, 2));
  }
}

module.exports.verifyLayout = verifyLayout;
if (require.main === module) (process.argv.includes('--full') ? verifyLayout({ fixtures: process.argv.includes('--fixtures'), screenshots: process.argv.includes('--screenshots'), states: process.argv.includes('--states'), draftUi: process.argv.includes('--draft-ui') }) : inspectCurrent()).catch(e => { console.error(e.message); process.exitCode = 1; });

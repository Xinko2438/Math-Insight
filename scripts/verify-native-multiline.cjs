// Verify actual native line layout while retaining the original LF characters.
// Dedicated guest instance only; no screenshots or state from the user's window.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { connect } = require('./verify-native-background.cjs');
const root = path.resolve(__dirname, '..');
const work = path.join(root, '_work/native-automation');
const separatorArgument = process.argv.find(argument => argument.startsWith('--separator='));
const separatorName = separatorArgument ? separatorArgument.split('=')[1] : 'lf';
const separators = { lf: '\n', crlf: '\r\n', ls: '\u2028', ps: '\u2029' };
assert.ok(Object.hasOwn(separators, separatorName), 'Unsupported line separator');
const bare = process.argv.includes('--bare');
const supported = process.argv.includes('--supported');
const supportedAll = process.argv.includes('--supported-all');
const label = (process.argv.includes('--fixed') ? 'fixed' : supportedAll ? 'supported-all' : supported ? 'supported-text' : bare ? 'bare' : process.argv.includes('--baseline') ? 'baseline' : 'current') + (separatorArgument ? '-' + separatorName : '');
const value = ['第一行 A', '第二行 B', '第三行 C'].join(separators[separatorName]);
const flatValue = '第一行 A 第二行 B 第三行 C';

async function run() {
  const client = await connect(undefined, { fixtureProfile: supportedAll ? 'supported-all' : supported ? 'supported-text' : bare ? 'multiline-bare' : '' });
  const call = async (fn, ...args) => (await client.send('App.callFunction', { functionDeclaration: fn.toString(), args })).result;
  const screenshots = [];
  const navigate = async url => {
    await client.send('App.callWxMethod', { method: 'navigateTo', args: [{ url }] });
    for (let i = 0; i < 30; i++) {
      const page = await client.currentPage();
      if (page.path === url.slice(1)) {
        const method = url.includes('/input/') ? 'onQuestionInput' : 'toggleSolution';
        const ready = (await client.send('App.callFunction', { functionDeclaration: 'function(route,method){var p=getCurrentPages().slice(-1)[0];return !!p&&p.route===route&&typeof p[method]==="function"}', args: [page.path, method] })).result;
        if (ready) return await client.currentPage();
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw Error('Expected page not ready: ' + url);
  };
  const capture = async (page, kind, selector) => {
    await new Promise(resolve => setTimeout(resolve, 250));
    const element = await client.inspect(page, selector);
    assert.ok(!element.missing);
    const shot = await client.send('App.captureScreenshot');
    assert.equal((await client.currentPage()).pageId, page.pageId);
    const file = path.join(work, `multiline-${label}-${kind}.png`);
    const bytes = Buffer.from(shot.data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    fs.writeFileSync(file, bytes);
    const bounds = { left: element.offset.left, top: element.offset.top, width: element.dimensions.properties[0], height: element.dimensions.properties[1] };
    screenshots.push({ kind, file: path.relative(root, file), sha256: createHash('sha256').update(bytes).digest('hex'), bounds });
    return bounds;
  };
  let installed = false;
  let report;
  try {
    if ((await client.currentPage()).path !== 'pages/index/index' && process.argv.includes('--from-owned-page')) await client.send('App.callWxMethod', { method: 'navigateTo', args: [{ url: '/pages/index/index' }] });
    assert.equal((await client.currentPage()).path, 'pages/index/index');
    const library = require('../server/causeNodes.js');
    await call(function (lib) {
      const app = getApp();
      if (app.__multilineVerification) throw Error('Existing test not cleaned up');
      app.__multilineVerification = { request: wx.request, globals: { ...app.globalData }, libraryPresent: wx.getStorageInfoSync().keys.includes('causeNodeLib'), library: wx.getStorageSync('causeNodeLib') };
      wx.request = function (options) {
        if (!String(options.url).endsWith('/api/cause-nodes')) throw Error('Network excluded from multiline verification');
        if (options.success) options.success({ statusCode: 200, data: { code: 0, data: lib } });
        if (options.complete) options.complete();
        return { abort: function () {} };
      };
    }, { kpOrder: library.KP_ORDER, categories: library.CAUSE_CATEGORIES, nodes: library.ERROR_CAUSE_NODES });
    installed = true;
    let page = await navigate('/pages/input/input');
    await client.call(page, 'onQuestionInput', { detail: { value } });
    await client.call(page, 'onAnswerInput', { detail: { value: flatValue } });
    assert.equal(await client.pageData(page, 'question'), value);
    assert.equal(await client.pageData(page, 'wrongAnswer'), flatValue);
    await capture(page, 'input', '.form-textarea');
    await call(function (solution) {
      getApp().globalData.lastResult = { source: 'rule', question: '多行显示检查', knowledgePoint: '方程', diagnosis: '本地显示夹具', causeNodes: [], steps: [], solution, variants: [] };
      getApp().globalData.lastWrongAnswer = '';
    }, value);
    page = await navigate('/pages/result/result');
    await client.call(page, 'toggleSolution');
    assert.equal((await client.pageData(page, 'result')).solution, value);
    await capture(page, 'report', '.solution');
    const analysis = spawnSync('python', ['-c', String.raw`
import sys,json
from pathlib import Path
from PIL import Image
rows=json.loads(sys.argv[1]); result=[]
for row in rows:
    im=Image.open(Path(sys.argv[2])/row['file']).convert('RGB'); scale=im.width/390
    b=row['bounds']; l=round(b['left']*scale); t=round(b['top']*scale)
    r=round((b['left']+b['width'])*scale); bottom=round((b['top']+b['height'])*scale)
    crop=im.crop((l,t,r,bottom)); active=[]
    for y in range(crop.height):
        n=sum(1 for x in range(crop.width) if max(crop.getpixel((x,y)))<175)
        if n>=4: active.append(y)
    groups=[]
    for y in active:
        if not groups or y-groups[-1][-1]>7: groups.append([y])
        else: groups[-1].append(y)
    groups=[g for g in groups if len(g)>=4]
    result.append({'kind':row['kind'],'textBands':len(groups),'bands':[[g[0],g[-1]] for g in groups]})
print(json.dumps(result))
`, JSON.stringify(screenshots), root], { encoding: 'utf8' });
    assert.equal(analysis.status, 0, analysis.stderr);
    const bands = JSON.parse(analysis.stdout);
    const passed = bands.every(result => result.textBands === 3);
    report = { status: passed ? 'PASS' : 'FAIL', layer: 'actual WeChat simulator pixels and exact input data; no keyboard or physical-device acceptance', pageRenderer: supported ? 'webview diagnostic' : bare ? 'skyline bare' : 'project page configuration', separator: separatorName, expectedLines: 3, valuePreserved: true, modelRequests: 0, foregroundActions: 0, bands, screenshots };
    fs.writeFileSync(path.join(work, `multiline-${label}.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ status: report.status, bands, valuePreserved: true, screenshots: screenshots.map(shot => shot.file) }));
    if (!passed) process.exitCode = 1;
  } finally {
    if (installed) {
      const cleanup = await call(function () {
        const app = getApp(); const saved = app.__multilineVerification;
        if (!saved) return false;
        wx.request = saved.request;
        Object.keys(app.globalData).forEach(key => { delete app.globalData[key]; });
        Object.assign(app.globalData, saved.globals);
        if (saved.libraryPresent) wx.setStorageSync('causeNodeLib', saved.library); else wx.removeStorageSync('causeNodeLib');
        delete app.__multilineVerification;
        return true;
      });
      assert.equal(cleanup, true);
    }
    client.close();
  }
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });

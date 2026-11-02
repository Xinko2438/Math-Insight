// Real native form, deterministic photo/provider mocks, no camera or upload.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { connect } = require('./verify-native-background.cjs');
const root = path.resolve(__dirname, '..');
const work = path.join(root, '_work/native-automation');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const photo = { question: '1、解方程：\n2(x − 3) = x + 4。', wrongAnswer: '解：\n2x − 6 = x + 4\n2x − x = 4 − 6\nx = −2', needsReview: true, reviewReasons: ['unclear_text'] };
async function run() {
  const client = await connect();
  const call = async (fn, ...args) => (await client.send('App.callFunction', { functionDeclaration: fn.toString(), args })).result;
  const images = [];
  let installed = false;
  let report;
  try {
    if ((await client.currentPage()).path !== 'pages/index/index' && process.argv.includes('--from-owned-page')) await client.send('App.callWxMethod', { method: 'navigateTo', args: [{ url: '/pages/index/index' }] });
    assert.equal((await client.currentPage()).path, 'pages/index/index');
    await call(function (data) {
      const app = getApp();
      const names = ['chooseMedia', 'compressImage', 'getFileSystemManager', 'request'];
      app.__ocrVerification = { globals: { ...app.globalData }, functions: {}, history: JSON.stringify(wx.getStorageSync('errorHistory')), calls: 0 };
      names.forEach(name => { app.__ocrVerification.functions[name] = wx[name]; });
      wx.chooseMedia = function (options) { options.success({ tempFiles: [{ tempFilePath: '/isolated/ocr-fixture.jpg' }] }); };
      wx.compressImage = function (options) { options.success({ tempFilePath: options.src }); };
      wx.getFileSystemManager = function () { return { readFile: function (options) { options.success({ data: 'aW1hZ2U=' }); } }; };
      wx.request = function (options) {
        if (!String(options.url).endsWith('/api/ocr')) throw Error('Unexpected network in OCR UI verification');
        app.__ocrVerification.calls++;
        options.success({ statusCode: 200, data: { code: 0, requestId: 'ocr-isolated-ui', data } });
        if (options.complete) options.complete();
        return { abort: function () {} };
      };
    }, photo);
    installed = true;
    for (const entry of ['home', 'input']) {
      if (entry === 'input') await call(function () { getCurrentPages().slice(-1)[0].setData({ question: '', wrongAnswer: '', questionLen: 0, answerLen: 0, ocrReview: [] }); });
      await call(function () {
        if (!getApp().__ocrVerification) throw Error('OCR mocks not installed');
        getCurrentPages().slice(-1)[0].goCamera();
      });
      let page;
      for (let attempt = 0; attempt < 30; attempt++) {
        page = await client.currentPage();
        if (page.path === 'pages/input/input' && await client.pageData(page, 'wrongAnswer') === photo.wrongAnswer) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.equal(page.path, 'pages/input/input');
      assert.equal(await client.pageData(page, 'question'), photo.question);
      assert.equal(await client.pageData(page, 'wrongAnswer'), photo.wrongAnswer);
      assert.equal(await client.pageData(page, 'answerLen'), photo.wrongAnswer.length);
      assert.equal((await client.pageData(page, 'ocrReview')).length, 1);
      await new Promise(resolve => setTimeout(resolve, 500));
      const frame = await client.send('App.captureScreenshot');
      assert.equal((await client.currentPage()).pageId, page.pageId);
      const file = path.join(work, `ocr-native-${entry}.png`);
      const bytes = Buffer.from(frame.data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      fs.writeFileSync(file, bytes);
      images.push({ file: path.relative(root, file), title: entry === 'home' ? '首页拍照入口 · 题干与作答分流' : '表单拍照入口 · 题干与作答分流', sha256: sha(bytes), note: '真实原生界面；照片与模型响应为隔离模拟。学生的错误步骤原样保留。换行方框仍未解决。' });
    }
    const checks = await call(function () { const state = getApp().__ocrVerification; return { calls: state.calls, historyUnchanged: state.history === JSON.stringify(wx.getStorageSync('errorHistory')), pendingConsumed: getApp().globalData.pendingPhoto === null }; });
    assert.deepEqual(checks, { calls: 2, historyUnchanged: true, pendingConsumed: true });
    const files = ['app.js', 'app.wxss', 'utils/ocr.js', 'pages/index/index.js', 'pages/input/input.js', 'pages/input/input.wxml', 'pages/input/input.wxss'];
    report = { status: 'PASS', layer: 'actual WeChat mini-program form and mocked photo/provider; NOT actual OCR accuracy', renderingIssue: 'PIXEL_REVIEW_PENDING', valuePreserved: true, screenshots: images, checks, realModelRequests: 0, realImageUploads: 0, foregroundActions: 0,
      sourceHashes: files.map(relative => ({ file: path.join('微信小程序', relative), sha256: sha(fs.readFileSync(path.join(root, '微信小程序', relative))) })) };
  } finally {
    if (installed) {
      const restored = await call(function () {
        const app = getApp(); const saved = app.__ocrVerification;
        Object.keys(saved.functions).forEach(name => { wx[name] = saved.functions[name]; });
        Object.keys(app.globalData).forEach(name => { delete app.globalData[name]; });
        Object.assign(app.globalData, saved.globals);
        delete app.__ocrVerification;
        return !app.__ocrVerification;
      });
      assert.equal(restored, true);
      if (report) report.mocksRemoved = true;
    }
    client.close();
  }
  if (report) {
    fs.writeFileSync(path.join(work, 'ocr-native.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ status: report.status, mockedOcrCalls: report.checks.calls, actualModelRequests: 0, historyUnchanged: report.checks.historyUnchanged, mocksRemoved: report.mocksRemoved, multilineIssue: 'OPEN' }));
  }
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });

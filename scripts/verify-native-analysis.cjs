// Dedicated WeChat simulator: local synthetic SSE, no model calls or user data.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { connect } = require('./verify-native-background.cjs');
const root = path.resolve(__dirname, '..');
const work = path.join(root, '_work/native-automation');
const input = { question: '解方程：\n(x-1)/2 + (x+3)/3 = 3', wrongAnswer: '解：\n两边同时乘以6\nx = 3' };
const result = { source: 'ai', question: input.question, knowledgePoint: '方程', diagnosis: '作答正确，代回原式成立。', causeNodes: [], steps: [{ question: '怎样检验结果？', hint: '代回原式', detail: '左右相等。' }], solution: 'x=3', variants: [] };
const rule = { source: 'rule', question: input.question, knowledgePoint: '方程', diagnosis: 'AI 诊断暂时不可用，无法判断作答对错。', causeNodes: [], steps: [{ question: '如何检查推导？', hint: '代回原式', detail: '' }], solution: '', variants: [] };
const makeFrame = data => Array.from(Buffer.from('data: ' + JSON.stringify({ type: 'start', requestId: 'analysis-12345678-abcd-4321-abcd-123456789abc' }) + '\n\ndata: ' + JSON.stringify({ type: 'result', data }) + '\n\n', 'utf8'));
async function run() {
  const c = await connect(); const call = async (fn, ...args) => (await c.send('App.callFunction', { functionDeclaration: fn.toString(), args })).result;
  let installed = false; let report;
  try {
    assert.equal((await c.currentPage()).path, 'pages/index/index');
    const lib = require('../server/causeNodes.js');
    await call(function (library, byteLists) {
      const app = getApp(); const keys = wx.getStorageInfoSync().keys;
      app.__analysisVerification = { request: wx.request, globals: { ...app.globalData }, keys: ['errorHistory', 'causeNodeLib'].map(key => ({ key, exists: keys.includes(key), value: wx.getStorageSync(key) })), calls: [] };
      wx.setStorageSync('errorHistory', []);
      wx.request = function (o) {
        const state = getApp().__analysisVerification;
        const url = String(o.url).split('?')[0].replace(/^https?:\/\/[^/]+/, ''); state.calls.push(url);
        if (url === '/api/cause-nodes') { if (o.success) o.success({ statusCode: 200, data: { code: 0, data: library } }); if (o.complete) o.complete(); return { abort() {} }; }
        if (url !== '/api/analyze/stream') throw Error('Unexpected network request');
        const byteList = byteLists[state.calls.filter(item => item === '/api/analyze/stream').length - 1];
        if (!byteList) throw Error('Unexpected additional analysis request');
        return { onChunkReceived: function (callback) {
          setTimeout(function () { for (const value of byteList) callback({ data: new Uint8Array([value]).buffer }); if (o.success) o.success({ statusCode: 200, data: '' }); }, 5);
        }, abort() {} };
      };
    }, { kpOrder: lib.KP_ORDER, categories: lib.CAUSE_CATEGORIES, nodes: lib.ERROR_CAUSE_NODES }, [makeFrame(result), makeFrame(rule)]);
    installed = true;
    await c.send('App.callWxMethod', { method: 'navigateTo', args: [{ url: '/pages/input/input' }] });
    let page;
    for (let i = 0; i < 60; i++) {
      page = await c.currentPage();
      const ready = (await call(function () { const p=getCurrentPages().slice(-1)[0];return p.route === 'pages/input/input' && typeof p.onSubmit === 'function'; }));
      if (page.path === 'pages/input/input' && ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(page.path, 'pages/input/input');
    await call(function (sample) { const p=getCurrentPages().slice(-1)[0]; p.onQuestionInput({detail:{value:sample.question}});p.onAnswerInput({detail:{value:sample.wrongAnswer}});p.onSubmit(); }, input);
    for (let i = 0; i < 80; i++) { page=await c.currentPage();if(page.path==='pages/result/result')break;await new Promise(resolve=>setTimeout(resolve,100)); }
    assert.equal(page.path, 'pages/result/result', 'did not reach diagnosis report');
    const history = (await c.send('App.callWxMethod', { method:'getStorageSync', args:['errorHistory'] })).result;
    assert.equal(history.length, 1); assert.equal(history[0].question, input.question); assert.equal(history[0].wrongAnswer, input.wrongAnswer); assert.equal(history[0].result.diagnosis, result.diagnosis);
    assert.equal(history[0].result.source, result.source);
    await new Promise(resolve=>setTimeout(resolve,250));
    const shot = await c.send('App.captureScreenshot');
    const file = path.join(work,'analysis-repair-report.png');const buffer = Buffer.from(shot.data.replace(/^data:image\/\w+;base64,/,''),'base64');fs.writeFileSync(file,buffer);
    await c.send('App.callWxMethod', { method: 'navigateTo', args: [{ url: '/pages/input/input' }] });
    for(let i=0;i<60;i++){page=await c.currentPage();if(page.path==='pages/input/input' && (await call(function(){const p=getCurrentPages().slice(-1)[0];return p.route==='pages/input/input'&&typeof p.onSubmit==='function'})))break;await new Promise(resolve=>setTimeout(resolve,100));}
    assert.equal(page.path,'pages/input/input');
    await call(function (sample) { const p=getCurrentPages().slice(-1)[0];p.onQuestionInput({detail:{value:sample.question}});p.onAnswerInput({detail:{value:sample.wrongAnswer}});p.onSubmit(); },input);
    for(let i=0;i<80;i++){page=await c.currentPage();if(page.path==='pages/result/result' && (await c.pageData(page,'result'))?.source==='rule')break;await new Promise(resolve=>setTimeout(resolve,100));}
    assert.equal(page.path,'pages/result/result');assert.equal((await c.pageData(page,'result')).source,'rule');
    const after = (await c.send('App.callWxMethod',{method:'getStorageSync',args:['errorHistory']})).result;
    assert.equal(after.length,2);assert.equal(after[0].result.source,'rule');assert.equal(after[0].result.causeNodes.length,0);assert.equal(after[0].wrongAnswer,input.wrongAnswer);
    let note;for(let i=0;i<40;i++){note=await c.inspect(page,'.source-note');if(!note.missing)break;await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(!note.missing,'honest fallback notice is missing');
    await new Promise(resolve=>setTimeout(resolve,250));
    const fallbackShot=await c.send('App.captureScreenshot');const fallbackFile=path.join(work,'analysis-repair-rule.png');const fallbackBuffer=Buffer.from(fallbackShot.data.replace(/^data:image\/\w+;base64,/,''),'base64');fs.writeFileSync(fallbackFile,fallbackBuffer);
    const calls = await call(function () { return getApp().__analysisVerification.calls; });
    assert.equal(calls.filter(url => url === '/api/analyze/stream').length,2);
    assert.ok(calls.every(url => ['/api/analyze/stream','/api/cause-nodes'].includes(url)));
    report = { status:'PASS', layer:'real WeChat simulator with mocked SSE; not real model or phone', checks:{reportReached:true,exactQuestion:true,exactAnswer:true,exactDiagnosis:true,honestFallback:true,twoMockRequests:true,providerRequests:0}, screenshot:{file,sha256:crypto.createHash('sha256').update(buffer).digest('hex')}, fallbackScreenshot:{file:fallbackFile,sha256:crypto.createHash('sha256').update(fallbackBuffer).digest('hex')}, sourceHashes:['app.json','pages/input/input.js','pages/input/input.wxml','utils/utf8-stream.js','pages/result/result.wxml','pages/result/result.wxss'].map(p=>({file:'微信小程序/'+p,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'微信小程序',p))).digest('hex')})) };
  } finally {
    if(installed) { const restored=await call(function(){const app=getApp(),v=app.__analysisVerification;v.keys.forEach(item=>item.exists?wx.setStorageSync(item.key,item.value):wx.removeStorageSync(item.key));wx.request=v.request;Object.keys(app.globalData).forEach(k=>{delete app.globalData[k]});Object.assign(app.globalData,v.globals);delete app.__analysisVerification;return true});assert.equal(restored,true);if(report)report.fixtureRestored=true; }
    c.close();
  }
  if(report){fs.writeFileSync(path.join(work,'analysis-repair-native.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,...report.checks,fixtureRestored:report.fixtureRestored}));}
}
run().catch(e=>{console.error(e.message);process.exitCode=1});

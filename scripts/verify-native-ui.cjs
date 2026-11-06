// Native page logic checks with an isolated wx host. No device storage or network.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const mini = path.join(root, '微信小程序');
const library = require(path.join(root, 'server/causeNodes.js'));
const fixture = { source: 'ai', question: '解方程：2(x-3)=x+4。', knowledgePoint: '方程', diagnosis: '移项时忘记变号，正确解为 x=10。', confidence: 97, causeNodes: [{ id: 'E41', name: '计算过程粗心出错' }], steps: [{ question: '怎样去括号？', hint: '使用分配律', detail: '2x-6=x+4' }, { question: '怎样移项？', hint: '等式两边同时加6', detail: 'x=10' }], solution: 'x=10', variants: [{ question: '3(x-2)=x+1', answer: 'x=7/2' }] };
const clone = value => JSON.parse(JSON.stringify(value));
const record = (id, wrong = `wrong-${id}`) => ({ id, question: `题目${id}`, wrongAnswer: wrong, time: '2026-10-31 20:00', result: { ...clone(fixture), question: `题目${id}` } });
function host(history = [], options = {}) {
  const calls = [];
  const storage = { errorHistory: clone(history) };
  const stack = [{ route: 'pages/index/index' }];
  const app = { globalData: { lastResult: null, pendingPhoto: null, lastWrongAnswer: '' } };
  const wx = { getStorageSync: key => clone(storage[key] ?? []), setStorageSync: (k, v) => { storage[k] = clone(v); calls.push(['storage', k]); }, removeStorageSync: k => { delete storage[k]; calls.push(['removeStorage', k]); }, navigateTo: x => calls.push(['navigateTo', x]), redirectTo: x => calls.push(['redirectTo', x]), navigateBack: x => calls.push(['navigateBack', x]), showToast: x => calls.push(['toast', x]), showModal: x => calls.push(['modal', x]), showLoading: () => {}, hideLoading: () => {}, request: () => { throw Error('Unexpected network request; all test APIs must be explicitly mocked'); }, chooseMedia: () => { throw Error('Unexpected camera request'); } };
  const cache = new Map();
  const canonicalLibrary = { kpOrder: library.KP_ORDER, categories: library.CAUSE_CATEGORIES, nodes: library.ERROR_CAUSE_NODES };
  let activeLibrary = options.deferLibrary ? null : canonicalLibrary;
  const libraryCallbacks = [];
  function load(file, kind) {
    const absolute = path.isAbsolute(file) ? file : path.join(mini, file);
    const module = { exports: {} };
    let captured;
    const localRequire = id => {
      const target = path.resolve(path.dirname(absolute), id + (path.extname(id) ? '' : '.js'));
      // Explicit isolated transport fixture; never perform real WeChat identity or public uploads.
      if (target === path.join(mini, 'utils/config.js')) return {baseUrl:'http://127.0.0.1:3000',authRequired:false};
      if (target === path.join(mini, 'utils/causeNodes.js')) return { loadLibrary: cb => activeLibrary ? cb(activeLibrary) : libraryCallbacks.push(cb), getLibrary: () => activeLibrary, resolveNode: ref => library.ERROR_CAUSE_NODES.find(n => n.id === ref.id) || ref };
      if (!cache.has(target)) cache.set(target, load(target));
      return cache.get(target);
    };
    vm.runInNewContext(fs.readFileSync(absolute, 'utf8'), { module, exports: module.exports, require: localRequire, wx, getApp: () => app, getCurrentPages: () => stack, Page: x => { captured = x; }, Component: x => { captured = x; }, console, TextDecoder: options.noTextDecoder ? undefined : TextDecoder, setTimeout: () => 0, clearTimeout: () => {} }, { filename: absolute });
    if (kind !== 'page') return module.exports;
    const p = { data: clone(captured.data || {}), setData(patch, cb) { for (const [key, value] of Object.entries(patch)) { const bits = key.replace(/\[(\d+)\]/g, '.$1').split('.'); let obj = this.data; bits.slice(0, -1).forEach(b => { obj = obj[b]; }); obj[bits.at(-1)] = value; } if (cb) cb(); } };
    Object.entries(captured).forEach(([k, v]) => { if (typeof v === 'function') p[k] = v.bind(p); });
    return p;
  }
  return { calls, storage, stack, app, wx, load, hydrateLibrary() { activeLibrary = canonicalLibrary; libraryCallbacks.splice(0).forEach(cb => cb(activeLibrary)); }, page: name => load(`pages/${name}/${name}.js`, 'page') };
}
module.exports = { host, record };
if (require.main === module) {
const results = [];
function check(name, run) { try { run(); results.push({ name, pass: true }); } catch (e) { results.push({ name, pass: false, reason: e.message }); } }
check('home recent records are derived from storage without writing it', () => {
  const h = host([record(9), record(8), record(7), record(6)]); const p = h.page('index'); p.onShow();
  assert.deepEqual(Array.from(p.data.recentRecords, r => r.id), [9, 8, 7]); assert.equal(p.data.totalRecords, 4); assert.equal(h.calls.length, 0);
  const empty = host(); const ep = empty.page('index'); ep.onShow(); assert.equal(ep.data.recentRecords.length, 0);
});
check('recent record reopening preserves original wrong answer', () => {
  const h = host([record(9, 'recent-work')]); const p = h.page('index'); p.onShow(); p.viewRecent({ currentTarget: { dataset: { id: 9 } } });
  assert.equal(h.app.globalData.lastWrongAnswer, 'recent-work'); assert.equal(h.app.globalData.lastResult.question, '题目9'); assert.equal(h.calls.at(-1)[1].url, '/pages/result/result');
});
// The new task flow and explicit history confirmation are tested in verify-drafts-jobs.cjs.
check('history reopening preserves wrong answer without altering stored rows', () => {
  const h = host([record(2, 'old-work')]); const p = h.page('history'); p.onShow(); p.viewRecord({ currentTarget: { dataset: { id: 2 } } });
  assert.equal(h.app.globalData.lastWrongAnswer, 'old-work'); assert.equal(h.calls.filter(x => x[0] === 'storage').length, 0);
});
check('report defaults to thinking and consumes the matching answer context', () => {
  const h = host(); h.app.globalData.lastResult = clone(fixture); h.app.globalData.lastWrongAnswer = 'x=-2'; const p = h.page('result'); p.onLoad();
  assert.equal(p.data.activeTab, 'steps'); assert.equal(p.data.wrongAnswer, 'x=-2'); assert.equal(h.app.globalData.lastWrongAnswer, '');
  assert.equal(p.data.solutionExpanded, false); assert.equal(p.data.result.variants[0].expanded, false); assert.equal(p.data.result.steps[0].showHint, false);
  p.toggleHint({ currentTarget: { dataset: { index: 0 } } }); assert.equal(p.data.result.steps[0].showHint, true);
  p.switchReportTab({ currentTarget: { dataset: { tab: 'variants' } } }); assert.equal(p.data.activeTab, 'variants');
  p.switchReportTab({ currentTarget: { dataset: { tab: 'invalid' } } }); assert.equal(p.data.activeTab, 'variants');
});
check('empty AI reply is an inline failure, never an ok success message', () => {
  const h = host(); const p = h.page('result'); p.data.result = clone(fixture); p.data.chatInput = '为什么移项变号？';
  h.wx.request = opts => { opts.success({ statusCode: 200, data: { code: 0, msg: 'ok', data: { reply: '' } } }); opts.complete(); };
  p.sendChat(); assert.match(p.data.chatError, /回复|收到/); assert.equal(p.data.chatting, false); assert.equal(p.data.chat.filter(x => x.role === 'assistant').length, 0); assert.ok(!h.calls.some(x => x[0] === 'toast' && x[1].title === 'ok'));
});
check('again from history opens input rather than returning to history', () => {
  const h = host(); h.stack.push({ route: 'pages/history/history' }, { route: 'pages/result/result' }); h.page('result').goAgain();
  assert.equal(h.calls.at(-1)[0], 'redirectTo'); assert.equal(h.calls.at(-1)[1].url, '/pages/input/input');
});
check('again over input reuses its page as a fresh form and preserves the old draft', () => {
  const h=host();h.wx.getStorageInfoSync=()=>({keys:Object.keys(h.storage)});const input=h.page('input');input.onLoad();input.onQuestionInput({detail:{value:'原题'}});const oldId=input._draftId;
  h.stack.push({route:'pages/input/input'},{route:'pages/result/result'});h.page('result').goAgain();assert.equal(h.calls.at(-1)[0],'navigateBack');
  input.onShow();assert.equal(input.data.question,'');assert.equal(input._draftId,'');assert.equal(h.storage['mathDraft:'+oldId].question,'原题');
});
check('main navigation reuses existing pages and ignores invalid keys', () => {
  const h = host(); h.stack.push({ route: 'pages/history/history' }, { route: 'pages/result/result' }); const nav = h.load('utils/navigation.js'); nav.openMain('history');
  assert.equal(h.calls.at(-1)[0], 'navigateBack'); assert.equal(h.calls.at(-1)[1].delta, 1); const n = h.calls.length; nav.openMain('invalid'); assert.equal(h.calls.length, n);
});
check('OCR cancellation releases busy state and never uploads', () => {
  const h = host(); h.wx.chooseMedia = o => o.fail({ errMsg: 'chooseMedia:fail cancel' }); const p = h.page('index'); p.goCamera(); assert.equal(p.data.recognizing, false); assert.equal(h.calls.filter(x => x[0] === 'modal').length, 0);
});
function analyzeHost(options = {}) {
  const h = host([], options); const p = h.page('input'); const requests = [];
  p.data.question = fixture.question; p.data.wrongAnswer = '2x − x = 4 − 6\nx = −2';
  h.wx.request = args => { const request = { args, chunks: null }; requests.push(request); return { onChunkReceived: cb => { request.chunks = cb; } }; };
  return { h, p, requests };
}
const sseResult = (data = fixture, newline = '\n') => 'data: ' + JSON.stringify({ type: 'result', data }) + newline + newline;
const byteBuffer = bytes => Uint8Array.from(bytes).buffer;
check('incremental UTF-8 matches standard decoding across Unicode boundaries and rejects malformed tails', () => {
  const { Utf8Stream } = host().load('utils/utf8-stream.js');
  const expected = 'ASCII ' + String.fromCodePoint(0x7f, 0x80, 0x7ff, 0x800, 0xd7ff, 0xe000, 0xffff, 0x10000, 0x10ffff) + '数学🙂';
  const encoded = Buffer.from(expected, 'utf8');
  for (let width = 1; width <= 9; width++) {
    const decoder = new Utf8Stream(); let actual = '';
    for (let pos = 0; pos < encoded.length; pos += width) actual += decoder.write(byteBuffer(encoded.subarray(pos, pos + width)));
    actual += decoder.write(null, true); assert.equal(actual, expected);
  }
  const incomplete = new Utf8Stream(); incomplete.write(byteBuffer([0xe4, 0xb8])); assert.throws(() => incomplete.write(null, true));
  assert.throws(() => new Utf8Stream().write(byteBuffer([0xc0, 0x80]), true));
});
// The input no longer consumes SSE; server stream coverage remains in verify-analysis-http.cjs.
function mockOcr(h, data = { question: fixture.question, wrongAnswer: '2x-x=4-6\nx=-2', needsReview: false, reviewReasons: [] }) {
  h.wx.chooseMedia = o => o.success({ tempFiles: [{ tempFilePath: '/isolated/test.jpg' }] });
  h.wx.compressImage = o => o.success({ tempFilePath: '/isolated/compressed.jpg' });
  h.wx.getFileSystemManager = () => ({ readFile: o => o.success({ data: 'aW1hZ2U=' }) });
  h.wx.request = o => { assert.match(o.url, /\/api\/ocr$/); o.success({ statusCode: 200, data: { code: 0, data } }); };
}
check('OCR works from home and the input form through one shared operation', () => {
  const h = host(); mockOcr(h); const p = h.page('index'); p.goCamera(); assert.equal(h.app.globalData.pendingPhoto.question, fixture.question); assert.equal(p.data.recognizing, false);
  const p2 = h.page('input'); p2.onLoad(); assert.equal(p2.data.question, fixture.question); assert.equal(p2.data.wrongAnswer, '2x-x=4-6\nx=-2'); assert.equal(p2.data.answerLen, p2.data.wrongAnswer.length); assert.equal(h.app.globalData.pendingPhoto, null);
  const p3 = h.page('input'); p3.goCamera(); assert.equal(p3.data.question, fixture.question); assert.equal(p3.data.wrongAnswer, p2.data.wrongAnswer); assert.equal(p3.data.recognizing, false);
});
check('photo result gives visible review feedback without an extra confirmation', () => {
  const h=host(); h.wx.getStorageInfoSync=()=>({keys:Object.keys(h.storage)});
  const p=h.page('input'); p.onLoad(); p.applyPhoto({question:'2x+1=7',wrongAnswer:'x=2',reviewReasons:[]});
  assert.match(p.data.photoNotice,/识别完成/); assert.match(p.data.photoNotice,/核对/); assert.equal(p.data.saveState,'已保存');
  assert.ok(!h.calls.some(call=>call[0]==='modal'));
});
check('completed task offers its report directly without changing edited input', () => {
  const h=host(); h.wx.getStorageInfoSync=()=>({keys:Object.keys(h.storage)});
  h.wx.getUserCryptoManager=()=>({getRandomValues:o=>o.success({randomValues:Uint8Array.from({length:o.length},(_,i)=>i+1).buffer})});
  const req=[]; h.wx.request=o=>req.push(o);
  const p=h.page('input');p.onLoad();p.onShow();p.onQuestionInput({detail:{value:'2x+1=7'}});p.onAnswerInput({detail:{value:'x=2'}});p.onSubmit();
  const id=req[0].data.taskId;req[0].success({statusCode:202,data:{code:0,data:{taskId:id,status:'queued'}}});
  p.refreshTask();req[1].success({statusCode:200,data:{code:0,data:{taskId:id,status:'complete',result:{source:'ai',question:'2x+1=7',diagnosis:'检查计算',steps:[],variants:[]}}}});
  assert.equal(p.data.primaryMode,'report');assert.equal(req.filter(x=>x.method==='POST').length,1);
  p.onSubmit();assert.ok(h.calls.some(c=>c[0]==='navigateTo' && c[1].url.includes('/pages/result/result?taskId=')));
  assert.equal(h.app.globalData.lastWrongAnswer,'x=2');
  p.onHide();p.onShow();
  p.onQuestionInput({detail:{value:'已经修改的新题目'}});assert.equal(p.data.question,'已经修改的新题目');assert.equal(p.data.primaryMode,'analyze');assert.equal(p.data.previousReportReady,true);
  p.openTaskResult();assert.equal(h.app.globalData.lastResult.question,'2x+1=7');assert.equal(p.data.question,'已经修改的新题目');
});
check('double-tapping the completed report opens it only once', () => {
  const h=host();h.wx.getStorageInfoSync=()=>({keys:Object.keys(h.storage)});const p=h.page('input');p.onLoad();p.onQuestionInput({detail:{value:'题目'}});
  const id='a'.repeat(32);h.storage['mathJob:'+id]={taskId:id,draftId:p._draftId,status:'complete',snapshot:{question:'题目',wrongAnswer:''},result:{question:'题目',diagnosis:'结果',steps:[],variants:[]}};
  p.onShow();p.onSubmit();p.onSubmit();assert.equal(h.calls.filter(c=>c[0]==='navigateTo').length,1);
});
check('analysis received while page is hidden resumes without forcing navigation', () => {
  const h=host();h.wx.getStorageInfoSync=()=>({keys:Object.keys(h.storage)});
  h.wx.getUserCryptoManager=()=>({getRandomValues:o=>o.success({randomValues:Uint8Array.from({length:o.length},(_,i)=>i+1).buffer})});
  const req=[];h.wx.request=o=>req.push(o);const p=h.page('input');p.onLoad();p.onShow();p.onQuestionInput({detail:{value:'题目'}});p.onSubmit();p.onHide();
  const id=req[0].data.taskId;req[0].success({statusCode:202,data:{code:0,data:{taskId:id,status:'queued'}}});
  assert.ok(!h.calls.some(c=>c[0]==='navigateTo'));p.onShow();assert.equal(p.data.submitting,false);assert.equal(p.data.primaryMode,'waiting');
  p.refreshTask();req[1].success({statusCode:200,data:{code:0,data:{taskId:id,status:'complete',result:{source:'ai',question:'题目',diagnosis:'结果',steps:[],variants:[]}}}});
  assert.equal(p.data.primaryMode,'report');assert.ok(!h.calls.some(c=>c[0]==='navigateTo'));
});
check('backgrounding during secure ID generation cannot start two submissions', () => {
  const h=host();h.wx.getStorageInfoSync=()=>({keys:Object.keys(h.storage)});let randomCalls=0,randomCallback;
  h.wx.getUserCryptoManager=()=>({getRandomValues:o=>{randomCalls++;randomCallback=o.success}});
  const req=[];h.wx.request=o=>req.push(o);const p=h.page('input');p.onLoad();p.onShow();p.onQuestionInput({detail:{value:'题目'}});p.onSubmit();p.onHide();p.onShow();p.onSubmit();
  assert.equal(randomCalls,1);randomCallback({randomValues:Uint8Array.from({length:48},(_,i)=>i+1).buffer});assert.equal(req.length,1);
});
check('late old submission callback cannot replace a newer task', () => {
  const h=host();h.wx.getStorageInfoSync=()=>({keys:Object.keys(h.storage)});let seed=0;
  h.wx.getUserCryptoManager=()=>({getRandomValues:o=>o.success({randomValues:Uint8Array.from({length:o.length},()=>++seed%255).buffer})});
  const req=[];h.wx.request=o=>req.push(o);const p=h.page('input');p.onLoad();p.onShow();p.onQuestionInput({detail:{value:'题目'}});p.onSubmit();req[0].fail({});
  p.onSubmit();const confirm=h.calls.find(c=>c[0]==='modal');assert.ok(confirm);confirm[1].success({confirm:true});
  const newId=req[1].data.taskId;req[1].success({statusCode:202,data:{code:0,data:{taskId:newId,status:'queued'}}});
  req[0].success({statusCode:202,data:{code:0,data:{taskId:req[0].data.taskId,status:'queued'}}});assert.equal(p._taskId,newId);
});
check('returning after deleting a task restores the analysis action', () => {
  const h=host();h.wx.getStorageInfoSync=()=>({keys:Object.keys(h.storage)});h.wx.getUserCryptoManager=()=>({getRandomValues:o=>o.success({randomValues:Uint8Array.from({length:o.length},(_,i)=>i+1).buffer})});
  const req=[];h.wx.request=o=>req.push(o);const p=h.page('input');p.onLoad();p.onShow();p.onQuestionInput({detail:{value:'题目'}});p.onSubmit();const id=req[0].data.taskId;
  req[0].success({statusCode:202,data:{code:0,data:{taskId:id,status:'queued'}}});p.onHide();delete h.storage['mathJob:'+id];p.onShow();assert.equal(p.data.primaryMode,'analyze');assert.equal(p._taskId,'');
});
check('saving as another draft disconnects late old task callbacks', () => {
  const h=host();h.wx.getStorageInfoSync=()=>({keys:Object.keys(h.storage)});h.wx.getUserCryptoManager=()=>({getRandomValues:o=>o.success({randomValues:Uint8Array.from({length:o.length},(_,i)=>i+1).buffer})});
  const req=[];h.wx.request=o=>req.push(o);const p=h.page('input');p.onLoad();p.onShow();p.onQuestionInput({detail:{value:'原题'}});p.onSubmit();const oldDraft=p._draftId,id=req[0].data.taskId;
  p.saveAsNew();assert.notEqual(p._draftId,oldDraft);p.onQuestionInput({detail:{value:'新题'}});req[0].success({statusCode:202,data:{code:0,data:{taskId:id,status:'queued'}}});
  assert.equal(p._taskId,'');assert.equal(p.data.primaryMode,'analyze');assert.equal(h.storage['mathJob:'+id].draftId,oldDraft);
});
check('reanalysis confirmation survives hide and cannot submit twice', () => {
  const h=host();h.wx.getStorageInfoSync=()=>({keys:Object.keys(h.storage)});let seed=0;h.wx.getUserCryptoManager=()=>({getRandomValues:o=>o.success({randomValues:Uint8Array.from({length:o.length},()=>++seed%255).buffer})});
  const req=[];h.wx.request=o=>req.push(o);const p=h.page('input');p.onLoad();p.onShow();p.onQuestionInput({detail:{value:'题目'}});p.onSubmit();req[0].fail({});p.onSubmit();const modal=h.calls.find(c=>c[0]==='modal')[1];
  p.onHide();p.onShow();p.onSubmit();assert.equal(h.calls.filter(c=>c[0]==='modal').length,1);modal.success({confirm:true});modal.success({confirm:true});assert.equal(req.length,2);
});
check('question-only and answer-only photos preserve the complementary manual field', () => {
  const h = host(); mockOcr(h, { question: fixture.question, wrongAnswer: '', needsReview: false, reviewReasons: [] });
  const p = h.page('input'); p.data.wrongAnswer = 'keep-work'; p.goCamera(); assert.equal(p.data.wrongAnswer, 'keep-work'); assert.equal(p.data.question, fixture.question);
  mockOcr(h, { question: '', wrongAnswer: '新的手写步骤\nx=-2', needsReview: true, reviewReasons: ['请补充题干'] });
  const p2 = h.page('input'); p2.data.question = 'keep-question'; p2.goCamera(); assert.equal(p2.data.question, 'keep-question'); assert.equal(p2.data.wrongAnswer, '新的手写步骤\nx=-2'); assert.ok(p2.data.ocrReview.length);
});
check('replacing an edited OCR draft requires confirmation and cancel preserves both fields', () => {
  const h = host(); mockOcr(h); const p = h.page('input'); p.data.question = 'old-question'; p.data.wrongAnswer = 'old-work';
  let modal; h.wx.showModal = o => { modal = o; }; p.goCamera(); assert.equal(p.data.question, 'old-question'); modal.success({ confirm: false }); assert.equal(p.data.wrongAnswer, 'old-work');
  p.goCamera(); modal.success({ confirm: true }); assert.equal(p.data.question, fixture.question); assert.equal(p.data.wrongAnswer, '2x-x=4-6\nx=-2');
});
check('OCR rejects malformed and oversized fields without replacing drafts or saving history', () => {
  for (const data of [{ question: null, wrongAnswer: 'x=2' }, { question: 'a'.repeat(2001), wrongAnswer: '' }, { question: 'ok', wrongAnswer: 'a'.repeat(1001) }, { question: '', wrongAnswer: '' }]) {
    const h = host(); mockOcr(h, data); const p = h.page('input'); p.data.question = 'keep'; p.goCamera();
    assert.equal(p.data.question, 'keep'); assert.equal(p.data.recognizing, false); assert.ok(h.calls.some(call => call[0] === 'modal')); assert.equal(h.calls.filter(call => call[0] === 'storage').length, 0);
  }
});
check('the still-running legacy OCR response is accepted only with a review reminder', () => {
  const h = host(); mockOcr(h, { text: fixture.question }); const p = h.page('input'); p.goCamera();
  assert.equal(p.data.question, fixture.question); assert.equal(p.data.wrongAnswer, ''); assert.ok(p.data.ocrReview.length);
});
check('history filtering and real statistics still work', () => {
  const h = host([record(1), record(2)]); const p = h.page('history'); p.onShow(); p.onSearch({ detail: { value: '题目2' } }); assert.equal(p.data.filtered.length, 1);
  const stats = h.page('stats'); stats.onShow(); assert.equal(stats.data.total, 2); assert.equal(stats.data.kpStats[0].count, 2); assert.equal(stats.data.causeStats[0].count, 2);
});
check('custom labels can be created, assigned, combined with knowledge filters, renamed and deleted without changing questions', () => {
  const first = record(1), second = record(2); second.result.knowledgePoint = '对数';
  const h = host([first, second]); const before = JSON.stringify(h.storage.errorHistory); const p = h.page('history'); p.onShow();
  p.openTagEditor({ currentTarget: { dataset: { id: 1 } } });
  p.createTag('期中复习'); p.createTag('容易算错');
  assert.equal(p.data.tagCatalog.length, 2);
  const midterm = p.data.tagCatalog[0].id, calculation = p.data.tagCatalog[1].id;
  assert.deepEqual(Array.from(p.data.records.find(r => r.id === 1).tagNames), ['期中复习', '容易算错']);
  p.toggleTagForRecord(calculation);
  assert.deepEqual(Array.from(p.data.records.find(r => r.id === 1).tagNames), ['期中复习']);
  p.selectTagFilter({ currentTarget: { dataset: { id: midterm } } });
  p.onFilterTap({ currentTarget: { dataset: { kp: '方程' } } });
  assert.deepEqual(Array.from(p.data.filtered, r => r.id), [1]);
  p.onFilterTap({ currentTarget: { dataset: { kp: '对数' } } }); assert.equal(p.data.filtered.length, 0);
  p.renameTag(midterm, '期末复习');
  assert.deepEqual(Array.from(p.data.records.find(r => r.id === 1).tagNames), ['期末复习']);
  p.deleteTag(midterm); assert.equal(p.data.selectedTagId, '');
  assert.equal(p.data.records.length, 2); assert.equal(JSON.stringify(h.storage.errorHistory), before);
  assert.deepEqual(Array.from(p.data.records.find(r => r.id === 1).tagNames), []);
});
check('label editing from a reopened report preserves the identity of the original record', () => {
  const h = host([record(42)]); const history = h.page('history'); history.onShow();
  history.viewRecord({ currentTarget: { dataset: { id: 42 } } });
  assert.match(h.calls.at(-1)[1].url, /recordId=42/);
  const report = h.page('result'); report.onLoad({ recordId: '42' }); report.openTagEditor();
  assert.match(h.calls.at(-1)[1].url, /\/pages\/history\/history\?tagRecordId=42/);
});
check('a report can reopen its label editor after asynchronous page state updates', () => {
  const h = host([record(42)]); const page = h.page('history'); const callbacks = [];
  const setData = page.setData.bind(page);
  page.setData = (patch, callback) => setData(patch, callback ? () => callbacks.push(callback) : undefined);
  page.onLoad({ tagRecordId: '42' }); page.onShow();
  while (callbacks.length) callbacks.shift()();
  assert.equal(page.data.editorRecordId, '42'); assert.equal(page.data.fromReport, true);
});
check('corrupt label storage and failed writes never alter existing question records', () => {
  const h = host([record(1)]); const before = JSON.stringify(h.storage.errorHistory);
  h.storage.userQuestionTags = { tags: 'invalid', assignments: {} };
  const p = h.page('history'); p.onShow(); p.createTag('复习');
  assert.equal(p.data.tagStorageReady, false); assert.equal(h.storage.userQuestionTags.tags, 'invalid');
  delete h.storage.userQuestionTags; p.onShow(); p.openTagEditor({ currentTarget: { dataset: { id: 1 } } });
  h.wx.setStorageSync = () => { throw Error('storage unavailable') }; p.createTag('复习');
  assert.equal(p.data.tagCatalog.length, 0); assert.equal(JSON.stringify(h.storage.errorHistory), before);
});
check('deleting a question removes only its label links and leaves other questions and labels intact', () => {
  const h = host([record(1), record(2)]); const p = h.page('history'); p.onShow();
  p.openTagEditor({ currentTarget: { dataset: { id: 1 } } }); p.createTag('复习');
  const id = p.data.tagCatalog[0].id;
  p.openTagEditor({ currentTarget: { dataset: { id: 2 } } }); p.toggleTagForRecord(id);
  h.wx.showModal = options => options.success({ confirm: true });
  p.removeRecord({ currentTarget: { dataset: { id: 1 } } });
  assert.deepEqual(Array.from(h.storage.errorHistory, row => row.id), [2]);
  assert.equal(h.storage.userQuestionTags.tags.length, 1);
  assert.ok(!Object.prototype.hasOwnProperty.call(h.storage.userQuestionTags.assignments, '1'));
  assert.deepEqual(Array.from(h.storage.userQuestionTags.assignments['2']), [id]);
});
check('ambiguous matching reports never edit a different stored question', () => {
  const one = record(1), two = record(2); two.question = one.question; two.wrongAnswer = one.wrongAnswer; two.result = JSON.parse(JSON.stringify(one.result));
  const h = host([one, two]); h.app.globalData.lastResult = JSON.parse(JSON.stringify(one.result)); h.app.globalData.lastWrongAnswer = one.wrongAnswer;
  const page = h.page('result'); page.onLoad(); assert.equal(page.data.recordId, ''); page.openTagEditor();
  assert.equal(h.calls.filter(call => call[0] === 'navigateTo').length, 0);
});
check('a freshly saved unique report can open its own label editor', () => {
  const row = record(7); const h = host([row]); h.app.globalData.lastResult = JSON.parse(JSON.stringify(row.result)); h.app.globalData.lastWrongAnswer = row.wrongAnswer;
  const page = h.page('result'); page.onLoad(); assert.equal(page.data.recordId, '7');
  page.openTagEditor(); assert.match(h.calls.at(-1)[1].url, /tagRecordId=7/);
});
check('duplicate labels are rejected without changing their assignments', () => {
  const h = host([record(1)]); const p = h.page('history'); p.onShow();
  p.openTagEditor({ currentTarget: { dataset: { id: 1 } } }); p.createTag('期中复习');
  const before = JSON.stringify(h.storage.userQuestionTags); p.createTag('  期中复习  ');
  assert.equal(JSON.stringify(h.storage.userQuestionTags), before); assert.equal(p.data.tagCatalog.length, 1);
});
check('zero-record statistics retain real zero counters, category bars and cause tree without writes', () => {
  const h = host(); const p = h.page('stats'); p.onShow();
  assert.equal(p.data.total, 0); assert.equal(p.data.kpCount, 0); assert.equal(p.data.causeCount, 0); assert.equal(p.data.causeTotal, 0);
  assert.equal(p.data.kpStats.length, 0); assert.equal(p.data.causeStats.length, 0);
  assert.equal(p.data.kpDisplay.length, library.KP_ORDER.length);
  assert.ok(p.data.kpDisplay.every(row => row.count === 0 && row.percent === 0 && Number.isFinite(row.percent)));
  assert.equal(p.data.causeDisplay.length, library.CAUSE_CATEGORIES.length);
  assert.ok(p.data.causeDisplay.every(row => row.count === 0));
  const nodes = p.data.causeTree.flatMap(b => b.categories.flatMap(c => c.children));
  assert.equal(nodes.length, 50); assert.ok(nodes.every(n => n.count === 0));
  assert.equal(h.calls.filter(c => c[0] === 'storage').length, 0);
});
check('nonzero statistics keep observed values instead of mixing zero display categories into totals', () => {
  const h = host([record(1), record(2)]); const p = h.page('stats'); p.onShow();
  assert.equal(p.data.total, 2); assert.equal(p.data.kpCount, 1); assert.equal(p.data.causeCount, 1); assert.equal(p.data.causeTotal, 2);
  assert.equal(p.data.kpDisplay.length, library.KP_ORDER.length);
  const hit = p.data.kpDisplay.find(row => row.name === fixture.knowledgePoint);
  assert.equal(hit.count, 2); assert.equal(hit.percent, 100);
  assert.ok(p.data.kpDisplay.filter(row => row !== hit).every(row => row.count === 0 && row.percent === 0));
});
check('empty and populated statistics use the same category order, rows and initial expansion', () => {
  const empty = host().page('stats'); empty.onShow();
  const populated = host([record(1)]).page('stats'); populated.onShow();
  for (const field of ['kpDisplay', 'causeDisplay', 'causeTree']) {
    assert.deepEqual(Array.from(empty.data[field], row => row.name), Array.from(populated.data[field], row => row.name));
  }
  assert.equal(empty.data.kpRows.flatMap(row => row.items).length, library.KP_ORDER.length);
  assert.equal(populated.data.kpRows.flatMap(row => row.items).length, library.KP_ORDER.length);
  assert.equal(populated.data.causeDisplay.reduce((sum, row) => sum + row.count, 0), 1);
  assert.ok(empty.data.causeTree.every(row => !row.expanded));
  assert.ok(populated.data.causeTree.every(row => !row.expanded));
});
check('library hydration retains unique semantic chart-row keys and real local counts', () => {
  const h = host([record(1), record(2)], { deferLibrary: true }); const p = h.page('stats'); p.onShow();
  const verifyKeys = () => {
    const keys = Array.from(p.data.kpRows, row => row.key);
    assert.ok(keys.every(key => typeof key === 'string' && key.length > 0));
    assert.equal(new Set(keys).size, keys.length);
    assert.equal(p.data.kpRows.flatMap(row => row.items).reduce((sum, item) => sum + item.count, 0), 2);
    assert.equal(p.data.total, 2); assert.equal(p.data.kpCount, 1);
  };
  verifyKeys(); h.hydrateLibrary(); verifyKeys();
  assert.equal(p.data.kpDisplay.length, library.KP_ORDER.length);
  assert.equal(h.calls.length, 0);
});
check('all native event handlers and local components resolve', () => {
  for (const name of ['index', 'input', 'result', 'history', 'stats']) {
    const h = host(); const p = h.page(name); const prefix = path.join(mini, 'pages', name, name);
    const xml = fs.readFileSync(prefix + '.wxml', 'utf8');
    for (const match of xml.matchAll(/\b(?:bind|catch)(?:tap|input|confirm|change)="([\w]+)"/g)) assert.equal(typeof p[match[1]], 'function', `${name}: ${match[1]}`);
    const config = JSON.parse(fs.readFileSync(prefix + '.json', 'utf8'));
    for (const component of Object.values(config.usingComponents || {})) for (const ext of ['.js', '.json', '.wxml', '.wxss']) assert.ok(fs.existsSync(path.join(mini, component + ext)), component + ext);
    assert.ok(!/row-math|entry-icon-text/.test(xml), `rejected decorative badges in ${name}`);
  }
});
check('accepted HTML examples remain byte-identical', () => {
  const preimage = JSON.parse(fs.readFileSync(path.join(root, 'docs/ui-implementation/preimage.json'), 'utf8').replace(/^\uFEFF/, ''));
  for (const f of preimage.approvedDemoHashes) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f.path))).digest('hex').toUpperCase(), f.sha256);
});
check('neat copy is byte-identical to the requested original', () => {
  const copy = JSON.parse(fs.readFileSync(path.join(root, 'docs/ui-implementation/neat-copy.json'), 'utf8').replace(/^\uFEFF/, ''));
  for (const f of copy.files) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(copy.destination, f.relativePath))).digest('hex').toUpperCase(), f.sha256);
});
const failed = results.filter(x => !x.pass);
const report = { status: failed.length ? 'FAIL' : 'PASS', layer: 'isolated native JS and binding contracts; not device rendering', modelRequests: 0, realStorageWrites: 0, results };
fs.writeFileSync(path.join(root, 'docs/ui-implementation/verification.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ status: report.status, checks: results.length, failed }, null, 2));
process.exitCode = failed.length ? 1 : 0;
}

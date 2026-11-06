// Isolated mini-program storage and network tests; no real data or model calls.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '../微信小程序/utils')
const store = Object.create(null)
const calls = []
const wx = {
  getStorageSync: key => store[key],
  setStorageSync: (key, value) => { store[key] = JSON.parse(JSON.stringify(value)) },
  removeStorageSync: key => { delete store[key] },
  getStorageInfoSync: () => ({ keys: Object.keys(store) }),
  getUserCryptoManager: () => ({ getRandomValues: o => o.success({ randomValues: Uint8Array.from({length:o.length},(_,i)=>i+1).buffer }) }),
  request: o => calls.push(o)
}
function load(file) {
  const module = {exports:{}}
  const filename = path.join(root,file)
  vm.runInNewContext(fs.readFileSync(filename,'utf8'), {module,exports:module.exports,wx,require: id => id === './config' ? {baseUrl:'http://fake'} : load(id.replace('./','')+'.js'), Date, Uint8Array, ArrayBuffer, console}, {filename})
  return module.exports
}
function test(name, fn) { try { fn(); console.log('PASS',name) } catch(e) { console.error('FAIL',name,e.message); process.exitCode=1 } }
let drafts, jobs
test('draft module supports independent entries and conflict detection', () => {
  drafts=load('drafts.js')
  const a=drafts.save({id:'a',question:'q1',wrongAnswer:'x',ocrReview:[],revision:0})
  const b=drafts.save({id:'b',question:'q2',wrongAnswer:'y',ocrReview:[],revision:0})
  assert.equal(a.revision,1); assert.equal(b.revision,1)
  assert.throws(()=>drafts.save({id:'a',question:'stale',wrongAnswer:'',ocrReview:[],revision:0}),/conflict/i)
  assert.equal(drafts.get('a').question,'q1'); assert.equal(drafts.list().length,2)
})
test('task identity is persisted before a single submission and unknown receipt is not resent', () => {
  jobs=load('analysis-jobs.js')
  jobs.submit(drafts.get('a'),()=>{})
  assert.equal(calls.length,1); const call=calls[0]
  assert.match(call.url,/\/api\/analysis-jobs$/); assert.equal(call.header['X-Job-Token'].length,64)
  assert.equal(call.data.taskId.length,32); assert.equal(jobs.list().length,1)
  call.fail({errMsg:'network'})
  assert.equal(jobs.list()[0].status,'uncertain'); assert.equal(calls.length,1)
})
test('completed result belongs to submitted snapshot and survives repeated query', () => {
  const job=jobs.list()[0]
  drafts.save({...drafts.get('a'),question:'changed'})
  jobs.refresh(job.taskId,()=>{}); const req=calls.at(-1)
  req.success({statusCode:200,data:{code:0,data:{taskId:job.taskId,status:'complete',result:{question:'q1',diagnosis:'example',steps:[],variants:[]}}}})
  assert.equal(jobs.get(job.taskId).snapshot.question,'q1'); assert.equal(drafts.get('a').question,'changed')
  assert.equal(jobs.get(job.taskId).status,'complete'); assert.equal(store.errorHistory,undefined)
})
test('input saves editable draft and sends only one nonblocking task', () => {
  const {host}=require('./verify-native-ui.cjs')
  const h=host(); h.wx.getStorageInfoSync=()=>({keys:Object.keys(h.storage)})
  h.wx.getUserCryptoManager=()=>({getRandomValues:o=>o.success({randomValues:Uint8Array.from({length:o.length},(_,i)=>i+1).buffer})})
  const requests=[]; h.wx.request=o=>requests.push(o)
  const p=h.page('input'); p.onLoad(); p.onQuestionInput({detail:{value:'这是题目'}})
  assert.equal(h.load('utils/drafts.js').list()[0].question,'这是题目')
  p.onSubmit(); p.onSubmit(); assert.equal(requests.length,1); assert.equal(p.data.question,'这是题目')
  assert.ok(!h.calls.some(c=>c[0]==='loading'))
})
test('late failure or queued response never overwrites completed task', () => {
  const job=jobs.list()[0]
  jobs.refresh(job.taskId,()=>{}); const older=calls.at(-1)
  jobs.refresh(job.taskId,()=>{}); const newer=calls.at(-1)
  newer.success({statusCode:200,data:{code:0,data:{taskId:job.taskId,status:'complete',result:{question:'q1',diagnosis:'ok',steps:[],variants:[]}}}})
  older.fail({}); assert.equal(jobs.get(job.taskId).status,'complete')
})
test('result may enter history only after confirmation and only once', () => {
  const job=jobs.list()[0]
  assert.equal(store.errorHistory,undefined)
  jobs.saveToHistory(job.taskId); jobs.saveToHistory(job.taskId)
  assert.equal(store.errorHistory.length,1); assert.equal(store.errorHistory[0].taskId,job.taskId)
})
test('task page can reopen the saved result without mutating the snapshot', () => {
  const {host}=require('./verify-native-ui.cjs'); const h=host()
  h.wx.getStorageInfoSync=()=>({keys:Object.keys(h.storage)})
  const job=jobs.list()[0]; h.storage['mathJob:'+job.taskId]=JSON.parse(JSON.stringify(job))
  const page=h.page('drafts'); page.onShow(); page.openTask({currentTarget:{dataset:{id:job.taskId}}})
  assert.equal(h.app.globalData.lastResult.question,'q1')
  h.app.globalData.lastResult.diagnosis='changed display'
  assert.equal(h.storage['mathJob:'+job.taskId].result.diagnosis,job.result.diagnosis)
})
test('repeated analysis warns if an earlier task may still be running', () => {
  const {host}=require('./verify-native-ui.cjs'); const h=host()
  h.wx.getStorageInfoSync=()=>({keys:Object.keys(h.storage)})
  let seed=0; h.wx.getUserCryptoManager=()=>({getRandomValues:o=>o.success({randomValues:Uint8Array.from({length:o.length},()=>++seed % 255).buffer})})
  const requests=[]; h.wx.request=o=>requests.push(o)
  const p=h.page('input'); p.onLoad(); p.onQuestionInput({detail:{value:'题目'}}); p.onSubmit()
  requests[0].fail({}); p.onSubmit()
  assert.equal(requests.length,1); assert.ok(h.calls.some(c=>c[0]==='modal' && /费用|收费/.test(c[1].content)))
})
test('report saves once on explicit tap without modal, and preserves failures and rule results', () => {
  const {host}=require('./verify-native-ui.cjs'); const h=host(); const job=jobs.list()[0]
  h.storage['mathJob:'+job.taskId]=JSON.parse(JSON.stringify(job))
  h.app.globalData.lastResult=JSON.parse(JSON.stringify(job.result)); h.app.globalData.lastWrongAnswer=job.snapshot.wrongAnswer
  const page=h.page('result'); page.onLoad({taskId:job.taskId}); page.saveTaskToHistory()
  assert.ok(!h.calls.some(c=>c[0]==='modal'), 'saving from the explicit button must not require another confirmation')
  assert.equal(h.storage.errorHistory.length,1); assert.equal(page.data.recordId,'task-'+job.taskId)
  page.saveTaskToHistory(); assert.equal(h.storage.errorHistory.length,1)
  assert.deepEqual(h.storage['mathJob:'+job.taskId].result,job.result)
  const failed=host(); failed.storage['mathJob:'+job.taskId]=JSON.parse(JSON.stringify(job)); failed.app.globalData.lastResult=JSON.parse(JSON.stringify(job.result)); failed.app.globalData.lastWrongAnswer=job.snapshot.wrongAnswer
  const failedPage=failed.page('result'); failedPage.onLoad({taskId:job.taskId}); failed.wx.setStorageSync=()=>{throw Error('quota')}; failedPage.saveTaskToHistory()
  assert.equal(failed.storage.errorHistory.length,0); assert.equal(failedPage.data.canSaveTask,true); assert.ok(failed.calls.some(c=>c[0]==='toast' && /保存失败/.test(c[1].title))); assert.deepEqual(failed.storage['mathJob:'+job.taskId].result,job.result)
  const fallback=host(); fallback.storage['mathJob:'+job.taskId]=JSON.parse(JSON.stringify(job)); fallback.storage['mathJob:'+job.taskId].result.source='rule'; fallback.app.globalData.lastResult=JSON.parse(JSON.stringify(fallback.storage['mathJob:'+job.taskId].result))
  const fallbackPage=fallback.page('result'); fallbackPage.onLoad({taskId:job.taskId}); fallbackPage.saveTaskToHistory(); assert.equal(fallback.storage.errorHistory.length,0); assert.equal(fallbackPage.data.canSaveTask,false)
})
test('deleting task requires server confirmation and prevents stale response restoring it', () => {
  const id=jobs.list()[0].taskId
  jobs.refresh(id,()=>{}); const stale=calls.at(-1)
  jobs.remove(id,()=>{}); const del=calls.at(-1)
  assert.equal(del.method,'DELETE'); assert.ok(jobs.get(id))
  del.success({statusCode:200,data:{code:0,data:{taskId:id,status:'expired'}}})
  stale.success({statusCode:200,data:{code:0,data:{taskId:id,status:'queued'}}})
  assert.equal(jobs.get(id),null)
})
test('secure random failure preserves draft and makes no network call', () => {
  const before=calls.length; const crypto=wx.getUserCryptoManager
  wx.getUserCryptoManager=()=>({getRandomValues:o=>o.fail({})})
  let error; jobs.submit(drafts.get('a'),e=>{error=e}); wx.getUserCryptoManager=crypto
  assert.ok(error); assert.equal(calls.length,before); assert.equal(drafts.get('a').question,'changed')
})
test('storage failure prevents the paid request', () => {
  const before=calls.length; const save=wx.setStorageSync
  wx.setStorageSync=()=>{throw Error('quota')}
  let error; jobs.submit(drafts.get('a'),e=>{error=e}); wx.setStorageSync=save
  assert.ok(error); assert.equal(calls.length,before)
})
test('result write failure tells the student how to recover', () => {
  const {host}=require('./verify-native-ui.cjs'); const h=host()
  h.wx.getStorageInfoSync=()=>({keys:Object.keys(h.storage)})
  const id='a'.repeat(32); h.storage['mathJob:'+id]={taskId:id,token:'b'.repeat(64),status:'running',snapshot:{question:'题目',wrongAnswer:''}}
  h.wx.setStorageSync=()=>{throw Error('quota')}; let request; h.wx.request=o=>{request=o}
  const page=h.page('drafts'); page.onShow()
  request.success({statusCode:200,data:{code:0,data:{taskId:id,status:'complete',result:{question:'题目',diagnosis:'结果',steps:[],variants:[]}}}})
  assert.match(page.data.loadError,/保存失败/); assert.match(page.data.loadError,/空间/)
  assert.equal(h.storage['mathJob:'+id].status,'running')
})
test('home does not claim zero drafts when local storage cannot be read', () => {
  const {host}=require('./verify-native-ui.cjs'); const h=host()
  h.wx.getStorageInfoSync=()=>{throw Error('read failed')}
  const page=h.page('index'); page.onShow(); assert.equal(page.data.draftCount,'—')
})
test('more menu never deletes until a specific action and confirmation are chosen', () => {
  const {host}=require('./verify-native-ui.cjs'); const h=host(); let menu
  h.wx.showActionSheet=o=>{menu=o}; h.wx.getStorageInfoSync=()=>({keys:Object.keys(h.storage)})
  const id='f'.repeat(32);h.storage['mathJob:'+id]={taskId:id,token:'a'.repeat(64),status:'complete',snapshot:{question:'保留题目',wrongAnswer:''}}
  const page=h.page('drafts');page.openMore({currentTarget:{dataset:{id,kind:'task'}}})
  assert.ok(menu.itemList.length === 2);assert.ok(h.storage['mathJob:'+id]);assert.equal(h.calls.filter(x=>x[0]==='modal').length,0)
  menu.success({tapIndex:1});const modal=h.calls.find(x=>x[0]==='modal')[1];assert.match(modal.content,/服务端内容仍/)
  modal.success({confirm:false});assert.ok(h.storage['mathJob:'+id])
  page.openMore({currentTarget:{dataset:{id,kind:'task'}}});menu.success({tapIndex:1});h.calls.filter(x=>x[0]==='modal').at(-1)[1].success({confirm:true});assert.equal(h.storage['mathJob:'+id],undefined)
})
test('task menu server removal preserves the existing confirmation and transport', () => {
  const {host}=require('./verify-native-ui.cjs');const h=host();let menu,request
  h.wx.showActionSheet=o=>{menu=o};h.wx.request=o=>{request=o};h.wx.getStorageInfoSync=()=>({keys:Object.keys(h.storage)})
  const id='e'.repeat(32);h.storage['mathJob:'+id]={taskId:id,token:'b'.repeat(64),status:'running',snapshot:{question:'题目',wrongAnswer:''}}
  const p=h.page('drafts');p.openMore({currentTarget:{dataset:{id,kind:'task'}}});menu.success({tapIndex:0});assert.equal(request,undefined)
  const modal=h.calls.find(x=>x[0]==='modal')[1];assert.match(modal.content,/费用/);modal.success({confirm:true});assert.equal(request.method,'DELETE');assert.ok(h.storage['mathJob:'+id])
})

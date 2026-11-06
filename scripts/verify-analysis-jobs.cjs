const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const modulePath = path.join(__dirname, '../server/analysis-jobs.js')
assert.ok(fs.existsSync(modulePath), 'analysis jobs implementation should exist')
const os = require('node:os')
const { spawnSync } = require('node:child_process')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const express = require('../server/node_modules/express')
const { createAnalysisJobs } = require(modulePath)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'math-jobs-test-'))
const dbPath = path.join(tmp, 'jobs.sqlite')
const id = 'a'.repeat(32), token = 'b'.repeat(64), id2 = 'c'.repeat(32)
let calls = 0, release
const pending = new Promise(resolve => { release = resolve })
let server, jobs
async function waitFor(fn) {
  for (let i = 0; i < 100; i++) { if (await fn()) return; await new Promise(r => setTimeout(r, 10)) }
  throw Error('state did not arrive')
}
async function request(method, jobId, body, auth = token) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/analysis-jobs${jobId ? '/' + jobId : ''}`, {
    method, headers: { 'Content-Type': 'application/json', 'X-Job-Token': auth }, body: body && JSON.stringify(body)
  })
  return { status: response.status, body: await response.json() }
}
async function verifyMathContract(){
 const {questionDoc,wrongAnswerDoc}=require('./math-fixtures.cjs'),math=require('../微信小程序/utils/math-document'),{DatabaseSync}=require('node:sqlite'),crypto=require('node:crypto')
 const file=path.join(tmp,'math-contract.sqlite');let seen=0
 const q=createAnalysisJobs({dbPath:file,provider:async snapshot=>{seen++;assert.deepEqual(snapshot.questionDoc,questionDoc);assert.deepEqual(snapshot.wrongAnswerDoc,wrongAnswerDoc);assert.equal(snapshot.question,math.toText(questionDoc));return{source:'fixture',question:snapshot.question,diagnosis:'fixture',steps:[],variants:[]}}})
 const app=express();app.use(express.json());app.use('/api/analysis-jobs',q.router);const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r))
 const api=async(method,body)=>{const r=await fetch('http://127.0.0.1:'+s.address().port+'/api/analysis-jobs'+(method==='POST'?'':'/'+id),{method,headers:{'Content-Type':'application/json','X-Job-Token':token},body:body&&JSON.stringify(body)});return{status:r.status,body:await r.json()}}
 try{const body={taskId:id,question:'different client projection',wrongAnswer:'',questionDoc,wrongAnswerDoc};assert.equal((await api('POST',body)).status,202);await waitFor(async()=>((await api('GET')).body.data.status==='complete'));const result=(await api('GET')).body.data.result;assert.deepEqual(result.questionDoc,questionDoc);assert.equal(seen,1);const altered=JSON.parse(JSON.stringify(questionDoc));altered.blocks.push({id:'extra',type:'text',text:''});assert.equal((await api('POST',{...body,questionDoc:altered})).status,409);assert.equal((await api('POST',body)).status,200);await api('DELETE')}finally{await new Promise(r=>s.close(r));q.close()}
 const db=new DatabaseSync(file),row=db.prepare('SELECT question_doc,answer_doc FROM jobs WHERE id=?').get(id);assert.equal(row.question_doc,null);assert.equal(row.answer_doc,null);db.close()
 const legacy=path.join(tmp,'legacy-schema.sqlite'),old=new DatabaseSync(legacy),now=Date.now();old.exec('CREATE TABLE jobs(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL,snapshot_hash TEXT,question TEXT,answer TEXT,status TEXT NOT NULL,result TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL,tombstone_until INTEGER)');const hash=s=>crypto.createHash('sha256').update(s).digest('hex');old.prepare("INSERT INTO jobs VALUES(?,?,?,?,?,'complete',?,?,?,NULL)").run(id,hash(token),hash(JSON.stringify(['legacy',''])),'legacy','',JSON.stringify({source:'fixture'}),now,now);old.close();const upgraded=createAnalysisJobs({dbPath:legacy,provider:async()=>{throw Error('legacy task must not repeat')}});upgraded.close();const verify=new DatabaseSync(legacy);assert.ok(verify.prepare('PRAGMA table_info(jobs)').all().some(x=>x.name==='question_doc'));assert.equal(verify.prepare('SELECT snapshot_hash FROM jobs WHERE id=?').get(id).snapshot_hash,hash(JSON.stringify(['legacy',''])));verify.close()
}
async function verifyServerEntry() {
  const sourcePath = path.join(__dirname, '../server/server.js')
  const source = fs.readFileSync(sourcePath, 'utf8'), localRequire = createRequire(sourcePath)
  let mounted = false, provider, shouldFail = false, fetchCount = 0
  const audits = [], marker = {}, app = { use(route) { if (route === '/api/analysis-jobs') mounted = true }, post() {}, get() {}, listen() {} }
  const fakeExpress = () => app; fakeExpress.json = () => () => {}
  const fakeFs = { existsSync: () => false, promises: { mkdir: async () => {}, appendFile: async (_path, line) => audits.push(JSON.parse(line)) } }
  const valid = { knowledgePoint: '方程', confidence: 80, diagnosis: '需核对', causeNodeIds: [], steps: [{ question: '怎样验证？' }], variants: [{ question: '1+1=?' }] }
  const fakeFetch = async () => {
    fetchCount++
    if (shouldFail) throw Error('fixture network failure')
    const events = [{ choices: [{ delta: { content: JSON.stringify(valid) } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] }, '[DONE]']
    const data = Buffer.from(events.map(e => 'data: ' + (e === '[DONE]' ? e : JSON.stringify(e)) + '\n\n').join('')); let used = false
    return { ok: true, status: 200, headers: { get: () => null }, body: { getReader: () => ({ read: async () => used ? { done: true } : (used = true, { done: false, value: data }) }) } }
  }
  const local = id => id === 'express' ? fakeExpress : id === 'fs' ? fakeFs : id === './ocr' ? { createOcrHandler: () => () => {} } : id === './analysis-jobs' ? { createAnalysisJobs: options => { provider = options.provider; return { router: {} } } } : localRequire(id)
  local.main = marker
  vm.runInNewContext(source, { module: marker, require: local, __dirname: path.dirname(sourcePath), process: { env: { MATH_APP_MIMO_API_KEY: 'fixture-only' } }, fetch: fakeFetch, console: { log() {}, warn() {}, error() {} }, Buffer, TextDecoder, AbortController, setTimeout, clearTimeout })
  assert.equal(mounted, true, 'server entry must mount task route')
  assert.equal((await provider({ taskId: id, question: 'fixture question', wrongAnswer: 'fixture answer' })).source, 'ai')
  shouldFail = true
  await assert.rejects(provider({ taskId: id, question: 'fixture question', wrongAnswer: 'fixture answer' }))
  assert.equal(fetchCount, 2, 'provider calls must not retry')
  assert.equal(audits.length, 2, 'both success and failure need safe audits')
  assert.equal(audits[0].resultSource, 'ai')
  assert.equal(audits[0].taskId, id, 'audit should be traceable to its task')
  assert.ok(audits[1].errorCategory)
  assert.ok(!JSON.stringify(audits).includes('fixture question'))
  assert.ok(!JSON.stringify(audits).includes('fixture answer'))
}
async function verifyFrontendContract() {
  const { host } = require('./verify-native-ui.cjs')
  const h = host(), question = '解方程 x+1=3', answer = 'x=1'
  h.wx.getStorageInfoSync = () => ({ keys: Object.keys(h.storage) })
  h.wx.getUserCryptoManager = () => ({ getRandomValues: o => o.success({ randomValues: Uint8Array.from({ length: o.length }, (_, i) => i + 1).buffer }) })
  let providerCalls = 0, providerStarted, providerDone
  const providerFinished = new Promise(resolve => { providerDone = resolve })
  const localJobs = createAnalysisJobs({ dbPath: path.join(tmp, 'frontend-contract.sqlite'), provider: async snapshot => {
    providerCalls++
    assert.equal(snapshot.question, question); assert.equal(snapshot.wrongAnswer, answer)
    providerStarted = Date.now()
    await new Promise(resolve => setTimeout(resolve, 20000))
    providerDone()
    return { source: 'ai', question: snapshot.question, diagnosis: '请检查减法', knowledgePoint: '方程', confidence: 80, causeNodes: [], steps: [{ question: '两边同时减一得到什么？', hint: '', detail: '' }], variants: [{ question: 'x+2=4', answer: 'x=2' }] }
  } })
  const app = express(); app.use(express.json()); app.use('/api/analysis-jobs', localJobs.router)
  const localServer = app.listen(0, '127.0.0.1'); await new Promise(resolve => localServer.once('listening', resolve))
  const requests = [], errors = []
  h.wx.request = options => {
    const pathname = new URL(options.url).pathname
    if (!/^\/api\/analysis-jobs(?:\/[a-f0-9]{32})?$/.test(pathname)) throw Error('unexpected request path')
    requests.push({ method: options.method, pathname })
    fetch(`http://127.0.0.1:${localServer.address().port}${pathname}`, {
      method: options.method, headers: { 'Content-Type': 'application/json', ...options.header },
      body: options.data ? JSON.stringify(options.data) : undefined
    }).then(async response => options.success({ statusCode: response.status, data: await response.json() }))
      .catch(error => { errors.push(error); options.fail && options.fail({ errMsg: 'fixture request failed' }) })
  }
  try {
    const input = h.page('input'); input.onLoad()
    input.onQuestionInput({ detail: { value: question } }); input.onAnswerInput({ detail: { value: answer } })
    const submittedAt = Date.now()
    input.onSubmit(); input.onSubmit(); input.goDrafts()
    assert.ok(Date.now() - submittedAt < 1000, 'navigation should not wait for provider')
    assert.ok(h.calls.some(call => call[0] === 'navigateTo' && call[1].url === '/pages/drafts/drafts'))
    await waitFor(() => Object.keys(h.storage).some(key => key.startsWith('mathJob:')) && !input.data.submitting)
    const taskId = Object.keys(h.storage).find(key => key.startsWith('mathJob:')).slice('mathJob:'.length)
    assert.equal(h.storage['mathJob:' + taskId].snapshot.question, question)
    assert.ok(['queued', 'running'].includes(h.storage['mathJob:' + taskId].status), 'submission must be acknowledged before provider completes')
    const page = h.page('drafts'); page.onShow()
    await providerFinished
    assert.ok(Date.now() - providerStarted >= 20000, 'fake provider must be delayed for at least 20 seconds')
    await new Promise(resolve => setTimeout(resolve, 20))
    page.refreshAll()
    await waitFor(() => h.storage['mathJob:' + taskId].status === 'complete')
    page.openTask({ currentTarget: { dataset: { id: taskId } } })
    assert.equal(h.app.globalData.lastResult.question, question)
    assert.equal(h.app.globalData.lastWrongAnswer, answer)
    assert.ok(h.calls.some(call => call[0] === 'navigateTo' && call[1].url.includes('/pages/result/result?taskId=')))
    const report = h.page('result'); report.onLoad({ taskId })
    assert.equal(report.data.result.question, question); assert.equal(report.data.wrongAnswer, answer)
    assert.equal(h.storage.errorHistory.length, 0)
    assert.equal(providerCalls, 1)
    assert.equal(requests.filter(r => r.method === 'POST').length, 1)
    assert.ok(requests.some(r => r.method === 'GET'))
    assert.equal(errors.length, 0)
    page.onHide()
  } finally {
    await new Promise(resolve => localServer.close(resolve))
    localJobs.close()
  }
}
async function main() {
  jobs = createAnalysisJobs({ dbPath, provider: async q => { calls++; await pending; return { question: q.question, source: 'fixture' } } })
  const app = express(); app.use(express.json()); app.use('/api/analysis-jobs', jobs.router)
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
  const body = { taskId: id, question: '1+1=?', wrongAnswer: '3' }
  const [first, duplicate] = await Promise.all([request('POST', '', body), request('POST', '', body)])
  assert.equal(first.body.code, 0); assert.equal(duplicate.body.code, 0)
  assert.equal((await request('POST', '', { ...body, question: 'different' })).status, 409)
  assert.notEqual((await request('GET', id, null, 'f'.repeat(64))).body.code, 0)
  await waitFor(async () => (await request('GET', id)).body.data.status === 'running')
  assert.equal(calls, 1)
  await request('POST', '', { taskId: id2, question: '2+2=?', wrongAnswer: '' })
  assert.equal((await request('DELETE', id)).body.data.status, 'expired')
  release()
  await waitFor(async () => (await request('GET', id2)).body.data.status === 'complete')
  const deleted = await request('GET', id); assert.equal(deleted.body.data.status, 'expired'); assert.ok(!deleted.body.data.result)
  assert.equal(calls, 2)
  // Reopen after one running and one queued job. Only the queued job may dispatch.
  let now = Date.now(), hold
  const held = new Promise(resolve => { hold = resolve })
  await new Promise(resolve => server.close(resolve)); jobs.close()
  const restartPath = path.join(tmp, 'restart.sqlite')
  let oldCalls = 0, newCalls = 0
  jobs = createAnalysisJobs({ dbPath: restartPath, now: () => now, provider: async () => { oldCalls++; await held; return { source: 'old' } } })
  const app2 = express(); app2.use(express.json()); app2.use('/api/analysis-jobs', jobs.router)
  server = app2.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
  await request('POST', '', body)
  await waitFor(async () => (await request('GET', id)).body.data.status === 'running')
  await request('POST', '', { taskId: id2, question: '2+2=?', wrongAnswer: '' })
  assert.equal((await request('GET', id2)).body.data.status, 'queued')
  assert.throws(() => createAnalysisJobs({ dbPath: restartPath, provider: async () => ({}) }))
  const secondProcess = spawnSync(process.execPath, ['-e', `const {createAnalysisJobs}=require(${JSON.stringify(modulePath)});try{createAnalysisJobs({dbPath:${JSON.stringify(restartPath)},provider:async()=>({})});process.exitCode=2}catch(e){process.exitCode=0}`], { encoding: 'utf8', timeout: 5000 })
  assert.equal(secondProcess.status, 0, 'a second process must not claim the live database')
  assert.equal((await request('GET', id)).body.data.status, 'running')
  await new Promise(resolve => server.close(resolve)); jobs.close(); hold()
  jobs = createAnalysisJobs({ dbPath: restartPath, now: () => now, provider: async () => { newCalls++; return { source: 'fixture' } } })
  const app3 = express(); app3.use(express.json()); app3.use('/api/analysis-jobs', jobs.router)
  server = app3.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
  assert.equal((await request('GET', id)).body.data.status, 'uncertain')
  await waitFor(async () => (await request('GET', id2)).body.data.status === 'complete')
  assert.equal(oldCalls, 1); assert.equal(newCalls, 1)
  now += 8 * 86400000
  assert.equal((await request('GET', id2)).body.data.status, 'expired')
  assert.equal((await request('GET', id)).body.data.status, 'expired')
  now += 31 * 86400000
  assert.equal((await request('GET', id2)).status, 404)
  assert.equal((await request('GET', id)).status, 404)
  await new Promise(resolve => server.close(resolve)); jobs.close()
  let finishHeld, expireCalls = 0
  const holdExpiry = new Promise(resolve => { finishHeld = resolve })
  now = Date.now()
  jobs = createAnalysisJobs({ dbPath: path.join(tmp, 'expiry.sqlite'), now: () => now, provider: async ({ question }) => {
    expireCalls++
    if (question === 'bad-provider') throw Error('simulated upstream timeout')
    await holdExpiry; return { source: 'fixture' }
  } })
  const app4 = express(); app4.use(express.json()); app4.use('/api/analysis-jobs', jobs.router)
  server = app4.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
  await request('POST', '', body)
  await waitFor(async () => (await request('GET', id)).body.data.status === 'running')
  await request('POST', '', { taskId: id2, question: 'waiting', wrongAnswer: '' })
  now += 25 * 3600000
  assert.equal((await request('GET', id2)).body.data.status, 'expired')
  finishHeld()
  await waitFor(async () => (await request('GET', id)).body.data.status === 'complete')
  assert.equal(expireCalls, 1)
  const id3 = 'd'.repeat(32)
  await request('POST', '', { taskId: id3, question: 'bad-provider', wrongAnswer: '' })
  await waitFor(async () => (await request('GET', id3)).body.data.status === 'uncertain')
  assert.equal(expireCalls, 2)
  await verifyServerEntry()
  await verifyMathContract()
  await verifyFrontendContract()
  console.log('PASS isolated HTTP: 20-second async frontend submit/navigation/query/report, concurrent dedupe, conflict, access, delete, restart, uncertain, retention, exclusive lock, audit; real model calls 0')
}
main().finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve))
  if (jobs) jobs.close()
  fs.rmSync(tmp, { recursive: true, force: true })
}).catch(e => { console.error(e); process.exitCode = 1 })

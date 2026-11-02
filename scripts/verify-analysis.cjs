// Isolated route tests. They never read .env, listen, write files, or call a model.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const serverPath = path.join(root, 'server/server.js');
const original = fs.readFileSync(serverPath, 'utf8');
const valid = { knowledgePoint: '方程', confidence: 90, diagnosis: '作答正确。', causeNodeIds: [], steps: [{ question: '如何检验？', hint: '代回原式', detail: '左右相等' }], solution: 'x=3', variants: [{ level: '基础巩固', question: '解方程 x+1=2', answer: 'x=1', analysis: '两边减1' }] };
const question = '1、解方程：(x-1)/2+(x+3)/3=3';
const correct = '(x-1)/2+(x+3)/3=3\n3(x-1)+2(x+3)=18\n5x=15\nx=3';
let fakeCalls = 0;

function createHost(provider, options = {}) {
  const routes = {}, records = [], errors = [], requests = [];
  const app = { use() {}, get() {}, post(url, fn) { routes[url] = fn }, listen() {} };
  function express() { return app }
  express.json = () => () => {};
  const fakeFs = { existsSync: () => false, promises: { mkdir: async () => {}, appendFile: async (file, line) => { if (options.auditFails) throw Error('private filesystem path'); records.push(JSON.parse(line)); } } };
  const fakeFetch = async (url, init) => {
    fakeCalls++; requests.push(JSON.parse(init.body));
    if (provider instanceof Error) throw provider;
    if (options.nonstream) return { ok: true, status: 200, headers: { get: () => 'provider-fake' }, json: async () => provider };
    const parts = provider.events.map(value => 'data: ' + (value === '[DONE]' ? value : JSON.stringify(value)) + (options.crlf ? '\r\n\r\n' : '\n\n')).join('');
    const bytes = Buffer.from(parts); let offset = 0;
    return { ok: true, status: 200, headers: { get: () => 'provider-fake' }, body: { getReader: () => ({ read: async () => { if (offset >= bytes.length) return { done: true }; const take = Math.min(bytes.length, offset + 17); const value = bytes.subarray(offset, take); offset = take; return { done: false, value }; } }) } };
  };
  const customRequire = id => id === 'express' ? express : id === 'fs' ? fakeFs : id === './causeNodes' ? require(path.join(root, 'server/causeNodes.js')) : id === './ocr' ? { createOcrHandler: () => () => {} } : require(id);
  const sandbox = { require: customRequire, __dirname: path.dirname(serverPath), process: { env: { MATH_APP_MIMO_API_KEY: 'fixture-only' } }, fetch: fakeFetch, console: { log() {}, error: (...args) => errors.push(args.join(' ')), warn: (...args) => errors.push(args.join(' ')) }, setTimeout, clearTimeout, TextDecoder, AbortController, Buffer };
  vm.runInNewContext(original, sandbox, { filename: serverPath });
  return { routes, records, errors, requests };
}
function stream(content, finishReason = 'stop', done = true) {
  const events = [{ id: 'provider-fixture', choices: [{ delta: { content }, finish_reason: null }] }];
  if (finishReason !== undefined) events.push({ id: 'provider-fixture', choices: [{ delta: {}, finish_reason: finishReason }], usage: { prompt_tokens: 123, completion_tokens: 45, total_tokens: 168 } });
  if (done) events.push('[DONE]');
  return { events };
}
async function invoke(host, url) {
  const chunks = [];
  const res = { statusCode: 200, headers: null, body: null, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this }, writeHead(code, headers) { this.statusCode = code; this.headers = headers }, write(text) { chunks.push(text) }, end() {} };
  await host.routes[url]({ body: { question, wrongAnswer: correct } }, res);
  const events = chunks.filter(chunk => chunk.startsWith('data: ')).map(chunk => JSON.parse(chunk.slice(6)));
  return { res, events, final: events.find(event => event.type === 'result') };
}
function assertSafeAudit(host, source, category) {
  assert.equal(host.records.length, 1, 'one audit record required');
  const record = host.records[0];
  assert.match(record.requestId, /^analysis-/);
  assert.equal(record.resultSource, source);
  if (category) assert.equal(record.errorCategory, category);
  const serialized = JSON.stringify(record);
  assert.ok(!serialized.includes(question) && !serialized.includes(correct) && !serialized.includes('fixture-only') && !serialized.includes('SECRET-RAW-RESPONSE'));
}
function assertHonestRule(result) {
  assert.equal(result.source, 'rule');
  assert.deepEqual(Array.from(result.causeNodes), []);
  assert.ok(!/你的作答[^。\n]*(错误|失误)|很可能[^。\n]*失误/.test(result.diagnosis), 'fallback must not invent a mistake');
  assert.ok(!result.solution, 'fallback must not invent a full solution');
  assert.equal(result.variants.length, 0, 'fallback must not invent variants');
  assert.ok(result.steps.length > 0, 'provide useful non-diagnostic review guidance');
}
const checks=[];
async function test(name, fn){try{await fn();checks.push({name,pass:true})}catch(error){checks.push({name,pass:false,reason:error.message})}}
(async()=>{
  await test('complete MiMo stream returns the actual AI result and tracks token metadata',async()=>{
    const h=createHost(stream(JSON.stringify(valid)));const r=await invoke(h,'/api/analyze/stream');
    assert.equal(r.res.statusCode,200);assert.equal(r.final.data.source,'ai');assert.equal(r.final.data.question,question);
    assert.equal(r.events[0].type,'start');assert.equal(r.events[0].requestId,h.records[0].requestId);
    assert.equal(h.requests.length,1);assert.equal(h.requests[0].max_completion_tokens,4096);assert.deepEqual(h.requests[0].response_format,{type:'json_object'});assert.equal(Object.hasOwn(h.requests[0],'thinking'),false);
    assert.match(h.requests[0].messages.find(row=>row.role==='user').content,/我的作答/);assert.doesNotMatch(h.requests[0].messages.find(row=>row.role==='user').content,/我的错误作答/);assert.match(h.requests[0].messages.find(row=>row.role==='system').content,/正确或信息不足时不得假定存在错因/);
    assertSafeAudit(h,'ai');assert.equal(h.records[0].finishReason,'stop');assert.equal(h.records[0].tokens.total,168);assert.equal(h.records[0].providerRequestId,'provider-fixture');assert.equal(r.final.requestId,h.records[0].requestId);
  });
  await test('bad model JSON yields an honest rule result with one provider request',async()=>{
    const h=createHost(stream('{"steps":["broken",]}'));const r=await invoke(h,'/api/analyze/stream');assertHonestRule(r.final.data);assert.equal(h.requests.length,1);assertSafeAudit(h,'rule','INVALID_AI_RESPONSE');
  });
  await test('truncated finish cannot masquerade as successful AI even when JSON parses',async()=>{
    const h=createHost(stream(JSON.stringify(valid),'length'));const r=await invoke(h,'/api/analyze/stream');assertHonestRule(r.final.data);assert.equal(h.requests.length,1);assertSafeAudit(h,'rule','PROVIDER_TRUNCATED');
  });
  await test('missing terminal events cannot masquerade as a complete AI result',async()=>{
    for (const provider of [stream(JSON.stringify(valid),null,true),stream(JSON.stringify(valid),'stop',false)]) {const h=createHost(provider);const r=await invoke(h,'/api/analyze/stream');assertHonestRule(r.final.data);assert.equal(h.requests.length,1);assertSafeAudit(h,'rule','PROVIDER_INCOMPLETE');}
  });
  await test('network error logs no provider content and still produces honest fallback once',async()=>{
    const h=createHost(new Error('SECRET-RAW-RESPONSE'));const r=await invoke(h,'/api/analyze/stream');assertHonestRule(r.final.data);assert.equal(h.requests.length,1);assertSafeAudit(h,'rule','PROVIDER_NETWORK_ERROR');assert.ok(!JSON.stringify(h.errors).includes('SECRET-RAW-RESPONSE'));
  });
  await test('valid CRLF event framing and split UTF-8 bytes are reconstructed',async()=>{
    const h=createHost(stream(JSON.stringify(valid)),{crlf:true});const r=await invoke(h,'/api/analyze/stream');assert.equal(r.final.data.source,'ai');assert.equal(r.final.data.diagnosis,'作答正确。');assertSafeAudit(h,'ai');
  });
  await test('malformed stream frame is categorized as a protocol failure, not a network failure',async()=>{
    const h=createHost({events:[null,'[DONE]']});const r=await invoke(h,'/api/analyze/stream');assertHonestRule(r.final.data);assertSafeAudit(h,'rule','PROVIDER_STREAM_INVALID');assert.equal(h.requests.length,1);
  });
  await test('legacy non-stream JSON API shape stays compatible and records metadata',async()=>{
    const h=createHost({id:'provider-fake',choices:[{message:{content:JSON.stringify(valid)},finish_reason:'stop'}],usage:{prompt_tokens:123,completion_tokens:45,total_tokens:168}},{nonstream:true});const r=await invoke(h,'/api/analyze');assert.equal(r.res.statusCode,200);assert.equal(r.res.body.code,0);assert.equal(r.res.body.data.source,'ai');assert.equal(r.res.body.data.question,question);assert.equal(h.requests.length,1);assertSafeAudit(h,'ai');
  });
  await test('a malformed ordinary response is classified as invalid AI data and never retried',async()=>{
    for(const body of [null,{}, {choices:[]}, {choices:[{message:{content:null}}]}]) {const h=createHost(body,{nonstream:true});const r=await invoke(h,'/api/analyze');assertHonestRule(r.res.body.data);assertSafeAudit(h,'rule','INVALID_AI_RESPONSE');assert.equal(h.requests.length,1);}
  });
  await test('client disconnect at stream end does not duplicate audit or switch the result',async()=>{
    const h=createHost(stream(JSON.stringify(valid)));const res={writeHead(){},write(){},end(){throw Error('client disconnected')}};
    await assert.rejects(h.routes['/api/analyze/stream']({body:{question,wrongAnswer:correct}},res),/client disconnected/);
    assertSafeAudit(h,'ai');assert.equal(h.requests.length,1);
  });
  await test('audit write failure is isolated from a successful result',async()=>{
    const h=createHost(stream(JSON.stringify(valid)),{auditFails:true});const r=await invoke(h,'/api/analyze/stream');assert.equal(r.final.data.source,'ai');assert.equal(h.requests.length,1);assert.ok(h.errors.some(v=>v.includes('ANALYSIS_AUDIT_WRITE_FAILED')));assert.ok(!h.errors.some(v=>v.includes('private filesystem path')));
  });
  const failed=checks.filter(row=>!row.pass);console.log(JSON.stringify({status:failed.length?'FAIL':'PASS',checks:checks.length,fakeProviderCalls:fakeCalls,realNetworkRequests:0,realAuditWrites:0,failed},null,2));process.exitCode=failed.length?1:0;
})().catch(error=>{console.error(error);process.exitCode=1});

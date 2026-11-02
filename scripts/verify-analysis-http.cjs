// Exercise the existing Express SSE route and incremental UTF-8 decoder with an
// in-process fake provider. Localhost only; no credentials or real model call.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const { Utf8Stream } = require('../微信小程序/utils/utf8-stream');
const serverFile = path.join(root, 'server/server.js');
const serverRequire = createRequire(serverFile);
const express = serverRequire('express');
const question = '1、解方程：\n(x-1)/2 + (x+3)/3 = 3';
const answer = '解：\n两边同时乘以6\nx = 3';
const valid = { knowledgePoint:'方程', diagnosis:'作答正确，代回成立。', confidence:90, causeNodeIds:[], steps:[{question:'如何检验？',hint:'代入原式',detail:'左右相等'}], solution:'x = 3', variants:[{level:'基础巩固',question:'解方程 x+1=2',answer:'x=1',analysis:'两边减1'}] };
let providerCalls = 0; let currentPayload = '';
let server;
function localExpress() {
  const app = express(); const listen = app.listen.bind(app);
  app.listen = () => { server = listen(0, '127.0.0.1'); return server; };
  return app;
}
localExpress.json = express.json;
const memoryAudits = [];
const fakeFs = { existsSync:()=>false, promises:{ mkdir:async()=>{}, appendFile:async(_file,line)=>{memoryAudits.push(JSON.parse(line))} } };
const fakeFetch = async () => {
  providerCalls++;
  const events = [{ id:'provider-isolated',choices:[{delta:{content:currentPayload},finish_reason:null}] },{id:'provider-isolated',choices:[{delta:{},finish_reason:'stop'}]},'[DONE]'];
  const encoded = Buffer.from(events.map(event=>'data: '+(event==='[DONE]'?event:JSON.stringify(event))+'\r\n\r\n').join(''));
  let index=0;
  return { ok:true,status:200,headers:{get:()=>null},body:{getReader:()=>({read:async()=>index<encoded.length?{done:false,value:encoded.subarray(index,++index)}:{done:true}})} };
};
const localRequire = id => id==='express'?localExpress:id==='fs'?fakeFs:id==='./causeNodes'?serverRequire('./causeNodes'):id==='./ocr'?{createOcrHandler:()=>()=>{}}:serverRequire(id);
vm.runInNewContext(fs.readFileSync(serverFile,'utf8'),{require:localRequire,__dirname:path.dirname(serverFile),process:{env:{MATH_APP_MIMO_API_KEY:'fixture-only'}},fetch:fakeFetch,console:{log(){},error(){},warn(){}},setTimeout,clearTimeout,TextDecoder,AbortController,Buffer},{filename:serverFile});

async function exercise(content, expectedSource) {
  currentPayload = content;
  const response = await fetch('http://127.0.0.1:'+server.address().port+'/api/analyze/stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,wrongAnswer:answer})});
  assert.equal(response.status,200);
  const decoder = new Utf8Stream(), reader = response.body.getReader(); let text = '';
  for (;;) { const {value,done}=await reader.read(); if(done) break; for(const byte of value) text += decoder.write(Uint8Array.from([byte]).buffer); }
  text += decoder.write(null,true);
  const events = text.split(/\r?\n\r?\n/).filter(Boolean).map(part => JSON.parse(part.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n')));
  const results = events.filter(event=>event.type==='result');
  assert.equal(results.length,1);assert.equal(results[0].data.question,question);assert.equal(results[0].data.source,expectedSource);
  if(expectedSource==='rule'){assert.equal(results[0].data.causeNodes.length,0);assert.equal(results[0].data.solution,'');}
}
(async()=>{
  try {
    await new Promise((resolve,reject)=>{if(server.listening)resolve();else{server.once('listening',resolve);server.once('error',reject);}});
    await exercise(JSON.stringify(valid),'ai');await exercise('{"steps":[broken]}','rule');
    assert.equal(providerCalls,2);assert.equal(memoryAudits.length,2);assert.deepEqual(memoryAudits.map(row=>row.resultSource),['ai','rule']);
    console.log(JSON.stringify({status:'PASS',realHttpRequests:2,fakeProviderCalls:providerCalls,actualModelRequests:0,realStorageWrites:0,scenarios:['ai result','honest fallback']}));
  } finally { if(server)await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error.message);process.exitCode=1});

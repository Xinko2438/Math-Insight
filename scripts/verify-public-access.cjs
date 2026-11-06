// Isolated fake WeChat identity; never calls WeChat or the model.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const express=require('../server/node_modules/express')
async function run(){
 const vm=require('node:vm'),network=[],logins=[];const wx={login:o=>logins.push(o),request:o=>{network.push(o);return{abort(){}}}};let transport;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../微信小程序/utils/request.js'),'utf8'),{require:()=>({baseUrl:'https://unit.invalid/math-app',authRequired:true}),module:{get exports(){return transport},set exports(x){transport=x}},wx,Date,Error,Number});let failures=0
 transport.request({url:'https://unit.invalid/math-app/api/ocr',fail:()=>failures++});transport.request({url:'https://unit.invalid/math-app/api/chat'});assert.equal(logins.length,1);assert.equal(network.length,0);logins[0].success({code:'fake-code'});assert.equal(network.length,1);network[0].success({statusCode:200,data:{data:{token:'fake-bearer',expiresAt:Date.now()+3600000}}});assert.equal(network.length,3);assert.equal(network[1].header.Authorization,'Bearer fake-bearer');network[1].success({statusCode:401});assert.equal(network.length,3,'No automatic paid retry');transport.request({url:'https://unit.invalid/math-app/api/ocr',fail:()=>failures++});logins[1].fail();assert.equal(failures,1);assert.equal(network.length,3)
 const {createPublicAccess}=require('../server/public-access')
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'math-access-')),dbPath=path.join(dir,'access.sqlite');let exchanges=0,modelCalls=0
 const options={dbPath,appId:'wx-test',appSecret:'fake-app-secret',sessionSecret:'fake-session-secret-'.repeat(3),userDaily:2,globalDaily:3,exchange:async code=>{exchanges++;if(code==='bad')throw Error('refused');return{openid:code}}}
 let gate=createPublicAccess(options);const app=express();app.use(express.json());app.use('/api',gate.middleware);app.post('/api/ocr',(q,s)=>{modelCalls++;s.json({code:0})});app.post('/api/analysis-jobs',(q,s)=>{modelCalls++;s.json({code:0})});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port
 const post=(url,body={},token)=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)})
 try{
  assert.equal((await post('/api/ocr')).status,401);assert.equal(exchanges,0);assert.equal(modelCalls,0)
  assert.equal((await post('/api/session',{code:'bad'})).status,401)
  const a=await (await post('/api/session',{code:'student-a'})).json();assert.ok(a.data.token);assert.ok(!JSON.stringify(a).includes('student-a'));assert.ok(!JSON.stringify(a).includes('fake-app-secret'))
  assert.equal((await post('/api/ocr',{},a.data.token+'x')).status,401)
  assert.equal((await post('/api/ocr',{},a.data.token)).status,200)
  assert.equal((await post('/api/ocr',{},a.data.token)).status,200)
  assert.equal((await post('/api/ocr',{},a.data.token)).status,429)
  const b=await (await post('/api/session',{code:'student-b'})).json();assert.equal((await post('/api/ocr',{},b.data.token)).status,200);assert.equal((await post('/api/ocr',{},b.data.token)).status,429);assert.equal(modelCalls,3)
  gate.close();gate=createPublicAccess(options);assert.equal(gate.reserve('new-user','ocr','after-restart'),false);gate.close()
  const missing=createPublicAccess({...options,dbPath:path.join(dir,'missing.sqlite'),appSecret:''});let status;missing.middleware({path:'/session',method:'POST',body:{code:'valid'},get:()=>''},{status(x){status=x;return this},json(){}},()=>{throw Error('fail open')});assert.equal(status,503);missing.close()
  console.log(JSON.stringify({status:'PASS',checks:['single-flight identity','bearer header','no paid retry','login failure no upload','anonymous denied','bad login denied','signed identity','tampering denied','per-user quota','global quota','restart preserves budget','missing secrets fail closed'],modelRequests:0}))
 }finally{server.close();try{gate.close()}catch(_){}fs.rmSync(dir,{recursive:true,force:true})}
}
run().catch(e=>{console.error(e.stack);process.exitCode=1})

const config=require('./config')
let session=null,pending=[] ,loggingIn=false
function identity(done){if(session&&session.expiresAt>Date.now()+60000)return done(null,session.token);pending.push(done);if(loggingIn)return;loggingIn=true
 const finish=(error,data)=>{loggingIn=false;if(data)session=data;const callbacks=pending;pending=[];callbacks.forEach(fn=>fn(error,data&&data.token))}
 wx.login({timeout:10000,success:result=>{if(!result.code)return finish(Error('微信身份确认失败'));wx.request({url:config.baseUrl+'/api/session',method:'POST',timeout:15000,data:{code:result.code},success:r=>{const data=r.data&&r.data.data;if(r.statusCode!==200||!data||typeof data.token!=='string'||!Number.isFinite(data.expiresAt))return finish(Error(r.data&&r.data.msg||'体验服务暂不可用'));finish(null,data)},fail:()=>finish(Error('暂时无法连接体验服务，请检查网络'))})},fail:()=>finish(Error('微信身份确认失败，请重新打开小程序'))})
}
function request(options){if(!config.authRequired)return wx.request(options);let task=null,aborted=false;identity((error,token)=>{if(aborted)return;if(error){const result={errMsg:error.message};if(options.fail)options.fail(result);if(options.complete)options.complete(result);return}task=wx.request({...options,header:{...options.header,Authorization:'Bearer '+token},success:res=>{if(res.statusCode===401)session=null;if(options.success)options.success(res)}})});return{abort(){aborted=true;if(task)task.abort()}}}
module.exports={request}

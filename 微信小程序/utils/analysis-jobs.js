const { baseUrl } = require('./config')
const PREFIX = 'mathJob:'
function get(id) {
  if (!/^[0-9a-f]{32}$/.test(id || '')) return null
  const job = wx.getStorageSync(PREFIX + id)
  return job && job.taskId === id ? job : null
}
function list() {
  return (wx.getStorageInfoSync().keys || []).filter(k => k.indexOf(PREFIX) === 0).map(k => get(k.slice(PREFIX.length))).filter(Boolean).sort((a,b) => b.createdAt - a.createdAt)
}
function put(job) { wx.setStorageSync(PREFIX + job.taskId, job); return job }
function random(callback) {
  try {
    const crypto = wx.getUserCryptoManager && wx.getUserCryptoManager()
    if (!crypto || typeof crypto.getRandomValues !== 'function') throw Error('安全随机数不可用')
    crypto.getRandomValues({ length: 48, success: res => {
      try {
        const bytes = new Uint8Array(res.randomValues)
        if (bytes.length !== 48) throw Error('安全随机数不可用')
        const hex = Array.from(bytes, b => b.toString(16).padStart(2,'0')).join('')
        callback(null, { taskId: hex.slice(0,32), token: hex.slice(32) })
      } catch (_) { callback(Error('安全随机数不可用')) }
    }, fail: () => callback(Error('安全随机数不可用')) })
  } catch (_) { callback(Error('安全随机数不可用')) }
}
function submit(draft, callback) {
  random((error, identity) => {
    if (error) return callback(error)
    try {
      if (get(identity.taskId)) throw Error('任务标识冲突，请重试')
      const job = put({ ...identity, draftId: draft.id, revision: draft.revision, snapshot: {question:draft.question.trim(),wrongAnswer:draft.wrongAnswer.trim()}, status:'submitting', createdAt:Date.now() })
      wx.request({ url: `${baseUrl}/api/analysis-jobs`, method:'POST', timeout:15000, header:{'X-Job-Token':job.token}, data:{taskId:job.taskId,...job.snapshot}, success: res => update(job.taskId,res,callback), fail: () => uncertain(job.taskId,callback) })
    } catch (e) { callback(e) }
  })
}
function uncertain(id, callback) {
  try { const job=get(id); if (!job) return callback(Error('任务已删除')); if (job.status !== 'complete' && job.status !== 'deleting') { job.status='uncertain'; put(job) } callback(null,job) } catch(e) { callback(e) }
}
function update(id, res, callback) {
  try {
    const job=get(id), data=res && res.data && res.data.data
    if (!job) throw Error('本机任务不存在')
    if (job.status === 'complete' || job.status === 'deleting') return callback(null,job)
    if (res.statusCode === 401 || res.statusCode === 403) { job.status='access_denied'; put(job); return callback(null,job) }
    if (res.statusCode === 404) { job.status='not_found'; put(job); return callback(null,job) }
    if (res.statusCode === 410) { job.status='expired'; put(job); return callback(null,job) }
    if (res.statusCode !== 200 && res.statusCode !== 201 && res.statusCode !== 202) return uncertain(id,callback)
    if (!res.data || res.data.code !== 0 || !data || data.taskId !== id || !['queued','running','complete','failed','uncertain','expired'].includes(data.status)) return uncertain(id,callback)
    if (data.status === 'complete' && (!data.result || typeof data.result.question !== 'string' || data.result.question.trim() !== job.snapshot.question || typeof data.result.diagnosis !== 'string' || !Array.isArray(data.result.steps) || !Array.isArray(data.result.variants))) return uncertain(id,callback)
    if (job.status === 'running' && data.status === 'queued') return callback(null,job)
    job.status=data.status
    if (data.status === 'complete') job.result=data.result
    if (data.status === 'failed') job.message=typeof data.message === 'string' ? data.message : '分析未完成，请稍后重试。'
    put(job); callback(null,job)
  } catch(e) { callback(e) }
}
function refresh(id, callback) {
  let job
  try { job=get(id) } catch(e) { return callback(e) }
  if (!job) return callback(Error('本机任务不存在'))
  wx.request({url:`${baseUrl}/api/analysis-jobs/${id}`,method:'GET',header:{'X-Job-Token':job.token},timeout:10000,success:res=>update(id,res,callback),fail:()=>uncertain(id,callback)})
}
function saveToHistory(id) {
  const job=get(id)
  if (!job || job.status !== 'complete' || !job.result || job.result.source === 'rule') throw Error('该报告不能保存为错题')
  const value=wx.getStorageSync('errorHistory')
  const records=value || []
  if (!Array.isArray(records)) throw Error('错题本读取失败')
  const existing=records.find(row => row.taskId === id)
  if (existing) return existing
  const now=new Date(), pad=n=>String(n).padStart(2,'0')
  const record={id:'task-'+id,taskId:id,time:`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`,question:job.snapshot.question,wrongAnswer:job.snapshot.wrongAnswer,result:job.result}
  wx.setStorageSync('errorHistory',[record,...records])
  return record
}
function remove(id, callback) {
  let job, original
  try { job=get(id); if (!job) throw Error('任务不存在'); original=job.status; job.status='deleting'; put(job) } catch(e) { return callback(e) }
  function fail() {
    try { const current=get(id); if (current && current.status === 'deleting') {current.status=original;put(current)} } catch (_) {}
    callback(Error('服务端删除未确认，请联网后重试'))
  }
  wx.request({url:`${baseUrl}/api/analysis-jobs/${id}`,method:'DELETE',timeout:10000,header:{'X-Job-Token':job.token},success:res=>{
    if (!res || res.statusCode !== 200 || !res.data || res.data.code !== 0 || !res.data.data || res.data.data.taskId !== id || res.data.data.status !== 'expired') return fail()
    try { wx.removeStorageSync(PREFIX+id); callback(null) } catch (_) { callback(Error('服务端已删除，本机记录清理失败，请重试')) }
  },fail})
}
function removeLocal(id) { if (get(id)) wx.removeStorageSync(PREFIX+id) }
module.exports = { submit, refresh, get, list, saveToHistory, remove, removeLocal }

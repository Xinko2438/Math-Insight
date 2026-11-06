const drafts = require('../../utils/drafts')
const jobs = require('../../utils/analysis-jobs')
const math=require('../../utils/math-document')
const photos=require('../../utils/photo-assets')
const labels={submitting:'提交中',queued:'排队中',running:'分析中',complete:'可查看报告',failed:'分析未完成',uncertain:'状态待确认',not_found:'服务暂未找到，仍需确认',access_denied:'无权访问，请检查服务',expired:'任务已过期',deleting:'删除待确认，请重试'}
Page({
  data:{drafts:[],tasks:[],loadError:''},
  onShow() { this._visible=true; this._opening=false; this.render(); this.refreshPending(); this.scheduleRefresh() },
  onHide() { this._visible=false; if(this._timer) clearTimeout(this._timer); this._timer=null },
  onUnload() { this.onHide() },
  scheduleRefresh() { if (!this._visible) return; this._timer=setTimeout(()=>{this.refreshPending();this.scheduleRefresh()},8000) },
  render() {
    try {
      const rows=drafts.list().map(row=>({id:row.id,title:row.question.trim()?math.summary(row.questionDoc||math.fromText(row.question),row.question):row.editorDraft?'正在编辑内容':'仅有作答'}))
      const tasks=jobs.list().map(job=>({id:job.taskId,title:math.summary(job.snapshot.questionDoc||math.fromText(job.snapshot.question),job.snapshot.question),status:labels[job.status] || '状态待确认',ready:job.status==='complete'}))
      this.setData({drafts:rows,tasks})
    } catch (_) { this.setData({loadError:'暂时无法读取本机记录，请重试。'}) }
  },
  refreshPending() {
    let rows
    try { rows=jobs.list() } catch (_) { return }
    rows.filter(job=>['submitting','queued','running','uncertain','not_found'].includes(job.status)).forEach(job=>jobs.refresh(job.taskId,error=>{if(!this._visible)return; if(error) this.setData({loadError:'任务状态或结果保存失败，请释放本机空间后刷新；服务端结果在保留期内仍可查询。'}); else this.render()}))
  },
  refreshAll() { this.setData({loadError:''}); this.render(); this.refreshPending() },
  openMore(e) {
    const {id,kind}=e.currentTarget.dataset
    if (!id || !['draft','task'].includes(kind)) return
    wx.showActionSheet({itemList:kind === 'draft' ? ['删除草稿'] : ['删除任务','仅清理本机记录'],success:choice=>{
      const target={currentTarget:{dataset:{id}}}
      if (kind === 'draft' && choice.tapIndex === 0) this.deleteDraft(target)
      if (kind === 'task' && choice.tapIndex === 0) this.deleteTask(target)
      if (kind === 'task' && choice.tapIndex === 1) this.deleteLocalTask(target)
    }})
  },
  openDraft(e) { wx.navigateTo({url:'/pages/input/input?id='+encodeURIComponent(e.currentTarget.dataset.id)}) },
  deleteDraft(e) {
    const id=e.currentTarget.dataset.id
    wx.showModal({title:'删除草稿？',content:'相关分析任务会保留，可继续查看。',confirmText:'删除',success:r=>{if(!r.confirm)return; try{const row=drafts.get(id);drafts.remove(id);photos.releaseIfUnused(row&&row.sourceImage);this.render()}catch(_){wx.showToast({title:'删除失败，请重试',icon:'none'})}}})
  },
  openTask(e) {
    if(this._opening)return
    const id=e.currentTarget.dataset.id
    let job
    try { job=jobs.get(id) } catch (_) { wx.showToast({title:'读取失败，请重试',icon:'none'}); return }
    if (!job) return
    if (job.status !== 'complete') { jobs.refresh(id,error=>{if(error) this.setData({loadError:'任务状态或结果保存失败，请释放本机空间后刷新；服务端结果在保留期内仍可查询。'}); else this.render()}); return }
    getApp().globalData.lastResult=JSON.parse(JSON.stringify(job.result))
    getApp().globalData.lastWrongAnswer=job.snapshot.wrongAnswer
    getApp().globalData.lastQuestionDoc=job.snapshot.questionDoc||null;getApp().globalData.lastWrongAnswerDoc=job.snapshot.wrongAnswerDoc||null;getApp().globalData.lastSourceImage=job.snapshot.sourceImage||null
    this._opening=true
    wx.navigateTo({url:'/pages/result/result?taskId='+encodeURIComponent(id),fail:()=>{this._opening=false}})
  },
  deleteTask(e) {
    const id=e.currentTarget.dataset.id
    wx.showModal({title:'删除分析任务？',content:'将删除服务端和本机的任务内容，不删除草稿或已存入的错题。已发出的分析可能继续产生费用。',confirmText:'删除任务',success:r=>{
      if(!r.confirm)return
      const old=jobs.get(id)
      jobs.remove(id,error=>{ if(error) wx.showModal({title:'删除未完成',content:error.message,showCancel:false}); else photos.releaseIfUnused(old&&old.snapshot.sourceImage); this.render() })
      this.render()
    }})
  },
  deleteLocalTask(e) {
    const id=e.currentTarget.dataset.id
    wx.showModal({title:'仅删除本机记录？',content:'服务端内容仍按保留期限保存。删除本机凭据后无法在此设备找回该任务；草稿和已存入的错题不受影响。',confirmText:'删除本机',success:r=>{
      if(!r.confirm)return
      try { const old=jobs.get(id);jobs.removeLocal(id);photos.releaseIfUnused(old&&old.snapshot.sourceImage); this.render() } catch (_) { wx.showToast({title:'本机删除失败',icon:'none'}) }
    }})
  }
})

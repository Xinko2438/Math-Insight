const drafts = require('../../utils/drafts')
const jobs = require('../../utils/analysis-jobs')
const { recognizeQuestion } = require('../../utils/ocr')

Page({
  data: { question:'', wrongAnswer:'', questionLen:0, answerLen:0, recognizing:false, submitting:false, ocrReview:[], saveState:'', saveConflict:false, taskMessage:'' },
  onLoad(options = {}) {
    this._draftId = options.id || ''
    this._revision = 0
    this._editVersion = 0
    if (this._draftId) {
      try {
        const row = drafts.get(this._draftId)
        if (!row) { this.setData({saveState:'草稿未找到'}); return }
        this._revision = row.revision
        this.setData({question:row.question,wrongAnswer:row.wrongAnswer,questionLen:row.question.length,answerLen:row.wrongAnswer.length,ocrReview:row.ocrReview || [],saveState:'已保存'})
      } catch (_) { this.setData({saveState:'草稿读取失败，请稍后重试'}) }
    }
    const pending = getApp().globalData.pendingPhoto
    if (pending) { getApp().globalData.pendingPhoto = null; this.applyPhoto(pending) }
  },
  onHide() { if (this._dirty) this.saveDraft() },
  onQuestionInput(e) { this._editVersion++; this._dirty=true; this.setData({question:e.detail.value,questionLen:e.detail.value.length}); this.saveDraft() },
  onAnswerInput(e) { this._editVersion++; this._dirty=true; this.setData({wrongAnswer:e.detail.value,answerLen:e.detail.value.length}); this.saveDraft() },
  saveDraft() {
    if (!this.data.question.trim() && !this.data.wrongAnswer.trim() && !this._draftId) { this.setData({saveState:''}); return null }
    try {
      const row=drafts.save({id:this._draftId, revision:this._revision || 0, question:this.data.question, wrongAnswer:this.data.wrongAnswer, ocrReview:this.data.ocrReview})
      this._draftId=row.id; this._revision=row.revision; this._dirty=false; this.setData({saveState:'已保存',saveConflict:false}); return row
    } catch (error) {
      const conflict=/conflict/i.test(error.message)
      this.setData({saveConflict:conflict,saveState: conflict ? '草稿已在别处更新，请保留当前文字并另存' : '保存失败，文字仍在此页面，请重试'})
      return null
    }
  },
  saveAsNew() { this._draftId=''; this._revision=0; this._dirty=true; this.saveDraft() },
  applyPhoto(photo, version = this._editVersion, id = this._draftId, revision = this._revision) {
    if (version !== this._editVersion || id !== this._draftId || revision !== this._revision) { wx.showModal({title:'内容已变化',content:'识别期间内容已变化，请重新选择照片，当前文字已保留。',showCancel:false}); return }
    const question=photo.question || this.data.question, wrongAnswer=photo.wrongAnswer || this.data.wrongAnswer
    const apply=() => {
      if (version !== this._editVersion || id !== this._draftId || revision !== this._revision) { wx.showToast({title:'内容已变化，请重新选择照片',icon:'none'}); return }
      this._editVersion++; this._dirty=true
      this.setData({question,wrongAnswer,questionLen:question.length,answerLen:wrongAnswer.length,ocrReview:photo.reviewReasons || []}); this.saveDraft()
    }
    if ((photo.question && this.data.question && photo.question !== this.data.question) || (photo.wrongAnswer && this.data.wrongAnswer && photo.wrongAnswer !== this.data.wrongAnswer)) {
      wx.showModal({title:'更新当前内容？',content:'识别内容将替换对应字段，未识别到的内容会保留。',confirmText:'更新',cancelText:'保留原文',success:r=>{if(r.confirm) apply()}})
    } else apply()
  },
  goCamera() {
    if (this.data.recognizing) return
    const version=this._editVersion, id=this._draftId, revision=this._revision
    recognizeQuestion({onStart:()=>this.setData({recognizing:true}),onFinish:()=>this.setData({recognizing:false}),onSuccess:photo=>this.applyPhoto(photo,version,id,revision),onError:content=>wx.showModal({title:'识别未完成',content,showCancel:false})})
  },
  onSubmit() {
    if (this.data.submitting || this.data.recognizing) return
    if (!this.data.question.trim()) { wx.showToast({title:'请先填写题目',icon:'none'}); return }
    const row=this.saveDraft()
    if (!row) return
    let pending
    try { pending=jobs.list().some(job=>job.draftId === row.id && ['submitting','queued','running','uncertain','not_found','access_denied'].includes(job.status)) }
    catch (_) { this.setData({taskMessage:'无法读取已有任务，请稍后重试。'}); return }
    if (pending) {
      this.setData({submitting:true})
      wx.showModal({title:'已有分析任务',content:'之前的任务可能仍在运行或产生费用。建议先查看任务状态，继续将开始新的分析。',confirmText:'继续分析',cancelText:'查看任务',success:r=>{if(r.confirm) this.startAnalysis(row); else {this.setData({submitting:false}); this.goDrafts()}},fail:()=>this.setData({submitting:false})})
      return
    }
    this.startAnalysis(row)
  },
  startAnalysis(row) {
    this.setData({submitting:true,taskMessage:'正在提交，可继续浏览其他页面。'})
    jobs.submit(row,(error,job)=>{
      if (error) { this.setData({submitting:false,taskMessage:'任务状态未能确认，请到草稿与任务查看；草稿仍在本机。'}); return }
      const message=['queued','running','complete'].includes(job.status) ? '任务已接收，可到草稿与任务查看。' : '任务状态待确认，可到草稿与任务查看。'
      this.setData({submitting:false,taskMessage:message})
    })
  },
  goDrafts() { wx.navigateTo({url:'/pages/drafts/drafts'}) }
})

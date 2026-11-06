const drafts = require('../../utils/drafts')
const jobs = require('../../utils/analysis-jobs')
const { recognizeQuestion } = require('../../utils/ocr')
const math = require('../../utils/math-document')
const mathEdit = require('../../utils/math-edit')
const photos = require('../../utils/photo-assets')
const sheetLayout = require('../../utils/sheet-layout')

Page({
  data: { question:'', wrongAnswer:'', questionDoc:null, wrongAnswerDoc:null, questionDocJson:'',wrongAnswerDocJson:'',sourceImage:null, editorSession:null, editorSessionJson:'',editorClosing:false, hasEditorDraft:false, questionLen:0, answerLen:0, focusedField:'', recognizing:false, submitting:false, ocrReview:[], photoNotice:'', saveState:'', saveConflict:false, taskMessage:'', primaryMode:'analyze', previousReportReady:false },
  onLoad(options = {}) {
    const viewport=sheetLayout.readMetrics(wx)
    this.setData({editorViewportHeight:viewport.height,editorSafeTop:viewport.safeTop})
    this._isVisible = true
    this._draftId = options.id || ''
    this._revision = 0
    this._editVersion = 0
    this._editorDrafts={};this._docGenerations={question:0,wrongAnswer:0}
    if (this._draftId) {
      try {
        const row = drafts.get(this._draftId)
        if (!row) { this.setData({saveState:'草稿未找到'}); return }
        this._revision = row.revision
        let qDoc=null,aDoc=null;try{if(row.questionDoc)qDoc=math.validateDoc(row.questionDoc,2000)}catch(_){}try{if(row.wrongAnswerDoc)aDoc=math.validateDoc(row.wrongAnswerDoc,1000)}catch(_){}
        const unsupported=(row.questionDoc&&!qDoc)||(row.wrongAnswerDoc&&!aDoc)
        this._sourceTranscription=row.sourceTranscription||(unsupported?{question:row.question,wrongAnswer:row.wrongAnswer,questionDoc:row.questionDoc,wrongAnswerDoc:row.wrongAnswerDoc}:null);this._editorDrafts=drafts.editorBank(row);this._editorDraft=this._editorDrafts[drafts.editorKey(row.editorDraft)]||Object.values(this._editorDrafts)[0]||null;this._docGenerations=row.docGenerations||{question:0,wrongAnswer:0}
        this.setData({question:row.question,wrongAnswer:row.wrongAnswer,questionDoc:qDoc,wrongAnswerDoc:aDoc,questionDocJson:qDoc?JSON.stringify(qDoc):'',wrongAnswerDocJson:aDoc?JSON.stringify(aDoc):'',sourceImage:row.sourceImage||null,editorSession:math.clone(this._editorDraft),editorSessionJson:this._editorDraft?JSON.stringify(this._editorDraft):'',hasEditorDraft:!!this._editorDraft,questionLen:row.question.length,answerLen:row.wrongAnswer.length,ocrReview:row.ocrReview || [],photoNotice:unsupported?'数学结构暂不可用，原文已保留，可手动修改。':'',saveState:'已保存'})
      } catch (_) { this.setData({saveState:'草稿读取失败，请稍后重试'}) }
    }
    const pending = getApp().globalData.pendingPhoto
    if (pending) { getApp().globalData.pendingPhoto = null; this.applyPhoto(pending) }
  },
  onShow() {
    this._isVisible=true; this._openingReport=false
    if (getApp().globalData.startFreshDraft) {
      getApp().globalData.startFreshDraft=false
      this.stopTaskRefresh(); this._submissionGeneration=(this._submissionGeneration || 0)+1; this._submissionInFlight=false; this._confirmationGeneration=(this._confirmationGeneration || 0)+1; this._confirming=false
      this._task=null; this._taskId=''; this._draftId=''; this._revision=0; this._dirty=false; this._editVersion++
      this._sourceTranscription=null;this._editorDraft=null;this._editorDrafts={};this._docGenerations={question:0,wrongAnswer:0}
      this.setData({question:'',wrongAnswer:'',questionDoc:null,wrongAnswerDoc:null,questionDocJson:'',wrongAnswerDocJson:'',sourceImage:null,editorSession:null,editorSessionJson:'',hasEditorDraft:false,questionLen:0,answerLen:0,focusedField:'',ocrReview:[],photoNotice:'',saveState:'',saveConflict:false,taskMessage:'',primaryMode:'analyze',previousReportReady:false})
    }
    this.setData({submitting:!!(this._submissionInFlight || this._confirming)}); this.restoreTask()
  },
  onHide() { this._isVisible=false; this.stopTaskRefresh(); if (this._dirty) this.saveDraft() },
  onUnload() { this._isVisible=false; this.stopTaskRefresh(); if(this._editorCloseTimer)clearTimeout(this._editorCloseTimer) },
  openEditorView(session) { if(this._editorCloseTimer)clearTimeout(this._editorCloseTimer);this._editorViewGeneration=(this._editorViewGeneration||0)+1;this.setData({editorSession:math.clone(session),editorSessionJson:JSON.stringify(session),editorClosing:false}) },
  closeEditorView() { const generation=(this._editorViewGeneration||0)+1;this._editorViewGeneration=generation;this.setData({editorSession:null,editorSessionJson:'',editorClosing:true});this._editorCloseTimer=setTimeout(()=>{if(this._editorViewGeneration===generation)this.setData({editorClosing:false})},180) },
  onFieldFocus(e) { const field=e.currentTarget.dataset.field; if (['question','answer'].includes(field)) this.setData({focusedField:field}) },
  onFieldBlur(e) { if (this.data.focusedField === e.currentTarget.dataset.field) this.setData({focusedField:''}) },
  bumpDocument(field){this._docGenerations=this._docGenerations||{question:0,wrongAnswer:0};this._docGenerations[field]=(this._docGenerations[field]||0)+1},
  onQuestionInput(e) { this.bumpDocument('question');this._editVersion++; this._dirty=true; this.setData({question:e.detail.value,questionDoc:null,questionDocJson:'',questionLen:e.detail.value.length}); this.saveDraft(); if(this._task) this.updateTaskView(this._task) },
  onAnswerInput(e) { this.bumpDocument('wrongAnswer');this._editVersion++; this._dirty=true; this.setData({wrongAnswer:e.detail.value,wrongAnswerDoc:null,wrongAnswerDocJson:'',answerLen:e.detail.value.length}); this.saveDraft(); if(this._task) this.updateTaskView(this._task) },
  draftPayload(extra={}) { return{id:this._draftId,revision:this._revision||0,question:this.data.question,wrongAnswer:this.data.wrongAnswer,questionDoc:this.data.questionDoc,wrongAnswerDoc:this.data.wrongAnswerDoc,ocrReview:this.data.ocrReview,sourceImage:this.data.sourceImage,sourceTranscription:this._sourceTranscription,editorDraft:this._editorDraft,editorDraftsVersion:2,editorDrafts:this._editorDrafts||{},docGenerations:this._docGenerations,...extra} },
  saveDraft() {
    if (!this.data.question.trim() && !this.data.wrongAnswer.trim() && !this._draftId && !this._editorDraft) { this.setData({saveState:''}); return null }
    try {
      const row=drafts.save(this.draftPayload())
      this._draftId=row.id; this._revision=row.revision; this._dirty=false; this.setData({saveState:'已保存',saveConflict:false}); return row
    } catch (error) {
      const conflict=/conflict/i.test(error.message)
      this.setData({saveConflict:conflict,saveState: conflict ? '草稿已在别处更新，请保留当前文字并另存' : '保存失败，文字仍在此页面，请重试'})
      return null
    }
  },
  previewPhoto() { photos.preview(this.data.sourceImage) },
  rememberEditor(session){this._editorDrafts=this._editorDrafts||{};this._editorDrafts[drafts.editorKey(session)]=math.clone(session);this._editorDraft=math.clone(session);this.setData({hasEditorDraft:true})},
  editBlock(e) {
    if(this.data.recognizing)return
    const {field,id}=e.detail
    if(!['question','wrongAnswer'].includes(field))return
    try{const doc=this.data[field+'Doc']?math.validateDoc(this.data[field+'Doc']):math.fromText(this.data[field]);const block=doc.blocks.find(b=>b.id===id);if(!block)return;const pending=this._editorDrafts?.[field+':'+id];const session=pending||{field,id,type:block.type,baseDocJson:JSON.stringify(doc),baseBlockJson:JSON.stringify(block),baseGeneration:this._docGenerations[field]||0,...(block.type==='math'?{originalLatex:block.latex,model:mathEdit.createSession(block.latex)}:{workingText:block.text})};this.rememberEditor(session);this.openEditorView(session);this.saveDraft()}catch(_){wx.showToast({title:'暂时无法编辑，原文仍保留',icon:'none'})}
  },
  addMath(e) { this.addBlock(e.currentTarget.dataset.field,'math') },
  addText(e) { this.addBlock(e.currentTarget.dataset.field,'text') },
  addBlock(field,type) {
    if(this.data.recognizing||!['question','wrongAnswer'].includes(field))return
    try{const doc=this.data[field+'Doc']?math.validateDoc(this.data[field+'Doc']):math.fromText(this.data[field]);const id='n'+Date.now().toString(36)+(this._editVersion++).toString(36),session={field,id,type,isNew:true,baseDocJson:JSON.stringify(doc),baseGeneration:this._docGenerations[field]||0,...(type==='math'?{originalLatex:'',model:mathEdit.createSession('x=1')}:{workingText:''})};this.rememberEditor(session);this.openEditorView(session);this.saveDraft()}catch(_){wx.showToast({title:'暂时无法添加，请稍后重试',icon:'none'})}
  },
  currentEditor(session){return !!this.data.editorSession&&drafts.editorKey(session)===drafts.editorKey(this.data.editorSession)},
  editorChange(e) { const session=JSON.parse(e.detail.sessionJson);if(!this.currentEditor(session))return;this.rememberEditor(session);this._dirty=true;this.saveDraft() },
  editorHasChanges(session){if(session.isNew)return true;try{const base=session.baseBlockJson?JSON.parse(session.baseBlockJson):JSON.parse(session.baseDocJson).blocks.find(b=>b.id===session.id);if(!base)return true;return session.type==='math'?!!session.pad?.holes?.length||(session.pad?.source??session.model.workingLatex)!==base.latex:session.workingText!==base.text}catch(_){return true}},
  editorPause(e) { const session=JSON.parse(e.detail.sessionJson);if(!this.currentEditor(session))return;if(!this.editorHasChanges(session)){this.editorCancel(e);return}this.rememberEditor(session);if(this.saveDraft())this.closeEditorView() },
  resumeEditor() { this._editorDraft=this._editorDraft||Object.values(this._editorDrafts||{})[0];if(this._editorDraft)this.openEditorView(this._editorDraft) },
  remainingEditors(session){const bank=math.clone(this._editorDrafts||{});delete bank[drafts.editorKey(session)];return{bank,active:Object.values(bank)[0]||null}},
  editorCancel(e) {
    if(e?.detail?.sessionJson&&!this.currentEditor(JSON.parse(e.detail.sessionJson)))return
    const remaining=this.remainingEditors(this._editorDraft)
    try{
      if(!this.data.question.trim()&&!this.data.wrongAnswer.trim()&&!this._sourceTranscription&&!this.data.sourceImage&&!remaining.active){const old=this._draftId&&drafts.get(this._draftId);if(old&&old.revision!==this._revision)throw Error('draft conflict');if(this._draftId)drafts.remove(this._draftId);this._draftId='';this._revision=0;this._editorDrafts={};this._editorDraft=null;this.setData({hasEditorDraft:false,saveState:''});this.closeEditorView();return}
      const row=drafts.save(this.draftPayload({editorDrafts:remaining.bank,editorDraft:remaining.active}));this._draftId=row.id;this._revision=row.revision;this._editorDrafts=remaining.bank;this._editorDraft=remaining.active;this._dirty=false;this.setData({hasEditorDraft:!!remaining.active,saveState:'已保存'});this.closeEditorView()
    }catch(_){wx.showToast({title:'暂时无法取消，编辑内容仍保留',icon:'none'})}
  },
  editorDone(e) {
    const session=JSON.parse(e.detail.sessionJson),value=e.detail.value,field=session.field
    if(!this.currentEditor(session))return
    try{
      if(!['question','wrongAnswer'].includes(field)||typeof value!=='string')throw Error('编辑结果无法读取')
      const current=this.data[field+'Doc']?math.validateDoc(this.data[field+'Doc']):math.fromText(this.data[field]),existing=current.blocks.find(b=>b.id===session.id)
      if(session.baseGeneration!==undefined&&session.baseGeneration!==(this._docGenerations[field]||0))throw Error('原题已变化，编辑草稿仍保留，请重新核对')
      const base=session.baseBlockJson||(!session.isNew?JSON.stringify(JSON.parse(session.baseDocJson).blocks.find(b=>b.id===session.id)):null)
      if(session.isNew?!!existing:JSON.stringify(existing)!==base)throw Error('这段原文已变化，编辑草稿仍保留，请重新核对')
      let doc=math.clone(current)
      if(!value.trim())doc.blocks=doc.blocks.filter(b=>b.id!==session.id)
      else if(session.isNew)doc.blocks.push(session.type==='math'?{id:session.id,type:'math',latex:value,display:'block'}:{id:session.id,type:'text',text:value})
      else doc=math.replaceBlock(doc,session.id,session.type==='math'?{latex:value}:{text:value})
      doc=math.validateDoc(doc,field==='question'?2000:1000);const text=math.toText(doc),remaining=this.remainingEditors(session),payload=this.draftPayload({[field]:text,[field+'Doc']:doc,editorDrafts:remaining.bank,editorDraft:remaining.active});const row=drafts.save(payload)
      this._draftId=row.id;this._revision=row.revision;this._editorDrafts=remaining.bank;this._editorDraft=remaining.active;this._dirty=false;this._editVersion++
      this.setData({[field]:text,[field+'Doc']:doc,[field+'DocJson']:JSON.stringify(doc),[field==='question'?'questionLen':'answerLen']:text.length,hasEditorDraft:!!remaining.active,saveState:'已保存',saveConflict:false});this.closeEditorView();if(this._task)this.updateTaskView(this._task)
    }catch(error){wx.showToast({title:error.message||'保存失败，编辑内容仍保留',icon:'none'})}
  },
  saveAsNew() { this.stopTaskRefresh(); this._submissionGeneration=(this._submissionGeneration || 0)+1; this._submissionInFlight=false; this._confirmationGeneration=(this._confirmationGeneration || 0)+1; this._confirming=false; this._task=null; this._taskId=''; this._draftId=''; this._revision=0; this._dirty=true; this.setData({submitting:false,taskMessage:'',primaryMode:'analyze',previousReportReady:false}); this.saveDraft() },
  applyPhoto(photo, version = this._editVersion, id = this._draftId, revision = this._revision) {
    if (version !== this._editVersion || id !== this._draftId || revision !== this._revision) { photos.releaseIfUnused(photo.sourceImage);wx.showModal({title:'内容已变化',content:'识别期间内容已变化，请重新选择照片，当前文字已保留。',showCancel:false}); return }
    const question=photo.question || this.data.question, wrongAnswer=photo.wrongAnswer || this.data.wrongAnswer
    const apply=() => {
      if (version !== this._editVersion || id !== this._draftId || revision !== this._revision) { wx.showToast({title:'内容已变化，请重新选择照片',icon:'none'}); return }
      this._editVersion++; this._dirty=true
      if(photo.question&&photo.question!==this.data.question)this.bumpDocument('question');if(photo.wrongAnswer&&photo.wrongAnswer!==this.data.wrongAnswer)this.bumpDocument('wrongAnswer')
      const oldImage=this.data.sourceImage;this._sourceTranscription=photo.sourceTranscription||{question:photo.question,wrongAnswer:photo.wrongAnswer};this._editorDraft=Object.values(this._editorDrafts||{})[0]||null
      this.setData({question,wrongAnswer,questionDoc:photo.question?photo.questionDoc||null:this.data.questionDoc,wrongAnswerDoc:photo.wrongAnswer?photo.wrongAnswerDoc||null:this.data.wrongAnswerDoc,questionDocJson:photo.question?(photo.questionDoc?JSON.stringify(photo.questionDoc):''):this.data.questionDocJson,wrongAnswerDocJson:photo.wrongAnswer?(photo.wrongAnswerDoc?JSON.stringify(photo.wrongAnswerDoc):''):this.data.wrongAnswerDocJson,sourceImage:photo.sourceImage||null,editorSession:null,editorSessionJson:'',hasEditorDraft:!!this._editorDraft,questionLen:question.length,answerLen:wrongAnswer.length,ocrReview:photo.reviewReasons || [],photoNotice:'识别完成，请核对题目和作答。'+(photo.sourceImageWarning||'')}); if(this.saveDraft())photos.releaseIfUnused(oldImage)
      if(this._task) this.updateTaskView(this._task)
    }
    if ((photo.question && this.data.question && photo.question !== this.data.question) || (photo.wrongAnswer && this.data.wrongAnswer && photo.wrongAnswer !== this.data.wrongAnswer)) {
      wx.showModal({title:'更新当前内容？',content:'识别内容将替换对应字段，未识别到的内容会保留。',confirmText:'更新',cancelText:'保留原文',success:r=>{if(r.confirm) apply();else photos.releaseIfUnused(photo.sourceImage)}})
    } else apply()
  },
  goCamera() {
    if (this.data.recognizing) return
    const version=this._editVersion, id=this._draftId, revision=this._revision
    recognizeQuestion({onStart:()=>this.setData({recognizing:true}),onFinish:()=>this.setData({recognizing:false}),onSuccess:photo=>this.applyPhoto(photo,version,id,revision),onError:content=>wx.showModal({title:'识别未完成',content,showCancel:false})})
  },
  stopTaskRefresh() { if (this._taskTimer) clearTimeout(this._taskTimer); this._taskTimer=null },
  updateTaskView(job) {
    if (!job || !job.snapshot) return
    this._task=job; this._taskId=job.taskId
    const same=this.data.question.trim() === job.snapshot.question && this.data.wrongAnswer.trim() === job.snapshot.wrongAnswer && JSON.stringify(this.data.questionDoc||null)===JSON.stringify(job.snapshot.questionDoc||null) && JSON.stringify(this.data.wrongAnswerDoc||null)===JSON.stringify(job.snapshot.wrongAnswerDoc||null)
    const ready=job.status === 'complete', waiting=['submitting','queued','running'].includes(job.status)
    const message=ready ? (same ? '分析完成，可以查看报告。' : '上一次分析已完成，报告对应提交时的内容。') : job.status === 'submitting' ? '正在提交，请稍候确认接收。' : waiting ? '任务已接收，可以先做别的。' : ['uncertain','not_found','access_denied'].includes(job.status) ? '任务状态待确认，请到草稿与任务查看。' : '分析未完成，可到草稿与任务查看。'
    this.setData({taskMessage:message,primaryMode:same && ready ? 'report' : same && waiting ? 'waiting' : 'analyze',previousReportReady:ready && !same})
  },
  scheduleTaskRefresh() {
    this.stopTaskRefresh()
    if (this._isVisible && this._task && ['submitting','queued','running','uncertain','not_found'].includes(this._task.status)) this._taskTimer=setTimeout(()=>this.refreshTask(),8000)
  },
  restoreTask() {
    if (!this._draftId) return
    try {
      const job=jobs.list().find(row=>row.draftId === this._draftId)
      if (job) { this.updateTaskView(job); this.scheduleTaskRefresh() }
      else { this.stopTaskRefresh(); this._task=null; this._taskId=''; this.setData({taskMessage:this._submissionInFlight ? '正在提交，请稍候确认接收。' : '',primaryMode:'analyze',previousReportReady:false}) }
    } catch (_) { this.setData({taskMessage:'暂时无法读取任务，请到草稿与任务查看。'}) }
  },
  refreshTask() {
    if (!this._isVisible || !this._taskId) return
    const id=this._taskId
    this.stopTaskRefresh()
    jobs.refresh(id,(error,job)=>{
      if (!this._isVisible || id !== this._taskId) return
      if (error) { this.setData({taskMessage:'任务状态暂未保存，请到草稿与任务刷新。'}); return }
      this.updateTaskView(job); this.scheduleTaskRefresh()
    })
  },
  openTaskResult() {
    if (this._openingReport) return
    try {
      const job=jobs.get(this._taskId)
      if (!job || job.status !== 'complete' || !job.result) { this.setData({taskMessage:'报告暂不可用，请到草稿与任务查看。'}); return }
      getApp().globalData.lastResult=JSON.parse(JSON.stringify(job.result))
      getApp().globalData.lastWrongAnswer=job.snapshot.wrongAnswer
      getApp().globalData.lastQuestionDoc=job.snapshot.questionDoc||null;getApp().globalData.lastWrongAnswerDoc=job.snapshot.wrongAnswerDoc||null;getApp().globalData.lastSourceImage=job.snapshot.sourceImage||null
      this._openingReport=true
      wx.navigateTo({url:'/pages/result/result?taskId='+encodeURIComponent(job.taskId),fail:()=>{this._openingReport=false;this.setData({taskMessage:'报告打开失败，请重试。'})}})
    } catch (_) { this._openingReport=false; this.setData({taskMessage:'报告读取失败，请到草稿与任务查看。'}) }
  },
  onSubmit() {
    if (this._submissionInFlight || this._confirming || this.data.submitting || this.data.recognizing) return
    if(this._editorDraft){this.resumeEditor();return}
    if (this.data.primaryMode === 'report') return this.openTaskResult()
    if (this.data.primaryMode === 'waiting') return
    if (!this.data.question.trim()) { wx.showToast({title:'请先填写题目',icon:'none'}); return }
    const row=this.saveDraft()
    if (!row) return
    let pending
    try { pending=jobs.list().some(job=>job.draftId === row.id && ['submitting','queued','running','uncertain','not_found','access_denied'].includes(job.status)) }
    catch (_) { this.setData({taskMessage:'无法读取已有任务，请稍后重试。'}); return }
    if (pending) {
      const confirmation=(this._confirmationGeneration || 0)+1
      this._confirmationGeneration=confirmation; this._confirming=true
      this.setData({submitting:true})
      wx.showModal({title:'已有分析任务',content:'之前的任务可能仍在运行或产生费用。建议先查看任务状态，继续将开始新的分析。',confirmText:'继续分析',cancelText:'查看任务',success:r=>{if(!this._confirming || confirmation !== this._confirmationGeneration)return;this._confirming=false;if(r.confirm) this.startAnalysis(row); else {this.setData({submitting:false}); this.goDrafts()}},fail:()=>{if(confirmation===this._confirmationGeneration){this._confirming=false;this.setData({submitting:false})}}})
      return
    }
    this.startAnalysis(row)
  },
  startAnalysis(row) {
    const generation=(this._submissionGeneration || 0)+1
    this._submissionGeneration=generation; this._submissionInFlight=true
    this.setData({submitting:true,taskMessage:'正在提交，请稍候确认接收。'})
    jobs.submit(row,(error,job)=>{
      if (generation !== this._submissionGeneration) return
      this._submissionInFlight=false
      if (!this._isVisible) return
      if (error) { this._submissionFailure={stage:error.taskStage||'random',category:/冲突/.test(error.message)?'identity_conflict':/长度/.test(error.message)?'document_length':'local_failure'};this.setData({submitting:false,taskMessage:'任务状态未能确认，请到草稿与任务查看；草稿仍在本机。'}); return }
      this.setData({submitting:false}); this.updateTaskView(job); this.scheduleTaskRefresh()
    })
  },
  goDrafts() { wx.navigateTo({url:'/pages/drafts/drafts'}) }
})

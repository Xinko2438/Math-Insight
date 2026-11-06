const editor = require('../../utils/math-edit')
const { clone } = require('../../utils/math-document')
const layout = require('../../utils/sheet-layout')
const numberKeys = ['7','8','9','+','−','4','5','6','×','÷','1','2','3','=','(', '0','.','x','y',')']
const letterKeys = 'abcdefghijklmnopqrstuvwxyz'.split('').concat(['π','θ','α','β'])
const moreKeys = ['a/b','√','x²','x₁','方程组','±','≤','≥','≠','∞','sin','cos','tan','log','ln','π','θ','∈','⊥','∥']

Component({
 properties: { sessionJson:{type:String,value:''}, closing:{type:Boolean,value:false}, viewportHeight:{type:Number,value:0}, safeTop:{type:Number,value:0} },
 data: { working:null, fields:[], previewJson:'', visualNodes:[], activeToken:'', caretToken:'', error:'', notice:'', textValue:'',
  keyboardHeight:0,overlayHeight:844,sheetHeight:0,sheetBottom:0,paddingBottom:8,compact:false,scrollTarget:'',
  keypadTab:'numbers',keys:numberKeys,canUndo:false,hasSelection:false,holeCount:0,selectedValue:'',renderRevision:0,finishing:false },
 observers: {
  viewportHeight(value){if(value>0){this._baseHeight=value;this.reflow()}},
  safeTop(){this.reflow()},
  closing(value){if(value){this._sessionEpoch=(this._sessionEpoch||0)+1;this._commands=[];this._pendingTap=false;if(typeof wx.hideKeyboard==='function')wx.hideKeyboard({fail(){}})}},
  sessionJson(json){
   if(!json)return
   try{this._working=JSON.parse(json)}catch(_){this.setData({error:'编辑草稿无法读取，原文仍保留。'});return}
   this._keyboardHeight=0;this._activeTarget='';this._sessionEpoch=(this._sessionEpoch||0)+1;this._commands=[];this._frames=new Map();this._changeLog=[];this._revision=0;this._exitRequested=false;this._operationError='';this._pendingTap=false
   const w=this._working
   this.setData({working:{type:w.type,isNew:!!w.isNew},error:'',notice:'',activeToken:'',caretToken:''})
   if(w.type==='text'){this.setData({textValue:w.workingText||'',visualNodes:[]});this.reflow(0);return}
   try{
    if(!w.model)w.model=editor.createSession(w.originalLatex||'')
    if(!w.pad||w.pad.version!==1)w.pad=editor.padCreate(w.model.workingLatex);if(typeof w.pad.initialSource!=='string')w.pad.initialSource=w.originalLatex??w.model.workingLatex;if(!w.pad.source.trim()&&!w.pad.selection)w.pad.selection={start:0,end:0,replace:false}
    // Preserve an old unfinished draft rather than discarding its input.
    if(w.visualEdit&&!w.pad.selection){const a=w.visualEdit;const t=editor.padTokens(w.pad).find(t=>t.start===a.start);if(t)w.pad=editor.padSelect(w.pad,t.id);if(w.pendingError&&a.value==='')w.pad=editor.padDelete(w.pad);else if(w.pendingError)this.setData({notice:'已保留上次未完成的输入，撤销可恢复原式。'})}
    delete w.pendingError;this.renderVisual();this.reflow(0)
    if(typeof wx.hideKeyboard==='function')wx.hideKeyboard({fail(){}})
   }catch(_){this.setData({error:'此结构暂不能逐项编辑，原公式已保留。'})}
  }
 },
 lifetimes: {
  attached(){const m=layout.readMetrics(wx);this._baseHeight=this.properties.viewportHeight||m.height;this._width=m.width;this._resize=()=>{const now=layout.readMetrics(wx);if(now.width!==this._width){this._width=now.width;this._baseHeight=now.height;this._keyboardHeight=0}this.reflow()};if(typeof wx.onWindowResize==='function')wx.onWindowResize(this._resize);this.reflow()},
  detached(){this._sessionEpoch=(this._sessionEpoch||0)+1;this._commands=[];if(this._resize&&typeof wx.offWindowResize==='function')wx.offWindowResize(this._resize)}
 },
 pageLifetimes:{hide(){this._keyboardHeight=0},show(){this._keyboardHeight=0;this.reflow()}},
 methods:{
  hold(){},
  reflow(height,target){
   if(this.properties.closing)return
   const generation=this._layoutGeneration=(this._layoutGeneration||0)+1
   if(height!==null&&height!==undefined&&Number.isFinite(Number(height)))this._keyboardHeight=Math.max(0,Number(height))
   if(this._working?.type==='math')this._keyboardHeight=0
   const m=layout.readMetrics(wx);if(!this._baseHeight)this._baseHeight=this.properties.viewportHeight||m.height
   if(!this._keyboardHeight)this._baseHeight=Math.max(this._baseHeight,m.height)
   const value=layout.compute({baseHeight:this._baseHeight,windowHeight:m.height,keyboardHeight:this._keyboardHeight||0,safeTop:Math.max(this.properties.safeTop||0,m.safeTop),safeBottom:m.safeBottom,preferredHeight:this._working?.type==='math'?620:undefined,maxRatio:this._working?.type==='math'?1:.76})
   this.setData({...value,compact:value.sheetHeight<530,keyboardHeight:this._keyboardHeight||0},()=>{if(generation!==this._layoutGeneration||this.properties.closing)return;if(target){this.setData({scrollTarget:''},()=>{if(generation===this._layoutGeneration)this.setData({scrollTarget:target})})}})
  },
  emit(){this.triggerEvent('change',{sessionJson:JSON.stringify(this._working)})},
  renderVisual(){
   const w=this._working;if(!w?.model)return
   const p=w.pad||editor.padCreate(w.model.workingLatex)
   this.setData({previewJson:JSON.stringify({version:1,blocks:[{id:'preview',type:'math',latex:p.source,display:'block'}]})})
   try{const v=editor.visual(p.source,null,p.holes);this._tokens=v.tokens;const revision=this._revision||0;if(!this._frames)this._frames=new Map();this._frames.set(revision,{source:p.source,tokens:clone(v.tokens)});if(this._frames.size>64)this._frames.delete(this._frames.keys().next().value);this.setData({visualNodes:v.nodes,renderRevision:revision,fields:clone(w.model.fields),canUndo:!!p.undo.length,holeCount:p.holes.length});this.showSelection()}
   catch(_){this._tokens=[];this.setData({visualNodes:[],error:'此公式暂不能逐项修改，原式已保留。'})}
  },
  showSelection(){
   const s=this._working.pad.selection,list=this._tokens||[]
   const selected=s&&s.replace?list.find(t=>t.start===s.start&&t.end===s.end):null
   const caret=s&&!s.replace?list.filter(t=>t.start<s.start&&t.end<=s.end).at(-1):null
   this.setData({activeToken:selected?.id||'',caretToken:caret?.id||'',hasSelection:!!s,selectedValue:selected?.value||''})
  },
  selectToken(id){const token=this._tokens?.find(t=>t.id===id);if(token)this.enqueue({type:'select',ready:true,target:{start:token.start,end:token.end},revision:this._revision||0})},
  enqueue(command){if(this.properties.closing||this._exitRequested&&command.type!=='finish')return;(this._commands||(this._commands=[])).push(command);this.drainCommands()},
  drainCommands(){
   if(this._draining||this.properties.closing)return
   const commands=this._commands||[];this._pendingTap=commands.some(c=>!c.ready)
   // Measure every outstanding tap against its displayed frame before changing
   // source or layout. Then apply tap/key pairs in their actual event order.
   if(this._pendingTap)return
   this._draining=true
   try{while(commands.length&&!this.properties.closing){const c=commands.shift();if(c.type==='select')this.applySelection(c);else if(c.type==='finish')this.finishNow(c.kind);else this.applyAction(c)}}finally{this._draining=false}
  },
  applySelection(command){
   if(command.missed)return
   let target=command.target?{...command.target}:null
   if(target)for(const change of this._changeLog||[]){if(change.revision<=command.revision)continue;const delta=change.newEnd-change.end;if(target.end<=change.start)continue;if(target.start>=change.end){target.start+=delta;target.end+=delta}else if(target.start<=change.start&&target.end>=change.end){target.end+=delta}else{target=null;break}}
   const token=target&&(this._tokens||[]).find(t=>t.start===target.start&&t.end===target.end)
   if(!token){this._working.pad={...this._working.pad,selection:null,typing:false};this._operationError='位置已变化，请重新点选';this.setData({error:this._operationError});this.showSelection();return}
   this._working.pad=editor.padSelect(this._working.pad,token.id);this._operationError='';this.setData({error:'',notice:''});this.showSelection();this.emit()
  },
  formulaTap(e){
   if(this.properties.closing||this._exitRequested||!this._tokens?.length)return
   const revision=Number(e.currentTarget?.dataset?.revision??this._revision??0),frame=this._frames?.get(revision)
   if(!frame){this.setData({error:'画面已更新，请重新点选'});return}
   const point=e.detail||{},touch=e.changedTouches?.[0],x=Number(point.x??touch?.clientX),y=Number(point.y??touch?.clientY)
   if(!Number.isFinite(x)||!Number.isFinite(y)){const t=frame.tokens.find(t=>t.id===e.target?.dataset?.id);if(t)this.enqueue({type:'select',ready:true,target:{start:t.start,end:t.end},revision});return}
   const command={type:'select',ready:false,target:null,revision},epoch=this._sessionEpoch
   this.enqueue(command)
   const complete=(rects,actualRevision)=>{
    if(epoch!==this._sessionEpoch||this.properties.closing||command.ready)return
    command.ready=true
    if(actualRevision===undefined||Number(actualRevision)===revision){const id=editor.hitToken(rects.map(r=>({...r,id:r.id.replace(/^token-/, '')})),x,y),t=frame.tokens.find(t=>t.id===id);if(t)command.target={start:t.start,end:t.end};else command.missed=true}
    this.drainCommands()
   }
   const timer=setTimeout(()=>complete([],NaN),1500)
   const query=this.createSelectorQuery();query.selectAll('.tap-token').boundingClientRect();if(typeof query.select==='function')query.select('#formula-stage').boundingClientRect()
   query.exec(results=>{clearTimeout(timer);complete(results?.[0]||[],results?.[1]?.dataset?.revision)})
  },
  tokenTap(e){this.selectToken(e.currentTarget.dataset.id)},
  perform(action){this.enqueue({...action,ready:true})},
  recordChange(before,after){if(before===after)return;let start=0;while(start<before.length&&start<after.length&&before[start]===after[start])start++;let end=before.length,newEnd=after.length;while(end>start&&newEnd>start&&before[end-1]===after[newEnd-1]){end--;newEnd--}this._revision=(this._revision||0)+1;(this._changeLog||(this._changeLog=[])).push({revision:this._revision,start,end,newEnd})},
  applyAction(action){
   const w=this._working
   try{
    const before=w.pad.source;let next=w.pad
    if(action.type==='key')next=editor.padKey(next,action.value)
    if(action.type==='delete')next=editor.padDelete(next)
    if(action.type==='undo')next=editor.padUndo(next)
    if(action.type==='move')next=editor.padMove(next,action.direction)
    if(action.type==='template')next=editor.padTemplate(next,action.kind)
    if(action.type==='restore')next=editor.padRestore(next)
    w.pad=next;this.recordChange(before,next.source);delete w.visualEdit;delete w.pendingError
    if(!next.holes.length){try{w.model=editor.createSession(editor.padComplete(next))}catch(_){}}
    this._operationError='';this.setData({error:'',notice:''});this.renderVisual();this.emit()
   }catch(error){this.setData({error:/KaTeX|parse error|Invalid token/i.test(error.message)?'这个位置暂不能这样插入，原式已保留。':error.message})}
  },
  keyTap(e){const value=e.currentTarget.dataset.key,kind={'a/b':'fraction','√':'root','x²':'sup','x₁':'sub','方程组':'system'}[value];this.perform(kind?{type:'template',kind}:{type:'key',value})},
  erase(){this.perform({type:'delete'})},
  undo(){this.perform({type:'undo'})},
  move(e){this.perform({type:'move',direction:Number(e.currentTarget.dataset.direction)})},
  template(e){this.perform({type:'template',kind:e.currentTarget.dataset.kind})},
  changeKeypad(e){const tab=e.currentTarget.dataset.tab;this.setData({keypadTab:tab,keys:tab==='letters'?letterKeys:tab==='more'?moreKeys:numberKeys})},
  textInput(e){this._working.workingText=e.detail.value;this.setData({textValue:e.detail.value,error:''});this.emit()},
  textFocus(e){this._activeTarget='editor-text';this.reflow(Number(e.detail.height)>0?Number(e.detail.height):null,this._activeTarget)},
  keyboard(e){if(this._working?.type==='text'&&Number.isFinite(Number(e.detail.height)))this.reflow(Number(e.detail.height),this._activeTarget)},
  requestFinish(kind){if(this.properties.closing||this._exitRequested)return;this._exitRequested=true;this.setData({finishing:true});this.enqueue({type:'finish',ready:true,kind})},
  done(){this.requestFinish('confirm')},
  pause(){this.requestFinish('pause')},
  finishNow(kind){
   try{if(this._operationError)throw Error(this._operationError);if(kind==='pause'){this.triggerEvent('pause',{sessionJson:JSON.stringify(this._working)});return}const value=this._working.type==='text'?this._working.workingText:editor.padComplete(this._working.pad);this.triggerEvent('confirm',{sessionJson:JSON.stringify(this._working),value})}
   catch(error){this.setData({error:error.message});const hole=this._tokens?.find(t=>t.hole);if(hole){this._working.pad=editor.padSelect(this._working.pad,hole.id);this.showSelection()}}
   finally{this._exitRequested=false;this.setData({finishing:false})}
  },
  restoreOriginal(){wx.showModal({title:'恢复原式？',content:'恢复到打开本次编辑时的内容，之后仍可撤销这次恢复。',success:r=>{if(r.confirm)this.perform({type:'restore'})}})},
  cancel(){if(this.properties.closing)return;this._sessionEpoch=(this._sessionEpoch||0)+1;this._commands=[];this._pendingTap=false;this._exitRequested=false;this.triggerEvent('cancel',{sessionJson:JSON.stringify(this._working)})}
 }
})

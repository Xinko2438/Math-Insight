const runtime=require('../vendor/math/runtime')
const {safeLatex,clone}=require('./math-document')
const symbols={le:'≤',leq:'≤',ge:'≥',geq:'≥',ne:'≠',neq:'≠',times:'×',div:'÷',pm:'±',pi:'π',theta:'θ',infty:'∞',in:'∈',cup:'∪',cap:'∩',to:'→',perp:'⊥',parallel:'∥',sin:'sin',cos:'cos',tan:'tan',log:'log',ln:'ln'}
const encoded={'≤':'\\leq ','≥':'\\geq ','≠':'\\neq ','×':'\\times ','÷':'\\div ','±':'\\pm ','π':'\\pi ','θ':'\\theta ','∞':'\\infty ','∈':'\\in ','∪':'\\cup ','∩':'\\cap ','→':'\\to ','⊥':'\\perp ','∥':'\\parallel '}
const extraSymbols={alpha:'α',beta:'β',gamma:'γ',delta:'δ',epsilon:'ϵ',varepsilon:'ε',zeta:'ζ',eta:'η',vartheta:'ϑ',iota:'ι',kappa:'κ',lambda:'λ',mu:'μ',nu:'ν',xi:'ξ',rho:'ρ',varrho:'ϱ',sigma:'σ',varsigma:'ς',tau:'τ',upsilon:'υ',phi:'ϕ',varphi:'φ',chi:'χ',psi:'ψ',omega:'ω',Gamma:'Γ',Delta:'Δ',Theta:'Θ',Lambda:'Λ',Xi:'Ξ',Pi:'Π',Sigma:'Σ',Upsilon:'Υ',Phi:'Φ',Psi:'Ψ',Omega:'Ω',cdot:'⋅',approx:'≈',equiv:'≡',propto:'∝',angle:'∠',notin:'∉',subset:'⊂',subseteq:'⊆',supset:'⊃',supseteq:'⊇'}
Object.assign(symbols,extraSymbols)
for(const name of Object.keys(extraSymbols))encoded[extraSymbols[name]]='\\'+name+' '
function display(s){return s.replace(/\\([A-Za-z]+)\s*/g,(all,name)=>['sin','cos','tan','log','ln'].includes(name)?name+' ':symbols[name]||all)}
function encode(s){if(typeof s!=='string'||s.length>2000||/[\\{}$&]/.test(s))throw Error('请使用结构按钮插入分数、根号或上下标');return Array.from(s).map(c=>encoded[c]||c).join('').replace(/\b(sin|cos|tan|log|ln)\b/g,'\\$1 ')}
function fields(latex){safeLatex(latex);const ast=runtime.parseMath(latex),out=[];let serial=0;
 const add=(start,end,label)=>{const source=latex.slice(start,end),value=display(source);if(/\\/.test(value))return;out.push({id:'f'+serial++,start,end,label,value,source})};
 function walk(nodes,label='表达式',bounds){let run=null;const flush=()=>{if(run){add(run[0],run[1],label);run=null}};
  for(let i=0;i<nodes.length;i++){const n=nodes[i],p=n.position;if(n.editUnsupported)throw Error('此公式包含暂不支持修改的简写结构，原式已保留');if(!p)continue;const simple=n.type==='string'||n.type==='whitespace'||n.type==='macro'&&Object.prototype.hasOwnProperty.call(symbols,n.content);
   if(n.type==='string'&&n.content==='&'){flush();continue}
   if(n.type==='macro'&&n.content==='\\'){flush();continue}
   if(simple){if(!run)run=[p.start.offset,p.end.offset];else run[1]=p.end.offset;continue}
   if(n.type==='macro'&&['left','right','middle'].includes(n.content)){flush();if(nodes[i+1])i++;continue}
   flush();if(n.type==='environment'){
    let row=[],rowIndex=1;const finish=()=>{if(row.length){const parts=[[]];for(const child of row){if(child.type==='string'&&child.content==='&')parts.push([]);else parts[parts.length-1].push(child)}parts.forEach((part,i)=>walk(part,'第'+rowIndex+'行'+(parts.length>1?' · '+(i+1)+'段':'')))}row=[];rowIndex++};for(const child of n.content||[]){if(child.type==='macro'&&child.content==='\\')finish();else row.push(child)}finish();continue
   }
   if(n.type==='macro'&&['frac','dfrac','tfrac'].includes(n.content)&&nodes[i+1]?.type==='group'&&nodes[i+2]?.type==='group'){for(const [offset,name]of [[1,'分子'],[2,'分母']]){const g=nodes[i+offset];walk(g.content,label==='表达式'?name:label+' · '+name,[g.position.start.offset+1,g.position.end.offset-1])}i+=2;continue}
   if(n.type==='macro'&&n.content==='sqrt'){let j=i+1;if(nodes[j]?.content==='['){const first=nodes[j].position.end.offset;while(j<nodes.length&&nodes[j].content!==']')j++;if(nodes[j])add(first,nodes[j].position.start.offset,'根次数');j++}if(nodes[j]?.type==='group'){const g=nodes[j];walk(g.content,'根号内',[g.position.start.offset+1,g.position.end.offset-1]);i=j}continue}
   if(n.type==='macro'&&['^','_'].includes(n.content)&&nodes[i+1]){const g=nodes[++i],name=n.content==='^'?'上标':'下标';if(g.type==='group')walk(g.content,name,[g.position.start.offset+1,g.position.end.offset-1]);else if(g.type==='string')add(g.position.start.offset,g.position.end.offset,name);continue}
   if(n.type==='group')walk(n.content,label,[p.start.offset+1,p.end.offset-1]);
  }flush();if(!nodes.length&&bounds)add(bounds[0],bounds[1],label)
 }
 walk(ast);return out
}
function createSession(latex){safeLatex(latex);return{originalLatex:latex,workingLatex:latex,baseLatex:latex,fields:fields(latex),undo:[],redo:[]}}
function rebase(s,value){const n=createSession(value);n.originalLatex=s.originalLatex;n.undo=s.undo.concat(s.workingLatex).slice(-40);return n}
function replaceRange(s,start,end,value){if(start<0||end<start||end>s.workingLatex.length)throw Error('编辑位置已变化');return rebase(s,s.workingLatex.slice(0,start)+value+s.workingLatex.slice(end))}
function changeField(session,id,value){const s=clone(session),f=s.fields.find(x=>x.id===id);if(!f)throw Error('编辑位置已变化');encode(value);s.undo=s.undo.concat(s.workingLatex).slice(-40);s.redo=[];f.value=value;let next=s.baseLatex;for(const x of s.fields.slice().sort((a,b)=>b.start-a.start))if(x.value!==display(x.source))next=next.slice(0,x.start)+encode(x.value)+next.slice(x.end);safeLatex(next);s.workingLatex=next;return s}
function undo(s){if(!s.undo.length)return s;const value=s.undo[s.undo.length-1],n=createSession(value);n.originalLatex=s.originalLatex;n.undo=s.undo.slice(0,-1);n.redo=s.redo.concat(s.workingLatex);return n}
function insertTemplate(s,id,cursor,kind){const f=s.fields.find(x=>x.id===id),templates={fraction:String.raw`\frac{1}{2}`,root:String.raw`\sqrt{x}`,sup:'^{2}',sub:'_{1}',brackets:String.raw`\left(x\right)`};let working=s.workingLatex;
 if(kind==='system'){const match=working.match(/\\begin\{(cases|aligned|gathered)\}/);if(match){const end=working.lastIndexOf('\\end{'+match[1]+'}');if(end>=0)return rebase(s,working.slice(0,end)+(match[1]==='aligned'?String.raw`\\x&=0`:String.raw`\\x=0`)+working.slice(end))}const value=working.trim()?String.raw`\begin{cases}`+working+String.raw`\\y=0\end{cases}`:String.raw`\begin{cases}x+y=7\\2x-y=8\end{cases}`;return rebase(s,value)}
 if(!templates[kind])throw Error('结构不支持');if(!working.trim())return rebase(s,templates[kind]);if(!f)throw Error('先选择要插入的位置');let offset=f.start;for(const other of s.fields)if(other.start<f.start&&other.value!==display(other.source))offset+=encode(other.value).length-(other.end-other.start);offset+=encode(f.value.slice(0,Math.max(0,Math.min(cursor??f.value.length,f.value.length)))).length;return replaceRange(s,offset,offset,templates[kind])
}
function validateComplete(s){safeLatex(s.workingLatex);if(!s.workingLatex.trim())throw Error('请填写公式');if(s.fields.some(f=>!f.value.trim()))throw Error('请补全当前结构');runtime.renderFormula(s.workingLatex);return s.workingLatex}
function tokens(latex){const out=[];for(const f of fields(latex)){const pattern=/\\[A-Za-z]+\s*|\d+(?:\.\d+)?|[^\s]/g;let match;while((match=pattern.exec(f.source))){const source=match[0];if(source==='^'||source==='_')continue;if(source.startsWith('\\')&&!Object.prototype.hasOwnProperty.call(symbols,source.slice(1).trim()))continue;out.push({start:f.start+match.index,end:f.start+match.index+source.length,source,value:display(source)})}}return out.sort((a,b)=>a.start-b.start).map((t,i)=>({...t,id:'t'+i}))}
function visual(latex,active,holes=[]){safeLatex(latex);let ranges=tokens(latex);for(const h of holes){ranges=ranges.filter(t=>t.end<=h.start||t.start>=h.end);ranges.push({...h,value:'',hole:true})}if(active){ranges=ranges.filter(t=>t.end<=active.start||t.start>=active.end);ranges.push({...active,value:display(latex.slice(active.start,active.end))})}ranges.sort((a,b)=>a.start-b.start);ranges=ranges.map((t,i)=>({...t,id:'t'+i}));const raw=runtime.renderTaggedFormula(latex,ranges);let serial=0;
function node(n,depth){if(depth>30)throw Error('此公式层级过深，请保留原文核对');const attrs=n.attrs||{},tag=(attrs.class||'').match(/\bmx-t(\d+)\b/);return{id:'v'+serial++,kind:n.type==='text'?'text':n.name==='img'?'image':'view',text:(n.text||'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#x27;/g,"'").replace(/&quot;/g,'"'),className:attrs.class||'',style:attrs.style||'',src:attrs.src||'',tokenId:tag?'t'+tag[1]:'',children:(n.children||[]).map(c=>node(c,depth+1))}}
return{nodes:raw.map(n=>node(n,0)),tokens:ranges}}

// The keypad owns a source draft and a source selection. No per-glyph native inputs.
const HOLE='\\square'
function padCreate(source){safeLatex(source);fields(source);return{version:1,source,initialSource:source,holes:[],selection:source.trim()?null:{start:0,end:0,replace:false},undo:[]}}
function padTokens(p){const list=tokens(p.source).filter(t=>!p.holes.some(h=>t.start<h.end&&t.end>h.start));for(const h of p.holes)list.push({...h,source:HOLE,value:'',hole:true});return list.sort((a,b)=>a.start-b.start).map((t,i)=>({...t,id:'t'+i}))}
function padSelect(p,id){const token=padTokens(p).find(t=>t.id===id);if(!token)return p;return{...p,typing:false,selection:{start:token.start,end:token.end,replace:true}}}
function padSnapshot(p){return{source:p.source,holes:clone(p.holes),selection:p.selection?{...p.selection}:null}}
function padPatch(p,start,end,value,insertHoles=[],cursor,structural=false){
 let inserted=value,shift=0
 // A bare TeX script takes one atom. Group it before entering multi-digit values.
 if(!structural&&end>start&&/[\^_]\s*$/.test(p.source.slice(0,start))){inserted='{'+value+'}';shift=1}
 const source=p.source.slice(0,start)+inserted+p.source.slice(end),delta=inserted.length-(end-start)
 safeLatex(source);runtime.renderFormula(source)
 const holes=p.holes.filter(h=>h.end<=start||h.start>=end).map(h=>h.start>=end?{start:h.start+delta,end:h.end+delta}:{...h})
 for(const h of insertHoles)holes.push({start:start+shift+h.start,end:start+shift+h.end})
 holes.sort((a,b)=>a.start-b.start)
 const position=cursor===undefined?start+shift+value.length:start+shift+cursor
 const changed=source!==p.source||JSON.stringify(holes)!==JSON.stringify(p.holes)
 return{...p,version:1,source,holes,typing:false,selection:{start:position,end:position,replace:false},undo:changed?p.undo.concat(padSnapshot(p)).slice(-40):p.undo}
}
function padKey(p,value){
 if(!p.selection)throw Error('点一下要修改的位置')
 const s=p.selection,encoded=encode(value.replace(/−/g,'-'));if(!encoded) return p
 const next=padPatch(p,s.start,s.end,encoded),changed=next.source!==p.source||JSON.stringify(next.holes)!==JSON.stringify(p.holes);if(p.typing&&p.typingChanged&&!s.replace)next.undo=p.undo;next.typingChanged=changed||!!(p.typing&&p.typingChanged);next.typing=true;return next
}
// Structural ranges are rebuilt from the parser. Never infer a parent from a
// placeholder's screen location or delete an unrelated empty sibling.
function emptyStructure(p,start,end){
 const plans=[],source=p.source
 const range=n=>({start:n.position.start.offset,end:n.position.end.offset})
 const body=n=>{const r=range(n);return n.type==='group'?{start:r.start+1,end:r.end-1}:r}
 const contains=r=>r.start<=start&&r.end>=end
 const empty=r=>{let text=source.slice(r.start,r.end);for(const h of p.holes.filter(h=>h.start>=r.start&&h.end<=r.end).sort((a,b)=>b.start-a.start))text=text.slice(0,h.start-r.start)+text.slice(h.end-r.start);return !text.replace(/[\s{}&]/g,'')}
 const add=(inside,outer,value='',retained=null,prefix=0)=>{if(contains(inside)&&empty(inside))plans.push({...outer,value,retained,prefix})}
 function walk(nodes){const argumentsOfMacro=new Set();for(let k=0;k<nodes.length;k++){const m=nodes[k];if(m.type!=='macro'||Object.prototype.hasOwnProperty.call(symbols,m.content))continue;let j=k+1;if(m.content==='sqrt'&&nodes[j]?.content==='['){while(j<nodes.length&&nodes[j].content!==']')j++;j++}for(;nodes[j]?.type==='group';j++)argumentsOfMacro.add(nodes[j])}for(let i=0;i<nodes.length;i++){
  const n=nodes[i];if(!n.position)continue;const at=range(n)
  if(n.type==='group'&&!argumentsOfMacro.has(n)&&empty(body(n))){let j=i+1,finish=at.end,allEmpty=true;while(nodes[j]?.type==='macro'&&['^','_'].includes(nodes[j].content)&&nodes[j+1]?.position){if(!empty(body(nodes[j+1])))allEmpty=false;finish=range(nodes[j+1]).end;j+=2}if(allEmpty)add(finish===at.end?at:body(n),{start:at.start,end:finish})}
  if(n.type==='macro'&&['^','_'].includes(n.content)&&nodes[i+1]?.position){const a=nodes[i+1];add(body(a),{start:at.start,end:range(a).end})}
  if(n.type==='macro'&&['vec','overrightarrow','overleftarrow','overleftrightarrow','overline','underline','bar','hat','widehat','boxed','mathrm','mathbf','mathit'].includes(n.content)&&nodes[i+1]?.type==='group')add(body(nodes[i+1]),{start:at.start,end:range(nodes[i+1]).end})
  if(n.type==='macro'&&['frac','dfrac','tfrac'].includes(n.content)&&nodes[i+1]?.type==='group'&&nodes[i+2]?.type==='group'){
   const args=[body(nodes[i+1]),body(nodes[i+2])],outer={start:at.start,end:range(nodes[i+2]).end}
   args.forEach((a,k)=>{const other=args[1-k],text=empty(other)?'':source.slice(other.start,other.end),wrap=!!text&&/[+\-=<>]/.test(text);add(a,outer,wrap?'('+text+')':text,text?other:null,wrap?1:0)})
  }
  if(n.type==='macro'&&n.content==='sqrt'){
   let j=i+1
   if(nodes[j]?.content==='['){const open=range(nodes[j]);let k=j+1;while(k<nodes.length&&nodes[k].content!==']')k++;if(nodes[k]?.position){const close=range(nodes[k]);add({start:open.end,end:close.start},{start:open.start,end:close.end});j=k+1}}
   if(nodes[j]?.type==='group')add(body(nodes[j]),{start:at.start,end:range(nodes[j]).end})
  }
  if(n.type==='environment'&&['cases','aligned','gathered'].includes(n.env)){
   const open=source.indexOf('}',at.start)+1,close=source.lastIndexOf('\\end{'+n.env+'}',at.end),separators=(n.content||[]).filter(c=>c.type==='macro'&&c.content==='\\'&&c.position).map(range)
   if(close>=open){const rows=[];let cursor=open;for(const sep of separators){rows.push({start:cursor,end:sep.start});cursor=sep.end}rows.push({start:cursor,end:close});rows.forEach((row,k)=>{if(rows.length>1)add(row,{start:k?separators[k-1].start:row.start,end:k?row.end:separators[0].end});else{const left=source.slice(0,at.start).match(/\\left\s*\\\{\s*$/),right=source.slice(at.end).match(/^\s*\\right\s*\./);add(row,left&&right?{start:at.start-left[0].length,end:at.end+right[0].length}:at)}})}
  }
  if(Array.isArray(n.content))walk(n.content)
 }}
 walk(runtime.parseMath(source));return plans.sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0]||null
}
function applyStructure(p,plan){const holes=plan.retained?p.holes.filter(h=>h.start>=plan.retained.start&&h.end<=plan.retained.end).map(h=>({start:h.start-plan.retained.start+plan.prefix,end:h.end-plan.retained.start+plan.prefix})):[];return padPatch(p,plan.start,plan.end,plan.value,holes,0,true)}
function padDelete(p){
 if(!p.selection)return p
 let {start,end}=p.selection
 if(start===end){const before=padTokens(p).filter(t=>t.end<=start).at(-1);if(!before)return p;end=before.end;start=/^[0-9.]{2,}$/.test(before.source)?end-1:before.start}
 const hole=p.holes.find(h=>h.start===start&&h.end===end)
 if(hole){const plan=emptyStructure(p,hole.start,hole.end);if(plan){const history=p.undo.concat(padSnapshot(p)).slice(-40);let next=applyStructure(p,plan);for(let i=0;i<32;i++){const parent=emptyStructure(next,next.selection.start,next.selection.start);if(!parent)break;next=applyStructure(next,parent)}return{...next,undo:history}}return padPatch(p,start,end,'',[],undefined,true)}
 try{const next=padPatch(p,start,end,'');if(next.source.trim())validateComplete(createSession(next.source));return next}catch(_){const next=padPatch(p,start,end,HOLE,[{start:0,end:HOLE.length}]);const h=next.holes.find(h=>h.start>=start);if(h)next.selection={start:h.start,end:h.end,replace:true};return next}
}
function padUndo(p){if(!p.undo.length)return p;return{...p,version:1,...clone(p.undo[p.undo.length-1]),typing:false,undo:p.undo.slice(0,-1)}}
function padRestore(p){const restored=padCreate(p.initialSource??p.source);return{...restored,undo:p.source===restored.source&&!p.holes.length?p.undo:p.undo.concat(padSnapshot(p)).slice(-40)}}
function padComplete(p){if(p.holes.length)throw Error('还有空位，可补全或删除多余结构');return p.source.trim()?validateComplete(createSession(p.source)):''}
function padMove(p,direction){const list=padTokens(p);if(!list.length)return p;let index=p.selection?list.findIndex(t=>t.start<=p.selection.start&&t.end>=p.selection.end):-1;if(index<0)index=direction>0?-1:list.length;index=Math.max(0,Math.min(list.length-1,index+direction));return padSelect(p,list[index].id)}
function padTemplate(p,kind){
 let s=p.selection;if(!s)throw Error('点一下要插入的位置')
 if(s.start===s.end&&['sup','sub'].includes(kind)){const previous=padTokens(p).find(t=>t.end===s.start&&!t.hole);if(previous)s={start:previous.start,end:previous.end,replace:true}}
 const original=p.source.slice(s.start,s.end),selectedHole=p.holes.some(h=>h.start===s.start&&h.end===s.end),seed=original&&!selectedHole?original:'@'
 const templates={fraction:'\\frac{'+seed+'}{@}',root:'\\sqrt{'+seed+'}',sup:'{'+seed+'}^{@}',sub:'{'+seed+'}_{@}'}
 let template=templates[kind];if(kind==='system'){
  const end=p.source.match(/\\end\{(cases|aligned|gathered)\}/);if(end){const at=end.index,value='\\\\'+HOLE;const next=padPatch(p,at,at,value,[{start:2,end:value.length}]);next.selection={...next.holes.find(h=>h.start>=at),replace:true};return next}
  template='\\begin{cases}'+seed+'\\\\@\\end{cases}'
 }
 if(!template)throw Error('暂不支持这个结构')
 const holes=[];let value='';for(const ch of template){if(ch==='@'){holes.push({start:value.length,end:value.length+HOLE.length});value+=HOLE}else value+=ch}
 // Preserve any unfinished holes nested in the selected expression.
 if(original&&!selectedHole){const at=value.indexOf(original);for(const h of p.holes.filter(h=>h.start>=s.start&&h.end<=s.end))holes.push({start:at+h.start-s.start,end:at+h.end-s.start})}
 const next=padPatch(p,s.start,s.end,value,holes);const h=next.holes.find(h=>h.start>=s.start);if(h)next.selection={start:h.start,end:h.end,replace:true};return next
}
function hitToken(rects,x,y){
 if(!Number.isFinite(x)||!Number.isFinite(y))return null
 let best=null,score=Infinity
 for(const r of rects){if(!r||r.right<=r.left||r.bottom<=r.top)continue;const dx=Math.max(r.left-x,0,x-r.right),dy=Math.max(r.top-y,0,y-r.bottom);if(dx>16||dy>18)continue;const inside=dx===0&&dy===0,cx=(r.left+r.right)/2,cy=(r.top+r.bottom)/2;const value=(inside?-10000:dx*dx+dy*dy*2)+((x-cx)**2+(y-cy)**2)*.001;if(value<score){score=value;best=r.id}}
 return best
}
module.exports={fields,createSession,replaceRange,changeField,undo,insertTemplate,validateComplete,encode,display,tokens,visual,padCreate,padTokens,padSelect,padKey,padDelete,padUndo,padRestore,padComplete,padMove,padTemplate,hitToken}

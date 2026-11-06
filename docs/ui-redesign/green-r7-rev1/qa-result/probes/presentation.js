(() => {
 const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],click=s=>{const e=$(s);if(!e)throw Error(s);e.click();};
 const rgb=s=>{const a=(s.match(/[\d.]+/g)||[]).map(Number);return [a[0]||0,a[1]||0,a[2]||0,a.length>3?a[3]:1];};
 const L=a=>a.map(v=>v/255).map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 const measure=e=>{
  const cs=getComputedStyle(e),fg=rgb(cs.color);let n=e,path=[],bg=[255,255,255],ops=[],paint=[],images=[];
  while(n){path.unshift(n);n=n.parentElement;}
  for(const el of path){const s=getComputedStyle(el),c=rgb(s.backgroundColor);bg=bg.map((b,i)=>c[i]*c[3]+b*(1-c[3]));if(Number(s.opacity)<1)ops.push({isTarget:el===e,cls:String(el.className),opacity:Number(s.opacity),background:s.backgroundColor});if(c[3])paint.push({cls:String(el.className),color:s.backgroundColor});if(s.backgroundImage!=='none')images.push({cls:String(el.className),image:s.backgroundImage});}
  const exact=images.length===0&&ops.every(x=>x.isTarget&&rgb(x.background)[3]===0),alpha=fg[3]*ops.reduce((a,x)=>a*x.opacity,1),effective=bg.map((b,i)=>fg[i]*alpha+b*(1-alpha)),a=L(effective),b=L(bg);
  return {rawForeground:cs.color,bg,effectiveForeground:effective,font:cs.fontSize,weight:cs.fontWeight,targetOpacity:cs.opacity,opacityChain:ops,backgroundChain:paint.slice(-5),images,exactTextComposition:exact,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
 };

 const box=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,w:r.width,h:r.height};};
 const setup=(id,w)=>{click('#fixtureSwitch [data-fixture="'+id+'"]');click('#pageSwitch [data-page="stats"]');click('#viewportSwitch [data-viewport="'+w+'"]');if(id==='default')click('#stateSwitch [data-state="short"]');if($('#phone').dataset.fixture!==id||$('#phone').dataset.page!=='stats')throw Error('Wrong context');};
 const out={version:__greenCandidate.version,frozenVersion:'GREEN-R1-UI-R7-20261106-rev1',url:location.href,at:new Date().toISOString(),reuse:'R6 student.js DOM scope/shape/rect checks and contrast.js measure copied unchanged; only R7 lean selectors/contexts. No computeStats/makeStats or old suite invoked.',params:{widths:['375','390'],fixtures:['default','S0','S1','S2','S50'],host:{w:innerWidth,h:innerHeight,dpr:devicePixelRatio},mode:'existing shot=1, fixed phone height, no expand=1, normal fonts'},contexts:[],groups:[],samples:[],checks:[]};
 const groupMap={};
 const check=(id,ctx,ok,expected,actual)=>out.checks.push({id,context:ctx,ok,expected,actual});
 for(const w of out.params.widths)for(const id of out.params.fixtures){
  setup(id,w);const sc=$('#screen'),p=$('#phone'),ctx=id+'/'+w;
  const read=()=>({headings:$$('.lean-stats h3').map(e=>e.innerText),sections:$$('.lean-stats > section').length,metrics:$$('.lean-metrics>div').map(e=>({value:e.querySelector('b').innerText,label:e.querySelector('span').innerText})),kp:$$('.lean-kp-cell').map(e=>({name:e.querySelector('.kc-name').innerText,count:e.querySelector('.kc-num').innerText})),rows:$$('.cause-rank-row').map(e=>({rank:e.querySelector('.cr-no').innerText,name:e.querySelector('.cr-name').innerText,count:e.querySelector('.cr-count').innerText,emphasis:e.classList.contains('is-top')})),text:sc.innerText,aria:$$('#phone [aria-label]').map(e=>e.getAttribute('aria-label')),phone:box(p),phoneClient:{w:p.clientWidth,h:p.clientHeight},screen:{...box(sc),clientW:sc.clientWidth,clientH:sc.clientHeight,scrollW:sc.scrollWidth,scrollH:sc.scrollHeight,top:sc.scrollTop},nav:box($('#tabbar')),fonts:$$('.lean-stats h3,.lean-metrics b,.lean-metrics span,.lean-kp-cell .kc-name,.cr-name,.more-causes').map(e=>({text:e.innerText,font:getComputedStyle(e).fontSize,line:getComputedStyle(e).lineHeight,transform:getComputedStyle(e).transform})),phoneTransform:getComputedStyle(p).transform,phoneZoom:getComputedStyle(p).zoom,error:window.__r3error||null});
  const c={context:ctx,collapsed:read()};
  check('three-blocks',ctx,JSON.stringify(c.collapsed.headings)===JSON.stringify(['记录概览','高频考点','具体错因'])&&c.collapsed.sections===3,'exact three headings/order',c.collapsed.headings);
  check('frame-normal',ctx,p.clientWidth===+w&&p.clientHeight===(w==='375'?667:844)&&getComputedStyle(p).transform==='none'&&getComputedStyle(p).zoom==='1','375x667/390x844 no scale',{client:[p.clientWidth,p.clientHeight],transform:getComputedStyle(p).transform,zoom:getComputedStyle(p).zoom});
  check('headings-normal',ctx,$$('.lean-stats h3').every(e=>getComputedStyle(e).fontSize==='17px'),'17px across states',c.collapsed.fonts.filter(e=>e.text==='记录概览'||e.text==='高频考点'||e.text==='具体错因'));
  check('no-directory',ctx,$$('.branch-btn,.tree-body,.stats-tip,.stats-groups').length===0,'no old tree/category/suggestion elements',$$('.branch-btn,.tree-body,.stats-tip,.stats-groups').length);
  if(id==='default'){
   const b=$('.more-causes');check('default-five',ctx,c.collapsed.rows.length===5&&b?.getAttribute('aria-expanded')==='false','five rows and closed toggle',c.collapsed.rows);
   b.click();c.expanded=read();
   check('ordered-eight',ctx,JSON.stringify(c.expanded.rows.map(r=>r.rank))===JSON.stringify(['1','2','3','4','5','6','7','8']),'1 through 8',c.expanded.rows.map(r=>r.rank));
   check('one-emphasis',ctx,c.expanded.rows.filter(r=>r.emphasis).length===1&&c.expanded.rows[0].emphasis,'only overall first',c.expanded.rows.map(r=>r.emphasis));
   check('default-display-counts',ctx,JSON.stringify(c.expanded.rows.map(r=>r.count))===JSON.stringify(['4 次','3 次','2 次','2 次','2 次','2 次','1 次','1 次']),'4/3/2/2/2/2/1/1',c.expanded.rows.map(r=>r.count));
   check('default-overview',ctx,JSON.stringify(c.expanded.metrics.map(m=>m.value))==='["12","8"]','12 saved/8 causes',c.expanded.metrics);
   $('.more-causes').click();
  }else{
   check('no-unused-toggle',ctx,!$('.more-causes'),'no more toggle with <=5 appeared causes',!!$('.more-causes'));
   const expected={S0:['0','0'],S1:['3','3'],S2:['4','4'],S50:['50','1']}[id];
   if(id!=='S50')check('fixture-overview',ctx,JSON.stringify(c.collapsed.metrics.map(m=>m.value))===JSON.stringify(expected),expected,c.collapsed.metrics);
   if(id==='S0')check('zero-no-rank',ctx,c.collapsed.kp.length===0&&c.collapsed.rows.length===1&&c.collapsed.rows[0].rank==='—'&&c.collapsed.rows[0].name==='暂无错因'&&c.collapsed.rows[0].count==='0 次','0 and short empty lists, no fake rank',c.collapsed.rows);
   if(id==='S1')check('S1-display',ctx,JSON.stringify(c.collapsed.kp.map(k=>[k.name,k.count]))===JSON.stringify([['方程','2 题'],['对数','1 题']])&&JSON.stringify(c.collapsed.rows.map(r=>r.count))==='["2 次","1 次","1 次"]','observed 2 KP / 3 causes',c.collapsed);
   if(id==='S2')check('unknown-retained',ctx,c.collapsed.rows.some(r=>r.name==='QA合成未知U'&&r.count==='1 次'),'unknown U 1 time',c.collapsed.rows);
   if(id==='S50')check('not-library-catalog',ctx,c.collapsed.rows.length>0&&c.collapsed.rows.length<50&&c.collapsed.kp.every(k=>parseInt(k.count)>0),'only occurred nodes, no 50-node catalogue',{metrics:c.collapsed.metrics,kp:c.collapsed.kp,rows:c.collapsed.rows});
  }
  const states=c.expanded?[c.collapsed,c.expanded]:[c.collapsed];
  check('deleted-statements',ctx,states.every(s=>!/(完整考点分布|错因分类树|50\\s*节点|统计口径|分母|不代表|不等于)/.test(s.text+' '+s.aria.join(' '))),'no deleted directory or disclaimer in student text/aria',states.map(s=>(s.text+' '+s.aria.join(' ')).match(/完整考点分布|错因分类树|50\\s*节点|统计口径|分母|不代表|不等于/g)||[]));
  check('no-horizontal-overflow',ctx,states.every(s=>s.screen.scrollW<=s.screen.clientW),'screen scrollWidth <= clientWidth',states.map(s=>s.screen));
  // Measure all changed lean text after disclosure when available.
  if(id==='default')$('.more-causes').click();
  for(const e of $$('.lean-stats h3,.lean-demo,.lean-metrics b,.lean-metrics span,.lean-heading>span,.lean-kp-cell .kc-name,.lean-kp-cell .kc-num,.lean-empty,.cr-no,.cr-name,.cr-count,.more-causes')){
   if(!e.getClientRects().length)continue;const m=measure(e),key=JSON.stringify(m);if(groupMap[key]===undefined){groupMap[key]=out.groups.length;out.groups.push(m);}out.samples.push({context:ctx,text:e.innerText,cls:e.className,group:groupMap[key],box:box(e)});
  }
  if(id==='default')$('.more-causes').click();
  c.targets=$$('#phone button').map(e=>({text:e.innerText,box:box(e),expanded:e.getAttribute('aria-expanded')}));
  check('changed-target-44',ctx,!$('.more-causes')||box($('.more-causes')).h>=44,'more cause target >=44 CSS px',c.targets.filter(e=>e.text.includes('其余')));
  out.contexts.push(c);
 }
 out.summary={contexts:out.contexts.length,checks:out.checks.length,failed:out.checks.filter(x=>!x.ok),styleGroups:out.groups.length,textSamples:out.samples.length,inexactGroups:out.groups.filter(g=>!g.exactTextComposition).length,under45:out.groups.filter(g=>g.exactTextComposition&&g.ratio<4.5).length,min:Math.min(...out.groups.filter(g=>g.exactTextComposition).map(g=>g.ratio))};
 window.__qaR7={presentation:out};return {summary:out.summary,brief:out.contexts.map(c=>({context:c.context,metrics:c.collapsed.metrics,kp:c.collapsed.kp,rows:c.collapsed.rows,screen:c.collapsed.screen,nav:c.collapsed.nav})),contrast:out.groups.map((g,i)=>({group:i,fg:g.rawForeground,bg:g.bg,font:g.font,ratio:g.ratio,exact:g.exactTextComposition,sample:out.samples.find(s=>s.group===i)?.text}))};
})()

(() => {
 const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],click=s=>{const e=$(s);if(!e)throw Error(s);e.click();},box=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,w:r.width,h:r.height}};
 const out={at:new Date().toISOString(),scope:'shared restoreReadingPosition changed for more-causes and scroll clamp; one F1 hint per width, no old fold suite or mathematics',contexts:[]};
 window.scrollTo(0,0);
 for(const w of ['375','390']){
  click('#fixtureSwitch [data-fixture="F1"]');click('#pageSwitch [data-page="report"]');click('#viewportSwitch [data-viewport="'+w+'"]');click('[data-action="tab"][data-tab="steps"]');
  const sc=$('#screen'),sel='[data-action="hint"][data-index="0"]',e=$(sel);sc.scrollTop+=e.getBoundingClientRect().top-sc.getBoundingClientRect().top-100;e.scrollIntoView({block:'nearest'});
  const b=box(e),x=b.right-2,y=(b.top+b.bottom)/2,hit=document.elementFromPoint(x,y),before={scrollTop:sc.scrollTop,control:b};
  if(!hit||!(e===hit||e.contains(hit)))throw Error('missed hint '+w);
  hit.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:x,clientY:y}));
  const content=$('.reveal-hint'),sb=box(sc),cb=box(content),counts=()=>({hint:$$('.reveal-hint').length,detail:$$('.reveal-detail').length,solution:$$('.solution-body').length,variant:$$('.variant-detail').length});
  const o={w,point:{x,y,hit:true},before,after:{scrollTop:sc.scrollTop,screen:sb,content:cb,counts:counts(),firstLineVisible:cb.top>=sb.top-.5&&cb.top+16<=sb.bottom+.5}};
  $(sel).click();o.closed={scrollTop:sc.scrollTop,counts:counts(),control:box($(sel))};o.ok=o.after.firstLineVisible&&o.after.counts.hint===1&&o.after.counts.detail===0&&o.after.counts.solution===0&&o.closed.counts.hint===0;
  out.contexts.push(o);
 }
 window.__qaR7.anchor=out;window.__qaR7.prepare('375');click('#fixtureSwitch [data-fixture="S0"]');return out;
})()

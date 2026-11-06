const path=require('path'),fs=require('fs'),crypto=require('crypto');
const sharp=require('C:/Users/Ethan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const {chromium}=require('C:/Users/Ethan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const dir=__dirname,out={browser:'150.0.7871.24',views:{},captures:[]};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Users/Ethan/.cache/puppeteer/chrome/win64-150.0.7871.24/chrome-win64/chrome.exe'});
 async function open(w,hq,q){const ctx=await browser.newContext({viewport:{width:w,height:hq},deviceScaleFactor:1});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('file:///'+dir.replace(/\\/g,'/')+'/index.html?'+q,{waitUntil:'load'});
  await p.evaluate(()=>{const sc=document.getElementById('screen'),p=document.getElementById('phone');p.scrollIntoView();});
  return {ctx,p,errs};}
 const rd=p=>p.evaluate(()=>{const sc=document.getElementById('screen'),ph=document.getElementById('phone'),rows=[...sc.querySelectorAll('.cause-rank-row')],tb=document.getElementById('tabbar').getBoundingClientRect();
  return {nums:rows.map(r=>r.querySelector('.cr-no').textContent),names:rows.map(r=>r.querySelector('.cr-name').textContent),counts:rows.map(r=>r.querySelector('.cr-count').textContent),widths:rows.map(r=>r.querySelector('.cr-fill').style.width),tops:rows.filter(r=>r.classList.contains('is-top')).map(r=>r.querySelector('.cr-no').textContent),expanded:sc.querySelector('[data-action="more-causes"]')?.getAttribute('aria-expanded'),label:sc.querySelector('[data-action="more-causes"]')?.textContent,scroll:[sc.clientHeight,sc.scrollHeight,sc.scrollTop],tabbarTag:tb.top+'..'+tb.bottom,tabbarInsidePhone:tb.bottom<=ph.getBoundingClientRect().bottom+.5,w:ph.getBoundingClientRect().width,font:getComputedStyle(document.querySelector('.lean-overview h3')).fontSize,cls375:ph.classList.contains('is-375')}});
 for(const v of [{k:'390',w:390,h:844},{k:'375',w:375,h:667}]){
  const {ctx,p,errs}=await open(v.w,v.h,'page=stats&fixture=default&viewport='+v.k);
  const a=await rd(p);
  await p.click('[data-action="more-causes"]');const b=await rd(p);
  await p.evaluate(()=>{const sc=document.getElementById('screen'),rs=[...sc.querySelectorAll('.cause-rank-row')],last=rs[rs.length-1];sc.scrollTop=sc.scrollHeight;});
  await p.waitForTimeout(60);
  const end=await p.evaluate(()=>{const sc=document.getElementById('screen'),rs=[...sc.querySelectorAll('.cause-rank-row')],last=rs[rs.length-1],sr=sc.getBoundingClientRect(),lr=last.getBoundingClientRect();return {lastVisible:lr.top>=sr.top-1&&lr.bottom<=sr.bottom+1,lastNo:last.querySelector('.cr-no').textContent,scrollTop:sc.scrollTop,max:sc.scrollHeight-sc.clientHeight}});
  await p.click('[data-action="more-causes"]');const c=await rd(p);
  const anchor=c.scroll[2]===Math.min(a.scroll[1]-a.scroll[0],c.scroll[1]-c.scroll[0])||(a.scroll[2]===0&&c.scroll[2]===0);
  await p.click('[data-action="more-causes"]');const d=await rd(p);
  out.views[v.k]={closed:a,opened:b,last:end,reclosed:c,reopened:d,anchor,errors:errs};
  await ctx.close();
 }
 for(const c of [{file:'r7-stats-390.png',q:'page=stats&fixture=default&viewport=390'},{file:'r7-more-390.png',q:'page=stats&fixture=default&viewport=390',expand:1},{file:'r7-report-390.png',q:'page=report&fixture=default&viewport=390'}]){
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('file:///'+dir.replace(/\\/g,'/')+'/index.html?'+c.q,{waitUntil:'load'});
  await p.addStyleTag({content:'html,body{height:auto!important;min-height:0!important;overflow:visible!important}body.r3{display:block!important;padding:0!important;margin:0!important}.gallery,.layout,.stage,.workspace{display:none!important}'});
  await p.evaluate(()=>{const ph=document.getElementById('phone'),a=document.createElement('div');a.style.cssText='position:fixed;left:0;top:0;width:390px;height:844px;overflow:hidden;background:#fbf8f1';a.appendChild(ph);document.body.appendChild(a);Object.assign(ph.style,{position:'absolute',left:'0',top:'0',margin:'0'});});
  if(c.expand)await p.click('[data-action="more-causes"]');
  await p.waitForTimeout(120);
  const dom=await p.evaluate(()=>{const ph=document.getElementById('phone'),sc=document.getElementById('screen'),tb=document.getElementById('tabbar').getBoundingClientRect(),pr=ph.getBoundingClientRect();return {phone:[pr.left,pr.top,pr.width,pr.height],screen:[sc.getBoundingClientRect().top,sc.getBoundingClientRect().bottom],tabbar:[tb.left,tb.top,tb.width,tb.height],tabText:document.getElementById('tabbar').innerText.trim(),statusText:document.querySelector('.statusbar').innerText.trim(),rows:[...sc.querySelectorAll('.cause-rank-row')].map(r=>({no:r.querySelector('.cr-no').textContent,top:r.classList.contains('is-top'),name:r.querySelector('.cr-name').textContent})),scroll:[sc.clientHeight,sc.scrollHeight,sc.scrollTop],font17:getComputedStyle(document.querySelector('.lean-overview h3')||document.querySelector('.sec-title')).fontSize,border:getComputedStyle(ph).borderRadius,phoneH:getComputedStyle(ph).height,docH:document.documentElement.scrollHeight}});
  const f=path.join(dir,'screenshots',c.file);
  await p.screenshot({path:f,clip:{x:0,y:0,width:390,height:844}});
  const meta=await sharp(f).metadata();
  const strip=await sharp(f).extract({left:0,top:788,width:390,height:56}).raw().toBuffer({resolveWithObject:true});
  const {data,info}=strip;let ink=0,rowsWithInk=new Set();for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const i=(y*info.width+x)*3;if(data[i]<200&&data[i+1]<200&&data[i+2]<200){ink++;rowsWithInk.add(y);}}
  out.captures.push({file:c.file,dom,hash:crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),bytes:fs.statSync(f).size,png:[meta.width,meta.height],navInkPixels:ink,navInkRows:rowsWithInk.size,errors:errs});
  await ctx.close();
 }
 await browser.close();
 fs.writeFileSync(path.join(dir,'_r7-verify.json'),JSON.stringify(out,null,2));
 console.log(JSON.stringify(out,null,2));
})().catch(e=>{console.error(e);process.exit(1)});


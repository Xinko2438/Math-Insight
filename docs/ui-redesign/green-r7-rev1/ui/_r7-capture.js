const path=require('path'),fs=require('fs'),crypto=require('crypto');
const sharp=require('C:/Users/Ethan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const {chromium}=require('C:/Users/Ethan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const dir=__dirname,shots=path.join(dir,'screenshots');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Users/Ethan/.cache/puppeteer/chrome/win64-150.0.7871.24/chrome-win64/chrome.exe'});
 const out={browser:browser.version(),captures:[]};
 for(const c of [
  {file:'r7-stats-390.png',q:'page=stats&fixture=default&viewport=390'},
  {file:'r7-more-390.png',q:'page=stats&fixture=default&viewport=390',mode:'expand'},
  {file:'r7-report-390.png',q:'page=report&fixture=default&viewport=390'},
 ]){
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
  const p=await ctx.newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('file:///'+dir.replace(/\\/g,'/')+'/index.html?'+c.q,{waitUntil:'load'});
  await p.addStyleTag({content:'html,body{height:auto!important;min-height:0!important;overflow:visible!important}body.r3{display:block!important;padding:0!important;margin:0!important}.gallery,.layout,.stage,.workspace{display:none!important}'});
  await p.evaluate(()=>{const ph=document.getElementById('phone');document.body.appendChild(ph);const a=document.createElement('div');a.id='r7host';a.style.cssText='position:fixed;left:0;top:0;width:390px;height:844px;overflow:hidden;background:#fbf8f1';a.appendChild(ph);document.body.appendChild(a);ph.style.position='absolute';ph.style.left='0';ph.style.top='0';ph.style.margin='0';});
  if(c.mode==='expand'){await p.click('[data-action="more-causes"]');}
  await p.waitForTimeout(120);
  const d=await p.evaluate(()=>{const ph=document.getElementById('phone'),r=ph.getBoundingClientRect(),sc=document.getElementById('screen'),sb=document.querySelector('.statusbar').getBoundingClientRect(),tb=document.getElementById('tabbar').getBoundingClientRect(),ab=document.querySelector('.appbar').getBoundingClientRect();return {rect:[r.left,r.top,r.width,r.height],statusbar:[sb.top,sb.bottom],appbar:[ab.top,ab.bottom],screen:[sc.getBoundingClientRect().top,sc.getBoundingClientRect().bottom],tabbar:[tb.top,tb.bottom,tb.width,tb.height],scroll:[sc.clientHeight,sc.scrollHeight,sc.scrollTop],fontTitle:getComputedStyle(document.querySelector('.lean-overview h3')||document.querySelector('.sec-title')).fontSize,rows:[...sc.querySelectorAll('.cause-rank-row')].map(x=>({no:x.querySelector('.cr-no').textContent,top:x.classList.contains('is-top'),name:x.querySelector('.cr-name').textContent,count:x.querySelector('.cr-count').textContent,width:x.querySelector('.cr-fill').style.width})),page:ph.dataset.page,tabText:document.getElementById('tabbar').innerText.trim(),statusText:document.querySelector('.statusbar').innerText.trim(),docScroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],phoneBorder:getComputedStyle(ph).borderRadius,cssHeight:getComputedStyle(ph).height}});
  const f=path.join(shots,c.file);
  await p.screenshot({path:f,clip:{x:0,y:0,width:390,height:844}});
  const png=await sharp(f).png().toBuffer({resolveWithObject:true});
  const navStrip=await sharp(f).extract({left:2,top:779,width:386,height:63}).raw().toBuffer({resolveWithObject:true});
  let colors=new Set();for(let i=0;i<navStrip.data.length;i+=3){colors.add(navStrip.data[i]+','+navStrip.data[i+1]+','+navStrip.data[i+2]);}
  const mid=await sharp(f).extract({left:2,top:775,width:386,height:2}).raw().toBuffer();
  const lastRow=await sharp(f).extract({left:2,top:835,width:386,height:8}).raw().toBuffer();
  let ink=0;for(let i=0;i<lastRow.length;i+=3){if(lastRow[i]<180&&lastRow[i+1]<180)ink++;}
  out.captures.push({file:c.file,clip:[0,0,390,844],dom:d,hash:sha(f),bytes:fs.statSync(f).size,png:{w:png.info.width,h:png.info.height},navColors:colors.size,navStripSamples:[...colors].slice(0,12),navBorder:[...mid.slice(0,12)],bottomInk:ink,pageErrors:errs});
  await ctx.close();
 }
 await browser.close();
 fs.writeFileSync(path.join(dir,'_r7-capture.json'),JSON.stringify(out,null,2));
 console.log(JSON.stringify(out,null,2));
})().catch(e=>{console.error(e);process.exit(1)});


// Bundle existing native screenshots into a portable, offline review gallery.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs/ui-implementation/gallery.html');
const runtime = path.join(root, '_work/native-automation');
const manifestPath = path.join(runtime, 'gallery-server.json');
const owner = 'math-app-screenshot-gallery';
const labels = {
  'input-empty': '录入空态', 'input-long-bottom': '长题滚动',
  'input-analysis-state': '分析中', 'history-no-results': '搜索无结果',
  'report-hint': '展开提示', 'report-diagnosis': '错因分析',
  'report-variant-answer': '变式答案', 'stats-cause-tree': '错因分类',
  'home-empty': '首页空态', 'history-empty': '错题本空态',
  'stats-empty': '统计空态',
  'report-full-solution-linebreak-control': '完整解答换行检查',
  'report-full-solution': '完整解答换行检查'
};

function build() {
  const report = JSON.parse(fs.readFileSync(path.join(root, 'docs/ui-implementation/background-verification.json'), 'utf8'));
  const openVisualIssue = !!(report.pixelReview && report.pixelReview.knownFailures && report.pixelReview.knownFailures.length) || /MULTILINE_RENDERING_OPEN/.test(report.status);
  const styleConfirmed = fs.readFileSync(path.join(root, 'docs/ui-redesign/direction-approved.md'), 'utf8').includes('<!-- native-ui-style: calibration-a-confirmed -->');
  const main = [['home', '首页'], ['input', '录入错题'], ['result', '诊断报告'], ['history', '错题本'], ['stats', '错题统计']];
  function item(file, title, expected, state = '') {
    const absolute = path.resolve(root, file);
    if (!absolute.startsWith(root + path.sep) || !absolute.endsWith('.png')) throw Error('Only this project\'s PNG evidence is allowed');
    const bytes = fs.readFileSync(absolute);
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    if (expected && sha256 !== expected) throw Error('Screenshot evidence changed: ' + title);
    const issue = state === 'input-long-bottom' || state === 'report-full-solution-linebreak-control' || state === 'report-full-solution';
    return { title, state, sha256, image: 'data:image/png;base64,' + bytes.toString('base64'),
      note: issue ? report.textRendering && report.textRendering.status === 'PASS' ? '本轮已复核：中文与换行正常显示；原始文字完整。' : openVisualIssue ? '未通过：换行附近显示方框，原始文字数据完整，原因尚未定位。' : '需要人工复核此场景的换行显示。' : state === 'input-analysis-state' ? '这是隔离的界面模拟状态，未发起真实分析。' : '' };
  }
  const pages = main.map(([key, title]) => {
    const file = path.join(root, 'docs/ui-implementation/native-' + key + '.png');
    const evidence = (report.screenshots || []).find(s => path.resolve(s.file) === file);
    return item(file, title, evidence && evidence.sha256);
  });
  const states = (report.stateScreenshots || []).map(s => item(s.file, labels[s.state] || s.state, s.sha256, s.state));
  if (report.additionalStateCapture) {
    const s = report.additionalStateCapture;
    states.push(item(s.file, labels[s.state] || '补充检查', s.sha256, s.state));
  }
  const groups = [{ title: '五页界面', images: pages }];
  if (states.length) groups.push({ title: '补充检查', images: states });
  const nativeUnified = !!(report.layouts && report.layouts['pages/stats/stats'] && report.layouts['pages/stats/stats'].zeroStats);
  if (nativeUnified) {
    const empty = states.find(state => state.state === 'stats-empty');
    groups.unshift({ title: '本次修复 · 零记录与有记录（原生）', images: [
      ...(empty ? [{ ...empty, title: '学情 · 零记录', note: '真实 Skyline 截图：所有考点和错因分类保留，数量为 0。' }] : []),
      { ...pages[4], title: '学情 · 有记录', note: '真实 Skyline 截图：隔离示例记录；与零记录共用相同的分类和布局。' },
      { ...pages[0], title: '学习图标 · 选中', note: '真实 Skyline 截图：连续轮廓图标，选中状态。' }
    ] });
  }
  const projectionFile = path.join(root, 'docs/ui-implementation/zero-data-preview.json');
  let projection = null;
  if (fs.existsSync(projectionFile)) {
    const candidate = JSON.parse(fs.readFileSync(projectionFile, 'utf8'));
    const current = candidate.status === 'PASS' && candidate.nativeRenderingVerified === false && candidate.sourceHashes.every(source => {
      const file = path.resolve(root, source.file);
      return file.startsWith(root + path.sep) && crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') === source.sha256;
    });
    if (current) {
      projection = candidate;
      const previewGroup = { title: '辅助 HTML 布局预览', images: projection.images.map(source => ({ ...item(source.file, source.title, source.sha256), note: source.note })) };
      if (nativeUnified) groups.push(previewGroup);
      else {
        groups.forEach(group => { group.title = '上轮原生截图 · ' + group.title + '（零数据调整前）'; });
        groups.unshift(previewGroup);
      }
    }
  }
  const ocrFile = path.join(root, '_work/native-automation/ocr-native.json');
  let ocr = null;
  if (fs.existsSync(ocrFile)) {
    const candidate = JSON.parse(fs.readFileSync(ocrFile, 'utf8'));
    if (candidate.status === 'PASS' && candidate.sourceHashes.every(source => {
      const file = path.resolve(root, source.file);
      return file.startsWith(root + path.sep) && crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') === source.sha256;
    })) {
      ocr = candidate;
      groups.forEach(group => { group.title = '此前界面 · ' + group.title; });
      groups.unshift({ title: '本次照片分流 · 原生界面／模拟返回', images: ocr.screenshots.map(source => ({ ...item(source.file, source.title, source.sha256), note: source.note })) });
    }
  }
  const syntheticFile = path.join(root, '_work/native-automation/ocr-synthetic-fixture.json');
  let syntheticResult = null;
  if (fs.existsSync(syntheticFile)) {
    const fixture = JSON.parse(fs.readFileSync(syntheticFile, 'utf8'));
    const resultFile = path.join(root, '_work/native-automation/ocr-synthetic-result.json');
    if (fs.existsSync(resultFile)) {
      const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
      if (result.status === 'PASS' && result.fixtureSha256 === fixture.jpegSha256 && result.localEndpointRequests === 1 && result.response && result.response.data && typeof result.response.data.question === 'string' && typeof result.response.data.wrongAnswer === 'string') syntheticResult = result;
    }
    const group = { title: syntheticResult ? '实际识别通过 · 合成图（仅1次）' : '合成测试图 · 实际识别测试样例', images: [{
      ...item(path.join('_work/native-automation', fixture.preview), fixture.title, fixture.previewSha256),
      note: syntheticResult ? '实际识别通过，仅调用1次。\n题目：' + syntheticResult.response.data.question + '\n学生作答：\n' + syntheticResult.response.data.wrongAnswer + '\n错误步骤与答案原样保留；仅此合成图，不代表真实手写质量验收。' : '程序生成的题目与错误作答，不含个人信息。用于区分题干／作答及验证错误步骤原样保留；不代表真实手写识别准确率。'
    }] };
    if (syntheticResult) groups.unshift(group); else groups.push(group);
  }
  let textFixed = false;
  const fixedFile = path.join(root, '_work/native-automation/multiline-fixed.json');
  if (fs.existsSync(fixedFile)) {
    const fixed = JSON.parse(fs.readFileSync(fixedFile, 'utf8'));
    if (fixed.status === 'PASS' && fixed.sourceHashes && fixed.sourceHashes.every(source => {
      const file = path.resolve(root, source.file);
      return file.startsWith(root + path.sep) && crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') === source.sha256;
    })) {
      textFixed = true;
      const current = fixed.screenshots.map(shot => ({ ...item(shot.file, shot.kind === 'input' ? '修复后 · 录入页中文与三行文字' : '修复后 · 报告页中文与三行文字', shot.sha256), note: '真实微信模拟器截图（WebView）。原始文字及两个 LF 完整保留，实际显示为三行；没有调用模型。' }));
      const before = JSON.parse(fs.readFileSync(path.join(root, '_work/native-automation/multiline-baseline.json'), 'utf8'));
      const previous = before.screenshots.map(shot => ({ ...item(shot.file, shot.kind === 'input' ? '修复前 · Skyline 录入页' : '修复前 · Skyline 报告页', shot.sha256), note: '修复前对照：同一三行文字被画为一行，换行出现方框。' }));
      groups.unshift({ title: '中文与换行修复 · 前后对照', images: current.concat(previous) });
    }
  }
  const analysisFile = path.join(root, '_work/native-automation/analysis-repair-native.json');
  let analysis = null;
  if (fs.existsSync(analysisFile)) {
    const candidate = JSON.parse(fs.readFileSync(analysisFile, 'utf8'));
    if (candidate.status === 'PASS' && candidate.fixtureRestored && candidate.sourceHashes.every(source => {
      const file = path.resolve(root, source.file);
      return file.startsWith(root + path.sep) && crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') === source.sha256;
    })) {
      analysis = candidate;
      groups.unshift({ title: '解析异常修复 · 模拟结果', images: [
        { ...item(candidate.screenshot.file, '微信模拟器 · 成功进入报告', candidate.screenshot.sha256), note: '真实微信模拟器界面，分析接口返回为隔离模拟；未调用模型，真实服务端和手机仍需单独验证。' },
        ...(candidate.fallbackScreenshot ? [{ ...item(candidate.fallbackScreenshot.file, '微信模拟器 · 基础参考', candidate.fallbackScreenshot.sha256), note: '模拟 AI 不可用：明确说明无法判断作答对错，不编造错因。' }] : [])
      ] });
    }
  }
  const draftEvidence = path.join(runtime, 'draft-ui.json');
  let currentInteraction = false;
  if (fs.existsSync(draftEvidence)) {
    const candidate = JSON.parse(fs.readFileSync(draftEvidence, 'utf8'));
    const current = candidate.status === 'PASS' && candidate.fixtureCleanup && candidate.fixtureCleanup.restored && candidate.sourceHashes.every(source => {
      const file = path.resolve(root, '微信小程序', source.file);
      return file.startsWith(path.join(root, '微信小程序') + path.sep) && fs.existsSync(file) && crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') === source.sha256;
    });
    if (current) { currentInteraction = true; groups.unshift({ title:'本次交互与轻动效 · 原生模拟器', images:candidate.screenshots.map(source => ({...item(source.file, source.title, source.sha256),note:'隔离示例数据；静态截图不代表动效手感。未调用真实模型，输入页截图顶部边缘有蓝色残影，真机显示和用户视觉接受另验。'})) }); }
  }
  let currentMath=false;
  for(const spec of [
    ['math-touch.json','本次重做 · 公式点选与数学键盘','公式上只保留选中高亮；实际原生按键流程＋44个坐标检查，原生测试数据已恢复。手机手指操作与流畅度仍需复测。'],
    ['math-direct.json','直接点公式修改 · 原生组件','新版交互：只在点中的数字或符号处输入，不展示字段列表。手工样例与隔离原生点击；手机输入法、触控手感另验。'],
    ['math-corpus.json','公式覆盖 · 原生组件','手工样例，未使用真实识别或远程公式服务；长公式支持块内横向查看。'],
    ['math-fraction.json','分子与分母编辑 · 原生组件','手工新建分数，分子和分母分别修改；手机键盘与动效手感仍需真机验收。'],
    ['math-native.json','本次数学排版与编辑 · 原生模拟','手工转录与模拟响应；包含只把题目中的7改为9、保留原作答的演示。未调用真实模型；顶部残影和真机显示另验。']
  ]){
    const file=path.join(runtime,spec[0]);if(!fs.existsSync(file))continue;
    const evidence=JSON.parse(fs.readFileSync(file,'utf8'));
    const okay=(evidence.status==='PASS'||String(evidence.status).startsWith('NATIVE_MATH_FLOW_PASS'))&&(!evidence.fixtureCleanup||evidence.fixtureCleanup.restored)&&Array.isArray(evidence.sourceHashes)&&evidence.sourceHashes.every(s=>{const f=path.resolve(root,'微信小程序',s.file);return f.startsWith(path.join(root,'微信小程序')+path.sep)&&fs.existsSync(f)&&crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')===s.sha256});
    if(okay){currentMath=true;groups.unshift({title:spec[1],images:evidence.screenshots.map(s=>({...item(s.file,s.title,s.sha256),note:spec[2]}))});}
    else if(Array.isArray(evidence.screenshots)){
      const preserved=evidence.screenshots.filter(s=>fs.existsSync(s.file)&&crypto.createHash('sha256').update(fs.readFileSync(s.file)).digest('hex')===s.sha256);
      if(preserved.length)groups.push({title:'历史证据 · '+spec[1],images:preserved.map(s=>({...item(s.file,s.title,s.sha256),note:'此前版本截图，源码已变更，不代表最新版验收。'+spec[2]}))});
    }
  }
  const keyboardFile=path.join(runtime,'math-keyboard.json');
  if(fs.existsSync(keyboardFile)){
    const evidence=JSON.parse(fs.readFileSync(keyboardFile,'utf8'));
    if(evidence.status==='PASS'){
      const images=[];
      const before=path.join(runtime,'math-keyboard-before.png');
      if(fs.existsSync(before))images.push({...item(before,'修复前 · 标题进入胶囊区域'),note:'旧代码，400px键盘高度事件模拟；图中没有操作系统键盘，底部显示的是被遮罩的背景。'});
      images.push(...evidence.screenshots.map(s=>({...item(s.file,s.title,s.sha256),note:'修复后，400px键盘高度事件模拟；未弹出实体手机键盘，真实输入框绘制与动效手感待手机复测。'})));
      groups.push({title:'此前修复 · 编辑弹层与键盘（模拟高度）',images});
    }
  }
  let deleteProof=false;
  const proofFile=path.join(runtime,'math-delete-proof.json');
  if(fs.existsSync(proofFile)){
    const evidence=JSON.parse(fs.readFileSync(proofFile,'utf8'));
    if(evidence.status==='PASS'&&evidence.sourceHashes.every(s=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'微信小程序',s.file))).digest('hex')===s.sha256)){
      deleteProof=true;groups.unshift({title:'本次删除修复 · 浏览器排版对照',images:evidence.screenshots.map(s=>({...item(s.file,s.title,s.sha256),note:'当前编辑代码与本机KaTeX字体在独立浏览器运行：删除后y保持基线，第二行不变，撤销可恢复。不是微信模拟器或手机验收。'}))});
    }
  }
  const directGroup=groups.findIndex(g=>g.title==='本次重做 · 公式点选与数学键盘');
  if(directGroup>0&&!deleteProof)groups.unshift(groups.splice(directGroup,1)[0]);
  fs.writeFileSync(output, renderGallery(groups, { openVisualIssue,
    title: deleteProof ? '错因智诊 · 删除前后排版复验' : currentMath ? '错因智诊 · 可编辑的数学排版' : currentInteraction ? '错因智诊 · 交互与轻动效' : analysis ? '错因智诊 · 解析异常修复检查' : textFixed ? '错因智诊 · 中文与换行显示已修复' : syntheticResult ? '错因智诊 · 单次照片识别实测' : ocr ? '错因智诊 · 照片识别分流检查' : nativeUnified ? '错因智诊 · 统计与图标修复' : projection ? '错因智诊 · 零数据页面调整' : report.appliedVisualDirection ? '错因智诊 · ' + report.appliedVisualDirection + ' 版原生截图' : undefined,
    subtitle: deleteProof ? '本次是浏览器排版复验 · 当前编辑代码与本机字体 · 未调用模型 · 微信与手机另验' : currentMath ? '独立原生模拟器 · 手工样例与模拟响应 · 未调用真实模型 · 真机另验' : currentInteraction ? '独立微信模拟器 · 静态截图 · 实际动效手感与手机显示另验' : analysis ? '微信模拟器 · 分析返回为隔离模拟 · 服务重载和真实诊断另验' : textFixed ? '真实微信模拟器 · 原始文字完整 · 五页流程通过 · 物理手机与最终接受另验' : syntheticResult ? '合成图1次实测通过 · 原生界面的模拟返回另列 · 换行显示问题未解决' : ocr ? '真实原生界面 · OCR 返回为隔离模拟 · 换行显示问题未解决' : nativeUnified ? '真实微信模拟器截图 · 零记录与有记录同版式 · 手机复核待完成' : projection ? '本次为 HTML 布局预览 · 可切换查看上轮原生截图 · 本次真机显示待验' : '隔离示例数据 · ' + (styleConfirmed ? 'UI 风格已确认' : '新版待确认') + ' · ' + (openVisualIssue ? '换行显示问题待修复' : '画面待复核') }));
  return { output, images: groups.reduce((sum, group) => sum + group.images.length, 0), pages: pages.length, states: states.length };
}

function renderGallery(groups, options = {}) {
  const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const title = escape(options.title || '错因智诊 · 截图图集');
  const subtitle = escape(options.subtitle || ('隔离示例数据 · 新版待确认 · ' + (options.openVisualIssue ? '换行显示问题待修复' : '画面待复核')));
  const data = JSON.stringify(groups).replace(/</g, '\\u003c');
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#182237;font:15px/1.5 system-ui,"Microsoft YaHei",sans-serif}
.app{height:100dvh;max-width:1500px;margin:auto;padding:20px;display:flex;flex-direction:column;gap:12px}
header{display:flex;justify-content:space-between;align-items:center;gap:16px}h1{font-size:20px;font-weight:600;margin:0}header p{color:#647086;font-size:13px;margin:4px 0 0}
button,select{font:inherit;color:inherit;background:#fff;border:1px solid #d6deeb;border-radius:7px;min-height:44px;padding:8px 16px}button{cursor:pointer}button:hover:not(:disabled){background:#edf2fd}button:disabled{opacity:.45;cursor:default}button:focus-visible,select:focus-visible{outline:3px solid #3266ed;outline-offset:2px}
.tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.group{margin-right:auto}.counter{min-width:64px;text-align:center;color:#647086;font-variant-numeric:tabular-nums}.title{font-weight:600}.note{font-size:13px;color:#647086;min-height:20px;white-space:pre-line}.note.issue{color:#9d392c}
.stage{flex:1;min-height:0;overflow:auto;display:flex;justify-content:center;align-items:center;background:#e9edf4;border:1px solid #dce3ed;border-radius:8px;padding:8px}.stage img{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain}.stage.actual{display:block}.stage.actual img{max-width:none;max-height:none;margin:auto}
.thumbs{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 6px;flex-shrink:0}.thumb{display:flex;align-items:center;gap:10px;text-align:left;min-width:130px;flex-shrink:0;font-size:13px;padding:6px 10px}.thumb img{height:52px;width:26px;object-fit:contain}.thumb[aria-current="true"]{border-color:#3266ed;color:#2455d6;background:#eef3ff}.thumb small{display:block;color:#647086}
@media(max-width:600px){.app{padding:12px;gap:8px}h1{font-size:18px}header p{font-size:12px}.tools{gap:6px}.group{width:100%;margin:0}.group select{width:100%}button{padding:8px 12px}.stage{padding:4px}.thumb{min-width:112px}.counter{min-width:42px}header{align-items:flex-start}.note{line-height:1.4}}
</style></head><body><main class="app">
<header><div><h1>${title}</h1><p>${subtitle}</p></div><button id="zoom" aria-pressed="false">原始大小</button></header>
<nav class="tools" aria-label="截图切换"><label class="group"><select id="group" aria-label="截图分组"></select></label><button id="prev">上一张</button><span id="counter" class="counter" aria-live="polite"></span><button id="next">下一张</button><span id="title" class="title"></span></nav>
<div id="note" class="note" role="status"></div>
<div id="stage" class="stage"><img id="photo" alt=""></div>
<nav id="thumbs" class="thumbs" aria-label="选择截图"></nav>
</main><script>
const groups=${data};let groupIndex=0,index=0,actual=false;
const $=id=>document.getElementById(id),list=()=>groups[groupIndex].images;
groups.forEach((g,i)=>{const o=document.createElement('option');o.value=i;o.textContent=g.title+'（'+g.images.length+'）';$('group').append(o)});
function drawThumbs(){ $('thumbs').replaceChildren();list().forEach((s,i)=>{const b=document.createElement('button');b.className='thumb';b.dataset.index=i;b.setAttribute('aria-label','查看'+s.title);const image=document.createElement('img');image.src=s.image;image.alt='';const text=document.createElement('span');text.textContent=s.title;const number=document.createElement('small');number.textContent=(i+1)+' / '+list().length;text.append(number);b.append(image,text);b.onclick=()=>show(i);$('thumbs').append(b)}) }
function show(i){index=Math.max(0,Math.min(i,list().length-1));const s=list()[index];$('photo').src=s.image;$('photo').alt=s.title;$('title').textContent=s.title;$('counter').textContent=(index+1)+' / '+list().length;$('prev').disabled=index===0;$('next').disabled=index===list().length-1;$('note').textContent=s.note||'点击上一张、下一张或下方缩略图；也可以使用键盘左右键。';$('note').classList.toggle('issue',!!s.note&&s.note.startsWith('未通过'));document.querySelectorAll('.thumb').forEach((b,n)=>b.setAttribute('aria-current',String(n===index)));$('stage').scrollTo(0,0)}
$('prev').onclick=()=>show(index-1);$('next').onclick=()=>show(index+1);$('group').onchange=()=>{groupIndex=Number($('group').value);drawThumbs();show(0)};
$('zoom').onclick=()=>{actual=!actual;$('stage').classList.toggle('actual',actual);$('zoom').textContent=actual?'适应窗口':'原始大小';$('zoom').setAttribute('aria-pressed',String(actual))};
document.addEventListener('keydown',e=>{if(e.target.tagName==='SELECT')return;if(e.key==='ArrowRight'){e.preventDefault();show(index+1)}if(e.key==='ArrowLeft'){e.preventDefault();show(index-1)}});drawThumbs();show(0);
</script></body></html>`;
  return html;
}

async function serve() {
  if (fs.existsSync(manifestPath)) {
    const old = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (old.owner === owner && old.sourceProject === root) {
      const alive = await new Promise(resolve => {
        const request = http.get(old.url + 'health', response => {
          let data = ''; response.on('data', chunk => data += chunk); response.on('end', () => {
            try { const state = JSON.parse(data); resolve(state.owner === owner && state.pid === old.pid && state.sourceProject === root); } catch { resolve(false); }
          });
        });
        request.on('error', () => resolve(false)); request.setTimeout(1000, () => { request.destroy(); resolve(false); });
      });
      if (alive) { console.log(JSON.stringify({ reused: true, url: old.url })); return; }
    }
  }
  const server = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.url === '/health') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ owner, pid: process.pid, sourceProject: root })); return; }
    if (request.url !== '/' && request.url !== '/gallery.html') { response.writeHead(404); response.end('Not found'); return; }
    response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(fs.readFileSync(output));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  fs.mkdirSync(runtime, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify({ owner, pid: process.pid, sourceProject: root, url, entry: output }, null, 2));
  console.log(JSON.stringify({ serving: true, url }));
}

module.exports = { build, renderGallery };
if (require.main === module) {
  console.log(JSON.stringify(build()));
  if (process.argv.includes('--serve')) serve().catch(error => { console.error(error.message); process.exitCode = 1; });
}

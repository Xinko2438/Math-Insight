/* R3 offline frozen-fixture catalogue: synthetic only, no network, no model. */
const FROZEN_FIXTURE_SOURCE = {
  file: 'math-r2/fixtures.json',
  sha256: '36b1d9b0a5c202487c9e03ca00347e807bc80198be1cca844eaf983def48b43b',
  mapSha256: '57e92e8f67a7232ac9f158ef95b4e0ff946648cdcaffdf434bb9d9bbe080a47b',
  version: 'GREEN-R1-MATH-R2',
  qaMatrix: 'acceptance-matrix.md §2 (read-only, not copied)'
};
/* Nested saved-record shape: record.result is the only counted location. */
const R3_RECORDS = {
  S0: [],
  S1: [
    {id:'r1',source:'ai',result:{knowledgePoint:'方程',causeNodes:[
      {id:'Q1',name:'QA合成A',kp:'方程',category:'计算性错误'},
      {id:'Q2',name:'QA合成B',kp:'方程',category:'计算性错误'}]}},
    {id:'r2',source:'ai',result:{knowledgePoint:'方程',causeNodes:[
      {id:'Q1',name:'QA合成A',kp:'方程',category:'计算性错误'}]}},
    {id:'r3',source:'ai',result:{knowledgePoint:'对数',causeNodes:[
      {id:'Q3',name:'QA合成C',kp:'对数',category:'知识性错误'}]}}
  ],
  S2: [
    {id:'r1',source:'ai',result:{knowledgePoint:'方程',causeNodes:[
      {id:'Q1',name:'QA合成A',kp:'方程',category:'计算性错误'},
      {id:'Q2',name:'QA合成B',kp:'方程',category:'计算性错误'}]}},
    {id:'r2',source:'ai',result:{knowledgePoint:'方程',causeNodes:[
      {id:'Q1',name:'QA合成A',kp:'方程',category:'计算性错误'}]}},
    {id:'r3',source:'ai',result:{knowledgePoint:'对数',causeNodes:[
      {id:'Q3',name:'QA合成C',kp:'对数',category:'知识性错误'}]}},
    {id:'r4',source:'ai',result:{knowledgePoint:'',causeNodes:[
      {id:'',name:'QA合成未知U',kp:'',category:''}]}}
  ]
};
const R3_LIBRARIES = {
  S1: {kpOrder:['方程','对数'],categories:['计算性错误','知识性错误'],nodes:[
    {id:'Q1',name:'QA合成A',kp:'方程',category:'计算性错误'},
    {id:'Q2',name:'QA合成B',kp:'方程',category:'计算性错误'},
    {id:'Q3',name:'QA合成C',kp:'对数',category:'知识性错误'}]},
  S2: {kpOrder:['方程','对数'],categories:['计算性错误','知识性错误'],nodes:[
    {id:'Q1',name:'QA合成A',kp:'方程',category:'计算性错误'},
    {id:'Q2',name:'QA合成B',kp:'方程',category:'计算性错误'},
    {id:'Q3',name:'QA合成C',kp:'对数',category:'知识性错误'}]}
};
const R3_SHAPE = {
  asSaved:[{id:'task-a',source:'ai',result:{knowledgePoint:'方程',causeNodes:[
    {id:'Q1',name:'QA合成A',kp:'方程',category:'计算性错误'}]}}],
  wrongShape:[{id:'task-b',knowledgePoint:'方程',causeNodes:[
    {id:'Q1',name:'QA合成A',kp:'方程',category:'计算性错误'}]}]
};
const R3_STEPS = {
  steps0: [],
  steps1: [{question:'能否先去括号？',hint:'',detail:''}],
  steps4: [
    {question:'展开左边。',hint:'乘法分配律。',detail:'2x−6'},
    {question:'把 x 项移到同侧。',hint:'两边同减 x。',detail:'x−6=4'},
    {question:'移常数项。',hint:'两边同加 6。',detail:'x=10'},
    {question:'代回检验。',hint:'',detail:'2(10−3)=14=10+4'}
  ]
};
const FIXTURE_REPORT = {
  F1: {
    id:'F1', title:'F1 移项错误', kp:'方程', sourceLabel:'演示内容 · 合成题',
    questionHTML:'解方程：<span class="math">2(x − 3) = x + 4</span>。',
    answerLines:['2x − x = 4 − 6','x = −2。'],
    summaryTitle:'移项时符号处理有误',
    summaryCategory:'待查看完整分析',
    summaryText:'两行原作答已按原文保留。先核对移项后的符号，再独立重算；摘要不代替你的作答，也不公布正确结果。',
    diagnosis:'这是演示内容，暂无可展示错因。别急着合并真数：先检查移项后的符号，再对照原题独立验算。',
    causes:[],source:'ai',confidence:null,
    steps:[
      {question:'去掉括号后，左边应写成什么？',hint:'乘法分配律：括号里的每一项都要乘 2。',detail:'左边去掉括号为 2x−6，这一步先不公布最终答案。'},
      {question:'把含 x 的项和常数项分开时，每一项移动后符号怎样变化？',hint:'移项是两边同时加减同一个数；移过去的一项要变号。',detail:'把左边的 −6 移到右边，应写成 +6；这里不替你补完整个答案。'}
    ],
    solutionHTML:'<p><strong>展开：</strong>2(x−3)=2x−6，所以 2x−6=x+4。</p><p><strong>移项：</strong>两边同减 x、同加 6，得 x=10。</p><p><strong>检验：</strong>左边 2(10−3)=14，右边 10+4=14，14=14。</p>',
    solutionNote:'完整解答默认折叠；本离线样例不判你对错，也不计算错因。',
    variants:[],footer:'演示内容 · 原题和作答按指定样例保留；暂无可展示错因。'
  },
  F2: {
    id:'F2', title:'F2 对数条件', kp:'对数', sourceLabel:'演示内容 · 合成题',
    questionHTML:'求 <span class="math">log<sub>2</sub>(x−1) + log<sub>2</sub>(x+1) = 3</span> 的实数解。',
    answerLines:['x²−1=8，x=±3。'],
    summaryTitle:'先检查两个真数的定义域',
    summaryCategory:'待查看完整分析',
    summaryText:'你的 ±3 已按原样保留。先写出两个真数都要大于 0 的条件，再看候选解；摘要不直接给最终解。',
    diagnosis:'这是演示内容，暂无可展示错因；不给出参考分数，也不把你的作答改成别的结果。请先检查两个真数的条件。',
    causes:[],source:'ai',confidence:null,
    steps:[
      {question:'两个对数分别要求括号里的式子是正还是负？',hint:'对数的真数必须大于 0。',detail:'x−1>0 且 x+1>0；两个条件要同时满足。'},
      {question:'合并同底对数后，为什么还不能只写二次方程的两个根？',hint:'求出的根要代回原式的定义域检查。',detail:'先保留两个候选，再把每个候选代回真数条件；这里不直接给出最终哪一个有效。'}
    ],
    solutionHTML:'<p><strong>定义域：</strong>x−1>0、x+1>0，得 x&gt;1。</p><p><strong>合并：</strong>log₂[(x−1)(x+1)]=3，所以 x²−1=8，x=±3。</p><p><strong>筛选：</strong>x=−3 不满足 x&gt;1，舍去；x=3 代回得 log₂2+log₂4=1+2=3。</p><p class="solution-final">原方程的解为 x=3。</p>',
    solutionNote:'完整解答默认折叠；本离线样例不作出模型诊断。',
    variants:[],footer:'演示内容 · ±3 保留在“我的作答”；暂无可展示错因。'
  },
  F5: {
    id:'F5', title:'F5 信息不足', kp:'几何', sourceLabel:'缺少图形信息',
    questionHTML:'如图，求∠A。',
    answerLines:[],
    emptyAnswer:'未提供作答',
    summaryTitle:'缺少图形与条件，暂不能求角',
    summaryCategory:'信息不足',
    summaryText:'这道题引用了图形，但当前输入没有图，也没有作答。不能凭空补出角度、错因或解答。',
    diagnosis:'信息不足：没有可用的图形、已知角或边长条件。空作答本身不是“作答错误”。',
    causes:[],source:'ai',confidence:null,steps:[],solutionHTML:'',solutionNote:'',variants:[],
    footer:'演示内容 · 缺少图形信息，也没有作答；不给角度。'
  },
  F6: {
    id:'F6', title:'F6 基础参考', kp:'对数', sourceLabel:'基础复习参考',
    questionHTML:'求 <span class="math">log<sub>2</sub>(x−1)</span> 中 x 的取值范围。',
    answerLines:['x≥1。'],
    summaryTitle:'基础复习提示，不能判断对错',
    summaryCategory:'规则引擎',
    summaryText:'基础复习提示：对数真数应大于零。这条参考不能判断你的作答对错，也不能作为已保存的诊断结论。',
    diagnosis:'基础复习提示：对数真数应大于零。这里不提供完整解答、变式、参考分数或错因，也不替你判断 x≥1 是否正确。',
    causes:[],source:'rule',confidence:null,steps:[{question:'对数的真数应满足什么条件？',hint:'回顾对数定义中真数的范围。',detail:''}],
    solutionHTML:'',solutionNote:'基础复习提示不含完整解答与变式。',variants:[],
    footer:'演示内容 · 基础复习提示；不自动判分，不进入学情统计。'
  }
};

const F7_REPORT = {
  id:'F7', title:'F7 变式与边界', kp:'方程', sourceLabel:'演示内容 · 合成题',
  questionHTML:'解方程：<span class="math">2(x − 3) = x + 4</span>。',
  answerLines:['x = −2'],
  summaryTitle:'读完三步变式后独立练习',
  summaryCategory:'变式练习',
  summaryText:'三个变式保留各自难度标签；答案默认折叠。步骤数量按冻结输入显示为 0、1 或 4 步，不硬凑固定三步。',
  diagnosis:'本样例只有合成变式与布局边界；不把练习数量当作掌握度，也不生成自动评分。',
  causes:[],source:'ai',confidence:null,steps:[],
  solutionHTML:'<p><strong>展开：</strong>2x−6=x+4。</p><p><strong>移项：</strong>两边同减 x、同加 6，得 x=10。</p><p><strong>检验：</strong>左右两边均为 14。</p>',
  solutionNote:'先独立做变式；答案展开只影响对应变式。',
  variants:[
    {level:'基础巩固',question:'解方程：<span class="math">3(x−2)=x+1</span>。',answer:'x=7/2',analysis:'3x−6=x+1 ⇒ 2x=7 ⇒ x=7/2。'},
    {level:'中等提升',question:'解方程：<span class="math">4(x−2)=2x+6</span>。',answer:'x=7',analysis:'4x−8=2x+6 ⇒ 2x=14 ⇒ x=7。'},
    {level:'能力扩展',question:'解方程：<span class="math">5(x−3)=2(x+3)</span>。',answer:'x=7',analysis:'5x−15=2x+6 ⇒ 3x=21 ⇒ x=7。'}
  ],
  footer:'演示内容 · 三道移项变式；参考答案不自动判分。'
};

const F8_REPORT = {
  id:'F8', title:'F8 长内容', kp:'方程', sourceLabel:'合成样例 · 布局压力',
  questionHTML:'解方程：<span class="math">2(x − 3) = x + 4</span>。<div class="long-formula-panel"><div class="formula-caption">长分式（首尾均可横向查看）</div><div class="long-formula">a₁+a₂+a₃+a₄+a₅+a₆+a₇+a₈+a₉+a₁₀+a₁₁+a₁₂<br><span class="long-frac-line"></span>b₁+b₂+b₃+b₄+b₅+b₆+b₇+b₈+b₉+b₁₀+b₁₁+b₁₂</div></div>',
  answerLines:['2x − x = 4 − 6','x = −2。'],
  summaryTitle:'长题面只用于布局检查',
  summaryCategory:'布局压力样例',
  summaryText:'下面完整保留 30 次指定句子；重复文本只用于检查长页面可读性，不提供额外诊断或新的数学结论。',
  diagnosis:'所有重复句都属于同一合成题，不是不同题目。没有真实模型调用，也不从长度推断学习状态。',
  causes:[],source:'ai',confidence:null,steps:[],
  solutionHTML:'<p><strong>展开：</strong>2(x−3)=2x−6。</p><p><strong>移项：</strong>2x−6=x+4 ⇒ x=10。</p><p><strong>检验：</strong>两边都等于 14。</p>',
  solutionNote:'长内容不影响完整解答默认折叠。',
  variants:[],footer:'演示内容 · 30 次重复句与 12 项长分式，仅检查长内容显示。'
};

const F3_LABELS = {cases:'方程组显示包', recursive:'递推式显示包', root:'根式显示包'};

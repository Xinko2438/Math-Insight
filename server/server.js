// 错因智诊后端服务
// 流程：接收题目/错误答案 -> 调用免费大模型(智谱 GLM-4-Flash) -> 结构化解析
// 失败时自动降级到本地规则引擎，保证接口始终可用
const express = require('express')
const fs = require('fs')
const path = require('path')

// ====== 简易 .env 加载（无需 dotenv 依赖） ======
const envFile = path.join(__dirname, '.env')
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf-8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  })
}

// ====== 配置 ======
// 免费申请地址：https://open.bigmodel.cn （GLM-4-Flash 永久免费）
const GLM_API_KEY = process.env.GLM_API_KEY || '在此填入你的智谱APIKey'
const GLM_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const PORT = Number(process.env.PORT) || 3000

const app = express()
app.use(express.json({ limit: '12mb' }))

// 允许跨域（便于调试；小程序 wx.request 本身不受跨域限制）
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// ================= 本地规则引擎（降级兜底） =================
const KNOWLEDGE_RULES = [
  { name: '三角函数', keywords: ['sin', 'cos', 'tan', '正弦', '余弦', '正切', '三角', '诱导公式', '周期', '弧度'] },
  { name: '对数', keywords: ['log', 'ln', '对数', 'lg'] },
  { name: '指数', keywords: ['指数', 'a^x', '幂运算', 'e^'] },
  { name: '方程', keywords: ['方程', '解得', '求根', '零点', '一元二次', '韦达'] },
  { name: '不等式', keywords: ['不等式', '大于', '小于', '≥', '≤', '恒成立', '解集'] },
  { name: '导数', keywords: ['导数', "f'(x)", '切线', '单调', '极值', '最值', '求导'] },
  { name: '积分', keywords: ['积分', '∫', '定积分', '不定积分', '面积'] },
  { name: '数列', keywords: ['数列', '等差', '等比', 'Sn', 'an', '通项', '递推'] },
  { name: '概率', keywords: ['概率', '随机', '抽', '分布', '期望', '方差', '事件'] },
  { name: '向量', keywords: ['向量', '矢量', '数量积', '点乘', '垂直', '平行'] },
  { name: '解析几何', keywords: ['椭圆', '双曲线', '抛物线', '直线', '圆', '焦点', '渐近线', '斜率', '圆锥曲线'] }
]

// ================= 错因节点库（唯一数据源：causeNodes.js） =================
// 50 个节点，三层结构：考点（枝干）-> 错因大类（分枝）-> 具体节点（叶子）
// 增删改节点只维护 server/causeNodes.js，前端通过 /api/cause-nodes 接口自动同步
const { ERROR_CAUSE_NODES, KP_ORDER, CAUSE_CATEGORIES, VALID_NODE_IDS } = require('./causeNodes')

const COMMON_PITFALLS = {
  '三角函数': '诱导公式符号判断错误、忽略角的取值范围、周期性与单调区间混淆',
  '对数': '忽略真数大于零的定义域限制、对数运算法则记混（如 log(a+b) 误拆）、换底公式使用不当',
  '指数': '指数运算法则混淆、忽略底数取值范围、指数与幂函数概念混淆',
  '方程': '判别式使用条件不清、韦达定理符号出错、增根漏检验、分类讨论不完整',
  '不等式': '两边同乘负数忘记变号、均值不等式取等条件忽略、解集端点开闭判断错误',
  '导数': '复合函数求导漏链式法则、导数为零处未必是极值点、定义域端点遗漏、单调区间书写不规范',
  '积分': '积分上下限代入错误、忘记加常数 C、被积函数符号处理出错',
  '数列': '等差等比公式记混、n=1 的情况未单独验证、递推关系转化错误、求和公式使用前提忽略',
  '概率': '基本事件空间列举不全、排列组合混淆、条件概率与独立事件混淆、几何概型测度选错',
  '向量': '数量积公式中夹角判断错误、向量垂直/平行充要条件记混、坐标运算符号出错',
  '解析几何': '斜率不存在的情形遗漏、联立方程后判别式条件忽略、焦点位置判断错误、定义法应用不熟练'
}

function ruleEngineAnalyze(question, wrongAnswer) {
  let matched = null
  for (const rule of KNOWLEDGE_RULES) {
    if (rule.keywords.some(k => question.toLowerCase().includes(k.toLowerCase()))) {
      matched = rule.name
      break
    }
  }
  if (!matched) matched = '综合题型'

  // 规则引擎匹配对应考点的前两个错因节点
  const kpNodes = ERROR_CAUSE_NODES.filter(n => n.kp === matched).slice(0, 2)
  const causeNodes = (kpNodes.length ? kpNodes : ERROR_CAUSE_NODES.filter(n => n.kp === '通用').slice(0, 2))
    .map(n => ({ id: n.id, name: n.name, kp: n.kp, category: n.category }))

  let diagnosis = `本题考查【${matched}】。该类题型的高频出错点：${COMMON_PITFALLS[matched] || '概念理解不透、计算粗心、解题步骤不规范'}。`
  if (wrongAnswer) {
    diagnosis += `\n结合你的作答「${wrongAnswer}」，很可能是对上述易错点中的某一处处理失误，建议对照正确步骤逐步排查，重点检查公式使用前提与符号细节。`
  }

  return {
    source: 'rule',
    knowledgePoint: matched,
    confidence: 60,
    confidenceBreakdown: { mode: 'rule', total: 60 },
    causeNodes,
    question,
    diagnosis,
    steps: [
      {
        question: '本题属于哪个考点？已知条件和待求目标分别是什么？',
        hint: `本题考查【${matched}】，先圈出已知条件与待求目标。`,
        detail: `本题考查【${matched}】。先通读题目，把每个已知条件逐一圈出并翻译成数学语言，再明确待求目标，判断属于该考点的哪一类典型问题。`
      },
      {
        question: `解决【${matched}】问题的核心公式是什么？它的使用前提呢？`,
        hint: `回顾【${matched}】的核心公式与定理，明确每个公式的适用条件。`,
        detail: `回忆【${matched}】的核心公式与定理，逐条核对使用前提（如定义域、取值范围、成立条件），确认本题的已知条件满足后再选用，避免公式误用。`
      },
      {
        question: '如何把已知条件代入公式？哪一步最容易出错？',
        hint: '规范书写推导过程，特别注意符号、定义域与特殊情形。',
        detail: '将已知条件规范地代入公式逐步推导，每一步写清依据。重点检查符号处理、定义域限制和特殊情形（这是本题最易出错的地方），对照你原来的作答找出出错的那一步。'
      },
      {
        question: '得到的结果合理吗？可以怎样检验？',
        hint: '检查取值范围、端点开闭、特殊情况（如 n=1、斜率不存在等）。',
        detail: '得出结果后做合理性检验：代回原题验证、检查取值范围与端点开闭、单独验证特殊情况（如 n=1、斜率不存在等）。检验通过即为最终答案；检验不通过则回查上一步推导。'
      }
    ],
    solution: `【参考解法】本题考查【${matched}】。规范思路：先明确已知条件与求解目标，选择对应公式并确认使用前提，逐步代入推导，最后检验结果的合理性。请对照你的作答，找出具体出错的步骤。`,
    variants: [
      {
        level: '基础巩固',
        question: `请将原题的某个已知条件数值修改后重新求解（仍考查${matched}），体会条件变化对解法的影响。`,
        answer: '参考答案：解法与原题一致，仅数值不同。',
        analysis: `解析：用于检验是否真正掌握【${matched}】的通法，而非记住原题答案。`
      },
      {
        level: '中等提升',
        question: `请将原题的设问方式调换（如由结论反推条件），完成逆向求解。`,
        answer: '参考答案：逆向使用同一公式即可。',
        analysis: `解析：训练逆向思维，加深对【${matched}】公式双向应用的理解。`
      },
      {
        level: '能力扩展',
        question: `请自编一道考查【${matched}】且包含一个易错陷阱的题目，并给出解答。`,
        answer: '参考答案：陷阱可设在公式使用前提或特殊情形上。',
        analysis: '解析：通过命题反向检验对易错点的理解深度。'
      }
    ]
  }
}

// ================= 大模型调用 =================
// 供 AI 选节点用的详细清单：按考点分组，含节点名称、大类、定义、判定依据（数据全部来自 causeNodes.js，不额外维护）
const NODE_LIBRARY_DETAILED = KP_ORDER.map(kp => {
  const nodes = ERROR_CAUSE_NODES.filter(n => n.kp === kp)
    .map(n => `${n.id} ${n.name}（${n.category}）【定义】${n.definition}【判定依据】${n.criteria}`)
    .join('\n')
  return `■${kp}：\n${nodes}`
}).join('\n')

function buildMessages(question, wrongAnswer) {
  const system = `你是一位资深理科（数学）错题诊断老师。学生给你一道错题，你要输出严格的 JSON（不要输出任何 JSON 以外的文字、不要用 markdown 代码块包裹），格式如下：
{
  "knowledgePoint": "本题考查的知识点（从：三角函数、对数、指数、方程、不等式、导数、积分、数列、概率、向量、解析几何 中选最贴切的，可附加更具体的子考点）",
  "diagnosis": "错因诊断：先指出该类题型的高频出错点，再结合学生的错误答案具体分析其错在哪一步、为什么错（150字以内）",
  "confidence": 85,
  "causeNodeIds": ["E17"],
  "steps": [
    {"question": "引导学生思考本步的问题（不泄露做法与答案）", "hint": "本步的具体操作方法提示", "detail": "本步骤的完整推理过程与解答（教学式讲解，含本步结论）"},
    {"question": "...", "hint": "...", "detail": "..."}
  ],
  "solution": "完整规范的解题过程与最终答案",
  "variants": [
    {"level": "基础巩固", "question": "变式题题干", "answer": "参考答案", "analysis": "简要解析"},
    {"level": "中等提升", "question": "变式题题干", "answer": "参考答案", "analysis": "简要解析"},
    {"level": "能力扩展", "question": "变式题题干", "answer": "参考答案", "analysis": "简要解析"}
  ]
}
要求：整体输出务必精炼；steps 控制在 3~4 步，question 用提问方式引导学生思考本步该做什么，hint 给出该步的具体操作提示但不在此给出最终答案，detail 给出本步的完整推理与解答（像老师讲课一样写清推理依据与本步结论，最后一步的 detail 必须包含最终答案）；solution 给出完整规范解答（含最终答案）；variants 三道难度递进，level 固定依次为 基础巩固/中等提升/能力扩展，必须与题干同考点，题干和解析各不超过 50 字。
confidence 表示你对本次诊断的把握程度（0~100 的整数），证据充分给 80 以上，信息不足（如未提供错误作答）相应降低。
causeNodeIds：先根据题干与错误作答判断考点，再只在该考点下的节点中挑选（通用考点的节点任何时候都可作为补充）；逐个对照节点的【定义】与【判定依据】，选与错误情节最吻合的 1~3 个节点 id，只允许从库中选，不得编造。特别注意：①不要因节点名称字面相似就误选其他考点的节点，必须以判定依据为准；②将学生的作答逐步与判定依据逐条比对，选吻合条目最多的节点；学生已经做对的步骤（如求导本身正确）不得选对应节点；③区间书写错误（如用并集连接多段单调区间、端点开闭写错）属于"单调区间端点处理不当"类节点，而非求导法则类节点。
错因节点库（按考点分组，含定义与判定依据）：
${NODE_LIBRARY_DETAILED}`
  const user = wrongAnswer
    ? `错题题干：${question}\n我的错误作答：${wrongAnswer}`
    : `错题题干：${question}\n（学生未提供错误作答）`
  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
}

async function callGLM(messages, { maxTokens = 1600, temperature = 0.3 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 55000)
  try {
    const res = await fetch(GLM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GLM_API_KEY}`
      },
      body: JSON.stringify({
        model: 'glm-4-flash',
        messages,
        temperature,
        max_tokens: maxTokens
      }),
      signal: controller.signal
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`GLM HTTP ${res.status}: ${text.slice(0, 300)}`)
    }
    const json = await res.json()
    return json.choices[0].message.content
  } finally {
    clearTimeout(timer)
  }
}

// 流式调用 GLM：每生成一小段就通过 onDelta 回调推出去
async function streamGLM(messages, onDelta) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 80000)
  try {
    const res = await fetch(GLM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GLM_API_KEY}`
      },
      body: JSON.stringify({
        model: 'glm-4-flash',
        messages,
        temperature: 0.3,
        max_tokens: 1600,
        stream: true
      }),
      signal: controller.signal
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`GLM HTTP ${res.status}: ${text.slice(0, 300)}`)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop()
      for (const evt of events) {
        const line = evt.split('\n').find(l => l.startsWith('data:'))
        if (!line) continue
        const payload = line.slice(5).trim()
        if (payload === '[DONE]') return
        try {
          const json = JSON.parse(payload)
          const choice = json.choices && json.choices[0]
          const delta = choice && choice.delta && choice.delta.content
          if (delta) onDelta(delta)
        } catch (e) { /* 忽略不完整的分片 */ }
      }
    }
  } finally {
    clearTimeout(timer)
  }
}

function extractJson(text) {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('AI 未返回有效 JSON')
  return JSON.parse(cleaned.slice(start, end + 1))
}

function normalizeAiResult(parsed, question, wrongAnswer) {
  if (!parsed || typeof parsed !== 'object') throw new Error('AI 结果格式错误')
  const arr = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()) : [])
  const LEVELS = ['基础巩固', '中等提升', '能力扩展']
  const variants = Array.isArray(parsed.variants)
    ? parsed.variants.slice(0, 3).map((v, i) => ({
        level: String(v.level || LEVELS[i] || LEVELS[0]),
        question: String(v.question || ''),
        answer: String(v.answer || ''),
        analysis: String(v.analysis || '')
      }))
    : []
  // steps 兼容字符串与 {question, hint, detail} 两种格式
  const steps = (Array.isArray(parsed.steps) ? parsed.steps : [])
    .map(s => {
      if (typeof s === 'string') return { question: s, hint: '', detail: '' }
      return {
        question: String((s && s.question) || ''),
        hint: String((s && s.hint) || ''),
        detail: String((s && s.detail) || '')
      }
    })
    .filter(s => s.question.trim())
  if (!parsed.knowledgePoint || !parsed.diagnosis || steps.length === 0 || variants.length === 0) {
    throw new Error('AI 结果字段不完整')
  }
  // 错因节点：只保留库中存在的 id，最多 3 个
  const causeNodes = (Array.isArray(parsed.causeNodeIds) ? parsed.causeNodeIds : [])
    .map(String)
    .filter(id => VALID_NODE_IDS.has(id))
    .slice(0, 3)
    .map(id => {
      const node = ERROR_CAUSE_NODES.find(n => n.id === id)
      return { id: node.id, name: node.name, kp: node.kp, category: node.category }
    })
  // 综合可信度评分（四因子加权，满分100）：
  // ①AI自评把握度（60分）②错误作答完整度（20分）③节点选择集中度（12分）④考点规范度（8分）
  const breakdown = computeConfidence(parsed.confidence, wrongAnswer, causeNodes, String(parsed.knowledgePoint))
  return {
    source: 'ai',
    knowledgePoint: String(parsed.knowledgePoint),
    confidence: breakdown.total,
    confidenceBreakdown: breakdown,
    causeNodes,
    question,
    diagnosis: String(parsed.diagnosis),
    steps,
    solution: String(parsed.solution || ''),
    variants
  }
}

// 四因子综合可信度：每个因子均可由当次请求数据直接验证，避免直接采用模型自报的百分比
function computeConfidence(aiRaw, wrongAnswer, causeNodes, knowledgePoint) {
  // 因子①：AI 自评（0~100），无法解析时按 70 计；权重 60%
  let aiSelf = Math.round(Number(aiRaw))
  if (!Number.isFinite(aiSelf)) aiSelf = 70
  aiSelf = Math.max(0, Math.min(100, aiSelf))
  const aiScore = Math.round(aiSelf * 0.6)

  // 因子②：错误作答完整度，满分 20。≥10 字视为可据错因分析，1~9 字信息有限，未填无法定位
  const ansLen = String(wrongAnswer || '').trim().length
  const answerScore = ansLen >= 10 ? 20 : (ansLen > 0 ? 10 : 0)

  // 因子③：节点选择集中度，满分 12。只选 1 个节点判断最明确，节点越分散越不确定
  const focusMap = { 1: 12, 2: 8, 3: 4 }
  const focusScore = focusMap[causeNodes.length] || 0

  // 因子④：考点规范度，满分 8。考点命中 12 个标准考点之一（允许附加子考点）
  const kpHit = KP_ORDER.some(kp => knowledgePoint.includes(kp) || kp.includes(knowledgePoint))
  const kpScore = kpHit ? 8 : 0

  const total = Math.max(0, Math.min(100, aiScore + answerScore + focusScore + kpScore))
  return { aiSelf, aiScore, answerScore, focusScore, kpScore, total }
}

// ================= 拍照识别（GLM-4V-Flash 免费视觉模型） =================
async function callGLMVision(base64Image) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 55000)
  try {
    const res = await fetch(GLM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GLM_API_KEY}`
      },
      body: JSON.stringify({
        model: 'glm-4v-flash',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
            { type: 'text', text: '请识别图片中的题目内容，原样完整转录为纯文本。数学符号用常见文本形式表示（如 x²、√、π、≤、≥，分式用 a/b）。只输出题目文字本身，不要任何解释或格式标记。' }
          ]
        }],
        temperature: 0.1,
        max_tokens: 1000
      }),
      signal: controller.signal
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`GLM HTTP ${res.status}: ${text.slice(0, 300)}`)
    }
    const json = await res.json()
    return json.choices[0].message.content
  } finally {
    clearTimeout(timer)
  }
}

// ================= 路由 =================
app.get('/api/health', (req, res) => {
  const hasKey = GLM_API_KEY && GLM_API_KEY !== '在此填入你的智谱APIKey'
  res.json({ code: 0, msg: 'ok', aiEnabled: hasKey })
})

// 错因节点库接口：前端错因树、节点解析统一从这里取数（节点库唯一数据源在 server/causeNodes.js）
app.get('/api/cause-nodes', (req, res) => {
  res.json({
    code: 0,
    msg: 'ok',
    data: {
      kpOrder: KP_ORDER,
      categories: CAUSE_CATEGORIES,
      nodes: ERROR_CAUSE_NODES
    }
  })
})

app.post('/api/analyze', async (req, res) => {
  const question = String((req.body && req.body.question) || '').trim()
  const wrongAnswer = String((req.body && req.body.wrongAnswer) || '').trim()

  if (!question) {
    return res.status(400).json({ code: 400, msg: '题目不能为空' })
  }
  if (question.length > 2000 || wrongAnswer.length > 1000) {
    return res.status(400).json({ code: 400, msg: '输入内容超出长度限制' })
  }

  const hasKey = GLM_API_KEY && GLM_API_KEY !== '在此填入你的智谱APIKey'
  if (hasKey) {
    try {
      const content = await callGLM(buildMessages(question, wrongAnswer))
      const result = normalizeAiResult(extractJson(content), question, wrongAnswer)
      return res.json({ code: 0, msg: 'ok', data: result })
    } catch (e) {
      console.error('AI 分析失败，降级到规则引擎：', e.message)
    }
  }
  // 降级：本地规则引擎
  res.json({ code: 0, msg: 'ok（规则引擎）', data: ruleEngineAnalyze(question, wrongAnswer) })
})

// 流式诊断接口（SSE）：边生成边推送，最后推送完整结构化结果
app.post('/api/analyze/stream', async (req, res) => {
  const question = String((req.body && req.body.question) || '').trim()
  const wrongAnswer = String((req.body && req.body.wrongAnswer) || '').trim()

  if (!question) {
    return res.status(400).json({ code: 400, msg: '题目不能为空' })
  }
  if (question.length > 2000 || wrongAnswer.length > 1000) {
    return res.status(400).json({ code: 400, msg: '输入内容超出长度限制' })
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  })
  const send = obj => {
    try { res.write(`data: ${JSON.stringify(obj)}\n\n`) } catch (e) {}
  }

  const hasKey = GLM_API_KEY && GLM_API_KEY !== '在此填入你的智谱APIKey'
  if (hasKey) {
    try {
      let full = ''
      await streamGLM(buildMessages(question, wrongAnswer), delta => {
        full += delta
        send({ type: 'delta', text: delta })
      })
      const result = normalizeAiResult(extractJson(full), question, wrongAnswer)
      send({ type: 'result', data: result })
      return res.end()
    } catch (e) {
      console.error('流式 AI 分析失败，降级到规则引擎：', e.message)
    }
  }
  send({ type: 'result', data: ruleEngineAnalyze(question, wrongAnswer) })
  res.end()
})

// 多轮引导式追问（苏格拉底式辅导）
app.post('/api/chat', async (req, res) => {
  const body = req.body || {}
  const question = String(body.question || '').trim()
  const diagnosis = String(body.diagnosis || '').trim()
  const message = String(body.message || '').trim()
  const history = Array.isArray(body.history) ? body.history.slice(-8) : []

  if (!message) {
    return res.status(400).json({ code: 400, msg: '问题不能为空' })
  }
  if (message.length > 500) {
    return res.status(400).json({ code: 400, msg: '问题过长' })
  }
  const hasKey = GLM_API_KEY && GLM_API_KEY !== '在此填入你的智谱APIKey'
  if (!hasKey) {
    return res.status(503).json({ code: 503, msg: 'AI 服务未配置，追问不可用' })
  }

  const system = `你是一位苏格拉底式的数学辅导老师。学生刚做错一道题，背景如下：
错题题干：${question || '（未知）'}
AI 诊断结论：${diagnosis || '（未知）'}
学生现在继续追问。要求：绝不直接给出完整答案，用反问、提示、类比引导学生自己想通；每次回复 100 字以内；语气温和鼓励。`
  const messages = [{ role: 'system', content: system }]
  for (const h of history) {
    if (h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string') {
      messages.push({ role: h.role, content: h.content.slice(0, 500) })
    }
  }
  messages.push({ role: 'user', content: message })

  try {
    const reply = await callGLM(messages, { maxTokens: 300, temperature: 0.6 })
    res.json({ code: 0, msg: 'ok', data: { reply: String(reply).trim() } })
  } catch (e) {
    console.error('追问回复失败：', e.message)
    res.status(500).json({ code: 500, msg: 'AI 回复失败，请重试' })
  }
})

app.post('/api/ocr', async (req, res) => {
  const image = String((req.body && req.body.image) || '')
  if (!image) {
    return res.status(400).json({ code: 400, msg: '图片不能为空' })
  }
  if (image.length > 9 * 1024 * 1024) {
    return res.status(400).json({ code: 400, msg: '图片过大，请重新拍摄' })
  }
  const hasKey = GLM_API_KEY && GLM_API_KEY !== '在此填入你的智谱APIKey'
  if (!hasKey) {
    return res.status(503).json({ code: 503, msg: '未配置 GLM_API_KEY，拍照识别不可用' })
  }
  try {
    const text = await callGLMVision(image)
    res.json({ code: 0, msg: 'ok', data: { text: String(text).trim() } })
  } catch (e) {
    console.error('题目识别失败：', e.message)
    res.status(500).json({ code: 500, msg: '题目识别失败，请重试或改用文字输入' })
  }
})

app.listen(PORT, () => {
  const hasKey = GLM_API_KEY && GLM_API_KEY !== '在此填入你的智谱APIKey'
  console.log(`错因智诊后端已启动：http://localhost:${PORT}`)
  console.log(`AI 模型：${hasKey ? '智谱 GLM-4-Flash（已配置 Key）' : '未配置 Key，当前使用本地规则引擎'}`)
})

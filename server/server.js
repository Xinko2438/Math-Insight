// 错因智诊后端服务
// 流程：接收题目/错误答案 -> 调用小米 MiMo-V2.6-Flash -> 结构化解析
// 失败时自动降级到本地规则引擎，保证接口始终可用
const express = require('express')
const fs = require('fs')
const path = require('path')
const { randomUUID } = require('node:crypto')

// ====== 简易 .env 加载（无需 dotenv 依赖） ======
const envFile = path.join(__dirname, '.env')
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf-8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  })
}

// ====== 配置 ======
// API 文档：https://platform.xiaomimimo.com/docs/zh-CN/api/chat/openai-api
const MIMO_API_KEY = process.env.MATH_APP_MIMO_API_KEY || ''
const MIMO_URL = 'https://api.xiaomimimo.com/v1/chat/completions'
const MIMO_MODEL = 'mimo-v2.6-flash'
const PORT = Number(process.env.PORT) || 3000

const app = express()
app.use(express.json({ limit: '12mb' }))

// 允许跨域（便于调试；小程序 wx.request 本身不受跨域限制）
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Job-Token, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// Explicitly enabled only for the public deployment. Missing credentials fail closed.
if (process.env.MATH_APP_PUBLIC_ACCESS === '1') {
  // Exactly one trusted Nginx hop; Docker port is published on loopback only.
  app.set('trust proxy', 1)
  const { createPublicAccess } = require('./public-access')
  const access = createPublicAccess({dbPath:path.join(__dirname,'.runtime','public-access.sqlite'),appId:process.env.MATH_APP_WECHAT_APP_ID,appSecret:process.env.MATH_APP_WECHAT_APP_SECRET,sessionSecret:process.env.MATH_APP_SESSION_SECRET,userDaily:Number(process.env.MATH_APP_USER_DAILY)||30,globalDaily:Number(process.env.MATH_APP_GLOBAL_DAILY)||150})
  app.use('/api',access.middleware)
}

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

  return {
    source: 'rule',
    knowledgePoint: matched,
    causeNodes: [],
    question,
    diagnosis: `AI 诊断暂时不可用。以下是【${matched}】的基础复习提示，暂时无法判断你的作答是否正确或定位错因。`,
    steps: [
      {
        question: '如何检查题目中的已知条件和你的推导？',
        hint: '逐步核对已知条件、运算过程与最终结果；能代回时可代回原题检查。',
        detail: ''
      }
    ],
    solution: '',
    variants: []
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
  const system = `你是一位资深理科（数学）学习辅导老师。学生给你一道题目和可选作答；先判断作答是否有实际错误，正确或信息不足时不得假定存在错因。你要输出严格的 JSON（不要输出任何 JSON 以外的文字、不要用 markdown 代码块包裹），格式如下：
{
  "knowledgePoint": "本题考查的知识点（从：三角函数、对数、指数、方程、不等式、导数、积分、数列、概率、向量、解析几何 中选最贴切的，可附加更具体的子考点）",
  "diagnosis": "作答分析：如果有可确认的错误，结合具体步骤说明原因；如果正确或信息不足，诚实说明（150字以内）",
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
数学公式使用 LaTeX，行内用 $...$，独立或多行公式用 $$...$$；中文叙述放在公式外，JSON 中反斜杠正确转义，不输出 HTML 或宏定义。输入中已有公式和学生错误步骤不得因排版被改写。
confidence 表示你对本次诊断的把握程度（0~100 的整数），证据充分给 80 以上，信息不足（如未提供错误作答）相应降低。
causeNodeIds：先根据题干与作答判断考点，再只在该考点下的节点中挑选（通用考点的节点任何时候都可作为补充）；仅当存在可指出的错误时选与错误情节吻合的 1~3 个节点 id，只允许从库中选，不得编造。如果作答正确或证据不足，明确说明并返回空数组，不得硬凑错因。特别注意：①不要因节点名称字面相似就误选其他考点的节点，必须以判定依据为准；②将学生的作答逐步与判定依据逐条比对，选吻合条目最多的节点；学生已经做对的步骤（如求导本身正确）不得选对应节点；③区间书写错误（如用并集连接多段单调区间、端点开闭写错）属于"单调区间端点处理不当"类节点，而非求导法则类节点。
错因节点库（按考点分组，含定义与判定依据）：
${NODE_LIBRARY_DETAILED}`
  const user = wrongAnswer
    ? `题目：${question}\n我的作答：${wrongAnswer}`
    : `题目：${question}\n（学生未提供作答）`
  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
}

function safeProviderId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value) ? value : null
}

function tokenCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

function analysisTokens(usage) {
  return {
    prompt: tokenCount(usage && usage.prompt_tokens),
    completion: tokenCount(usage && usage.completion_tokens),
    total: tokenCount(usage && usage.total_tokens),
    reasoning: tokenCount(usage && usage.completion_tokens_details && usage.completion_tokens_details.reasoning_tokens)
  }
}

function newAnalysisAudit(transport) {
  return { at: new Date().toISOString(), requestId: 'analysis-' + randomUUID(), transport, model: MIMO_MODEL, durationMs: 0, providerRequestId: null, providerStatus: null, finishReason: null, tokens: analysisTokens(null), resultSource: null, errorCategory: null }
}

function analysisError(code) {
  const error = new Error(code)
  error.analysisCode = code
  return error
}

function safeAnalysisError(error) {
  const allowed = new Set(['PROVIDER_HTTP_ERROR', 'PROVIDER_TRUNCATED', 'PROVIDER_INCOMPLETE', 'PROVIDER_STREAM_INVALID', 'PROVIDER_BLOCKED', 'INVALID_AI_RESPONSE'])
  if (error && allowed.has(error.analysisCode)) return error.analysisCode
  if (error && error.name === 'AbortError') return 'PROVIDER_TIMEOUT'
  if (error && (error.name === 'SyntaxError' || error.message === 'AI 未返回有效 JSON' || error.message === 'AI 结果格式错误' || error.message === 'AI 结果字段不完整')) return 'INVALID_AI_RESPONSE'
  return 'PROVIDER_NETWORK_ERROR'
}

async function writeAnalysisAudit(record, started) {
  record.durationMs = Math.max(0, Date.now() - started)
  try {
    const directory = path.join(__dirname, '.runtime')
    await fs.promises.mkdir(directory, { recursive: true })
    await fs.promises.appendFile(path.join(directory, 'analysis-audit.jsonl'), JSON.stringify(record) + '\n', 'utf8')
  } catch (_) {
    console.warn('ANALYSIS_AUDIT_WRITE_FAILED', record.requestId)
  }
}

async function callMiMo(messages, { maxTokens = 1600, temperature = 0.3, telemetry = null } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 55000)
  try {
    const res = await fetch(MIMO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': MIMO_API_KEY
      },
      body: JSON.stringify({
        model: MIMO_MODEL,
        messages,
        temperature,
        max_completion_tokens: maxTokens
      }),
      signal: controller.signal
    })
    if (telemetry) {
      telemetry.providerStatus = Number.isInteger(res.status) ? res.status : null
      telemetry.providerRequestId = safeProviderId(res.headers && res.headers.get('x-request-id'))
    }
    if (!res.ok) {
      if (telemetry) throw analysisError('PROVIDER_HTTP_ERROR')
      const text = await res.text()
      throw new Error(`MiMo HTTP ${res.status}: ${text.slice(0, 300)}`)
    }
    const json = await res.json()
    if (telemetry) {
      if (!json || typeof json !== 'object' || !Array.isArray(json.choices) || !json.choices[0] || !json.choices[0].message || typeof json.choices[0].message.content !== 'string') throw analysisError('INVALID_AI_RESPONSE')
      telemetry.providerRequestId = safeProviderId(json.id) || telemetry.providerRequestId
      telemetry.tokens = analysisTokens(json.usage)
      const choice = json.choices[0]
      telemetry.finishReason = choice && ['stop', 'length', 'tool_calls', 'content_filter', 'repetition_truncation'].includes(choice.finish_reason) ? choice.finish_reason : null
    }
    return json.choices[0].message.content
  } finally {
    clearTimeout(timer)
  }
}

// 流式调用 MiMo：每生成一小段就通过 onDelta 回调推出去
async function streamMiMo(messages, onDelta, telemetry) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 80000)
  try {
    const res = await fetch(MIMO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': MIMO_API_KEY
      },
      body: JSON.stringify({
        model: MIMO_MODEL,
        messages,
        temperature: 0.3,
        max_completion_tokens: 4096,
        response_format: { type: 'json_object' },
        stream: true
      }),
      signal: controller.signal
    })
    telemetry.providerStatus = Number.isInteger(res.status) ? res.status : null
    telemetry.providerRequestId = safeProviderId(res.headers && res.headers.get('x-request-id'))
    if (!res.ok) throw analysisError('PROVIDER_HTTP_ERROR')
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let sawDone = false
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let boundary
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const evt = buffer.slice(0, boundary.index)
        buffer = buffer.slice(boundary.index + boundary[0].length)
        const payload = evt.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n')
        if (!payload) continue
        if (payload === '[DONE]') { sawDone = true; break }
        let json
        try { json = JSON.parse(payload) } catch (_) { throw analysisError('PROVIDER_STREAM_INVALID') }
        if (!json || typeof json !== 'object' || Array.isArray(json)) throw analysisError('PROVIDER_STREAM_INVALID')
        telemetry.providerRequestId = safeProviderId(json.id) || telemetry.providerRequestId
        if (json.usage) telemetry.tokens = analysisTokens(json.usage)
        const choice = Array.isArray(json.choices) ? json.choices[0] : null
        const finish = choice && choice.finish_reason
        if (['stop', 'length', 'tool_calls', 'content_filter', 'repetition_truncation'].includes(finish)) telemetry.finishReason = finish
        const delta = choice && choice.delta && choice.delta.content
        if (typeof delta === 'string' && delta) onDelta(delta)
        if (finish === 'length' || finish === 'repetition_truncation') throw analysisError('PROVIDER_TRUNCATED')
        if (finish === 'content_filter' || finish === 'tool_calls') throw analysisError('PROVIDER_BLOCKED')
      }
      if (sawDone) break
    }
    if (!sawDone || telemetry.finishReason !== 'stop') throw analysisError('PROVIDER_INCOMPLETE')
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

// ================= 拍照识别（MiMo-V2.6-Flash 多模态模型） =================
const { createOcrHandler } = require('./ocr')
const recognizePhoto = createOcrHandler({
  apiKey: MIMO_API_KEY, url: MIMO_URL, model: MIMO_MODEL,
  audit: async record => {
    const directory = path.join(__dirname, '.runtime')
    await fs.promises.mkdir(directory, { recursive: true })
    await fs.promises.appendFile(path.join(directory, 'ocr-audit.jsonl'), JSON.stringify(record) + '\n', 'utf8')
  },
  warn: (code, requestId) => console.warn(code, requestId)
})

// ================= 路由 =================
app.get('/api/health', (req, res) => {
  const hasKey = Boolean(MIMO_API_KEY)
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
  const started = Date.now()
  const audit = newAnalysisAudit('normal')
  const question = String((req.body && req.body.question) || '').trim()
  const wrongAnswer = String((req.body && req.body.wrongAnswer) || '').trim()

  if (!question) {
    audit.errorCategory = 'INPUT_INVALID'
    await writeAnalysisAudit(audit, started)
    return res.status(400).json({ code: 400, msg: '题目不能为空', requestId: audit.requestId })
  }
  if (question.length > 2000 || wrongAnswer.length > 1000) {
    audit.errorCategory = 'INPUT_INVALID'
    await writeAnalysisAudit(audit, started)
    return res.status(400).json({ code: 400, msg: '输入内容超出长度限制', requestId: audit.requestId })
  }

  const hasKey = Boolean(MIMO_API_KEY)
  let result
  if (hasKey) {
    try {
      const content = await callMiMo(buildMessages(question, wrongAnswer), { telemetry: audit })
      if (audit.finishReason === 'length' || audit.finishReason === 'repetition_truncation') throw analysisError('PROVIDER_TRUNCATED')
      if (audit.finishReason && audit.finishReason !== 'stop') throw analysisError('PROVIDER_BLOCKED')
      if (typeof content !== 'string' || !content.trim()) throw analysisError('INVALID_AI_RESPONSE')
      result = normalizeAiResult(extractJson(content), question, wrongAnswer)
      audit.resultSource = 'ai'
    } catch (e) {
      audit.errorCategory = safeAnalysisError(e)
      console.error('AI_ANALYSIS_FALLBACK', audit.errorCategory, audit.requestId)
    }
  } else audit.errorCategory = 'MODEL_NOT_CONFIGURED'
  if (!result) {
    result = ruleEngineAnalyze(question, wrongAnswer)
    audit.resultSource = 'rule'
  }
  await writeAnalysisAudit(audit, started)
  res.json({ code: 0, msg: audit.resultSource === 'rule' ? 'ok（规则引擎）' : 'ok', data: result, requestId: audit.requestId })
})

// 流式诊断接口（SSE）：边生成边推送，最后推送完整结构化结果
app.post('/api/analyze/stream', async (req, res) => {
  const started = Date.now()
  const audit = newAnalysisAudit('stream')
  const question = String((req.body && req.body.question) || '').trim()
  const wrongAnswer = String((req.body && req.body.wrongAnswer) || '').trim()

  if (!question) {
    audit.errorCategory = 'INPUT_INVALID'
    await writeAnalysisAudit(audit, started)
    return res.status(400).json({ code: 400, msg: '题目不能为空', requestId: audit.requestId })
  }
  if (question.length > 2000 || wrongAnswer.length > 1000) {
    audit.errorCategory = 'INPUT_INVALID'
    await writeAnalysisAudit(audit, started)
    return res.status(400).json({ code: 400, msg: '输入内容超出长度限制', requestId: audit.requestId })
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  })
  const send = obj => {
    try { res.write(`data: ${JSON.stringify(obj)}\n\n`) } catch (e) {}
  }
  send({ type: 'start', requestId: audit.requestId })

  const hasKey = Boolean(MIMO_API_KEY)
  let result
  if (hasKey) {
    try {
      let full = ''
      await streamMiMo(buildMessages(question, wrongAnswer), delta => {
        full += delta
        send({ type: 'delta', text: delta })
      }, audit)
      result = normalizeAiResult(extractJson(full), question, wrongAnswer)
      audit.resultSource = 'ai'
    } catch (e) {
      audit.errorCategory = safeAnalysisError(e)
      console.error('AI_STREAM_FALLBACK', audit.errorCategory, audit.requestId)
    }
  } else audit.errorCategory = 'MODEL_NOT_CONFIGURED'
  if (!result) {
    result = ruleEngineAnalyze(question, wrongAnswer)
    audit.resultSource = 'rule'
  }
  send({ type: 'result', data: result, requestId: audit.requestId })
  await writeAnalysisAudit(audit, started)
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
  const hasKey = Boolean(MIMO_API_KEY)
  if (!hasKey) {
    return res.status(503).json({ code: 503, msg: 'AI 服务未配置，追问不可用' })
  }

  const system = `你是一位苏格拉底式的数学辅导老师。学生刚做错一道题，背景如下：
错题题干：${question || '（未知）'}
AI 诊断结论：${diagnosis || '（未知）'}
学生现在继续追问。要求：绝不直接给出完整答案，用反问、提示、类比引导学生自己想通；每次回复 100 字以内；语气温和鼓励。数学公式用 $...$ 或 $$...$$ 包裹的 LaTeX，中文放在公式外，不输出 HTML。`
  const messages = [{ role: 'system', content: system }]
  for (const h of history) {
    if (h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string') {
      messages.push({ role: h.role, content: h.content.slice(0, 500) })
    }
  }
  messages.push({ role: 'user', content: message })

  try {
    const reply = await callMiMo(messages, { maxTokens: 300, temperature: 0.6 })
    res.json({ code: 0, msg: 'ok', data: { reply: String(reply).trim() } })
  } catch (e) {
    console.error('追问回复失败：', e.message)
    res.status(500).json({ code: 500, msg: 'AI 回复失败，请重试' })
  }
})

app.post('/api/ocr', recognizePhoto)

// The persistent task worker is attached only to the actual executable server;
// existing VM-based compatibility checks continue to exercise their isolated app.
if (typeof module !== 'undefined' && require.main === module) {
  try {
    const { createAnalysisJobs } = require('./analysis-jobs')
    const jobs = createAnalysisJobs({
      dbPath: path.join(__dirname, '.runtime', 'analysis-jobs.sqlite'),
      provider: async ({ taskId, question, wrongAnswer }) => {
        const started = Date.now()
        const audit = newAnalysisAudit('job')
        audit.taskId = taskId
        try {
          if (!MIMO_API_KEY) {
            audit.errorCategory = 'MODEL_NOT_CONFIGURED'
            audit.resultSource = 'rule'
            return ruleEngineAnalyze(question, wrongAnswer)
          }
          let content = ''
          // Do not turn an ambiguous upstream outcome into a successful fallback.
          await streamMiMo(buildMessages(question, wrongAnswer), delta => { content += delta }, audit)
          const result = normalizeAiResult(extractJson(content), question, wrongAnswer)
          audit.resultSource = 'ai'
          return result
        } catch (error) {
          audit.errorCategory = safeAnalysisError(error)
          throw error
        } finally { await writeAnalysisAudit(audit, started) }
      }
    })
    app.use('/api/analysis-jobs', jobs.router)
  } catch (_) {
    app.use('/api/analysis-jobs', (req, res) => res.status(503).json({ code: 503, msg: '任务服务暂不可用' }))
    console.error('ANALYSIS_JOBS_UNAVAILABLE')
  }
}

app.listen(PORT, process.env.HOST || '0.0.0.0', () => {
  const hasKey = Boolean(MIMO_API_KEY)
  console.log(`错因智诊后端已启动：http://localhost:${PORT}`)
  console.log(`AI 模型：${hasKey ? '小米 MiMo-V2.6-Flash（已配置 Key）' : '未配置 Key，当前使用本地规则引擎'}`)
})

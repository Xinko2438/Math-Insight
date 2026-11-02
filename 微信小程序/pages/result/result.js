// result.js
const { baseUrl } = require('../../utils/config')
const { loadLibrary, resolveNode } = require('../../utils/causeNodes')
const jobs = require('../../utils/analysis-jobs')

Page({
  data: {
    result: null,
    chat: [],
    chatInput: '',
    chatting: false,
    solutionExpanded: false,
    activeTab: 'steps',
    wrongAnswer: '',
    chatError: '',
    recordId: '', taskId: '', canSaveTask: false
  },

  onLoad(options = {}) {
    const rawResult = getApp().globalData.lastResult
    const result = rawResult ? JSON.parse(JSON.stringify(rawResult)) : null
    const wrongAnswer = getApp().globalData.lastWrongAnswer || ''
    getApp().globalData.lastWrongAnswer = ''
    if (!result) {
      wx.showToast({ title: '暂无解析数据', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    // Only attach a report to a stored row when identity is unambiguous.
    let recordId = ''
    try {
      const records = wx.getStorageSync('errorHistory') || []
      if (options.taskId) {
        const match=records.find(row => row.taskId === options.taskId)
        if (match) recordId=String(match.id)
      } else if (options.recordId && records.some(row => String(row.id) === String(options.recordId) && row.result && JSON.stringify(row.result) === JSON.stringify(result) && (row.wrongAnswer || '') === wrongAnswer)) recordId = String(options.recordId)
      else if (!options.recordId) {
        const matches = records.filter(row => row.result && JSON.stringify(row.result) === JSON.stringify(result) && (row.wrongAnswer || '') === wrongAnswer)
        if (matches.length === 1) recordId = String(matches[0].id)
      }
    } catch (_) { /* Reporting remains available when local history cannot be read. */ }
    this.setData({ recordId, taskId:options.taskId || '', canSaveTask:!!options.taskId && !recordId && result.source !== 'rule' })
    // 变式题默认收起答案
    result.variants = (result.variants || []).map((v, i) => ({ ...v, level: v.level || `变式${i + 1}`, expanded: false }))
    // 默认收起提示与完整解答
    result.steps = (result.steps || []).map(s =>
      typeof s === 'string'
        ? { question: s, hint: '', detail: '', showHint: false, showDetail: false }
        : { detail: '', ...s, showHint: false, showDetail: false }
    )
    // 错因节点补全分类路径（节点库从后端加载）
    loadLibrary(() => {
      result.causeNodes = (result.causeNodes || []).map(n => resolveNode(n)).filter(n => n.name)
      this.setData({ result, wrongAnswer })
    })
    getApp().globalData.lastResult = null
  },

  openTagEditor() {
    if (this.data.recordId) wx.navigateTo({ url: '/pages/history/history?tagRecordId=' + encodeURIComponent(this.data.recordId) })
  },

  saveTaskToHistory() {
    if (!this.data.canSaveTask || !this.data.taskId) return
    wx.showModal({title:'存入错题本？',content:'请先确认这道题确实需要作为错题复习。存入后会计入错题统计。',confirmText:'存入',success:res=>{
      if (!res.confirm) return
      try { const record=jobs.saveToHistory(this.data.taskId); this.setData({recordId:String(record.id),canSaveTask:false}); wx.showToast({title:'已存入错题本',icon:'none'}) }
      catch (_) { wx.showToast({title:'保存失败，报告仍在任务中',icon:'none'}) }
    }})
  },

  switchReportTab(e) {
    const activeTab = e.currentTarget.dataset.tab
    if (['steps', 'diagnosis', 'variants'].includes(activeTab)) this.setData({ activeTab })
  },

  toggleHint(e) {
    const idx = e.currentTarget.dataset.index
    this.setData({ [`result.steps[${idx}].showHint`]: !this.data.result.steps[idx].showHint })
  },

  toggleSolution() {
    this.setData({ solutionExpanded: !this.data.solutionExpanded })
  },

  toggleDetail(e) {
    const idx = e.currentTarget.dataset.index
    this.setData({ [`result.steps[${idx}].showDetail`]: !this.data.result.steps[idx].showDetail })
  },

  toggleVariant(e) {
    const idx = e.currentTarget.dataset.index
    this.setData({ [`result.variants[${idx}].expanded`]: !this.data.result.variants[idx].expanded })
  },

  onChatInput(e) {
    this.setData({ chatInput: e.detail.value })
  },

  sendChat() {
    const msg = this.data.chatInput.trim()
    if (!msg || this.data.chatting || !this.data.result) return

    const chat = this.data.chat.concat({ role: 'user', content: msg })
    this.setData({ chat, chatInput: '', chatting: true, chatError: '' })

    const r = this.data.result
    wx.request({
      url: `${baseUrl}/api/chat`,
      method: 'POST',
      timeout: 30000,
      data: {
        question: r.question,
        diagnosis: r.diagnosis,
        message: msg,
        history: chat.slice(-9, -1).map(m => ({ role: m.role, content: m.content }))
      },
      success: res => {
        const result = res.data
        if (res.statusCode === 200 && result && result.code === 0 && result.data && result.data.reply) {
          this.setData({ chat: this.data.chat.concat({ role: 'assistant', content: result.data.reply }) })
        } else {
          this.setData({ chatError: (result && result.code !== 0 && result.msg) || '暂未收到回复，请稍后重试。也可以先看分步提示。' })
        }
      },
      fail: () => this.setData({ chatError: '暂时无法连接，请稍后重试。你可以先查看分步提示。' }),
      complete: () => this.setData({ chatting: false })
    })
  },

  goAgain() {
    const pages = getCurrentPages()
    const previous = pages[pages.length - 2]
    if (previous && previous.route === 'pages/input/input') wx.navigateBack({ delta: 1 })
    else wx.redirectTo({ url: '/pages/input/input' })
  }
})

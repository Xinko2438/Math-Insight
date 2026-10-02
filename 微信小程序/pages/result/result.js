// result.js
const { baseUrl } = require('../../utils/config')
const { loadLibrary, resolveNode } = require('../../utils/causeNodes')

Page({
  data: {
    result: null,
    chat: [],
    chatInput: '',
    chatting: false,
    solutionExpanded: false
  },

  onLoad() {
    const result = getApp().globalData.lastResult
    if (!result) {
      wx.showToast({ title: '暂无解析数据', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
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
      this.setData({ result })
    })
    getApp().globalData.lastResult = null
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
    this.setData({ chat, chatInput: '', chatting: true })

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
          wx.showToast({ title: (result && result.msg) || '回复失败，请重试', icon: 'none' })
        }
      },
      fail: () => wx.showToast({ title: '网络异常，请检查后端', icon: 'none' }),
      complete: () => this.setData({ chatting: false })
    })
  },

  goAgain() {
    wx.navigateBack()
  }
})

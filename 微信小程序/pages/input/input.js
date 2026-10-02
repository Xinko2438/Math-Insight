// input.js
const { baseUrl } = require('../../utils/config')

Page({
  data: {
    question: '',
    wrongAnswer: '',
    questionLen: 0,
    answerLen: 0,
    submitting: false,
    streamChars: 0
  },

  onLoad() {
    // 拍照识别后带过来的题目文字
    const pending = getApp().globalData.pendingQuestion
    if (pending) {
      getApp().globalData.pendingQuestion = null
      this.setData({ question: pending, questionLen: pending.length })
    }
  },

  onQuestionInput(e) {
    this.setData({ question: e.detail.value, questionLen: e.detail.value.length })
  },

  onAnswerInput(e) {
    this.setData({ wrongAnswer: e.detail.value, answerLen: e.detail.value.length })
  },

  onSubmit() {
    const { question, wrongAnswer, submitting } = this.data
    if (submitting) return

    if (!question.trim()) {
      wx.showToast({ title: '请先填写错题题干', icon: 'none' })
      return
    }

    this.setData({ submitting: true, streamChars: 0 })
    wx.showLoading({ title: 'AI 诊断中…', mask: true })
    this._done = false
    this._sseBuf = ''
    this._acc = ''

    const task = wx.request({
      url: `${baseUrl}/api/analyze/stream`,
      method: 'POST',
      timeout: 90000,
      enableChunked: true,
      responseType: 'text',
      data: { question: question.trim(), wrongAnswer: wrongAnswer.trim() },
      success: res => {
        if (this._done) return
        if (res.statusCode !== 200) {
          this.handleError('解析服务异常，请稍后重试。')
          return
        }
        // 兜底：分片回调未触发时，尝试整体按 SSE 文本解析
        if (typeof res.data === 'string') this.processSseText(res.data + '\n\n')
        if (!this._done) this.handleError('解析结果异常，请稍后重试。')
      },
      fail: () => {
        if (this._done) return
        // 流式不可用，回退到普通接口
        this.fallbackAnalyze()
      }
    })

    if (task && task.onChunkReceived) {
      task.onChunkReceived(r => {
        if (this._done) return
        this.processSseText(this.decodeChunk(r.data))
      })
    }
  },

  // 普通接口兜底（不支持分片传输的环境）
  fallbackAnalyze() {
    const { question, wrongAnswer } = this.data
    wx.request({
      url: `${baseUrl}/api/analyze`,
      method: 'POST',
      timeout: 60000,
      data: { question: question.trim(), wrongAnswer: wrongAnswer.trim() },
      success: res => {
        const result = res.data
        if (res.statusCode !== 200 || !result || result.code !== 0 || !result.data) {
          this.handleError((result && result.msg) || '解析结果异常，请稍后重试。')
          return
        }
        this.finishSuccess(result.data)
      },
      fail: () => this.handleError('无法连接错题解析服务，请确认后端服务已启动（server 目录运行 npm start）。')
    })
  },

  decodeChunk(buf) {
    try {
      if (!this._decoder) this._decoder = new TextDecoder('utf-8')
      return this._decoder.decode(buf, { stream: true })
    } catch (e) {
      return ''
    }
  },

  // 解析 SSE 文本流，逐事件处理
  processSseText(text) {
    this._sseBuf += text
    let idx
    while ((idx = this._sseBuf.indexOf('\n\n')) !== -1) {
      const rawEvent = this._sseBuf.slice(0, idx)
      this._sseBuf = this._sseBuf.slice(idx + 2)
      const line = rawEvent.split('\n').find(l => l.startsWith('data:'))
      if (!line) continue
      let evt
      try {
        evt = JSON.parse(line.slice(5).trim())
      } catch (e) {
        continue
      }
      if (evt.type === 'delta') {
        this._acc += evt.text
        if (!this.data.streamChars) wx.hideLoading()
        this.setData({ streamChars: this._acc.length })
      } else if (evt.type === 'result') {
        this.finishSuccess(evt.data)
      }
    }
  },

  finishSuccess(data) {
    if (this._done) return
    this._done = true
    this.saveToHistory(data)
    getApp().globalData.lastResult = data
    // 清空输入，返回再诊断时是新表单
    this.setData({ submitting: false, streamChars: 0, question: '', wrongAnswer: '', questionLen: 0, answerLen: 0 })
    wx.hideLoading()
    wx.navigateTo({ url: '/pages/result/result' })
  },

  handleError(msg) {
    if (this._done) return
    this._done = true
    this.setData({ submitting: false, streamChars: 0 })
    wx.hideLoading()
    wx.showModal({ title: '解析异常', content: msg, showCancel: false })
  },

  // 写入本地错题本（最多保留 100 条）
  saveToHistory(data) {
    const now = new Date()
    const pad = n => String(n).padStart(2, '0')
    const record = {
      id: now.getTime(),
      time: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
      question: this.data.question.trim(),
      wrongAnswer: this.data.wrongAnswer.trim(),
      result: data
    }
    try {
      const list = wx.getStorageSync('errorHistory') || []
      list.unshift(record)
      wx.setStorageSync('errorHistory', list.slice(0, 100))
    } catch (e) {
      console.error('错题本写入失败：', e)
    }
  }
})

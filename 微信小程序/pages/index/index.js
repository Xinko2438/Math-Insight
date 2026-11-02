const { recognizeQuestion } = require('../../utils/ocr')
const { openMain } = require('../../utils/navigation')

Page({
  data: { recognizing: false, recentRecords: [], totalRecords: 0, draftCount: 0 },
  onShow() {
    const records = wx.getStorageSync('errorHistory') || []
    this.setData({
      totalRecords: records.length,
      draftCount: (() => { try { return require('../../utils/drafts').list().length } catch (_) { return '—' } })(),
      recentRecords: records.slice(0, 3).map(record => ({
        id: record.id,
        question: record.question,
        cause: ((record.result && record.result.causeNodes) || []).map(node => node.name).filter(Boolean).slice(0, 2).join('、') || (record.result && record.result.knowledgePoint) || '查看诊断详情'
      }))
    })
  },
  goInput() { wx.navigateTo({ url: '/pages/input/input' }) },
  goDrafts() { wx.navigateTo({ url: '/pages/drafts/drafts' }) },
  goHistory() { openMain('history') },
  goStats() { openMain('stats') },
  viewRecent(e) {
    const records = wx.getStorageSync('errorHistory') || []
    const record = records.find(row => row.id === e.currentTarget.dataset.id)
    if (!record || !record.result) return
    getApp().globalData.lastResult = record.result
    getApp().globalData.lastWrongAnswer = record.wrongAnswer || ''
    wx.navigateTo({ url: '/pages/result/result' })
  },
  goCamera() {
    if (this.data.recognizing) return
    recognizeQuestion({
      onStart: () => this.setData({ recognizing: true }),
      onFinish: () => this.setData({ recognizing: false }),
      onSuccess: photo => {
        getApp().globalData.pendingPhoto = photo
        wx.navigateTo({ url: '/pages/input/input' })
      },
      onError: content => wx.showModal({ title: '识别未完成', content, showCancel: false })
    })
  }
})

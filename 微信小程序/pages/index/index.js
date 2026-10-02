// index.js
const { baseUrl } = require('../../utils/config')

Page({
  data: {
    recognizing: false
  },

  goInput() {
    wx.navigateTo({ url: '/pages/input/input' })
  },

  goHistory() {
    wx.navigateTo({ url: '/pages/history/history' })
  },

  goStats() {
    wx.navigateTo({ url: '/pages/stats/stats' })
  },

  goCamera() {
    if (this.data.recognizing) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      success: res => {
        const filePath = res.tempFiles[0].tempFilePath
        this.compressAndRecognize(filePath)
      }
    })
  },

  compressAndRecognize(filePath) {
    this.setData({ recognizing: true })
    wx.showLoading({ title: 'AI 识别中…', mask: true })
    wx.compressImage({
      src: filePath,
      quality: 60,
      success: res => this.readAndUpload(res.tempFilePath),
      fail: () => this.readAndUpload(filePath)
    })
  },

  readAndUpload(filePath) {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: r => this.uploadImage(r.data),
      fail: () => this.recognizeError('图片读取失败，请重试')
    })
  },

  uploadImage(base64) {
    wx.request({
      url: `${baseUrl}/api/ocr`,
      method: 'POST',
      timeout: 60000,
      data: { image: base64 },
      success: res => {
        const result = res.data
        if (res.statusCode !== 200 || !result || result.code !== 0 || !result.data || !result.data.text) {
          this.recognizeError((result && result.msg) || '识别失败，请重试或改用文字输入')
          return
        }
        getApp().globalData.pendingQuestion = result.data.text
        wx.navigateTo({ url: '/pages/input/input' })
      },
      fail: () => this.recognizeError('无法连接识别服务，请确认后端已启动'),
      complete: () => {
        this.setData({ recognizing: false })
        wx.hideLoading()
      }
    })
  },

  recognizeError(msg) {
    wx.showModal({ title: '识别失败', content: msg, showCancel: false })
  }
})

// history.js
Page({
  data: {
    records: [],
    filters: ['全部'],
    activeFilter: '全部',
    searchKey: '',
    filtered: []
  },

  onShow() {
    this.loadRecords()
  },

  loadRecords() {
    const records = wx.getStorageSync('errorHistory') || []
    const kps = [...new Set(records.map(r => r.result && r.result.knowledgePoint).filter(Boolean))]
    const filters = ['全部', ...kps]
    let activeFilter = this.data.activeFilter
    if (!filters.includes(activeFilter)) activeFilter = '全部'
    this.setData({ records, filters, activeFilter }, () => this.applyFilter())
  },

  applyFilter() {
    const { records, activeFilter, searchKey } = this.data
    const key = searchKey.trim().toLowerCase()
    const filtered = records.filter(r => {
      if (activeFilter !== '全部' && !(r.result && r.result.knowledgePoint === activeFilter)) return false
      if (!key) return true
      const kp = (r.result && r.result.knowledgePoint) || ''
      return r.question.toLowerCase().includes(key) || kp.toLowerCase().includes(key)
    })
    this.setData({ filtered })
  },

  onSearch(e) {
    this.setData({ searchKey: e.detail.value }, () => this.applyFilter())
  },

  onFilterTap(e) {
    this.setData({ activeFilter: e.currentTarget.dataset.kp }, () => this.applyFilter())
  },

  viewRecord(e) {
    const id = e.currentTarget.dataset.id
    const record = this.data.records.find(r => r.id === id)
    if (!record || !record.result) return
    getApp().globalData.lastResult = record.result
    wx.navigateTo({ url: '/pages/result/result' })
  },

  removeRecord(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除记录',
      content: '确定删除这条错题记录吗？',
      success: m => {
        if (!m.confirm) return
        const records = this.data.records.filter(r => r.id !== id)
        wx.setStorageSync('errorHistory', records)
        this.loadRecords()
      }
    })
  },

  clearAll() {
    if (!this.data.records.length) return
    wx.showModal({
      title: '清空错题本',
      content: '确定清空全部错题记录吗？此操作不可恢复。',
      success: m => {
        if (!m.confirm) return
        wx.removeStorageSync('errorHistory')
        this.loadRecords()
      }
    })
  }
})

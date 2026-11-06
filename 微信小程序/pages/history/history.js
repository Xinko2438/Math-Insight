// Personal labels live separately from the student's original problem records.
const TAG_KEY = 'userQuestionTags'
const math=require('../../utils/math-document')
const photos=require('../../utils/photo-assets')
const sheetLayout=require('../../utils/sheet-layout')

function readTags() {
  try {
    const value = wx.getStorageSync(TAG_KEY)
    if (!value || (Array.isArray(value) && value.length === 0)) return { tags: [], assignments: {} }
    if (!Array.isArray(value.tags) || !value.tags.every(tag => tag && typeof tag.id === 'string' && typeof tag.name === 'string') || !value.assignments || typeof value.assignments !== 'object' || Array.isArray(value.assignments) || !Object.values(value.assignments).every(Array.isArray)) return null
    return value
  } catch (_) { return null }
}

Page({
  data: {
    records: [], filters: ['全部'], knowledgeOptions: [], activeFilter: '全部', searchKey: '', filtered: [],
    tagCatalog: [], selectedTagId: '', selectedTagName: '', filterPanel: '', managingTags: false,
    editorRecordId: '', editorTags: [], tagStorageReady: true, fromReport: false
  },

  onLoad(options = {}) {
    this.pendingTagRecordId = options.tagRecordId ? String(options.tagRecordId) : ''
    if (this.pendingTagRecordId) this.setData({ fromReport: true })
  },

  onShow() {
    const id = this.pendingTagRecordId
    this.pendingTagRecordId = ''
    this.loadRecords(() => { if (id) this.openTagEditor({ currentTarget: { dataset: { id } } }) })
  },

  loadRecords(done) {
    const tagState = readTags()
    const tags = tagState ? tagState.tags : []
    const assignments = tagState ? tagState.assignments : {}
    const records = (wx.getStorageSync('errorHistory') || []).map(record => {
      const ids = Array.isArray(assignments[String(record.id)]) ? assignments[String(record.id)] : []
      return { ...record,displayQuestion:math.summary(record.questionDoc||math.fromText(record.question),record.question), tagNames: tags.filter(tag => ids.includes(tag.id)).map(tag => tag.name) }
    })
    const filters = ['全部', ...new Set(records.map(r => r.result && r.result.knowledgePoint).filter(Boolean))]
    let activeFilter = this.data.activeFilter
    if (!filters.includes(activeFilter)) activeFilter = '全部'
    let selectedTagId = this.data.selectedTagId
    if (selectedTagId && !tags.some(tag => tag.id === selectedTagId)) selectedTagId = ''
    const selectedTag = tags.find(tag => tag.id === selectedTagId)
    const selectedIds = assignments[this.data.editorRecordId] || []
    this.setData({ records, filters, knowledgeOptions: filters.slice(1), activeFilter, tagCatalog: tags, selectedTagId,
      selectedTagName: selectedTag ? selectedTag.name : '', tagStorageReady: !!tagState,
      editorTags: tags.map(tag => ({ ...tag, selected: selectedIds.includes(tag.id) })) }, () => { this.applyFilter(); if (done) done() })
  },

  applyFilter() {
    const { records, activeFilter, selectedTagId, searchKey } = this.data
    const tagState = readTags()
    const key = searchKey.trim().toLowerCase()
    const filtered = records.filter(r => {
      if (activeFilter !== '全部' && !(r.result && r.result.knowledgePoint === activeFilter)) return false
      if (selectedTagId && !(tagState && (tagState.assignments[String(r.id)] || []).includes(selectedTagId))) return false
      if (!key) return true
      const kp = (r.result && r.result.knowledgePoint) || ''
      return r.question.toLowerCase().includes(key) || kp.toLowerCase().includes(key) || r.tagNames.some(name => name.toLowerCase().includes(key))
    })
    this.setData({ filtered })
  },

  onSearch(e) { this.setData({ searchKey: e.detail.value }, () => this.applyFilter()) },
  goInput() { wx.navigateTo({ url: '/pages/input/input' }) },
  showAll() { this.setData({ activeFilter: '全部', selectedTagId: '', selectedTagName: '', filterPanel: '', managingTags: false }, () => this.applyFilter()) },
  toggleFilterPanel(e) {
    const panel = e.currentTarget.dataset.panel
    if (!['knowledge', 'tags'].includes(panel)) return
    this.setData({ filterPanel: this.data.filterPanel === panel ? '' : panel, managingTags: false })
  },
  onFilterTap(e) { this.setData({ activeFilter: e.currentTarget.dataset.kp, filterPanel: '' }, () => this.applyFilter()) },
  selectTagFilter(e) {
    const id = e.currentTarget.dataset.id || ''
    const tag = this.data.tagCatalog.find(item => item.id === id)
    this.setData({ selectedTagId: tag ? tag.id : '', selectedTagName: tag ? tag.name : '', filterPanel: '' }, () => this.applyFilter())
  },
  toggleTagManagement() { this.setData({ managingTags: !this.data.managingTags }) },

  saveTagState(state) {
    try { wx.setStorageSync(TAG_KEY, state); this.loadRecords(); return true }
    catch (_) { wx.showToast({ title: '标签保存失败，请重试', icon: 'none' }); return false }
  },
  forgetRecordTags(ids) {
    const state = readTags()
    if (!state) return
    const assignments = { ...state.assignments }
    let changed = false
    ids.forEach(id => { if (Object.prototype.hasOwnProperty.call(assignments, String(id))) { delete assignments[String(id)]; changed = true } })
    if (!changed) return
    try { wx.setStorageSync(TAG_KEY, { ...state, assignments }) }
    catch (_) { wx.showToast({ title: '标签清理失败，请稍后重试', icon: 'none' }) }
  },
  createTag(name) {
    const value = String(name || '').trim()
    const state = readTags()
    if (!state) { wx.showToast({ title: '标签读取失败', icon: 'none' }); return }
    if (!value || value.length > 20) { wx.showToast({ title: '请输入 1–20 字的标签', icon: 'none' }); return }
    if (state.tags.some(tag => tag.name.toLowerCase() === value.toLowerCase())) { wx.showToast({ title: '这个标签已存在', icon: 'none' }); return }
    const tag = { id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10), name: value }
    const assignments = { ...state.assignments }
    const recordId = this.data.editorRecordId
    if (recordId && this.data.records.some(record => String(record.id) === recordId)) assignments[recordId] = [...(assignments[recordId] || []), tag.id]
    this.saveTagState({ version: 1, tags: [...state.tags, tag], assignments })
  },
  promptCreateTag() {
    wx.showModal({ title: '新建标签', editable: true, placeholderText: '例如：期中复习', success: result => { if (result.confirm) this.createTag(result.content) } })
  },
  renameTag(id, name) {
    const value = String(name || '').trim()
    const state = readTags()
    if (!state || !state.tags.some(tag => tag.id === id)) return
    if (!value || value.length > 20) { wx.showToast({ title: '请输入 1–20 字的标签', icon: 'none' }); return }
    if (state.tags.some(tag => tag.id !== id && tag.name.toLowerCase() === value.toLowerCase())) { wx.showToast({ title: '这个标签已存在', icon: 'none' }); return }
    this.saveTagState({ ...state, tags: state.tags.map(tag => tag.id === id ? { ...tag, name: value } : tag) })
  },
  promptRenameTag(e) {
    const id = e.currentTarget.dataset.id
    const tag = this.data.tagCatalog.find(item => item.id === id)
    if (!tag) return
    wx.showModal({ title: '重命名标签', editable: true, content: tag.name, success: result => { if (result.confirm) this.renameTag(id, result.content) } })
  },
  deleteTag(id) {
    const state = readTags()
    if (!state || !state.tags.some(tag => tag.id === id)) return
    const assignments = {}
    Object.keys(state.assignments).forEach(recordId => {
      const ids = (state.assignments[recordId] || []).filter(tagId => tagId !== id)
      if (ids.length) assignments[recordId] = ids
    })
    this.saveTagState({ ...state, tags: state.tags.filter(tag => tag.id !== id), assignments })
  },
  promptDeleteTag(e) {
    const id = e.currentTarget.dataset.id
    const tag = this.data.tagCatalog.find(item => item.id === id)
    if (!tag) return
    wx.showModal({ title: '删除标签', content: `删除“${tag.name}”后，题目仍会保留。`, success: result => { if (result.confirm) this.deleteTag(id) } })
  },
  openTagEditor(e) {
    const id = String(e.currentTarget.dataset.id)
    if (!this.data.tagStorageReady) { wx.showToast({ title: '标签暂时不可用', icon: 'none' }); return }
    if (!this.data.records.some(record => String(record.id) === id)) { wx.showToast({ title: '这道题已不存在', icon: 'none' }); return }
    const viewport=sheetLayout.readMetrics(wx)
    this.setData({ editorRecordId: id, filterPanel: '', tagSheetMaxHeight:Math.max(0,viewport.height-viewport.safeTop) }, () => this.loadRecords())
  },
  closeTagEditor() {
    this.setData({ editorRecordId: '', editorTags: [] })
    if (this.data.fromReport) wx.navigateBack()
  },
  keepTagEditorOpen() {},
  toggleTagForRecord(id) {
    const state = readTags()
    const recordId = this.data.editorRecordId
    if (!state || !recordId || !this.data.records.some(record => String(record.id) === recordId) || !state.tags.some(tag => tag.id === id)) return
    const current = state.assignments[recordId] || []
    const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id]
    const assignments = { ...state.assignments }
    if (next.length) assignments[recordId] = next
    else delete assignments[recordId]
    this.saveTagState({ ...state, assignments })
  },
  onToggleRecordTag(e) { this.toggleTagForRecord(e.currentTarget.dataset.id) },

  viewRecord(e) {
    const id = e.currentTarget.dataset.id
    const record = this.data.records.find(r => r.id === id)
    if (!record || !record.result) return
    getApp().globalData.lastResult = record.result
    getApp().globalData.lastWrongAnswer = record.wrongAnswer || ''
    getApp().globalData.lastQuestionDoc=record.questionDoc||record.result.questionDoc||null;getApp().globalData.lastWrongAnswerDoc=record.wrongAnswerDoc||record.result.wrongAnswerDoc||null;getApp().globalData.lastSourceImage=record.sourceImage||null
    wx.navigateTo({ url: '/pages/result/result?recordId=' + encodeURIComponent(id) })
  },
  removeRecord(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({ title: '删除记录', content: '确定删除这条错题记录吗？', success: m => {
      if (!m.confirm) return
      const old=(wx.getStorageSync('errorHistory')||[]).find(r=>r.id===id)
      const records = (wx.getStorageSync('errorHistory') || []).filter(r => r.id !== id)
      wx.setStorageSync('errorHistory', records)
      photos.releaseIfUnused(old&&old.sourceImage)
      this.forgetRecordTags([id])
      this.loadRecords()
    } })
  },
  clearAll() {
    if (!this.data.records.length) return
    wx.showModal({ title: '清空错题本', content: '确定清空全部错题记录吗？此操作不可恢复。', success: m => {
      if (!m.confirm) return
      const old=wx.getStorageSync('errorHistory')||[]
      const ids = old.map(record => record.id)
      wx.removeStorageSync('errorHistory')
      old.forEach(record=>photos.releaseIfUnused(record.sourceImage))
      this.forgetRecordTags(ids)
      this.loadRecords()
    } })
  }
})

// Each record is the source of truth; the index can always be rebuilt.
const PREFIX = 'mathDraft:'
const INDEX = 'mathDraftIndex'
let sequence = 0
function get(id) {
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return null
  const row = wx.getStorageSync(PREFIX + id)
  return row && typeof row === 'object' && row.id === id ? row : null
}
function list() {
  const keys = wx.getStorageInfoSync().keys || []
  return keys.filter(key => key.indexOf(PREFIX) === 0).map(key => get(key.slice(PREFIX.length))).filter(Boolean).sort((a,b) => b.updatedAt - a.updatedAt)
}
function newId() {
  let id
  do { id = 'd' + Date.now().toString(36) + (++sequence).toString(36) } while (get(id))
  return id
}
function save(draft) {
  const id = draft.id || newId()
  const previous = get(id)
  if ((previous ? previous.revision : 0) !== draft.revision) throw Error('draft conflict')
  const saved = { id, question: draft.question || '', wrongAnswer: draft.wrongAnswer || '', ocrReview: Array.isArray(draft.ocrReview) ? draft.ocrReview : [], revision: draft.revision + 1, updatedAt: Date.now() }
  wx.setStorageSync(PREFIX + id, saved)
  try { wx.setStorageSync(INDEX, list().map(row => row.id)) } catch (_) { /* source record remains discoverable */ }
  return saved
}
function remove(id) {
  if (!get(id)) return
  wx.removeStorageSync(PREFIX + id)
  try { wx.setStorageSync(INDEX, list().map(row => row.id)) } catch (_) { /* index is a projection */ }
}
module.exports = { get, list, save, remove, newId }

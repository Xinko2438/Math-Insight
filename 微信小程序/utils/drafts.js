// Each record is the source of truth; the index can always be rebuilt.
const PREFIX = 'mathDraft:'
const INDEX = 'mathDraftIndex'
const math = require('./math-document')
let sequence = 0
function editorKey(session){return session&&['question','wrongAnswer'].includes(session.field)&&typeof session.id==='string'?session.field+':'+session.id:''}
function editorBank(record){const bank={};if(record.editorDrafts&&typeof record.editorDrafts==='object'&&!Array.isArray(record.editorDrafts))for(const value of Object.values(record.editorDrafts)){const key=editorKey(value);if(key)bank[key]=math.clone(value)}const legacy=record.editorDraft,key=editorKey(legacy);if(record.editorDraftsVersion!==2&&key&&!bank[key])bank[key]=math.clone(legacy);return bank}
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
  if(draft.questionDoc){saved.questionDoc=math.validateDoc(draft.questionDoc,2000);saved.question=math.toText(saved.questionDoc)}
  if(draft.wrongAnswerDoc){saved.wrongAnswerDoc=math.validateDoc(draft.wrongAnswerDoc,1000);saved.wrongAnswer=math.toText(saved.wrongAnswerDoc)}
  for(const key of ['sourceImage','sourceTranscription','docGenerations'])if(draft[key])saved[key]=math.clone(draft[key])
  const bank=editorBank(draft),active=editorKey(draft.editorDraft)
  saved.editorDraftsVersion=2;saved.editorDrafts=bank
  // Compatibility pointer is derived from the bank, never a second draft truth.
  if(bank[active]||Object.keys(bank).length)saved.editorDraft=bank[active]||Object.values(bank)[0]
  wx.setStorageSync(PREFIX + id, saved)
  try { wx.setStorageSync(INDEX, list().map(row => row.id)) } catch (_) { /* source record remains discoverable */ }
  return saved
}
function remove(id) {
  if (!get(id)) return
  wx.removeStorageSync(PREFIX + id)
  try { wx.setStorageSync(INDEX, list().map(row => row.id)) } catch (_) { /* index is a projection */ }
}
module.exports = { get, list, save, remove, newId, editorKey, editorBank }

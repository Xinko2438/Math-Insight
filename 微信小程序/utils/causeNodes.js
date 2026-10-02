// 错因节点库 —— 从后端获取（唯一数据源在 server/causeNodes.js，前端不再硬编码）
// 首次进入页面时请求 /api/cause-nodes 并缓存到本地 storage；
// 后端增删改节点后，前端每次冷启动会自动刷新，无需改小程序代码。
// 后端不可用时回退到上次缓存，保证错题本/学情分析离线可用。
const { baseUrl } = require('./config')

const STORAGE_KEY = 'causeNodeLib'
const DEFAULT_CATEGORIES = ['知识性错误', '方法性错误', '计算性错误', '审题性错误']

let lib = null          // 内存缓存：{ kpOrder, categories, nodes }
let pendingCbs = []     // 并发调用时等待同一请求的回调
let fetching = false

function readStorage() {
  try { return wx.getStorageSync(STORAGE_KEY) || null } catch (e) { return null }
}

function fetchLibrary(cb) {
  pendingCbs.push(cb)
  if (fetching) return
  fetching = true
  wx.request({
    url: `${baseUrl}/api/cause-nodes`,
    method: 'GET',
    timeout: 8000,
    success: res => {
      const data = res.data && res.data.code === 0 && res.data.data
      if (res.statusCode === 200 && data && Array.isArray(data.nodes) && data.nodes.length) {
        lib = { kpOrder: data.kpOrder || [], categories: data.categories || DEFAULT_CATEGORIES, nodes: data.nodes }
        try { wx.setStorageSync(STORAGE_KEY, lib) } catch (e) {}
      }
    },
    complete: () => {
      fetching = false
      // 接口失败时回退到上次缓存，仍无则空库兜底（页面自行提示）
      if (!lib) lib = readStorage() || { kpOrder: [], categories: DEFAULT_CATEGORIES, nodes: [] }
      const cbs = pendingCbs.splice(0)
      cbs.forEach(fn => { try { fn(lib) } catch (e) {} })
    }
  })
}

// 异步获取节点库（所有用到节点库的页面统一入口）
// cb(lib)：lib = { kpOrder: 考点顺序数组, categories: 错因大类数组, nodes: 节点数组 }
function loadLibrary(cb) {
  if (lib) return cb(lib)
  // 有本地缓存先立即回调，保证页面秒开；后台刷新供下次使用
  const cached = readStorage()
  if (cached && Array.isArray(cached.nodes) && cached.nodes.length) {
    lib = cached
    cb(lib)
    if (!fetching) fetchLibrary(() => {})
    return
  }
  fetchLibrary(cb)
}

// 同步取当前内存中的库（未加载完成时返回 null）
function getLibrary() {
  return lib
}

function findNode(ref) {
  if (!ref || !lib) return null
  return lib.nodes.find(n => n.id === ref.id || n.name === ref.name) || null
}

// 为历史记录中的节点补全 category / kp（兼容旧数据无分类的情况）
function resolveNode(ref) {
  const node = findNode(ref)
  if (node) return { id: node.id, name: node.name, kp: node.kp, category: node.category }
  return {
    id: (ref && ref.id) || '',
    name: (ref && ref.name) || '',
    kp: (ref && ref.kp) || '通用',
    category: (ref && ref.category) || ''
  }
}

module.exports = { loadLibrary, getLibrary, findNode, resolveNode }

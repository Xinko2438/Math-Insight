// stats.js
const { loadLibrary } = require('../../utils/causeNodes')

Page({
  data: {
    total: 0,
    topKp: '',
    topCause: '',
    kpStats: [],
    causeStats: [],
    causeTree: []
  },

  onShow() {
    // 错因树需要完整节点库（含未触发的灰色节点），先确保库已加载
    loadLibrary(() => this.compute())
  },

  compute() {
    const lib = require('../../utils/causeNodes').getLibrary() || { kpOrder: [], categories: [], nodes: [] }
    const records = wx.getStorageSync('errorHistory') || []
    const kpMap = {}
    const causeMap = {}
    const countMap = {} // 库节点 id -> 次数
    const extraMap = {} // 未入库的旧节点：名称 -> 次数

    records.forEach(r => {
      const kp = r.result && r.result.knowledgePoint
      if (kp) kpMap[kp] = (kpMap[kp] || 0) + 1
      const nodes = (r.result && r.result.causeNodes) || []
      nodes.forEach(n => {
        if (!n || !n.name) return
        causeMap[n.name] = (causeMap[n.name] || 0) + 1
        const hit = lib.nodes.find(m => m.id === n.id || m.name === n.name)
        if (hit) {
          countMap[hit.id] = (countMap[hit.id] || 0) + 1
        } else {
          extraMap[n.name] = (extraMap[n.name] || 0) + 1
        }
      })
    })

    // 考点分布：条数 + 占总错题数的百分比（条形长度即百分比）
    const kpStats = Object.entries(kpMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
    kpStats.forEach(s => {
      s.percent = records.length ? Math.round(s.count / records.length * 100) : 0
    })

    const causeStats = Object.entries(causeMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
    const causeMax = causeStats.length ? causeStats[0].count : 1
    causeStats.forEach(s => { s.percent = Math.round(s.count / causeMax * 100) })

    // 完整三层错因树：考点（枝干）-> 错因大类（分枝）-> 节点（叶子）
    // 未出现过的节点保留显示 ×0，形成完整错因地图
    const causeTree = lib.kpOrder.map(kp => {
      const kpNodes = lib.nodes.filter(n => n.kp === kp)
      const categories = lib.categories.map(cat => {
        const children = kpNodes
          .filter(n => n.category === cat)
          .map(n => ({ id: n.id, name: n.name, count: countMap[n.id] || 0 }))
          .sort((a, b) => b.count - a.count)
        return { name: cat, count: children.reduce((sum, c) => sum + c.count, 0), children }
      }).filter(c => c.children.length)
      const count = categories.reduce((sum, c) => sum + c.count, 0)
      return { name: kp, count, categories, expanded: false }
    })
    // 未入库的历史节点挂到「其他」枝干，避免旧数据丢失
    const extraChildren = Object.entries(extraMap)
      .map(([name, count]) => ({ id: '', name, count }))
      .sort((a, b) => b.count - a.count)
    if (extraChildren.length) {
      const count = extraChildren.reduce((sum, c) => sum + c.count, 0)
      causeTree.push({ name: '其他', count, categories: [{ name: '未分类', count, children: extraChildren }], expanded: false })
    }
    // 有记录的枝干按次数排前面，无记录的保持库顺序沉底
    causeTree.sort((a, b) => b.count - a.count || lib.kpOrder.indexOf(a.name) - lib.kpOrder.indexOf(b.name))
    // 默认展开第一个有记录的枝干
    const firstHit = causeTree.findIndex(b => b.count > 0)
    if (firstHit >= 0) causeTree[firstHit].expanded = true

    this.setData({
      total: records.length,
      topKp: kpStats.length ? kpStats[0].name : '',
      topCause: causeStats.length ? causeStats[0].name : '',
      kpStats,
      causeStats,
      causeTree
    })
  },

  toggleBranch(e) {
    const idx = e.currentTarget.dataset.index
    this.setData({ [`causeTree[${idx}].expanded`]: !this.data.causeTree[idx].expanded })
  }
})

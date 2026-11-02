// stats.js
const { loadLibrary } = require('../../utils/causeNodes')
const { openMain } = require('../../utils/navigation')

Page({
  data: {
    total: 0,
    kpCount: 0,
    causeCount: 0,
    causeTotal: 0,
    topKp: '',
    topCause: '',
    kpStats: [],
    kpDisplay: [{ name: '全部考点', count: 0, percent: 0 }],
    kpRows: [{ key: '全部考点', items: [{ name: '全部考点', count: 0, percent: 0 }] }],
    causeStats: [],
    causeDisplay: [{ name: '错因记录', count: 0 }],
    causeTree: []
  },

  onShow() {
    // 先呈现本地记录，再用完整节点库补齐未触发的考点与错因
    this.compute()
    loadLibrary(() => this.compute())
  },

  goInput() { wx.navigateTo({ url: '/pages/input/input' }) },
  goHistory() { openMain('history') },

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
    // 零记录与有记录共用完整分类及稳定顺序，只更新数值
    const kpNames = [...lib.kpOrder, ...Object.keys(kpMap).filter(name => !lib.kpOrder.includes(name))]
    const kpDisplay = (kpNames.length ? kpNames : ['全部考点'])
      .map(name => ({ name, count: kpMap[name] || 0, percent: records.length ? Math.round((kpMap[name] || 0) / records.length * 100) : 0 }))
    // 显式两项一行，避免原生百分比宽度取整后 wrap 将第二列挤到下一行
    const kpRows = []
    for (let i = 0; i < kpDisplay.length; i += 2) {
      const items = kpDisplay.slice(i, i + 2)
      kpRows.push({ key: items.map(item => item.name).join('|'), items })
    }

    const causeStats = Object.entries(causeMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
    const causeMax = causeStats.length ? causeStats[0].count : 1
    causeStats.forEach(s => { s.percent = Math.round(s.count / causeMax * 100) })
    const causeDisplay = lib.categories.map(name => ({ name, count: lib.nodes
      .filter(node => node.category === name)
      .reduce((sum, node) => sum + (countMap[node.id] || 0), 0) }))
    const extraCount = Object.values(extraMap).reduce((sum, count) => sum + count, 0)
    if (extraCount) causeDisplay.push({ name: '未分类', count: extraCount })
    if (!causeDisplay.length) causeDisplay.push({ name: '错因记录', count: 0 })

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

    this.setData({
      total: records.length,
      kpCount: Object.keys(kpMap).length,
      causeCount: Object.keys(causeMap).length,
      causeTotal: Object.values(causeMap).reduce((sum, count) => sum + count, 0),
      topKp: kpStats.length ? kpStats[0].name : '',
      topCause: causeStats.length ? causeStats[0].name : '',
      kpStats,
      kpDisplay,
      kpRows,
      causeStats,
      causeDisplay,
      causeTree
    })
  },

  toggleBranch(e) {
    const idx = e.currentTarget.dataset.index
    this.setData({ [`causeTree[${idx}].expanded`]: !this.data.causeTree[idx].expanded })
  }
})

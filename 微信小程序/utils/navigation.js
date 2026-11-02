const MAIN_ROUTES = { home: 'pages/index/index', history: 'pages/history/history', stats: 'pages/stats/stats' }

function openMain(key) {
  const route = MAIN_ROUTES[key]
  if (!route) return
  const pages = getCurrentPages()
  const index = pages.findIndex(page => page.route === route)
  if (index === pages.length - 1 && index !== -1) return
  if (index !== -1) wx.navigateBack({ delta: pages.length - 1 - index })
  else wx.navigateTo({ url: '/' + route })
}

module.exports = { openMain }

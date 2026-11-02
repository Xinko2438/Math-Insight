// Source-backed layout projection for the two zero-record screens.
// Browser pixels are explicitly separate from native simulator evidence.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { host, record } = require('./verify-native-ui.cjs');
const root = path.resolve(__dirname, '..');
const mini = path.join(root, '微信小程序');
const work = path.join(root, '_work/native-automation');
const reportPath = path.join(root, 'docs/ui-implementation/zero-data-preview.json');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = relative => fs.readFileSync(path.join(mini, relative), 'utf8');
const files = ['app.wxss', 'components/study-tabs/study-tabs.wxml', 'components/study-tabs/study-tabs.wxss',
  ...['history', 'stats'].flatMap(name => ['js', 'wxml', 'wxss'].map(ext => `pages/${name}/${name}.${ext}`)), '../server/causeNodes.js'];

async function build() {
  const { chromium } = require('D:/windows_ext/Desktop/AI_Native/toolbox/html-prototype-headless-verify/node_modules/playwright');
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const images = [];
  const checks = [];
  let requests = 0;
  try {
    for (const scenario of [
      { name: 'history', title: '错题本 · 0 道', width: 390 },
      { name: 'stats', title: '学情 · 全部为 0', width: 390 },
      { name: 'stats', title: '学情 · 1 道示例记录', width: 390, populated: true },
      { name: 'stats', title: '学情 · 展开错因分类', width: 390, expanded: true },
      { name: 'stats', title: '学情 · 375px 零记录', width: 375 },
      { name: 'stats', title: '学情 · 375px 有记录', width: 375, populated: true }
    ]) {
      const h = host(scenario.populated ? [record(900001)] : []);
      const nativePage = h.page(scenario.name);
      nativePage.onShow();
      if (scenario.expanded) nativePage.toggleBranch({ currentTarget: { dataset: { index: 0 } } });
      const page = await browser.newPage({ viewport: { width: scenario.width, height: 844 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', route => { requests++; return route.abort(); });
      const css = [read('app.wxss'), read(`pages/${scenario.name}/${scenario.name}.wxss`), read('components/study-tabs/study-tabs.wxss')]
        .join('\n').replace(/(-?[\d.]+)rpx/g, (_, number) => `${Number(number) * scenario.width / 750}px`);
      await page.setContent(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>
        body{margin:0}view,scroll-view,navigation-bar,study-tabs{display:block}text{display:inline}button{border:0}input{border:0;background:transparent;outline:none;font:inherit;padding:0}page{width:100vw}
        ${css}
        .page{overflow:auto;scrollbar-width:none}.preview-navigation{height:102px;flex-shrink:0;display:flex;align-items:flex-end;justify-content:center;padding-bottom:12px;font-size:17px;font-weight:500}
      </style><page></page></html>`);
      await page.evaluate(({ xml, tabs, state }) => {
        // Only bindings/loops used by these two source templates are supported.
        // Fail on unsupported directives rather than silently inventing a view.
        const value = (expression, scope) => Function('scope', `with(scope){return (${expression})}`)(scope);
        const bind = (text, scope) => text.replace(/{{([\s\S]*?)}}/g, (_, expression) => String(value(expression, scope) ?? ''));
        const array = (expression, scope) => value(expression.replace(/^{{|}}$/g, ''), scope);
        function render(node, scope, loop = false) {
          if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(bind(node.textContent, scope));
          if (node.nodeType !== Node.ELEMENT_NODE) return document.createTextNode('');
          if (node.hasAttribute('wx:else') || node.hasAttribute('wx:elif')) throw Error('Unsupported conditional in projection');
          if (!loop && node.hasAttribute('wx:for')) {
            const fragment = document.createDocumentFragment();
            array(node.getAttribute('wx:for'), scope).forEach((item, index) => fragment.append(render(node, {
              ...scope, [node.getAttribute('wx:for-item') || 'item']: item, [node.getAttribute('wx:for-index') || 'index']: index
            }, true)));
            return fragment;
          }
          if (node.hasAttribute('wx:if') && !array(node.getAttribute('wx:if'), scope)) return document.createTextNode('');
          if (node.tagName === 'NAVIGATION-BAR') {
            const nav = document.createElement('view'); nav.className = 'preview-navigation'; nav.textContent = node.getAttribute('title'); return nav;
          }
          if (node.tagName === 'STUDY-TABS') return template(tabs, { active: node.getAttribute('active') });
          const result = node.tagName === 'BLOCK' ? document.createDocumentFragment() : document.createElement(node.tagName.toLowerCase());
          if (result.nodeType === Node.ELEMENT_NODE) for (const attr of node.attributes) {
            if (!/^(wx:|bind|catch)/.test(attr.name)) result.setAttribute(attr.name, bind(attr.value, scope));
          }
          for (const child of node.childNodes) result.append(render(child, scope));
          return result;
        }
        function template(source, scope) {
          const dom = new DOMParser().parseFromString(source, 'text/html');
          const fragment = document.createDocumentFragment();
          for (const node of dom.body.childNodes) fragment.append(render(node, scope));
          return fragment;
        }
        document.querySelector('page').append(template(xml, state));
      }, { xml: read(`pages/${scenario.name}/${scenario.name}.wxml`), tabs: read('components/study-tabs/study-tabs.wxml'), state: nativePage.data });
      assert.equal(errors.length, 0, errors.join('\n'));
      const body = await page.locator('page').innerText();
      assert.ok(!/还没有|暂无|录入一道|去录入|undefined|NaN/.test(body));
      if (scenario.name === 'history') {
        assert.equal(await page.locator('.search-input').count(), 1);
        assert.equal(await page.locator('.filter-tab').count(), 3);
        assert.match(await page.locator('.record-count').innerText(), /^0 道$/);
        assert.equal(await page.locator('.record').count(), 0);
      } else {
        assert.deepEqual(await page.locator('.metric-value').allTextContents(), scenario.populated ? ['1', '1', '1'] : ['0', '0', '0']);
        assert.equal(await page.locator('.bar-row').count(), 12);
        assert.equal(await page.locator('.cause-row').count(), 4);
        assert.ok(await page.locator('.branch-head').count() > 0);
        const geometry = await page.locator('.distribution .bar-label').evaluateAll(rows => rows.every(row => {
          const [left, right] = row.children; return left.getBoundingClientRect().right <= right.getBoundingClientRect().left;
        }));
        assert.ok(geometry, 'Zero chart label overlap');
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal viewport overflow');
      if (scenario.expanded) await page.locator('.page').evaluate(el => { el.scrollTop = el.scrollHeight; });
      const suffix = (scenario.expanded ? '-expanded' : '') + (scenario.width === 375 ? '-375' : '') + (scenario.populated ? '-populated' : '');
      const file = path.join(work, `zero-${scenario.name}-html${suffix}.png`);
      await page.screenshot({ path: file });
      const bytes = fs.readFileSync(file);
      images.push({ title: scenario.title, file: path.relative(root, file), sha256: sha(bytes), note: 'HTML 布局预览，由当前 WXML、WXSS 和隔离示例数据生成；不是微信原生或真机截图。' });
      checks.push({ screen: scenario.name, width: scenario.width, expanded: !!scenario.expanded, populated: !!scenario.populated, status: 'PASS', errors });
      assert.equal(h.calls.length, 0, 'Projection must never mutate storage or navigate');
      await page.close();
    }
    assert.equal(requests, 0, 'Offline projection attempted network access');
    const report = { status: 'PASS', layer: 'source-backed browser layout projection; NOT native rendering', nativeRenderingVerified: false,
      modelRequests: 0, realStorageWrites: 0, foregroundActions: 0, networkRequests: requests,
      sourceHashes: files.map(file => ({ file: path.relative(root, path.join(mini, file)), sha256: sha(fs.readFileSync(path.join(mini, file))) })), checks, images };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    const gallery = require('./build-screenshot-gallery.cjs').build();
    console.log(JSON.stringify({ status: report.status, checks: checks.length, gallery: gallery.output }));
  } finally { await browser.close(); }
}
build().catch(e => { console.error(e); process.exitCode = 1; });

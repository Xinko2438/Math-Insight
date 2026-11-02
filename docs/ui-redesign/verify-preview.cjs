// Project-specific, offline visual checks. Uses an already installed runtime.
const { chromium } = require('D:/windows_ext/Desktop/AI_Native/toolbox/html-prototype-headless-verify/node_modules/playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const root = __dirname;
const report = { date: '2026-10-31', scope: 'offline HTML candidate only; no WeChat or model calls', directions: {}, consoleErrors: [], externalRequests: [], acceptedByUser: false };
const url = (file, query = '') => pathToFileURL(path.join(root, file)).href + query;
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    context.on('page', p => {
      p.on('pageerror', e => report.consoleErrors.push(e.message));
      p.on('console', msg => { if (msg.type() === 'error') report.consoleErrors.push(msg.text()); });
      p.on('request', req => { if (/^https?:/.test(req.url())) report.externalRequests.push(req.url()); });
    });
    const page = await context.newPage();
    for (const dir of ['a', 'b', 'c']) {
      const checks = [];
      await page.goto(url(`dir-${dir}.html`, '?embed=1&screen=home'));
      if (dir === 'a') {
        assert.equal(await page.locator('.row-math').count(), 0);
        assert.equal(await page.locator('.brand-symbol').count(), 0);
        const fontSession = await context.newCDPSession(page);
        await fontSession.send('DOM.enable');
        await fontSession.send('CSS.enable');
        const dom = await fontSession.send('DOM.getDocument');
        report.typography = [];
        for (const selector of ['.page-title', '.scan-card h3', '.row-title']) {
          const { nodeId } = await fontSession.send('DOM.querySelector', { nodeId: dom.root.nodeId, selector });
          const { fonts } = await fontSession.send('CSS.getPlatformFontsForNode', { nodeId });
          const style = await page.locator(selector).first().evaluate(e => ({
            family: getComputedStyle(e).fontFamily, weight: getComputedStyle(e).fontWeight,
            size: getComputedStyle(e).fontSize, spacing: getComputedStyle(e).letterSpacing
          }));
          assert.ok(['normal', '0px'].includes(style.spacing));
          assert.ok(Number(style.weight) <= 500);
          assert.ok(fonts.length > 0 && fonts.every(f => !/bold|times|simsun/i.test(f.postScriptName)));
          report.typography.push({ selector, style, fonts });
        }
        await fontSession.detach();
        checks.push('blue direction uses regular UI sans fonts and no letter-tile icons');
      }
      await page.locator('[data-nav="input"]').first().click();
      await page.getByLabel('错题题干', { exact: true }).fill('');
      assert.equal(await page.locator('#analyze').isDisabled(), true);
      checks.push('empty question disables analysis');
      await page.locator('[data-action="fixture"]').click();
      await page.locator('#analyze').click();
      await page.locator('[data-tab="steps"]').waitFor();
      assert.equal(await page.locator('.wx-name').textContent(), '诊断报告');
      checks.push('fixture input navigates to report');
      assert.equal(await page.locator('.reveal').count(), 0);
      assert.equal(await page.locator('.solution').count(), 0);
      await page.locator('[data-hint="0"]').click();
      assert.match(await page.locator('.reveal').textContent(), /分配律/);
      checks.push('hint hidden until requested');
      await page.locator('[data-action="solution"]').click();
      assert.match(await page.locator('.solution').textContent(), /x = 10/);
      checks.push('full solution explicitly expanded');
      await page.locator('[data-tab="variants"]').click();
      assert.equal(await page.locator('.variant').count(), 3);
      await page.locator('[data-variant="0"]').click();
      assert.match(await page.locator('.variant .reveal').textContent(), /7\/2/);
      checks.push('three variants with independent answer expansion');
      await page.locator('[data-tab="diagnosis"]').click();
      assert.match(await page.locator('.diagnosis').textContent(), /忘记变为/);
      await page.getByLabel('向 AI 老师追问', { exact: true }).fill('为什么移项要变号？');
      await page.getByLabel('发送追问', { exact: true }).click();
      assert.match(await page.locator('.chat-error').textContent(), /暂未收到回复/);
      checks.push('follow-up failure shown without fabricated response');
      await page.locator('[data-nav="home"]').first().click();
      await page.locator('[data-action="camera"]').click();
      assert.match(await page.getByRole('dialog').textContent(), /不申请相机权限/);
      await page.getByRole('button', { name: '知道了', exact: true }).click();
      checks.push('camera path is honestly labelled offline');
      await page.goto(url(`dir-${dir}.html`, '?embed=1&screen=history'));
      await page.getByLabel('搜索错题', { exact: true }).fill('没有这道题');
      assert.match(await page.locator('#records').textContent(), /没有找到/);
      await page.getByLabel('搜索错题', { exact: true }).fill('');
      await page.locator('[data-filter="方程"]').click();
      assert.equal(await page.locator('.record').count(), 3);
      await page.locator('[data-record="0"]').click();
      assert.equal(await page.locator('.wx-name').textContent(), '诊断报告');
      checks.push('history search, topic filter and record reopening');
      await page.goto(url(`dir-${dir}.html`, '?embed=1&screen=stats'));
      assert.equal(await page.locator('.stat-big').textContent(), '8');
      assert.equal(await page.locator('.bar-row').count(), 3);
      await page.locator('.tree summary').click();
      assert.equal(await page.locator('.tree').getAttribute('open'), '');
      checks.push('statistics derived from eight synthetic records; tree expands');
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        for (const screen of ['home', 'input', 'result', 'history', 'stats']) {
          await page.goto(url(`dir-${dir}.html`, `?embed=1&screen=${screen}`));
          const dimensions = await page.evaluate(() => ({
            doc: document.documentElement.scrollWidth, client: document.documentElement.clientWidth,
            content: document.querySelector('.content').scrollWidth, available: document.querySelector('.content').clientWidth
          }));
          assert.ok(dimensions.doc <= dimensions.client + 1 && dimensions.content <= dimensions.available + 1, `${dir}/${screen}/${width}: ${JSON.stringify(dimensions)}`);
        }
      }
      checks.push('all five pages fit 320 and 390 widths without horizontal overflow');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(url(`dir-${dir}.html`, '?embed=1&screen=result'));
      await page.screenshot({ path: path.join(root, `result-${dir}.png`) });
      await page.setViewportSize({ width: 1440, height: 1100 });
      await page.goto(url(`dir-${dir}.html`));
      assert.equal(await page.locator('iframe').count(), 5);
      await Promise.all(page.frames().filter(f => f !== page.mainFrame()).map(f => f.locator('.wx-name').waitFor()));
      await page.screenshot({ path: path.join(root, `dir-${dir}.png`), fullPage: true });
      report.directions[dir] = { checks, pass: true, viewport: '390x844', narrowWidth: 320 };
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto(url('index.html'));
    await Promise.all(page.frames().filter(f => f !== page.mainFrame()).map(f => f.locator('.wx-name').waitFor()));
    await page.locator('[data-screen="result"]').click();
    await Promise.all(page.frames().filter(f => f !== page.mainFrame()).map(f => f.locator('[data-tab="steps"]').waitFor()));
    await page.locator('[data-screen="home"]').click();
    await Promise.all(page.frames().filter(f => f !== page.mainFrame()).map(f => f.locator('.welcome').waitFor()));
    await page.screenshot({ path: path.join(root, 'comparison.png'), fullPage: true });
    await page.goto(url('thumbs.html'));
    assert.equal(await page.locator('.study').count(), 6);
    await page.screenshot({ path: path.join(root, 'thumbs.png'), fullPage: true });
    await page.setViewportSize({ width: 860, height: 1000 });
    await page.goto(url('dir-a.html'));
    await page.setContent(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}body{margin:0;padding:28px;background:#edf1f8;color:#20314a;font-family:Arial,"DengXian","Microsoft YaHei",sans-serif}
      h1{font-size:24px;font-weight:500;margin:0 0 9px}header p{font-size:14px;color:#68758b;margin:0 0 25px}
      main{display:flex;gap:24px}figure{width:390px;margin:0}figcaption{font-size:14px;margin-bottom:12px}
      iframe{width:390px;height:844px;border:1px solid #dfe5ef;border-radius:20px;background:white}
    </style></head><body><header><h1>蓝色方案 / 字体与列表修订</h1><p>减轻字重，放松字距，去掉数学字母方块徽标。</p></header><main>
      <figure><figcaption>首页</figcaption><iframe title="字体修订首页" src="${url('dir-a.html', '?embed=1&screen=home')}"></iframe></figure>
      <figure><figcaption>诊断报告</figcaption><iframe title="字体修订报告" src="${url('dir-a.html', '?embed=1&screen=result')}"></iframe></figure>
    </main></body></html>`);
    await Promise.all(page.frames().filter(f => f !== page.mainFrame()).map(f => f.locator('.wx-name').waitFor()));
    await page.screenshot({ path: path.join(root, 'typography-a.png'), fullPage: true });
    assert.deepEqual(report.consoleErrors, []);
    assert.deepEqual(report.externalRequests, []);
    report.status = 'PASS';
    fs.writeFileSync(path.join(root, 'verification.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ status: report.status, directions: Object.keys(report.directions), consoleErrors: 0, externalRequests: 0, screenshots: 8, acceptedByUser: false }));
  } catch (error) {
    report.status = 'FAIL'; report.failure = error.stack;
    fs.writeFileSync(path.join(root, 'verification.json'), JSON.stringify(report, null, 2));
    throw error;
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });

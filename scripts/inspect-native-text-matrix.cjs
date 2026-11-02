const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { connect } = require('./verify-native-background.cjs');
const root = path.resolve(__dirname, '..');
const versionArgument = process.argv.find(argument => argument.startsWith('--lib='));
const libVersion = versionArgument ? versionArgument.split('=')[1] : undefined;
assert.ok(!libVersion || ['3.17.6', '3.12.1'].includes(libVersion));
const labelArgument = process.argv.find(argument => argument.startsWith('--label='));
const label = labelArgument ? labelArgument.split('=')[1] : '';
assert.ok(!label || /^[a-z0-9-]{1,40}$/.test(label));
const onlyArgument = process.argv.find(argument => argument.startsWith('--only='));
const only = onlyArgument ? onlyArgument.split('=')[1].split(',') : null;
const out = path.join(root, '_work/native-automation/text-matrix' + (label ? '-' + label : libVersion ? '-' + libVersion : ''));
const values = { lf: '1、解题：\n中文作答\nx = 3', crlf: '1、解题：\r\n中文作答\r\nx = 3', ls: '1、解题：\u2028中文作答\u2028x = 3', ps: '1、解题：\u2029中文作答\u2029x = 3', zh: '中文作答\n1、解题：\nx = 3' };
(async () => {
  const client = await connect(undefined, { fixtureProfile: 'text-matrix', libVersion });
  const rows = [];
  try {
    assert.equal((await client.currentPage()).path, 'pages/index/index');
    assert.equal((await client.send('Tool.getInfo')).SDKVersion, libVersion || '3.17.6');
    await client.send('App.callWxMethod', { method: 'navigateTo', args: [{ url: '/pages/input/input' }] });
    let page;
    for (let i = 0; i < 30; i++) { page = await client.currentPage(); if (page.path === 'pages/input/input') break; await new Promise(r => setTimeout(r, 100)); }
    assert.equal(page.path, 'pages/input/input');
    await client.send('App.callFunction', { functionDeclaration: 'function(values){getCurrentPages().slice(-1)[0].setData(values)}', args: [values] });
    fs.mkdirSync(out, { recursive: true });
    const scroll = await client.inspect(page, '.probe-scroll');
    let y = 0;
    for (let i = 0; i < client.lab.fixtureCases.length; i++) {
      const info = client.lab.fixtureCases[i];
      if (only && !only.includes(info.name)) continue;
      let group = await client.inspect(page, '.case-' + i);
      y += group.offset.top - scroll.offset.top;
      await client.send('Element.callFunction', { ...scroll.params, functionName: 'scroll-view.scrollTo', args: [0, Math.max(0, y)] });
      await new Promise(r => setTimeout(r, 220));
      y = (await client.send('Element.callFunction', { ...scroll.params, functionName: 'scroll-view.scrollTop', args: [] })).result;
      const bounds = [];
      for (const type of ['text', 'input']) {
        const e = await client.inspect(page, '.' + type + '-' + i);
        assert.ok(!e.missing);
        bounds.push({ kind: type, left: e.offset.left, top: e.offset.top, width: e.dimensions.properties[0], height: e.dimensions.properties[1] });
      }
      const shot = await client.send('App.captureScreenshot');
      const file = path.join(out, info.name + '.png');
      fs.writeFileSync(file, Buffer.from(shot.data.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
      rows.push({ ...info, file, bounds });
    }
    const analysis = spawnSync('python', ['-c', String.raw`
import sys,json
from PIL import Image
rows=json.loads(sys.argv[1])
for row in rows:
 im=Image.open(row['file']).convert('RGB');s=im.width/390
 for b in row['bounds']:
  c=im.crop((round(b['left']*s),round(b['top']*s),round((b['left']+b['width'])*s),round((b['top']+b['height'])*s)))
  ys=[y for y in range(c.height) if sum(1 for x in range(c.width) if max(c.getpixel((x,y)))<175)>=4]
  bands=[]
  for y in ys:
   if not bands or y-bands[-1][-1]>7:bands.append([y])
   else:bands[-1].append(y)
  b['textBands']=len([g for g in bands if len(g)>=4])
print(json.dumps(rows,ensure_ascii=False))
`, JSON.stringify(rows)], { encoding: 'utf8' });
    assert.equal(analysis.status, 0, analysis.stderr);
    assert.ok(rows.length > 0);
    const result = { fixture: 'text-matrix', libVersion: client.lab.sdkVersion, fixtureOptions: client.lab.fixtureOptions || {}, modelCalls: 0, originalValues: values, rows: JSON.parse(analysis.stdout) };
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result.rows.map(row => ({ name: row.name, bands: row.bounds.map(b => b.textBands) })), null, 2));
  } finally { client.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });

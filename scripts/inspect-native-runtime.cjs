// Use installed Tencent compilers without opening or focusing DevTools.
// This proves native source compilation, not simulator rendering.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const mini = path.join(root, '微信小程序');
const toolRoot = 'D:/Program Files (x86)/Tencent/微信web开发者工具/resources/app.asar.unpacked/node_modules/wcc-exec';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(f => f.isDirectory() ? walk(path.join(dir, f.name)) : [path.join(dir, f.name)]); }
const sources = walk(mini);
const report = { layer: 'installed Tencent WXML/WXSS compilers', renderingVerified: false, modelRequests: 0, storageWrites: 0, foregroundActions: 0, compilers: {} };
for (const [name, extension, args] of [['wcc', '.wxml', ['-d']], ['wcsc', '.wxss', ['-lc']]]) {
  const binary = path.join(toolRoot, name + '.exe');
  const files = sources.filter(f => f.endsWith(extension)).map(f => './' + path.relative(mini, f).replaceAll('\\', '/'));
  // Each source is a root invocation. wcsc treats trailing paths as imports,
  // so a single multi-file invocation does not prove every stylesheet compiled.
  const runs = files.map(file => {
    const imports = [];
    if(extension === '.wxss') {
      const seen=new Set([path.resolve(mini,file)]);
      const visit=source=>{const text=fs.readFileSync(source,'utf8');for(const match of text.matchAll(/@import\s+["']([^"']+)["']/g)){const target=path.resolve(path.dirname(source),match[1]);if(!target.startsWith(mini+path.sep))throw Error('Stylesheet import escapes project');if(!seen.has(target)){seen.add(target);imports.push('./'+path.relative(mini,target).replaceAll('\\','/'));visit(target)}}};
      visit(path.resolve(mini,file));
    }
    const result = cp.spawnSync(binary, [...args, file,...imports], { cwd: mini, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true, timeout: 30000 });
    return { file, status: result.status === 0 ? 'PASS' : 'FAIL', exitCode: result.status,
      outputBytes: Buffer.byteLength(result.stdout || ''), outputSha256: hash(result.stdout || ''),
      diagnostics: (result.stderr || '').slice(0, 2000), ...(result.error ? { error: result.error.message } : {}) };
  });
  report.compilers[name] = { status: runs.every(run => run.status === 'PASS') ? 'PASS' : 'FAIL', files: runs.length,
    executableSha256: hash(fs.readFileSync(binary)), runs };
}
report.status = Object.values(report.compilers).every(x => x.status === 'PASS') ? 'PASS' : 'FAIL';
report.remaining = 'This command proves source compilation only. Live simulator evidence belongs to verify-native-background.cjs and background-verification.json; real-device acceptance remains separate.';
fs.writeFileSync(path.join(root, 'docs/ui-implementation/runtime-verification.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.status === 'PASS' ? 0 : 1;

# Math runtime build

The committed `微信小程序/vendor/math` bundle is the runtime used by both the mini-program and isolated tests. It contains KaTeX, the native rich-text adapter, and the syntax-only unified-latex parser/printer. It does not evaluate or simplify student expressions.

Install the exact dependencies with scripts disabled, then build with an explicit dependency directory:

```powershell
npm ci --prefix tools/math-runtime --ignore-scripts --no-audit --no-fund
node tools/math-runtime/build.cjs --modules tools/math-runtime/node_modules
```

The first implementation uses the isolated `_work/native-automation/math-probe/node_modules` directory instead. The build rejects version drift, embeds matching WOFF2 fonts, retains upstream notices, and emits a byte/hash manifest. There are no remote font or formula-rendering URLs in the generated styles. Do not edit generated runtime files by hand.

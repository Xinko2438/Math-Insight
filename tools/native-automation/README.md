# Dedicated native background automation

## Registered AppID device setup — current entry and historical setup

**Current user-facing entry is the authoritative project root `C:\Users\Ethan\WeChatProjects\Math-APP`.** One source tree is used for development, phone preview and release. As of 2026-11-02, `微信小程序/utils/config.js` selects the HTTPS backend `https://sparkye.cn/math-app` with `authRequired:true`. Backend credentials are configured on the user-approved shared server, and the user confirmed adding the request domain. Experience upload and physical-phone WeChat identity/model acceptance remain unverified. Current requirements, status and next step belong to `docs/PRD-错因智诊-开发版.md` sections 0/3/5; deployment evidence and maintenance are in `docs/server-deployment.md`. The user rejected `_work` copies as daily import entries. Do not use historical preview config generators to overwrite or omit the public identity setting.

The setup attempts and early runtime findings below are historical evidence. Their process-isolation, no-user-window, no-real-model-test and browser-policy boundaries still apply; historical LAN configuration, missing-feature statements and old next-step wording do not override the PRD.

Historical preparation: a source-only copy was generated under `_work/device-preview/project` without SDK startup, login or upload. It is no longer the normal import entry. The registered AppID is configured in both authoritative project config files, and the user confirmed phone GET health connectivity. At that historical LAN-only stage, business paths did not use AppSecret; the current public identity gateway requires it on the server only.

The attempted automatic startup of a separate registered-account SDK instance was **rejected by execution policy**, with no detailed reason. It was not retried through an alternate command or surface. The new `DevicePreview` launcher/helper/controller bridge is syntax-checked but runtime-unverified; do not treat it as working or reissue the rejected launch. The current handoff is user-operated compile/upload from the authoritative root, setting the new upload as the experience version, and a 5G phone test; do not import the obsolete prepared copy. No official preview QR or experience upload has been generated. Use the PRD for current status; `_work/device-preview/readiness.json` and PROJECT.md provide historical setup evidence. The previously verified tourist UI runner remains a distinct path; do not use the user's old port 9420.

The browser's earlier block on mp.weixin.qq.com remains in force. User-completed registration is not authority for the Agent to observe that blocked website through another tool. No account credentials were supplied to the Agent, and neither existing login profiles nor student history were copied into this setup.

Verified on installed WeChat DevTools 2.02.2608080, Electron 36.6.0 / ABI 135 and Mini Program base library 3.17.6. Technical layout/interaction and route/pixel checks passed. The prior UI was rejected by the user; the five-page refinement is now implemented and awaits acceptance. Multiline input exposed an unresolved glyph-rendering failure in the isolated runtime. Neither technical checks nor ordinary screenshots constitute a complete visual-quality pass. Current findings and acceptance are owned by PROJECT.md and docs/ui-redesign/RESEARCH.md. Real-device validation remains separate.

The user explicitly excludes their existing windows. This runner therefore starts a **new owned process of the installed signed SDK**, pauses before its entry, installs the hidden/profile policy and resumes. The process uses a separate home/temp/userData tree. It never attaches to the user's process or copies their DevTools login, settings, cookies or student records. The approved HTML examples remain frozen.

## Source and placement

- Source: this directory and `scripts/start-native-offscreen.ps1`.
- Rebuildable runtime and source-only test project: `_work/native-automation/`.
- Isolated configuration, possible identity state and private logs: `private/native-automation-profile/`; excluded from Git, not disposable `.runtime` data.
- Optional standalone research runtime: official Electron 36.6.0 ZIP, SHA-256 `e912a5ec7785dff898b7abef649be34f2a7f4117d877fb6950d1e3f13f138192`. This download is not needed for the default packaged-host route. MIT/Chromium notices remain in its archive.
- Installed WeChat SDK is imported read-only; no app.asar or user configuration is patched.

## Design choice and limits

Official miniprogram-automator supplies the real page/element protocol and is directly reusable. Community MCP servers mainly wrap it and do not provide an independent native pixel engine. Electron's official offscreen window mechanism is the architecture adapted here. Windows Sandbox is an alternative isolation boundary, but its tools are absent and the observed free memory was only about 4GB; it was not enabled or launched.

The native SDK screenshot implementation includes real-window capture and a freeze overlay. It must not be assumed to yield current pixels from a minimized user window. This runner applies hidden/offscreen policy only to its own process. All `show`, `focus`, `restore`, new browser windows and host clipboard effects are excluded. Native dialogs are never silently accepted. If a new login or authorization is necessary, the runner records that need for the user.

```powershell
node scripts/verify-offscreen-policy.cjs
./scripts/start-native-offscreen.ps1 -Action Start
node scripts/verify-native-background.cjs --full --fixtures --screenshots
./scripts/start-native-offscreen.ps1 -Action Status
./scripts/start-native-offscreen.ps1 -Action Stop
```

Start returns success only after a native page is ready, not merely after a port opens. Stop uses the recorded PID, verifies its executable and unique task marker, then stops only that owned process tree. It never kills by process name and retains the isolated private profile. Do not use old port 9420 or run ordinary CLI `auto` against the user's project.

`--fixtures` adds two synthetic records only to this owned instance, locally answers the cause-library request, and rejects other Mini Program network/upload calls. It does not submit analysis, chat or OCR. The run restores the prior storage keys and request functions, then verifies cleanup. Without `--fixtures`, report coverage depends on whatever records exist in the isolated profile.

`--screenshots` saves five native images under `docs/ui-implementation/native-*.png`. The report `background-verification.json` records route/page identity before and after capture, time, hashes, geometry and checks. A script pass leaves pixel review pending: inspect the actual files before recording route/pixel agreement. The first native logical viewport is 390 × 844; screenshots include the SDK device shell. Further scrolling, real touch/keyboard and user aesthetic judgment are separate coverage.

The connector verifies every current source file and copied file against `source-snapshot.json` before connecting. If the UI changes while the instance is running, restart it to rebuild the copy. Stale source, wrong owner/PID, visible windows, a wrong base library or a page that is not ready fail closed.

Add `--states` to cover long native textarea input, reaching submit by native scroll-view scrolling, a simulated analysis state, no search results, report hints/diagnosis/variant answers, the cause tree, and empty home/history/statistics. State pixels are written only beneath `_work/native-automation/ui-states/`, with hashes in the report. Text and history are restored. This flag needs `--full --fixtures`; it never submits inference.

The 2026-11-01 refinement adds runtime coordinate checks for manual-entry icon spacing, field markers, report actions and useful-content positions. These are mechanical regressions, not an aesthetic score. A long/multiline-text run exposed square glyphs around line breaks in this SDK instance even with intact source data and a direct SDK capture. Its exact cause and real-device impact are unresolved. A green test exit proves tested data/geometry, not clean glyph rendering; record this pixel failure explicitly in the manual review until resolved.

## Screenshot gallery delivery

The photo-transcription regression is `node scripts/verify-native-ocr.cjs` after
starting the normal dedicated guest runner. It mocks media selection, file
reading and the OCR response, verifies both existing entry points, captures the
real native form, checks original student work/history and restores every mock.
It is evidence for field mapping, never for real OCR accuracy. The gallery adds
its current source-bound images as a clearly labeled mocked-response group.

For the unresolved LF issue, `scripts/verify-native-multiline.cjs` checks exact
input data and native screenshot text bands. A named `multiline-bare` diagnostic
projection can be selected by the task-local `MATH_APP_NATIVE_FIXTURE` environment
variable before Start. Only the copied app/input/result styles and two templates
are replaced; production sources, renderer and base library remain unchanged.
Original/projected hashes and the fixture name are recorded. Only the explicit
`--bare` diagnostic connector accepts that runtime; ordinary product verification
rejects it. Clear the environment variable and restart the guest runner to return
to the normal source copy. Never present those fixture pixels as product UI.

`node scripts/build-screenshot-gallery.cjs` rebuilds `docs/ui-implementation/gallery.html` from the five actual PNGs and optional state captures in the current report. The HTML embeds its images, so moving the single file does not break them. Source hashes are checked before bundling. The screenshot verification pass now invokes this builder automatically when `--screenshots` is used. The gallery shows image groups, previous/next, thumbnails, keyboard arrows and actual-size zoom, and preserves unresolved visual-issue labels.

`node scripts/build-screenshot-gallery.cjs --serve` also serves only this gallery and an ownership health response on loopback. It reuses an existing matching server; its current URL/PID are in `_work/native-automation/gallery-server.json`. This lightweight Node viewer remains available for the user and is separate from SDK Stop. To stop it, first match the manifest owner/PID/sourceProject to `/health` and verify that PID's command line is this project's `scripts/build-screenshot-gallery.cjs --serve`, then stop only that PID. Never stop by process name. No user browser window is opened or controlled by the builder.

## Evidence required

A successful ZIP download, policy unit test, hidden frame or port is not native UI acceptance. To accept this path, the installed Skyline engine must render the actual project, page routes and pixels must agree, native geometry and interactions must pass, the user's foreground/windows must remain untouched, and any test data must stay in the isolated profile. Login/consent, true native rendering, functional validation and final user acceptance remain separate stages.

Earlier standalone investigation: the SDK interpreted `electron.exe` as a development checkout. A byte-identical `MathNativeHost.exe` alias produced genuine hidden SDK frames, but frames did not establish Mini Program readiness. The current default uses a new paused process of the original signed executable; no installed executable or SDK archive is patched. An empty `ELECTRON_RUN_AS_NODE` still enables Node mode, so startup explicitly removes that child environment key.

The alias subsequently produced 25 real SDK offscreen frames across two hidden windows with zero visible windows. The installed SDK bundles an older `ws` server whose address is on `_server.address()`; the transport adapter now handles that observed API. Hidden SDK frames prove isolation/painting only, not that the Mini Program or its login is ready.

Electron 36's window registry filters by `constructor.name === 'BrowserWindow'` ([pinned upstream source](https://github.com/electron/electron/blob/v36.6.0/lib/browser/api/browser-window.ts)). The initial safety subclass therefore disappeared from registry queries even while it painted. A failing constructor-identity check captured this; the policy now intercepts construction with a Proxy and retains genuine native instances. The safety checks pass and SDK window enumeration now returns the two actual hidden windows. This is a scoped runtime adaptation, not an SDK archive patch.

## Tourist mode and readiness

No formal Mini Program registration or original-AppID developer role is required for this verified local UI route. The source-only copy uses official `touristappid`, while the workspace AppID is unchanged. The runner selects the SDK's official guest action; this is not an authenticated WeChat account. Existing `Lab.prepareLogin` support is for a future explicitly needed account flow, not a prerequisite here. Do not ask the user to scan the old QR.

Observed startup failures and fixes: a fresh guest profile selected 2.31.0 despite public config requesting 3.17.6. The runner now selects the target through the SDK's own renderer action. A later restart stopped at project trust, so trust is scoped explicitly to the reviewed source-only copy. The SDK's immediate compile avoids waiting for editor-save messages in this disposable copy. Only `appLaunched && oneWebviewReady` opens the gateway. Native dialogs remain blocked, and no user-profile trust setting is changed.

Formal publishing requires the user's own registered Mini Program/AppID, or appropriate original-AppID access granted by its administrator. Tourist UI checks do not validate cloud services or account-protected APIs. Any old capture from the user's minimized window remains rejected evidence. `Lab.getStatus` ownership/readiness checks are mandatory before project methods.

Future checks consume source hashes to reject stale instances, the exact native version and readiness to select the supported route, and screenshot/route evidence to assess visual regressions. Stable source rebuilds the test copy; fixture cleanup makes the next run comparable. Repeated startup and the same five-page run have passed. Cross-version portability and quantified time savings have not been established. Local run evidence is in `PROJECT.md`, `background-verification.json` and `isolation-verification.json`.

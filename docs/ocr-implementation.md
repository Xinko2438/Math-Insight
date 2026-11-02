# 照片题干与作答识别

作用域：Math-APP 学生端；2026-11-01 用户澄清问题来自模拟器，要求照片识别能理解已有作答。当前登录仍只在 PRD 中，单独后置。

## 功能范围与选择

照片 → 现有 MiMo 一次图片请求 → 服务端校验 JSON → 题干与学生作答分别回填 → 学生校对后沿现有分析流程提交。空白字段保留原有手工输入；替换非空草稿前确认。只转录照片可见内容，保留学生写错的步骤，不替学生解题或把印刷参考答案冒充学生作答。

直接复用 MiMo 官方 JSON 输出能力和现有 question／wrongAnswer 字段；相比在前端按“解／答”猜分界，模型结合照片版面分离两字段更适合手写内容。独立 OCR／版面服务仅作将来评估，本轮不增加服务、依赖或模型调用次数。没有证据需要更换模型。

官方依据：[结构化输出](https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/text-generation/structured-output)、[Chat API](https://mimo.mi.com/docs/zh-CN/api/chat/openai-api)。JSON 模式只保证语法，字段仍由服务端校验；OCR 明确关闭 thinking，避免推理占用输出预算。不能用模拟响应证明真实照片识别准确率或指令抵抗能力。

## 接口与缺失数据

成功返回 data.question、data.wrongAnswer、data.needsReview、data.reviewReasons，并带 requestId；data.text 暂时保留为 question，使当前已编译的旧客户端仍能录题。新客户端也兼容当前尚未重启的旧服务 text 响应，并提醒核对／补充作答；该兼容来自真实的分阶段更新条件。

- 无作答：空字符串，不生成答案；只拍作答时保留已有题干并提示补齐／核对。
- 局部不清晰：原位保留“[看不清]”，提示人工核对。
- 多道题：拒绝默选或混合，提示选择／裁剪一道。
- null、错误字段类型、非法 JSON、超长、空内容或被截断：明确失败，不覆盖草稿，不自动再次调用模型。

## 调用追踪的复用路径

server/.runtime/ocr-audit.jsonl 只保存编号、时间、请求模型、提供方编号、耗时、结束原因、用量，以及字段长度／换行／异常字符计数；不保存图片、OCR 全文、作答全文或密钥，运行目录排除 Git。

编号用于定位下一次具体失败，结束原因用于区分截断与结构错误；字段中是否实际含方框／异常字符，与原生截图对照，用来区分返回文本问题与显示问题。回归消耗同一组固定错误作答样例，检查原文是否保留、字段归属、失败是否保护草稿；审计字段不被后续判断消费时，不宣称其已产生复利收益。

## 换行问题的证据与边界

既有字体、white-space 和高度实验均失败并撤回。本轮 scripts/verify-native-multiline.cjs 用三行短文字同时验证原始 LF 数据和实际输入／报告截图的文字行带。基线均只有一行；单独把字距设 0 后仍一行，因此已撤回字距变化，不把该假设写成修复。

进一步做了具名 multiline-bare 投影：保持当前 Skyline、glass-easel、3.17.6 基础库与 rendererOptions，仅在专用副本清空 app／输入／报告样式，并使用裸 textarea 和 text。人工查看及像素计数仍为一行，两处 LF 均显示方框，原始数据不变。这说明现象不依赖项目排印样式，尚不能细分为 SDK、基础库或其配置的哪项缺陷。输入／副本分别记录哈希；普通验证连接器拒绝把诊断副本当产品证据。CRLF 也未恢复换行；LS／PS 的测试因自动化导航超时未完成，不登记为失败或通过。临时样式实验全部撤回。

证据：_work/native-automation/multiline-baseline.json、multiline-current.json（字距实验）、multiline-current-crlf.json、multiline-bare.json。上述输入与报告截图均为专用实例，不是用户正在使用的模拟器窗口。

严禁靠删除换行、覆盖输入框或制造一张 HTML 预览掩盖问题。此次明确采用官方支持的 WebView 作为产品兼容性修复，并以实际小程序像素、原始数据和五页流程验证；这不等于修改或修好了 Skyline 内部实现。截图统一交付到 HTML 图集。

## 验证入口

- node scripts/verify-ocr.cjs：假提供方请求和内存审计，不接触密钥、不调用真实模型。
- node scripts/verify-native-ui.cjs：两个照片入口、字段回填、草稿保护、补全字段与旧协议回归；同时保留其他并行任务的检查。
- node scripts/verify-native-multiline.cjs：专用游客实例中的真实 LF 数据与像素；不能接入用户窗口。
- node scripts/inspect-native-runtime.cjs：原生编译；不代替上述显示检查。

当前结构化能力已通过隔离测试；实际后端重载、最新原生流程及照片质量的结果以 PROJECT.md 的最新核对为准。

本轮核对：15 项服务端测试、31 项前端／既有功能检查、7 个 WXML 与 8 个 WXSS 编译通过；两个入口经真实原生界面＋模拟照片和响应验证，题干／作答原样分开、计数正确、历史未写入且模拟已移除。这不是实际图片识别质量通过。用户手动执行 scripts/restart-backend.ps1 后，PID 35924 的项目归属／健康已核对；空参数本地校验返回 400／OCR_IMAGE_REQUIRED，审计编号匹配、提供方调用为零。旧成功请求没有补造日志。

两入口首轮成功后，末次重放因 App.getCurrentPage 超时未完成，未登记为新通过；专用实例已停机，先前源哈希一致的成功证据保留。诊断副本与产品连接的隔离检查通过。合成图检查默认只生成素材；当前已按下述明确授权完成一次真实调用，不作为真实手写识别准确率证明。

### 单次授权的实际识别（2026-11-01）

用户明确允许“只测试这张合成图 1 次”。执行现有一次性入口后没有重试；响应为 HTTP 200，MiMo 正常 stop，服务端对应审计恰好一条，耗时 2776ms，输入 1381／输出 61／合计 1442 tokens，reasoning 为 0。

题干 `解方程：2(x - 3) = x + 4。` 与三行学生作答均和合成图的原始文本逐字相等，错误步骤 `2x - x = 4 - 6` 及错误答案 `x = -2` 保留，没有替学生改为 x=10。返回有两个 LF、方框及异常控制字符计数为 0。本例验证的是单题分流与错误作答忠实转录；不能推导真实手写、低清晰度、多题照片的准确率，也不关闭原生显示方框问题。

输入与结果：`_work/native-automation/ocr-synthetic-fixture.json` 绑定 JPEG／预览哈希；`_work/native-automation/ocr-synthetic-result.json` 保留本例响应、检查和对应审计。一次性脚本在发请求前保存尝试记录，已有记录时只读取结果，不再调用。原生产审计仍不保留学生图片／全文，本例的完整响应仅因内容完全为程序生成的无个人信息测试素材而作为项目证据保留。后续修改 OCR 提示词或字段协议时，用同一输入及错误步骤保留判据作回归；真实调用仍须另有明确授权。本回合是测试结果归档，无新通用规则。

### 用户提供的手写照片（2026-11-01）

用户随后提供 `D:/windows_ext/Desktop/题.png` 并要求对比该图。对本图调用现有识别接口一次，无重试；保留原始 1086×1448 尺寸，在内存中按现有压缩质量参数 60 转 JPEG，不裁剪、不写出图片副本。这不是微信媒体选择／压缩 API 的完整重放。

本图通过：题干的两个分式、分母 2／3 被正确识别；学生作答从“解”到“所以 x=3”共 9 行，去分母、展开的负号、合并与求解步骤完整且顺序正确，没有混入题干或新增诊断。独立人工核算确认本题原作答正确。服务端正常 stop，耗时 6318ms，输入 1999／输出 132／合计 2131 tokens，reasoning 为 0；题干 1 个 LF、作答 8 个 LF，方框及异常控制字符为 0。

本例只保留来源哈希、变换说明、检查结果与对应审计，不保存原图副本或识别全文；元数据位于 `_work/native-automation/ocr-selected-image-74717ba8b4158faa.json`，一次性入口为 `verify-ocr-selected-photo.cjs`。原始图片未改动。后续根据来源哈希、请求编号和关键算式检查复核同例；不能从一个清晰手写样例推导复杂手写、多题或低清晰度准确率，原生换行显示仍未通过。

自动重载曾被工具审批拒绝（blocked by policy，未给具体原因），未改命令或借其他接口重试；已提供带归属／空闲／语法／健康检查的重载脚本，由用户运行成功。脚本的静态检查由 Agent 完成，实际执行结果另由运行状态核对。

### 显示兼容修复已落实（2026-11-01）

生产 app.json 仅把 renderer 从 skyline 改为 webview，componentFramework 仍为 glass-easel；页面增加无样式的稳定导航类名，便于自动化在两种引擎中找到同一组件。未删除／替换 LF，没有覆盖输入框，也没有改模型。官方 textarea 示例明确使用 WebView；官方 textarea 支持表对 Skyline 调试要求最新 Nightly，当前用户使用 Stable。来源：https://github.com/wechat-miniprogram/miniprogram-demo/blob/master/miniprogram/packageComponent/pages/form/textarea/textarea.json 、https://developers.weixin.qq.com/miniprogram/dev/component/textarea.md 。

同值对照：原 Skyline 的 textarea/text 均只有一个文字行带并出现方框；当前正式 WebView 配置均为三个行带，中文清楚、原始 LF 数据逐字保持。只切录入／报告两页时观察到混合路径报告初始数据不同步，因此采用全项目一致的稳定配置；没有增加跨引擎数据补丁。Skyline 下的 3.12.1 与 3.17.6 对照均未消除现象，故没有降基础库、改安装包或升级用户工具。生产仍为 3.17.6。

31 项逻辑、7 WXML／8 WXSS 编译、11 组五页模拟器流程及三行像素回归通过；长题实际输入事件保留 827 字／原始换行，自动增高且能滚到提交，保存复看、搜索筛选及统计通过，隔离存储／网络模拟恢复。工具只操作自有隐藏实例，真实 MiMo 调用为零。修复证据为 _work/native-automation/multiline-fixed.json、对应 PNG 与 docs/ui-implementation/background-verification.json；变更前 app.json 在 _work/native-automation/text-fix-before-app.json。图集首组绑定当前源码哈希，避免把旧图当修复。

复盘：之前把一次字体试验没解决 LF 误当作排除所有字体问题，并过早把接口成功当作接近界面完成，导致用户反复反馈和排查过长。后续先按官方支持范围做同值、无样式、同版本实际控件对照，分开判定中文缺字、换行和数据完整性；通过后即停止扩展分支，验收只覆盖必要流程。此经验限定于受测版本，不泛化为禁用 Skyline。

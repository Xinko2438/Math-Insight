# Math-APP 项目协作说明

## 入口与真值

- 当前阶段、验收和下一步以 `PROJECT.md` 为准。
- 产品范围和接口说明在 `docs/PRD-错因智诊-开发版.md`。
- 前端维护与缺陷修复前读取 `PROJECT.md` 的当前已确认基准和 `docs/ui-redesign/direction-approved.md`，沿已定稿风格继续；不主动重开风格探索。旧示例稿保持冻结。
- 用户已拒绝最近错题左侧 x/f′/sin 这类装饰方块徽标，不得恢复或换成同类装饰。相机、返回和导航等有明确动作含义的图标可用。
- HTML 原型验收、原生代码完成、模拟器验证、真机验证和用户最终验收分别记录，不能互相代替。
- 多张截图交付使用可上一张/下一张切换的 HTML 图集。当前入口 `docs/ui-implementation/gallery.html` 已内嵌截图；`node scripts/build-screenshot-gallery.cjs` 可结合当前本机检查记录重建，但部分历史截图的来源位于被忽略的隔离工作目录，干净克隆后不保证完整重建。不要修改冻结的旧原型图集。此要求对应 USER_PROFILE.md 中的截图交付偏好。

## /neat

用户输入 `/neat`、`$neat` 或要求项目收尾时，读取并执行本项目 `.agents/skills/neat/SKILL.md` 及所选模式对应的 `references/ai-native-routes.md`。

本项目默认采用 **Project reconciliation**：核对本次结果、用户验收、未完成事项和证据，更新 `PROJECT.md` 与受影响项目文档。项目事实不提升成全局规则，不修改生成 Memory。

只有当前任务上下文提供了精确回合与命令时，才执行对应 AI Native 回合收尾；不从旧对话或 latest-pending 推断。复制包中的 evals 含 AI Native 工作区专属夹具，不能在本外部项目假报其集成测试通过。

## 开发与验证边界

- 保留现有本地错题与后端未提交的 MiMo 改动，UI 迭代不覆盖密钥、存储或模型配置。
- 用户正常开发与真机导入入口是本项目根目录，开发/预览/发布维护同一份源码。后台验收副本仅供内部测试，不把 `_work` 目录交给用户作为日常项目入口；当前测试地址见 `微信小程序/utils/config.js`。
- 优先后台操作。没有明确前台授权时，不恢复开发者工具窗口或操作鼠标键盘。
- 最新明确边界：不得使用用户现有窗口完成自动化，也不要求用户保持窗口非最小化。后续验收使用专用隔离后台实例；确需登录、授权或系统准备时，仅请用户完成该具体步骤。旧的 9420 用户实例不得作为脚本默认目标。
- UI 验证使用隔离记录和模拟响应，不为验收界面自动调用真实模型或上传学生图片。
- 项目级验证分层：`scripts/verify-native-ui.cjs` 检查隔离逻辑，`scripts/inspect-native-runtime.cjs` 检查原生编译，`scripts/verify-native-background.cjs` 经官方自动化接口检查真实模拟器。优先后台接口，不因接入失败自动转为接管屏幕；实际条件和证据见 `PROJECT.md`。

# Math Insight · 错因智诊

**从错题录入、公式校对到诊断与练习的数学学习小程序。**

![WeChat](https://img.shields.io/badge/微信小程序-07A861?style=flat-square&logo=wechat&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=flat-square&logo=nodedotjs&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-336B8B?style=flat-square&logo=sqlite&logoColor=white)
![KaTeX](https://img.shields.io/badge/KaTeX-5264A3?style=flat-square)

## 设计重点

一道错题的处理不止于获取答案。这个版本围绕学生的实际作答，重新设计录入、校对、诊断与复盘的交互，并实现相应的数学文档、编辑层和后台任务机制。

| 使用中的问题 | 设计与实现 | 直接作用 |
| :-- | :-- | :-- |
| 题干与错误作答混在一起，难以核对 | 结构化 OCR 协议 `math-document-v1` 分别保存题干与作答 | 保留学生原始错误步骤，支持校对后再提交 |
| 手机修改公式需要面对 LaTeX 源码 | KaTeX 排版与项目自建编辑层，结合 AST 定位 | 点选修改常用结构，支持撤销和工作副本 |
| 等待分析阻塞继续录题 | 本机多草稿与服务端持久任务 | 服务端确认接收后可离开页面，再回来查询同一任务 |
| 修改草稿后，报告与题目版本混淆 | 诊断绑定提交快照，回执未知时不自动重提 | 报告对应原提交，减少重复分析风险 |
| 错题保存后不便复盘 | 报告、变式练习、错题本与基础学情 | 串联单题处理与后续复习 |

## 实现结构

```text
微信小程序/
  pages/          学生端页面
  components/     数学内容呈现与交互组件
  utils/          数学文档、草稿与本地记录
server/           Node.js 服务、OCR 与后台诊断任务
scripts/          逻辑、编译与界面验证入口
tools/            工程辅助工具
docs/             PRD、实现说明与分层验收记录
```

数学排版与编辑相关内容见 [数学实现说明](docs/math-implementation.md)，OCR 协议见 [识别实现说明](docs/ocr-implementation.md)。

## 本地开发

需要微信开发者工具与 Node.js 24 或以上。先阅读 [PRD 与项目状态](docs/PRD-错因智诊-开发版.md)，再按自己的环境配置小程序 AppID、服务地址与微信会话。

```sh
cd server
npm ci
# 参照 .env.example 在本机配置所需环境变量
npm start
```

通过微信开发者工具导入仓库根目录，`project.config.json` 将 `微信小程序/` 指定为小程序源码目录。涉及真实模型的请求需要自行配置服务凭据；不要提交密钥或学生图片。

## 当前验证边界

项目处于开发与验收阶段，尚未正式发布。仓库保留数学文档、OCR 契约、页面状态和草稿任务的逻辑及模拟验证记录；这些记录与真实模型质量、小程序真机交互、教学效果分别核验。

常用数学结构编辑已经实现，但不将其描述为完整成熟的通用公式编辑器。最新识别、诊断和变式仍需系统质量评估，具体证据与待办以 [PRD](docs/PRD-错因智诊-开发版.md) 为准。

## 开发与依赖

当前产品流程、交互与数学编辑等能力经过重新设计和实现。仓库包含开源依赖及工具材料，对应来源和许可随文件保留；项目说明不改变这些组件的授权范围。

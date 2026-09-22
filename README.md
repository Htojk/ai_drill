# AI 知识答题系统（MVP）

面向 AI 从业者的「**每天 10 题**」工程知识巩固系统。题库按知识域分类，答完即时给
**分层解析**（正确答案为什么对 + 每个干扰项错因 + 延伸知识点），并可**溯源到一手资料**，
长期沉淀个人掌握度画像。

> **接手这个项目前，请先读**
> [`AI知识答题系统-MVP产品说明.md`](./AI知识答题系统-MVP产品说明.md) 的 **第 0 章「交接摘要」**。
> 那一章写明了项目目标、已定路线、当前进度、文件地图、已知问题与下一步。
>
> **改代码前，请先读 [`AGENTS.md`](./AGENTS.md)**：里面是分层规则、提交流程和四道门禁。

## 当前状态（2026-09-22）

- 路线已定：**纯静态 Web PWA**（Vite + React + TS）+ 腾讯云 CloudBase 静态托管，零服务器、零数据库、¥0。
- 已上线：<https://test-d2gk9bnf2dc862288-1304936445.tcloudbaseapp.com>
- 功能闭环已完成：今日 10 题 / 分层解析 / 错题复习 / 分类专项 / 收藏 / 断点续答 / 统计与 streak / 加密码备份 / PWA（含 iOS 图标）。
- 唯一卡住的一步：**手机 4G 真实网络实测**（清单见产品说明 10.7）；v0.9 已重新部署，线上与本地产物一致，可直接测。
- 题库只有 24 题，仅够跑通链路；出题流水线已就绪（`tools/gen-questions.mjs`），扩题按用户要求暂缓。
- **题目获取流水线已跑通**（`tools/pipeline/`）：从 6 个权威开源项目（OpenAI Cookbook / DAIR.AI / 微软 / HuggingFace / OWASP / arXiv）抓素材 → 规范化 → 切块 → 出草稿，全程结构化日志与运行报告；与业务解耦，只有 `--merge` 才会进题库。
- 质量基线：81 个 vitest 用例 + 93 个流水线用例；GitHub Actions CI（题库校验 + 分层 + 构建 + 全量测试）。

## 跑起来

```bash
cd app
npm install
npm run dev        # 开发 http://localhost:5173
npm run build      # 构建（含 tsc --noEmit 类型检查）
npm run preview    # 本地预览构建产物
```

## 开发约束（改代码前必读）

详见 [`AGENTS.md`](./AGENTS.md)。摘要：

- **分层**：依赖只能向下（`types → data → lib → pages → entry`）；单文件超 200 行警告、超 250 行拦截。
- **计划**：任务写在 `docs/PLAN.md`，用 `node tools/plan.mjs` 维护；已完成只留 5 条，更早的自动归档。
- **提交**：单次提交不超过 800 行，超了要拆；`.githooks/pre-commit` 会自动拦。
- **测试**：每完成一个功能只跑相关用例（`node tools/test-related.mjs`），不跑全量。
- **收尾**：一次开发用一条命令结束：

```bash
node tools/finish-task.mjs --task T-00N --message "feat(scope): 说明" --evidence "验证方式"
```

首次克隆后启用钩子：

```bash
git config core.hooksPath .githooks
```

部署（需已登录 tcb CLI）：

```bash
tcb hosting deploy "app/dist" / -e test-d2gk9bnf2dc862288
```

## 出题流水线（拿素材，不写题库）

```bash
node tools/pipeline/run.mjs --list                       # 看权威源与许可
node tools/pipeline/run.mjs --all                        # 抓取 → 规范化 → 切块 → 出草稿（离线可跑）
node tools/pipeline/run.mjs --stage draft --mode llm     # 调模型出题（需 OPENAI_API_KEY）

node tools/gen-questions.mjs --check                     # 校验题库
node tools/gen-questions.mjs --merge content/drafts/oss-<runId>.json RAG   # 人工审后合并
```

产物写在 `content/raw`、`corpus`、`chunks`、`drafts`、`logs`、`reports`（全部 gitignore，可重建）。
运行报告 `content/reports/latest.json` 里有各阶段处理量与 warn/error 明细。

## 目录

| 路径 | 说明 |
| --- | --- |
| `AI知识答题系统-MVP产品说明.md` | **主文档**：产品设计 + 第 0 章交接摘要 |
| `docs/research/` | 调研笔记：竞品（2 篇）、否决小程序、CloudBase 默认域名风控 |
| `AGENTS.md` | **开发约束（harness）**：分层、计划、提交与测试门禁 |
| `docs/PLAN.md` | 任务计划（脚本维护） |
| `tools/` | 约束脚本（plan / check-commit-size / check-layers / test-related / finish-task）+ 内容脚本（gen-icons / gen-questions / question-schema / llm） |
| `tools/pipeline/` | 题目获取流水线：权威源抓取 → 规范化 → 切块 → 出草稿；与业务解耦，只产出草稿 |
| `content/sources/` | 人工出题素材；流水线产物（raw / corpus / chunks / drafts / logs / reports）已 gitignore |
| `app/` | 前端源码（Vite + React + TS） |
| `app/src/data/questions/` | 题库源数据（每个分类一个 JSON）+ `index.ts` 组装 |
| `app/dist/` | 构建产物，部署的就是这个目录 |

## 注意

- 代码托管：`https://github.com/Htojk/ai_drill.git`（分支 `main`）。`node_modules` 与 `app/dist` 已被 `.gitignore` 忽略，克隆后需先 `npm install` 再 `npm run build`。
- 「明确不做」的清单见产品说明 0.1（微信小程序、原生 App、服务器、账号体系、付费体系）。

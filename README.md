# AI 知识答题系统（MVP）

面向 AI 从业者的「**每天 10 题**」工程知识巩固系统。题库按知识域分类，答完即时给
**分层解析**（正确答案为什么对 + 每个干扰项错因 + 延伸知识点），并可**溯源到一手资料**，
长期沉淀个人掌握度画像。

> **接手这个项目前，请先读**
> [`AI知识答题系统-MVP产品说明.md`](./AI知识答题系统-MVP产品说明.md) 的 **第 0 章「交接摘要」**。
> 那一章写明了项目目标、已定路线、当前进度、文件地图、已知问题与下一步。

## 当前状态（2026-09-22）

- 路线已定：**纯静态 Web PWA**（Vite + React + TS）+ 腾讯云 CloudBase 静态托管，零服务器、零数据库、¥0。
- 已上线：<https://test-d2gk9bnf2dc862288-1304936445.tcloudbaseapp.com>
- 唯一卡住的一步：**手机 4G 真实网络实测**（清单见产品说明 10.7）。
- 题库只有 24 题，仅够跑通链路；扩题与离线出题脚本都还没做。

## 跑起来

```bash
cd app
npm install
npm run dev        # 开发 http://localhost:5173
npm run build      # 构建（含 tsc --noEmit 类型检查）
npm run preview    # 本地预览构建产物
```

部署（需已登录 tcb CLI）：

```bash
tcb hosting deploy "app/dist" / -e test-d2gk9bnf2dc862288
```

## 目录

| 路径 | 说明 |
| --- | --- |
| `AI知识答题系统-MVP产品说明.md` | **主文档**：产品设计 + 第 0 章交接摘要 |
| `竞品调研报告.md`、`竞品调研-中文搜索.md` | 竞品调研 |
| `小程序调研.md` | 否决微信小程序的调研记录 |
| `app/` | 前端源码（Vite + React + TS） |
| `app/src/data/questions.ts` | 题库（当前 24 题，手写 TS 常量） |
| `app/dist/` | 构建产物，部署的就是这个目录 |

## 注意

- 代码托管：`https://github.com/Htojk/ai_drill.git`（分支 `main`）。`node_modules` 与 `app/dist` 已被 `.gitignore` 忽略，克隆后需先 `npm install` 再 `npm run build`。
- 「明确不做」的清单见产品说明 0.1（微信小程序、原生 App、服务器、账号体系、付费体系）。

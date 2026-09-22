# 开发计划

> 本文件由 `tools/plan.mjs` 维护，请勿手工调整格式。
> 规则：只保留最近 **5** 条已完成任务，更早的自动移入 `docs/plan-archive/`。
> 提交信息请带上任务号，例如 `feat(quiz): 支持多选 (T-004)`，方便 `plan.mjs show` 回溯。

## 进行中

_（空）_

## 待办

- [ ] T-002 题库从 24 题扩到 200-500 题，含 >=60 道工程判断题 · 新增 2026-09-22

## 已完成（仅保留最近 5 条，更早的见 docs/plan-archive/）

- [x] T-013 题目获取流水线：从权威开源项目抓取素材到出题草稿（分层 stage + 结构化日志，与业务解耦） · 完成 2026-09-22 · 证据: node --test tools/pipeline/*.test.mjs 93/93 通过；run.mjs --all --limit 2 --source owasp-llm-top10 实测 drafts=1、nonverbatim=0、warn/error=0
- [x] T-005 重新部署到 CloudBase 静态托管（当前线上仍是旧版） · 完成 2026-09-22 · 证据: tcb hosting deploy 成功；线上 index-pRGciGJ5.js 与本地 dist 一致，icon/apple-touch-icon 均 200
- [x] T-012 仓库整理与文档同步：目录清理 + 主文档升版 · 完成 2026-09-22 · 证据: 第 0 章逐项对照代码核实（81 用例、7 页面、CI 已通过）；题库与分层校验均通过
- [x] T-011 进度码加密：支持口令加密导出/导入 · 完成 2026-09-22 · 证据: crypto 10 个用例（含错口令/篡改/格式错全被拦）；dev server 实测加密导出得到 AQ1. 前缀、错口令报错、对口令导入成功并重载
- [x] T-010 断点续答：重新进入时回到中断的那一题 · 完成 2026-09-22 · 证据: lib/task 10 个用例通过；dev server 实测答到第 3 题退出→今日页显示从第 3 题起→重进落在第 3 题

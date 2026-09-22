# 开发计划

> 本文件由 `tools/plan.mjs` 维护，请勿手工调整格式。
> 规则：只保留最近 **5** 条已完成任务，更早的自动移入 `docs/plan-archive/`。
> 提交信息请带上任务号，例如 `feat(quiz): 支持多选 (T-004)`，方便 `plan.mjs show` 回溯。

## 进行中

_（空）_

## 待办

- [ ] T-002 题库从 24 题扩到 200-500 题，含 >=60 道工程判断题 · 新增 2026-09-22
- [ ] T-022 本体与知识图谱题库 100 题（20 单选 + 20 判断 + 60 简答） · 新增 2026-09-22

## 已完成（仅保留最近 5 条，更早的见 docs/plan-archive/）

- [x] T-021 Agent 题库 100 题（20 单选 + 20 判断 + 60 简答） · 完成 2026-09-22 · 证据: Agent 分类 100 题（20 单选 + 20 判断 + 60 简答，题型构成已核对）；all.test.ts 224 用例通过；gen-questions --check 通过（题库共 218 题）
- [x] T-020 RAG 题库 100 题（20 单选 + 20 判断 + 60 简答） · 完成 2026-09-22 · 证据: RAG 分类 100 题（20 单选 + 20 判断 + 60 简答，已校验题型构成）；all.test.ts 127 用例通过；node tools/gen-questions.mjs --check 通过（题库共 121 题）
- [x] T-019 Agent 批阅：简答作答 UI、模型批阅（自带 key）+ 本地兜底评分、查看答案即未掌握 · 完成 2026-09-22 · 证据: 128 个 vitest 用例通过（新增 grading 9 / agent 13）；tsc --noEmit 与 vite build 均通过
- [x] T-018 题型扩展与调度：判断题/简答题契约、掌握度、艾宾浩斯推荐 · 完成 2026-09-22 · 证据: 106 个 vitest 用例通过（新增 ebbinghaus 16 / mastery 9 / recommend 7）；题库校验通过；tsc --noEmit 无错
- [x] T-013 题目获取流水线：从权威开源项目抓取素材到出题草稿（分层 stage + 结构化日志，与业务解耦） · 完成 2026-09-22 · 证据: node --test tools/pipeline/*.test.mjs 93/93 通过；run.mjs --all --limit 2 --source owasp-llm-top10 实测 drafts=1、nonverbatim=0、warn/error=0

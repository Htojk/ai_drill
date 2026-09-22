# 开发计划

> 本文件由 `tools/plan.mjs` 维护，请勿手工调整格式。
> 规则：只保留最近 **5** 条已完成任务，更早的自动移入 `docs/plan-archive/`。
> 提交信息请带上任务号，例如 `feat(quiz): 支持多选 (T-004)`，方便 `plan.mjs show` 回溯。

## 进行中

_（空）_

## 待办

- [ ] T-002 题库从 24 题扩到 200-500 题，含 >=60 道工程判断题 · 新增 2026-09-22
- [ ] T-004 写离线 AI 出题脚本（源数据 -> questions.json） · 新增 2026-09-22
- [ ] T-005 重新部署到 CloudBase 静态托管（当前线上仍是旧版） · 新增 2026-09-22
- [ ] T-006 给关键流程补自动化测试并接入 CI · 新增 2026-09-22

## 已完成（仅保留最近 5 条，更早的见 docs/plan-archive/）

- [x] T-003 补分类专项练习页 · 完成 2026-09-22 · 证据: lib/categories 11 个新用例全过；dev server 实测分类页 8 卡渲染、练习 3 题后覆盖数 0/24→3/24、优先补强列出 0% 错 3 题
- [x] T-001 补 iOS PNG 图标 + maskable，修复手机添加到主屏幕无图标 · 完成 2026-09-22 · 证据: gen-icons.mjs 生成 4 张 PNG；npm run build 通过，dist 内 manifest icons=3 张 PNG、index.html 含 apple-touch-icon
- [x] T-008 pre-commit 钩子补齐分层检查，与 AGENTS.md 描述一致 · 完成 2026-09-22 · 证据: 钩子实际拦截了一次 301 行的超长文件提交（exit 1）
- [x] T-007 搭建 agent harness（分层约束 + 计划文档 + 提交与测试门禁） · 完成 2026-09-22 · 证据: 50 个用例通过；check-layers 通过；4 个提交均在 800 行内

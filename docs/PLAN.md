# 开发计划

> 本文件由 `tools/plan.mjs` 维护，请勿手工调整格式。
> 规则：只保留最近 **5** 条已完成任务，更早的自动移入 `docs/plan-archive/`。
> 提交信息请带上任务号，例如 `feat(quiz): 支持多选 (T-004)`，方便 `plan.mjs show` 回溯。

## 进行中

_（空）_

## 待办

- [ ] T-024 把 llm_interview_note 抽取的 203 道简答草稿并入题库（待版权口径确认） · 新增 2026-09-22

## 已完成（仅保留最近 5 条，更早的见 docs/plan-archive/）

- [x] T-032 文档与 AGENTS 同步：账号/后端/提醒的决策反转记录 · 完成 2026-09-23 · 证据: 产品文档 v0.14（第 0/4/7/10-13 章 + 附录 A.1 决策反转记录）；AGENTS 补 hooks 层、cloud/ 目录地图、后端改动流程与四道门禁；README 同步 496+35 用例与未部署状态
- [x] T-031 .ics 每日定时提醒（订阅式日历，手机闹钟响铃） · 完成 2026-09-23 · 证据: lib/reminder.ts 生成 ICS（VTIMEZONE/VALARM/RRULE，75 字节折行）+ ReminderCard 接入「我的」页；24 用例绿；npm run build 通过；提交 aa05842
- [x] T-030 本地优先同步：localStorage 缓存 + 后台合并上传 · 完成 2026-09-23 · 证据: sync.ts/hooks/use-sync.ts 接入 App；42 用例绿；构建通过；提交 72c286b
- [x] T-029 前端接入：api 客户端 + 会话存储 + 登录注册页 · 完成 2026-09-23 · 证据: 前端 23 个新用例通过（api 客户端 9 / session 4 / account 10）；tsc --noEmit 通过；npm run build 通过（bundle 424.31 kB，gzip 189.36 kB，未引入新依赖）；分层检查通过（34 个源文件）
- [x] T-028 进度同步接口：按账号隔离的读写（云函数侧） · 完成 2026-09-23 · 证据: 云函数 35 用例通过：首次 PUT 建行、GET 读回、两个账号互相看不见、baseRevision 对不上返回 409 并带服务端最新值、payload/baseRevision 非法一律 400

# 开发计划

> 本文件由 `tools/plan.mjs` 维护，请勿手工调整格式。
> 规则：只保留最近 **5** 条已完成任务，更早的自动移入 `docs/plan-archive/`。
> 提交信息请带上任务号，例如 `feat(quiz): 支持多选 (T-004)`，方便 `plan.mjs show` 回溯。

## 进行中

_（空）_

## 待办

- [ ] T-024 把 llm_interview_note 抽取的 203 道简答草稿并入题库（待版权口径确认） · 新增 2026-09-22
- [ ] T-029 前端接入：api 客户端 + 会话存储 + 登录注册页 · 新增 2026-09-23
- [ ] T-030 本地优先同步：localStorage 缓存 + 后台合并上传 · 新增 2026-09-23
- [ ] T-031 .ics 每日定时提醒（订阅式日历，手机闹钟响铃） · 新增 2026-09-23
- [ ] T-032 文档与 AGENTS 同步：账号/后端/提醒的决策反转记录 · 新增 2026-09-23

## 已完成（仅保留最近 5 条，更早的见 docs/plan-archive/）

- [x] T-028 进度同步接口：按账号隔离的读写（云函数侧） · 完成 2026-09-23 · 证据: 云函数 35 用例通过：首次 PUT 建行、GET 读回、两个账号互相看不见、baseRevision 对不上返回 409 并带服务端最新值、payload/baseRevision 非法一律 400
- [x] T-027 账号体系：注册/登录/会话令牌/改密（云函数侧） · 完成 2026-09-23 · 证据: 云函数 32 用例通过：注册→登录→/auth/me 全链路、用户名大小写不敏感、重复名 409、口令错 401、改密后旧密码失效；scrypt(N=16384) + HMAC-SHA256 会话令牌（篡改/过期/换密钥均验不过）；注册可用 DRILL_ALLOW_REGISTER=off 一键关闭
- [x] T-026 后端云函数骨架：HTTP 事件适配 + 路由 + 日志 + 校验 + PG 表结构与部署脚本 · 完成 2026-09-23 · 证据: 云函数骨架 16 用例通过（三种事件形态适配 / 路由后缀匹配 / 入参校验）；check-layers 纳入 cloud/ 单文件预算，test-related 纳入云函数测试；tools/backend.mjs migrate 跑通，drill_accounts + drill_progress 已建且仅 service_role 有权限（anon/authenticated 0 条授权）
- [x] T-025 修复简答批阅阈值过高（参考答案自评仅 33 分）与「查看答案」误显示答对 · 完成 2026-09-22 · 证据: 线上 12 文件 sha256 与本地一致；Playwright 走通全流程；vitest 425 用例通过
- [x] T-023 面试笔记抽题流水线：解析 llm_interview_note 笔记仓库，产出简答草稿（与业务解耦 + 单测） · 完成 2026-09-22 · 证据: 203/203 草稿通过 question-schema 校验；node --test "tools/pipeline/*.test.mjs" 127 用例全绿（新增 notes 34）；extract-notes --local 跑通（96 个 md → 203 题、0 重复、0 警告）；主文档/README/AGENTS 同步到 v0.12 并新增第 8 节版权口径

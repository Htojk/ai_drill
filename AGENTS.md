# AGENTS.md · 本仓库开发约束

> 这个文件是本仓库的 **harness**：约束和指引 AI agent（以及人）在这里怎么改代码。
> 动手前请读完。产品定位与当前进度见 `AI知识答题系统-MVP产品说明.md` 第 0 章；待办见 `docs/PLAN.md`。

## 0. 三十秒上手

```bash
cd app && npm install          # 首次
npm run dev                    # 本地开发
```

一次标准开发循环：

```bash
node tools/plan.mjs add "任务标题"      # 1. 立任务（已有就跳过）
node tools/plan.mjs start T-00N         # 2. 开工
# 3. 改代码（遵守第 1 节分层）
node tools/finish-task.mjs --task T-00N \
     --message "feat(scope): 说明" \
     --evidence "验证方式"               # 4. 收尾：校验 + 测试 + 更新计划 + 提交
```

---

## 1. 分层管理（铁律 1）

**目标**：改一个小功能时，需要读的代码是有限的，不要被迫通读全仓。

### 依赖方向：只能向下

| 层 | 位置 | rank | 允许依赖 |
| --- | --- | --- | --- |
| 类型 | `app/src/types.ts` | 0 | 无 |
| 数据 | `app/src/data/**` | 1 | types |
| 逻辑 | `app/src/lib/**` | 2 | types、data |
| 页面 | `app/src/pages/**` | 3 | types、data、lib |
| 入口 | `app/src/App.tsx`、`main.tsx` | 4 | 全部 |

反向依赖（例如 `lib` 里 import `pages`）会被拦下。

### 单文件预算

- 逻辑 / 页面文件 **超过 200 行开始警告，超过 250 行直接拦提交**。
- 超了就按功能边界拆成多个小文件，不要靠压缩格式蒙混。
- 测试文件（`*.test.ts`）不受此限。

### 改什么，只需要读什么

| 你要做的事 | 该读的文件 | 大致行数 |
| --- | --- | --- |
| 加/改某分类的题 | `data/questions/<分类>.ts` + `data/questions/index.ts` | 各 ~75 行 |
| 改每日出题规则 | `lib/recommend.ts` | ~180 行 |
| 改间隔重复节奏 | `lib/review.ts` | ~31 行 |
| 改本地存储 / 导出码 | `lib/storage.ts` | ~170 行 |
| 改掌握度统计 | `lib/stats.ts` | ~48 行 |
| 改答题交互 | `pages/Quiz.tsx` | ~200 行 |
| 改数据结构 | `types.ts`（**全仓都会受影响，改前先想清楚**） | ~76 行 |

### 校验

```bash
node tools/check-layers.mjs
```

---

## 2. 计划文档（铁律 2）

任务清单在 **`docs/PLAN.md`**，由脚本维护，不要手改：

- 只保留最近 **5** 条已完成任务；第 6 条起自动移入 `docs/plan-archive/<年-月>.md`。
- 「进行中」和「待办」不设上限，全部保留。

```bash
node tools/plan.mjs list                    # 看计划
node tools/plan.mjs add "任务标题"           # 新增
node tools/plan.mjs start T-003             # 开始
node tools/plan.mjs done  T-003 --evidence "验证方式"
node tools/plan.mjs show  T-003             # 去 git 历史里找这个任务的提交
```

**提交信息必须带任务号**，例如 `feat(quiz): 支持多选 (T-004)`，`plan.mjs show` 依赖它回溯。

开工前先看 `docs/PLAN.md`：里面既有当前在做的，也有还没做的；已完成任务里写了当时的验证证据。

---

## 3. 单次提交不超过 800 行（铁律 3）

- 口径：本次提交的 **新增行 + 删除行** 之和。lockfile、二进制/图片、以及 git 判定为纯重命名的文件不计入。
- 超了就**拆成多个提交**，按功能边界拆，不要按文件个数拆。
- `.githooks/pre-commit` 已自动拦截。首次克隆后需要启用一次：

```bash
git config core.hooksPath .githooks
```

确实不可分割的大改动，用 `HARNESS_MAX_LINES=<新上限>` 提交，并在提交信息里说明原因。**不要用 `--no-verify` 绕过。**

---

## 4. 只跑相关测试，不跑全量（铁律 4）

每完成一个功能，只跑跟它相关的用例：

```bash
node tools/test-related.mjs          # 依据暂存区改动，自动挑出相关测试
node tools/test-related.mjs --all    # 全量：仅发布前或大改动时偶尔用
```

选测逻辑：从测试文件出发求传递依赖闭包，只要闭包里出现本次改动的文件就选中它。

**写代码时的要求**：

- 测试就近放，命名 `<模块名>.test.ts`，与源码同目录。
- 加新功能时顺手补一个测试；不然该功能就没有相关用例可跑。
- 改了底层（`types.ts`、`lib/storage.ts`）影响面大，工具会自动把受影响的下游测试都算进来。

测试框架：`vitest`（`environment: node`，只测纯逻辑，不引 jsdom）。

---

## 5. 完成即提交（铁律 5）

每完成一个开发，**立刻提交**，不要攒着。用一条命令走完收尾：

```bash
node tools/finish-task.mjs --task T-003 --message "feat(scope): 说明" --evidence "验证方式"
```

它会按顺序执行，任何一步失败就中止且不产生提交：

1. `git add -A`
2. 校验提交行数（铁律 3）
3. 校验分层与文件体积（铁律 1）
4. 只跑相关测试（铁律 4）
5. 更新 `docs/PLAN.md` 并提交，提交信息自动带上任务号（铁律 2 + 5）

纯文档改动可以加 `--skip-tests`。

---

## 6. 不要做的事

- 不要用 `--no-verify` 绕过提交检查。
- 不要为了让测试通过而放宽断言，或删掉既有用例。
- 不要在 `pages/` 里写业务规则（那属于 `lib/`）；页面负责渲染与交互。
- 不要跨层反向 import（见第 1 节）。
- 不要把题库数据写回 `data/questions.ts`（那是组装入口），新增题一律加到对应分类文件。
- 不要引入重量级依赖（UI 框架、状态库、jsdom 等）而不先说明理由。
- 不要提交 `app/dist/`、`node_modules/`（已在 `.gitignore`）。

---

## 7. 目录地图

```
AGENTS.md                     本文件：开发约束
README.md                     项目入口
AI知识答题系统-MVP产品说明.md    产品设计 + 第 0 章「交接摘要」（当前真实状态）
docs/PLAN.md                  任务计划（脚本维护）
docs/plan-archive/            已完成任务的归档
tools/                        约束与流程脚本
  plan.mjs                    计划增删改 + 自动归档
  check-commit-size.mjs       提交行数门禁
  check-layers.mjs            分层方向 + 文件体积门禁
  test-related.mjs            只跑相关测试
  finish-task.mjs             收尾：校验 + 测试 + 计划 + 提交
app/src/
  types.ts                    全局类型（最底层）
  data/questions/index.ts      题库组装 + 查询
  data/questions/<分类>.ts     分类题库（加题只动这里）
  lib/                         纯逻辑，可测
  pages/                       页面渲染
  App.tsx                      路由与状态编排
```

（v0.1 · 2026-09-22 建立）

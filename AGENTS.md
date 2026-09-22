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
| 加/改某分类的题 | `data/questions/<分类>.json`（源数据）+ `data/questions/index.ts` | 每个 ≤ 100 题 / ~3300 行；只看要改的那一段 |
| 出题流水线（素材 → 草稿 → 合并） | `tools/gen-questions.mjs` | ~330 行 |
| 题目获取流水线（抓权威素材 → 切块 → 草稿） | `tools/pipeline/`（先看 `run.mjs`；抓取规则在 `sources.mjs`，清洗规则在 `normalize.mjs`） | 各 ≤ 275 行 |
| 改每日出题规则 | `lib/recommend.ts` | ~180 行 |
| 改复习节奏（艾宾浩斯） | `lib/ebbinghaus.ts` | ~85 行 |
| 改熟练度三档 | `lib/mastery.ts` | ~60 行 |
| 改简答本地评分 | `lib/grading.ts` | ~120 行 |
| 改模型批阅 / 自带 key 调用 | `lib/agent.ts` + `lib/agent-store.ts` | 各 ~120 / ~50 行 |
| 改题型判定与文案 | `lib/question-kind.ts` | ~30 行 |
| 改简答作答 UI / 熟练度选择 | `pages/ShortAnswerBox.tsx` / `MasteryPicker.tsx` | 各 ~80 行 |
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
- **题库类改动的经验值**：一次 merge ≤ 10 道单选/判断（约 450 行）或 ≤ 15 道简答（约 440 行）。
- `.githooks/pre-commit` 会自动拦截：行数预算 + 分层 + 题库校验 + **相关测试**。首次克隆后需要启用一次：

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

选测逻辑：从测试文件出发求传递依赖闭包，只要闭包里出现本次改动的文件就选中它。题库 JSON 也算改动源，改了题会选中 `all.test.ts`。

> v0.11 起 `pre-commit` 会自动跑一次 `test-related.mjs`：跑相关的、不跑全量。
> 提交被测试拦下时**不要去 `--no-verify`**，先修好测试。

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
- 不要把题目写进 `data/questions/index.ts`（那是组装入口），新增题一律加到对应分类的 `.json`。
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
docs/research/                调研笔记（竞品、小程序、CloudBase 风控）
tools/                        约束与流程脚本
  plan.mjs                    计划增删改 + 自动归档
  check-commit-size.mjs       提交行数门禁
  check-layers.mjs            分层方向 + 文件体积门禁
  test-related.mjs            只跑相关测试
  finish-task.mjs             收尾：校验 + 测试 + 计划 + 提交
  gen-icons.mjs               生成 PWA / iOS 的 PNG 图标
  gen-questions.mjs           出题流水线：--check 校验题库 / --draft 生成草稿 / --merge 合并
  question-schema.mjs         题目契约（pipeline 与 gen-questions 共用的**唯一**契约）
  llm.mjs                     出题 prompt + 模型调用
  pipeline/                   题目获取流水线（与业务解耦，只产出草稿，不认识题库）
    run.mjs                   编排 CLI：--list / --all / --stage / --source / --limit / --mode
    sources.mjs               权威源注册表（含 license / authority）+ GitHub / arXiv 抓取
    arxiv.mjs                 arXiv Atom 解析（纯函数，离线可测）
    http.mjs                  带重试与日志的 HTTP 客户端（实现可注入）
    logger.mjs                结构化 JSONL 日志 + 计数 + 耗时 + 脱敏
    normalize.mjs             原始素材 → CorpusDoc（text 供出题 / verbatim 保逐字引用）
    chunk.mjs                 切块 + 跨源去重
    stages.mjs                normalize / chunk / draft 三个 stage 的落盘与统计
    paths.mjs                 content/ 下各产物目录的统一约定
content/
  sources/                    人工素材（入库）
  raw/ corpus/ chunks/        流水线中间产物（可由 sources 或权威源重建，已 gitignore）
  drafts/ logs/ reports/      出题草稿 / JSONL 日志 / 运行报告（已 gitignore）
.github/workflows/ci.yml      CI：题库校验 + 分层 + 构建 + 全量测试
app/src/
  types.ts                    全局类型（最底层）
  data/questions/index.ts      题库组装 + 查询（把 JSON 断言成 Question[]）
  data/questions/<分类>.json   分类题库源数据（加题只动这里）
  lib/                         纯逻辑，可测（storage / task / stats / categories / crypto /
                               recommend / ebbinghaus / mastery / grading / agent / agent-store /
                               question-kind / ...）
  pages/                       页面渲染
  App.tsx                      路由与状态编排
```

### 题库改动流程

```bash
node tools/gen-questions.mjs --check                                   # 校验题库不变量
node tools/gen-questions.mjs --draft content/sources/<素材>.md --offline # 生成草稿（无 key 也能跑）
node tools/gen-questions.mjs --merge content/drafts/<草稿>.json RAG      # 校验后合并进题库
```

- 题库源数据是 `data/questions/*.json`，运行时由 `index.ts` import 进来。
- 草稿写在 `content/drafts/`（已 gitignore），人工修订来源与解析后再 merge。
- **合并后必须同步 `data/questions/all.test.ts` 里 `EXPECTED_FILES` 中对应前缀的 `count`**（该文件锁的是「每文件题量 + 各文件 id 成块升序」，不再逐条列 id）。
- 合并会按 id 升序落盘（取号会优先填补删除留下的空号，这是有意的）。
- **注意 800 行提交上限**：一次 merge 建议 ≤ 10 道单选/判断（约 450 行）或 ≤ 15 道简答（约 440 行）；判断题 20 道约 700 行，属于临界值。

### 题库规模与题型契约（v0.11）

当前 **315 题**：`rag` / `agent` / `ontology` 各 100 题，其余 5 个分类各 3 题。

| 题型 | 契约要点 |
| --- | --- |
| `single` / `scenario` | 选项 ≥ 2，恰好 1 个正确；每个错误选项必须写 `wrongReason` |
| `judge` | **恰好 2 个选项**（A 正确 / B 错误）；错误项必须写 `wrongReason` |
| `short` | `options: []`；必须有 `referenceAnswer`，建议给 `keyPoints`（评分要点，本地评分按命中率打分） |

- `isPractice: true` 是「工程判断题」标记（UI 标「工程判断」），当日推荐至少要有 3 道；当前共 99 道，不变量要求 ≥60 且跨 ≥3 个分类。
- 每题必填：`id / type / isPractice / stem / options / explanation / difficulty / categories / tags / source`；`source` 需 `type/title/url(https)/snippet`（snippet 必须是原文逐字片段）。

### 题目获取流水线（v0.10 新增，与业务解耦）

```bash
node tools/pipeline/run.mjs --list                      # 看有哪些权威源、许可与「为何可信」
node tools/pipeline/run.mjs --all                       # fetch+normalize+chunk+draft（离线可跑）
node tools/pipeline/run.mjs --stage fetch --source arxiv --limit 3
node tools/pipeline/run.mjs --stage draft --mode llm     # 调模型出题，需 OPENAI_API_KEY
```

产物（全部在 `content/` 下，已 gitignore，可重建）：

```
raw/<sourceId>/*.md + <sourceId>.manifest.json   抓回来的原始素材
corpus/<sourceId>.json                           CorpusDoc[]（统一契约）
chunks/<sourceId>.json                           TextChunk[]（text + verbatim 双轨）
drafts/oss-<runId>.json                          出题草稿 → 只有 --merge 才能进题库
logs/<runId>.jsonl / reports/latest.json         结构化日志与运行报告
```

改这条流水线时必须守住的三条：

1. **不许反向依赖业务**：`tools/pipeline/*` 不能 import `tools/gen-questions.mjs`，也不能认识「题库 / 分类白名单」；两者只共用 `tools/question-schema.mjs`。
2. **出处必须逐字**：题目 `source.snippet` 只能取自 `chunk.verbatim`（原文切片）。normalize 的清洗规则只允许「删除」字符，加了插入类变换就会被 `checkBlocksVerbatim()` 记为 `corpus.nonverbatim` —— 这不是可以放宽的告警。
3. **失败要留痕**：新增/修改流程时同步补日志与计数（`logger.count` / `logger.timer`），单个源失败只记 error 不中断；错误最后要能在 `content/reports/latest.json` 里复盘。

测试只跑本目录（`node --test "tools/pipeline/*.test.mjs"`，共 93 个用例）；这些测试不联网，改 `sources.mjs` / `run.mjs` 时用注入假 `httpGetText` / `httpGetJson` 的方式验证编排。

（v0.2 · 2026-09-22 更新：新增题目获取流水线）

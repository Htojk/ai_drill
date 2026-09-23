# AGENTS.md · 本仓库开发约束

> 这个文件是本仓库的 **harness**：约束和指引 AI agent（以及人）在这里怎么改代码。
> 动手前请读完。产品定位与当前进度见 `AI知识答题系统-MVP产品说明.md` 第 0 章；待办见 `docs/PLAN.md`。

## 0. 三十秒上手

```bash
cd app && npm install          # 首次
npm run dev                    # 本地开发
```

前端之外的**后端**（事件云函数 + HTTP 访问服务 + PostgreSQL，v0.14 起）不参与 `npm run dev`：

```bash
node tools/backend.mjs secret     # 生成会话签名密钥（写 .secrets/backend.env，已 gitignore）
node tools/backend.mjs apikey     # 生成数据库 API Key（service_role，同上）
node tools/backend.mjs migrate    # 建表（幂等）
node tools/backend.mjs deploy     # 生成 cloudbaserc.local.json 并部署 api 函数
node tools/backend.mjs smoke      # 线上冒烟（真实 HTTP 全链路，会碰数据库）
node tools/backend.mjs status     # 函数与静态托管状态
```

⚠️ **不要擅自部署**：`deploy` 会改动线上环境，先问用户。改后端的约定见第 9 节。

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
| 钩子 | `app/src/hooks/**` | 2.5 | types、data、lib（只能被 pages / 入口依赖） |
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
| 笔记型仓库抽题（标题即问题 → 简答草稿） | `tools/extract-notes.mjs`（CLI）+ `tools/pipeline/notes.mjs`（纯函数） | 各 ≤ 320 行 |
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
| 改后端接口 / 路由 | `cloud/functions/api/index.mjs` + `src/router.mjs` + `src/routes/*`（一个 endpoint 一个文件） | 各 ≤ 150 行 |
| 改账号 / 口令 / 令牌 | `cloud/functions/api/src/core/`（`password.mjs` / `token.mjs`） | 各 ≤ 120 行 |
| 改数据库读写 | `cloud/functions/api/src/repo/` | 各 ≤ 100 行 |
| 改前端 HTTP 调用 | `app/src/lib/api.ts`（错误码翻译在 `lib/account.ts`） | 各 ≤ 120 行 |
| 改会话存储 | `app/src/lib/session.ts` | ~50 行 |
| 改同步策略（合并 / 防抖） | `app/src/lib/merge.ts` + `lib/sync.ts` | 各 ≤ 150 行 |
| 改每日提醒 / ICS | `app/src/lib/reminder.ts` + `pages/ReminderCard.tsx` | 各 ≤ 210 行 |

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

云函数是另一套运行器（`node --test`，不是 vitest），改动 `cloud/` 时只跑这一组：

```bash
node --test "cloud/functions/api/test/*.test.mjs"
```

> Windows 上 `node --test <目录>` 不生效，必须用上面的 glob 写法。

> v0.11 起 `pre-commit` 会自动跑一次 `test-related.mjs`：跑相关的、不跑全量。
> 提交被测试拦下时**不要去 `--no-verify`**，先修好测试。

**写代码时的要求**：

- 测试就近放，命名 `<模块名>.test.ts`，与源码同目录。
- 加新功能时顺手补一个测试；不然该功能就没有相关用例可跑。
- 改了底层（`types.ts`、`lib/storage.ts`）影响面大，工具会自动把受影响的下游测试都算进来。

测试框架：`vitest`（`environment: node`，只测纯逻辑，不引 jsdom）。

### 改评分阈值前先看这里（v0.13）

`lib/grading.ts` 的 `HIT_COVERAGE` 是按**真实题库**标定的，不是拍脑袋值，也不是按测试夹具值。
它曾经是 0.5（按一个「近乎逐字抄写」的小夹具调出来的），结果题库里**参考答案原文自评只有 21% 能过线** ——
标准答案自己都不及格，等于这个功能对用户不可用。

改这个常量时必须一起跑 `lib/grading.test.ts` 里那组「与真实题库的自洽性」用例：
它会断言「≥85% 的简答题，参考答案至少判 partial」和「跑题答案均分 <10」。
调阈值不能只看单测过不过，要看这两条统计。

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
- **不要擅自部署**（`tools/backend.mjs deploy`、`tcb hosting deploy` 都算）——先问用户。
- 不要把密钥、数据库连接串写进代码或 `cloudbaserc.json`；一律走 `.secrets/` 与 `cloudbaserc.local.json`（均已 gitignore）。
- 不要在 `src/repo/` 里直连数据库或硬编码 SQL 客户端——它接收注入的客户端，这样才能离线测。

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
  check-layers.mjs            分层方向 + 文件体积门禁（含 cloud/ 的体积预算）
  test-related.mjs            只跑相关测试
  finish-task.mjs             收尾：校验 + 测试 + 计划 + 提交
  backend.mjs                 后端运维：secret / migrate / deploy / smoke / status
  gen-icons.mjs               生成 PWA / iOS 的 PNG 图标
  gen-questions.mjs           出题流水线：--check 校验题库 / --draft 生成草稿 / --merge 合并
  question-schema.mjs         题目契约（pipeline 与 gen-questions 共用的**唯一**契约）
  llm.mjs                     出题 prompt + 模型调用
  extract-notes.mjs           笔记型仓库抽题 CLI：--repo（联网）/ --local（离线）/ --cache-only
  pipeline/                   题目获取流水线（与业务解耦，只产出草稿，不认识题库）
    run.mjs                   编排 CLI：--list / --all / --stage / --source / --limit / --mode
    sources.mjs               权威源注册表（含 license / authority）+ GitHub / arXiv 抓取
    arxiv.mjs                 arXiv Atom 解析（纯函数，离线可测）
    http.mjs                  带重试与日志的 HTTP 客户端（实现可注入）
    logger.mjs                结构化 JSONL 日志 + 计数 + 耗时 + 脱敏
    normalize.mjs             原始素材 → CorpusDoc（text 供出题 / verbatim 保逐字引用）
    chunk.mjs                 切块 + 跨源去重
    stages.mjs                normalize / chunk / draft 三个 stage 的落盘与统计
    notes.mjs                 笔记 Markdown → 问答候选（标题即问题、正文即答案；纯函数）
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
                               question-kind / merge / api / session / account / sync / reminder /
                               ...）
  hooks/use-sync.ts            同步层接到 React（合并落地后重读本机数据）
  pages/                       页面渲染
  App.tsx                      路由与状态编排
cloud/functions/api/           后端 HTTP 云函数（Nodejs20.19）
  index.mjs                    入口：事件适配（gateway / framework / direct）
  src/app.mjs                  装配：日志 → 路由 → 兜底错误
  src/router.mjs               路径匹配（按后缀，容忍 /api 前缀差异）
  src/routes/                  一个 endpoint 一个文件（auth-routes / progress-routes / health-routes）
  src/repo/                    PostgREST 读写（唯一接触数据库的地方；客户端可注入，测试不连库）
  src/core/                    口令 scrypt、自签令牌、结构化日志、入参校验、错误类型、配置
  src/http/                    请求解析与响应封装（事件形态差异都收在这两个文件里）
  schema.sql                   建表 + revoke（anon / authenticated 一律不给权限）
  test/                        node --test 用例（含 fakes.mjs 假 repo / 假事件）
cloudbaserc.json               函数声明；密钥走 cloudbaserc.local.json（已 gitignore）
```

### 后端改动流程（v0.14）

```bash
node tools/backend.mjs secret                # 只在首次/轮换密钥时跑
node tools/backend.mjs migrate               # 改了 schema.sql 就要跑（幂等）
node --test "cloud/functions/api/test/*.test.mjs"   # 只跑云函数用例
node tools/backend.mjs deploy                # 部署（先问用户！）
node tools/backend.mjs smoke                 # 部署后冒烟
```

- 云函数的依赖在 `cloud/functions/api/package.json`，由 `installDependency: true` 在部署时安装。
- **本地跑云函数测试不需要网络也不需要数据库**：repo 层是注入式的，用假客户端验证 SQL 调用顺序与参数。

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
   - 唯一的例外是 `notes.mjs` 里的「笔记目录 → 题库分类」映射表（`DIR_CATEGORY`）。它是覆盖面所需的**数据**，不是契约：
     合并时 `gen-questions.mjs --merge` 仍会按分类白名单重新校验，写错分类只会在那一步被拦下。
2. **出处必须逐字**：题目 `source.snippet` 只能取自 `chunk.verbatim`（原文切片）。normalize 的清洗规则只允许「删除」字符，加了插入类变换就会被 `checkBlocksVerbatim()` 记为 `corpus.nonverbatim` —— 这不是可以放宽的告警。
3. **失败要留痕**：新增/修改流程时同步补日志与计数（`logger.count` / `logger.timer`），单个源失败只记 error 不中断；错误最后要能在 `content/reports/latest.json` 里复盘。

测试只跑本目录（`node --test "tools/pipeline/*.test.mjs"`，共 127 个用例）；这些测试不联网，改 `sources.mjs` / `run.mjs` 时用注入假 `httpGetText` / `httpGetJson` 的方式验证编排。

### 笔记型仓库抽题（v0.11 新增）

```bash
node tools/extract-notes.mjs --local <已下载的笔记目录>          # 离线：只解析本地 Markdown
node tools/extract-notes.mjs --repo wdndev/llm_interview_note --ref main   # 联网：走 raw.githubusercontent.com
node tools/extract-notes.mjs --repo <owner/repo> --cache-only    # 只拉仓库树做调研，不抽题
```

与 `pipeline/run.mjs` 的分工：那条流水线处理「连续叙述型权威素材」（论文/文档），按长度切块；
这条处理「标题即问题、正文即答案」的面试笔记，按标题层级切分才能保住问答对应关系。

两个必须知道的坑：

1. **版权**：`llm_interview_note` 之类的社区笔记仓库**没有 LICENSE**，默认版权保留。
   草稿标签统一是 `["面试笔记", "待复核"]`、`source.type` 是 `community`，**入库前必须确认使用方式**；
   不要因为「技术上能抽出来」就默认合并。详见第 8 节。
2. **别整仓 clone**：这类仓库正文只有 ~1 MB，图片却上百 MB，直连 clone 极慢。
   用 `raw.githubusercontent.com` 按文件拉取即可（`http.mjs` 已带重试与日志）。

---

## 8. 素材版权（铁律 6）

题库里每一道题都要能说清「这段文字是谁的」。素材分两类：

| 类型 | 例子 | 入库条件 |
| --- | --- | --- |
| 许可明确 | arXiv 论文、官方文档、规范 | 可直接入库，`source.type` 填 `paper` / `doc` / `spec` |
| 许可不明 | 社区整理的个人笔记仓库（无 LICENSE = 默认版权保留） | **先问用户**，不要默认合并 |

- 不要因为「技术上已经抽出来了」就顺势并入题库；无 LICENSE 的仓库整段复制进公开站点有侵权风险。
- 社区素材来的草稿一律带 `待复核` 标签、`source.type: "community"`，`explanation` 里写明是二手资料。
- 抽取报告里的 `licenseNote` 记录了本次的许可判定，见 `content/reports/notes-latest.json`。

（v0.2 · 2026-09-22 更新：新增题目获取流水线）
（v0.3 · 2026-09-22 更新：新增笔记型仓库抽题流水线；补版权口径）
（v0.4 · 2026-09-22 更新：补第 4 节的评分阈值标定说明 —— 阈值必须按真实题库校准）

---

## 9. 后端与同步（v0.14 新增）

**背景**：v0.3 的「纯静态、不做账号」在 v0.14 被新需求推翻（进度要按账号隔离、要持久化）。后端是**最小引入**：只做账号与进度同步，不碰题库，也不替用户保管模型 key。完整背景见产品文档第 10.12 节。

### 数据库权限：为什么要 API Key

`schema.sql` 把两张表对 `anon` / `authenticated` **全部 revoke**，只留给 `service_role`。
但 `service_role` 不会因为「代码跑在云函数里」就自动拿到：

> 云函数调 `app.rdb()` 时用的是函数自身的 CAM 签名，网关把它判成 **`anon`**，
> 于是每次读写都返回 `permission denied for table drill_accounts`（HTTP 401）。
> 症状很有迷惑性：函数部署成功、`/health` 200，但 `/auth/register` 一律 500 `DB_ERROR`。

所以函数**必须**带 API Key：`core/db.mjs` 在 `init()` 里传 `accessKey: DRILL_API_KEY`
（该 key 的 JWT 里 `role=service_role`）。key 由 `node tools/backend.mjs apikey` 走
`tcb env apikey create` 生成、落 `.secrets/backend.env`，部署时 `deploy` 自动注入环境变量。
`assertConfig` 在缺 `DRILL_API_KEY` 时直接启动失败——宁可起不来，也不要静默降级成 anon。

### 三条不可越界的边界

1. **前端不碰数据库**：浏览器只认云函数 base，请求走 `app/src/lib/api.ts`。数据库账号只存在于云函数环境变量里（`core/config.mjs` 读），**不要**把任何数据库凭据写进前端或仓库。
2. **云函数不认识题库**：后端只搬「用户进度整包」（`ProgressPayload`），字段名与 `app/src/lib/storage.ts` 的本地 key 一一对应。加题型、加题库都不该改后端；反过来，后端加字段时必须同步 `types.ts` 与 `lib/merge.ts`。
3. **密钥与本地配置不入库**：`.secrets/`、`cloudbaserc.local.json` 已在 `.gitignore`；`cloudbaserc.json` 里只放非敏感声明（`DRILL_ENV`）。新增任何密钥都要走同样的路。

### 改后端时的手感

| 想做什么 | 动哪里 | 注意 |
| --- | --- | --- |
| 加一个接口 | `src/routes/<域>-routes.mjs` + 在 `src/router.mjs` 注册 | 路由按**后缀**匹配，所以要容忍 `/api` 前缀的有无 |
| 改口令 / 会话 | `src/core/password.mjs` / `src/core/token.mjs` | 口令是 scrypt(N=16384)；令牌是自签 HS256，**不是**平台登录态（平台不允许用户名+密码自助注册） |
| 改表结构 | `schema.sql` → `node tools/backend.mjs migrate` | 迁移是幂等的；新表继续 `revoke all from anon, authenticated` |
| 改 SQL 读写 | `src/repo/*.mjs` | repo 收「注入的客户端」，测试用 `test/helpers/fakes.mjs` 断言调用顺序，**不要**在 repo 里直连 |
| 改数据库连接 / 权限 | `src/core/db.mjs` + `DRILL_API_KEY` | 不带 API Key 就退化成 anon（见上一节）；`appOptions()` 有单测兜底 |
| 改同步策略 | `app/src/lib/merge.ts`（规则）+ `lib/sync.ts`（时机） | 合并规则要有用例；409 的语义是「带服务端最新值，让前端合并后重投一次」 |

### 收尾清单（改后端时）

```bash
node --test "cloud/functions/api/test/*.test.mjs"   # 云函数用例（不需要网络/数据库）
node tools/check-layers.mjs                          # 云函数单文件 ≤250 行
node tools/test-related.mjs                          # 若同时改了 app/src，会再挑前端相关用例
```

**不要擅自 `deploy`**：部署会改动线上环境，必须先问用户。部署后跑 `smoke`——它是一条
**真实 HTTP 全链路**（健康 → 注册/登录 → `/auth/me` → 进度读写）。只打 `/health` 不碰
数据库，而这正是上面那个 anon 坑能溜过去的空当。

（v0.5 · 2026-09-23 更新：新增第 9 节后端与同步约定；第 1 节补 hooks 层与 cloud/ 目录；第 4 节补云函数测试命令）
（v0.6 · 2026-09-23 更新：第 9 节补「为什么要 API Key」与全链路冒烟口径，踩坑记录见 T-033）

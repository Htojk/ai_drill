import type { Question } from "../types";
import { baseQuestions } from "./questions/base";
import { promptQuestions } from "./questions/prompt";
import { ragQuestions } from "./questions/rag";
import { agentQuestions } from "./questions/agent";
import { ontologyQuestions } from "./questions/ontology";

export const CATEGORIES = [
  "大模型基础",
  "提示工程",
  "RAG",
  "Agent",
  "本体与知识图谱",
  "微调与对齐",
  "评估与可观测",
  "工程与部署"
] as const;

export const QUESTIONS: Question[] = [
  ...baseQuestions,
  ...promptQuestions,
  ...ragQuestions,
  ...agentQuestions,
  ...ontologyQuestions,
{
    id: "q_tune_001",
    type: "single",
    isPractice: false,
    stem: "LoRA 微调的核心做法是什么？",
    options: [
      { key: "A", content: "冻结原模型权重，只训练注入的低秩矩阵", isCorrect: true },
      { key: "B", content: "全参数微调但使用更小的学习率", isCorrect: false, wrongReason: "那是全量微调，显存成本没有下降。" },
      { key: "C", content: "只训练 embedding 层", isCorrect: false, wrongReason: "只训 embedding 表达能力有限，也不等于 LoRA。" },
      { key: "D", content: "用提示词替代权重更新", isCorrect: false, wrongReason: "提示工程与微调是两条不同路径。" }
    ],
    explanation: "LoRA 在权重矩阵旁并联两个低秩矩阵 A、B，前向计算加上它们的乘积，训练时只更新 A、B，推理时可以把 BA 合并回原权重。",
    extension: "因为可训练参数极少，显存与存储成本大幅下降，还能为不同任务保存多个 adapter 按需热插拔。低秩秩 r 是最关键的超参。",
    difficulty: 2,
    categories: ["微调与对齐"],
    tags: ["LoRA", "参数高效微调"],
    source: {
      type: "paper",
      title: "LoRA: Low-Rank Adaptation of Large Language Models",
      url: "https://arxiv.org/abs/2106.09685",
      snippet: "LoRA freezes the pre-trained model weights and injects trainable rank decomposition matrices into each layer..."
    }
  },
{
    id: "q_tune_002",
    type: "single",
    isPractice: false,
    stem: "经典对齐流程中，SFT、奖励模型、RLHF 的正确先后顺序是？",
    options: [
      { key: "A", content: "RLHF → SFT → 奖励模型", isCorrect: false, wrongReason: "顺序颠倒，RLHF 依赖已训好的奖励模型。" },
      { key: "B", content: "SFT → 训练奖励模型 → RLHF", isCorrect: true },
      { key: "C", content: "奖励模型 → SFT → RLHF", isCorrect: false, wrongReason: "奖励模型需要基于指令遵循后的模型来打分。" },
      { key: "D", content: "三者顺序可以任意", isCorrect: false, wrongReason: "存在明确的数据与模型依赖关系。" }
    ],
    explanation: "先用示范数据做监督微调让模型学会遵循指令；再用人类偏好比较数据训练奖励模型；最后用强化学习最大化奖励，同时用 KL 约束避免偏离太远。",
    extension: "DPO 把「奖励建模 + 策略优化」合并为一步，省掉独立奖励模型和 RL 循环，工程上更容易落地。",
    difficulty: 3,
    categories: ["微调与对齐"],
    tags: ["RLHF", "对齐流程"],
    source: {
      type: "paper",
      title: "Training language models to follow instructions with human feedback",
      url: "https://arxiv.org/abs/2203.02155",
      snippet: "we fine-tune GPT-3 using human feedback: collect demonstrations, train a reward model, then optimize with PPO..."
    }
  },
{
    id: "q_tune_003",
    type: "single",
    isPractice: false,
    stem: "DPO 相对 RLHF 的主要优势是什么？",
    options: [
      { key: "A", content: "效果一定更好", isCorrect: false, wrongReason: "不同任务上结论不一致，不能说一定更好。" },
      { key: "B", content: "不需要单独训练奖励模型，也没有强化学习循环，训练更简单稳定", isCorrect: true },
      { key: "C", content: "完全不需要偏好数据", isCorrect: false, wrongReason: "DPO 依然依赖偏好对数据。" },
      { key: "D", content: "不需要基座模型", isCorrect: false, wrongReason: "DPO 仍以预训练模型为起点。" }
    ],
    explanation: "DPO 用偏好对直接优化策略，把 RLHF 的两阶段流程压缩成一步监督式训练，去掉了奖励模型和采样循环。",
    extension: "注意 DPO 对偏好数据质量很敏感；在数学、代码这类可验证任务上，可验证奖励 + RL 的方法有时仍占优。",
    difficulty: 3,
    categories: ["微调与对齐"],
    tags: ["DPO", "偏好优化"],
    source: {
      type: "paper",
      title: "Direct Preference Optimization: Your Language Model is Secretly a Reward Model",
      url: "https://arxiv.org/abs/2305.18290",
      snippet: "DPO stabilizes the policy by directly optimizing it with a simple classification loss, without fitting a reward model..."
    }
  },
{
    id: "q_eval_001",
    type: "single",
    isPractice: false,
    stem: "用 LLM 做裁判（LLM-as-Judge）时，最需要警惕的系统性偏差是什么？",
    options: [
      { key: "A", content: "位置偏差（偏向先出现的答案）与长度偏差（偏向更长的回答）", isCorrect: true },
      { key: "B", content: "只偏好中文回答", isCorrect: false, wrongReason: "语言偏好存在但不是最主要的两种系统性偏差。" },
      { key: "C", content: "无法处理多选评分", isCorrect: false, wrongReason: "量表和成对比较都是常用形式。" },
      { key: "D", content: "只能评估事实正确性", isCorrect: false, wrongReason: "它也能评风格、格式等，问题恰恰是过强的主观偏好。" }
    ],
    explanation: "裁判模型对答案出现顺序和长度存在稳定偏好，会系统性抬高某些回答的分数，导致评测结果偏离人类判断。",
    extension: "常见缓解手段：交换两个答案的位置各评一次再看一致性、限制回答长度、用人工标注数据校准裁判、并监控裁判与人工的一致率。",
    difficulty: 3,
    categories: ["评估与可观测"],
    tags: ["LLM-as-Judge", "偏差"],
    source: {
      type: "paper",
      title: "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena",
      url: "https://arxiv.org/abs/2306.05685",
      snippet: "we examine position bias, verbosity bias, self-enhancement bias, and limited reasoning ability of LLM judges..."
    }
  },
{
    id: "q_eval_002",
    type: "scenario",
    isPractice: true,
    stem: "模型在公开评测集上分数很高，但线上效果一般。最应该先怀疑什么？",
    options: [
      { key: "A", content: "评测集数据可能已经进入训练语料，存在数据污染（泄漏）", isCorrect: true },
      { key: "B", content: "线上用户要求太苛刻", isCorrect: false, wrongReason: "把问题归因给用户无助于定位。" },
      { key: "C", content: "推理服务器性能不足", isCorrect: false, wrongReason: "性能影响延迟，不解释质量落差。" },
      { key: "D", content: "评测脚本有 bug", isCorrect: false, wrongReason: "有可能，但污染是更普遍且更隐蔽的根因。" }
    ],
    explanation: "公开评测集常年被爬取并进入预训练语料，模型可能只是「背过答案」。此时分数反映的是记忆而非能力。",
    extension: "应对手段：自建不公开的私有测试集、做 n-gram 或语义重叠检测量化污染程度、定期用线上真实 query 回补评测集。",
    difficulty: 4,
    categories: ["评估与可观测"],
    tags: ["数据污染", "评测方法"],
    source: {
      type: "paper",
      title: "NLP Evaluation in trouble: On the Need to Measure LLM Data Contamination for each Benchmark",
      url: "https://arxiv.org/abs/2310.18018",
      snippet: "we argue that the community must measure and report data contamination for each benchmark..."
    }
  },
{
    id: "q_eval_003",
    type: "scenario",
    isPractice: true,
    stem: "离线评测分数涨了 3 分，但线上用户满意度没有变化。最合理的下一步是？",
    options: [
      { key: "A", content: "直接全量上线，离线指标就是金标准", isCorrect: false, wrongReason: "离线指标与线上脱钩时，它就不再是有效信号。" },
      { key: "B", content: "检查离线评测集是否代表线上真实分布，并补充线上可观测指标（任务完成率、人工反馈）", isCorrect: true },
      { key: "C", content: "直接加大模型规模", isCorrect: false, wrongReason: "在没搞清指标脱钩原因前扩规模属于盲目投入。" },
      { key: "D", content: "人为提高评测集难度", isCorrect: false, wrongReason: "改难度不解决「离线与线上不一致」这个根本问题。" }
    ],
    explanation: "离线指标只在评测集分布与线上一致时才有预测力。分布偏移会让分数与真实表现脱钩，此时涨分可能是过拟合评测集。",
    extension: "健康的评估体系要同时覆盖离线（快速迭代）与线上（真实效果），并建立「线上数据 → 回补评测集」的闭环。",
    difficulty: 3,
    categories: ["评估与可观测"],
    tags: ["离线线上一致性", "指标体系"],
    source: {
      type: "doc",
      title: "Google - Rules of Machine Learning: Best Practices for ML Engineering",
      url: "https://developers.google.com/machine-learning/guides/rules-of-ml",
      snippet: "Beware of the difference between your offline metrics and your live metrics..."
    }
  },
{
    id: "q_eng_001",
    type: "single",
    isPractice: false,
    stem: "为什么长上下文推理时显存会明显吃紧？",
    options: [
      { key: "A", content: "模型权重会随上下文变长而增大", isCorrect: false, wrongReason: "权重是固定的，与输入长度无关。" },
      { key: "B", content: "KV cache 随序列长度线性增长", isCorrect: true },
      { key: "C", content: "词表规模被动态扩展", isCorrect: false, wrongReason: "词表在训练后就固定了。" },
      { key: "D", content: "温度参数占用显存", isCorrect: false, wrongReason: "温度只是一个标量超参。" }
    ],
    explanation: "自回归生成时，每一层都要缓存历史 token 的 K、V 张量，长度越长缓存越大，并且随 batch size 继续放大。",
    extension: "这正是 PagedAttention/vLLM、GQA/MQA 等优化要解决的核心问题：把 KV cache 的分页管理与头维度共享做好，吞吐能提升数倍。",
    difficulty: 3,
    categories: ["工程与部署"],
    tags: ["KV cache", "显存"],
    source: {
      type: "paper",
      title: "Efficient Memory Management for Large Language Model Serving with PagedAttention",
      url: "https://arxiv.org/abs/2309.06180",
      snippet: "the key-value cache memory grows and shrinks dynamically, leading to significant memory fragmentation..."
    }
  },
{
    id: "q_eng_002",
    type: "scenario",
    isPractice: true,
    stem: "客服系统每次请求都携带 3000 token 的固定系统提示，延迟和成本都很高。最直接的优化手段是？",
    options: [
      { key: "A", content: "启用提示缓存（prompt caching），让固定前缀命中缓存", isCorrect: true },
      { key: "B", content: "把系统提示砍短", isCorrect: false, wrongReason: "可行但会损失能力，不是「最直接且无损」的手段。" },
      { key: "C", content: "把温度调到 0", isCorrect: false, wrongReason: "温度不影响这部分的计算量。" },
      { key: "D", content: "换成更小的模型", isCorrect: false, wrongReason: "牺牲能力，且不是针对该瓶颈的优化。" }
    ],
    explanation: "固定前缀的 KV 可以跨请求复用。命中缓存后这部分不再重复计算，直接降低首 token 延迟与计费 token 数。",
    extension: "缓存通常按前缀精确匹配，所以要把稳定内容放前面、易变内容放后面；只要前缀有一个 token 变化，缓存即失效。",
    difficulty: 3,
    categories: ["工程与部署"],
    tags: ["成本优化", "提示缓存"],
    source: {
      type: "doc",
      title: "Anthropic - Prompt Caching",
      url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching",
      snippet: "Prompt caching can reduce costs and latency for long prompts by reusing previously processed prefixes."
    }
  },
{
    id: "q_eng_003",
    type: "scenario",
    isPractice: true,
    stem: "线上 LLM 调用偶发超时，团队打算加重试。以下做法最正确的是？",
    options: [
      { key: "A", content: "失败就立即重试 3 次", isCorrect: false, wrongReason: "服务端过载时立即重试会放大压力，形成重试风暴。" },
      { key: "B", content: "指数退避 + 抖动，限制总超时预算，并对写操作加幂等键去重", isCorrect: true },
      { key: "C", content: "超时就直接返回空结果", isCorrect: false, wrongReason: "对用户是静默失败，体验比报错更差。" },
      { key: "D", content: "只在客户端做重试", isCorrect: false, wrongReason: "客户端重试无法控制服务端压力，也难以保证幂等。" }
    ],
    explanation: "指数退避拉长重试间隔，抖动打散同时重试的请求，避免同步冲击；总超时预算防止请求无限堆积；幂等键保证重试不会重复产生副作用。",
    extension: "重试必须区分错误类型：限流（429）适合退避重试，参数错误（400）重试无意义，超时要结合上游耗时分布设定预算。",
    difficulty: 4,
    categories: ["工程与部署"],
    tags: ["重试", "稳定性"],
    source: {
      type: "doc",
      title: "AWS Architecture Blog - Exponential Backoff And Jitter",
      url: "https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/",
      snippet: "we show that the benefits of adding jitter to backoff are substantial, and that full jitter performs best..."
    }
  }
];

export const QUESTIONS_BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));

export function getQuestion(id: string): Question | undefined {
  return QUESTIONS_BY_ID.get(id);
}

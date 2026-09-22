import type { Question } from "../../types";

export const tuningQuestions: Question[] = [
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
  }
];

import type { Question } from "../../types";

export const evalQuestions: Question[] = [
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
  }
];

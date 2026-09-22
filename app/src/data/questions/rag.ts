import type { Question } from "../../types";

export const ragQuestions: Question[] = [
  {
    id: "q_rag_001",
    type: "scenario",
    isPractice: true,
    stem: "线上 RAG 服务的召回率指标正常，但用户反馈答案质量明显下降。你最应该先排查哪一层？",
    options: [
      { key: "A", content: "调高 LLM 温度参数", isCorrect: false, wrongReason: "温度只影响生成随机性，与答案质量下降的因果关系最弱。" },
      { key: "B", content: "检查重排序后的 top-k 文档与问题的相关性", isCorrect: true },
      { key: "C", content: "把 chunk_size 调大", isCorrect: false, wrongReason: "这是修改动作不是排查动作，且 chunk 变大会稀释语义。" },
      { key: "D", content: "更换 embedding 模型", isCorrect: false, wrongReason: "变更成本高、影响面大，不应作为第一排查动作。" }
    ],
    explanation: "「召回率正常」只说明候选集里包含了相关文档，并不保证排序后进入上下文的是相关文档。最常见的故障是重排序或截断环节把相关文档挤出了 top-k。",
    extension: "建议的排查顺序：召回率 → 重排序结果 → 上下文组装 → 提示词 → 生成参数，逐层定位而不是直接改模型。",
    difficulty: 3,
    categories: ["RAG"],
    tags: ["线上事故", "排查方法"],
    source: {
      type: "doc",
      title: "LlamaIndex - Reranking",
      url: "https://docs.llamaindex.ai/en/stable/optimizing/production_rag/",
      snippet: "Reranking improves retrieval quality by re-scoring the retrieved nodes with a more accurate model..."
    }
  },
  {
    id: "q_rag_002",
    type: "single",
    isPractice: false,
    stem: "把向量检索的 top_k 从 5 提到 50 后，回答质量反而下降，最可能的原因是？",
    options: [
      { key: "A", content: "向量维度不够", isCorrect: false, wrongReason: "维度是模型固有能力，不随 top_k 改变。" },
      { key: "B", content: "召回的噪声文档被塞进上下文，干扰了生成", isCorrect: true },
      { key: "C", content: "检索变慢导致请求超时", isCorrect: false, wrongReason: "那是可用性问题，表现为报错而非质量下降。" },
      { key: "D", content: "超过了模型上下文窗口", isCorrect: false, wrongReason: "50 个块通常还在窗口内，且超窗会直接报错或截断。" }
    ],
    explanation: "提高 top_k 提升召回率但降低精度，无关文档进入上下文会稀释关键信息，甚至引入与正确文档相矛盾的事实。",
    extension: "正确姿势是「高召回 + 重排序」：向量召回 top_50 → rerank → 只把 top_5 放进去上下文。",
    difficulty: 3,
    categories: ["RAG"],
    tags: ["检索质量", "上下文"],
    source: {
      type: "doc",
      title: "LlamaIndex - Production RAG / Reranking",
      url: "https://docs.llamaindex.ai/en/stable/optimizing/production_rag/",
      snippet: "Retrieve a larger number of nodes, then rerank and keep only the top few most relevant ones."
    }
  },
  {
    id: "q_rag_003",
    type: "scenario",
    isPractice: true,
    stem: "文档切分用了 chunk_size=512、overlap=0，用户反馈「答案经常只答对一半」。最该先调整什么？",
    options: [
      { key: "A", content: "换一个更大的 embedding 模型", isCorrect: false, wrongReason: "模型不是瓶颈所在，切分方式才是。" },
      { key: "B", content: "增加相邻 chunk 的重叠（overlap），避免关键信息被切断", isCorrect: true },
      { key: "C", content: "降低 top_k", isCorrect: false, wrongReason: "降低 top_k 只会减少可用信息，让答案更不完整。" },
      { key: "D", content: "提高生成温度", isCorrect: false, wrongReason: "温度与信息完整性无关。" }
    ],
    explanation: "overlap=0 时，跨块边界的句子会被硬切断。检索命中的那一块缺少前提或结论，模型只能凭半截信息作答。",
    extension: "常见起点是 chunk 512~1024、overlap 取 chunk 的 10%~20%，再按文档结构（标题层级、代码块、表格）选择语义切分。",
    difficulty: 3,
    categories: ["RAG"],
    tags: ["切分策略", "线上事故"],
    source: {
      type: "doc",
      title: "LangChain - Text Splitters",
      url: "https://python.langchain.com/docs/concepts/text_splitters/",
      snippet: "Chunk overlap is helpful in maintaining continuity between chunks, ensuring that information isn't lost..."
    }
  }
];

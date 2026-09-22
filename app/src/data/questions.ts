import type { Question } from "../types";

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
  {
    id: "q_base_001",
    type: "single",
    isPractice: false,
    stem: "Transformer 的自注意力本身对输入顺序不敏感，模型靠什么获得「词序」信息？",
    options: [
      { key: "A", content: "词表大小", isCorrect: false, wrongReason: "词表只决定 token 到向量的映射，与顺序无关。" },
      { key: "B", content: "位置编码（如 RoPE、可学习绝对位置嵌入）", isCorrect: true },
      { key: "C", content: "层归一化", isCorrect: false, wrongReason: "归一化用于稳定训练，对置换仍然等变。" },
      { key: "D", content: "Dropout", isCorrect: false, wrongReason: "这是正则化手段，不携带位置信息。" }
    ],
    explanation: "自注意力是置换等变的：打乱输入顺序，注意力权重分布不变。因此必须额外注入位置信息，模型才能区分「猫追狗」和「狗追猫」。",
    extension: "RoPE 通过旋转矩阵把相对位置编码进 Q/K 内积，是目前主流 LLM 的默认选择，且天然支持一定程度的长度外推。",
    difficulty: 2,
    categories: ["大模型基础"],
    tags: ["Transformer", "位置编码"],
    source: {
      type: "paper",
      title: "RoFormer: Enhanced Transformer with Rotary Position Embedding",
      url: "https://arxiv.org/abs/2104.09864",
      snippet: "we propose a novel method named Rotary Position Embedding (RoPE) to leverage the positional information..."
    }
  },
  {
    id: "q_base_002",
    type: "single",
    isPractice: false,
    stem: "要把模型输出从「稳定可复现」调整为「更有创意」，最直接的做法是？",
    options: [
      { key: "A", content: "调高 temperature", isCorrect: true },
      { key: "B", content: "把 top_p 设为 0", isCorrect: false, wrongReason: "top_p=0 会把候选集截断到空，属于非法配置而非调参。" },
      { key: "C", content: "增大 max_tokens", isCorrect: false, wrongReason: "只影响输出长度上限，不改变随机性。" },
      { key: "D", content: "降低 temperature 并提高 top_k", isCorrect: false, wrongReason: "降低温度会更确定，方向与目标相反。" }
    ],
    explanation: "温度对 logits 做缩放，温度越高分布越平坦，采样越随机、越发散；温度趋近 0 时接近贪心解码。",
    extension: "即使 temperature=0，受批处理与并行归约顺序影响，输出也未必严格可复现，生产上不要依赖它做幂等保证。",
    difficulty: 2,
    categories: ["大模型基础"],
    tags: ["采样", "推理参数"],
    source: {
      type: "doc",
      title: "OpenAI API Reference - Chat Completions (temperature)",
      url: "https://platform.openai.com/docs/api-reference/chat",
      snippet: "What sampling temperature to use, between 0 and 2. Higher values like 0.8 will make the output more random..."
    }
  },
  {
    id: "q_base_003",
    type: "single",
    isPractice: false,
    stem: "把远超训练长度的文本塞给模型，最常见的后果是什么？",
    options: [
      { key: "A", content: "模型直接拒绝回答", isCorrect: false, wrongReason: "模型不会因为长度而拒绝，通常照常生成。" },
      { key: "B", content: "位置泛化能力下降，长文段质量明显退化", isCorrect: true },
      { key: "C", content: "显存占用保持不变", isCorrect: false, wrongReason: "KV cache 随上下文长度线性增长。" },
      { key: "D", content: "自动截断且对质量无影响", isCorrect: false, wrongReason: "截断只是兜底，被截掉的信息等价于丢失。" }
    ],
    explanation: "模型只在接近训练长度时有良好的位置泛化。超出后注意力分布失真，容易出现「中间遗忘」和答非所问。",
    extension: "实践中还有「Lost in the Middle」现象：关键信息放在长上下文中间时最容易被忽略，重要内容应放在开头或结尾。",
    difficulty: 2,
    categories: ["大模型基础"],
    tags: ["上下文窗口", "长文本"],
    source: {
      type: "paper",
      title: "Lost in the Middle: How Language Models Use Long Contexts",
      url: "https://arxiv.org/abs/2307.03172",
      snippet: "performance is often highest when relevant information occurs at the beginning or end of the input context..."
    }
  },
  {
    id: "q_prompt_001",
    type: "single",
    isPractice: false,
    stem: "以下哪类任务最能从思维链（CoT）中获益？",
    options: [
      { key: "A", content: "多步数学应用题", isCorrect: true },
      { key: "B", content: "从文本中抽取关键词", isCorrect: false, wrongReason: "单步映射任务，展开推理没有收益，反而增加延迟。" },
      { key: "C", content: "情感二分类", isCorrect: false, wrongReason: "简单任务上 CoT 收益很小。" },
      { key: "D", content: "把 JSON 转成 YAML", isCorrect: false, wrongReason: "纯格式转换，确定性任务不需要推理。" }
    ],
    explanation: "CoT 的价值在于把需要多步才能完成的任务显式展开，让模型逐步分配计算。任务本身不需要多步推理时，收益接近于零。",
    extension: "对简单任务强行加 CoT，不仅增加 token 成本和延迟，还可能引入本不存在的中间错误。",
    difficulty: 2,
    categories: ["提示工程"],
    tags: ["CoT", "提示策略"],
    source: {
      type: "paper",
      title: "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models",
      url: "https://arxiv.org/abs/2201.11903",
      snippet: "generating a chain of thought - a series of intermediate reasoning steps - significantly improves the ability..."
    }
  },
  {
    id: "q_prompt_002",
    type: "single",
    isPractice: true,
    stem: "给分类任务写 few-shot 示例时，最需要注意示例的哪个属性？",
    options: [
      { key: "A", content: "示例越多越好，把能塞的都塞进去", isCorrect: false, wrongReason: "占满上下文、抬高成本，还可能因分布失衡放大偏差。" },
      { key: "B", content: "标签分布应接近真实分布，同时注意近因偏差（越靠后的示例影响越大）", isCorrect: true },
      { key: "C", content: "示例必须按字母序排列", isCorrect: false, wrongReason: "字母序无依据，反而可能造成某种标签总是靠后。" },
      { key: "D", content: "只要示例本身正确，顺序完全无影响", isCorrect: false, wrongReason: "顺序会显著影响结果，这是被反复验证的现象。" }
    ],
    explanation: "示例标签分布失衡会让模型倒向多数标签；同时靠后的示例对输出影响更大，形成近因偏差。两者叠加会让指标虚高或虚低。",
    extension: "工程做法：对示例顺序做多次随机洗牌并集成结果，可明显降低方差，但代价是调用次数翻倍。",
    difficulty: 3,
    categories: ["提示工程"],
    tags: ["Few-shot", "偏差"],
    source: {
      type: "paper",
      title: "Fantastically Ordered Prompts and Where to Find Them",
      url: "https://arxiv.org/abs/2104.00703",
      snippet: "the order of examples in the prompt can cause accuracy to vary from near chance to near state-of-the-art..."
    }
  },
  {
    id: "q_prompt_003",
    type: "single",
    isPractice: false,
    stem: "需要模型稳定输出可被程序解析的 JSON，最可靠的做法是？",
    options: [
      { key: "A", content: "在提示词里写「请只输出 JSON，不要任何解释」", isCorrect: false, wrongReason: "属于软约束，仍有一定概率夹带解释文字导致解析失败。" },
      { key: "B", content: "使用支持 JSON Schema 约束的结构化输出能力", isCorrect: true },
      { key: "C", content: "调高温度让格式更灵活", isCorrect: false, wrongReason: "温度越高越不稳定，方向相反。" },
      { key: "D", content: "用正则从自由文本里抽取字段", isCorrect: false, wrongReason: "可行的兜底，但脆弱且维护成本高。" }
    ],
    explanation: "提示词约束是「软约束」，模型可能自作主张加说明；结构化输出是在解码阶段强制符合 schema，属于「硬约束」。",
    extension: "没有原生结构化输出时，退一步的方案是 few-shot + 解析失败自动重试，但要设重试上限避免成本失控。",
    difficulty: 2,
    categories: ["提示工程"],
    tags: ["结构化输出", "可靠性"],
    source: {
      type: "doc",
      title: "OpenAI - Structured Outputs",
      url: "https://platform.openai.com/docs/guides/structured-outputs",
      snippet: "Structured Outputs is a feature that ensures the model will always generate responses that adhere to your supplied JSON Schema."
    }
  },
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
  },
  {
    id: "q_agent_001",
    type: "single",
    isPractice: false,
    stem: "ReAct 范式的核心机制是什么？",
    options: [
      { key: "A", content: "推理（Reasoning）与行动（Acting）交替进行", isCorrect: true },
      { key: "B", content: "一次性生成完整执行计划再逐步执行", isCorrect: false, wrongReason: "那是 Plan-and-Execute 的思路，ReAct 是边想边做。" },
      { key: "C", content: "完全依赖微调而不依赖提示", isCorrect: false, wrongReason: "ReAct 本质是提示工程范式。" },
      { key: "D", content: "把工具调用交给外部编排引擎决定", isCorrect: false, wrongReason: "ReAct 中决策由模型自身产生。" }
    ],
    explanation: "ReAct 让模型在「思考 → 调用工具 → 观察结果 → 再思考」之间循环，用工具返回的真实信息修正后续推理。",
    extension: "相比纯 CoT，ReAct 的最大价值是引入外部事实反馈，能显著降低凭空编造。",
    difficulty: 2,
    categories: ["Agent"],
    tags: ["ReAct", "工具调用"],
    source: {
      type: "paper",
      title: "ReAct: Synergizing Reasoning and Acting in Language Models",
      url: "https://arxiv.org/abs/2210.03629",
      snippet: "we explore the use of LLMs to generate both reasoning traces and task-specific actions in an interleaved manner..."
    }
  },
  {
    id: "q_agent_002",
    type: "single",
    isPractice: false,
    stem: "LLM 的 function calling 本质上是什么？",
    options: [
      { key: "A", content: "模型真的执行了这个函数", isCorrect: false, wrongReason: "模型不执行任何代码，也不会产生副作用。" },
      { key: "B", content: "模型按约定 schema 输出结构化参数，由外部程序决定是否执行", isCorrect: true },
      { key: "C", content: "一种必须依靠微调才能获得的能力", isCorrect: false, wrongReason: "主要靠协议约定与训练，业务侧不需要微调。" },
      { key: "D", content: "模型内部内置了工具运行时", isCorrect: false, wrongReason: "模型内部没有运行时环境。" }
    ],
    explanation: "模型只负责决定「调哪个工具、传什么参数」，真正执行发生在应用侧。因此模型输出必须被视为不可信输入。",
    extension: "这意味着权限校验、参数校验、幂等控制和沙箱隔离都要由应用负责，不能把安全寄托在提示词上。",
    difficulty: 3,
    categories: ["Agent"],
    tags: ["Function Calling", "安全"],
    source: {
      type: "doc",
      title: "OpenAI - Function Calling",
      url: "https://platform.openai.com/docs/guides/function-calling",
      snippet: "Function calling allows you to connect models like gpt-4o to external tools and systems..."
    }
  },
  {
    id: "q_agent_003",
    type: "scenario",
    isPractice: true,
    stem: "团队要做客服 Agent，在「单 Agent + 多工具」和「多 Agent 协作」之间纠结。以下判断最合理的是？",
    options: [
      { key: "A", content: "多 Agent 一定更强，直接上多 Agent", isCorrect: false, wrongReason: "复杂度上升未必带来效果提升，反而更容易失控。" },
      { key: "B", content: "先用单 Agent + 多工具跑通；只有当子任务需要独立上下文/独立工具集且互相干扰时再拆分", isCorrect: true },
      { key: "C", content: "单 Agent 工具一超过 3 个就会失败，必须拆分", isCorrect: false, wrongReason: "工具数量不是拆分的充分条件，取决于任务边界与干扰程度。" },
      { key: "D", content: "多 Agent 的成本一定更低", isCorrect: false, wrongReason: "多 Agent 意味着更多次 LLM 调用与上下文传递，成本通常更高。" }
    ],
    explanation: "多 Agent 会引入上下文传递、状态同步、错误放大和成本上升。拆分的前提是子任务边界清晰，且确实存在上下文或工具集的相互干扰。",
    extension: "Anthropic 的建议是从最简单可行的方案起步，只有在复杂度被证明必要时才引入，并为其单独做评估。",
    difficulty: 4,
    categories: ["Agent"],
    tags: ["架构选型", "选型权衡"],
    source: {
      type: "doc",
      title: "Anthropic - Building Effective Agents",
      url: "https://www.anthropic.com/engineering/building-effective-agents",
      snippet: "we recommend finding the simplest solution possible, and only increasing complexity when needed..."
    }
  }
,
  {
    id: "q_onto_001",
    type: "single",
    isPractice: false,
    stem: "OWL 相对 RDF Schema（RDFS）的关键增强是什么？",
    options: [
      { key: "A", content: "更强的表达能力与推理支持", isCorrect: true },
      { key: "B", content: "更快的查询解析速度", isCorrect: false, wrongReason: "表达力越强推理通常越慢，方向相反。" },
      { key: "C", content: "取代了 SPARQL", isCorrect: false, wrongReason: "SPARQL 是查询语言，与 OWL 不是替代关系。" },
      { key: "D", content: "把三元组换成属性图存储", isCorrect: false, wrongReason: "OWL 仍建立在 RDF 三元组模型之上。" }
    ],
    explanation: "RDF/RDFS 只能描述基本的类与属性词汇，OWL 引入了基数约束、等价/不相交类、属性特征等公理，可支撑描述逻辑层面的自动推理。",
    extension: "代价是推理复杂度上升：OWL DL 推理在大规模本体上可能非常慢，工程上常用 OWL 2 RL 这类可工程化的子集。",
    difficulty: 3,
    categories: ["本体与知识图谱"],
    tags: ["OWL", "RDFS"],
    source: {
      type: "spec",
      title: "W3C - OWL 2 Web Ontology Language Document Overview",
      url: "https://www.w3.org/TR/owl2-overview/",
      snippet: "OWL 2 is an ontology language for the Semantic Web with formally defined meaning..."
    }
  },
  {
    id: "q_onto_002",
    type: "single",
    isPractice: false,
    stem: "在 SPARQL 中，匹配一个三元组模式并返回绑定变量的基本写法是？",
    options: [
      { key: "A", content: "SELECT ?s WHERE { ?s ?p ?o }", isCorrect: true },
      { key: "B", content: "MATCH (n) RETURN n", isCorrect: false, wrongReason: "这是 Cypher（属性图）语法，不是 SPARQL。" },
      { key: "C", content: "FIND ?s WHERE { ... }", isCorrect: false, wrongReason: "SPARQL 没有 FIND 关键字。" },
      { key: "D", content: "GRAPH QUERY { ... }", isCorrect: false, wrongReason: "SPARQL 用 GRAPH 指定命名图，不是查询入口。" }
    ],
    explanation: "SPARQL 以三元组模式为核心，`?s ?p ?o` 分别绑定主语、谓语、宾语，查询引擎做模式匹配并返回变量绑定。",
    extension: "Cypher 面向属性图（Neo4j），SPARQL 面向 RDF 图，两者在数据模型与查询语义上都不同，不能直接互换。",
    difficulty: 2,
    categories: ["本体与知识图谱"],
    tags: ["SPARQL", "RDF"],
    source: {
      type: "spec",
      title: "W3C - SPARQL 1.1 Query Language",
      url: "https://www.w3.org/TR/sparql11-query/",
      snippet: "SPARQL queries are expressed as a set of triple patterns, which are matched against the RDF graph..."
    }
  },
  {
    id: "q_onto_003",
    type: "scenario",
    isPractice: true,
    stem: "多跳问答（例如「A 公司的 CEO 毕业于哪所大学」）用纯向量 RAG 效果很差，最应该引入什么？",
    options: [
      { key: "A", content: "换一个参数量更大的 embedding 模型", isCorrect: false, wrongReason: "再好的向量模型也无法沿关系链做多跳推理。" },
      { key: "B", content: "知识图谱与关系抽取，把多跳关系显式建模后再检索", isCorrect: true },
      { key: "C", content: "提高生成温度", isCorrect: false, wrongReason: "温度只改变随机性，不补信息。" },
      { key: "D", content: "把 top_k 调到 200", isCorrect: false, wrongReason: "增大召回只会带来更多噪声，仍无法串联两跳关系。" }
    ],
    explanation: "向量检索擅长「语义相似」，不擅长「沿关系链推理」。多跳问题需要在 A→B 与 B→C 之间做实体的精确对齐，这正是图结构的强项。",
    extension: "GraphRAG 的做法是先从文档抽实体与关系构图，再用社区摘要回答全局性问题、用图遍历回答多跳问题，与向量检索互补。",
    difficulty: 4,
    categories: ["本体与知识图谱", "RAG"],
    tags: ["GraphRAG", "多跳问答"],
    source: {
      type: "paper",
      title: "From Local to Global: A Graph RAG Approach to Query-Focused Summarization",
      url: "https://arxiv.org/abs/2404.16130",
      snippet: "we propose GraphRAG, a graph-based approach that builds an entity knowledge graph and uses community summaries..."
    }
  },
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

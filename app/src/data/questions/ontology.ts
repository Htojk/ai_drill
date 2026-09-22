import type { Question } from "../../types";

export const ontologyQuestions: Question[] = [
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
  }
];

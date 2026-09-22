import type { Question } from "../../types";
import { baseQuestions } from "./base";
import { promptQuestions } from "./prompt";
import { ragQuestions } from "./rag";
import { agentQuestions } from "./agent";
import { ontologyQuestions } from "./ontology";
import { tuningQuestions } from "./tuning";
import { evalQuestions } from "./eval";
import { engineeringQuestions } from "./engineering";

/** 题库分类。新增分类时同步补一个同名的 <分类>.ts 数据文件。 */
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

/**
 * 全部题目。
 * 注意：数组顺序会影响「新用户均匀摸底」的抽样结果，
 * 所以新增分类请追加到末尾，不要插在中间。
 */
export const QUESTIONS: Question[] = [
  ...baseQuestions,
  ...promptQuestions,
  ...ragQuestions,
  ...agentQuestions,
  ...ontologyQuestions,
  ...tuningQuestions,
  ...evalQuestions,
  ...engineeringQuestions
];

export const QUESTIONS_BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));

export function getQuestion(id: string): Question | undefined {
  return QUESTIONS_BY_ID.get(id);
}

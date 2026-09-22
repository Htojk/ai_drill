import { TEXT_ANSWER_TYPES } from "../types";
import type { Question, QuestionType } from "../types";

/** 是否需要用户输入文字作答（简答题）。 */
export function isTextAnswer(question: Question): boolean {
  return TEXT_ANSWER_TYPES.includes(question.type);
}

/** 选择题是否多选：正确选项多于 1 个时自动按多选渲染。 */
export function isMultiChoice(question: Question): boolean {
  return question.options.filter((o) => o.isCorrect).length > 1;
}

/** 选择题的正确选项 key；简答题没有选项，自然得到空数组。 */
export function correctKeysOf(question: Question): string[] {
  return question.options.filter((o) => o.isCorrect).map((o) => o.key);
}

/**
 * 列表里显示的「正确答案」文案。
 * 简答题没有选项，硬拼会渲染出一个空的「正确答案：」，所以返回 null 表示不显示。
 */
export function correctAnswerLabel(question: Question): string | null {
  const keys = correctKeysOf(question);
  return keys.length ? `正确答案：${keys.join("、")}` : null;
}

export const TYPE_LABELS: Record<QuestionType, string> = {
  single: "单选",
  judge: "判断",
  short: "简答",
  scenario: "场景"
};

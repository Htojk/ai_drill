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

export const TYPE_LABELS: Record<QuestionType, string> = {
  single: "单选",
  judge: "判断",
  short: "简答",
  scenario: "场景"
};

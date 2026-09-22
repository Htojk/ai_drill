import type { DailyTask } from "../types";

/**
 * 断点续答：找出当天任务里第一道还没做的题。
 * 全部做完（或任务为空）时返回 0，相当于允许重新过一遍。
 */
export function firstPendingIndex(task: DailyTask): number {
  if (task.questionIds.length === 0) return 0;
  const done = new Set(task.completed);
  const index = task.questionIds.findIndex((id) => !done.has(id));
  return index === -1 ? 0 : index;
}

/** 当天任务还剩几题没做。 */
export function pendingCount(task: DailyTask): number {
  const done = new Set(task.completed);
  return task.questionIds.filter((id) => !done.has(id)).length;
}

/** 把一道题标记为已完成（幂等），返回新的任务对象。 */
export function markCompleted(task: DailyTask, questionId: string): DailyTask {
  if (!task.questionIds.includes(questionId) || task.completed.includes(questionId)) return task;
  return { ...task, completed: [...task.completed, questionId] };
}

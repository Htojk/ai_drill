/**
 * 题型：
 *   single   —— 单选（选项里恰好 1 个正确）
 *   judge    —— 判断题（2 个选项：正确 / 错误）
 *   short    —— 简答题（没有选项，用户输入文字，由批阅层评分）
 *   scenario —— 场景题，渲染同 single，但带「工程判断」语境
 */
export type QuestionType = "single" | "judge" | "short" | "scenario";

/** 需要用户输入文字作答的题型。 */
export const TEXT_ANSWER_TYPES: QuestionType[] = ["short"];

export interface QuestionOption {
  key: string;
  content: string;
  isCorrect: boolean;
  wrongReason?: string;
}

export interface QuestionSource {
  type: "paper" | "doc" | "spec" | "community";
  title: string;
  url: string;
  snippet: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  isPractice: boolean;
  stem: string;
  options: QuestionOption[];
  /** 简答题的参考答案（完整表述），查看答案时展示 */
  referenceAnswer?: string;
  /** 简答题的评分要点：命中得分的要点清单 */
  keyPoints?: string[];
  explanation: string;
  extension?: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  categories: string[];
  tags: string[];
  source: QuestionSource;
}

export type AnswerMode = "daily" | "practice" | "review";

/** 用户对某题的熟练度自评 */
export type MasteryLevel = "mastered" | "fuzzy" | "unknown";

export interface MasteryState {
  questionId: string;
  level: MasteryLevel;
  updatedAt: number;
  /** true = 用户手动选的；false = 由答题结果/查看答案自动写入 */
  explicit: boolean;
}

export type GradeVerdict = "correct" | "partial" | "wrong" | "blank";

/** 简答题的批阅结果。by 标明是谁批的：本地规则 or 模型 */
export interface ShortAnswerGrade {
  verdict: GradeVerdict;
  /** 0–100 得分 */
  score: number;
  /** 命中的评分要点 */
  hitPoints: string[];
  /** 漏掉的评分要点 */
  missedPoints: string[];
  /** 批阅评语 */
  comment: string;
  by: "local" | "agent";
  /** 模型批阅失败降级到本地时为 true，UI 可提示 */
  degraded?: boolean;
}

export interface AnswerRecord {
  questionId: string;
  chosen: string[];
  /** 简答题的作答原文 */
  answerText?: string;
  /** 简答题的批阅结果 */
  grade?: ShortAnswerGrade;
  /** 作答时的熟练度（作答后写入） */
  mastery?: MasteryLevel;
  /** 是否在作答前/后查看过答案（查看答案即视为未掌握） */
  viewedAnswer?: boolean;
  isCorrect: boolean;
  durationMs: number;
  mode: AnswerMode;
  answeredAt: number;
}

export interface ReviewState {
  questionId: string;
  stage: number;
  nextReviewAt: number;
  wrongCount: number;
  /** 上次复习时间，艾宾浩斯曲线按「距上次复习的天数」判断遗忘程度 */
  lastReviewedAt?: number;
  /** 上一次排定的间隔天数（用于显示与调参） */
  intervalDays?: number;
  /** 连续答对次数：与已掌握度一起决定间隔倍率 */
  streakCorrect?: number;
}

export interface Profile {
  streak: number;
  lastActiveDate: string;
  totalAnswered: number;
  totalCorrect: number;
  onboarded: boolean;
}

export interface DailyTask {
  date: string;
  questionIds: string[];
  completed: string[];
}

export interface CategoryStat {
  category: string;
  answered: number;
  correct: number;
  accuracy: number;
}

export type ReportReason = "wrong_answer" | "unclear" | "disputed" | "other";

/**
 * 模型批阅的配置（纯静态站点没有后端，key 只能由用户自带并存在本机）。
 * enabled=false 或没填 key 时，批阅自动降级为本地要点覆盖评分。
 */
export interface AgentConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface QuestionReport {
  questionId: string;
  reason: ReportReason;
  createdAt: number;
}

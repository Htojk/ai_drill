export type QuestionType = "single" | "judge" | "scenario";

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
  explanation: string;
  extension?: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  categories: string[];
  tags: string[];
  source: QuestionSource;
}

export type AnswerMode = "daily" | "practice" | "review";

export interface AnswerRecord {
  questionId: string;
  chosen: string[];
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

export interface QuestionReport {
  questionId: string;
  reason: ReportReason;
  createdAt: number;
}

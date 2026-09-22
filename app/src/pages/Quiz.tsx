import { useMemo, useRef, useState } from "react";
import { QUESTIONS_BY_ID } from "../data/questions";
import { gradeShortAnswer } from "../lib/agent";
import * as agentStore from "../lib/agent-store";
import { isMultiChoice, isTextAnswer } from "../lib/question-kind";
import * as store from "../lib/storage";
import type { AnswerMode, AnswerRecord, MasteryLevel, MasteryState, Question, ReportReason, ShortAnswerGrade } from "../types";
import MasteryPicker from "./MasteryPicker";
import QuestionBody from "./QuestionBody";
import QuizExplanation from "./QuizExplanation";

interface Props {
  ids: string[];
  mode: AnswerMode;
  /** 断点续答：从第几题开始（0 基） */
  initialIndex?: number;
  bookmarkIds: string[];
  mastery: Record<string, MasteryState>;
  onAnswer: (record: AnswerRecord) => void;
  onFinish: () => void;
  onExit: () => void;
  onToggleBookmark: (questionId: string) => void;
  onMastery: (questionId: string, level: MasteryLevel) => void;
}

export default function Quiz({
  ids,
  mode,
  initialIndex = 0,
  bookmarkIds,
  mastery,
  onAnswer,
  onFinish,
  onExit,
  onToggleBookmark,
  onMastery
}: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [selected, setSelected] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [answerText, setAnswerText] = useState("");
  const [grade, setGrade] = useState<ShortAnswerGrade | null>(null);
  const [grading, setGrading] = useState(false);
  const [viewedAnswer, setViewedAnswer] = useState(false);
  const [reports, setReports] = useState<Record<string, ReportReason | "open">>({});
  const startedAt = useRef<number>(Date.now());

  const questions = useMemo(
    () => ids.map((id) => QUESTIONS_BY_ID.get(id)).filter((q): q is Question => !!q),
    [ids]
  );
  const question = questions[index];
  const isMulti = useMemo(() => (question ? isMultiChoice(question) : false), [question]);

  if (!question) {
    return (
      <div className="card">
        <p>题目加载失败。</p>
        <button className="btn ghost" onClick={onExit}>返回</button>
      </div>
    );
  }

  const reportState = reports[question.id];
  const correctKeys = question.options.filter((o) => o.isCorrect).map((o) => o.key);
  const choiceCorrect = selected.length === correctKeys.length && selected.every((k) => correctKeys.includes(k));
  const isCorrect = grade ? grade.verdict === "correct" : choiceCorrect;

  /** 收尾当前题：写记录、推进复习、刷新熟练度。 */
  function record(over: Partial<AnswerRecord>) {
    const base: AnswerRecord = {
      questionId: question!.id,
      chosen: selected,
      isCorrect,
      durationMs: Date.now() - startedAt.current,
      mode,
      answeredAt: Date.now(),
      ...over
    };
    onAnswer(base);
  }

  function toggle(key: string) {
    if (submitted) return;
    if (isMulti) setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
    else setSelected([key]);
  }

  function submitChoice() {
    if (selected.length === 0) return;
    setSubmitted(true);
    record({});
  }

  async function submitShort() {
    setGrading(true);
    try {
      const result = await gradeShortAnswer({
        question: question!,
        answer: answerText,
        config: agentStore.loadAgentConfig()
      });
      setGrade(result);
      setSubmitted(true);
      record({ answerText, grade: result, isCorrect: result.verdict === "correct" });
    } finally {
      setGrading(false);
    }
  }

  /** 直接看答案：按产品规则记为「未掌握」，并且不因为是选择题就当作答对。 */
  function revealAnswer() {
    setViewedAnswer(true);
    setSubmitted(true);
    record({ isCorrect: false, viewedAnswer: true, answerText });
  }

  function next() {
    if (index + 1 >= questions.length) {
      onFinish();
      return;
    }
    setIndex(index + 1);
    setSelected([]);
    setSubmitted(false);
    setAnswerText("");
    setGrade(null);
    setViewedAnswer(false);
    startedAt.current = Date.now();
  }

  function submitReport(reason: ReportReason) {
    store.appendReport({ questionId: question!.id, reason, createdAt: Date.now() });
    setReports((prev) => ({ ...prev, [question!.id]: reason }));
  }

  return (
    <>
      <div className="hd">
        <h1>第 {index + 1} / {questions.length} 题</h1>
        <div style={{ display: "flex", gap: 8, flex: "none" }}>
          <button
            className="btn ghost small"
            style={{ width: "auto", padding: "6px 12px" }}
            onClick={() => onToggleBookmark(question.id)}
          >
            {bookmarkIds.includes(question.id) ? "★ 已收藏" : "☆ 收藏"}
          </button>
          <button className="btn ghost small" style={{ width: "auto", padding: "6px 12px" }} onClick={onExit}>
            退出
          </button>
        </div>
      </div>

      <div className="bar" style={{ marginBottom: 16 }}>
        <i style={{ width: Math.round(((index + (submitted ? 1 : 0)) / questions.length) * 100) + "%" }} />
      </div>

      <QuestionBody
        question={question}
        isMulti={isMulti}
        selected={selected}
        submitted={submitted}
        onToggle={toggle}
        answer={answerText}
        onAnswerChange={setAnswerText}
        onSubmitShort={submitShort}
        onReveal={revealAnswer}
        grading={grading}
      />

      {!isTextAnswer(question) && !submitted && (
        <button className="btn" disabled={selected.length === 0} onClick={submitChoice} style={{ marginTop: 6 }}>
          提交
        </button>
      )}

      {submitted && (
        <QuizExplanation
          question={question}
          isCorrect={isCorrect}
          grade={grade}
          viewedAnswer={viewedAnswer}
          correctKeys={correctKeys}
          reportState={reportState}
          onOpenReport={() => setReports((prev) => ({ ...prev, [question!.id]: "open" }))}
          onReport={submitReport}
          isLast={index + 1 >= questions.length}
          onNext={next}
          footer={
            <MasteryPicker
              current={mastery[question.id]?.level ?? "unknown"}
              onPick={(level) => onMastery(question.id, level)}
            />
          }
        />
      )}
    </>
  );
}

import { useMemo, useRef, useState } from "react";
import { QUESTIONS_BY_ID } from "../data/questions";
import * as store from "../lib/storage";
import type { AnswerMode, AnswerRecord, Question, ReportReason } from "../types";
import QuizExplanation from "./QuizExplanation";

interface Props {
  ids: string[];
  mode: AnswerMode;
  bookmarkIds: string[];
  onAnswer: (record: AnswerRecord) => void;
  onFinish: () => void;
  onExit: () => void;
  onToggleBookmark: (questionId: string) => void;
}

export default function Quiz({ ids, mode, bookmarkIds, onAnswer, onFinish, onExit, onToggleBookmark }: Props) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [reports, setReports] = useState<Record<string, ReportReason | "open">>({});
  const startedAt = useRef<number>(Date.now());

  const questions = useMemo(
    () => ids.map((id) => QUESTIONS_BY_ID.get(id)).filter((q): q is Question => !!q),
    [ids]
  );
  const question = questions[index];
  const isMulti = useMemo(
    () => (question ? question.options.filter((o) => o.isCorrect).length > 1 : false),
    [question]
  );

  if (!question) {
    return (
      <div className="card">
        <p>题目加载失败。</p>
        <button className="btn ghost" onClick={onExit}>返回</button>
      </div>
    );
  }

  const reportState = reports[question.id];

  function submitReport(reason: ReportReason) {
    store.appendReport({ questionId: question!.id, reason, createdAt: Date.now() });
    setReports((prev) => ({ ...prev, [question!.id]: reason }));
  }

  const correctKeys = question.options.filter((o) => o.isCorrect).map((o) => o.key);
  const isCorrect =
    selected.length === correctKeys.length && selected.every((k) => correctKeys.includes(k));

  function toggle(key: string) {
    if (submitted) return;
    if (isMulti) {
      setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
    } else {
      setSelected([key]);
    }
  }

  function submit() {
    if (selected.length === 0) return;
    setSubmitted(true);
    onAnswer({
      questionId: question.id,
      chosen: selected,
      isCorrect,
      durationMs: Date.now() - startedAt.current,
      mode,
      answeredAt: Date.now()
    });
  }

  function next() {
    if (index + 1 >= questions.length) {
      onFinish();
      return;
    }
    setIndex(index + 1);
    setSelected([]);
    setSubmitted(false);
    startedAt.current = Date.now();
  }

  return (
    <>
      <div className="hd">
        <h1>
          第 {index + 1} / {questions.length} 题
        </h1>
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

      <div className="card">
        <div style={{ marginBottom: 10 }}>
          <span className="tag">{question.categories.join(" · ")}</span>
          {question.isPractice && <span className="tag warn">工程判断</span>}
          {isMulti && <span className="tag">多选</span>}
        </div>
        <p className="stem">{question.stem}</p>

        {question.options.map((opt) => {
          let cls = "opt";
          if (submitted) {
            if (opt.isCorrect) cls += " ok";
            else if (selected.includes(opt.key)) cls += " bad";
          } else if (selected.includes(opt.key)) {
            cls += " sel";
          }
          return (
            <button key={opt.key} className={cls} onClick={() => toggle(opt.key)}>
              <span className="key">{opt.key}.</span>
              {opt.content}
              {submitted && opt.wrongReason && !opt.isCorrect && <span className="why">✗ {opt.wrongReason}</span>}
            </button>
          );
        })}

        {!submitted && (
          <button className="btn" disabled={selected.length === 0} onClick={submit} style={{ marginTop: 6 }}>
            提交
          </button>
        )}

        {submitted && (
          <QuizExplanation
            question={question}
            isCorrect={isCorrect}
            correctKeys={correctKeys}
            reportState={reportState}
            onOpenReport={() => setReports((prev) => ({ ...prev, [question!.id]: "open" }))}
            onReport={submitReport}
            isLast={index + 1 >= questions.length}
            onNext={next}
          />
        )}
      </div>
    </>
  );
}

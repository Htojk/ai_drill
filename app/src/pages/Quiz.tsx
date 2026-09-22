import { useMemo, useRef, useState } from "react";
import { QUESTIONS_BY_ID } from "../data/questions";
import * as store from "../lib/storage";
import type { AnswerMode, AnswerRecord, Question, ReportReason } from "../types";

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "wrong_answer", label: "答案有误" },
  { value: "unclear", label: "表述不清" },
  { value: "disputed", label: "有争议" },
  { value: "other", label: "其他" }
];

interface Props {
  ids: string[];
  mode: AnswerMode;
  onAnswer: (record: AnswerRecord) => void;
  onFinish: () => void;
  onExit: () => void;
}

export default function Quiz({ ids, mode, onAnswer, onFinish, onExit }: Props) {
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
        <button className="btn ghost small" style={{ width: "auto", padding: "6px 12px" }} onClick={onExit}>
          退出
        </button>
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
          <>
            <div className="card" style={{ background: isCorrect ? "rgba(34,197,94,.1)" : "rgba(239,68,68,.1)", borderColor: isCorrect ? "var(--ok)" : "var(--bad)", marginTop: 12, marginBottom: 0 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {isCorrect ? "✅ 答对了" : "❌ 答错了"}
              </div>
              <div className="muted">正确答案：{correctKeys.join("、")}</div>
            </div>

            <div className="exp">
              <h4>为什么对</h4>
              <p>{question.explanation}</p>
              {question.extension && (
                <>
                  <h4>延伸</h4>
                  <p>{question.extension}</p>
                </>
              )}
              <a className="src" href={question.source.url} target="_blank" rel="noreferrer">
                出处 · {question.source.title} ↗
              </a>
              {question.source.snippet && <p className="snip">“{question.source.snippet}”</p>}

              <div className="report">
                {!reportState && (
                  <button
                    className="link-btn"
                    onClick={() => setReports((prev) => ({ ...prev, [question.id]: "open" }))}
                  >
                    这题有问题？反馈
                  </button>
                )}
                {reportState === "open" && (
                  <div className="report-opts">
                    <span className="muted">问题类型：</span>
                    {REPORT_REASONS.map((r) => (
                      <button key={r.value} className="chip" onClick={() => submitReport(r.value)}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                )}
                {reportState && reportState !== "open" && (
                  <span className="muted">已记录反馈，感谢。</span>
                )}
              </div>
            </div>

            <button className="btn" onClick={next} style={{ marginTop: 14 }}>
              {index + 1 >= questions.length ? "完成，看结果" : "下一题"}
            </button>
          </>
        )}
      </div>
    </>
  );
}

import type { Question, ReportReason } from "../types";

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "wrong_answer", label: "答案有误" },
  { value: "unclear", label: "表述不清" },
  { value: "disputed", label: "有争议" },
  { value: "other", label: "其他" }
];

interface Props {
  question: Question;
  isCorrect: boolean;
  correctKeys: string[];
  /** undefined = 未反馈；"open" = 展开原因选项；其余为已提交的原因 */
  reportState: ReportReason | "open" | undefined;
  onOpenReport: () => void;
  onReport: (reason: ReportReason) => void;
  isLast: boolean;
  onNext: () => void;
}

/** 判题结果 + 分层解析（为什么对 / 延伸 / 出处原文片段）+ 题目反馈。 */
export default function QuizExplanation({
  question,
  isCorrect,
  correctKeys,
  reportState,
  onOpenReport,
  onReport,
  isLast,
  onNext
}: Props) {
  return (
    <>
      <div
        className="card"
        style={{
          background: isCorrect ? "rgba(34,197,94,.1)" : "rgba(239,68,68,.1)",
          borderColor: isCorrect ? "var(--ok)" : "var(--bad)",
          marginTop: 12,
          marginBottom: 0
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{isCorrect ? "✅ 答对了" : "❌ 答错了"}</div>
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
          {!reportState && <button className="link-btn" onClick={onOpenReport}>这题有问题？反馈</button>}
          {reportState === "open" && (
            <div className="report-opts">
              <span className="muted">问题类型：</span>
              {REPORT_REASONS.map((r) => (
                <button key={r.value} className="chip" onClick={() => onReport(r.value)}>
                  {r.label}
                </button>
              ))}
            </div>
          )}
          {reportState && reportState !== "open" && <span className="muted">已记录反馈，感谢。</span>}
        </div>
      </div>

      <button className="btn" onClick={onNext} style={{ marginTop: 14 }}>
        {isLast ? "完成，看结果" : "下一题"}
      </button>
    </>
  );
}

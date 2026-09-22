import type { ReactNode } from "react";
import type { Question, ReportReason, ShortAnswerGrade } from "../types";

const VERDICT_TEXT: Record<ShortAnswerGrade["verdict"], string> = {
  correct: "✅ 答对了",
  partial: "🟡 部分答对",
  wrong: "❌ 答错了",
  blank: "❌ 未作答"
};

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
  /** 简答题的批阅结果；选择题为 null */
  grade: ShortAnswerGrade | null;
  /** 是否走了「直接查看答案」路径 */
  viewedAnswer: boolean;
  /** undefined = 未反馈；"open" = 展开原因选项；其余为已提交的原因 */
  reportState: ReportReason | "open" | undefined;
  onOpenReport: () => void;
  onReport: (reason: ReportReason) => void;
  isLast: boolean;
  onNext: () => void;
  /** 解析区底部插槽（熟练度自评） */
  footer?: ReactNode;
}

/** 判题结果 + 分层解析（为什么对 / 延伸 / 出处原文片段）+ 题目反馈。 */
export default function QuizExplanation({
  question,
  isCorrect,
  correctKeys,
  grade,
  viewedAnswer,
  reportState,
  onOpenReport,
  onReport,
  isLast,
  onNext,
  footer
}: Props) {
  const banner = grade ? VERDICT_TEXT[grade.verdict] : isCorrect ? "✅ 答对了" : "❌ 答错了";
  return (
    <>
      <div
        className="card"
        style={{
          background: isCorrect ? "rgba(34,197,94,.1)" : grade?.verdict === "partial" ? "rgba(245,158,11,.1)" : "rgba(239,68,68,.1)",
          borderColor: isCorrect ? "var(--ok)" : grade?.verdict === "partial" ? "var(--warn)" : "var(--bad)",
          marginTop: 12,
          marginBottom: 0
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{banner}</div>
        {grade ? (
          <>
            <div className="muted">
              得分 {grade.score} / 100 · 由{grade.by === "agent" ? "AI 批阅" : "本地要点评分"}
              {grade.degraded && "（模型不可用，已自动降级）"}
            </div>
            <p style={{ margin: "8px 0 0" }}>{grade.comment}</p>
            {grade.hitPoints.length > 0 && (
              <div className="muted" style={{ marginTop: 6 }}>✓ 命中：{grade.hitPoints.join("；")}</div>
            )}
            {grade.missedPoints.length > 0 && (
              <div className="muted" style={{ marginTop: 4 }}>✗ 遗漏：{grade.missedPoints.join("；")}</div>
            )}
          </>
        ) : (
          <div className="muted">正确答案：{correctKeys.join("、")}</div>
        )}
        {viewedAnswer && <div className="muted" style={{ marginTop: 6 }}>已查看答案，本题按「未掌握」计入复习。</div>}
      </div>

      <div className="exp">
        {question.referenceAnswer && (
          <>
            <h4>参考答案</h4>
            <p>{question.referenceAnswer}</p>
          </>
        )}
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

      {footer}

      <button className="btn" onClick={onNext} style={{ marginTop: 14 }}>
        {isLast ? "完成，看结果" : "下一题"}
      </button>
    </>
  );
}

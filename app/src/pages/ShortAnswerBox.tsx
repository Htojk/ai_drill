import { useState } from "react";

interface Props {
  answer: string;
  onAnswerChange: (text: string) => void;
  onSubmit: () => void;
  onReveal: () => void;
  /** 批阅中（模型调用）时禁用提交，避免重复请求 */
  grading: boolean;
}

/**
 * 简答题作答区。
 * 「查看答案」是显式动作：一旦点了就按产品规则记为用户未掌握（由上层落库）。
 */
export default function ShortAnswerBox({ answer, onAnswerChange, onSubmit, onReveal, grading }: Props) {
  const [confirmReveal, setConfirmReveal] = useState(false);

  return (
    <>
      <textarea
        className="code-input"
        style={{ fontFamily: "inherit", fontSize: 14, minHeight: 110 }}
        placeholder="用自己的话写下来，想到多少写多少。提交后由 AI 批阅要点覆盖度。"
        value={answer}
        onChange={(e) => onAnswerChange(e.target.value)}
        disabled={grading}
      />

      <button className="btn" disabled={grading || answer.trim().length === 0} onClick={onSubmit} style={{ marginTop: 10 }}>
        {grading ? "批阅中…" : "提交作答"}
      </button>

      {!confirmReveal ? (
        <button className="link-btn" style={{ marginTop: 10 }} onClick={() => setConfirmReveal(true)} disabled={grading}>
          直接查看答案（会记为未掌握）
        </button>
      ) : (
        <div className="report-opts" style={{ marginTop: 10 }}>
          <span className="muted">看了答案就算未掌握，确定？</span>
          <button className="chip" onClick={onReveal} disabled={grading}>确定查看</button>
          <button className="chip" onClick={() => setConfirmReveal(false)}>继续作答</button>
        </div>
      )}
    </>
  );
}

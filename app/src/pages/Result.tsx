import { QUESTIONS_BY_ID } from "../data/questions";
import { correctAnswerLabel } from "../lib/question-kind";
import type { AnswerRecord, AnswerMode } from "../types";

interface Props {
  session: { ids: string[]; mode: AnswerMode; results: AnswerRecord[] };
  onBack: () => void;
}

export default function Result({ session, onBack }: Props) {
  const { results } = session;
  const correct = results.filter((r) => r.isCorrect).length;
  const accuracy = results.length ? Math.round((correct / results.length) * 100) : 0;
  const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);
  const wrong = results.filter((r) => !r.isCorrect);

  return (
    <>
      <div className="hd">
        <h1>本次结果</h1>
      </div>

      <div className="card" style={{ textAlign: "center" }}>
        <div className="big-num" style={{ fontSize: 40 }}>{accuracy}%</div>
        <div className="muted" style={{ marginTop: 6 }}>
          答对 {correct} / {results.length} 题 · 用时 {formatDuration(totalMs)}
        </div>
        <div className="bar" style={{ marginTop: 16 }}>
          <i className={accuracy >= 80 ? "ok" : ""} style={{ width: accuracy + "%" }} />
        </div>
      </div>

      {wrong.length > 0 ? (
        <div className="card">
          <div className="card-title">本次错题（{wrong.length}）</div>
          <div className="muted" style={{ marginBottom: 10 }}>已自动加入错题本，并按 1/3/7/15/30 天安排复习。</div>
          {wrong.map((r) => {
            const q = QUESTIONS_BY_ID.get(r.questionId);
            if (!q) return null;
            const correct = correctAnswerLabel(q);
            return (
              <div key={r.questionId} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
                <div style={{ fontSize: 14, marginBottom: 4 }}>{q.stem}</div>
                {correct && <div className="muted">{correct}</div>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32 }}>🎉</div>
          <div style={{ marginTop: 8 }}>全对，今天没留下错题。</div>
        </div>
      )}

      <button className="btn" onClick={onBack}>返回今日</button>
    </>
  );
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return s + " 秒";
  const m = Math.floor(s / 60);
  return m + " 分 " + (s % 60) + " 秒";
}

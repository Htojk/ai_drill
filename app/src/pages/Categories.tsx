import { QUESTIONS } from "../data/questions";
import { CATEGORY_SESSION_SIZE, computeCategoryProgress, pickCategoryQuestions } from "../lib/categories";
import { accuracyLevel } from "../lib/stats";
import type { AnswerRecord } from "../types";

interface Props {
  records: AnswerRecord[];
  onPractice: (ids: string[]) => void;
}

export default function Categories({ records, onPractice }: Props) {
  const progress = computeCategoryProgress(QUESTIONS, records);
  // 覆盖率按「题」去重统计：分类卡片里的数字会跨分类重复计数，这里不能重复
  const seenIds = new Set(records.map((r) => r.questionId));
  const seen = QUESTIONS.filter((q) => seenIds.has(q.id)).length;
  const total = QUESTIONS.length;
  const coverage = total ? Math.round((seen / total) * 100) : 0;

  // 只挑练过且有错题的分类来排「优先补强」，没练过的不参与排序
  const weakest = progress
    .filter((p) => p.seen > 0 && p.wrong > 0)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3);

  return (
    <>
      <div className="hd">
        <h1>分类练习</h1>
        <div className="streak">{progress.length} 个知识域</div>
      </div>

      <div className="card">
        <div className="muted" style={{ marginBottom: 6 }}>题库覆盖</div>
        <div className="big-num">
          {seen} / {total}
        </div>
        <div className="bar" style={{ margin: "12px 0 10px" }}>
          <i style={{ width: coverage + "%" }} />
        </div>
        <div className="muted">题库里已练过的题目数（去重），目标是把 {progress.length} 个知识域都铺满。</div>
      </div>

      {weakest.length > 0 && (
        <div className="card">
          <div className="card-title">优先补强</div>
          <div className="muted" style={{ marginBottom: 10 }}>按最近一次作答的正确率排序，只列出还有错题的分类。</div>
          {weakest.map((p) => (
            <div className="kv" key={p.category}>
              <span className="k">{p.category}</span>
              <span className="v">
                {Math.round(p.accuracy * 100)}% · 错 {p.wrong} 题
              </span>
            </div>
          ))}
        </div>
      )}

      {progress.map((p) => {
        const ids = pickCategoryQuestions(p.category, QUESTIONS, records);
        const pct = Math.round(p.accuracy * 100);
        const level = accuracyLevel(p.accuracy);
        return (
          <div className="card" key={p.category}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontWeight: 600 }}>{p.category}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                已练 {p.seen} / {p.total} 题
              </div>
            </div>

            <div style={{ margin: "10px 0 6px" }}>
              <div className={"bar" + (p.seen === 0 ? "" : level === "ok" ? " ok" : level === "bad" ? " bad" : "")}>
                <i style={{ width: (p.seen ? pct : 0) + "%" }} />
              </div>
            </div>
            <div className="muted" style={{ marginBottom: 12 }}>
              {p.seen === 0
                ? "还没练过这个分类"
                : `最近一次作答正确率 ${pct}%，仍有 ${p.wrong} 题没答对`}
            </div>

            <button className="btn small" disabled={ids.length === 0} onClick={() => onPractice(ids)}>
              开始练习（本次 {ids.length} 题，最多 {CATEGORY_SESSION_SIZE} 题）
            </button>
          </div>
        );
      })}
    </>
  );
}

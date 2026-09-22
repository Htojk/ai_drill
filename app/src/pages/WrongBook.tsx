import { QUESTIONS_BY_ID } from "../data/questions";

interface Props {
  wrongIds: string[];
  onPractice: (ids: string[]) => void;
}

export default function WrongBook({ wrongIds, onPractice }: Props) {
  const visible = wrongIds.slice(0, 20);

  return (
    <>
      <div className="hd">
        <h1>错题本</h1>
        <div className="streak">{wrongIds.length} 题待复习</div>
      </div>

      {wrongIds.length === 0 ? (
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32 }}>📕</div>
          <div style={{ marginTop: 8 }}>还没有错题。</div>
          <div className="muted" style={{ marginTop: 6 }}>答错的题会自动收进来，并按 1/3/7/15/30 天安排复习。</div>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="muted" style={{ marginBottom: 12 }}>
              按最近一次作答统计。复习时答对即从本列表移除，答题记录仍会保留。
            </div>
            <button className="btn" onClick={() => onPractice(wrongIds.slice(0, 10))}>
              开始复习（本次 {Math.min(wrongIds.length, 10)} 题）
            </button>
          </div>

          {visible.map((id) => {
            const q = QUESTIONS_BY_ID.get(id);
            if (!q) return null;
            return (
              <div className="card" key={id}>
                <div style={{ marginBottom: 8 }}>
                  <span className="tag">{q.categories.join(" · ")}</span>
                  {q.isPractice && <span className="tag warn">工程判断</span>}
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 8 }}>{q.stem}</div>
                <div className="muted">正确答案：{q.options.filter((o) => o.isCorrect).map((o) => o.key).join("、")}</div>
                <div className="exp" style={{ marginTop: 10 }}>
                  <p>{q.explanation}</p>
                  <a className="src" href={q.source.url} target="_blank" rel="noreferrer">
                    出处 · {q.source.title} ↗
                  </a>
                  {q.source.snippet && <p className="snip">“{q.source.snippet}”</p>}
                </div>
              </div>
            );
          })}
          {wrongIds.length > visible.length && (
            <div className="muted" style={{ textAlign: "center" }}>还有 {wrongIds.length - visible.length} 题未显示</div>
          )}
        </>
      )}
    </>
  );
}

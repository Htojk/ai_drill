import { useState } from "react";
import { QUESTIONS_BY_ID } from "../data/questions";

interface Props {
  wrongIds: string[];
  bookmarkIds: string[];
  onPractice: (ids: string[]) => void;
  onToggleBookmark: (questionId: string) => void;
}

/** 复习页：错题与收藏两个列表，共用同一套卡片渲染。 */
export default function WrongBook({ wrongIds, bookmarkIds, onPractice, onToggleBookmark }: Props) {
  const [tab, setTab] = useState<"wrong" | "bookmark">("wrong");
  const ids = tab === "wrong" ? wrongIds : bookmarkIds;
  const visible = ids.slice(0, 20);

  return (
    <>
      <div className="hd">
        <h1>复习</h1>
        <div className="streak">{wrongIds.length} 题待复习</div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <button className={"chip" + (tab === "wrong" ? " on" : "")} onClick={() => setTab("wrong")}>
          错题（{wrongIds.length}）
        </button>
        <button className={"chip" + (tab === "bookmark" ? " on" : "")} onClick={() => setTab("bookmark")}>
          收藏（{bookmarkIds.length}）
        </button>
      </div>

      {ids.length === 0 ? (
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32 }}>{tab === "wrong" ? "📕" : "⭐"}</div>
          <div style={{ marginTop: 8 }}>{tab === "wrong" ? "还没有错题。" : "还没有收藏。"}</div>
          <div className="muted" style={{ marginTop: 6 }}>
            {tab === "wrong"
              ? "答错的题会自动收进来，并按 1/3/7/15/30 天安排复习。"
              : "答题时点「☆ 收藏」把题目存到这里，方便反复看。"}
          </div>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="muted" style={{ marginBottom: 12 }}>
              {tab === "wrong"
                ? "按最近一次作答统计。复习时答对即从本列表移除，答题记录仍会保留。"
                : "收藏的题会一直留在这里，练习时同样会记录作答。"}
            </div>
            <button className="btn" onClick={() => onPractice(ids.slice(0, 10))}>
              {tab === "wrong" ? "开始复习" : "练习收藏"}（本次 {Math.min(ids.length, 10)} 题）
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
                  {tab === "bookmark" && (
                    <button className="link-btn" onClick={() => onToggleBookmark(id)}>
                      取消收藏
                    </button>
                  )}
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
          {ids.length > visible.length && (
            <div className="muted" style={{ textAlign: "center" }}>还有 {ids.length - visible.length} 题未显示</div>
          )}
        </>
      )}
    </>
  );
}

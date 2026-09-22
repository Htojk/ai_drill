import { QUESTIONS } from "../data/questions";
import type { AnswerRecord, DailyTask, Profile } from "../types";

interface Props {
  profile: Profile;
  task: DailyTask;
  completed: number;
  records: AnswerRecord[];
  wrongCount: number;
  onStart: () => void;
}

export default function Today({ profile, task, completed, records, wrongCount, onStart }: Props) {
  const total = task.questionIds.length;
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const practiceCount = task.questionIds.filter((id) => QUESTIONS.find((q) => q.id === id)?.isPractice).length;
  const categories = new Set(
    task.questionIds.flatMap((id) => QUESTIONS.find((q) => q.id === id)?.categories ?? [])
  );

  const yesterday = records.filter((r) => {
    const d = new Date(r.answeredAt);
    return d.toDateString() !== new Date().toDateString();
  });

  return (
    <>
      <div className="hd">
        <h1>今日答题</h1>
        <div className="streak">🔥 连续 {profile.streak} 天</div>
      </div>

      <div className="card">
        <div className="muted" style={{ marginBottom: 6 }}>今日任务</div>
        <div className="big-num">
          {completed} / {total}
        </div>
        <div className="bar" style={{ margin: "12px 0 10px" }}>
          <i style={{ width: pct + "%" }} />
        </div>
        <div className="muted">
          覆盖 {categories.size} 个知识域 · 含 {practiceCount} 道工程判断题
        </div>
        <div style={{ marginTop: 16 }}>
          <button className="btn" onClick={onStart}>
            {completed === 0 ? "开始今天的 10 题" : `继续答题（还剩 ${total - completed} 题）`}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">我的进度</div>
        <div className="kv"><span className="k">累计答题</span><span className="v">{profile.totalAnswered} 题</span></div>
        <div className="kv">
          <span className="k">总正确率</span>
          <span className="v">
            {profile.totalAnswered ? Math.round((profile.totalCorrect / profile.totalAnswered) * 100) : 0}%
          </span>
        </div>
        <div className="kv"><span className="k">错题待复习</span><span className="v">{wrongCount} 题</span></div>
        <div className="kv"><span className="k">历史答题天数</span><span className="v">{new Set(records.map((r) => new Date(r.answeredAt).toDateString())).size} 天</span></div>
        {yesterday.length > 0 && (
          <div className="kv">
            <span className="k">非今日答题</span>
            <span className="v">{yesterday.length} 题</span>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">题库</div>
        <div className="kv"><span className="k">总题量</span><span className="v">{QUESTIONS.length} 题</span></div>
        <div className="kv">
          <span className="k">工程判断题</span>
          <span className="v">{QUESTIONS.filter((q) => q.isPractice).length} 题</span>
        </div>
        <div className="kv">
          <span className="k">知识域</span>
          <span className="v">{new Set(QUESTIONS.flatMap((q) => q.categories)).size} 个</span>
        </div>
      </div>
    </>
  );
}

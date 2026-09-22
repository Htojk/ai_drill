import { useState } from "react";
import { QUESTIONS } from "../data/questions";
import { computeOverview, accuracyLevel } from "../lib/stats";
import * as store from "../lib/storage";
import type { AnswerRecord, Profile } from "../types";

interface Props {
  profile: Profile;
  records: AnswerRecord[];
  onProfileChange: (profile: Profile) => void;
}

export default function Stats({ profile, records, onProfileChange }: Props) {
  const overview = computeOverview(records, QUESTIONS);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");

  const days = new Set(records.map((r) => new Date(r.answeredAt).toDateString())).size;
  const reportCount = store.loadReports().length;

  function doExport() {
    const text = store.exportProgress();
    setCode(text);
    setMessage("已生成进度码，请复制保存到安全的地方。");
    try {
      navigator.clipboard?.writeText(text);
      setMessage("已生成并尝试复制到剪贴板。");
    } catch {
      /* 忽略 */
    }
  }

  function doImport() {
    const res = store.importProgress(code);
    setMessage(res.message);
    if (res.ok) {
      onProfileChange(store.loadProfile());
      window.location.reload();
    }
  }

  return (
    <>
      <div className="hd">
        <h1>我的数据</h1>
      </div>

      <div className="card">
        <div className="row">
          <div>
            <div className="muted">累计答题</div>
            <div className="big-num">{overview.total}</div>
          </div>
          <div>
            <div className="muted">总正确率</div>
            <div className="big-num">{Math.round(overview.accuracy * 100)}%</div>
          </div>
        </div>
        <div className="kv" style={{ marginTop: 12 }}><span className="k">连续打卡</span><span className="v">{profile.streak} 天</span></div>
        <div className="kv"><span className="k">答题天数</span><span className="v">{days} 天</span></div>
        <div className="kv"><span className="k">答对题数</span><span className="v">{overview.correct} 题</span></div>
        <div className="kv"><span className="k">题目反馈</span><span className="v">{reportCount} 条</span></div>
      </div>

      <div className="card">
        <div className="card-title">知识域掌握度</div>
        {overview.byCategory.length === 0 ? (
          <div className="muted">还没有数据，答几题就有了。</div>
        ) : (
          overview.byCategory.map((c) => {
            const level = accuracyLevel(c.accuracy);
            const pct = Math.round(c.accuracy * 100);
            return (
              <div key={c.category} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
                  <span>{c.category}</span>
                  <span className="muted">{pct}%（{c.correct}/{c.answered}）</span>
                </div>
                <div className={"bar" + (level === "ok" ? " ok" : level === "bad" ? " bad" : "")}>
                  <i style={{ width: pct + "%" }} />
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="card">
        <div className="card-title">进度备份</div>
        <div className="muted" style={{ marginBottom: 12 }}>
          进度只存在这台设备的浏览器里。换手机或清理缓存前，请导出进度码保存。
        </div>
        <button className="btn ghost" onClick={doExport}>导出进度码</button>
        <textarea
          className="code-input"
          style={{ marginTop: 10 }}
          placeholder="粘贴进度码到这里，然后点导入"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button className="btn" style={{ marginTop: 10 }} disabled={!code.trim()} onClick={doImport}>
          导入进度码
        </button>
        {message && <div className="muted" style={{ marginTop: 10 }}>{message}</div>}
      </div>
    </>
  );
}

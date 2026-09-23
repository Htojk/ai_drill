import { useState } from "react";
import * as account from "../lib/account";
import type { ApiUser } from "../types";

interface Props {
  user: ApiUser;
  offline: boolean;
  onLogout: () => void;
}

/** 已登录时的账号面板：身份信息 + 改密 + 退出。 */
export default function AccountPanel({ user, offline, onLogout }: Props) {
  const [showPwd, setShowPwd] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function submitPassword() {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    void (async () => {
      try {
        await account.changePassword(current, next);
        setMessage("密码已更新，下次登录请用新密码。");
        setCurrent("");
        setNext("");
        setShowPwd(false);
      } catch (err) {
        setError(account.friendlyMessage(err));
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <div className="card">
      <p className="card-title">我的账号</p>
      <div className="kv">
        <span className="k">用户名</span>
        <span>{user.username}</span>
      </div>
      <div className="kv">
        <span className="k">账号 ID</span>
        <span style={{ fontSize: 11.5, wordBreak: "break-all" }}>{user.uid}</span>
      </div>
      <div className="kv">
        <span className="k">同步状态</span>
        <span className={offline ? "muted" : "ok-text"}>{offline ? "当前离线，恢复后自动同步" : "已连接"}</span>
      </div>

      {message && <p className="form-ok">{message}</p>}
      {error && <p className="form-error">{error}</p>}

      <div className="report-opts" style={{ marginTop: 14 }}>
        <button className="chip" onClick={() => setShowPwd((v) => !v)}>
          {showPwd ? "收起改密" : "修改密码"}
        </button>
        <button
          className="chip"
          onClick={() => {
            account.logout();
            onLogout();
          }}
        >
          退出登录
        </button>
      </div>

      {showPwd && (
        <div style={{ marginTop: 12 }}>
          <label className="form-label">当前密码</label>
          <input className="field" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          <label className="form-label">新密码（至少 8 位）</label>
          <input className="field" type="password" value={next} onChange={(e) => setNext(e.target.value)} />
          <button
            className="btn small"
            style={{ marginTop: 12 }}
            disabled={busy || current.length < 8 || next.length < 8}
            onClick={submitPassword}
          >
            {busy ? "提交中…" : "确认修改"}
          </button>
        </div>
      )}
    </div>
  );
}

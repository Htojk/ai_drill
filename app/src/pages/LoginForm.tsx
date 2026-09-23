import { useState } from "react";
import * as account from "../lib/account";

interface Props {
  onDone: () => void;
}

/**
 * 登录 / 注册表单。
 *
 * 两种模式的表单结构完全一样，只有按钮文案和提交的接口不同，
 * 所以用一个 mode 切换而不是两份组件。
 */
export default function LoginForm({ onDone }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const trimmed = username.trim();
  const canSubmit = trimmed.length >= 3 && password.length >= 8 && !busy;

  function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    void (async () => {
      try {
        if (mode === "register") await account.register(trimmed, password);
        else await account.login(trimmed, password);
        onDone();
      } catch (err) {
        setError(account.friendlyMessage(err));
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <div className="card">
      <p className="card-title">{mode === "login" ? "登录" : "创建账号"}</p>
      <p className="muted">
        进度和错题按账号隔离，换设备只要登录同一账号即可继续。
        不登录也能用，数据只存在这台设备上。
      </p>

      <div className="report-opts" style={{ marginTop: 12 }}>
        <button className={mode === "login" ? "chip on" : "chip"} onClick={() => setMode("login")}>
          已有账号
        </button>
        <button className={mode === "register" ? "chip on" : "chip"} onClick={() => setMode("register")}>
          注册新账号
        </button>
      </div>

      <label className="form-label">用户名</label>
      <input
        className="field"
        value={username}
        autoComplete="username"
        placeholder="3-32 位字母、数字、下划线或短横线"
        onChange={(e) => setUsername(e.target.value)}
      />

      <label className="form-label">密码</label>
      <input
        className="field"
        type="password"
        value={password}
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        placeholder="至少 8 位，建议用一句好记的话"
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />

      {error && <p className="form-error">{error}</p>}

      <button className="btn" style={{ marginTop: 14 }} disabled={!canSubmit} onClick={submit}>
        {busy ? "请稍候…" : mode === "login" ? "登录" : "注册并登录"}
      </button>
    </div>
  );
}

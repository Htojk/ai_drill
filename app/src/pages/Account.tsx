import { useEffect, useState } from "react";
import * as account from "../lib/account";
import * as session from "../lib/session";
import { ApiError } from "../lib/api";
import type { ApiUser } from "../types";
import AccountPanel from "./AccountPanel";
import LoginForm from "./LoginForm";

/**
 * 「我的」页：本地有令牌就先拿服务端核一次身份。
 * 校验失败（401）才退回登录；离线则沿用本地用户信息，不让断网把人挡在外面。
 */
export default function Account() {
  const [user, setUser] = useState<ApiUser | null>(() => session.loadSession()?.user ?? null);
  const [checking, setChecking] = useState(() => session.isLoggedIn());
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!session.isLoggedIn()) {
      setChecking(false);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const fresh = await account.refreshMe();
        if (!alive) return;
        setUser(fresh);
        setOffline(false);
      } catch (err) {
        if (!alive) return;
        if (err instanceof ApiError && err.offline) setOffline(true);
        else setUser(null);
      } finally {
        if (alive) setChecking(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (checking && !user) {
    return (
      <div className="card">
        <p className="muted">正在核对登录状态…</p>
      </div>
    );
  }

  if (!user) return <LoginForm onDone={() => setUser(session.loadSession()?.user ?? null)} />;

  return (
    <AccountPanel
      user={user}
      offline={offline}
      onLogout={() => {
        setUser(null);
        setOffline(false);
      }}
    />
  );
}

import { newUid } from "../core/ids.mjs";

/** 账号仓储：SQL 细节全部收在这里，路由层只认方法名。 */
export function createAccountRepo(db) {
  const T = "drill_accounts";
  return {
    async findByUsernameKey(usernameKey) {
      const rows = await db.run("accounts.find", (d) => d.from(T).select("*").eq("username_key", usernameKey).limit(1));
      return rows?.[0] ?? null;
    },

    async findById(uid) {
      const rows = await db.run("accounts.findById", (d) => d.from(T).select("*").eq("uid", uid).limit(1));
      return rows?.[0] ?? null;
    },

    async create({ username, usernameKey, salt, hash }) {
      const row = { uid: newUid(), username, username_key: usernameKey, pwd_salt: salt, pwd_hash: hash };
      const rows = await db.run("accounts.create", (d) => d.from(T).insert(row).select("*"));
      return rows?.[0] ?? null;
    },

    async markLogin(uid, at = new Date().toISOString()) {
      await db.run("accounts.markLogin", (d) => d.from(T).update({ last_login_at: at }).eq("uid", uid));
    },

    async updatePassword(uid, salt, hash) {
      await db.run("accounts.updatePassword", (d) => d.from(T).update({ pwd_salt: salt, pwd_hash: hash }).eq("uid", uid));
    }
  };
}

/** 进度仓储：一个账号一行，payload 是前端整包状态（jsonb）。 */
export function createProgressRepo(db) {
  const T = "drill_progress";
  return {
    async get(uid) {
      const rows = await db.run("progress.get", (d) => d.from(T).select("*").eq("uid", uid).limit(1));
      return rows?.[0] ?? null;
    },

    /** 首次落库：revision 从 1 开始 */
    async create(uid, payload) {
      const rows = await db.run("progress.create", (d) => d.from(T).insert({ uid, payload, revision: 1 }).select("*"));
      return rows?.[0] ?? null;
    },

    /**
     * 乐观并发：带上 baseRevision，版本对不上就更新 0 行。
     * 这是「本地优先 + 后台同步」的基础——冲突显式暴露给客户端去合并，
     * 而不是无声覆盖另一台设备上的进度。
     */
    async saveIfRevision(uid, payload, baseRevision) {
      const patch = { payload, revision: baseRevision + 1, updated_at: new Date().toISOString() };
      const rows = await db.run("progress.save", (d) =>
        d.from(T).update(patch).eq("uid", uid).eq("revision", baseRevision).select("*")
      );
      return rows?.[0] ?? null;
    }
  };
}

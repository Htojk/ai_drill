/** 测试替身：静默日志 + 内存仓储。让业务测试完全不依赖云环境。 */

export function silentLogger() {
  const noop = () => {};
  const logger = { info: noop, warn: noop, error: noop, child: () => logger, timer: () => noop };
  return logger;
}

export function createFakeRepos() {
  const accounts = new Map();
  const progress = new Map();
  let seq = 0;

  return {
    accounts: {
      async findByUsernameKey(key) {
        return [...accounts.values()].find((row) => row.username_key === key) ?? null;
      },
      async findById(uid) {
        return accounts.get(uid) ?? null;
      },
      async create({ username, usernameKey, salt, hash }) {
        const uid = `uid-${++seq}`;
        const row = {
          uid,
          username,
          username_key: usernameKey,
          pwd_salt: salt,
          pwd_hash: hash,
          created_at: new Date().toISOString(),
          last_login_at: null
        };
        accounts.set(uid, row);
        return row;
      },
      async markLogin(uid, at = new Date().toISOString()) {
        const row = accounts.get(uid);
        if (row) row.last_login_at = at;
      },
      async updatePassword(uid, salt, hash) {
        const row = accounts.get(uid);
        if (row) {
          row.pwd_salt = salt;
          row.pwd_hash = hash;
        }
      }
    },
    progress: {
      async get(uid) {
        return progress.get(uid) ?? null;
      },
      async create(uid, payload) {
        const row = { uid, payload, revision: 1, updated_at: new Date().toISOString() };
        progress.set(uid, row);
        return row;
      },
      async saveIfRevision(uid, payload, baseRevision) {
        const row = progress.get(uid);
        if (!row || row.revision !== baseRevision) return null;
        row.payload = payload;
        row.revision = baseRevision + 1;
        row.updated_at = new Date().toISOString();
        return { ...row };
      }
    },
    _dump: { accounts, progress }
  };
}

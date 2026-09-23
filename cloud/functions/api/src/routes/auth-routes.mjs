import { ok, json } from "../http/response.mjs";
import { Conflict, Forbidden, Unauthorized } from "../core/errors.mjs";
import { requirePassword, requireUsername } from "../core/validate.mjs";
import { hashPassword, verifyPassword } from "../core/password.mjs";
import { issueToken } from "../core/token.mjs";
import { requireAuth } from "../core/session.mjs";

const usernameKeyOf = (username) => username.toLowerCase();

function publicUser(account) {
  return { uid: account.uid, username: account.username, createdAt: account.created_at ?? null };
}

function mint(account, ctx) {
  return issueToken({ uid: account.uid, username: account.username }, ctx.config.tokenSecret, {
    ttlSeconds: ctx.config.tokenTtlSeconds
  });
}

export function authRoutes() {
  return [
    {
      method: "POST",
      path: "/auth/register",
      handler: async (req, ctx) => {
        const log = ctx.log.child({ route: "auth.register" });
        if (!ctx.config.allowRegister) {
          log.warn("auth.register.closed");
          throw new Forbidden("注册已关闭（DRILL_ALLOW_REGISTER=off）");
        }
        const username = requireUsername(req.body);
        const password = requirePassword(req.body);

        const key = usernameKeyOf(username);
        const existing = await ctx.accounts.findByUsernameKey(key);
        if (existing) {
          log.warn("auth.register.taken", { username });
          throw new Conflict("这个用户名已经被占用了", { field: "username" });
        }

        const { salt, hash } = await hashPassword(password);
        const account = await ctx.accounts.create({ username, usernameKey: key, salt, hash });
        log.info("auth.register.ok", { uid: account.uid, username });
        return json(201, { token: mint(account, ctx), user: publicUser(account) });
      }
    },

    {
      method: "POST",
      path: "/auth/login",
      handler: async (req, ctx) => {
        const log = ctx.log.child({ route: "auth.login" });
        const username = requireUsername(req.body);
        const password = requirePassword(req.body);

        const account = await ctx.accounts.findByUsernameKey(usernameKeyOf(username));
        // 账号不存在与口令错误返回同一句话，避免泄露「哪些用户名已注册」
        if (!account || !(await verifyPassword(password, account.pwd_salt, account.pwd_hash))) {
          log.warn("auth.login.reject", { username, reason: account ? "bad_password" : "no_account" });
          throw new Unauthorized("用户名或密码不正确");
        }

        await ctx.accounts.markLogin(account.uid);
        log.info("auth.login.ok", { uid: account.uid, username: account.username });
        return ok({ token: mint(account, ctx), user: publicUser(account) });
      }
    },

    {
      method: "GET",
      path: "/auth/me",
      handler: async (req, ctx) => {
        const claims = requireAuth(req, ctx);
        const account = await ctx.accounts.findById(claims.sub);
        if (!account) throw new Unauthorized("账号已不存在");
        return ok({ user: publicUser(account) });
      }
    },

    {
      method: "POST",
      path: "/auth/password",
      handler: async (req, ctx) => {
        const claims = requireAuth(req, ctx);
        const log = ctx.log.child({ route: "auth.password", uid: claims.sub });
        const current = requirePassword(req.body, "currentPassword");
        const next = requirePassword(req.body, "newPassword");

        const account = await ctx.accounts.findById(claims.sub);
        if (!account) throw new Unauthorized("账号已不存在");
        if (!(await verifyPassword(current, account.pwd_salt, account.pwd_hash))) {
          log.warn("auth.password.reject");
          throw new Unauthorized("当前密码不正确");
        }
        const { salt, hash } = await hashPassword(next);
        await ctx.accounts.updatePassword(account.uid, salt, hash);
        log.info("auth.password.ok");
        return ok({ ok: true });
      }
    }
  ];
}

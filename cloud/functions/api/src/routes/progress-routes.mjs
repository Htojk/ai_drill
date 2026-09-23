import { ok } from "../http/response.mjs";
import { BadRequest, Conflict } from "../core/errors.mjs";
import { optionalObject } from "../core/validate.mjs";
import { requireAuth } from "../core/session.mjs";

/** 单包上限：HTTP 网关对请求体有限制，这里给一个明确的业务上限，超了直接 400。 */
const MAX_PAYLOAD_BYTES = 1500 * 1024;
/** 超过这个体积就在日志里提醒一次：进度包应该保持「一包够用」，不要无限膨胀。 */
const PAYLOAD_WARN_BYTES = 512 * 1024;

function view(row) {
  if (!row) return { revision: 0, payload: null, updatedAt: null };
  return { revision: Number(row.revision) || 0, payload: row.payload ?? {}, updatedAt: row.updated_at ?? null };
}

export function progressRoutes() {
  return [
    {
      method: "GET",
      path: "/progress",
      handler: async (req, ctx) => {
        const claims = requireAuth(req, ctx);
        const row = await ctx.progress.get(claims.sub);
        ctx.log.info("progress.get", { uid: claims.sub, revision: row?.revision ?? 0, found: Boolean(row) });
        return ok(view(row));
      }
    },

    {
      method: "PUT",
      path: "/progress",
      handler: async (req, ctx) => {
        const claims = requireAuth(req, ctx);
        const log = ctx.log.child({ route: "progress.put", uid: claims.sub });
        const payload = optionalObject(req.body, "payload", { maxBytes: MAX_PAYLOAD_BYTES });
        if (!payload) throw new BadRequest("payload 不能为空", "payload");

        const body = req.body || {};
        const baseRevision = Number.isInteger(body.baseRevision) && body.baseRevision >= 0 ? body.baseRevision : null;
        if (baseRevision === null) throw new BadRequest("baseRevision 必须是 >= 0 的整数", "baseRevision");

        const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
        if (bytes > PAYLOAD_WARN_BYTES) log.warn("progress.payload.large", { bytes });

        const existing = await ctx.progress.get(claims.sub);
        if (!existing) {
          if (baseRevision !== 0) throw conflictOf(null);
          const created = await ctx.progress.create(claims.sub, payload);
          log.info("progress.created", { revision: created?.revision ?? 1, bytes });
          return ok(view(created));
        }

        const saved = await ctx.progress.saveIfRevision(claims.sub, payload, baseRevision);
        if (!saved) {
          log.warn("progress.conflict", { baseRevision, serverRevision: existing.revision });
          throw conflictOf(existing);
        }
        log.info("progress.saved", { revision: saved.revision, bytes });
        return ok(view(saved));
      }
    }
  ];
}

function conflictOf(row) {
  return new Conflict("进度已被其它设备更新，请先合并", {
    field: "baseRevision",
    server: { revision: Number(row?.revision) || 0, payload: row?.payload ?? {}, updatedAt: row?.updated_at ?? null }
  });
}

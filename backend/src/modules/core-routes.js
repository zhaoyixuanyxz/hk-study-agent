import { escapeHtmlAttr } from "./context.js";

/**
 * @param {import("fastify").FastifyInstance} app
 * @param {ReturnType<import("./context.js").createAppContext>} ctx
 */
export function registerCoreRoutes(app, ctx) {
  const { store, auth } = ctx;

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/api/v1/public/reports/:shareToken", async (request, reply) => {
    const shareToken = String(request.params.shareToken || "").trim();
    const row = store.getReportByShareToken(shareToken);
    if (!row) {
      return reply
        .status(404)
        .type("text/html; charset=utf-8")
        .send(
          "<!DOCTYPE html><html lang=\"zh-Hans\"><head><meta charset=\"utf-8\"/><title>报告不可用</title></head><body><p>分享链接已关闭或无效。</p></body></html>"
        );
    }
    store.incrementReportShareView(row.id);
    const title = escapeHtmlAttr((row.title && String(row.title).trim()) || "留学规划报告");
    const banner = `<div class="share-privacy-banner" role="alert" style="background:#fff3cd;border:1px solid #856404;padding:12px 14px;margin-bottom:16px;font-family:system-ui,sans-serif;font-size:14px;line-height:1.55;color:#333"><strong>隐私提示：</strong>本页含个人留学申请相关信息，仅供受邀阅读；请勿转发给无关第三方。</div>`;
    const doc = `<!DOCTYPE html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
  body { font-family: system-ui, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; margin: 16px 20px 40px; line-height: 1.55; color: #111; }
  .report-chapter { margin-bottom: 1.2rem; }
  .report-chapter h2 { font-size: 1.15rem; }
  a { color: #1565c0; }
</style>
</head>
<body>${banner}${row.html}</body>
</html>`;
    return reply.type("text/html; charset=utf-8").send(doc);
  });

  app.post("/api/v1/users/register", async () => {
    const u = store.createUser();
    return { user_id: u.id, token: u.token };
  });

  app.post("/api/v1/auth/register", async (request, reply) => {
    const email = String(request.body?.email || "").trim();
    const password = String(request.body?.password || "");
    if (!email || !password || password.length < 6) {
      return reply.status(400).send({
        code: "bad_request",
        message: "邮箱与密码必填，密码至少 6 位",
      });
    }
    const out = store.registerUserWithEmailPassword(email, password);
    if (!out.ok) {
      return reply.status(409).send({ code: "EMAIL_TAKEN", message: "该邮箱已注册" });
    }
    return { user_id: out.id, token: out.token };
  });

  app.post("/api/v1/auth/login", async (request, reply) => {
    const email = String(request.body?.email || "").trim();
    const password = String(request.body?.password || "");
    const out = store.loginWithEmailPassword(email, password);
    if (!out.ok) {
      return reply.status(401).send({ code: out.code, message: "邮箱或密码错误" });
    }
    return { user_id: out.id, token: out.token };
  });

  app.post("/api/v1/analytics/events", async (request, reply) => {
    const user = await auth(request);
    const raw = request.body?.events;
    const list = Array.isArray(raw) ? raw : request.body?.name ? [request.body] : [];
    const events = list
      .filter((x) => x && typeof x === "object")
      .map((x) => ({
        name: String(x.name || "").slice(0, 120),
        props: x.props && typeof x.props === "object" ? x.props : {},
      }))
      .filter((x) => x.name);
    if (!events.length) {
      return reply.status(400).send({ code: "bad_request", message: "events 不能为空" });
    }
    const { count } = store.appendAnalyticsEvents(user.id, events);
    return { ok: true, accepted: count };
  });
}

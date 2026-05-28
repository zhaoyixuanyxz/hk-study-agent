import Fastify from "fastify";
import cors from "@fastify/cors";
import { createStore } from "./store.js";
import { createAppContext } from "./modules/context.js";
import { registerCoreRoutes } from "./modules/core-routes.js";
import { registerChatRoutes } from "./modules/chat-routes.js";
import { registerProfileRoutes } from "./modules/profile-routes.js";
import { registerPlanRoutes } from "./modules/plan-routes.js";
import { registerReportRoutes } from "./modules/report-routes.js";
import { registerHistoryRoutes } from "./modules/history-routes.js";
import { registerIntelligenceRoutes } from "./modules/intelligence/router.js";
import { repairDemoSeedCanonicalUrls } from "./intelligence/seed-loader.js";

function createRateLimitGuard() {
  const hits = new Map();
  const windowMs = 60_000;
  return function rateLimitHook(request, reply, done) {
    const max = Number(process.env.APP_RATE_LIMIT_MAX || 0);
    if (!max || max <= 0 || !String(request.url || "").startsWith("/api/")) {
      done();
      return;
    }
    const k = request.ip || "unknown";
    const now = Date.now();
    let bucket = hits.get(k);
    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, n: 1 };
    } else {
      bucket.n += 1;
    }
    hits.set(k, bucket);
    if (bucket.n > max) {
      reply.status(429).send({ code: "rate_limit", message: "请求过于频繁，请稍后再试" });
      return;
    }
    done();
  };
}

export function buildApp(options = {}) {
  const store = createStore(options.dataFile);
  try {
    const fixed = repairDemoSeedCanonicalUrls(store);
    if (fixed > 0) {
      console.error(`intelligence: repaired ${fixed} demo seed canonical URLs`);
    }
  } catch (e) {
    console.error("intelligence: repair demo URLs skipped", e?.message || e);
  }
  const ctx = createAppContext(store);
  const app = Fastify({ logger: false });

  if (process.env.ENABLE_ACCESS_LOG === "1") {
    app.addHook("onRequest", (request, _reply, done) => {
      request._accessStart = Date.now();
      done();
    });
    app.addHook("onResponse", (request, reply, done) => {
      const line = {
        ts: new Date().toISOString(),
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        ms: Date.now() - (request._accessStart || Date.now()),
      };
      console.error(JSON.stringify(line));
      done();
    });
  }

  app.addHook("onRequest", createRateLimitGuard());

  const corsOrigins = (process.env.CORS_ORIGINS || "http://127.0.0.1:5180,http://localhost:5180")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  app.register(cors, { origin: corsOrigins.length ? corsOrigins : true, credentials: true });

  app.setErrorHandler((err, request, reply) => {
    if (err.statusCode === 401) {
      return reply.status(401).send({ code: err.payload?.code || "unauthorized", message: err.payload?.message || err.message });
    }
    if (err.statusCode === 404) {
      return reply.status(404).send({ code: err.payload?.code || "not_found", message: err.payload?.message || err.message });
    }
    if (err.statusCode === 403) {
      return reply.status(403).send({ code: err.payload?.code || "forbidden", message: err.payload?.message || err.message });
    }
    if (err.statusCode === 400 && err.payload && typeof err.payload === "object") {
      return reply.status(400).send(err.payload);
    }
    if (err.statusCode === 502 && err.payload && typeof err.payload === "object") {
      return reply.status(502).send(err.payload);
    }
    if (err.statusCode === 501 && err.payload && typeof err.payload === "object") {
      return reply.status(501).send(err.payload);
    }
    request.log.error(err);
    return reply.status(500).send({ code: "internal_error", message: "服务器错误" });
  });

  registerCoreRoutes(app, ctx);
  registerChatRoutes(app, ctx);
  registerProfileRoutes(app, ctx);
  registerPlanRoutes(app, ctx);
  registerReportRoutes(app, ctx);
  registerHistoryRoutes(app, ctx);
  registerIntelligenceRoutes(app, { store: ctx.store, auth: ctx.auth });

  return app;
}

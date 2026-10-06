import { swaggerUI } from "@hono/swagger-ui";
import { Scalar } from "@scalar/hono-api-reference";
import { HealthResponse } from "@wolgyeham/contracts";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { routePath } from "hono/route";
import { describeRoute, openAPIRouteHandler, resolver } from "hono-openapi";
import { sessionMiddleware } from "./lib/auth.ts";
import type { AppEnv } from "./lib/context.ts";
import type { Database } from "./lib/db.ts";
import { apiDocsEnabled, type Env } from "./lib/env.ts";
import { AppError } from "./lib/errors.ts";
import { log } from "./lib/log.ts";
import { createWebPushSender, type PushSender } from "./lib/push.ts";
import { createTaskRunner, type TaskRunner } from "./lib/tasks.ts";
import { authRoutes, devRoutes } from "./modules/auth/routes.ts";
import { buildingRoutes } from "./modules/buildings/routes.ts";
import { demoRoutes } from "./modules/demo/routes.ts";
import { guideRoutes } from "./modules/guides/routes.ts";
import { manageRoutes } from "./modules/manage/routes.ts";
import { meRoutes } from "./modules/me/routes.ts";
import { noticeRoutes } from "./modules/notices/routes.ts";
import { occupancyRoutes } from "./modules/occupancies/routes.ts";
import { reportRoutes } from "./modules/reports/routes.ts";
import { tipRoutes } from "./modules/tips/routes.ts";

/** 요청 본문 한도. 안내 본문(2000자)과 여유분을 넉넉히 넘습니다. */
const MAX_BODY_BYTES = 64 * 1024;

/** 문서 경로만 캐시를 허용합니다. 나머지 /api 응답은 no-store입니다. */
const CACHEABLE_PATHS = new Set(["/api/docs", "/api/swagger", "/api/openapi.json"]);

/**
 * `push`를 넘기지 않으면 VAPID 키가 있을 때만 보내는 기본 발송기(web-push)를 씁니다. `tasks`는 응답 뒤에 이어서
 * 할 일(공지 푸시)을 돌리는 곳이고, 서버·테스트가 넘겨 `idle()`로 기다립니다.
 */
export function createApp(deps: { env: Env; db: Database; push?: PushSender; tasks?: TaskRunner }) {
  const app = new Hono<AppEnv>();
  const push = deps.push ?? createWebPushSender(deps.env);
  const tasks = deps.tasks ?? createTaskRunner();

  app.use(requestId());
  app.use(async (c, next) => {
    const started = performance.now();
    c.set("env", deps.env);
    c.set("db", deps.db);
    c.set("push", push);
    c.set("tasks", tasks);
    await next();
    if (!CACHEABLE_PATHS.has(c.req.path)) c.header("Cache-Control", "no-store");
    if (deps.env.NODE_ENV !== "test") {
      // 실제 URL·쿼리에는 토큰이 섞일 수 있어 등록된 경로 패턴만 남깁니다.
      log("info", "request", {
        requestId: c.var.requestId,
        method: c.req.method,
        route: routePath(c, -1),
        status: c.res.status,
        ms: Math.round(performance.now() - started),
      });
    }
  });
  // 다른 사이트의 폼 제출(쿠키가 따라오는 요청)을 막습니다. JSON 요청은 브라우저가 CORS로 막습니다.
  app.use("/api/*", csrf({ origin: deps.env.APP_ORIGIN }));
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ error: { code: "PAYLOAD_TOO_LARGE" } }, 413),
    }),
  );
  app.use("/api/*", sessionMiddleware);

  app.get(
    "/api/health",
    describeRoute({
      tags: ["system"],
      summary: "Process liveness only; does not check database or login providers",
      responses: {
        200: {
          description: "API process is responding",
          content: {
            "application/json": { schema: resolver(HealthResponse) },
          },
        },
      },
    }),
    (context) => context.json({ status: "ok", service: "wolgyeham-api" }),
  );

  app.route("/api", buildingRoutes);
  app.route("/api", guideRoutes);
  app.route("/api", noticeRoutes);
  app.route("/api", occupancyRoutes);
  app.route("/api", reportRoutes);
  app.route("/api", tipRoutes);
  app.route("/api", manageRoutes);
  app.route("/api", meRoutes);
  app.route("/api", authRoutes);
  if (deps.env.DEMO_MODE) {
    app.route("/api", devRoutes);
    app.route("/api", demoRoutes);
  }

  if (apiDocsEnabled(deps.env)) mountDocs(app);
  app.notFound((c) => c.json({ error: { code: "NOT_FOUND" } }, 404));
  app.onError((error, c) => {
    if (error instanceof AppError) {
      const body = error.fields ? { code: error.code, fields: error.fields } : { code: error.code };
      return c.json({ error: body }, error.status, error.headers);
    }
    if (error instanceof HTTPException && error.status === 400) {
      // 형식이 깨진 JSON 본문 등
      return c.json({ error: { code: "VALIDATION_FAILED" } }, 400);
    }
    if (error instanceof HTTPException && error.status === 403) {
      // 다른 출처에서 온 폼 제출 등(csrf)
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
    }
    log("error", "request_failed", {
      requestId: c.var.requestId,
      route: routePath(c, -1),
      name: error.name,
    });
    return c.json({ error: { code: "INTERNAL_ERROR" } }, 500);
  });
  return app;
}

/** API 문서. 로컬·dev에서만 붙입니다(API_DOCS, lib/env.ts). */
function mountDocs(app: Hono<AppEnv>) {
  app.get(
    "/api/openapi.json",
    openAPIRouteHandler(app, {
      documentation: {
        info: { title: "Wolgyeham API", version: "0.1.0" },
        components: {
          securitySchemes: {
            session: { type: "apiKey", in: "cookie", name: "wh_session" },
          },
        },
      },
    }),
  );
  app.get("/api/docs", Scalar({ url: "/api/openapi.json" }));
  app.get("/api/swagger", swaggerUI({ url: "/api/openapi.json" }));
}

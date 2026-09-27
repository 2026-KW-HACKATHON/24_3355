import { swaggerUI } from "@hono/swagger-ui";
import { Scalar } from "@scalar/hono-api-reference";
import { HealthResponse } from "@wolgyeham/contracts";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { routePath } from "hono/route";
import { describeRoute, openAPIRouteHandler, resolver } from "hono-openapi";
import { sessionMiddleware } from "./lib/auth.ts";
import type { AppEnv } from "./lib/context.ts";
import type { Database } from "./lib/db.ts";
import type { Env } from "./lib/env.ts";
import { AppError } from "./lib/errors.ts";
import { log } from "./lib/log.ts";
import { authRoutes, devRoutes } from "./modules/auth/routes.ts";
import { buildingRoutes } from "./modules/buildings/routes.ts";
import { guideRoutes } from "./modules/guides/routes.ts";
import { manageRoutes } from "./modules/manage/routes.ts";
import { meRoutes } from "./modules/me/routes.ts";
import { noticeRoutes } from "./modules/notices/routes.ts";

/** 문서 경로만 캐시를 허용합니다. 나머지 /api 응답은 no-store입니다. */
const CACHEABLE_PATHS = new Set(["/api/docs", "/api/swagger", "/api/openapi.json"]);

export function createApp(deps: { env: Env; db: Database }) {
  const app = new Hono<AppEnv>();

  app.use(requestId());
  app.use(async (c, next) => {
    const started = performance.now();
    c.set("env", deps.env);
    c.set("db", deps.db);
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
  app.route("/api", manageRoutes);
  app.route("/api", meRoutes);
  app.route("/api", authRoutes);
  if (deps.env.DEMO_MODE) app.route("/api", devRoutes);

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
  app.notFound((c) => c.json({ error: { code: "NOT_FOUND" } }, 404));
  app.onError((error, c) => {
    if (error instanceof AppError) {
      const body = error.fields ? { code: error.code, fields: error.fields } : { code: error.code };
      return c.json({ error: body }, error.status);
    }
    if (error instanceof HTTPException && error.status === 400) {
      // 형식이 깨진 JSON 본문 등
      return c.json({ error: { code: "VALIDATION_FAILED" } }, 400);
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

import { swaggerUI } from "@hono/swagger-ui";
import { Scalar } from "@scalar/hono-api-reference";
import { HealthResponse } from "@wolgyeham/contracts";
import { Hono } from "hono";
import { describeRoute, openAPIRouteHandler, resolver } from "hono-openapi";

export function createApp() {
  const app = new Hono();
  app.get(
    "/api/health",
    describeRoute({
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
  app.get(
    "/api/openapi.json",
    openAPIRouteHandler(app, {
      documentation: { info: { title: "Wolgyeham API", version: "0.1.0" } },
    }),
  );
  app.get("/api/docs", Scalar({ url: "/api/openapi.json" }));
  app.get("/api/swagger", swaggerUI({ url: "/api/openapi.json" }));
  app.notFound((context) => context.json({ error: { code: "NOT_FOUND" } }, 404));
  app.onError((error, context) => {
    console.error(JSON.stringify({ level: "error", event: "request_failed", name: error.name }));
    return context.json({ error: { code: "INTERNAL_ERROR" } }, 500);
  });
  return app;
}

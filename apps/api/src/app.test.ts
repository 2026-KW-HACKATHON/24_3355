import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { createDatabase } from "./lib/db.ts";
import { TEST_DATABASE_URL, testEnv } from "./test/helpers.ts";

// postgres.js는 첫 쿼리 때 연결하므로 이 파일의 테스트는 DB 없이 돕니다.
const database = createDatabase(TEST_DATABASE_URL, { max: 1 });
const deps = { env: testEnv(), db: database.db };
afterAll(() => database.close());

describe("API foundation", () => {
  it("returns process health without claiming database readiness", async () => {
    // Given
    const app = createApp(deps);
    // When
    const response = await app.request("/api/health");
    // Then
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", service: "wolgyeham-api" });
  });

  it("returns a structured 404 for unknown routes", async () => {
    // Given
    const app = createApp(deps);
    // When
    const response = await app.request("/api/not-implemented");
    // Then
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "NOT_FOUND" } });
  });

  it("does not accept mutations at the health endpoint", async () => {
    // Given
    const app = createApp(deps);
    // When
    const response = await app.request("/api/health", { method: "POST" });
    // Then
    expect(response.status).toBe(404);
  });

  it("publishes a machine-readable contract for every slice A route", async () => {
    // Given
    const app = createApp(deps);
    // When
    const response = await app.request("/api/openapi.json");
    // Then
    expect(response.status).toBe(200);
    const spec = await response.json();
    expect(spec).toMatchObject({
      openapi: "3.1.0",
      paths: {
        "/api/health": { get: { responses: { "200": expect.any(Object) } } },
        "/api/buildings/{buildingId}": { get: expect.any(Object) },
        "/api/buildings/{buildingId}/guides": { get: expect.any(Object), post: expect.any(Object) },
        "/api/buildings/{buildingId}/notices/current": { get: expect.any(Object) },
        "/api/guides/{guideId}": { get: expect.any(Object), patch: expect.any(Object) },
        "/api/guides/{guideId}/publish": { post: expect.any(Object) },
        "/api/manage/buildings": { get: expect.any(Object) },
        "/api/manage/buildings/{buildingId}": { get: expect.any(Object) },
        "/api/manager-invites/preview": { post: expect.any(Object) },
        "/api/manager-invites/accept": { post: expect.any(Object) },
        "/api/me": { get: expect.any(Object) },
        "/api/auth/kakao/start": { get: expect.any(Object) },
        "/api/auth/kakao/callback": { get: expect.any(Object) },
        "/api/auth/logout": { post: expect.any(Object) },
      },
    });
    expect(spec.paths["/api/dev/login"]).toBeUndefined();
  });

  it("marks API responses no-store and echoes a request id, but lets docs be cached", async () => {
    // Given
    const app = createApp(deps);
    // When
    const health = await app.request("/api/health", { headers: { "X-Request-Id": "req-1" } });
    const missing = await app.request("/api/not-implemented");
    const docs = await app.request("/api/openapi.json");
    // Then
    expect(health.headers.get("Cache-Control")).toBe("no-store");
    expect(health.headers.get("X-Request-Id")).toBe("req-1");
    expect(missing.headers.get("Cache-Control")).toBe("no-store");
    expect(docs.headers.get("Cache-Control")).toBeNull();
  });

  it("rejects malformed JSON bodies as validation failures", async () => {
    // Given
    const app = createApp(deps);
    // When
    const response = await app.request("/api/manager-invites/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    // Then
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  });
});

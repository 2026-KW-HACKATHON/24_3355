import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";

describe("API foundation", () => {
  it("returns process health without claiming database readiness", async () => {
    // Given
    const app = createApp();
    // When
    const response = await app.request("/api/health");
    // Then
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", service: "wolgyeham-api" });
  });

  it("returns a structured 404 for unknown routes", async () => {
    // Given
    const app = createApp();
    // When
    const response = await app.request("/api/not-implemented");
    // Then
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "NOT_FOUND" } });
  });

  it("does not accept mutations at the health endpoint", async () => {
    // Given
    const app = createApp();
    // When
    const response = await app.request("/api/health", { method: "POST" });
    // Then
    expect(response.status).toBe(404);
  });

  it("publishes a machine-readable health contract", async () => {
    // Given
    const app = createApp();
    // When
    const response = await app.request("/api/openapi.json");
    // Then
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      openapi: "3.1.0",
      paths: { "/api/health": { get: { responses: { "200": expect.any(Object) } } } },
    });
  });
});

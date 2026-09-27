import { describe, expect, it } from "vitest";
import { parseEnv } from "./env.ts";

const base = {
  DATABASE_URL: "postgres://user:secret-password@127.0.0.1:5432/db",
  APP_ORIGIN: "https://example.invalid/some/path",
};

describe("parseEnv", () => {
  it("applies defaults and keeps only the origin of APP_ORIGIN", () => {
    // When
    const env = parseEnv({ ...base, KAKAO_REDIRECT_URI: "" });
    // Then
    expect(env).toMatchObject({
      NODE_ENV: "development",
      API_PORT: 3001,
      APP_ORIGIN: "https://example.invalid",
      DEMO_MODE: false,
    });
    expect(env.KAKAO_REDIRECT_URI).toBeUndefined();
  });

  it("fails fast when Kakao is configured without SESSION_SECRET, naming keys but not values", () => {
    // When
    const parse = () => parseEnv({ ...base, KAKAO_REST_API_KEY: "kakao-key-value" });
    // Then
    expect(parse).toThrow("Invalid environment variables: SESSION_SECRET");
    expect(parse).not.toThrow(/kakao-key-value|secret-password/);
  });

  it("rejects a missing DATABASE_URL", () => {
    // Then
    expect(() => parseEnv({ APP_ORIGIN: base.APP_ORIGIN })).toThrow("DATABASE_URL");
  });
});

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
      // lofi 45 ‘1년에 한 번 아직 살고 있나요?를 물어요’
      RECONFIRM_INTERVAL_DAYS: 365,
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

  it("requires the three VAPID keys together and defaults to no trusted proxy", () => {
    // When
    const partial = () => parseEnv({ ...base, VAPID_PUBLIC_KEY: "public-key-value" });
    const complete = parseEnv({
      ...base,
      VAPID_PUBLIC_KEY: "public-key-value",
      VAPID_PRIVATE_KEY: "private-key-value",
      VAPID_SUBJECT: "mailto:team@example.invalid",
    });
    // Then
    expect(partial).toThrow("Invalid environment variables: VAPID_PRIVATE_KEY, VAPID_SUBJECT");
    expect(partial).not.toThrow(/public-key-value/);
    expect(complete.VAPID_SUBJECT).toBe("mailto:team@example.invalid");
    expect(parseEnv(base).TRUSTED_PROXY_HOPS).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { detectInApp, detectPushEnv, isIos, type PushEnvInput } from "./pushEnv";

const UA = {
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1",
  ipadDesktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  kakaoIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5",
  kakaoAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S918N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36;KAKAOTALK 2410850",
  instagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 339.0.3.12.91",
  desktopFirefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
};

function input(overrides: Partial<PushEnvInput>): PushEnvInput {
  return {
    userAgent: UA.androidChrome,
    maxTouchPoints: 5,
    standalone: false,
    hasNotification: true,
    hasServiceWorker: true,
    hasPushManager: true,
    permission: "default",
    serverKey: "server-key",
    subscribed: false,
    ...overrides,
  };
}

describe("detectPushEnv", () => {
  it("offers notifications on Android Chrome", () => {
    // Given
    const env = input({});
    // When
    const result = detectPushEnv(env);
    // Then
    expect(result).toEqual({ kind: "available" });
  });

  it("asks iPhone Safari to add the app to the home screen first", () => {
    // Given
    const env = input({ userAgent: UA.iphoneSafari, hasPushManager: false });
    // When
    const result = detectPushEnv(env);
    // Then
    expect(result).toEqual({ kind: "ios-install", safari: true });
  });

  it("treats other iPhone browsers as needing the home screen too, without Safari's bottom bar", () => {
    // Given
    const env = input({ userAgent: UA.iphoneChrome, hasPushManager: false });
    // When
    const result = detectPushEnv(env);
    // Then
    expect(result).toEqual({ kind: "ios-install", safari: false });
  });

  it("recognizes iPadOS that reports a desktop user agent", () => {
    // Given
    const env = input({ userAgent: UA.ipadDesktop, maxTouchPoints: 5, hasPushManager: false });
    // When
    const result = detectPushEnv(env);
    // Then
    expect(result.kind).toBe("ios-install");
  });

  it("lets an iPhone that opened the home-screen app turn notifications on", () => {
    // Given
    const env = input({ userAgent: UA.iphoneSafari, standalone: true });
    // When
    const result = detectPushEnv(env);
    // Then
    expect(result).toEqual({ kind: "available" });
  });

  it("sends KakaoTalk in-app browsers to Safari or Chrome before anything else", () => {
    // Given
    const iphone = input({ userAgent: UA.kakaoIphone });
    const android = input({ userAgent: UA.kakaoAndroid });
    // When
    const results = [detectPushEnv(iphone), detectPushEnv(android)];
    // Then
    expect(results).toEqual([
      { kind: "in-app", app: "kakao" },
      { kind: "in-app", app: "kakao" },
    ]);
  });

  it("flags other in-app browsers without naming KakaoTalk", () => {
    // Given
    const env = input({ userAgent: UA.instagram });
    // When
    const result = detectPushEnv(env);
    // Then
    expect(result).toEqual({ kind: "in-app", app: "other" });
  });

  it("reports blocked when the user denied the permission", () => {
    // Given
    const env = input({ permission: "denied" });
    // When
    const result = detectPushEnv(env);
    // Then
    expect(result).toEqual({ kind: "blocked", ios: false });
  });

  it("reports enabled only when permission is granted and a subscription exists", () => {
    // Given
    const granted = input({ permission: "granted", subscribed: true });
    const grantedWithoutSubscription = input({ permission: "granted", subscribed: false });
    // When
    const results = [detectPushEnv(granted), detectPushEnv(grantedWithoutSubscription)];
    // Then
    expect(results).toEqual([{ kind: "enabled" }, { kind: "available" }]);
  });

  it("is unsupported when the browser lacks web push", () => {
    // Given
    const env = input({ userAgent: UA.desktopFirefox, maxTouchPoints: 0, hasPushManager: false });
    // When
    const result = detectPushEnv(env);
    // Then
    expect(result).toEqual({ kind: "unsupported", reason: "browser" });
  });

  it("is unsupported when the server has no push key, even if the browser could", () => {
    // Given
    const env = input({ serverKey: null });
    // When
    const result = detectPushEnv(env);
    // Then
    expect(result).toEqual({ kind: "unsupported", reason: "server" });
  });

  it("keeps offering the button while the server key is still loading", () => {
    // Given
    const env = input({ serverKey: undefined });
    // When
    const result = detectPushEnv(env);
    // Then
    expect(result).toEqual({ kind: "available" });
  });
});

describe("user agent helpers", () => {
  it("does not mistake a Mac desktop for iOS", () => {
    // Given
    const mac = UA.ipadDesktop;
    // When
    const result = isIos(mac, 0);
    // Then
    expect(result).toBe(false);
  });

  it("finds no in-app browser in plain Chrome", () => {
    // Given
    const chrome = UA.androidChrome;
    // When
    const result = detectInApp(chrome);
    // Then
    expect(result).toBeUndefined();
  });
});

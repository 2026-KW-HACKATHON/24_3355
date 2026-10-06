import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendJsonEmpty } from "../../lib/api";
import { AppError } from "../../lib/errors";
import { memoryStorage } from "../../test/memoryStorage";
import {
  disablePush,
  enablePush,
  forgetSubscription,
  isConfirmedSubscription,
  loadSavedPush,
  resaveSubscription,
} from "./push";

vi.mock("../../lib/api", () => ({ sendJsonEmpty: vi.fn() }));

const KEY = "AQID_-8"; // 01 02 03 ff ef
const USER = "user-a";
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc";

type FakeSubscription = {
  endpoint: string;
  options: { applicationServerKey: ArrayBuffer | null };
  toJSON: () => unknown;
  unsubscribe: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
};

function fakeSubscription(): FakeSubscription {
  return {
    endpoint: ENDPOINT,
    options: { applicationServerKey: null },
    toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: "p256dh-key", auth: "auth-key" } }),
    unsubscribe: vi.fn(async () => true),
  };
}

/** 브라우저 푸시 API 대역. `existing`은 이 브라우저에 이미 있는 구독. */
function fakeBrowser({
  permission = "granted" as NotificationPermission,
  existing = null as FakeSubscription | null,
} = {}) {
  let current = existing;
  const created = fakeSubscription();
  const pushManager = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async () => {
      current = created;
      return created;
    }),
  };
  const registration = { pushManager };
  const requestPermission = vi.fn(async () => permission);
  vi.stubGlobal("navigator", {
    serviceWorker: {
      register: vi.fn(async () => registration),
      ready: Promise.resolve(registration),
      getRegistration: vi.fn(async () => registration),
    },
  });
  vi.stubGlobal("window", { PushManager: class {}, Notification: {} });
  vi.stubGlobal("Notification", { requestPermission, permission });
  return { pushManager, created, requestPermission };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  vi.mocked(sendJsonEmpty).mockReset();
  vi.unstubAllGlobals();
});

describe("turning notifications on (enablePush)", () => {
  it("counts as on only after the server saved the subscription", async () => {
    // Given
    const browser = fakeBrowser();
    vi.mocked(sendJsonEmpty).mockResolvedValueOnce(undefined);
    const onPermission = vi.fn();
    // When
    const result = await enablePush(KEY, USER, onPermission);
    // Then
    expect(result).toBe("enabled");
    expect(onPermission).toHaveBeenCalledOnce();
    expect(sendJsonEmpty).toHaveBeenCalledWith("post", "/api/push-subscriptions", {
      endpoint: ENDPOINT,
      keys: { p256dh: "p256dh-key", auth: "auth-key" },
    });
    expect(browser.created.unsubscribe).not.toHaveBeenCalled();
    expect(isConfirmedSubscription(ENDPOINT, USER)).toBe(true);
    expect(isConfirmedSubscription(ENDPOINT, "someone-else")).toBe(false);
  });

  it.each([
    ["RECONFIRM_NEEDED", new AppError("RECONFIRM_NEEDED")],
    ["NETWORK", new AppError("NETWORK")],
    ["VALIDATION_FAILED (rejected endpoint)", new AppError("VALIDATION_FAILED")],
  ])("drops the browser subscription when saving fails with %s", async (_label, failure) => {
    // Given
    const browser = fakeBrowser();
    vi.mocked(sendJsonEmpty).mockRejectedValueOnce(failure);
    // When
    const error = await enablePush(KEY, USER).catch((caught: unknown) => caught);
    // Then
    expect(error).toBe(failure);
    expect(browser.created.unsubscribe).toHaveBeenCalledOnce();
    expect(loadSavedPush()).toBeUndefined();
    expect(isConfirmedSubscription(ENDPOINT, USER)).toBe(false);
  });

  it("stops before subscribing when the permission is refused", async () => {
    // Given
    const browser = fakeBrowser({ permission: "denied" });
    // When
    const result = await enablePush(KEY, USER);
    // Then
    expect(result).toBe("denied");
    expect(browser.pushManager.subscribe).not.toHaveBeenCalled();
    expect(sendJsonEmpty).not.toHaveBeenCalled();
  });
});

describe("saving an existing subscription again (resaveSubscription)", () => {
  it("drops it when the server does not take it", async () => {
    // Given
    const existing = fakeSubscription();
    fakeBrowser({ existing });
    vi.mocked(sendJsonEmpty).mockRejectedValueOnce(new AppError("RECONFIRM_NEEDED"));
    // When
    const error = await resaveSubscription(USER).catch((caught: unknown) => caught);
    // Then
    expect(error).toMatchObject({ code: "RECONFIRM_NEEDED" });
    expect(existing.unsubscribe).toHaveBeenCalledOnce();
  });

  it("marks it as saved for this account", async () => {
    // Given
    fakeBrowser({ existing: fakeSubscription() });
    vi.mocked(sendJsonEmpty).mockResolvedValueOnce(undefined);
    // When
    const saved = await resaveSubscription(USER);
    // Then
    expect(saved).toBe(true);
    expect(isConfirmedSubscription(ENDPOINT, USER)).toBe(true);
  });
});

describe("turning notifications off (disablePush)", () => {
  it("still unsubscribes this browser when the server delete fails", async () => {
    // Given
    const existing = fakeSubscription();
    fakeBrowser({ existing });
    localStorage.setItem("wh.pushSaved", JSON.stringify({ endpoint: ENDPOINT, userId: USER }));
    vi.mocked(sendJsonEmpty).mockRejectedValueOnce(new AppError("NETWORK"));
    // When
    await disablePush();
    // Then
    expect(sendJsonEmpty).toHaveBeenCalledWith("delete", "/api/push-subscriptions", {
      endpoint: ENDPOINT,
    });
    expect(existing.unsubscribe).toHaveBeenCalledOnce();
    expect(loadSavedPush()).toBeUndefined();
  });

  it("reports an error only when the browser subscription could not be dropped", async () => {
    // Given
    const existing = fakeSubscription();
    existing.unsubscribe.mockResolvedValueOnce(false);
    fakeBrowser({ existing });
    vi.mocked(sendJsonEmpty).mockRejectedValueOnce(new AppError("NETWORK"));
    // When
    const error = await disablePush().catch((caught: unknown) => caught);
    // Then
    expect(error).toMatchObject({ code: "NETWORK" });
  });

  it("forgets the browser subscription after the server removed it (building switch)", async () => {
    // Given
    const existing = fakeSubscription();
    fakeBrowser({ existing });
    localStorage.setItem("wh.pushSaved", JSON.stringify({ endpoint: ENDPOINT, userId: USER }));
    // When
    await forgetSubscription();
    // Then
    expect(existing.unsubscribe).toHaveBeenCalledOnce();
    expect(sendJsonEmpty).not.toHaveBeenCalled();
    expect(loadSavedPush()).toBeUndefined();
  });
});

import { QueryClient } from "@tanstack/react-query";
import type { Me } from "@wolgyeham/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getJson, postEmpty } from "../../lib/api";
import { AppError } from "../../lib/errors";
import { testUser } from "../../test/me";
import { memoryStorage } from "../../test/memoryStorage";
import { shouldEndDemo } from "./demoRole";
import { endDemo, onDemoEnded } from "./endDemo";
import { authKeys } from "./queries";

vi.mock("../../lib/api", () => ({
  getJson: vi.fn(),
  postJson: vi.fn(),
  postEmpty: vi.fn(),
  sendJsonEmpty: vi.fn(),
  http: { get: vi.fn() },
  seg: (value: string) => value,
}));

const USER = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f99";

function me(demo: Me["user"]["demo"]): Me {
  return { user: testUser(USER, { demo }), managedBuildings: [], occupancy: null };
}

const REAL = { demo: false };
const DEMO = { demo: true };
const none: ReadonlySet<string> = new Set();

describe("ending the demo on a real building (D-35)", () => {
  it("ends a demo account's session on a real building", () => {
    expect(shouldEndDemo({ me: me("demo-resident-a"), building: REAL, failedUserIds: none })).toBe(
      true,
    );
    expect(shouldEndDemo({ me: me("demo-landlord"), building: REAL, failedUserIds: none })).toBe(
      true,
    );
  });

  it("keeps the demo going on demo buildings", () => {
    expect(shouldEndDemo({ me: me("demo-resident-a"), building: DEMO, failedUserIds: none })).toBe(
      false,
    );
  });

  it("never touches real Kakao accounts or signed-out visitors", () => {
    expect(shouldEndDemo({ me: me(null), building: REAL, failedUserIds: none })).toBe(false);
    expect(shouldEndDemo({ me: null, building: REAL, failedUserIds: none })).toBe(false);
  });

  it("waits for both the account and the building", () => {
    // 내 정보를 받는 중이거나 실패했으면(undefined) 끝내지 않습니다.
    expect(shouldEndDemo({ me: undefined, building: REAL, failedUserIds: none })).toBe(false);
    expect(
      shouldEndDemo({ me: me("demo-resident-a"), building: undefined, failedUserIds: none }),
    ).toBe(false);
  });

  it("does not retry for an account whose logout already failed (no loop)", () => {
    expect(
      shouldEndDemo({
        me: me("demo-resident-a"),
        building: REAL,
        failedUserIds: new Set([USER]),
      }),
    ).toBe(false);
  });
});

describe("ending the demo with a stale cached account (D-35)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("sessionStorage", memoryStorage());
  });
  afterEach(() => {
    vi.mocked(getJson).mockReset();
    vi.mocked(postEmpty).mockReset();
    vi.unstubAllGlobals();
  });

  function cachedDemo() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(authKeys.me(), me("demo-resident-a"));
    return queryClient;
  }

  it("re-reads the account first and leaves a real session alone", async () => {
    // Given: 캐시에는 시연 계정이 남아 있지만, 다른 탭에서 카카오로 로그인했습니다.
    const queryClient = cachedDemo();
    const real: Me = { ...me(null), user: testUser("real-user", { demo: null }) };
    vi.mocked(getJson).mockResolvedValueOnce(real);
    const ended = vi.fn();
    const stop = onDemoEnded(ended);
    // When
    await endDemo(queryClient);
    stop();
    // Then: 시연 끝내기를 부르지 않고 새 내 정보만 둡니다.
    expect(postEmpty).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(authKeys.me())).toEqual(real);
    expect(ended).not.toHaveBeenCalled();
  });

  it("does nothing more when the server says the session is not a demo one (409)", async () => {
    // Given
    const queryClient = cachedDemo();
    vi.mocked(getJson).mockResolvedValue(me("demo-resident-a"));
    vi.mocked(postEmpty).mockRejectedValueOnce(new AppError("CONFLICT"));
    const ended = vi.fn();
    const stop = onDemoEnded(ended);
    // When
    await endDemo(queryClient);
    stop();
    // Then
    expect(postEmpty).toHaveBeenCalledWith("/api/dev/end-demo");
    expect(ended).not.toHaveBeenCalled();
  });

  it("ends a real demo session through /api/dev/end-demo and tells once", async () => {
    // Given
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const other: Me = {
      ...me("demo-landlord"),
      user: testUser("demo-2", { demo: "demo-landlord" }),
    };
    queryClient.setQueryData(authKeys.me(), other);
    vi.mocked(getJson)
      .mockResolvedValueOnce(other)
      .mockRejectedValue(new AppError("UNAUTHENTICATED"));
    vi.mocked(postEmpty).mockResolvedValueOnce(undefined);
    const ended = vi.fn();
    const stop = onDemoEnded(ended);
    // When
    await endDemo(queryClient);
    stop();
    // Then
    expect(postEmpty).toHaveBeenCalledWith("/api/dev/end-demo");
    expect(queryClient.getQueryData(authKeys.me())).toBeNull();
    expect(ended).toHaveBeenCalledOnce();
  });
});

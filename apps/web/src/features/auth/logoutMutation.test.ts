import { MutationObserver, QueryClient } from "@tanstack/react-query";
import type { Me } from "@wolgyeham/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postEmpty, postJson, sendJsonEmpty } from "../../lib/api";
import { AppError } from "../../lib/errors";
import { testUser } from "../../test/me";
import { memoryStorage } from "../../test/memoryStorage";
import { loadLocalDraft, saveLocalDraft } from "../guides/localDraft";
import { authKeys, demoLoginMutationOptions, logoutMutationOptions } from "./queries";

vi.mock("../../lib/api", () => ({
  postEmpty: vi.fn(),
  sendJsonEmpty: vi.fn(),
  getJson: vi.fn(),
  postJson: vi.fn(),
  http: { get: vi.fn() },
}));

const BUILDING = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01";
const signedIn: Me = {
  user: testUser("user-a"),
  managedBuildings: [],
  occupancy: null,
};
const draftKey = { userId: "user-a", buildingId: BUILDING, guideId: undefined };

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(authKeys.me(), signedIn);
  queryClient.setQueryData(["manage", "buildings", BUILDING], { name: "햇살빌라" });
  return queryClient;
}

/** 이전 계정으로 본 것들: 로그인해서 본 제보 상세·보낸 내용·내 팁·안내 아래 메모·집주인이 받은 초안. */
const ACCOUNT_DATA: readonly (readonly unknown[])[] = [
  ["reports", "report-1", null],
  ["reports", "mine", "user-a"],
  ["tips", "mine", "user-a"],
  ["tips", "building", BUILDING, "user-a"],
  ["memos", "guide", "guide-1"],
  ["guide", "guide-draft"],
];

function withAccountData(queryClient: QueryClient) {
  for (const queryKey of ACCOUNT_DATA) queryClient.setQueryData(queryKey, { from: "user-a" });
  // 누구나 보는 공개 건물 정보는 남깁니다.
  queryClient.setQueryData(["building", BUILDING], { name: "햇살빌라" });
}

function runLogout(queryClient: QueryClient) {
  return new MutationObserver(queryClient, logoutMutationOptions(queryClient)).mutate();
}

/** 이 브라우저에 알림 구독이 있는 상태. */
function withSubscription() {
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    unsubscribe: vi.fn(async () => true),
  };
  vi.stubGlobal("navigator", {
    serviceWorker: {
      getRegistration: async () => ({
        pushManager: { getSubscription: async () => subscription },
      }),
    },
  });
  vi.stubGlobal("window", { PushManager: class {}, Notification: {} });
  return subscription;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
  saveLocalDraft(draftKey, { category: "parcel", title: "택배", body: "1층 보관함" });
});

afterEach(() => {
  vi.mocked(postEmpty).mockReset();
  vi.mocked(sendJsonEmpty).mockReset();
  vi.unstubAllGlobals();
});

describe("useLogout", () => {
  it("shows signed out only after the server confirmed the logout", async () => {
    // Given
    const queryClient = setup();
    vi.mocked(postEmpty).mockResolvedValueOnce(undefined);
    const cancel = vi.spyOn(queryClient, "cancelQueries");
    const set = vi.spyOn(queryClient, "setQueryData");
    // When
    await runLogout(queryClient);
    // Then
    expect(postEmpty).toHaveBeenCalledWith("/api/auth/logout");
    expect(queryClient.getQueryData(authKeys.me())).toBeNull();
    expect(queryClient.getQueryData(["manage", "buildings", BUILDING])).toBeUndefined();
    const cancelOrder = cancel.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY;
    const setOrder = set.mock.invocationCallOrder[0] ?? Number.NEGATIVE_INFINITY;
    expect(cancelOrder).toBeLessThan(setOrder);
  });

  it("forgets what the previous account saw, so Back does not show it", async () => {
    // Given
    const queryClient = setup();
    withAccountData(queryClient);
    vi.mocked(postEmpty).mockResolvedValueOnce(undefined);
    // When
    await runLogout(queryClient);
    // Then
    for (const queryKey of ACCOUNT_DATA) {
      expect(queryClient.getQueryData(queryKey), JSON.stringify(queryKey)).toBeUndefined();
    }
    expect(queryClient.getQueryData(["building", BUILDING])).toEqual({ name: "햇살빌라" });
  });

  it("keeps the signed-in state and returns the error when the logout request fails", async () => {
    // Given
    const queryClient = setup();
    vi.mocked(postEmpty).mockRejectedValueOnce(new AppError("NETWORK"));
    // When
    const error = await runLogout(queryClient).catch((caught: unknown) => caught);
    // Then
    expect(error).toMatchObject({ code: "NETWORK" });
    expect(queryClient.getQueryData(authKeys.me())).toEqual(signedIn);
    expect(queryClient.getQueryData(["manage", "buildings", BUILDING])).toEqual({
      name: "햇살빌라",
    });
    // 이 기기에 남은 쓰던 내용은 실패해도 지웁니다.
    expect(loadLocalDraft(draftKey)).toBeUndefined();
  });

  it("does not let a /api/me answer that arrives late bring the session back", async () => {
    // Given
    const queryClient = setup();
    vi.mocked(postEmpty).mockResolvedValueOnce(undefined);
    let answer: (me: Me) => void = () => undefined;
    const pending = queryClient
      .fetchQuery({
        queryKey: authKeys.me(),
        queryFn: () =>
          new Promise<Me>((resolve) => {
            answer = resolve;
          }),
        staleTime: 0,
      })
      .catch(() => undefined);
    // When
    await runLogout(queryClient);
    answer(signedIn);
    await pending;
    // Then
    expect(queryClient.getQueryData(authKeys.me())).toBeNull();
  });

  it("sends this browser's subscription with the logout and then unsubscribes it", async () => {
    // Given
    const queryClient = setup();
    const subscription = withSubscription();
    vi.mocked(sendJsonEmpty).mockResolvedValueOnce(undefined);
    // When
    await runLogout(queryClient);
    // Then: 서버는 같은 요청에서 구독을 지우고(로그인한 본인만 가능), 브라우저 구독은 그 뒤에 끊습니다.
    expect(sendJsonEmpty).toHaveBeenCalledWith("post", "/api/auth/logout", {
      pushEndpoint: subscription.endpoint,
    });
    expect(postEmpty).not.toHaveBeenCalled();
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
    const logoutOrder = vi.mocked(sendJsonEmpty).mock.invocationCallOrder[0] ?? 0;
    const unsubscribeOrder = subscription.unsubscribe.mock.invocationCallOrder[0] ?? 0;
    expect(logoutOrder).toBeLessThan(unsubscribeOrder);
    expect(queryClient.getQueryData(authKeys.me())).toBeNull();
  });

  it("still turns notifications off on this phone when the logout request fails", async () => {
    // Given
    const queryClient = setup();
    const subscription = withSubscription();
    vi.mocked(sendJsonEmpty).mockRejectedValueOnce(new AppError("NETWORK"));
    // When
    const error = await runLogout(queryClient).catch((caught: unknown) => caught);
    // Then
    expect(error).toMatchObject({ code: "NETWORK" });
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(authKeys.me())).toEqual(signedIn);
  });
});

describe("demo login (switching accounts)", () => {
  it("drops the previous account's data and signs in as the new one", async () => {
    // Given
    const queryClient = setup();
    withAccountData(queryClient);
    const next: Me = { user: testUser("user-b"), managedBuildings: [], occupancy: null };
    vi.mocked(postJson).mockResolvedValueOnce(next);
    // When
    await new MutationObserver(queryClient, demoLoginMutationOptions(queryClient)).mutate(
      "demo-resident-b",
    );
    // Then
    expect(postJson).toHaveBeenCalledWith(
      "/api/dev/login",
      { as: "demo-resident-b" },
      expect.anything(),
    );
    expect(queryClient.getQueryData(authKeys.me())).toEqual(next);
    for (const queryKey of ACCOUNT_DATA) {
      expect(queryClient.getQueryData(queryKey), JSON.stringify(queryKey)).toBeUndefined();
    }
    expect(queryClient.getQueryData(["building", BUILDING])).toEqual({ name: "햇살빌라" });
  });
});

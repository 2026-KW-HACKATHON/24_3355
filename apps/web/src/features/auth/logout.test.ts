import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postEmpty, sendJsonEmpty } from "../../lib/api";
import { AppError } from "../../lib/errors";
import { memoryStorage } from "../../test/memoryStorage";
import { loadLocalDraft, saveLocalDraft } from "../guides/localDraft";
import { loadInviteToken, stashInviteToken } from "../invites/token";
import { loadConnectDraft, saveConnectDraft } from "../occupancy/connectDraft";
import { loadTipDraft, saveTipDraft } from "../tips/tipDraft";
import { logout } from "./session";

vi.mock("../../lib/api", () => ({
  postEmpty: vi.fn(),
  sendJsonEmpty: vi.fn(),
  getJson: vi.fn(),
  postJson: vi.fn(),
}));

const BUILDING = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01";
const VALUES = { category: "parcel", title: "택배", body: "1층 보관함" } as const;
const mine = { userId: "user-a", buildingId: BUILDING, guideId: undefined };
const theirs = { userId: "user-b", buildingId: BUILDING, guideId: undefined };

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
  saveLocalDraft(mine, VALUES);
  saveLocalDraft(theirs, VALUES);
  stashInviteToken("invite-token");
  saveConnectDraft({
    buildingId: BUILDING,
    buildingName: "햇살빌라",
    code: "WK72P4",
    returnTo: "/",
  });
  saveTipDraft({ buildingId: BUILDING, tipId: null }, { category: null, body: "분리수거 팁" });
});

afterEach(() => {
  vi.mocked(postEmpty).mockReset();
  vi.mocked(sendJsonEmpty).mockReset();
  vi.unstubAllGlobals();
});

describe("logout", () => {
  it("clears the user's drafts, the invite token and the join code in progress", async () => {
    // Given
    vi.mocked(postEmpty).mockResolvedValueOnce(undefined);
    // When
    await logout("user-a");
    // Then
    expect(postEmpty).toHaveBeenCalledWith("/api/auth/logout");
    expect(loadLocalDraft(mine)).toBeUndefined();
    expect(loadLocalDraft(theirs)).toMatchObject(VALUES);
    expect(loadInviteToken()).toBeUndefined();
    expect(loadConnectDraft(BUILDING)).toBeUndefined();
    expect(loadTipDraft({ buildingId: BUILDING, tipId: null })).toBeUndefined();
  });

  it("asks the server to drop this browser's notification subscription in the same request", async () => {
    // Given
    const endpoint = "https://fcm.googleapis.com/fcm/send/abc";
    vi.mocked(sendJsonEmpty).mockResolvedValueOnce(undefined);
    // When
    await logout("user-a", endpoint);
    // Then
    expect(sendJsonEmpty).toHaveBeenCalledWith("post", "/api/auth/logout", {
      pushEndpoint: endpoint,
    });
    expect(postEmpty).not.toHaveBeenCalled();
  });

  it("still clears this device when the request fails", async () => {
    // Given
    vi.mocked(postEmpty).mockRejectedValueOnce(new AppError("NETWORK"));
    // When
    const error = await logout("user-a").catch((caught: unknown) => caught);
    // Then
    expect(error).toMatchObject({ code: "NETWORK" });
    expect(loadLocalDraft(mine)).toBeUndefined();
    expect(loadInviteToken()).toBeUndefined();
    expect(loadConnectDraft(BUILDING)).toBeUndefined();
    expect(loadTipDraft({ buildingId: BUILDING, tipId: null })).toBeUndefined();
  });
});

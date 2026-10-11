import { describe, expect, it } from "vitest";
import { Me, ReturnTo } from "./auth.ts";
import { ManagedBuildingDetail, PublicBuilding } from "./buildings.ts";
import { Notice } from "./notices.ts";

// 웹과 API가 주고받는 응답 모양(계약). 왕복(parse → JSON → parse)해도 같은 값이고, 필수 필드가 빠진 응답은 받지 않습니다.

const BUILDING_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01";
const GUIDE_ID = "0b6f2d1e-7c4a-4e59-8a3b-1d2c3e4f5a60";
const NOW = "2026-10-11T09:00:00.000Z";
const PHOTO_KEY = `buildings/${BUILDING_ID}/1f2e3d4c-5b6a-4978-8a1b-2c3d4e5f6a7b.webp`;

function roundTrip<T>(schema: { parse: (value: unknown) => T }, value: unknown): T {
  return schema.parse(JSON.parse(JSON.stringify(schema.parse(value))));
}

function without<T extends Record<string, unknown>>(value: T, key: keyof T) {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

const me = {
  user: {
    id: "3c1d2e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
    termsVersion: "2026-10-11-draft",
    termsAgreedAt: NOW,
    termsUpToDate: true,
    demo: "demo-resident-a",
  },
  managedBuildings: [{ id: BUILDING_ID, name: "햇살빌라" }],
  occupancy: {
    id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
    buildingId: BUILDING_ID,
    status: "active",
    connectedAt: NOW,
    lastReconfirmedAt: null,
    nextReconfirmAt: NOW,
    reconfirmRequested: false,
    reconfirmDueAt: NOW,
    endedAt: null,
    buildingName: "햇살빌라",
  },
} as const;

const publicBuilding = {
  id: BUILDING_ID,
  name: "햇살빌라",
  displayAddress: "서울 노원구 월계동 OO길",
  status: "open",
  demo: true,
} as const;

const guide = {
  id: GUIDE_ID,
  buildingId: BUILDING_ID,
  category: "recycling",
  title: "분리수거",
  body: "화·금 저녁",
  photos: [{ key: PHOTO_KEY, url: `/api/photos/${PHOTO_KEY}` }],
  status: "published",
  position: 1,
  publishedAt: NOW,
  updatedAt: NOW,
} as const;

const notice = {
  id: "7d6c5b4a-3f2e-4d1c-9b0a-8f7e6d5c4b3a",
  buildingId: BUILDING_ID,
  title: "계단 청소",
  body: "10월 2일 오전",
  photos: [{ key: PHOTO_KEY, url: `/api/photos/${PHOTO_KEY}` }],
  startsAt: NOW,
  endsAt: NOW,
  publishedAt: NOW,
} as const;

describe("Me", () => {
  it("round-trips a demo account with its occupancy", () => {
    expect(roundTrip(Me, me)).toEqual(me);
  });

  it("keeps null demo for a real Kakao account", () => {
    const real = { ...me, user: { ...me.user, demo: null } };
    expect(roundTrip(Me, real).user.demo).toBeNull();
  });

  it("requires user.demo", () => {
    const missing = { ...me, user: without(me.user, "demo") };
    expect(Me.safeParse(missing).success).toBe(false);
  });

  it("rejects an unknown demo account name", () => {
    const unknown = { ...me, user: { ...me.user, demo: "demo-admin" } };
    expect(Me.safeParse(unknown).success).toBe(false);
  });
});

describe("PublicBuilding", () => {
  it("round-trips the demo flag", () => {
    expect(roundTrip(PublicBuilding, publicBuilding)).toEqual(publicBuilding);
  });

  it("requires demo", () => {
    expect(PublicBuilding.safeParse(without(publicBuilding, "demo")).success).toBe(false);
  });
});

describe("ManagedBuildingDetail", () => {
  const detail = {
    building: {
      ...publicBuilding,
      fullAddress: "서울 노원구 월계동 000-99",
      openedAt: NOW,
      confirmedAt: null,
    },
    guides: [guide, { ...guide, status: "draft", publishedAt: null, photos: [] }],
  };

  it("round-trips the building with drafts and published guides", () => {
    expect(roundTrip(ManagedBuildingDetail, detail)).toEqual(detail);
  });

  it("requires the team-confirmed full address", () => {
    const missing = { ...detail, building: without(detail.building, "fullAddress") };
    expect(ManagedBuildingDetail.safeParse(missing).success).toBe(false);
  });
});

describe("Notice", () => {
  it("round-trips its photos", () => {
    expect(roundTrip(Notice, notice)).toEqual(notice);
  });

  it("requires photos", () => {
    expect(Notice.safeParse(without(notice, "photos")).success).toBe(false);
  });

  it("rejects a photo key outside the photo key format", () => {
    const bad = { ...notice, photos: [{ key: "../secret.webp", url: "/api/photos/x" }] };
    expect(Notice.safeParse(bad).success).toBe(false);
  });
});

describe("ReturnTo", () => {
  it.each([
    "/",
    "/manage/5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01",
    "/manage/abc?x=1",
    "/b/abc/notices/def",
    "/a.b/c..d",
  ])("accepts same-site path %s", (path) => {
    expect(ReturnTo.safeParse(path).success).toBe(true);
  });

  it.each([
    ["protocol-relative", "//evil.example"],
    ["backslash", "/\\evil.example"],
    ["absolute URL", "https://evil.example"],
    ["relative path", "manage"],
    ["encoded slashes", "/%2F%2Fevil.example"],
    ["encoded backslash", "/%5Cevil.example"],
    ["encoded CRLF", "/a%0d%0aLocation:%20x"],
    ["single dot segment", "/.//evil.example"],
    ["double dot segment", "/a/..//evil.example"],
    ["trailing dot segment", "/a/.."],
    ["dot segment before query", "/a/.?x=1"],
    ["raw tab", "/a\tb"],
    ["raw newline", "/a\nb"],
    ["DEL", "/a\u007fb"],
    ["space", "/a b"],
    ["fragment", "/a#b"],
    ["too long", `/${"a".repeat(512)}`],
  ])("rejects %s", (_label, path) => {
    expect(ReturnTo.safeParse(path).success).toBe(false);
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Guide, ManagedBuildingDetail } from "@wolgyeham/contracts";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authKeys } from "../../features/auth/queries";
import { buildingKeys } from "../../features/buildings/queries";
import { testUser } from "../../test/me";
import { memoryStorage } from "../../test/memoryStorage";
import { buildingNameError, confirmBody, confirmDestination, needsConfirm } from "./confirm";
import { Component as ConfirmScreen } from "./route";

// SEED 컴포넌트는 CSS를 함께 불러와 node에서 읽을 수 없어, 글자와 disabled만 남기는 대역으로 바꿉니다.
vi.mock("@seed-design/react", () => ({
  ActionButton: ({ children, disabled }: { children?: ReactNode; disabled?: boolean }) => (
    <button type="button" disabled={disabled}>
      {children}
    </button>
  ),
  Skeleton: () => <span />,
  Snackbar: { AvoidOverlap: ({ children }: { children?: ReactNode }) => children },
}));

const BUILDING_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f04";

function detail(overrides: Partial<ManagedBuildingDetail["building"]> = {}, guides: Guide[] = []) {
  return {
    building: {
      id: BUILDING_ID,
      name: "준비빌라",
      displayAddress: "서울 노원구 월계동 OO길",
      status: "preparing",
      fullAddress: "서울 노원구 월계동 123-4",
      openedAt: null,
      confirmedAt: null,
      ...overrides,
    },
    guides,
  } satisfies ManagedBuildingDetail;
}

const draft: Guide = {
  id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f71",
  buildingId: BUILDING_ID,
  category: "recycling",
  title: "분리수거",
  body: "화요일 저녁",
  photos: [],
  position: 0,
  status: "draft",
  publishedAt: null,
  updatedAt: "2026-09-30T01:00:00.000Z",
};

function render(data: ManagedBuildingDetail) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
  queryClient.setQueryData(authKeys.me(), {
    user: testUser("5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f99"),
    managedBuildings: [{ id: BUILDING_ID, name: data.building.name }],
    occupancy: null,
  });
  queryClient.setQueryData(buildingKeys.managed(BUILDING_ID), data);
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/manage/${BUILDING_ID}/confirm`]}>
        <Routes>
          <Route path="/manage/:buildingId/confirm" element={<ConfirmScreen />} />
          <Route path="/manage/:buildingId" element={<p>관리 홈 화면</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("sessionStorage", memoryStorage());
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("building name check (LF-12 23)", () => {
  it("accepts a normal name and trims around it", () => {
    expect(buildingNameError("  햇살빌라 2동 ")).toBeUndefined();
  });

  it("explains an empty, too long or invisible name", () => {
    expect(buildingNameError("   ")).toBe("건물 이름을 적어 주세요");
    expect(buildingNameError("가".repeat(41))).toBe("건물 이름은 40자까지 쓸 수 있어요");
    expect(buildingNameError("가".repeat(40))).toBeUndefined();
    expect(buildingNameError("---")).toBe("글자나 숫자로 된 이름을 적어 주세요");
    expect(buildingNameError("빌라‮")).toBe("글자나 숫자로 된 이름을 적어 주세요");
  });

  it("sends the name only when it changed", () => {
    expect(confirmBody("준비빌라", " 준비빌라 ")).toEqual({});
    expect(confirmBody("준비빌라", "준비빌라 A동 ")).toEqual({ name: "준비빌라 A동" });
  });
});

describe("where 23 leads", () => {
  it("goes to the first guide (33) when nothing is written yet, otherwise to the manage home", () => {
    expect(confirmDestination(detail())).toBe(`/manage/${BUILDING_ID}/guides/new`);
    expect(confirmDestination(detail({}, [draft]))).toBe(`/manage/${BUILDING_ID}`);
  });

  it("asks only buildings that are not confirmed yet", () => {
    expect(needsConfirm(detail())).toBe(true);
    expect(needsConfirm(detail({ confirmedAt: "2026-09-30T01:00:00.000Z" }))).toBe(false);
  });
});

describe("building confirm screen (LF-12 23)", () => {
  it("shows the editable name, the locked team-checked address and what the public sees", () => {
    // When
    const html = render(detail());
    // Then
    expect(html).toContain("초대받은 건물이");
    expect(html).toContain('value="준비빌라"');
    expect(html).toContain("현관 QR을 연 사람이 가장 먼저 보는 이름이에요. 바꿀 수 있어요.");
    expect(html).toContain("월계함 팀이 확인한 주소");
    expect(html).toContain("서울 노원구 월계동 123-4");
    expect(html).toContain("공개 화면에는 ‘서울 노원구 월계동 OO길’까지만 보여요.");
    expect(html).toContain("맞아요, 안내 쓰기");
    expect(html).toContain("wh-hami");
  });

  it("hides 팀에 알리기 without a contact address and links it when one is set", () => {
    // Given
    const without = render(detail());
    vi.stubEnv("VITE_TEAM_CONTACT_URL", "https://open.kakao.com/o/example");
    // When
    const withContact = render(detail());
    // Then
    expect(without).not.toContain("팀에 알리기");
    expect(withContact).toContain("팀에 알리기");
    expect(withContact).toContain('href="https://open.kakao.com/o/example"');
    expect(withContact).toContain('rel="noopener noreferrer"');
  });

  it("offers the manage home when guides already exist", () => {
    expect(render(detail({}, [draft]))).toContain("맞아요, 관리 홈으로");
  });

  it("skips 23 for a building that is already confirmed", () => {
    // When
    const html = render(detail({ confirmedAt: "2026-09-30T01:00:00.000Z" }));
    // Then
    expect(html).not.toContain("초대받은 건물이");
  });
});

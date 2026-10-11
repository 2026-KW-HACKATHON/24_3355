import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoBarLabel, readDemoRole, saveDemoRole } from "../features/auth/demoRole";
import { authKeys } from "../features/auth/queries";
import { testUser } from "../test/me";
import { memoryStorage } from "../test/memoryStorage";
import { DemoBar } from "./DemoBar";

vi.mock("../lib/api", () => ({
  getJson: vi.fn(),
  postJson: vi.fn(),
  postEmpty: vi.fn(),
  sendJsonEmpty: vi.fn(),
  http: { get: vi.fn() },
}));

const USER = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f99";
const mark = { userId: USER, label: "입주자 A" };

beforeEach(() => {
  vi.stubGlobal("sessionStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("demo bar condition", () => {
  const base = { pathname: "/b/x", available: true, userId: USER, mark };

  it("shows the chosen role only for that demo account in demo mode", () => {
    expect(demoBarLabel(base)).toBe("입주자 A");
    expect(demoBarLabel({ ...base, available: false })).toBeUndefined();
    expect(demoBarLabel({ ...base, available: undefined })).toBeUndefined();
    expect(demoBarLabel({ ...base, userId: undefined })).toBeUndefined();
    expect(demoBarLabel({ ...base, mark: undefined })).toBeUndefined();
    // 같은 탭에서 카카오로 다른 계정에 로그인했으면 숨깁니다.
    expect(demoBarLabel({ ...base, userId: "someone-else" })).toBeUndefined();
  });

  it("hides on the demo start and the legal pages", () => {
    for (const pathname of ["/demo", "/demo/", "/terms", "/privacy"]) {
      expect(demoBarLabel({ ...base, pathname })).toBeUndefined();
    }
    expect(demoBarLabel({ ...base, pathname: "/" })).toBe("입주자 A");
  });

  it("ignores a broken mark in storage", () => {
    sessionStorage.setItem("wh.demoRole", "{oops");
    expect(readDemoRole()).toBeUndefined();
    sessionStorage.setItem("wh.demoRole", JSON.stringify({ userId: USER }));
    expect(readDemoRole()).toBeUndefined();
    saveDemoRole(mark);
    expect(readDemoRole()).toEqual(mark);
  });
});

describe("DemoBar", () => {
  function render(pathname: string, available: boolean, signedIn = true) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    queryClient.setQueryData(
      authKeys.me(),
      signedIn ? { user: testUser(USER), managedBuildings: [], occupancy: null } : null,
    );
    queryClient.setQueryData(authKeys.demo(), available);
    return renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[pathname]}>
          <DemoBar />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("says which role is on and links back to the demo start", () => {
    // Given
    saveDemoRole({ userId: USER, label: "집주인" });
    // When
    const html = render("/manage/x", true);
    // Then
    expect(html).toContain('aria-label="시연 안내"');
    expect(html).toContain("시연 중 · 집주인");
    expect(html).toContain('href="/demo"');
    expect(html).toContain("역할 바꾸기");
  });

  it("stays hidden outside demo mode, without a mark, signed out, or on /demo", () => {
    saveDemoRole(mark);
    expect(render("/b/x", false)).toBe("");
    expect(render("/b/x", true, false)).toBe("");
    expect(render("/demo", true)).toBe("");
    sessionStorage.clear();
    expect(render("/b/x", true)).toBe("");
  });
});

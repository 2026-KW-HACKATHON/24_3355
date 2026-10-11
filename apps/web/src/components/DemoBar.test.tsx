import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DEMO_USERS, type DemoUser } from "@wolgyeham/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { DEMO_USER_LABELS, demoBarLabel, demoEndPath } from "../features/auth/demoRole";
import { authKeys } from "../features/auth/queries";
import { testUser } from "../test/me";
import { DemoBar } from "./DemoBar";

vi.mock("../lib/api", () => ({
  getJson: vi.fn(),
  postJson: vi.fn(),
  postEmpty: vi.fn(),
  sendJsonEmpty: vi.fn(),
  http: { get: vi.fn() },
}));

const USER = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f99";

describe("demo bar condition", () => {
  it("shows the role of the signed-in demo account, in any tab", () => {
    expect(demoBarLabel({ pathname: "/b/x", demo: "demo-resident-a" })).toBe("입주자 A");
    expect(demoBarLabel({ pathname: "/b/x", demo: "demo-landlord" })).toBe("집주인");
    expect(demoBarLabel({ pathname: "/b/x", demo: "demo-resident-b" })).toBe("다음 입주자 B");
    expect(demoBarLabel({ pathname: "/b/x", demo: "demo-e2e-landlord" })).toBe("테스트빌라 집주인");
  });

  it("stays hidden for real accounts and signed-out visitors", () => {
    expect(demoBarLabel({ pathname: "/b/x", demo: null })).toBeUndefined();
    expect(demoBarLabel({ pathname: "/b/x", demo: undefined })).toBeUndefined();
  });

  it("hides on the demo start and the legal pages", () => {
    for (const pathname of ["/demo", "/demo/", "/terms", "/privacy"]) {
      expect(demoBarLabel({ pathname, demo: "demo-resident-a" })).toBeUndefined();
    }
    expect(demoBarLabel({ pathname: "/", demo: "demo-resident-a" })).toBe("입주자 A");
  });

  it("ends the demo on the public page of the building in view, otherwise the home", () => {
    expect(demoEndPath("/b/abc")).toBe("/b/abc");
    expect(demoEndPath("/b/abc/guides/g1")).toBe("/b/abc");
    expect(demoEndPath("/manage/abc/inbox")).toBe("/b/abc");
    expect(demoEndPath("/me")).toBe("/");
    expect(demoEndPath("/")).toBe("/");
  });

  it("has a label for every demo account", () => {
    for (const as of DEMO_USERS) expect(DEMO_USER_LABELS[as]).toBeTruthy();
  });
});

describe("DemoBar", () => {
  function render(pathname: string, demo: DemoUser | null | "signed-out") {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    queryClient.setQueryData(
      authKeys.me(),
      demo === "signed-out"
        ? null
        : { user: testUser(USER, { demo }), managedBuildings: [], occupancy: null },
    );
    return renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[pathname]}>
          <DemoBar />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("says which role is on and links back to the demo start", () => {
    const html = render("/manage/x", "demo-landlord");
    expect(html).toContain('aria-label="시연 안내"');
    expect(html).toContain("시연 중 · 집주인");
    expect(html).toContain('href="/demo"');
    expect(html).toContain("역할 바꾸기");
    expect(html).toContain("시연 끝내기");
  });

  it("stays hidden for a real account, signed out, or on /demo", () => {
    expect(render("/b/x", null)).toBe("");
    expect(render("/b/x", "signed-out")).toBe("");
    expect(render("/demo", "demo-resident-a")).toBe("");
  });
});

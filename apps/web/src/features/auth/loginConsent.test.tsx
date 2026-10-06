import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { allAgreed, ConsentChecks, NO_CONSENT } from "./ConsentChecks";
import { CONSENT_DOCS } from "./ConsentSheet";
import { LoginConsentPanel, loginConsentStep } from "./LoginConsent";

// SEED 컴포넌트는 CSS를 함께 불러와 node에서 읽을 수 없어, 글자와 disabled만 남기는 대역으로 바꿉니다.
vi.mock("@seed-design/react", () => ({
  ActionButton: ({
    children,
    disabled,
    asChild,
  }: {
    children?: React.ReactNode;
    disabled?: boolean;
    asChild?: boolean;
  }) =>
    asChild ? (
      children
    ) : (
      <button type="button" disabled={disabled}>
        {children}
      </button>
    ),
}));

describe("consent before every login (D-28)", () => {
  it("asks first unless the screen already asked or the account already agreed", () => {
    // 16처럼 화면 안에서 받은 판은 그대로 보냅니다.
    expect(loginConsentStep("2026-09-30-draft", false)).toEqual({
      ask: false,
      consent: "2026-09-30-draft",
    });
    // 지금 판에 이미 동의한 계정(다시 로그인)은 묻지 않고, 판도 다시 보내지 않습니다.
    expect(loginConsentStep(undefined, true)).toEqual({ ask: false, consent: undefined });
    // 그 밖(로그인 전·동의 전)은 동의 단계를 먼저 엽니다.
    expect(loginConsentStep(undefined, false)).toEqual({ ask: true });
  });

  it("needs both required items", () => {
    expect(allAgreed(NO_CONSENT)).toBe(false);
    expect(allAgreed({ terms: true, privacy: false })).toBe(false);
    expect(allAgreed({ terms: true, privacy: true })).toBe(true);
  });

  it("shows the two required checks with a way to read each one", () => {
    const html = renderToStaticMarkup(
      <ConsentChecks value={NO_CONSENT} onChange={() => undefined} onView={() => undefined} />,
    );
    expect(html).toContain("모두 동의해요");
    expect(html).toContain(`aria-label="${CONSENT_DOCS.terms.label} 보기"`);
    expect(html).toContain(`aria-label="${CONSENT_DOCS.privacy.label} 보기"`);
    expect(html.match(/type="checkbox"/g)).toHaveLength(3);
    expect(html.match(/필수/g)).toHaveLength(2);
  });

  it("keeps the continue button off until both items are checked", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LoginConsentPanel
          agreeLabel="동의하고 계속하기"
          onAgree={() => undefined}
          onCancel={() => undefined}
        />
      </MemoryRouter>,
    );
    expect(html).toContain("로그인 전에 확인해 주세요");
    expect(html).toMatch(/<button type="button" disabled="">동의하고 계속하기<\/button>/);
    expect(html).toContain("필수 항목에 동의하면 계속할 수 있어요");
    expect(html).toContain("로그인하지 않아도 건물 안내는 볼 수");
  });
});

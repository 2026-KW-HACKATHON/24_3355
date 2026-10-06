import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TERMS_VERSION } from "@wolgyeham/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PRIVACY_DOC } from "../../content/terms/privacy";
import { TERMS_DOC } from "../../content/terms/terms";
import { termsEffectiveDate } from "../../content/terms/version";
import { CONSENT_DOCS } from "../../features/auth/ConsentSheet";
import { Component as LegalScreen } from "./route";

vi.mock("@seed-design/react", () => ({
  Snackbar: { AvoidOverlap: ({ children }: { children?: unknown }) => children },
}));

function render(path: string) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/terms" element={<LegalScreen />} />
        <Route path="/privacy" element={<LegalScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("terms and privacy drafts (D-28)", () => {
  it("marks both pages as drafts before legal review with the effective date", () => {
    for (const path of ["/terms", "/privacy"]) {
      const html = render(path);
      expect(html).toContain("초안 · 법률 검토 전");
      expect(html).toContain(`시행일 ${termsEffectiveDate()} · 판 ${TERMS_VERSION}`);
    }
    expect(termsEffectiveDate("2026-09-30-draft")).toBe("2026년 9월 30일");
  });

  it("renders every section and links to the other document", () => {
    // When
    const terms = render("/terms");
    const privacy = render("/privacy");
    // Then
    for (const section of TERMS_DOC.sections) expect(terms).toContain(section.heading);
    for (const section of PRIVACY_DOC.sections) expect(privacy).toContain(section.heading);
    expect(terms).toContain('href="/privacy"');
    expect(privacy).toContain('href="/terms"');
  });

  it("states what is stored and what is not, as the API does", () => {
    const privacy = render("/privacy");
    expect(privacy).toContain("카카오 회원번호");
    expect(privacy).toContain("이름, 닉네임, 전화번호, 이메일, 프로필 사진은 저장하지 않아요");
    expect(privacy).toContain("길어도 로그인한 때부터 90일");
    expect(privacy).toContain("30일 동안 쓸 수 있어요");
    expect(privacy).toContain("해시만 저장해요");
    expect(privacy).toContain("AWS 서울 리전");
    expect(privacy).toContain("Apple, Google, Mozilla, Microsoft");
  });

  it("does not claim certification or legal compliance", () => {
    const all = `${render("/terms")}${render("/privacy")}`;
    for (const claim of ["인증을 받", "ISMS", "준수합니다", "완벽", "안전을 보장"]) {
      expect(all).not.toContain(claim);
    }
  });

  it("uses the team contact address only when it is set", () => {
    // Given
    const without = render("/privacy");
    vi.stubEnv("VITE_TEAM_CONTACT_URL", "mailto:team@example.com");
    // When
    const withContact = render("/privacy");
    // Then
    expect(without).toContain("문의 창구는 정식 서비스 전에 이 자리에 적어요");
    expect(withContact).toContain('href="mailto:team@example.com"');
  });

  it("ignores a contact value that is not a web or mail address", () => {
    vi.stubEnv("VITE_TEAM_CONTACT_URL", "javascript:alert(1)");
    expect(render("/terms")).not.toContain("javascript:");
  });
});

/** 앱 코드(테스트 제외)가 브라우저 저장소에 쓰는 키 이름(`wh.` 뒤 첫 이름). */
function storageKeysInCode(): string[] {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const keys = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        for (const match of readFileSync(path, "utf8").matchAll(/["'`](wh\.[A-Za-z]+)/g)) {
          if (match[1]) keys.add(match[1]);
        }
      }
    }
  };
  walk(root);
  return [...keys].sort();
}

describe("privacy draft matches what the code does", () => {
  it("lists every key this app keeps in the browser", () => {
    // Given
    const privacy = render("/privacy");
    const keys = storageKeysInCode();
    // Then
    expect(keys.length).toBeGreaterThan(10);
    for (const key of keys) expect(privacy, key).toContain(`(${key}`);
  });

  it("says precisely which part of the connection is HTTPS", () => {
    const privacy = render("/privacy");
    expect(privacy).toContain("CloudFront에서 서버까지 모두 HTTPS로 암호화해요");
    expect(privacy).toContain("원본 확인 헤더가 맞는 요청만 받아요");
    expect(privacy).not.toContain("아직 HTTPS가 아니어서");
  });

  it("names Kakao once, consistently, including what the team relays over KakaoTalk", () => {
    const privacy = render("/privacy");
    expect(privacy).toContain("카카오에 회원번호만 요청하고");
    expect(privacy).toContain("카카오톡으로 집주인에게 전할 수 있어요");
    // 로그인에 한정하지 않고 ‘카카오에 보내는 개인정보는 없다’고 쓰면 카카오톡 전달과 어긋납니다.
    expect(privacy).toContain("로그인을 위해 월계함이 카카오에 따로 보내는 개인정보는 없어요");
    expect(privacy).not.toContain("회원번호를 알려 주고, 월계함이 카카오에 따로 보내는");
    expect(privacy).toContain("푸시 서비스의 서버는 나라 밖에 있을 수 있어요");
    expect(privacy).not.toContain("jsDelivr");
  });

  it("describes sessions, cleanup and logout the way the server and the web do them", () => {
    const privacy = render("/privacy");
    expect(privacy).toContain("해시와 만든 시각, 마지막으로 쓴 시각, 만료 시각을 저장해요");
    expect(privacy).toContain("한 번에 100개까지");
    expect(privacy).toContain("로그아웃 요청에 함께 보내 서버에서도 지우고");
    expect(privacy).toContain("관리자 운영 절차에 따라 매일 만들어 14일 보관");
  });

  it("keeps the consent summary to what the privacy draft says", () => {
    const summary = CONSENT_DOCS.privacy.items.join(" ");
    expect(summary).toContain("카카오에는 회원번호만 요청해요");
    expect(summary).toContain("이름·전화번호·프로필 사진은 저장하지 않아요");
    expect(summary).toContain("30일(길어도 90일)");
    expect(summary).toContain("동의하지 않을 수 있어요");
    expect(summary).toContain("로그인 없이 할 수 있어요");
  });

  it("does not promise a restriction the service cannot enforce", () => {
    const terms = render("/terms");
    expect(terms).not.toContain("이용을 막을 수 있어요");
    expect(terms).toContain("계정 이용을 멈추는 기능은 아직 없고");
    expect(terms).toContain("바뀐 점을 짧게 보여 드리며");
  });
});

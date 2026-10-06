import { type Me, TERMS_VERSION } from "@wolgyeham/contracts";

/** 지금 판 약관에 동의한 로그인 사용자(`/api/me`의 `user`). 다시 동의 시트가 뜨지 않습니다. */
export function testUser(id: string, overrides: Partial<Me["user"]> = {}): Me["user"] {
  return {
    id,
    termsVersion: TERMS_VERSION,
    termsAgreedAt: "2026-09-30T00:00:00.000Z",
    termsUpToDate: true,
    ...overrides,
  };
}

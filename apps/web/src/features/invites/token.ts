// 초대 토큰은 웹 주소의 #t= 뒤에만 두고, 로그인을 거치는 동안 sessionStorage에 옮겨 둡니다(frontend.md §5).
const KEY = "wh.inviteToken";

export function readInviteHash(hash: string): string | undefined {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("t")?.trim();
  return token ? token : undefined;
}

export function stashInviteToken(token: string) {
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    // 저장하지 못하면 주소의 토큰만 씁니다.
  }
}

export function loadInviteToken(): string | undefined {
  try {
    return sessionStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function clearInviteToken() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // 무시
  }
}

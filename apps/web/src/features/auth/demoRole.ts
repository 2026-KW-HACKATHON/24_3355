// 시연 중 표시(components/DemoBar). 시연 시작(29)에서 역할을 고르면 이 탭에 그 계정과 역할 이름을 남기고,
// 로그아웃하면 지웁니다. 내 정보(`/api/me`)에는 시연 계정인지 담기지 않아 이 표시로 구분합니다.
const KEY = "wh.demoRole";

/** 29에서 고른 시연 계정(`userId`)과 막대에 적을 역할 이름. */
export type DemoRoleMark = { userId: string; label: string };

export function saveDemoRole(mark: DemoRoleMark) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(mark));
  } catch {
    // 저장소를 쓸 수 없으면 막대 없이 둘러봅니다.
  }
}

export function readDemoRole(): DemoRoleMark | undefined {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    if (typeof value !== "object" || value === null) return undefined;
    const { userId, label } = value as Record<string, unknown>;
    return typeof userId === "string" && typeof label === "string" && label
      ? { userId, label }
      : undefined;
  } catch {
    return undefined;
  }
}

export function clearDemoRole() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // 저장소를 쓸 수 없으면 지울 것도 없습니다.
  }
}

/** 막대를 숨기는 화면: 시연 시작 자체와 약관·개인정보 처리방침. */
const HIDDEN_PATHS = new Set(["/demo", "/terms", "/privacy"]);

/**
 * 시연 중 막대에 적을 역할 이름. 시연 모드(GET /api/dev/login 204)이고, 지금 로그인한 계정이 29에서 고른 그 시연
 * 계정일 때만 돌려줍니다. 같은 탭에서 카카오로 다른 계정에 로그인했으면 계정이 달라 숨깁니다.
 */
export function demoBarLabel({
  pathname,
  available,
  userId,
  mark,
}: {
  pathname: string;
  available: boolean | undefined;
  userId: string | undefined;
  mark: DemoRoleMark | undefined;
}): string | undefined {
  if (!available || !userId || !mark || mark.userId !== userId) return undefined;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return HIDDEN_PATHS.has(path) ? undefined : mark.label;
}

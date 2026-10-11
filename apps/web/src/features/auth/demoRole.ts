import type { DemoUser, Me } from "@wolgyeham/contracts";

// 시연 중 표시(components/DemoBar). 내 정보(`/api/me`)의 `user.demo`가 시연 계정이면 어느 탭에서든 보입니다(D-35).

/** 시연 계정마다 막대에 적을 역할 이름. 29의 역할 카드(api `DEMO_ACCOUNTS`의 `label`)와 같은 이름입니다. */
export const DEMO_USER_LABELS: Readonly<Record<DemoUser, string>> = {
  "demo-resident-a": "입주자 A",
  "demo-landlord": "집주인",
  "demo-resident-b": "다음 입주자 B",
  "demo-e2e-landlord": "테스트빌라 집주인",
};

/** 막대를 숨기는 화면: 시연 시작 자체와 약관·개인정보 처리방침. */
const HIDDEN_PATHS = new Set(["/demo", "/terms", "/privacy"]);

/**
 * 시연 중 막대에 적을 역할 이름. 지금 로그인한 계정이 시연 계정(`Me.user.demo`)일 때만 돌려줍니다. 카카오로
 * 로그인한 실제 계정(null)이나 로그인 전(undefined)이면 숨깁니다.
 */
export function demoBarLabel({
  pathname,
  demo,
}: {
  pathname: string;
  demo: DemoUser | null | undefined;
}): string | undefined {
  if (!demo) return undefined;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return HIDDEN_PATHS.has(path) ? undefined : DEMO_USER_LABELS[demo];
}

/**
 * ‘시연 끝내기’ 뒤에 갈 곳. 건물 화면(`/b/:id…`)과 관리 화면(`/manage/:id…`)은 그 건물의 공개 화면, 그 밖은 첫 화면.
 */
export function demoEndPath(pathname: string): string {
  const match = /^\/(?:b|manage)\/([^/?#]+)/.exec(pathname);
  return match?.[1] ? `/b/${match[1]}` : "/";
}

/**
 * 서버가 시연 계정의 실제 건물 초대 수락·연결을 거절한 경우(403 `FORBIDDEN`, `fields.account = "demo"`).
 * 보통은 실제 건물 화면을 열 때 시연을 먼저 끝내므로(`useEndDemoOn`) 그 로그아웃이 실패했을 때만 보입니다.
 */
export const DEMO_ACCOUNT_BLOCKED =
  "시연 계정으로 로그인돼 있어요. 내 정보에서 로그아웃한 뒤 카카오로 다시 로그인해 주세요";

export function isDemoAccountBlocked(error: {
  code: string;
  fields: Readonly<Record<string, string>>;
}) {
  return error.code === "FORBIDDEN" && error.fields["account"] === "demo";
}

export const DEMO_ENDED_TOAST = "시연을 마치고 실제 건물로 들어왔어요";

/** 시연인지를 가르는 건물(`PublicBuilding`·`ManagerInvitePreview`의 `demo`). */
export type DemoTarget = { demo: boolean };

/**
 * 시연을 끝낼지. 내 정보를 받은 뒤(로딩·오류면 `me`는 undefined), 시연 계정이고, 연 건물이 실제 건물일 때만 true.
 * 이번 실행에서 로그아웃에 실패한 계정(`failedUserIds`)은 다시 시도하지 않습니다(되풀이 방지, 서버 403 문구가 남음).
 */
export function shouldEndDemo({
  me,
  building,
  failedUserIds,
}: {
  me: Me | null | undefined;
  building: DemoTarget | undefined;
  failedUserIds: ReadonlySet<string>;
}): boolean {
  if (!me?.user.demo || !building || building.demo) return false;
  return !failedUserIds.has(me.user.id);
}

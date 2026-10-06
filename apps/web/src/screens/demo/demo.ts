// LF-20 시연 시작(29)의 판단과 요청. 화면(route.tsx)과 나눠 테스트합니다.
import type { QueryClient } from "@tanstack/react-query";
import {
  type DemoAccount,
  DemoOverview,
  type DemoResetBody,
  DemoResetResult,
  type Me,
  type ReportStatus,
} from "@wolgyeham/contracts";
import { authKeys } from "../../features/auth/queries";
import { clearMemoDraft } from "../../features/guides/memoDraft";
import { clearInviteToken } from "../../features/invites/token";
import { clearConnectDraft } from "../../features/occupancy/connectDraft";
import { REPORT_STATUS } from "../../features/reports/labels";
import { clearTipDraft } from "../../features/tips/tipDraft";
import { getJson, postJson } from "../../lib/api";
import { toAppError } from "../../lib/errors";
import { loadReportAccess, readReportHash, removeReportAccess } from "../../lib/reportAccess";

export const demoKey = ["dev", "demo"] as const;

/** 시연 모드가 아니면(경로 없음 404) null. 그 밖의 실패는 오류로 던집니다. */
export async function fetchDemoOverview(): Promise<DemoOverview | null> {
  try {
    return await getJson("/api/dev/demo", DemoOverview);
  } catch (error) {
    if (toAppError(error).code === "NOT_FOUND") return null;
    throw error;
  }
}

export function resetDemo(body: DemoResetBody = {}) {
  return postJson("/api/dev/reset", body, DemoResetResult);
}

/** 29에 보이는 카드. 시연 계정과, 로그인하지 않고 제보를 보낸 옆 건물 주민(비회원, `statusPath`로 상태를 봄). */
export type DemoRole =
  | { kind: "account"; account: DemoAccount }
  | { kind: "guest"; statusPath: string };

/** 시드한 비회원 제보의 상태 주소(`/r/<id>#t=<token>`). 같은 사이트 경로가 아니면 쓰지 않습니다. */
function guestStatusPath(overview: DemoOverview): string | undefined {
  const path = overview.guestReport?.statusPath;
  return path?.startsWith("/r/") ? path : undefined;
}

/** 비회원 카드가 여는 제보의 id와 확인 토큰(`/r/<id>#t=<token>`). 카드에 지금 상태를 적으려고 읽습니다. */
export function guestReportRef(
  overview: DemoOverview,
): { reportId: string; token: string } | undefined {
  const path = guestStatusPath(overview);
  if (!path) return undefined;
  const [pathname = "", hash = ""] = path.split("#");
  let reportId: string;
  try {
    reportId = decodeURIComponent(pathname.slice("/r/".length));
  } catch {
    return undefined;
  }
  const token = readReportHash(hash);
  return reportId && token ? { reportId, token } : undefined;
}

// lofi 29 순서: 입주자 A, 옆 건물 주민, 집주인, 다음 입주자 B. 모르는 계정은 뒤에 붙입니다.
const ORDER = ["demo-resident-a", "guest", "demo-landlord", "demo-resident-b"];

/** 끝까지 해보는 테스트(e2e) 계정은 숨기고, 비회원 제보가 없으면(기한 지남 등) 옆 건물 주민도 숨깁니다. */
export function demoRoles(overview: DemoOverview): DemoRole[] {
  const roles: DemoRole[] = overview.accounts
    .filter((account) => account.purpose === "demo")
    .map((account) => ({ kind: "account", account }));
  const statusPath = guestStatusPath(overview);
  if (statusPath) roles.push({ kind: "guest", statusPath });
  const rank = (role: DemoRole) => {
    const index = ORDER.indexOf(role.kind === "guest" ? "guest" : role.account.as);
    return index === -1 ? ORDER.length : index;
  };
  return roles.sort((a, b) => rank(a) - rank(b));
}

/** 발표에 쓰는 건물: 시연용이고 열린(공개 안내가 있는) 첫 건물(햇살빌라). */
export function demoHomeBuilding(overview: DemoOverview) {
  const demo = overview.buildings.filter((building) => building.purpose === "demo");
  return demo.find((building) => building.status === "open") ?? demo[0];
}

function occupancyLabel(status: string, requested: boolean): string {
  if (status === "reconfirm_needed") return "거주 확인 필요";
  return requested ? "거주 확인 요청됨" : "거주 중";
}

/**
 * 카드 아래 한 줄. 숫자는 응답에서 셉니다. 비회원 카드는 그 제보를 확인 토큰으로 읽은 상태(`guestStatus`)가 있으면
 * lofi 29처럼 “제보 1건 접수됨”으로 적고, 아직 모르면(불러오는 중·실패) 상태 없이 적습니다.
 */
export function roleSubtitle(
  role: DemoRole,
  overview: DemoOverview,
  guestStatus?: ReportStatus,
): string {
  if (role.kind === "guest") {
    return guestStatus
      ? `비회원 · 제보 1건 ${REPORT_STATUS[guestStatus].label}`
      : "비회원 · 보낸 제보 1건";
  }
  const { account } = role;
  if (account.role === "landlord") {
    const todo = account.pendingMemoCount + account.newReportCount;
    const names = account.buildings.map((building) => building.name).join("·");
    return [names, todo > 0 ? `확인할 것 ${todo}건` : "확인할 것 없음"].filter(Boolean).join(" · ");
  }
  if (!account.occupancy) {
    const code = demoHomeBuilding(overview)?.joinCode;
    return code ? `아직 연결 전 · 가입코드 ${code}` : "아직 연결 전";
  }
  const { occupancy } = account;
  const home = demoHomeBuilding(overview);
  return [
    occupancy.buildingId === home?.id ? undefined : occupancy.buildingName,
    occupancyLabel(occupancy.status, occupancy.reconfirmRequested),
    `팁 ${account.tipCount}개`,
    `메모 ${account.memoCount}개`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * 역할을 고른 뒤 첫 화면. 집주인은 관리 홈, 연결한 거주자는 거주자 홈(같은 `/b/:id`), 연결 전 B는 시연 건물
 * 공개 화면(연결하기가 보임), 비회원은 보낸 제보의 상태(30·06·31). 로그인 응답(`me`)을 먼저 봅니다.
 */
export function demoDestination(role: DemoRole, me: Me | null, overview: DemoOverview): string {
  const home = demoHomeBuilding(overview);
  const publicHome = home ? `/b/${home.id}` : "/";
  if (role.kind === "guest") return role.statusPath;
  const managed =
    me?.managedBuildings[0] ??
    (role.account.role === "landlord" ? role.account.buildings[0] : undefined);
  if (role.account.role === "landlord") return managed ? `/manage/${managed.id}` : "/me";
  const occupancy = me ? me.occupancy : role.account.occupancy;
  return occupancy ? `/b/${occupancy.buildingId}` : publicHome;
}

/** 429의 Retry-After(초)를 사람이 읽는 대기 시간으로. */
export function waitText(seconds: number | undefined): string {
  if (seconds === undefined || seconds <= 0) return "잠시 뒤에";
  if (seconds < 60) return `${Math.ceil(seconds)}초 뒤에`;
  return `${Math.ceil(seconds / 60)}분 뒤에`;
}

/**
 * 시연 건물을 되돌린 뒤 이 기기에 남은 그 건물의 흔적을 지웁니다: 첫 방문 표시(함이가 다시 보이게), 비회원 제보 확인
 * 링크(제보가 지워짐), 쓰던 안내, 가입코드·초대·메모·팁 초안. 다른 건물의 것은 두고, 저장소가 막혀도 넘어갑니다.
 */
export function clearDemoDeviceData(buildingIds: readonly string[]) {
  for (const buildingId of buildingIds) {
    removeReportAccess(loadReportAccess(buildingId).map((item) => item.token));
  }
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
    for (const key of keys) {
      if (!key) continue;
      const demoKey = buildingIds.some(
        (id) =>
          key === `wh.visited.${id}` ||
          (key.startsWith("wh.guideDraft.") && key.includes(`.${id}.`)),
      );
      if (demoKey || key === "wh.reconfirmAsked") localStorage.removeItem(key);
    }
  } catch {
    // 저장소를 쓸 수 없으면 지울 것도 없습니다.
  }
  clearConnectDraft();
  clearInviteToken();
  clearMemoDraft();
  clearTipDraft();
}

/**
 * 비회원 제보 확인 링크는 ‘이 브라우저’ 단위라, 한 기기에서 역할을 바꾸면 옆 건물 주민의 제보가 다음 역할의
 * 공개 화면에 ‘내가 보낸 내용’(30)으로 따라옵니다. 로그인하는 역할로 바꿀 때 시연 건물의 링크만 지웁니다.
 */
export function forgetDemoGuestLinks(overview: DemoOverview) {
  for (const building of overview.buildings) {
    if (building.purpose !== "demo") continue;
    removeReportAccess(loadReportAccess(building.id).map((item) => item.token));
  }
}

/**
 * ‘처음 상태로’(POST /api/dev/reset). 서버는 발표 시연 건물 두 곳(햇살빌라·새봄하우스)만 되돌리고 되돌린 건물을
 * 돌려줍니다. 그 건물들의 안내·공지·팁·연결이 바뀌었으므로 이 기기의 그 건물 흔적과 받아 둔 캐시를 비웁니다
 * (e2e 건물의 흔적은 둠). 이 화면이 보는 시연 목록과 내 정보(로그인은 그대로, 연결은 바뀌었을 수 있음)만
 * 다시 받습니다. 결과를 모르는 실패(연결 끊김)에도 목록을 새로 받아 지금 상태를 보여줍니다.
 */
export function demoResetMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: () => resetDemo(),
    onSuccess: async (result: DemoResetResult) => {
      clearDemoDeviceData(result.buildings.map((building) => building.id));
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== "dev" && query.queryKey[0] !== "me",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: demoKey }),
        queryClient.invalidateQueries({ queryKey: authKeys.me() }),
      ]);
    },
    onError: (error: unknown) => {
      if (toAppError(error).code === "NETWORK") {
        void queryClient.invalidateQueries({ queryKey: demoKey });
      }
    },
  };
}

/** 되돌리기 실패 문구. 여러 사람이 함께 쓰는 주소라 30초에 한 번·시간당 20번으로 제한됩니다(429 + Retry-After). */
export function resetErrorMessage(error: unknown): string {
  const appError = toAppError(error);
  if (appError.code === "RATE_LIMITED") {
    return `조금 전에 되돌렸어요. ${waitText(appError.retryAfterSeconds)} 다시 할 수 있어요`;
  }
  if (appError.code === "NETWORK") {
    return "되돌렸는지 확인하지 못했어요. 목록을 새로 불러왔으니 확인한 뒤 다시 눌러 주세요";
  }
  return "되돌리지 못했어요. 잠시 뒤 다시 눌러 주세요";
}

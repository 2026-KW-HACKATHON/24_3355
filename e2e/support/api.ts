import { type APIRequestContext, expect, request, test } from "@playwright/test";
import { type DemoUser, E2E_LANDLORD, type PublicGuide, TERMS_CONSENT } from "./demo";

// 화면 테스트의 준비·확인에 쓰는 API 요청. 브라우저 쿠키와 따로 로그인하므로 화면에서 로그인한 사람과
// 섞이지 않습니다. 준비는 API로 하고, 테스트하려는 행동은 화면에서 합니다.

type Me = {
  user: { id: string };
  managedBuildings: { id: string; name: string }[];
  occupancy: {
    id: string;
    buildingId: string;
    status: "active" | "reconfirm_needed" | "inactive";
    buildingName: string;
  } | null;
};

export type ManagedMemo = {
  id: string;
  guideId: string;
  body: string;
  status: "pending" | "applied" | "kept";
  keptReason: string | null;
};

export type ManagedReportRow = {
  id: string;
  preset: string | null;
  body: string | null;
  reporterKind: "guest" | "member" | "resident";
  status: string;
  createdAt: string;
};

function baseURL(): string {
  return test.info().project.use.baseURL ?? "http://localhost:5173";
}

/**
 * 시연 사용자로 로그인한 API 요청 묶음. `Origin`을 붙여서 본문 없는 POST·DELETE도 서버의 CSRF(폼) 검사를
 * 통과합니다(브라우저 fetch와 같음). 다 쓰면 `dispose()`합니다.
 */
export async function apiAs(user: DemoUser): Promise<APIRequestContext> {
  const url = baseURL();
  const api = await request.newContext({
    baseURL: url,
    extraHTTPHeaders: { Origin: new URL(url).origin },
  });
  const response = await api.post("/api/dev/login", {
    data: { as: user, consent: TERMS_CONSENT },
  });
  expect(response.status(), `API 시연 로그인(${user})`).toBe(200);
  return api;
}

async function json<T>(response: Awaited<ReturnType<APIRequestContext["get"]>>, what: string) {
  expect(response.ok(), `${what}: ${response.status()} ${await response.text()}`).toBe(true);
  return (await response.json()) as T;
}

export async function meOf(api: APIRequestContext): Promise<Me> {
  return json<Me>(await api.get("/api/me"), "내 정보");
}

/** 집주인이 보는 지금 가입코드. 아직 없으면 새로 만듭니다(테스트빌라는 시드에 코드가 없음). */
export async function joinCodeOf(landlord: APIRequestContext, buildingId: string) {
  const current = await json<{ joinCode: { code: string } | null }>(
    await landlord.get(`/api/buildings/${buildingId}/join-code`),
    "가입코드 조회",
  );
  if (current.joinCode) return current.joinCode.code;
  const created = await json<{ code: string }>(
    await landlord.post(`/api/buildings/${buildingId}/join-code`, { data: {} }),
    "가입코드 만들기",
  );
  return created.code;
}

/** 살아 있는 연결이 있으면 이사 처리합니다(연결 전 상태가 필요한 흐름의 준비). */
export async function moveOutIfConnected(api: APIRequestContext) {
  const { occupancy } = await meOf(api);
  if (!occupancy) return;
  await json(
    await api.post(`/api/occupancies/${occupancy.id}/move-out`, { data: {} }),
    "이사 처리(준비)",
  );
}

/**
 * `user`를 이 건물 거주자(active)로 둡니다. 다른 건물과 연결돼 있으면 옮깁니다. 가입코드는 그 건물
 * 집주인 계정(`landlordUser`)으로 읽습니다.
 */
export async function ensureResident(
  user: DemoUser,
  buildingId: string,
  landlordUser: DemoUser = E2E_LANDLORD,
): Promise<APIRequestContext> {
  const api = await apiAs(user);
  const { occupancy } = await meOf(api);
  if (occupancy?.buildingId === buildingId && occupancy.status === "active") return api;
  const landlord = await apiAs(landlordUser);
  try {
    const code = await joinCodeOf(landlord, buildingId);
    const replace = occupancy && occupancy.buildingId !== buildingId ? occupancy.id : undefined;
    await json(
      await api.post(`/api/buildings/${buildingId}/occupancies`, {
        data: { code, ...(replace ? { replaceOccupancyId: replace } : {}) },
      }),
      `연결(준비, ${user})`,
    );
  } finally {
    await landlord.dispose();
  }
  return api;
}

type NewGuide = { category: string; title: string; body: string };

/** 안내를 만들고 바로 공개합니다(집주인). 흐름마다 새 안내를 써서 메모 반복 제한·상태가 섞이지 않게 합니다. */
export async function publishGuide(
  landlord: APIRequestContext,
  buildingId: string,
  guide: NewGuide,
): Promise<PublicGuide> {
  const draft = await json<PublicGuide>(
    await landlord.post(`/api/buildings/${buildingId}/guides`, { data: guide }),
    "안내 만들기(준비)",
  );
  const result = await json<{ guide: PublicGuide }>(
    await landlord.post(`/api/guides/${draft.id}/publish`, { data: { applyMemoIds: [] } }),
    "안내 공개(준비)",
  );
  return result.guide;
}

/** 누구나 보는 공개 안내 하나(로그인 없이). */
export async function publicGuide(api: APIRequestContext, guideId: string): Promise<PublicGuide> {
  return json<PublicGuide>(await api.get(`/api/guides/${guideId}`), "공개 안내");
}

export async function revisionOf(landlord: APIRequestContext, guideId: string) {
  const { revision } = await json<{ revision: { title: string; body: string } | null }>(
    await landlord.get(`/api/guides/${guideId}/revision`),
    "수정본",
  );
  return revision;
}

export async function memosOf(landlord: APIRequestContext, buildingId: string) {
  const { memos } = await json<{ memos: ManagedMemo[] }>(
    await landlord.get(`/api/buildings/${buildingId}/correction-memos`),
    "메모 목록",
  );
  return memos;
}

export async function writeMemo(resident: APIRequestContext, guideId: string, body: string) {
  return json<ManagedMemo>(
    await resident.post(`/api/guides/${guideId}/correction-memos`, { data: { body } }),
    "메모 남기기(준비)",
  );
}

export async function reportsOf(landlord: APIRequestContext, buildingId: string) {
  const { reports } = await json<{ reports: ManagedReportRow[] }>(
    await landlord.get(`/api/buildings/${buildingId}/reports`),
    "받은 내용",
  );
  return reports;
}

/** 이 사람이 이 건물에 남긴 팁을 모두 지웁니다(빈 목록 18을 보려는 준비). */
export async function deleteMyTips(resident: APIRequestContext, buildingId: string) {
  const { tips } = await json<{ tips: { id: string; mine: boolean }[] }>(
    await resident.get(`/api/buildings/${buildingId}/tips`),
    "팁 목록",
  );
  for (const tip of tips.filter((item) => item.mine)) {
    const response = await resident.delete(`/api/tips/${tip.id}`);
    expect(response.status(), "내 팁 지우기(준비)").toBe(204);
  }
  return tips.filter((item) => !item.mine).length;
}

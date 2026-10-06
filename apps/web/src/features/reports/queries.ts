import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CreateReportBody,
  CreateReportResult,
  ManagedReport,
  ManagedReportList,
  MyReportList,
  REPORT_TOKEN_HEADER,
  type Report,
  ReportDetail,
  ReportLookupResult,
  type ReportStatus,
  type ResolveReportBody,
} from "@wolgyeham/contracts";
import { useMemo, useState } from "react";
import { getJson, http, postJson, seg } from "../../lib/api";
import { toAppError } from "../../lib/errors";
import { loadReportAccess, removeReportAccess, reportPath } from "../../lib/reportAccess";
import { useMe } from "../auth/queries";
import { buildingKeys } from "../buildings/queries";

// 제보(LF-10·11·16). 보낸 사람은 계정(로그인) 또는 조회 토큰(비회원)으로, 집주인은 관리 권한으로 봅니다.

export const reportKeys = {
  /** 보낸 사람이 보는 제보 하나(06·31). 토큰마다 결과가 달라(틀린 토큰은 404) 토큰도 키에 둡니다(메모리 안). */
  detail: (reportId: string, token: string | null | undefined) =>
    ["reports", reportId, token ?? null] as const,
  /** 이 브라우저에 보관한 토큰으로 다시 찾은 제보(30). */
  lookup: (buildingId: string) => ["reports", "lookup", buildingId] as const,
  /** 이 계정으로 보낸 제보(21). 계정마다 다르므로 사용자 id를 키에 둡니다. */
  mine: (userId: string) => ["reports", "mine", userId] as const,
  /** 집주인: 받은 내용 목록·하나. 관리 캐시(`manage`) 아래라 로그아웃 때 함께 지워집니다. */
  building: (buildingId: string, status?: ReportStatus) =>
    ["manage", "buildings", buildingId, "reports", status ?? "all"] as const,
  managed: (reportId: string) => ["manage", "reports", reportId] as const,
};

/** 제보 하나. 토큰은 `X-Report-Token` 헤더로만 보냅니다(주소·쿼리에 넣지 않음). */
async function fetchReport(reportId: string, token?: string) {
  try {
    return await http
      .get(
        `/api/reports/${seg(reportId)}`,
        token ? { headers: { [REPORT_TOKEN_HEADER]: token } } : {},
      )
      .json(ReportDetail);
  } catch (error) {
    throw toAppError(error);
  }
}

/** 보낸 사람 화면(06·31). 토큰이 없으면 로그인한 계정으로 봅니다. 만료는 410 REPORT_LINK_EXPIRED. */
export function useReport(reportId: string, token: string | undefined, enabled = true) {
  return useQuery({
    queryKey: reportKeys.detail(reportId, token),
    queryFn: () => fetchReport(reportId, token),
    enabled,
  });
}

/** 집주인 화면(07·35). 같은 주소를 관리 권한으로 봅니다(`viewer: "manager"`). */
export function useManagedReport(reportId: string) {
  return useQuery({
    queryKey: reportKeys.managed(reportId),
    queryFn: () => fetchReport(reportId),
  });
}

/** 집주인에게 알리기(20·05). 자동으로 다시 보내지 않습니다. */
export function useCreateReport(buildingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateReportBody) =>
      postJson(`/api/buildings/${seg(buildingId)}/reports`, body, CreateReportResult),
    onSuccess: (result) => {
      // 접수 화면(06)이 다시 불러오지 않고 바로 그리도록 넣어 둡니다.
      const detail: ReportDetail = {
        ...result.report,
        viewer: "reporter",
        reporterKind: null,
        accessExpiresAt: result.accessExpiresAt,
      };
      queryClient.setQueryData(reportKeys.detail(result.report.id, result.accessToken), detail);
      void queryClient.invalidateQueries({ queryKey: reportKeys.lookup(buildingId) });
      void queryClient.invalidateQueries({ queryKey: ["reports", "mine"] });
    },
  });
}

/** 이 계정으로 보낸 제보(모든 건물, 최근 순). 로그인하지 않았으면 부르지 않습니다. */
export function useMyReports(userId: string | undefined) {
  return useQuery({
    queryKey: reportKeys.mine(userId ?? ""),
    queryFn: () => getJson("/api/me/reports", MyReportList),
    select: (data) => data.reports,
    enabled: Boolean(userId),
  });
}

export type FoundReport = { report: Report; token: string | null };

/**
 * 보관한 토큰으로 이 건물의 제보를 다시 찾습니다. 응답에서 null인 자리(없음·만료·다른 건물)의 토큰은 지웁니다.
 * 연결 문제로 실패하면 지우지 않습니다.
 */
async function lookupStored(buildingId: string): Promise<FoundReport[]> {
  const stored = loadReportAccess(buildingId);
  if (stored.length === 0) return [];
  const tokens = stored.map((item) => item.token);
  const result = await postJson(
    `/api/buildings/${seg(buildingId)}/reports/lookup`,
    { tokens },
    ReportLookupResult,
  );
  const found: FoundReport[] = [];
  const gone: string[] = [];
  tokens.forEach((token, index) => {
    const report = result.reports[index];
    if (report) found.push({ report, token });
    else gone.push(token);
  });
  removeReportAccess(gone);
  return found;
}

/**
 * 재방문 배너(30)용: 이 건물에 내가 보낸 제보. 이 브라우저의 토큰(비회원) + 로그인했으면 이 계정으로 보낸 것.
 * 최근에 보낸 순서이고, `path`는 상태 화면(06·31) 주소입니다(토큰은 `#` 뒤).
 * 배너가 나중에 끼어들며 아래 내용이 밀리지 않게(CLS) 조회하는 동안 자리를 잡아 둘지 알려 줍니다.
 * `expected`: 이 브라우저에 이 건물 토큰이 있는데 아직 조회 중(크게 보기·안내 없음 화면이 씀).
 * `reserve`: 토큰 조회 중이거나, 로그인한 계정의 보낸 내용(`/me/reports`)을 아직 모름(기본 공개 화면 30이 씀).
 */
export function useMyReportsForBuilding(buildingId: string) {
  const me = useMe();
  const [hadTokens] = useState(() => buildingId !== "" && loadReportAccess(buildingId).length > 0);
  const userId = me.data?.user.id;
  const lookup = useQuery({
    queryKey: reportKeys.lookup(buildingId),
    queryFn: () => lookupStored(buildingId),
    enabled: buildingId !== "",
  });
  const mine = useMyReports(userId);
  const items = useMemo(() => {
    const byId = new Map<string, { report: Report; path: string }>();
    for (const { report, token } of lookup.data ?? []) {
      byId.set(report.id, { report, path: reportPath(report.id, token) });
    }
    for (const report of mine.data ?? []) {
      if (report.buildingId !== buildingId || byId.has(report.id)) continue;
      byId.set(report.id, { report, path: reportPath(report.id) });
    }
    return [...byId.values()].sort((a, b) => b.report.createdAt.localeCompare(a.report.createdAt));
  }, [buildingId, lookup.data, mine.data]);
  const accountPending = Boolean(userId) && mine.isPending;
  const isPending = lookup.isPending || accountPending;
  return {
    items,
    isPending,
    expected: hadTokens && isPending,
    reserve: (hadTokens && lookup.isPending) || accountPending,
  };
}

/** 집주인: 받은 내용(최근 순 200건). 관리 홈 ‘확인할 것’은 `received`. */
export function useBuildingReports(buildingId: string, status?: ReportStatus, enabled = true) {
  const query = status ? `?status=${status}` : "";
  return useQuery({
    queryKey: reportKeys.building(buildingId, status),
    queryFn: () => getJson(`/api/buildings/${seg(buildingId)}/reports${query}`, ManagedReportList),
    select: (data) => data.reports,
    enabled,
  });
}

function useManagedReportUpdate() {
  const queryClient = useQueryClient();
  return (report: ManagedReport) => {
    queryClient.setQueryData<ReportDetail>(reportKeys.managed(report.id), (old) =>
      old ? { ...old, ...report } : { ...report, viewer: "manager", accessExpiresAt: null },
    );
    // 받은 내용 목록과 관리 홈의 확인 전 수(newReportCount)를 다시 받습니다.
    void queryClient.invalidateQueries({ queryKey: buildingKeys.managedList() });
  };
}

/** ‘확인했어요’(07): received → acknowledged. 이미 바뀌었으면 409 CONFLICT. */
export function useAcknowledgeReport(reportId: string) {
  const update = useManagedReportUpdate();
  return useMutation({
    mutationFn: () =>
      postJson(`/api/reports/${seg(reportId)}/acknowledge`, undefined, ManagedReport),
    onSuccess: update,
  });
}

/** 처리 결과 저장(35): acknowledged → completed | unable, 보낸 분께 한 줄(선택). */
export function useResolveReport(reportId: string) {
  const update = useManagedReportUpdate();
  return useMutation({
    mutationFn: (body: ResolveReportBody) =>
      postJson(`/api/reports/${seg(reportId)}/resolve`, body, ManagedReport),
    onSuccess: update,
  });
}

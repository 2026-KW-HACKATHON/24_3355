// LF-16 받은 내용 탭 · 알린 상황(07·35로 이어짐, 알림 32의 도착 자리)과 확인 전 안내 수정 메모(25). 탭 `받은 내용`
// 열어보기만 해서는 ‘확인함’이 되지 않습니다. 집주인 업무 화면이라 함이를 넣지 않습니다.
import type { ManagedBuildingDetail, ManagedReport } from "@wolgyeham/contracts";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router";
import { Icon } from "../../components/Icon";
import { Screen, TopBar } from "../../components/Screen";
import { Delayed, EmptyState, LoadError, SkeletonLines } from "../../components/ScreenState";
import { LandlordTabs } from "../../components/TabBar";
import { ManagerGate } from "../../features/auth/ManagerGate";
import { useBuildingMemos } from "../../features/guides/memos";
import {
  formatReportTime,
  REPORT_KIND_LABEL,
  REPORTER_KIND,
  reportTitle,
} from "../../features/reports/labels";
import { useBuildingReports } from "../../features/reports/queries";
import { ReportListItem } from "../../features/reports/ReportParts";
import { formatDay } from "../../lib/format";
import "./landlord-inbox.css";

export function Component() {
  const { buildingId = "" } = useParams();
  return <ManagerGate buildingId={buildingId}>{(detail) => <Inbox detail={detail} />}</ManagerGate>;
}

function reportRow(buildingId: string, report: ManagedReport) {
  return (
    <ReportListItem
      key={report.id}
      to={`/manage/${buildingId}/reports/${report.id}`}
      category={`${REPORT_KIND_LABEL[report.kind]} · ${REPORTER_KIND[report.reporterKind].label}`}
      status={report.status}
      body={reportTitle(report)}
      date={`${formatReportTime(report.createdAt)} 받음`}
    />
  );
}

function Inbox({ detail }: { detail: ManagedBuildingDetail }) {
  const buildingId = detail.building.id;
  const reports = useBuildingReports(buildingId);
  const memos = useBuildingMemos(buildingId, "pending");

  let reportSection: ReactNode;
  if (reports.isError) {
    reportSection = (
      <LoadError
        headingLevel={2}
        onRetry={() => void reports.refetch()}
        retrying={reports.isFetching}
      />
    );
  } else if (reports.isPending) {
    reportSection = (
      <Delayed label="받은 내용을 불러오는 중">
        <div className="wh-pad li-skeleton">
          <SkeletonLines lines={3} />
          <SkeletonLines lines={3} />
        </div>
      </Delayed>
    );
  } else if (reports.data.length === 0) {
    reportSection = (
      <div className="wh-pad li-empty">
        <EmptyState
          icon="inbox"
          headingLevel={2}
          title="아직 받은 내용이 없어요"
          description={"세입자가 건물 화면에서 알리면\n여기에 먼저 모여요."}
        />
      </div>
    );
  } else {
    const fresh = reports.data.filter((report) => report.status === "received");
    const rest = reports.data.filter((report) => report.status !== "received");
    reportSection = (
      <>
        <section aria-labelledby="li-new">
          <div className="wh-section-head li-head">
            <h2 id="li-new">확인할 것</h2>
            <span className="li-count">{fresh.length}건</span>
          </div>
          {fresh.length === 0 ? (
            <p className="wh-caption li-none">새로 받은 내용은 모두 확인했어요</p>
          ) : (
            <ul className="li-list">{fresh.map((report) => reportRow(buildingId, report))}</ul>
          )}
        </section>
        {rest.length > 0 ? (
          <section aria-labelledby="li-done">
            <div className="wh-section-head li-head">
              <h2 id="li-done">확인한 내용</h2>
              <span className="li-count">{rest.length}건</span>
            </div>
            <ul className="li-list">{rest.map((report) => reportRow(buildingId, report))}</ul>
          </section>
        ) : null}
      </>
    );
  }

  const pendingMemos = memos.data ?? [];

  return (
    <Screen
      tabs={<LandlordTabs buildingId={buildingId} active="inbox" />}
      busy={reports.isPending}
      topbar={
        <TopBar
          start={
            <h1 className="wh-topbar__name" tabIndex={-1}>
              받은 내용
            </h1>
          }
        />
      }
    >
      <p className="li-scope">
        <Icon name="eye-off" />
        <span>
          {detail.building.name}에 대해 알린 상황이에요. 게시되지 않고 집주인만 봐요. 보낸 사람은
          거주자·회원·비회원으로만 보여요.
        </span>
      </p>

      {reportSection}

      {memos.isError && !memos.data ? (
        // 메모 목록을 못 받았으면 ‘메모 없음’처럼 구역을 숨기지 않고 다시 시도를 둡니다(리뷰 L2).
        <section aria-labelledby="li-memos">
          <div className="wh-section-head li-head">
            <h2 id="li-memos">안내 수정 메모</h2>
          </div>
          <p className="wh-caption li-none" role="status">
            확인 전 메모를 불러오지 못했어요.{" "}
            <button
              type="button"
              className="wh-text-action"
              disabled={memos.isFetching}
              onClick={() => void memos.refetch()}
            >
              다시 시도
            </button>
          </p>
        </section>
      ) : pendingMemos.length > 0 ? (
        <section aria-labelledby="li-memos">
          <div className="wh-section-head li-head">
            <h2 id="li-memos">안내 수정 메모</h2>
            <span className="li-count">확인 전 {pendingMemos.length}건</span>
          </div>
          <ul className="li-list">
            {pendingMemos.map((memo) => (
              <li key={memo.id}>
                <Link className="li-memo" to={`/manage/${buildingId}/memos/${memo.id}`}>
                  <span className="li-memo__text">
                    <span className="li-memo__cat">
                      {memo.guideTitle} · 작성자 비공개 · {formatDay(memo.createdAt)}
                    </span>
                    <span className="li-memo__body">{memo.body}</span>
                  </span>
                  <Icon name="chevron-right" className="li-memo__chev" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Screen>
  );
}

// LF-08 내 정보 › 보낸 내용 · lofi 21. 이 계정으로 보낸 제보만(비회원 때 보낸 것은 확인 링크로).
import type { Me } from "@wolgyeham/contracts";
import type { ReactNode } from "react";
import { Icon } from "../../components/Icon";
import { BackButton, Screen, TopBar } from "../../components/Screen";
import { Delayed, EmptyState, LoadError, SkeletonLines } from "../../components/ScreenState";
import { ResidentTabs } from "../../components/TabBar";
import { SignedInPage } from "../../features/me/SignedInPage";
import { REPORT_KIND_LABEL, reportDateLine, reportTitle } from "../../features/reports/labels";
import { useMyReports } from "../../features/reports/queries";
import { ReportListItem } from "../../features/reports/ReportParts";
import { formatDay } from "../../lib/format";
import { reportPath } from "../../lib/reportAccess";
import "./sent-reports.css";

export function Component() {
  return <SignedInPage title="보낸 내용">{(me) => <SentReports me={me} />}</SignedInPage>;
}

function SentShell({
  me,
  busy = false,
  children,
}: {
  me: Me;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <Screen
      busy={busy}
      tabs={
        me.occupancy ? <ResidentTabs buildingId={me.occupancy.buildingId} active="me" /> : undefined
      }
      topbar={<TopBar start={<BackButton fallback="/me" />} title="보낸 내용" titleAs="h1" />}
    >
      <p className="sr-info">
        <Icon name="info" />
        <span>
          이 계정으로 보낸 내용만 보여요. 로그인하지 않고 보낸 내용은 확인 링크로 볼 수 있어요.
        </span>
      </p>
      {children}
    </Screen>
  );
}

function SentReports({ me }: { me: Me }) {
  const reports = useMyReports(me.user.id);
  if (reports.isError) {
    return (
      <SentShell me={me}>
        <LoadError
          headingLevel={2}
          onRetry={() => void reports.refetch()}
          retrying={reports.isFetching}
        />
      </SentShell>
    );
  }
  if (reports.isPending) {
    return (
      <SentShell me={me} busy>
        <Delayed label="보낸 내용을 불러오는 중">
          <div className="wh-pad sr-skeleton">
            <SkeletonLines lines={3} />
            <SkeletonLines lines={3} />
          </div>
        </Delayed>
      </SentShell>
    );
  }
  if (reports.data.length === 0) {
    return (
      <SentShell me={me}>
        <div className="wh-pad sr-empty">
          <EmptyState
            icon="mail"
            headingLevel={2}
            title="아직 보낸 내용이 없어요"
            description={
              "건물 화면의 ‘집주인에게 알리기’로 보내면\n여기에서 처리 상태를 볼 수 있어요."
            }
          />
        </div>
      </SentShell>
    );
  }
  return (
    <SentShell me={me}>
      <ul className="sr-list">
        {reports.data.map((report) => (
          <ReportListItem
            key={report.id}
            to={reportPath(report.id)}
            category={`${REPORT_KIND_LABEL[report.kind]} · ${report.buildingName}`}
            status={report.status}
            body={reportTitle(report)}
            date={reportDateLine(report, formatDay)}
          />
        ))}
      </ul>
    </SentShell>
  );
}

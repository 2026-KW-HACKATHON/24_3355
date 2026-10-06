// LF-11 보낸 내용과 처리 상태 · lofi 06(접수) 31(처리 완료로 표시된 뒤). 확인 링크 `/r/:reportId#t=<token>`
// 결과 상태(확인함·처리 완료·처리가 어려움)에는 함이를 넣지 않습니다. 보낸 직후 접수(06)에만 envelope.
import { ActionButton, Skeleton } from "@seed-design/react";
import { useQueryClient } from "@tanstack/react-query";
import type { ReportDetail } from "@wolgyeham/contracts";
import { type ReactNode, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router";
import { Hami } from "../../components/Hami";
import { Icon } from "../../components/Icon";
import { BackButton, Dock, Screen, TopBar } from "../../components/Screen";
import { Delayed, EmptyState, LoadError, SkeletonLines } from "../../components/ScreenState";
import { useToast } from "../../components/useToast";
import { LoginActions } from "../../features/auth/LoginActions";
import { authKeys, useMe } from "../../features/auth/queries";
import { formatReportTime, REPORT_STATUS, reportTitle } from "../../features/reports/labels";
import { useReport } from "../../features/reports/queries";
import { ReportStatusBadge } from "../../features/reports/ReportParts";
import { readReportSent } from "../../features/reports/sentState";
import { toAppError } from "../../lib/errors";
import { formatDate } from "../../lib/format";
import {
  findReportAccess,
  keepLinkToken,
  readReportHash,
  removeReportAccess,
  reportLink,
} from "../../lib/reportAccess";
import { copyText, shareOrCopy } from "../../lib/share";
import "./report-status.css";

export function Component() {
  const { reportId = "" } = useParams();
  // 다른 제보로 옮기면 주소의 토큰·보관 여부를 처음부터 다시 봅니다.
  return <ReportStatusRoute key={reportId} reportId={reportId} />;
}

function ReportStatusRoute({ reportId }: { reportId: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const hashToken = readReportHash(location.hash);
  // 주소의 `#t=`는 이 브라우저에 보관한 뒤 지웁니다. 지운 뒤에도 같은 토큰으로 보고 복사·공유합니다.
  const [linkToken, setLinkToken] = useState(hashToken);
  if (hashToken && hashToken !== linkToken) setLinkToken(hashToken);
  // 주소의 토큰이 먼저, 없으면 이 브라우저에 보관한 토큰(같은 브라우저 재조회).
  const [stored] = useState(() => findReportAccess(reportId));
  const token = hashToken ?? linkToken ?? stored?.token;
  const report = useReport(reportId, token);
  const me = useMe();
  const sent = readReportSent(location.state);

  const errorCode = report.isError ? toAppError(report.error).code : undefined;
  const gone =
    errorCode === "REPORT_LINK_EXPIRED" ||
    errorCode === "NOT_FOUND" ||
    errorCode === "VALIDATION_FAILED";

  // 더 이상 쓸 수 없는 토큰은 이 브라우저에서 지웁니다(배너 30에도 나오지 않게).
  // 토큰 없이 404면 로그인이 풀렸을 수 있어 내 정보를 다시 받습니다(풀렸으면 ‘카카오로 로그인’이 보임).
  const queryClient = useQueryClient();
  useEffect(() => {
    if (gone && token) removeReportAccess([token]);
    if (gone && !token) void queryClient.invalidateQueries({ queryKey: authKeys.me() });
  }, [gone, token, queryClient]);

  // 확인 링크의 토큰을 이 브라우저에 보관하면(보낸 직후 06은 이미 보관, 다른 브라우저는 조회가 된 뒤)
  // 주소창에서 `#t=`를 지웁니다. 보관하지 못하면(비공개 모드) 새로고침해도 볼 수 있게 그대로 둡니다.
  const data = report.data;
  useEffect(() => {
    if (!hashToken || !keepLinkToken(reportId, hashToken, data)) return;
    void navigate(
      { pathname: location.pathname, search: location.search },
      { replace: true, state: location.state, preventScrollReset: true },
    );
  }, [data, hashToken, reportId, location.pathname, location.search, location.state, navigate]);

  if (report.isError) {
    if (errorCode === "REPORT_LINK_EXPIRED") {
      return (
        <GoneState
          icon="clock"
          title="보관 기간이 지나 더 이상 확인할 수 없어요"
          description="확인 링크는 보낸 날부터 30일 동안 볼 수 있어요."
          buildingId={stored?.buildingId}
        />
      );
    }
    if (gone) {
      return (
        <GoneState
          icon="link"
          title="이 브라우저에서는 이전에 보낸 내용을 찾을 수 없어요"
          description="보관한 확인 링크를 열어 주세요."
          buildingId={stored?.buildingId}
          login={me.data === null ? `/r/${reportId}` : undefined}
        />
      );
    }
    return (
      <StatusShell close={false} home="/">
        <LoadError onRetry={() => void report.refetch()} retrying={report.isFetching} />
      </StatusShell>
    );
  }
  if (report.isPending) {
    return (
      <StatusShell close={Boolean(sent)} home="/" busy>
        <Delayed label="보낸 내용을 불러오는 중">
          <div className="wh-pad rs-skeleton">
            <Skeleton radius="8" height="24px" width="30%" />
            <Skeleton radius="8" height="32px" width="80%" />
            <Skeleton radius="16" height="200px" />
            <SkeletonLines lines={2} />
          </div>
        </Delayed>
      </StatusShell>
    );
  }
  // 집주인이 자기 건물 제보 주소를 열면 처리 화면(07·35)으로 보냅니다.
  if (report.data.viewer === "manager") {
    return <Navigate replace to={`/manage/${report.data.buildingId}/reports/${report.data.id}`} />;
  }
  // 보낸 직후 접수 화면(06)은 아직 접수됨일 때만입니다. history state가 남아 있어도 집주인이 확인·처리했으면
  // 결과 화면(31)으로 보여줍니다(리뷰 M1).
  const justSent = sent !== undefined && report.data.status === "received";
  return (
    <ReportStatus
      report={report.data}
      token={token}
      justSent={justSent}
      storeFailed={justSent && sent?.stored === false}
    />
  );
}

function StatusShell({
  close,
  home,
  busy = false,
  dock,
  children,
}: {
  /** 보낸 직후(06)는 오른쪽 닫기, 다시 볼 때(31)는 왼쪽 뒤로. */
  close: boolean;
  home: string;
  busy?: boolean;
  dock?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Screen
      busy={busy}
      dock={dock}
      topbar={
        <TopBar
          start={
            close ? (
              <span className="rs-spacer" aria-hidden="true" />
            ) : (
              <BackButton fallback={home} />
            )
          }
          title="보낸 내용"
          end={close ? <BackButton fallback={home} icon="x" label="닫기" /> : undefined}
        />
      }
    >
      {children}
    </Screen>
  );
}

/** 볼 수 없는 제보: 보관 기간이 지났거나(410) 이 브라우저에 권한이 없음(404). */
function GoneState({
  icon,
  title,
  description,
  buildingId,
  login,
}: {
  icon: "clock" | "link";
  title: string;
  description: string;
  buildingId: string | undefined;
  /** 로그인해서 보냈다면 로그인한 뒤 이 주소로 돌아옵니다. */
  login?: string | undefined;
}) {
  const home = buildingId ? `/b/${buildingId}` : "/";
  const dock = login ? (
    <LoginActions
      returnTo={login}
      label="카카오로 로그인"
      hint="로그인한 계정으로 보냈다면 로그인하면 볼 수 있어요"
      demo={{ as: "demo-resident-a", label: "시연용 거주자로 들어가기" }}
    />
  ) : buildingId ? (
    <Dock>
      <ActionButton asChild className="wh-btn wh-btn--neutral" size="large" variant="neutralWeak">
        <Link to={home}>건물로 돌아가기</Link>
      </ActionButton>
    </Dock>
  ) : undefined;
  return (
    <StatusShell close={false} home={home} dock={dock}>
      <div className="wh-pad wh-state-top">
        <EmptyState icon={icon} title={title} description={description} />
      </div>
    </StatusShell>
  );
}

const HEADLINE = {
  received: { title: "내용을 접수했어요", lead: "집주인은 아직 확인 전이에요." },
  acknowledged: {
    title: "집주인이 확인했어요",
    lead: "처리 결과를 표시하면 여기에서 볼 수 있어요.",
  },
  completed: { title: "집주인이 처리 완료로\n표시했어요", lead: "" },
  unable: { title: "집주인이 처리가 어렵다고\n표시했어요", lead: "" },
} as const;

function ReportStatus({
  report,
  token,
  justSent,
  storeFailed,
}: {
  report: ReportDetail;
  token: string | undefined;
  justSent: boolean;
  storeFailed: boolean;
}) {
  const toast = useToast();
  const [shareError, setShareError] = useState<string>();
  const home = `/b/${report.buildingId}`;
  const title = reportTitle(report);
  const headline = HEADLINE[report.status];
  // 확인 링크로 보는 사람(비회원)만 링크를 보관하게 합니다. 로그인해서 보냈으면 내 정보에서 봅니다.
  const byLink = token !== undefined && report.accessExpiresAt !== null;
  const keepLink = byLink && (justSent || report.status === "received");
  async function copy() {
    if (!token) return;
    const link = reportLink(report.id, token);
    setShareError(undefined);
    if (await copyText(link)) toast("확인 링크를 복사했어요. 본인만 보관해 주세요");
    else setShareError(`복사하지 못했어요. 이 주소를 길게 눌러 복사해 주세요: ${link}`);
  }

  async function share() {
    if (!token) return;
    const link = reportLink(report.id, token);
    setShareError(undefined);
    const outcome = await shareOrCopy({
      title: "월계함 보낸 내용",
      text: `${report.buildingName} 집주인에게 보낸 내용의 확인 링크예요. 본인만 보관해 주세요.`,
      url: link,
    });
    if (outcome === "copied")
      toast("공유 창이 없어 링크를 복사했어요. 나와의 채팅에 붙여넣어 주세요");
    if (outcome === "failed") setShareError(`공유하지 못했어요. 이 주소를 보관해 주세요: ${link}`);
  }

  const dock = keepLink ? (
    <Dock hint="나와의 채팅에 보내 두면 다시 찾기 쉬워요" error={shareError}>
      <div className="wh-btn-row">
        <ActionButton
          className="wh-btn wh-btn--neutral"
          size="large"
          variant="neutralWeak"
          onClick={() => void copy()}
        >
          <Icon name="copy" />
          링크 복사
        </ActionButton>
        <ActionButton className="wh-btn wh-grow" size="large" onClick={() => void share()}>
          <Icon name="message-circle" />
          카카오톡으로 공유
        </ActionButton>
      </div>
    </Dock>
  ) : (
    <Dock>
      <ActionButton asChild className="wh-btn wh-btn--neutral" size="large" variant="neutralWeak">
        <Link to={home}>건물로 돌아가기</Link>
      </ActionButton>
    </Dock>
  );

  return (
    <StatusShell close={justSent} home={home} dock={dock}>
      <div className="wh-pad rs-body">
        {justSent ? (
          <div className="rs-hero">
            <Hami pose="envelope" size={100} className="rs-hero__hami" eager />
            <h1 className="wh-h-title rs-hero__title" tabIndex={-1}>
              {HEADLINE.received.title}
            </h1>
            <p className="wh-small rs-hero__lead">{HEADLINE.received.lead}</p>
          </div>
        ) : (
          <div className="rs-head">
            <ReportStatusBadge status={report.status} />
            <h1 className="wh-h-title rs-head__title" tabIndex={-1}>
              {headline.title}
            </h1>
            <p className="wh-small rs-head__sub">
              {report.buildingName} · ‘{title}’
            </p>
            {headline.lead ? <p className="wh-small rs-head__lead">{headline.lead}</p> : null}
          </div>
        )}

        <Track report={report} title={justSent ? title : undefined} />

        {report.status === "completed" || report.status === "unable" ? (
          <p className="wh-note rs-foot">
            <Icon name="info" />
            <span>
              {report.status === "completed" ? "처리 완료는" : "처리가 어려움은"} 집주인이 표시한
              상태예요. 다른 불편이 있으면 다시 알려 주세요.
            </span>
          </p>
        ) : null}

        {keepLink ? (
          <section className="rs-keep" aria-labelledby="rs-keep-title">
            <h2 className="wh-field-label rs-keep__title" id="rs-keep-title">
              나중에 다시 보려면
            </h2>
            {storeFailed ? (
              <p className="rs-link rs-link--warn" role="alert">
                <Icon name="triangle-alert" />
                <span className="rs-link__text">
                  이 브라우저에 저장하지 못했어요
                  <small>아래 버튼으로 확인 링크를 꼭 복사하거나 공유해 두세요</small>
                </span>
              </p>
            ) : (
              <p className="rs-link">
                <Icon name="globe" />
                <span className="rs-link__text">
                  이 브라우저에서 다시 보기
                  <small>같은 브라우저로 QR을 다시 열면 보여요</small>
                </span>
              </p>
            )}
            <p className="rs-link">
              <Icon name="link" />
              <span className="rs-link__text">
                다른 브라우저·기기에서는 확인 링크로
                <small>
                  {report.accessExpiresAt
                    ? `${formatDate(report.accessExpiresAt)}까지 볼 수 있어요`
                    : "30일 동안 볼 수 있어요"}{" "}
                  · 본인만 보관해 주세요
                </small>
              </span>
            </p>
          </section>
        ) : justSent && !byLink ? (
          <section className="rs-keep" aria-labelledby="rs-keep-title">
            <h2 className="wh-field-label rs-keep__title" id="rs-keep-title">
              나중에 다시 보려면
            </h2>
            <Link className="rs-link rs-link--nav" to="/me/reports">
              <Icon name="user-round" />
              <span className="rs-link__text">
                내 정보 › 보낸 내용
                <small>로그인한 계정으로 보낸 내용은 여기에서 볼 수 있어요</small>
              </span>
              <Icon name="chevron-right" className="rs-link__chev" />
            </Link>
          </section>
        ) : null}
      </div>
    </StatusShell>
  );
}

/** 접수됨 → 확인함 → 처리 결과(처리 완료 | 처리가 어려움). 지금 단계에 ‘현재’를 붙입니다. */
function Track({ report, title }: { report: ReportDetail; title: string | undefined }) {
  const acknowledged = report.status !== "received";
  const resolved = report.status === "completed" || report.status === "unable";
  return (
    <ol className="rs-track" aria-label="처리 단계">
      <li className="rs-step">
        <span className="rs-step__rail" aria-hidden="true">
          <span className="rs-dot rs-dot--on">
            <Icon name="check" strokeWidth={3} />
          </span>
          <span className={acknowledged ? "rs-line rs-line--on" : "rs-line"} />
        </span>
        <div className="rs-step__body">
          <div className="rs-step__head">
            <span className="rs-step__label">접수됨</span>
            {report.status === "received" ? (
              <ReportStatusBadge status="received" label="현재" />
            ) : null}
          </div>
          <p className="rs-step__sub">
            {title ? `‘${title}’ · ` : ""}
            {formatReportTime(report.createdAt)}
          </p>
        </div>
      </li>
      <li className="rs-step">
        <span className="rs-step__rail" aria-hidden="true">
          {acknowledged ? (
            <span className="rs-dot rs-dot--on">
              <Icon name="check" strokeWidth={3} />
            </span>
          ) : (
            <span className="rs-dot rs-dot--wait" />
          )}
          <span className={resolved ? "rs-line rs-line--on" : "rs-line"} />
        </span>
        <div className="rs-step__body">
          <div className="rs-step__head">
            <span
              className={acknowledged ? "rs-step__label" : "rs-step__label rs-step__label--wait"}
            >
              확인함
            </span>
            {report.status === "acknowledged" ? (
              <ReportStatusBadge status="acknowledged" label="현재" />
            ) : null}
          </div>
          <p className="rs-step__sub">
            {report.acknowledgedAt
              ? formatReportTime(report.acknowledgedAt)
              : "집주인이 확인 버튼을 누르면 표시돼요"}
          </p>
        </div>
      </li>
      <li className="rs-step rs-step--last">
        <span className="rs-step__rail" aria-hidden="true">
          {resolved ? (
            <span
              className={
                report.status === "completed" ? "rs-dot rs-dot--done" : "rs-dot rs-dot--hard"
              }
            >
              <Icon name="check" strokeWidth={3} />
            </span>
          ) : (
            <span className="rs-dot rs-dot--wait" />
          )}
        </span>
        <div className="rs-step__body">
          {resolved ? (
            <>
              <div className="rs-step__head">
                <span className="rs-step__label">{REPORT_STATUS[report.status].label}</span>
                <ReportStatusBadge status={report.status} label="현재" />
              </div>
              {report.resolvedAt ? (
                <p className="rs-step__sub">{formatReportTime(report.resolvedAt)}</p>
              ) : null}
              {report.resultNote ? (
                <div
                  className={report.status === "completed" ? "rs-note" : "rs-note rs-note--hard"}
                >
                  <small>집주인이 남긴 말</small>
                  {report.resultNote}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <span className="rs-step__label rs-step__label--wait">처리 결과</span>
              <p className="rs-step__sub">확인 후 둘 중 하나로 표시돼요</p>
              <div className="rs-outcomes">
                <span className="rs-outcome">
                  <Icon name="circle-check" />
                  처리 완료
                </span>
                <span className="rs-outcome">
                  <Icon name="circle-alert" />
                  처리가 어려움
                </span>
              </div>
            </>
          )}
        </div>
      </li>
    </ol>
  );
}

// LF-16 받은 상황 상세 · lofi 07(확인 전) 35(처리 결과 저장). 알림 32·받은 내용 탭에서 들어옵니다.
// ‘확인함’은 버튼으로만 바뀝니다. 공지로 알리기는 빈 공지 쓰기를 열고, 제보 원문을 옮기지 않습니다.
import { ActionButton, Skeleton } from "@seed-design/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  type ManagedBuildingDetail,
  REPORT_RESULT_NOTE_MAX,
  type ReportDetail,
  type ReportResult,
} from "@wolgyeham/contracts";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { Icon } from "../../components/Icon";
import { LeaveConfirm } from "../../components/LeaveConfirm";
import { BackButton, Dock, Screen, TopBar } from "../../components/Screen";
import { Delayed, EmptyState, LoadError, SkeletonLines } from "../../components/ScreenState";
import { LandlordTabs } from "../../components/TabBar";
import { useToast } from "../../components/useToast";
import { LoginAgainButton } from "../../features/auth/LoginAgainButton";
import { ManagerGate } from "../../features/auth/ManagerGate";
import { buildingKeys } from "../../features/buildings/queries";
import {
  formatReportTime,
  REPORT_KIND_LABEL,
  REPORT_LOCATION_LABEL,
  REPORT_PRESET_COPY,
  REPORTER_KIND,
} from "../../features/reports/labels";
import {
  reportKeys,
  useAcknowledgeReport,
  useManagedReport,
  useResolveReport,
} from "../../features/reports/queries";
import { ReportStatusBadge } from "../../features/reports/ReportParts";
import { errorMessage, toAppError } from "../../lib/errors";
import { cleanText } from "../../lib/text";
import "./report-inbox.css";

export function Component() {
  const { buildingId = "" } = useParams();
  return (
    <ManagerGate buildingId={buildingId}>
      {(detail) => <ReportLoader detail={detail} />}
    </ManagerGate>
  );
}

function DetailShell({
  buildingId,
  busy = false,
  dock,
  children,
}: {
  buildingId: string;
  busy?: boolean;
  dock?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Screen
      busy={busy}
      dock={dock}
      tabs={<LandlordTabs buildingId={buildingId} active="inbox" />}
      topbar={
        <TopBar start={<BackButton fallback={`/manage/${buildingId}/inbox`} />} title="받은 내용" />
      }
    >
      {children}
    </Screen>
  );
}

function ReportLoader({ detail }: { detail: ManagedBuildingDetail }) {
  const { reportId = "" } = useParams();
  const buildingId = detail.building.id;
  const report = useManagedReport(reportId);

  if (report.isError) {
    const { code } = toAppError(report.error);
    const missing = code === "NOT_FOUND" || code === "VALIDATION_FAILED";
    return (
      <DetailShell buildingId={buildingId}>
        {missing ? (
          <div className="wh-pad wh-state-top">
            <EmptyState
              icon="inbox"
              title="이 내용을 찾을 수 없어요"
              description="주소가 잘못 열렸을 수 있어요."
            />
          </div>
        ) : (
          <LoadError onRetry={() => void report.refetch()} retrying={report.isFetching} />
        )}
      </DetailShell>
    );
  }
  if (report.isPending) {
    return (
      <DetailShell buildingId={buildingId} busy>
        <Delayed label="받은 내용을 불러오는 중">
          <div className="wh-pad ri-skeleton">
            <Skeleton radius="8" height="24px" width="40%" />
            <Skeleton radius="8" height="32px" width="80%" />
            <SkeletonLines lines={4} />
            <Skeleton radius="16" height="72px" />
          </div>
        </Delayed>
      </DetailShell>
    );
  }
  // 관리 권한은 건물마다입니다. 다른 건물의 제보면 그 건물 주소로 바꿉니다(권한은 서버가 다시 봄).
  if (report.data.buildingId !== buildingId) {
    return <Navigate replace to={`/manage/${report.data.buildingId}/reports/${report.data.id}`} />;
  }
  if (report.data.viewer !== "manager") {
    return (
      <DetailShell buildingId={buildingId}>
        <div className="wh-pad wh-state-top">
          <EmptyState icon="lock" title="이 건물을 관리할 권한이 없어요" />
        </div>
      </DetailShell>
    );
  }
  return <ReportReview report={report.data} detail={detail} />;
}

/** 쓰기 실패 문구. 이미 바뀐 상태(409)는 새로 불러오고 그 사실을 알립니다. */
function saveError(code: string, fallback: string): string {
  if (code === "CONFLICT") return "이미 상태가 바뀌었어요. 새로 불러온 내용을 확인해 주세요";
  if (code === "NETWORK" || code === "INTERNAL_ERROR") return fallback;
  return "";
}

function ReportReview({ report, detail }: { report: ReportDetail; detail: ManagedBuildingDetail }) {
  const buildingId = detail.building.id;
  const base = `/manage/${buildingId}`;
  const ids = useId();
  const toast = useToast();
  const queryClient = useQueryClient();
  const acknowledge = useAcknowledgeReport(report.id);
  const resolve = useResolveReport(report.id);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [resultError, setResultError] = useState<string>();
  const [loginNeeded, setLoginNeeded] = useState(false);
  const inFlight = useRef(false);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  // ‘확인했어요’ 뒤 화면이 35로 바뀌면 처리 결과로 포커스를 옮겨 이어서 고르게 합니다.
  const [moveFocus, setMoveFocus] = useState(false);
  useEffect(() => {
    if (!moveFocus || report.status !== "acknowledged") return;
    resultHeading.current?.focus();
    setMoveFocus(false);
  }, [moveFocus, report.status]);
  const reporter = report.reporterKind ? REPORTER_KIND[report.reporterKind] : undefined;
  const heading = report.preset
    ? REPORT_PRESET_COPY[report.preset].text
    : REPORT_KIND_LABEL[report.kind];
  const dirty = report.status === "acknowledged" && note.trim() !== "";

  async function run(action: () => Promise<unknown>, done: () => void, fallback: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(undefined);
    setLoginNeeded(false);
    try {
      await action();
      done();
    } catch (caught) {
      const appError = toAppError(caught);
      if (appError.code === "CONFLICT") {
        // 다른 기기에서 먼저 바꿨을 수 있습니다. 지금 상태를 다시 받아 그립니다.
        setResult(null);
        void queryClient.invalidateQueries({ queryKey: reportKeys.managed(report.id) });
        void queryClient.invalidateQueries({ queryKey: buildingKeys.managedList() });
      }
      if (appError.code === "VALIDATION_FAILED") {
        setError(`보낸 분께 한 줄은 ${REPORT_RESULT_NOTE_MAX}자 안의 한 줄로 적어 주세요`);
      } else if (appError.code === "UNAUTHENTICATED") {
        // 로그인이 끝났으면 다시 로그인하고 이 화면으로 돌아옵니다(리뷰 L8).
        setLoginNeeded(true);
        setError("로그인이 끝났어요. 다시 로그인한 뒤 눌러 주세요");
      } else {
        setError(saveError(appError.code, fallback) || errorMessage(appError));
      }
    } finally {
      inFlight.current = false;
    }
  }

  function onAcknowledge() {
    void run(
      () => acknowledge.mutateAsync(),
      () => {
        toast("확인함으로 표시했어요");
        setMoveFocus(true);
      },
      "확인하지 못했어요. 다시 눌러 주세요",
    );
  }

  function onResolve() {
    if (!result) {
      setResultError("처리 결과를 골라 주세요");
      document.querySelector<HTMLInputElement>(`input[name="${ids}-result"]`)?.focus();
      return;
    }
    const trimmed = note.trim();
    void run(
      () => resolve.mutateAsync(trimmed ? { result, note: trimmed } : { result }),
      () => {
        setNote("");
        toast("처리 결과를 저장했어요");
      },
      "저장하지 못했어요. 고른 결과는 그대로 있어요. 다시 눌러 주세요",
    );
  }

  const pending = acknowledge.isPending || resolve.isPending;
  let dock: ReactNode;
  if (loginNeeded && report.status !== "completed" && report.status !== "unable") {
    dock = (
      <Dock error={error}>
        <LoginAgainButton />
      </Dock>
    );
  } else if (report.status === "received") {
    dock = (
      <Dock error={error}>
        <ActionButton
          className="wh-btn"
          size="large"
          loading={acknowledge.isPending}
          disabled={pending}
          onClick={onAcknowledge}
        >
          <Icon name="check" />
          확인했어요
        </ActionButton>
      </Dock>
    );
  } else if (report.status === "acknowledged") {
    dock = (
      <Dock error={error}>
        <ActionButton
          className="wh-btn"
          size="large"
          loading={resolve.isPending}
          disabled={pending}
          onClick={onResolve}
        >
          결과 저장
        </ActionButton>
      </Dock>
    );
  } else {
    dock = (
      <Dock>
        <ActionButton asChild className="wh-btn wh-btn--neutral" size="large" variant="neutralWeak">
          <Link to={`${base}/inbox`}>받은 내용으로</Link>
        </ActionButton>
      </Dock>
    );
  }

  const quote = report.body ? (
    <p className="ri-quote">{report.body}</p>
  ) : (
    <p className="ri-quote ri-quote--empty">덧붙인 내용 없음</p>
  );

  return (
    <DetailShell buildingId={buildingId} dock={dock}>
      <div className="wh-pad ri-body">
        {report.status === "received" ? (
          <>
            <div className="ri-badges">
              <ReportStatusBadge status="received" />
              <span className="wh-badge wh-badge--moon">새로 받음</span>
            </div>
            <h1 className="wh-h-title ri-title" tabIndex={-1}>
              {heading}
            </h1>
            <dl className="ri-meta">
              <div>
                <dt>건물</dt>
                <dd>{report.buildingName}</dd>
              </div>
              <div>
                <dt>보낸 방식</dt>
                <dd>{report.preset ? "자주 쓰는 말" : "직접 적기"}</dd>
              </div>
              {report.location ? (
                <div>
                  <dt>위치</dt>
                  <dd>{REPORT_LOCATION_LABEL[report.location]}</dd>
                </div>
              ) : null}
              <div>
                <dt>받은 시각</dt>
                <dd>{formatReportTime(report.createdAt)}</dd>
              </div>
              {reporter ? (
                <div>
                  <dt>보낸 사람</dt>
                  <dd>{reporter.how}</dd>
                </div>
              ) : null}
            </dl>
            {quote}

            <p className="wh-field-label ri-label">처리 결과</p>
            <div className="ri-opts ri-opts--off" aria-hidden="true">
              <span className="ri-off-opt">
                <Icon name="circle-check" />
                처리 완료
              </span>
              <span className="ri-off-opt">
                <Icon name="circle-alert" />
                처리가 어려움
              </span>
            </div>
            <p className="wh-caption ri-caption">확인했어요를 누른 뒤 선택할 수 있어요</p>
            <p className="wh-note ri-note">
              <Icon name="info" />
              <span>
                열어보기만 해서는 ‘확인함’이 되지 않아요. 버튼을 눌러야 보낸 사람 화면이 바뀌어요.
              </span>
            </p>
          </>
        ) : (
          <>
            <div className="ri-badges">
              <ReportStatusBadge status={report.status} />
              <span className="wh-caption">
                {report.status === "acknowledged"
                  ? report.acknowledgedAt
                    ? `${formatReportTime(report.acknowledgedAt)}에 확인`
                    : ""
                  : report.resolvedAt
                    ? `${formatReportTime(report.resolvedAt)}에 표시`
                    : ""}
              </span>
            </div>
            <h1 className="wh-h-title ri-title" tabIndex={-1}>
              {heading}
            </h1>
            <p className="wh-small ri-sub">
              {report.buildingName}
              {reporter ? ` · ${reporter.label}` : ""} · {formatReportTime(report.createdAt)}
              {report.location ? ` · ${REPORT_LOCATION_LABEL[report.location]}` : ""}
            </p>
            {report.body ? quote : null}

            {report.status === "acknowledged" ? (
              <>
                <fieldset
                  className="ri-fieldset"
                  aria-describedby={resultError ? `${ids}-result-error` : undefined}
                  disabled={pending}
                >
                  <legend className="ri-legend">
                    <h2 className="wh-field-label ri-label" ref={resultHeading} tabIndex={-1}>
                      처리 결과
                    </h2>
                  </legend>
                  <div className="ri-opts">
                    {(
                      [
                        ["completed", "처리 완료", "circle-check"],
                        ["unable", "처리가 어려움", "circle-alert"],
                      ] as const
                    ).map(([value, label, icon]) => (
                      <label key={value} className={`ri-opt ri-opt--${value}`}>
                        <input
                          type="radio"
                          name={`${ids}-result`}
                          value={value}
                          checked={result === value}
                          onChange={() => {
                            setResult(value);
                            setResultError(undefined);
                          }}
                        />
                        <span className="ri-opt__face">
                          <Icon name={icon} />
                          {label}
                        </span>
                      </label>
                    ))}
                  </div>
                  {resultError ? (
                    <p className="wh-field-error" id={`${ids}-result-error`}>
                      {resultError}
                    </p>
                  ) : null}
                </fieldset>

                <div className="ri-field">
                  <label className="wh-field-label" htmlFor={`${ids}-note`}>
                    <span>
                      보낸 분께 한 줄 <span className="ri-opt-label">선택</span>
                    </span>
                    <span className="wh-field-label__count" aria-hidden="true">
                      {note.length}/{REPORT_RESULT_NOTE_MAX}
                    </span>
                  </label>
                  <input
                    id={`${ids}-note`}
                    className="wh-input ri-input"
                    value={note}
                    maxLength={REPORT_RESULT_NOTE_MAX}
                    placeholder="예: 오늘 오전에 치워 달라고 전했어요"
                    autoComplete="off"
                    enterKeyHint="done"
                    disabled={pending}
                    aria-describedby={`${ids}-note-help`}
                    onChange={(event) =>
                      setNote(cleanText(event.target.value, { multiline: false }))
                    }
                  />
                  <p className="wh-caption ri-help" id={`${ids}-note-help`}>
                    보낸 분의 상태 화면에 ‘집주인이 남긴 말’로 보여요
                  </p>
                </div>
              </>
            ) : report.resultNote ? (
              <div className={`ri-said ri-said--${report.status}`}>
                <small>보낸 분께 남긴 말</small>
                {report.resultNote}
              </div>
            ) : null}

            <NextSteps base={base} detail={detail} />
          </>
        )}
      </div>
      {dirty ? (
        <LeaveConfirm
          when={dirty}
          title="적은 한 줄이 사라져요"
          description="결과를 저장하지 않고 나가면 적은 내용은 지워져요."
        />
      ) : null}
    </DetailShell>
  );
}

/** 필요하면 이어서(35): 빈 공지 쓰기와 안내 고치기. 받은 내용은 옮겨 적지 않습니다. */
function NextSteps({ base, detail }: { base: string; detail: ManagedBuildingDetail }) {
  const published = detail.guides.filter((guide) => guide.status === "published");
  const onlyGuide = published.length === 1 ? published[0] : undefined;
  return (
    <div className="ri-next">
      <p className="ri-next__head">필요하면 이어서</p>
      <div className="ri-next__btns">
        <Link className="ri-next__btn" to={`${base}/notices/new`}>
          <Icon name="megaphone" />
          공지로 알리기
        </Link>
        <Link
          className="ri-next__btn"
          to={onlyGuide ? `${base}/guides/${onlyGuide.id}/edit` : base}
        >
          <Icon name="pencil-line" />
          안내 고치기
        </Link>
      </div>
      <p className="ri-next__note">받은 내용은 공지나 안내에 자동으로 공개되지 않아요</p>
    </div>
  );
}

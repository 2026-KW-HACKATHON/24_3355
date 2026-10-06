// LF-10 집주인에게 알리기 · 직접 적기 · lofi 05 (보내기 전 확인 20, 접수 06은 report-status)
import { ActionButton, Skeleton } from "@seed-design/react";
import {
  type PublicBuilding,
  REPORT_BODY_MAX,
  REPORT_KINDS,
  REPORT_LOCATIONS,
  type ReportKind,
  type ReportLocation,
} from "@wolgyeham/contracts";
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useParams } from "react-router";
import { ChoiceChips } from "../../components/ChoiceChips";
import { Hami } from "../../components/Hami";
import { Icon } from "../../components/Icon";
import { LeaveConfirm } from "../../components/LeaveConfirm";
import { BackButton, Dock, Screen, SoonNote, TopBar } from "../../components/Screen";
import { Delayed, EmptyState, LoadError } from "../../components/ScreenState";
import { usePublicBuilding } from "../../features/buildings/queries";
import { REPORT_KIND_LABEL, REPORT_LOCATION_LABEL } from "../../features/reports/labels";
import { ReportConfirmSheet, type ReportDraft } from "../../features/reports/ReportConfirmSheet";
import { toAppError } from "../../lib/errors";
import "./report-compose.css";

const KIND_OPTIONS = REPORT_KINDS.map((value) => ({ value, label: REPORT_KIND_LABEL[value] }));
const LOCATION_OPTIONS = REPORT_LOCATIONS.map((value) => ({
  value,
  label: REPORT_LOCATION_LABEL[value],
}));

export function Component() {
  const { buildingId = "" } = useParams();
  const building = usePublicBuilding(buildingId);
  const home = `/b/${buildingId}`;

  if (building.isError) {
    const { code } = toAppError(building.error);
    return (
      <ComposeShell home={home}>
        {code === "NOT_FOUND" || code === "VALIDATION_FAILED" ? (
          <div className="wh-pad wh-state-top">
            {/* 건물 없음(22)과 같은 문구·함이 */}
            <EmptyState
              hami="lost"
              title="건물 정보를 찾을 수 없어요"
              description="QR이 바뀌었거나 주소가 잘못 열렸을 수 있어요."
            />
          </div>
        ) : (
          <LoadError onRetry={() => void building.refetch()} retrying={building.isFetching} />
        )}
      </ComposeShell>
    );
  }
  if (building.isPending) {
    return (
      <ComposeShell home={home} busy>
        <Delayed label="건물 정보를 불러오는 중">
          <div className="wh-pad rc-skeleton">
            <Skeleton radius="16" height="76px" />
            <Skeleton radius="8" height="28px" width="60%" />
            <Skeleton radius="16" height="120px" />
          </div>
        </Delayed>
      </ComposeShell>
    );
  }
  return <ComposeForm building={building.data} home={home} />;
}

function ComposeShell({
  home,
  busy = false,
  children,
}: {
  home: string;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <Screen
      busy={busy}
      topbar={
        <TopBar
          start={<BackButton fallback={home} icon="x" label="닫기" />}
          title="직접 적어서 알리기"
        />
      }
    >
      {children}
    </Screen>
  );
}

type Errors = { kind?: string | undefined; body?: string | undefined };

function ComposeForm({ building, home }: { building: PublicBuilding; home: string }) {
  const ids = useId();
  const [kind, setKind] = useState<ReportKind | null>(null);
  const [location, setLocation] = useState<ReportLocation | null>(null);
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const dirty = body.trim() !== "";

  // 쓰던 내용이 있으면 새로고침·창 닫기에도 브라우저가 한 번 묻습니다(앱 안 이동은 LeaveConfirm).
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function review(event: FormEvent) {
    event.preventDefault();
    const found: Errors = {};
    if (!kind) found.kind = "어떤 상황인지 골라 주세요";
    if (!body.trim()) found.body = "상황을 한두 문장으로 적어 주세요";
    setErrors(found);
    if (found.kind) {
      document.querySelector<HTMLInputElement>(`input[name="${ids}-kind"]`)?.focus();
      return;
    }
    if (found.body || !kind) {
      bodyRef.current?.focus();
      return;
    }
    setDraft({ source: "custom", kind, location, body });
    setConfirmOpen(true);
  }

  return (
    <>
      <form className="rc-form" onSubmit={review} noValidate>
        <Screen
          topbar={
            <TopBar
              start={<BackButton fallback={home} icon="x" label="닫기" />}
              title="직접 적어서 알리기"
            />
          }
          dock={
            <Dock>
              <ActionButton type="submit" className="wh-btn" size="large">
                보낼 내용 확인
              </ActionButton>
            </Dock>
          }
        >
          <div className="wh-pad rc-body">
            <div className="rc-to">
              <Hami pose="envelope" size={80} className="rc-to__hami" eager />
              <p className="rc-to__row">
                <Icon name="building-2" />
                <span>
                  <b>{building.name}</b> 집주인에게 전달돼요
                </span>
              </p>
              <p className="rc-to__row">
                <Icon name="eye-off" />
                <span>게시판에 올라가지 않고 집주인만 봐요</span>
              </p>
            </div>

            <h1 className="wh-h-title rc-title" tabIndex={-1}>
              어떤 상황을 전할까요?
            </h1>

            <div className="rc-field">
              <ChoiceChips
                name={`${ids}-kind`}
                legend="종류"
                options={KIND_OPTIONS}
                value={kind}
                onChange={(next) => {
                  setKind(next);
                  if (errors.kind) setErrors((old) => ({ ...old, kind: undefined }));
                }}
                describedBy={errors.kind ? `${ids}-kind-error` : undefined}
              />
              {errors.kind ? (
                <p className="wh-field-error" id={`${ids}-kind-error`}>
                  {errors.kind}
                </p>
              ) : null}
            </div>

            <div className="rc-field">
              <ChoiceChips
                name={`${ids}-location`}
                legend={
                  <>
                    어디에서 발견했나요 <span className="rc-opt">선택</span>
                  </>
                }
                options={LOCATION_OPTIONS}
                value={location}
                onChange={setLocation}
                optional
              />
            </div>

            <div className="rc-field">
              <div className="wh-field-label rc-body-label">
                <label htmlFor={`${ids}-body`}>내용</label>
                <span className="rc-polish">
                  <button
                    type="button"
                    className="rc-polish__btn"
                    disabled
                    aria-describedby={`${ids}-polish-soon`}
                  >
                    <Icon name="wand-sparkles" />한 문장으로 다듬기
                  </button>
                </span>
              </div>
              <div className="rc-textarea">
                <textarea
                  ref={bodyRef}
                  id={`${ids}-body`}
                  className="wh-textarea rc-textarea__input"
                  value={body}
                  maxLength={REPORT_BODY_MAX}
                  placeholder="예: 분리수거함 옆 쓰레기봉투가 골목까지 나와 있어서 지나가기 어려워요."
                  aria-invalid={errors.body ? true : undefined}
                  aria-describedby={`${ids}-count${errors.body ? ` ${ids}-body-error` : ""}`}
                  onChange={(event) => {
                    setBody(event.target.value);
                    if (errors.body) setErrors((old) => ({ ...old, body: undefined }));
                  }}
                />
                <span className="rc-textarea__count" id={`${ids}-count`}>
                  {body.length} / {REPORT_BODY_MAX}
                </span>
              </div>
              {errors.body ? (
                <p className="wh-field-error" id={`${ids}-body-error`}>
                  {errors.body}
                </p>
              ) : null}
              <p className="rc-soon">
                <SoonNote id={`${ids}-polish-soon`}>
                  한 문장으로 다듬기는 다음 업데이트에서 열려요
                </SoonNote>
              </p>
            </div>
          </div>
        </Screen>
      </form>
      <ReportConfirmSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        buildingId={building.id}
        buildingName={building.name}
        draft={draft}
        replace
        closeOnBack
      />
      {/* 확인 시트가 열린 동안에는 시트가 뒤로 가기를 받습니다(blocker는 하나만, interaction.md §4). */}
      {dirty && !confirmOpen ? (
        <LeaveConfirm
          when={dirty}
          title="쓰던 내용이 사라져요"
          description="지금 나가면 적은 내용은 보내지 않고 지워져요."
        />
      ) : null}
    </>
  );
}

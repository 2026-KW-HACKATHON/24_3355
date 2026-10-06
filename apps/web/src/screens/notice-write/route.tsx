// LF-15 공지 올리기 · lofi 34 (올린 뒤 37은 notice-posted)
import { ActionButton } from "@seed-design/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  type ManagedBuildingDetail,
  NOTICE_BODY_MAX,
  NOTICE_TITLE_MAX,
  NoticeList,
} from "@wolgyeham/contracts";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Icon } from "../../components/Icon";
import { LEAVE_OK, LeaveConfirm } from "../../components/LeaveConfirm";
import { BackButton, Dock, Screen, TopBar } from "../../components/Screen";
import { useToast } from "../../components/useToast";
import { ManagerGate } from "../../features/auth/ManagerGate";
import { noticeKeys, useCreateNotice, useNoticeAudience } from "../../features/notices/queries";
import {
  defaultSchedule,
  fromLocalInput,
  type ScheduleErrors,
  scheduleErrors,
} from "../../features/notices/schedule";
import { usePushPublicKey } from "../../features/push/queries";
import { getJson, seg } from "../../lib/api";
import { type AppError, errorMessage, toAppError } from "../../lib/errors";
import { findPostedNotice } from "./findPosted";
import "./notice-write.css";

export function Component() {
  const { buildingId = "" } = useParams();
  return (
    <ManagerGate buildingId={buildingId}>{(detail) => <NoticeForm detail={detail} />}</ManagerGate>
  );
}

type Values = { title: string; startsAt: string; endsAt: string; body: string };
type Errors = ScheduleErrors & { title?: string; body?: string };

function validate(values: Values, now: number): Errors {
  const errors: Errors = scheduleErrors(values.startsAt, values.endsAt, now);
  const title = values.title.trim();
  const body = values.body.trim();
  if (!title) errors.title = "제목을 적어 주세요";
  else if (title.length > NOTICE_TITLE_MAX)
    errors.title = `제목은 ${NOTICE_TITLE_MAX}자까지 쓸 수 있어요`;
  if (!body) errors.body = "내용을 적어 주세요";
  else if (body.length > NOTICE_BODY_MAX)
    errors.body = `내용은 ${NOTICE_BODY_MAX}자까지 쓸 수 있어요`;
  return errors;
}

function serverErrors(error: AppError): Errors {
  if (error.code !== "VALIDATION_FAILED") return {};
  const errors: Errors = {};
  if ("title" in error.fields) errors.title = "제목을 확인해 주세요";
  if ("body" in error.fields) errors.body = "내용을 확인해 주세요";
  if ("startsAt" in error.fields) errors.startsAt = "시작 시각을 확인해 주세요";
  if ("endsAt" in error.fields) errors.endsAt = "끝나는 시각을 확인해 주세요";
  return errors;
}

function NoticeForm({ detail }: { detail: ManagedBuildingDetail }) {
  const buildingId = detail.building.id;
  const base = `/manage/${buildingId}`;
  const ids = useId();
  const navigate = useNavigate();
  const [initial] = useState(() => defaultSchedule(Date.now()));
  const [values, setValues] = useState<Values>({ title: "", body: "", ...initial });
  const [errors, setErrors] = useState<Errors>({});
  const [saveError, setSaveError] = useState<string>();
  const [checking, setChecking] = useState(false);
  const inFlight = useRef(false);
  const queryClient = useQueryClient();
  const toast = useToast();
  const create = useCreateNotice(buildingId);
  const audience = useNoticeAudience(buildingId);
  const publicKey = usePushPublicKey();
  const dirty = values.title.trim() !== "" || values.body.trim() !== "";

  // 쓰던 공지가 있으면 탭 닫기·새로고침도 한 번 묻습니다(lofi ‘작성 중 닫기’). 앱 안 이동은 LeaveConfirm이 묻습니다.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // 오래된 브라우저는 returnValue가 있어야 묻습니다.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  /**
   * 보낸 뒤 응답을 받지 못함(시간 초과·연결 끊김·알 수 없는 응답). 서버에는 올라갔을 수 있어 “다시 눌러
   * 주세요”라고 하지 않고, 공지 목록을 새로 받아 같은 제목·시작 시각의 공지가 있으면 그 공지(37)로 갑니다.
   */
  async function confirmPosted(sent: { title: string; startsAt: string }, sentAt: number) {
    setChecking(true);
    setSaveError("올렸는지 확인하고 있어요");
    try {
      const list = await queryClient.fetchQuery({
        queryKey: noticeKeys.list(buildingId),
        queryFn: () => getJson(`/api/buildings/${seg(buildingId)}/notices`, NoticeList),
        staleTime: 0,
      });
      const found = findPostedNotice(list.notices, sent, sentAt);
      if (found) {
        toast("공지가 올라가 있어요. 올린 공지를 보여 드려요");
        void navigate(`${base}/notices/${found.id}`, { replace: true, state: { ...LEAVE_OK } });
        return;
      }
      setSaveError("올라간 공지를 찾지 못했어요. 다시 눌러 올려 주세요");
    } catch {
      setSaveError(
        "올렸는지 확인하지 못했어요. 관리 홈의 진행 중 공지에 없을 때만 다시 올려 주세요",
      );
    } finally {
      setChecking(false);
    }
  }

  function change<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((old) => ({ ...old, [key]: value }));
    if (errors[key]) setErrors((old) => ({ ...old, [key]: undefined }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const found = validate(values, Date.now());
    setErrors(found);
    setSaveError(undefined);
    const firstInvalid = (["title", "startsAt", "endsAt", "body"] as const).find(
      (key) => found[key],
    );
    if (firstInvalid) {
      document.getElementById(`${ids}-${firstInvalid}`)?.focus();
      return;
    }
    const startsAt = fromLocalInput(values.startsAt);
    const endsAt = fromLocalInput(values.endsAt);
    if (!startsAt || !endsAt) return;
    inFlight.current = true;
    const title = values.title.trim();
    const sentAt = Date.now();
    try {
      const result = await create.mutateAsync({
        title,
        body: values.body.trim(),
        startsAt,
        endsAt,
      });
      // 올린 뒤(37)로 바꿉니다. 뒤로 가면 쓰기 화면이 아니라 관리 홈으로 갑니다(중복 게시 방지).
      void navigate(`${base}/notices/${result.notice.id}`, {
        replace: true,
        state: { attemptedCount: result.attemptedCount, ...LEAVE_OK },
      });
    } catch (caught) {
      const error = toAppError(caught);
      if (error.code === "NETWORK" || error.code === "INTERNAL_ERROR") {
        await confirmPosted({ title, startsAt }, sentAt);
        return;
      }
      setErrors((old) => ({ ...old, ...serverErrors(error) }));
      setSaveError(errorMessage(error));
    } finally {
      inFlight.current = false;
    }
  }

  const describe = (key: keyof Errors, extra?: string) =>
    [errors[key] ? `${ids}-${key}-error` : "", extra ?? ""].filter(Boolean).join(" ") || undefined;

  return (
    <form className="nw-form" onSubmit={submit} noValidate>
      <Screen
        topbar={
          <TopBar
            start={<BackButton fallback={base} icon="x" label="닫기" />}
            title="공지 올리기"
            titleAs="h1"
          />
        }
        dock={
          <Dock error={saveError}>
            <ActionButton
              type="submit"
              className="wh-btn"
              size="large"
              loading={create.isPending || checking}
              disabled={create.isPending || checking}
            >
              공지 올리기
            </ActionButton>
          </Dock>
        }
      >
        <div className="wh-pad nw-body">
          <div className="nw-field">
            <label className="wh-field-label" htmlFor={`${ids}-title`}>
              제목
              <span className="wh-field-label__count" aria-hidden="true">
                {values.title.length}/{NOTICE_TITLE_MAX}
              </span>
            </label>
            <input
              id={`${ids}-title`}
              className="wh-input"
              value={values.title}
              maxLength={NOTICE_TITLE_MAX}
              placeholder="예: 9월 28일(일) 오전 단수 안내"
              autoComplete="off"
              enterKeyHint="next"
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={describe("title")}
              onChange={(event) => change("title", event.target.value)}
            />
            {errors.title ? (
              <p className="wh-field-error" id={`${ids}-title-error`}>
                {errors.title}
              </p>
            ) : null}
          </div>

          <fieldset className="nw-field nw-when">
            <legend className="wh-field-label">언제 일어나는 일인가요</legend>
            <div className="nw-two">
              <label className="nw-time" htmlFor={`${ids}-startsAt`}>
                <small>시작</small>
                <input
                  id={`${ids}-startsAt`}
                  type="datetime-local"
                  className="wh-input nw-time__input"
                  value={values.startsAt}
                  aria-invalid={errors.startsAt ? true : undefined}
                  aria-describedby={describe("startsAt")}
                  onChange={(event) => change("startsAt", event.target.value)}
                />
              </label>
              <label className="nw-time" htmlFor={`${ids}-endsAt`}>
                <small>끝</small>
                <input
                  id={`${ids}-endsAt`}
                  type="datetime-local"
                  className="wh-input nw-time__input"
                  value={values.endsAt}
                  min={values.startsAt || undefined}
                  aria-invalid={errors.endsAt ? true : undefined}
                  aria-describedby={describe("endsAt", `${ids}-when-help`)}
                  onChange={(event) => change("endsAt", event.target.value)}
                />
              </label>
            </div>
            {errors.startsAt ? (
              <p className="wh-field-error" id={`${ids}-startsAt-error`}>
                {errors.startsAt}
              </p>
            ) : null}
            {errors.endsAt ? (
              <p className="wh-field-error" id={`${ids}-endsAt-error`}>
                {errors.endsAt}
              </p>
            ) : null}
            <p className="wh-caption nw-help" id={`${ids}-when-help`}>
              끝난 뒤에는 건물 화면에서 자동으로 내려가요
            </p>
          </fieldset>

          <div className="nw-field">
            <label className="wh-field-label" htmlFor={`${ids}-body`}>
              내용
              <span className="wh-field-label__count" aria-hidden="true">
                {values.body.length}/{NOTICE_BODY_MAX}
              </span>
            </label>
            <textarea
              id={`${ids}-body`}
              className="wh-textarea nw-textarea"
              value={values.body}
              maxLength={NOTICE_BODY_MAX}
              placeholder="예: 물탱크 청소로 위 시간 동안 물이 나오지 않아요. 전날 밤에 필요한 물을 받아 두세요."
              aria-invalid={errors.body ? true : undefined}
              aria-describedby={describe("body")}
              onChange={(event) => change("body", event.target.value)}
            />
            {errors.body ? (
              <p className="wh-field-error" id={`${ids}-body-error`}>
                {errors.body}
              </p>
            ) : null}
          </div>

          <Audience
            connected={audience.data?.connectedCount}
            targets={audience.data?.pushTargetCount}
            failed={audience.isError}
            retrying={audience.isFetching}
            onRetry={() => void audience.refetch()}
            pushOff={publicKey.data === null}
          />
          <p className="nw-rule">
            <Icon name="lightbulb" />
            <span>
              분리수거 요일처럼 앞으로 계속 바뀌는 규칙이면 <b>기본 안내도 고쳐 주세요</b>. 공지는
              기간이 지나면 내려가요.
            </span>
          </p>
        </div>
      </Screen>
      <LeaveConfirm
        when={dirty}
        title="쓰던 공지가 사라져요"
        description="지금 나가면 적은 내용은 저장되지 않아요."
      />
    </form>
  );
}

/** 알림 대상 수(34). 월계함에 연결된 사람 기준이라 실제 세입자 수와 다를 수 있습니다. */
function Audience({
  connected,
  targets,
  failed,
  retrying,
  onRetry,
  pushOff,
}: {
  connected: number | undefined;
  targets: number | undefined;
  failed: boolean;
  retrying: boolean;
  onRetry: () => void;
  pushOff: boolean;
}) {
  if (failed) {
    return (
      <div className="nw-who">
        <Icon name="bell" />
        <span>알림 대상 수를 불러오지 못했어요. 공지는 그대로 올릴 수 있어요.</span>
        <button type="button" className="nw-who__retry" onClick={onRetry} disabled={retrying}>
          다시 시도
        </button>
      </div>
    );
  }
  return (
    <div className="nw-who" aria-live="polite">
      <Icon name="bell" />
      {connected === undefined || targets === undefined ? (
        <span>알림 대상 수를 확인하는 중이에요</span>
      ) : (
        <span>
          월계함에 연결된 거주자 <b>{connected}명</b> 중 알림을 켠 <b>{targets}명</b>에게 보내요
          <small>연결된 사람 기준이라 실제 세입자 수와 다를 수 있어요.</small>
          {pushOff ? (
            <small>지금은 알림을 보낼 수 없는 환경이에요. 올린 뒤 링크로 전해 주세요.</small>
          ) : null}
        </span>
      )}
    </div>
  );
}

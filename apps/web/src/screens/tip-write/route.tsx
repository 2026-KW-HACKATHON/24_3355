// LF-07 생활 팁 작성 · lofi 19 (새로 쓰기 `/b/:buildingId/tips/new`, 고치기 `…/tips/:tipId/edit`)
// 종류 + 내용만 받습니다. ‘익명’이라고 쓰지 않고 “다른 거주자에게 작성자가 안 보여요”라고 씁니다.
import { ActionButton, Snackbar } from "@seed-design/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  type MeOccupancy,
  TIP_BODY_MAX,
  TIP_CATEGORIES,
  type TipCategory,
} from "@wolgyeham/contracts";
import {
  type FormEvent,
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { ChoiceChips } from "../../components/ChoiceChips";
import { Icon } from "../../components/Icon";
import { LeaveConfirm } from "../../components/LeaveConfirm";
import { BackButton, Screen, TopBar } from "../../components/Screen";
import { Delayed, EmptyState, LoadError, SkeletonLines } from "../../components/ScreenState";
import { useToast } from "../../components/useToast";
import { LoginAgainButton } from "../../features/auth/LoginAgainButton";
import { authKeys, useMe } from "../../features/auth/queries";
import { TIP_CATEGORY_LABEL, tipWriteError } from "../../features/tips/labels";
import { tipKeys, useCreateTip, useMyTips, useUpdateTip } from "../../features/tips/queries";
import { tipRoleFor } from "../../features/tips/role";
import { clearTipDraft, loadTipDraft, saveTipDraft } from "../../features/tips/tipDraft";
import { useTipSavedToast } from "../../features/tips/useTipSavedToast";
import { toAppError } from "../../lib/errors";
import { cleanText } from "../../lib/text";
import "./tip-write.css";

type Errors = { category?: string | undefined; body?: string | undefined };

// 거주 확인(40)·이사(08) 시트는 재확인이 필요한 드문 경우에만 쓰여 누를 때 불러옵니다(작성 화면 번들을 가볍게).
const ReconfirmSheet = lazy(() =>
  import("../../features/occupancy/ReconfirmSheet").then((module) => ({
    default: module.ReconfirmSheet,
  })),
);
const MoveOutSheet = lazy(() =>
  import("../../features/occupancy/MoveOutSheet").then((module) => ({
    default: module.MoveOutSheet,
  })),
);

const CATEGORY_OPTIONS = TIP_CATEGORIES.map((value) => ({
  value,
  label: TIP_CATEGORY_LABEL[value],
}));

export function Component() {
  const { buildingId = "", tipId } = useParams();
  const me = useMe();
  const list = `/b/${buildingId}/tips`;
  const title = tipId ? "팁 고치기" : "생활 팁 남기기";

  if (me.isError) {
    return (
      <WriteShell list={list} title={title}>
        <LoadError onRetry={() => void me.refetch()} retrying={me.isFetching} />
      </WriteShell>
    );
  }
  if (me.isPending) return <WriteLoading list={list} title={title} />;
  const role = tipRoleFor(me.data, buildingId);
  // 연결 전·이사한 뒤에는 목록 화면이 연결 필요(44)를 보여줍니다.
  if (role === "outsider") return <Navigate replace to={list} />;
  if (role === "landlord") {
    return (
      <Blocked list={list} title={title} icon="lock" message="집주인은 생활 팁을 남기지 않아요" />
    );
  }
  if (tipId) {
    return <EditLoader buildingId={buildingId} tipId={tipId} userId={me.data?.user.id} />;
  }
  if (role === "reconfirm" && me.data?.occupancy) {
    return <ReconfirmBlocked list={list} title={title} occupancy={me.data.occupancy} />;
  }
  return <TipForm buildingId={buildingId} />;
}

function WriteShell({
  list,
  title,
  busy = false,
  children,
}: {
  list: string;
  title: string;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <Screen
      busy={busy}
      topbar={<TopBar start={<BackButton fallback={list} icon="x" label="닫기" />} title={title} />}
    >
      {children}
    </Screen>
  );
}

function WriteLoading({ list, title }: { list: string; title: string }) {
  return (
    <WriteShell list={list} title={title} busy>
      <Delayed label="불러오는 중">
        <div className="wh-pad tw-skeleton">
          <SkeletonLines lines={4} />
        </div>
      </Delayed>
    </WriteShell>
  );
}

function Blocked({
  list,
  title,
  icon,
  message,
  description,
}: {
  list: string;
  title: string;
  icon: "lock" | "house" | "file-text";
  message: string;
  description?: string;
}) {
  return (
    <WriteShell list={list} title={title}>
      <div className="wh-pad wh-state-top">
        <EmptyState icon={icon} title={message} {...(description ? { description } : {})} />
      </div>
    </WriteShell>
  );
}

/** 거주 확인이 필요하면 쓰지 못하는 이유와 함께 그 자리에서 거주 확인(40)을 엽니다(리뷰 L4). */
function ReconfirmBlocked({
  list,
  title,
  occupancy,
}: {
  list: string;
  title: string;
  occupancy: MeOccupancy;
}) {
  const [sheet, setSheet] = useState<"reconfirm" | "moveOut" | null>(null);
  // 처음 누를 때 시트 코드를 불러오고, 그 뒤에는 닫히는 애니메이션이 보이도록 남겨 둡니다.
  const [used, setUsed] = useState(false);
  return (
    <WriteShell list={list} title={title}>
      <div className="wh-pad wh-state-top">
        <EmptyState
          icon="house"
          title="거주 확인이 필요해서 지금은 팁을 남길 수 없어요"
          description="아직 살고 있는지 확인하면 다시 남길 수 있어요."
        >
          <ActionButton
            className="wh-btn wh-btn--secondary wh-btn--sm tw-reconfirm"
            size="large"
            variant="neutralWeak"
            aria-haspopup="dialog"
            onClick={() => {
              setUsed(true);
              setSheet("reconfirm");
            }}
          >
            거주 확인
          </ActionButton>
        </EmptyState>
      </div>
      {used ? (
        <Suspense fallback={null}>
          <ReconfirmSheet
            open={sheet === "reconfirm"}
            onOpenChange={(open) => setSheet(open ? "reconfirm" : null)}
            occupancy={occupancy}
            onMoveOut={() => setSheet("moveOut")}
          />
          <MoveOutSheet
            open={sheet === "moveOut"}
            onOpenChange={(open) => setSheet(open ? "moveOut" : null)}
            occupancy={occupancy}
          />
        </Suspense>
      ) : null}
    </WriteShell>
  );
}

/** 고치기: 내가 남긴 팁에서 찾습니다(가린 팁도 여기에는 있음). */
function EditLoader({
  buildingId,
  tipId,
  userId,
}: {
  buildingId: string;
  tipId: string;
  userId: string | undefined;
}) {
  const mine = useMyTips(userId);
  const list = `/b/${buildingId}/tips`;
  if (mine.isError) {
    return (
      <WriteShell list={list} title="팁 고치기">
        <LoadError onRetry={() => void mine.refetch()} retrying={mine.isFetching} />
      </WriteShell>
    );
  }
  if (mine.isPending) return <WriteLoading list={list} title="팁 고치기" />;
  const tip = mine.data.find((item) => item.id === tipId && item.buildingId === buildingId);
  if (!tip) {
    return (
      <Blocked
        list={list}
        title="팁 고치기"
        icon="file-text"
        message="이 팁을 찾을 수 없어요"
        description="이미 지웠거나 내가 남긴 팁이 아니에요."
      />
    );
  }
  if (!tip.editable) {
    return (
      <Blocked
        list={list}
        title="팁 고치기"
        icon="lock"
        message="이사한 건물의 팁은 고칠 수 없어요"
        description="지우려면 운영팀에 요청해 주세요."
      />
    );
  }
  return (
    <TipForm
      buildingId={buildingId}
      editing={{ id: tip.id, category: tip.category, body: tip.body }}
    />
  );
}

function TipForm({
  buildingId,
  editing,
}: {
  buildingId: string;
  editing?: { id: string; category: TipCategory; body: string };
}) {
  const ids = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const savedToast = useTipSavedToast();
  const create = useCreateTip(buildingId);
  const update = useUpdateTip(editing?.id ?? "");
  const where = { buildingId, tipId: editing?.id ?? null };
  // 다시 로그인하고 돌아왔으면 쓰던 내용을 채웁니다. 보내지는 않습니다.
  const [restored] = useState(() => loadTipDraft(where));
  const [category, setCategory] = useState<TipCategory | null>(
    restored ? restored.category : (editing?.category ?? null),
  );
  const [body, setBody] = useState(restored?.body ?? editing?.body ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [saveError, setSaveError] = useState<string>();
  const [loginNeeded, setLoginNeeded] = useState(false);
  const [done, setDone] = useState(false);
  const inFlight = useRef(false);
  // 카카오 로그인으로 떠날 때는 쓰던 내용을 저장했으므로 브라우저 확인을 띄우지 않습니다.
  const leavingForLogin = useRef(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const list = `/b/${buildingId}/tips`;
  const pending = create.isPending || update.isPending;
  const dirty =
    !done &&
    (editing
      ? body.trim() !== editing.body.trim() || category !== editing.category
      : body.trim() !== "");

  // 채운 쓰던 내용은 한 번만 씁니다.
  useEffect(() => {
    if (restored) clearTipDraft();
  }, [restored]);

  // 새로고침·창 닫기에도 브라우저가 한 번 묻습니다(앱 안 이동은 LeaveConfirm).
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!leavingForLogin.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // 저장한 뒤에는 확인 없이 들어오기 전 화면(목록·내가 남긴 팁)으로 돌아갑니다.
  useEffect(() => {
    if (!done) return;
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) void navigate(-1);
    else void navigate(list, { replace: true });
  }, [done, list, navigate]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const trimmed = cleanText(body, { multiline: true }).trim();
    const found: Errors = {};
    if (!category) found.category = "종류를 골라 주세요";
    if (!trimmed) found.body = "알려주고 싶은 내용을 적어 주세요";
    setErrors(found);
    setSaveError(undefined);
    setLoginNeeded(false);
    if (found.category) {
      document.querySelector<HTMLInputElement>(`input[name="${ids}-category"]`)?.focus();
      return;
    }
    if (found.body || !category) {
      bodyRef.current?.focus();
      return;
    }
    inFlight.current = true;
    try {
      if (editing) {
        const patch = {
          ...(category !== editing.category ? { category } : {}),
          ...(trimmed !== editing.body.trim() ? { body: trimmed } : {}),
        };
        // 바꾼 것이 없으면 요청하지 않고 돌아갑니다.
        if (Object.keys(patch).length > 0) {
          await update.mutateAsync(patch);
          toast("팁을 고쳤어요");
        }
      } else {
        await create.mutateAsync({ category, body: trimmed });
        savedToast("생활 팁을 건물에 남겼어요");
      }
      setDone(true);
    } catch (caught) {
      const appError = toAppError(caught);
      if (appError.code === "NOT_CONNECTED" || appError.code === "RECONFIRM_NEEDED") {
        void queryClient.invalidateQueries({ queryKey: authKeys.me() });
      }
      // 가려졌거나 신고를 확인하는 중인 팁은 고칠 수 없습니다(409). 지금 상태를 다시 받습니다.
      if (appError.code === "CONFLICT" || appError.code === "NOT_FOUND") {
        void queryClient.invalidateQueries({ queryKey: tipKeys.all() });
      }
      // 로그인이 끝났으면 다시 로그인하러 가는 동안 쓰던 내용을 이 탭에 둡니다(리뷰 M4).
      if (appError.code === "UNAUTHENTICATED") setLoginNeeded(true);
      setSaveError(tipWriteError(appError, "save"));
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <>
      <form className="tw-form" onSubmit={submit} noValidate>
        <Screen
          topbar={
            <TopBar
              start={<BackButton fallback={list} icon="x" label="닫기" />}
              title={editing ? "팁 고치기" : "생활 팁 남기기"}
            />
          }
          dock={
            <Snackbar.AvoidOverlap>
              <div className="wh-dock tw-dock">
                {saveError ? (
                  <p className="wh-dock__error" role="alert">
                    {saveError}
                  </p>
                ) : null}
                {loginNeeded ? (
                  <LoginAgainButton
                    onBeforeLeave={() => {
                      leavingForLogin.current = true;
                      saveTipDraft(where, { category, body });
                    }}
                  />
                ) : (
                  <div className="tw-dock__row">
                    <span className="tw-dock__scope" id={`${ids}-scope`}>
                      <Icon name="lock-keyhole" />
                      거주자만 읽어요 · 다른 거주자에게 작성자가 안 보여요
                    </span>
                    <ActionButton
                      type="submit"
                      className="wh-btn tw-dock__btn"
                      size="large"
                      loading={pending}
                      disabled={pending}
                      aria-describedby={`${ids}-scope`}
                    >
                      {editing ? "고치기" : "남기기"}
                    </ActionButton>
                  </div>
                )}
              </div>
            </Snackbar.AvoidOverlap>
          }
        >
          <div className="wh-pad tw-body">
            <h1 className="tw-title" tabIndex={-1}>
              다음에 살 사람에게 알려주고 싶은 것이 있나요?
            </h1>
            <div className="tw-field">
              <ChoiceChips
                name={`${ids}-category`}
                legend={<span className="wh-visually-hidden">종류</span>}
                options={CATEGORY_OPTIONS}
                value={category}
                onChange={(next) => {
                  setCategory(next);
                  if (errors.category) setErrors((old) => ({ ...old, category: undefined }));
                }}
                describedBy={errors.category ? `${ids}-category-error` : undefined}
              />
              {errors.category ? (
                <p className="wh-field-error" id={`${ids}-category-error`}>
                  {errors.category}
                </p>
              ) : null}
            </div>
            <div className="tw-field tw-textarea">
              <label className="wh-visually-hidden" htmlFor={`${ids}-body`}>
                팁 내용
              </label>
              <textarea
                ref={bodyRef}
                id={`${ids}-body`}
                className="wh-textarea tw-textarea__input"
                value={body}
                maxLength={TIP_BODY_MAX}
                placeholder="예: 택배 상자는 테이프를 떼고 펼쳐서 내놓으면 수거함이 덜 차요."
                readOnly={pending}
                aria-invalid={errors.body ? true : undefined}
                aria-describedby={`${ids}-count ${ids}-rule${errors.body ? ` ${ids}-body-error` : ""}`}
                onChange={(event) => {
                  setBody(event.target.value);
                  if (errors.body) setErrors((old) => ({ ...old, body: undefined }));
                }}
              />
              <span className="tw-textarea__count" id={`${ids}-count`}>
                {body.length} / {TIP_BODY_MAX}
              </span>
            </div>
            {errors.body ? (
              <p className="wh-field-error" id={`${ids}-body-error`}>
                {errors.body}
              </p>
            ) : null}
            <p className="wh-caption tw-rule" id={`${ids}-rule`}>
              특정인을 짐작할 수 있는 내용은 쓰지 말아 주세요.
            </p>
          </div>
        </Screen>
      </form>
      {dirty ? (
        <LeaveConfirm
          when={dirty}
          title="쓰던 팁이 사라져요"
          description="지금 나가면 적은 내용은 저장되지 않아요."
        />
      ) : null}
    </>
  );
}

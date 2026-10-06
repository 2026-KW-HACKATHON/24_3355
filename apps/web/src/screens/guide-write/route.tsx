// LF-14 기본 안내 쓰기 · lofi 33 (미리 보기 43은 guide-preview)
// 공개한 안내는 공개 내용을 두고 수정본에 저장합니다(D-12). 닫기는 수정본을 지우고(편집 취소) 공개 내용은 그대로입니다.
// 메모 검토(25)에서 오면 `?apply=`로 반영할 메모를 들고 와 위에 보여줍니다.
import { ActionButton, Dialog, Portal, Skeleton } from "@seed-design/react";
import {
  CreateGuideBody,
  GUIDE_BODY_MAX,
  GUIDE_TITLE_MAX,
  type Guide,
  type GuideRevision,
  type ManagedBuildingDetail,
  type UpdateGuideBody,
} from "@wolgyeham/contracts";
import { type FormEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { Icon } from "../../components/Icon";
import { BackButton, Dock, Screen, SoonNote, TopBar, useGoBack } from "../../components/Screen";
import { Delayed, EmptyState, LoadError, SkeletonLines } from "../../components/ScreenState";
import { ManagerGate } from "../../features/auth/ManagerGate";
import { applySearch, readApplyIds } from "../../features/guides/applyMemos";
import { CATEGORY, CATEGORY_ORDER } from "../../features/guides/categories";
import {
  clearLocalDraft,
  type DraftTarget,
  type GuideFormValues,
  loadLocalDraft,
  saveLocalDraft,
} from "../../features/guides/localDraft";
import { useBuildingMemos } from "../../features/guides/memos";
import {
  useCreateGuide,
  useDiscardRevision,
  useGuideRevision,
  useUpdateGuide,
} from "../../features/guides/queries";
import { type AppError, errorMessage, toAppError } from "../../lib/errors";
import "./guide-write.css";

type Field = "title" | "body";
type FieldErrors = Partial<Record<Field, string>>;

export function Component() {
  const { buildingId = "", guideId } = useParams();
  return (
    <ManagerGate buildingId={buildingId}>
      {(detail, me) => {
        if (!guideId) return <GuideForm detail={detail} userId={me.user.id} />;
        const guide = detail.guides.find((item) => item.id === guideId);
        if (!guide) return <WriteMissing detail={detail} />;
        if (guide.status === "published") {
          return <ReviseLoader key={guide.id} detail={detail} guide={guide} userId={me.user.id} />;
        }
        return <GuideForm key={guide.id} detail={detail} guide={guide} userId={me.user.id} />;
      }}
    </ManagerGate>
  );
}

/** 공개한 안내 고치기: 저장한 수정본을 먼저 받아 이어서 고칩니다. */
function ReviseLoader({
  detail,
  guide,
  userId,
}: {
  detail: ManagedBuildingDetail;
  guide: Guide;
  userId: string;
}) {
  const revision = useGuideRevision(guide.id);
  const base = `/manage/${detail.building.id}`;
  const shell = (children: ReactNode, busy = false) => (
    <Screen
      busy={busy}
      topbar={
        <TopBar
          start={<BackButton fallback={base} icon="x" label="닫기" />}
          title="기본 안내 고치기"
        />
      }
    >
      {children}
    </Screen>
  );
  if (revision.isError) {
    return shell(
      <LoadError onRetry={() => void revision.refetch()} retrying={revision.isFetching} />,
    );
  }
  if (revision.isPending) {
    return shell(
      <Delayed label="고치던 안내를 불러오는 중">
        <div className="wh-pad gw-skeleton">
          <Skeleton radius="16" height="72px" />
          <Skeleton radius="16" height="56px" />
          <Skeleton radius="16" height="180px" />
        </div>
      </Delayed>,
      true,
    );
  }
  return <GuideForm detail={detail} guide={guide} userId={userId} revision={revision.data} />;
}

/** 서버 초안(또는 수정본·새 안내의 빈 값)과, 이 기기에 남은 더 최근 입력. */
function startingValues(
  detail: ManagedBuildingDetail,
  guide: Guide | undefined,
  revision: GuideRevision | null | undefined,
  target: DraftTarget,
) {
  const local = loadLocalDraft(target);
  const used = new Set(detail.guides.map((item) => item.category));
  const source = revision ?? guide;
  const baseline: GuideFormValues = source
    ? { category: source.category, title: source.title, body: source.body }
    : {
        category: CATEGORY_ORDER.find((item) => !used.has(item)) ?? "recycling",
        title: "",
        body: "",
      };
  const serverTime = revision ? revision.savedAt : guide?.updatedAt;
  const useLocal = local && (!serverTime || local.savedAt > Date.parse(serverTime));
  const initial: GuideFormValues = useLocal
    ? { category: local.category, title: local.title, body: local.body }
    : baseline;
  return { baseline, initial };
}

function sameValues(a: GuideFormValues, b: GuideFormValues) {
  return a.category === b.category && a.title === b.title && a.body === b.body;
}

function validate(values: GuideFormValues): FieldErrors {
  const errors: FieldErrors = {};
  const title = values.title.trim();
  const body = values.body.trim();
  if (!title) errors.title = "제목을 적어 주세요";
  else if (title.length > GUIDE_TITLE_MAX)
    errors.title = `제목은 ${GUIDE_TITLE_MAX}자까지 쓸 수 있어요`;
  if (!body) errors.body = "내용을 적어 주세요";
  else if (body.length > GUIDE_BODY_MAX)
    errors.body = `내용은 ${GUIDE_BODY_MAX}자까지 쓸 수 있어요`;
  return errors;
}

function serverFieldErrors(error: AppError): FieldErrors {
  if (error.code !== "VALIDATION_FAILED") return {};
  const errors: FieldErrors = {};
  if ("title" in error.fields) errors.title = "제목을 확인해 주세요";
  if ("body" in error.fields) errors.body = "내용을 확인해 주세요";
  return errors;
}

function saveErrorMessage(error: AppError, revise: boolean): string {
  if (error.code === "NETWORK" || error.code === "INTERNAL_ERROR") {
    // 공개한 안내는 그대로이고, 쓴 내용은 화면과 이 기기에 남아 있습니다.
    return revise
      ? "저장하지 못했어요. 공개 중인 안내는 그대로예요. 다시 눌러 주세요"
      : "저장하지 못했어요. 다시 눌러 주세요";
  }
  if (error.code === "CONFLICT") {
    return revise
      ? "안내 상태가 바뀌었어요. 관리 홈에서 다시 열어 주세요"
      : "이미 공개한 안내라 여기서 고칠 수 없어요";
  }
  if (error.code === "VALIDATION_FAILED") return "입력한 내용을 확인해 주세요";
  return errorMessage(error);
}

function GuideForm({
  detail,
  guide,
  userId,
  revision,
}: {
  detail: ManagedBuildingDetail;
  guide?: Guide;
  userId: string;
  /** 공개한 안내를 고칠 때만: 저장한 수정본(없으면 null). */
  revision?: GuideRevision | null;
}) {
  const revise = guide?.status === "published";
  const { search } = useLocation();
  const applyIds = useMemo(() => (revise ? readApplyIds(search) : []), [revise, search]);
  const buildingId = detail.building.id;
  const guideId = guide?.id;
  const draft = useMemo<DraftTarget>(
    () => ({ userId, buildingId, guideId }),
    [userId, buildingId, guideId],
  );
  const base = `/manage/${buildingId}`;
  const navigate = useNavigate();
  const create = useCreateGuide(buildingId);
  const update = useUpdateGuide(buildingId, guide?.id ?? "");
  const discard = useDiscardRevision(guide?.id ?? "");
  const goBack = useGoBack(base);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [start] = useState(() => startingValues(detail, guide, revision, draft));
  const [values, setValues] = useState(start.initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string>();
  const [pasteHint, setPasteHint] = useState(false);
  const inFlight = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const ids = useId();
  const saving = create.isPending || update.isPending || discard.isPending;

  // 서버 값에서 달라지면 이 기기에 따로 둡니다. 다시 같아지면 지웁니다.
  useEffect(() => {
    if (sameValues(values, start.baseline)) clearLocalDraft(draft);
    else saveLocalDraft(draft, values);
  }, [draft, start.baseline, values]);

  function change<K extends keyof GuideFormValues>(field: K, value: GuideFormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (field === "title" || field === "body") {
      const key: Field = field;
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) change("body", values.body ? `${values.body}\n${text}` : text);
      setPasteHint(false);
    } catch {
      setPasteHint(true);
    }
    bodyRef.current?.focus();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    setSaveError(undefined);
    const found = validate(values);
    const parsed = CreateGuideBody.safeParse(values);
    if (found.title || found.body || !parsed.success) {
      setErrors(found);
      (found.title ? titleRef : bodyRef).current?.focus();
      return;
    }
    inFlight.current = true;
    try {
      let saved: Guide;
      if (revise && guide) {
        // 공개한 안내: 폼 전체를 수정본으로 저장합니다. 공개 내용은 ‘수정 공개’ 전까지 그대로입니다.
        saved = await update.mutateAsync(parsed.data);
      } else if (guide) {
        const patch: UpdateGuideBody = {};
        if (parsed.data.category !== guide.category) patch.category = parsed.data.category;
        if (parsed.data.title !== guide.title) patch.title = parsed.data.title;
        if (parsed.data.body !== guide.body) patch.body = parsed.data.body;
        saved = Object.keys(patch).length > 0 ? await update.mutateAsync(patch) : guide;
      } else {
        saved = await create.mutateAsync(parsed.data);
      }
      clearLocalDraft(draft);
      // 쓰기 ↔ 미리 보기는 기록을 바꿔 끼워서, 뒤로 가기가 관리 홈(또는 메모 검토)으로 가게 합니다.
      void navigate(`${base}/guides/${saved.id}/preview${applySearch(applyIds)}`, {
        replace: true,
      });
    } catch (error) {
      const appError = toAppError(error);
      setErrors(serverFieldErrors(appError));
      setSaveError(saveErrorMessage(appError, revise));
    } finally {
      inFlight.current = false;
    }
  }

  // 편집 취소(닫기). 저장한 수정본이 있거나 고친 게 있으면 한 번 묻고, 수정본만 지웁니다.
  const published: GuideFormValues | undefined = guide
    ? { category: guide.category, title: guide.title, body: guide.body }
    : undefined;
  const hasChanges = Boolean(revision) || (published ? !sameValues(values, published) : false);
  function requestCancel() {
    if (hasChanges) setCancelOpen(true);
    else goBack();
  }
  async function cancelRevision() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaveError(undefined);
    try {
      if (revision) await discard.mutateAsync();
      clearLocalDraft(draft);
      setCancelOpen(false);
      goBack();
    } catch {
      setCancelOpen(false);
      setSaveError("고치던 내용을 지우지 못했어요. 공개 중인 안내는 그대로예요. 다시 눌러 주세요");
    } finally {
      inFlight.current = false;
    }
  }

  const titleErrorId = `${ids}-title-error`;
  const bodyErrorId = `${ids}-body-error`;

  return (
    <form className="gw-form" onSubmit={submit} noValidate>
      <Screen
        topbar={
          <TopBar
            start={
              revise ? (
                <button
                  type="button"
                  className="wh-icon-btn"
                  aria-label="고치기 그만두기"
                  disabled={saving}
                  onClick={requestCancel}
                >
                  <Icon name="x" />
                </button>
              ) : (
                <BackButton fallback={base} icon="x" label="닫기" />
              )
            }
            title={revise ? "기본 안내 고치기" : "기본 안내 쓰기"}
            titleAs="h1"
          />
        }
        dock={
          <Dock hint="공개하기 전에 세입자가 볼 화면을 확인해요" error={saveError}>
            <ActionButton
              type="submit"
              className="wh-btn"
              size="large"
              loading={saving}
              disabled={saving}
            >
              미리 보기
            </ActionButton>
          </Dock>
        }
      >
        <div className="wh-pad">
          {revise ? (
            <div className="gw-revise" role="note">
              <Icon name="info" />
              <div>
                <p className="gw-revise__title">공개 중인 안내를 고치고 있어요</p>
                <p className="gw-revise__text">
                  ‘수정 공개’를 누르기 전까지 세입자에게는 지금 안내가 그대로 보여요.
                </p>
              </div>
            </div>
          ) : null}
          {revise && applyIds.length > 0 ? (
            <ApplyMemos buildingId={buildingId} guideId={guide?.id ?? ""} ids={applyIds} />
          ) : null}
          <div className="gw-paste">
            <Icon name="clipboard-paste" />
            <span className="gw-paste__text">카톡으로 보냈던 문구를 그대로 붙여넣어도 돼요</span>
            <button type="button" className="gw-paste__btn" onClick={paste}>
              붙여넣기
            </button>
          </div>

          <fieldset className="gw-fieldset">
            <legend className="wh-field-label">종류</legend>
            <div className="gw-chips">
              {CATEGORY_ORDER.map((category) => (
                <label key={category} className="gw-chip">
                  <input
                    type="radio"
                    name="category"
                    value={category}
                    checked={values.category === category}
                    onChange={() => change("category", category)}
                  />
                  <span>{CATEGORY[category].label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="gw-field">
            <label className="wh-field-label" htmlFor={`${ids}-title`}>
              제목
              <span className="wh-field-label__count" aria-hidden="true">
                {values.title.length}/{GUIDE_TITLE_MAX}
              </span>
            </label>
            <input
              ref={titleRef}
              id={`${ids}-title`}
              className="wh-input"
              value={values.title}
              maxLength={GUIDE_TITLE_MAX}
              placeholder="예: 분리수거함은 주차장 안쪽에 있어요"
              autoComplete="off"
              enterKeyHint="next"
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={errors.title ? titleErrorId : undefined}
              onChange={(event) => change("title", event.target.value)}
            />
            {errors.title ? (
              <p className="wh-field-error" id={titleErrorId}>
                {errors.title}
              </p>
            ) : null}
          </div>

          <div className="gw-field gw-field--body">
            <label className="wh-field-label" htmlFor={`${ids}-body`}>
              내용
              <span className="wh-field-label__count" aria-hidden="true">
                {values.body.length}/{GUIDE_BODY_MAX}
              </span>
            </label>
            <textarea
              ref={bodyRef}
              id={`${ids}-body`}
              className="wh-textarea"
              value={values.body}
              maxLength={GUIDE_BODY_MAX}
              placeholder={"세입자에게 보내던 안내를 적어 주세요.\n줄바꿈은 그대로 보여요."}
              aria-invalid={errors.body ? true : undefined}
              aria-describedby={
                [errors.body ? bodyErrorId : "", pasteHint ? `${ids}-paste-hint` : ""]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
              onChange={(event) => change("body", event.target.value)}
            />
            {errors.body ? (
              <p className="wh-field-error" id={bodyErrorId}>
                {errors.body}
              </p>
            ) : null}
            {pasteHint ? (
              <p className="wh-caption gw-paste-hint" id={`${ids}-paste-hint`}>
                내용 칸을 길게 눌러 ‘붙여넣기’를 골라 주세요
              </p>
            ) : null}
          </div>

          <div className="gw-extra">
            <button
              type="button"
              className="gw-photo-add"
              disabled
              aria-label="사진 추가"
              aria-describedby={`${ids}-photo-soon`}
            >
              <Icon name="image-plus" />
            </button>
            <div className="gw-extra__notes">
              <SoonNote id={`${ids}-photo-soon`}>사진 추가는 다음 업데이트에서 열려요</SoonNote>
              <span className="wh-caption">
                {revise
                  ? "쓰는 중인 내용은 이 기기에, 미리 보기를 누르면 수정본으로 저장돼요"
                  : "쓰는 중인 내용은 이 기기에 따로 저장돼요"}
              </span>
            </div>
          </div>
        </div>
      </Screen>
      {revise ? (
        <Dialog.Root
          open={cancelOpen}
          onOpenChange={(next) => {
            if (!next && !discard.isPending) setCancelOpen(false);
          }}
        >
          <Portal>
            <Dialog.Positioner>
              <Dialog.Backdrop />
              <Dialog.Content>
                <Dialog.Header>
                  <Dialog.Title>고치던 내용을 지울까요?</Dialog.Title>
                  <Dialog.Description>
                    지우면 공개 중인 안내는 그대로 두고 고치던 내용만 사라져요. 메모는 확인 전으로
                    남아요.
                  </Dialog.Description>
                </Dialog.Header>
                <Dialog.Footer>
                  <div className="wh-btn-row wh-leave">
                    <ActionButton
                      className="wh-btn wh-btn--neutral"
                      size="large"
                      variant="neutralWeak"
                      disabled={discard.isPending}
                      onClick={() => setCancelOpen(false)}
                    >
                      계속 고치기
                    </ActionButton>
                    <ActionButton
                      className="wh-btn"
                      size="large"
                      variant="criticalSolid"
                      loading={discard.isPending}
                      disabled={discard.isPending}
                      onClick={() => void cancelRevision()}
                    >
                      지우고 나가기
                    </ActionButton>
                  </div>
                </Dialog.Footer>
              </Dialog.Content>
            </Dialog.Positioner>
          </Portal>
        </Dialog.Root>
      ) : null}
    </form>
  );
}

/** 메모 검토(25)에서 ‘안내에 반영’으로 왔을 때 반영할 메모. 고치면서 볼 수 있게 위에 둡니다. */
function ApplyMemos({
  buildingId,
  guideId,
  ids,
}: {
  buildingId: string;
  guideId: string;
  ids: readonly string[];
}) {
  const pending = useBuildingMemos(buildingId, "pending");
  // 불러오는 중·실패도 자리를 비우지 않고 알립니다(반영할 메모를 들고 온 것을 잊지 않게, 리뷰 L3).
  if (!pending.data) {
    return (
      <section className="gw-apply" aria-labelledby="gw-apply-title" aria-busy={pending.isPending}>
        <h2 className="gw-apply__title" id="gw-apply-title">
          반영할 메모
        </h2>
        {pending.isError ? (
          <p className="wh-caption gw-apply__gone" role="status">
            메모를 불러오지 못했어요.{" "}
            <button
              type="button"
              className="wh-text-action"
              disabled={pending.isFetching}
              onClick={() => void pending.refetch()}
            >
              다시 시도
            </button>
          </p>
        ) : (
          <Delayed label="반영할 메모를 불러오는 중">
            <SkeletonLines lines={2} />
          </Delayed>
        )}
      </section>
    );
  }
  const memos = pending.data.filter((memo) => memo.guideId === guideId && ids.includes(memo.id));
  const gone = ids.length - memos.length;
  return (
    <section className="gw-apply" aria-labelledby="gw-apply-title">
      <h2 className="gw-apply__title" id="gw-apply-title">
        반영할 메모
      </h2>
      {memos.map((memo) => (
        <p key={memo.id} className="gw-apply__memo">
          {memo.body}
        </p>
      ))}
      {gone > 0 ? (
        <p className="wh-caption gw-apply__gone">다른 곳에서 이미 처리한 메모 {gone}개는 뺐어요</p>
      ) : null}
    </section>
  );
}

/** 없는 안내(지웠거나 다른 건물). */
function WriteMissing({ detail }: { detail: ManagedBuildingDetail }) {
  const base = `/manage/${detail.building.id}`;
  return (
    <Screen
      topbar={
        <TopBar
          start={<BackButton fallback={base} icon="x" label="닫기" />}
          title="기본 안내 쓰기"
        />
      }
      dock={
        <Dock>
          <ActionButton asChild className="wh-btn" size="large">
            <Link to={base}>관리 홈으로</Link>
          </ActionButton>
        </Dock>
      }
    >
      <div className="wh-pad wh-state-top">
        <EmptyState
          icon="file-text"
          title="이 안내를 찾을 수 없어요"
          description="이미 지웠거나 다른 건물의 안내일 수 있어요."
        />
      </div>
    </Screen>
  );
}

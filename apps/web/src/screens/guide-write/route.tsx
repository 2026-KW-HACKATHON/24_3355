// LF-14 기본 안내 쓰기 · lofi 33 (미리 보기 43은 guide-preview)
import { ActionButton } from "@seed-design/react";
import {
  CreateGuideBody,
  GUIDE_BODY_MAX,
  GUIDE_TITLE_MAX,
  type Guide,
  type ManagedBuildingDetail,
  type UpdateGuideBody,
} from "@wolgyeham/contracts";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Icon } from "../../components/Icon";
import { BackButton, Dock, Screen, SoonNote, TopBar } from "../../components/Screen";
import { EmptyState } from "../../components/ScreenState";
import { ManagerGate } from "../../features/auth/ManagerGate";
import { CATEGORY, CATEGORY_ORDER } from "../../features/guides/categories";
import {
  clearLocalDraft,
  type GuideFormValues,
  loadLocalDraft,
  saveLocalDraft,
} from "../../features/guides/localDraft";
import { useCreateGuide, useUpdateGuide } from "../../features/guides/queries";
import { type AppError, errorMessage, toAppError } from "../../lib/errors";
import "./guide-write.css";

type Field = "title" | "body";
type FieldErrors = Partial<Record<Field, string>>;

export function Component() {
  const { buildingId = "", guideId } = useParams();
  return (
    <ManagerGate buildingId={buildingId}>
      {(detail) => {
        if (!guideId) return <GuideForm detail={detail} />;
        const guide = detail.guides.find((item) => item.id === guideId);
        if (!guide) return <WriteState detail={detail} kind="missing" />;
        if (guide.status === "published")
          return <WriteState detail={detail} kind="published" guide={guide} />;
        return <GuideForm key={guide.id} detail={detail} guide={guide} />;
      }}
    </ManagerGate>
  );
}

/** 서버 초안(또는 새 안내의 빈 값)과, 이 기기에 남은 더 최근 입력. */
function startingValues(detail: ManagedBuildingDetail, guide: Guide | undefined) {
  const buildingId = detail.building.id;
  const local = loadLocalDraft(buildingId, guide?.id);
  const used = new Set(detail.guides.map((item) => item.category));
  const baseline: GuideFormValues = guide
    ? { category: guide.category, title: guide.title, body: guide.body }
    : {
        category: CATEGORY_ORDER.find((item) => !used.has(item)) ?? "recycling",
        title: "",
        body: "",
      };
  const useLocal = local && (!guide || local.savedAt > Date.parse(guide.updatedAt));
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

function saveErrorMessage(error: AppError): string {
  if (error.code === "NETWORK" || error.code === "INTERNAL_ERROR") {
    return "저장하지 못했어요. 다시 눌러 주세요";
  }
  if (error.code === "CONFLICT") return "이미 공개한 안내라 여기서 고칠 수 없어요";
  if (error.code === "VALIDATION_FAILED") return "입력한 내용을 확인해 주세요";
  return errorMessage(error);
}

function GuideForm({ detail, guide }: { detail: ManagedBuildingDetail; guide?: Guide }) {
  const buildingId = detail.building.id;
  const base = `/manage/${buildingId}`;
  const navigate = useNavigate();
  const create = useCreateGuide(buildingId);
  const update = useUpdateGuide(buildingId, guide?.id ?? "");
  const [start] = useState(() => startingValues(detail, guide));
  const [values, setValues] = useState(start.initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string>();
  const [pasteHint, setPasteHint] = useState(false);
  const inFlight = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const ids = useId();
  const saving = create.isPending || update.isPending;

  // 서버 값에서 달라지면 이 기기에 따로 둡니다. 다시 같아지면 지웁니다.
  useEffect(() => {
    if (sameValues(values, start.baseline)) clearLocalDraft(buildingId, guide?.id);
    else saveLocalDraft(buildingId, guide?.id, values);
  }, [buildingId, guide?.id, start.baseline, values]);

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
      if (guide) {
        const patch: UpdateGuideBody = {};
        if (parsed.data.category !== guide.category) patch.category = parsed.data.category;
        if (parsed.data.title !== guide.title) patch.title = parsed.data.title;
        if (parsed.data.body !== guide.body) patch.body = parsed.data.body;
        saved = Object.keys(patch).length > 0 ? await update.mutateAsync(patch) : guide;
      } else {
        saved = await create.mutateAsync(parsed.data);
      }
      clearLocalDraft(buildingId, guide?.id);
      // 쓰기 ↔ 미리 보기는 기록을 바꿔 끼워서, 뒤로 가기가 관리 홈으로 가게 합니다.
      void navigate(`${base}/guides/${saved.id}/preview`, { replace: true });
    } catch (error) {
      const appError = toAppError(error);
      setErrors(serverFieldErrors(appError));
      setSaveError(saveErrorMessage(appError));
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
            start={<BackButton fallback={base} icon="x" label="닫기" />}
            title="기본 안내 쓰기"
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
              <span className="wh-caption">쓰는 중인 내용은 이 기기에 따로 저장돼요</span>
            </div>
          </div>
        </div>
      </Screen>
    </form>
  );
}

function WriteState({
  detail,
  kind,
  guide,
}: {
  detail: ManagedBuildingDetail;
  kind: "missing" | "published";
  guide?: Guide;
}) {
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
          <div className="wh-btn-row">
            {guide ? (
              <ActionButton
                asChild
                className="wh-btn wh-btn--neutral"
                size="large"
                variant="neutralWeak"
              >
                <Link to={`/b/${guide.buildingId}/guides/${guide.id}`}>세입자 화면 보기</Link>
              </ActionButton>
            ) : null}
            <ActionButton asChild className="wh-btn wh-grow" size="large">
              <Link to={base}>관리 홈으로</Link>
            </ActionButton>
          </div>
        </Dock>
      }
    >
      <div className="wh-pad wh-state-top">
        {kind === "published" ? (
          <EmptyState
            icon="lock"
            title="공개한 안내는 아직 여기서 고칠 수 없어요"
            description="공개한 안내 고치기는 다음 업데이트에서 열려요."
          />
        ) : (
          <EmptyState
            icon="file-text"
            title="이 안내를 찾을 수 없어요"
            description="이미 지웠거나 다른 건물의 안내일 수 있어요."
          />
        )}
      </div>
    </Screen>
  );
}

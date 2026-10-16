// LF-14 기본 안내 쓰기 · 카톡 통째로 붙여넣기(D-37). 새 안내를 쓸 때만 엽니다.
// 붙여넣기 → 나눠 보기(Gemini) → 초안 카드 고치기·빼기 → 초안으로 저장. 공개는 하지 않고, 저장한 초안은 관리 홈에서
// 하나씩 미리 보고 공개합니다(43).
import { ActionButton } from "@seed-design/react";
import {
  GUIDE_BODY_MAX,
  GUIDE_SPLIT_TEXT_MAX,
  GUIDE_TITLE_MAX,
  type ManagedBuildingDetail,
} from "@wolgyeham/contracts";
import { useId, useReducer, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Icon } from "../../components/Icon";
import { Dock, Screen, TopBar } from "../../components/Screen";
import { EmptyState } from "../../components/ScreenState";
import { useToast } from "../../components/useToast";
import { useSplitGuides } from "../../features/assist/queries";
import {
  type CardErrors,
  INITIAL_SPLIT,
  type SplitCard,
  splitErrorMessage,
  splitReducer,
  toCreateBody,
  validateCard,
} from "../../features/assist/splitDrafts";
import { CATEGORY, CATEGORY_ORDER } from "../../features/guides/categories";
import { useCreateGuide } from "../../features/guides/queries";
import { errorMessage, toAppError } from "../../lib/errors";

export function SplitPaste({
  detail,
  onClose,
}: {
  detail: ManagedBuildingDetail;
  /** 직접 쓰기(LF-14 폼)로 돌아갑니다. */
  onClose: () => void;
}) {
  const buildingId = detail.building.id;
  const base = `/manage/${buildingId}`;
  const navigate = useNavigate();
  const toast = useToast();
  const split = useSplitGuides(buildingId);
  const create = useCreateGuide(buildingId);
  const [state, dispatch] = useReducer(splitReducer, INITIAL_SPLIT);
  const [error, setError] = useState<string>();
  const [cardErrors, setCardErrors] = useState<Record<string, CardErrors>>({});
  const [savedCount, setSavedCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [pasteHint, setPasteHint] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const ids = useId();

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) dispatch({ type: "text", text: text.slice(0, GUIDE_SPLIT_TEXT_MAX) });
      setPasteHint(false);
    } catch {
      setPasteHint(true);
    }
    textRef.current?.focus();
  }

  async function runSplit() {
    if (split.isPending) return;
    setError(undefined);
    const text = state.text.trim();
    if (!text) {
      setError("나눌 글을 붙여넣어 주세요");
      textRef.current?.focus();
      return;
    }
    try {
      const result = await split.mutateAsync(text);
      setCardErrors({});
      setSavedCount(0);
      dispatch({ type: "result", result });
    } catch (caught) {
      setError(splitErrorMessage(toAppError(caught)));
    }
  }

  async function saveAll() {
    if (saving) return;
    setError(undefined);
    const found: Record<string, CardErrors> = {};
    for (const card of state.cards) {
      const errors = validateCard(card);
      if (errors.title || errors.body) found[card.key] = errors;
    }
    setCardErrors(found);
    if (Object.keys(found).length > 0) {
      setError("빨간 칸을 확인해 주세요");
      return;
    }
    setSaving(true);
    let saved = savedCount;
    try {
      for (const card of state.cards) {
        await create.mutateAsync(toCreateBody(card));
        saved += 1;
        setSavedCount(saved);
        dispatch({ type: "saved", key: card.key });
      }
      toast(`초안 ${saved}개를 저장했어요. 하나씩 미리 보고 공개해 주세요`);
      void navigate(base, { replace: true });
    } catch (caught) {
      const message = errorMessage(caught);
      setError(saved > 0 ? `초안 ${saved}개는 저장했어요. 남은 초안은 다시 눌러 주세요` : message);
    } finally {
      setSaving(false);
    }
  }

  if (state.step === "paste") {
    return (
      <Screen
        busy={split.isPending}
        topbar={
          <TopBar
            start={
              <button
                type="button"
                className="wh-icon-btn"
                aria-label="직접 쓰기로 돌아가기"
                onClick={onClose}
              >
                <Icon name="x" />
              </button>
            }
            title="카톡 통째로 붙여넣기"
            titleAs="h1"
          />
        }
        dock={
          <Dock hint="나눈 뒤에 하나씩 고치고 초안으로 저장해요" error={error}>
            <ActionButton
              type="button"
              className="wh-btn"
              size="large"
              loading={split.isPending}
              disabled={split.isPending}
              onClick={() => void runSplit()}
            >
              {split.isPending ? "나누는 중" : "나눠 보기"}
            </ActionButton>
          </Dock>
        }
      >
        <div className="wh-pad">
          <p className="gw-split-note" role="note">
            <Icon name="info" />
            <span>
              정리를 위해 글을 Google(Gemini)에 보내요. 전화번호·이메일·계좌번호·현관 비밀번호는
              가리고 보내지만, 비밀번호는 지우고 붙여넣는 편이 안전해요.
            </span>
          </p>
          <div className="gw-paste">
            <Icon name="clipboard-paste" />
            <span className="gw-paste__text">
              세입자에게 보내던 카톡을 한꺼번에 붙여넣어 주세요
            </span>
            <button type="button" className="gw-paste__btn" onClick={paste}>
              붙여넣기
            </button>
          </div>
          <div className="gw-field gw-field--body">
            <label className="wh-field-label" htmlFor={`${ids}-text`}>
              붙여넣은 글
              <span className="wh-field-label__count" aria-hidden="true">
                {state.text.length}/{GUIDE_SPLIT_TEXT_MAX}
              </span>
            </label>
            <textarea
              ref={textRef}
              id={`${ids}-text`}
              className="wh-textarea gw-split-text"
              value={state.text}
              maxLength={GUIDE_SPLIT_TEXT_MAX}
              placeholder={
                "예: 분리수거는 주차장 안쪽에 내놓아 주세요.\n택배는 1층 선반에 두면 돼요.\n보일러가 안 되면 관리인에게 연락 주세요."
              }
              aria-describedby={pasteHint ? `${ids}-paste-hint` : undefined}
              disabled={split.isPending}
              onChange={(event) => dispatch({ type: "text", text: event.target.value })}
            />
            {pasteHint ? (
              <p className="wh-caption gw-paste-hint" id={`${ids}-paste-hint`}>
                글 칸을 길게 눌러 ‘붙여넣기’를 골라 주세요
              </p>
            ) : null}
          </div>
          <p className="wh-caption gw-extra">
            쓰신 문장은 고치지 않고 주제별로 나누기만 해요. 저장 전에 꼭 확인해 주세요.
          </p>
        </div>
      </Screen>
    );
  }

  const count = state.cards.length;
  return (
    <Screen
      busy={saving}
      topbar={
        <TopBar
          start={
            <button
              type="button"
              className="wh-icon-btn"
              aria-label="붙여넣은 글로 돌아가기"
              disabled={saving}
              onClick={() => {
                setError(undefined);
                dispatch({ type: "back" });
              }}
            >
              <Icon name="chevron-left" />
            </button>
          }
          title="나눈 초안 확인"
          titleAs="h1"
        />
      }
      dock={
        count > 0 ? (
          <Dock hint="초안은 공개하기 전까지 세입자에게 보이지 않아요" error={error}>
            <ActionButton
              type="button"
              className="wh-btn"
              size="large"
              loading={saving}
              disabled={saving}
              onClick={() => void saveAll()}
            >
              초안 {count}개 저장
            </ActionButton>
          </Dock>
        ) : (
          <Dock error={error}>
            <ActionButton type="button" className="wh-btn" size="large" onClick={onClose}>
              직접 쓰기
            </ActionButton>
          </Dock>
        )
      }
    >
      <div className="wh-pad">
        {state.unplacedCount > 0 ? (
          <p className="gw-split-warn" role="note">
            <Icon name="triangle-alert" />
            <span>
              가린 번호 {state.unplacedCount}개가 초안에 들어가지 않았어요. 필요하면 원문을 보고
              채워 주세요.
            </span>
          </p>
        ) : null}
        {count === 0 ? (
          <EmptyState
            icon="file-text"
            title={savedCount > 0 ? "모두 저장했어요" : "나눌 안내를 찾지 못했어요"}
            description={
              savedCount > 0
                ? "관리 홈에서 하나씩 미리 보고 공개해 주세요."
                : "글을 조금 고쳐 다시 나누거나, 직접 써 주세요."
            }
          />
        ) : (
          <ol className="gw-split-list" aria-label={`나눈 초안 ${count}개`}>
            {state.cards.map((card, index) => (
              <SplitCardItem
                key={card.key}
                card={card}
                index={index}
                errors={cardErrors[card.key] ?? {}}
                disabled={saving}
                onChange={(patch) => {
                  dispatch({ type: "edit", key: card.key, patch });
                  setCardErrors((prev) => {
                    const next = { ...prev };
                    delete next[card.key];
                    return next;
                  });
                }}
                onRemove={() => dispatch({ type: "remove", key: card.key })}
              />
            ))}
          </ol>
        )}
      </div>
    </Screen>
  );
}

function SplitCardItem({
  card,
  index,
  errors,
  disabled,
  onChange,
  onRemove,
}: {
  card: SplitCard;
  index: number;
  errors: CardErrors;
  disabled: boolean;
  onChange: (patch: Partial<Omit<SplitCard, "key">>) => void;
  onRemove: () => void;
}) {
  const ids = useId();
  const name = `초안 ${index + 1}`;
  return (
    <li className="gw-split-card">
      <div className="gw-split-card__head">
        <span className="gw-split-card__index">{name}</span>
        <button
          type="button"
          className="wh-text-action gw-split-card__remove"
          aria-label={`${name} 빼기`}
          disabled={disabled}
          onClick={onRemove}
        >
          <Icon name="x" />
          빼기
        </button>
      </div>
      <fieldset className="gw-fieldset gw-split-card__kind">
        <legend className="wh-field-label">종류</legend>
        <div className="gw-chips">
          {CATEGORY_ORDER.map((category) => (
            <label key={category} className="gw-chip">
              <input
                type="radio"
                name={`${ids}-category`}
                value={category}
                checked={card.category === category}
                disabled={disabled}
                onChange={() => onChange({ category })}
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
            {card.title.length}/{GUIDE_TITLE_MAX}
          </span>
        </label>
        <input
          id={`${ids}-title`}
          className="wh-input"
          value={card.title}
          maxLength={GUIDE_TITLE_MAX}
          autoComplete="off"
          disabled={disabled}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? `${ids}-title-error` : undefined}
          onChange={(event) => onChange({ title: event.target.value })}
        />
        {errors.title ? (
          <p className="wh-field-error" id={`${ids}-title-error`}>
            {errors.title}
          </p>
        ) : null}
      </div>
      <div className="gw-field gw-field--body">
        <label className="wh-field-label" htmlFor={`${ids}-body`}>
          내용
          <span className="wh-field-label__count" aria-hidden="true">
            {card.body.length}/{GUIDE_BODY_MAX}
          </span>
        </label>
        <textarea
          id={`${ids}-body`}
          className="wh-textarea"
          value={card.body}
          maxLength={GUIDE_BODY_MAX}
          disabled={disabled}
          aria-invalid={errors.body ? true : undefined}
          aria-describedby={errors.body ? `${ids}-body-error` : undefined}
          onChange={(event) => onChange({ body: event.target.value })}
        />
        {errors.body ? (
          <p className="wh-field-error" id={`${ids}-body-error`}>
            {errors.body}
          </p>
        ) : null}
      </div>
    </li>
  );
}

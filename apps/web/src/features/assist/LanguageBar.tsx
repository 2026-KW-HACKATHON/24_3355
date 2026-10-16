import { useId } from "react";
import { Icon } from "../../components/Icon";
import { LANG_OPTIONS, parseLang } from "./contentLang";
import type { TranslatedContent } from "./translated";
import "./language-bar.css";

// 공개 안내·공지 상세 위의 보기 언어(D-37). 번역을 끈 환경에서는 그리지 않습니다. 번역은 기계 번역이라고 밝히고,
// 언제든 원문(한국어)으로 돌아갈 수 있게 합니다.
export function LanguageBar({
  content,
}: {
  content: Pick<
    TranslatedContent,
    "enabled" | "chosen" | "setLang" | "status" | "retry" | "retrying"
  >;
}) {
  const id = useId();
  if (!content.enabled) return null;
  const { chosen, status } = content;
  return (
    <div className="lang-bar">
      <div className="lang-bar__row">
        <Icon name="globe" />
        <label className="lang-bar__label" htmlFor={`${id}-lang`}>
          보기 언어 <span lang="en">Language</span>
        </label>
        <select
          id={`${id}-lang`}
          className="lang-bar__select"
          value={chosen ?? ""}
          onChange={(event) => content.setLang(parseLang(event.target.value))}
        >
          {LANG_OPTIONS.map((option) => (
            <option key={option.htmlLang} value={option.value ?? ""} lang={option.htmlLang}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div aria-live="polite">
        {status === "loading" ? (
          <p className="lang-bar__note" role="status">
            번역하는 중이에요. 그동안 원문을 보여 드려요.
          </p>
        ) : null}
        {status === "error" ? (
          <p className="lang-bar__note lang-bar__note--error" role="status">
            번역을 불러오지 못해 원문을 보여 드려요.
            <button
              type="button"
              className="wh-text-action"
              disabled={content.retrying}
              onClick={content.retry}
            >
              다시 시도
            </button>
          </p>
        ) : null}
        {status === "translated" ? (
          <p className="lang-bar__note">
            <span className="wh-badge wh-badge--gray">기계 번역</span>
            <span>틀릴 수 있어요. 정확한 내용은 원문을 봐 주세요.</span>
            <button type="button" className="wh-text-action" onClick={() => content.setLang(null)}>
              원문 보기
            </button>
          </p>
        ) : null}
      </div>
    </div>
  );
}

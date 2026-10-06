import { Icon } from "../../components/Icon";
import { CONSENT_DOCS, type ConsentDoc } from "./ConsentSheet";
import "./consent.css";

export type ConsentValue = Readonly<Record<ConsentDoc, boolean>>;

export const NO_CONSENT: ConsentValue = { terms: false, privacy: false };

export function allAgreed(value: ConsentValue): boolean {
  return value.terms && value.privacy;
}

const ROWS: readonly ConsentDoc[] = ["terms", "privacy"];

/**
 * 로그인 전 필수 동의 두 항목과 ‘모두 동의해요’, 항목마다 ‘보기’(lofi 16). 연결 2/2(16)는 화면 안에, 다른 로그인
 * 입구는 동의 시트(`LoginConsentSheet`) 안에 둡니다. ‘보기’를 누르면 `onView`로 요약을 엽니다.
 */
export function ConsentChecks({
  value,
  onChange,
  onView,
}: {
  value: ConsentValue;
  onChange: (value: ConsentValue) => void;
  onView: (doc: ConsentDoc) => void;
}) {
  return (
    <fieldset className="au-consent">
      <legend className="wh-visually-hidden">약관 동의</legend>
      <label className="au-check au-check--all">
        <input
          type="checkbox"
          checked={allAgreed(value)}
          onChange={(event) =>
            onChange({ terms: event.target.checked, privacy: event.target.checked })
          }
        />
        <span className="au-check__box" aria-hidden="true">
          <Icon name="check" strokeWidth={3} />
        </span>
        모두 동의해요
      </label>
      {ROWS.map((doc) => (
        <div className="au-check-row" key={doc}>
          <label className="au-check">
            <input
              type="checkbox"
              checked={value[doc]}
              onChange={(event) => onChange({ ...value, [doc]: event.target.checked })}
            />
            <span className="au-check__box" aria-hidden="true">
              <Icon name="check" strokeWidth={3} />
            </span>
            <span>
              <span className="au-check__req">필수</span>
              {CONSENT_DOCS[doc].label}
            </span>
          </label>
          <button
            type="button"
            className="au-check__view"
            aria-label={`${CONSENT_DOCS[doc].label} 보기`}
            onClick={() => onView(doc)}
          >
            보기
          </button>
        </div>
      ))}
    </fieldset>
  );
}

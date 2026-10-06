import type { ReactNode } from "react";
import { Icon } from "./Icon";
import "./choice-chips.css";

/**
 * 하나를 고르는 칩(lofi .chips). 라디오라 화살표 키로 옮기고, `optional`이면 고른 칩을 다시 눌러 뺄 수 있습니다.
 * 고른 칩은 색 + 체크 표시 + 굵기로 알립니다(색만으로 구분하지 않음).
 */
export function ChoiceChips<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  optional = false,
  describedBy,
  disabled = false,
}: {
  name: string;
  legend: ReactNode;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T | null) => void;
  optional?: boolean;
  /** 고르지 않았을 때의 오류 문구 id. */
  describedBy?: string | undefined;
  disabled?: boolean;
}) {
  return (
    <fieldset className="wh-chips-field" aria-describedby={describedBy} disabled={disabled}>
      <legend className="wh-field-label wh-chips-field__legend">{legend}</legend>
      <div className="wh-chips">
        {options.map((option) => {
          const checked = value === option.value;
          return (
            <label key={option.value} className="wh-chip">
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                onClick={() => {
                  // 이미 고른 칩을 다시 누르면(선택 항목만) 뺍니다. change 이벤트는 오지 않습니다.
                  if (optional && checked) onChange(null);
                }}
              />
              <span className="wh-chip__face">
                {checked ? <Icon name="check" strokeWidth={2.4} /> : null}
                {option.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

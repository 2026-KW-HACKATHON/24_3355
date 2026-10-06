import { JOIN_CODE_LENGTH } from "@wolgyeham/contracts";

const SLOTS = Array.from({ length: JOIN_CODE_LENGTH }, (_, index) => `slot-${index + 1}`);

/**
 * 6칸으로 나눠 보여주는 코드(lofi .otp). 글자는 옆의 실제 텍스트·입력칸이 전하므로 칸은 장식입니다.
 * `label`을 주면 칸 묶음 자체를 코드 한 덩어리로 읽습니다(가입코드 보기 26·39).
 */
export function CodeCells({
  value,
  label,
  compact = false,
  input = false,
  activeIndex,
  invalid = false,
  className,
}: {
  value: string;
  label?: string;
  compact?: boolean;
  /** 입력칸 뒤에 그리는 칸(채운 칸·입력 중인 칸 모양을 씀). */
  input?: boolean;
  /** 입력 중인 칸(입력칸에 포커스가 있을 때). */
  activeIndex?: number | undefined;
  invalid?: boolean;
  className?: string;
}) {
  const classes = [
    "wh-code",
    compact ? "wh-code--compact" : "",
    invalid ? "wh-code--invalid" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  // 칸은 자리(1~6번째)가 곧 정체라 자리 이름을 key로 씁니다.
  const cells = SLOTS.map((slot, index) => ({ slot, char: value[index] ?? "" }));
  return (
    <div
      className={classes}
      {...(label ? { role: "img", "aria-label": `${label} ${value.split("").join(" ")}` } : {})}
      aria-hidden={label ? undefined : true}
    >
      {cells.map(({ slot, char }, index) => (
        <span
          key={slot}
          className={[
            "wh-code__cell",
            input && char ? "wh-code__cell--filled" : "",
            index === activeIndex ? "wh-code__cell--active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {char}
        </span>
      ))}
    </div>
  );
}

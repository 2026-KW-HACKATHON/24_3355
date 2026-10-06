import type { Tip } from "@wolgyeham/contracts";
import type { ReactNode } from "react";
import { Icon } from "../../components/Icon";
import { formatTipMonth, TIP_CATEGORY_LABEL } from "./labels";
import "./tips.css";

/**
 * 거주자가 남긴 팁 한 장(lofi 04 .tip). 작성자는 보이지 않고 작성 월만 씁니다.
 * 내 팁에만 ‘내 팁’과 고치기·지우기(`onMenu`), 남의 팁에는 신고(`onMenu`)를 둡니다.
 */
export function TipCard({
  tip,
  onMenu,
  extraBadge,
  footer,
}: {
  tip: Pick<Tip, "id" | "category" | "body" | "createdMonth" | "mine">;
  onMenu?: (() => void) | undefined;
  extraBadge?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <article className={tip.mine ? "tp-card tp-card--mine" : "tp-card"}>
      <div className="tp-card__meta">
        <span className="tp-card__badges">
          <span className="wh-badge wh-badge--gray">{TIP_CATEGORY_LABEL[tip.category]}</span>
          {tip.mine ? <span className="wh-badge wh-badge--navy">내 팁</span> : null}
          {extraBadge}
        </span>
        <span className="tp-card__side">
          <span className="wh-caption">{formatTipMonth(tip.createdMonth)}</span>
          {onMenu ? (
            <button
              type="button"
              className="tp-card__more"
              aria-label={tip.mine ? "내 팁 고치기·지우기" : "이 팁 신고하기"}
              aria-haspopup="dialog"
              onClick={onMenu}
            >
              <Icon name="ellipsis" />
            </button>
          ) : null}
        </span>
      </div>
      <p className="tp-card__body">{tip.body}</p>
      {footer}
    </article>
  );
}

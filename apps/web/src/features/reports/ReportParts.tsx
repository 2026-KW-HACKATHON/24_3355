import type { ReportStatus } from "@wolgyeham/contracts";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Icon } from "../../components/Icon";
import { REPORT_STATUS } from "./labels";
import "./reports.css";

const BADGE_CLASS = {
  received: "wh-badge rp-badge--received",
  checked: "wh-badge rp-badge--checked",
  done: "wh-badge wh-badge--done",
  hard: "wh-badge wh-badge--hard",
} as const;

/** 상태 배지. 색과 글자를 함께 씁니다(접수됨·확인함·처리 완료·처리가 어려움). */
export function ReportStatusBadge({
  status,
  label,
  className,
}: {
  status: ReportStatus;
  /** ‘현재’처럼 다른 글자를 같은 색으로 쓸 때. */
  label?: string;
  className?: string;
}) {
  const { badge, icon, label: statusLabel } = REPORT_STATUS[status];
  return (
    <span className={className ? `${BADGE_CLASS[badge]} ${className}` : BADGE_CLASS[badge]}>
      {icon && !label ? <Icon name={icon} /> : null}
      {label ?? statusLabel}
    </span>
  );
}

/** 보낸 내용(21)·받은 내용 목록의 한 행(lofi 21 .item). 누르면 그 제보 화면으로 갑니다. */
export function ReportListItem({
  to,
  category,
  status,
  extraBadge,
  body,
  date,
}: {
  to: string;
  category: string;
  status: ReportStatus;
  extraBadge?: ReactNode;
  body: string;
  date: string;
}) {
  return (
    <li>
      <Link className="rp-item" to={to}>
        <span className="rp-item__text">
          <span className="rp-item__meta">
            <span className="rp-item__cat">{category}</span>
            <span className="rp-item__badges">
              {extraBadge}
              <ReportStatusBadge status={status} />
            </span>
          </span>
          <span className="rp-item__body">{body}</span>
          <span className="rp-item__date">{date}</span>
        </span>
        <Icon name="chevron-right" className="rp-item__chev" />
      </Link>
    </li>
  );
}

import { ActionButton, Skeleton } from "@seed-design/react";
import type { ReactNode } from "react";
import { Hami, type HamiPose } from "./Hami";
import { Icon, type IconName } from "./Icon";

/** 불러오는 중: 300ms가 지나도 데이터가 없을 때만 보입니다(interaction.md §3). */
export function Delayed({
  children,
  label = "불러오는 중",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <div className="wh-delayed" role="status" aria-label={label}>
      {children}
    </div>
  );
}

export function SkeletonLines({ lines = 3 }: { lines?: number }) {
  return (
    <div className="wh-skeleton-lines">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: 모양만 있는 고정 개수 자리표시
          key={index}
          radius="8"
          height="lineHeight.t5"
          width={index === lines - 1 ? "60%" : "100%"}
        />
      ))}
    </div>
  );
}

export function EmptyState({
  hami,
  icon,
  title,
  description,
  children,
  headingLevel = 1,
}: {
  hami?: HamiPose;
  icon?: IconName;
  title: string;
  description?: string;
  children?: ReactNode;
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <div className="wh-empty">
      {hami ? <Hami pose={hami} size={150} className="wh-empty__hami" eager /> : null}
      {icon && !hami ? (
        <span className="wh-empty__icon">
          <Icon name={icon} />
        </span>
      ) : null}
      <Heading className="wh-empty__title" tabIndex={-1}>
        {title}
      </Heading>
      {description ? <p className="wh-empty__desc">{description}</p> : null}
      {children}
    </div>
  );
}

/** 연결 문제로 불러오지 못함. 빈 화면·없음과 다른 모양입니다(screens.md §8). */
export function LoadError({
  onRetry,
  retrying,
  headingLevel = 1,
}: {
  onRetry: () => void;
  retrying: boolean;
  headingLevel?: 1 | 2;
}) {
  return (
    <div className="wh-load-error">
      <EmptyState
        icon="wifi-off"
        title="불러오지 못했어요"
        description="연결이 불안정하면 잠시 뒤 다시 시도해 주세요."
        headingLevel={headingLevel}
      />
      <ActionButton
        className="wh-btn wh-btn--neutral wh-btn--sm wh-load-error__retry"
        size="large"
        variant="neutralWeak"
        loading={retrying}
        disabled={retrying}
        onClick={onRetry}
      >
        <Icon name="rotate-cw" />
        다시 시도
      </ActionButton>
    </div>
  );
}

import type { Guide } from "@wolgyeham/contracts";
import type { ElementType } from "react";
import { Icon } from "../../components/Icon";
import { formatMonth } from "../../lib/format";
import { CATEGORY } from "./categories";
import "./guide-body.css";

// 안내 본문 하나. 상세(11)·첫날 카드(36)·미리 보기(43)가 같은 컴포넌트를 씁니다(D-08).
// 집주인이 입력한 제목·본문·사진만 보여주고, 본문은 HTML로 해석하지 않고 줄바꿈만 살립니다.
export function GuideBody({
  guide,
  titleAs = "h1",
  titleId,
  badgeSuffix,
  caption,
  photoLimit,
  clamp = false,
  variant = "page",
}: {
  guide: Guide;
  titleAs?: ElementType;
  titleId?: string;
  badgeSuffix?: string;
  /** "수정"이면 "집주인 안내 · 2026년 3월 수정". 없으면 날짜 줄을 숨깁니다. */
  caption?: "updated" | "month";
  photoLimit?: number;
  clamp?: boolean;
  variant?: "page" | "card" | "frame";
}) {
  const category = CATEGORY[guide.category];
  const Title = titleAs;
  const photos = photoLimit === undefined ? guide.photos : guide.photos.slice(0, photoLimit);
  return (
    <div className={`guide-body guide-body--${variant}`}>
      <div className="guide-body__meta">
        <span className="wh-badge wh-badge--navy">
          <Icon name={category.icon} />
          {badgeSuffix ? `${category.label} · ${badgeSuffix}` : category.label}
        </span>
        {caption ? (
          <span className="wh-caption">
            집주인 안내 · {formatMonth(guide.updatedAt)}
            {caption === "updated" ? " 수정" : ""}
          </span>
        ) : null}
      </div>
      <Title
        className="guide-body__title"
        id={titleId}
        tabIndex={titleAs === "h1" ? -1 : undefined}
      >
        {guide.title}
      </Title>
      {photos.map((photo, index) => (
        <img
          key={photo.url}
          className="guide-body__photo"
          src={photo.url}
          alt={photo.alt ?? `${category.label} 안내 사진 ${index + 1}`}
          width={350}
          height={220}
          loading="lazy"
          decoding="async"
        />
      ))}
      <p className={clamp ? "guide-body__text guide-body__text--clamp" : "guide-body__text"}>
        {guide.body}
      </p>
    </div>
  );
}

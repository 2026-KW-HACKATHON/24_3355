import type { Guide } from "@wolgyeham/contracts";
import { Link } from "react-router";
import { Icon } from "../../components/Icon";
import { CATEGORY, hasSameCategory, tileLabels } from "../guides/categories";
import "./guide-tiles.css";

// 건물 안내 타일(lofi building.css .tiles). 공개 화면(01)과 거주자 홈(03·10)이 같은 모양을 씁니다.
// 같은 종류 안내가 둘 이상이면 타일끼리 구분되지 않아서 제목 전체가 보이는 목록(GuideRows)으로 바꿉니다.
export function GuideTiles({ buildingId, guides }: { buildingId: string; guides: Guide[] }) {
  if (hasSameCategory(guides)) return <GuideRows buildingId={buildingId} guides={guides} />;
  const labels = tileLabels(guides);
  return (
    <ul className="bd-tiles">
      {guides.map((guide) => (
        <li key={guide.id}>
          <Link
            className="bd-tile"
            to={`/b/${buildingId}/guides/${guide.id}`}
            aria-label={`${labels.get(guide.id)}: ${guide.title}`}
          >
            <span className="bd-tile__ic">
              <Icon name={CATEGORY[guide.category].icon} />
            </span>
            <span className="bd-tile__label">{labels.get(guide.id)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** 크게 보기(lofi 28): 타일 대신 한 줄씩 누르는 목록. */
export function GuideBigList({ buildingId, guides }: { buildingId: string; guides: Guide[] }) {
  const labels = tileLabels(guides);
  return (
    <ul className="bd-big-list">
      {guides.map((guide) => (
        <li key={guide.id}>
          <Link
            className="bd-big-list__row"
            to={`/b/${buildingId}/guides/${guide.id}`}
            aria-label={`${labels.get(guide.id)}: ${guide.title}`}
          >
            <Icon name={CATEGORY[guide.category].icon} className="bd-big-list__lead" />
            <span className="bd-big-list__text">{labels.get(guide.id)}</span>
            <Icon name="chevron-right" className="bd-big-list__chev" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** 제목 전체와 종류를 함께 보여주는 목록. ‘전체 보기’와 같은 종류가 여럿일 때 씁니다. */
export function GuideRows({ buildingId, guides }: { buildingId: string; guides: Guide[] }) {
  return (
    <ul className="bd-big-list bd-rows">
      {guides.map((guide) => (
        <li key={guide.id}>
          <Link
            className="bd-big-list__row bd-rows__row"
            to={`/b/${buildingId}/guides/${guide.id}`}
          >
            <Icon name={CATEGORY[guide.category].icon} className="bd-big-list__lead" />
            <span className="bd-big-list__text">
              {guide.title}
              <small>{CATEGORY[guide.category].label}</small>
            </span>
            <Icon name="chevron-right" className="bd-big-list__chev" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

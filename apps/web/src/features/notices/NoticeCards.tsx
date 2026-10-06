import type { Notice } from "@wolgyeham/contracts";
import { Link } from "react-router";
import { Icon } from "../../components/Icon";
import { formatDay } from "../../lib/format";
import "./notice-cards.css";

// 진행 중인 공지(lofi building.css .notice). 공개 화면(01)·거주자 홈(03·10)이 같이 씁니다.
// 불러오지 못하면 ‘공지 없음’으로 보이지 않게 따로 알리고, 불러오는 중에는 자리를 비워 둡니다.
export function NoticeCards({
  notices,
  failed,
  retrying,
  onRetry,
}: {
  notices: Notice[] | undefined;
  failed: boolean;
  retrying: boolean;
  onRetry: () => void;
}) {
  if (failed) {
    return (
      <div className="nc-card nc-card--failed" role="status">
        <span className="nc-card__ic">
          <Icon name="wifi-off" />
        </span>
        <p className="nc-card__text">공지를 불러오지 못했어요</p>
        <button type="button" className="nc-card__retry" onClick={onRetry} disabled={retrying}>
          다시 시도
        </button>
      </div>
    );
  }
  if (!notices || notices.length === 0) return null;
  return (
    <section aria-label="공지">
      <ul className="nc-list">
        {notices.map((notice) => (
          <li key={notice.id}>
            <Link className="nc-card" to={`/b/${notice.buildingId}/notices/${notice.id}`}>
              <span className="nc-card__ic">
                <Icon name="megaphone" />
              </span>
              <span className="nc-card__text">
                <span className="nc-card__title">{notice.title}</span>
                <span className="nc-card__sub">공지 · {formatDay(notice.endsAt)}까지</span>
              </span>
              <Icon name="chevron-right" className="nc-card__chev" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

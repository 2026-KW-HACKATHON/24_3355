// LF-05 거주자 홈(03·10)의 ‘거주자가 남긴 팁’ 구역. 최근 팁 몇 장을 옆으로 넘겨 보고, 개수를 누르면 목록(04)으로.
// 비어 있어도 쓰기를 재촉하지 않습니다(screens.md 화면 규칙).
import { Skeleton } from "@seed-design/react";
import { Link } from "react-router";
import { Icon } from "../../components/Icon";
import { Delayed } from "../../components/ScreenState";
import { useMe } from "../auth/queries";
import { useTips } from "./queries";
import { TipCard } from "./TipCard";
import "./tips.css";

const PREVIEW_COUNT = 3;

export function TipsPreview({ buildingId }: { buildingId: string }) {
  const me = useMe();
  const tips = useTips(buildingId, me.data?.user.id);
  const list = tips.data ?? [];
  const to = `/b/${buildingId}/tips`;

  return (
    <section className="tp-preview" aria-labelledby="tp-preview-title">
      <div className="wh-section-head">
        <h2 id="tp-preview-title">거주자가 남긴 팁</h2>
        <Link className="wh-section-head__more tp-preview__more" to={to}>
          {tips.isSuccess ? `${list.length}개` : "전체 보기"}
          <Icon name="chevron-right" />
        </Link>
      </div>
      <p className="wh-caption tp-preview__caption">
        집주인 안내가 아닌, 살아본 사람이 남긴 참고 정보예요
      </p>
      {tips.isError ? (
        <p className="wh-caption tp-preview__note">
          팁을 불러오지 못했어요.{" "}
          <button
            type="button"
            className="tp-preview__retry"
            disabled={tips.isFetching}
            onClick={() => void tips.refetch()}
          >
            다시 시도
          </button>
        </p>
      ) : tips.isSuccess && list.length === 0 ? (
        <p className="wh-caption tp-preview__note">아직 남겨진 팁이 없어요</p>
      ) : tips.isPending ? (
        // 카드 높이만큼 자리를 잡아 두어 아래 ‘집주인에게 알리기’가 밀려 내려가지 않게 합니다.
        <Delayed label="팁을 불러오는 중">
          <div className="tp-preview__scroll tp-preview__ghosts">
            <Skeleton radius="16" height="100%" />
            <Skeleton radius="16" height="100%" />
          </div>
        </Delayed>
      ) : tips.isSuccess ? (
        <ul className="tp-preview__scroll">
          {list.slice(0, PREVIEW_COUNT).map((tip) => (
            <li key={tip.id}>
              <Link className="tp-preview__card" to={to}>
                <TipCard tip={tip} />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

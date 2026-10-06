// LF-13 건물 관리 홈 · lofi 42 (처음 공개한 뒤) + 공개 전 ‘이어서 쓰기’ (운영 중 24는 다음 업데이트)
import { ActionButton } from "@seed-design/react";
import type { Guide, ManagedBuildingDetail } from "@wolgyeham/contracts";
import { Link, useParams } from "react-router";
import { Icon, type IconName } from "../../components/Icon";
import { Screen, SoonNote, TopBar } from "../../components/Screen";
import { ManagerGate } from "../../features/auth/ManagerGate";
import { CATEGORY, joinCategoryLabels, missingCategories } from "../../features/guides/categories";
import { formatDate } from "../../lib/format";
import "./landlord-home.css";

export function Component() {
  const { buildingId = "" } = useParams();
  return (
    <ManagerGate buildingId={buildingId}>
      {(detail) => <LandlordHome detail={detail} />}
    </ManagerGate>
  );
}

function LandlordHome({ detail }: { detail: ManagedBuildingDetail }) {
  const { building, guides } = detail;
  const published = guides.filter((guide) => guide.status === "published");
  const drafts = guides.filter((guide) => guide.status === "draft");
  const base = `/manage/${building.id}`;
  const missing = joinCategoryLabels(missingCategories(published));

  return (
    <Screen
      topbar={
        <TopBar
          start={
            <h1 className="wh-topbar__name" tabIndex={-1}>
              {building.name}
            </h1>
          }
          end={
            <button
              type="button"
              className="wh-icon-btn"
              aria-label="QR·가입코드"
              aria-describedby="lh-qr-soon"
              disabled
            >
              <Icon name="qr-code" />
            </button>
          }
        />
      }
    >
      <span className="wh-visually-hidden" id="lh-qr-soon">
        다음 업데이트에서 열려요
      </span>

      <StatusCard
        buildingId={building.id}
        name={building.name}
        publishedCount={published.length}
        latestDraft={latestDraft(drafts)}
      />

      <section className="lh-section" aria-labelledby="lh-visible">
        <div className="wh-section-head">
          <h2 id="lh-visible">지금 건물에 보이는 것</h2>
        </div>
        <dl className="lh-stats">
          <div className="lh-stat">
            <dt className="lh-stat__label">
              <Icon name="book-open" />
              기본 안내
            </dt>
            <dd className="lh-stat__value">{published.length}개</dd>
          </div>
          <div className="lh-stat">
            <dt className="lh-stat__label">
              <Icon name="pencil" />
              작성 중
            </dt>
            <dd className="lh-stat__value">{drafts.length}개</dd>
          </div>
        </dl>
        <p className="wh-caption lh-caption">
          작성 중인 안내는 공개하기 전까지 세입자에게 보이지 않아요
        </p>
      </section>

      {guides.length > 0 ? (
        <section className="lh-section" aria-labelledby="lh-guides">
          <div className="wh-section-head">
            <h2 id="lh-guides">기본 안내</h2>
          </div>
          <ul className="lh-list">
            {guides.map((guide) => (
              <li key={guide.id}>
                <GuideRow guide={guide} base={base} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {published.length > 0 ? (
        <section className="lh-section" aria-labelledby="lh-todo">
          <div className="wh-section-head">
            <h2 id="lh-todo">이어서 할 것</h2>
          </div>
          <ul className="lh-list">
            <li>
              <SoonRow id="lh-soon-alert" icon="bell-off" title="새 메모·제보 알림 받기" warn />
            </li>
            <li>
              <SoonRow id="lh-soon-link" icon="link" title="안내 링크 보내기" />
            </li>
            <li>
              <SoonRow id="lh-soon-qr" icon="qr-code" title="현관 QR 받기" />
            </li>
            <li>
              <Link className="lh-row" to={`${base}/guides/new`}>
                <span className="lh-row__ic">
                  <Icon name="plus" />
                </span>
                <span className="lh-row__text">
                  <span className="lh-row__title">기본 안내 추가하기</span>
                  {missing ? <span className="lh-row__sub">{missing}</span> : null}
                </span>
                <Icon name="chevron-right" className="lh-row__chev" />
              </Link>
            </li>
          </ul>
        </section>
      ) : null}
    </Screen>
  );
}

function latestDraft(drafts: readonly Guide[]): Guide | undefined {
  return [...drafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

function StatusCard({
  buildingId,
  name,
  publishedCount,
  latestDraft,
}: {
  buildingId: string;
  name: string;
  publishedCount: number;
  latestDraft: Guide | undefined;
}) {
  const base = `/manage/${buildingId}`;
  if (publishedCount > 0) {
    return (
      <div className="lh-status">
        <p className="lh-status__title">
          <Icon name="circle-check" className="lh-status__ok" />
          {name} 안내를 공개했어요
        </p>
        <p className="lh-status__text">
          아직 확인할 것은 없어요. 세입자가 메모를 남기거나 알리면 여기에 먼저 보여요.
        </p>
        <Link className="lh-status__link" to={`/b/${buildingId}`}>
          세입자 화면으로 보기
          <Icon name="chevron-right" />
        </Link>
      </div>
    );
  }
  if (latestDraft) {
    return (
      <div className="lh-status">
        <p className="lh-status__title">
          <Icon name="pencil" />
          안내를 작성 중이에요
        </p>
        <p className="lh-status__text">
          공개하기 전까지 세입자에게 보이지 않아요. 현관 QR에는 ‘아직 등록된 안내가 없어요’가
          보여요.
        </p>
        <ActionButton asChild className="wh-btn lh-status__cta" size="large">
          <Link to={`${base}/guides/${latestDraft.id}/edit`}>이어서 쓰기</Link>
        </ActionButton>
      </div>
    );
  }
  return (
    <div className="lh-status">
      <p className="lh-status__title">
        <Icon name="file-text" />첫 안내를 써 볼까요?
      </p>
      <p className="lh-status__text">
        새 세입자에게 카톡으로 보내던 문구를 그대로 옮겨도 돼요. 공개하기 전에 세입자가 볼 화면을
        먼저 확인해요.
      </p>
      <ActionButton asChild className="wh-btn lh-status__cta" size="large">
        <Link to={`${base}/guides/new`}>기본 안내 쓰기</Link>
      </ActionButton>
    </div>
  );
}

function GuideRow({ guide, base }: { guide: Guide; base: string }) {
  const category = CATEGORY[guide.category];
  const isDraft = guide.status === "draft";
  // 공개한 안내 고치기는 다음 업데이트(수정 메모와 함께). 지금은 세입자 화면으로 확인합니다.
  const to = isDraft
    ? `${base}/guides/${guide.id}/edit`
    : `/b/${guide.buildingId}/guides/${guide.id}`;
  return (
    <Link className="lh-row" to={to}>
      <span className="lh-row__ic">
        <Icon name={category.icon} />
      </span>
      <span className="lh-row__text">
        <span className="lh-row__title">{guide.title}</span>
        <span className="lh-row__sub">
          <span className={isDraft ? "wh-badge wh-badge--moon" : "wh-badge wh-badge--done"}>
            {isDraft ? "작성 중" : "공개됨"}
          </span>
          {isDraft
            ? `${formatDate(guide.updatedAt)} 저장`
            : `${category.label} · ${formatDate(guide.publishedAt ?? guide.updatedAt)}`}
        </span>
      </span>
      <Icon name="chevron-right" className="lh-row__chev" />
    </Link>
  );
}

function SoonRow({
  id,
  icon,
  title,
  warn = false,
}: {
  id: string;
  icon: IconName;
  title: string;
  warn?: boolean;
}) {
  return (
    <button
      type="button"
      className={warn ? "lh-row lh-row--warn" : "lh-row"}
      disabled
      aria-describedby={id}
    >
      <span className="lh-row__ic">
        <Icon name={icon} />
      </span>
      <span className="lh-row__text">
        <span className="lh-row__title">{title}</span>
        <SoonNote id={id} />
      </span>
    </button>
  );
}

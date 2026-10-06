// LF-13 건물 관리 홈 · lofi 42 (처음 공개한 뒤) + 24 (운영 중: 확인할 것이 맨 위) + 공개 전 ‘이어서 쓰기’.
// 확인할 것 = 확인 전 수정 메모(→ 25) + 새 제보(→ 받은 내용). 탭 `건물 관리`
import { ActionButton } from "@seed-design/react";
import type {
  Guide,
  ManagedBuildingDetail,
  ManagedCorrectionMemo,
  ManagedReport,
  Notice,
} from "@wolgyeham/contracts";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { Icon, type IconName } from "../../components/Icon";
import { Screen, SoonNote, TopBar } from "../../components/Screen";
import { LandlordTabs } from "../../components/TabBar";
import { useToast } from "../../components/useToast";
import { ManagerGate } from "../../features/auth/ManagerGate";
import { useManagedBuildings } from "../../features/buildings/queries";
import { CATEGORY, joinCategoryLabels, missingCategories } from "../../features/guides/categories";
import { useBuildingMemos } from "../../features/guides/memos";
import { useNoticeAudience, useNotices } from "../../features/notices/queries";
import { formatReportTime, reportTitle } from "../../features/reports/labels";
import { useBuildingReports } from "../../features/reports/queries";
import { formatDate, formatDay } from "../../lib/format";
import { publicBuildingUrl, shareOrCopy } from "../../lib/share";
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
  const notices = useNotices(building.id);
  const audience = useNoticeAudience(building.id);
  const summaries = useManagedBuildings(true);
  const pendingMemos = useBuildingMemos(building.id, "pending", published.length > 0);
  const toast = useToast();
  const [shareError, setShareError] = useState<string>();

  // 확인할 것: 확인 전 메모(pendingMemoCount)와 아직 ‘확인했어요’를 누르지 않은 제보(newReportCount).
  // 메모 목록이 오면 그 수를, 아니면 요약의 수를 씁니다. 둘 다 모르면 ‘없음’이라고 하지 않습니다.
  const summary = summaries.data?.find((item) => item.id === building.id);
  const memoCount = pendingMemos.data?.length ?? summary?.pendingMemoCount;
  // 새 제보가 있으면 가장 최근 것의 문구·시각을 ‘확인할 것’에 보여줍니다(lofi 24).
  const hasNewReports = (summary?.newReportCount ?? 0) > 0;
  const newReports = useBuildingReports(building.id, "received", hasNewReports);
  // 요청을 멈춘 동안(요약의 새 제보 0건)에는 예전에 받아 둔 목록을 쓰지 않고 요약의 수를 따릅니다.
  const reportCount = hasNewReports
    ? (newReports.data?.length ?? summary?.newReportCount ?? 0)
    : (summary?.newReportCount ?? 0);
  const todoCount = (memoCount ?? 0) + reportCount;
  const todoKnown = memoCount !== undefined || summaries.isSuccess;
  const todoFailed = !todoKnown && (summaries.isError || pendingMemos.isError);
  const operating = todoCount > 0;
  const memoCountByGuide = countByGuide(pendingMemos.data ?? []);

  async function shareBuildingLink() {
    setShareError(undefined);
    const url = publicBuildingUrl(building.id);
    const outcome = await shareOrCopy({ title: `${building.name} 생활 안내`, url });
    if (outcome === "copied") toast("건물 안내 링크를 복사했어요");
    if (outcome === "failed")
      setShareError(`링크를 복사하지 못했어요. 이 주소를 전해 주세요: ${url}`);
  }

  function goToGuides() {
    const heading = document.getElementById("lh-guides");
    heading?.scrollIntoView({ block: "start" });
    heading?.focus({ preventScroll: true });
  }

  const onlyGuide = published.length === 1 ? published[0] : undefined;

  const visibleSection = (
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
            <Icon name="megaphone" />
            진행 중 공지
          </dt>
          <dd className="lh-stat__value">
            {notices.isSuccess ? `${notices.data.length}개` : notices.isError ? "–" : "…"}
          </dd>
        </div>
        <div className="lh-stat">
          <dt className="lh-stat__label">
            <Icon name="users" />
            월계함에 연결
          </dt>
          <dd className="lh-stat__value">
            {audience.isSuccess
              ? `${audience.data.connectedCount}명`
              : audience.isError
                ? "–"
                : "…"}
          </dd>
        </div>
        <div className="lh-stat">
          <dt className="lh-stat__label">
            <Icon name="sticky-note" />
            생활 팁
          </dt>
          <dd className="lh-stat__value">
            {summary ? (
              // 집주인도 팁을 읽고 신고할 수 있습니다(screens.md §1). 쓰지는 않습니다.
              <Link className="lh-stat__link" to={`/b/${building.id}/tips`}>
                {summary.tipCount}개
                <Icon name="chevron-right" />
              </Link>
            ) : summaries.isError ? (
              "–"
            ) : (
              "…"
            )}
          </dd>
        </div>
      </dl>
      <p className="wh-caption lh-caption">
        연결된 사람 기준이라 실제 세입자 수와 다를 수 있어요.
        {drafts.length > 0
          ? ` 작성 중인 안내 ${drafts.length}개는 공개하기 전까지 세입자에게 보이지 않아요.`
          : ""}
      </p>
      {notices.isError || audience.isError ? (
        <p className="wh-caption lh-caption" role="status">
          공지·연결 수를 불러오지 못했어요.{" "}
          <button
            type="button"
            className="lh-inline-retry"
            onClick={() => {
              if (notices.isError) void notices.refetch();
              if (audience.isError) void audience.refetch();
            }}
          >
            다시 시도
          </button>
        </p>
      ) : null}
      {published.length > 0 ? (
        <div className="lh-quick">
          <ActionButton
            asChild
            className="wh-btn wh-btn--secondary"
            size="large"
            variant="neutralWeak"
          >
            <Link to={`${base}/notices/new`}>
              <Icon name="megaphone" />
              공지 쓰기
            </Link>
          </ActionButton>
          {onlyGuide ? (
            <ActionButton
              asChild
              className="wh-btn wh-btn--neutral"
              size="large"
              variant="neutralWeak"
            >
              <Link to={`${base}/guides/${onlyGuide.id}/edit`}>
                <Icon name="pencil-line" />
                안내 고치기
              </Link>
            </ActionButton>
          ) : (
            <ActionButton
              className="wh-btn wh-btn--neutral"
              size="large"
              variant="neutralWeak"
              onClick={goToGuides}
            >
              <Icon name="pencil-line" />
              안내 고치기
            </ActionButton>
          )}
        </div>
      ) : null}
    </section>
  );

  const noticeSection =
    notices.data && notices.data.length > 0 ? (
      <section className="lh-section" aria-labelledby="lh-notices">
        <div className="wh-section-head">
          <h2 id="lh-notices">진행 중 공지</h2>
        </div>
        <ul className="lh-list">
          {notices.data.map((notice) => (
            <li key={notice.id}>
              <NoticeRow notice={notice} base={base} />
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  const guideSection =
    guides.length > 0 ? (
      <section className="lh-section" aria-labelledby="lh-guides">
        <div className="wh-section-head">
          <h2 id="lh-guides" tabIndex={-1}>
            기본 안내
          </h2>
        </div>
        <ul className="lh-list">
          {guides.map((guide) => (
            <li key={guide.id}>
              <GuideRow guide={guide} base={base} memoCount={memoCountByGuide.get(guide.id) ?? 0} />
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  const nextSection =
    published.length > 0 ? (
      <section className="lh-section" aria-labelledby="lh-todo">
        <div className="wh-section-head">
          <h2 id="lh-todo">이어서 할 것</h2>
        </div>
        <ul className="lh-list">
          <li>
            <SoonRow id="lh-soon-alert" icon="bell-off" title="새 메모·제보 알림 받기" warn />
          </li>
          <li>
            <button type="button" className="lh-row" onClick={() => void shareBuildingLink()}>
              <span className="lh-row__ic">
                <Icon name="link" />
              </span>
              <span className="lh-row__text">
                <span className="lh-row__title">안내 링크 보내기</span>
                <span className="lh-row__sub">지금 사는 분들께 카톡으로 한 번</span>
              </span>
              <Icon name="chevron-right" className="lh-row__chev" />
            </button>
            {shareError ? (
              <p className="wh-field-error lh-share-error" role="alert">
                {shareError}
              </p>
            ) : null}
          </li>
          <li>
            <Link className="lh-row" to={`${base}/qr`}>
              <span className="lh-row__ic">
                <Icon name="qr-code" />
              </span>
              <span className="lh-row__text">
                <span className="lh-row__title">현관 QR 받기</span>
                <span className="lh-row__sub">인쇄해서 현관에 붙이기</span>
              </span>
              <Icon name="chevron-right" className="lh-row__chev" />
            </Link>
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
    ) : null;

  return (
    <Screen
      tabs={<LandlordTabs buildingId={building.id} active="manage" />}
      topbar={
        <TopBar
          start={
            <h1 className="wh-topbar__name" tabIndex={-1}>
              {building.name}
            </h1>
          }
          end={
            <Link className="wh-icon-btn" aria-label="QR·가입코드" to={`${base}/qr`}>
              <Icon name="qr-code" />
            </Link>
          }
        />
      }
    >
      {operating ? (
        <TodoSection
          base={base}
          latestReport={hasNewReports ? newReports.data?.[0] : undefined}
          memos={pendingMemos.data}
          memoCount={memoCount ?? 0}
          reportCount={reportCount}
          memosFailed={pendingMemos.isError}
          retrying={pendingMemos.isFetching}
          onRetry={() => void pendingMemos.refetch()}
        />
      ) : null}
      {operating ? (
        // 운영 중(24)에도 세입자가 보는 공개 화면으로 갈 길을 남깁니다(42의 상태 카드 링크와 같은 곳).
        <p className="lh-public-link">
          <Link className="lh-status__link" to={`/b/${building.id}`}>
            세입자 화면으로 보기
            <Icon name="chevron-right" />
          </Link>
        </p>
      ) : null}
      {todoFailed ? (
        <p className="wh-caption lh-todo-error" role="status">
          확인할 것을 불러오지 못했어요.{" "}
          <button
            type="button"
            className="lh-inline-retry"
            onClick={() => {
              void summaries.refetch();
              void pendingMemos.refetch();
            }}
          >
            다시 시도
          </button>
        </p>
      ) : null}
      {!operating && (todoKnown || published.length === 0) ? (
        <StatusCard
          buildingId={building.id}
          name={building.name}
          confirmed={building.confirmedAt !== null}
          publishedCount={published.length}
          latestDraft={latestDraft(drafts)}
        />
      ) : null}

      {visibleSection}
      {/* 처음(42): 다음 단계가 먼저. 확인할 것이 있는 운영 중(24): 공지·안내 목록이 먼저 */}
      {operating ? (
        <>
          {noticeSection}
          {guideSection}
          {nextSection}
        </>
      ) : (
        <>
          {nextSection}
          {noticeSection}
          {guideSection}
        </>
      )}
    </Screen>
  );
}

function countByGuide(memos: readonly ManagedCorrectionMemo[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const memo of memos) counts.set(memo.guideId, (counts.get(memo.guideId) ?? 0) + 1);
  return counts;
}

/** 확인할 것(lofi 24 위쪽). 메모는 안내마다 한 줄, 누르면 가장 최근 메모의 검토(25)로 갑니다. */
function TodoSection({
  base,
  latestReport,
  memos,
  memoCount,
  reportCount,
  memosFailed,
  retrying,
  onRetry,
}: {
  base: string;
  latestReport: ManagedReport | undefined;
  memos: ManagedCorrectionMemo[] | undefined;
  memoCount: number;
  reportCount: number;
  memosFailed: boolean;
  retrying: boolean;
  onRetry: () => void;
}) {
  const groups = groupMemosByGuide(memos ?? []);
  return (
    <section className="lh-section lh-section--first" aria-labelledby="lh-check">
      <div className="wh-section-head">
        <h2 id="lh-check">확인할 것</h2>
        <span className="lh-count">{memoCount + reportCount}건</span>
      </div>
      <ul className="lh-list">
        {reportCount > 0 ? (
          <li>
            <Link
              className="lh-row"
              to={
                reportCount === 1 && latestReport
                  ? `${base}/reports/${latestReport.id}`
                  : `${base}/inbox`
              }
            >
              <span className="lh-row__ic lh-row__ic--received">
                <Icon name="mail" />
              </span>
              <span className="lh-row__text">
                <span className="lh-row__title">받은 상황 {reportCount}건</span>
                <span className="lh-row__sub">
                  {latestReport
                    ? `${reportTitle(latestReport)} · ${formatReportTime(latestReport.createdAt)}`
                    : "받은 내용에서 확인해요"}
                </span>
              </span>
              <Icon name="chevron-right" className="lh-row__chev" />
            </Link>
          </li>
        ) : null}
        {groups.map((group) => (
          <li key={group.latest.guideId}>
            <Link className="lh-row" to={`${base}/memos/${group.latest.id}`}>
              <span className="lh-row__ic lh-row__ic--navy">
                <Icon name="file-pen-line" />
              </span>
              <span className="lh-row__text">
                <span className="lh-row__title">안내 수정 메모 {group.count}건</span>
                <span className="lh-row__sub">
                  {CATEGORY[group.latest.guideCategory].label} 안내 ·{" "}
                  {formatDay(group.latest.createdAt)}
                </span>
              </span>
              <Icon name="chevron-right" className="lh-row__chev" />
            </Link>
          </li>
        ))}
        {memoCount > 0 && !memos ? (
          <li>
            <p className="lh-row lh-row--static" role="status">
              <span className="lh-row__ic lh-row__ic--navy">
                <Icon name="file-pen-line" />
              </span>
              <span className="lh-row__text">
                <span className="lh-row__title">안내 수정 메모 {memoCount}건</span>
                <span className="lh-row__sub">
                  {memosFailed ? "메모를 불러오지 못했어요" : "메모를 불러오는 중이에요"}
                  {memosFailed ? (
                    <button
                      type="button"
                      className="lh-inline-retry"
                      disabled={retrying}
                      onClick={onRetry}
                    >
                      다시 시도
                    </button>
                  ) : null}
                </span>
              </span>
            </p>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function groupMemosByGuide(memos: readonly ManagedCorrectionMemo[]) {
  const groups = new Map<string, { latest: ManagedCorrectionMemo; count: number }>();
  for (const memo of memos) {
    const group = groups.get(memo.guideId);
    if (!group) groups.set(memo.guideId, { latest: memo, count: 1 });
    else {
      group.count += 1;
      if (memo.createdAt > group.latest.createdAt) group.latest = memo;
    }
  }
  return [...groups.values()];
}

function NoticeRow({ notice, base }: { notice: Notice; base: string }) {
  return (
    <Link className="lh-row" to={`${base}/notices/${notice.id}`}>
      <span className="lh-row__ic lh-row__ic--moon">
        <Icon name="megaphone" />
      </span>
      <span className="lh-row__text">
        <span className="lh-row__title">{notice.title}</span>
        <span className="lh-row__sub">{formatDay(notice.endsAt)}까지 · 링크 다시 보내기</span>
      </span>
      <Icon name="chevron-right" className="lh-row__chev" />
    </Link>
  );
}

function latestDraft(drafts: readonly Guide[]): Guide | undefined {
  return [...drafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

function StatusCard({
  buildingId,
  name,
  confirmed,
  publishedCount,
  latestDraft,
}: {
  buildingId: string;
  name: string;
  confirmed: boolean;
  publishedCount: number;
  latestDraft: Guide | undefined;
}) {
  const base = `/manage/${buildingId}`;
  // 초대를 수락하고 건물 확인(23)을 닫고 나왔으면, 첫 안내보다 건물 확인을 먼저 권합니다.
  if (!confirmed && publishedCount === 0) {
    return (
      <div className="lh-status">
        <p className="lh-status__title">
          <Icon name="building-2" />
          초대받은 건물이 맞는지 먼저 확인해 주세요
        </p>
        <p className="lh-status__text">
          건물 이름과 월계함 팀이 확인한 주소를 본 뒤 안내를 쓰면 돼요. 이름은 확인하면서 바꿀 수
          있어요.
        </p>
        <ActionButton asChild className="wh-btn lh-status__cta" size="large">
          <Link to={`${base}/confirm`}>건물 확인하기</Link>
        </ActionButton>
      </div>
    );
  }
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

function GuideRow({ guide, base, memoCount }: { guide: Guide; base: string; memoCount: number }) {
  const category = CATEGORY[guide.category];
  const isDraft = guide.status === "draft";
  // 초안은 이어서 쓰고, 공개한 안내는 수정본으로 고칩니다(공개 내용은 ‘수정 공개’ 전까지 그대로).
  return (
    <Link className="lh-row" to={`${base}/guides/${guide.id}/edit`}>
      <span className="lh-row__ic">
        <Icon name={category.icon} />
      </span>
      <span className="lh-row__text">
        <span className="lh-row__title">{guide.title}</span>
        <span className="lh-row__sub">
          <span className={isDraft ? "wh-badge wh-badge--moon" : "wh-badge wh-badge--done"}>
            {isDraft ? "작성 중" : "공개됨"}
          </span>
          {memoCount > 0 ? (
            <span className="wh-badge wh-badge--navy">확인 전 메모 {memoCount}</span>
          ) : null}
          {isDraft
            ? `${formatDate(guide.updatedAt)} 저장`
            : `${category.label} · ${formatDate(guide.updatedAt)}`}
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

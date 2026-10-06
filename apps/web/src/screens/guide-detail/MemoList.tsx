// 안내 아래 메모 목록(LF-02). 이 건물 거주자(active·reconfirm_needed)에게만 보입니다.
import type { GuideCorrectionMemo } from "@wolgyeham/contracts";
import { Icon } from "../../components/Icon";
import { MEMO_STATUS, memoOutcome } from "../../features/guides/memos";
import { formatDay } from "../../lib/format";

/** 안내 아래 메모와 결과(확인 전·반영됨·기존 유지 + 사유). 내 메모를 먼저 둡니다. */
export function MemoList({
  memos,
  failed,
  retrying,
  onRetry,
}: {
  memos: GuideCorrectionMemo[] | undefined;
  failed: boolean;
  retrying: boolean;
  onRetry: () => void;
}) {
  if (failed && !memos) {
    // 불러오지 못했을 때 ‘메모 없음’으로 보이지 않게 합니다.
    return (
      <p className="wh-caption gd-memos-error" role="status">
        남긴 메모를 불러오지 못했어요.{" "}
        <button type="button" className="gd-inline-retry" disabled={retrying} onClick={onRetry}>
          다시 시도
        </button>
      </p>
    );
  }
  if (!memos || memos.length === 0) return null;
  const ordered = [...memos.filter((memo) => memo.mine), ...memos.filter((memo) => !memo.mine)];
  return (
    <section className="gd-memos" aria-labelledby="gd-memos-title">
      <h2 className="gd-memos__title" id="gd-memos-title">
        이 안내에 남긴 메모 <span className="gd-memos__count">{memos.length}</span>
      </h2>
      <ul className="gd-memos__list">
        {ordered.map((memo) => (
          <li key={memo.id} className="gd-memo-item">
            <div className="gd-memo-item__meta">
              <span className="wh-caption">
                {memo.mine ? "내 메모" : "거주자 메모"} · {formatDay(memo.createdAt)}
              </span>
              <span className={`wh-badge wh-badge--${MEMO_STATUS[memo.status].badge}`}>
                {MEMO_STATUS[memo.status].label}
              </span>
            </div>
            <p className="gd-memo-item__body">{memo.body}</p>
            {memo.status === "pending" ? null : (
              <p className="gd-memo-item__outcome">
                <Icon name={memo.status === "applied" ? "check-check" : "info"} />
                <span>
                  {memoOutcome(memo)}
                  {memo.status === "kept" && memo.keptReason ? (
                    <>
                      <br />
                      사유: {memo.keptReason}
                    </>
                  ) : null}
                </span>
              </p>
            )}
          </li>
        ))}
      </ul>
      <p className="wh-caption gd-memos__note">작성자는 집주인에게도 보이지 않아요</p>
    </section>
  );
}

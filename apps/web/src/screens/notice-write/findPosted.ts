import type { Notice } from "@wolgyeham/contracts";

// 공지를 보낸 뒤 응답을 받지 못했을 때(시간 초과·연결 끊김) 서버에는 올라갔을 수 있습니다.
// 다시 눌러 같은 공지와 알림이 두 번 나가지 않도록, 목록에서 방금 보낸 공지를 찾습니다.

/** 기기와 서버 시계가 조금 달라도 방금 올린 공지로 볼 여유. */
const CLOCK_SLACK_MS = 5 * 60 * 1000;

export function findPostedNotice(
  notices: readonly Notice[],
  sent: { title: string; startsAt: string },
  sentAtMs: number,
): Notice | undefined {
  const title = sent.title.trim();
  const startsAt = Date.parse(sent.startsAt);
  return notices.find(
    (notice) =>
      notice.title.trim() === title &&
      Date.parse(notice.startsAt) === startsAt &&
      Date.parse(notice.publishedAt) >= sentAtMs - CLOCK_SLACK_MS,
  );
}

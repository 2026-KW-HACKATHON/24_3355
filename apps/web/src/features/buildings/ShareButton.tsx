import { Icon } from "../../components/Icon";
import { useToast } from "../../components/useToast";

/** 지금 주소를 기기 공유 창으로 보내고, 공유 창이 없으면 링크를 복사합니다. */
export function ShareButton({ title }: { title: string }) {
  const toast = useToast();
  const canShare =
    typeof navigator !== "undefined" &&
    (typeof navigator.share === "function" || typeof navigator.clipboard?.writeText === "function");
  if (!canShare) return null;

  async function share() {
    const url = window.location.href;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
      } catch {
        // 사용자가 공유 창을 닫음
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("링크를 복사했어요");
    } catch {
      // 복사 권한이 막힌 브라우저. 주소창의 링크를 쓰면 됩니다.
    }
  }

  return (
    <button type="button" className="wh-icon-btn" aria-label="이 건물 링크 공유" onClick={share}>
      <Icon name="share" />
    </button>
  );
}

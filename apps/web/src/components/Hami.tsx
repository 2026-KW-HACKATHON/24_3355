import bell from "../assets/hami/bell.png";
import clipboard from "../assets/hami/clipboard.png";
import envelope from "../assets/hami/envelope.png";
import folder from "../assets/hami/folder.png";
import guide from "../assets/hami/guide.png";
import hamiMini from "../assets/hami/hami-mini.png";
import house from "../assets/hami/house.png";
import lost from "../assets/hami/lost.png";
import moving from "../assets/hami/moving.png";
import qrSign from "../assets/hami/qr-sign.png";
import tipSaved from "../assets/hami/tip-saved.png";
import trayEmpty from "../assets/hami/tray-empty.png";
import wave from "../assets/hami/wave.png";

// 함이 가이드(design/characters/hami/README.md §4)의 자리에만 씁니다.
// 옆 문장이 상태를 설명하므로 alt=""입니다. 원본이 1:1 정사각형이라 width = height.
const POSES = {
  guide,
  folder,
  lost,
  house,
  envelope,
  bell,
  moving,
  clipboard,
  wave,
  "qr-sign": qrSign,
  "tip-saved": tipSaved,
  "tray-empty": trayEmpty,
  "hami-mini": hamiMini,
} as const;

export type HamiPose = keyof typeof POSES;

export function Hami({
  pose,
  size,
  className,
  eager = false,
}: {
  pose: HamiPose;
  size: number;
  className?: string;
  eager?: boolean;
}) {
  return (
    <img
      src={POSES[pose]}
      alt=""
      width={size}
      height={size}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={className ? `wh-hami ${className}` : "wh-hami"}
    />
  );
}

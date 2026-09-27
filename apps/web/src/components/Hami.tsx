import folder from "../assets/hami/folder.png";
import guide from "../assets/hami/guide.png";
import lost from "../assets/hami/lost.png";

// 함이 가이드(design/characters/hami/README.md §4)의 자리에만 씁니다.
// 옆 문장이 상태를 설명하므로 alt=""입니다. 원본이 1:1 정사각형이라 width = height.
const POSES = { guide, folder, lost } as const;

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

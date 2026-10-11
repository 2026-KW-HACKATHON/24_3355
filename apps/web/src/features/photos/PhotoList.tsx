import type { Photo } from "@wolgyeham/contracts";

/**
 * 안내·공지 사진(11·15·36·43). 4:3 칸에 맞춰 그려 자리가 흔들리지 않게 하고(width·height), 첫 화면 밖은 늦게
 * 불러옵니다. `zoomable`이면 누르면 원본 크기로 새 탭에서 엽니다. 대체 텍스트는 “<제목> 사진 n”입니다.
 */
export function PhotoList({
  photos,
  label,
  className,
  zoomable = true,
}: {
  photos: readonly Photo[];
  label: string;
  className: string;
  zoomable?: boolean;
}) {
  return photos.map((photo, index) => {
    const image = (
      <img
        className={className}
        src={photo.url}
        alt={`${label} 사진 ${index + 1}`}
        width={1600}
        height={1200}
        loading="lazy"
        decoding="async"
      />
    );
    if (!zoomable) return <span key={photo.key}>{image}</span>;
    return (
      <a
        key={photo.key}
        className="wh-photo-link"
        href={photo.url}
        target="_blank"
        rel="noopener"
        aria-label={`${label} 사진 ${index + 1} 크게 보기`}
      >
        {image}
      </a>
    );
  });
}

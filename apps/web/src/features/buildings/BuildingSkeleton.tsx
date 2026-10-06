import { Skeleton } from "@seed-design/react";
import "./building-skeleton.css";

/**
 * 건물 화면(01·03)을 불러오는 동안의 자리표시. 공개 화면인지 거주자 홈인지 모를 때도 같은 모양입니다.
 * 건물 그림·이름·주소·공지·‘건물 안내’ 제목·타일을 실제 화면과 같은 높이와 간격으로 둡니다(내용이 와도 덜 밀리게).
 * 거주자 홈은 건물 그림이 낮습니다(lofi 03 132px).
 */
export function BuildingSkeleton({ resident = false }: { resident?: boolean }) {
  return (
    <div className="bd-skeleton">
      <Skeleton radius="16" height={resident ? "132px" : "150px"} width="100%" />
      <div className="bd-skeleton__body">
        <Skeleton radius="8" height="34px" width="45%" />
        <Skeleton className="bd-skeleton__address" radius="8" height="20px" width="80%" />
        <Skeleton className="bd-skeleton__notice" radius="16" height="72px" />
        <Skeleton className="bd-skeleton__head" radius="8" height="24px" width="25%" />
        <div className="bd-skeleton__tiles">
          {["a", "b", "c", "d"].map((key) => (
            <Skeleton key={key} radius="16" height="78px" />
          ))}
        </div>
      </div>
    </div>
  );
}

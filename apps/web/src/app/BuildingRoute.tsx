// `/b/:buildingId` · 같은 주소를 이 건물 거주자에게는 거주자 홈(LF-05), 그 밖에는 공개 화면(LF-01)으로 보여줍니다.
// 로그인 확인(/api/me)과 건물·안내·공지 요청을 함께 보내 거주자에게 공개 화면이 먼저 번쩍이지 않게 합니다.
// /api/me가 실패하면 공개 화면으로 봅니다. 늦으면(ME_WAIT_MS) 건물 정보가 온 대로 공개 화면을 먼저 그립니다.
// 현관 QR의 `?via=qr`도 여기에서 한 번 읽고 지웁니다(어느 화면이 그려지든 주소에 남지 않게).
import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { Brand, LargeModeToggle, Screen, TopBar } from "../components/Screen";
import { Delayed } from "../components/ScreenState";
import { useMe } from "../features/auth/queries";
import { BuildingSkeleton } from "../features/buildings/BuildingSkeleton";
import { usePublicBuilding, usePublicGuides } from "../features/buildings/queries";
import { readViaQr, searchWithoutVia } from "../features/buildings/viaQr";
import { useNotices } from "../features/notices/queries";

// 두 화면 코드를 이 모듈을 불러올 때 함께 받아 둡니다(판정이 끝난 뒤 한 번 더 기다리지 않게).
const loadPublic = () => import("../screens/public-building/route");
const loadResident = () => import("../screens/resident-home/route");
void loadPublic().catch(() => undefined);
void loadResident().catch(() => undefined);

const PublicBuilding = lazy(() => loadPublic().then((module) => ({ default: module.Component })));
const ResidentHome = lazy(() => loadResident().then((module) => ({ default: module.Component })));

/** 로그인 확인이 이보다 늦으면 공개 화면을 먼저 보여줍니다. 거주자로 확인되면 그때 거주자 홈으로 바꿉니다. */
const ME_WAIT_MS = 1000;

function Loading() {
  return (
    <Screen busy topbar={<TopBar start={<Brand />} end={<LargeModeToggle />} />}>
      <Delayed label="건물 안내를 불러오는 중">
        <BuildingSkeleton />
      </Delayed>
    </Screen>
  );
}

/**
 * 인쇄한 현관 QR(`?via=qr`)로 열었는지. 첫 렌더에 읽은 값을 기억하고, 주소에서는 기록을 남기지 않는
 * replace로 지웁니다(연결 직후 state·해시는 그대로). 같은 틀에서 다른 건물로 옮기면 false입니다.
 */
function useViaQr(buildingId: string): boolean {
  const location = useLocation();
  const navigate = useNavigate();
  const [first] = useState(() => ({ buildingId, viaQr: readViaQr(location.search) }));
  useEffect(() => {
    const search = searchWithoutVia(location.search);
    if (search === undefined) return;
    void navigate(
      { pathname: location.pathname, search, hash: location.hash },
      { replace: true, state: location.state },
    );
  }, [location.hash, location.pathname, location.search, location.state, navigate]);
  return first.viaQr && first.buildingId === buildingId;
}

export function Component() {
  const { buildingId = "" } = useParams();
  const viaQr = useViaQr(buildingId);
  const me = useMe();
  // 어느 화면이든 필요한 요청을 먼저 시작합니다(결과는 같은 캐시를 씁니다).
  const building = usePublicBuilding(buildingId);
  usePublicGuides(buildingId);
  useNotices(buildingId);
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    if (!me.isPending) return;
    const timer = window.setTimeout(() => setWaited(true), ME_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [me.isPending]);

  if (me.isPending && !(waited && building.isSuccess)) return <Loading />;
  const resident = me.data?.occupancy?.buildingId === buildingId;
  // 공개 화면에는 판정한 `me`를 넘깁니다. 공개 화면이 다시 useMe를 부르면 실패한 /api/me를 마운트마다
  // 다시 보내 pending ↔ error를 오가며 이 화면과 로딩을 반복했습니다(리뷰 H1).
  return (
    <Suspense fallback={<Loading />}>
      {/* ‘현관 QR’ 배지는 공개 화면(lofi 01)에만 있습니다. 거주자 홈(03)은 주소만 정리합니다. */}
      {resident ? <ResidentHome /> : <PublicBuilding me={me.data ?? null} viaQr={viaQr} />}
    </Suspense>
  );
}

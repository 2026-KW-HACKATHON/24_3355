import { createBrowserRouter } from "react-router";
import { BlankScreen, RootLayout } from "./RootLayout";
import { RouteError } from "./RouteError";

// 라우트는 docs/frontend.md §4. 화면 폴더마다 route.tsx에서 Component를 export하고 lazy로 불러옵니다.
export const router = createBrowserRouter([
  {
    Component: RootLayout,
    ErrorBoundary: RouteError,
    HydrateFallback: BlankScreen,
    children: [
      { index: true, lazy: () => import("../screens/root/route") },
      // 거주자면 거주자 홈(LF-05), 아니면 공개 화면(LF-01). 둘 다 같은 주소입니다.
      { path: "b/:buildingId", lazy: () => import("./BuildingRoute") },
      { path: "b/:buildingId/first", lazy: () => import("../screens/first-guide/route") },
      { path: "b/:buildingId/connect", lazy: () => import("../screens/connect/route") },
      {
        path: "b/:buildingId/guides/:guideId",
        lazy: () => import("../screens/guide-detail/route"),
      },
      {
        path: "b/:buildingId/notices/:noticeId",
        lazy: () => import("../screens/notice-detail/route"),
      },
      // 집주인에게 알리기(LF-10·11)와 생활 팁(LF-06·07)
      { path: "b/:buildingId/report", lazy: () => import("../screens/report-compose/route") },
      { path: "r/:reportId", lazy: () => import("../screens/report-status/route") },
      { path: "b/:buildingId/tips", lazy: () => import("../screens/tips/route") },
      { path: "b/:buildingId/tips/new", lazy: () => import("../screens/tip-write/route") },
      {
        path: "b/:buildingId/tips/:tipId/edit",
        lazy: () => import("../screens/tip-write/route"),
      },
      { path: "me", lazy: () => import("../screens/me/route") },
      { path: "me/moved", lazy: () => import("../screens/move-out-done/route") },
      { path: "me/reports", lazy: () => import("../screens/sent-reports/route") },
      { path: "me/tips", lazy: () => import("../screens/my-tips/route") },
      { path: "invite", lazy: () => import("../screens/landlord-invite/route") },
      { path: "manage", lazy: () => import("../screens/manage-index/route") },
      { path: "manage/:buildingId", lazy: () => import("../screens/landlord-home/route") },
      {
        path: "manage/:buildingId/inbox",
        lazy: () => import("../screens/landlord-inbox/route"),
      },
      {
        path: "manage/:buildingId/settings",
        lazy: () => import("../screens/landlord-settings/route"),
      },
      {
        path: "manage/:buildingId/notices/new",
        lazy: () => import("../screens/notice-write/route"),
      },
      {
        path: "manage/:buildingId/notices/:noticeId",
        lazy: () => import("../screens/notice-posted/route"),
      },
      { path: "manage/:buildingId/qr", lazy: () => import("../screens/qr-code/route") },
      { path: "manage/:buildingId/card", lazy: () => import("../screens/move-in-card/route") },
      {
        path: "manage/:buildingId/guides/new",
        lazy: () => import("../screens/guide-write/route"),
      },
      {
        path: "manage/:buildingId/guides/:guideId/edit",
        lazy: () => import("../screens/guide-write/route"),
      },
      {
        path: "manage/:buildingId/guides/:guideId/preview",
        lazy: () => import("../screens/guide-preview/route"),
      },
      {
        path: "manage/:buildingId/memos/:memoId",
        lazy: () => import("../screens/memo-review/route"),
      },
      {
        path: "manage/:buildingId/reports/:reportId",
        lazy: () => import("../screens/report-inbox/route"),
      },
      { path: "manage/:buildingId/ready", lazy: () => import("../screens/setup-done/route") },
      // 건물 확인(LF-12 23). 초대를 수락했지만 아직 확인하지 않은 건물(confirmedAt null)은 33 전에 여기로
      {
        path: "manage/:buildingId/confirm",
        lazy: () => import("../screens/landlord-confirm/route"),
      },
      // 시연 시작(LF-20 29). DEMO_MODE가 아니면 없는 주소로 보입니다(D-29)
      { path: "demo", lazy: () => import("../screens/demo/route") },
      // 약관·개인정보 처리방침 초안(D-28)
      { path: "terms", lazy: () => import("../screens/legal/route") },
      { path: "privacy", lazy: () => import("../screens/legal/route") },
      { path: "*", lazy: () => import("../screens/not-found/route") },
    ],
  },
]);

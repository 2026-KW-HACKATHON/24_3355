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
      { path: "b/:buildingId", lazy: () => import("../screens/public-building/route") },
      { path: "b/:buildingId/first", lazy: () => import("../screens/first-guide/route") },
      {
        path: "b/:buildingId/guides/:guideId",
        lazy: () => import("../screens/guide-detail/route"),
      },
      { path: "invite", lazy: () => import("../screens/landlord-invite/route") },
      { path: "manage", lazy: () => import("../screens/manage-index/route") },
      { path: "manage/:buildingId", lazy: () => import("../screens/landlord-home/route") },
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
      { path: "manage/:buildingId/ready", lazy: () => import("../screens/setup-done/route") },
      { path: "*", lazy: () => import("../screens/not-found/route") },
    ],
  },
]);

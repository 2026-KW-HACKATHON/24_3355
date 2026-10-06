import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import "@seed-design/css/base.css";
// Pretendard(OFL-1.1, public/fonts/Pretendard-OFL.txt)는 CDN 없이 함께 배포합니다. 글자 범위별 woff2 조각 중
// 화면에 쓰인 글자의 조각만 받고, 받기 전에는 시스템 글꼴로 먼저 그립니다(font-display: swap).
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./styles/tokens.css";
import "./styles/global.css";
import { Providers } from "./app/providers";
import { router } from "./app/router";
import { registerServiceWorker } from "./features/push/push";
import { initLargeMode } from "./lib/largeMode";

// react-grab·react-scan은 화면 아래에 도구 막대를 띄워 하단 버튼을 가립니다. 필요할 때만 켭니다.
if (import.meta.env.DEV && import.meta.env["VITE_ENABLE_REACT_DEVTOOLS"] === "1") {
  void import("react-grab");
  void import("react-scan");
}

// 크게 보기는 첫 그리기 전에 반영해 글자 크기가 깜빡이지 않게 합니다.
initLargeMode();
// 홈 화면 앱에서 공지 알림을 받으려면 service worker가 등록돼 있어야 합니다(화면은 캐시하지 않음).
registerServiceWorker();

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </StrictMode>,
  );

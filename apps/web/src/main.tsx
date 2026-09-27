import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import "@seed-design/css/base.css";
import "./styles/tokens.css";
import "./styles/global.css";
import { Providers } from "./app/providers";
import { router } from "./app/router";
import { initLargeMode } from "./lib/largeMode";

if (import.meta.env.DEV && import.meta.env["VITE_DISABLE_REACT_DEVTOOLS"] !== "1") {
  void import("react-grab");
  void import("react-scan");
}

// 크게 보기는 첫 그리기 전에 반영해 글자 크기가 깜빡이지 않게 합니다.
initLargeMode();

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </StrictMode>,
  );

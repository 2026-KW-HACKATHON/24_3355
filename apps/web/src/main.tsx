import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@seed-design/css/base.css";
import "./styles/tokens.css";
import "./styles/global.css";
import { App } from "./app/App";

if (import.meta.env.DEV && import.meta.env["VITE_DISABLE_REACT_DEVTOOLS"] !== "1") {
  void import("react-grab");
  void import("react-scan");
}

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

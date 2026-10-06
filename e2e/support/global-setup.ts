import type { FullConfig } from "@playwright/test";

/** 개발 서버와 시연 모드가 켜져 있는지 먼저 확인합니다. 서버를 대신 띄우지 않습니다. */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:5173";
  const health = await fetch(new URL("/api/health", baseURL)).catch(() => undefined);
  if (!health?.ok) {
    throw new Error(
      `${baseURL}/api/health에 닿지 않아요. 먼저 \`pnpm db:up && pnpm dev\`로 웹과 API를 띄워 주세요.`,
    );
  }
  const demo = await fetch(new URL("/api/dev/login", baseURL));
  if (demo.status !== 204) {
    throw new Error(
      "시연 로그인(GET /api/dev/login)이 204가 아니에요. apps/api/.env의 DEMO_MODE=true와 `pnpm db:seed`를 확인해 주세요.",
    );
  }
}

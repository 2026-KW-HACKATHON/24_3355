import { defineConfig } from "@playwright/test";

// 끝까지 해보는 테스트(lofi/screens.md). 이미 떠 있는 개발 서버(pnpm dev)에 붙어서 돕니다.
// 서버를 새로 띄우지 않으므로 먼저 `pnpm db:up && pnpm dev`를 실행해 둡니다.
const baseURL = process.env["E2E_BASE_URL"] ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  // `*.spec.ts`는 루트 vitest(pnpm test)가 집어 가므로 e2e는 `*.e2e.ts`로 씁니다.
  testMatch: /.*\.e2e\.ts$/,
  globalSetup: "./e2e/support/global-setup.ts",
  // E2E_RESET_DEMO=1이면 끝나고 시연 건물을 `--reset-demo`로 되돌립니다(기본은 그대로 둠).
  globalTeardown: "./e2e/support/global-teardown.ts",
  // biome이 `node_modules`를 건너뛰므로 결과물을 저장소 밖 캐시에 둡니다.
  outputDir: "node_modules/.cache/playwright/results",
  // 시연 건물 네 곳의 DB와 시연 계정(입주자 A·B의 연결)을 함께 쓰므로 한 번에 하나씩 돌립니다.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env["CI"]),
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    // 로컬 Google Chrome을 씁니다(브라우저를 따로 받지 않음).
    channel: "chrome",
    headless: true,
    // lofi 기준 폭(390×844, 9:19.5)
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});

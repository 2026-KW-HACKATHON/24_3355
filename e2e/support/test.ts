import { type BrowserContext, test as base, expect, type Page } from "@playwright/test";

/**
 * 개발 서버가 붙이는 react-grab 도구 막대(main.tsx, DEV 전용)는 390px 폭에서 하단 버튼을 가려
 * 누르기를 가로챕니다. 제품 화면이 아니므로 테스트에서는 숨깁니다.
 */
export async function hideDevOverlays(context: BrowserContext) {
  await context.addInitScript(() => {
    const hide = () => {
      const style = document.createElement("style");
      style.textContent = "[data-react-grab]{display:none!important}";
      document.documentElement.append(style);
    };
    if (document.documentElement) hide();
    else document.addEventListener("DOMContentLoaded", hide, { once: true });
  });
}

/** 링크든 버튼이든 이름으로 찾습니다. 아직 열지 않은 행동은 비활성 버튼, 열리면 링크가 됩니다. */
export function action(page: Page, name: string | RegExp) {
  return page.getByRole("link", { name }).or(page.getByRole("button", { name }));
}

/**
 * 공개 화면 ‘건물 안내’ 구역에서 이 안내로 가는 링크. 타일(‘분리수거: 제목’)이든 목록(‘제목 분리수거’)이든
 * 이름에 제목이 들어 있으므로 제목으로 찾습니다.
 */
export function guideLink(page: Page, title: string) {
  return page.getByRole("region", { name: "건물 안내" }).getByRole("link", { name: title });
}

type Fixtures = {
  /** 잡히지 않은 스크립트 오류가 있으면 테스트를 실패시킵니다. 콘솔 오류는 첨부만 합니다. */
  pageErrors: string[];
};

export const test = base.extend<Fixtures>({
  context: async ({ context }, use) => {
    await hideDevOverlays(context);
    await use(context);
  },
  pageErrors: [
    async ({ page }, use, testInfo) => {
      const errors: string[] = [];
      const consoleErrors: string[] = [];
      page.on("pageerror", (error) => errors.push(`${error.name}: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      await use(errors);
      if (consoleErrors.length > 0) {
        await testInfo.attach("console-errors", {
          body: consoleErrors.join("\n"),
          contentType: "text/plain",
        });
      }
      expect(errors, "잡히지 않은 스크립트 오류").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

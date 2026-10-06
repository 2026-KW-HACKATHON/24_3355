// 공통 조건을 새 화면(C~F)에도: ‘현관 QR’ 배지(?via=qr), 28 크게 보기(행동을 빼지 않음), 동작 줄이기.
// 대상: 03 거주자 홈, 11 안내(거주자), 04 생활 팁, 45 내 정보, 21 보낸 내용, 02 연결, 24 관리 홈(운영 중), 25 메모 검토
// 14·22와 공개 화면(01·36)은 states.e2e.ts·accessibility.e2e.ts에 있습니다.
import type { Page } from "@playwright/test";
import { ensureResident } from "./support/api";
import {
  type DemoUser,
  E2E_BUILDING,
  loginAs,
  publishedGuides,
  RESIDENT_A,
  SUNNY,
} from "./support/demo";
import { sheet } from "./support/flows";
import { expect, hideDevOverlays, test } from "./support/test";

const home = `/b/${SUNNY.id}`;
/** 시드 메모(택배 안내, 작성자 연결 없음). 상태와 상관없이 25 화면이 열립니다. */
const SEED_MEMO_ID = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f52";

test.describe("‘현관 QR’ 배지(?via=qr)", () => {
  test("인쇄한 현관 QR 주소(?via=qr)로 열었을 때만 배지가 보이고, 주소에서 via는 지운다", async ({
    page,
  }) => {
    await page.goto(`${home}?via=qr`);
    const heading = page.getByRole("heading", { level: 1, name: SUNNY.name });
    await expect(heading).toBeVisible();
    await expect(page.getByText("현관 QR", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${home}$`));
  });

  test("그냥 건물 주소로 열면 ‘현관 QR’ 배지가 없다", async ({ page }) => {
    await page.goto(home);
    await expect(page.getByRole("heading", { level: 1, name: SUNNY.name })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("현관 QR", { exact: true })).toHaveCount(0);
  });
});

/**
 * 화면의 행동: 링크는 가는 곳(href), 버튼은 이름. 크게 보기는 배치·문구가 바뀌어도 같은 곳으로 가야 하므로
 * 링크는 주소로 비교하고, 켜짐·꺼짐 같은 상태 글자는 뺍니다.
 */
async function actionKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      return element.getClientRects().length > 0 && style.visibility !== "hidden";
    };
    const keys = [...document.querySelectorAll("a[href], button")]
      .filter(visible)
      .map((element) => {
        if (element.tagName === "A") return `link ${element.getAttribute("href")}`;
        const name = element.getAttribute("aria-label") ?? element.textContent ?? "";
        return `button ${name
          .replace(/켜짐|꺼짐/g, "")
          .replace(/\s+/g, " ")
          .trim()}`;
      });
    return [...new Set(keys)];
  });
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
}

type Screen = { id: string; as: DemoUser | null; path: () => Promise<string> | string };

const SCREENS: Screen[] = [
  { id: "03 거주자 홈", as: RESIDENT_A, path: () => home },
  {
    id: "11 안내(거주자)",
    as: RESIDENT_A,
    path: async () => {
      const response = await fetch(new URL(`/api/buildings/${SUNNY.id}/guides`, baseURL()));
      const { guides } = (await response.json()) as { guides: { id: string }[] };
      return `${home}/guides/${guides[0]?.id}`;
    },
  },
  { id: "04 생활 팁", as: RESIDENT_A, path: () => `${home}/tips` },
  { id: "45 내 정보", as: RESIDENT_A, path: () => "/me" },
  { id: "21 보낸 내용", as: RESIDENT_A, path: () => "/me/reports" },
  { id: "02 연결(1/2)", as: null, path: () => `/b/${E2E_BUILDING.id}/connect` },
  { id: "24 관리 홈(운영 중)", as: "demo-landlord", path: () => `/manage/${SUNNY.id}` },
  {
    id: "25 메모 검토",
    as: "demo-landlord",
    path: () => `/manage/${SUNNY.id}/memos/${SEED_MEMO_ID}`,
  },
];

function baseURL(): string {
  return test.info().project.use.baseURL ?? "http://localhost:5173";
}

test.describe("크게 보기(28)는 새 화면에서도 행동을 빼지 않는다", () => {
  test.beforeAll(async () => {
    const a = await ensureResident(RESIDENT_A, SUNNY.id, "demo-landlord");
    await a.dispose();
  });

  for (const screen of SCREENS) {
    test(`${screen.id}: 기본 화면의 링크·버튼이 크게 보기에도 모두 있다`, async ({ page }) => {
      if (screen.as) await loginAs(page, screen.as);
      const path = await screen.path();
      await page.goto(path);
      await settle(page);
      const before = await actionKeys(page);
      expect(before.length, `${screen.id}: 행동이 있어야 해요`).toBeGreaterThan(0);

      await page.evaluate(() => localStorage.setItem("wh.size", "large"));
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-size", "large");
      await settle(page);
      const after = await actionKeys(page);

      const missing = before.filter((key) => !after.includes(key));
      expect(missing, `${screen.id} 크게 보기에서 빠진 행동`).toEqual([]);
    });
  }
});

test.describe("동작 줄이기(prefers-reduced-motion)는 새 화면과 시트에도", () => {
  test.use({ reducedMotion: "reduce" });

  /** body 아래(포털로 그리는 시트 포함)에 애니메이션·전환이 남은 요소. */
  async function moving(page: Page) {
    return page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("body *")]
        .filter((element) => {
          const style = getComputedStyle(element);
          return (
            style.animationName !== "none" ||
            style.transitionDuration.split(",").some((value) => Number.parseFloat(value) > 0)
          );
        })
        .map((element) => `${element.tagName}.${element.className.toString()}`)
        .slice(0, 10),
    );
  }

  test("거주자 홈·팁·내 정보와 그 위의 시트(알리기·이사 확인)에 움직임이 없다", async ({
    page,
  }) => {
    await loginAs(page, RESIDENT_A);
    await page.goto(home);
    await settle(page);
    expect(await moving(page), "03 거주자 홈").toEqual([]);

    await page.getByRole("button", { name: /집주인에게 알리기/ }).click();
    await expect(sheet(page, "집주인에게 알리기")).toBeVisible();
    expect(await moving(page), "알리기 시트").toEqual([]);
    await page.keyboard.press("Escape");

    await page.goto(`${home}/tips`);
    await settle(page);
    expect(await moving(page), "04 생활 팁").toEqual([]);

    await page.goto("/me");
    await settle(page);
    await page.getByRole("button", { name: "이 건물에서 이사했어요" }).click();
    await expect(sheet(page, `${SUNNY.name}에서 이사했나요?`)).toBeVisible();
    expect(await moving(page), "08 이사 확인 시트").toEqual([]);
  });

  test("안내(11)의 메모 시트(12)와 관리 홈(24)에도 움직임이 없다", async ({ page, browser }) => {
    const [guide] = await publishedGuides(page, SUNNY.id);
    await loginAs(page, RESIDENT_A);
    await page.goto(`${home}/guides/${guide?.id}`);
    await settle(page);
    await page.getByRole("button", { name: "메모 남기기" }).click();
    await expect(sheet(page, "어떤 부분이 달라졌나요?")).toBeVisible();
    expect(await moving(page), "12 메모 시트").toEqual([]);

    const office = await browser.newContext({ reducedMotion: "reduce" });
    await hideDevOverlays(office);
    const owner = await office.newPage();
    try {
      await loginAs(owner, "demo-landlord");
      await owner.goto(`/manage/${SUNNY.id}`);
      await settle(owner);
      expect(await moving(owner), "24 관리 홈").toEqual([]);
    } finally {
      await office.close();
    }
  });
});

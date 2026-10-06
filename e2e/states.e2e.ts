// 공통 조건(screens.md §8 빈 화면과 오류): 14 안내 없음, 22 건물 없음, ‘불러오지 못했어요’
import type { Page, Route } from "@playwright/test";
import {
  buildingStatus,
  MISSING_BUILDING_ID,
  publishedGuides,
  SPRING,
  SUNNY,
} from "./support/demo";
import { expect, test } from "./support/test";

const EMPTY = "아직 등록된 안내가 없어요";
// 문구는 lofi 22를 따릅니다(오케스트레이터 결정, screens.md §8은 예전 문구).
const NOT_FOUND = "건물 정보를 찾을 수 없어요";
const LOAD_ERROR = "불러오지 못했어요";
// 연결 문제는 react-query가 두 번 더 시도한 뒤(약 3초) 오류 화면이 됩니다.
const AFTER_RETRIES = { timeout: 15_000 };

test.describe("안내 없음(lofi 14)", () => {
  test("준비 중(preparing)인 건물의 QR은 ‘아직 등록된 안내가 없어요’를 보여준다", async ({
    page,
  }) => {
    expect(
      await buildingStatus(page, SPRING.id),
      "새봄하우스가 preparing이어야 해요. 바뀌었으면 `pnpm db:seed -- --reset-demo`로 되돌립니다",
    ).toBe("preparing");

    await page.goto(`/b/${SPRING.id}`);

    await expect(page.getByRole("heading", { level: 1, name: EMPTY })).toBeVisible();
    await expect(page.getByText(SPRING.name, { exact: false })).toBeVisible();
    await expect(page.getByRole("region", { name: "건물 안내" })).toHaveCount(0);
    await expect(page.getByText(LOAD_ERROR)).toHaveCount(0);
  });

  test("안내가 없는 건물에서도 ‘집주인에게 알리기’ 자리는 남아 있다", async ({ page }) => {
    await page.goto(`/b/${SPRING.id}`);
    await expect(page.getByRole("heading", { level: 1, name: EMPTY })).toBeVisible();
    await expect(page.getByRole("button", { name: "집주인에게 알리기" })).toBeVisible();
  });

  test("안내가 없는 건물의 ‘처음 오셨나요’도 빈 상태를 보여준다", async ({ page }) => {
    await page.goto(`/b/${SPRING.id}/first`);
    await expect(page.getByRole("heading", { name: EMPTY })).toBeVisible();
  });
});

test.describe("건물 없음(lofi 22)", () => {
  test("형식은 맞지만 없는 건물 주소는 ‘건물 정보를 찾을 수 없어요’를 보여준다", async ({
    page,
  }) => {
    await page.goto(`/b/${MISSING_BUILDING_ID}`);
    await expect(page.getByRole("heading", { level: 1, name: NOT_FOUND })).toBeVisible();
    await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();
    await expect(page.getByText(EMPTY)).toHaveCount(0);
  });

  test("잘못된 형식의 건물 주소도 건물 없음으로 보여준다", async ({ page }) => {
    await page.goto("/b/not-a-building");
    await expect(page.getByRole("heading", { level: 1, name: NOT_FOUND })).toBeVisible();
  });

  test("없는 경로는 건물 없음 화면으로 보여준다", async ({ page }) => {
    await page.goto("/this/path/does-not-exist");
    await expect(page.getByRole("heading", { level: 1, name: NOT_FOUND })).toBeVisible();
  });

  test("없는 안내 주소는 ‘이 안내를 찾을 수 없어요’와 건물 안내로 가는 길을 준다", async ({
    page,
  }) => {
    await page.goto(`/b/${SUNNY.id}/guides/${MISSING_BUILDING_ID}`);
    await expect(page.getByRole("heading", { name: "이 안내를 찾을 수 없어요" })).toBeVisible();
    await page.getByRole("link", { name: "건물 안내 전체 보기" }).click();
    await expect(page.getByRole("heading", { level: 1, name: SUNNY.name })).toBeVisible();
  });
});

test.describe("연결 문제(불러오지 못했어요)", () => {
  test("안내 목록을 불러오지 못하면 ‘안내 없음’이 아니라 ‘불러오지 못했어요’를 보여준다", async ({
    page,
  }) => {
    await failRequests(page, `**/api/buildings/${SUNNY.id}/guides`);

    await page.goto(`/b/${SUNNY.id}`);

    await expect(
      page.getByRole("heading", { level: 1, name: LOAD_ERROR }),
      "연결 문제는 오류 상태로",
    ).toBeVisible(AFTER_RETRIES);
    await expect(page.getByText(EMPTY)).toHaveCount(0);
    await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();
  });

  test("건물 정보를 불러오지 못하면 ‘건물 없음’이 아니라 ‘불러오지 못했어요’를 보여준다", async ({
    page,
  }) => {
    await failRequests(page, `**/api/buildings/${SUNNY.id}`);

    await page.goto(`/b/${SUNNY.id}`);

    await expect(page.getByRole("heading", { level: 1, name: LOAD_ERROR })).toBeVisible(
      AFTER_RETRIES,
    );
    await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
    await expect(page.getByText(EMPTY)).toHaveCount(0);
  });

  test("서버 오류(500)도 ‘안내 없음’이 아니라 ‘불러오지 못했어요’로 보여준다", async ({ page }) => {
    await page.route(`**/api/buildings/${SUNNY.id}/guides`, (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "INTERNAL_ERROR" } }),
      }),
    );

    await page.goto(`/b/${SUNNY.id}`);

    await expect(page.getByRole("heading", { level: 1, name: LOAD_ERROR })).toBeVisible(
      AFTER_RETRIES,
    );
    await expect(page.getByText(EMPTY)).toHaveCount(0);
  });

  test("연결이 돌아온 뒤 ‘다시 시도’를 누르면 안내 타일이 보인다", async ({ page }) => {
    const guides = await publishedGuides(page, SUNNY.id);
    await failRequests(page, `**/api/buildings/${SUNNY.id}/guides`);
    await page.goto(`/b/${SUNNY.id}`);
    await expect(page.getByRole("heading", { level: 1, name: LOAD_ERROR })).toBeVisible(
      AFTER_RETRIES,
    );

    await page.unrouteAll({ behavior: "wait" });
    await page.getByRole("button", { name: "다시 시도" }).click();

    await expect(page.getByRole("heading", { level: 1, name: SUNNY.name })).toBeVisible();
    await expect(page.getByRole("region", { name: "건물 안내" }).getByRole("listitem")).toHaveCount(
      guides.length,
    );
  });

  test("공지만 불러오지 못하면 공지 자리에 다시 시도를 두고 안내는 그대로 보여준다", async ({
    page,
  }) => {
    // 공지 API 주소(`/notices`, 예전 `/notices/current`)가 바뀌어도 잡히게 앞부분으로 막습니다.
    await failRequests(page, new RegExp(`/api/buildings/${SUNNY.id}/notices(/|\\?|$)`));

    await page.goto(`/b/${SUNNY.id}`);

    await expect(page.getByText("공지를 불러오지 못했어요")).toBeVisible(AFTER_RETRIES);
    await expect(page.getByRole("region", { name: "건물 안내" })).toBeVisible();
  });

  test("안내 상세를 불러오지 못하면 ‘찾을 수 없어요’가 아니라 ‘불러오지 못했어요’를 보여준다", async ({
    page,
  }) => {
    const [guide] = await publishedGuides(page, SUNNY.id);
    if (!guide) throw new Error("공개된 안내가 없어요");
    await failRequests(page, `**/api/guides/${guide.id}`);

    await page.goto(`/b/${SUNNY.id}/guides/${guide.id}`);

    await expect(page.getByRole("heading", { level: 1, name: LOAD_ERROR })).toBeVisible(
      AFTER_RETRIES,
    );
    await expect(page.getByText("이 안내를 찾을 수 없어요")).toHaveCount(0);
  });

  test("안내 없음 건물도 연결 문제면 ‘안내 없음’ 대신 ‘불러오지 못했어요’를 보여준다", async ({
    page,
  }) => {
    await failRequests(page, `**/api/buildings/${SPRING.id}/guides`);

    await page.goto(`/b/${SPRING.id}`);

    await expect(page.getByRole("heading", { level: 1, name: LOAD_ERROR })).toBeVisible(
      AFTER_RETRIES,
    );
    await expect(page.getByText(EMPTY)).toHaveCount(0);
  });
});

/** 요청이 네트워크에서 끊긴 것처럼 만듭니다(DevTools의 요청 차단과 같음). */
function failRequests(page: Page, pattern: string | RegExp) {
  return page.route(pattern, (route: Route) => route.abort("internetdisconnected"));
}

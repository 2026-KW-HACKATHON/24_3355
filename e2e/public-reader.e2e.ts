// 끝까지 해보는 테스트 ‘미가입 세입자’: 로그인 없이 필요한 안내를 읽는다.
// LF-01 공개 건물 화면(01) → LF-02 안내 상세(11), 처음 오셨나요(36·46)
import type { Page } from "@playwright/test";
import { publishedGuides, SUNNY } from "./support/demo";
import { action, expect, guideLink, test } from "./support/test";

const home = `/b/${SUNNY.id}`;

test.describe("미가입 세입자 · 공개 건물 화면(LF-01)", () => {
  test("로그인 없이 건물 이름·주소와 공개된 안내 타일을 모두 본다", async ({ page }) => {
    const guides = await publishedGuides(page, SUNNY.id);
    expect(guides.length, "햇살빌라에 공개된 안내가 있어야 해요").toBeGreaterThan(0);

    await page.goto(home);

    await expect(page.getByRole("heading", { level: 1, name: SUNNY.name })).toBeVisible();
    await expect(page.getByText("월계동 OO길", { exact: false }).first()).toBeVisible();
    const tiles = page.getByRole("region", { name: "건물 안내" }).getByRole("listitem");
    await expect(tiles).toHaveCount(guides.length);
    for (const guide of guides) {
      await expect(guideLink(page, guide.title)).toBeVisible();
    }
    await expect(page.getByText("로그인이 필요해요")).toHaveCount(0);
  });

  test("주소는 도로명까지만 보이고 번지는 보이지 않는다", async ({ page }) => {
    await page.goto(home);
    await expect(page.getByRole("heading", { level: 1, name: SUNNY.name })).toBeVisible();
    // 시드의 전체 주소(월계동 000-00)는 공개 화면에 나오면 안 됩니다(screens.md §2).
    await expect(page.locator("body")).not.toContainText(/월계동 \d{3}-\d{2}/);
  });

  test("검색엔진에 노출하지 않도록 noindex를 둔다", async ({ page }) => {
    await page.goto(home);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("‘처음 오셨나요?’에 공개된 안내 수만큼 장 수를 보여준다", async ({ page }) => {
    const guides = await publishedGuides(page, SUNNY.id);
    await page.goto(home);
    await expect(
      page.getByRole("link", { name: `처음 오셨나요? 이 건물 안내 ${guides.length}개를` }),
    ).toBeVisible();
  });
});

test.describe("미가입 세입자 · 안내 상세(LF-02, lofi 11)", () => {
  test("안내 타일을 누르면 집주인이 쓴 제목과 본문을 줄바꿈 그대로 읽는다", async ({ page }) => {
    const [guide] = await publishedGuides(page, SUNNY.id);
    if (!guide) throw new Error("공개된 안내가 없어요");

    await page.goto(home);
    await guideLink(page, guide.title).click();

    await expect(page).toHaveURL(new RegExp(`/b/${SUNNY.id}/guides/${guide.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: guide.title })).toBeVisible();
    const article = page.getByRole("article");
    for (const line of guide.body.split("\n").filter(Boolean)) {
      await expect(article).toContainText(line);
    }
    // 줄바꿈을 살립니다(frontend.md §5, white-space: pre-line).
    const whiteSpace = await article
      .getByText(guide.body.split("\n")[0] ?? "", { exact: false })
      .evaluate((element) => getComputedStyle(element).whiteSpace);
    expect(["pre-line", "pre-wrap", "pre"]).toContain(whiteSpace);
  });

  test("안내 상세의 뒤로 버튼은 공개 건물 화면으로 돌아간다", async ({ page }) => {
    const [guide] = await publishedGuides(page, SUNNY.id);
    if (!guide) throw new Error("공개된 안내가 없어요");

    // 주소로 바로 열어도(앱 안 기록 없음) 건물 화면으로 갑니다.
    await page.goto(`${home}/guides/${guide.id}`);
    await page.getByRole("button", { name: "뒤로" }).click();

    await expect(page).toHaveURL(new RegExp(`${home}$`));
    await expect(page.getByRole("heading", { level: 1, name: SUNNY.name })).toBeVisible();
  });

  test("다른 건물 주소로 연 안내는 안내가 속한 건물 주소로 바뀐다", async ({ page }) => {
    const [guide] = await publishedGuides(page, SUNNY.id);
    if (!guide) throw new Error("공개된 안내가 없어요");

    await page.goto(`/b/00000000-0000-4000-8000-000000000000/guides/${guide.id}`);

    await expect(page).toHaveURL(new RegExp(`${home}/guides/${guide.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: guide.title })).toBeVisible();
  });
});

test.describe("미가입 세입자 · 처음 오셨나요(lofi 36·46)", () => {
  test("공개 화면에서 들어가 한 장씩 넘기면 마지막 장에서 연결을 제안한다", async ({ page }) => {
    const guides = await publishedGuides(page, SUNNY.id);
    const total = guides.length;

    await page.goto(home);
    await page.getByRole("link", { name: /처음 오셨나요\?/ }).click();

    await expect(page.getByRole("heading", { level: 1, name: "처음 오셨나요?" })).toBeVisible();
    await expect(page.getByText(`${total}장 중 1번째`, { exact: true })).toBeAttached();
    await expect(cardBadge(page, 1, total)).toBeInViewport();

    for (let index = 2; index <= total; index++) {
      await dockNext(page).click();
      await expect(cardBadge(page, index, total)).toBeInViewport();
      await expect(page.getByText(`${total}장 중 ${index}번째`, { exact: true })).toBeAttached();
    }

    // 마지막 장(46): 연결 제안과 ‘지금은 안내만 보기’
    await expect(page.getByRole("heading", { name: "다음 공지도 받아보려면" })).toBeInViewport();
    await expect(page.getByRole("button", { name: "지금은 안내만 보기" })).toBeVisible();
    await expect(action(page, "연결하기")).toBeVisible();
  });

  test("마지막 장의 ‘지금은 안내만 보기’는 공개 건물 화면으로 돌아간다", async ({ page }) => {
    const guides = await publishedGuides(page, SUNNY.id);

    await page.goto(home);
    await page.getByRole("link", { name: /처음 오셨나요\?/ }).click();
    for (let index = 2; index <= guides.length; index++) {
      await dockNext(page).click();
      await expect(cardBadge(page, index, guides.length)).toBeInViewport();
    }
    await page.getByRole("button", { name: "지금은 안내만 보기" }).click();

    await expect(page).toHaveURL(new RegExp(`${home}$`));
    await expect(page.getByRole("heading", { level: 1, name: SUNNY.name })).toBeVisible();
  });

  test("카드의 ‘이 안내 끝까지 보기’는 같은 안내의 상세로 간다", async ({ page }) => {
    const [first] = await publishedGuides(page, SUNNY.id);
    if (!first) throw new Error("공개된 안내가 없어요");

    await page.goto(`${home}/first`);
    await page
      .getByRole("article", { name: first.title })
      .getByRole("link", { name: "이 안내 끝까지 보기" })
      .click();

    await expect(page).toHaveURL(new RegExp(`${home}/guides/${first.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: first.title })).toBeVisible();
  });
});

/** 카드 머리의 ‘분리수거 · 1 / 4’. 11 / 14 안의 1 / 14를 잘못 잡지 않게 앞 글자를 봅니다. */
function cardBadge(page: Page, index: number, total: number) {
  return page.getByText(new RegExp(`(^|\\D)${index} / ${total}$`));
}

/** 하단 고정 버튼의 ‘다음 안내’. 위쪽 화살표 버튼과 이름이 같아서 DOM에서 뒤에 오는 것을 씁니다. */
function dockNext(page: Page) {
  return page.getByRole("button", { name: "다음 안내" }).last();
}

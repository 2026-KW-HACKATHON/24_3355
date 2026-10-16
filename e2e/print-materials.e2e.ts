// 집주인 인쇄물: 안내 스티커(안내마다 5cm QR)와 명함 크기 입주 카드, 설정의 새 메모·제보 알림 줄.
// 읽기만 하는 화면이라 테스트빌라(쓰기 테스트용 집주인)를 그대로 씁니다.
import { E2E_BUILDING, loginAsE2eLandlord, publishedGuides } from "./support/demo";
import { expect, test } from "./support/test";

const manage = `/manage/${E2E_BUILDING.id}`;

test.describe("집주인 인쇄물(26·39)", () => {
  test("QR 화면에서 안내 스티커를 열면 공개한 안내마다 스티커가 한 장씩 있다", async ({ page }) => {
    await loginAsE2eLandlord(page);
    const published = await publishedGuides(page, E2E_BUILDING.id);
    await page.goto(`${manage}/qr`);
    await page.getByRole("link", { name: "안내마다 붙이는 QR 스티커" }).click();
    await expect(page).toHaveURL(`${manage}/stickers`);
    await expect(page.getByRole("heading", { name: "안내 스티커" })).toBeVisible();
    await expect(page.locator(".st-sticker")).toHaveCount(published.length);
    await expect(page.getByRole("button", { name: "인쇄하기" })).toBeVisible();
  });

  test("입주 카드에서 명함 크기를 고르면 명함 카드 미리 보기로 바뀐다", async ({ page }) => {
    await loginAsE2eLandlord(page);
    await page.goto(`${manage}/card`);
    await expect(
      page.getByRole("article", { name: `${E2E_BUILDING.name} 입주 카드` }),
    ).toBeVisible();
    await page.getByRole("radio", { name: "명함 크기(90×50mm, 절취선)" }).check();
    await expect(
      page.getByRole("article", { name: `${E2E_BUILDING.name} 명함 크기 입주 카드` }),
    ).toBeVisible();
    await expect(page.getByText("A4 한 장에 10장이 찍혀요")).toBeVisible();
  });

  test("설정의 ‘새 메모·제보 알림’은 누를 수 있고 알림 선택 시트를 연다", async ({ page }) => {
    await loginAsE2eLandlord(page);
    await page.goto(`${manage}/settings`);
    const row = page.getByRole("button", { name: /새 메모·제보 알림/ });
    await expect(row).toBeEnabled();
    await row.click();
    // 로컬은 VAPID 키가 없어 ‘보내지 않고 있어요’ 상태일 수 있습니다. 어느 상태든 메모·제보 문구로 뜹니다.
    await expect(page.getByRole("dialog")).toContainText(/메모·제보|받은 내용/);
  });
});

// 끝까지 해보는 테스트 ‘안내 사진’(D-34): 안내 쓰기(33)에서 사진을 고르면 줄여서 올리고, 미리 보기(43)·공개 뒤
// 비회원 공개 화면(11)에 사진이 보인다. 로컬 API의 사진 저장소(PHOTO_STORE=local)를 씁니다.
// 공개한 안내를 지우는 API가 없어 쓰기 테스트 전용 건물(테스트빌라)에서만 합니다.

import {
  E2E_BUILDING,
  loginAsE2eLandlord,
  requirePrecondition,
  stamp,
  TERMS_CONSENT,
} from "./support/demo";
import { expect, guideLink, hideDevOverlays, test } from "./support/test";

/** 64×48 JPEG. */
const JPEG = Buffer.from(
  "/9j/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAwAEADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAT/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCEBeRAAAAAAAAAAAAAAAAAAAAAAH//2Q==",
  "base64",
);

test("안내에 사진을 붙여 공개하면 비회원 공개 화면에 사진이 보인다", async ({ page, browser }) => {
  const config = await page.request.get("/api/photos/config");
  requirePrecondition(
    (await config.json()).uploadsEnabled === true,
    "이 API에는 사진 저장소가 없어요(apps/api/.env PHOTO_STORE=local)",
  );
  const title = `e2e 사진 안내 ${stamp()}`;
  await loginAsE2eLandlord(page);

  await test.step("안내 쓰기(33)에서 사진을 고르면 올라가 칸에 보인다", async () => {
    await page.goto(`/manage/${E2E_BUILDING.id}`);
    await page.getByRole("link", { name: /기본 안내 (추가하기|쓰기)/ }).click();
    await page.getByRole("radio", { name: "공용공간" }).check();
    await page.getByRole("textbox", { name: "제목" }).fill(title);
    await page.getByRole("textbox", { name: "내용" }).fill("자전거는 1층 계단 옆에 세워 주세요.");
    await expect(page.getByText("사진 위치 정보는 지워져요")).toBeVisible();
    const uploaded = page.waitForResponse(
      (response) => response.url().endsWith("/photos") && response.request().method() === "POST",
    );
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: "bike.jpg", mimeType: "image/jpeg", buffer: JPEG });
    expect((await uploaded).status()).toBe(201);
    await expect(page.getByRole("img", { name: `${title} 사진 1` })).toBeVisible();
    await expect(page.getByRole("button", { name: "사진 1 빼기" })).toBeVisible();
    await page.getByRole("button", { name: "미리 보기" }).click();
  });

  await test.step("미리 보기(43)에 사진이 보이고 공개한다", async () => {
    const frame = page.getByRole("article", { name: "세입자가 보는 안내 미리 보기" });
    await expect(frame.getByRole("img", { name: `${title} 사진 1` })).toBeVisible();
    await page.getByRole("button", { name: "안내 공개하기" }).click();
    await expect(page).toHaveURL(new RegExp(`/manage/${E2E_BUILDING.id}$`));
  });

  await test.step("로그인하지 않은 세입자에게 사진이 보인다", async () => {
    const visitor = await browser.newContext();
    await hideDevOverlays(visitor);
    const tenant = await visitor.newPage();
    try {
      await tenant.goto(`/b/${E2E_BUILDING.id}`);
      await guideLink(tenant, title).click();
      const photo = tenant.getByRole("img", { name: `${title} 사진 1` });
      await expect(photo).toBeVisible();
      await expect
        .poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth))
        .toBe(64);
      const src = await photo.getAttribute("src");
      const file = await tenant.request.get(src ?? "");
      expect(file.status()).toBe(200);
      expect(file.headers()["content-type"]).toBe("image/webp");
      expect(file.headers()["cache-control"]).toBe("public, no-cache");
      const etag = file.headers()["etag"] ?? "";
      expect(etag).toMatch(/^"[0-9a-f-]{36}"$/);
      const again = await tenant.request.get(src ?? "", { headers: { "If-None-Match": etag } });
      expect(again.status()).toBe(304);
    } finally {
      await visitor.close();
    }
  });
});

test("약관 판이 바뀌어도 /demo의 역할 고르기는 다시 동의 시트 없이 들어간다", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: /^집주인/ }).click();
  await expect(page).toHaveURL(/\/manage\//);
  const me = await (await page.request.get("/api/me")).json();
  expect(me.user.termsVersion).toBe(TERMS_CONSENT);
  expect(me.user.termsUpToDate).toBe(true);
  await expect(page.getByText("약관이 바뀌었어요")).toHaveCount(0);
  await expect(page.getByText("약관에 동의해 주세요")).toHaveCount(0);
});

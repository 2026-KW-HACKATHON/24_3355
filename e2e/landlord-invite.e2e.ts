// 끝까지 해보는 테스트 ‘새 집주인 시작’의 입구: 초대 링크(41) → 로그인 → 관리 홈
// 초대는 테스트마다 db:invite로 새로 발급합니다(초대 행이 남음). 그래서 쓰기 테스트 전용 건물
// (테스트빌라)에만 발급하고, 수락은 이미 그 건물을 관리하는 쓰기 테스트용 집주인으로만 해서
// 관리자·건물 상태를 바꾸지 않습니다.
import { E2E_BUILDING, issueInvite, loginAsE2eLandlord } from "./support/demo";
import { expect, test } from "./support/test";

test.describe("집주인 초대(LF-12, lofi 41)", () => {
  test("초대 링크를 연 비회원은 초대받은 건물 이름과 카카오 시작 버튼을 본다", async ({ page }) => {
    const token = issueInvite(E2E_BUILDING.id);

    await page.goto(`/invite#t=${token}`);

    await expect(page.getByText(`${E2E_BUILDING.name} 관리자로 초대받았어요`)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("한곳에 정리하세요");
    await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toBeVisible();
  });

  test("초대 화면에서는 시연용 로그인을 보여주지 않는다", async ({ page }) => {
    const token = issueInvite(E2E_BUILDING.id);

    await page.goto(`/invite#t=${token}`);

    await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toBeVisible();
    // 시연 로그인 가능 여부(GET /api/dev/login)를 물어볼 틈을 준 뒤에 없는지 봅니다.
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: /시연용/ })).toHaveCount(0);
  });

  test("초대 토큰은 주소창에서 지우고, 새로고침해도 같은 초대를 보여준다", async ({ page }) => {
    const token = issueInvite(E2E_BUILDING.id);

    await page.goto(`/invite#t=${token}`);
    await expect(page.getByText(`${E2E_BUILDING.name} 관리자로 초대받았어요`)).toBeVisible();
    await expect(page).toHaveURL(/\/invite$/);

    await page.reload();

    await expect(page.getByText(`${E2E_BUILDING.name} 관리자로 초대받았어요`)).toBeVisible();
  });

  test("이미 관리 중인 집주인이 초대를 수락하면 그 건물 관리 홈으로 간다", async ({ page }) => {
    await loginAsE2eLandlord(page);
    const token = issueInvite(E2E_BUILDING.id);

    await page.goto(`/invite#t=${token}`);
    await expect(page.getByText(`${E2E_BUILDING.name} 관리자로 초대받았어요`)).toBeVisible();
    await page.getByRole("button", { name: "초대 수락하고 시작하기" }).click();

    await expect(page).toHaveURL(new RegExp(`/manage/${E2E_BUILDING.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: E2E_BUILDING.name })).toBeVisible();
  });

  test("찾을 수 없는 초대 토큰은 ‘이미 수락했거나 찾을 수 없는 초대예요’를 보여준다", async ({
    page,
  }) => {
    await page.goto("/invite#t=not-a-real-invite-token-0000000000");
    await expect(
      page.getByRole("heading", { name: "이미 수락했거나 찾을 수 없는 초대예요" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toHaveCount(0);
  });

  test("토큰 없이 초대 화면을 열면 초대 링크를 다시 열어 달라고 한다", async ({ page }) => {
    await page.goto("/invite");
    await expect(page.getByRole("heading", { name: "초대 링크를 다시 열어 주세요" })).toBeVisible();
  });
});

test.describe("서비스 첫 화면(/)", () => {
  test("로그인하지 않은 사람에게는 현관 QR로 건물을 열어 달라고 안내한다", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "현관 QR로 우리 건물을 열어 주세요" }),
    ).toBeVisible();
  });
});

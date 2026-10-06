// 끝까지 해보는 테스트 ‘새 집주인 시작’(쓰기 → 43 → 공개 → 공개 화면)과 ‘안내 수정 실패’의 일부.
// LF-13 관리 홈(42) → LF-14 안내 쓰기(33) → 공개 전 확인(43) → 공개 → LF-01·02
//
// 안내를 공개하는 테스트는 지우는 API가 없어 데이터를 남기므로 쓰기 테스트 전용 건물(테스트빌라)과
// 집주인으로만 합니다. 서버에 저장하지 않는 테스트(임시 저장·입력 확인·저장 실패)는 햇살빌라에서 합니다.
import type { Page } from "@playwright/test";
import { E2E_BUILDING, loginAs, loginAsE2eLandlord, SUNNY, stamp } from "./support/demo";
import { agreeBeforeLogin } from "./support/flows";
import { action, expect, guideLink, hideDevOverlays, test } from "./support/test";

type Building = { readonly id: string; readonly name: string };

const manageHome = `/manage/${SUNNY.id}`;

/** 관리 홈(42)에서 ‘기본 안내 추가하기’(공개 전이면 ‘기본 안내 쓰기’)로 안내 쓰기(33)를 엽니다. */
async function openNewGuide(page: Page, building: Building = SUNNY) {
  await page.goto(`/manage/${building.id}`);
  await expect(page.getByRole("heading", { level: 1, name: building.name })).toBeVisible();
  await page.getByRole("link", { name: /기본 안내 (추가하기|쓰기)/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "기본 안내 쓰기" })).toBeVisible();
}

test.describe("집주인 · 안내 쓰기와 공개(LF-13·14)", () => {
  test("관리 홈에서 안내를 쓰고 미리 본 뒤 공개하면 비회원 공개 화면에 보인다", async ({
    page,
    browser,
  }) => {
    const title = `e2e 연락 안내 ${stamp()}`;
    const bodyLines = ["급한 일은 카톡으로 연락 주세요.", "밤 10시 이후에는 문자로 남겨 주세요."];

    await loginAsE2eLandlord(page);

    await test.step("관리 홈 → 안내 쓰기(33)", async () => {
      await openNewGuide(page, E2E_BUILDING);
      await page.getByRole("radio", { name: "연락" }).check();
      await page.getByRole("textbox", { name: "제목" }).fill(title);
      await page.getByRole("textbox", { name: "내용" }).fill(bodyLines.join("\n"));
      await page.getByRole("button", { name: "미리 보기" }).click();
    });

    await test.step("공개 전 확인(43): 경고와 세입자가 볼 화면", async () => {
      await expect(page).toHaveURL(/\/guides\/[0-9a-f-]+\/preview$/);
      await expect(page.getByRole("heading", { level: 1, name: "공개 전 확인" })).toBeVisible();
      await expect(
        page.getByText("이 안내는 QR이나 링크를 가진 누구나 볼 수 있어요"),
      ).toBeVisible();
      const frame = page.getByRole("article", { name: "세입자가 보는 안내 미리 보기" });
      await expect(frame.getByRole("heading", { name: title })).toBeVisible();
      for (const line of bodyLines) await expect(frame).toContainText(line);
    });

    await test.step("돌아가서 수정하면 쓰던 내용이 남아 있다", async () => {
      await page.getByRole("button", { name: "돌아가서 수정" }).last().click();
      await expect(page).toHaveURL(/\/guides\/[0-9a-f-]+\/edit$/);
      await expect(page.getByRole("textbox", { name: "제목" })).toHaveValue(title);
      await expect(page.getByRole("textbox", { name: "내용" })).toHaveValue(bodyLines.join("\n"));
      await expect(page.getByRole("radio", { name: "연락" })).toBeChecked();
      await page.getByRole("button", { name: "미리 보기" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "공개 전 확인" })).toBeVisible();
    });

    await test.step("공개가 연결 문제로 실패하면 미리 보기에 머물고 다시 누르라고 한다", async () => {
      await page.route("**/api/guides/*/publish", (route) => route.abort("internetdisconnected"));
      await page.getByRole("button", { name: "안내 공개하기" }).click();
      await expect(page.getByRole("alert")).toHaveText("공개하지 못했어요. 다시 눌러 주세요");
      await expect(page).toHaveURL(/\/preview$/);
      await page.unrouteAll({ behavior: "wait" });
    });

    await test.step("다시 눌러 공개하면 관리 홈에 ‘공개됨’으로 보인다", async () => {
      await page.getByRole("button", { name: "안내 공개하기" }).click();
      await expect(page).toHaveURL(new RegExp(`/manage/${E2E_BUILDING.id}$`));
      await expect(page.getByText("안내를 공개했어요", { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: new RegExp(`${title} 공개됨`) })).toBeVisible();
    });

    await test.step("로그인하지 않은 세입자가 공개 화면에서 새 안내를 읽는다", async () => {
      const visitor = await browser.newContext();
      await hideDevOverlays(visitor);
      const tenant = await visitor.newPage();
      try {
        await tenant.goto(`/b/${E2E_BUILDING.id}`);
        await guideLink(tenant, title).click();
        await expect(tenant.getByRole("heading", { level: 1, name: title })).toBeVisible();
        for (const line of bodyLines) await expect(tenant.getByRole("article")).toContainText(line);
      } finally {
        await visitor.close();
      }
    });
  });

  test("쓰던 안내는 이 기기에 남아 닫았다 다시 열어도 채워져 있다", async ({ page }) => {
    const title = `e2e 임시 저장 ${stamp()}`;
    await loginAs(page, "demo-landlord");
    await openNewGuide(page);
    await page.getByRole("textbox", { name: "제목" }).fill(title);
    await page.getByRole("textbox", { name: "내용" }).fill("아직 쓰는 중이에요");

    await page.getByRole("button", { name: "닫기" }).click();
    await expect(page).toHaveURL(new RegExp(`${manageHome}$`));
    await page.getByRole("link", { name: /기본 안내 (추가하기|쓰기)/ }).click();

    await expect(page.getByRole("textbox", { name: "제목" })).toHaveValue(title);
    await expect(page.getByRole("textbox", { name: "내용" })).toHaveValue("아직 쓰는 중이에요");
  });

  test("제목과 내용 없이 미리 보기를 누르면 칸 아래에 알려 주고 저장하지 않는다", async ({
    page,
  }) => {
    await loginAs(page, "demo-landlord");
    await openNewGuide(page);
    const saves: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/guides")) {
        saves.push(request.url());
      }
    });

    await page.getByRole("button", { name: "미리 보기" }).click();

    await expect(page.getByText("제목을 적어 주세요")).toBeVisible();
    await expect(page.getByText("내용을 적어 주세요")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "제목" })).toBeFocused();
    await expect(page.getByRole("textbox", { name: "제목" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(saves).toEqual([]);
  });

  test("저장이 연결 문제로 실패하면 입력을 그대로 두고 다시 누르라고 안내한다", async ({
    page,
  }) => {
    const title = `e2e 저장 실패 ${stamp()}`;
    await loginAs(page, "demo-landlord");
    await openNewGuide(page);
    await page.route(`**/api/buildings/${SUNNY.id}/guides`, (route) =>
      route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue(),
    );
    await page.getByRole("textbox", { name: "제목" }).fill(title);
    await page.getByRole("textbox", { name: "내용" }).fill("저장이 안 돼도 남아야 해요");

    await page.getByRole("button", { name: "미리 보기" }).click();

    await expect(page.getByRole("alert")).toHaveText("저장하지 못했어요. 다시 눌러 주세요");
    await expect(page).toHaveURL(/\/guides\/new$/);
    await expect(page.getByRole("textbox", { name: "제목" })).toHaveValue(title);
    await expect(page.getByRole("textbox", { name: "내용" })).toHaveValue(
      "저장이 안 돼도 남아야 해요",
    );
  });
});

test.describe("집주인 · 관리 화면 입구", () => {
  test("로그인하지 않고 관리 화면을 열면 로그인이 필요하다고 안내한다", async ({ page }) => {
    await page.goto(manageHome);
    await expect(page.getByRole("heading", { level: 1, name: "로그인이 필요해요" })).toBeVisible();
    await expect(page.getByRole("button", { name: "카카오로 로그인" })).toBeVisible();
  });

  test("시연용 집주인으로 들어가면 보던 관리 화면으로 돌아온다", async ({ page }) => {
    await page.goto(manageHome);
    await page.getByRole("button", { name: "시연용 집주인으로 들어가기" }).click();
    await agreeBeforeLogin(page);

    await expect(page).toHaveURL(new RegExp(`${manageHome}$`));
    await expect(page.getByRole("heading", { level: 1, name: SUNNY.name })).toBeVisible();
  });

  test("관리 권한이 없는 계정은 ‘이 건물을 관리할 권한이 없어요’를 본다", async ({ page }) => {
    await loginAs(page, "demo-resident-a");
    await page.goto(manageHome);
    await expect(
      page.getByRole("heading", { level: 1, name: "이 건물을 관리할 권한이 없어요" }),
    ).toBeVisible();
  });

  test("집주인이 서비스 첫 화면(/)을 열면 관리 홈으로 간다", async ({ page }) => {
    await loginAs(page, "demo-landlord");
    await page.goto("/");
    await expect(page).toHaveURL(/\/manage\/[0-9a-f-]{36}$/);
  });

  test("확인할 것이 없는 관리 홈(42)의 ‘세입자 화면으로 보기’는 공개 건물 화면을 연다", async ({
    page,
  }) => {
    // 햇살빌라는 시드 메모 때문에 ‘확인할 것’(24) 상태라, 확인할 것이 없는 테스트빌라로 봅니다.
    await loginAsE2eLandlord(page);
    await page.goto(`/manage/${E2E_BUILDING.id}`);
    await page.getByRole("link", { name: "세입자 화면으로 보기" }).click();
    await expect(page).toHaveURL(new RegExp(`/b/${E2E_BUILDING.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: E2E_BUILDING.name })).toBeVisible();
  });

  test("집주인이 자기 건물 공개 화면을 열면 ‘관리하기’로 관리 홈에 돌아간다", async ({ page }) => {
    // screens.md §5 ‘집주인이 자기 건물 QR → 공개 화면(01) 그대로 + 본인에게만 관리하기’
    await loginAs(page, "demo-landlord");
    await page.goto(`/b/${SUNNY.id}`);
    await expect(page.getByRole("heading", { level: 1, name: SUNNY.name })).toBeVisible();

    await manageAction(page).click();

    await expect(page).toHaveURL(new RegExp(`${manageHome}$`));
  });

  test("비회원에게는 공개 화면에 ‘관리하기’가 보이지 않는다", async ({ page }) => {
    await page.goto(`/b/${SUNNY.id}`);
    await expect(page.getByRole("heading", { level: 1, name: SUNNY.name })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(manageAction(page)).toHaveCount(0);
  });

  test("다른 건물의 집주인에게는 이 건물 공개 화면에 ‘관리하기’가 보이지 않는다", async ({
    page,
  }) => {
    await loginAs(page, "demo-landlord");
    await page.goto(`/b/${E2E_BUILDING.id}`);
    await expect(page.getByRole("heading", { level: 1, name: E2E_BUILDING.name })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(manageAction(page)).toHaveCount(0);
  });
});

function manageAction(page: Page) {
  return action(page, /관리하기/);
}

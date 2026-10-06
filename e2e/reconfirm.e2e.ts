// CORE 5 재확인(LF-09, lofi 40): 연결 뒤 일정 기간이 지나면 ‘아직 살고 있나요?’를 묻고, 14일 동안 답이 없으면
// reconfirm_needed(쓰기·알림 멈춤, 읽기는 그대로). 홈 위 배너와 시트 40은 하루에 한 번 먼저 뜹니다.
//
// 기간을 기다릴 수 없어 입주자 A(햇살빌라)로 로그인한 뒤 `/api/me`의 연결 상태만 바꿔서 봅니다. ‘아직 살아요’는
// 실제 서버에 보내고(active인 A의 확인 시각만 갱신됨), 그 뒤에는 원래 응답을 그대로 돌려줍니다.
import type { Page } from "@playwright/test";
import { ensureResident } from "./support/api";
import { loginAs, publishedGuides, RESIDENT_A, SUNNY } from "./support/demo";
import { sheet } from "./support/flows";
import { expect, test } from "./support/test";

const home = `/b/${SUNNY.id}`;
const DAY_MS = 24 * 60 * 60 * 1000;

type Patch = { status: "active" | "reconfirm_needed"; reconfirmRequested: boolean };

/** `/api/me`의 연결을 바꿉니다. 돌려준 함수를 부르면 그다음부터는 서버 응답 그대로입니다. */
async function mockOccupancy(page: Page, patch: Patch) {
  let active = true;
  // 시각은 한 번만 정합니다(시트 40의 ‘하루 한 번’은 연결 id와 다음 확인 시각으로 같은 요청인지 봄).
  const nextReconfirmAt = new Date(Date.now() - DAY_MS).toISOString();
  const reconfirmDueAt = new Date(
    Date.now() + (patch.status === "reconfirm_needed" ? -DAY_MS : 13 * DAY_MS),
  ).toISOString();
  await page.route("**/api/me", async (route) => {
    const response = await route.fetch();
    if (!active || route.request().method() !== "GET" || !response.ok()) {
      await route.fulfill({ response });
      return;
    }
    const me = (await response.json()) as { occupancy: Record<string, unknown> | null };
    if (me.occupancy) {
      me.occupancy = {
        ...me.occupancy,
        ...patch,
        nextReconfirmAt,
        reconfirmDueAt,
      };
    }
    await route.fulfill({ response, json: me });
  });
  return () => {
    active = false;
  };
}

test.beforeAll(async () => {
  // 이사 흐름이 A를 다시 연결했을 수 있어 햇살빌라 거주자인지 먼저 맞춥니다.
  const a = await ensureResident(RESIDENT_A, SUNNY.id, "demo-landlord");
  await a.dispose();
});

test.describe("재확인 요청(lofi 40, 기한 안)", () => {
  test("홈에 들어오면 시트 40이 하루 한 번 먼저 뜨고, 배너로 다시 열어 ‘아직 살아요’를 누르면 사라진다", async ({
    page,
  }) => {
    await loginAs(page, RESIDENT_A);
    const stop = await mockOccupancy(page, { status: "active", reconfirmRequested: true });
    const question = `아직 ${SUNNY.name}에 살고 있나요?`;

    await test.step("40이 먼저 뜬다: 기한과 멈추는 것, 아직 살아요·이사했어요", async () => {
      await page.goto(home);
      const ask = sheet(page, question);
      await expect(ask).toBeVisible();
      await expect(ask).toContainText("1년에 한 번 연결 상태를 확인해요.");
      await expect(ask).toContainText("답하지 않으면 새 글쓰기와 공지 알림이 잠시 멈춰요");
      await expect(ask.getByRole("button", { name: "아직 살아요" })).toBeVisible();
      await expect(ask.getByRole("button", { name: "이사했어요" })).toBeVisible();
      await expect(ask.locator('img.wh-hami[src*="house"]')).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(ask).toBeHidden();
    });

    await test.step("닫아도 홈 맨 위 배너가 남고, 새로고침하면 시트는 다시 먼저 뜨지 않는다", async () => {
      const banner = page.getByRole("button", { name: new RegExp(`${question}.*답하기`) });
      await expect(banner).toBeVisible();
      await page.reload();
      await expect(page.getByRole("heading", { level: 1, name: SUNNY.name })).toBeVisible();
      await expect(banner).toBeVisible();
      await page.waitForLoadState("networkidle");
      await expect(sheet(page, question)).toHaveCount(0);
    });

    await test.step("기한 안에는 쓰기가 그대로다(안내 메모 시트가 열림)", async () => {
      const [guide] = await publishedGuides(page, SUNNY.id);
      await page.goto(`${home}/guides/${guide?.id}`);
      await page.getByRole("button", { name: "메모 남기기" }).click();
      await expect(sheet(page, "어떤 부분이 달라졌나요?")).toBeVisible();
      await page.goto(home);
    });

    await test.step("배너 → 40 → 아직 살아요 → 배너가 사라진다", async () => {
      await page.getByRole("button", { name: new RegExp(`${question}.*답하기`) }).click();
      const ask = sheet(page, question);
      const reconfirmed = page.waitForResponse((response) =>
        /\/api\/occupancies\/[^/]+\/reconfirm$/.test(response.url()),
      );
      stop();
      await ask.getByRole("button", { name: "아직 살아요" }).click();
      expect((await reconfirmed).status()).toBe(200);
      await expect(page.getByText("거주를 확인했어요", { exact: true })).toBeVisible();
      await expect(
        page.getByRole("button", { name: new RegExp(`${question}.*답하기`) }),
      ).toHaveCount(0);
    });
  });
});

test.describe("재확인 필요(reconfirm_needed): 읽기는 그대로, 쓰기·알림은 멈춤", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, RESIDENT_A);
    await mockOccupancy(page, { status: "reconfirm_needed", reconfirmRequested: true });
  });

  test("홈: ‘거주 확인이 필요해요’ 배너와 배지, 종 버튼은 알림 대신 거주 확인(40)을 연다", async ({
    page,
  }) => {
    await page.goto(home);
    const ask = sheet(page, `아직 ${SUNNY.name}에 살고 있나요?`);
    await expect(ask).toBeVisible();
    await expect(ask).toContainText("답이 없어 지금은 새 글쓰기와 공지 알림이 멈춰 있어요");
    await page.keyboard.press("Escape");
    await expect(ask).toBeHidden();

    await expect(
      page.getByRole("button", { name: /거주 확인이 필요해요.*확인하기/ }),
    ).toBeVisible();
    await expect(page.getByText("거주 확인 필요", { exact: true })).toBeVisible();
    await expect(page.getByText("거주 중", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "공지 알림 설정" }).click();
    await expect(ask).toBeVisible();
    await expect(sheet(page, /알림으로 받을까요|알림이 켜져 있어요/)).toHaveCount(0);
  });

  test("안내(11): 메모 쓰기 대신 거주 확인을 안내하고, 남긴 메모는 그대로 읽는다", async ({
    page,
  }) => {
    const [guide] = await publishedGuides(page, SUNNY.id);
    await page.goto(`${home}/guides/${guide?.id}`);
    await expect(page.getByRole("heading", { level: 1, name: guide?.title ?? "" })).toBeVisible();
    await expect(page.getByRole("note").filter({ hasText: "거주 확인이 필요해요" })).toContainText(
      "확인하기 전까지 새 메모를 남길 수 없어요. 안내와 남긴 메모는 계속 볼 수 있어요.",
    );
    await expect(page.getByRole("button", { name: "메모 남기기" })).toHaveCount(0);
    // 시드: 분리수거 안내(첫 안내)에 A가 남긴 메모가 있습니다.
    await expect(page.getByRole("region", { name: /이 안내에 남긴 메모/ })).toContainText(
      "내 메모",
    );
    await page.getByRole("button", { name: "거주 확인" }).click();
    await expect(sheet(page, `아직 ${SUNNY.name}에 살고 있나요?`)).toBeVisible();
  });

  test("생활 팁(04): 목록은 읽고, 남기기 대신 내 정보에서 거주 확인하라고 한다", async ({
    page,
  }) => {
    await page.goto(`${home}/tips`);
    await expect(page.getByRole("heading", { level: 1, name: "거주자가 남긴 팁" })).toBeVisible();
    await expect(page.locator("article").first()).toBeVisible();
    await expect(
      page.getByText("거주 확인이 필요해서 지금은 팁을 남길 수 없어요. 읽기는 그대로예요"),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "내 정보에서 거주 확인하기" })).toBeVisible();
    await expect(page.getByRole("link", { name: /생활 팁 남기기/ })).toHaveCount(0);
  });

  test("내 정보(45): 공지 알림은 ‘멈춤’이고 누르면 거주 확인(40)을 연다", async ({ page }) => {
    await page.goto("/me");
    const row = page.getByRole("button", { name: /^공지 알림/ });
    await expect(row).toContainText("거주 확인 뒤 다시 켤 수 있어요");
    await expect(row).toContainText("멈춤");
    await expect(page.getByRole("button", { name: /거주 확인.*지금 확인/ })).toBeVisible();
    await row.click();
    await expect(sheet(page, `아직 ${SUNNY.name}에 살고 있나요?`)).toBeVisible();
  });
});

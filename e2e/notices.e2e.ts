// CORE 3 현재 사람에게 닿는다: 공지(LF-15·03)
// lofi 42/24 관리 홈 → 34 공지 올리기(알림 대상 수) → 37 올린 뒤(발송 ‘시도’ 문구 + 같은 링크) → 15 공지 상세
// (비회원 공개 화면·거주자 홈 모두), 기간이 끝난 공지(410 NOTICE_ENDED)는 ‘종료된 공지예요’(screens.md §8).
//
// 공지는 테스트빌라에 올립니다(쓰기 테스트용 집주인). 알림 대상 수와 시도 수는 서버가 준 값과 비교합니다.
import type { APIRequestContext } from "@playwright/test";
import { apiAs, ensureResident } from "./support/api";
import {
  E2E_BUILDING,
  E2E_LANDLORD,
  loginAs,
  loginAsE2eLandlord,
  RESIDENT_B,
  SUNNY,
  stamp,
} from "./support/demo";
import { expect, hideDevOverlays, test } from "./support/test";

const manageHome = `/manage/${E2E_BUILDING.id}`;

type Audience = { connectedCount: number; pushTargetCount: number };

let landlord: APIRequestContext;

test.beforeAll(async () => {
  landlord = await apiAs(E2E_LANDLORD);
});

test.afterAll(async () => {
  await landlord.dispose();
});

test.describe("공지 올리기와 읽기(LF-15, lofi 34 → 37 → 15)", () => {
  test("집주인이 공지를 올리면 37에서 발송 ‘시도’ 수와 같은 링크를 주고, 비회원과 거주자가 15에서 읽는다", async ({
    page,
    context,
    browser,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const resident = await ensureResident(RESIDENT_B, E2E_BUILDING.id);
    await resident.dispose();
    const title = `e2e 계단 청소 안내 ${stamp()}`;
    const body = "10월 2일 오전에 계단 물청소를 해요.\n그동안 계단이 미끄러울 수 있어요.";
    const audience = (await (
      await landlord.get(`/api/buildings/${E2E_BUILDING.id}/notices/audience`)
    ).json()) as Audience;
    expect(audience.connectedCount, "B가 연결돼 있어야 해요").toBeGreaterThan(0);
    await loginAsE2eLandlord(page);

    await test.step("34: 관리 홈 → 공지 쓰기, 연결된 거주자·알림 대상 수(실제 세입자 수와 다를 수 있음)", async () => {
      await page.goto(manageHome);
      await page.getByRole("link", { name: "공지 쓰기" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "공지 올리기" })).toBeVisible();
      await expect(
        page.getByText(
          `월계함에 연결된 거주자 ${audience.connectedCount}명 중 알림을 켠 ${audience.pushTargetCount}명에게 보내요`,
        ),
      ).toBeVisible();
      await expect(
        page.getByText("연결된 사람 기준이라 실제 세입자 수와 다를 수 있어요."),
      ).toBeVisible();
      await page.getByRole("textbox", { name: "제목" }).fill(title);
      await page.getByRole("textbox", { name: "내용" }).fill(body);
    });

    let attempted = -1;
    let noticeId = "";
    await test.step("37: 알림은 도착이 아니라 ‘발송을 시도했어요’로, 받지 않는 분께는 같은 링크로", async () => {
      const created = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/buildings/${E2E_BUILDING.id}/notices`) &&
          response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "공지 올리기" }).click();
      const result = (await (await created).json()) as {
        notice: { id: string };
        attemptedCount: number;
      };
      attempted = result.attemptedCount;
      noticeId = result.notice.id;
      await expect(page).toHaveURL(new RegExp(`${manageHome}/notices/${noticeId}$`));
      await expect(page.getByRole("heading", { level: 1, name: "공지를 올렸어요" })).toBeVisible();
      if (attempted > 0) {
        await expect(
          page.getByText(`알림 대상 ${attempted}명에게 발송을 시도했어요`),
        ).toBeVisible();
        await expect(
          page.getByText("도착과 열람은 기기마다 달라요", { exact: false }),
        ).toBeVisible();
      } else {
        // 알림을 켠 거주자가 없으면 ‘0명에게 시도’ 대신 링크로 전하라고 합니다(QA 2차 low, fe-final 반영).
        await expect(page.getByText("아직 알림을 켠 거주자가 없어요")).toBeVisible();
        await expect(
          page.getByText("이번에는 알림이 가지 않았어요. 아래 링크로 같은 공지를 전해 주세요."),
        ).toBeVisible();
        await expect(page.getByText(/발송을 시도했어요/)).toHaveCount(0);
      }
      await expect(page.getByText("알림을 받지 않는 분에게도 같은 링크로")).toBeVisible();
      await page.getByRole("button", { name: "공지 링크 복사" }).click();
      await expect(page.getByText("공지 링크를 복사했어요", { exact: true })).toBeVisible();
      const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()));
      expect(copied.pathname).toBe(`/b/${E2E_BUILDING.id}/notices/${noticeId}`);
    });
    expect(attempted).toBeGreaterThanOrEqual(0);
    expect(attempted).toBeLessThanOrEqual(audience.pushTargetCount);

    await test.step("15: 링크를 받은 비회원이 적용 기간·대상과 본문을 읽는다", async () => {
      const visitor = await browser.newContext();
      await hideDevOverlays(visitor);
      const tenant = await visitor.newPage();
      try {
        await tenant.goto(`/b/${E2E_BUILDING.id}/notices/${noticeId}`);
        await expect(tenant.getByRole("heading", { level: 1, name: title })).toBeVisible();
        await expect(tenant.getByText("적용 기간")).toBeVisible();
        await expect(tenant.getByText(`${E2E_BUILDING.name} 전 세대`)).toBeVisible();
        for (const line of body.split("\n")) await expect(tenant.getByText(line)).toBeVisible();
        await expect(tenant.getByRole("link", { name: "건물로 돌아가기" })).toBeVisible();
      } finally {
        await visitor.close();
      }
    });

    await test.step("거주자 홈의 공지 카드에서 같은 공지(15)를 연다", async () => {
      const home = await browser.newContext();
      await hideDevOverlays(home);
      const phone = await home.newPage();
      try {
        await loginAs(phone, RESIDENT_B);
        await phone.goto(`/b/${E2E_BUILDING.id}`);
        await expect(phone.getByText("거주 중", { exact: true })).toBeVisible();
        await phone.getByRole("link", { name: new RegExp(title) }).click();
        await expect(phone).toHaveURL(new RegExp(`/notices/${noticeId}$`));
        await expect(phone.getByRole("heading", { level: 1, name: title })).toBeVisible();
      } finally {
        await home.close();
      }
    });
  });

  test("기간이 끝난 공지 링크는 ‘종료된 공지예요’와 건물 안내로 가는 길을 준다", async ({
    page,
  }) => {
    const ended = "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f99";
    await page.route(`**/api/notices/${ended}`, (route) =>
      route.fulfill({
        status: 410,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "NOTICE_ENDED" } }),
      }),
    );
    await page.goto(`/b/${SUNNY.id}/notices/${ended}`);
    await expect(page.getByRole("heading", { name: "종료된 공지예요" })).toBeVisible();
    await expect(
      page.getByText("계속 필요한 규칙은 건물 안내에서 볼 수 있어요", { exact: false }),
    ).toBeVisible();
    await page.getByRole("link", { name: "건물 안내 보기" }).click();
    await expect(page.getByRole("heading", { level: 1, name: SUNNY.name })).toBeVisible();
  });

  test("37의 ‘기본 안내도 고치기’는 관리 홈의 기본 안내 목록으로 이어져 공개한 안내를 고칠 수 있다", async ({
    page,
  }) => {
    // lofi 37 ‘계속 바뀌는 규칙이라면 기본 안내도 고치기’. 규칙은 공지만으로 끝내지 않고 기본 안내를 고칩니다
    // (screens.md 화면 규칙). 예전에는 ‘다음 업데이트에서 열려요’만 있었습니다(QA 2차에서 확인 뒤 고쳐짐).
    const response = await landlord.get(`/api/buildings/${E2E_BUILDING.id}/notices`);
    const { notices } = (await response.json()) as { notices: { id: string }[] };
    const notice = notices[0];
    test.skip(!notice, "테스트빌라에 진행 중 공지가 없어요(앞 테스트가 올림)");
    await loginAsE2eLandlord(page);
    await page.goto(`${manageHome}/notices/${notice?.id}`);
    await expect(page.getByText("계속 바뀌는 규칙이라면", { exact: false })).toBeVisible();
    await expect(page.getByText("다음 업데이트에서 열려요", { exact: false })).toHaveCount(0);
    await page.getByRole("link", { name: "기본 안내도 고치기" }).click();
    await expect(page).toHaveURL(new RegExp(`${manageHome}#lh-guides$`));
    const guides = page.getByRole("region", { name: "기본 안내" });
    await expect(guides).toBeInViewport();
    await guides
      .getByRole("link", { name: /공개됨/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "기본 안내 고치기" })).toBeVisible();
  });
});

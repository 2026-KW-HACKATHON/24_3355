// 공용 기기에서 계정 바꾸기(lofi 45 내 정보 → 로그아웃 → 01, 21 보낸 내용 → 31). 로그아웃하면 이전 계정의 제보 상세가
// 뒤로·앞으로 가기로도 다시 보이지 않아야 합니다(계정별 캐시 비우기, 리뷰 H1).
//
// 입주자 A가 로그인해서 테스트빌라에 ‘직접 적기’ 제보를 하나 보냅니다(회원 제보, API). 반복 제한은 계정 기준이라
// 비회원 제보 테스트와 겹치지 않습니다. 캐시가 남았는지 드러나도록 로그아웃 뒤 상세 요청을 잠깐 늦춥니다
// (남아 있으면 그동안 이전 계정의 내용이 그려짐).
import { apiAs } from "./support/api";
import { E2E_BUILDING, loginAs, RESIDENT_A, SUNNY, stamp } from "./support/demo";
import { expect, test } from "./support/test";

type SentReport = { id: string; body: string | null; buildingId: string };

/** A가 테스트빌라에 직접 적어 보낸 제보. 이미 있으면 다시 쓰고(계정당 한 시간 10건 제한), 없으면 하나 보냅니다. */
async function ownReport(): Promise<SentReport & { body: string }> {
  const a = await apiAs(RESIDENT_A);
  try {
    const mine = (await (await a.get("/api/me/reports")).json()) as { reports: SentReport[] };
    const found = mine.reports.find(
      (item) => item.buildingId === E2E_BUILDING.id && item.body?.startsWith(BODY_PREFIX),
    );
    if (found?.body) return { ...found, body: found.body };
    const sent = await a.post(`/api/buildings/${E2E_BUILDING.id}/reports`, {
      data: { source: "custom", kind: "facility", body: `${BODY_PREFIX} ${stamp()}` },
    });
    expect(sent.status(), await sent.text()).toBe(201);
    const { report } = (await sent.json()) as { report: SentReport & { body: string } };
    return report;
  } finally {
    await a.dispose();
  }
}

const BODY_PREFIX = "복도 전등이 깜빡여요";

test.describe("내 정보(lofi 45) · 로그아웃", () => {
  test("로그아웃한 뒤 앞으로 가기로 보낸 내용 상세를 다시 열어도 이전 계정의 제보가 보이지 않는다", async ({
    page,
  }) => {
    const report = await ownReport();
    const body = report.body;

    await loginAs(page, RESIDENT_A);
    await page.goto("/me");
    await page.getByRole("link", { name: /보낸 내용/ }).click();
    await expect(page).toHaveURL(/\/me\/reports$/);
    await page.locator(`a[href$="/r/${report.id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/r/${report.id}$`));
    await expect(page.getByText(`${E2E_BUILDING.name} · ‘${body}’`)).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/me\/reports$/);
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1, name: "내 정보" })).toBeVisible();
    await page.getByRole("button", { name: "로그아웃" }).click();
    // 로그아웃하면 연결했던 건물의 공개 화면(01)으로 갑니다(주소를 바꿔 끼워 앞으로 가기 기록은 남음).
    await expect(page).toHaveURL(new RegExp(`/b/${SUNNY.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: SUNNY.name })).toBeVisible();
    await expect(page.getByRole("link", { name: /새 공지를 알림으로 받으려면/ })).toBeVisible();

    await page.route(`**/api/reports/${report.id}`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });
    await page.goForward();
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`/r/${report.id}$`));
    // 늦춘 응답이 오기 전(약 3초)에 캐시가 남아 있으면 이전 계정의 내용이 그려집니다. 기다리지 않고 셉니다.
    await page.waitForTimeout(1000);
    expect(await page.getByText(body).count(), "로그아웃 뒤 이전 계정의 제보가 그려졌어요").toBe(0);
    await expect(
      page.getByRole("heading", { name: "이 브라우저에서는 이전에 보낸 내용을 찾을 수 없어요" }),
    ).toBeVisible();
    await expect(page.getByText(body)).toHaveCount(0);
  });
});

// 끝까지 해보는 테스트 ‘A의 이사와 B의 입주’: A의 멤버 기능은 끝나고, B는 같은 건물의 남은 안내를 읽는다.
// lofi 45 내 정보 → 08 이사 확인 → 09 연결 종료 → (A) 01 공개 화면은 그대로, 팁 44·메모 쓰기 막힘
// → (B) 01 → 02 → 16 → 연결 → 17 → 10 거주자 홈: 같은 건물의 안내·팁(A의 팁은 작성자 없이 남음)
//
// 이 흐름은 시연 이야기 그대로 햇살빌라에서 합니다. 입주자 A의 연결을 끝내므로 끝나면(성공·실패 모두)
// B의 연결을 끝내고 A를 가입코드로 다시 연결해 둡니다(연결 id는 바뀜, 완전한 복원은 `--reset-demo`).
import type { APIRequestContext } from "@playwright/test";
import { apiAs, ensureResident, joinCodeOf, meOf, moveOutIfConnected } from "./support/api";
import { loginAs, publishedGuides, RESIDENT_A, RESIDENT_B, SUNNY } from "./support/demo";
import { connectWithCode, sheet } from "./support/flows";
import { expect, guideLink, hideDevOverlays, test } from "./support/test";

const home = `/b/${SUNNY.id}`;
const SUNNY_LANDLORD = "demo-landlord";

type TipRow = { id: string; body: string; mine: boolean };

let landlord: APIRequestContext;

test.beforeAll(async () => {
  landlord = await apiAs(SUNNY_LANDLORD);
  // A는 햇살빌라 거주자, B는 연결 없음에서 시작합니다.
  const a = await ensureResident(RESIDENT_A, SUNNY.id, SUNNY_LANDLORD);
  await a.dispose();
  const b = await apiAs(RESIDENT_B);
  await moveOutIfConnected(b);
  await b.dispose();
});

test.afterAll(async () => {
  const b = await apiAs(RESIDENT_B);
  await moveOutIfConnected(b);
  await b.dispose();
  const a = await ensureResident(RESIDENT_A, SUNNY.id, SUNNY_LANDLORD);
  await a.dispose();
  await landlord.dispose();
});

test.describe("A의 이사와 B의 입주(LF-09·05, lofi 45 → 08 → 09 → 10)", () => {
  test("A가 내 정보에서 이사하면 멤버 기능이 끝나고 공개 안내는 남으며, B가 연결하면 같은 건물의 안내와 팁을 본다", async ({
    page,
    browser,
  }) => {
    const guides = await publishedGuides(page, SUNNY.id);
    const a = await apiAs(RESIDENT_A);
    const tipsBefore = (await (await a.get(`/api/buildings/${SUNNY.id}/tips`)).json()) as {
      tips: TipRow[];
    };
    const myTip = tipsBefore.tips.find((tip) => tip.mine);
    expect(myTip, "A가 남긴 시드 팁").toBeTruthy();
    await loginAs(page, RESIDENT_A);

    await test.step("45 내 정보 → ‘이 건물에서 이사했어요’ → 08: 끝나는 것·남는 것", async () => {
      await page.goto("/me");
      await expect(page.getByText(SUNNY.name).first()).toBeVisible();
      await page.getByRole("button", { name: "이 건물에서 이사했어요" }).click();
      const confirm = sheet(page, `${SUNNY.name}에서 이사했나요?`);
      await expect(confirm).toBeVisible();
      await expect(confirm).toContainText("끝나는 것");
      await expect(confirm).toContainText("건물에 그대로 남는 것");
      await expect(confirm).toContainText("내가 계속 볼 수 있는 것");
      await confirm.getByRole("button", { name: "이사했어요" }).click();
    });

    await test.step("09: 연결을 마쳤고 안내·팁은 다음 사람에게 남는다", async () => {
      await expect(page).toHaveURL(/\/me\/moved$/);
      await expect(
        page.getByRole("heading", { level: 1, name: `${SUNNY.name}와의 연결을 마쳤어요` }),
      ).toBeVisible();
      await expect(page.locator('main img.wh-hami[src*="moving"]')).toBeVisible();
      await expect(page.getByText(`기본 안내 ${guides.length}개`)).toBeVisible();
      await expect(page.getByText("내가 남긴 팁 1개도 작성자 없이 건물에 남아요")).toBeVisible();
      expect((await meOf(a)).occupancy).toBeNull();
      // 버튼 문구는 ‘우리 건물 화면으로’ → ‘건물 화면으로’로 바뀌는 중입니다(fe-final). 둘 다 01로 갑니다.
      await page.getByRole("button", { name: /^(우리 )?건물 화면으로$/ }).click();
    });

    await test.step("A: 같은 QR 주소는 공개 화면(01)이고 안내는 그대로 읽는다", async () => {
      await expect(page).toHaveURL(new RegExp(`${home}$`));
      await expect(page.getByRole("heading", { level: 1, name: SUNNY.name })).toBeVisible();
      await expect(page.getByRole("link", { name: /새 공지를 알림으로 받으려면/ })).toBeVisible();
      for (const guide of guides) await expect(guideLink(page, guide.title)).toBeVisible();
    });

    await test.step("A: 팁은 연결 안내(44), 안내 메모는 연결 필요 시트", async () => {
      await page.goto(`${home}/tips`);
      await expect(
        page.getByRole("heading", { name: "생활 팁은 이 건물에 연결한 거주자가 볼 수 있어요" }),
      ).toBeVisible();
      await page.goto(`${home}/guides/${guides[0]?.id}`);
      await page.getByRole("button", { name: "메모 남기기" }).click();
      await expect(
        sheet(page, "안내 수정 메모는 이 건물에 연결한 거주자가 남길 수 있어요"),
      ).toBeVisible();
      expect((await a.get(`/api/buildings/${SUNNY.id}/tips`)).status()).toBe(403);
      await a.dispose();
    });

    await test.step("B: 같은 건물에 가입코드로 연결하면 10에서 같은 안내와 남은 팁을 본다", async () => {
      const code = await joinCodeOf(landlord, SUNNY.id);
      const next = await browser.newContext();
      await hideDevOverlays(next);
      const b = await next.newPage();
      try {
        await b.goto(home);
        await b.getByRole("link", { name: /새 공지를 알림으로 받으려면/ }).click();
        await connectWithCode(b, code, SUNNY.name);
        await sheet(b, /알림/)
          .getByRole("button", { name: /나중에|알겠어요/ })
          .click();
        await expect(b.getByText(`${SUNNY.name}에 연결됐어요`)).toBeVisible();
        await expect(b.locator('main img.wh-hami[src*="house"]')).toBeVisible();
        for (const guide of guides) await expect(guideLink(b, guide.title)).toBeVisible();
        const preview = b.getByRole("region", { name: "거주자가 남긴 팁" });
        await preview.getByRole("link", { name: `${tipsBefore.tips.length}개` }).click();
        const former = b.locator("article").filter({ hasText: myTip?.body ?? "" });
        await expect(former).toBeVisible();
        await expect(former.getByText("내 팁", { exact: true })).toHaveCount(0);
        await expect(former.getByRole("button", { name: "이 팁 신고하기" })).toBeVisible();
      } finally {
        await next.close();
      }
    });
  });
});

// 끝까지 해보는 테스트 ‘수정 메모 진입’: 연결이 필요하면 연결을 마친 뒤 보던 안내로 돌아와 메모를 남긴다.
// lofi 11 안내 → ‘메모 남기기’ → 44 연결 필요 → 02 가입코드 → 16 로그인·동의 → 연결 확인 → 11로 복귀
// (17 알림 선택을 닫으면) → 12 메모 쓰기 → 13 남긴 뒤 → 안내 아래 ‘집주인 확인 전’
// → 집주인 24 확인할 것 → 25 메모 검토 → 반영: 33(반영할 메모) → 43 ‘수정 공개’(applyMemoIds) / 유지: 사유
// → 거주자는 안내 아래에서 ‘반영됨’·‘기존 유지’(사유)를 본다.
//
// 테스트빌라에 테스트마다 새 안내를 공개하고, 연결 전 사람은 입주자 B(테스트 전에 연결을 끝내 둠)입니다.
import type { APIRequestContext, Page } from "@playwright/test";
import {
  apiAs,
  ensureResident,
  joinCodeOf,
  memosOf,
  moveOutIfConnected,
  publicGuide,
  publishGuide,
  writeMemo,
} from "./support/api";
import {
  E2E_BUILDING,
  E2E_LANDLORD,
  loginAs,
  loginAsE2eLandlord,
  type PublicGuide,
  RESIDENT_B,
  stamp,
} from "./support/demo";
import { sheet } from "./support/flows";
import { expect, hideDevOverlays, test } from "./support/test";

const home = `/b/${E2E_BUILDING.id}`;
const manageHome = `/manage/${E2E_BUILDING.id}`;

let landlord: APIRequestContext;

test.beforeAll(async () => {
  landlord = await apiAs(E2E_LANDLORD);
});

test.afterAll(async () => {
  await landlord.dispose();
});

async function freshGuide(): Promise<PublicGuide> {
  return publishGuide(landlord, E2E_BUILDING.id, {
    category: "recycling",
    title: `e2e 분리수거 요일 ${stamp()}`,
    body: "재활용은 화·금 저녁에 내놓아 주세요.",
  });
}

/** 안내 아래 메모 목록(거주자에게만). */
function memoSection(page: Page) {
  return page.getByRole("region", { name: /이 안내에 남긴 메모/ });
}

/** 집주인: 메모 검토(25)를 관리 홈의 ‘확인할 것’에서 엽니다. */
async function reviewFromHome(page: Page, memoId: string) {
  await page.goto(manageHome);
  const todo = page.getByRole("region", { name: "확인할 것" });
  await expect(todo).toBeVisible();
  await todo.locator(`a[href$="/memos/${memoId}"]`).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /안내가 달라졌다는 메모예요/ }),
  ).toBeVisible();
}

test.describe("수정 메모 진입(LF-02·04·17, lofi 11 → 44 → 02 → 16 → 12 → 13 → 24 → 25)", () => {
  test("연결하지 않은 사람이 메모를 누르면 연결을 거쳐 보던 안내로 돌아와 메모를 남기고, 집주인이 반영하면 ‘반영됨’을 본다", async ({
    page,
    browser,
  }) => {
    const guide = await freshGuide();
    const resident = await apiAs(RESIDENT_B);
    await moveOutIfConnected(resident);
    const code = await joinCodeOf(landlord, E2E_BUILDING.id);
    const memoText = `재활용 수거일이 월·목으로 바뀌었어요 ${stamp()}`;

    await test.step("11 → 메모 남기기 → 44 연결 필요", async () => {
      await page.goto(`${home}/guides/${guide.id}`);
      await expect(page.getByRole("heading", { level: 1, name: guide.title })).toBeVisible();
      await page.getByRole("button", { name: "메모 남기기" }).click();
      const connect = sheet(page, "안내 수정 메모는 이 건물에 연결한 거주자가 남길 수 있어요");
      await expect(connect).toBeVisible();
      await expect(connect).toContainText("‘분리수거’ 안내로 돌아와 이어서 쓸 수 있어요");
      await connect.getByRole("button", { name: "우리 건물로 연결하기" }).click();
    });

    await test.step("02 가입코드(1/2)", async () => {
      await expect(page).toHaveURL(new RegExp(`${home}/connect\\?returnTo=`));
      await expect(
        page.getByRole("heading", { level: 1, name: "이 건물에 살고 있나요?" }),
      ).toBeVisible();
      await page.getByRole("textbox", { name: "가입코드 6자리" }).fill(code);
      await page.getByRole("button", { name: "다음" }).click();
    });

    await test.step("16 로그인과 동의(2/2) → 연결 확인", async () => {
      await expect(
        page.getByRole("heading", { level: 1, name: /로그인이 필요해요/ }),
      ).toBeVisible();
      await expect(page.getByText(`가입코드 ${code} 확인`)).toBeVisible();
      await page.getByRole("checkbox", { name: "모두 동의해요" }).check();
      await page.getByRole("button", { name: "시연용 다음 입주자로 계속하기" }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: /테스트빌라에\s*연결할까요\?/ }),
      ).toBeVisible();
      await page.getByRole("button", { name: `${E2E_BUILDING.name}에 연결하기` }).click();
    });

    await test.step("보던 안내로 돌아오고, 17 알림 선택을 닫으면 메모 시트(12)가 열린다", async () => {
      await expect(page).toHaveURL(new RegExp(`${home}/guides/${guide.id}`));
      await expect(page.getByRole("heading", { level: 1, name: guide.title })).toBeVisible();
      const notify = sheet(page, "새 공지를 알림으로 받을까요?");
      await expect(notify).toBeVisible();
      await notify.getByRole("button", { name: "나중에" }).click();
      const write = sheet(page, "어떤 부분이 달라졌나요?");
      await expect(write).toBeVisible();
      await expect(write.getByRole("textbox", { name: "달라진 내용" })).toHaveValue("");
      await expect(page).not.toHaveURL(/memo=write/);
    });

    await test.step("12 → 13: 메모를 남기면 ‘집주인 확인 전’으로 보인다", async () => {
      const write = sheet(page, "어떤 부분이 달라졌나요?");
      await write.getByRole("textbox", { name: "달라진 내용" }).fill(memoText);
      await write.getByRole("button", { name: "메모 남기기" }).click();
      const sent = sheet(page, "메모를 남겼어요");
      await expect(sent).toBeVisible();
      await expect(sent).toContainText("집주인이 확인하기 전까지 기본 안내는 그대로예요.");
      await expect(sent).toContainText(memoText);
      await expect(sent.getByText("집주인 확인 전")).toBeVisible();
      await expect(sent.locator('img.wh-hami[src*="tip-saved"]')).toBeVisible();
      await sent.getByRole("button", { name: "안내로 돌아가기" }).click();
      await expect(sent).toBeHidden();
      const mine = memoSection(page).getByRole("listitem").filter({ hasText: memoText });
      await expect(mine).toContainText("내 메모");
      await expect(mine).toContainText("집주인 확인 전");
    });

    const memo = (await memosOf(landlord, E2E_BUILDING.id)).find(
      (item) => item.guideId === guide.id && item.body === memoText,
    );
    expect(memo, "서버에 확인 전 메모가 있어야 해요").toMatchObject({ status: "pending" });
    const next = "재활용은 월·목 저녁에 내놓아 주세요.";

    await test.step("집주인: 24 확인할 것 → 25 → 반영(33 → 43 수정 공개)", async () => {
      const context = await browser.newContext();
      await hideDevOverlays(context);
      const owner = await context.newPage();
      try {
        await loginAsE2eLandlord(owner);
        await reviewFromHome(owner, memo?.id ?? "");
        await expect(owner.getByText(memoText)).toBeVisible();
        await expect(owner.getByText("작성자 비공개")).toBeVisible();
        await owner.getByRole("link", { name: "안내에 반영" }).click();
        await expect(owner.getByRole("region", { name: "반영할 메모" })).toContainText(memoText);
        await owner.getByRole("textbox", { name: "내용" }).fill(next);
        await owner.getByRole("button", { name: "미리 보기" }).click();
        await expect(owner.getByRole("checkbox", { name: new RegExp(memoText) })).toBeChecked();
        await owner.getByRole("button", { name: "수정 공개" }).click();
        await expect(
          owner.getByText("안내를 고쳤어요. 메모 1개를 반영했어요", { exact: true }),
        ).toBeVisible();
      } finally {
        await context.close();
      }
    });

    await test.step("거주자: 같은 안내 아래에서 ‘반영됨’과 고친 안내를 본다", async () => {
      await page.reload();
      await expect(page.getByRole("article")).toContainText(next);
      const mine = memoSection(page).getByRole("listitem").filter({ hasText: memoText });
      await expect(mine).toContainText("반영됨");
      await expect(mine).toContainText("기본 안내에 반영했어요");
    });
    await resident.dispose();
  });

  test("집주인이 ‘기존 안내 유지’를 사유와 함께 고르면 거주자는 ‘기존 유지’와 사유를 본다", async ({
    page,
    browser,
  }) => {
    const guide = await freshGuide();
    const resident = await ensureResident(RESIDENT_B, E2E_BUILDING.id);
    const memoText = `재활용이 수요일로 바뀐 것 같아요 ${stamp()}`;
    const memo = await writeMemo(resident, guide.id, memoText);
    await resident.dispose();
    const reason = "구청 안내를 다시 확인했어요. 화·금이 맞아요.";

    await test.step("집주인: 25 → 기존 안내 유지 → 사유 없이 누르면 알려 주고, 사유를 적으면 유지", async () => {
      const context = await browser.newContext();
      await hideDevOverlays(context);
      const owner = await context.newPage();
      try {
        await loginAsE2eLandlord(owner);
        await reviewFromHome(owner, memo.id);
        await owner.getByRole("button", { name: "기존 안내 유지" }).click();
        const keep = sheet(owner, "기존 안내를 유지할까요?");
        await expect(keep).toBeVisible();
        await keep.getByRole("button", { name: "기존 안내 유지" }).click();
        await expect(keep.getByText("유지하는 이유를 적어 주세요")).toBeVisible();
        await keep.getByRole("textbox", { name: "유지하는 이유" }).fill(reason);
        await keep.getByRole("button", { name: "기존 안내 유지" }).click();
        await expect(owner).toHaveURL(new RegExp(`${manageHome}$`));
        await expect(owner.getByText("기존 안내를 유지했어요", { exact: true })).toBeVisible();
      } finally {
        await context.close();
      }
    });

    expect(
      (await memosOf(landlord, E2E_BUILDING.id)).find((item) => item.id === memo.id),
    ).toMatchObject({ status: "kept", keptReason: reason });
    expect((await publicGuide(landlord, guide.id)).body).toBe(guide.body);

    await test.step("거주자: 안내 아래에서 ‘기존 유지’와 사유를 본다", async () => {
      await loginAs(page, RESIDENT_B);
      await page.goto(`${home}/guides/${guide.id}`);
      const mine = memoSection(page).getByRole("listitem").filter({ hasText: memoText });
      await expect(mine).toContainText("기존 유지");
      await expect(mine).toContainText("집주인이 기존 안내를 그대로 두기로 했어요");
      await expect(mine).toContainText(`사유: ${reason}`);
      await expect(page.getByRole("article")).toContainText(guide.body);
    });
  });

  test("13: 메모를 남긴 뒤 시트의 ‘안내로 돌아가기’가 390×844 화면 안에 다 보인다", async ({
    page,
  }) => {
    // lofi 13은 버튼과 아래 여백까지 보입니다. QA 2차 때 SEED 시트가 12(키보드)용 높이를 그대로 두어 버튼 아래
    // 약 20px가 잘렸고(보이는 비율 0.63), 13으로 바뀔 때 높이를 풀도록 고쳐졌습니다(MemoSheet.tsx).
    const guide = await freshGuide();
    const resident = await ensureResident(RESIDENT_B, E2E_BUILDING.id);
    await resident.dispose();
    await loginAs(page, RESIDENT_B);
    await page.goto(`${home}/guides/${guide.id}`);
    await page.getByRole("button", { name: "메모 남기기" }).click();
    const write = sheet(page, "어떤 부분이 달라졌나요?");
    await write
      .getByRole("textbox", { name: "달라진 내용" })
      .fill("재활용 수거일이 월·목으로 바뀌었어요.");
    await write.getByRole("button", { name: "메모 남기기" }).click();
    const sent = sheet(page, "메모를 남겼어요");
    await expect(sent).toBeVisible();
    await expect(sent.getByRole("button", { name: "안내로 돌아가기" })).toBeInViewport({
      ratio: 1,
      timeout: 3_000,
    });
  });
});

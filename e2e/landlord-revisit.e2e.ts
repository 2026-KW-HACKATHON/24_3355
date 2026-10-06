// 끝까지 해보는 테스트 ‘집주인 재방문’과 ‘안내 수정 실패’.
// 재방문: 42/24 관리 홈 → 공개한 안내 → 33 고치기(수정본) → 43 ‘수정 공개’ → 01·11 공개 내용이 바뀜.
//         편집 취소는 수정본만 지우고 공개 내용·메모 상태는 그대로(screens.md §3).
// 수정 실패: 수정본 저장(PATCH)·수정 공개(publish)가 실패해도 입력은 남고, 공개 안내와 메모 상태는 그대로.
//
// 테스트마다 테스트빌라에 새 안내를 공개해서(쓰기 테스트용 집주인, API) 시드 안내·다른 테스트와 섞이지 않게
// 합니다. 확인 전 메모가 필요한 테스트는 입주자 B를 테스트빌라에 연결해 API로 메모를 남깁니다.
import type { APIRequestContext, Page } from "@playwright/test";
import {
  apiAs,
  ensureResident,
  memosOf,
  publicGuide,
  publishGuide,
  revisionOf,
  writeMemo,
} from "./support/api";
import {
  E2E_BUILDING,
  E2E_LANDLORD,
  loginAsE2eLandlord,
  type PublicGuide,
  RESIDENT_B,
  stamp,
} from "./support/demo";
import { expect, hideDevOverlays, test } from "./support/test";

const manageHome = `/manage/${E2E_BUILDING.id}`;

let landlord: APIRequestContext;

test.beforeAll(async () => {
  landlord = await apiAs(E2E_LANDLORD);
});

test.afterAll(async () => {
  await landlord.dispose();
});

async function freshGuide(label: string): Promise<PublicGuide> {
  return publishGuide(landlord, E2E_BUILDING.id, {
    category: "common",
    title: `e2e ${label} ${stamp()}`,
    body: "현관문은 드나들 때 꼭 닫아 주세요.",
  });
}

/** 확인 전 메모 하나(입주자 B, 테스트빌라). */
async function pendingMemo(guide: PublicGuide, body: string) {
  const resident = await ensureResident(RESIDENT_B, E2E_BUILDING.id);
  try {
    return await writeMemo(resident, guide.id, body);
  } finally {
    await resident.dispose();
  }
}

async function memoStatus(memoId: string) {
  const memo = (await memosOf(landlord, E2E_BUILDING.id)).find((item) => item.id === memoId);
  return memo?.status;
}

/** 관리 홈(42·24)의 안내 목록에서 공개한 안내를 눌러 고치기(33)를 엽니다. */
async function openPublishedGuide(page: Page, guide: PublicGuide) {
  await page.goto(manageHome);
  await expect(page.getByRole("heading", { level: 1, name: E2E_BUILDING.name })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(`${guide.title}.*공개됨`) }).click();
  await expect(page.getByRole("heading", { level: 1, name: "기본 안내 고치기" })).toBeVisible();
}

test.describe("집주인 재방문 · 공개한 안내 고치기(LF-14, lofi 33 수정 → 43 수정 공개)", () => {
  test("관리 홈에서 공개한 안내를 고치고 ‘수정 공개’하면 세입자 화면이 바뀐다", async ({
    page,
    browser,
  }) => {
    const guide = await freshGuide("재방문");
    const next = "현관문은 드나들 때 꼭 닫아 주세요.\n밤 11시 이후에는 자동으로 잠겨요.";
    await loginAsE2eLandlord(page);

    await test.step("33: 공개 중인 안내를 고치고 있다고 알리고 지금 내용을 채워 둔다", async () => {
      await openPublishedGuide(page, guide);
      await expect(page.getByText("공개 중인 안내를 고치고 있어요")).toBeVisible();
      await expect(page.getByRole("textbox", { name: "제목" })).toHaveValue(guide.title);
      await expect(page.getByRole("textbox", { name: "내용" })).toHaveValue(guide.body);
      await page.getByRole("textbox", { name: "내용" }).fill(next);
      await page.getByRole("button", { name: "미리 보기" }).click();
    });

    await test.step("43: 수정본을 미리 보고, 공개 전까지 세입자에게는 이전 내용이 보인다", async () => {
      await expect(page).toHaveURL(new RegExp(`/guides/${guide.id}/preview$`));
      await expect(page.getByRole("heading", { level: 1, name: "공개 전 확인" })).toBeVisible();
      const frame = page.getByRole("article", { name: "세입자가 보는 안내 미리 보기" });
      await expect(frame).toContainText("밤 11시 이후에는 자동으로 잠겨요.");
      expect((await publicGuide(page.request, guide.id)).body).toBe(guide.body);
      expect((await revisionOf(landlord, guide.id))?.body).toBe(next);
    });

    await test.step("수정 공개하면 관리 홈으로 돌아가 알려 준다", async () => {
      await page.getByRole("button", { name: "수정 공개" }).click();
      await expect(page).toHaveURL(new RegExp(`${manageHome}$`));
      await expect(page.getByText("고친 안내를 공개했어요", { exact: true })).toBeVisible();
      expect(await revisionOf(landlord, guide.id)).toBeNull();
    });

    await test.step("11: 로그인하지 않은 세입자는 고친 내용을 읽는다", async () => {
      const visitor = await browser.newContext();
      await hideDevOverlays(visitor);
      const tenant = await visitor.newPage();
      try {
        await tenant.goto(`/b/${E2E_BUILDING.id}/guides/${guide.id}`);
        await expect(tenant.getByRole("article")).toContainText(
          "밤 11시 이후에는 자동으로 잠겨요.",
        );
      } finally {
        await visitor.close();
      }
    });
  });

  test("고치다 그만두면 수정본만 지우고 공개 내용과 확인 전 메모는 그대로다", async ({ page }) => {
    const guide = await freshGuide("편집 취소");
    const memo = await pendingMemo(guide, "현관문이 요즘 잘 안 닫혀요.");
    await loginAsE2eLandlord(page);

    await openPublishedGuide(page, guide);
    await page.getByRole("textbox", { name: "내용" }).fill("그만둘 수정 내용");
    await page.getByRole("button", { name: "미리 보기" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "공개 전 확인" })).toBeVisible();
    expect((await revisionOf(landlord, guide.id))?.body).toBe("그만둘 수정 내용");

    await test.step("돌아가서 수정하면 저장한 수정본이 채워져 있다", async () => {
      await page.getByRole("button", { name: "돌아가서 수정" }).last().click();
      await expect(page.getByRole("heading", { level: 1, name: "기본 안내 고치기" })).toBeVisible();
      await expect(page.getByRole("textbox", { name: "내용" })).toHaveValue("그만둘 수정 내용");
    });

    await test.step("그만두기 → 확인 대화상자 → 지우고 나가기", async () => {
      await page.getByRole("button", { name: "고치기 그만두기" }).click();
      const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
      await expect(dialog.getByText("고치던 내용을 지울까요?")).toBeVisible();
      await expect(dialog).toContainText("메모는 확인 전으로 남아요");
      await dialog.getByRole("button", { name: "지우고 나가기" }).click();
      await expect(page).toHaveURL(new RegExp(`${manageHome}$`));
    });

    expect(await revisionOf(landlord, guide.id)).toBeNull();
    expect((await publicGuide(page.request, guide.id)).body).toBe(guide.body);
    expect(await memoStatus(memo.id)).toBe("pending");
  });
});

test.describe("안내 수정 실패(저장·수정 공개 실패에도 공개 안내와 메모 상태가 그대로)", () => {
  test("수정본 저장이 실패하면 입력을 그대로 두고 공개 안내·메모 상태는 바뀌지 않는다", async ({
    page,
  }) => {
    const guide = await freshGuide("저장 실패");
    const memo = await pendingMemo(guide, "현관 자동 잠금 시간이 바뀌었어요.");
    await loginAsE2eLandlord(page);

    await test.step("25 → ‘안내에 반영’ → 33에 반영할 메모가 보인다", async () => {
      await page.goto(`${manageHome}/memos/${memo.id}`);
      await page.getByRole("link", { name: "안내에 반영" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "기본 안내 고치기" })).toBeVisible();
      await expect(page.getByRole("region", { name: "반영할 메모" })).toContainText(memo.body);
    });

    await page.route(`**/api/guides/${guide.id}`, (route) =>
      route.request().method() === "PATCH" ? route.abort("internetdisconnected") : route.continue(),
    );
    await page.getByRole("textbox", { name: "내용" }).fill("저장되지 않을 수정 내용");
    await page.getByRole("button", { name: "미리 보기" }).click();

    await expect(page.getByRole("alert")).toHaveText(
      "저장하지 못했어요. 공개 중인 안내는 그대로예요. 다시 눌러 주세요",
    );
    await expect(page).toHaveURL(new RegExp(`/guides/${guide.id}/edit`));
    await expect(page.getByRole("textbox", { name: "내용" })).toHaveValue(
      "저장되지 않을 수정 내용",
    );
    await expect(page.getByRole("textbox", { name: "제목" })).toHaveValue(guide.title);
    expect((await publicGuide(page.request, guide.id)).body).toBe(guide.body);
    expect(await revisionOf(landlord, guide.id)).toBeNull();
    expect(await memoStatus(memo.id)).toBe("pending");
  });

  test("수정 공개가 실패하면 43에 머물고 공개 안내·메모 상태는 그대로, 다시 누르면 반영된다", async ({
    page,
  }) => {
    const guide = await freshGuide("공개 실패");
    const memo = await pendingMemo(guide, "밤에는 현관이 자동으로 잠겨요.");
    const next = "현관문은 꼭 닫아 주세요. 밤 11시 이후에는 자동으로 잠겨요.";
    await loginAsE2eLandlord(page);

    await page.goto(`${manageHome}/memos/${memo.id}`);
    await page.getByRole("link", { name: "안내에 반영" }).click();
    await page.getByRole("textbox", { name: "내용" }).fill(next);
    await page.getByRole("button", { name: "미리 보기" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "공개 전 확인" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: new RegExp(memo.body) })).toBeChecked();

    await test.step("수정 공개 요청이 끊기면 43에 머물고 이유를 알려 준다", async () => {
      await page.route(`**/api/guides/${guide.id}/publish`, (route) =>
        route.abort("internetdisconnected"),
      );
      await page.getByRole("button", { name: "수정 공개" }).click();
      await expect(page.getByRole("alert")).toHaveText(
        "공개하지 못했어요. 지금 안내와 메모 상태는 그대로예요. 다시 눌러 주세요",
      );
      await expect(page).toHaveURL(new RegExp(`/guides/${guide.id}/preview`));
      expect((await publicGuide(page.request, guide.id)).body).toBe(guide.body);
      expect(await memoStatus(memo.id)).toBe("pending");
      expect((await revisionOf(landlord, guide.id))?.body).toBe(next);
      await page.unrouteAll({ behavior: "wait" });
    });

    await test.step("연결이 돌아온 뒤 다시 누르면 공개되고 메모가 반영된다", async () => {
      await page.getByRole("button", { name: "수정 공개" }).click();
      await expect(page).toHaveURL(new RegExp(`${manageHome}$`));
      await expect(
        page.getByText("안내를 고쳤어요. 메모 1개를 반영했어요", { exact: true }),
      ).toBeVisible();
      expect((await publicGuide(page.request, guide.id)).body).toBe(next);
      expect(await memoStatus(memo.id)).toBe("applied");
    });
  });
});

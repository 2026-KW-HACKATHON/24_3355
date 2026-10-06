// OPTIONAL 거주 경험이 쌓인다: 생활 팁(LF-06·07) · lofi 04 목록(hami-mini 토스트), 19 작성, 18 없음
// 작성자 정책(screens.md §4): 다른 거주자에게 작성자 없음, 월 단위 날짜, 본인 글에만 ‘내 팁’과 고치기·지우기,
// 남의 글은 신고(사유 한 줄, 신고만으로 가려지지 않음).
//
// 읽기·신고는 햇살빌라 시드 팁(입주자 A의 팁 1개 + 작성자 연결 없는 팁 3개)으로 봅니다(데이터는 신고 기록만
// 남음). 쓰기·고치기·지우기와 빈 목록(18)은 테스트빌라에서 입주자 B로 하고, 끝나면 B의 팁은 남지 않습니다.
import type { Locator, Page } from "@playwright/test";
import { apiAs, deleteMyTips, ensureResident } from "./support/api";
import { E2E_BUILDING, loginAs, RESIDENT_A, RESIDENT_B, SUNNY, stamp } from "./support/demo";
import { sheet } from "./support/flows";
import { expect, test } from "./support/test";

type TipRow = { id: string; body: string; mine: boolean; createdMonth: string };

function tipCards(page: Page): Locator {
  return page
    .getByRole("list")
    .filter({ has: page.locator("article") })
    .locator("article");
}

function tipCard(page: Page, body: string): Locator {
  return page.locator("article").filter({ hasText: body });
}

async function tipsAs(page: Page, buildingId: string): Promise<TipRow[]> {
  const response = await page.request.get(`/api/buildings/${buildingId}/tips`);
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { tips: TipRow[] }).tips;
}

test.describe("생활 팁 목록(lofi 04)과 작성자 정책", () => {
  test("거주자 홈의 팁 구역에서 목록을 열면 작성자 없이 월만 보이고 ‘내 팁’은 내가 쓴 팁에만 있다", async ({
    page,
  }) => {
    await loginAs(page, RESIDENT_A);
    const tips = await tipsAs(page, SUNNY.id);
    expect(tips.length, "햇살빌라 시드 팁").toBeGreaterThan(1);
    expect(
      tips.filter((tip) => tip.mine),
      "입주자 A의 팁은 하나",
    ).toHaveLength(1);

    await page.goto(`/b/${SUNNY.id}`);
    const preview = page.getByRole("region", { name: "거주자가 남긴 팁" });
    await expect(preview).toBeVisible();
    await preview.getByRole("link", { name: `${tips.length}개` }).click();

    await expect(page).toHaveURL(new RegExp(`/b/${SUNNY.id}/tips$`));
    await expect(page.getByRole("heading", { level: 1, name: "거주자가 남긴 팁" })).toBeVisible();
    await expect(
      page.getByText("다른 거주자에게 작성자가 안 보여요", { exact: false }),
    ).toBeVisible();
    await expect(tipCards(page)).toHaveCount(tips.length);

    for (const tip of tips) {
      const card = tipCard(page, tip.body);
      const [year, month] = tip.createdMonth.split("-");
      await expect(card).toContainText(`${year}년 ${Number(month)}월`);
      if (tip.mine) {
        await expect(card.getByText("내 팁", { exact: true })).toBeVisible();
        await expect(card.getByRole("button", { name: "내 팁 고치기·지우기" })).toBeVisible();
      } else {
        await expect(card.getByText("내 팁", { exact: true })).toHaveCount(0);
        await expect(card.getByRole("button", { name: "이 팁 신고하기" })).toBeVisible();
      }
      // 날짜는 월까지만(일·시각 없음)
      await expect(card).not.toContainText(/\d{1,2}일|오전|오후/);
    }
  });

  test("남의 팁은 한 줄 사유와 함께 신고하고, 신고만으로는 목록에서 사라지지 않는다", async ({
    page,
  }) => {
    await loginAs(page, RESIDENT_A);
    const other = (await tipsAs(page, SUNNY.id)).find((tip) => !tip.mine);
    if (!other) throw new Error("신고할 남의 팁이 없어요");

    await page.goto(`/b/${SUNNY.id}/tips`);
    await tipCard(page, other.body).getByRole("button", { name: "이 팁 신고하기" }).click();
    const report = sheet(page, "이 팁을 신고할까요?");
    await expect(report).toBeVisible();
    await expect(report).toContainText("신고한 사람은 다른 거주자와 집주인에게 보이지");
    const reason = report.getByRole("textbox", { name: /사유/ });
    await reason.fill("특정인을 짐작할 수 있는\n내용이 있어요");
    await expect(reason).not.toHaveValue(/\n/);
    await report.getByRole("button", { name: "신고하기" }).click();

    // 같은 팁을 이미 신고했으면(다시 돌린 테스트) ‘이미 신고한 팁이에요’입니다. 둘 다 운영팀이 확인한다는 뜻입니다.
    await expect(
      page.getByText(
        /^(신고를 받았어요\. 운영팀이 확인할게요|이미 신고한 팁이에요\. 운영팀이 확인하고 있어요)$/,
      ),
    ).toBeVisible();
    await expect(report).toBeHidden();
    await expect(tipCard(page, other.body)).toBeVisible();
  });
});

test.describe("생활 팁 쓰기·고치기·지우기(lofi 19 → 04, 18 없음)", () => {
  test("빈 목록(18)에서 팁을 남기면 hami-mini 토스트와 ‘내 팁’이 보이고, 고치고 지우면 다시 빈 목록이다", async ({
    page,
  }) => {
    const resident = await ensureResident(RESIDENT_B, E2E_BUILDING.id);
    await deleteMyTips(resident, E2E_BUILDING.id);
    await resident.dispose();
    const first = `택배 상자는 펼쳐서 내놓으면 수거함이 덜 차요 ${stamp()}`;
    const edited = `${first} (고침)`;
    await loginAs(page, RESIDENT_B);

    await test.step("18: 아직 남겨진 팁이 없어요(재촉하지 않음) → 남기기", async () => {
      await page.goto(`/b/${E2E_BUILDING.id}/tips`);
      await expect(
        page.getByRole("heading", { level: 1, name: "아직 남겨진 팁이 없어요" }),
      ).toBeVisible();
      await expect(page.locator('main img.wh-hami[src*="tray-empty"]')).toBeVisible();
      await page.getByRole("link", { name: "생활 팁 남기기" }).click();
    });

    await test.step("19: 종류 없이 누르면 알려 주고, 종류·내용을 쓰면 남긴다", async () => {
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "다음에 살 사람에게 알려주고 싶은 것이 있나요?",
        }),
      ).toBeVisible();
      await expect(
        page.getByText("특정인을 짐작할 수 있는 내용은 쓰지 말아 주세요."),
      ).toBeVisible();
      await page.getByRole("button", { name: "남기기" }).click();
      await expect(page.getByText("종류를 골라 주세요")).toBeVisible();
      await page.getByRole("radio", { name: "택배" }).check();
      await page.getByRole("textbox", { name: "팁 내용" }).fill(first);
      await page.getByRole("button", { name: "남기기" }).click();
    });

    await test.step("04: 목록으로 돌아와 hami-mini 토스트와 ‘내 팁’을 본다", async () => {
      await expect(page).toHaveURL(new RegExp(`/b/${E2E_BUILDING.id}/tips$`));
      const toast = page.getByText("생활 팁을 건물에 남겼어요", { exact: true });
      await expect(toast).toBeVisible();
      await expect(page.locator('img.wh-hami[src*="hami-mini"]')).toBeVisible();
      const card = tipCard(page, first);
      await expect(card.getByText("내 팁", { exact: true })).toBeVisible();
      await expect(card).toContainText("‘내 팁’ 표시는 나에게만 보여요");
    });

    await test.step("내 팁 → 고치기 → 고친 내용이 목록에 보인다", async () => {
      await tipCard(page, first).getByRole("button", { name: "내 팁 고치기·지우기" }).click();
      const own = sheet(page, "내 팁");
      await own.getByRole("button", { name: "고치기" }).click();
      await expect(page).toHaveURL(/\/tips\/[0-9a-f-]+\/edit$/);
      await expect(page.getByRole("textbox", { name: "팁 내용" })).toHaveValue(first);
      await page.getByRole("textbox", { name: "팁 내용" }).fill(edited);
      await page.getByRole("button", { name: "고치기" }).click();
      await expect(page.getByText("팁을 고쳤어요", { exact: true })).toBeVisible();
      await expect(tipCard(page, edited)).toBeVisible();
    });

    await test.step("내 팁 → 지우기 → 한 번 더 묻고 지우면 빈 목록(18)", async () => {
      await tipCard(page, edited).getByRole("button", { name: "내 팁 고치기·지우기" }).click();
      await sheet(page, "내 팁").getByRole("button", { name: "지우기" }).click();
      const confirm = sheet(page, "이 팁을 지울까요?");
      await expect(confirm).toContainText("되돌릴 수 없어요");
      await confirm.getByRole("button", { name: "지우기" }).click();
      await expect(page.getByText("팁을 지웠어요", { exact: true })).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 1, name: "아직 남겨진 팁이 없어요" }),
      ).toBeVisible();
    });

    const check = await apiAs(RESIDENT_B);
    try {
      const left = await check.get(`/api/buildings/${E2E_BUILDING.id}/tips`);
      expect(((await left.json()) as { tips: TipRow[] }).tips).toEqual([]);
    } finally {
      await check.dispose();
    }
  });

  test("연결하지 않은 사람이 팁 목록을 열면 연결 안내(44)를 보고 연결 뒤 목록으로 돌아올 수 있다", async ({
    page,
  }) => {
    await page.goto(`/b/${E2E_BUILDING.id}/tips`);
    await expect(
      page.getByRole("heading", { name: "생활 팁은 이 건물에 연결한 거주자가 볼 수 있어요" }),
    ).toBeVisible();
    const connect = page.getByRole("link", { name: "우리 건물로 연결하기" });
    await expect(connect).toHaveAttribute(
      "href",
      `/b/${E2E_BUILDING.id}/connect?returnTo=${encodeURIComponent(`/b/${E2E_BUILDING.id}/tips`)}`,
    );
  });

  test("팁을 남긴 뒤 hami-mini 토스트가 아래 ‘생활 팁 남기기’ 버튼을 가리지 않는다", async ({
    page,
  }) => {
    // lofi 04는 토스트를 dock 위에 띄웁니다. QA 2차 때 토스트가 화면 맨 아래에서 3초 동안 ‘생활 팁 남기기’를
    // 덮었고(겹침 56px), Dock·탭바를 Snackbar.AvoidOverlap으로 감싸 고쳐졌습니다.
    const resident = await ensureResident(RESIDENT_B, E2E_BUILDING.id);
    await deleteMyTips(resident, E2E_BUILDING.id);
    try {
      await loginAs(page, RESIDENT_B);
      await page.goto(`/b/${E2E_BUILDING.id}/tips/new`);
      await page.getByRole("radio", { name: "겨울" }).check();
      await page
        .getByRole("textbox", { name: "팁 내용" })
        .fill(`겨울엔 뒤편이 어두워요 ${stamp()}`);
      await page.getByRole("button", { name: "남기기" }).click();
      const toast = page.getByText("생활 팁을 건물에 남겼어요", { exact: true });
      await expect(toast).toBeVisible();
      const dockButton = page.getByRole("link", { name: "생활 팁 남기기" });
      await expect(dockButton).toBeVisible();
      const [toastBox, buttonBox] = await Promise.all([
        page.locator(".seed-snackbar-region").boundingBox(),
        dockButton.boundingBox(),
      ]);
      const overlap =
        toastBox && buttonBox
          ? Math.min(toastBox.y + toastBox.height, buttonBox.y + buttonBox.height) -
            Math.max(toastBox.y, buttonBox.y)
          : 0;
      expect(
        overlap,
        `토스트 ${JSON.stringify(toastBox)} · 버튼 ${JSON.stringify(buttonBox)}`,
      ).toBeLessThanOrEqual(0);
    } finally {
      await deleteMyTips(resident, E2E_BUILDING.id);
      await resident.dispose();
    }
  });
});

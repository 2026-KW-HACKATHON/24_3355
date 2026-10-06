// 끝까지 해보는 테스트 ‘비회원 제보’: 접수 후 창을 닫고, 정해진 경로로 자기 제보 상태를 다시 본다(screens.md §7).
// lofi 01 자주 쓰는 말(첫 번째 탭) → 20 보내기 전 확인 → ‘집주인에게 보내기’(두 번째 탭) → 06 접수(확인 링크)
// → 창 닫기 → 같은 브라우저로 01을 다시 열면 30 ‘내가 보낸 내용’ 배너 → 06/31
// → 다른 브라우저에서 확인 링크(토큰은 `#` 뒤, API에는 X-Report-Token 헤더) → 상태
// → 집주인 32 받은 내용 → 07 ‘확인했어요’ → 35 처리 완료 + 보낸 분께 한 줄 → 보낸 사람은 31에서 그 한 줄을 본다.
//
// 테스트빌라에 보냅니다. 서버는 같은 IP·같은 문구를 10분 안에 다시 받지 않아서(REPORT_TOO_FREQUENT), 최근
// 10분 안에 비회원이 보내지 않은 자주 쓰는 말을 집주인 API로 골라 씁니다. 비회원 제보는 같은 IP·건물에 한 시간
// 10건까지(RATE_LIMITED)라 이 파일은 한 번 돌 때 비회원 제보를 하나만 보냅니다(한 시간에 전체 실행 10번까지).
import type { APIRequestContext, Page, Request } from "@playwright/test";
import { apiAs, ensureResident, reportsOf } from "./support/api";
import {
  E2E_BUILDING,
  E2E_LANDLORD,
  loginAs,
  loginAsE2eLandlord,
  RESIDENT_B,
  SUNNY,
  stamp,
} from "./support/demo";
import { sheet } from "./support/flows";
import { expect, hideDevOverlays, test } from "./support/test";

const home = `/b/${E2E_BUILDING.id}`;
const PRESETS = [
  { key: "trash_overflow", text: "건물 앞 쓰레기가 넘쳤어요" },
  { key: "passage_blocked", text: "통로를 막는 물건이 있어요" },
  { key: "leak_or_broken", text: "물이 새거나 고장 났어요" },
] as const;
const REPEAT_WINDOW_MS = 11 * 60 * 1000;

let landlord: APIRequestContext;

test.beforeAll(async () => {
  landlord = await apiAs(E2E_LANDLORD);
});

test.afterAll(async () => {
  await landlord.dispose();
});

/** 최근 10분 안에 비회원이 덧붙임 없이 보내지 않은 자주 쓰는 말. */
async function freshPreset() {
  const since = Date.now() - REPEAT_WINDOW_MS;
  const recent = new Set(
    (await reportsOf(landlord, E2E_BUILDING.id))
      .filter(
        (report) =>
          report.reporterKind === "guest" &&
          report.body === null &&
          Date.parse(report.createdAt) > since,
      )
      .map((report) => report.preset),
  );
  const preset = PRESETS.find((item) => !recent.has(item.key));
  if (!preset) {
    throw new Error(
      "자주 쓰는 말 세 가지를 모두 최근 10분 안에 보냈어요(같은 IP 반복 제한). 10분 뒤 다시 돌립니다.",
    );
  }
  return preset;
}

function reportTrack(page: Page) {
  return page.getByRole("list", { name: "처리 단계" });
}

test.describe("비회원 제보(LF-10·11·16, lofi 01 → 20 → 06 → 30 → 31, 32 → 07 → 35)", () => {
  test("자주 쓰는 말을 두 번 눌러 보내고, 창을 닫았다가 같은 브라우저·확인 링크로 상태를 다시 보고, 집주인이 남긴 한 줄을 본다", async ({
    page,
    context,
    browser,
  }) => {
    const preset = await freshPreset();
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const note = "청소하시는 분께 오늘 오전에 치워 달라고 전했어요.";
    const posts: Request[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().endsWith(`/api/buildings/${E2E_BUILDING.id}/reports`)
      ) {
        posts.push(request);
      }
    });

    await test.step("01 → 20: 자주 쓰는 말을 누르면 받는 사람·공개 범위를 확인하는 시트가 뜬다", async () => {
      await page.goto(home);
      await expect(page.getByRole("heading", { level: 1, name: E2E_BUILDING.name })).toBeVisible();
      await expect(page.getByText("가입하지 않아도 보낼 수 있어요 · 집주인만 봐요")).toBeVisible();
      await page.getByRole("button", { name: new RegExp(`${preset.text}.*보내기`) }).click();
      const confirm = sheet(page, "이대로 보낼까요?");
      await expect(confirm).toBeVisible();
      await expect(confirm).toContainText(`${E2E_BUILDING.name} 집주인`);
      await expect(confirm).toContainText("집주인만 봐요 · 게시되지 않아요");
      await expect(confirm).toContainText(preset.text);
      expect(posts, "첫 번째 탭에서는 보내지 않아요").toHaveLength(0);
    });

    await test.step("두 번째 탭 ‘집주인에게 보내기’ → 06 접수(토큰은 이 브라우저에 보관하고 주소창에서 지움)", async () => {
      await sheet(page, "이대로 보낼까요?")
        .getByRole("button", { name: "집주인에게 보내기" })
        .click();
      await expect(
        page.getByRole("heading", { level: 1, name: "내용을 접수했어요" }),
      ).toBeVisible();
      await expect(page).toHaveURL(/\/r\/[0-9a-f-]{36}$/);
      await expect(page.locator('main img.wh-hami[src*="envelope"]')).toBeVisible();
      await expect(reportTrack(page)).toContainText("접수됨");
      await expect(page.getByText("이 브라우저에서 다시 보기")).toBeVisible();
      await expect(page.getByRole("button", { name: "링크 복사" })).toBeVisible();
      await expect(page.getByRole("button", { name: "카카오톡으로 공유" })).toBeVisible();
      expect(posts).toHaveLength(1);
      expect(posts[0]?.postDataJSON()).toEqual({ source: "preset", preset: preset.key });
    });

    const reportId = /\/r\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? "";
    let confirmLink = "";
    let token = "";

    await test.step("‘링크 복사’로 확인 링크(`/r/:id#t=…`)를 보관한다", async () => {
      await page.getByRole("button", { name: "링크 복사" }).click();
      await expect(
        page.getByText("확인 링크를 복사했어요. 본인만 보관해 주세요", { exact: true }),
      ).toBeVisible();
      const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()));
      expect(copied.pathname).toBe(`/r/${reportId}`);
      expect(copied.search).toBe("");
      token = new URLSearchParams(copied.hash.slice(1)).get("t") ?? "";
      expect(token.length).toBeGreaterThanOrEqual(16);
      // 공개 주소(VITE_PUBLIC_ORIGIN)가 따로 있어도 이 개발 서버에서 엽니다.
      confirmLink = `${copied.pathname}${copied.hash}`;
    });

    await test.step("창을 닫고 같은 브라우저로 건물을 다시 열면 30 ‘내가 보낸 내용’ 배너가 있다", async () => {
      await page.close();
      const again = await context.newPage();
      await again.goto(home);
      const banner = again.getByRole("link", { name: /내가 보낸 내용 1건/ });
      await expect(banner).toBeVisible();
      // 재방문(30)에는 함이 첫 방문 인사를 넣지 않습니다(함이 README §4).
      await expect(again.locator("main img.wh-hami")).toHaveCount(0);
      await banner.click();
      await expect(again).toHaveURL(new RegExp(`/r/${reportId}`));
      await expect(
        again.getByRole("heading", { level: 1, name: "내용을 접수했어요" }),
      ).toBeVisible();
      await again.close();
    });

    await test.step("다른 브라우저에서 확인 링크를 열면 토큰을 헤더로 보내 상태를 본다", async () => {
      const other = await browser.newContext();
      await hideDevOverlays(other);
      const phone = await other.newPage();
      try {
        const detail = phone.waitForRequest(
          (request) =>
            request.url().endsWith(`/api/reports/${reportId}`) && request.method() === "GET",
        );
        await phone.goto(confirmLink);
        const sent = await detail;
        expect(sent.headers()["x-report-token"]).toBe(token);
        expect(sent.url()).not.toContain(token);
        await expect(
          phone.getByRole("heading", { level: 1, name: "내용을 접수했어요" }),
        ).toBeVisible();
        await expect(phone.getByText(`${E2E_BUILDING.name} · ‘${preset.text}’`)).toBeVisible();
      } finally {
        await other.close();
      }
    });

    await test.step("집주인: 32 받은 내용 → 07 확인했어요 → 35 처리 완료 + 한 줄", async () => {
      const office = await browser.newContext();
      await hideDevOverlays(office);
      const owner = await office.newPage();
      try {
        await loginAsE2eLandlord(owner);
        await owner.goto(`/manage/${E2E_BUILDING.id}/inbox`);
        await owner.locator(`a[href$="/reports/${reportId}"]`).click();
        await expect(owner.getByText("비회원").first()).toBeVisible();
        await expect(
          owner.getByText("열어보기만 해서는 ‘확인함’이 되지 않아요", { exact: false }),
        ).toBeVisible();
        await owner.getByRole("button", { name: "확인했어요" }).click();
        await expect(owner.getByText("확인함으로 표시했어요", { exact: true })).toBeVisible();
        await owner.getByRole("radio", { name: "처리 완료" }).check();
        await owner.getByRole("textbox", { name: /보낸 분께 한 줄/ }).fill(note);
        await owner.getByRole("button", { name: "결과 저장" }).click();
        await expect(owner.getByText("처리 결과를 저장했어요", { exact: true })).toBeVisible();
        await expect(owner.getByText("보낸 분께 남긴 말")).toBeVisible();
        await expect(owner.getByText(note)).toBeVisible();
      } finally {
        await office.close();
      }
    });

    await test.step("보낸 사람: 31 처리 완료와 ‘집주인이 남긴 말’(결과 상태에는 함이 없음)", async () => {
      const again = await context.newPage();
      await again.goto(`/r/${reportId}`);
      await expect(again.getByRole("heading", { level: 1 })).toHaveText(
        /집주인이 처리 완료로\s*표시했어요/,
      );
      await expect(again.getByText("집주인이 남긴 말")).toBeVisible();
      await expect(again.getByText(note)).toBeVisible();
      await expect(again.getByText("처리 완료는 집주인이 표시한", { exact: false })).toBeVisible();
      await expect(again.locator("main img.wh-hami")).toHaveCount(0);
    });
  });

  test("05 직접 적기: 종류·위치·내용을 확인(20)하고 보내면 06, 집주인이 확인하면 같은 화면이 ‘확인함’으로 바뀐다", async ({
    page,
  }) => {
    // 06의 ‘내용을 접수했어요’와 envelope 함이는 접수됨(received)일 때만입니다. 보낸 직후 화면을 새로고침해도
    // 집주인이 확인한 뒤면 결과 상태(함이 없음)를 보여야 합니다(screens.md 화면 규칙).
    // 비회원 제보는 같은 IP·건물에 한 시간 10건까지라, 이 테스트는 로그인한 입주자 B로 보내 비회원 몫을 아낍니다
    // (06의 접수 화면·상태 전환은 보낸 사람이 누구든 같음).
    const text = `분리수거함 옆 봉투가 골목까지 나와 있어요 ${stamp()}`;
    const resident = await ensureResident(RESIDENT_B, E2E_BUILDING.id);
    await resident.dispose();
    await loginAs(page, RESIDENT_B);

    // 거주자 홈(03)의 ‘집주인에게 알리기’ → 고르기 시트 → 직접 적기(05)
    await page.goto(home);
    await page.getByRole("button", { name: /집주인에게 알리기/ }).click();
    await sheet(page, "집주인에게 알리기").getByRole("link", { name: "직접 적기" }).click();
    await expect(page).toHaveURL(new RegExp(`${home}/report$`));
    await expect(page.getByRole("heading", { name: "어떤 상황을 전할까요?" })).toBeVisible();

    await test.step("빈 칸으로 누르면 칸마다 알려 준다", async () => {
      await page.getByRole("button", { name: "보낼 내용 확인" }).click();
      await expect(page.getByText("어떤 상황인지 골라 주세요")).toBeVisible();
      await expect(page.getByText("상황을 한두 문장으로 적어 주세요")).toBeVisible();
    });

    await test.step("종류·위치·내용 → 20 확인 → 보내기 → 06", async () => {
      await page.getByRole("radio", { name: "쓰레기·분리수거" }).check();
      await page.getByRole("radio", { name: "분리수거함" }).check();
      await page.getByRole("textbox", { name: "내용" }).fill(text);
      await page.getByRole("button", { name: "보낼 내용 확인" }).click();
      const confirm = sheet(page, "이대로 보낼까요?");
      await expect(confirm).toContainText("쓰레기·분리수거");
      await expect(confirm).toContainText("분리수거함");
      await expect(confirm).toContainText(text);
      await confirm.getByRole("button", { name: "집주인에게 보내기" }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "내용을 접수했어요" }),
      ).toBeVisible();
      await expect(page.locator('main img.wh-hami[src*="envelope"]')).toBeVisible();
    });

    const reportId = /\/r\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? "";
    expect(reportId).not.toBe("");
    const acknowledged = await landlord.post(`/api/reports/${reportId}/acknowledge`, { data: {} });
    expect(acknowledged.status()).toBe(200);

    await test.step("집주인이 확인한 뒤 같은 화면을 새로고침하면 ‘집주인이 확인했어요’(함이 없음)", async () => {
      await page.reload();
      await expect(
        page.getByRole("heading", { level: 1, name: "집주인이 확인했어요" }),
      ).toBeVisible();
      await expect(page.getByText("내용을 접수했어요")).toHaveCount(0);
      await expect(page.locator("main img.wh-hami")).toHaveCount(0);
    });
  });

  test("05에서 확인 시트(20)를 연 채 뒤로 가면 시트만 닫고 쓰던 내용은 남으며, 한 번 더 뒤로 가면 나가기를 묻는다", async ({
    page,
  }) => {
    // 보내지 않는 테스트라 햇살빌라에서 합니다(interaction.md: 시트가 열려 있으면 뒤로 가기는 시트를 닫음).
    const text = "밤마다 보일러실에서 웅웅거리는 소리가 나요";
    await page.goto(`/b/${SUNNY.id}`);
    await page.getByRole("link", { name: "직접 적기" }).click();
    await page.getByRole("radio", { name: "소음" }).check();
    await page.getByRole("textbox", { name: "내용" }).fill(text);
    await page.getByRole("button", { name: "보낼 내용 확인" }).click();
    await expect(sheet(page, "이대로 보낼까요?")).toBeVisible();

    await page.goBack();
    await expect(sheet(page, "이대로 보낼까요?")).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/b/${SUNNY.id}/report$`));
    await expect(page.getByRole("textbox", { name: "내용" })).toHaveValue(text);

    await page.goBack();
    const leave = page.getByRole("alertdialog").or(page.getByRole("dialog"));
    await expect(leave.getByText("쓰던 내용이 사라져요")).toBeVisible();
    await leave.getByRole("button", { name: "계속 쓰기" }).click();
    await expect(page.getByRole("textbox", { name: "내용" })).toHaveValue(text);
  });
});

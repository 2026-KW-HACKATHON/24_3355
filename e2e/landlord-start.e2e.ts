// 끝까지 해보는 테스트 ‘새 집주인 시작’(처음부터 끝까지): 설명을 듣지 않고 초대 링크에서 안내 하나를 공개한다.
// lofi 41 초대 → 로그인 → 23 건물 확인 → 33 → 43 → 38 → 42 → 01 (screens.md CORE 1)
// 23은 다른 에이전트가 만드는 중이라 주소·제목·‘맞아요…’ 버튼만 보고 넘어갑니다(23 자체 스펙은 따로).
//
// 준비빌라(preparing, 관리자 없음)는 한 번 공개하면 open이 되어 `--reset-demo`로만 되돌아갑니다. 그래서 이
// 테스트는 준비빌라가 시드 상태일 때만 돌고, 아니면 이유를 적고 건너뜁니다(보고에 그대로 드러남).
// 초대 화면은 시연 로그인을 숨기므로(카카오 계정 필요) 카카오 로그인에서 돌아온 것처럼 API로 로그인한 뒤
// 같은 초대 화면을 다시 엽니다. 수락하는 계정은 쓰기 테스트용 집주인이라 햇살빌라 시연 계정은 그대로입니다.
import { apiAs, meOf } from "./support/api";
import {
  buildingStatus,
  E2E_LANDLORD,
  issueInvite,
  loginAsE2eLandlord,
  PREP_BUILDING,
  publishedGuides,
  stamp,
} from "./support/demo";
import { expect, guideLink, hideDevOverlays, test } from "./support/test";

test.describe("새 집주인 시작(LF-12·13·14, lofi 41 → 23 → 33 → 43 → 38 → 42)", () => {
  test("초대 링크로 들어와 수락·건물 확인하고 첫 안내를 공개하면 준비 완료(38)가 되고 공개 화면에 보인다", async ({
    page,
    browser,
  }) => {
    // QA 2차(2026-09-30)에 23 ‘맞아요, 안내 쓰기’가 확인 뒤 캐시 갱신으로 42로 새던 것을 찾았고 fe-final이 고쳤습니다
    // (landlord-confirm/route.tsx: 이미 확인한 건물 판정을 처음 열 때 한 번만).
    const landlord = await apiAs(E2E_LANDLORD);
    const managed = (await meOf(landlord)).managedBuildings.some(
      (building) => building.id === PREP_BUILDING.id,
    );
    await landlord.dispose();
    const status = await buildingStatus(page, PREP_BUILDING.id);
    test.skip(
      status !== "preparing" || managed,
      `${PREP_BUILDING.name}이 시드 상태(preparing, 관리자 없음)가 아니에요(status=${status}, 관리 중=${managed}). \`pnpm --filter @wolgyeham/api db:seed -- --reset-demo\` 뒤 다시 돌립니다.`,
    );

    const title = `분리수거는 1층 주차장 옆에 ${stamp()}`;
    const body = ["재활용은 화·금 저녁에 내놓아 주세요.", "음식물은 목·일 저녁이에요."];
    const token = issueInvite(PREP_BUILDING.id);

    await test.step("41: 초대 링크를 열면 건물 이름과 카카오 시작을 본다", async () => {
      await page.goto(`/invite#t=${token}`);
      await expect(page.getByText(`${PREP_BUILDING.name} 관리자로 초대받았어요`)).toBeVisible();
      await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toBeVisible();
    });

    await test.step("카카오 로그인에서 돌아오면 같은 초대를 한 번 더 눌러 수락한다", async () => {
      await loginAsE2eLandlord(page);
      await page.goto("/invite");
      await expect(page.getByText(`${PREP_BUILDING.name} 관리자로 초대받았어요`)).toBeVisible();
      await page.getByRole("button", { name: "초대 수락하고 시작하기" }).click();
    });

    await test.step("23: 초대받은 건물이 맞는지 확인하면 안내가 없으니 바로 첫 안내 쓰기(33)로 간다", async () => {
      await expect(page).toHaveURL(new RegExp(`/manage/${PREP_BUILDING.id}/confirm$`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        /초대받은 건물이\s*맞나요\?/,
      );
      expect(await publishedGuides(page, PREP_BUILDING.id)).toEqual([]);
      await page.getByRole("button", { name: /^맞아요/ }).click();
      await expect(page).toHaveURL(new RegExp(`/manage/${PREP_BUILDING.id}/guides/new$`));
    });

    await test.step("33: 종류·제목·내용을 쓰고 미리 보기", async () => {
      await expect(page.getByRole("heading", { level: 1, name: "기본 안내 쓰기" })).toBeVisible();
      await page.getByRole("radio", { name: "분리수거" }).check();
      await page.getByRole("textbox", { name: "제목" }).fill(title);
      await page.getByRole("textbox", { name: "내용" }).fill(body.join("\n"));
      await page.getByRole("button", { name: "미리 보기" }).click();
    });

    await test.step("43: 공개 범위 경고를 보고 안내를 공개한다", async () => {
      await expect(page.getByRole("heading", { level: 1, name: "공개 전 확인" })).toBeVisible();
      await expect(
        page.getByText("이 안내는 QR이나 링크를 가진 누구나 볼 수 있어요"),
      ).toBeVisible();
      await page.getByRole("button", { name: "안내 공개하기" }).click();
    });

    await test.step("38: 첫 공개면 준비 완료 화면과 다음 할 일(QR·입주 카드·링크)", async () => {
      await expect(page).toHaveURL(new RegExp(`/manage/${PREP_BUILDING.id}/ready$`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        new RegExp(`${PREP_BUILDING.name} 월계함이\\s*준비됐어요`),
      );
      await expect(page.getByText("기본 안내 1개가 현관 QR에 보여요")).toBeVisible();
      await expect(page.getByRole("link", { name: /현관 QR 받기/ })).toBeVisible();
      await expect(page.getByRole("link", { name: /입주 카드 받기/ })).toBeVisible();
      expect(await buildingStatus(page, PREP_BUILDING.id)).toBe("open");
    });

    await test.step("관리 홈으로 가면 ‘안내를 공개했어요’ 상태다", async () => {
      await page.getByRole("link", { name: "관리 홈으로" }).click();
      await expect(page).toHaveURL(new RegExp(`/manage/${PREP_BUILDING.id}$`));
      await expect(page.getByText(`${PREP_BUILDING.name} 안내를 공개했어요`)).toBeVisible();
    });

    await test.step("01: 로그인하지 않은 세입자가 현관 QR 화면에서 새 안내를 읽는다", async () => {
      const visitor = await browser.newContext();
      await hideDevOverlays(visitor);
      const tenant = await visitor.newPage();
      try {
        await tenant.goto(`/b/${PREP_BUILDING.id}`);
        await expect(
          tenant.getByRole("heading", { level: 1, name: PREP_BUILDING.name }),
        ).toBeVisible();
        await guideLink(tenant, title).click();
        await expect(tenant.getByRole("heading", { level: 1, name: title })).toBeVisible();
        for (const line of body) await expect(tenant.getByRole("article")).toContainText(line);
      } finally {
        await visitor.close();
      }
    });
  });
});

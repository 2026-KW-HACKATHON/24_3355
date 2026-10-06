// 끝까지 해보는 테스트 ‘알림 거절’과 ‘카카오톡 링크’ (screens.md §6 알림 환경, lofi 17).
// 알림 거절: 01 → 02 → 16 → 연결 → 10 거주자 홈 위 17 ‘새 공지를 알림으로 받을까요?’ → 나중에
//           → 연결·안내·메모 쓰기는 그대로, 알림은 ‘꺼짐’(45).
// 카카오톡 링크: 카카오톡 안 브라우저로 받은 링크 → 연결 → 17 카카오톡 분기(‘Safari·Chrome으로 열기’)
//           → 외부 브라우저에서 `/me?notify=1` → 로그인하고 돌아오면 17(설정)이 바로 열림 → 알림 받기 → 켜짐.
//
// 연결 전 사람은 입주자 B(테스트 전에 연결을 끝내 둠), 건물은 테스트빌라입니다. 헤드리스 Chrome은 푸시
// 서비스에 구독할 수 없어 권한·PushManager만 흉내 내고(support/flows.ts), 서버 저장은 실제로 보냅니다.
import type { APIRequestContext, CDPSession, Page } from "@playwright/test";
import { apiAs, joinCodeOf, meOf, moveOutIfConnected } from "./support/api";
import { E2E_BUILDING, E2E_LANDLORD, RESIDENT_B, TERMS_CONSENT } from "./support/demo";
import {
  agreeBeforeLogin,
  connectWithCode,
  fakePushSupport,
  permissionAsks,
  sheet,
} from "./support/flows";
import { expect, hideDevOverlays, test } from "./support/test";

const home = `/b/${E2E_BUILDING.id}`;
/** 카카오톡(iPhone) 안 브라우저. screens.md §6 ‘카카오톡 등 앱 안 브라우저’ */
const KAKAOTALK_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5";
/** 카카오톡에서 ‘외부 브라우저로 열기’로 넘어간 Android Chrome(알림을 켤 수 있는 환경). */
const ANDROID_CHROME_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

let landlord: APIRequestContext;
let resident: APIRequestContext;
let code: string;

test.beforeAll(async () => {
  landlord = await apiAs(E2E_LANDLORD);
  resident = await apiAs(RESIDENT_B);
  code = await joinCodeOf(landlord, E2E_BUILDING.id);
});

test.afterAll(async () => {
  await landlord.dispose();
  await resident.dispose();
});

test.beforeEach(async () => {
  await moveOutIfConnected(resident);
});

/** 공개 화면(01)의 연결 카드에서 연결을 시작합니다. */
async function startConnectFromPublic(page: Page) {
  await page.goto(home);
  await expect(page.getByRole("heading", { level: 1, name: E2E_BUILDING.name })).toBeVisible();
  await page.getByRole("link", { name: /새 공지를 알림으로 받으려면/ }).click();
  await expect(page).toHaveURL(new RegExp(`${home}/connect$`));
}

test.describe("알림 거절(lofi 17 ‘나중에’)", () => {
  test.beforeEach(async ({ context }) => {
    await fakePushSupport(context);
  });

  test("연결 뒤 알림 선택에서 ‘나중에’를 골라도 연결은 끝났고 안내·메모 쓰기가 그대로다", async ({
    page,
  }) => {
    const subscriptions: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/push-subscriptions") && request.method() !== "GET") {
        subscriptions.push(`${request.method()} ${request.url()}`);
      }
    });

    await startConnectFromPublic(page);
    await connectWithCode(page, code, E2E_BUILDING.name);

    await test.step("10 거주자 홈 위에 17이 뜬다: 알림 받기·나중에, 연결은 끝났다는 안내", async () => {
      await expect(page).toHaveURL(new RegExp(`${home}$`));
      const notify = sheet(page, "새 공지를 알림으로 받을까요?");
      await expect(notify).toBeVisible();
      await expect(notify.getByRole("button", { name: "알림 받기" })).toBeVisible();
      await expect(notify).toContainText(
        "연결은 끝났어요. 알림 없이도 공지는 우리 건물 화면에서 볼 수 있어요.",
      );
      await expect(notify.locator('img.wh-hami[src*="bell"]')).toBeVisible();
      await notify.getByRole("button", { name: "나중에" }).click();
      await expect(notify).toBeHidden();
    });

    await test.step("권한을 묻지 않았고 구독을 저장하지 않았다. 연결은 active다", async () => {
      expect(await permissionAsks(page)).toBe(0);
      expect(subscriptions).toEqual([]);
      const { occupancy } = await meOf(resident);
      expect(occupancy).toMatchObject({ buildingId: E2E_BUILDING.id, status: "active" });
    });

    await test.step("10: 연결 직후 거주자 홈(환영·거주 중·처음 오셨나요)", async () => {
      await expect(page.getByText(`${E2E_BUILDING.name}에 연결됐어요`)).toBeVisible();
      await expect(page.getByText("거주 중", { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: /처음 오셨나요\?/ })).toBeVisible();
    });

    await test.step("새로고침해도 알림 선택을 다시 강요하지 않는다", async () => {
      await page.reload();
      await expect(page.getByRole("heading", { level: 1, name: E2E_BUILDING.name })).toBeVisible();
      await page.waitForLoadState("networkidle");
      await expect(sheet(page, "새 공지를 알림으로 받을까요?")).toHaveCount(0);
    });

    await test.step("안내를 읽고, 연결한 거주자로 메모 시트를 바로 연다", async () => {
      const guideLink = page.getByRole("region", { name: "건물 안내" }).getByRole("link").first();
      await guideLink.click();
      await expect(page).toHaveURL(new RegExp(`${home}/guides/`));
      await page.getByRole("button", { name: "메모 남기기" }).click();
      await expect(sheet(page, "어떤 부분이 달라졌나요?")).toBeVisible();
      await expect(
        sheet(page, "안내 수정 메모는 이 건물에 연결한 거주자가 남길 수 있어요"),
      ).toHaveCount(0);
    });

    await test.step("45 내 정보: 공지 알림은 꺼짐", async () => {
      await page.goto("/me");
      await expect(page.getByRole("button", { name: /공지 알림.*꺼짐/ })).toBeVisible();
    });
  });
});

test.describe("카카오톡 링크(카카오톡 안 브라우저 → Safari·Chrome, lofi 17 분기)", () => {
  test.use({ userAgent: KAKAOTALK_UA });

  test("카카오톡 안에서 연결하면 17이 외부 브라우저로 열기를 안내하고, 외부 브라우저에서 로그인하면 알림 선택이 열려 알림을 켠다", async ({
    page,
    context,
    browser,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const cdp: CDPSession = await context.newCDPSession(page);
    await cdp.send("Page.enable");
    const external: string[] = [];
    cdp.on("Page.frameRequestedNavigation", (event: { url: string }) => external.push(event.url));

    await startConnectFromPublic(page);
    await connectWithCode(page, code, E2E_BUILDING.name);

    const notify = sheet(page, "카카오톡 안에서는 알림을 켤 수 없어요");
    const notifyUrl = `${new URL(page.url()).origin}/me?notify=1`;

    await test.step("17 카카오톡 분기: 연결은 그대로라고 알리고 외부 브라우저로 열기·주소 복사를 준다", async () => {
      await expect(notify).toBeVisible();
      await expect(notify).toContainText("연결은 그대로예요");
      await expect(notify.getByRole("button", { name: "알림 받기" })).toHaveCount(0);
      await notify.getByRole("button", { name: "주소 복사" }).click();
      await expect(
        page.getByText("주소를 복사했어요. Safari·Chrome에 붙여넣어 주세요", { exact: true }),
      ).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(notifyUrl);
    });

    await test.step("‘Safari·Chrome으로 열기’는 카카오톡 외부 열기 주소로 내 정보(알림 선택)를 연다", async () => {
      await notify.getByRole("button", { name: "Safari·Chrome으로 열기" }).click();
      await expect
        .poll(() => external)
        .toContain(`kakaotalk://web/openExternal?url=${encodeURIComponent(notifyUrl)}`);
      const { occupancy } = await meOf(resident);
      expect(occupancy).toMatchObject({ buildingId: E2E_BUILDING.id, status: "active" });
    });

    await test.step("외부 브라우저: `/me?notify=1` → 카카오 로그인 → 돌아오면 17이 열리고 알림을 켠다", async () => {
      // 테스트의 카카오톡 UA를 물려받지 않도록 외부 브라우저 UA를 따로 줍니다.
      const outside = await browser.newContext({ userAgent: ANDROID_CHROME_UA });
      await hideDevOverlays(outside);
      await fakePushSupport(outside);
      const phone = await outside.newPage();
      const returnTos: string[] = [];
      // 카카오 로그인 왕복을 흉내 냅니다: 시작 주소가 오면 입주자 B로 로그인하고 returnTo로 돌려보냅니다.
      await phone.route("**/api/auth/kakao/start**", async (route) => {
        const returnTo = new URL(route.request().url()).searchParams.get("returnTo") ?? "/";
        returnTos.push(returnTo);
        const login = await outside.request.post("/api/dev/login", {
          data: { as: RESIDENT_B, consent: TERMS_CONSENT },
        });
        expect(login.status()).toBe(200);
        await route.fulfill({ status: 302, headers: { location: returnTo } });
      });
      try {
        await phone.goto(notifyUrl);
        await expect(phone.getByRole("heading", { name: "로그인이 필요해요" })).toBeVisible();
        await phone.getByRole("button", { name: "카카오로 로그인" }).click();
        await agreeBeforeLogin(phone);

        const settings = sheet(phone, "새 공지를 알림으로 받을까요?");
        await expect(settings).toBeVisible();
        expect(returnTos.at(-1)).toBe("/me?notify=1");
        await settings.getByRole("button", { name: "알림 받기" }).click();
        await expect(phone.getByText("공지 알림을 켰어요", { exact: true })).toBeVisible();
        await expect(phone).not.toHaveURL(/notify=1/);
        await expect(phone.getByRole("button", { name: /공지 알림.*켜짐/ })).toBeVisible();

        // 뒷정리: 이 휴대폰에서 알림 끄기(서버 구독 삭제). 남기면 공지를 올릴 때 가짜 주소로 발송을 시도합니다.
        await phone.getByRole("button", { name: /공지 알림.*켜짐/ }).click();
        const enabled = sheet(phone, "공지 알림이 켜져 있어요");
        await enabled.getByRole("button", { name: "이 휴대폰에서 알림 끄기" }).click();
        await expect(
          phone.getByText("이 휴대폰에서 공지 알림을 껐어요", { exact: true }),
        ).toBeVisible();
        await expect(phone.getByRole("button", { name: /공지 알림.*꺼짐/ })).toBeVisible();
      } finally {
        await outside.close();
      }
    });
  });
});

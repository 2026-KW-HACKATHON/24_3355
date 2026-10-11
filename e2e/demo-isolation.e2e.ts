// 시연과 실제 건물 분리(D-35). dev는 시연 건물과 실제 건물이 한 DB에 있어, 29(/demo)에서 고른 시연 계정 쿠키가
// 남은 채로 실제 건물의 현관 QR을 열면 시연을 끝내고 처음 온 사람처럼 이어 가야 합니다. 그리고 카카오 로그인을
// 다녀오면 새 탭으로 돌아와도 연결 2/2에서 이어 갑니다(안드로이드 카카오톡 앱 로그인).
import type { Page, Request } from "@playwright/test";
import { apiAs, joinCodeOf, moveOutIfConnected } from "./support/api";
import {
  appUrl,
  cleanRealAccount,
  cleanRealReports,
  E2E_BUILDING,
  E2E_LANDLORD,
  E2E_RESIDENT_B,
  e2eSessionToken,
  ensureRealBuilding,
  issueInvite,
  loginAs,
  pushSubscriptionCount,
  REAL_BUILDING,
  realAccountSession,
  requirePrecondition,
  SUNNY,
} from "./support/demo";
import { expect, test } from "./support/test";

const DEMO_ENDED = "시연을 마치고 실제 건물로 들어왔어요";

function demoBar(page: Page) {
  return page.getByRole("complementary", { name: "시연 안내" });
}

// 개발 DB에 직접 준비하므로(support/dev-db.ts) 로컬 서버에서만 돕니다.
test.beforeEach(({ baseURL }) => {
  const host = baseURL ? new URL(baseURL).hostname : "";
  requirePrecondition(
    ["localhost", "127.0.0.1", "[::1]", "::1"].includes(host),
    "로컬 개발 서버에서만 돌립니다(개발 DB에 직접 준비)",
  );
});

async function useRealAccount(page: Page) {
  const real = realAccountSession({ withPush: true });
  if (!real.endpoint) throw new Error("실제 계정 알림 구독을 만들지 못했어요");
  const baseURL = test.info().project.use.baseURL ?? "http://localhost:5173";
  await page.context().addCookies([{ name: "wh_session", value: real.token, url: baseURL }]);
  return { ...real, endpoint: real.endpoint };
}

async function chooseDemoRole(page: Page, role: RegExp) {
  await page.goto("/demo");
  await page.getByRole("button", { name: role }).click();
}

test.describe("시연 계정으로 실제 건물을 열면(D-35)", () => {
  test("시연을 끝내고 처음 온 사람처럼 연결(가입코드 → 카카오 로그인)을 이어 간다", async ({
    page,
  }) => {
    const code = ensureRealBuilding();

    await test.step("29에서 입주자 A를 고르면 시연 중 막대가 보인다", async () => {
      await chooseDemoRole(page, /^입주자 A/);
      await expect(page).toHaveURL(new RegExp(`/b/${SUNNY.id}`));
      await expect(demoBar(page)).toContainText("시연 중 · 입주자 A");
    });

    await test.step("실제 건물 현관 QR을 열면 로그아웃하고 토스트를 한 번 띄운다", async () => {
      await page.goto(`/b/${REAL_BUILDING.id}?via=qr`);
      await expect(page.getByText(DEMO_ENDED, { exact: true })).toBeVisible();
      await expect(demoBar(page)).toHaveCount(0);
      // 안내 없는 실제 건물의 공개 화면(첫 방문처럼)
      await expect(page.getByText(`${REAL_BUILDING.name} · 서울 노원구 광운로`)).toBeVisible();
      expect((await page.request.get("/api/me")).status()).toBe(401);
    });

    await test.step("연결하기 → 가입코드 → ‘옮길까요’가 아니라 카카오 로그인 단계", async () => {
      await page.getByRole("link", { name: /새 공지를 알림으로 받으려면/ }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "이 건물에 살고 있나요?" }),
      ).toBeVisible();
      await page.getByRole("textbox", { name: "가입코드 6자리" }).fill(code);
      await page.getByRole("button", { name: "다음" }).click();

      await expect(
        page.getByRole("heading", { level: 1, name: /로그인이 필요해요/ }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "카카오로 계속하기" })).toBeVisible();
      await expect(page.getByText(/옮길까요/)).toHaveCount(0);
      // 실제 건물에는 시연 계정으로 연결할 수 없으므로 시연용 로그인을 보이지 않습니다.
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("button", { name: /시연용/ })).toHaveCount(0);
      // 토스트는 한 번만(되풀이하지 않음)
      await expect(page.getByText(DEMO_ENDED, { exact: true })).toHaveCount(0, { timeout: 5_000 });
    });

    await test.step("카카오 로그인은 이 건물의 연결 화면으로 돌아오게 시작한다", async () => {
      const returnTos: string[] = [];
      // 카카오 왕복은 흉내만 냅니다(실제 계정 없이 돌아오기만): 로그인 전 그대로 연결 화면에 돌아옵니다.
      await page.route("**/api/auth/kakao/start**", async (route) => {
        const returnTo = new URL(route.request().url()).searchParams.get("returnTo") ?? "/";
        returnTos.push(returnTo);
        await route.fulfill({ status: 302, headers: { location: returnTo } });
      });
      await page.getByRole("checkbox", { name: "모두 동의해요" }).check();
      await page.getByRole("button", { name: "카카오로 계속하기" }).click();
      await expect.poll(() => returnTos.at(-1)).toBe(`/b/${REAL_BUILDING.id}/connect`);
      await expect(
        page.getByRole("heading", { level: 1, name: /로그인이 필요해요/ }),
      ).toBeVisible();
      await expect(page.getByText(`가입코드 ${code} 확인`)).toBeVisible();
    });
  });

  test("시연 건물(햇살빌라)에서는 시연을 그대로 두고, 새 탭에서도 시연 중 막대가 보인다", async ({
    page,
    context,
  }) => {
    await chooseDemoRole(page, /^입주자 A/);
    await expect(page).toHaveURL(new RegExp(`/b/${SUNNY.id}`));
    await expect(demoBar(page)).toContainText("시연 중 · 입주자 A");

    const tab = await context.newPage();
    await tab.goto(`/b/${SUNNY.id}?via=qr`);
    await expect(demoBar(tab)).toContainText("시연 중 · 입주자 A");
    await expect(tab.getByText(DEMO_ENDED, { exact: true })).toHaveCount(0);
    const me = await tab.request.get("/api/me");
    expect(me.status()).toBe(200);
    expect((await me.json()).user.demo).toBe("demo-resident-a");
    await tab.close();
  });
});

test.describe("카카오 로그인 뒤 새 탭으로 돌아와도(안드로이드 카카오톡 앱 로그인)", () => {
  test("연결 2/2(확인 버튼 하나)에서 이어 가고, 누르기 전에는 연결하지 않는다", async ({
    page,
    context,
  }) => {
    // 준비: e2e 계정 B를 연결 전으로 두고 테스트빌라 가입코드를 받습니다(발표 시연 계정은 둘러보기 전용).
    const resident = await apiAs(E2E_RESIDENT_B);
    const landlord = await apiAs(E2E_LANDLORD);
    let code: string;
    try {
      await moveOutIfConnected(resident);
      code = await joinCodeOf(landlord, E2E_BUILDING.id);
    } finally {
      await resident.dispose();
      await landlord.dispose();
    }

    const returnTos: string[] = [];
    // 카카오 왕복 흉내: 시작 주소가 오면 이 브라우저(쿠키)에 e2e 계정 B 세션을 두고, 탭은 비워 둡니다.
    await context.route("**/api/auth/kakao/start**", async (route) => {
      returnTos.push(new URL(route.request().url()).searchParams.get("returnTo") ?? "/");
      await context.addCookies([
        { name: "wh_session", value: e2eSessionToken(E2E_RESIDENT_B), url: appUrl() },
      ]);
      await route.fulfill({ status: 302, headers: { location: "/terms" } });
    });

    await page.goto(`/b/${E2E_BUILDING.id}/connect`);
    await page.getByRole("textbox", { name: "가입코드 6자리" }).fill(code);
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByRole("heading", { level: 1, name: /로그인이 필요해요/ })).toBeVisible();
    await page.getByRole("checkbox", { name: "모두 동의해요" }).check();
    await page.getByRole("button", { name: "카카오로 계속하기" }).click();
    await expect.poll(() => returnTos.at(-1)).toBe(`/b/${E2E_BUILDING.id}/connect`);
    await page.close();

    // 새 탭(탭 저장소가 빈 상태)으로 카카오가 돌려보낸 주소를 엽니다.
    const tab = await context.newPage();
    const connects: Request[] = [];
    tab.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/occupancies")) {
        connects.push(request);
      }
    });
    await tab.goto(returnTos.at(-1) ?? "/");
    expect(await tab.evaluate(() => sessionStorage.getItem("wh.connect"))).toBeNull();
    await expect(tab.getByText("2 / 2 · 연결 확인")).toBeVisible();
    await expect(
      tab.getByRole("heading", {
        level: 1,
        name: new RegExp(`${E2E_BUILDING.name}에\\s*연결할까요\\?`),
      }),
    ).toBeVisible();
    await expect(tab.getByRole("button", { name: `${E2E_BUILDING.name}에 연결하기` })).toHaveCount(
      1,
    );
    await tab.waitForLoadState("networkidle");
    expect(connects).toHaveLength(0);
    await tab.close();
  });
});

test.describe("시연 계정으로 실제 건물 초대를 열면(D-35)", () => {
  test("시연을 끝내고 카카오 로그인부터 받는다(시연 계정은 실제 건물 초대를 수락하지 않음)", async ({
    page,
  }) => {
    ensureRealBuilding();
    const token = issueInvite(REAL_BUILDING.id);
    await loginAs(page, "demo-landlord");

    await page.goto(`/invite#t=${token}`);

    await expect(page.getByText(DEMO_ENDED, { exact: true })).toBeVisible();
    await expect(page.getByText(`${REAL_BUILDING.name} 관리자로 초대받았어요`)).toBeVisible();
    await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toBeVisible();
    await expect(page.getByRole("button", { name: "초대 수락하고 시작하기" })).toHaveCount(0);
    expect((await page.request.get("/api/me")).status()).toBe(401);
    // 로그인하고 돌아와도 같은 초대를 보도록 토큰을 다시 남겨 둡니다.
    await page.reload();
    await expect(page.getByText(`${REAL_BUILDING.name} 관리자로 초대받았어요`)).toBeVisible();
  });
});

test.describe("카카오 계정으로 /demo를 열면(D-35)", () => {
  test.afterEach(() => {
    cleanRealAccount();
  });

  test("역할을 고르기 전에 묻고, ‘그만두기’면 그대로, ‘시연 보기’면 바꾸되 그 계정의 알림 구독은 남긴다", async ({
    page,
  }) => {
    const real = await useRealAccount(page);
    // 이 휴대폰의 구독이 그 카카오 계정 것으로 저장돼 있습니다(wh.pushSaved).
    await page.goto("/");
    await page.evaluate(
      ({ endpoint, userId }) =>
        localStorage.setItem("wh.pushSaved", JSON.stringify({ endpoint, userId })),
      real,
    );

    await page.goto("/demo");
    await page.getByRole("button", { name: /^입주자 A/ }).click();
    const dialog = page.getByRole("dialog", { name: "카카오 계정으로 로그인돼 있어요" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      "시연을 보면 지금 계정에서 로그아웃돼요. 연결과 알림 설정은 그대로 남아요.",
    );

    await test.step("그만두기: 카카오 계정 그대로", async () => {
      await dialog.getByRole("button", { name: "그만두기" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page).toHaveURL(/\/demo$/);
      const me = await (await page.request.get("/api/me")).json();
      expect(me.user).toMatchObject({ id: real.userId, demo: null });
    });

    await test.step("시연 보기: 로그아웃 → 입주자 A, 구독은 서버·이 휴대폰 모두 남음", async () => {
      await page.getByRole("button", { name: /^입주자 A/ }).click();
      await dialog.getByRole("button", { name: "시연 보기" }).click();
      await expect(page).toHaveURL(new RegExp(`/b/${SUNNY.id}`));
      await expect(demoBar(page)).toContainText("시연 중 · 입주자 A");
      const me = await (await page.request.get("/api/me")).json();
      expect(me.user.demo).toBe("demo-resident-a");
      expect(pushSubscriptionCount(real.endpoint)).toBe(1);
      expect(await page.evaluate(() => localStorage.getItem("wh.pushSaved"))).toContain(
        real.endpoint,
      );
    });

    await test.step("시연 끝내기(로그아웃)도 그 계정의 구독을 지우지 않는다", async () => {
      await demoBar(page).getByRole("button", { name: "시연 끝내기" }).click();
      await expect(demoBar(page)).toHaveCount(0);
      expect((await page.request.get("/api/me")).status()).toBe(401);
      expect(pushSubscriptionCount(real.endpoint)).toBe(1);
    });
  });

  test("로그인 전·시연 중에는 묻지 않고 바로 바꾼다", async ({ page }) => {
    await chooseDemoRole(page, /^입주자 A/);
    await expect(page).toHaveURL(new RegExp(`/b/${SUNNY.id}`));
    await chooseDemoRole(page, /^집주인/);
    await expect(page).toHaveURL(/\/manage\//);
    await expect(page.getByRole("dialog", { name: "카카오 계정으로 로그인돼 있어요" })).toHaveCount(
      0,
    );
    await expect(demoBar(page)).toContainText("시연 중 · 집주인");
  });
});

test.describe("시연 중 막대의 ‘시연 끝내기’(D-35)", () => {
  test("로그아웃하고 그 건물의 공개 화면으로 간다", async ({ page }) => {
    await chooseDemoRole(page, /^집주인/);
    await expect(page).toHaveURL(new RegExp(`/manage/${SUNNY.id}`));
    const end = demoBar(page).getByRole("button", { name: "시연 끝내기" });
    const box = await end.boundingBox();
    expect(box?.height).toBeGreaterThan(0);

    await end.click();

    await expect(page).toHaveURL(new RegExp(`/b/${SUNNY.id}$`));
    await expect(demoBar(page)).toHaveCount(0);
    expect((await page.request.get("/api/me")).status()).toBe(401);
  });
});

test.describe("시연 계정과 실제 건물의 제보·팁·알림(D-35)", () => {
  test.afterEach(() => {
    cleanRealReports();
  });

  test("실제 건물의 알리기·팁 화면을 열면 시연을 끝내고, 서버는 시연 계정의 제보를 비회원 제보로 받는다", async ({
    page,
  }) => {
    ensureRealBuilding();
    // 발표 시연 계정은 어디서든 쓰기가 막히므로(둘러보기 전용) 쓰기 테스트용 시연 계정(e2e 집주인)으로 봅니다.
    await loginAs(page, E2E_LANDLORD);

    await test.step("서버: 시연 세션으로 실제 건물에 보내도 막지 않고 비회원 제보(확인 토큰)로 받는다", async () => {
      const response = await page.request.post(`/api/buildings/${REAL_BUILDING.id}/reports`, {
        data: { source: "custom", kind: "other", body: `시연 세션 제보 ${Date.now()}` },
      });
      expect(response.status()).toBe(201);
      expect((await response.json()).accessToken).toEqual(expect.any(String));
    });

    await test.step("알리기 화면을 열면 시연을 끝낸다", async () => {
      await page.goto(`/b/${REAL_BUILDING.id}/report`);
      await expect(page.getByText(DEMO_ENDED, { exact: true })).toBeVisible();
      expect((await page.request.get("/api/me")).status()).toBe(401);
    });

    await test.step("팁 화면도 같다", async () => {
      await loginAs(page, E2E_LANDLORD);
      await page.goto(`/b/${REAL_BUILDING.id}/tips`);
      await expect(page.getByText(DEMO_ENDED, { exact: true })).toBeVisible();
      expect((await page.request.get("/api/me")).status()).toBe(401);
    });
  });

  test("시연 계정은 알림을 켤 수 없다: 화면은 안내 한 줄, 서버는 403", async ({ page }) => {
    await loginAs(page, "demo-resident-a");
    await page.goto("/me");
    await page.getByRole("button", { name: /공지 알림/ }).click();
    await expect(page.getByText("시연 계정에서는 알림을 켤 수 없어요")).toBeVisible();
    await expect(page.getByRole("button", { name: "알림 받기" })).toHaveCount(0);

    const response = await page.request.post("/api/push-subscriptions", {
      data: {
        endpoint: `https://fcm.googleapis.com/fcm/send/e2e-demo-${Date.now()}`,
        keys: { p256dh: "e2e-p256dh", auth: "e2e-auth" },
      },
    });
    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "FORBIDDEN", fields: { account: "demo-readonly" } },
    });
  });
});

test.describe("발표 시연은 둘러보기만(D-35)", () => {
  test("시연 집주인이 공지를 올리면 둘러보기 안내가 보이고 공지는 생기지 않는다", async ({
    page,
  }) => {
    const before = (await (
      await page.request.get(`/api/buildings/${SUNNY.id}/notices`)
    ).json()) as {
      notices: unknown[];
    };
    await chooseDemoRole(page, /^집주인/);
    await expect(page).toHaveURL(new RegExp(`/manage/${SUNNY.id}`));
    await page.goto(`/manage/${SUNNY.id}/notices/new`);
    await expect(page.getByRole("heading", { level: 1, name: "공지 올리기" })).toBeVisible();
    await page.getByRole("textbox", { name: "제목" }).fill("시연에서 눌러 본 공지");
    await page.getByRole("textbox", { name: "내용" }).fill("둘러보기만 되는지 봅니다");
    await page.getByRole("button", { name: "공지 올리기" }).click();

    await expect(page.getByText("시연에서는 둘러보기만 할 수 있어요")).toBeVisible();
    const after = (await (await page.request.get(`/api/buildings/${SUNNY.id}/notices`)).json()) as {
      notices: unknown[];
    };
    expect(after.notices).toHaveLength(before.notices.length);
  });

  test("입주자 A가 안내에 메모를 남기면 둘러보기 안내가 보이고 메모는 생기지 않는다", async ({
    page,
  }) => {
    const [guide] = (await (await page.request.get(`/api/buildings/${SUNNY.id}/guides`)).json())
      .guides as { id: string; status: string }[];
    await chooseDemoRole(page, /^입주자 A/);
    await expect(page).toHaveURL(new RegExp(`/b/${SUNNY.id}`));
    const memosBefore = (await (
      await page.request.get(`/api/guides/${guide?.id}/correction-memos`)
    ).json()) as { memos: unknown[] };
    await page.goto(`/b/${SUNNY.id}/guides/${guide?.id}`);
    await page.getByRole("button", { name: "메모 남기기" }).click();
    const write = page
      .getByRole("dialog")
      .filter({ has: page.getByRole("heading", { name: "어떤 부분이 달라졌나요?" }) });
    await write.getByRole("textbox", { name: "달라진 내용" }).fill("시연에서 눌러 본 메모");
    await write.getByRole("button", { name: "메모 남기기" }).click();

    await expect(page.getByText("시연에서는 둘러보기만 할 수 있어요")).toBeVisible();
    const memosAfter = (await (
      await page.request.get(`/api/guides/${guide?.id}/correction-memos`)
    ).json()) as { memos: unknown[] };
    expect(memosAfter.memos).toHaveLength(memosBefore.memos.length);
  });

  test("로그인 전에도 발표 시연 건물에는 제보를 보낼 수 없다(서버)", async ({ page }) => {
    const response = await page.request.post(`/api/buildings/${SUNNY.id}/reports`, {
      data: { source: "custom", kind: "other", body: "시연 건물 제보" },
    });
    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "FORBIDDEN", fields: { account: "demo-readonly" } },
    });
  });
});

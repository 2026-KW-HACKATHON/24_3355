import type { BrowserContext, Page } from "@playwright/test";
import { expect } from "./test";

/** 제목(heading)으로 찾는 바텀 시트·대화상자. */
export function sheet(page: Page, title: string | RegExp) {
  return page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: title }) });
}

/**
 * 로그인 전 동의 시트(D-28, 모든 로그인 입구): 로그인 버튼을 누른 뒤 뜨는 시트에서 필수 두 항목에 동의하고
 * 누른 로그인을 이어 갑니다. 16(연결 2/2)은 화면 안의 동의 항목이라 이 시트가 뜨지 않습니다.
 */
export async function agreeBeforeLogin(page: Page) {
  const consent = sheet(page, "로그인 전에 확인해 주세요");
  await expect(consent).toBeVisible();
  await expect(consent.getByRole("button", { name: "동의하고 계속하기" })).toBeDisabled();
  await consent.getByRole("checkbox", { name: "모두 동의해요" }).check();
  await consent.getByRole("button", { name: "동의하고 계속하기" }).click();
}

/**
 * 연결 화면(LF-04)에서 가입코드(02, 1/2) → 로그인과 동의(16, 2/2) → 연결 확인까지. 로그인은 연결 화면의
 * ‘시연용 다음 입주자로 계속하기’(입주자 B)로 합니다. 누르기 전 화면으로 돌아가는 것은 부르는 쪽이 봅니다.
 */
export async function connectWithCode(page: Page, code: string, buildingName: string) {
  await expect(
    page.getByRole("heading", { level: 1, name: "이 건물에 살고 있나요?" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "가입코드 6자리" }).fill(code);
  await page.getByRole("button", { name: "다음" }).click();

  await expect(page.getByRole("heading", { level: 1, name: /로그인이 필요해요/ })).toBeVisible();
  await expect(page.getByText(`가입코드 ${code} 확인`)).toBeVisible();
  await page.getByRole("checkbox", { name: "모두 동의해요" }).check();
  await page.getByRole("button", { name: "시연용 다음 입주자로 계속하기" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: new RegExp(`${buildingName}에\\s*연결할까요\\?`) }),
  ).toBeVisible();
  await page.getByRole("button", { name: `${buildingName}에 연결하기` }).click();
}

/**
 * 헤드리스 Chrome은 실제 푸시 서비스에 구독할 수 없어서 브라우저 알림 권한과 PushManager만 흉내 냅니다.
 * 권한은 처음 ‘default’이고 requestPermission을 부르면 ‘granted’가 됩니다(부른 횟수는
 * `window.__permissionAsks`). 구독은 FCM 모양의 가짜 주소이고 새로고침해도 이 브라우저에 남습니다.
 * 서버 저장(`POST /api/push-subscriptions`)은 그대로 보내므로, 켠 테스트는 끝날 때 꺼야 합니다
 * (남으면 공지를 올릴 때 서버가 이 가짜 주소로 발송을 시도함).
 */
export async function fakePushSupport(context: BrowserContext) {
  await context.addInitScript(() => {
    const PERMISSION = "e2e.notificationPermission";
    const ENDPOINT = "e2e.pushEndpoint";
    const win = window as unknown as { __permissionAsks?: number };
    if (typeof Notification === "undefined" || typeof PushManager === "undefined") return;
    Object.defineProperty(Notification, "permission", {
      configurable: true,
      get: () => localStorage.getItem(PERMISSION) ?? "default",
    });
    Notification.requestPermission = async () => {
      win.__permissionAsks = (win.__permissionAsks ?? 0) + 1;
      localStorage.setItem(PERMISSION, "granted");
      return "granted";
    };
    const subscription = (endpoint: string) => ({
      endpoint,
      expirationTime: null,
      options: { applicationServerKey: null, userVisibleOnly: true },
      toJSON: () => ({
        endpoint,
        expirationTime: null,
        keys: {
          p256dh:
            "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
          auth: "tBHItJI5svbpez7KI4CCXg",
        },
      }),
      unsubscribe: async () => {
        localStorage.removeItem(ENDPOINT);
        return true;
      },
    });
    PushManager.prototype.subscribe = async function subscribe() {
      const endpoint = `https://fcm.googleapis.com/fcm/send/e2e-${Date.now().toString(36)}`;
      localStorage.setItem(ENDPOINT, endpoint);
      return subscription(endpoint) as unknown as PushSubscription;
    };
    PushManager.prototype.getSubscription = async function getSubscription() {
      const endpoint = localStorage.getItem(ENDPOINT);
      return endpoint ? (subscription(endpoint) as unknown as PushSubscription) : null;
    };
  });
}

export async function permissionAsks(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __permissionAsks?: number }).__permissionAsks ?? 0,
  );
}

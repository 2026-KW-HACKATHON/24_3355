import { PushSubscriptionBody } from "@wolgyeham/contracts";
import { sendJsonEmpty } from "../../lib/api";
import { AppError } from "../../lib/errors";

// 웹 푸시 구독(frontend.md §8). 권한 요청은 사용자가 ‘알림 받기’를 누른 뒤에만 합니다.
// service worker(`public/sw.js`)는 알림 표시와 누르면 공지 열기만 합니다.
const SW_URL = "/sw.js";

/**
 * 서버가 저장을 확인한 구독(endpoint·계정). 브라우저 구독이 있어도 서버 저장이 확인되지 않았으면
 * ‘켜짐’으로 보이지 않습니다(저장 실패·다른 계정으로 로그인). `manager`는 집주인 새 메모·제보 알림까지
 * 켠 것을 서버가 확인했는지입니다(서버 구독 행은 하나이고 `manager_alerts`로 나눕니다).
 */
const SAVED_KEY = "wh.pushSaved";

/** 알림을 받는 쪽. 거주자는 새 공지, 집주인은 새 수정 메모·제보입니다. */
export type PushAudience = "resident" | "manager";

type SavedPush = { endpoint: string; userId: string; manager: boolean };

export function loadSavedPush(): SavedPush | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "null");
    if (typeof value !== "object" || value === null) return undefined;
    const { endpoint, userId, manager } = value as Record<string, unknown>;
    return typeof endpoint === "string" && typeof userId === "string"
      ? { endpoint, userId, manager: manager === true }
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 저장을 기록합니다. `manager`를 주지 않으면(공지 알림 저장) 같은 구독·계정의 기록에 있던 값을 둡니다.
 * 서버도 같은 계정이 다시 저장하면 메모·제보 알림을 그대로 둡니다.
 */
function markSaved(endpoint: string, userId: string, manager?: boolean) {
  const before = loadSavedPush();
  const same = before?.endpoint === endpoint && before.userId === userId;
  const value = { endpoint, userId, manager: manager ?? (same && before.manager) };
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(value));
  } catch {
    // 저장소가 막히면 다음에 열 때 다시 저장해 확인합니다.
  }
}

/** 확인 기록을 지웁니다. `manager`면 공지 알림 기록은 두고 메모·제보 알림 표시만 지웁니다. */
export function clearSavedPush(audience: PushAudience = "resident") {
  try {
    const before = audience === "manager" ? loadSavedPush() : undefined;
    if (before) localStorage.setItem(SAVED_KEY, JSON.stringify({ ...before, manager: false }));
    else localStorage.removeItem(SAVED_KEY);
  } catch {
    // 무시
  }
}

/**
 * 이 브라우저 구독이 지금 계정으로 서버에 저장된 것인지. `audience`가 manager면 메모·제보 알림까지 켠 것인지.
 */
export function isConfirmedSubscription(
  endpoint: string | undefined,
  userId: string | undefined,
  saved: SavedPush | undefined = loadSavedPush(),
  audience: PushAudience = "resident",
): boolean {
  return (
    endpoint !== undefined &&
    userId !== undefined &&
    saved?.endpoint === endpoint &&
    saved.userId === userId &&
    (audience === "resident" || saved.manager)
  );
}

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function supportsPush(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** 앱을 열 때 한 번 등록합니다. 홈 화면 앱에서 알림을 받으려면 등록돼 있어야 합니다. */
export function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register(SW_URL).catch(() => {
      // 등록하지 못해도 화면은 그대로 씁니다. 알림 켜기에서 다시 시도합니다.
    });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register(SW_URL);
  return navigator.serviceWorker.ready;
}

/** 이 브라우저의 구독. 없거나 확인할 수 없으면 null. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!supportsPush()) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_URL);
    return (await registration?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

function sameServerKey(subscription: PushSubscription, publicKey: string): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return true;
  const expected = base64UrlToBytes(publicKey);
  const actual = new Uint8Array(current);
  return actual.length === expected.length && actual.every((byte, i) => byte === expected[i]);
}

/**
 * 서버에 저장하고, 저장을 확인한 뒤에만 ‘켜짐’으로 기록합니다. 저장하지 못하면 브라우저 구독을 끊고
 * 오류를 그대로 던집니다. 남겨 두면 화면은 ‘켜짐’처럼 보이는데 알림은 오지 않거나, 이전 계정으로
 * 저장된 구독이 계속 알림을 받습니다.
 */
async function saveOrUnsubscribe(
  subscription: PushSubscription,
  userId: string,
  audience: PushAudience = "resident",
) {
  // 집주인 알림 저장이 실패해도 공지 알림만 켜 둔 구독이면 끊지 않습니다(거주자이기도 한 집주인).
  const saved = loadSavedPush();
  const keep =
    audience === "manager" &&
    isConfirmedSubscription(subscription.endpoint, userId, saved) &&
    saved?.manager === false;
  try {
    const parsed = PushSubscriptionBody.safeParse(subscription.toJSON());
    if (!parsed.success) throw new AppError("INTERNAL_ERROR");
    await sendJsonEmpty(
      "post",
      audience === "manager" ? "/api/manage/push-subscriptions" : "/api/push-subscriptions",
      parsed.data,
    );
    // 서버 구독 행은 하나라서, 집주인 알림을 켜도 거주자 공지 알림 기준으로는 저장된 구독입니다.
    markSaved(subscription.endpoint, userId, audience === "manager" ? true : undefined);
  } catch (error) {
    if (keep) {
      clearSavedPush("manager");
      throw error;
    }
    clearSavedPush();
    await subscription.unsubscribe().catch(() => false);
    throw error;
  }
}

export type EnableResult = "enabled" | "denied" | "dismissed";

/**
 * 알림 받기. 버튼을 누른 이벤트 안에서 바로 권한을 물어야 해서(iOS) 첫 줄이 권한 요청입니다.
 * `onPermission`은 권한 창이 닫힌 뒤(구독·저장 전에) 부릅니다. 서버 저장이 실패하면 브라우저 구독을
 * 끊고 AppError를 던집니다. 다시 누르면 처음부터 다시 합니다.
 */
export async function enablePush(
  publicKey: string,
  userId: string,
  onPermission?: () => void,
  audience: PushAudience = "resident",
): Promise<EnableResult> {
  const permission = await Notification.requestPermission();
  onPermission?.();
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "dismissed";
  const registration = await readyRegistration();
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !sameServerKey(subscription, publicKey)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToBytes(publicKey),
  });
  await saveOrUnsubscribe(subscription, userId, audience);
  return "enabled";
}

/**
 * 이미 있는 브라우저 구독을 지금 계정으로 다시 저장합니다(같은 endpoint는 서버가 덮어씀).
 * 구독이 없으면 false. 저장이 실패하면 구독을 끊고 AppError를 던집니다.
 */
export async function resaveSubscription(userId: string): Promise<boolean> {
  const subscription = await currentSubscription();
  if (!subscription) return false;
  await saveOrUnsubscribe(subscription, userId);
  return true;
}

/**
 * 이 휴대폰에서 알림 끄기: 서버 구독을 지우고, 서버 요청이 실패해도 브라우저 구독은 끊습니다.
 * 브라우저 구독이 끊기면 이 휴대폰에는 더 오지 않으므로 끈 것으로 봅니다(서버에 남은 행은 발송 때
 * 푸시 서비스가 404·410을 돌려주면 지워짐, D-14). 브라우저 구독을 끊지 못했을 때만 오류를 던집니다.
 */
export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  clearSavedPush();
  if (!subscription) return;
  let serverError: unknown;
  try {
    await sendJsonEmpty("delete", "/api/push-subscriptions", { endpoint: subscription.endpoint });
  } catch (error) {
    serverError = error;
  }
  const unsubscribed = await subscription.unsubscribe().catch(() => false);
  if (!unsubscribed) throw serverError ?? new AppError("INTERNAL_ERROR");
}

/**
 * 이 휴대폰에서 집주인 메모·제보 알림만 끕니다. 서버는 거주자로 연결된 계정이면 공지 알림 구독을 남기고, 아니면
 * 지웁니다. `keepBrowser`(지금 거주자로 연결됨)가 아니면 브라우저 구독도 끊습니다. 실패 처리는 disablePush와 같습니다.
 */
export async function disableManagerPush(keepBrowser: boolean): Promise<void> {
  const subscription = await currentSubscription();
  clearSavedPush(keepBrowser ? "manager" : "resident");
  if (!subscription) return;
  let serverError: unknown;
  try {
    await sendJsonEmpty("delete", "/api/manage/push-subscriptions", {
      endpoint: subscription.endpoint,
    });
  } catch (error) {
    serverError = error;
  }
  if (keepBrowser) {
    if (serverError) throw serverError;
    return;
  }
  const unsubscribed = await subscription.unsubscribe().catch(() => false);
  if (!unsubscribed) throw serverError ?? new AppError("INTERNAL_ERROR");
}

/**
 * 서버가 이미 구독을 지웠을 때(다른 건물로 옮김, D-18) 이 브라우저 구독도 끊습니다. 남겨 두면
 * 내 정보에서 시트를 열 때 조용히 다시 저장돼 알림 선택을 다시 묻지 않게 됩니다.
 */
export async function forgetSubscription(): Promise<void> {
  clearSavedPush();
  const subscription = await currentSubscription();
  await subscription?.unsubscribe().catch(() => false);
}

/**
 * 로그아웃 요청에 함께 보낼 이 브라우저의 구독 주소(contracts `LogoutBody.pushEndpoint`). 브라우저 구독을 읽을 수
 * 없으면 서버 저장을 확인해 둔 주소(`wh.pushSaved`)를 씁니다. 둘 다 없으면 undefined.
 */
export async function subscriptionEndpoint(): Promise<string | undefined> {
  const subscription = await currentSubscription();
  return subscription?.endpoint ?? loadSavedPush()?.endpoint;
}

// 알림 환경(screens.md §6). 연결은 알림과 상관없이 끝난 상태이고, 여기서는 이 브라우저가
// 새 공지 알림을 켤 수 있는지만 판정합니다. 판정은 순수 함수로 두고 브라우저 값 읽기는 따로 둡니다.

export type InAppBrowser = "kakao" | "other";

export type PushEnv =
  /** 카카오톡 등 앱 안 브라우저. 저장소·알림이 Safari·Chrome과 이어지지 않습니다. */
  | { kind: "in-app"; app: InAppBrowser }
  /** iPhone·iPad에서 홈 화면에 추가하기 전(17). `safari`면 공유 버튼이 아래에 있습니다. */
  | { kind: "ios-install"; safari: boolean }
  /** 브라우저가 웹 푸시를 모르거나(browser), 서버가 보낼 준비가 안 됨(server, 공개키 null). */
  | { kind: "unsupported"; reason: "browser" | "server" }
  /** 사용자가 알림을 막음. 브라우저 설정에서만 풀 수 있습니다. */
  | { kind: "blocked"; ios: boolean }
  /** 이 브라우저에 구독이 있고 권한도 허용됨. */
  | { kind: "enabled" }
  /** ‘알림 받기’를 누르면 권한을 물어볼 수 있음. */
  | { kind: "available" };

export type PushEnvInput = {
  userAgent: string;
  maxTouchPoints: number;
  /** 홈 화면 아이콘으로 열었는지(display-mode: standalone 또는 navigator.standalone). */
  standalone: boolean;
  hasNotification: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  permission: NotificationPermission | undefined;
  /** 서버 VAPID 공개키. null이면 보낼 수 없는 환경, undefined면 아직 모름. */
  serverKey: string | null | undefined;
  subscribed: boolean;
};

const KAKAO = /KAKAOTALK/i;
// 페이스북·인스타그램·라인·네이버·다음·에브리타임 앱 안 브라우저와 안드로이드 WebView(`; wv)`).
const OTHER_IN_APP = /FBAN|FBAV|Instagram|Line\/|NAVER\(inapp|DaumApps|everytimeApp|; wv\)/i;

export function detectInApp(userAgent: string): InAppBrowser | undefined {
  if (KAKAO.test(userAgent)) return "kakao";
  if (OTHER_IN_APP.test(userAgent)) return "other";
  return undefined;
}

/** iPadOS는 데스크톱 Safari처럼 보이므로 터치 지점 수로 가립니다. */
export function isIos(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/** iOS의 다른 브라우저(Chrome·Firefox·Edge 등)는 UA에 자기 이름을 붙입니다. */
function isIosSafari(userAgent: string): boolean {
  return !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(userAgent);
}

export function detectPushEnv(input: PushEnvInput): PushEnv {
  const inApp = detectInApp(input.userAgent);
  if (inApp) return { kind: "in-app", app: inApp };
  const ios = isIos(input.userAgent, input.maxTouchPoints);
  if (ios && !input.standalone) {
    return { kind: "ios-install", safari: isIosSafari(input.userAgent) };
  }
  if (!input.hasNotification || !input.hasServiceWorker || !input.hasPushManager) {
    return { kind: "unsupported", reason: "browser" };
  }
  if (input.serverKey === null) return { kind: "unsupported", reason: "server" };
  if (input.permission === "denied") return { kind: "blocked", ios };
  if (input.permission === "granted" && input.subscribed) return { kind: "enabled" };
  return { kind: "available" };
}

/** 홈 화면 아이콘으로 연 앱인지. 스플래시(00)와 iPhone 알림 판정에 씁니다. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

/** 지금 브라우저에서 판정에 필요한 값을 읽습니다. 구독 여부와 서버 키는 호출하는 쪽이 채웁니다. */
export function readPushEnvInput(
  extra: Pick<PushEnvInput, "serverKey" | "subscribed">,
): PushEnvInput {
  const hasNotification = typeof window !== "undefined" && "Notification" in window;
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone: isStandalone(),
    hasNotification,
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: typeof window !== "undefined" && "PushManager" in window,
    permission: hasNotification ? Notification.permission : undefined,
    ...extra,
  };
}

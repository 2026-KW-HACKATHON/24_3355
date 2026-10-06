// 월계함 service worker. 새 공지 알림을 보여주고, 누르면 그 공지를 엽니다(frontend.md §8).
// 화면·API를 캐시하지 않습니다(오프라인 동작 없음). 알림 내용은 contracts NoticePushPayload입니다.

/** 열려 있는 앱에 이동을 부탁하는 메시지. 앱(app/RootLayout.tsx)이 라우터로 옮기고 답합니다. */
const NAVIGATE_MESSAGE = "wh:navigate";
/** 앱이 이 시간 안에 답하지 않으면(예전 화면·불러오는 중) 창 주소를 직접 바꿉니다. */
const NAVIGATE_ACK_MS = 1500;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** 같은 출처의 경로만 엽니다. 다른 사이트 주소(`//x`, `/\x`, 탭·줄바꿈이 섞인 주소 등)는 첫 화면으로 바꿉니다. */
function safePath(value) {
  if (typeof value !== "string") return "/";
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin ? url.pathname + url.search + url.hash : "/";
  } catch {
    return "/";
  }
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const isNotice = payload && payload.type === "notice";
  const title = isNotice ? "새 공지" : "월계함";
  const body = isNotice && typeof payload.title === "string" ? payload.title : "새 소식이 있어요";
  const url = safePath(isNotice ? payload.url : "/");
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      // Android 상태 표시줄 아이콘은 모양(알파)만 씁니다. 투명 바탕의 흰 우표 모양입니다.
      badge: "/icons/badge-72.png",
      lang: "ko",
      tag:
        isNotice && typeof payload.noticeId === "string" ? `notice-${payload.noticeId}` : undefined,
      data: { url },
    }),
  );
});

/** 열린 앱에 경로를 보내고 답을 기다립니다. 앱이 옮겼다고 답하면 true. */
function askToNavigate(client, path) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), NAVIGATE_ACK_MS);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data === "ok");
    };
    try {
      client.postMessage({ type: NAVIGATE_MESSAGE, path }, [channel.port2]);
    } catch {
      clearTimeout(timer);
      resolve(false);
    }
  });
}

/**
 * 이미 열린 창이 있으면 앞으로 가져오고 앱 안에서 이동합니다(쓰던 입력은 앱의 나가기 확인을 거칩니다).
 * 앱이 답하지 않으면 창 주소를 바꾸고, 그것도 안 되면 새 창으로 엽니다.
 */
async function openPath(path) {
  const target = new URL(path, self.location.origin).href;
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const client = clients.find(
    (item) => new URL(item.url).origin === self.location.origin && "focus" in item,
  );
  if (!client) return self.clients.openWindow(target);
  try {
    const focused = (await client.focus()) ?? client;
    if (await askToNavigate(focused, path)) return focused;
    // 이 service worker가 맡지 않은 창이면 navigate가 실패하므로 새 창으로 엽니다.
    return await focused.navigate(target);
  } catch {
    return self.clients.openWindow(target);
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(openPath(safePath(event.notification.data?.url)));
});

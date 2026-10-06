import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { MessageChannel } from "node:worker_threads";
import { afterEach, describe, expect, it, vi } from "vitest";

// public/sw.js는 번들 없이 그대로 배포하는 파일이라, 원본을 service worker와 비슷한 전역에서 실행해 봅니다.
const SOURCE = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://wolgyeham.example";

type Handler = (event: unknown) => void;
type FakeClient = {
  url: string;
  focus: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
  postMessage: ReturnType<typeof vi.fn>;
};

function loadWorker(clients: FakeClient[] = []) {
  const handlers: Record<string, Handler> = {};
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, handler: Handler) => {
      handlers[type] = handler;
    },
    skipWaiting: vi.fn(),
    registration: { showNotification: vi.fn(async () => undefined) },
    clients: {
      claim: vi.fn(),
      matchAll: vi.fn(async () => clients),
      openWindow: vi.fn(async () => null),
    },
  };
  const context: Record<string, unknown> = {
    self,
    URL,
    MessageChannel,
    setTimeout,
    clearTimeout,
  };
  runInNewContext(SOURCE, context);
  return { self, handlers, safePath: context["safePath"] as (value: unknown) => string };
}

/** 알림을 누른 이벤트를 보내고 service worker가 끝날 때까지 기다립니다. */
async function click(handlers: Record<string, Handler>, url: unknown) {
  let done: Promise<unknown> = Promise.resolve();
  handlers["notificationclick"]?.({
    notification: { close: vi.fn(), data: { url } },
    waitUntil: (promise: Promise<unknown>) => {
      done = promise;
    },
  });
  await done;
}

function client(answer: "ok" | null): FakeClient {
  const item: FakeClient = {
    url: `${ORIGIN}/me`,
    focus: vi.fn(async () => item),
    navigate: vi.fn(async () => item),
    postMessage: vi.fn((_message: unknown, ports: MessagePort[]) => {
      const port = ports[0];
      if (answer) port?.postMessage(answer);
      else port?.close();
    }),
  };
  return item;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("service worker path check (safePath)", () => {
  const { safePath } = loadWorker();

  it("keeps a path on this site", () => {
    expect(safePath("/b/5a3e/notices/9?x=1#top")).toBe("/b/5a3e/notices/9?x=1#top");
    expect(safePath(`${ORIGIN}/b/5a3e`)).toBe("/b/5a3e");
  });

  it.each([
    "//evil.example/x",
    "/\\evil.example/x",
    "/\t/evil.example",
    "\t//evil.example",
    "https://evil.example/b/1",
    "javascript:alert(1)",
  ])("sends %j to the first screen", (value) => {
    expect(safePath(value)).toBe("/");
  });

  it("sends anything that is not text to the first screen", () => {
    expect(safePath(undefined)).toBe("/");
    expect(safePath(42)).toBe("/");
  });
});

describe("service worker push", () => {
  it("shows the notice with the monochrome badge and a checked path", async () => {
    // Given
    const { self, handlers } = loadWorker();
    let done: Promise<unknown> = Promise.resolve();
    // When
    handlers["push"]?.({
      data: {
        json: () => ({
          type: "notice",
          noticeId: "n-1",
          title: "오전 단수 안내",
          url: "/\\evil.example",
        }),
      },
      waitUntil: (promise: Promise<unknown>) => {
        done = promise;
      },
    });
    await done;
    // Then
    expect(self.registration.showNotification).toHaveBeenCalledWith(
      "새 공지",
      expect.objectContaining({
        body: "오전 단수 안내",
        badge: "/icons/badge-72.png",
        tag: "notice-n-1",
        data: { url: "/" },
      }),
    );
  });
});

describe("service worker notification click", () => {
  it("asks the open app to move inside the app instead of reloading the page", async () => {
    // Given
    const open = client("ok");
    const { self, handlers } = loadWorker([open]);
    // When
    await click(handlers, "/b/5a3e/notices/9");
    // Then
    expect(open.focus).toHaveBeenCalled();
    expect(open.postMessage).toHaveBeenCalledWith(
      { type: "wh:navigate", path: "/b/5a3e/notices/9" },
      // 배열은 service worker 쪽(다른 realm)에서 만들어 Array 비교 대신 존재만 봅니다.
      expect.anything(),
    );
    expect(open.navigate).not.toHaveBeenCalled();
    expect(self.clients.openWindow).not.toHaveBeenCalled();
  });

  it("changes the window address when the app does not answer", async () => {
    // Given
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const open = client(null);
    const { handlers } = loadWorker([open]);
    // When
    const done = click(handlers, "/b/5a3e/notices/9");
    await vi.advanceTimersByTimeAsync(1_500);
    await done;
    // Then
    expect(open.navigate).toHaveBeenCalledWith(`${ORIGIN}/b/5a3e/notices/9`);
  });

  it("opens a new window when no app window is open", async () => {
    // Given
    const { self, handlers } = loadWorker([]);
    // When
    await click(handlers, "//evil.example");
    // Then
    expect(self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/`);
  });
});

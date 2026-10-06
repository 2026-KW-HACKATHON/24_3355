import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import {
  hasNotifyParam,
  initialNotifySheet,
  kakaoOpenExternalUrl,
  notifyLinkUrl,
  useNotifySheetState,
} from "./notifyLink";

function Probe() {
  const [open] = useNotifySheetState();
  return <span>{open ? "open" : "closed"}</span>;
}

describe("opening the notification choice from outside KakaoTalk", () => {
  it("opens my info with the notification sheet in the external browser", () => {
    // Given
    const origin = "https://wolgyeham.example";
    // When
    const url = kakaoOpenExternalUrl(notifyLinkUrl(origin));
    // Then
    expect(url).toBe(
      "kakaotalk://web/openExternal?url=https%3A%2F%2Fwolgyeham.example%2Fme%3Fnotify%3D1",
    );
  });

  it("opens the sheet by itself only when the address asks for it", () => {
    expect(initialNotifySheet("?notify=1")).toBe("auto");
    expect(initialNotifySheet("")).toBe("closed");
    expect(hasNotifyParam("?login=cancelled&notify=1")).toBe(true);
    expect(hasNotifyParam("?notify=0")).toBe(false);
  });

  it("waits for its turn among sheets that open by themselves before showing", () => {
    // When: 첫 그리기(차례를 받기 전)
    const withParam = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/me?notify=1"]}>
        <Probe />
      </MemoryRouter>,
    );
    // Then: 다른 자동 시트(약관 등)와 겹치지 않게 차례가 온 뒤에 열립니다(components/autoSheet).
    expect(withParam).toContain("closed");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BuildingScene,
  readSceneMotion,
  rememberSceneMotion,
  resetSceneVisitForTest,
  sceneMotion,
} from "./BuildingScene";

// 브라우저 환경 대역: 동작 줄이기(matchMedia)와 크게 보기(<html data-size>)만 흉내 냅니다.
function browser({ reduce = false, large = false } = {}) {
  vi.stubGlobal("window", {
    matchMedia: (query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)" && reduce,
    }),
  });
  vi.stubGlobal("document", {
    documentElement: { dataset: large ? { size: "large" } : {} },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetSceneVisitForTest();
});

describe("building scene motion (interaction.md §7)", () => {
  it("appears once only when nothing asks for a still picture", () => {
    expect(sceneMotion({ reduceMotion: false, large: false, shown: false })).toBe("appear");
  });

  it("stays still with reduced motion, large mode, or after it has already appeared", () => {
    expect(sceneMotion({ reduceMotion: true, large: false, shown: false })).toBe("still");
    expect(sceneMotion({ reduceMotion: false, large: true, shown: false })).toBe("still");
    expect(sceneMotion({ reduceMotion: false, large: false, shown: true })).toBe("still");
  });
});

describe("building scene markup", () => {
  it("rises out of the ground behind a clip only when it appears", () => {
    // Given
    browser();
    // When
    const html = renderToStaticMarkup(<BuildingScene />);
    // Then
    expect(html).toContain('data-motion="appear"');
    expect(html).toContain("<clipPath");
    expect(html).toMatch(/clip-path="url\(#[^"]+\)"/);
  });

  it.each([
    ["reduced motion", { reduce: true }],
    ["large mode", { large: true }],
  ])("draws the same picture without motion or clip in %s", (_, env) => {
    // Given
    browser(env);
    // When
    const html = renderToStaticMarkup(<BuildingScene />);
    // Then
    expect(html).toContain('data-motion="still"');
    expect(html).not.toContain("<clipPath");
    // 창은 정적 그림에도 모두 있습니다(3층 × 왼쪽 4 + 오른쪽 4)
    expect(html.match(/wh-scene__window/g)).toHaveLength(24);
  });

  it("is a still picture outside the browser", () => {
    // When (window 없음)
    const html = renderToStaticMarkup(<BuildingScene />);
    // Then
    expect(html).toContain('data-motion="still"');
  });

  it("is decorative and never takes focus", () => {
    const html = renderToStaticMarkup(<BuildingScene />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('focusable="false"');
  });

  it("uses the lofi 03 framing on the resident home", () => {
    expect(renderToStaticMarkup(<BuildingScene />)).toContain('y="56%"');
    expect(renderToStaticMarkup(<BuildingScene variant="home" />)).toMatch(
      /y="55%".*scale\(0\.9\)/,
    );
  });
});

describe("building scene once per visit", () => {
  it("rises on the first picture of the visit and stays still on the next one", () => {
    // Given: 이번 방문에 아직 나타나지 않음
    browser();
    // When: 첫 그림
    const first = renderToStaticMarkup(<BuildingScene />);
    // 화면에 붙은 뒤 컴포넌트가 effect에서 부르는 것과 같습니다(서버 렌더는 effect를 돌리지 않음).
    rememberSceneMotion("appear");
    const second = renderToStaticMarkup(<BuildingScene variant="home" />);
    // Then
    expect(first).toContain('data-motion="appear"');
    expect(second).toContain('data-motion="still"');
    expect(second).not.toContain("<clipPath");
  });

  it("keeps the decision in the given visit state", () => {
    // Given
    browser();
    const visit = { shown: false };
    // When / Then
    expect(readSceneMotion(visit)).toBe("appear");
    rememberSceneMotion("still", visit);
    expect(readSceneMotion(visit)).toBe("appear");
    rememberSceneMotion("appear", visit);
    expect(readSceneMotion(visit)).toBe("still");
  });

  it("starts over after the test reset", () => {
    browser();
    rememberSceneMotion("appear");
    expect(readSceneMotion()).toBe("still");
    resetSceneVisitForTest();
    expect(readSceneMotion()).toBe("appear");
  });
});

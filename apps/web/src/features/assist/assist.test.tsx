import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../../lib/errors";
import { memoryStorage } from "../../test/memoryStorage";
import {
  htmlLang,
  parseLang,
  resetContentLangForTest,
  setContentLang,
  speechLang,
} from "./contentLang";
import { LanguageBar } from "./LanguageBar";
import {
  INITIAL_SPLIT,
  type SplitState,
  splitErrorMessage,
  splitReducer,
  toCreateBody,
  validateCard,
} from "./splitDrafts";
import { displayContent } from "./translated";

const RESULT = {
  drafts: [
    { category: "recycling" as const, title: "분리수거", body: "주차장 안쪽에 내놓아 주세요" },
    { category: "parcel" as const, title: "택배", body: "1층 선반에 두면 돼요" },
  ],
  maskedCount: 2,
  unplacedCount: 1,
};

describe("guide split state (D-37)", () => {
  it("moves from paste to review with editable cards and back with the text kept", () => {
    // Given
    let state: SplitState = splitReducer(INITIAL_SPLIT, { type: "text", text: "카톡 원문" });
    // When
    state = splitReducer(state, { type: "result", result: RESULT });
    // Then
    expect(state.step).toBe("review");
    expect(state.cards.map((card) => card.title)).toEqual(["분리수거", "택배"]);
    expect(new Set(state.cards.map((card) => card.key)).size).toBe(2);
    expect(state).toMatchObject({ maskedCount: 2, unplacedCount: 1 });

    // When: 고치고, 빼고, 돌아가기
    const [first, second] = state.cards;
    state = splitReducer(state, {
      type: "edit",
      key: first?.key ?? "",
      patch: { category: "common", title: "공용 분리수거" },
    });
    state = splitReducer(state, { type: "remove", key: second?.key ?? "" });
    // Then
    expect(state.cards).toEqual([
      {
        key: first?.key,
        category: "common",
        title: "공용 분리수거",
        body: "주차장 안쪽에 내놓아 주세요",
      },
    ]);
    const back = splitReducer(state, { type: "back" });
    expect(back).toMatchObject({ step: "paste", text: "카톡 원문", cards: [], unplacedCount: 0 });
  });

  it("drops saved cards so a retry after a partial failure does not create them twice", () => {
    // Given
    const state = splitReducer(INITIAL_SPLIT, { type: "result", result: RESULT });
    // When
    const next = splitReducer(state, { type: "saved", key: state.cards[0]?.key ?? "" });
    // Then
    expect(next.cards.map((card) => card.title)).toEqual(["택배"]);
  });

  it("validates each card and builds a draft body without photos", () => {
    // Then
    expect(validateCard({ key: "a", category: "parcel", title: " ", body: "" })).toEqual({
      title: "제목을 적어 주세요",
      body: "내용을 적어 주세요",
    });
    expect(
      validateCard({ key: "a", category: "parcel", title: "가".repeat(81), body: "본문" }).title,
    ).toBe("제목은 80자까지 쓸 수 있어요");
    expect(toCreateBody({ key: "a", category: "parcel", title: " 택배 ", body: " 선반 " })).toEqual(
      { category: "parcel", title: "택배", body: "선반", photos: [] },
    );
  });

  it("explains split failures without blaming the landlord", () => {
    // Then
    expect(splitErrorMessage(new AppError("UPSTREAM_FAILED", { status: 502 }))).toContain(
      "직접 나눠 써 주세요",
    );
    expect(splitErrorMessage(new AppError("RATE_LIMITED", { status: 429 }))).toContain("20번");
    expect(
      splitErrorMessage(
        new AppError("FORBIDDEN", { status: 403, fields: { account: "demo-readonly" } }),
      ),
    ).toBe("시연에서는 둘러보기만 할 수 있어요");
  });
});

describe("content language (D-37)", () => {
  const original = { title: "분리수거", body: "주차장 안쪽" };
  const translated = { lang: "en" as const, title: "Recycling", body: "Inside the parking lot" };

  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: memoryStorage(),
      configurable: true,
    });
    resetContentLangForTest();
  });
  afterEach(() => {
    resetContentLangForTest();
  });

  it("shows the original until a translation for the chosen language arrives", () => {
    // Then
    expect(displayContent(original, null, { data: translated, isError: false })).toMatchObject({
      ...original,
      status: "original",
      lang: null,
    });
    expect(displayContent(original, "en", { isError: false })).toMatchObject({
      ...original,
      status: "loading",
      lang: null,
    });
    expect(displayContent(original, "en", { isError: true })).toMatchObject({ status: "error" });
    expect(displayContent(original, "vi", { data: translated, isError: false }).status).toBe(
      "loading",
    );
    expect(displayContent(original, "en", { data: translated, isError: false })).toEqual({
      title: "Recycling",
      body: "Inside the parking lot",
      lang: "en",
      status: "translated",
    });
  });

  it("maps languages to speech and html codes and remembers the choice on this device", () => {
    // Then
    expect(speechLang(null)).toBe("ko-KR");
    expect(speechLang("vi")).toBe("vi-VN");
    expect(htmlLang("zh-CN")).toBe("zh-CN");
    expect(parseLang("ja")).toBeNull();
    // When
    setContentLang("zh-CN");
    resetContentLangForTest();
    // Then
    expect(localStorage.getItem("wh.lang")).toBe("zh-CN");
    setContentLang(null);
    expect(localStorage.getItem("wh.lang")).toBeNull();
  });

  it("renders nothing when translation is off and labels machine translation when on", () => {
    // Given
    const base = {
      chosen: null,
      setLang: () => undefined,
      retry: () => undefined,
      retrying: false,
    };
    // When
    const off = renderToStaticMarkup(
      <LanguageBar content={{ ...base, enabled: false, status: "original" }} />,
    );
    const on = renderToStaticMarkup(
      <LanguageBar content={{ ...base, enabled: true, chosen: "en", status: "translated" }} />,
    );
    const failed = renderToStaticMarkup(
      <LanguageBar content={{ ...base, enabled: true, chosen: "en", status: "error" }} />,
    );
    // Then
    expect(off).toBe("");
    expect(on).toContain("English");
    expect(on).toContain("中文(简体)");
    expect(on).toContain("Tiếng Việt");
    expect(on).toContain("기계 번역");
    expect(on).toContain("원문 보기");
    expect(failed).toContain("원문을 보여 드려요");
    expect(failed).toContain("다시 시도");
  });
});

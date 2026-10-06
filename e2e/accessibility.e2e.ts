// 공통 조건: 28 크게 보기(같은 서비스를 크게, 행동을 빼지 않음), 동작 줄이기(interaction.md)
import type { Locator, Page } from "@playwright/test";
import { loginAs, publishedGuides, SUNNY } from "./support/demo";
import { action, expect, guideLink, test } from "./support/test";

const home = `/b/${SUNNY.id}`;

/**
 * 공개 화면의 행동 묶음. 기본 화면에 있는 묶음은 크게 보기에도 있어야 합니다(screens.md 화면 규칙).
 * ‘관리하기’·‘내가 보낸 내용’은 아직 없는 화면이 있어 기본 화면에 있을 때만 확인합니다.
 */
const ACTION_GROUPS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: "한 장씩 보기", pattern: /처음 오셨나요|한 장씩 보기/ },
  { name: "연결하기", pattern: /연결하기/ },
  { name: "집주인에게 알리기", pattern: /집주인에게 알리기|보내기|직접 적기/ },
  { name: "공유", pattern: /공유/ },
  { name: "내가 보낸 내용", pattern: /보낸 내용/ },
  { name: "관리하기", pattern: /관리하기/ },
];

async function actionNames(page: Page): Promise<string[]> {
  const controls = page.locator("button, a[href]");
  const names: string[] = [];
  for (const control of await controls.all()) {
    if (!(await control.isVisible())) continue;
    const label = await control.getAttribute("aria-label");
    names.push(`${label ?? ""} ${(await control.innerText()).replace(/\s+/g, " ")}`.trim());
  }
  return names;
}

test.describe("크게 보기(lofi 28)", () => {
  test("‘크게 보기’를 누르면 켜짐 상태가 되고 목록형 배치로 바뀐다", async ({ page }) => {
    await page.goto(home);
    const toggle = page.getByRole("button", { name: "크게 보기" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await toggle.click();

    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(toggle).toHaveText(/크게 보기 켜짐/);
    await expect(page.locator("html")).toHaveAttribute("data-size", "large");
    await expect(page.getByRole("link", { name: "한 장씩 보기" })).toBeVisible();
  });

  test("크게 보기에서도 기본 화면의 행동(안내·한 장씩·연결·알리기·공유)이 모두 남는다", async ({
    page,
  }) => {
    const guides = await publishedGuides(page, SUNNY.id);
    await expectLargeKeepsActions(page);
    for (const guide of guides) {
      await expect(guideLink(page, guide.title)).toBeVisible();
    }
  });

  test("집주인이 보는 크게 보기에서도 ‘관리하기’가 남는다", async ({ page }) => {
    await loginAs(page, "demo-landlord");
    const { before } = await expectLargeKeepsActions(page);
    expect(
      before.some((name) => /관리하기/.test(name)),
      "기본 화면에 관리하기가 있어야 해요",
    ).toBe(true);
  });

  test("크게 보기는 새로고침해도 이 브라우저에 남는다", async ({ page }) => {
    await page.goto(home);
    await page.getByRole("button", { name: "크게 보기" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-size", "large");

    await page.reload();

    await expect(page.locator("html")).toHaveAttribute("data-size", "large");
    await expect(page.getByRole("button", { name: "크게 보기" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("크게 보기의 글자는 기본보다 크다", async ({ page }) => {
    await page.goto(home);
    const heading = page.getByRole("heading", { level: 1, name: SUNNY.name });
    const normal = await fontSize(heading);

    await page.getByRole("button", { name: "크게 보기" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-size", "large");

    expect(await fontSize(heading)).toBeGreaterThan(normal);
  });

  test("크게 보기의 안내 행·알리기 버튼은 누를 자리가 44px 이상이다", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("wh.size", "large"));
    await page.goto(home);
    await expect(page.locator("html")).toHaveAttribute("data-size", "large");

    const rows = page.getByRole("region", { name: "건물 안내" }).getByRole("listitem");
    await expect(rows.first()).toBeVisible();
    const targets = [
      ...(await rows.getByRole("link").all()),
      action(page, /새 공지 알림 받기/),
      action(page, "집주인에게 알리기"),
      page.getByRole("button", { name: "크게 보기" }),
    ];
    for (const target of targets) await expectTouchTarget(target, 44);
  });
});

test.describe("동작 줄이기(prefers-reduced-motion)", () => {
  test("동작 줄이기를 켜면 화면 요소에 애니메이션·전환이 남지 않는다", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(home);
    await expect(page.getByRole("heading", { level: 1, name: SUNNY.name })).toBeVisible();

    const moving = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("#root *")]
        .filter((element) => {
          const style = getComputedStyle(element);
          const animated = style.animationName !== "none";
          const transitioned = style.transitionDuration
            .split(",")
            .some((value) => Number.parseFloat(value) > 0);
          return animated || transitioned;
        })
        .map((element) => element.className.toString())
        .slice(0, 10),
    );
    expect(moving).toEqual([]);
  });

  test("동작 줄이기에서 ‘다음 안내’는 부드럽게 미끄러지지 않고 바로 넘어간다", async ({ page }) => {
    const guides = await publishedGuides(page, SUNNY.id);
    expect(guides.length, "안내가 두 장 이상이어야 넘길 수 있어요").toBeGreaterThan(1);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${home}/first`);
    const track = page.getByRole("region", { name: "이 건물 안내" });
    await expect(track).toBeVisible();

    await page.getByRole("button", { name: "다음 안내" }).last().click();

    // 부드러운 스크롤이면 누른 직후에는 아직 중간 위치입니다.
    const position = await track.evaluate((element) => ({
      left: element.scrollLeft,
      width: element.clientWidth,
    }));
    expect(Math.abs(position.left - position.width)).toBeLessThanOrEqual(1);
  });
});

/** 기본 화면의 행동 묶음을 모은 뒤 크게 보기를 켜고, 같은 묶음이 모두 남았는지 봅니다. */
async function expectLargeKeepsActions(page: Page) {
  await page.goto(home);
  await expect(page.getByRole("heading", { level: 1, name: SUNNY.name })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const before = await actionNames(page);

  await page.getByRole("button", { name: "크게 보기" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-size", "large");
  const after = await actionNames(page);

  for (const group of ACTION_GROUPS) {
    if (!before.some((name) => group.pattern.test(name))) continue;
    expect(
      after.some((name) => group.pattern.test(name)),
      `크게 보기에서 ‘${group.name}’이(가) 사라졌어요. 기본: ${before.join(" | ")}`,
    ).toBe(true);
  }
  return { before, after };
}

async function fontSize(locator: Locator) {
  return locator.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
}

async function expectTouchTarget(locator: Locator, min: number) {
  const box = await locator.boundingBox();
  const name = (await locator.getAttribute("aria-label")) ?? (await locator.innerText());
  expect(box, `${name}: 화면에 보여야 해요`).not.toBeNull();
  expect(box?.height ?? 0, `${name.trim()}: 높이 ${box?.height}px`).toBeGreaterThanOrEqual(min);
  expect(box?.width ?? 0, `${name.trim()}: 너비 ${box?.width}px`).toBeGreaterThanOrEqual(min);
}

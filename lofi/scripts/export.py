"""screens/*.html → out/screens/*.png (390×844 @3x = 1170×2532), out/board.png, out/flows/*.png.

사용: python3 lofi/scripts/export.py [파일명 일부 ...]
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SCREENS = sorted((ROOT / "screens").glob("*.html"))
OUT = ROOT / "out"
SHOTS = OUT / "screens"
SHOTS.mkdir(parents=True, exist_ok=True)

# 화면 파일이 없어진 PNG는 지운다
for png in SHOTS.glob("*.png"):
    if not (ROOT / "screens" / f"{png.stem}.html").exists():
        png.unlink()

filters = sys.argv[1:]
targets = [p for p in SCREENS if not filters or any(f in p.name for f in filters)]

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome")
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3)
    page = ctx.new_page()
    for p in targets:
        page.goto(p.as_uri())
        page.wait_for_function("document.documentElement.dataset.ready === '1'")
        page.evaluate("document.fonts.ready")
        page.wait_for_timeout(1500 if page.locator("iframe.bg").count() else 250)
        page.locator(".phone").first.screenshot(path=str(SHOTS / f"{p.stem}.png"))
        print("ok", p.stem)

    if not filters or "board" in filters:
        bctx = browser.new_context(viewport={"width": 1800, "height": 1000}, device_scale_factor=1.25)
        bp = bctx.new_page()
        bp.goto((ROOT / "board.html").as_uri())
        bp.wait_for_timeout(1500)
        bp.screenshot(path=str(OUT / "board.png"), full_page=True)
        print("ok board")
        # 흐름마다 한 장, 함이 배치표 한 장
        flows = OUT / "flows"
        flows.mkdir(exist_ok=True)
        for f in flows.glob("*.png"):
            f.unlink()
        for sec in bp.locator("section.chapter").all():
            sid = sec.get_attribute("id")
            title = sec.locator("h2").inner_text().split("\n")[0]
            sec.screenshot(path=str(flows / f"{sid}.png"))
            print("ok", sid, title[:30])
        bp.locator("#hami-assets").screenshot(path=str(flows / "hami-assets.png"))
        print("ok hami-assets")
    browser.close()

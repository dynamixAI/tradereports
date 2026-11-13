"""Makes every logo file in this folder from one drawing of the arrow.

Needs Python with: pip install fonttools brotli playwright && playwright install chromium
Run from the repo root after `npm ci` (it reads the Space Grotesk font from node_modules):
    python3 brand/build.py
"""
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

HERE = Path(__file__).parent
FONTS = HERE.parent / 'node_modules/@fontsource/space-grotesk/files'

# the arrow, drawn in a 100 x 100 box
MARK = 'M16 0H100V88H72V29H16Z M0 78L18 59H42V81L23 100H0Z'

# brand colours
COPPER = '#e2784a'  # on dark backgrounds
COPPER_DEEP = '#c2531f'  # on light backgrounds (easier to read)
INK = '#0c0c0d'  # near-black
PAPER = '#f3efe9'  # warm off-white
LIGHT_BG = '#f3f2ee'  # light-mode page colour


class Font:
    """Turns words into SVG shapes, so the files look right without the font installed."""

    def __init__(self, weight):
        self.f = TTFont(FONTS / f'space-grotesk-latin-{weight}-normal.woff2')
        self.gs = self.f.getGlyphSet()
        self.cmap = self.f.getBestCmap()
        self.upm = self.f['head'].unitsPerEm
        self.cap = self.f['OS/2'].sCapHeight

    def width(self, text, size, track=0.0):
        s = size / self.upm
        return sum(self.gs[self.cmap[ord(c)]].width * s + track * size for c in text) - track * size

    def path(self, text, size, x, baseline, track=0.0):
        s = size / self.upm
        out = []
        for c in text:
            g = self.gs[self.cmap[ord(c)]]
            pen = SVGPathPen(self.gs)
            g.draw(TransformPen(pen, (s, 0, 0, -s, x, baseline)))
            out.append(pen.getCommands())
            x += g.width * s + track * size
        return ' '.join(p for p in out if p)


BOLD, MEDIUM = Font(700), Font(500)


def svg(w, h, body, bg=None):
    rect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ''
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" '
        f'width="{w:.0f}" height="{h:.0f}">{rect}{body}</svg>\n'
    )


def mark_at(x, y, size, colour):
    return f'<path transform="translate({x:.2f} {y:.2f}) scale({size / 100:.4f})" fill="{colour}" d="{MARK}"/>'


def mark(colour):
    return svg(100, 100, mark_at(0, 0, 100, colour))


def tile(bg, fg, rounded=True):
    r = 22 if rounded else 0
    return svg(100, 100, f'<rect width="100" height="100" rx="{r}" fill="{bg}"/>' + mark_at(21, 21, 58, fg))


def lockup(trade, reports, slogan=None, bg=None):
    # name 100 units tall; the arrow is a little taller than the capitals and sits on the same line
    size, track, pad = 100, -0.01, 24
    cap = BOLD.cap * size / BOLD.upm
    m = cap * 1.25
    gap = size * 0.4
    baseline = pad + m - (m - cap) / 2
    x = pad + m + gap
    w1 = BOLD.width('Trade', size, track)
    body = mark_at(pad, pad, m, reports)
    body += f'<path fill="{trade}" d="{BOLD.path("Trade", size, x, baseline, track)}"/>'
    body += f'<path fill="{reports}" d="{BOLD.path("Reports", size, x + w1 + track * size, baseline, track)}"/>'
    w = x + BOLD.width('TradeReports', size, track) + pad
    h = pad + m + pad
    if slogan:
        s_size = size * 0.36
        s_base = h + s_size * 0.6
        body += f'<path fill="{trade}" d="{MEDIUM.path(slogan, s_size, x, s_base)}"/>'
        w = max(w, x + MEDIUM.width(slogan, s_size) + pad)
        h = s_base + pad + s_size * 0.25
    return svg(w, h, body, bg)


SLOGAN = 'Focus on your trade, not spreadsheets.'

FILES = {
    # the arrow on its own, no background
    'mark/mark-copper.svg': mark(COPPER),
    'mark/mark-copper-deep.svg': mark(COPPER_DEEP),
    'mark/mark-black.svg': mark(INK),
    'mark/mark-white.svg': mark(PAPER),
    # the arrow on a square (favicons, app icons, profile pictures)
    'icon/icon-dark.svg': tile(INK, COPPER),
    'icon/icon-dark-square.svg': tile(INK, COPPER, rounded=False),
    'icon/icon-copper.svg': tile(COPPER, INK),
    'icon/icon-copper-square.svg': tile(COPPER, INK, rounded=False),
    'icon/icon-light.svg': tile(LIGHT_BG, COPPER_DEEP),
    'icon/icon-light-square.svg': tile(LIGHT_BG, COPPER_DEEP, rounded=False),
    # arrow and name side by side
    'logo/logo-for-dark-backgrounds.svg': lockup(PAPER, COPPER),
    'logo/logo-for-light-backgrounds.svg': lockup(INK, COPPER_DEEP),
    'logo/logo-white.svg': lockup(PAPER, PAPER),
    'logo/logo-black.svg': lockup(INK, INK),
    'logo/logo-on-dark.svg': lockup(PAPER, COPPER, bg=INK),
    'logo/logo-on-light.svg': lockup(INK, COPPER_DEEP, bg=LIGHT_BG),
    # with the slogan underneath (posters, banners, video end cards; not for small sizes)
    'logo-slogan/logo-slogan-for-dark-backgrounds.svg': lockup(PAPER, COPPER, SLOGAN),
    'logo-slogan/logo-slogan-for-light-backgrounds.svg': lockup(INK, COPPER_DEEP, SLOGAN),
    'logo-slogan/logo-slogan-on-dark.svg': lockup(PAPER, COPPER, SLOGAN, bg=INK),
    'logo-slogan/logo-slogan-on-light.svg': lockup(INK, COPPER_DEEP, SLOGAN, bg=LIGHT_BG),
}

# square files get these pixel sizes; wide logos get these widths
SQUARE = [16, 32, 48, 64, 128, 180, 192, 256, 512, 1024]
WIDE = [400, 800, 1600, 3200]


def main():
    from playwright.sync_api import sync_playwright

    for name, text in FILES.items():
        f = HERE / 'svg' / name
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(text)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        for name in FILES:
            src = HERE / 'svg' / name
            folder, stem = name.split('/')[0], Path(name).stem
            square = folder in ('mark', 'icon')
            for n in SQUARE if square else WIDE:
                page.goto(src.resolve().as_uri())
                w, h = page.evaluate('[document.documentElement.viewBox.baseVal.width, document.documentElement.viewBox.baseVal.height]')
                height = n if square else round(n * h / w)
                page.set_viewport_size({'width': n, 'height': height})
                page.evaluate(f"(() => {{ const s = document.documentElement; s.setAttribute('width', {n}); s.setAttribute('height', {height}); }})()")
                out = HERE / 'png' / folder / f'{stem}-{n}.png'
                out.parent.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=str(out), omit_background=True)
        browser.close()
    print(f'{len(FILES)} SVGs and their PNGs written to {HERE}')


if __name__ == '__main__':
    main()

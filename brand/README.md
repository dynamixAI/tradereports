# TradeReports brand files

Every version of the logo, ready to use. **SVG** files scale to any size (print, design tools, the
web). **PNG** files are pictures at fixed sizes (social media, documents, email signatures).

## Which file to use

| You need                                    | Use                                           |
| ------------------------------------------- | --------------------------------------------- |
| Logo on a dark background                   | `logo/logo-for-dark-backgrounds`              |
| Logo on a white or light background         | `logo/logo-for-light-backgrounds`             |
| Logo on a photo or a colour we don't use    | `logo/logo-white` or `logo/logo-black`        |
| Logo with its own background (a solid box)  | `logo/logo-on-dark` or `logo/logo-on-light`   |
| Profile picture (LinkedIn, TikTok, YouTube) | `icon/icon-dark-square` at 512 or 1024        |
| App or browser icon                         | `icon/icon-dark` (rounded)                    |
| Banners, posters, video end cards           | `logo-slogan/…` (never below 400 pixels wide) |
| Just the arrow (stickers, watermarks)       | `mark/…`                                      |

Folders: `svg/` holds the masters, `png/` holds the same files at set sizes. Square files come at
16, 32, 48, 64, 128, 180, 192, 256, 512 and 1024 pixels; wide logos at 400, 800, 1600 and 3200
pixels wide. PNGs without a background are see-through.

## Colours

| Name        | Hex       | Use                                          |
| ----------- | --------- | -------------------------------------------- |
| Copper      | `#e2784a` | The arrow and "Reports" on dark backgrounds  |
| Deep copper | `#c2531f` | The arrow and "Reports" on light backgrounds |
| Ink         | `#0c0c0d` | Dark backgrounds, "Trade" on light ones      |
| Paper       | `#f3efe9` | "Trade" on dark backgrounds                  |
| Light page  | `#f3f2ee` | Light backgrounds                            |

## Font

Space Grotesk (free, from Google Fonts): Bold for the name, Medium for the slogan. The SVGs have the
lettering already turned into shapes, so they look right without the font installed.

## Slogan

> Focus on your trade, not spreadsheets.

Only use it with the logo where it can be read easily: banners, posters and end cards. Leave it off
small logos, icons and the website header.

## Rules

- Keep "TradeReports" as one word with a capital R.
- Don't stretch, rotate, outline or add shadows to the logo.
- Leave clear space around it at least as wide as the arrow.
- Don't put copper on copper, or the dark logo on a dark photo. Use the white version instead.

## Changing the logo

Every file is made from one drawing of the arrow in `build.py`. Change it there, then run (after
`npm ci`, which provides the font):

```
pip install fonttools brotli playwright && playwright install chromium
python3 brand/build.py
```

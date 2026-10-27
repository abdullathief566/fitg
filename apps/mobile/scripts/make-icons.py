"""Draws FitG's app icon, Android adaptive layers and splash mark (store-assets.md).

The mark: one cream stroke, a check whose long arm flattens into a right-pointing arrow ("done -> next").
Run with Pillow installed:  python3 apps/mobile/scripts/make-icons.py
Colours mirror constants/theme.ts (light accent.primary, text.inverse); keep them in sync by hand.
"""
from pathlib import Path

from PIL import Image, ImageDraw

CORAL = (244, 104, 58, 255)
CREAM = (246, 240, 232, 255)
OUT = Path(__file__).resolve().parent.parent / "assets" / "images"
SS = 4  # supersampling factor


def mark(draw: ImageDraw.ImageDraw, size: int, box: float, color) -> None:
    """Draw the check-arrow inside a centred square that is `box` of the canvas."""
    pad = size * (1 - box) / 2
    s = size * box

    def p(x: float, y: float) -> tuple[float, float]:
        return (pad + x * s, pad + y * s)

    w = round(s * 0.105)
    stroke = [p(0.12, 0.52), p(0.34, 0.74), p(0.62, 0.46), p(0.88, 0.46)]
    draw.line(stroke, fill=color, width=w, joint="curve")
    head = [p(0.72, 0.30), p(0.88, 0.46), p(0.72, 0.62)]
    draw.line(head, fill=color, width=w, joint="curve")
    r = w / 2
    for x, y in (stroke[0], head[0], head[2], stroke[-1]):
        draw.ellipse((x - r, y - r, x + r, y + r), fill=color)


def render(size: int, bg, box: float, color, rounded: float = 0.0) -> Image.Image:
    big = size * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if bg is not None:
        if rounded:
            d.rounded_rectangle((0, 0, big - 1, big - 1), radius=round(big * rounded), fill=bg)
        else:
            d.rectangle((0, 0, big, big), fill=bg)
    mark(d, big, box, color)
    return img.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    render(1024, CORAL, 0.62, CREAM).convert("RGB").save(OUT / "icon.png")  # iOS masks the corners itself
    render(1024, None, 0.42, CREAM).save(OUT / "android-icon-foreground.png")  # inside the 66% safe zone
    render(1024, CORAL, 1.0, CORAL).save(OUT / "android-icon-background.png")
    render(1024, None, 0.42, (255, 255, 255, 255)).save(OUT / "android-icon-monochrome.png")
    render(512, CORAL, 0.62, CREAM, rounded=0.225).save(OUT / "splash-icon.png")
    render(48, CORAL, 0.62, CREAM, rounded=0.225).save(OUT / "favicon.png")


if __name__ == "__main__":
    main()

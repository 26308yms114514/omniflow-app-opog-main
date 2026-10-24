"""Replace Capacitor's placeholder launcher icons with the app's own artwork."""
from pathlib import Path

from PIL import Image, ImageDraw

RES = Path(r"C:\qzqxwz\omniflow-app-opog-main\frontend\android\app\src\main\res")
PUBLIC = Path(r"C:\qzqxwz\omniflow-app-opog-main\frontend\public")

source = Image.open(PUBLIC / "icon-512.png").convert("RGBA")
foreground = Image.open(PUBLIC / "icon-maskable-512.png").convert("RGBA")

# Legacy square + round launcher icons.
DENSITIES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}
# Adaptive foregrounds are 108dp at every density.
FOREGROUND = {
    "mdpi": 108,
    "hdpi": 162,
    "xhdpi": 216,
    "xxhdpi": 324,
    "xxxhdpi": 432,
}


def rounded(image: Image.Image, size: int) -> Image.Image:
    """Circular crop with an antialiased edge, for ic_launcher_round."""
    scaled = image.resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(scaled, (0, 0), mask)
    return out


for density, size in DENSITIES.items():
    folder = RES / f"mipmap-{density}"
    folder.mkdir(parents=True, exist_ok=True)
    source.resize((size, size), Image.LANCZOS).save(folder / "ic_launcher.png")
    rounded(source, size).save(folder / "ic_launcher_round.png")
    print(f"  {density}: launcher {size}px")

for density, size in FOREGROUND.items():
    folder = RES / f"mipmap-{density}"
    foreground.resize((size, size), Image.LANCZOS).save(folder / "ic_launcher_foreground.png")
    print(f"  {density}: foreground {size}px")

# The adaptive background layer sits under the foreground; use the brand colour
# rather than white so the icon does not glow on dark home screens.
colors = RES / "values" / "ic_launcher_background.xml"
colors.write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    "<resources>\n"
    '    <color name="ic_launcher_background">#0B0B0D</color>\n'
    "</resources>\n",
    encoding="utf-8",
)
print("  background colour set to #0B0B0D")

# Splash screens still show Capacitor's logo; use the app icon there too.
splash_files = sorted(RES.glob("drawable*/splash.png"))
for splash in splash_files:
    box = source.getbbox()
    logo = source.crop(box) if box else source
    logo.resize((512, 512), Image.LANCZOS).save(splash)
print(f"  {len(splash_files)} splash image(s) replaced")

print("done")

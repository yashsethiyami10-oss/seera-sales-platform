"""Builds the Company -> Super Stockist price list (HTML + PDF).

Edition 2026/02, effective 01 October 2026 (Founder instruction, 23 Oct 2026):
  - Seera / Yuva / Shine Plus / Aatmanirbhar / Bartan Tub: every rate below is the Net Landing per
    Box/Bag INCLUSIVE of GST 18% (HSN 3402); Basic Rate and GST are back-calculated from it.
      * Detergent cakes: Rs 298.00/Box (unchanged); scheme = 3 pcs Rs 10 detergent powder free/Box.
      * Seera Detergent Powder: Rs 1,350/Bag.
      * Shine Plus: Rs 42/kg x pack kg x pcs per Bag.
      * Bartan Tub 300 g / 500 g: Rs 576 (36 pcs) / Rs 528 (24 pcs) per Box.
      * Aatmanirbhar 120 g: Rs 310/Bag of 50 (MRP Rs 10/pc); Aatmanirbhar 3 kg: Rs 117/pc, 10 pcs/Bag.
  - MUV: S.S. price per piece from MUV Care Co. Revised Professional Rate List
    (ref MUV/RL/2026-03).

Usage: python3 docs/seera/price-lists/build_ss_price_list.py
"""

import base64
import io
import subprocess
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[3]
OUT_DIR = Path(__file__).resolve().parent
HTML_OUT = OUT_DIR / "Seera_Super_Stockist_Price_List_2026.html"
PDF_OUT = OUT_DIR / "Seera_Super_Stockist_Price_List_2026.pdf"
CHROME = "/opt/pw-browsers/chromium"

EFFECTIVE = "01 October 2026"
ISSUED = "23 October 2026"
REF = "SEERA/SS-PL/2026/02"
GST = 0.18

CAKE_SCHEME = "3 pcs ₹10 Powder / Box"
SHINE_PER_KG = 42

# category, code, product, brand, pack, case config, billing unit, net landing (incl. GST), per-unit divisor, per-unit label, scheme
SEERA = [
    ("Detergent Cakes", "SEERA-CAKE-BLUE", "Seera Blue Detergent Cake", "Seera", "180 g", "40 pcs / Box", "Box", 298.00, 40, "per pc", CAKE_SCHEME),
    ("Detergent Cakes", "SEERA-CAKE-WHITE", "Seera White Detergent Cake", "Seera", "150 g", "40 pcs / Box", "Box", 298.00, 40, "per pc", CAKE_SCHEME),
    ("Detergent Cakes", "SEERA-YUVA-CAKE-BLUE", "Yuva Blue Detergent Cake", "Yuva", "170 g", "40 pcs / Box", "Box", 298.00, 40, "per pc", CAKE_SCHEME),
    ("Detergent Powders", "SEERA-POWDER-1KG", "Seera Detergent Powder", "Seera", "1 kg", "25 × 1 kg / Bag", "Bag", 1350.00, 25, "per kg", "1 pc / Bag"),
    ("Detergent Powders", "SEERA-SHINEPLUS-POWDER-1KG", "Shine Plus Detergent Powder", "Shine Plus", "1 kg", "25 × 1 kg / Bag", "Bag", SHINE_PER_KG * 1 * 25, 25, "per kg", "1 pc / Bag"),
    ("Detergent Powders", "SEERA-SHINEPLUS-POWDER-3KG", "Shine Plus Detergent Powder", "Shine Plus", "3 kg", "10 × 3 kg / Bag", "Bag", SHINE_PER_KG * 3 * 10, 10, "per pc", "1 pc / Bag"),
    ("Detergent Powders", "SEERA-SHINEPLUS-POWDER-5KG", "Shine Plus Detergent Powder", "Shine Plus", "5 kg", "6 × 5 kg / Bag", "Bag", SHINE_PER_KG * 5 * 6, 6, "per pc", "1 pc / Bag"),
    ("Detergent Powders", "", "Aatmanirbhar Detergent Powder", "Aatmanirbhar", "120 g<span class='per'>MRP ₹10 / pc</span>", "50 pcs / Bag", "Bag", 310.00, 50, "per pc", ""),
    ("Detergent Powders", "", "Aatmanirbhar Detergent Powder", "Aatmanirbhar", "3 kg", "10 pcs / Bag", "Bag", 117.00 * 10, 10, "per pc", ""),
    ("Dishwash", "SEERA-BARTAN-300G", "Seera Bartan Tub", "Seera", "300 g", "36 pcs / Box", "Box", 576.00, 36, "per pc", ""),
    ("Dishwash", "SEERA-BARTAN-500G", "Seera Bartan Tub", "Seera", "500 g", "24 pcs / Box", "Box", 528.00, 24, "per pc", ""),
]

# category, code, product, pack, MRP, S.S. price — per piece (distributor/retail columns kept as source data, not printed)
MUV = [
    ("Fabric Care", "MUV-LD-IR-1000", "Indian Rose Liquid Detergent", "1 L", 155, 110.44, 118.17, 126.44),
    ("Fabric Care", "MUV-LD-IR-5000", "Indian Rose Liquid Detergent", "5 L", 699, 498.04, 532.90, 570.20),
    ("Fabric Care", "MUV-LD-CW-1000", "Cool Water Liquid Detergent", "1 L", 155, 110.44, 118.17, 126.44),
    ("Fabric Care", "MUV-LD-CW-5000", "Cool Water Liquid Detergent", "5 L", 699, 498.04, 532.90, 570.20),
    ("Fabric Care", "MUV-LD-LG-1000", "Lavender Garden Liquid Detergent", "1 L", 155, 110.44, 118.17, 126.44),
    ("Fabric Care", "MUV-LD-LG-5000", "Lavender Garden Liquid Detergent", "5 L", 699, 498.04, 532.90, 570.20),
    ("Home Care", "MUV-TC-STD-500", "Toilet Cleaner", "500 ml", 80, 57.00, 60.99, 65.26),
    ("Home Care", "MUV-TC-STD-5000", "Toilet Cleaner", "5 L", 400, 285.00, 304.95, 326.30),
    ("Home Care", "MUV-DG-STD-500", "Dishwash Gel", "500 ml", 85, 60.56, 64.80, 69.34),
    ("Home Care", "MUV-DG-STD-1000", "Dishwash Gel", "1 L", 155, 110.44, 118.17, 126.44),
    ("Home Care", "MUV-DG-STD-5000", "Dishwash Gel", "5 L", 699, 498.04, 532.90, 570.20),
    ("Home Care", "MUV-BC-STD-500", "Bathroom Cleaner", "500 ml", 65, 46.31, 49.55, 53.02),
    ("Home Care", "MUV-GC-STD-500", "Glass Cleaner", "500 ml", 90, 63.00, 67.41, 72.13),
    ("Home Care", "MUV-FC-VM-1000", "Velvet Mist Floor Cleaner", "1 L", 150, 106.88, 114.36, 122.37),
    ("Home Care", "MUV-FC-CWK-1000", "Cloud Walk Floor Cleaner", "1 L", 150, 106.88, 114.36, 122.37),
    ("Home Care", "MUV-FC-VM-5000", "Velvet Mist Floor Cleaner", "5 L", 549, 391.16, 418.54, 447.84),
    ("Home Care", "MUV-FC-CWK-5000", "Cloud Walk Floor Cleaner", "5 L", 549, 391.16, 418.54, 447.84),
    ("Home Care", "MUV-WP-STD-1000", "Phenyl", "1 L", 60, 42.00, 44.94, 48.09),
    ("Home Care", "MUV-WP-STD-5000", "Phenyl", "5 L", 270, 195.00, 208.65, 223.26),
    ("Home Care", "MUV-BP-STD-1000", "Black Phenyl", "1 L", 80, 46.00, 49.22, 52.67),
    ("Home Care", "MUV-BL-STD-500", "Bleach", "500 ml", 50, 36.00, 38.52, 41.22),
    ("Car Care", "MUV-CW-STD-500", "Car Wash", "500 ml", 70, 49.88, 53.37, 57.11),
    ("Car Care", "MUV-CW-STD-5000", "Car Wash", "5 L", 550, 391.88, 419.31, 448.66),
    ("Hand Care", "MUV-HW-LS-250", "Lifeshield Hand Wash", "250 ml", 80, 57.00, 60.99, 65.26),
    ("Hand Care", "MUV-HW-LS-500", "Lifeshield Hand Wash", "500 ml", 95, 67.69, 72.43, 77.50),
    ("Hand Care", "MUV-HW-SB-500", "Silk Blossom Hand Wash", "500 ml", 95, 67.69, 72.43, 77.50),
    ("Hand Care", "MUV-HW-OF-500", "Ocean Fresh Hand Wash", "500 ml", 95, 67.69, 72.43, 77.50),
    ("Hand Care", "MUV-HW-OF-5000", "Ocean Fresh Hand Wash", "5 L", 725, 516.56, 552.72, 591.41),
    ("Hand Care", "MUV-HW-CB-250", "Citrus Blast Hand Wash", "250 ml", 80, 57.00, 60.99, 65.26),
    ("Hand Care", "MUV-HW-CB-500", "Citrus Blast Hand Wash", "500 ml", 95, 67.69, 72.43, 77.50),
    ("Hand Care", "MUV-HW-CB-5000", "Citrus Blast Hand Wash", "5 L", 725, 516.56, 552.72, 591.41),
    ("Body Care", "MUV-BW-CV-250", "Crimson Veil Body Wash", "250 ml", 110, 73.15, 78.27, 83.75),
    ("Body Care", "MUV-BW-CV-950", "Crimson Veil Body Wash", "950 ml", 360, 239.40, 256.16, 274.09),
    ("Body Care", "MUV-BW-VO-250", "Velvet Oak Body Wash", "250 ml", 110, 73.15, 78.27, 83.75),
    ("Body Care", "MUV-BW-VO-950", "Velvet Oak Body Wash", "950 ml", 360, 239.40, 256.16, 274.09),
    ("Body Care", "MUV-BW-MF-250", "Midnight Frost Body Wash", "250 ml", 110, 73.15, 78.27, 83.75),
    ("Body Care", "MUV-BW-MF-950", "Midnight Frost Body Wash", "950 ml", 360, 239.40, 256.16, 274.09),
]


def money(v: float) -> float:
    return round(v + 1e-9, 2)


def inr(v: float) -> str:
    whole, frac = f"{v:.2f}".split(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        whole = ",".join(groups + [tail])
    return f"{whole}.{frac}"


def white_to_alpha(im: Image.Image) -> Image.Image:
    """GIMP-style colour-to-alpha against white, so the logo sits cleanly on artwork."""
    px = im.convert("RGB").load()
    out = Image.new("RGBA", im.size)
    opx = out.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            r, g, b = px[x, y]
            a = 255 - min(r, g, b)
            if a == 0:
                opx[x, y] = (255, 255, 255, 0)
                continue
            f = 255 / a
            opx[x, y] = tuple(max(0, min(255, round(255 - (255 - c) * f))) for c in (r, g, b)) + (a,)
    return out


def image_data_uri(path: Path, max_px: int, transparent: bool = False) -> str:
    src = Image.open(path).convert("RGBA")
    im = Image.new("RGB", src.size, (255, 255, 255))
    im.paste(src, mask=src.split()[3])
    diff = ImageChops.difference(im, Image.new("RGB", im.size, (255, 255, 255)))
    im = im.crop(diff.point(lambda p: 255 if p > 18 else 0).getbbox())
    im.thumbnail((max_px, max_px))
    if transparent:
        im = white_to_alpha(im)
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

_I = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"'
ICONS = {
    "Detergent Cakes": f'<svg viewBox="0 0 24 24" {_I}><rect x="3" y="7" width="18" height="11" rx="3"/><path d="M7 11h6"/><circle cx="17" cy="4" r="1.4"/><circle cx="20" cy="2.6" r="0.8"/></svg>',
    "Detergent Powders": f'<svg viewBox="0 0 24 24" {_I}><path d="M6 4h12l1 4v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8z"/><path d="M5 8h14"/><circle cx="10" cy="14" r="1.2"/><circle cx="14" cy="16" r="0.9"/><circle cx="13.5" cy="12" r="0.7"/></svg>',
    "Dishwash": f'<svg viewBox="0 0 24 24" {_I}><path d="M4 11h16l-1.5 7.5a2 2 0 0 1-2 1.5h-9a2 2 0 0 1-2-1.5z"/><ellipse cx="12" cy="11" rx="8" ry="2"/><circle cx="9" cy="5" r="1.4"/><circle cx="13" cy="3.5" r="0.9"/><circle cx="15" cy="6.5" r="1.1"/></svg>',
    "Fabric Care": f'<svg viewBox="0 0 24 24" {_I}><path d="M8 3l-5 3 2 4 2-1v12h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0z"/></svg>',
    "Home Care": f'<svg viewBox="0 0 24 24" {_I}><path d="M9 8h5l2 3v9a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-9z"/><path d="M10 8V5h3M13 5l4-1.5M17 6.5l2 0M17 9l1.8 1"/></svg>',
    "Car Care": f'<svg viewBox="0 0 24 24" {_I}><path d="M3 15l2-5a2 2 0 0 1 2-1.4h10A2 2 0 0 1 19 10l2 5v3H3z"/><circle cx="7.5" cy="18" r="1.8"/><circle cx="16.5" cy="18" r="1.8"/><path d="M6 4.5c1 0 1 1 2 1s1-1 2-1 1 1 2 1"/></svg>',
    "Hand Care": f'<svg viewBox="0 0 24 24" {_I}><path d="M8 10h8v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1z"/><path d="M10 10V7h4v3M12 7V4h4"/><path d="M11 15c0-1 1-2 1-2s1 1 1 2a1 1 0 0 1-2 0z"/></svg>',
    "Body Care": f'<svg viewBox="0 0 24 24" {_I}><path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/><path d="M9.5 14a2.5 2.5 0 0 0 2.5 2.5"/></svg>',
}


def bubbles(n: int, w: int, h: int, seed: int, colors: list[str], rmin: float, rmax: float, xmin: float = 0) -> str:
    import random
    rnd = random.Random(seed)
    out = []
    for k in range(n):
        r = rnd.uniform(rmin, rmax)
        cx, cy = rnd.uniform(xmin, w), rnd.uniform(0, h)
        c = colors[k % len(colors)]
        out.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="url(#bub-{c})" stroke="{c}" stroke-opacity="0.35" stroke-width="0.6"/>'
                   f'<ellipse cx="{cx - r * 0.35:.1f}" cy="{cy - r * 0.4:.1f}" rx="{r * 0.28:.1f}" ry="{r * 0.16:.1f}" fill="#fff" fill-opacity="0.85" transform="rotate(-30 {cx - r * 0.35:.1f} {cy - r * 0.4:.1f})"/>')
    defs = "".join(
        f'<radialGradient id="bub-{c}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity="0.9"/>'
        f'<stop offset="0.7" stop-color="{c}" stop-opacity="0.10"/><stop offset="1" stop-color="{c}" stop-opacity="0.32"/></radialGradient>'
        for c in colors
    )
    return f'<svg viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid slice"><defs>{defs}</defs>{"".join(out)}</svg>'


WAVES = (
    '<svg viewBox="0 0 1000 220" preserveAspectRatio="none">'
    '<path d="M0 70 C150 20 300 120 500 70 S850 10 1000 60 V220 H0Z" fill="#f26b0f"/>'
    '<path d="M0 105 C180 60 320 150 520 100 S860 50 1000 95 V220 H0Z" fill="#e0533f"/>'
    '<path d="M0 140 C200 100 350 180 560 135 S870 95 1000 130 V220 H0Z" fill="#16183d"/>'
    '</svg>'
)
PAGE_WAVE = (
    '<svg viewBox="0 0 1000 120" preserveAspectRatio="none">'
    '<path d="M0 50 C160 10 320 90 520 50 S860 0 1000 40 V120 H0Z" fill="#e0533f" fill-opacity="0.05"/>'
    '<path d="M0 80 C200 45 360 115 560 78 S870 45 1000 72 V120 H0Z" fill="#2e2f8f" fill-opacity="0.045"/>'
    '</svg>'
)


def starburst(points: int = 22, r_out: float = 50, r_in: float = 43) -> str:
    import math
    pts = []
    for k in range(points * 2):
        r = r_out if k % 2 == 0 else r_in
        a = math.pi * k / points - math.pi / 2
        pts.append(f"{50 + r * math.cos(a):.1f},{50 + r * math.sin(a):.1f}")
    return f'<polygon points="{" ".join(pts)}"/>'



def seera_rows() -> str:
    rows, current = [], None
    for i, (cat, code, name, brand, pack, case, unit, net, div, per, scheme) in enumerate(SEERA, 1):
        if cat != current:
            current = cat
            count = sum(1 for r in SEERA if r[0] == cat)
            rows.append(f'<tr class="cat"><td colspan="8"><span class="ico">{ICONS[cat]}</span>{cat}<span class="cnt">{count} SKUs</span></td></tr>')
        basic = money(net / (1 + GST))
        gst = money(net - basic)
        scheme_chip = f'<span class="scheme"><b class="free">FREE</b>{scheme}</span>' if scheme else ""
        rows.append(
            f"""<tr>
  <td class="n">{i:02d}</td>
  <td class="prod"><div class="pn">{name}</div><div class="code"><span class="brand brand-{brand.split()[0].lower()}">{brand}</span>{scheme_chip}</div></td>
  <td class="c">{pack}</td>
  <td class="c">{case}</td>
  <td class="r">{inr(basic)}</td>
  <td class="r muted">{inr(gst)}</td>
  <td class="r net">{inr(net)}<span class="per">/ {unit}</span></td>
  <td class="r">{inr(money(net / div))}<span class="per">{per}</span></td>
</tr>"""
        )
    return "\n".join(rows)


def muv_rows(categories: list[str]) -> str:
    rows, current = [], None
    for i, (cat, code, name, pack, mrp, ss, *_onward) in enumerate(MUV, 1):
        if cat not in categories:
            continue
        if cat != current:
            current = cat
            count = sum(1 for r in MUV if r[0] == cat)
            rows.append(f'<tr class="cat"><td colspan="7"><span class="ico">{ICONS[cat]}</span>{cat}<span class="cnt">{count} SKUs</span></td></tr>')
        margin = (1 - ss / mrp) * 100
        rows.append(
            f"""<tr>
  <td class="n">{i:02d}</td>
  <td><div class="pn">MUV {name}</div></td>
  <td class="code-cell">{code}</td>
  <td class="c">{pack}</td>
  <td class="r muted">{inr(mrp)}</td>
  <td class="r net">{inr(ss)}</td>
  <td class="c"><span class="margin">{margin:.1f}%</span></td>
</tr>"""
        )
    return "\n".join(rows)


def muv_margin_range() -> str:
    margins = [(1 - r[5] / r[4]) * 100 for r in MUV]
    return f"{min(margins):.1f}% – {max(margins):.1f}%"


def build_html() -> str:
    logo = image_data_uri(ROOT / "public" / "seera logo.png", 600)
    tagline = image_data_uri(ROOT / "public" / "seera tagline.png", 700)
    logo_clear = image_data_uri(ROOT / "public" / "seera logo.png", 700, transparent=True)
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Seera — Super Stockist Price List 2026</title>
<style>
@page {{ size: A4; margin: 0; }}
:root {{
  --ink:#16183d; --ink-2:#3a3d63; --muted:#7a7d95; --line:#e4e2dc; --paper:#ffffff;
  --cream:#f7f4ee; --red:#e0533f; --saffron:#f26b0f; --navy:#2e2f8f; --gold:#b8955a;
}}
* {{ box-sizing:border-box; margin:0; padding:0; }}
html,body {{ background:var(--paper); }}
body {{ font-family:'Inter',sans-serif; color:var(--ink); font-size:8.6pt; line-height:1.45;
  -webkit-print-color-adjust:exact; print-color-adjust:exact; font-feature-settings:'tnum' 1,'cv11' 1; }}
.page {{ width:210mm; height:297mm; position:relative; overflow:hidden; page-break-after:always; padding:0 14mm; }}
.page:last-child {{ page-break-after:auto; }}

/* rails */
.rail {{ position:absolute; left:0; top:0; bottom:0; width:5mm;
  background:linear-gradient(180deg,var(--red) 0 62%,var(--saffron) 62% 82%,var(--navy) 82% 100%); }}

/* masthead */
.mast {{ display:flex; align-items:center; justify-content:space-between; padding:10mm 0 5mm; border-bottom:0.6pt solid var(--ink); }}
.mast .logo {{ height:21mm; }}
.mast .right {{ text-align:right; }}
.eyebrow {{ font-size:6.8pt; letter-spacing:0.28em; text-transform:uppercase; color:var(--gold); font-weight:600; }}
.title {{ font-family:'Inter Display','Inter',sans-serif; font-size:25pt; font-weight:700; letter-spacing:-0.02em; line-height:1.05; margin:2mm 0 1.6mm; }}
.title em {{ font-style:normal; color:var(--red); }}
.sub {{ color:var(--ink-2); font-size:8.4pt; }}

.meta {{ display:grid; grid-template-columns:repeat(4,1fr); border-bottom:0.6pt solid var(--line); }}
.meta div {{ padding:2.4mm 0; }}
.meta div + div {{ padding-left:4mm; border-left:0.6pt solid var(--line); }}
.meta .k {{ font-size:6.2pt; letter-spacing:0.2em; text-transform:uppercase; color:var(--muted); font-weight:600; }}
.meta .v {{ font-size:9pt; font-weight:600; margin-top:0.6mm; }}

/* section heads */
.sec {{ display:flex; align-items:flex-end; justify-content:space-between; margin:8mm 0 3mm; }}
.sec .num {{ font-family:'Inter Display',sans-serif; font-size:24pt; font-weight:200; color:var(--gold); line-height:0.9; margin-right:4mm; }}
.sec .left {{ display:flex; align-items:flex-end; }}
.sec h2 {{ font-family:'Inter Display',sans-serif; font-size:14pt; font-weight:700; letter-spacing:-0.01em; line-height:1.1; }}
.sec p {{ color:var(--muted); font-size:7.6pt; margin-top:0.6mm; }}
.sec .tag {{ font-size:6.6pt; letter-spacing:0.16em; text-transform:uppercase; font-weight:700; color:var(--paper); background:var(--ink); padding:1.4mm 2.6mm; border-radius:1mm; }}
.sec .tag.inc {{ background:var(--navy); }}

/* tables */
table {{ width:100%; border-collapse:collapse; }}
thead th {{ font-size:5.9pt; letter-spacing:0.1em; text-transform:uppercase; font-weight:700; color:var(--ink-2);
  text-align:left; padding:2.4mm 2mm; background:var(--cream); border-top:1.2pt solid var(--ink); border-bottom:0.6pt solid var(--ink); }}
thead th.r {{ text-align:right; }} thead th.c {{ text-align:center; }}
thead th .u {{ display:block; letter-spacing:0.04em; text-transform:none; font-weight:500; color:var(--muted); margin-top:0.4mm; }}
tbody td {{ padding:1.7mm 1.8mm; border-bottom:0.5pt solid var(--line); vertical-align:middle; }}
td.r {{ text-align:right; white-space:nowrap; }} td.c {{ text-align:center; white-space:nowrap; }}
td.n {{ color:var(--muted); font-size:7.2pt; width:7mm; }}
.pn {{ font-weight:600; font-size:8.6pt; }}
.code {{ font-family:'DejaVu Sans Mono',monospace; font-size:6pt; color:var(--muted); margin-top:0.9mm; letter-spacing:0.02em; white-space:nowrap; }}
.code .brand {{ font-family:'Inter',sans-serif; margin-right:1.6mm; }}
td.prod {{ width:58mm; }}
.code-cell {{ font-family:'DejaVu Sans Mono',monospace; font-size:5.8pt; color:var(--muted); white-space:nowrap; }}
.muv .pn {{ font-size:8pt; white-space:nowrap; }}
.muted {{ color:var(--muted); }}
td.net {{ font-weight:700; font-size:9.2pt; color:var(--ink); background:rgba(224,83,63,0.055); }}
.per {{ display:block; font-size:6pt; font-weight:500; color:var(--muted); letter-spacing:0.04em; }}
.brand {{ font-size:5.6pt; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; padding:0.8mm 1.8mm; border-radius:0.8mm; white-space:nowrap; }}
.brand-seera {{ color:var(--red); background:rgba(224,83,63,0.1); }}
.brand-yuva {{ color:var(--navy); background:rgba(46,47,143,0.09); }}
.brand-aatmanirbhar {{ color:#1f6b46; background:rgba(31,107,70,0.09); }}
.brand-shine {{ color:var(--saffron); background:rgba(242,107,15,0.1); }}
.scheme {{ display:inline-block; font-size:6.2pt; line-height:1.3; font-weight:600; color:#1f6b46; background:rgba(31,107,70,0.08); padding:0.8mm 1.8mm; border-radius:2mm; white-space:nowrap; margin-left:1.8mm; font-family:'Inter',sans-serif; }}
.margin {{ font-weight:700; font-size:7.6pt; color:var(--navy); }}
tr.cat td {{ background:var(--paper); font-family:'Inter Display',sans-serif; font-weight:700; font-size:7.4pt; letter-spacing:0.18em;
  text-transform:uppercase; color:var(--ink); padding:3.2mm 2mm 1.4mm; border-bottom:0.8pt solid var(--ink); }}
tr.cat td span.cnt {{ float:right; font-family:'Inter',sans-serif; letter-spacing:0.08em; font-weight:500; color:var(--muted); font-size:6.4pt; }}
.muv tbody td {{ padding-top:1.55mm; padding-bottom:1.55mm; }}
tr.cat .ico {{ display:inline-block; width:4.6mm; height:4.6mm; vertical-align:-1.3mm; margin-right:2mm; color:var(--red); }}
tr.cat .ico svg {{ width:100%; height:100%; }}
.scheme b.free {{ display:inline-block; background:var(--red); color:#fff; font-size:5.2pt; letter-spacing:0.12em; padding:0.3mm 1.2mm; border-radius:1.2mm; margin-right:1.4mm; vertical-align:0.2mm; }}
.pagewave {{ position:absolute; left:0; right:0; bottom:0; height:34mm; z-index:0; }}
.pagewave svg {{ width:100%; height:100%; display:block; }}
.page:not(.cover) > *:not(.pagewave):not(.rail):not(.watermark):not(.foot) {{ position:relative; z-index:1; }}

/* cover */
.cover {{ padding:0; background:#fff; }}
.cover .bub {{ position:absolute; inset:0 0 auto 0; height:230mm; }}
.cover .bub svg {{ width:100%; height:100%; }}
.cover .waves {{ position:absolute; left:0; right:0; bottom:0; height:78mm; }}
.cover .waves svg {{ width:100%; height:100%; display:block; }}
.cover .inner {{ position:relative; z-index:2; padding:22mm 18mm 0; }}
.cover .eyebrow {{ font-size:7.4pt; }}
.cover .clogo {{ height:52mm; margin:16mm 0 10mm -2mm; }}
.cover h1 {{ font-family:'Inter Display',sans-serif; font-size:44pt; font-weight:800; letter-spacing:-0.03em; line-height:0.98; }}
.cover h1 em {{ font-style:normal; color:var(--red); display:block; }}
.cover .lead {{ font-size:10.5pt; color:var(--ink-2); margin-top:5mm; max-width:120mm; }}
.cover .brands {{ display:flex; gap:2mm; flex-wrap:wrap; margin-top:7mm; }}
.cover .brands span {{ font-size:7pt; letter-spacing:0.16em; text-transform:uppercase; font-weight:700; border:0.8pt solid var(--ink); padding:1.6mm 3.2mm; border-radius:5mm; background:rgba(255,255,255,0.8); }}
.cover .eff {{ display:inline-flex; gap:3mm; align-items:center; margin-top:9mm; background:var(--ink); color:#fff; padding:3mm 5mm; border-radius:1.5mm; }}
.cover .eff .k {{ font-size:6.4pt; letter-spacing:0.22em; text-transform:uppercase; color:#c9b38a; font-weight:700; }}
.cover .eff .v {{ font-family:'Inter Display',sans-serif; font-size:13pt; font-weight:700; }}
.cover .seal {{ position:absolute; z-index:3; right:20mm; top:118mm; width:40mm; height:40mm; transform:rotate(-12deg); }}
.cover .seal svg {{ position:absolute; inset:0; width:100%; height:100%; fill:var(--red); filter:drop-shadow(0 1.2mm 1.6mm rgba(22,24,61,0.25)); }}
.cover .seal div {{ position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff; text-align:center; line-height:1.05; }}
.cover .seal b {{ font-family:'Inter Display',sans-serif; font-size:22pt; font-weight:800; letter-spacing:-0.02em; }}
.cover .seal small {{ font-size:6pt; letter-spacing:0.14em; text-transform:uppercase; font-weight:700; margin-top:0.6mm; }}
.cover .seal i {{ font-style:normal; font-size:5.4pt; letter-spacing:0.08em; opacity:0.9; margin-top:0.8mm; }}
.cover .tagline {{ position:absolute; z-index:2; left:18mm; bottom:84mm; height:12mm; }}
.cover .base {{ position:absolute; z-index:2; left:18mm; right:18mm; bottom:12mm; display:flex; justify-content:space-between; color:#fff; font-size:6.6pt; letter-spacing:0.2em; text-transform:uppercase; font-weight:600; }}
.cover .base b {{ color:#f5c79b; }}

/* highlights */
.highlights {{ display:grid; grid-template-columns:repeat(3,1fr); gap:3mm; margin-top:7mm; }}
.hl {{ border:0.6pt solid var(--line); border-top:2pt solid var(--red); padding:3.4mm 3.6mm; background:var(--cream); }}
.hl:nth-child(2) {{ border-top-color:var(--saffron); }} .hl:nth-child(3) {{ border-top-color:var(--navy); }}
.hl .k {{ font-size:6.2pt; letter-spacing:0.18em; text-transform:uppercase; color:var(--muted); font-weight:700; }}
.hl .v {{ font-family:'Inter Display',sans-serif; font-size:15pt; font-weight:700; margin:1mm 0 0.6mm; letter-spacing:-0.01em; }}
.hl .d {{ font-size:7pt; color:var(--ink-2); }}
.note {{ font-size:7pt; color:var(--muted); margin-top:2.6mm; }}
.note b {{ color:var(--ink-2); }}

/* terms */
.terms {{ columns:2; column-gap:9mm; margin-top:1mm; }}
.term {{ break-inside:avoid; padding:2.6mm 0 2.8mm; border-top:0.5pt solid var(--line); display:flex; gap:3mm; }}
.term .i {{ font-family:'Inter Display',sans-serif; font-weight:300; color:var(--gold); font-size:11pt; line-height:1; min-width:6mm; }}
.term h4 {{ font-size:7.8pt; font-weight:700; margin-bottom:0.6mm; }}
.term p {{ font-size:7.4pt; color:var(--ink-2); }}

.sign {{ display:grid; grid-template-columns:1fr 1fr; gap:14mm; margin-top:30mm; }}
.sign div {{ border-top:0.6pt solid var(--ink); padding-top:2mm; font-size:7pt; color:var(--muted); letter-spacing:0.14em; text-transform:uppercase; font-weight:600; }}
.closing {{ text-align:center; margin-top:14mm; }}
.closing img {{ height:11mm; opacity:0.95; }}
.closing p {{ font-size:6.6pt; letter-spacing:0.3em; text-transform:uppercase; color:var(--muted); margin-top:2.6mm; }}

/* footer */
.foot {{ position:absolute; left:14mm; right:14mm; bottom:8mm; display:flex; justify-content:space-between;
  font-size:6.2pt; letter-spacing:0.16em; text-transform:uppercase; color:var(--muted); border-top:0.5pt solid var(--line); padding-top:2.4mm; }}
.foot b {{ color:var(--ink); }}
.watermark {{ position:absolute; right:-18mm; bottom:22mm; width:120mm; opacity:0.035; pointer-events:none; }}
.runhead {{ display:flex; justify-content:space-between; align-items:center; padding:9mm 0 3.5mm; border-bottom:0.6pt solid var(--ink); }}
.runhead img {{ height:11mm; }}
.runhead .t {{ text-align:right; font-size:6.6pt; letter-spacing:0.22em; text-transform:uppercase; color:var(--ink-2); font-weight:600; }}
.runhead .t span {{ display:block; color:var(--gold); margin-top:0.6mm; }}
</style></head>
<body>

<!-- COVER -->
<section class="page cover">
  <div class="bub">{bubbles(22, 210, 230, 7, ["#e0533f", "#2e2f8f", "#f26b0f", "#4aa3df"], 2.5, 14, xmin=118)}</div>
  <div class="waves">{WAVES}</div>
  <div class="inner">
    <div class="eyebrow">Trade Price Schedule · Edition 2026 · Ref {REF}</div>
    <img class="clogo" src="{logo_clear}" alt="Seera">
    <h1>Super Stockist<em>Price List</em></h1>
    <p class="lead">The complete Company-to-Super Stockist rate schedule for fabric care, dishwash, home, car, hand &amp; body care.</p>
    <div class="brands"><span>Seera</span><span>Yuva</span><span>Shine Plus</span><span>Aatmanirbhar</span><span>MUV</span></div>
    <div class="eff"><span class="k">Effective From</span><span class="v">{EFFECTIVE}</span></div>
  </div>
  <div class="seal"><svg viewBox="0 0 100 100">{starburst()}</svg><div><small>Scheme</small><b>3 PCS</b><small>Free / Box</small><i>on detergent cakes</i></div></div>
  <img class="tagline" src="{tagline}" alt="Sarv Shaktimaan">
  <div class="base"><span><b>Seera</b> · {len(SEERA) + len(MUV)} SKUs · 5 Brands</span><span>Confidential · For Authorised Super Stockists</span></div>
</section>

<!-- PAGE 1 -->
<section class="page">
  <div class="pagewave">{PAGE_WAVE}</div>
  <div class="rail"></div>
  <img class="watermark" src="{logo}" alt="">
  <header class="mast">
    <img class="logo" src="{logo}" alt="Seera">
    <div class="right">
      <div class="eyebrow">Trade Price Schedule · Edition 2026</div>
      <h1 class="title">Super Stockist<br><em>Price List</em></h1>
      <div class="sub">Company to Super Stockist · Seera · Yuva · Shine Plus · Aatmanirbhar · MUV</div>
    </div>
  </header>
  <div class="meta">
    <div><div class="k">Effective From</div><div class="v">{EFFECTIVE}</div></div>
    <div><div class="k">Date of Issue</div><div class="v">{ISSUED}</div></div>
    <div><div class="k">Reference No.</div><div class="v">{REF}</div></div>
    <div><div class="k">Classification</div><div class="v">Confidential</div></div>
  </div>

  <div class="sec">
    <div class="left"><div class="num">01</div><div><h2>Seera · Yuva · Shine Plus · Aatmanirbhar</h2><p>Detergent cakes, detergent powders &amp; Bartan Tub · Billed per Box / Bag · HSN 3402</p></div></div>
    <div class="tag">Net Landing incl. GST</div>
  </div>
  <table>
    <thead><tr>
      <th>#</th><th>Product · Trade Scheme</th><th class="c">Pack</th><th class="c">Case Config.</th>
      <th class="r">Basic Rate<span class="u">₹ / Box·Bag</span></th>
      <th class="r">GST 18%<span class="u">₹</span></th>
      <th class="r">Net Landing<span class="u">₹ incl. GST</span></th>
      <th class="r">Effective<span class="u">₹ incl. GST</span></th>
    </tr></thead>
    <tbody>
{seera_rows()}
    </tbody>
  </table>
  <p class="note"><b>Billing basis:</b> Net Landing is the final invoice value per full Box / Bag, inclusive of GST @ 18%; Basic Rate and GST are its tax break-up. Shine Plus is priced at ₹{SHINE_PER_KG} / kg × pack weight × pieces per Bag. Effective rate = Net Landing ÷ units per Box / Bag.</p>

  <div class="foot"><span><b>Seera</b> · Super Stockist Price List 2026</span><span>Ref {REF}</span><span>Page 2 / 5</span></div>
</section>

<!-- PAGE 2 -->
<section class="page">
  <div class="pagewave">{PAGE_WAVE}</div>
  <div class="rail"></div>
  <div class="runhead"><img src="{logo}" alt="Seera"><div class="t">Super Stockist Price List<span>Effective {EFFECTIVE}</span></div></div>
  <div class="sec" style="margin-top:6mm">
    <div class="left"><div class="num">02</div><div><h2>MUV — Fabric &amp; Home Care</h2><p>Billed per piece · S.S. Price inclusive of GST</p></div></div>
    <div class="tag inc">Per Piece</div>
  </div>
  <table class="muv">
    <thead><tr>
      <th>#</th><th>Product</th><th>SKU Code</th><th class="c">Pack</th>
      <th class="r">MRP<span class="u">₹ / pc</span></th>
      <th class="r">S.S. Price<span class="u">₹ / pc</span></th>
      <th class="c">S.S. Margin<span class="u">on MRP</span></th>
    </tr></thead>
    <tbody>
{muv_rows(["Fabric Care", "Home Care"])}
    </tbody>
  </table>
  <div class="foot"><span><b>Seera</b> · Super Stockist Price List 2026</span><span>Ref {REF}</span><span>Page 3 / 5</span></div>
</section>

<!-- PAGE 3 -->
<section class="page">
  <div class="pagewave">{PAGE_WAVE}</div>
  <div class="rail"></div>
  <div class="runhead"><img src="{logo}" alt="Seera"><div class="t">Super Stockist Price List<span>Effective {EFFECTIVE}</span></div></div>
  <div class="sec" style="margin-top:6mm">
    <div class="left"><div class="num">02</div><div><h2>MUV — Car, Hand &amp; Body Care</h2><p>Continued · Billed per piece · S.S. Price inclusive of GST</p></div></div>
    <div class="tag inc">Per Piece</div>
  </div>
  <table class="muv">
    <thead><tr>
      <th>#</th><th>Product</th><th>SKU Code</th><th class="c">Pack</th>
      <th class="r">MRP<span class="u">₹ / pc</span></th>
      <th class="r">S.S. Price<span class="u">₹ / pc</span></th>
      <th class="c">S.S. Margin<span class="u">on MRP</span></th>
    </tr></thead>
    <tbody>
{muv_rows(["Car Care", "Hand Care", "Body Care"])}
    </tbody>
  </table>
  <p class="note"><b>Pricing:</b> S.S. Price is the final invoice value per piece, inclusive of GST. Special S.S. landing rates apply to Phenyl 1 L &amp; 5 L, Black Phenyl 1 L, Bleach 500 ml and Glass Cleaner 500 ml. MRP is inclusive of GST. <b>S.S. Margin on MRP</b> = (MRP − S.S. Price) ÷ MRP. The earlier additional 2.5% MUV scheme stands withdrawn.</p>
  <div class="foot"><span><b>Seera</b> · Super Stockist Price List 2026</span><span>Ref {REF}</span><span>Page 4 / 5</span></div>
</section>

<!-- PAGE 4 -->
<section class="page">
  <div class="pagewave">{PAGE_WAVE}</div>
  <div class="rail"></div>
  <img class="watermark" src="{logo}" alt="">
  <div class="runhead"><img src="{logo}" alt="Seera"><div class="t">Super Stockist Price List<span>Effective {EFFECTIVE}</span></div></div>
  <div class="highlights">
    <div class="hl"><div class="k">Portfolio</div><div class="v">5 Brands · {len(SEERA) + len(MUV)} SKUs</div><div class="d">Seera, Yuva, Shine Plus, Aatmanirbhar &amp; MUV — fabric, home, car, hand &amp; body care.</div></div>
    <div class="hl"><div class="k">Detergent Cake Scheme</div><div class="v">3 pcs free / Box</div><div class="d">₹10 MRP detergent powder free on every Box of Seera &amp; Yuva cakes.</div></div>
    <div class="hl"><div class="k">MUV Margin on MRP</div><div class="v">{muv_margin_range()}</div><div class="d">S.S. price vs printed MRP, per piece.</div></div>
  </div>
  <div class="sec" style="margin-top:7mm">
    <div class="left"><div class="num">03</div><div><h2>Commercial Terms &amp; Notes</h2><p>Applicable to all orders placed against this price list</p></div></div>
  </div>
  <div class="terms">
    <div class="term"><div class="i">01</div><div><h4>Validity</h4><p>Rates are effective from {EFFECTIVE} and remain valid until superseded by a revised price list issued by the Company. This edition supersedes price list SEERA/SS-PL/2026/01 and all earlier Super Stockist price communications.</p></div></div>
    <div class="term"><div class="i">02</div><div><h4>Taxes — Seera, Yuva, Shine Plus &amp; Aatmanirbhar</h4><p>Net Landing is the final invoice value per Box / Bag, inclusive of GST @ 18% (HSN 3402). Basic Rate and GST are shown as the tax break-up of that value.</p></div></div>
    <div class="term"><div class="i">03</div><div><h4>MUV Pricing</h4><p>MUV is billed per piece at the S.S. Price shown, which is the final invoice value inclusive of GST. MRP is inclusive of GST.</p></div></div>
    <div class="term"><div class="i">04</div><div><h4>Order Units</h4><p>Seera, Yuva, Shine Plus, Aatmanirbhar and Bartan Tub are billed per full Box / Bag as per the case configuration shown. MUV is billed per piece.</p></div></div>
    <div class="term"><div class="i">05</div><div><h4>Free-Goods Scheme</h4><p>Every Box of Seera / Yuva detergent cake carries 3 pcs of ₹10 MRP detergent powder free. Detergent powder Bags carry the scheme shown against them. Free goods are supplied over and above the ordered quantity, carry no invoice value and may be revised or withdrawn by the Company with notice.</p></div></div>
    <div class="term"><div class="i">06</div><div><h4>MRP Compliance</h4><p>Products must not be sold above the printed MRP at any level of the distribution chain.</p></div></div>
    <div class="term"><div class="i">07</div><div><h4>Price Revisions</h4><p>The Company reserves the right to revise prices, schemes and pack configurations. Orders are billed at the rate in force on the date of invoicing.</p></div></div>
    <div class="term"><div class="i">08</div><div><h4>Confidentiality</h4><p>This document is issued exclusively to the authorised Super Stockist named below and is not to be shared with distributors, retailers or third parties.</p></div></div>
  </div>

  <div class="sign">
    <div>Authorised Signatory — For Seera</div>
    <div>Accepted by — Super Stockist (Name, Firm &amp; Seal)</div>
  </div>

  <div class="closing">
    <img src="{tagline}" alt="Sarv Shaktimaan">
  </div>

  <div class="foot"><span><b>Seera</b> · Super Stockist Price List 2026</span><span>Ref {REF}</span><span>Page 5 / 5</span></div>
</section>
</body></html>
"""


def main() -> None:
    HTML_OUT.write_text(build_html(), encoding="utf-8")
    subprocess.run(
        [CHROME, "--headless=new", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer",
         f"--print-to-pdf={PDF_OUT}", HTML_OUT.as_uri()],
        check=True, capture_output=True,
    )
    print(f"Wrote {HTML_OUT}\nWrote {PDF_OUT}")


if __name__ == "__main__":
    main()

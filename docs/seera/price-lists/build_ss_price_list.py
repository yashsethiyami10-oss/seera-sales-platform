"""Builds the Company -> Super Stockist price list (HTML + PDF).

Rates are the governed COMPANY_TO_SS price versions from
prisma/migrations/20260816000000_seera_catalog_restoration/migration.sql (effective 2026-01-01):
  - Seera / Yuva / Shine Plus: stored amount is the GST-exclusive basic rate per Box/Bag
    (GST 18%, HSN 3402, added on top — see scripts/seera/smoke-gst-price-mode-both-portals.ts).
  - MUV: stored amount is the GST-inclusive net rate per piece.
Pack/case configuration comes from lib/sales-distribution/company-order-catalog.ts.

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

EFFECTIVE = "01 January 2026"
ISSUED = "23 October 2026"
REF = "SEERA/SS-PL/2026/01"
GST = 0.18

# code, product, brand, pack, case config, billing unit, basic rate (ex-GST), per-unit divisor, per-unit label, scheme
SEERA = [
    ("SEERA-CAKE-BLUE", "Seera Blue Detergent Cake", "Seera", "180 g", "40 pcs / Box", "Box", 252.54, 40, "per pc", "1 pc free / Box"),
    ("SEERA-CAKE-WHITE", "Seera White Detergent Cake", "Seera", "150 g", "40 pcs / Box", "Box", 252.54, 40, "per pc", "1 pc free / Box"),
    ("SEERA-YUVA-CAKE-BLUE", "Yuva Blue Detergent Cake", "Yuva", "170 g", "40 pcs / Box", "Box", 252.54, 40, "per pc", "2 pcs free / Box"),
    ("SEERA-POWDER-1KG", "Seera Detergent Powder", "Seera", "1 kg", "25 × 1 kg / Bag", "Bag", 1165.26, 25, "per kg", "1 pc free / Bag"),
    ("SEERA-SHINEPLUS-POWDER-1KG", "Shine Plus Detergent Powder", "Shine Plus", "1 kg", "25 × 1 kg / Bag", "Bag", 953.39, 25, "per kg", "1 pc free / Bag"),
    ("SEERA-SHINEPLUS-POWDER-3KG", "Shine Plus Detergent Powder", "Shine Plus", "3 kg", "10 × 3 kg / Bag", "Bag", 1144.06, 10, "per pc", "1 pc free / Bag"),
    ("SEERA-SHINEPLUS-POWDER-5KG", "Shine Plus Detergent Powder", "Shine Plus", "5 kg", "6 × 5 kg / Bag", "Bag", 1144.06, 6, "per pc", "1 pc free / Bag"),
]

# category, code, product, pack, MRP, S.S. net rate (GST-inclusive)
MUV = [
    ("Fabric Care", "MUV-LD-IR-1000", "Indian Rose Liquid Detergent", "1 L", 155, 116.25),
    ("Fabric Care", "MUV-LD-IR-5000", "Indian Rose Liquid Detergent", "5 L", 699, 524.25),
    ("Fabric Care", "MUV-LD-CW-1000", "Cool Water Liquid Detergent", "1 L", 155, 116.25),
    ("Fabric Care", "MUV-LD-CW-5000", "Cool Water Liquid Detergent", "5 L", 699, 524.25),
    ("Fabric Care", "MUV-LD-LG-1000", "Lavender Garden Liquid Detergent", "1 L", 155, 116.25),
    ("Fabric Care", "MUV-LD-LG-5000", "Lavender Garden Liquid Detergent", "5 L", 699, 524.25),
    ("Home Care", "MUV-DG-STD-500", "Dishwash Gel", "500 ml", 85, 63.75),
    ("Home Care", "MUV-DG-STD-1000", "Dishwash Gel", "1 L", 155, 116.25),
    ("Home Care", "MUV-DG-STD-5000", "Dishwash Gel", "5 L", 699, 524.25),
    ("Home Care", "MUV-FC-VM-1000", "Velvet Mist Floor Cleaner", "1 L", 150, 112.50),
    ("Home Care", "MUV-FC-VM-5000", "Velvet Mist Floor Cleaner", "5 L", 549, 411.75),
    ("Home Care", "MUV-FC-CWK-1000", "Cloud Walk Floor Cleaner", "1 L", 150, 112.50),
    ("Home Care", "MUV-FC-CWK-5000", "Cloud Walk Floor Cleaner", "5 L", 549, 411.75),
    ("Home Care", "MUV-TC-STD-500", "Toilet Cleaner", "500 ml", 80, 60.00),
    ("Home Care", "MUV-TC-STD-5000", "Toilet Cleaner", "5 L", 400, 300.00),
    ("Home Care", "MUV-BC-STD-500", "Bathroom Cleaner", "500 ml", 65, 48.75),
    ("Home Care", "MUV-GC-STD-500", "Glass Cleaner", "500 ml", 90, 67.50),
    ("Home Care", "MUV-WP-STD-1000", "White Phenyl", "1 L", 60, 45.00),
    ("Home Care", "MUV-WP-STD-5000", "White Phenyl", "5 L", 270, 202.50),
    ("Home Care", "MUV-BP-STD-1000", "Black Phenyl", "1 L", 80, 60.00),
    ("Home Care", "MUV-BL-STD-500", "Bleach", "500 ml", 50, 37.50),
    ("Car Care", "MUV-CW-STD-500", "Car Wash", "500 ml", 70, 52.50),
    ("Car Care", "MUV-CW-STD-5000", "Car Wash", "5 L", 550, 412.50),
    ("Hand Care", "MUV-HW-LS-250", "Lifeshield Hand Wash", "250 ml", 80, 60.00),
    ("Hand Care", "MUV-HW-LS-500", "Lifeshield Hand Wash", "500 ml", 95, 71.25),
    ("Hand Care", "MUV-HW-SB-500", "Silk Blossom Hand Wash", "500 ml", 95, 71.25),
    ("Hand Care", "MUV-HW-OF-500", "Ocean Fresh Hand Wash", "500 ml", 95, 71.25),
    ("Hand Care", "MUV-HW-OF-5000", "Ocean Fresh Hand Wash", "5 L", 725, 543.75),
    ("Hand Care", "MUV-HW-CB-250", "Citrus Blast Hand Wash", "250 ml", 80, 60.00),
    ("Hand Care", "MUV-HW-CB-500", "Citrus Blast Hand Wash", "500 ml", 95, 71.25),
    ("Hand Care", "MUV-HW-CB-5000", "Citrus Blast Hand Wash", "5 L", 725, 543.75),
    ("Body Care", "MUV-BW-CV-250", "Crimson Veil Body Wash", "250 ml", 110, 77.00),
    ("Body Care", "MUV-BW-CV-950", "Crimson Veil Body Wash", "950 ml", 360, 252.00),
    ("Body Care", "MUV-BW-VO-250", "Velvet Oak Body Wash", "250 ml", 110, 77.00),
    ("Body Care", "MUV-BW-VO-950", "Velvet Oak Body Wash", "950 ml", 360, 252.00),
    ("Body Care", "MUV-BW-MF-250", "Midnight Frost Body Wash", "250 ml", 110, 77.00),
    ("Body Care", "MUV-BW-MF-950", "Midnight Frost Body Wash", "950 ml", 360, 252.00),
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


def image_data_uri(path: Path, max_px: int) -> str:
    src = Image.open(path).convert("RGBA")
    im = Image.new("RGB", src.size, (255, 255, 255))
    im.paste(src, mask=src.split()[3])
    diff = ImageChops.difference(im, Image.new("RGB", im.size, (255, 255, 255)))
    im = im.crop(diff.point(lambda p: 255 if p > 18 else 0).getbbox())
    im.thumbnail((max_px, max_px))
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def seera_rows() -> str:
    rows = []
    for i, (code, name, brand, pack, case, unit, basic, div, per, scheme) in enumerate(SEERA, 1):
        gst = money(basic * GST)
        net = money(basic + gst)
        rows.append(
            f"""<tr>
  <td class="n">{i:02d}</td>
  <td class="prod"><div class="pn">{name}</div><div class="code"><span class="brand brand-{brand.split()[0].lower()}">{brand}</span>{code}</div></td>
  <td class="c">{pack}</td>
  <td class="c">{case}</td>
  <td class="r">{inr(basic)}</td>
  <td class="r muted">{inr(gst)}</td>
  <td class="r net">{inr(net)}<span class="per">/ {unit}</span></td>
  <td class="r">{inr(money(net / div))}<span class="per">{per}</span></td>
  <td class="c"><span class="scheme">{scheme}</span></td>
</tr>"""
        )
    return "\n".join(rows)


def muv_rows(categories: list[str]) -> str:
    rows, current = [], None
    for i, (cat, code, name, pack, mrp, rate) in enumerate(MUV, 1):
        if cat not in categories:
            continue
        if cat != current:
            current = cat
            count = sum(1 for r in MUV if r[0] == cat)
            rows.append(f'<tr class="cat"><td colspan="7">{cat}<span>{count} SKUs</span></td></tr>')
        margin = (1 - rate / mrp) * 100
        rows.append(
            f"""<tr>
  <td class="n">{i:02d}</td>
  <td><div class="pn">MUV {name}</div></td>
  <td class="code-cell">{code}</td>
  <td class="c">{pack}</td>
  <td class="r muted">{inr(mrp)}</td>
  <td class="r net">{inr(rate)}</td>
  <td class="c"><span class="margin">{margin:.0f}%</span></td>
</tr>"""
        )
    return "\n".join(rows)


def build_html() -> str:
    logo = image_data_uri(ROOT / "public" / "seera logo.png", 600)
    tagline = image_data_uri(ROOT / "public" / "seera tagline.png", 700)
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
.mast {{ display:flex; align-items:center; justify-content:space-between; padding:13mm 0 7mm; border-bottom:0.6pt solid var(--ink); }}
.mast .logo {{ height:25mm; }}
.mast .right {{ text-align:right; }}
.eyebrow {{ font-size:6.8pt; letter-spacing:0.28em; text-transform:uppercase; color:var(--gold); font-weight:600; }}
.title {{ font-family:'Inter Display','Inter',sans-serif; font-size:25pt; font-weight:700; letter-spacing:-0.02em; line-height:1.05; margin:2mm 0 1.6mm; }}
.title em {{ font-style:normal; color:var(--red); }}
.sub {{ color:var(--ink-2); font-size:8.4pt; }}

.meta {{ display:grid; grid-template-columns:repeat(4,1fr); border-bottom:0.6pt solid var(--line); }}
.meta div {{ padding:3.2mm 0 3.2mm 0; }}
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
thead th {{ font-size:6.2pt; letter-spacing:0.12em; text-transform:uppercase; font-weight:700; color:var(--ink-2);
  text-align:left; padding:2.4mm 2mm; background:var(--cream); border-top:1.2pt solid var(--ink); border-bottom:0.6pt solid var(--ink); }}
thead th.r {{ text-align:right; }} thead th.c {{ text-align:center; }}
thead th .u {{ display:block; letter-spacing:0.04em; text-transform:none; font-weight:500; color:var(--muted); margin-top:0.4mm; }}
tbody td {{ padding:2.3mm 2mm; border-bottom:0.5pt solid var(--line); vertical-align:middle; }}
td.r {{ text-align:right; white-space:nowrap; }} td.c {{ text-align:center; white-space:nowrap; }}
td.n {{ color:var(--muted); font-size:7.2pt; width:7mm; }}
.pn {{ font-weight:600; font-size:8.6pt; }}
.code {{ font-family:'DejaVu Sans Mono',monospace; font-size:6pt; color:var(--muted); margin-top:0.9mm; letter-spacing:0.02em; white-space:nowrap; }}
.code .brand {{ font-family:'Inter',sans-serif; margin-right:1.6mm; }}
td.prod {{ width:62mm; }}
.code-cell {{ font-family:'DejaVu Sans Mono',monospace; font-size:6.4pt; color:var(--muted); }}
.muted {{ color:var(--muted); }}
td.net {{ font-weight:700; font-size:9.2pt; color:var(--ink); background:rgba(224,83,63,0.055); }}
.per {{ display:block; font-size:6pt; font-weight:500; color:var(--muted); letter-spacing:0.04em; }}
.brand {{ font-size:5.6pt; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; padding:0.8mm 1.8mm; border-radius:0.8mm; white-space:nowrap; }}
.brand-seera {{ color:var(--red); background:rgba(224,83,63,0.1); }}
.brand-yuva {{ color:var(--navy); background:rgba(46,47,143,0.09); }}
.brand-shine {{ color:var(--saffron); background:rgba(242,107,15,0.1); }}
.scheme {{ font-size:6.8pt; font-weight:600; color:#1f6b46; background:rgba(31,107,70,0.08); padding:0.9mm 2mm; border-radius:3mm; white-space:nowrap; }}
.margin {{ font-weight:700; font-size:7.6pt; color:var(--navy); }}
tr.cat td {{ background:var(--paper); font-family:'Inter Display',sans-serif; font-weight:700; font-size:7.4pt; letter-spacing:0.18em;
  text-transform:uppercase; color:var(--ink); padding:3.2mm 2mm 1.4mm; border-bottom:0.8pt solid var(--ink); }}
tr.cat td span {{ float:right; font-family:'Inter',sans-serif; letter-spacing:0.08em; font-weight:500; color:var(--muted); font-size:6.4pt; }}
.muv tbody td {{ padding-top:1.55mm; padding-bottom:1.55mm; }}

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

<!-- PAGE 1 -->
<section class="page">
  <div class="rail"></div>
  <img class="watermark" src="{logo}" alt="">
  <header class="mast">
    <img class="logo" src="{logo}" alt="Seera">
    <div class="right">
      <div class="eyebrow">Trade Price Schedule · Edition 2026</div>
      <h1 class="title">Super Stockist<br><em>Price List</em></h1>
      <div class="sub">Company to Super Stockist · Seera · Yuva · Shine Plus · MUV</div>
    </div>
  </header>
  <div class="meta">
    <div><div class="k">Effective From</div><div class="v">{EFFECTIVE}</div></div>
    <div><div class="k">Date of Issue</div><div class="v">{ISSUED}</div></div>
    <div><div class="k">Reference No.</div><div class="v">{REF}</div></div>
    <div><div class="k">Classification</div><div class="v">Confidential</div></div>
  </div>

  <div class="highlights">
    <div class="hl"><div class="k">Portfolio</div><div class="v">4 Brands · {len(SEERA) + len(MUV)} SKUs</div><div class="d">Detergent cakes, powders, liquid detergents, home, car, hand &amp; body care.</div></div>
    <div class="hl"><div class="k">Seera Free-Goods Scheme</div><div class="v">Up to 2 pcs / Box</div><div class="d">Free goods on every Box / Bag of Seera, Yuva &amp; Shine Plus.</div></div>
    <div class="hl"><div class="k">MUV Super Stockist Margin</div><div class="v">25% – 30% on MRP</div><div class="d">Net rates inclusive of GST — no further tax on invoice.</div></div>
  </div>

  <div class="sec">
    <div class="left"><div class="num">01</div><div><h2>Fabric Care — Seera, Yuva &amp; Shine Plus</h2><p>Detergent cakes &amp; powders · Billed per Box / Bag · HSN 3402</p></div></div>
    <div class="tag">Rates + GST 18%</div>
  </div>
  <table>
    <thead><tr>
      <th>#</th><th>Product</th><th class="c">Pack</th><th class="c">Case Config.</th>
      <th class="r">Basic Rate<span class="u">₹ / Box·Bag</span></th>
      <th class="r">GST 18%<span class="u">₹</span></th>
      <th class="r">Net Landing<span class="u">₹ incl. GST</span></th>
      <th class="r">Effective<span class="u">₹ incl. GST</span></th>
      <th class="c">Trade Scheme</th>
    </tr></thead>
    <tbody>
{seera_rows()}
    </tbody>
  </table>
  <p class="note"><b>Billing basis:</b> Basic Rate is per full Box / Bag; GST @ 18% is charged additionally on the tax invoice. Effective rate is shown for reference only (Net Landing ÷ units per Box / Bag). Free goods are supplied as additional pieces and are not deducted from the invoice value.</p>

  <div class="foot"><span><b>Seera</b> · Super Stockist Price List 2026</span><span>Ref {REF}</span><span>Page 1 / 4</span></div>
</section>

<!-- PAGE 2 -->
<section class="page">
  <div class="rail"></div>
  <div class="runhead"><img src="{logo}" alt="Seera"><div class="t">Super Stockist Price List<span>Effective {EFFECTIVE}</span></div></div>
  <div class="sec" style="margin-top:6mm">
    <div class="left"><div class="num">02</div><div><h2>MUV — Fabric &amp; Home Care</h2><p>Billed per piece · Net rates are inclusive of GST</p></div></div>
    <div class="tag inc">Rates incl. GST</div>
  </div>
  <table class="muv">
    <thead><tr>
      <th>#</th><th>Product</th><th>SKU Code</th><th class="c">Pack</th>
      <th class="r">MRP<span class="u">₹ / pc</span></th>
      <th class="r">S.S. Net Rate<span class="u">₹ / pc incl. GST</span></th>
      <th class="c">Margin<span class="u">on MRP</span></th>
    </tr></thead>
    <tbody>
{muv_rows(["Fabric Care", "Home Care"])}
    </tbody>
  </table>
  <div class="foot"><span><b>Seera</b> · Super Stockist Price List 2026</span><span>Ref {REF}</span><span>Page 2 / 4</span></div>
</section>

<!-- PAGE 3 -->
<section class="page">
  <div class="rail"></div>
  <div class="runhead"><img src="{logo}" alt="Seera"><div class="t">Super Stockist Price List<span>Effective {EFFECTIVE}</span></div></div>
  <div class="sec" style="margin-top:6mm">
    <div class="left"><div class="num">02</div><div><h2>MUV — Car, Hand &amp; Body Care</h2><p>Continued · Billed per piece · Net rates are inclusive of GST</p></div></div>
    <div class="tag inc">Rates incl. GST</div>
  </div>
  <table class="muv">
    <thead><tr>
      <th>#</th><th>Product</th><th>SKU Code</th><th class="c">Pack</th>
      <th class="r">MRP<span class="u">₹ / pc</span></th>
      <th class="r">S.S. Net Rate<span class="u">₹ / pc incl. GST</span></th>
      <th class="c">Margin<span class="u">on MRP</span></th>
    </tr></thead>
    <tbody>
{muv_rows(["Car Care", "Hand Care", "Body Care"])}
    </tbody>
  </table>
  <p class="note"><b>Margin on MRP</b> = (MRP − S.S. Net Rate) ÷ MRP. MUV is billed per piece; no additional GST is charged over the S.S. Net Rate.</p>
  <div class="foot"><span><b>Seera</b> · Super Stockist Price List 2026</span><span>Ref {REF}</span><span>Page 3 / 4</span></div>
</section>

<!-- PAGE 4 -->
<section class="page">
  <div class="rail"></div>
  <img class="watermark" src="{logo}" alt="">
  <div class="runhead"><img src="{logo}" alt="Seera"><div class="t">Super Stockist Price List<span>Effective {EFFECTIVE}</span></div></div>
  <div class="sec" style="margin-top:6mm">
    <div class="left"><div class="num">03</div><div><h2>Commercial Terms &amp; Notes</h2><p>Applicable to all orders placed against this price list</p></div></div>
  </div>
  <div class="terms">
    <div class="term"><div class="i">01</div><div><h4>Validity</h4><p>Rates are effective from {EFFECTIVE} and remain valid until superseded by a revised price list issued by the Company. This edition supersedes all earlier Super Stockist price communications.</p></div></div>
    <div class="term"><div class="i">02</div><div><h4>Taxes — Seera, Yuva &amp; Shine Plus</h4><p>Basic Rates are exclusive of GST. GST @ 18% (HSN 3402) is charged additionally on the tax invoice. Net Landing shown is the final invoice value per Box / Bag.</p></div></div>
    <div class="term"><div class="i">03</div><div><h4>Taxes — MUV</h4><p>S.S. Net Rates for MUV are inclusive of GST. The invoice value per piece equals the rate shown; applicable tax is included within it.</p></div></div>
    <div class="term"><div class="i">04</div><div><h4>Order Units</h4><p>Seera, Yuva &amp; Shine Plus are billed per full Box / Bag as per the case configuration shown. MUV is billed per piece.</p></div></div>
    <div class="term"><div class="i">05</div><div><h4>Free-Goods Scheme</h4><p>Free pieces are supplied in addition to the ordered quantity on every eligible Box / Bag. Free goods carry no invoice value and are never adjusted against the billed amount. Schemes may be revised or withdrawn by the Company with notice.</p></div></div>
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

  <div class="foot"><span><b>Seera</b> · Super Stockist Price List 2026</span><span>Ref {REF}</span><span>Page 4 / 4</span></div>
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

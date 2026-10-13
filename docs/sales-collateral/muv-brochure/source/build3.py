"""Seera + MUV product catalogue — v3 (FMCG trade-catalogue layout).

One repeating page pattern: brand-colour header band (logo + category), a grid of product
cards (photo on a tinted stage, name, weight→MRP rows), brand footer.
MUV pack sizes/MRP mirror the live Seera SKU master; Seera values are Founder-supplied.
A Seera MRP of None renders as "MRP —" until the Founder supplies it (never invented).
"""
import sys
from html import escape

# ---------------------------------------------------------------- data
# card: (name, brand_line, photo|None, [(size, mrp|None)], photo_scale, swatch_colour)
SEERA_CAKES = [
    ("Detergent Cake Blue", "Seera · Jumbo", "seera_cake_jumbo", [("180 g", 10)], 1.0, "#2F6FD6"),
    ("Detergent Cake White", "Aatmanirbhar Seera", "aatma_sachet", [("160 g", 10)], 1.0, "#9DB4D6"),
    ("Detergent Cake Blue", "Aatmanirbhar Yuva", "yuva_bar", [("210 g", 10)], 1.0, "#2A3FB8"),
]
SEERA_BARTAN = [
    ("Bartan Tub", "Seera", "seera_bartan", [("300 g", 20)], 0.85, "#3FA36B"),
    ("Bartan Tub", "Seera", "seera_bartan500", [("500 g", 35)], 1.0, "#3FA36B"),
]
SEERA_POWDERS = [
    ("Detergent Powder", "Seera · Sarv Shaktiman", "seera_powder_bag", [("1 kg", 75)], 1.0, "#E2552F"),
    ("Detergent Powder", "Aatmanirbhar Seera", "aatma_pouch", [("120 g", 10)], 0.78, "#2A3FB8"),
    ("Detergent Powder", "Aatmanirbhar Seera", "aatma_pouch", [("300 g", 20)], 0.95, "#2A3FB8"),
    ("Washing Powder", "Shine Plus", "shine_plus_3d", [("1 kg", 70)], 0.78, "#1E9BB8"),
    ("Washing Powder", "Shine Plus", "shine_plus_3d", [("3 kg", 250)], 0.89, "#1E9BB8"),
    ("Washing Powder", "Shine Plus", "shine_plus_3d", [("5 kg", 450)], 1.0, "#1E9BB8"),
]

MUV_FABRIC = [
    ("Liquid Detergent", "Indian Rose", "cut_rose", [("1 L", 155), ("5 L", 699)], 1.0, "#E0607A"),
    ("Liquid Detergent", "Lavender Garden", "cut_lavender", [("1 L", 155), ("5 L", 699)], 1.0, "#9C7BD8"),
    ("Liquid Detergent", "Cool Water", "cut_coolwater", [("1 L", 155), ("5 L", 699)], 1.0, "#7FB5E0"),
]
MUV_HOME_A = [
    ("Dishwash Gel", "Lemon Fresh", "cut_dishwash", [("500 ml", 85), ("1 L", 155), ("5 L", 699)], 1.0, "#E6D04A"),
    ("Floor Cleaner", "Cloud Walk", "cut_cloudwalk", [("1 L", 150), ("5 L", 549)], 1.0, "#6FA6E6"),
    ("Floor Cleaner", "Velvet Mist", "cut_velvetmist", [("1 L", 150), ("5 L", 549)], 1.0, "#A891E0"),
]
MUV_HOME_B = [
    ("Toilet Cleaner", "MUV", "cut_toilet", [("500 ml", 80), ("5 L", 400)], 1.0, "#4D7BD1"),
    ("Bathroom Cleaner", "MUV", "cut_bathroom", [("500 ml", 65)], 1.0, "#E04848"),
    ("Glass Cleaner", "MUV", "cut_glass", [("500 ml", 90)], 1.0, "#3D8FE0"),
]
MUV_HYGIENE = [
    ("White Phenyl", "MUV", "cut_whitephenyl", [("1 L", 60), ("5 L", 270)], 1.0, "#D9D4C7"),
    ("Black Phenyl", "MUV", "cut_blackphenyl", [("1 L", 80)], 1.0, "#3A3536"),
    ("Bleach", "MUV", "cut_bleach", [("500 ml", 50)], 1.0, "#9FC6DC"),
]
MUV_HAND = [
    ("Hand Wash", "Silk Blossom", "cut_silk", [("500 ml", 95)], 1.0, "#E6A6D2"),
    ("Hand Wash", "Ocean Fresh", "cut_oceanfresh", [("500 ml", 95), ("5 L", 725)], 1.0, "#6FB6E6"),
    ("Hand Wash", "Citrus Blast", None, [("250 ml", 80), ("500 ml", 95), ("5 L", 725)], 1.0, "#F0A93C"),
    ("Hand Wash", "Life Shield", None, [("250 ml", 80), ("500 ml", 95)], 1.0, "#5DB98A"),
]
MUV_BODY = [
    ("Body Wash", "Crimson Veil", "cut_crimson", [("250 ml", 110), ("950 ml", 360)], 1.0, "#2F6B45"),
    ("Body Wash", "Velvet Oak", "cut_velvetoak", [("250 ml", 110), ("950 ml", 360)], 1.0, "#B8402E"),
    ("Body Wash", "Midnight Frost", "cut_midnight", [("250 ml", 110), ("950 ml", 360)], 1.0, "#2D47A8"),
]
MUV_CAR = [("Car Wash", "MUV", "cut_carwash", [("500 ml", 70), ("5 L", 550)], 1.0, "#1B2A4A")]

BOTTLE = ('<svg class="ph" viewBox="0 0 80 160"><path d="M30 6h20v18c0 4 3 6 6 9 6 6 10 13 10 22v92a7 7 0 0 1-7 7H21a7 7 0 0 1-7-7V55'
          'c0-9 4-16 10-22 3-3 6-5 6-9z" fill="{c}"/><rect x="28" y="2" width="24" height="10" rx="3" fill="{c}" opacity=".75"/>'
          '<rect x="22" y="70" width="36" height="46" rx="5" fill="#fff" opacity=".85"/><path d="M14 55h52v6H14z" fill="#fff" opacity=".18"/></svg>')


def rupee(v):
    return f"₹{v:,}" if v is not None else "—"


def rows(sizes):
    return '<div class="rows">' + "".join(
        f'<div class="row"><span class="wt">{escape(s)}</span><span class="mrp"><small>MRP</small>{rupee(m)}</span></div>' for s, m in sizes
    ) + "</div>"


def card(name, brand_line, photo, sizes, scale, colour):
    visual = f'<img style="--k:{scale}" src="img/{photo}.webp" alt="">' if photo else BOTTLE.format(c=colour)
    return f'''<article class="card" style="--sw:{colour}">
    <div class="stage">{visual}</div>
    <div class="info"><p class="line">{escape(brand_line)}</p><h3>{escape(name)}</h3>{rows(sizes)}</div>
  </article>'''


def header(brand, title, sub=""):
    logo = '<img class="logo-s" src="img/seera_logo.png" alt="Seera">' if brand == "seera" else '<img class="logo-m" src="img/logo.png" alt="MUV">'
    extra = '<img class="aatma-h" src="img/aatma_logo.webp" alt="Aatmanirbhar">' if brand == "seera" else ""
    return f'''<header class="band {brand}">
    <div class="plate">{logo}</div>
    <div class="title"><h2>{title}</h2>{f'<p>{sub}</p>' if sub else ""}</div>
    {extra}
  </header>'''


def footer(brand, n):
    name = "SEERA" if brand == "seera" else "MUV"
    return f'<footer class="foot {brand}"><span>{name} · Product Catalogue 2026</span><span>{n:02d}</span></footer>'


def product_page(brand, n, sections, cols=3):
    body = "".join(
        (f'<h4 class="sec">{escape(t)}</h4>' if t else "") + f'<div class="grid c{c}">{"".join(card(*x) for x in items)}</div>'
        for t, items, c in sections
    )
    title, sub = sections[0][3] if len(sections[0]) > 3 else ("", "")
    return body


pages = []

# 1 — cover
pages.append('''<section class="page cover">
  <div class="cv-seera">
    <div class="cv-plate"><img src="img/seera_logo.png" alt="Seera"></div>
    <div class="cv-aatma"><img src="img/aatma_logo.webp" alt="Aatmanirbhar"></div>
    <div class="cv-packs">
      <img src="img/seera_powder_bag.webp" alt=""><img src="img/shine_plus_filled.webp" alt=""><img src="img/aatma_pouch.webp" alt="">
      <img class="tub" src="img/seera_bartan500.webp" alt="">
    </div>
  </div>
  <div class="cv-band"><span>Product Catalogue</span><b>2026</b></div>
  <div class="cv-muv">
    <img class="cv-muv-logo" src="img/logo.png" alt="MUV">
    <div class="cv-bottles">
      <img src="img/cut_crimson.webp" alt=""><img src="img/cut_cloudwalk.webp" alt=""><img class="big" src="img/cut_rose.webp" alt=""><img src="img/cut_carwash.webp" alt=""><img src="img/cut_silk.webp" alt="">
    </div>
  </div>
</section>''')

# 2 — Seera divider
pages.append('''<section class="page div seera">
  <div class="div-plate">
    <img class="dl" src="img/seera_logo.png" alt="Seera">
    <img class="dt" src="img/seera_tagline.png" alt="सर्व शक्तिमान">
  </div>
  <img class="div-aatma" src="img/aatma_logo.webp" alt="Aatmanirbhar">
  <div class="div-brands"><span>Seera</span><i></i><span>Aatmanirbhar</span><i></i><span>Yuva</span><i></i><span>Shine Plus</span></div>
  <div class="div-packs">
    <img src="img/seera_cake_jumbo.webp" alt=""><img src="img/yuva_bar.webp" alt=""><img src="img/aatma_sachet.webp" alt="">
  </div>
  <div class="div-packs two">
    <img src="img/seera_powder_bag.webp" alt=""><img src="img/aatma_pouch.webp" alt=""><img src="img/shine_plus_filled.webp" alt=""><img class="tub" src="img/seera_bartan.webp" alt="">
  </div>
</section>''')


def page(brand, n, title, sub, sections):
    body = "".join(
        (f'<h4 class="sec {brand}">{escape(t)}</h4>' if t else "") + f'<div class="grid c{c}{" short" if short else ""}">{"".join(card(*x) for x in items)}</div>'
        for t, items, c, short in sections
    )
    return f'<section class="page prod">{header(brand, title, sub)}<div class="body">{body}</div>{footer(brand, n)}</section>'


pages.append(page("seera", 3, "Cakes &amp; Bartan Tub", "Seera · Aatmanirbhar · Yuva",
                  [("Detergent Cakes", SEERA_CAKES, 3, True), ("Bartan Tub", SEERA_BARTAN, 3, True)]))
pages.append(page("seera", 4, "Detergent Powders", "Seera · Aatmanirbhar · Shine Plus",
                  [("", SEERA_POWDERS, 3, True)]))

# 5 — MUV divider
lineup = ["cut_bathroom", "cut_glass", "cut_coolwater", "cut_dishwash", "cut_rose", "cut_toilet", "cut_lavender", "cut_crimson", "cut_oceanfresh"]
pages.append(f'''<section class="page div muv">
  <img class="mv-logo" src="img/logo.png" alt="MUV">
  <div class="mv-worlds"><span>Fabric Care</span><i></i><span>Home Care</span><i></i><span>Personal Care</span><i></i><span>Body Care</span><i></i><span>Car Care</span></div>
  <div class="mv-line">{"".join(f'<img src="img/{x}.webp" alt="">' for x in lineup)}</div>
</section>''')

pages.append(page("muv", 6, "Fabric Care", "Liquid Detergent", [("", MUV_FABRIC, 3, False)]))
pages.append(page("muv", 7, "Home Care", "Kitchen &amp; Floors", [("", MUV_HOME_A, 3, False)]))
pages.append(page("muv", 8, "Home Care", "Bathroom, Glass &amp; Hygiene", [("", MUV_HOME_B, 3, True), ("Hygiene", MUV_HYGIENE, 3, True)]))
pages.append(page("muv", 9, "Personal Care", "Hand Wash", [("", MUV_HAND, 2, True)]))
pages.append(page("muv", 10, "Body &amp; Car Care", "Body Wash · Car Wash", [("Body Care", MUV_BODY, 3, True), ("Car Care", MUV_CAR, 3, True)]))

# 11 — price list
def plist(groups):
    out = []
    for g, items in groups:
        out.append(f'<tr class="g"><td colspan="3">{g}</td></tr>')
        for name, line, _p, sizes, _k, _c in items:
            label = f"{name} — {line}" if line not in ("MUV",) else name
            for i, (s, m) in enumerate(sizes):
                out.append(f'<tr><td>{escape(label) if i == 0 else ""}</td><td>{escape(s)}</td><td class="m">{rupee(m)}</td></tr>')
    return "".join(out)


pages.append(f'''<section class="page prod list">
  <header class="band dual"><div class="title"><h2>Price List</h2><p>Weight &amp; MRP at a glance</p></div></header>
  <div class="lists">
    <div><div class="lh seera">Seera</div><table><thead><tr><th>Product</th><th>Weight</th><th class="m">MRP</th></tr></thead><tbody>{plist([("Detergent Cakes", SEERA_CAKES), ("Bartan Tub", SEERA_BARTAN), ("Detergent Powders", SEERA_POWDERS)])}</tbody></table></div>
    <div><div class="lh muv">MUV</div><table><thead><tr><th>Product</th><th>Size</th><th class="m">MRP</th></tr></thead><tbody>{plist([("Fabric Care", MUV_FABRIC), ("Home Care", MUV_HOME_A + MUV_HOME_B + MUV_HYGIENE), ("Personal Care", MUV_HAND), ("Body Care", MUV_BODY), ("Car Care", MUV_CAR)])}</tbody></table></div>
  </div>
  <p class="note">MRP inclusive of all taxes.</p>
  <footer class="foot dual"><span>Seera · MUV · Product Catalogue 2026</span><span>11</span></footer>
</section>''')

# 12 — back
pages.append('''<section class="page back">
  <div class="bk-seera"><div class="cv-plate"><img src="img/seera_logo.png" alt="Seera"></div><img class="bk-aatma" src="img/aatma_logo.webp" alt=""></div>
  <div class="bk-muv"><img src="img/logo.png" alt="MUV"></div>
</section>''')

html = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Seera · MUV Product Catalogue 2026</title>
<link rel="stylesheet" href="fonts3/local.css"><link rel="stylesheet" href="style3.css"></head><body>{"".join(pages)}</body></html>'''
open(sys.argv[1], "w").write(html)
print("pages:", len(pages))

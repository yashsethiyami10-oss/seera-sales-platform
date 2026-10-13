"""Seera + MUV combined sales brochure — product name, weight and MRP only.

MUV pack sizes/MRP mirror the live Seera SKU master
(prisma/migrations/20260816000000_seera_catalog_restoration/migration.sql).
Seera MRP: only the two Aatmanirbhar sachets have a Founder MRP so far; every other Seera SKU
has mrp=None and renders weight only until a real MRP is supplied (never invented).
"""
import sys
from html import escape

# ------------------------------------------------------------------ Seera
# (brand, product, weight, mrp|None, icon, colour)
# (brand, product, weight, mrp|None, photo|None, colour, photo scale)
SEERA_CAKES = [
    ("Seera", "Detergent Cake Blue", "180 g", None, "seera_cake_jumbo", "#2F6FD6", 1.0),
    ("Seera", "Detergent Cake White", "150 g", None, "aatma_sachet", "#9DB4D6", 1.0),
    ("Yuva", "Detergent Cake Blue", "170 g", None, None, "#2F6FD6", 1.0),
]
SEERA_BARTAN = [
    ("Seera", "Bartan Tub", "300 g", None, "seera_bartan", "#3FA36B", 0.82),
    ("Seera", "Bartan Tub", "500 g", None, "seera_bartan500", "#3FA36B", 1.0),
]
SEERA_POWDERS = [
    ("Seera", "Detergent Powder", "1 kg", None, "seera_powder_bag", "#E2552F", 1.0),
    ("Aatmanirbhar Seera", "Detergent Powder", "120 g", 10, "aatma_pouch", "#2A3FB8", 0.74),
    ("Aatmanirbhar Seera", "Detergent Powder", "300 g", 20, "aatma_pouch", "#2A3FB8", 0.95),
    ("Shine Plus", "Detergent Powder", "1 kg", None, "shine_plus_filled", "#1E9BB8", 0.74),
    ("Shine Plus", "Detergent Powder", "3 kg", None, "shine_plus_filled", "#1E9BB8", 0.87),
    ("Shine Plus", "Detergent Powder", "5 kg", None, "shine_plus_filled", "#1E9BB8", 1.0),
]

# ------------------------------------------------------------------ MUV
FABRIC = [
    ("Indian Rose Liquid Detergent", "#E0607A", "cut_rose", [("1 L", 155), ("5 L", 699)]),
    ("Lavender Garden Liquid Detergent", "#9C7BD8", "cut_lavender", [("1 L", 155), ("5 L", 699)]),
    ("Cool Water Liquid Detergent", "#7FB5E0", "cut_coolwater", [("1 L", 155), ("5 L", 699)]),
]
DISH = ("Dishwash Gel", "#E6D04A", "cut_dishwash", [("500 ml", 85), ("1 L", 155), ("5 L", 699)])
FLOOR = [("Velvet Mist", "#A891E0", [("1 L", 150), ("5 L", 549)]), ("Cloud Walk", "#6FA6E6", [("1 L", 150), ("5 L", 549)])]
BATH = [
    ("Toilet Cleaner", "#4D7BD1", "cut_toilet", [("500 ml", 80), ("5 L", 400)]),
    ("Bathroom Cleaner", "#E04848", "cut_bathroom", [("500 ml", 65)]),
    ("Glass Cleaner", "#3D8FE0", "cut_glass", [("500 ml", 90)]),
]
HYGIENE = [
    ("White Phenyl", "#E9E6DF", [("1 L", 60), ("5 L", 270)]),
    ("Black Phenyl", "#3A3536", [("1 L", 80)]),
    ("Bleach", "#BFD9E8", [("500 ml", 50)]),
]
HANDWASH = [
    ("Silk Blossom", "#E6A6D2", [("500 ml", 95)]),
    ("Ocean Fresh", "#6FB6E6", [("500 ml", 95), ("5 L", 725)]),
    ("Citrus Blast", "#F0A93C", [("250 ml", 80), ("500 ml", 95), ("5 L", 725)]),
    ("Life Shield", "#7CC4A0", [("250 ml", 80), ("500 ml", 95)]),
]
BODY = [
    ("Crimson Veil Body Wash", "#2F6B45", "cut_crimson", [("250 ml", 110), ("950 ml", 360)]),
    ("Velvet Oak Body Wash", "#B8402E", "cut_velvetoak", [("250 ml", 110), ("950 ml", 360)]),
    ("Midnight Frost Body Wash", "#2D47A8", "cut_midnight", [("250 ml", 110), ("950 ml", 360)]),
]
CAR = [("500 ml", 70), ("5 L", 550)]


def rupee(v):
    return f"₹{v:,}"


def chips(sizes):
    return '<div class="chips">' + "".join(
        f'<span class="chip"><span class="sz">{escape(s)}</span><span class="mrp">MRP {rupee(m)}</span></span>' for s, m in sizes
    ) + "</div>"


def img(name, cls="prod"):
    return f'<img class="{cls}" src="img/{name}.webp" alt="">'


def stage(name, accent, h):
    return f'<div class="stage" style="--accent:{accent};height:{h}"><div class="glow"></div><div class="floor"></div>{img(name)}</div>'


def card(name, accent, image, sizes, h="118mm"):
    return f'<article class="card">{stage(image, accent, h)}<h3>{escape(name)}</h3>{chips(sizes)}</article>'


def folio(n, brand):
    return f'<footer class="folio"><span>{brand}</span><span>{n:02d}</span></footer>'


def muv_head(title):
    return f'<div class="sec-head"><img class="mini-logo" src="img/logo.png" alt="MUV"><h2>{title}</h2></div>'


# simple illustrative pack icons (not product photos)
ICONS = {
    "cake": '<svg viewBox="0 0 120 80"><rect x="8" y="14" width="104" height="54" rx="16" fill="{c}"/><rect x="8" y="14" width="104" height="54" rx="16" fill="url(#sh)"/><rect x="22" y="26" width="76" height="30" rx="9" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2.5"/></svg>',
    "tub": '<svg viewBox="0 0 120 100"><ellipse cx="60" cy="22" rx="42" ry="11" fill="{c}"/><path d="M18 22v52c0 7 19 13 42 13s42-6 42-13V22c0 7-19 13-42 13S18 29 18 22z" fill="{c}"/><path d="M18 22v52c0 7 19 13 42 13s42-6 42-13V22c0 7-19 13-42 13S18 29 18 22z" fill="url(#sh)"/><ellipse cx="60" cy="22" rx="42" ry="11" fill="rgba(255,255,255,.28)"/></svg>',
    "bag": '<svg viewBox="0 0 100 120"><path d="M20 10h60l6 16v80a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6V26z" fill="{c}"/><path d="M20 10h60l6 16v80a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6V26z" fill="url(#sh)"/><path d="M14 26h72" stroke="rgba(255,255,255,.5)" stroke-width="2.5"/><circle cx="50" cy="66" r="18" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2.5"/></svg>',
    "sachet": '<svg viewBox="0 0 100 120"><path d="M22 8h56v8l-3 4 3 4v76l-3 4 3 4v4H22v-4l3-4-3-4V24l3-4-3-4z" fill="{c}"/><path d="M22 8h56v8l-3 4 3 4v76l-3 4 3 4v4H22v-4l3-4-3-4V24l3-4-3-4z" fill="url(#sh)"/><circle cx="50" cy="62" r="15" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="2.5"/></svg>',
}
SVG_DEFS = '<svg width="0" height="0" style="position:absolute"><defs><linearGradient id="sh" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient></defs></svg>'


def seera_tile(brand, product, weight, mrp, photo, colour, scale):
    mrp_html = f'<span class="s-mrp">MRP {rupee(mrp)}</span>' if mrp is not None else ""
    visual = (f'<img class="s-photo" style="--k:{scale}" src="img/{photo}.webp" alt="">' if photo
              else ICONS["cake"].format(c=colour))
    return f'''<article class="s-tile" style="--c:{colour}">
    <div class="s-icon">{visual}</div>
    <p class="s-brand">{escape(brand)}</p>
    <h3>{escape(product)}</h3>
    <div class="s-foot"><span class="s-wt">{escape(weight)}</span>{mrp_html}</div>
  </article>'''


def seera_page(n, groups):
    body = "".join(
        f'<h2 class="s-group">{title}</h2><div class="s-grid">{"".join(seera_tile(*t) for t in items)}</div>' for title, items in groups
    )
    return f'''<section class="page seera">
  <div class="s-head"><img src="img/seera_logo.png" alt="Seera"></div>
  {body}
  {folio(n, "Seera")}
</section>'''


pages = []

# 1 cover
pages.append('''<section class="page cover2">
  <div class="cv-top">
    <img class="cv-aatma" src="img/aatma_logo.webp" alt="Aatmanirbhar">
    <img class="cv-seera" src="img/seera_logo.png" alt="Seera">
  </div>
  <div class="cv-mid"><span>Product Catalogue · 2026</span></div>
  <div class="cv-bottom">
    <div class="cover-aura"></div>
    <img class="cv-muv" src="img/logo.png" alt="MUV">
    <div class="cv-row">
      <img src="img/cut_crimson.webp" alt=""><img src="img/cut_cloudwalk.webp" alt=""><img class="hero" src="img/cut_rose.webp" alt=""><img src="img/cut_carwash.webp" alt=""><img src="img/cut_silk.webp" alt="">
    </div>
  </div>
</section>''')

# 2 Seera opener
pages.append('''<section class="page seera s-open">
  <img class="s-aatma" src="img/aatma_logo.webp" alt="Aatmanirbhar">
  <div class="s-open-inner">
    <img class="s-big" src="img/seera_logo.png" alt="Seera">
    <img class="s-tag" src="img/seera_tagline.png" alt="">
    <div class="s-brands"><span>Seera</span><i></i><span>Yuva</span><i></i><span>Shine Plus</span></div>
  </div>
</section>''')

# 3-4 Seera products
pages.append(seera_page(3, [("Detergent Cakes", SEERA_CAKES), ("Bartan Tub", SEERA_BARTAN)]))
pages.append(seera_page(4, [("Detergent Powders", SEERA_POWDERS)]))

# 5 MUV opener — full lineup
lineup = ["cut_bathroom", "cut_glass", "cut_coolwater", "cut_dishwash", "cut_rose", "cut_toilet", "cut_lavender", "cut_crimson", "cut_oceanfresh"]
pages.append(f'''<section class="page muv-open">
  <div class="cover-aura"></div>
  <img class="mo-logo" src="img/logo.png" alt="MUV">
  <div class="mo-worlds">Fabric Care · Home Care · Personal Care · Body Care · Car Care</div>
  <div class="mo-line">{"".join(f'<img src="img/{n}.webp" alt="">' for n in lineup)}</div>
</section>''')

# 6 Fabric
pages.append(f'''<section class="page">
  {muv_head("Fabric Care")}
  <div class="grid3 tall">{"".join(card(n, a, i, s, "168mm") for n, a, i, s in FABRIC)}</div>
  {folio(6, "MUV")}
</section>''')

# 7 Home — dishwash + floor
pages.append(f'''<section class="page">
  {muv_head("Home Care")}
  <div class="duo">
    {card(DISH[0], DISH[1], DISH[2], DISH[3], "168mm")}
    <article class="card">{stage("cut_cloudwalk", "#6FA6E6", "168mm")}<h3>Floor Cleaner</h3>
      <div class="variants">{"".join(f'<div class="variant"><span class="dot" style="background:{a}"></span><b>{n}</b>{chips(s)}</div>' for n, a, s in FLOOR)}</div>
    </article>
  </div>
  {folio(7, "MUV")}
</section>''')

# 8 Bathroom & glass + hygiene
pages.append(f'''<section class="page">
  {muv_head("Home Care")}
  <div class="grid3">{"".join(card(n, a, i, s, "140mm") for n, a, i, s in BATH)}</div>
  <div class="tiles">{"".join(f'<article class="tile" style="--accent:{a}"><div class="swatch"></div><h4>{n}</h4>{chips(s)}</article>' for n, a, s in HYGIENE)}</div>
  {folio(8, "MUV")}
</section>''')

# 9 Hand wash
pages.append(f'''<section class="page">
  {muv_head("Personal Care")}
  <div class="hw2">
    {stage("cut_silk", "#E6A6D2", "160mm")}
    {stage("cut_oceanfresh", "#6FB6E6", "160mm")}
  </div>
  <h3 class="center">Hand Wash</h3>
  <div class="hw-table">{"".join(f'<div class="variant"><span class="dot" style="background:{a}"></span><b>{n}</b>{chips(s)}</div>' for n, a, s in HANDWASH)}</div>
  {folio(9, "MUV")}
</section>''')

# 10 Body
pages.append(f'''<section class="page">
  {muv_head("Body Care")}
  <div class="grid3 tall">{"".join(card(n, a, i, s, "168mm") for n, a, i, s in BODY)}</div>
  {folio(10, "MUV")}
</section>''')

# 11 Car
pages.append(f'''<section class="page car">
  <div class="car-bg" style="background-image:url(img/bg_carcare.jpg)"></div>
  <div class="car-shade"></div>
  <div class="car-text">
    <img class="mini-logo" src="img/logo.png" alt="MUV">
    <h2>Car Care</h2>
    <div class="car-product"><h3>Car Wash</h3>{chips(CAR)}</div>
  </div>
  <div class="car-hero"><div class="car-glow"></div><img src="img/cut_carwash.webp" alt=""></div>
  {folio(11, "MUV")}
</section>''')

# 12 back
pages.append('''<section class="page back2">
  <div class="b-seera"><img src="img/seera_logo.png" alt="Seera"></div>
  <div class="b-muv"><div class="cover-aura low"></div><img src="img/logo.png" alt="MUV"></div>
</section>''')

html = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Seera · MUV Catalogue</title>
<link rel="stylesheet" href="fonts/local.css"><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="style2.css">
</head><body>{SVG_DEFS}{"".join(pages)}</body></html>'''
open(sys.argv[1], "w").write(html)
print("pages:", len(pages))

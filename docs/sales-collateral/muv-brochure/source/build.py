"""Builds the MUV sales brochure HTML (with-price and no-price variants).

Commercial data (pack sizes, MRP) mirrors the live Seera SKU master as seeded by
prisma/migrations/20260816000000_seera_catalog_restoration/migration.sql.
"""
import sys
from html import escape

# ---------------------------------------------------------------- data
# (name, note, accent, image or None, [(size, mrp)])
FABRIC = [
    ("Indian Rose", "Liquid Detergent", "#E0607A", "cut_rose", [("1 L", 155), ("5 L", 699)]),
    ("Lavender Garden", "Liquid Detergent", "#9C7BD8", "cut_lavender", [("1 L", 155), ("5 L", 699)]),
    ("Cool Water", "Liquid Detergent", "#7FB5E0", "cut_coolwater", [("1 L", 155), ("5 L", 699)]),
]
KITCHEN_FLOOR = [
    ("Dishwash Gel", "Kitchen", "#E6D04A", "cut_dishwash", [("500 ml", 85), ("1 L", 155), ("5 L", 699)]),
]
FLOOR = [
    ("Velvet Mist", "Floor Cleaner", "#A891E0", [("1 L", 150), ("5 L", 549)]),
    ("Cloud Walk", "Floor Cleaner", "#6FA6E6", [("1 L", 150), ("5 L", 549)]),
]
BATH = [
    ("Toilet Cleaner", "Bathroom", "#4D7BD1", "cut_toilet", [("500 ml", 80), ("5 L", 400)]),
    ("Bathroom Cleaner", "Bathroom", "#E04848", "cut_bathroom", [("500 ml", 65)]),
    ("Glass Cleaner", "Glass & Mirrors", "#3D8FE0", "cut_glass", [("500 ml", 90)]),
]
HYGIENE = [
    ("White Phenyl", "Floors & Drains", "#E9E6DF", [("1 L", 60), ("5 L", 270)]),
    ("Black Phenyl", "Floors & Drains", "#3A3536", [("1 L", 80)]),
    ("Bleach", "Whitening & Hygiene", "#BFD9E8", [("500 ml", 50)]),
]
HANDWASH = [
    ("Silk Blossom", "#E6A6D2", [("500 ml", 95)]),
    ("Ocean Fresh", "#6FB6E6", [("500 ml", 95), ("5 L", 725)]),
    ("Citrus Blast", "#F0A93C", [("250 ml", 80), ("500 ml", 95), ("5 L", 725)]),
    ("Life Shield", "#7CC4A0", [("250 ml", 80), ("500 ml", 95)]),
]
BODY = [
    ("Crimson Veil", "Body Wash", "#2F6B45", "cut_crimson", [("250 ml", 110), ("950 ml", 360)]),
    ("Velvet Oak", "Body Wash", "#B8402E", "cut_velvetoak", [("250 ml", 110), ("950 ml", 360)]),
    ("Midnight Frost", "Body Wash", "#2D47A8", "cut_midnight", [("250 ml", 110), ("950 ml", 360)]),
]
CAR = [("500 ml", 70), ("5 L", 550)]

PRICE_LIST = [
    ("Fabric Care", [("Liquid Detergent — Indian Rose", FABRIC[0][4]), ("Liquid Detergent — Lavender Garden", FABRIC[1][4]), ("Liquid Detergent — Cool Water", FABRIC[2][4])]),
    ("Home Care", [("Dishwash Gel", KITCHEN_FLOOR[0][4]), ("Floor Cleaner — Velvet Mist", FLOOR[0][3]), ("Floor Cleaner — Cloud Walk", FLOOR[1][3]),
                   ("Toilet Cleaner", BATH[0][4]), ("Bathroom Cleaner", BATH[1][4]), ("Glass Cleaner", BATH[2][4]),
                   ("White Phenyl", HYGIENE[0][3]), ("Black Phenyl", HYGIENE[1][3]), ("Bleach", HYGIENE[2][3])]),
    ("Personal Care", [(f"Hand Wash — {n}", s) for n, _, s in HANDWASH]),
    ("Body Care", [(f"Body Wash — {n}", s) for n, _, _, _, s in BODY]),
    ("Car Care", [("Car Wash", CAR)]),
]
SKU_COUNT = sum(len(s) for _, rows in PRICE_LIST for _, s in rows)
PRODUCT_COUNT = sum(len(rows) for _, rows in PRICE_LIST)

SHOW_PRICE = sys.argv[1] == "price"


def rupee(v):
    return f"₹{v:,}"


def chips(sizes, light=False):
    cls = "chip light" if light else "chip"
    out = []
    for size, mrp in sizes:
        price = f'<span class="mrp">{rupee(mrp)}</span>' if SHOW_PRICE else ""
        out.append(f'<span class="{cls}"><span class="sz">{escape(size)}</span>{price}</span>')
    return f'<div class="chips">{"".join(out)}</div>'


def img(name, cls=""):
    return f'<img class="{cls}" src="img/{name}.webp" alt="">'


def stage(name, accent, h="96mm"):
    return f'''<div class="stage" style="--accent:{accent};height:{h}">
      <div class="glow"></div><div class="floor"></div>{img(name, "prod")}</div>'''


def product_card(name, note, accent, image, sizes, h="112mm"):
    return f'''<article class="card">
    {stage(image, accent, h)}
    <p class="eyebrow">{escape(note)}</p>
    <h3>{escape(name)}</h3>
    {chips(sizes)}
  </article>'''


def opener(num, world, line, bg, hero=None, accent="#B7ABF0", height="118mm", pos="center"):
    hero_html = f'<div class="opener-hero" style="--accent:{accent}">{img(hero)}</div>' if hero else ""
    return f'''<header class="opener" style="height:{height}">
    <div class="opener-bg" style="background-image:url(img/{bg}.jpg);background-position:{pos}"></div>
    <div class="opener-shade"></div>
    {hero_html}
    <div class="opener-text">
      <p class="eyebrow lav">Care World {num}</p>
      <h2>{world}</h2>
      <p class="line">{line}</p>
    </div>
  </header>'''


def folio(n, label):
    return f'<footer class="folio"><span>MUV · The Care Collection</span><span>{label}</span><span>{n:02d}</span></footer>'


def type_tile(name, note, accent, sizes):
    return f'''<article class="tile" style="--accent:{accent}">
    <div class="swatch"></div>
    <p class="eyebrow">{escape(note)}</p>
    <h4>{escape(name)}</h4>
    {chips(sizes)}
  </article>'''


pages = []

# 1 — cover
pages.append(f'''<section class="page cover">
  <div class="cover-aura"></div>
  <img class="logo" src="img/logo.png" alt="MUV">
  <div class="cover-title">
    <p class="eyebrow lav">Product Catalogue · 2026</p>
    <h1>The Care<br><em>Collection</em></h1>
    <p class="cover-sub">Home · Fabric · Personal · Body · Car</p>
  </div>
  <div class="cover-stage">
    <div class="cover-floor"></div>
    <img class="c c1" src="img/cut_midnight.webp" alt="">
    <img class="c c2" src="img/cut_cloudwalk.webp" alt="">
    <img class="c c3" src="img/cut_rose.webp" alt="">
    <img class="c c4" src="img/cut_carwash.webp" alt="">
    <img class="c c5" src="img/cut_silk.webp" alt="">
  </div>
  <p class="cover-foot">Keep Muving<sup>™</sup></p>
</section>''')

# 2 — belief + index
pages.append(f'''<section class="page intro">
  <div class="intro-cols">
    <div>
      <p class="eyebrow lav">Our Belief</p>
      <h2>Maintenance is not<br>beneath care.</h2>
      <p class="lede">The rituals we repeat every day shape how we live. Muv gives them the attention they deserve.</p>
      <p class="body">Muv exists because the unglamorous, repetitive parts of a life — wiping a counter,
      washing a shirt, cleaning a car — still deserve craftsmanship. Home, Fabric, Body, Personal, Car:
      one standard, held the same way across all five, because care isn&rsquo;t a category.</p>
    </div>
    <div>
      <div class="stats">
        <div><b>{PRODUCT_COUNT}</b><span>Products</span></div>
        <div><b>{SKU_COUNT}</b><span>Pack sizes</span></div>
        <div><b>5</b><span>Care Worlds</span></div>
      </div>
      <ol class="index">
        <li><span>01</span>Fabric Care<i>03</i></li>
        <li><span>02</span>Home Care<i>04</i></li>
        <li><span>03</span>Personal Care<i>06</i></li>
        <li><span>04</span>Body Care<i>07</i></li>
        <li><span>05</span>Car Care<i>08</i></li>
        <li><span>—</span>Quick Order Sheet<i>09</i></li>
      </ol>
    </div>
  </div>
  <div class="intro-family"><div class="fglow"></div><img src="img/family_cut.webp" alt=""></div>
  {folio(2, "Our Belief")}
</section>''')

# 3 — fabric
pages.append(f'''<section class="page">
  {opener("01", "Fabric Care", "For the clothes you live in. Three fragrances, one formula.", "bg_fabriccare", "cut_rose", "#E0607A")}
  <div class="grid3">{"".join(product_card(n, note, a, i, s) for n, note, a, i, s in FABRIC)}</div>
  <p class="footnote">Suitable for front load, top load and hand wash.</p>
  {folio(3, "Fabric Care")}
</section>''')

# 4 — home I: kitchen + floor
dish = KITCHEN_FLOOR[0]
pages.append(f'''<section class="page">
  {opener("02", "Home Care", "Kitchen, floors, bathroom, glass — the whole house, held to one standard.", "bg_homecare", "cut_cloudwalk", "#6FA6E6")}
  <div class="duo">
    <article class="card wide">
      {stage(dish[3], dish[2], "122mm")}
      <p class="eyebrow">{dish[1]}</p><h3>{dish[0]}</h3>
      <p class="desc">Lemon Fresh</p>
      {chips(dish[4])}
    </article>
    <article class="card wide">
      {stage("cut_cloudwalk", "#6FA6E6", "122mm")}
      <p class="eyebrow">Floors</p><h3>Floor Cleaner</h3>
      <div class="variants">
        {"".join(f'<div class="variant"><span class="dot" style="background:{a}"></span><b>{n}</b>{chips(s)}</div>' for n, _, a, s in FLOOR)}
      </div>
    </article>
  </div>
  {folio(4, "Home Care")}
</section>''')

# 5 — home II: bath + hygiene
pages.append(f'''<section class="page plain">
  <div class="sec-head">
    <p class="eyebrow lav">Care World 02 · continued</p>
    <h2>Bathroom &amp; Glass</h2>
  </div>
  <div class="grid3">{"".join(product_card(n, note, a, i, s, "118mm") for n, note, a, i, s in BATH)}</div>
  <div class="sec-head small">
    <p class="eyebrow lav">Hygiene Essentials</p>
  </div>
  <div class="tiles">{"".join(type_tile(n, note, a, s) for n, note, a, s in HYGIENE)}</div>
  {folio(5, "Home Care")}
</section>''')

# 6 — personal care: hand wash
pages.append(f'''<section class="page">
  {opener("03", "Personal Care", "Hand Wash in four fragrances. A small ritual, many times a day.", "bg_personalcare", "cut_silk", "#E6A6D2", pos="center 60%")}
  <div class="hw">
    <div class="hw-pair">
      {stage("cut_silk", "#E6A6D2", "128mm")}
      {stage("cut_oceanfresh", "#6FB6E6", "128mm")}
    </div>
    <div class="hw-list">
      <p class="eyebrow">Hand Wash · Fragrances</p>
      {"".join(f'<div class="variant"><span class="dot" style="background:{a}"></span><b>{n}</b>{chips(s)}</div>' for n, a, s in HANDWASH)}
    </div>
  </div>
  {folio(6, "Personal Care")}
</section>''')

# 7 — body care
pages.append(f'''<section class="page">
  {opener("04", "Body Care", "Body Wash in three signatures. Choose the one that feels like you.", "bg_bodycare", "cut_midnight", "#2D47A8", pos="center 40%")}
  <div class="grid3">{"".join(product_card(n, note, a, i, s) for n, note, a, i, s in BODY)}</div>
  <p class="footnote">With 1% Salicylic Acid · For all skin types</p>
  {folio(7, "Body Care")}
</section>''')

# 8 — car care
pages.append(f'''<section class="page car">
  <div class="car-bg" style="background-image:url(img/bg_carcare.jpg)"></div>
  <div class="car-shade"></div>
  <div class="car-text">
    <p class="eyebrow lav">Care World 05</p>
    <h2>Car Care</h2>
    <p class="line">The machine that carries you deserves the same care as the home you return to.</p>
    <div class="car-product">
      <p class="eyebrow">Car Wash</p>
      <h3>MUV Car Wash</h3>
      {chips(CAR)}
    </div>
  </div>
  <div class="car-hero">
    <div class="car-glow"></div>
    <img src="img/cut_carwash.webp" alt="">
  </div>
  {folio(8, "Car Care")}
</section>''')

# 9 — quick order sheet
rows = []
for world, items in PRICE_LIST:
    rows.append(f'<tr class="grp"><td colspan="4">{world}</td></tr>')
    for name, sizes in items:
        for i, (size, mrp) in enumerate(sizes):
            rows.append(
                f'<tr><td>{escape(name) if i == 0 else ""}</td><td>{escape(size)}</td>'
                + (f'<td class="num">{rupee(mrp)}</td>' if SHOW_PRICE else "")
                + '<td class="qty"></td></tr>'
            )
price_head = '<th class="num">MRP</th>' if SHOW_PRICE else ""
pages.append(f'''<section class="page plain order">
  <div class="sec-head">
    <p class="eyebrow lav">At a glance</p>
    <h2>Quick Order Sheet</h2>
  </div>
  <div class="order-meta"><span>Outlet</span><span>Date</span><span>Representative</span></div>
  <table class="pl">
    <thead><tr><th>Product</th><th>Pack</th>{price_head}<th class="qty">Qty</th></tr></thead>
    <tbody>{"".join(rows)}</tbody>
  </table>
  <p class="footnote left">{"MRP inclusive of all taxes. Prices subject to change without notice." if SHOW_PRICE else "Ask your MUV representative for current prices and schemes."}</p>
  {folio(9, "Quick Order Sheet")}
</section>''')

# 10 — back cover
pages.append('''<section class="page back">
  <div class="cover-aura low"></div>
  <div class="back-inner">
    <img class="logo big" src="img/logo.png" alt="MUV">
    <p class="back-line">Care for the rituals that carry life forward.</p>
    <div class="rep">
      <p class="eyebrow lav">Your MUV Representative</p>
      <div class="rep-line"><span>Name</span></div>
      <div class="rep-line"><span>Phone</span></div>
    </div>
    <p class="web">muv.co.in</p>
  </div>
  <p class="cover-foot">Keep Muving<sup>™</sup></p>
</section>''')

html = f'''<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>MUV Care Collection</title>
<link rel="stylesheet" href="fonts/local.css">
<link rel="stylesheet" href="style.css">
</head><body>{"".join(pages)}</body></html>'''
open(sys.argv[2], "w").write(html)
print(f"{PRODUCT_COUNT} products, {SKU_COUNT} SKUs -> {sys.argv[2]}")

"""Seera + MUV product catalogue — v6 "professional" (built by build5.py).

Design system
- Cover + page 2 show the family: Aatmanirbhar → Seera + MUV.
- Every product page = hero banner (category visual + hero pack + cleaning-type icons)
  + a shelf of 3D product cards (pack on a podium with reflection, name, weight, MRP tag).
- Seera = red / wash-blue world, MUV = deep violet world with its Care-World photography.
Data is shared with build3.py.
"""
import sys
from html import escape

src = open("build3.py").read()
exec(src[src.index("# ---------------------------------------------------------------- data"):src.index("BOTTLE = (")])

# ---- cleaning-type pictograms (white line icons) -------------------------------------------
I = {
    "shirt": '<path d="M9 7l5-3h4a4 4 0 0 0 8 0h4l5 3 4 8-6 3v18H11V18l-6-3z"/>',
    "bucket": '<path d="M8 13h28l-3 23H11z"/><path d="M8 13c0-6 28-6 28 0"/><circle cx="18" cy="23" r="2.2"/><circle cx="26" cy="20" r="1.6"/>',
    "machine": '<rect x="9" y="5" width="26" height="34" rx="3"/><circle cx="22" cy="24" r="8"/><path d="M13 11h6"/><circle cx="30" cy="11" r="1.4"/>',
    "dish": '<ellipse cx="22" cy="27" rx="15" ry="6"/><path d="M7 27c0 6 30 6 30 0"/><path d="M15 15c2-4 6-4 8 0M24 12c2-4 6-4 8 0"/>',
    "mop": '<path d="M30 5L19 26"/><path d="M12 27h16l2 9H10z"/><path d="M14 31v5M18 31v5M22 31v5M26 31v5"/>',
    "toilet": '<path d="M12 6h12v12H12z"/><path d="M8 18h28c0 8-6 12-12 12h-4c-6 0-12-4-12-12z"/><path d="M15 30l-2 8h14l-2-8"/>',
    "glass": '<rect x="7" y="6" width="30" height="32" rx="2"/><path d="M22 6v32M7 22h30"/><path d="M11 12l5-4M27 26l5-4"/>',
    "hands": '<path d="M10 30c-2-6 0-14 4-18l2 9M16 21l3-12 3 12 3-11 3 12"/><path d="M28 22l5-5c2 1 2 3 1 5l-6 9c-3 5-8 7-14 6"/>',
    "shower": '<path d="M10 38V12a6 6 0 0 1 12 0"/><path d="M16 14h12l-2 4H18z"/><path d="M18 22v3M22 22v4M26 22v3M20 28v3M24 28v3"/>',
    "car": '<path d="M6 28l3-9c1-3 3-4 6-4h14c3 0 5 1 6 4l3 9v6H6z"/><circle cx="13" cy="34" r="3"/><circle cx="31" cy="34" r="3"/><path d="M11 22h22"/>',
    "sparkle": '<path d="M22 6l3 10 10 3-10 3-3 10-3-10-10-3 10-3z"/><path d="M34 30l1.4 3.6L39 35l-3.6 1.4L34 40l-1.4-3.6L29 35l3.6-1.4z"/>',
}


def icon(k, label):
    return (f'<div class="ico"><svg viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="2.2" '
            f'stroke-linecap="round" stroke-linejoin="round">{I[k]}</svg><span>{label}</span></div>')


def rupee(v):
    return f"₹{v:,}"


BOTTLE_SVG = ('<svg class="pk ph" viewBox="0 0 80 160"><defs><linearGradient id="g{i}" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/>'
              '<stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient></defs>'
              '<rect x="29" y="2" width="22" height="16" rx="3" fill="#2a2a2a"/><path d="M27 18h26v10c8 4 13 10 13 20v100a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8V48c0-10 5-16 13-20z" fill="{c}"/>'
              '<path d="M27 18h26v10c8 4 13 10 13 20v100a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8V48c0-10 5-16 13-20z" fill="url(#g{i})"/>'
              '<rect x="21" y="66" width="38" height="54" rx="6" fill="#fff" opacity=".92"/><text x="40" y="90" text-anchor="middle" font-family="Poppins" font-weight="800" font-size="11" fill="#1A1446">MUV</text>'
              '<text x="40" y="104" text-anchor="middle" font-family="Poppins" font-weight="600" font-size="6" fill="#6A6E85">HAND WASH</text></svg>')
_bi = [0]


def card(name, line, photo, sizes, scale, colour):
    if photo:
        img = f'<img class="pk" style="--k:{scale}" src="img/{photo}.webp" alt="">'
        refl = f'<img class="rf" style="--k:{scale}" src="img/{photo}.webp" alt="">'
    else:
        _bi[0] += 1
        img, refl = BOTTLE_SVG.replace("{c}", colour).replace("{i}", str(_bi[0])), ""
    if len(sizes) == 1:
        s, m = sizes[0]
        tag = f'<div class="tag"><small>MRP</small>{rupee(m)}</div>' if m is not None else ""
        foot = f'<div class="one"><span class="wt">{escape(s)}</span>{tag}</div>'
    else:
        foot = '<div class="multi">' + "".join(
            f'<div class="r"><span class="wt">{escape(s)}</span><span class="pr"><small>MRP</small>{rupee(m)}</span></div>' for s, m in sizes) + "</div>"
    return f'''<article class="card" style="--c:{colour}">
    <div class="stage"><div class="podium"></div><div class="pkwrap">{img}{refl}</div></div>
    <div class="info"><p class="line">{escape(line)}</p><h3>{escape(name)}</h3>{foot}</div>
  </article>'''


def banner(brand, title, hindi, icons, bg=None, hero=None, hero_cls=""):
    logo = ('<div class="bchip"><img src="img/seera_logo.png" alt="Seera"></div><div class="bchip aat"><img src="img/aatma_logo.webp" alt=""></div>'
            if brand == "seera" else '<div class="bchip dark"><img src="img/logo.png" alt="MUV"></div>')
    bgstyle = f'style="background-image:url(img/{bg})"' if bg else ""
    heroes = "".join(f'<img src="img/{h}.webp" alt="">' for h in (hero or []))
    return f'''<header class="banner {brand}">
    <div class="bbg" {bgstyle}></div><div class="bshade"></div><div class="bubbles"></div>
    <div class="blogos">{logo}</div>
    <div class="btext"><h2>{title}</h2>{f'<p class="hi">{hindi}</p>' if hindi else ""}<div class="icons">{"".join(icon(k, l) for k, l in icons)}</div></div>
    <div class="bhero {hero_cls}">{heroes}</div>
  </header>'''


def page(brand, n, ban, sections):
    body = "".join(
        (f'<h4 class="sec">{escape(t)}</h4>' if t else "") + f'<div class="grid c{c} {size}">{"".join(card(*x) for x in items)}</div>'
        for t, items, c, size in sections)
    return f'''<section class="page prod {brand}">{ban}<div class="body">{body}</div>
  <footer class="foot"><span>{"SEERA" if brand == "seera" else "MUV"}</span><span class="fam">Brands of Aatmanirbhar · Product Catalogue 2026</span><b>{n:02d}</b></footer></section>'''


pages = []

# 1 — cover: the family
pages.append('''<section class="page cover">
  <div class="c-head">
    <img class="c-aatma" src="img/aatma_logo.webp" alt="Aatmanirbhar">
    <p class="c-presents">presents</p>
  </div>
  <div class="c-split">
    <div class="c-half seera">
      <div class="c-chip"><img src="img/seera_logo.png" alt="Seera"></div>
      <div class="c-packs"><img class="a" src="img/shine_plus_3d.webp" alt=""><img class="b" src="img/seera_powder_bag.webp" alt=""></div>
      <div class="c-bars"><img src="img/yuva_bar.webp" alt=""><img src="img/aatma_sachet.webp" alt=""></div>
      <p class="c-cats">Detergent Cakes · Powders · Bartan</p>
    </div>
    <div class="c-half muv">
      <div class="c-chip dark"><img src="img/logo.png" alt="MUV"></div>
      <div class="c-bottles"><img src="img/cut_silk.webp" alt=""><img class="big" src="img/cut_rose.webp" alt=""><img src="img/cut_crimson.webp" alt=""></div>
      <p class="c-cats">Fabric · Home · Personal · Body · Car Care</p>
    </div>
  </div>
  <div class="c-foot"><h1>Product Catalogue <b>2026</b></h1><p>Seera &nbsp;·&nbsp; MUV &nbsp;—&nbsp; Brands of Aatmanirbhar</p></div>
</section>''')

# 2 — our brands / index
pages.append('''<section class="page family">
  <div class="f-top"><img src="img/aatma_logo.webp" alt="Aatmanirbhar"><p>Our Brands</p></div>
  <div class="f-cols">
    <div class="f-col seera">
      <div class="f-logo"><img src="img/seera_logo.png" alt="Seera"></div>
      <img class="f-tag" src="img/seera_tagline.png" alt="सर्व शक्तिमान">
      <div class="f-packs"><img src="img/seera_powder_bag.webp" alt=""><img src="img/shine_plus_3d.webp" alt=""></div>
      <ul><li><span>Detergent Cakes</span><i>03</i></li><li><span>Bartan Tub</span><i>03</i></li><li><span>Detergent Powders</span><i>04</i></li></ul>
      <p class="f-sub">Seera · Aatmanirbhar · Yuva · Shine Plus</p>
    </div>
    <div class="f-col muv">
      <div class="f-logo dark"><img src="img/logo.png" alt="MUV"></div>
      <div class="f-packs"><img src="img/cut_lavender.webp" alt=""><img src="img/cut_dishwash.webp" alt=""><img src="img/cut_silk.webp" alt=""></div>
      <ul><li><span>Fabric Care</span><i>05</i></li><li><span>Home Care</span><i>06</i></li><li><span>Personal Care</span><i>08</i></li><li><span>Body Care</span><i>09</i></li><li><span>Car Care</span><i>10</i></li></ul>
      <p class="f-sub">Price list · page 11</p>
    </div>
  </div>
</section>''')

pages.append(page("seera", 3, banner("seera", "Detergent Cakes &amp; Bartan", "डिटर्जेंट केक · बर्तन टब",
                                     [("shirt", "Hand Wash"), ("bucket", "Bucket Wash"), ("dish", "Utensils")],
                                     hero=["yuva_bar", "aatma_sachet"], hero_cls="bars"),
                  [("Detergent Cakes", SEERA_CAKES, 3, "s2"), ("Bartan Tub", SEERA_BARTAN, 3, "s2")]))
pages.append(page("seera", 4, banner("seera", "Detergent Powders", "डिटर्जेंट पाउडर",
                                     [("machine", "Machine Wash"), ("bucket", "Bucket Wash"), ("shirt", "Whites &amp; Colours")],
                                     hero=["shine_plus_3d", "seera_powder_bag"], hero_cls="pouches"),
                  [("", SEERA_POWDERS, 3, "s2")]))
pages.append(page("muv", 5, banner("muv", "Fabric Care", "", [("machine", "Machine Wash"), ("bucket", "Hand Wash"), ("shirt", "Everyday Laundry")],
                                   bg="bg_fabriccare.jpg", hero=["cut_rose"]), [("", MUV_FABRIC, 3, "s1")]))
pages.append(page("muv", 6, banner("muv", "Home Care", "", [("dish", "Kitchen"), ("mop", "Floors"), ("sparkle", "Shine")],
                                   bg="bg_homecare.jpg", hero=["cut_cloudwalk"]), [("", MUV_HOME_A, 3, "s1")]))
pages.append(page("muv", 7, banner("muv", "Bathroom, Glass &amp; Hygiene", "", [("toilet", "Toilet"), ("glass", "Glass"), ("mop", "Floors &amp; Drains")],
                                   bg="bg_homecare.jpg", hero=["cut_toilet"]),
                  [("", MUV_HOME_B, 3, "s2"), ("", MUV_HYGIENE, 3, "s2")]))
pages.append(page("muv", 8, banner("muv", "Personal Care", "", [("hands", "Hand Wash")],
                                   bg="bg_personalcare.jpg", hero=["cut_silk"]), [("", MUV_HAND, 2, "s2")]))
pages.append(page("muv", 9, banner("muv", "Body Care", "", [("shower", "Bath &amp; Shower")],
                                   bg="bg_bodycare.jpg", hero=["cut_midnight"]), [("", MUV_BODY, 3, "s1")]))
pages.append(page("muv", 10, banner("muv", "Car Care", "", [("car", "Car Wash"), ("sparkle", "Shine")],
                                    bg="bg_carcare.jpg", hero=["cut_carwash"]), [("", MUV_CAR, 1, "s1 single")]))


def plist(groups):
    out = []
    for g, items in groups:
        out.append(f'<tr class="g"><td colspan="3">{g}</td></tr>')
        for name, line, _p, sizes, _k, _c in items:
            label = f"{name} — {line}" if line != "MUV" else name
            for i, (s, m) in enumerate(sizes):
                out.append(f'<tr><td>{escape(label) if i == 0 else ""}</td><td>{escape(s)}</td><td class="m">{rupee(m) if m is not None else "—"}</td></tr>')
    return "".join(out)


pages.append(f'''<section class="page plist">
  <div class="pl-head"><img src="img/aatma_logo.webp" alt=""><h2>Price List</h2><p>रेट लिस्ट · Weight &amp; MRP</p></div>
  <div class="lists">
    <div class="lcard seera"><div class="lh"><img src="img/seera_logo.png" alt="Seera"></div><table><tbody>{plist([("Detergent Cakes", SEERA_CAKES), ("Bartan Tub", SEERA_BARTAN), ("Detergent Powders", SEERA_POWDERS)])}</tbody></table></div>
    <div class="lcard muv"><div class="lh"><img src="img/logo.png" alt="MUV"></div><table><tbody>{plist([("Fabric Care", MUV_FABRIC), ("Home Care", MUV_HOME_A + MUV_HOME_B + MUV_HYGIENE), ("Personal Care", MUV_HAND), ("Body Care", MUV_BODY), ("Car Care", MUV_CAR)])}</tbody></table></div>
  </div>
  <footer class="foot plain"><span>MRP inclusive of all taxes</span><span class="fam">Brands of Aatmanirbhar · Product Catalogue 2026</span><b>11</b></footer>
</section>''')

pages.append('''<section class="page back">
  <img class="bk-aatma" src="img/aatma_logo.webp" alt="Aatmanirbhar">
  <div class="bk-brands"><div class="c-chip"><img src="img/seera_logo.png" alt="Seera"></div><div class="c-chip dark"><img src="img/logo.png" alt="MUV"></div></div>
  <p>Brands of Aatmanirbhar</p>
</section>''')

html = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Seera · MUV Product Catalogue 2026</title>
<link rel="stylesheet" href="fonts3/local.css"><link rel="stylesheet" href="style5.css"></head><body>{"".join(pages)}</body></html>'''
open(sys.argv[1], "w").write(html)
print("pages:", len(pages))

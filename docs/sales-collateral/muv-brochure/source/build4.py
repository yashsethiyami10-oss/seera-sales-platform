"""Seera + MUV product catalogue — v4 (playful retail/wholesale layout).

Bright section colours, soap-bubble decoration, sticker-style product cards with a hard
outline, and a yellow starburst carrying the MRP so a retailer reads the price first.
Product data is shared with v3 (exec'd from build3.py's data block).
Seera MRP of None -> no starburst, weight only (never invented).
"""
import sys
from html import escape

src = open("build3.py").read()
exec(src[src.index("# ---------------------------------------------------------------- data"):src.index("BOTTLE = (")])

BOTTLE = ('<svg class="ph" viewBox="0 0 80 160"><path d="M30 6h20v18c0 4 3 6 6 9 6 6 10 13 10 22v92a7 7 0 0 1-7 7H21a7 7 0 0 1-7-7V55'
          'c0-9 4-16 10-22 3-3 6-5 6-9z" fill="{c}" stroke="#1b1b1b" stroke-width="2.5"/><rect x="28" y="2" width="24" height="10" rx="3" fill="{c}" stroke="#1b1b1b" stroke-width="2.5"/>'
          '<rect x="22" y="70" width="36" height="46" rx="5" fill="#fff" stroke="#1b1b1b" stroke-width="2"/></svg>')

BURST_PTS = " ".join(
    f"{50 + (50 if i % 2 == 0 else 40) * __import__('math').cos(__import__('math').pi * i / 12):.1f},"
    f"{50 + (50 if i % 2 == 0 else 40) * __import__('math').sin(__import__('math').pi * i / 12):.1f}"
    for i in range(24)
)


def rupee(v):
    return f"₹{v:,}"


def burst(mrp):
    return (f'<div class="burst"><svg viewBox="0 0 100 100"><polygon points="{BURST_PTS}"/></svg>'
            f'<span><small>MRP</small>{rupee(mrp)}</span></div>')


def card(name, line, photo, sizes, scale, colour):
    visual = f'<img style="--k:{scale}" src="img/{photo}.webp" alt="">' if photo else BOTTLE.format(c=colour)
    single = len(sizes) == 1
    top = burst(sizes[0][1]) if single and sizes[0][1] is not None else ""
    if single:
        foot = f'<div class="wt-big">{escape(sizes[0][0])}</div>'
    else:
        foot = '<div class="chips">' + "".join(
            f'<span class="chip"><b>{escape(s)}</b><i>{rupee(m)}</i></span>' for s, m in sizes) + "</div>"
    return f'''<article class="card" style="--c:{colour}">
    {top}
    <div class="stage"><div class="blob"></div>{visual}</div>
    <div class="info"><p class="line">{escape(line)}</p><h3>{escape(name)}</h3>{foot}</div>
  </article>'''


def bubbles(seed):
    import random
    r = random.Random(seed)
    out = []
    for _ in range(9):
        s = r.uniform(8, 34)
        out.append(f'<i class="bub" style="width:{s:.0f}mm;height:{s:.0f}mm;left:{r.uniform(-5, 195):.0f}mm;top:{r.uniform(-5, 290):.0f}mm"></i>')
    return "".join(out)


def logo_sticker(brand):
    if brand == "seera":
        return '<div class="lsticker"><img class="ls" src="img/seera_logo.png" alt="Seera"></div><div class="lsticker aat"><img src="img/aatma_logo.webp" alt="Aatmanirbhar"></div>'
    return '<div class="lsticker dark"><img class="lm" src="img/logo.png" alt="MUV"></div>'


def page(theme, brand, n, title, hindi, sections):
    body = "".join(
        (f'<h4 class="sec">{escape(t)}</h4>' if t else "") + f'<div class="grid c{c}{" short" if short else ""}">{"".join(card(*x) for x in items)}</div>'
        for t, items, c, short in sections
    )
    return f'''<section class="page prod {theme}">
  {bubbles(n)}
  <header class="ph-head">{logo_sticker(brand)}<div class="ttl"><h2>{title}</h2>{f'<p class="hi">{hindi}</p>' if hindi else ""}</div></header>
  <div class="body">{body}</div>
  <footer class="pfoot"><span>{"SEERA" if brand == "seera" else "MUV"} · Product Catalogue 2026</span><b>{n:02d}</b></footer>
</section>'''


pages = []

pages.append(f'''<section class="page cover4">
  <div class="rays"></div>
  {bubbles(101)}
  <div class="c-top">
    <div class="lsticker big"><img class="ls" src="img/seera_logo.png" alt="Seera"></div>
    <div class="lsticker aat big2"><img src="img/aatma_logo.webp" alt="Aatmanirbhar"></div>
    <div class="c-seera-packs">
      <img class="p1" src="img/seera_powder_bag.webp" alt=""><img class="p2" src="img/shine_plus_filled.webp" alt=""><img class="p3" src="img/aatma_pouch.webp" alt="">
      <img class="p4" src="img/seera_bartan500.webp" alt=""><img class="p5" src="img/yuva_bar.webp" alt="">
    </div>
  </div>
  <div class="c-banner"><span>PRODUCT CATALOGUE</span><b>2026</b></div>
  <div class="c-bottom">
    <img class="c-muv" src="img/logo.png" alt="MUV">
    <div class="c-bottles"><img src="img/cut_crimson.webp" alt=""><img src="img/cut_cloudwalk.webp" alt=""><img class="big" src="img/cut_rose.webp" alt=""><img src="img/cut_carwash.webp" alt=""><img src="img/cut_silk.webp" alt=""></div>
  </div>
</section>''')

pages.append(f'''<section class="page div4 seera-div">
  <div class="rays"></div>
  {bubbles(102)}
  <div class="lsticker hero"><img class="ls" src="img/seera_logo.png" alt="Seera"><img class="tg" src="img/seera_tagline.png" alt="सर्व शक्तिमान"></div>
  <div class="lsticker aat corner"><img src="img/aatma_logo.webp" alt="Aatmanirbhar"></div>
  <div class="brand-chips"><span>Seera</span><span>Aatmanirbhar</span><span>Yuva</span><span>Shine Plus</span></div>
  <div class="fan">
    <img class="f1" src="img/seera_powder_bag.webp" alt=""><img class="f2" src="img/aatma_pouch.webp" alt=""><img class="f3" src="img/shine_plus_filled.webp" alt="">
  </div>
  <div class="fan bars"><img src="img/seera_cake_jumbo.webp" alt=""><img src="img/yuva_bar.webp" alt=""><img src="img/aatma_sachet.webp" alt=""><img class="tub" src="img/seera_bartan500.webp" alt=""></div>
</section>''')

pages.append(page("t-red", "seera", 3, "Cakes &amp; Bartan", "डिटर्जेंट केक · बर्तन टब",
                  [("Detergent Cakes", SEERA_CAKES, 3, True), ("Bartan Tub", SEERA_BARTAN, 3, True)]))
pages.append(page("t-blue", "seera", 4, "Detergent Powders", "डिटर्जेंट पाउडर", [("", SEERA_POWDERS, 3, True)]))

lineup = ["cut_bathroom", "cut_glass", "cut_coolwater", "cut_dishwash", "cut_rose", "cut_toilet", "cut_lavender", "cut_crimson", "cut_oceanfresh"]
pages.append(f'''<section class="page div4 muv-div">
  {bubbles(105)}
  <img class="mv-logo" src="img/logo.png" alt="MUV">
  <div class="brand-chips light"><span>Fabric Care</span><span>Home Care</span><span>Personal Care</span><span>Body Care</span><span>Car Care</span></div>
  <div class="mv-line">{"".join(f'<img src="img/{x}.webp" alt="">' for x in lineup)}</div>
</section>''')

pages.append(page("t-pink", "muv", 6, "Fabric Care", "", [("", MUV_FABRIC, 3, False)]))
pages.append(page("t-teal", "muv", 7, "Home Care", "", [("", MUV_HOME_A, 3, False)]))
pages.append(page("t-sky", "muv", 8, "Home Care", "", [("Bathroom & Glass", MUV_HOME_B, 3, True), ("Hygiene", MUV_HYGIENE, 3, True)]))
pages.append(page("t-lilac", "muv", 9, "Personal Care", "", [("", MUV_HAND, 2, True)]))
pages.append(page("t-navy", "muv", 10, "Body &amp; Car Care", "", [("Body Care", MUV_BODY, 3, True), ("Car Care", MUV_CAR, 3, True)]))


def plist(groups):
    out = []
    for g, items in groups:
        out.append(f'<tr class="g"><td colspan="3">{g}</td></tr>')
        for name, line, _p, sizes, _k, _c in items:
            label = f"{name} — {line}" if line != "MUV" else name
            for i, (s, m) in enumerate(sizes):
                out.append(f'<tr><td>{escape(label) if i == 0 else ""}</td><td>{escape(s)}</td><td class="m">{rupee(m) if m is not None else "—"}</td></tr>')
    return "".join(out)


pages.append(f'''<section class="page prod t-yellow list4">
  {bubbles(111)}
  <header class="ph-head"><div class="ttl"><h2>Price List</h2><p class="hi">रेट लिस्ट · Weight &amp; MRP</p></div></header>
  <div class="lists">
    <div class="lcard"><div class="lh seera">Seera</div><table><tbody>{plist([("Detergent Cakes", SEERA_CAKES), ("Bartan Tub", SEERA_BARTAN), ("Detergent Powders", SEERA_POWDERS)])}</tbody></table></div>
    <div class="lcard"><div class="lh muv">MUV</div><table><tbody>{plist([("Fabric Care", MUV_FABRIC), ("Home Care", MUV_HOME_A + MUV_HOME_B + MUV_HYGIENE), ("Personal Care", MUV_HAND), ("Body Care", MUV_BODY), ("Car Care", MUV_CAR)])}</tbody></table></div>
  </div>
  <footer class="pfoot"><span>MRP inclusive of all taxes</span><b>11</b></footer>
</section>''')

pages.append(f'''<section class="page back4">
  <div class="rays"></div>
  {bubbles(112)}
  <div class="lsticker center1"><img class="ls" src="img/seera_logo.png" alt="Seera"></div>
  <div class="lsticker aat center2"><img src="img/aatma_logo.webp" alt="Aatmanirbhar"></div>
  <div class="b-muv"><img src="img/logo.png" alt="MUV"></div>
</section>''')

html = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Seera · MUV Product Catalogue 2026</title>
<link rel="stylesheet" href="fonts3/local.css"><link rel="stylesheet" href="fonts4/local.css"><link rel="stylesheet" href="style4.css"></head><body>{"".join(pages)}</body></html>'''
open(sys.argv[1], "w").write(html)
print("pages:", len(pages))

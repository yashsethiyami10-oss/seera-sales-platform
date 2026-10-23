"""Builds WhatsApp announcement creatives for the S.S. price list launch (PNG, no trade rates on them).

Outputs: whatsapp/Seera_SS_Launch_Post_1080.png (1080x1080), whatsapp/Seera_SS_Launch_Status_1080x1920.png

Usage: python3 docs/seera/price-lists/build_ss_whatsapp_creatives.py
"""

import subprocess
from pathlib import Path

import build_ss_price_list as pl

OUT = Path(__file__).resolve().parent / "whatsapp"

CSS = """
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: __W__px; height: __H__px; overflow: hidden; background: #fff; }
body { font-family: 'Inter', sans-serif; color: #16183d; position: relative; -webkit-font-smoothing: antialiased; }
.bub { position: absolute; inset: 0; } .bub svg { width: 100%; height: 100%; }
.waves { position: absolute; left: 0; right: 0; bottom: 0; height: __WAVEH__px; } .waves svg { width: 100%; height: 100%; display: block; }
.in { position: absolute; inset: 0; padding: __PAD__px; display: flex; flex-direction: column; }
.eyebrow { font-size: __EB__px; letter-spacing: .28em; text-transform: uppercase; color: #f26b0f; font-weight: 700; }
.logo { width: __LOGOW__px; margin: __LOGOM__px 0 0 -6px; }
h1 { font-family: 'Inter Display', 'Inter', sans-serif; font-weight: 800; font-size: __H1__px; line-height: .95; letter-spacing: -.035em; margin-top: __H1M__px; }
h1 em { font-style: normal; color: #e0533f; display: block; }
.eff { display: inline-flex; align-items: center; gap: 18px; background: #16183d; color: #fff; border-radius: 14px; padding: 16px 26px; margin-top: __EFFM__px; align-self: flex-start; }
.eff small { font-size: 18px; letter-spacing: .24em; text-transform: uppercase; color: #f5c79b; font-weight: 700; }
.eff b { font-family: 'Inter Display', sans-serif; font-size: __EFFB__px; }
.news { display: grid; gap: 14px; margin-top: __NEWSM__px; max-width: __NEWSW__px; }
.news div { display: flex; align-items: center; gap: 16px; background: rgba(255,255,255,.88); border: 2px solid #16183d; border-radius: 16px; padding: 14px 20px; font-size: __NEWSF__px; font-weight: 600; }
.news b { background: #e0533f; color: #fff; font-size: __TAGF__px; letter-spacing: .14em; padding: 5px 12px; border-radius: 999px; flex: none; }
.seal { position: absolute; width: __SEAL__px; height: __SEAL__px; right: __SEALR__px; top: __SEALT__px; transform: rotate(-12deg); }
.seal svg { position: absolute; inset: 0; width: 100%; height: 100%; fill: #e0533f; filter: drop-shadow(0 14px 18px rgba(22,24,61,.28)); }
.seal div { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #fff; text-align: center; line-height: 1.02; }
.seal small { font-size: __SEALS__px; letter-spacing: .16em; text-transform: uppercase; font-weight: 700; }
.seal b { font-family: 'Inter Display', sans-serif; font-size: __SEALB__px; font-weight: 800; letter-spacing: -.02em; }
.seal i { font-style: normal; font-size: __SEALI__px; margin-top: 4px; opacity: .92; }
.base { position: absolute; left: __PAD__px; right: __PAD__px; bottom: __BASEB__px; display: flex; justify-content: space-between; align-items: flex-end; color: #fff; }
.base .t { height: __TAGH__px; }
.base span { font-size: __BASEF__px; letter-spacing: .2em; text-transform: uppercase; font-weight: 700; text-align: right; }
.base span em { font-style: normal; color: #f5c79b; display: block; }
"""

NEWS = [
    ("NEW", "Aatmanirbhar Powder · 120 g (MRP ₹10) & 3 kg"),
    ("NEW", "Seera Bartan Tub · 300 g & 500 g"),
    ("SCHEME", "3 pcs ₹10 powder FREE with every Box of cakes"),
]


def page(w: int, h: int, v: dict) -> str:
    logo = pl.image_data_uri(pl.ROOT / "public" / "seera logo.png", 900, transparent=True)
    tagline = pl.image_data_uri(pl.ROOT / "public" / "seera tagline.png", 900, transparent=True)
    css = CSS.replace("__W__", str(w)).replace("__H__", str(h))
    for k, val in v.items():
        css = css.replace(f"__{k}__", str(val))
    news = "".join(f"<div><b>{t}</b>{x}</div>" for t, x in NEWS)
    bubbles = pl.bubbles(v["NBUB"], w, h, 11, ["#e0533f", "#2e2f8f", "#f26b0f", "#4aa3df"], v["RMIN"], v["RMAX"], xmin=w * 0.5)
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head><body>
<div class="bub">{bubbles}</div>
<div class="waves">{pl.WAVES}</div>
<div class="in">
  <div class="eyebrow">For Super Stockists · Edition 2026</div>
  <img class="logo" src="{logo}" alt="Seera">
  <h1>New S.S.<em>Rate List</em></h1>
  <div class="eff"><small>Effective</small><b>{pl.EFFECTIVE}</b></div>
  <div class="news">{news}</div>
</div>
<div class="seal"><svg viewBox="0 0 100 100">{pl.starburst()}</svg><div><small>Scheme</small><b>3 PCS</b><small>Free / Box</small><i>on detergent cakes</i></div></div>
<div class="base"><img class="t" src="{tagline}" alt="Sarv Shaktimaan"><span>{len(pl.SEERA) + len(pl.MUV)} SKUs · 5 Brands<em>Seera · Yuva · Shine Plus · Aatmanirbhar · MUV</em></span></div>
</body></html>"""


SIZES = {
    "Seera_SS_Launch_Post_1080.png": (1080, 1080, dict(
        PAD=70, EB=20, LOGOW=250, LOGOM=26, H1=118, H1M=22, EFFM=28, EFFB=34, NEWSM=30, NEWSW=760, NEWSF=24, TAGF=15,
        SEAL=270, SEALR=60, SEALT=150, SEALS=19, SEALB=62, SEALI=16, WAVEH=230, BASEB=34, TAGH=56, BASEF=15,
        NBUB=16, RMIN=10, RMAX=52)),
    "Seera_SS_Launch_Status_1080x1920.png": (1080, 1920, dict(
        PAD=86, EB=24, LOGOW=380, LOGOM=170, H1=150, H1M=40, EFFM=56, EFFB=42, NEWSM=110, NEWSW=900, NEWSF=31, TAGF=18,
        SEAL=330, SEALR=60, SEALT=230, SEALS=22, SEALB=76, SEALI=19, WAVEH=420, BASEB=80, TAGH=80, BASEF=18,
        NBUB=26, RMIN=14, RMAX=70)),
}


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for name, (w, h, v) in SIZES.items():
        src = OUT / (name.rsplit(".", 1)[0] + ".html")
        src.write_text(page(w, h, v), encoding="utf-8")
        subprocess.run([pl.CHROME, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
                        f"--window-size={w},{h}", f"--screenshot={OUT / name}", src.as_uri()], check=True, capture_output=True)
        src.unlink()
        print(f"Wrote {OUT / name}")


if __name__ == "__main__":
    main()

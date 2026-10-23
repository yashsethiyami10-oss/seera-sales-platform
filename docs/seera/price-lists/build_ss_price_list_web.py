"""Builds the live (web) edition of the Super Stockist price list from the same data as the PDF.

Output: Seera_SS_Rate_List_Live.html — published as a claude.ai Artifact with the PDF attached
(published path `Seera_Super_Stockist_Price_List_2026.pdf`) for the in-page download button.

Usage: python3 docs/seera/price-lists/build_ss_price_list_web.py
"""

import json
import re
import shutil
from pathlib import Path

import build_ss_price_list as pl

OUT = Path(__file__).resolve().parent / "Seera_SS_Rate_List_Live.html"


def data() -> dict:
    seera = []
    for cat, code, name, brand, pack, case, unit, net, div, per, scheme in pl.SEERA:
        mrp = re.search(r"MRP ₹(\d+)", pack)
        basic = pl.money(net / (1 + pl.GST))
        seera.append({
            "cat": cat, "name": name, "brand": brand, "pack": re.sub(r"<.*", "", pack).strip(),
            "mrp": int(mrp.group(1)) if mrp else None, "case": case, "unit": unit, "net": net,
            "basic": basic, "gst": pl.money(net - basic), "each": pl.money(net / div),
            "per": per, "scheme": scheme,
        })
    muv = [{"cat": c, "code": code, "name": "MUV " + n, "pack": p, "mrp": m, "ss": ss}
           for c, code, n, p, m, ss, *_ in pl.MUV]
    return {"seera": seera, "muv": muv, "effective": pl.EFFECTIVE, "ref": pl.REF, "shine": pl.SHINE_PER_KG}


GOOGLE_FONTS = """<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Hind:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap">"""

# Company WhatsApp number for orders, digits with country code (e.g. "919876543210"). Empty = the
# viewer picks the chat in WhatsApp.
ORDER_WHATSAPP = ""

PDF_NAME = "Seera_Super_Stockist_Price_List_2026.pdf"
SITE_DIR = pl.ROOT / "public" / "rate-list"


def render(fonts: str, pdf_href: str) -> str:
    logo = pl.image_data_uri(pl.ROOT / "public" / "seera logo.png", 520, transparent=True)
    tagline = pl.image_data_uri(pl.ROOT / "public" / "seera tagline.png", 520, transparent=True)
    html = (Path(__file__).resolve().parent / "ss_rate_list_live.template.html").read_text(encoding="utf-8")
    return (html.replace("__FONTS__", fonts)
                .replace("__DATA__", json.dumps(data(), ensure_ascii=False))
                .replace("__ICONS__", json.dumps(pl.ICONS, ensure_ascii=False))
                .replace("__LOGO__", logo).replace("__TAGLINE__", tagline)
                .replace("__PDF__", pdf_href).replace("__ORDER_WA__", ORDER_WHATSAPP)
                .replace("__EFFECTIVE__", pl.EFFECTIVE).replace("__REF__", pl.REF))


def main() -> None:
    # claude.ai Artifact edition (page body only; the publisher adds the document skeleton)
    OUT.write_text(render(GOOGLE_FONTS, PDF_NAME), encoding="utf-8")
    print(f"Wrote {OUT}")

    # Website edition served at www.seeradetergent.in/rate-list (see next.config.ts rewrite). The
    # site CSP only allows self-hosted fonts, so the faces live in public/rate-list/fonts.
    fonts = "<style>" + (Path(__file__).resolve().parent / "site_fonts.css").read_text(encoding="utf-8") + "</style>"
    page = render(fonts, f"/rate-list/{PDF_NAME}")
    doc = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
           '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
           '<meta name="robots" content="noindex,nofollow">'
           '<meta name="description" content="Seera Super Stockist rate list and order planner.">'
           '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
           '[hidden]{display:none!important}img{max-width:100%}</style></head><body>' + page + "</body></html>")
    SITE_DIR.mkdir(parents=True, exist_ok=True)
    (SITE_DIR / "index.html").write_text(doc, encoding="utf-8")
    shutil.copyfile(Path(__file__).resolve().parent / PDF_NAME, SITE_DIR / PDF_NAME)
    print(f"Wrote {SITE_DIR / 'index.html'}")


if __name__ == "__main__":
    main()

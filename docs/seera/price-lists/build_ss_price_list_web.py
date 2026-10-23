"""Builds the live (web) edition of the Super Stockist price list from the same data as the PDF.

Output: Seera_SS_Rate_List_Live.html — published as a claude.ai Artifact with the PDF attached
(published path `Seera_Super_Stockist_Price_List_2026.pdf`) for the in-page download button.

Usage: python3 docs/seera/price-lists/build_ss_price_list_web.py
"""

import json
import re
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


def main() -> None:
    logo = pl.image_data_uri(pl.ROOT / "public" / "seera logo.png", 520, transparent=True)
    tagline = pl.image_data_uri(pl.ROOT / "public" / "seera tagline.png", 520, transparent=True)
    icons = {k: v for k, v in pl.ICONS.items()}
    html = (Path(__file__).resolve().parent / "ss_rate_list_live.template.html").read_text(encoding="utf-8")
    html = (html.replace("__DATA__", json.dumps(data(), ensure_ascii=False))
                .replace("__ICONS__", json.dumps(icons, ensure_ascii=False))
                .replace("__LOGO__", logo).replace("__TAGLINE__", tagline)
                .replace("__EFFECTIVE__", pl.EFFECTIVE).replace("__REF__", pl.REF))
    OUT.write_text(html, encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()

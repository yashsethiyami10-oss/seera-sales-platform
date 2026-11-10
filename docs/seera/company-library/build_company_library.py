"""Builds the built-in Company Documents library (PDF) shown in the Sales Executive / Sales Manager /
Founder portals ("Company documents").

Every document uses the same letterhead as the SEERA offer letters (logo, AATMANIRBHAR MANUFACTURERS,
GSTIN, footer with the company contact number). Change a value in COMPANY below and rebuild, and every
document picks it up.

Usage (from the repo root):
    python3 docs/seera/company-library/build_company_library.py /tmp/library-html
    node docs/seera/company-library/render.cjs /tmp/library-html content/company-library

The PDFs in content/company-library/ are what the app serves (lib/sales-distribution/company-library.ts
lists them). Blank values that the Founder has not decided yet are printed as fill-in lines.
"""
import base64
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent

COMPANY = {
    "name": "AATMANIRBHAR MANUFACTURERS",
    "brand": "SEERA",
    "gstin": "08GZNPS6419F1ZQ",
    "address": "Civil Lines, Gangapur, Dist. Bhilwara, Rajasthan – 311801",
    "phone": "+91 89053 40449",
    "email": "aatmanirbharmanufacturer@gmail.com",
    "web": "seeradetergent.in",
    "jurisdiction": "Gangapur, District Bhilwara (Rajasthan)",
}


def _b64(name: str) -> str:
    return "data:image/png;base64," + base64.b64encode((HERE / "assets" / name).read_bytes()).decode()


LOGO, TAG = _b64("logo.png"), _b64("tagline.png")
BLANK = "<span class='bl'></span>"
SBLANK = "<span class='bl s'></span>"

CSS = """
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', sans-serif; color: #1d2033; font-size: 9pt; line-height: 1.42; }
.page { width: 210mm; height: 297mm; position: relative; overflow: hidden; page-break-after: always; padding: 0 16mm; }
.page:last-child { page-break-after: auto; }
.topbar { position: absolute; top: 0; left: 0; right: 0; height: 2.6mm; background: #e0483e; }
.badge { position: absolute; top: 0; right: 16mm; background: #f07a2a; color: #fff; font-size: 7.4pt; padding: 0.9mm 2.4mm 1.2mm; }
.botbar { position: absolute; bottom: 0; left: 0; right: 0; height: 2.6mm; background: linear-gradient(90deg, #f07a2a 0 38%, #e0483e 38% 100%); }
.wm { position: absolute; left: 50%; top: 52%; width: 125mm; transform: translate(-50%, -50%); opacity: 0.04; z-index: 0; }
.content { position: relative; z-index: 1; }
header { display: flex; justify-content: space-between; align-items: flex-start; padding-top: 10mm; padding-bottom: 3mm; border-bottom: 0.5mm solid #e0483e; }
header img.logo { height: 21mm; }
header .co { text-align: right; }
header .co h1 { font-weight: 800; font-size: 16.5pt; letter-spacing: 0.02em; color: #22296b; }
header .co .sub { font-size: 8pt; color: #555a70; margin-top: 0.6mm; }
header .co .sub b { color: #22296b; }
header .co img.tag { height: 6mm; margin-top: 1.4mm; }
footer { position: absolute; left: 16mm; right: 16mm; bottom: 6.5mm; border-top: 0.25mm solid #dcdde6; padding-top: 2mm; font-size: 6.6pt; color: #6b7088; white-space: nowrap; display: flex; justify-content: space-between; }
footer b { color: #22296b; }
.title { text-align: center; margin: 3.5mm 0 3mm; }
.title h2 { color: #e0483e; letter-spacing: 0.26em; font-size: 14pt; font-weight: 700; }
.title .s { letter-spacing: 0.18em; font-size: 7.4pt; color: #6b7088; margin-top: 0.8mm; }
p { margin-bottom: 2.2mm; text-align: justify; }
h3 { color: #22296b; font-size: 10.2pt; font-weight: 700; border-left: 1.1mm solid #f07a2a; padding-left: 2.6mm; margin: 2.8mm 0 1.6mm; }
h4 { color: #e0483e; font-size: 9pt; font-weight: 700; margin: 2.2mm 0 1.2mm; }
.bl { display: inline-block; min-width: 34mm; border-bottom: 0.25mm solid #1d2033; height: 3.6mm; vertical-align: -0.6mm; }
.bl.s { min-width: 16mm; }
.meta { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 3.5mm; }
.meta .l { line-height: 1.95; }
.photo { width: 28mm; height: 33mm; border: 0.3mm dashed #8a8fa6; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 7.2pt; color: #6b7088; padding: 2mm; }
table.f { width: 100%; border-collapse: collapse; margin-bottom: 1mm; }
table.f td { border: 0.25mm solid #cfd1dc; padding: 0 2.4mm; height: 6.9mm; vertical-align: middle; }
table.f td.k { background: #f4f4f6; color: #22296b; font-weight: 600; width: 52mm; font-size: 8.4pt; }
table.f td.tall { height: 11mm; }
table.g { width: 100%; border-collapse: collapse; margin-bottom: 1mm; }
table.g th { background: #22296b; color: #fff; font-weight: 600; font-size: 8.2pt; padding: 1.5mm 2.4mm; text-align: left; }
table.g td { border: 0.25mm solid #cfd1dc; height: 6.9mm; padding: 0.8mm 2.4mm; font-size: 8.4pt; vertical-align: top; }
table.g td.n { width: 8mm; text-align: center; }
.cb { display: inline-block; width: 3.1mm; height: 3.1mm; border: 0.3mm solid #22296b; vertical-align: -0.5mm; margin: 0 1.1mm 0 2.6mm; }
.cb:first-child { margin-left: 0; }
.cols { display: grid; grid-template-columns: 1fr 1fr; column-gap: 8mm; }
.chk { list-style: none; padding: 0; }
.chk li { margin: 0 0 1.3mm; padding-left: 5.4mm; position: relative; font-size: 8.4pt; }
.chk li::before { content: ""; position: absolute; left: 0; top: 0.4mm; width: 3.1mm; height: 3.1mm; border: 0.3mm solid #22296b; }
.chk .grp { padding-left: 0; font-weight: 700; color: #e0483e; margin-top: 1.6mm; }
.chk .grp::before { display: none; }
ol.cl { padding-left: 5.6mm; }
ol.cl > li { margin-bottom: 1.6mm; text-align: justify; padding-left: 0.8mm; }
ol.cl > li b.h { color: #22296b; }
ul.bul { padding-left: 5mm; margin-bottom: 1.6mm; }
ul.bul li { margin-bottom: 1mm; }
.sigrow { display: flex; gap: 6mm; margin-top: 8mm; }
.sigrow div { flex: 1; border-top: 0.3mm solid #1d2033; padding-top: 1mm; font-size: 8pt; text-align: center; }
.sigs { display: grid; gap: 5mm; margin-top: 2.4mm; }
.sigbox { border: 0.3mm solid #cfd1dc; border-radius: 1.6mm; padding: 2.6mm 3mm; font-size: 8.2pt; line-height: 1.9; }
.sigbox b.t { color: #22296b; display: block; line-height: 1.4; margin-bottom: 6mm; }
.office { border: 0.4mm solid #22296b; border-radius: 1.6mm; padding: 2.4mm 3mm 3mm; margin-top: 2.6mm; }
.office .hd { font-weight: 700; color: #22296b; letter-spacing: 0.12em; font-size: 8.2pt; margin-bottom: 1.4mm; }
.seal { height: 16mm; border: 0.3mm dashed #8a8fa6; display: flex; align-items: center; justify-content: center; color: #8a8fa6; font-size: 7.4pt; }
.box { background: #fff6ef; border: 0.3mm solid #f6c9a8; border-radius: 1.6mm; padding: 2.4mm 3.2mm; margin: 1.6mm 0 2.4mm; font-size: 8.4pt; }
.small { font-size: 7.8pt; color: #555a70; }
.stamp-note { border: 0.3mm dashed #8a8fa6; padding: 2mm 3mm; text-align: center; font-size: 7.8pt; color: #555a70; margin-top: 3mm; }
"""


def page(ref: str, n: int, total: int, body: str) -> str:
    c = COMPANY
    return f"""<section class="page"><div class="topbar"></div><div class="badge">Page {n} of {total} · {ref}</div>
<img class="wm" src="{LOGO}"><div class="content">
<header><img class="logo" src="{LOGO}"><div class="co"><h1>{c['name']}</h1>
<div class="sub">Manufacturer of <b>{c['brand']}</b> Detergent · Home &amp; Fabric Care</div><div class="sub">GSTIN: {c['gstin']}</div>
<img class="tag" src="{TAG}"></div></header>{body}</div>
<footer><span>Office: {c['address']}</span><span><b>{c['phone']}</b> · {c['email']} · {c['web']}</span></footer><div class="botbar"></div></section>"""


def doc(ref: str, pages: list[str]) -> str:
    total = len(pages)
    return "".join(page(ref, i + 1, total, body) for i, body in enumerate(pages))


def cb(*opts: str) -> str:
    return "".join(f'<span class="cb"></span>{o}' for o in opts)


def rows(pairs) -> str:
    out = []
    for p in pairs:
        k, v, tall = (p + (False,))[:3] if len(p) == 2 else p
        out.append(f'<tr><td class="k">{k}</td><td{" class=tall" if tall else ""}>{v}</td></tr>')
    return '<table class="f">' + "".join(out) + "</table>"


def grid(headers, n, widths=None, first_col=None) -> str:
    widths = widths or [None] * len(headers)
    th = "".join(f'<th{f" style=width:{w}" if w else ""}>{h}</th>' for h, w in zip(headers, widths))
    body = ""
    for i in range(n):
        cells = [f"<td><b>{first_col[i]}</b></td>" if first_col else "<td></td>"] + ["<td></td>"] * (len(headers) - 1)
        body += "<tr>" + "".join(cells) + "</tr>"
    return f'<table class="g"><tr>{th}</tr>{body}</table>'


def title(name: str, sub: str) -> str:
    return f'<div class="title"><h2>{name}</h2><div class="s">{sub}</div></div>'


def form_head(name: str, sub: str, photo: str = "Affix passport-size photograph of Proprietor / Managing Partner<br><br>(sign across)") -> str:
    return f"""<div class="meta"><div class="l">Application No.: {BLANK}<br>Date: {BLANK}<br>Sales Officer / ASM: {BLANK}</div>
<div class="photo">{photo}</div></div>{title(name, sub)}"""


def recommend(roles) -> str:
    return grid(["Role", "Name", "Signature", "Date"], len(roles), ["58mm", "50mm", "36mm", None], roles)


def office(fields) -> str:
    return f"""<div class="office"><div class="hd">FOR OFFICE USE ONLY</div><div style="display:flex;gap:5mm">
<div style="flex:1">{rows([(f, "") for f in fields])}</div>
<div style="width:46mm;display:flex;flex-direction:column;justify-content:space-between"><div class="seal">Company Seal</div>
<div style="font-size:8pt;margin-top:6mm;border-top:0.3mm solid #1d2033;padding-top:1mm">For <b>{COMPANY['name']}</b><br>Proprietor / Authorised Signatory</div></div></div></div>"""


def applicant_sign() -> str:
    return '<div class="sigrow"><div>Signature of Applicant</div><div>Name &amp; Designation</div><div>Firm Stamp</div><div>Place &amp; Date</div></div>'


def checklist(left, right) -> str:
    def col(items):
        return '<ul class="chk">' + "".join(f'<li class="grp">{x[1:]}</li>' if x.startswith("#") else f"<li>{x}</li>" for x in items) + "</ul>"
    return f'<div class="cols">{col(left)}{col(right)}</div>'


def clauses(items) -> str:
    return '<ol class="cl">' + "".join(f'<li><b class="h">{h}.</b> {t}</li>' for h, t in items) + "</ol>"


# ---------------------------------------------------------------------------------------------
# Distributor
# ---------------------------------------------------------------------------------------------
def distributor_form() -> str:
    ref = "SEERA/DIST/FORM/2026-27"
    p1 = form_head("DISTRIBUTOR APPOINTMENT FORM", "SEERA · HOME &amp; FABRIC CARE · TO BE FILLED IN CAPITAL LETTERS") + f"""
<h3>A. Firm Details</h3>{rows([
        ("Legal name of firm", ""), ("Trade / shop name (if different)", ""),
        ("Constitution", cb("Proprietorship", "Partnership", "LLP", "Pvt. Ltd.", "Other ______")),
        ("Year of establishment", ""), ("GST status", cb("Regular", "Composition", "Unregistered")),
        ("GSTIN", ""), ("Firm PAN", ""), ("Shop &amp; Establishment / Trade licence no.", ""),
        ("Business address", "", True), ("Town / District / State / PIN", ""),
        ("Godown address (if different)", ""), ("Google Maps location / Lat-Long", "")])}
<h3>B. Proprietor / Partner Details</h3>
{grid(["Name", "Father's name", "Mobile", "Aadhaar no.", "PAN"], 3, ["38mm", "34mm", "26mm", "32mm", None])}
{rows([("Email ID", ""), ("WhatsApp / alternate mobile", "")])}
<h3>C. Trade References</h3>
{grid(["Name / firm", "Relationship (supplier / company)", "Town", "Mobile"], 2, ["50mm", "48mm", "34mm", None])}"""
    p2 = f"""<h3>D. Business Profile</h3>{rows([
        ("Years in distribution", ""), ("Last financial year turnover (₹)", ""),
        ("Outlets billed per month (number)", ""),
        ("Outlet mix", cb("Kirana / General", "Wholesale", "Modern trade", "Other ______")),
        ("Godown", cb("Owned", "Rented") + "&nbsp;&nbsp; Area: ________ sq ft"),
        ("Delivery vehicles", cb("Van / Pick-up", "Three-wheeler", "Two-wheeler") + "&nbsp; No.: ____"),
        ("Staff", "Salesmen: ______ &nbsp;&nbsp;&nbsp; Delivery staff: ______"),
        ("Billing system", cb("Tally", "Other software", "Manual")),
        ("Smartphone for Seera App", cb("Yes", "No"))])}
<p class="small" style="margin:1.2mm 0 1mm"><b>Brands / companies currently handled</b></p>
{grid(["Brand / Company", "Category", "Since (year)", "Monthly turnover (₹)"], 4, ["52mm", "44mm", "26mm", None])}
<h3>E. Proposed Coverage &amp; Commercials</h3>{rows([
        ("Town / district / areas applied for", "", True), ("Mapped Super Stockist (name &amp; code)", ""),
        ("Number of beats / outlets per beat", ""), ("Opening order value (₹)", ""),
        ("Projected monthly purchase (₹)", "Months 1–3: ____________ &nbsp;&nbsp;&nbsp; Months 4–6: ____________"),
        ("Security deposit (₹)", "Amount: ________ &nbsp; Mode: " + cb("NEFT / RTGS", "UPI", "Cheque")),
        ("UTR / Cheque no. &amp; date", "")])}
<h3>F. Bank Details (Business Account)</h3>{rows([
        ("Account holder name", ""), ("Bank &amp; branch", ""), ("Account number", ""), ("IFSC", ""),
        ("Account type", cb("Current", "Savings", "Cash Credit / OD"))])}"""
    p3 = f"""<h3>G. Documents Enclosed <span class="small">(self-attested copies — tick)</span></h3>{checklist(
        ["#Firm", "Firm PAN card", "GST registration certificate (or declaration if unregistered / composition)",
         "Partnership deed / Incorporation certificate / Proprietorship declaration", "Shop &amp; Establishment / Trade licence",
         "#Proprietor / Partners", "PAN and Aadhaar of proprietor / each partner", "2 passport-size photographs", "Residential address proof"],
        ["#Financial", "Last 1 year ITR", "Last 6 months bank statement", "Cancelled cheque of business account",
         "2 undated security cheques (if credit is extended)", "#Infrastructure &amp; Market", "Godown rent agreement / ownership proof",
         "Geo-tagged photos: godown, shop front, stock area", "Outlet list (name, area, type, mobile) and day-wise beat plan"])}
<h3>H. Declaration by Applicant</h3><p style="margin-bottom:1mm">I / We hereby declare and agree that:</p>{clauses([
        ("True information", "All information in this form and the enclosed documents is true and complete. The Company may verify it; false information makes this application and any appointment liable to cancellation"),
        ("Source &amp; area", "I / We will buy SEERA products only from the Company-mapped Super Stockist or the Company, and sell only within the area allotted to me / us"),
        ("Pricing", "I / We will follow the Company price list, schemes and MRP, and will never sell above MRP or below the approved rate"),
        ("Payments", "All payments will be made only to the bank account / official UPI of the Company or the mapped Super Stockist; supplies are dispatched only after full payment, unless credit is approved by the Company in writing"),
        ("Finalisation", "Appointment is final only after Company approval, signing of the Distributor Agreement, receipt of the security deposit and onboarding on the Seera App")])}
{applicant_sign()}
<h3>I. Recommendation</h3>{recommend(["Sales Officer / SSO", "Area Sales Manager", "Mapped Super Stockist", "Sales Head – U.P. / M.P."])}
{office(["Distributor code", "Seera App partner ID", "Security deposit receipt no.", "KYC verified by (Accounts)", "Date of activation"])}"""
    return doc(ref, [p1, p2, p3])


def parties_block(rows_):
    return "".join(f'<p><b>{i}. {name}</b>, {desc} (hereinafter called the <b>“{short}”</b>).</p>' for i, (name, desc, short) in enumerate(rows_, 1))


def agreement_sigs(parties) -> str:
    cols = len(parties)
    boxes = "".join(f'<div class="sigbox"><b class="t">For {p}</b>Signature &amp; Stamp: {BLANK}<br>Name: {BLANK}<br>Designation: {BLANK}<br>Date &amp; Place: {BLANK}</div>' for p in parties)
    wit = "".join(f'<div class="sigbox"><b class="t" style="margin-bottom:6mm">Witness {i}</b>Signature: {BLANK}<br>Name &amp; Address: {BLANK}</div>' for i in (1, 2))
    return f'<div class="sigs" style="grid-template-columns:repeat({cols},1fr)">{boxes}</div><div class="sigs" style="grid-template-columns:1fr 1fr">{wit}</div>'


STAMP_NOTE = '<div class="stamp-note">To be executed on non-judicial stamp paper of ₹ ______ as applicable in the State of execution. Template for Company use — review by the Company\'s legal counsel before first signing.</div>'


def distributor_agreement() -> str:
    ref = "SEERA/DIST/AGR/2026-27"
    c = COMPANY
    p1 = title("DISTRIBUTOR AGREEMENT", "THREE-PARTY · COMPANY · SUPER STOCKIST · DISTRIBUTOR") + f"""
<p>This Distributor Agreement (“Agreement”) is made at {BLANK} on this {SBLANK} day of {BLANK} 20{SBLANK}, between:</p>
{parties_block([
        (c['name'], f"a proprietorship firm having its office at {c['address']}, GSTIN {c['gstin']}, manufacturer of SEERA products, through its Proprietor / Authorised Signatory", "Company"),
        (f"M/s {BLANK}", f"GSTIN {BLANK}, having its place of business at {BLANK}{BLANK}, through its {BLANK}", "Super Stockist"),
        (f"M/s {BLANK}", f"GSTIN {BLANK}, having its place of business at {BLANK}{BLANK}, through its {BLANK}", "Distributor")])}
<p>The Company, the Super Stockist and the Distributor are each a “Party”. The Distributor has applied to distribute SEERA products and the Company, on the recommendation of its sales team and the Super Stockist, has agreed to appoint it on the terms below.</p>
<h3>Terms</h3>{clauses([
        ("Nature", "This is a principal-to-principal buyer-reseller arrangement. The Distributor buys and sells in its own name. Nothing in this Agreement creates an agency, partnership, franchise or employment"),
        ("Territory", f"The Distributor may sell only in the town / areas / beats listed in Annexure A: {BLANK}{BLANK}. Any sale outside the allotted area is a breach"),
        ("Exclusivity", f"The appointment is {cb('exclusive', 'non-exclusive')} for general trade in the territory. The Company keeps modern trade, institutional, e-commerce and direct accounts"),
        ("Term", f"{SBLANK} months from the effective date {BLANK}, renewable in writing after a performance review"),
        ("Source of supply", "The Distributor shall buy SEERA products only from the mapped Super Stockist (or the Company where no Super Stockist is mapped). Parallel or grey-market buying is prohibited"),
        ("Pricing", "The Distributor buys at the Company-notified distributor price and sells to retailers at the notified retailer price, never above MRP. Price lists and schemes are notified by the Company in writing and in the Seera App"),
        ("Payment", f"Payment to the Super Stockist: {cb('100% advance', f'credit of ____ days up to ₹ ________')}, as recorded in the Seera App. Payments are made only to the bank account / official UPI of the Super Stockist or the Company — never in cash to any field employee. Goods are dispatched only after the full billing amount is received, unless credit is approved in writing"),
        ("Security deposit", f"₹ {BLANK}, interest-free, held by {cb('Company', 'Super Stockist')}, refundable on exit after settlement of all dues, claims and stock"),
        ("Credit to retailers", "Any credit given to retailers is at the Distributor's own risk; the Company does not guarantee retailer dues"),
        ("Coverage &amp; stock", f"Cover every listed outlet as per the beat plan at least {SBLANK} times a month, deliver retailer orders within {SBLANK} hours, and keep at least {SBLANK} days' stock of every active SKU"),
        ("Targets", "Monthly purchase, secondary-sales, outlet-count and productive-call targets are given in Annexure B and reviewed every quarter"),
        ("Seera App", "The Distributor and its sales and delivery staff shall use the Seera App for orders, stock, deliveries, payments and claims. Records outside the App are not recognised")])}"""
    p2 = clauses([
        ("Billing", "GST-compliant invoices in the Distributor's own name (or bill of supply if under composition / unregistered) for every sale; no unbilled or cash-only sale"),
        ("Returns, damage &amp; expiry", f"Transit damage is reported within 48 hours with photos. Retailer returns and near-expiry stock are handled only as per the Company returns policy. Claims are filed through the Seera App within {SBLANK} days with proof and settled by credit note"),
        ("Brand standards", "The Distributor and its staff shall follow the SEERA Brand Standards Code (Annexure D). A breach of the Code is a material breach of this Agreement"),
        ("Confidentiality", f"Price lists, schemes, margins, partner and retailer data and App access are confidential during the term and for {SBLANK} years after it"),
        ("Termination without cause", f"Any Party may terminate with {SBLANK} days' written notice"),
        ("Termination for cause", "Immediately, by written notice, on out-of-area sale, price undercutting or above-MRP sale, parallel buying, counterfeit or tampered stock, fraud, cheque dishonour, or breach of the Brand Standards Code"),
        ("Exit settlement", f"Saleable stock in original condition is taken back by the Super Stockist at {SBLANK}% of purchase price; dues are adjusted against the security deposit; the outlet list and data are handed over to the Company; App access is closed"),
        ("Dispute resolution", f"Disputes are first discussed in good faith, then referred to a sole arbitrator under the Arbitration and Conciliation Act, 1996, seated at {COMPANY['jurisdiction']}. This Agreement is governed by the laws of India and courts at {COMPANY['jurisdiction']} have exclusive jurisdiction"),
        ("Entire agreement", "This Agreement with its Annexures is the entire understanding of the Parties. Any change is valid only in writing signed by all Parties"),
    ]).replace('<ol class="cl">', '<ol class="cl" start="13">') + f"""
<h4>Annexures</h4><p class="small">A — Area and beat list · B — Targets · C — Price list (current Company price list in the Seera App) · D — SEERA Brand Standards Code · E — KYC copies</p>
<p>IN WITNESS WHEREOF the Parties have signed this Agreement on the date and place first written above.</p>
{agreement_sigs([COMPANY['name'], "Super Stockist", "Distributor"])}{STAMP_NOTE}"""
    return doc(ref, [p1, p2])


# ---------------------------------------------------------------------------------------------
# Super Stockist
# ---------------------------------------------------------------------------------------------
def ss_form() -> str:
    ref = "SEERA/SS/FORM/2026-27"
    p1 = form_head("SUPER STOCKIST APPOINTMENT FORM", "SEERA · HOME &amp; FABRIC CARE · TO BE FILLED IN CAPITAL LETTERS") + f"""
<h3>A. Firm Details</h3>{rows([
        ("Legal name of firm", ""), ("Trade name (if different)", ""),
        ("Constitution", cb("Proprietorship", "Partnership", "LLP", "Pvt. Ltd.", "Other ______")),
        ("Year of establishment", ""), ("GSTIN", ""), ("Firm PAN", ""), ("Udyam (MSME) no., if any", ""),
        ("Registered office address", "", True), ("Warehouse address with PIN", "", True),
        ("Google Maps location / Lat-Long", ""), ("Office phone / email", "")])}
<h3>B. Promoters &amp; Authorised Signatory</h3>
{grid(["Name", "Designation", "Mobile", "PAN", "Aadhaar no.", "Share %"], 3, ["36mm", "24mm", "26mm", "26mm", "30mm", None])}
{rows([("Authorised signatory for Seera transactions", "")])}"""
    p2 = f"""<h3>C. Business Profile</h3>{rows([
        ("Years in FMCG distribution", ""),
        ("Turnover (₹) — last 2 financial years", "FY ________ : ____________ &nbsp;&nbsp; FY ________ : ____________"),
        ("Distributors currently serviced (number)", ""), ("Towns / districts covered", "", True),
        ("Warehouse", cb("Owned", "Rented") + "&nbsp; Area: ______ sq ft &nbsp; " + cb("Ground floor", "Goods lift")),
        ("Delivery vehicles (number &amp; type)", ""),
        ("Staff", "Sales: ____ &nbsp;&nbsp; Accounts: ____ &nbsp;&nbsp; Godown: ____"),
        ("Billing software / e-invoicing", cb("Tally", "Other software") + "&nbsp; e-Invoice: " + cb("Yes", "No"))])}
<p class="small" style="margin:1.2mm 0 1mm"><b>Brands / companies currently handled</b></p>
{grid(["Brand / Company", "Category", "Since (year)", "Monthly turnover (₹)"], 3, ["52mm", "44mm", "26mm", None])}
<h3>D. Commercial Proposal</h3>{rows([
        ("Territory applied for (state / zone / districts)", "", True), ("Proposed opening order value (₹)", ""),
        ("Projected monthly purchase (₹)", "M 1–3: ________ &nbsp; M 4–6: ________ &nbsp; M 7–12: ________"),
        ("Distributors proposed (names / towns)", "", True),
        ("Security deposit (₹) &amp; mode", "Amount: ________ &nbsp; " + cb("RTGS / NEFT", "DD", "Bank guarantee")),
        ("UTR / DD / BG no. &amp; date", "")])}
<h3>E. Bank Details (Business Account)</h3>{rows([
        ("Account holder name", ""), ("Bank &amp; branch", ""), ("Account number", ""), ("IFSC", ""),
        ("Account type", cb("Current", "Cash Credit / OD", "Savings"))])}
<h3>F. Trade References (brand companies or banks)</h3>
{grid(["Name", "Company / bank", "Town", "Mobile"], 2, ["46mm", "54mm", "32mm", None])}"""
    p3 = f"""<h3>G. Documents Enclosed <span class="small">(self-attested copies; originals shown at verification)</span></h3>{checklist(
        ["#Firm", "Firm PAN card", "GST registration certificate (GSTIN active)", "Partnership deed / MOA-AOA + COI / Proprietorship declaration",
         "Shop &amp; Establishment / Trade licence", "Udyam (MSME) certificate, if registered", "Authority letter / resolution naming the authorised signatory",
         "#Promoters / Partners", "PAN and Aadhaar of each proprietor / partner / director", "2 passport-size photographs of each", "Residential address proof"],
        ["#Financial", "Last 2 years ITR with computation", "Last 2 years balance sheet and P&amp;L (if applicable)", "Last 6 months bank statement",
         "Cancelled cheque of business account", "2 undated security cheques (or bank guarantee)", "GSTR-1 / GSTR-3B for last 6 months",
         "#Infrastructure", "Warehouse deed / rent agreement + electricity bill", "Geo-tagged photos: warehouse, stock area, office", "Vehicle RC copies; list of distributors serviced"])}
<h3>H. Declaration by Applicant</h3>{clauses([
        ("True information", "The information above is true and complete. A false statement makes this application void and allows the Company to terminate any appointment made on it"),
        ("Rules", "I / We have read the Super Stockist eligibility criteria and the SEERA Brand Standards Code and agree to follow them"),
        ("Payment &amp; dispatch", "Company orders are placed against 100% advance; goods are dispatched only after the full billing amount is received in the Company's bank account"),
        ("Finalisation", "Appointment is final only after Founder approval, signing of the Super Stockist Agreement, receipt of the security deposit and onboarding on the Seera App")])}
{applicant_sign()}
<h3>I. Evaluation &amp; Recommendation</h3>{rows([("ASM visit date &amp; scorecard total (out of 100)", "")])}
{recommend(["Area Sales Manager", "Sales Head – U.P. / M.P.", "Approved by (Founder)"])}
{office(["Super Stockist code", "Seera App partner ID", "Security deposit receipt no.", "KYC verified by (Accounts)", "Date of activation"])}"""
    return doc(ref, [p1, p2, p3])


def ss_agreement() -> str:
    ref = "SEERA/SS/AGR/2026-27"
    c = COMPANY
    p1 = title("SUPER STOCKIST AGREEMENT", "PRINCIPAL-TO-PRINCIPAL · BUYER-RESELLER") + f"""
<p>This Super Stockist Agreement (“Agreement”) is made at {BLANK} on this {SBLANK} day of {BLANK} 20{SBLANK}, between:</p>
{parties_block([
        (c['name'], f"a proprietorship firm having its office at {c['address']}, GSTIN {c['gstin']}, manufacturer of SEERA products, through its Proprietor / Authorised Signatory", "Company"),
        (f"M/s {BLANK}", f"GSTIN {BLANK}, having its place of business at {BLANK}{BLANK}, through its {BLANK}", "Super Stockist")])}
<p>The Super Stockist has applied to stock and distribute SEERA products in the territory below, and the Company has agreed to appoint it on these terms.</p>
<h3>Terms</h3>{clauses([
        ("Nature", "Principal-to-principal. The Super Stockist buys and resells in its own name; no agency, partnership, franchise or employment is created"),
        ("Territory", f"{BLANK}{BLANK} (state / zone / districts), as per Annexure A. No primary sale outside the territory without written approval"),
        ("Exclusivity", f"{cb('Exclusive', 'Non-exclusive')} for the territory. The Company may sell directly to institutional, modern-trade and e-commerce accounts"),
        ("Term", f"{SBLANK} months from the effective date {BLANK}; renewal by mutual written consent after a performance review"),
        ("Products", f"SEERA SKUs in the current Company price list. The Company may add, change or discontinue SKUs with {SBLANK} days' notice"),
        ("Pricing &amp; margin", f"The Super Stockist buys at the Company price list to Super Stockist and resells to distributors only at the Company-notified distributor price. Margin of {SBLANK}% is built into the price list; schemes are notified separately in writing"),
        ("Payment", "100% advance against pro-forma invoice. An order is confirmed only after Accounts verifies the payment (RTGS / NEFT / UPI with UTR) in the Company's bank account, and goods are dispatched only after the full billing amount is received"),
        ("Security deposit", f"₹ {BLANK}, interest-free, refundable on exit after settlement of dues and stock"),
        ("Stock norm", f"Maintain at least {SBLANK} days of average sales for every active SKU; no stock-out of the top {SBLANK} SKUs"),
        ("Targets", "Monthly and quarterly purchase targets are given in Annexure B and reviewed every quarter"),
        ("Distributor appointment", "The Super Stockist may propose distributors; an appointment is final only after Company approval and issue of a partner code"),
        ("Distributor servicing", f"Supply appointed distributors within {SBLANK} working days of a confirmed order; any credit to distributors is at the Super Stockist's own risk and within Company guidelines")])}"""
    p2 = clauses([
        ("Seera App &amp; reporting", f"Use the Seera App / partner portal for orders, stock, dispatch, payments and claims; share closing stock by the {SBLANK}th of each month"),
        ("Billing", "GST-compliant invoices in the Super Stockist's own name, with e-invoice / e-way bill where applicable"),
        ("Damage &amp; expiry", f"Transit damage reported within 48 hours with photos. Near-expiry stock ({SBLANK} months before expiry) handled as per the Company returns policy"),
        ("Claims", f"Scheme and damage claims filed within {SBLANK} days with supporting documents; settled by credit note"),
        ("Brand standards", "The Super Stockist and its distributors shall follow the SEERA Brand Standards Code (Annexure D); a breach is a material breach"),
        ("Confidentiality", f"Price lists, schemes, partner data and App access are confidential during the term and for {SBLANK} years after it"),
        ("Termination without cause", f"Either Party with {SBLANK} days' written notice"),
        ("Termination for cause", "Immediately, on price undercutting, out-of-territory sale, counterfeit or tampered stock, cheque dishonour, fraud, repeated target shortfall, or breach of the Brand Standards Code"),
        ("Exit settlement", f"Saleable stock taken back at {SBLANK}% of purchase price; dues adjusted against the security deposit; App access closed"),
        ("Dispute resolution", f"Good-faith discussion, then arbitration by a sole arbitrator under the Arbitration and Conciliation Act, 1996, seated at {COMPANY['jurisdiction']}. Indian law applies and courts at {COMPANY['jurisdiction']} have exclusive jurisdiction"),
        ("Entire agreement", "This Agreement with its Annexures is the entire understanding of the Parties. Any change is valid only in writing signed by both Parties"),
    ]).replace('<ol class="cl">', '<ol class="cl" start="13">') + f"""
<h4>Annexures</h4><p class="small">A — Territory map · B — Targets · C — Price list and margins · D — SEERA Brand Standards Code · E — KYC copies</p>
<p>IN WITNESS WHEREOF the Parties have signed this Agreement on the date and place first written above.</p>
{agreement_sigs([COMPANY['name'], "Super Stockist"])}{STAMP_NOTE}"""
    return doc(ref, [p1, p2])


# ---------------------------------------------------------------------------------------------
# Depot (Carrying & Forwarding agent)
# ---------------------------------------------------------------------------------------------
def depot_form() -> str:
    ref = "SEERA/DEPOT/FORM/2026-27"
    p1 = form_head("DEPOT (C&amp;F) APPOINTMENT FORM", "SEERA · DEPOT / CARRYING &amp; FORWARDING AGENT · TO BE FILLED IN CAPITAL LETTERS") + f"""
<h3>A. Firm Details</h3>{rows([
        ("Legal name of firm", ""),
        ("Constitution", cb("Proprietorship", "Partnership", "LLP", "Pvt. Ltd.", "Other ______")),
        ("Year of establishment", ""), ("GSTIN", ""), ("Firm PAN", ""),
        ("Office address", "", True), ("Town / District / State / PIN", ""), ("Office phone / email", "")])}
<h3>B. Proprietor / Partner Details</h3>
{grid(["Name", "Father's name", "Mobile", "Aadhaar no.", "PAN"], 3, ["38mm", "34mm", "26mm", "32mm", None])}
<h3>C. Proposed Depot Premises</h3>{rows([
        ("Depot address with PIN", "", True), ("Google Maps location / Lat-Long", ""),
        ("Premises", cb("Owned", "Rented") + "&nbsp; Rent / lease valid till: ____________"),
        ("Covered area (sq ft) / clear height (ft)", ""),
        ("Floor &amp; access", cb("Ground floor", "Truck can reach dock", "Loading platform")),
        ("Condition", cb("Pucca roof", "Dry / no seepage", "Pest-free", "Pallets / racks")),
        ("Safety &amp; security", cb("Fire extinguishers", "CCTV", "Watchman", "Lockable shutters")),
        ("Godown insurance (fire &amp; burglary)", cb("Yes", "No") + "&nbsp; Insurer / sum insured: ____________")])}"""
    p2 = f"""<h3>D. Operations Capability</h3>{rows([
        ("Experience as C&amp;F / depot agent (years &amp; companies)", "", True),
        ("Staff", "Depot in-charge: ____ &nbsp;&nbsp; Accountant: ____ &nbsp;&nbsp; Loaders: ____"),
        ("Transport", cb("Own trucks / vans", "Transporter tie-up") + "&nbsp; Details: ____________"),
        ("Computer, internet &amp; printer", cb("Yes", "No") + "&nbsp; Billing software: ____________"),
        ("Smartphone for Seera App", cb("Yes", "No")),
        ("Super Stockists / Distributors that can be served from this depot", "", True),
        ("Average dispatch capacity (cases per day)", "")])}
<p class="small" style="margin:1.2mm 0 1mm"><b>Companies / brands currently handled as C&amp;F, depot or distributor</b></p>
{grid(["Company / Brand", "Role", "Since (year)", "Monthly volume / value"], 3, ["52mm", "40mm", "26mm", None])}
<h3>E. Commercials</h3>{rows([
        ("Security deposit (₹) &amp; mode", "Amount: ________ &nbsp; " + cb("RTGS / NEFT", "DD", "Bank guarantee")),
        ("UTR / DD / BG no. &amp; date", ""),
        ("Remuneration proposed", cb("% of dispatch value: ____", "Fixed ₹ ______ / month", "Per case ₹ ____")),
        ("Expected start date", "")])}
<h3>F. Bank Details</h3>{rows([
        ("Account holder name", ""), ("Bank &amp; branch", ""), ("Account number", ""), ("IFSC", "")])}
<h3>G. References</h3>{grid(["Name", "Company / bank", "Town", "Mobile"], 2, ["46mm", "54mm", "32mm", None])}"""
    p3 = f"""<h3>H. Documents Enclosed <span class="small">(self-attested copies — tick)</span></h3>{checklist(
        ["#Firm &amp; owners", "Firm PAN and GST certificate", "Partnership deed / COI / Proprietorship declaration", "Shop &amp; Establishment / Trade licence",
         "PAN and Aadhaar of each owner / partner", "2 passport-size photographs of each"],
        ["#Premises &amp; financial", "Ownership deed / rent agreement + electricity bill", "Geo-tagged photos: outside, inside, loading area",
         "Godown insurance policy copy", "Last 2 years ITR; last 6 months bank statement", "Cancelled cheque of business account"])}
<h3>I. Declaration by Applicant</h3>{clauses([
        ("True information", "The information above is true and complete; false information makes this application and any appointment liable to cancellation"),
        ("Company stock", "Stock received at the depot remains the property of the Company until sold; I / We will store it safely, insured, and dispatch it only against Company-approved orders"),
        ("Records", "All receipts, dispatches, stock and returns will be recorded in the Seera App, and I / We will allow stock verification by the Company at any time"),
        ("Payments", "Buyers pay only into the Company's bank account / official UPI; goods are dispatched only after the full billing amount is received, unless the Company approves credit in writing"),
        ("Finalisation", "Appointment is final only after Founder approval, signing of the Depot Agreement and receipt of the security deposit")])}
{applicant_sign()}
<h3>J. Recommendation</h3>{recommend(["Sales Head – U.P. / M.P.", "Accounts", "Approved by (Founder)"])}
{office(["Depot code", "Seera App location ID", "Security deposit receipt no.", "Premises verified by / date", "Date of activation"])}"""
    return doc(ref, [p1, p2, p3])


def depot_agreement() -> str:
    ref = "SEERA/DEPOT/AGR/2026-27"
    c = COMPANY
    p1 = title("DEPOT (C&amp;F AGENT) AGREEMENT", "CARRYING &amp; FORWARDING · COMPANY STOCK HELD IN TRUST") + f"""
<p>This Depot Agreement (“Agreement”) is made at {BLANK} on this {SBLANK} day of {BLANK} 20{SBLANK}, between:</p>
{parties_block([
        (c['name'], f"a proprietorship firm having its office at {c['address']}, GSTIN {c['gstin']}, manufacturer of SEERA products, through its Proprietor / Authorised Signatory", "Company"),
        (f"M/s {BLANK}", f"GSTIN {BLANK}, having its place of business at {BLANK}{BLANK}, through its {BLANK}", "Depot Agent")])}
<p>The Company wishes to keep stock of SEERA products closer to its markets and the Depot Agent has offered its premises and services to receive, store and dispatch that stock on the terms below.</p>
<h3>Terms</h3>{clauses([
        ("Appointment &amp; area", f"The Company appoints the Depot Agent as its carrying &amp; forwarding agent at the depot premises at {BLANK}{BLANK}, to serve Super Stockists / Distributors in {BLANK}{BLANK} (Annexure A)"),
        ("Nature", "The Depot Agent acts on the Company's instructions for handling stock. It does not buy or sell SEERA products on its own account and has no authority to bind the Company to any buyer"),
        ("Title &amp; risk", "All stock received at the depot remains the Company's property and is held in trust. The Depot Agent is responsible for its safe custody from receipt until dispatch and is liable for any shortage, damage or loss caused while in its custody"),
        ("Premises &amp; insurance", "Keep the depot dry, clean, pest-free and secure, with stock on pallets / racks, fire extinguishers and lockable access. Keep the stock insured against fire and burglary for its full value, with the Company named as loss payee"),
        ("Receipt", "Check every consignment against the Company invoice / stock-transfer note, record it in the Seera App the same day, and report shortage or damage within 24 hours with photos and the transporter's remark"),
        ("Dispatch", "Dispatch only against Company-approved orders shown in the Seera App, only after the Company confirms that the full billing amount is received (unless credit is approved in writing), in FEFO order, with the documents required under GST (invoice / e-way bill)"),
        ("Records &amp; verification", "Keep accurate stock, receipt, dispatch and return records in the Seera App. The Company may verify physical stock at any time; a monthly stock statement is shared by the 5th of each month and any difference is settled by the Depot Agent at the Company's billing price"),
        ("Collections", "The Depot Agent shall not collect cash or payments from buyers on the Company's behalf unless authorised in writing; all payments go only to the Company's bank account / official UPI"),
        ("Remuneration", f"{cb('____% of the value of goods dispatched', 'fixed ₹ ________ per month', '₹ ____ per case handled')}, payable monthly against the Depot Agent's GST invoice after reconciliation of the stock statement. Loading / unloading and local freight: {BLANK}"),
        ("Security deposit", f"₹ {BLANK}, interest-free, refundable on exit after full stock reconciliation and settlement of dues")])}"""
    p2 = clauses([
        ("Returns &amp; expiry", "Receive returns only with Company approval, keep returned, damaged and near-expiry stock separate, and never dispatch expired or damaged stock"),
        ("Compliance", "The Depot Agent holds all licences required for the premises and its business, complies with GST, labour and local laws for its staff, and is solely responsible for its own employees"),
        ("Brand standards", "Follow the SEERA Brand Standards Code for storage, handling and conduct; a breach is a material breach"),
        ("Confidentiality", "Stock, price, partner and buyer information and Seera App access are confidential during the term and for 2 years after it"),
        ("Term", f"{SBLANK} months from {BLANK}; renewable by mutual written consent"),
        ("Termination", f"Either Party with {SBLANK} days' written notice; the Company may terminate immediately for shortage, misuse or unauthorised sale of stock, fraud, or unsafe storage"),
        ("Exit handover", "On expiry or termination the Depot Agent hands over all Company stock, documents and records within 7 days after a joint physical verification; the security deposit is refunded after settlement"),
        ("Dispute resolution", f"Good-faith discussion, then arbitration by a sole arbitrator under the Arbitration and Conciliation Act, 1996, seated at {COMPANY['jurisdiction']}. Indian law applies and courts at {COMPANY['jurisdiction']} have exclusive jurisdiction"),
        ("Entire agreement", "This Agreement with its Annexures is the entire understanding of the Parties; any change is valid only in writing signed by both Parties"),
    ]).replace('<ol class="cl">', '<ol class="cl" start="11">') + f"""
<h4>Annexures</h4><p class="small">A — Depot premises and service area · B — Remuneration schedule · C — SEERA Brand Standards Code · D — KYC and premises documents · E — Insurance policy copy</p>
<p>IN WITNESS WHEREOF the Parties have signed this Agreement on the date and place first written above.</p>
{agreement_sigs([COMPANY['name'], "Depot Agent"])}{STAMP_NOTE}"""
    return doc(ref, [p1, p2])


# ---------------------------------------------------------------------------------------------
# Common
# ---------------------------------------------------------------------------------------------
def appointment_letter() -> str:
    ref = "SEERA/APPT/2026-27"
    body = f"""<div class="meta"><div class="l">Ref. No.: {BLANK}</div><div class="l">Date: {BLANK}</div></div>
<p style="margin-top:3mm">To,<br><b>M/s {BLANK}{BLANK}</b><br>{BLANK}{BLANK}{BLANK}<br>GSTIN: {BLANK}</p>
{title("LETTER OF APPOINTMENT", "SUPER STOCKIST · DISTRIBUTOR · DEPOT")}
<p><b>Subject:</b> Appointment as {cb('Super Stockist', 'Distributor', 'Depot (C&amp;F Agent)')} for {BLANK}{BLANK}</p>
<p>Dear {BLANK},</p>
<p>We are pleased to appoint <b>M/s {BLANK}{BLANK}</b> as our {BLANK} for the territory / area of {BLANK}{BLANK}, with effect from {BLANK}, for a period of {SBLANK} months, under the agreement dated {BLANK}.</p>
{rows([
        ("Partner / depot code", ""), ("Seera App login (mobile no.)", ""),
        ("Mapped Super Stockist / supplier (if applicable)", ""), ("Opening order value received (₹)", ""),
        ("Security deposit received (₹) &amp; receipt no.", ""), ("Company contact", f"Sales Head: {BLANK} &nbsp; ASM: {BLANK}")])}
<p>This appointment is subject to the terms of the agreement and the SEERA Brand Standards Code. Orders are dispatched only after the full billing amount is received in the Company's bank account, and all orders, stock, payments and claims are to be recorded in the Seera App.</p>
<p>Your onboarding kit includes: the signed agreement, current price list and scheme circular, territory / beat map and targets, product catalogue, returns and claims policy, the Brand Standards Code and your Seera App login.</p>
<p>We welcome you to the SEERA family and look forward to growing together.</p>
<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:6mm">
<div style="width:80mm">For <b>{COMPANY['name']}</b><div style="height:16mm"></div><div style="border-top:0.3mm solid #1d2033;padding-top:1mm"><b>Proprietor</b><br>Authorised Signatory</div></div>
<div class="seal" style="width:40mm">Company Seal</div></div>
<div class="sigrow" style="margin-top:10mm"><div>Accepted by (Partner signature &amp; stamp)</div><div>Name</div><div>Date</div></div>"""
    return doc(ref, [body])


def brand_code() -> str:
    ref = "SEERA/BSC/2026-27"
    sec = lambda h, items: f"<h4>{h}</h4><ul class='bul'>" + "".join(f"<li>{i}</li>" for i in items) + "</ul>"
    p1 = title("SEERA BRAND STANDARDS CODE", "FOR SUPER STOCKISTS · DISTRIBUTORS · DEPOTS AND THEIR STAFF") + """
<p>Every Super Stockist, Distributor, Depot and their staff sign this Code. A breach is treated as a material breach of their agreement. SEERA products must reach the consumer looking, priced and described exactly as the Company intends.</p>""" + sec("1. Storage and handling", [
        "Store stock in a clean, dry, covered area, off the floor on pallets or racks, away from direct sunlight, heat, moisture, strong chemicals and pesticides.",
        "Keep detergents and home-care products separate from food items and personal-care products.",
        "Follow FEFO (first-expiry, first-out). Never sell expired stock; segregate near-expiry stock and report it.",
        "Do not open, repack, relabel, re-sticker or alter cartons, batch numbers, MRP or expiry dates.",
        "Handle cartons upright; damaged or leaking units are not sold and are reported with photos within 48 hours."]) + sec("2. Pricing discipline", [
        "Sell only at Company-notified price levels: Company → Super Stockist → Distributor → Retailer. Never sell above MRP.",
        "No unauthorised discounts, free goods or scheme passing that undercuts another partner's market.",
        "Pass every Company scheme to the next level in full and on time; no withholding of retailer schemes."]) + sec("3. Territory and channel discipline", [
        "Sell only inside the allotted territory and only to channels allowed in the agreement.",
        "No sale to e-commerce sellers, wholesalers outside the area, or exporters without written approval.",
        "No buying from any source other than the mapped supplier (no parallel or grey-market stock)."]) + sec("4. Visibility and display", [
        "Use only Company-supplied or Company-approved POS material, posters and display units.",
        "Place products front-facing, clean and grouped by range.",
        "Vehicles, invoices or signboards carrying the SEERA name or logo need prior written approval of the artwork.",
        "Never alter the logo, colours or product imagery, or place SEERA next to counterfeit or look-alike products."])
    p2 = sec("5. Communication and claims", [
        "Describe products only with claims printed on the pack or in Company-issued material; no exaggerated, comparative or misleading claims.",
        "No independent advertising, social media pages, WhatsApp catalogues or online listings using the SEERA name without written approval.",
        "Consumer complaints, media and product-safety issues go to the Company within 24 hours; partners do not respond publicly."]) + sec("6. Conduct and compliance", [
        "Issue GST-compliant invoices for every sale; no cash-only or unbilled sale.",
        "Keep Seera App data accurate: stock, orders, deliveries, payments.",
        "Make payments only to the Company's or mapped supplier's bank account / official UPI — never in cash to a field employee.",
        "Protect retailer and consumer data; use it only for SEERA business.",
        "No bribery, kickbacks or gifts to Company employees. Treat retailers and staff with courtesy."]) + """
<h4>7. Consequences of breach</h4>""" + '<table class="g"><tr><th style="width:84mm">Breach</th><th>Action</th></tr>' + "".join(
        f"<tr><td>{a}</td><td>{b}</td></tr>" for a, b in [
            ("First minor breach (display, late reporting)", "Written warning with 15 days to correct"),
            ("Repeat minor breach", "Scheme / incentive withheld for the period"),
            ("Price undercutting, out-of-territory sale", "Penalty as per agreement + recovery of scheme benefit; suspension on repeat"),
            ("Expired, tampered, counterfeit or parallel stock", "Immediate suspension and termination; legal action where applicable")]) + "</table>" + f"""
<h4>Acknowledgement</h4>
<p>I / We have read and understood the SEERA Brand Standards Code and agree to follow it, and to make our staff and sub-distributors follow it.</p>
{rows([("Partner name &amp; type", ""), ("Partner code", "")])}
<div class="sigrow"><div>Signature &amp; Stamp</div><div>Name</div><div>Date</div></div>"""
    return doc(ref, [p1, p2])


def process_guide() -> str:
    ref = "SEERA/SOP/APPT/2026-27"
    steps = [
        ("Lead", "Log every enquiry (field lead, referral, website) as a Prospect in the Seera App the same day."),
        ("Share &amp; collect", "Share the eligibility criteria and the right Appointment Form (Super Stockist / Distributor / Depot); collect the filled form with all KYC documents."),
        ("Verify KYC", "GSTIN active on the GST portal, PAN matches the firm, bank account verified by cancelled cheque / penny-drop."),
        ("Site visit", "ASM visits the premises, takes geo-tagged photos in the Seera App and fills the scorecard below."),
        ("Recommend &amp; approve", "Recommendation by ASM / Sales Head. Approval: Sales Head for a Distributor; Founder for a Super Stockist or Depot."),
        ("Sign", "Agreement on stamp paper and the Brand Standards Code signed; security deposit received in the Company's bank account."),
        ("Appoint", "Letter of Appointment issued; partner code and Seera App login created."),
        ("Hand over", "Price list, scheme circular, territory / beat map and targets handed over."),
        ("Opening order", "Opening order placed; goods dispatched only after the full billing amount is received in the Company's bank account."),
        ("Train &amp; review", "Onboarding training (products, storage, pricing, App, claims, Brand Code); 30-day and 90-day review by the ASM."),
    ]
    score = [("Financial strength (turnover, bank balance, ITR)", 20), ("Warehouse / godown quality and location", 15),
             ("Retail / distributor network reach", 20), ("Delivery fleet and manpower", 15), ("Experience with similar categories", 10),
             ("Systems and Seera App readiness", 10), ("Market reputation and references", 10)]
    p1 = title("PARTNER APPOINTMENT PROCESS", "STANDARD OPERATING PROCEDURE FOR THE SALES TEAM") + """
<p>Use this procedure for every Super Stockist, Distributor and Depot. A partner is appointed only after scoring at least <b>70 / 100</b> on the scorecard and clearing KYC. Count a new partner towards your target only when its first order is fully paid into the Company's bank account and dispatched.</p>
<h3>Appointment steps</h3>""" + '<table class="g"><tr><th style="width:8mm">#</th><th style="width:34mm">Step</th><th>What to do</th></tr>' + "".join(
        f'<tr><td class="n">{i}</td><td><b>{a}</b></td><td>{b}</td></tr>' for i, (a, b) in enumerate(steps, 1)) + "</table>" + f"""
<h3>Evaluation scorecard <span class="small">(filled by ASM after site visit)</span></h3>
<p class="small" style="margin-bottom:1mm">Partner name: {BLANK}{BLANK} &nbsp; Type: {cb('SS', 'Distributor', 'Depot')} &nbsp; Visit date: {BLANK}</p>""" + '<table class="g"><tr><th>Parameter</th><th style="width:20mm">Max</th><th style="width:22mm">Score</th><th style="width:48mm">Remarks</th></tr>' + "".join(
        f"<tr><td>{a}</td><td>{b}</td><td></td><td></td></tr>" for a, b in score) + "<tr><td><b>Total</b></td><td><b>100</b></td><td></td><td></td></tr></table>" + """
<p class="small">Result: <b>70+</b> recommend · <b>55–69</b> conditional (re-visit) · <b>below 55</b> reject.</p>"""
    p2 = """<h3>Documents to use</h3>""" + '<table class="g"><tr><th style="width:46mm">Partner</th><th>Documents (all in Company documents in the Seera App)</th></tr>' + "".join(
        f"<tr><td><b>{a}</b></td><td>{b}</td></tr>" for a, b in [
            ("Super Stockist", "Super Stockist Appointment Form · Super Stockist Agreement · Brand Standards Code · Letter of Appointment · current price list"),
            ("Distributor", "Distributor Appointment Form · Distributor Agreement (three-party) · Brand Standards Code · Letter of Appointment · current price list"),
            ("Depot (C&amp;F)", "Depot Appointment Form · Depot Agreement · Brand Standards Code · Letter of Appointment")]) + "</table>" + f"""
<h3>Onboarding kit handed to every partner</h3>{checklist(
        ["Signed agreement copy and appointment letter", "Current price list and scheme circular", "Territory / beat map and target sheet", "Product catalogue and claims sheet"],
        ["Brand Standards Code copy", "Returns, expiry and claims policy", "Seera App login, install and training", f"Key contacts: ASM, Accounts, Company helpline {COMPANY['phone']}"])}
<h3>Golden rules</h3><ul class="bul">
<li>Never collect cash from a partner. All payments go only to the Company's bank account / official UPI.</li>
<li>Never promise credit, rates, schemes or territory beyond what the Company has approved in writing.</li>
<li>Do all work in the Seera App with GPS on — prospects, visits, photos, documents and orders. Work outside the App is not counted.</li>
<li>Submit the complete file (form + KYC + scorecard + photos) together; incomplete files are not processed.</li></ul>
<div class="box"><b>Company helpline:</b> {COMPANY['phone']} &nbsp; · &nbsp; {COMPANY['email']}</div>"""
    return doc(ref, [p1, p2])


DOCUMENTS = {
    "seera-distributor-application-form": distributor_form,
    "seera-distributor-agreement": distributor_agreement,
    "seera-super-stockist-application-form": ss_form,
    "seera-super-stockist-agreement": ss_agreement,
    "seera-depot-application-form": depot_form,
    "seera-depot-agreement": depot_agreement,
    "seera-letter-of-appointment": appointment_letter,
    "seera-brand-standards-code": brand_code,
    "seera-partner-appointment-process": process_guide,
}

if __name__ == "__main__":
    out = pathlib.Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    for slug, build in DOCUMENTS.items():
        html = f"<!doctype html><html><head><meta charset='utf-8'><title>{slug}</title><style>{CSS}</style></head><body>{build()}</body></html>"
        (out / f"{slug}.html").write_text(html, encoding="utf-8")
        print(slug)

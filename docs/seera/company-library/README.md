# Company documents library

Sales Executive, Sales Manager and Founder/Admin portals have a **Company documents & price list**
section (`/portal/<portal>/company-documents`).

- **Built-in documents** — blank SEERA templates on the AATMANIRBHAR MANUFACTURERS letterhead
  (Super Stockist / Distributor / Depot appointment forms and agreements, Letter of Appointment,
  Brand Standards Code, Partner Appointment SOP). Source: `build_company_library.py`; output PDFs in
  `content/company-library/`, listed in `lib/sales-distribution/company-library.ts`, served only to
  signed-in staff by `/api/company-library/builtin/[slug]`.
- **Uploaded documents** — Founder/Admin (`settings:manage`) uploads PDF/PNG/JPEG from the same page;
  stored in `seera_company_library_documents` + `stored_files` (migration
  `20261110090000_seera_company_library`). Remove = archive (kept for audit).
- **Live price list** — read from the governed `SeeraPriceVersion` rows (S.S. rate = `COMPANY_TO_SS`,
  distributor rate via `resolveDistributorPurchaseRate`), so a Company rate change shows immediately.

Rebuild the PDFs after changing a template or the company details (`COMPANY` in the builder):

```bash
python3 docs/seera/company-library/build_company_library.py /tmp/library-html
node docs/seera/company-library/render.cjs /tmp/library-html content/company-library
```

`render.cjs` fails if any page's content runs into its footer.

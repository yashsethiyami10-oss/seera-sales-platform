"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, X, AlertCircle, ArrowUp, ArrowDown, Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { createProduct, updateProduct, updateProductVariant, addProductVariant } from "@/actions/products";
import { setStockQuantity } from "@/actions/inventory";
import { useToast } from "@/components/ui/toast";
import { PRODUCT_SIZES } from "@/lib/constants/sizes";
import { slugify } from "@/lib/utils/slugify";
import { calculateDiscountPercent } from "@/lib/utils/discount";
import { ImageUploader } from "@/components/admin/image-uploader";
import { MultiVideoUploader } from "@/components/admin/multi-video-uploader";

type Category = { id: string; name: string };
type ExistingVariant = { id: string; size: string; price: number; mrp: number; sku: string; stock: number; lowStockThreshold: number };
type FaqEntry = { question: string; answer: string };
type ExistingContent = {
  shortDescription?: string; longDescription?: string; keyBenefits?: string; productHighlights?: string;
  howToUse?: string; careInstructions?: string; storage?: string; safetyInformation?: string;
  seoTitle?: string; seoDescription?: string; faq?: FaqEntry[];
};
type ExistingProduct = {
  id: string; name: string; slug: string; categoryId: string; brand?: string;
  shortDescription: string; fullDescription?: string; weight?: string;
  fragranceNotes?: string; ingredients?: string; directions?: string; benefits?: string; safety?: string;
  hsnCode?: string; gstRate?: number; metaTitle?: string; metaDescription?: string;
  images?: string[]; videoUrls?: string[]; isFeatured?: boolean;
  status?: string; variants?: ExistingVariant[]; content?: ExistingContent;
};

const DEFAULT_SIZE = PRODUCT_SIZES[3]; // "250ml" — a sensible mid-range default

/**
 * Mandatory-for-ACTIVE field list, mirrored client-side from
 * lib/validations/product.ts's validateActiveProductRequirements — used
 * only to show a non-blocking "missing for activation" checklist while a
 * product is still DRAFT (Approved Requirements §4/§5). The server re-checks
 * everything independently on submit; this is a UX convenience only, never
 * the source of truth.
 */
function missingActiveFields(form: {
  name: string; categoryId: string; images: string[];
  contentShortDescription: string; contentLongDescription: string; contentHowToUse: string;
  contentSafetyInformation: string; contentSeoTitle: string; contentSeoDescription: string;
}, variantCount: number): string[] {
  const missing: string[] = [];
  if (!form.name.trim()) missing.push("Product Name");
  if (!form.categoryId) missing.push("Category");
  if (form.images.length === 0) missing.push("At least one Product image (cover image)");
  if (!form.contentShortDescription.trim()) missing.push("Short Description");
  if (!form.contentLongDescription.trim()) missing.push("Full Description");
  if (!form.contentHowToUse.trim()) missing.push("Directions for Use");
  if (!form.contentSafetyInformation.trim()) missing.push("Safety Information");
  if (!form.contentSeoTitle.trim()) missing.push("SEO Title");
  if (!form.contentSeoDescription.trim()) missing.push("SEO Description");
  if (variantCount === 0) missing.push("At least one Variant (size, SKU, MRP, selling price)");
  return missing;
}

function SectionHeader({ n, title }: { n: number; title: string }) {
  return (
    <div className="sm:col-span-2" style={{ marginTop: n === 1 ? 0 : 8, paddingTop: n === 1 ? 0 : 16, borderTop: n === 1 ? "none" : "1px solid var(--card-border)" }}>
      <h4 className="muv-text-solid text-sm font-semibold uppercase tracking-wide">{n}. {title}</h4>
    </div>
  );
}

export function ProductFormModal({
  categories,
  existing,
  onClose,
}: {
  categories: Category[];
  existing?: ExistingProduct;
  onClose: () => void;
}) {
  // Content-layer fields fall back to the matching legacy Product column
  // ONLY for the initial pre-fill, when ProductContent itself has nothing —
  // so an admin editing a product that already has real (if inert) text
  // doesn't see a blank field and assume the content was lost. Whatever
  // ends up in the field on Save always writes to ProductContent (the only
  // table the storefront actually reads), never back to the legacy column.
  const c = existing?.content;
  const [form, setForm] = useState({
    name: existing?.name ?? "",
    slug: existing?.slug ?? "",
    categoryId: existing?.categoryId ?? categories[0]?.id ?? "",
    brand: existing?.brand ?? "Muv",
    weight: existing?.weight ?? "",
    fragranceNotes: existing?.fragranceNotes ?? "",
    ingredients: existing?.ingredients ?? "",
    hsnCode: existing?.hsnCode ?? "3401",
    gstRate: String(existing?.gstRate ?? 18),
    images: existing?.images ?? ([] as string[]),
    videoUrls: existing?.videoUrls ?? ([] as string[]),
    isFeatured: existing?.isFeatured ?? false,
    status: (existing?.status as "ACTIVE" | "DRAFT" | "ARCHIVED") ?? "DRAFT",
    // Production Customer Content Layer fields — the ONLY source the
    // customer-facing Product Detail Page and generateMetadata() read from.
    contentShortDescription: c?.shortDescription ?? existing?.shortDescription ?? "",
    contentLongDescription: c?.longDescription ?? existing?.fullDescription ?? "",
    contentKeyBenefits: c?.keyBenefits ?? existing?.benefits ?? "",
    contentProductHighlights: c?.productHighlights ?? "",
    contentHowToUse: c?.howToUse ?? existing?.directions ?? "",
    contentCareInstructions: c?.careInstructions ?? "", // "Uses"
    contentStorage: c?.storage ?? "",
    contentSafetyInformation: c?.safetyInformation ?? existing?.safety ?? "",
    contentSeoTitle: c?.seoTitle ?? existing?.metaTitle ?? "",
    contentSeoDescription: c?.seoDescription ?? existing?.metaDescription ?? "",
  });
  const [faqs, setFaqs] = useState<FaqEntry[]>(c?.faq && c.faq.length > 0 ? c.faq : []);
  const [faqErrors, setFaqErrors] = useState<Record<number, string>>({});

  // Snapshot of the initial state, for the unsaved-changes guard below —
  // taken once, never updated, so it always reflects "what's actually saved."
  const initialSnapshotRef = useRef(JSON.stringify({ form, faqs }));
  const isDirty = JSON.stringify({ form, faqs }) !== initialSnapshotRef.current;

  // Approved Requirements §5 — warn before an accidental tab close/refresh
  // loses unsaved edits. Scoped to this modal's lifetime only.
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (!isDirty) return;
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  function handleCancel() {
    if (isDirty && !window.confirm("You have unsaved changes. Discard them?")) return;
    onClose();
  }

  // Slug auto-generates from the name until the admin edits the slug field
  // directly — once touched, their edit always wins.
  const [slugTouched, setSlugTouched] = useState(!!existing);

  // Existing variants stay editable in place (size/price/MRP/SKU/stock/low-
  // stock threshold) — previously this whole section was hidden once a
  // product existed, so nothing about a saved variant could ever be changed
  // again except by deleting and recreating the product.
  const [existingVariants, setExistingVariants] = useState(
    (existing?.variants ?? []).map((v) => ({ ...v, price: String(v.price), mrp: String(v.mrp), stock: String(v.stock), lowStockThreshold: String(v.lowStockThreshold) }))
  );
  // Brand-new size rows — used both for a brand-new product's first
  // variant(s), and for adding another size to a product that already exists.
  // Stock Quantity and Low Stock Threshold are tracked here AND rendered as
  // real inputs below.
  const [newVariants, setNewVariants] = useState<{ size: string; price: string; mrp: string; sku: string; initialStock: string; lowStockThreshold: string }[]>(
    existing ? [] : [{ size: DEFAULT_SIZE, price: "", mrp: "", sku: "", initialStock: "0", lowStockThreshold: "10" }]
  );

  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, setIsPending] = useState(false);
  const { showToast } = useToast();
  const router = useRouter();

  // Shared helpers so every field gets identical inline-error + red-border
  // treatment instead of each input re-deriving it — purely presentational,
  // reads the same `errors` state every field already reads.
  const inputClass = (field: string) => "muv-input" + (errors[field] ? " muv-input-error" : "");
  const FieldError = ({ field }: { field: string }) =>
    errors[field] ? (
      Array.isArray(errors[field]) && errors[field].length > 1 ? (
        <ul className="muv-field-error text-xs mt-1 list-disc pl-4">{errors[field].map((m, i) => <li key={i}>{m}</li>)}</ul>
      ) : (
        <p className="muv-field-error text-xs mt-1">{errors[field][0]}</p>
      )
    ) : null;

  function handleNameChange(name: string) {
    setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) }));
  }
  function handleSlugChange(slug: string) {
    setSlugTouched(true);
    setForm((f) => ({ ...f, slug }));
  }

  function updateExisting(i: number, field: string, value: string) {
    setExistingVariants((prev) => prev.map((v, idx) => (idx === i ? { ...v, [field]: value } : v)));
  }
  function updateNew(i: number, field: string, value: string) {
    setNewVariants((prev) => prev.map((v, idx) => (idx === i ? { ...v, [field]: value } : v)));
  }
  function addNewRow() {
    setNewVariants((prev) => [...prev, { size: DEFAULT_SIZE, price: "", mrp: "", sku: "", initialStock: "0", lowStockThreshold: "10" }]);
  }
  function removeNewRow(i: number) {
    setNewVariants((prev) => prev.filter((_, idx) => idx !== i));
  }

  function discountPercent(price: string, mrp: string): number | null {
    return calculateDiscountPercent(Number(price), Number(mrp));
  }

  // ---- FAQ CRUD (Approved Requirements §2) — reuses ProductContent.faq,
  // an existing Json column, no schema change. ----
  function addFaq() {
    setFaqs((prev) => [...prev, { question: "", answer: "" }]);
  }
  function updateFaq(i: number, field: "question" | "answer", value: string) {
    setFaqs((prev) => prev.map((f, idx) => (idx === i ? { ...f, [field]: value } : f)));
    setFaqErrors((prev) => { const next = { ...prev }; delete next[i]; return next; });
  }
  function removeFaq(i: number) {
    setFaqs((prev) => prev.filter((_, idx) => idx !== i));
    setFaqErrors((prev) => { const next = { ...prev }; delete next[i]; return next; });
  }
  function moveFaq(i: number, dir: 1 | -1) {
    setFaqs((prev) => {
      const next = [...prev];
      const target = i + dir;
      if (target < 0 || target >= next.length) return prev;
      const cur = next[i]!, swap = next[target]!;
      next[i] = swap; next[target] = cur;
      return next;
    });
  }
  /** Drops fully-blank rows silently, blocks save with a per-row error on
   * half-filled rows ("prevent empty question/answer rows" — a row with
   * only one side filled is neither empty nor complete). */
  function resolveFaqsForSave(): { ok: true; faqs: FaqEntry[] } | { ok: false } {
    const nextErrors: Record<number, string> = {};
    const resolved: FaqEntry[] = [];
    faqs.forEach((f, i) => {
      const q = f.question.trim(), a = f.answer.trim();
      if (!q && !a) return; // fully blank — silently dropped
      if (!q || !a) { nextErrors[i] = !q ? "Question is required" : "Answer is required"; return; }
      resolved.push({ question: q, answer: a });
    });
    setFaqErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return { ok: false };
    return { ok: true, faqs: resolved };
  }

  const contentPayload = (faqList: FaqEntry[]) => ({
    shortDescription: form.contentShortDescription,
    longDescription: form.contentLongDescription,
    keyBenefits: form.contentKeyBenefits,
    productHighlights: form.contentProductHighlights,
    howToUse: form.contentHowToUse,
    careInstructions: form.contentCareInstructions,
    storage: form.contentStorage,
    safetyInformation: form.contentSafetyInformation,
    seoTitle: form.contentSeoTitle,
    seoDescription: form.contentSeoDescription,
    faq: faqList,
  });

  const totalVariantCount = existingVariants.length + newVariants.filter((v) => v.sku.trim() && v.price && v.mrp).length;
  const missingForActive = useMemo(
    () => missingActiveFields(
      { name: form.name, categoryId: form.categoryId, images: form.images, contentShortDescription: form.contentShortDescription, contentLongDescription: form.contentLongDescription, contentHowToUse: form.contentHowToUse, contentSafetyInformation: form.contentSafetyInformation, contentSeoTitle: form.contentSeoTitle, contentSeoDescription: form.contentSeoDescription },
      totalVariantCount
    ),
    [form, totalVariantCount]
  );

  async function handleSubmit() {
    setErrors({});
    const faqResolution = resolveFaqsForSave();
    if (!faqResolution.ok) {
      showToast("Fix the incomplete FAQ rows before saving (both question and answer are required).");
      return;
    }

    setIsPending(true);
    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        categoryId: form.categoryId,
        brand: form.brand,
        weight: form.weight,
        fragranceNotes: form.fragranceNotes,
        ingredients: form.ingredients,
        hsnCode: form.hsnCode,
        gstRate: Number(form.gstRate),
        images: form.images,
        videoUrls: form.videoUrls,
        isFeatured: form.isFeatured,
        status: form.status,
        // Legacy Product columns kept in sync for backward compatibility
        // (admin tooling / anything still reading them directly) — the
        // customer-facing site reads `content` below, not these.
        shortDescription: form.contentShortDescription,
        fullDescription: form.contentLongDescription,
        benefits: form.contentKeyBenefits,
        directions: form.contentHowToUse,
        safety: form.contentSafetyInformation,
        metaTitle: form.contentSeoTitle,
        metaDescription: form.contentSeoDescription,
        content: contentPayload(faqResolution.faqs),
      };

      if (!existing) {
        const result = await createProduct({
          ...payload,
          variants: newVariants.map((v) => ({ size: v.size, price: Number(v.price), mrp: Number(v.mrp), sku: v.sku, initialStock: Number(v.initialStock), lowStockThreshold: Number(v.lowStockThreshold) })),
        });
        if (result.success) {
          showToast("Product added");
          router.refresh();
          onClose();
        } else {
          setErrors({ ...(result.error.fieldErrors ?? {}), _: [result.error.message] });
        }
        return;
      }

      // For an existing product, include the current variant rows too —
      // used ONLY by the server to evaluate ACTIVE-requirements (a variant
      // added in this same save hasn't been written yet at this point);
      // updateProduct never writes variants from this array itself.
      const variantsForValidation = [
        ...existingVariants.map((v) => ({ size: v.size, sku: v.sku, price: Number(v.price), mrp: Number(v.mrp) })),
        ...newVariants.filter((v) => v.sku.trim() && v.price && v.mrp).map((v) => ({ size: v.size, sku: v.sku, price: Number(v.price), mrp: Number(v.mrp) })),
      ];

      const productResult = await updateProduct({ id: existing.id, ...payload, variants: variantsForValidation });
      if (!productResult.success) {
        setErrors({ ...(productResult.error.fieldErrors ?? {}), _: [productResult.error.message] });
        return;
      }

      const variantResults = await Promise.all(
        existingVariants.flatMap((v) => [
          updateProductVariant({ variantId: v.id, size: v.size, price: Number(v.price), mrp: Number(v.mrp), sku: v.sku }),
          setStockQuantity({ variantId: v.id, quantity: Number(v.stock), lowStockThreshold: Number(v.lowStockThreshold) }),
        ])
      );
      const newVariantResults = await Promise.all(
        newVariants
          .filter((v) => v.sku.trim() && v.price && v.mrp)
          .map((v) => addProductVariant({ productId: existing.id, size: v.size, price: Number(v.price), mrp: Number(v.mrp), sku: v.sku, initialStock: Number(v.initialStock), lowStockThreshold: Number(v.lowStockThreshold) }))
      );

      const allResults = [...variantResults, ...newVariantResults];
      const failed = allResults.find((r) => !r.success);
      if (failed && !failed.success) {
        // The Product/ProductContent write already succeeded above — this
        // is a genuine partial-failure state, surfaced honestly rather than
        // as a blanket success toast.
        showToast(`Product content saved, but a variant update failed: ${failed.error.message}`);
        router.refresh();
        return;
      }

      showToast("Product updated");
      router.refresh();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Modal title={existing ? "Edit Product" : "Add Product"} onClose={onClose} wide>
      {errors._ && (
        <div className="muv-error-banner" role="alert">
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <span>{errors._[0]}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SectionHeader n={1} title="Basic Information" />

        <div className="sm:col-span-2">
          <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Product Name</label>
          <input className={inputClass("name")} value={form.name} onChange={(e) => handleNameChange(e.target.value)} />
          <FieldError field="name" />
        </div>

        <div className="sm:col-span-2">
          <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">
            Slug {!slugTouched && <span className="muv-text-faint normal-case">— auto-generated from name, edit anytime</span>}
          </label>
          <input className={inputClass("slug")} value={form.slug} onChange={(e) => handleSlugChange(e.target.value)} placeholder="muv-noir" />
          <FieldError field="slug" />
        </div>

        <div>
          <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Category</label>
          <div className="relative">
            <select className={inputClass("categoryId") + " muv-select-clear"} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </select>
            <ChevronDown size={15} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 muv-text-meta" />
          </div>
          {categories.length === 0 && <p className="muv-text-meta text-xs mt-1">No categories yet — add one in the Category CMS first.</p>}
          <FieldError field="categoryId" />
        </div>

        <div>
          <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Brand</label>
          <input className={inputClass("brand")} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          <FieldError field="brand" />
        </div>

        <div>
          <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Product Weight</label>
          <input className={inputClass("weight")} placeholder="e.g. 150g" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} />
          <FieldError field="weight" />
        </div>
        <div>
          <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Fragrance</label>
          <input className={inputClass("fragranceNotes")} value={form.fragranceNotes} onChange={(e) => setForm({ ...form, fragranceNotes: e.target.value })} />
          <FieldError field="fragranceNotes" />
        </div>

        <div>
          <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">HSN Code</label>
          <input className={inputClass("hsnCode")} value={form.hsnCode} onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} />
          <FieldError field="hsnCode" />
        </div>
        <div>
          <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">GST Rate (%)</label>
          <input className={inputClass("gstRate")} type="number" value={form.gstRate} onChange={(e) => setForm({ ...form, gstRate: e.target.value })} />
          <FieldError field="gstRate" />
        </div>

        <div className="sm:col-span-2 flex items-center justify-between muv-card" style={{ padding: 16 }}>
          <span className="muv-text-solid text-sm">Featured Product</span>
          <ToggleSwitch checked={form.isFeatured} onChange={(v) => setForm({ ...form, isFeatured: v })} label="Featured product" />
        </div>

        {/* ---- 2. Product Content ---- */}
        <SectionHeader n={2} title="Product Content" />

        <div className="sm:col-span-2">
          <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Short Description</label>
          <textarea className={inputClass("content.shortDescription") + " muv-textarea"} value={form.contentShortDescription} onChange={(e) => setForm({ ...form, contentShortDescription: e.target.value })} />
          <FieldError field="content.shortDescription" />
        </div>

        <div className="sm:col-span-2">
          <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Full Description</label>
          <textarea className={inputClass("content.longDescription") + " muv-textarea"} style={{ minHeight: 140 }} value={form.contentLongDescription} onChange={(e) => setForm({ ...form, contentLongDescription: e.target.value })} />
          <FieldError field="content.longDescription" />
        </div>

        <div className="sm:col-span-2">
          <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Benefits <span className="muv-text-faint normal-case">— one per line</span></label>
          <textarea className={inputClass("content.keyBenefits") + " muv-textarea"} value={form.contentKeyBenefits} onChange={(e) => setForm({ ...form, contentKeyBenefits: e.target.value })} />
          <FieldError field="content.keyBenefits" />
        </div>

        <div className="sm:col-span-2">
          <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Key Features <span className="muv-text-faint normal-case">— one per line</span></label>
          <textarea className={inputClass("content.productHighlights") + " muv-textarea"} value={form.contentProductHighlights} onChange={(e) => setForm({ ...form, contentProductHighlights: e.target.value })} />
          <FieldError field="content.productHighlights" />
        </div>

        {/* ---- 3. Usage and Safety ---- */}
        <SectionHeader n={3} title="Usage and Safety" />

        <div className="sm:col-span-2">
          <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Uses</label>
          <textarea className={inputClass("content.careInstructions") + " muv-textarea"} value={form.contentCareInstructions} onChange={(e) => setForm({ ...form, contentCareInstructions: e.target.value })} />
          <FieldError field="content.careInstructions" />
        </div>

        <div className="sm:col-span-2">
          <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Directions for Use</label>
          <textarea className={inputClass("content.howToUse") + " muv-textarea"} value={form.contentHowToUse} onChange={(e) => setForm({ ...form, contentHowToUse: e.target.value })} />
          <FieldError field="content.howToUse" />
        </div>

        <div className="sm:col-span-2">
          <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Ingredients / Technical Information <span className="muv-text-faint normal-case">— internal/admin only, not shown on the Product page (proprietary formula)</span></label>
          <textarea className={inputClass("ingredients") + " muv-textarea"} value={form.ingredients} onChange={(e) => setForm({ ...form, ingredients: e.target.value })} />
          <FieldError field="ingredients" />
        </div>

        <div className="sm:col-span-2">
          <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Safety Information</label>
          <textarea className={inputClass("content.safetyInformation") + " muv-textarea"} value={form.contentSafetyInformation} onChange={(e) => setForm({ ...form, contentSafetyInformation: e.target.value })} />
          <FieldError field="content.safetyInformation" />
        </div>

        <div className="sm:col-span-2">
          <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Storage Instructions</label>
          <textarea className={inputClass("content.storage") + " muv-textarea"} value={form.contentStorage} onChange={(e) => setForm({ ...form, contentStorage: e.target.value })} />
          <FieldError field="content.storage" />
        </div>

        {/* ---- 4. FAQs ---- */}
        <SectionHeader n={4} title="FAQs" />
        <div className="sm:col-span-2 space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="muv-card" style={{ padding: 14 }}>
              <div className="flex items-center justify-between mb-2">
                <span className="muv-text-faint text-[11px] uppercase">FAQ {i + 1}</span>
                <div className="flex gap-1">
                  {i > 0 && <button type="button" onClick={() => moveFaq(i, -1)} className="muv-icon-circle" style={{ width: 22, height: 22 }} aria-label="Move FAQ earlier"><ArrowUp size={11} /></button>}
                  {i < faqs.length - 1 && <button type="button" onClick={() => moveFaq(i, 1)} className="muv-icon-circle" style={{ width: 22, height: 22 }} aria-label="Move FAQ later"><ArrowDown size={11} /></button>}
                  <button type="button" onClick={() => removeFaq(i)} className="muv-icon-circle" style={{ width: 22, height: 22 }} aria-label="Remove FAQ"><X size={11} /></button>
                </div>
              </div>
              <input className="muv-input mb-2" placeholder="Question" value={f.question} onChange={(e) => updateFaq(i, "question", e.target.value)} />
              <textarea className="muv-input muv-textarea" placeholder="Answer" value={f.answer} onChange={(e) => updateFaq(i, "answer", e.target.value)} />
              {faqErrors[i] && <p className="muv-field-error text-xs mt-1">{faqErrors[i]}</p>}
            </div>
          ))}
          <button type="button" onClick={addFaq} className="muv-text-meta text-xs flex items-center gap-1"><Plus size={13} /> Add FAQ</button>
        </div>

        {/* ---- 5. Images and Gallery ---- */}
        <SectionHeader n={5} title="Images and Gallery" />
        <div className="sm:col-span-2">
          <ImageUploader value={form.images} onChange={(images) => setForm((prev) => ({ ...prev, images }))} />
          <FieldError field="images" />
        </div>

        <div className="sm:col-span-2">
          <label className="muv-text-meta text-xs uppercase tracking-wide mb-2 block">Product Videos (up to 4)</label>
          <MultiVideoUploader value={form.videoUrls} onChange={(videoUrls) => setForm((prev) => ({ ...prev, videoUrls }))} />
          <FieldError field="videoUrls" />
        </div>

        {/* ---- 6. SEO ---- */}
        <SectionHeader n={6} title="SEO" />
        <div className="sm:col-span-2">
          <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">
            SEO Title <span className="muv-text-faint normal-case">({form.contentSeoTitle.length}/70)</span>
          </label>
          <input className={inputClass("content.seoTitle")} maxLength={70} value={form.contentSeoTitle} onChange={(e) => setForm({ ...form, contentSeoTitle: e.target.value })} />
          <FieldError field="content.seoTitle" />
        </div>
        <div className="sm:col-span-2">
          <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">
            SEO Description <span className="muv-text-faint normal-case">({form.contentSeoDescription.length}/160)</span>
          </label>
          <textarea className={inputClass("content.seoDescription") + " muv-textarea"} maxLength={160} value={form.contentSeoDescription} onChange={(e) => setForm({ ...form, contentSeoDescription: e.target.value })} />
          <FieldError field="content.seoDescription" />
          <p className="muv-text-faint text-xs mt-1">Image Alt Text is generated automatically from the Product Name wherever images appear on the site.</p>
        </div>

        {/* ---- 7. Variants and Pricing ---- */}
        <SectionHeader n={7} title="Variants and Pricing" />

        {existingVariants.length > 0 && (
          <div className="sm:col-span-2">
            <label className="muv-text-meta text-xs uppercase tracking-wide mb-2 block">Existing Sizes — fully editable</label>
            <div className="space-y-3">
              {existingVariants.map((v, i) => {
                const discount = discountPercent(v.price, v.mrp);
                return (
                  <div key={v.id} className="muv-card" style={{ padding: 14 }}>
                    <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
                      <select className="muv-input" value={v.size} onChange={(e) => updateExisting(i, "size", e.target.value)}>
                        {PRODUCT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <input className="muv-input" placeholder="SKU" value={v.sku} onChange={(e) => updateExisting(i, "sku", e.target.value)} />
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 muv-text-meta text-sm pointer-events-none">₹</span>
                        <input className="muv-input" style={{ paddingLeft: 24 }} placeholder="Selling Price" value={v.price} onChange={(e) => updateExisting(i, "price", e.target.value)} />
                      </div>
                      <div>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 muv-text-meta text-sm pointer-events-none">₹</span>
                          <input className="muv-input" style={{ paddingLeft: 24 }} placeholder="MRP" value={v.mrp} onChange={(e) => updateExisting(i, "mrp", e.target.value)} />
                        </div>
                        {discount != null && <p className="text-xs mt-1" style={{ color: "var(--lavender)" }}>{discount}% off</p>}
                      </div>
                    </div>
                    <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
                      <div>
                        <label className="muv-text-faint text-[11px] uppercase block mb-1">Stock Quantity</label>
                        <input className="muv-input" type="number" value={v.stock} onChange={(e) => updateExisting(i, "stock", e.target.value)} />
                      </div>
                      <div>
                        <label className="muv-text-faint text-[11px] uppercase block mb-1">Low Stock Threshold</label>
                        <input className="muv-input" type="number" value={v.lowStockThreshold} onChange={(e) => updateExisting(i, "lowStockThreshold", e.target.value)} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="sm:col-span-2">
          <label className="muv-text-meta text-xs uppercase tracking-wide mb-2 block">
            {existingVariants.length > 0 ? "Add Another Size" : "Size / SKU / Pricing"}
          </label>
          <div className="space-y-3">
            {newVariants.map((v, i) => {
              const discount = discountPercent(v.price, v.mrp);
              return (
                <div key={i} className="muv-card" style={{ padding: 14 }}>
                  <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr auto" }}>
                    <select className="muv-input" value={v.size} onChange={(e) => updateNew(i, "size", e.target.value)}>
                      {PRODUCT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <input className="muv-input" placeholder="SKU" value={v.sku} onChange={(e) => updateNew(i, "sku", e.target.value)} />
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 muv-text-meta text-sm pointer-events-none">₹</span>
                      <input className="muv-input" style={{ paddingLeft: 24 }} placeholder="Selling Price" value={v.price} onChange={(e) => updateNew(i, "price", e.target.value)} />
                    </div>
                    <div>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 muv-text-meta text-sm pointer-events-none">₹</span>
                        <input className="muv-input" style={{ paddingLeft: 24 }} placeholder="MRP" value={v.mrp} onChange={(e) => updateNew(i, "mrp", e.target.value)} />
                      </div>
                      {discount != null && <p className="text-xs mt-1" style={{ color: "var(--lavender)" }}>{discount}% off</p>}
                    </div>
                    <button type="button" onClick={() => removeNewRow(i)} disabled={!existing && newVariants.length === 1} className="muv-icon-circle" style={{ opacity: !existing && newVariants.length === 1 ? 0.3 : 1 }} aria-label="Remove this size">
                      <X size={13} />
                    </button>
                  </div>
                  <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
                    <div>
                      <label className="muv-text-faint text-[11px] uppercase block mb-1">Stock Quantity</label>
                      <input className="muv-input" type="number" value={v.initialStock} onChange={(e) => updateNew(i, "initialStock", e.target.value)} />
                    </div>
                    <div>
                      <label className="muv-text-faint text-[11px] uppercase block mb-1">Low Stock Threshold</label>
                      <input className="muv-input" type="number" value={v.lowStockThreshold} onChange={(e) => updateNew(i, "lowStockThreshold", e.target.value)} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <button type="button" onClick={addNewRow} className="muv-text-meta text-xs mt-2">+ Add another size</button>
          <FieldError field="variants" />
        </div>

        {/* ---- 8. Status ---- */}
        <SectionHeader n={8} title="Status" />
        <div>
          <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Status</label>
          <div className="relative">
            <select className={inputClass("status") + " muv-select-clear"} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </select>
            <ChevronDown size={15} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 muv-text-meta" />
          </div>
          <FieldError field="status" />
        </div>

        {form.status === "DRAFT" && missingForActive.length > 0 && (
          <div className="sm:col-span-2 muv-card" style={{ padding: 14, borderColor: "rgba(245,158,11,0.4)" }}>
            <p className="text-xs font-medium mb-1.5" style={{ color: "#f59e0b" }}>Missing to activate (Draft can still be saved as-is):</p>
            <ul className="text-xs list-disc pl-4 space-y-0.5 muv-text-meta">
              {missingForActive.map((m) => <li key={m}>{m}</li>)}
            </ul>
          </div>
        )}
      </div>

      <div className="flex gap-3 mt-6">
        <button className="muv-btn-ghost" onClick={handleCancel}>Cancel</button>
        <Button variant="primary" onClick={handleSubmit} disabled={isPending}>
          {isPending ? "Saving…" : existing ? "Save Changes" : "Add Product"}
        </Button>
      </div>
    </Modal>
  );
}

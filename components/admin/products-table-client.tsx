"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Pencil, Plus, Star } from "lucide-react";
import { deleteProduct, updateProduct } from "@/actions/products";
import { useToast } from "@/components/ui/toast";
import { Badge, Button } from "@/components/ui/primitives";
import { ProductFormModal } from "@/components/admin/product-form-modal";
import { getStockStatus, STOCK_STATUS_LABEL } from "@/lib/utils/stock-status";

type Variant = { id: string; size: string; price: number; mrp: number; sku: string; stock: number; lowStockThreshold: number };
type FaqEntry = { question: string; answer: string };
type ProductContentShape = {
  shortDescription?: string; longDescription?: string; keyBenefits?: string; productHighlights?: string;
  howToUse?: string; careInstructions?: string; storage?: string; safetyInformation?: string;
  seoTitle?: string; seoDescription?: string; faq?: FaqEntry[];
};
type Product = {
  id: string; name: string; slug: string; categoryId: string; category: string; brand?: string;
  shortDescription: string; fullDescription?: string; weight?: string;
  fragranceNotes?: string; ingredients?: string; directions?: string; benefits?: string; safety?: string;
  hsnCode?: string; gstRate?: number; metaTitle?: string; metaDescription?: string;
  images?: string[]; videoUrls?: string[]; isFeatured?: boolean;
  status: string; price: number; stock: number; variants?: Variant[]; content?: ProductContentShape;
};
type Category = { id: string; name: string };

export function ProductsTableClient({ products, categories }: { products: Product[]; categories: Category[] }) {
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<"ACTIVE" | "DRAFT" | "ARCHIVED">("ACTIVE");
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();

  function confirmDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await deleteProduct(deleteTarget.id);
      if (result.success) {
        showToast("Product deleted");
        router.refresh();
      } else {
        showToast(result.error.message);
      }
      setDeleteTarget(null);
    });
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelected((prev) => (prev.size === products.length ? new Set() : new Set(products.map((p) => p.id))));
  }

  // Bulk status/delete loop the same single-item updateProduct/deleteProduct
  // actions the row-level Edit/Delete controls already use — no separate
  // "bulk" server action was written, since each call already enforces its
  // own RBAC and (for delete) the archive-instead-of-hard-delete safety for
  // products with order history.
  function applyBulkStatus() {
    startTransition(async () => {
      const results = await Promise.all([...selected].map((id) => updateProduct({ id, status: bulkStatus })));
      const failed = results.filter((r) => !r.success).length;
      showToast(failed > 0 ? `${results.length - failed} updated, ${failed} failed` : `${results.length} product(s) marked ${bulkStatus}`);
      setSelected(new Set());
      router.refresh();
    });
  }
  function applyBulkDelete() {
    startTransition(async () => {
      const results = await Promise.all([...selected].map((id) => deleteProduct(id)));
      const failed = results.filter((r) => !r.success).length;
      showToast(failed > 0 ? `${results.length - failed} removed, ${failed} failed` : `${results.length} product(s) removed`);
      setSelected(new Set());
      setBulkDeleteOpen(false);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
        <div>
          {selected.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="muv-text-meta text-xs">{selected.size} selected</span>
              <select className="muv-input" style={{ width: "auto", minHeight: "auto", padding: "6px 10px" }} value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as typeof bulkStatus)}>
                <option value="ACTIVE">Active</option>
                <option value="DRAFT">Draft</option>
                <option value="ARCHIVED">Archived</option>
              </select>
              <button className="muv-btn-ghost" onClick={applyBulkStatus} disabled={isPending}>Set Status</button>
              <button className="muv-btn-ghost" style={{ color: "#e0685c" }} onClick={() => setBulkDeleteOpen(true)} disabled={isPending}>Delete Selected</button>
            </div>
          )}
        </div>
        <Button variant="primary" onClick={() => setAdding(true)}><Plus size={14} /> Add Product</Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left py-2.5 px-3" style={{ borderBottom: "1px solid var(--card-border)" }}>
                <input type="checkbox" checked={products.length > 0 && selected.size === products.length} onChange={toggleSelectAll} aria-label="Select all products" />
              </th>
              {["Product", "Category", "Price", "Stock", "Status", ""].map((h) => <th key={h} className="text-left py-2.5 px-3 muv-text-meta text-xs uppercase" style={{ borderBottom: "1px solid var(--card-border)" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              // Uses the same lowest threshold among a product's variants as
              // a rough overall signal — the per-variant detail (what's
              // actually low) lives in the edit modal, not this summary row.
              const lowestThreshold = Math.min(...(p.variants?.map((v) => v.lowStockThreshold) ?? [10]));
              const stockStatus = getStockStatus(p.stock, lowestThreshold);
              return (
                <tr key={p.id}>
                  <td className="py-3 px-3" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelected(p.id)} aria-label={`Select ${p.name}`} />
                  </td>
                  <td className="py-3 px-3 muv-text-solid" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <span className="flex items-center gap-1.5">
                      {p.isFeatured && <Star size={12} fill="var(--lavender)" color="var(--lavender)" />}
                      {p.name}
                    </span>
                  </td>
                  <td className="py-3 px-3 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>{p.category}</td>
                  <td className="py-3 px-3 muv-text-solid" style={{ borderBottom: "1px solid var(--card-border)" }}>₹{p.price}</td>
                  <td className="py-3 px-3" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <Badge tone={stockStatus === "OUT_OF_STOCK" ? "muted" : stockStatus === "LOW_STOCK" ? "positive" : "neutral"}>
                      {p.stock} · {STOCK_STATUS_LABEL[stockStatus]}
                    </Badge>
                  </td>
                  <td className="py-3 px-3" style={{ borderBottom: "1px solid var(--card-border)" }}><Badge tone={p.status === "ACTIVE" ? "positive" : "muted"}>{p.status}</Badge></td>
                  <td className="py-3 px-3" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <div className="flex gap-1.5">
                      <button className="muv-icon-circle" style={{ width: 30, height: 30 }} onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}><Pencil size={13} /></button>
                      <button className="muv-icon-circle" style={{ width: 30, height: 30 }} onClick={() => setDeleteTarget(p)} aria-label={`Delete ${p.name}`}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(adding || editing) && (
        <ProductFormModal
          categories={categories}
          existing={editing ?? undefined}
          onClose={() => { setAdding(false); setEditing(null); }}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5" style={{ background: "rgba(5,5,7,0.7)" }} onClick={() => setDeleteTarget(null)}>
          <div className="muv-modal-panel" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display muv-text-solid text-lg mb-4">Delete {deleteTarget.name}?</h3>
            <p className="muv-text-body text-sm mb-5">Products that appear in past orders are archived instead of deleted, to keep order history intact.</p>
            <div className="flex gap-3">
              <button className="muv-btn-ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="muv-btn-primary" onClick={confirmDelete} disabled={isPending}>{isPending ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        </div>
      )}

      {bulkDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5" style={{ background: "rgba(5,5,7,0.7)" }} onClick={() => setBulkDeleteOpen(false)}>
          <div className="muv-modal-panel" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display muv-text-solid text-lg mb-4">Delete {selected.size} product(s)?</h3>
            <p className="muv-text-body text-sm mb-5">Any with past order history are archived instead of deleted, same as a single delete.</p>
            <div className="flex gap-3">
              <button className="muv-btn-ghost" onClick={() => setBulkDeleteOpen(false)}>Cancel</button>
              <button className="muv-btn-primary" onClick={applyBulkDelete} disabled={isPending}>{isPending ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

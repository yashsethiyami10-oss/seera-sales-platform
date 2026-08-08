"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, Star } from "lucide-react";
import {
  createBanner, updateBanner, deleteBanner, reorderBanners,
  updateSections, updateAnnouncementBar, updateNewsletterContent,
  setBestSellers, setFeaturedProduct,
} from "@/actions/cms";
import { useToast } from "@/components/ui/toast";
import { Badge, Button } from "@/components/ui/primitives";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { Modal } from "@/components/ui/modal";
import { ImageUploader } from "@/components/admin/image-uploader";

type Banner = { id: string; type: "HERO" | "PROMO"; title: string; subtitle: string | null; imageUrl: string | null; ctaLabel: string | null; ctaLink: string | null; active: boolean; sortOrder: number };
type Section = { id: string; key: string; label: string; sortOrder: number; visible: boolean };
type AnnouncementBar = { message: string; link: string | null; active: boolean } | null;
type NewsletterContent = { heading: string; subtext: string } | null;
type ProductOption = { id: string; name: string; isFeatured: boolean; bestSellerRank: number | null };

/**
 * Every function called here (createBanner, updateBanner, deleteBanner,
 * reorderBanners, updateSections, updateAnnouncementBar,
 * updateNewsletterContent, setBestSellers, setFeaturedProduct) already
 * existed, fully real, in actions/cms.ts before this phase — none had an
 * admin page. This is the missing UI for six already-complete backend
 * capabilities, composed into one page because they're all "what the
 * homepage shows," not six unrelated features.
 */
export function HomepageCmsClient({
  banners: initialBanners,
  sections: initialSections,
  announcementBar,
  newsletterContent,
  products,
}: {
  banners: Banner[];
  sections: Section[];
  announcementBar: AnnouncementBar;
  newsletterContent: NewsletterContent;
  products: ProductOption[];
}) {
  const { showToast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // ---- Banners ----
  const [bannerModal, setBannerModal] = useState<{ mode: "add" | "edit"; type: "HERO" | "PROMO"; banner?: Banner } | null>(null);
  const [bannerForm, setBannerForm] = useState({ title: "", subtitle: "", imageUrl: "", ctaLabel: "", ctaLink: "", active: true });
  const [bannerDeleteTarget, setBannerDeleteTarget] = useState<Banner | null>(null);
  const [savingBanner, setSavingBanner] = useState(false);

  function openBannerModal(type: "HERO" | "PROMO", banner?: Banner) {
    setBannerModal({ mode: banner ? "edit" : "add", type, banner });
    setBannerForm(banner
      ? { title: banner.title, subtitle: banner.subtitle ?? "", imageUrl: banner.imageUrl ?? "", ctaLabel: banner.ctaLabel ?? "", ctaLink: banner.ctaLink ?? "", active: banner.active }
      : { title: "", subtitle: "", imageUrl: "", ctaLabel: "", ctaLink: "", active: true });
  }

  async function saveBanner() {
    if (!bannerModal) return;
    setSavingBanner(true);
    const payload = { type: bannerModal.type, title: bannerForm.title, subtitle: bannerForm.subtitle || undefined, imageUrl: bannerForm.imageUrl || undefined, ctaLabel: bannerForm.ctaLabel || undefined, ctaLink: bannerForm.ctaLink || undefined, active: bannerForm.active };
    const result = bannerModal.banner ? await updateBanner({ id: bannerModal.banner.id, ...payload }) : await createBanner(payload);
    setSavingBanner(false);
    if (result.success) {
      showToast(bannerModal.banner ? "Banner updated" : "Banner created");
      setBannerModal(null);
      router.refresh();
    } else {
      showToast(result.error.message);
    }
  }

  function moveBanner(type: "HERO" | "PROMO", ordered: Banner[], id: string, direction: -1 | 1) {
    const idx = ordered.findIndex((b) => b.id === id);
    const target = idx + direction;
    if (target < 0 || target >= ordered.length) return;
    const next = [...ordered];
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    startTransition(async () => {
      const result = await reorderBanners({ type, orderedIds: next.map((b) => b.id) });
      if (result.success) router.refresh();
      else showToast(result.error.message);
    });
  }

  function deleteBannerConfirmed() {
    if (!bannerDeleteTarget) return;
    startTransition(async () => {
      const result = await deleteBanner(bannerDeleteTarget.id);
      if (result.success) { showToast("Banner deleted"); router.refresh(); }
      else showToast(result.error.message);
      setBannerDeleteTarget(null);
    });
  }

  const heroBanners = initialBanners.filter((b) => b.type === "HERO").sort((a, b) => a.sortOrder - b.sortOrder);
  const promoBanners = initialBanners.filter((b) => b.type === "PROMO").sort((a, b) => a.sortOrder - b.sortOrder);

  // ---- Sections ----
  const [sections, setSections] = useState(initialSections);
  function toggleSectionVisible(key: string) {
    setSections((prev) => prev.map((s) => (s.key === key ? { ...s, visible: !s.visible } : s)));
  }
  function moveSection(key: string, direction: -1 | 1) {
    const ordered = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = ordered.findIndex((s) => s.key === key);
    const target = idx + direction;
    if (target < 0 || target >= ordered.length) return;
    [ordered[idx]!.sortOrder, ordered[target]!.sortOrder] = [ordered[target]!.sortOrder, ordered[idx]!.sortOrder];
    setSections(ordered);
  }
  async function saveSections() {
    const result = await updateSections(sections.map((s) => ({ key: s.key, sortOrder: s.sortOrder, visible: s.visible })));
    if (result.success) { showToast("Homepage sections saved"); router.refresh(); }
    else showToast(result.error.message);
  }

  // ---- Announcement bar ----
  const [barForm, setBarForm] = useState({ message: announcementBar?.message ?? "", link: announcementBar?.link ?? "", active: announcementBar?.active ?? false });
  async function saveBar() {
    const result = await updateAnnouncementBar({ message: barForm.message, link: barForm.link || undefined, active: barForm.active });
    if (result.success) { showToast("Announcement bar saved"); router.refresh(); }
    else showToast(result.error.message);
  }

  // ---- Newsletter content ----
  const [newsletterForm, setNewsletterForm] = useState({ heading: newsletterContent?.heading ?? "", subtext: newsletterContent?.subtext ?? "" });
  async function saveNewsletter() {
    const result = await updateNewsletterContent({ heading: newsletterForm.heading, subtext: newsletterForm.subtext });
    if (result.success) { showToast("Newsletter content saved"); router.refresh(); }
    else showToast(result.error.message);
  }

  // ---- Featured / Best Sellers ----
  const [bestSellerIds, setBestSellerIds] = useState(new Set(products.filter((p) => p.bestSellerRank != null).map((p) => p.id)));
  async function toggleFeatured(p: ProductOption) {
    const result = await setFeaturedProduct({ productId: p.id, featured: !p.isFeatured });
    if (result.success) router.refresh();
    else showToast(result.error.message);
  }
  function toggleBestSeller(id: string) {
    setBestSellerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      else { showToast("Pick at most 4 best sellers"); return prev; }
      return next;
    });
  }
  async function saveBestSellers() {
    const result = await setBestSellers([...bestSellerIds]);
    if (result.success) { showToast("Best sellers saved"); router.refresh(); }
    else showToast(result.error.message);
  }

  return (
    <div className="space-y-10">
      {/* ---- Hero Banners ---- */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display muv-text-solid text-base" style={{ fontWeight: 500 }}>Hero Banners</h2>
          <Button variant="ghost" onClick={() => openBannerModal("HERO")}><Plus size={14} /> Add Hero Banner</Button>
        </div>
        <div className="space-y-2">
          {heroBanners.map((b, i) => (
            <div key={b.id} className="muv-card flex items-center justify-between gap-3">
              <div>
                <p className="muv-text-solid text-sm">{b.title}</p>
                <p className="muv-text-meta text-xs mt-0.5">{b.subtitle}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={b.active ? "positive" : "muted"}>{b.active ? "Active" : "Inactive"}</Badge>
                <button onClick={() => moveBanner("HERO", heroBanners, b.id, -1)} disabled={i === 0} className="muv-icon-circle" style={{ width: 26, height: 26 }} aria-label="Move up"><ArrowUp size={11} /></button>
                <button onClick={() => moveBanner("HERO", heroBanners, b.id, 1)} disabled={i === heroBanners.length - 1} className="muv-icon-circle" style={{ width: 26, height: 26 }} aria-label="Move down"><ArrowDown size={11} /></button>
                <button onClick={() => openBannerModal("HERO", b)} className="muv-icon-circle" style={{ width: 26, height: 26 }} aria-label={`Edit ${b.title}`}><Pencil size={11} /></button>
                <button onClick={() => setBannerDeleteTarget(b)} className="muv-icon-circle" style={{ width: 26, height: 26 }} aria-label={`Delete ${b.title}`}><Trash2 size={11} /></button>
              </div>
            </div>
          ))}
          {heroBanners.length === 0 && <p className="muv-text-meta text-sm">No hero banners — the homepage falls back to default copy.</p>}
        </div>
      </section>

      {/* ---- Promo Banners ---- */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display muv-text-solid text-base" style={{ fontWeight: 500 }}>Promotional Banners</h2>
          <Button variant="ghost" onClick={() => openBannerModal("PROMO")}><Plus size={14} /> Add Promo Banner</Button>
        </div>
        <div className="space-y-2">
          {promoBanners.map((b, i) => (
            <div key={b.id} className="muv-card flex items-center justify-between gap-3">
              <div>
                <p className="muv-text-solid text-sm">{b.title}</p>
                <p className="muv-text-meta text-xs mt-0.5">{b.subtitle}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={b.active ? "positive" : "muted"}>{b.active ? "Active" : "Inactive"}</Badge>
                <button onClick={() => moveBanner("PROMO", promoBanners, b.id, -1)} disabled={i === 0} className="muv-icon-circle" style={{ width: 26, height: 26 }} aria-label="Move up"><ArrowUp size={11} /></button>
                <button onClick={() => moveBanner("PROMO", promoBanners, b.id, 1)} disabled={i === promoBanners.length - 1} className="muv-icon-circle" style={{ width: 26, height: 26 }} aria-label="Move down"><ArrowDown size={11} /></button>
                <button onClick={() => openBannerModal("PROMO", b)} className="muv-icon-circle" style={{ width: 26, height: 26 }} aria-label={`Edit ${b.title}`}><Pencil size={11} /></button>
                <button onClick={() => setBannerDeleteTarget(b)} className="muv-icon-circle" style={{ width: 26, height: 26 }} aria-label={`Delete ${b.title}`}><Trash2 size={11} /></button>
              </div>
            </div>
          ))}
          {promoBanners.length === 0 && <p className="muv-text-meta text-sm">No promotional banners.</p>}
        </div>
      </section>

      {/* ---- Section visibility & order ---- */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display muv-text-solid text-base" style={{ fontWeight: 500 }}>Homepage Sections</h2>
          <Button variant="ghost" onClick={saveSections}>Save Order &amp; Visibility</Button>
        </div>
        <div className="space-y-2">
          {[...sections].sort((a, b) => a.sortOrder - b.sortOrder).map((s, i, arr) => (
            <div key={s.key} className="muv-card flex items-center justify-between gap-3">
              <span className="muv-text-solid text-sm">{s.label}</span>
              <div className="flex items-center gap-3">
                <button onClick={() => moveSection(s.key, -1)} disabled={i === 0} className="muv-icon-circle" style={{ width: 26, height: 26 }} aria-label={`Move ${s.label} up`}><ArrowUp size={11} /></button>
                <button onClick={() => moveSection(s.key, 1)} disabled={i === arr.length - 1} className="muv-icon-circle" style={{ width: 26, height: 26 }} aria-label={`Move ${s.label} down`}><ArrowDown size={11} /></button>
                <ToggleSwitch checked={s.visible} onChange={() => toggleSectionVisible(s.key)} label={`${s.label} visible`} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Announcement bar ---- */}
      <section className="muv-card">
        <h2 className="font-display muv-text-solid text-base mb-4" style={{ fontWeight: 500 }}>Announcement Bar</h2>
        <div className="space-y-3">
          <input className="muv-input" placeholder="Message" value={barForm.message} onChange={(e) => setBarForm({ ...barForm, message: e.target.value })} />
          <input className="muv-input" placeholder="Link (optional)" value={barForm.link} onChange={(e) => setBarForm({ ...barForm, link: e.target.value })} />
          <div className="flex items-center justify-between">
            <span className="muv-text-body text-sm">Active</span>
            <ToggleSwitch checked={barForm.active} onChange={(v) => setBarForm({ ...barForm, active: v })} label="Announcement bar active" />
          </div>
          <Button variant="ghost" onClick={saveBar}>Save Announcement Bar</Button>
        </div>
      </section>

      {/* ---- Newsletter content ---- */}
      <section className="muv-card">
        <h2 className="font-display muv-text-solid text-base mb-4" style={{ fontWeight: 500 }}>Newsletter Section</h2>
        <div className="space-y-3">
          <input className="muv-input" placeholder="Heading" value={newsletterForm.heading} onChange={(e) => setNewsletterForm({ ...newsletterForm, heading: e.target.value })} />
          <input className="muv-input" placeholder="Subtext" value={newsletterForm.subtext} onChange={(e) => setNewsletterForm({ ...newsletterForm, subtext: e.target.value })} />
          <Button variant="ghost" onClick={saveNewsletter}>Save Newsletter Content</Button>
        </div>
      </section>

      {/* ---- Featured Products / Best Sellers ---- */}
      <section>
        <h2 className="font-display muv-text-solid text-base mb-3" style={{ fontWeight: 500 }}>Featured Products &amp; Best Sellers</h2>
        <p className="muv-text-meta text-xs mb-3">Featured toggles instantly. Best Sellers (max 4) need Save.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>{["Product", "Featured", "Best Seller"].map((h) => <th key={h} className="text-left py-2.5 px-3 muv-text-meta text-xs uppercase" style={{ borderBottom: "1px solid var(--card-border)" }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="py-2.5 px-3 muv-text-solid" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <span className="flex items-center gap-1.5">{p.isFeatured && <Star size={12} fill="var(--lavender)" color="var(--lavender)" />}{p.name}</span>
                  </td>
                  <td className="py-2.5 px-3" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <ToggleSwitch checked={p.isFeatured} onChange={() => toggleFeatured(p)} label={`${p.name} featured`} />
                  </td>
                  <td className="py-2.5 px-3" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <ToggleSwitch checked={bestSellerIds.has(p.id)} onChange={() => toggleBestSeller(p.id)} label={`${p.name} best seller`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button variant="ghost" onClick={saveBestSellers} className="mt-4">Save Best Sellers</Button>
      </section>

      {/* ---- Banner modal ---- */}
      {bannerModal && (
        <Modal title={bannerModal.mode === "edit" ? "Edit Banner" : `Add ${bannerModal.type === "HERO" ? "Hero" : "Promo"} Banner`} onClose={() => setBannerModal(null)}>
          <div className="space-y-4">
            <input className="muv-input" placeholder="Title" value={bannerForm.title} onChange={(e) => setBannerForm({ ...bannerForm, title: e.target.value })} />
            <input className="muv-input" placeholder="Subtitle (optional)" value={bannerForm.subtitle} onChange={(e) => setBannerForm({ ...bannerForm, subtitle: e.target.value })} />
            <div>
              <p className="muv-text-meta text-xs uppercase tracking-wide mb-1.5">Image</p>
              <ImageUploader value={bannerForm.imageUrl ? [bannerForm.imageUrl] : []} onChange={(urls) => setBannerForm({ ...bannerForm, imageUrl: urls[0] ?? "" })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input className="muv-input" placeholder="CTA Label" value={bannerForm.ctaLabel} onChange={(e) => setBannerForm({ ...bannerForm, ctaLabel: e.target.value })} />
              <input className="muv-input" placeholder="CTA Link" value={bannerForm.ctaLink} onChange={(e) => setBannerForm({ ...bannerForm, ctaLink: e.target.value })} />
            </div>
            <div className="flex items-center justify-between">
              <span className="muv-text-body text-sm">Active</span>
              <ToggleSwitch checked={bannerForm.active} onChange={(v) => setBannerForm({ ...bannerForm, active: v })} label="Banner active" />
            </div>
            <Button variant="primary" onClick={saveBanner} disabled={savingBanner || !bannerForm.title} className="w-full">
              {savingBanner ? "Saving…" : bannerModal.mode === "edit" ? "Save Changes" : "Create Banner"}
            </Button>
          </div>
        </Modal>
      )}

      {bannerDeleteTarget && (
        <Modal title={`Delete "${bannerDeleteTarget.title}"?`} onClose={() => setBannerDeleteTarget(null)}>
          <p className="muv-text-body text-sm mb-5">This can&rsquo;t be undone.</p>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => setBannerDeleteTarget(null)}>Cancel</Button>
            <Button variant="primary" onClick={deleteBannerConfirmed} disabled={isPending}>{isPending ? "Deleting…" : "Delete"}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

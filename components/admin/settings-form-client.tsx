"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateStoreSettings } from "@/actions/settings";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/primitives";
import { ToggleSwitch } from "@/components/ui/toggle-switch";

type Settings = {
  businessName: string; gstin: string; addressLine1: string; addressLine2: string; city: string; state: string; pincode: string;
  supportEmail: string; supportPhone: string; shippingFee: number; freeShippingThreshold: number; codEnabled: boolean; codFee: number;
  taxNote: string; instagramUrl: string; facebookUrl: string; twitterUrl: string; whatsappNumber: string;
  adminNotificationEmail: string; notifyAdminNewOrder: boolean; notifyAdminFailedPayment: boolean; notifyAdminLowStock: boolean; notifyAdminNewInquiry: boolean; notifyAdminNewReview: boolean;
};

export function SettingsFormClient({ initial }: { initial: Settings }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();

  const inputClass = (field: string) => "muv-input" + (errors[field] ? " muv-input-error" : "");
  const FieldError = ({ field }: { field: string }) => (errors[field] ? <p className="muv-field-error text-xs mt-1">{errors[field][0]}</p> : null);

  function handleSave() {
    setErrors({});
    startTransition(async () => {
      const result = await updateStoreSettings({
        ...form,
        shippingFee: Number(form.shippingFee),
        freeShippingThreshold: Number(form.freeShippingThreshold),
        codFee: Number(form.codFee),
      });
      if (result.success) {
        showToast("Settings saved");
        router.refresh();
      } else {
        setErrors(result.error.fieldErrors ?? {});
        showToast(result.error.message);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="muv-card">
        <h2 className="font-display muv-text-solid text-sm mb-4" style={{ fontWeight: 500 }}>Business Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Business Name</label>
            <input className={inputClass("businessName")} value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
            <FieldError field="businessName" />
          </div>
          <div>
            <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">GSTIN</label>
            <input className={inputClass("gstin")} value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
            <FieldError field="gstin" />
          </div>
          <div className="sm:col-span-2">
            <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Address Line 1</label>
            <input className={inputClass("addressLine1")} value={form.addressLine1} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Address Line 2</label>
            <input className={inputClass("addressLine2")} value={form.addressLine2} onChange={(e) => setForm({ ...form, addressLine2: e.target.value })} />
          </div>
          <div>
            <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">City</label>
            <input className={inputClass("city")} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div>
            <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">State</label>
            <input className={inputClass("state")} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
          </div>
          <div>
            <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Pincode</label>
            <input className={inputClass("pincode")} value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="muv-card">
        <h2 className="font-display muv-text-solid text-sm mb-4" style={{ fontWeight: 500 }}>Support Contact</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Support Email</label>
            <input className={inputClass("supportEmail")} value={form.supportEmail} onChange={(e) => setForm({ ...form, supportEmail: e.target.value })} />
            <FieldError field="supportEmail" />
          </div>
          <div>
            <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Support Phone</label>
            <input className={inputClass("supportPhone")} value={form.supportPhone} onChange={(e) => setForm({ ...form, supportPhone: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="muv-card">
        <h2 className="font-display muv-text-solid text-sm mb-1" style={{ fontWeight: 500 }}>Shipping & COD</h2>
        <p className="muv-text-faint text-xs mb-4">Stored here for reference — live checkout pricing is a separate, frozen calculation (see the phase report&apos;s Known Limitations).</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Shipping Fee (₹)</label>
            <input type="number" className={inputClass("shippingFee")} value={form.shippingFee} onChange={(e) => setForm({ ...form, shippingFee: Number(e.target.value) })} />
          </div>
          <div>
            <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Free Shipping Above (₹)</label>
            <input type="number" className={inputClass("freeShippingThreshold")} value={form.freeShippingThreshold} onChange={(e) => setForm({ ...form, freeShippingThreshold: Number(e.target.value) })} />
          </div>
          <div>
            <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">COD Fee (₹)</label>
            <input type="number" className={inputClass("codFee")} value={form.codFee} onChange={(e) => setForm({ ...form, codFee: Number(e.target.value) })} />
          </div>
          <div className="flex items-center justify-between muv-card" style={{ padding: 12 }}>
            <span className="muv-text-solid text-sm">Cash on Delivery Enabled</span>
            <ToggleSwitch checked={form.codEnabled} onChange={(v) => setForm({ ...form, codEnabled: v })} label="COD enabled" />
          </div>
          <div className="sm:col-span-2">
            <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Tax Note</label>
            <input className={inputClass("taxNote")} value={form.taxNote} onChange={(e) => setForm({ ...form, taxNote: e.target.value })} placeholder="e.g. Inclusive of all taxes" />
          </div>
        </div>
      </div>

      <div className="muv-card">
        <h2 className="font-display muv-text-solid text-sm mb-4" style={{ fontWeight: 500 }}>Social Links</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Instagram URL</label>
            <input className={inputClass("instagramUrl")} value={form.instagramUrl} onChange={(e) => setForm({ ...form, instagramUrl: e.target.value })} />
            <FieldError field="instagramUrl" />
          </div>
          <div>
            <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Facebook URL</label>
            <input className={inputClass("facebookUrl")} value={form.facebookUrl} onChange={(e) => setForm({ ...form, facebookUrl: e.target.value })} />
            <FieldError field="facebookUrl" />
          </div>
          <div>
            <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Twitter / X URL</label>
            <input className={inputClass("twitterUrl")} value={form.twitterUrl} onChange={(e) => setForm({ ...form, twitterUrl: e.target.value })} />
            <FieldError field="twitterUrl" />
          </div>
          <div>
            <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">WhatsApp Number</label>
            <input className={inputClass("whatsappNumber")} value={form.whatsappNumber} onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="muv-card">
        <h2 className="font-display muv-text-solid text-sm mb-1" style={{ fontWeight: 500 }}>Admin Notifications</h2>
        <p className="muv-text-faint text-xs mb-4">Real-time alerts sent to this address when the matching event happens — off means genuinely no email, not just hidden.</p>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="muv-text-meta text-xs uppercase tracking-wide mb-1.5 block">Admin Notification Email</label>
            <input className={inputClass("adminNotificationEmail")} value={form.adminNotificationEmail} onChange={(e) => setForm({ ...form, adminNotificationEmail: e.target.value })} placeholder="ops@muv.co.in" />
            <FieldError field="adminNotificationEmail" />
          </div>
          {([
            ["notifyAdminNewOrder", "New Order"],
            ["notifyAdminFailedPayment", "Failed Payment"],
            ["notifyAdminLowStock", "Low Stock"],
            ["notifyAdminNewInquiry", "New Business Inquiry"],
            ["notifyAdminNewReview", "New Review Pending Moderation"],
          ] as const).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between muv-card" style={{ padding: 12 }}>
              <span className="muv-text-solid text-sm">{label}</span>
              <ToggleSwitch checked={form[key]} onChange={(v) => setForm({ ...form, [key]: v })} label={label} />
            </div>
          ))}
        </div>
      </div>

      <Button variant="primary" onClick={handleSave} disabled={isPending}>{isPending ? "Saving…" : "Save Settings"}</Button>
    </div>
  );
}

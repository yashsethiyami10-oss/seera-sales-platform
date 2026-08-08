"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCostCenterAction, createProfitCenterAction, createApprovalRule, createExpenseCategory, createAssetCategory } from "@/actions/finance";
import { useToast } from "@/components/ui/toast";

type Account = { id: string; accountCode: string; name: string };
const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

export function ConfigurationManager({ accounts, costCenters, profitCenters, approvalRules }: {
  accounts: Account[]; costCenters: { id: string; code: string; name: string }[]; profitCenters: { id: string; code: string; name: string }[];
  approvalRules: { id: string; transactionType: string; minAmount: number; maxAmount: number | null; requiredRole: string }[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);

  const [ccCode, setCcCode] = useState(""); const [ccName, setCcName] = useState("");
  const [pcCode, setPcCode] = useState(""); const [pcName, setPcName] = useState("");
  const [transactionType, setTransactionType] = useState("EXPENSE_CLAIM");
  const [minAmount, setMinAmount] = useState(0);
  const [maxAmount, setMaxAmount] = useState<number | "">("");
  const [requiredRole, setRequiredRole] = useState("Finance Manager");
  const [expCategoryCode, setExpCategoryCode] = useState(""); const [expCategoryName, setExpCategoryName] = useState(""); const [expAccountId, setExpAccountId] = useState(accounts[0]?.id ?? "");
  const [assetCategoryCode, setAssetCategoryCode] = useState(""); const [assetCategoryName, setAssetCategoryName] = useState(""); const [assetLifeMonths, setAssetLifeMonths] = useState(60);
  const [assetAccountCode, setAssetAccountCode] = useState(accounts[0]?.accountCode ?? ""); const [depExpenseCode, setDepExpenseCode] = useState(accounts[0]?.accountCode ?? ""); const [accumDepCode, setAccumDepCode] = useState(accounts[0]?.accountCode ?? "");

  async function addCostCenter() { setPending(true); const r = await createCostCenterAction({ code: ccCode, name: ccName }); setPending(false); if (!r.success) { showToast(r.error.message, { tone: "dark" }); return; } showToast("Cost center created", { tone: "dark" }); router.refresh(); }
  async function addProfitCenter() { setPending(true); const r = await createProfitCenterAction({ code: pcCode, name: pcName }); setPending(false); if (!r.success) { showToast(r.error.message, { tone: "dark" }); return; } showToast("Profit center created", { tone: "dark" }); router.refresh(); }
  async function addApprovalRule() { setPending(true); const r = await createApprovalRule({ transactionType, minAmount, maxAmount: maxAmount === "" ? undefined : maxAmount, requiredRole }); setPending(false); if (!r.success) { showToast(r.error.message, { tone: "dark" }); return; } showToast("Approval rule created", { tone: "dark" }); router.refresh(); }
  async function addExpenseCategory() { setPending(true); const r = await createExpenseCategory({ code: expCategoryCode, name: expCategoryName, defaultAccountId: expAccountId }); setPending(false); if (!r.success) { showToast(r.error.message, { tone: "dark" }); return; } showToast("Expense category created", { tone: "dark" }); router.refresh(); }
  async function addAssetCategory() { setPending(true); const r = await createAssetCategory({ code: assetCategoryCode, name: assetCategoryName, defaultUsefulLifeMonths: assetLifeMonths, assetAccountCode, depreciationExpenseAccountCode: depExpenseCode, accumulatedDepreciationAccountCode: accumDepCode }); setPending(false); if (!r.success) { showToast(r.error.message, { tone: "dark" }); return; } showToast("Asset category created", { tone: "dark" }); router.refresh(); }

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="muv-os-card rounded-2xl p-4 space-y-2" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Cost Centers</p>
        <div className="flex gap-2"><input value={ccCode} onChange={(e) => setCcCode(e.target.value)} placeholder="Code" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent flex-1" style={fieldStyle} /><input value={ccName} onChange={(e) => setCcName(e.target.value)} placeholder="Name" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent flex-1" style={fieldStyle} /><button type="button" onClick={addCostCenter} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={fieldStyle}>Add</button></div>
        <div className="flex flex-wrap gap-1">{costCenters.map((c) => <span key={c.id} className="text-xs rounded-full px-2 py-1" style={{ background: "rgba(var(--text-rgb),0.06)" }}>{c.code}</span>)}</div>
      </div>
      <div className="muv-os-card rounded-2xl p-4 space-y-2" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Profit Centers</p>
        <div className="flex gap-2"><input value={pcCode} onChange={(e) => setPcCode(e.target.value)} placeholder="Code" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent flex-1" style={fieldStyle} /><input value={pcName} onChange={(e) => setPcName(e.target.value)} placeholder="Name" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent flex-1" style={fieldStyle} /><button type="button" onClick={addProfitCenter} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={fieldStyle}>Add</button></div>
        <div className="flex flex-wrap gap-1">{profitCenters.map((c) => <span key={c.id} className="text-xs rounded-full px-2 py-1" style={{ background: "rgba(var(--text-rgb),0.06)" }}>{c.code}</span>)}</div>
      </div>

      <div className="muv-os-card rounded-2xl p-4 space-y-2 lg:col-span-2" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Approval Matrix</p>
        <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>Never hardcoded into UI components — read by every approval gate via resolveRequiredRole.</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <input value={transactionType} onChange={(e) => setTransactionType(e.target.value)} placeholder="Transaction type" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input type="number" value={minAmount} onChange={(e) => setMinAmount(Number(e.target.value))} placeholder="Min amount" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input type="number" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value ? Number(e.target.value) : "")} placeholder="Max amount (blank=no limit)" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input value={requiredRole} onChange={(e) => setRequiredRole(e.target.value)} placeholder="Required role" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <button type="button" onClick={addApprovalRule} disabled={pending} className="muv-os-btn-primary rounded-lg px-2 py-1 text-xs" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Add Rule</button>
        </div>
        <div className="space-y-1">{approvalRules.map((r) => <div key={r.id} className="text-xs" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{r.transactionType}: ₹{r.minAmount}–{r.maxAmount ?? "∞"} → {r.requiredRole}</div>)}</div>
      </div>

      <div className="muv-os-card rounded-2xl p-4 space-y-2" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Expense Category</p>
        <input value={expCategoryCode} onChange={(e) => setExpCategoryCode(e.target.value)} placeholder="Code" className="muv-os-field w-full rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
        <input value={expCategoryName} onChange={(e) => setExpCategoryName(e.target.value)} placeholder="Name" className="muv-os-field w-full rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
        <select value={expAccountId} onChange={(e) => setExpAccountId(e.target.value)} className="muv-os-field w-full rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.accountCode} — {a.name}</option>)}</select>
        <button type="button" onClick={addExpenseCategory} disabled={pending} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-xs" style={fieldStyle}>Create</button>
      </div>

      <div className="muv-os-card rounded-2xl p-4 space-y-2" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Fixed Asset Category</p>
        <div className="grid grid-cols-2 gap-2">
          <input value={assetCategoryCode} onChange={(e) => setAssetCategoryCode(e.target.value)} placeholder="Code" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input value={assetCategoryName} onChange={(e) => setAssetCategoryName(e.target.value)} placeholder="Name" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input type="number" value={assetLifeMonths} onChange={(e) => setAssetLifeMonths(Number(e.target.value))} placeholder="Useful life (months)" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <select value={assetAccountCode} onChange={(e) => setAssetAccountCode(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>{accounts.map((a) => <option key={a.id} value={a.accountCode}>{a.accountCode} (asset)</option>)}</select>
          <select value={depExpenseCode} onChange={(e) => setDepExpenseCode(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>{accounts.map((a) => <option key={a.id} value={a.accountCode}>{a.accountCode} (dep. expense)</option>)}</select>
          <select value={accumDepCode} onChange={(e) => setAccumDepCode(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>{accounts.map((a) => <option key={a.id} value={a.accountCode}>{a.accountCode} (accum. dep.)</option>)}</select>
        </div>
        <button type="button" onClick={addAssetCategory} disabled={pending} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-xs" style={fieldStyle}>Create</button>
      </div>
    </div>
  );
}

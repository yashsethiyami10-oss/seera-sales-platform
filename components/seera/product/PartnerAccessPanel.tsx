"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";

type Member = { membershipId: string; userId: string; name: string; email: string; accessRole: string; active: boolean };

async function postJson(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? "Request failed");
  return d;
}
async function patchJson(url: string, body: unknown) {
  const r = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? "Request failed");
  return d;
}

// Founder/Admin UAT correction (P0, section 8-11): every human on a Partner gets their own User —
// never a shared password. This is the CTA the spec requires after S.S./Distributor creation
// ("Set Up Login" / "CREATE / INVITE LOGIN") AND the standing "Manage Access" section of the 360 —
// same component, `members` is simply empty right after creation. No invite-delivery mechanism
// exists in this codebase (see provisionPartnerLogin's own comment), so this reveals a
// server-generated temporary password exactly once and never re-shows it.
export function PartnerAccessPanel({
  language,
  partnerId,
  partnerType,
  members,
}: {
  language: "EN" | "HI";
  partnerId: string;
  partnerType: "SUPER_STOCKIST" | "DISTRIBUTOR";
  members: Member[];
}) {
  const hi = language === "HI",
    router = useRouter(),
    [open, setOpen] = useState(members.length === 0),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null),
    [revealed, setRevealed] = useState<{ email: string; password: string; roleCode: string } | null>(null),
    [copied, setCopied] = useState(false);
  const roleOptions =
    partnerType === "SUPER_STOCKIST"
      ? [["OWNER", hi ? "मालिक" : "Owner"], ["OPERATOR", hi ? "ऑपरेटर" : "Operator"]]
      : [["OWNER", hi ? "मालिक" : "Owner"], ["OPERATOR", hi ? "ऑपरेटर" : "Operator"], ["DELIVERY", hi ? "डिलीवरी" : "Delivery"]];

  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "पहुँच / उपयोगकर्ता" : "ACCESS / USERS"}</small>
        <h2>{hi ? "लॉगिन प्रबंधित करें" : "Manage access"}</h2>
      </div>
      {members.length > 0 && (
        <table className={styles.table ?? undefined} style={{ width: "100%", gridColumn: "1 / -1" }}>
          <thead>
            <tr>
              <th>{hi ? "नाम" : "Name"}</th>
              <th>{hi ? "ईमेल" : "Email"}</th>
              <th>{hi ? "भूमिका" : "Role"}</th>
              <th>{hi ? "स्थिति" : "Status"}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.membershipId}>
                <td>{m.name}</td>
                <td>{m.email}</td>
                <td>{m.accessRole}</td>
                <td>{m.active ? (hi ? "सक्रिय" : "Active") : hi ? "निरस्त" : "Revoked"}</td>
                <td>
                  {m.active && (
                    <button
                      type="button"
                      className={styles.secondaryBig}
                      disabled={busy}
                      onClick={() => {
                        const reason = window.prompt(hi ? "निरस्त करने का कारण दर्ज करें" : "Enter a reason to revoke access");
                        if (!reason) return;
                        setBusy(true);
                        setMessage(null);
                        void patchJson(`/api/foundation/users/${m.userId}`, { action: "revoke_party_membership", membershipId: m.membershipId, reason })
                          .then(() => {
                            setMessage({ ok: true, text: hi ? "पहुँच निरस्त की गई।" : "Access revoked." });
                            router.refresh();
                          })
                          .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not revoke access" }))
                          .finally(() => setBusy(false));
                      }}
                    >
                      {hi ? "निरस्त करें" : "REVOKE"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {revealed ? (
        <div className={styles.panel} style={{ gridColumn: "1 / -1" }}>
          <p role="status">
            {hi ? "इसे केवल एक बार दिखाया जाएगा — इसे अभी सुरक्षित रूप से साझा करें।" : "This is shown only once — share it securely now."}
          </p>
          <p>
            <strong>{hi ? "ईमेल" : "Email"}:</strong> {revealed.email}
          </p>
          <p>
            <strong>{hi ? "अस्थायी पासवर्ड" : "Temporary password"}:</strong> <code>{revealed.password}</code>
          </p>
          <p style={{ fontSize: "0.85em" }}>
            {hi
              ? "पहले लॉगिन पर पासवर्ड बदलना इस समय सिस्टम द्वारा लागू नहीं किया जाता।"
              : "Forced password change on first login is not currently enforced by this system — treat this credential as sensitive."}
          </p>
          <button
            type="button"
            className={styles.primaryBig}
            onClick={() => {
              void navigator.clipboard.writeText(`${revealed.email} / ${revealed.password}`).then(() => setCopied(true));
            }}
          >
            {copied ? (hi ? "कॉपी हो गया" : "COPIED") : hi ? "क्रेडेंशियल कॉपी करें" : "COPY CREDENTIALS"}
          </button>
          <button
            type="button"
            className={styles.secondaryBig}
            onClick={() => {
              setRevealed(null);
              setCopied(false);
              router.refresh();
            }}
          >
            {hi ? "पूर्ण" : "DONE"}
          </button>
        </div>
      ) : !open ? (
        <button type="button" className={styles.primaryBig} onClick={() => setOpen(true)} style={{ gridColumn: "2" }}>
          {hi ? "+ लॉगिन जोड़ें" : "+ ADD LOGIN"}
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setMessage(null);
            void postJson("/api/foundation/partner-logins", {
              partnerId,
              name: String(f.get("name") || ""),
              mobile: String(f.get("mobile") || ""),
              email: String(f.get("email") || "") || undefined,
              accessRole: String(f.get("accessRole") || "OWNER"),
            })
              .then((result: { user: { email: string }; roleCode: string; temporaryPassword: string }) => {
                setOpen(false);
                setRevealed({ email: result.user.email, password: result.temporaryPassword, roleCode: result.roleCode });
              })
              .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not set up login" }))
              .finally(() => setBusy(false));
          }}
        >
          <label>
            {hi ? "व्यक्ति का नाम" : "Person name"}
            <input name="name" required minLength={2} />
          </label>
          <label>
            {hi ? "मोबाइल" : "Mobile"}
            <input name="mobile" type="tel" required minLength={10} />
          </label>
          <label>
            {hi ? "ईमेल (वैकल्पिक)" : "Email (optional)"}
            <input name="email" type="email" />
          </label>
          <label>
            {hi ? "भूमिका" : "Role"}
            <select name="accessRole" required defaultValue="OWNER">
              {roleOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy} className={styles.primaryBig}>
            {hi ? "लॉगिन बनाएं" : "CREATE LOGIN"}
          </button>
          {members.length > 0 && (
            <button type="button" className={styles.secondaryBig} disabled={busy} onClick={() => setOpen(false)}>
              {hi ? "रद्द करें" : "Cancel"}
            </button>
          )}
        </form>
      )}
      {message && (
        <p role="status" data-ok={message.ok} className={message.ok ? undefined : styles.cardError}>
          {message.text}
        </p>
      )}
    </section>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { Phase1Language, ShellNavItem } from "@/lib/foundation/phase1-ui";
import { phase1Copy } from "@/lib/foundation/phase1-ui";
import styles from "./AppShell.module.css";

export function AppShell({ children, nav, language, user, role, portal }: { children: React.ReactNode; nav: ShellNavItem[]; language: Phase1Language; user: { name: string; email: string }; role: string; portal: string }) {
  const pathname = usePathname(), router = useRouter(), t = phase1Copy(language);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const changeLanguage = async (next: Phase1Language) => { if (next === language) return; setBusy(true); try { await fetch("/api/foundation/language", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: next }) }); router.refresh(); } finally { setBusy(false); } };
  const logout = async () => { setBusy(true); try { await fetch("/api/auth/logout", { method: "POST" }); location.assign("/login"); } finally { setBusy(false); } };
  const active = (href: string) => pathname === href || (href.split("/").length > 4 && pathname.startsWith(`${href}/`));
  return <div className={styles.shell}><button className={styles.mobileBackdrop} data-open={open} aria-label={t.close} onClick={() => setOpen(false)} /><aside className={styles.sidebar} data-open={open} aria-label="Primary navigation"><div className={styles.brand}><Image className={styles.brandLogo} src="/seera logo.png" alt="Seera" width={2560} height={1990} priority /><Image className={styles.brandTagline} src="/seera tagline.png" alt="Sarv Shaktiman" width={2172} height={724} priority /></div><nav className={styles.nav}>{nav.map(item => <Link key={item.href} href={item.href} data-active={active(item.href)} onClick={() => setOpen(false)}><span aria-hidden>{item.icon}</span>{item.label}</Link>)}</nav><div className={styles.footer}>{t.workspace}<br />TEST / Local review</div></aside><div className={styles.main}><header className={styles.header}><div className={styles.headerLeft}><button className={styles.menu} aria-label={t.menu} onClick={() => setOpen(true)}>☰</button><Image className={styles.mobileBrand} src="/seera logo.png" alt="Seera" width={2560} height={1990} priority /><span className={styles.crumb}>Seera / {pathname.split("/").filter(Boolean).slice(2).join(" / ") || portal}</span><span className={styles.roleBadge}>{role}</span></div><div className={styles.headerActions}><Link href={`/portal/${portal}/notifications`} aria-label={t.notifications}>◉ {t.notifications}</Link><button disabled={busy} onClick={() => changeLanguage(language === "EN" ? "HI" : "EN")}>{language === "EN" ? "हिन्दी" : "English"}</button><details className={styles.user}><summary><span>{user.name}</span>●</summary><div className={styles.userMenu}><Link href={`/portal/${portal}/profile`}>{t.profile}</Link><button disabled={busy} onClick={logout}>{t.logout}</button></div></details></div></header><main className={styles.content}>{children}</main></div></div>;
}

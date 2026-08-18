import Link from "next/link";
import Image from "next/image";
import styles from "./legal.module.css";

export default function LegalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brandLink}>
          <Image src="/seera logo.png" alt="Seera" width={120} height={93} className={styles.logo} priority />
          <span className={styles.brandName}>Seera Sales &amp; Distribution OS</span>
        </Link>
        <nav className={styles.nav}>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Use</Link>
          <Link href="/data-deletion">Data Deletion</Link>
        </nav>
      </header>
      <main className={styles.content}>{children}</main>
      <footer className={styles.footer}>
        <p>© {new Date().getFullYear()} Seera Detergent — Seera Sales &amp; Distribution OS.</p>
        <nav className={styles.footerNav}>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Use</Link>
          <Link href="/data-deletion">Data Deletion</Link>
        </nav>
      </footer>
    </div>
  );
}

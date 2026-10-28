import Image from "next/image";
import { LoginForm } from "./login-form";
import styles from "./login.module.css";
export default function LoginPage() {
  return (
    <main className={styles.page}>
      <section className={styles.brand}>
        <div className={styles.glow} aria-hidden />
        <div className={styles.brandAssets}>
          <Image className={styles.logo} src="/brand/seera-wordmark.png" alt="Seera" width={800} height={546} priority />
          <span className={styles.divider} aria-hidden />
          <Image className={styles.tagline} src="/brand/seera-tagline.png" alt="Sarv Shaktiman" width={900} height={175} priority />
        </div>
        <h1 className={styles.srOnly}>Seera — Sarv Shaktiman</h1>
        <h2>Sales &amp; Distribution OS</h2>
        <p>One workspace for the whole Seera network — field executives, managers, stockists, distributors and office.</p>
        <ul className={styles.features}>
          <li><b aria-hidden>◷</b><span><strong>Start day → Visit → Order</strong><small>Your full field day in three taps</small></span></li>
          <li><b aria-hidden>◎</b><span><strong>Live targets &amp; team view</strong><small>Managers see every beat, every order</small></span></li>
          <li><b aria-hidden>⇅</b><span><strong>Works offline</strong><small>Orders sync as soon as you are back online</small></span></li>
        </ul>
        <div className={styles.trust}><span>🔒 Secure role access</span><span>English + हिन्दी</span></div>
      </section>
      <section className={styles.panel}><LoginForm /></section>
    </main>
  );
}

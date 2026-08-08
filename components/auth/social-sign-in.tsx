"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/primitives";

/**
 * Phase 18 — Google was wired server-side (lib/auth.ts) since before this
 * phase but had no UI anywhere; this closes that gap. `googleEnabled`/
 * `appleEnabled` are computed server-side (from the same env vars lib/
 * auth.ts itself checks) by the Server Component page that renders this,
 * so a button only ever appears when the provider is genuinely configured
 * and would actually work — never a dead/broken button.
 */
export function SocialSignIn({ googleEnabled, appleEnabled, callbackUrl }: { googleEnabled: boolean; appleEnabled: boolean; callbackUrl?: string }) {
  if (!googleEnabled && !appleEnabled) return null;

  return (
    <div className="mb-6">
      <div className="flex flex-col gap-2.5">
        {googleEnabled && (
          <Button variant="ghost" type="button" className="w-full" onClick={() => signIn("google", { callbackUrl: callbackUrl ?? "/account" })}>
            <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.4 0 10.3-2.1 14-5.5l-6.5-5.5c-2 1.4-4.6 2.3-7.5 2.3-5.2 0-9.6-3.3-11.2-7.9l-6.5 5C9.6 39.6 16.3 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4 5.5l6.5 5.5C41.5 35.8 44 30.3 44 24c0-1.3-.1-2.7-.4-3.5z"/>
            </svg>
            Continue with Google
          </Button>
        )}
        {appleEnabled && (
          <Button variant="ghost" type="button" className="w-full" onClick={() => signIn("apple", { callbackUrl: callbackUrl ?? "/account" })}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.014-.11-.04-.23-.04-.36 0-1.09.535-2.22 1.19-2.98.85-.94 2.27-1.65 3.14-1.68.03.13.174.28.174.4zm4.565 15.71c-.03.09-.463 1.59-1.535 3.14-.923 1.34-1.877 2.68-3.385 2.71-1.48.03-1.96-.88-3.66-.88-1.7 0-2.23.85-3.63.91-1.45.05-2.56-1.45-3.49-2.79-1.89-2.75-3.34-7.75-1.4-11.13.96-1.68 2.68-2.75 4.55-2.78 1.42-.03 2.76.96 3.63.96.87 0 2.5-1.18 4.21-1.01.72.03 2.73.29 4.02 2.19-.1.07-2.4 1.4-2.37 4.18.03 3.33 2.92 4.44 2.96 4.46z"/>
            </svg>
            Continue with Apple
          </Button>
        )}
      </div>
      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px" style={{ background: "var(--hairline)" }} />
        <span className="muv-text-faint text-xs uppercase tracking-widest">or continue with</span>
        <div className="flex-1 h-px" style={{ background: "var(--hairline)" }} />
      </div>
    </div>
  );
}

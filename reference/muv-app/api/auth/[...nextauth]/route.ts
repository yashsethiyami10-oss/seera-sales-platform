import { handlers } from "@/lib/auth";

// Auth.js v5 exposes ready-made GET/POST handlers covering every NextAuth
// endpoint (/api/auth/session, /callback/:provider, /signout, etc) — no
// per-route code needed beyond re-exporting them here.
export const { GET, POST } = handlers;

// PRE-LAUNCH PASS 0B smoke test — T9: the HTTP trigger route (app/api/outbox/dispatch/route.ts)
// itself, not the worker function. Proves: (a) with SEERA_OUTBOX_WORKER_SECRET unset, every
// request is denied (fail-closed, never falls back to unauthenticated access), (b) with a secret
// configured, a request presenting no header or the wrong secret is denied 403, (c) a request
// presenting the correct secret is accepted. No real dispatch side effects are asserted here —
// that's already covered end-to-end by smoke-pass0b-outbox-worker.ts.

async function main() {
  const originalSecret = process.env.SEERA_OUTBOX_WORKER_SECRET;

  // Safety: this script only proves the AUTH GATE (403/503 vs pass-through) — it must never risk a
  // real query against any real database, production or otherwise, regardless of what DATABASE_URL
  // happens to resolve to in whatever shell runs this. Pinning it to an unroutable loopback address
  // guarantees any post-auth query fails fast on connection refusal rather than ever reaching a real
  // database — the auth-gate assertions below only depend on the response NOT being 403/503.
  process.env.DATABASE_URL = "postgresql://invalid:invalid@127.0.0.1:1/invalid_do_not_use";

  // --- (a) secret not configured at all -> fails closed regardless of header presented ---
  delete process.env.SEERA_OUTBOX_WORKER_SECRET;
  const { POST: postUnconfigured } = await import(`../../app/api/outbox/dispatch/route?t=${Date.now()}`);
  const resUnconfigured = await postUnconfigured(
    new Request("http://localhost/api/outbox/dispatch", { method: "POST", headers: { "x-outbox-worker-secret": "anything" } }),
  );
  if (resUnconfigured.status !== 503) throw new Error(`ASSERTION FAILED: expected 503 when SEERA_OUTBOX_WORKER_SECRET is unset, got ${resUnconfigured.status}`);
  console.log(`[T9a] OK — worker trigger fails closed (503) when SEERA_OUTBOX_WORKER_SECRET is unconfigured`);

  // --- (b)/(c) secret configured ---
  process.env.SEERA_OUTBOX_WORKER_SECRET = "smoke-test-secret-value";
  const { POST: postConfigured } = await import(`../../app/api/outbox/dispatch/route?t=${Date.now()}`);

  const resMissingHeader = await postConfigured(new Request("http://localhost/api/outbox/dispatch", { method: "POST" }));
  if (resMissingHeader.status !== 403) throw new Error(`ASSERTION FAILED: expected 403 with no secret header presented, got ${resMissingHeader.status}`);
  console.log(`[T9b] OK — missing secret header denied (403)`);

  const resWrongHeader = await postConfigured(
    new Request("http://localhost/api/outbox/dispatch", { method: "POST", headers: { "x-outbox-worker-secret": "wrong-value" } }),
  );
  if (resWrongHeader.status !== 403) throw new Error(`ASSERTION FAILED: expected 403 with wrong secret header, got ${resWrongHeader.status}`);
  console.log(`[T9c] OK — wrong secret header denied (403)`);

  // Correct secret: don't assert on DB side effects here (no TEST DB guard in this lightweight
  // script), just that auth itself lets the request through past the 403/503 gate.
  const resCorrectHeader = await postConfigured(
    new Request("http://localhost/api/outbox/dispatch", { method: "POST", headers: { "x-outbox-worker-secret": "smoke-test-secret-value" } }),
  );
  if (resCorrectHeader.status === 403 || resCorrectHeader.status === 503) {
    throw new Error(`ASSERTION FAILED: expected the correct secret to pass the auth gate, got ${resCorrectHeader.status}`);
  }
  console.log(`[T9d] OK — correct secret header passes the auth gate (status=${resCorrectHeader.status})`);

  if (originalSecret === undefined) delete process.env.SEERA_OUTBOX_WORKER_SECRET;
  else process.env.SEERA_OUTBOX_WORKER_SECRET = originalSecret;

  console.log("\nALL PRE-LAUNCH PASS 0B TRIGGER-AUTH SMOKE CHECKS PASSED");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

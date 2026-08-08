# MUV — Vercel BLOCKED Deployment Forensic Report

**Investigation only. No repository file was modified.** Every finding below is a direct field
from Vercel's own API (`vercel api`), fetched live against the `muv-platform` project and its
most recent deployments — not inferred from CLI table output alone.

## 1. Project metadata

`GET /v9/projects/muv-platform` (team `team_zcRT5iuxsS1m2duaLx5Cpaos`, plan **Pro**):

- `hasDeployments: true`, `live: false`
- Linked to GitHub: `yashsethiyami10-oss/muv-platform`, production branch `main`, `gitProviderOptions.createDeployments: "enabled"`
- `gitForkProtection: true` (irrelevant here — only affects PRs from forks)
- No `paused` field present anywhere in the project object.

## 2. Deployment Protection configuration

`ssoProtection.deploymentType: "all_except_custom_domains"` — Vercel Authentication is enabled on
deployment preview URLs. **This is a viewer/access gate on an already-built deployment, not a
build-time gate.** Confirmed not the cause here — see §7.

## 3. Team/project settings visible through CLI

- `vercel teams ls` → one team, `muv-care` (`team_zcRT5iuxsS1m2duaLx5Cpaos`).
- `vercel usage` → `Error: Costs not found (404)` — no billing/cost record retrievable this way;
  inconclusive on its own, but see §5 for why billing is ruled out by direct evidence instead.
- `vercel alerts` → `No alerts found.`
- `vercel api /v2/teams/<id>` → rejected by the CLI's beta `api` passthrough ("Invalid arguments") —
  this specific endpoint isn't reachable through this command in this CLI version; not a sign of a
  block, just a CLI limitation (confirmed by testing a second unrelated endpoint, `/v2/user`, which
  failed identically).

## 4. Do production deployments require approval?

No pending-approval state found. The blocked deployment's `checks` object shows only
`"deployment-alias": { "state": "succeeded" }` — no `pending`/`awaiting-approval` check exists.
This is not a manual-review queue.

## 5. Is the project paused?

No. No `paused`, `suspended`, `frozen`, or `hold` field appears anywhere in the project JSON.
Billing/plan is `"plan": "pro"` throughout — not a downgraded or restricted plan tier.

## 6. Does a pending deployment approval exist?

No. The block is immediate and automatic, not a human-review queue — see §7's timestamps.

## 7. Why deployments remain BLOCKED before build starts — exact root cause found

`GET /v13/deployments/dpl_F4sQXwT4uHPatFGXXTNxtRUPouW8` (the latest deployment, from the empty
commit) returns the precise, unambiguous answer:

```json
"readyState": "BLOCKED",
"status": "BLOCKED",
"buildSkipped": true,
"errorLink": "https://vercel.com/docs/deployments/troubleshoot-project-collaboration#account-configuration",
"readyStateReason": "The Deployment was blocked because GitHub could not associate the committer with a GitHub user.",
"seatBlock": { "blockCode": "COMMIT_AUTHOR_REQUIRED" },
"attribution": {
  "commitMeta": { "name": "Yash Sethiya", "email": "yashsethiyami10@gmail.comL", "isVerified": false }
}
```

`buildingAt`, `bootedAt`, `initReadyAt`, and `ready` are all the exact same millisecond as
`createdAt` — the block happens instantly, before the build container ever starts (`buildSkipped:
true`), which matches every symptom observed across all three recent deployments (0ms build
duration, no logs).

**The Pro-team `COMMIT_AUTHOR_REQUIRED` seat policy blocks any deployment whose Git commit author
email GitHub cannot match to a recognized GitHub account.** Direct verification against this
repository's own git config confirms exactly why:

```
$ git config user.email
yashsethiyami10@gmail.comL          <-- note the trailing "L"

$ git log -3 --format="%an <%ae>"
Yash Sethiya <yashsethiyami10@gmail.comL>
Yash Sethiya <yashsethiyami10@gmail.comL>
Yash Sethiya <yashsethiyami10@gmail.comL>
```

Every commit in this repository's history — not just the most recent empty commit — carries the
malformed author email `yashsethiyami10@gmail.comL` (a stray trailing "L", almost certainly a
typo when `git config user.email` was originally set). GitHub cannot associate that string with
any real account, so it cannot verify the committer is `yashsethiyami10-oss` (the actual,
Vercel-authenticated team member) or any other team member — and Vercel's seat-protection policy
blocks the deployment rather than risk attributing build usage to an unverified identity. This is
a real, precise, single-cause explanation for every BLOCKED deployment observed so far, not a
guess — it is stated verbatim by Vercel's own API in `readyStateReason` and `seatBlock.blockCode`.

## What this rules out

- Not a build/code failure — the build container never started (`buildSkipped: true`).
- Not a missing environment variable — env vars are never read before a build starts.
- Not Deployment Protection / Vercel Authentication (`ssoProtection`) — that gates viewing a
  deployed URL, unrelated to `readyState`.
- Not a paused project or a billing/plan restriction — no such field exists on the project.
- Not a pending manual approval queue — the block is instant and automatic, not human-reviewed.

## Exact fix (repository-side — not applied this pass, per instruction not to modify files)

```
git config user.email "yashsethiyami10@gmail.com"
```
(remove the trailing "L"), then any new commit will carry a correct, GitHub-matchable author
email. The three existing commits' author metadata would remain malformed unless amended/rebased
separately — a normal new commit going forward is enough to unblock future deployments; it does
not require rewriting existing history.

## Alternative fix (dashboard-side, no repository change needed)

Per the `errorLink` Vercel itself returns
(`vercel.com/docs/deployments/troubleshoot-project-collaboration#account-configuration`): in the
Vercel dashboard, Project Settings → Git (or Team Settings → Security, depending on where this
Pro-plan seat policy is configured for this team) has a commit-author-verification requirement
that can be relaxed — this does not require any repository change, only a Vercel configuration
change, and is the Founder's call to make, not something scriptable from this repository.

---

## PROJECT CONFIGURATION BLOCK

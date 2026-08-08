# Confidence Evaluation

`lib/intelligence/confidence-engine.ts` — `evaluateConfidence(evidenceCount, maxPossibleEvidence,
missingInformation)`.

## "Confidence must decrease when evidence is incomplete. Never manufacture confidence."

The formula is fixed and published, not tunable per call:

```
base    = (min(evidenceCount, maxPossibleEvidence) / maxPossibleEvidence) * 100
penalty = missingInformation.length * 10
score   = clamp(0, 100, round(base - penalty))
level   = score >= 70 ? "HIGH" : score >= 35 ? "MODERATE" : "LOW"
```

`evidenceCount` is capped at `maxPossibleEvidence` before the ratio is taken — extra evidence beyond the
expected maximum cannot push the base above 100%, so confidence has a real ceiling. The 10-point-per-gap
penalty is fixed (`MISSING_INFO_PENALTY = 10`), meaning 3+ missing items alone (30 points) can pull even
perfect evidence out of the `HIGH` band (needs ≥70).

## Where it's used

Shared by every stage that needs a synthesized confidence figure:

- **Decision Engine** — the primary caller, combining Priority + EQ + CQ evidence counts plus retrieved-
  knowledge count against `MAX_EXPECTED_EVIDENCE = 8`.
- **`buildDecisionPackage` action** (`actions/intelligence.ts`) — recomputes the same call independently
  when assembling a package from caller-supplied prior-stage outputs, using the same formula and the same
  fixed max of 8.

EQ and CQ compute their own narrower confidence figures inline rather than calling this function — theirs
is a single-classification confidence (how sure is this one emotional read?), not a multi-source
synthesis, so a separate, simpler calculation was appropriate for each rather than forcing every
confidence figure in the module through one shared formula that wasn't designed for that shape.

## Output

`{ score: number; level: ConfidenceLevel; evidenceCount: number; missingInformation: string[] }` — the
`missingInformation` array is carried through unchanged from the caller, so a consumer can see exactly
why a score landed where it did without re-deriving it.

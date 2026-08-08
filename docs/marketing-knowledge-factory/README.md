# MUV Marketing Knowledge Factory™

> A reusable AI Knowledge Repository — production-grade marketing intelligence, built one domain
> and one chapter at a time under the Founder-frozen `Master Claude Execution Prompt v3.0`.

---

## What this is

This repository is a **new**, separate Knowledge Factory from the (now-frozen) MUV Product
Knowledge Factory (`docs/knowledge-factory/`). It does not modify, duplicate, or supersede that
repository — it references and depends on it where relevant (Authority #3, per the Execution
Prompt's Authority Order), and is itself created exactly once, per the Founder's explicit
repository-root instruction.

## What this is NOT

- Not documentation for humans — a reusable AI knowledge base, consumable by future AI systems.
- Not software or automation implementation — "Automation Knowledge" and "AI Review Knowledge"
  sections describe *knowledge* (logic, rules, criteria), never code.
- Not a place for new governance. The Common Governance Layer, Marketing Knowledge Factory
  Constitution, Knowledge Efficiency Framework, and Validation Framework are Founder-controlled
  and intentionally live outside this repository — per the Founder's clarification (Execution
  Prompt v3.0, "Founder Governance Protocol"), this repository never recreates them.

## Authority order (per Execution Prompt v3.0)

1. Founder Decisions
2. This Execution Prompt (`Master Claude Execution Prompt v3.0`)
3. Product Knowledge Factory (`docs/knowledge-factory/`, frozen `FR-007`)
4. MUV Knowledge Library (`.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/MUV KNOWLEDGE LIBRARY/`)
5. Existing Frozen Repository (this repository's own accumulated, accepted content)

## Structure

```
docs/marketing-knowledge-factory/
├── README.md              (this file — created once, never regenerated)
├── MANIFEST.md             (repository-wide registry of domains/chapters/status)
├── CHANGE_LOG.md           (chronological, append-only — created once, extended incrementally)
└── domains/
    └── 01-brand-intelligence/
        ├── README.md       (domain-level Requirement Analysis + chapter list)
        └── chapters/
            └── chapter-01-brand-origin-and-naming/
                ├── README.md
                ├── 01_requirement_analysis.md
                ├── 02_architecture_verification.md
                ├── 03_knowledge_objects.md
                ├── 04_relationships.md
                ├── 05_dependencies.md
                ├── 06_validation.md
                ├── 07_self_challenge.md
                ├── 08_acceptance_criteria.md
                ├── 09_merge_instructions.md
                └── json/
                    ├── manifest.json
                    ├── knowledge_objects.json
                    ├── relationships.json
                    ├── dependencies.json
                    └── validation_results.json
```

This structure was created once, for Chapter 1, and is the Founder-approved repository structure
per the Execution Prompt's Repository Root instruction — it is not redesigned by later chapters or
domains; later chapters/domains add new folders following this exact same shape.

## Execution sequence (frozen, per Execution Prompt v3.0)

1. Brand Intelligence ← **in progress**
2. Product Marketing
3. Customer Intelligence
4. Campaign Intelligence
5. Channel Intelligence
6. Content Intelligence
7. Creative Intelligence
8. Growth Intelligence
9. Marketing Operations
10. Marketing Learning

One domain at a time. One chapter at a time. Stop after every chapter. See `MANIFEST.md` for
live status.

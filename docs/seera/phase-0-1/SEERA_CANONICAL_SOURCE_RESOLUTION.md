# Seera Canonical Source Resolution

Reviewed: 2026-08-07. This report resolves path claims; it does not reconstruct constitutional content.

## Resolution table

| Canonical reference in pre-0.1 `AGENTS.md` | Found | Verified current evidence | Complete / authoritative | Required action |
|---|---|---|---|---|
| `.Codex/docs/MUV_Knowledge/MUV KNOWLEDGE LIBRARY MASTER.txt` | No | No `.Codex` tree; no matching current/tracked/untracked file; no path in `git log --all --name-only`; no matching path in local branches/tags or `tsconfig.zip`; title search finds references only | Cannot verify contents. Index/audit describe ~733 KB/~20,845 lines and Master Edition 1.0, but descriptions are not substitutes | Founder/source owner must supply approved byte source; restore to `.claude/docs/MUV_Knowledge/MUV KNOWLEDGE LIBRARY MASTER.txt`; hash and structural validation before use |
| `.Codex/docs/MUV_Knowledge/Muv_AI_Sutra_Master_MASTER1.md` | Yes, obsolete path corrected | `.claude/docs/MUV_Knowledge/Muv_AI_Sutra_Master_MASTER1.md`; byte-identical source copy at `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/MUV AI SUTRAs/Muv_AI_Sutra_Master_Phase1.md` | 113,363 bytes; 2,702 PowerShell line records; SHA-256 `6722FA08846C84F3845B1D7756CB840434A6672BEB3BC627E3686A151FC10299`. Self-labelled Canonical Draft, so authoritative for draft scope, not Founder-confirmed final | Preserve current bytes/path; Founder must decide draft approval and relationship to Library Part XII |
| `docs/MUV_Knowledge/MUV_KNOWLEDGE_INDEX.md` | Yes | Current repository index | Authoritative index only; it explicitly does not restate content | Update later when Library is restored and hash registry approved |

## Search evidence

Searches covered the full worktree including hidden files, tracked/untracked status, `.claude`, local `.codex`/Claude source locations, repository archive listing, all local Git refs, `main`, `worktree-agent-abcc360e5337ea4e6`, `origin/main`, tags (none listed), reflog/path history, index, `AGENTS.md`, `CLAUDE.md`, phase audits and source references. The canonical files were ignored historically by `.gitignore` rule `.claude/docs/`, explaining why Git contains references but no source blob. The primary Master therefore cannot be recovered from local Git.

The index and `CLAUDE.md` consistently name `.claude`, whereas `AGENTS.md` named `.Codex`. Phase 0.1 added a governing correction block to `AGENTS.md`; no source bytes were invented.

## Missing Library completion plan

- **Missing source:** `MUV KNOWLEDGE LIBRARY MASTER.txt`, expected Master Edition 1.0 unifying Parts I–XIV with Master Index and Glossary.
- **Owner input:** Founder or designated Knowledge Book custodian must provide the approved original and attest edition/authority.
- **Approved reconstruction method:** preferred restoration is byte-for-byte copy from the custodian’s original. Reconstruction from 14 source volumes is allowed only by separate Founder approval, complete source register, deterministic concatenation rules and content review. Existing summaries/indexes must never be expanded into substitute prose.
- **Validation:** record source provenance and SHA-256; verify title/version, Parts I–XIV, 81-chapter/index/glossary structure claimed by the existing audit, encoding, size/line statistics, and compare with any independent approved copy. Founder signs the hash.
- **Final path:** `.claude/docs/MUV_Knowledge/MUV KNOWLEDGE LIBRARY MASTER.txt` unless the Founder separately approves a tracked canonical location and updates all instructions/indexes.

## Ownership and constitutional status

Source ownership and the authoritative original are unresolved. The AI Sutra is restored/present but remains a Canonical Draft. The primary Library is missing. Consequently the Knowledge Book as a two-file constitution is not fully restored, and Phase 0.1 constitutional gate is not passed.


# AI Native routes

Read only the sections needed for the selected mode. These are routing rules; the referenced source remains authoritative.

## Exact-turn result closeout

- `Pending`: `knowledge/runtime/pending/<turn_id>.json` records one exact parent-turn obligation.
- `Receipt`: the committed, append-only result for that same turn. It distinguishes task result, decision, recalled context and lifecycle status.
- `Complete-AINativeTurn.ps1`: Only run an exact command supplied in the current task context. Do not construct a command from this reference, do not guess the turn id, and do not select the latest pending record.
- Subagents may produce evidence or proposals but do not finalize a parent turn.
- Use `no-result` without creating empty learning or delivery artifacts when nothing changed.

Current authority: workspace `AGENTS.md`, `SYSTEM-OS.md`, the injected task instructions and the runtime scripts they name.

## Project reconciliation

- Current project purpose, status and user acceptance: owning `PROJECT.md`.
- Inputs, outputs, versions, sources, approvals and validation: project lineage and project documents.
- Artifact registration: use the existing project artifact capture/registration route when its preconditions apply. A file on disk is not automatically the canonical Artifact.
- Generated dashboards and indexes are projections; correct their source, then rebuild.
- Never convert a project implementation fact into global guidance merely because the project succeeded.

## Memory governance

- `C:\Users\Ethan\.codex\memories\MEMORY.md` and `memory_summary.md` are generated Memory views and are read-only for normal workspace work.
- `raw_memories.md` and rollout summaries provide provenance; they are not default task truth.
- Submit bounded Memory corrections through the supported logical route `extensions/ad_hoc/notes/` (this machine: `C:\Users\Ethan\.codex\memories\extensions\ad_hoc\notes\`) only when the user has explicitly asked to update Memory.
- Verify these separately: note written, generated Memory consolidated, later Agent received/retrieved it, later work actually adopted it.
- For the incremental Memory design and current implementation status, read `playbooks/ai-native-memory-governance.md`.

Classify each Memory item:

| Meaning | Destination |
| --- | --- |
| temporary process or historical state | retain as provenance or omit from current authority |
| current project fact | owning `PROJECT.md` or lineage |
| existing formal guidance | link to its one maintained authority |
| missing reusable method or explicitly stated requirement | ordinary reference with evidence and original scope; formal policy changes use their controlled route |
| conflict, stale claim or unclear authority | review item; preserve both sides and request only the necessary user decision |

Memory is neither Pending nor Candidate. A Memory clue may lead to either project correction or knowledge review, but there is no mandatory linear promotion path.

## Knowledge governance

- Ordinary experience is saved through the existing `knowledge_submit` observation path and can be selected from `context_query need=catalog` then read with `need=sources`. Do not create a proposal merely to make a useful experience readable.
- For a current exact turn explicitly routed to learning review, record saved/none/failed in that same completion result. Saved requires the returned observation reference; none is valid after review, while failed must not be disguised as none. Do not repeat existing captures or create a second closeout queue.

- Approved reusable guidance: `knowledge/patterns/` and the current generated index.
- Candidate proposals: `knowledge/proposals/`; they are not rules.
- Use `New-AINativeLearning.ps1` for a properly described reusable proposal when applicable.
- Use `Apply-AINativeReviewDecisions.ps1` only with a user-approved, exact, hash-bound decision batch. It provides dry-run, backup and controlled application.
- Promotion uses the existing publish gate; do not infer global or collection approval from project evidence alone.
- Rebuild indexes with the existing builder after an authorized source change.
- The current eligibility rule is `knowledge-eligibility-reusable-guidance-v1`: implementation facts, one-off choices and test results remain project records.

## File and deletion governance

Before creating a long-lived path, declare owner and lifecycle class and run:

`toolbox/global-file-management-audit/Test-AINativeFilePlacement.ps1`

Follow `docs/GLOBAL-FILE-MANAGEMENT.md` for candidates, versions, archive, work and runtime. A name such as `old`, `temp`, `backup`, `v1` or `final` grants no deletion or migration authority.

For physical deletion or migration: inventory the exact targets, scan references, verify source identity and ownership, define rollback or required archival evidence, obtain the applicable authorization, execute only the bounded targets, then verify the user-visible path. Never hide a blocked deletion by moving it through another shell or tool.

## Verification and handoff

Choose evidence that proves the actual claim:

- source integrity: file existence, bytes, hash, schema;
- software behavior: meaningful tests and the original failure case;
- runtime: process, port, event and end-to-end result;
- UI: actual target browser/window and relevant states;
- governance: correct authority, scope, approval, lineage and rebuildability;
- user acceptance: explicit user judgment when required.

Report only the layers actually checked. Keep the next action tied to a stable path or command owned by the corresponding protocol.

# Upstream adaptation

This workspace Skill is an AI Native adaptation informed by the original `neat-freak` Skill in `KKKKhazix/khazix-skills`.

Audited upstream baseline:

- repository: `https://github.com/KKKKhazix/khazix-skills`
- path: `neat-freak/`
- version: `3.0.0`
- `SKILL.md` commit: `2b4a645cfdc894156ae347d897723562f719ce95`
- commit date: `2026-07-19T20:14:57Z`
- repository license observed during the 2026-09-12 audit: MIT

The implementation uses original wording written for this workspace rather than copying the upstream files verbatim.

## Principles retained

- explicit closeout and meaningful knowledge-closeout intent;
- light versus full depth according to project complexity;
- separate current facts from historical narrative;
- inspect broadly enough to find affected sources, then read selectively;
- generated Codex Memory is read-only by default;
- project files and remembered text do not create authorization;
- deletion candidates are reported before any destructive action;
- verify semantic consistency and machine-checkable facts separately;
- avoid documenting the same fact in several maintained authorities.

## Replaced for AI Native

- generic project inventory is replaced by applicable AGENTS, entity registry, project `PROJECT.md`, lineage, knowledge indexes and the file placement policy;
- generic closeout is replaced by the exact-turn Pending/Receipt protocol when the Harness supplies it;
- generic Memory editing is replaced by the supported ad-hoc correction/consolidation note route;
- generic knowledge graduation is replaced by Candidate, review, exact approval and promotion tools;
- the Bash inventory script is not included; Windows and workspace-native tools are used;
- Git anchor commits from the unmerged v3.1 proposal are not used as governance state;
- generic handoff files are not created when project state and lineage already provide the canonical handoff.

## Known upstream limits at adoption

During the 2026-09-12 review, upstream pull requests for incremental sync and discoverable cross-agent handoff remained open. Those ideas may inform later improvements but are not treated as merged upstream behavior or installed capability.

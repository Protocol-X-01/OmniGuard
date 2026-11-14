# Changelog

## 0.1.4 — 14 November 2026

- Bounded compiler-resolved effects through direct helpers, storage aliases and selected modifiers; explicit incomplete coverage for unsupported dispatch, recursion and exhausted bounds.
- Source-backed JSON/SARIF and fixture bundles with cross-file evidence validation.
- Separate Forge Jira import, evidence review, remediation creation, matching-profile rescan verification and explicit completion.
- Production 2.0.0 acceptance on cs0lutions: KAN-6, verification comment 10005, Done retained after reload. A source-only rescan could not verify its compiler baseline.
- Accessible local dashboard fixes for contrast, keyboard navigation, narrow layouts and stale evidence after a failed rescan.
- Public installer/privacy contact, packaged judge fixtures, contribution guidance and reproducible CI.

Measured release evidence: 38 Rust tests, 23 Forge tests and three local effect-vault execution witnesses. The frozen synthetic review matches 24/26 labels, with explicit-super and composed-modifier cases incomplete. Independent judge-site installation and public video/submission are still open.

## Earlier development milestones

| Version | Change | Evidence |
| --- | --- | --- |
| 0.1.3 | Guard-anchor write invalidation and explicit selected-symlink handling | [Guard analysis](docs/guard-analysis.md) |
| 0.1.2 | Optional native compiler facts across supplied imports and inherited storage | [Compiler analysis](docs/compiler-analysis.md) |
| 0.1.1 | Twelve-rule AST pack, complete source snapshots and local EVM witnesses | [Rule-pack results](docs/rule-pack-results.md) |
| 0.1.0 | Independent Rust/Forge vertical slice and first real Jira remediation | [Initial acceptance](docs/acceptance-cs0lutions-2026-11-13.md) |

These entries describe dated implementation milestones, not earlier public GitHub releases.

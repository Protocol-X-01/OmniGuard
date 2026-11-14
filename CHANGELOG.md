# Changelog

## Bitbucket integration 0.1.5 — 2026-11-14

- Separate Forge PR panel and Jira PR-URL imports validate public isolated-fixture reports against exact repository source bytes and full commit identities.
- PR baselines reject stale heads, missing or altered source, private/fork PRs, cross-PR and manual-import substitutions. Existing fixture identities and importer-ID minimization remain compatible.
- Added a pinned-engine/compiler pipeline example and setup/privacy documentation. The owner's two-step-verification setup is complete; automatic PR Pipeline #1 passed and its downloaded JSON/SARIF were verified against the source commit and committed report.
- 41 Jira/shared and 3 Bitbucket panel tests pass. Rust engine stays at 0.1.4; no new detection claims or release-tag replacement.
- Deployed Jira 3.0.0 on cs0lutions and Bitbucket 2.0.0 in omniguard. [Production acceptance](docs/acceptance-bitbucket-2026-11-14.md) completed PR #1 → KAN-7 → fixed rescan → Done, including stale-head and mismatched-source rejection. Comment 10007 verifies the subsequent pipeline-checked PR commit; comment 10006 preserves the original fixed-rescan evidence.


## Forge 2.1.0 rollout — 14 November 2026

- New scan imports no longer save unused importer account IDs. Project administrators can review and explicitly remove the legacy field; 31 Forge tests pass, including permission, scope, concurrency and interrupted-cleanup cases.
- Approved cleanup removed 16 legacy fields across KAN development/production and OGTEST production. All 17 scan records and the existing Jira verification references remained intact after reload. [Rollout evidence](docs/privacy-minimization.md).
- Updated the public privacy notice and current judge instructions. The Rust engine stays at 0.1.4; the earlier tagged archives remain unchanged.

## 0.1.4 — 14 November 2026

- Bounded compiler-resolved effects through direct helpers, storage aliases and selected modifiers; explicit incomplete coverage for unsupported dispatch, recursion and exhausted bounds.
- Source-backed JSON/SARIF and fixture bundles with cross-file evidence validation.
- Separate Forge Jira import, evidence review, remediation creation, matching-profile rescan verification and explicit completion.
- Production 2.0.0 acceptance on cs0lutions: KAN-6, verification comment 10005, Done retained after reload. A source-only rescan could not verify its compiler baseline.
- Accessible local dashboard fixes for contrast, keyboard navigation, narrow layouts and stale evidence after a failed rescan.
- Public installer/privacy contact, packaged judge fixtures, contribution guidance and reproducible CI.

Measured evidence at the tagged release: 38 Rust tests, 23 Forge tests and three local effect-vault execution witnesses. The frozen synthetic review matches 24/26 labels, with explicit-super and composed-modifier cases incomplete. Separate-site acceptance and public video were completed afterward; final submission and an independent reviewer-account test remain open. See the [current judge guide](docs/judge-guide.md).

## Earlier development milestones

| Version | Change | Evidence |
| --- | --- | --- |
| 0.1.3 | Guard-anchor write invalidation and explicit selected-symlink handling | [Guard analysis](docs/guard-analysis.md) |
| 0.1.2 | Optional native compiler facts across supplied imports and inherited storage | [Compiler analysis](docs/compiler-analysis.md) |
| 0.1.1 | Twelve-rule AST pack, complete source snapshots and local EVM witnesses | [Rule-pack results](docs/rule-pack-results.md) |
| 0.1.0 | Independent Rust/Forge vertical slice and first real Jira remediation | [Initial acceptance](docs/acceptance-cs0lutions-2026-11-13.md) |

These entries describe dated implementation milestones, not earlier public GitHub releases.

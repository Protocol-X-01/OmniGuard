# Project status

Updated **2026-11-17**. These are dated acceptance records, not continuous monitoring of hosted services. Source publication does not promote development or local features to production.

| Capability | Dated evidence | Boundary |
| --- | --- | --- |
| Source evidence → Jira → matching rescan | [Production acceptance · 2026-11-14](https://github.com/Protocol-X-01/OmniGuard/blob/main/docs/acceptance-production-cs0lutions-2026-11-14.md) | Static findings and supplied evidence consistency do not certify safety or scanner execution. |
| Bitbucket PR scans and Jira provenance | [Production acceptance · 2026-11-14](https://github.com/Protocol-X-01/OmniGuard/blob/main/docs/acceptance-bitbucket-2026-11-14.md) | Public isolated fixtures only. Import, verification and completion remain reviewer actions; no private/fork PR support or execution attestation. |
| Team defence and reviewed owner contact | [Forge development acceptance · 2026-11-14](https://github.com/Protocol-X-01/OmniGuard/blob/main/docs/acceptance-frontline-cs0lutions-dev-2026-11-14.md) | Acceptance was development 3.6.0; a self-mention is not an independent reviewer test, online presence or a read receipt. |
| Shared review queue and explicit handoffs | [Forge development preview · 2026-11-17](https://github.com/Protocol-X-01/OmniGuard/blob/main/docs/acceptance-review-queue-2026-11-17.md) | One real Jira actor tested. Independent two-user Jira acceptance and production promotion remain pending; reviews do not complete issues or certify safety. |
| Encrypted conversation and file/folder handoff | [Local browser acceptance · 2026-11-17](https://github.com/Protocol-X-01/OmniGuard/blob/main/docs/evidence/transfers-2026-11-17/transfer-browser-acceptance.json) | Loopback lab only: 100 files / 10 MiB. No production identity, hosting, recovery, retention or physical mobile acceptance. Integrity is not malware scanning. |
| Combined defence regression lab | [Local fixture acceptance · 2026-11-16](https://github.com/Protocol-X-01/OmniGuard/blob/main/fixtures/combined-defence/README.md) | Ten demonstrated properties remain undetected. The strict all-case gate fails as expected. Authored fixtures do not measure general accuracy. |

## Next team priorities

All five are planned. Proposed roles in the [roadmap](team-product-roadmap.md) are not assigned people.

1. **Independent reviewer pilot** — Complete the shared queue handoff with two real Jira users, then exercise permission loss, stale evidence and deputy recovery. Acceptance: Both real users see the same evidence and immutable receipts; changed evidence and revoked access fail closed before production promotion.

2. **Evidence-grounded Rovo teammate** — Explain findings and draft triage from project-scoped evidence with visible agent attribution. Acceptance: Every claim links to evidence; cross-project reads fail and consequential actions require explicit review.

3. **Contract and bytecode workbench** — Share ABI, entry points, authority, storage, interactions and bytecode/source mappings. Acceptance: Every view binds to the artifact hash; unknown or inferred relationships remain labelled.

4. **Deployment rehearsal and sign-off** — Review local simulations, configuration changes and rollback plans before release. Acceptance: A reviewer can reproduce the plan and compare deployed-artifact identity; this does not authorize a live transaction.

5. **Team outcome metrics** — Track review age, stale evidence, time to verified remediation and incident handoff quality. Acceptance: Metrics show their source and time window, separate unknowns, and avoid scoring people or claiming protection from counts alone.

## Keep publication in step

Edit `docs/project-status.json`, run `python3 scripts/sync-project-status.py`, then run `--check` in review. CI checks the README, static guide, submission copy and video notes against this record.

A release is synchronized only after tests and the PR pass, the hosted guide serves the intended commit, and the saved Devpost/YouTube changes are read back. Keep the publication receipt separate from feature acceptance; record pending work honestly. Do not rewrite historical tags or imply a production rollout from a documentation update.

Current demo: [4:44 walkthrough: dated core and team footage plus the 17 November local shared-review exercise and Forge development preview](https://www.youtube.com/watch?v=eTlsw__RC_o).

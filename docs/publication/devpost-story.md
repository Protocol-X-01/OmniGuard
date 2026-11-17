## Inspiration

A security finding can lose its context as soon as it becomes a ticket. The developer sees a warning, the reviewer sees a status, and neither can easily tell whether the changed source was checked under the same conditions.

OmniGuard brings that context into Jira: the source behind a finding, the analysis that produced it, and the rescan used to verify remediation. We are extending that handoff to the whole team: owners, reviewers, responders and AI collaborators. Every known entry point should have an owner, a defined check, evidence and a visible coverage status.

## What it does

The core workflow is **scan → inspect evidence → create Jira remediation → import a matching rescan → record verification → explicitly complete the issue**. The independent Rust CLI analyzes Solidity syntax trees and optional native compiler facts. JSON/SARIF reports carry exact excerpts, byte spans, related declarations and SHA-256 source snapshots.

The separate Atlassian Forge app checks the bundle and retains the original engine, rules, compiler and analysis mode. A clean but weaker rescan cannot verify a compiler-backed baseline. Reviewers retain control of Jira imports and transitions. The Bitbucket extension connects that evidence to the exact public fixture PR and source/destination commits, with a reproducible pipeline.

## How it is built

OmniGuard was built from scratch. The Rust core uses tree-sitter Solidity, optional native solc facts and bounded ordered-effect analysis. It has no dependency on Atlassian credentials or a chain connection. The Forge Custom UI, resolvers, installation-scoped KVS and Jira APIs form a separate application. Forge checks imported evidence consistency; it does not execute the scanner or certify the supplied report.

The development team-defence workflow adds ownership, attributed decisions, evidence-bound retesting and reviewed Jira owner mentions. The separate local communications lab uses Matrix JS SDK, Rust crypto and Synapse. Exact device fingerprints are checked before sending encrypted messages or files. File names, paths and contents are encrypted together; the recipient validates provenance, bounds and hashes before explicitly saving a copy. Chat content and keys never pass through Jira or Forge.

The interface uses readable evidence, visible keyboard focus, text-labelled states and responsive layouts. The public guide is a static site without scan uploads, scripts or analytics.

## What is demonstrated

Updated **2026-11-17**. These are dated acceptance records, with the environment and limits stated for each capability:

- **Source evidence → Jira → matching rescan — production acceptance (2026-11-14).** Twelve Solidity rules, source-bound reports and explicit Jira verification/completion. KAN-6 and a separate-site fixture completed the workflow. Static findings and supplied evidence consistency do not certify safety or scanner execution. [Evidence](https://github.com/Protocol-X-01/OmniGuard/blob/main/docs/acceptance-production-cs0lutions-2026-11-14.md).
- **Bitbucket PR scans and Jira provenance — production acceptance (2026-11-14).** Automatic fixture Pipeline #1 passed; JSON/SARIF and full PR commits matched the Jira KAN-7 verification record. Public isolated fixtures only. Import, verification and completion remain reviewer actions; no private/fork PR support or execution attestation. [Evidence](https://github.com/Protocol-X-01/OmniGuard/blob/main/docs/acceptance-bitbucket-2026-11-14.md).
- **Team defence and reviewed owner contact — forge development acceptance (2026-11-14).** Entry-point ownership, explicit coverage gaps, attributed triage and retest completed KAN-8. A reviewed Jira owner mention retained its receipt. Acceptance was development 3.6.0; a self-mention is not an independent reviewer test, online presence or a read receipt. [Evidence](https://github.com/Protocol-X-01/OmniGuard/blob/main/docs/acceptance-frontline-cs0lutions-dev-2026-11-14.md).
- **Shared review queue and explicit handoffs — forge development preview (2026-11-17).** Jira owners, separate reviewer/deputy roles, evidence age and accepted handoffs join existing code and team cases. Distinct synthetic browser participants completed review and changed-evidence invalidation; KAN-9 proved live role persistence and owner refresh. One real Jira actor tested. Independent two-user Jira acceptance and production promotion remain pending; reviews do not complete issues or certify safety. [Evidence](https://github.com/Protocol-X-01/OmniGuard/blob/main/docs/acceptance-review-queue-2026-11-17.md).
- **Encrypted conversation and file/folder handoff — local browser acceptance (2026-11-17).** Synthetic Alice/Bob verified exact devices, transferred a file and nested folder, then explicitly saved byte-identical copies. Names and paths travel inside the encrypted bundle. Loopback lab only: 100 files / 10 MiB. No production identity, hosting, recovery, retention or physical mobile acceptance. Integrity is not malware scanning. [Evidence](https://github.com/Protocol-X-01/OmniGuard/blob/main/docs/evidence/transfers-2026-11-17/transfer-browser-acceptance.json).
- **Combined defence regression lab — local fixture acceptance (2026-11-16).** One contract exercises 22 labelled properties: all 12 implemented detectors match in source/compiler modes; 24 paired behaviour/property tests passed. Ten demonstrated properties remain undetected. The strict all-case gate fails as expected. Authored fixtures do not measure general accuracy. [Evidence](https://github.com/Protocol-X-01/OmniGuard/blob/main/fixtures/combined-defence/README.md).

The public installer remains the production Solidity/Bitbucket-to-Jira workflow. Development owner contact and the local encrypted messenger are published as source and measured previews, not as a production chat service. The separate-site Jira test used the same administrator; an independent human reviewer test remains open.

## Challenges and lessons

The difficult part is preserving meaning across a handoff. A changed PR head must invalidate stale evidence, a profile change must not weaken an existing baseline, and uncertain writes must not create duplicate issues or mentions. A clean scan is not universal safety: the combined contract deliberately keeps ten undetected properties visible, and its strict all-case gate fails.

Encrypted handoffs have their own boundary. Device verification, provenance and exact recovered bytes matter as much as the encryption algorithm. The local lab uses synthetic identities and memory-only keys; real identity lifecycle, HTTPS hosting, recovery, retention and physical Android/iOS testing remain future work. Nothing here requires live-chain transactions.

## Try it and what comes next

The [project guide](https://omniguard-n5h9.onrender.com/) provides the Forge installer and three isolated fixture reports. The [source repository](https://github.com/Protocol-X-01/OmniGuard) includes tests, local setup instructions, the combined defence lab and explicit limitations. Watch the [captioned walkthrough](https://www.youtube.com/watch?v=eTlsw__RC_o).

The shared review queue is now implemented as a Forge development preview, with local synthetic multi-participant acceptance. Next are an independent real-user review pilot, an evidence-grounded Rovo teammate, a collaborative contract/bytecode workbench, deployment rehearsals with sign-off, and team outcome metrics. These next milestones remain planned. The [shared project status](https://github.com/Protocol-X-01/OmniGuard/blob/main/docs/project-status.md) keeps the repository, guide, demo notes and submission copy aligned; CI checks for drift. Future features must earn their acceptance evidence before they are presented as available.

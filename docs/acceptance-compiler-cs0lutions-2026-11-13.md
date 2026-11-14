# Compiler-assisted Jira acceptance — 13 November 2026

The real cs0lutions development workflow passed using OmniGuard **engine 0.1.2**, report schema **v3**, **12 rules** and native compiler **0.8.26+commit.8a97fa7a.Linux.g++**. This is isolated-fixture acceptance, separate from the historical 0.1.0 KAN-1 workflow and from production/judge installation acceptance.

After the 0.1.3 guard patch, the exact bundles named in this historical record reside in `reports/legacy/v0.1.2/`. Their normalized digests remain unchanged. Current files at the root of `reports/` use the newer engine and cannot verify a 0.1.2 baseline.

## Workflow observed

1. Imported `reports/semantic-vulnerable.omniguard.json` into the authenticated KAN project app. Forge checked all three source files and displayed three findings with complete input/rule coverage and the compiler profile.
2. Reviewed OG-SOL-002 at `Vault.sol:10:22`, the later storage write and the compiler-resolved inherited declaration at `Base.sol:3:70`. Each file's evidence had its own SHA-256.
3. Created real Task **[KAN-2](https://cs0lutions.atlassian.net/browse/KAN-2)** with source excerpts, related declaration, source/bundle digests, remediation guidance and engine/compiler identity.
4. Imported the same target's source-only fixed report, which had zero findings. The tracker kept KAN-2 To Do and disabled verification because analysis mode/compiler identity differed. [Observed rejection](evidence/forge-weaker-rescan-blocked.jpg).
5. Imported `reports/semantic-fixed.omniguard.json`. It had zero detections under the matching compiler profile, complete coverage and a changed primary-source digest. Verification became available.
6. Recorded the rescan verification comment in Jira, then explicitly moved KAN-2 to **Done**. The independently opened Jira task showed the original cross-file evidence, verification comment, previous/new source hashes and Done status.
7. Fully reloaded the Forge page. The fixed scan, one remediation, one current verification and KAN-2 Done status persisted. [Persisted result](evidence/forge-compiler-remediation-persisted.jpg).

The full flow above ran on development app **2.4.0**. Subsequent frontend review-link work does not change its backend validation or remediation model. No new scopes were introduced. The historical KAN-1 record remained compatible on the upgraded app before switching to this new target.

## Evidence identities

| Artifact | SHA-256 / identity |
| --- | --- |
| Vulnerable compiler bundle (normalized) | `5dfe95e02cae64a2bcfc4c0a9e16a7a722a598024bd8e0678641c76701a1f8de` |
| Fixed compiler bundle (normalized) | `41a7cd2645334eafa7dbd88d24613118fc389eb90073c124c06ab36f07a007c2` |
| Rejected source-only fixed bundle (normalized) | `b2735a9ec05710f9065257feaf611315da2772c337a79369b4e0533eccf86e69` |
| Vulnerable `Vault.sol` | `a9a1608bb9df8a77f25416f5933b02cb619e4dd9503e259502d90eb216ddb448` |
| Fixed `Vault.sol` | `0dddc5740a935e9aa9f18ab444cfed695dc9011a1906ce58abf277dfd1acc2fb` |
| Inherited `Base.sol` | `7056f61dcc7d6e1f189b5e7b04422b2a33a549689d68fde74cf2fb17ae407516` |
| Remediation reference label | `og-d3d194d443f06bc0f4f06a44` |
| Jira verification comment | [10001](https://cs0lutions.atlassian.net/browse/KAN-2?focusedCommentId=10001) |

The verification comment begins with the fixed normalized bundle hash shown above. Its body identifies OG-SOL-002, `Vault.sol`, the fixed revision, matching engine/compiler/rule coverage and both source digests.

On 14 November, development app 2.8.0 (current engine 0.1.3) retained this exact 0.1.2 scan, KAN-2 Done and its stored verification-comment link after a fresh page load. The separate [guard-patch record](guard-analysis.md) documents that compatibility check; it does not replace this historical full-flow acceptance.

## Reproduction and local checks

Follow the [compiler guide](compiler-analysis.md) to generate both reports and the [Forge workflow guide](forge-workflow.md) to import them. The browser's native file chooser was unavailable to automation; the labelled **Paste a report instead → Use pasted report → Import scan report** route performed the actual authenticated imports through the same server-side validator.

The local suite passed 19 default Rust tests plus five native-compiler tests, 20 Forge service/contract tests, release and dashboard builds, full manifest validation, authenticated Forge lint and strict Rust Clippy. Ten current bundles regenerate byte-identically. Eighteen current/historical bundles, five standalone reports and two SARIF outputs pass their schemas. The native compiler tests include the eight challenge cases and the previous 60-case corpus. These authored measurements do not establish general production accuracy.

The local dashboard/API also passed the compiler-assisted scan → local draft → fixed rescan flow; that draft did not create a Jira issue. [API evidence](../reports/benchmarks/compiler-facts/dashboard-smoke.json), [cross-file dashboard view](evidence/dashboard-compiler-storage.jpg), [fixed dashboard view](evidence/dashboard-compiler-rescan.jpg).

## Scope still open

No public sharing/production deployment, separate judge-site acceptance, public video, Devpost submission or live Bitbucket repository/PR scan occurred. No live-chain transaction, account key or RPC endpoint was used. Source integrity is checked; compiler/scanner execution is not cryptographically attested. Whole-program flow, complex role/lock semantics, dependency/remapping support and independent held-out accuracy remain open.

# Bitbucket PR → Jira acceptance — 14 November 2026

**Production remediation passed. Automatic Bitbucket pipeline execution remains pending.**

The public [isolated fixture PR #1](https://bitbucket.org/omniguard/omniguard-pr-fixtures/pull-requests/1) was imported into OmniGuard on cs0lutions. It created [KAN-7](https://cs0lutions.atlassian.net/browse/KAN-7), rejected stale and mismatched evidence, accepted the fixed compiler rescan, recorded verification comment **10006**, and explicitly moved KAN-7 to **Done**. The existing manual-fixture KAN-6 remained Done with its earlier update time.

![KAN-7 Done with rescan verification recorded](evidence/bitbucket-jira-done.png)

## Deployed boundary

| Component | Verified installation |
| --- | --- |
| Jira app | Production **3.0.0**, cs0lutions/KAN |
| Separate Bitbucket app | Production **2.0.0**, workspace **omniguard** |
| Integration packages | **0.1.5**; deployed code commit `2c2b73a0558f0c3c098076444813b3ca7e5ab1e6` |
| Rust engine | **0.1.4**, unchanged |
| Compiler | native solc **0.8.26+commit.8a97fa7a.Linux.g++** |

Both apps allow backend reads from `api.bitbucket.org`. The Bitbucket app has no repository write scopes, persistent storage, webhook or shared secret. Its temporary development installation was removed after the production panel passed, leaving one panel. Jira development remains separate. The temporary OGTEST site remains on Jira app 2.1.0 and was not used to claim acceptance of this extension.

## Evidence sequence

| Step | Observed result |
| --- | --- |
| Import vulnerable PR head | One OG-SOL-002 finding; exact source set and bytes validated in both apps |
| Create remediation | KAN-7, one issue bound to PR #1 and repository UUID |
| Commit only the source fix | Jira refresh reported “The pull request changed. Import its latest scan before continuing.” Verification was disabled |
| Import the stale report | Rejected with “PR source does not match report evidence: EffectVault.sol.” |
| Commit regenerated fixed report | Both production apps showed zero findings, the same full commit and evidence digest |
| Verify and complete | Comment 10006 recorded both heads, old/new source hashes and analysis profile; explicit Done transition succeeded |
| Check persisted outcome | Reload preserved the fixed scan and Done; Jira read-back returned one verification comment |

The source-only fix was deliberately committed separately to test rejection. Normal use commits source and regenerated report together. The fixture PR remains open as reproducible evidence; it was not merged or approved. No reviewers were assigned.

| Identity | Value |
| --- | --- |
| Repository UUID | `{39c1456b-b74e-4abd-88d2-5af180ff4ffe}` |
| Vulnerable source commit | `6a563ce962e57035d58ca1ab4e5d55e1d9732dcb` |
| Source-only fix commit | `01bbade7f8b23426a622997872ce9d4af184e68e` |
| Fixed report commit | `0bd63a6d188e65af008785fd3d9887051ad66948` |
| Destination commit | `7d12037d4d91fb7bde86849a124a6d445e8aa02a` |
| Vulnerable evidence digest | `144fc2c489d96c1da430e78c4b9a3dbfddc1c049f53afd055e740628abfae810` |
| Fixed evidence digest | `81639b6076cb558bbb5e7a0b26b92e89ccc91ee06fab91a32e85adc444168bcd` |

![Production Bitbucket panel showing the fixed PR report](evidence/bitbucket-fixed-panel.png)

## Build and test evidence

**41 Jira/shared tests and 3 Bitbucket panel tests passed.** They cover URL and repository identity, source completeness/tampering, bounded reads, invalid UTF-8, opaque pagination, stale heads, cross-PR/manual substitutions, and the remediation flow. Both frontends and manifests passed. [GitHub CI run 43595542629](https://github.com/Protocol-X-01/OmniGuard/actions/runs/43595542629) passed Rust/compiler checks plus Forge, Bitbucket, dashboard and release integrity at the deployed code commit.

The local runtime dependency audit for the new Bitbucket package reported zero vulnerabilities. The complete development-tool tree reported 32 advisories (3 low, 19 moderate, 10 high), largely in Forge CLI transitive tooling; no forced major downgrade was applied. This is not a claim that all dependencies are vulnerability-free.

## Remaining pipeline gate

The committed [pipeline configuration](../integrations/atlassian-bitbucket/example/bitbucket-pipelines.yml) rebuilds the pinned engine, verifies the compiler checksum, generates JSON/SARIF and compares fresh JSON with the committed bundle. Bitbucket displayed **“Two-step verification is required to enable Pipelines.”** The account owner must finish that authentication setup, then Pipelines can be enabled and the PR run verified. **No Bitbucket build success, automatic PR execution or merge requirement is claimed.** GitHub CI success is separate evidence.

Imports and Jira transitions remain deliberate reviewer actions. Public isolated fixtures only; private repositories, fork PRs, automatic issue closure and scanner execution attestation are outside this version. Current-head checks are time-of-check checks, not an atomic lock across products. The privacy notice was updated to version 3 for the public source reads and stored PR provenance. The original submission, video and v0.1.4 release assets remain unchanged.

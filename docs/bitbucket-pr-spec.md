# Bitbucket pull-request remediation — implementation specification

Status: implemented, tested and deployed, 14 November 2026. The [production remediation acceptance](acceptance-bitbucket-2026-11-14.md) passed as KAN-7. Bitbucket pipeline execution is pending account two-step verification; committed configuration is not execution evidence.

## First working scope

Use a public Bitbucket repository containing authorized, isolated Solidity fixtures. Keep the Rust scanner independent of the two Forge apps. A PR carries `contracts/**/*.sol` and a generated `omniguard.scan.json` bundle. A pipeline regenerates the bundle using pinned OmniGuard/compiler versions and checks the committed report. The report is versioned alongside its source, so Jira can retrieve it without a webhook, shared secret, or privileged repository token.

The separate Bitbucket Forge panel reads the PR context and shows the source-validated report. Jira accepts the PR URL, independently retrieves the same current commit, and runs the existing evidence checks. Creating, verifying and completing a Jira remediation remain explicit actions under the current Jira user's permissions.

## Evidence and identity

- Only canonical `https://bitbucket.org/<workspace>/<repository>/pull-requests/<positive-id>` URLs are accepted. Network access is limited to `api.bitbucket.org`, with redirects disabled.
- Resolve repository and workspace UUIDs server-side. Reject private repositories, forks and non-open PRs for this first version. Do not claim private-repository support.
- Fetch the report and all Solidity files under `contracts/` at the full immutable PR source commit. Require exact source-set, byte/hash and report-coverage matches; reject symlinks, excessive traversal, oversized files and incomplete reports.
- Re-read the PR after source validation. Abort if either head changes. Store server-derived source/destination commit IDs, repository UUID, PR ID and canonical URL separately from the scanner bundle.
- Derive the remediation target from repository UUID and PR ID, not the supplied bundle's target name. Bind the stored scan digest to both normalized evidence and provenance. Manual bundles cannot verify a PR baseline.
- Check current source and destination heads again before Jira creation, verification and transition. A stale/unavailable/closed PR disables those actions. These are time-of-check guarantees; Bitbucket and Jira do not provide an atomic cross-product lock, and a PR can change after the check. A fixed rescan must belong to the same repository and PR and pass all existing engine, compiler, coverage and changed-source checks.
- Integrity and provenance checks do not attest scanner execution or prove absence of all vulnerabilities. Pipeline results and source review remain visible, distinct evidence.

## Acceptance

Create a fixture PR; import its vulnerable commit into Jira; create one remediation; reject a mismatched report and a stale PR scan; commit the fixture fix and regenerated report; import the new PR head; record verification and explicitly transition the new Jira issue. Verify duplicate action protection and preservation of existing manual fixture records.

Tests cover malformed URLs, redirects, foreign repository/fork identity, private repositories, source tampering/omission, symlinks/limits, head movement during import, stale creation/verification/completion, manual-origin bypass, cross-PR rescans and the complete vulnerable-to-fixed flow. Build both Forge frontends and validate both manifests. Record deployment versions and live proof before describing the integration as deployed.

## Boundaries and follow-up

This version pulls the latest versioned report when a reviewer selects Import PR scan; it does not push scans into Jira or automatically close issues. Pipeline execution on every PR update is separate from that deliberate Jira import. No live-chain transactions, external repository credentials, source upload to Render, automatic merge, custom Rovo agent or blanket security guarantee. Private repositories and authenticated push ingestion need a later design and acceptance pass.

References: [Bitbucket source API](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-source/), [PR overview panel](https://developer.atlassian.com/platform/forge/manifest-reference/modules/bitbucket-repository-pull-request-overview-panel/), [Forge requestBitbucket](https://developer.atlassian.com/platform/forge/apis-reference/fetch-api-product.requestbitbucket/).

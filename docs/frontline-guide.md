# Team defence: development workflow

The first front-line milestone makes requests, sharing and team handoffs reviewable. Every declared entry point displays its owner, check, evidence and coverage. Identity and endpoint observations support that workflow. This candidate uses synthetic fixtures only; it does not monitor messages, devices or accounts, classify phishing, or attest the truth of observations.

Native engine: `frontline-0.1.0`. Jira integration candidate: `0.1.6`. The separate Solidity engine remains `0.1.4`. Deployed and accepted in cs0lutions development 3.6.0; the existing production installation and Codegeist submission do not contain it. See the [live development acceptance](acceptance-frontline-cs0lutions-dev-2026-11-14.md). See the [technical specification](frontline-spec.md), [acceptance record](acceptance-frontline-2026-11-14.md) and broader [entry-point roadmap](team-entry-points.md).

## Coverage ledger

| Entry point | Accountable role | Defined check | Risk fixture | Retest fixture |
| --- | --- | --- | --- | --- |
| Urgent access request | Service desk | OG-TEAM-001: requester, independent channel, approved request | Assessed / fail | Assessed / pass |
| External evidence handoff | Case owner | OG-TEAM-002: recipient, approved channel, scoped access | Assessed / fail | Assessed / pass |
| Response team handover | Response lead | OG-TEAM-003: receiving owner acknowledgement, complete context | Assessed / fail | Assessed / pass |
| Responder account | Identity team | OG-FL-001: MFA and privilege review | Assessed / fail | Assessed / pass |
| Responder workstation | Device team | OG-FL-002: managed, protection active, updates current | Assessed / fail | Assessed / pass |
| New external collaboration tool | Platform team | OG-FUTURE-001: not implemented | Unsupported | Unsupported |
| New service-desk report | Service desk | OG-TEAM-001; no observation yet | Unassessed | Unassessed |

Each of the five supported rows has a unique synthetic observation ID, capture/expiry times and named boolean facts. The final two rows deliberately lack evidence. Five passing checks are not seven covered entry points. Expired evidence becomes **stale**; missing ownership, check or observations becomes **incomplete**. Risk acceptance and false-positive decisions remain separate from verified fixes.

## Build and reproduce

Use the pinned Rust toolchain and Node 24. Commands below start at the repository root. Dependencies must be available for an offline build; omit `--offline` during initial setup if the locked packages need downloading.

```sh
cargo build --locked --offline -p omniguard-frontline
cargo test --locked --offline -p omniguard-frontline
node scripts/generate-frontline-fixtures.mjs --at 1794673200
./target/debug/omniguard-frontline fixtures/frontline/team-risk.intake.json \
  --at 1794673200 --output /tmp/omniguard-risk.bundle.json
```

The last command exits **2**, intentionally: two entries have coverage gaps. Exit **0** means all entries are assessed and pass; **1** means assessed failures without gaps; **2** means gaps or an error (read stderr to distinguish malformed input). Both committed bundles contain gaps, including the retest. The frozen timestamps are for deterministic reproduction, not present-day operational evidence.

Install and build the existing Forge UI, then start the loopback preview:

```sh
cd integrations/atlassian-forge
npm ci --ignore-scripts
npm test
npm run build
npm run validate:manifest
cd ../..
OMNIGUARD_FRONTLINE_CLOCK=1794673260 node dashboard/frontline-server.mjs
```

Open [the local preview](http://127.0.0.1:4180/frontline.html). It is labelled **synthetic fixtures / simulated Jira** and discloses the frozen clock. It uses in-memory data; restarting resets the exercise. The process binds only to `127.0.0.1`. Host/origin and request-header checks protect this local surface; the header is not user authentication. Do not expose it as a hosted API.

For either local or Forge intake, choose a `.bundle.json` file, or expand **Paste a report instead**, paste the complete bundle into **Evidence JSON**, and choose **Use pasted report**. Both paths prepare a candidate; **Validate and import** sends it through the same server-side checks. Editing pasted text clears the prepared candidate, and both paths enforce the 64 KiB limit.

1. Load the risk fixture. Confirm seven entries, five failed checks and two gaps.
2. Assign the urgent-request remediation. The simulated Jira task is assigned to the acting fixture responder.
3. Record a **confirmed** decision with **verified context**. The decision has its own Jira comment receipt and evidence digest.
4. Load the retest. Five checks pass, while both gaps remain visible.
5. Record the verified retest. The Jira task is still To do until explicitly completed.
6. Complete using the displayed Done transition. Jira status and retest freshness remain separate labels.

For a wall-clock exercise, generate fresh files outside the committed corpus and start a new preview process without the frozen-clock setting:

```sh
node scripts/generate-frontline-fixtures.mjs --out /tmp/omniguard-frontline-fresh
OMNIGUARD_FRONTLINE_FIXTURES=/tmp/omniguard-frontline-fresh \
  node dashboard/frontline-server.mjs
```

The risk capture is one minute before generation; the retest is 30 seconds newer. These remain invented observations and expire within 24 hours.

## HTTP contract check

The [OpenAPI description](../postman/specs/frontline-local.openapi.json) covers only the local preview. The [Postman collection](../postman/collections/omniguard-frontline-local/) has 13 ordered requests and 23 assertions. Start a **fresh** preview process with `OMNIGUARD_FRONTLINE_CLOCK=1794673260`, then run:

```sh
postman collection lint postman/collections/omniguard-frontline-local
postman collection run postman/collections/omniguard-frontline-local
postman status
```

The collection creates and completes synthetic `LOCAL-1`, rejects premature verification and rejects an unexpected message field. Running it against an already advanced engagement correctly rejects its older baseline. Restart the preview first. No Postman cloud workspace or account is needed for this local check; no Jira HTTP provider simulation or live Jira acceptance is implied.

## Development deployment

The [development acceptance record](acceptance-frontline-cs0lutions-dev-2026-11-14.md) documents the measured deployment. The commands below reproduce the deployment process. An existing authorized OmniGuard contributor keeps the app ID. An independent developer registers their own app, as described in the [Forge workflow guide](forge-workflow.md). Sign in through Forge's terminal prompt; never put tokens in source or reports.

From `integrations/atlassian-forge`, after the build and tests above:

```sh
npm run lint
npm run deploy -- --environment development
npm run install-app -- --upgrade --environment development
```

Select the intended Jira development site when prompted. For a first installation, omit `--upgrade`. No new scopes or backend destinations were added by this milestone. The runtime uses the existing Forge bridge and `asUser()` Jira adapter; the loopback server and frozen preview clock are not deployed.

The two workflow screens share the same authenticated Custom UI document. Navigation uses Forge's [`view.createHistory()`](https://developer.atlassian.com/platform/forge/apis-reference/ui-api-bridge/view/#createhistory), including the `/team-defence` route. Navigating the iframe to a separate HTML document loses the injected bridge; the standalone `frontline.html` remains the loopback preview entry, not the Forge navigation target.

Test the **Team defence** navigation inside the installed Jira project page. Generate fresh fixture bundles and import them manually. A real Jira check must verify project isolation, assignment eligibility, persistence after reload, comment authorship from a second authorized identity, denied-user behavior and the exact completion transition. The local independent-actor harness does not substitute for this real account test.

Permission requirements are enforced by the service: browse the project; create and assign issues for intake; edit issues and add comments for triage/verification; edit issues and transition issues for completion. The actor must be assignable. The adapter selects a Task type and rejects additional required fields without defaults that it cannot supply. Jira remains authoritative for permissions and workflow validation. See Atlassian's [issue API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/) and [comment API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comments/).

## Storage, recovery and limits

Only one engagement is supported per Jira project in this candidate. Intake is bounded to 64 KiB, 20 entry points and 12 boolean facts per observation; there are at most 20 remediation cases and 30 decision events per case. Active state is capped at 200 KB. Labels are bounded team/role aliases. Raw messages, URLs, attachments, account IDs and arbitrary fields are rejected by the intake contract. Jira stores assignee and comment authorship; the application does not duplicate importer account IDs in scan records.

Project-scoped storage under `og:p:<projectId>:fl:` holds immutable imported bundles, the active inventory/cases, mutation locks and write claims. The baseline is retained when a newer bundle arrives. There is no automatic archival retention/deletion policy in this milestone. A later operational rollout needs an agreed retention policy and a privacy notice describing its actual data use.

If Jira accepts a write but its response is lost, a retry checks the original issue property/label or comment marker before sending again. A pending triage decision blocks different decisions, verification and completion until recovered. A definite rejection releases the claim; an uncertain outcome stays blocked rather than guessing. A process crash may leave a mutation lock: an operator must inspect the original Jira outcome and stored evidence before recovering it. Automatic lock expiration or blind claim deletion is not implemented.

Native and Forge validators check shape, bounds, canonical hashes, sequence and observation freshness. A SHA-256 match proves consistency of supplied bytes, not the authenticity of a report. Future live intake requires authenticated sources, a threat model, retention rules and separate acceptance evidence. This milestone performs no endpoint isolation, identity changes, live probing or employee scoring.

## Contact an owner

Open **Contact owner**, choose a purpose, and **Preview mention**. Review the current Jira assignee and message, then **Send Jira mention**. A changed recipient, evidence or expired five-minute review requires a new preview. The same case/evidence/purpose posts once. This records a Jira comment; it does not prove delivery, reading or online presence, and it does not change completion.

Teammates can respond on the issue in Jira for Android/iOS, subject to access and notification settings. Confidential messaging belongs in the separate [local encrypted communications lab](../secure-comms/README.md), whose deployment and mobile limits are explicit.

For repeated live exercises, preserve the engagement ID and advance the sequence beyond the active one, with new observation IDs and strictly newer capture times. The generator defaults to 1/2; it does not reset an existing Jira engagement.

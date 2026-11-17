# Front-line team defence — first milestone

Status: implemented and validated locally, then accepted on cs0lutions Forge development 3.6.0, 14 November 2026. See [live acceptance](acceptance-frontline-cs0lutions-dev-2026-11-14.md). The owner clarified that the priority is front-line defence and incident intake, including how teammates interact. This supersedes the earlier proposal to begin with editor and staged-code checks. See the [reproduction and deployment guide](frontline-guide.md) and [acceptance record](acceptance-frontline-2026-11-14.md).

## Acceptance objective

Every known entry point has an owner, a defined check, evidence and visible coverage. A missing value remains a visible gap. The first release demonstrates request verification, scoped sharing, acknowledged handoffs, identity posture and endpoint posture using isolated synthetic evidence.

## Contracts and trust

The independent `omniguard-frontline` Rust binary accepts the strict [intake contract](../contracts/frontline-intake-v1.schema.json) and emits a [bundle](../contracts/frontline-bundle-v1.schema.json). The five [check definitions](../contracts/frontline-checks-v1.json) are shared with the Forge evidence validator. Every fact is a boolean observation from a named synthetic fixture; message bodies, URLs, attachments, account IDs, credentials and arbitrary extra fields are rejected. Ownership uses a team/role alias. This does not monitor employees or authenticate the truth of a submitted observation.

Limit intake to 64 KiB, 20 unique entry points and 12 boolean facts per item. Evidence has a unique ID, capture/expiry times and at most 24-hour validity. Record SHA-256 over recursively key-sorted compact JSON. Forge revalidates the contract, digest and the declared assessment, then recalculates current freshness using its own clock. Integrity and consistency are separate from authenticity. Unsupported checks, missing fields and expired observations cannot produce a pass.

The JSON schemas describe structure and primitive bounds. The engines additionally enforce uniqueness of entry/evidence IDs, the timestamp relationship, check-specific allowed fact names, digest equality and assessment consistency. Schema validation alone does not establish acceptance.

An engagement has a stable ID and a strictly increasing sequence. Import is idempotent for identical evidence; changed content with the same or older sequence is rejected. Retest must preserve entry-point identity and the check, introduce newer evidence, and currently pass. Removing an entry cannot verify it. Risk acceptance and false-positive decisions never qualify as verified fixes.

## Workflow

Inventory → validate intake → identify gaps/failed controls → create assigned Jira remediation → record a triage decision → import fresh evidence → verify → explicitly complete.

The existing Solidity workflow remains separate. New Forge resolvers use the current user's project context and Jira permissions. Jira holds assignee and comment authorship; scan records do not duplicate importer IDs. Creating a task assigns it to the acting user, subject to Jira assignment permissions. Immutable baselines preserve the original evidence. An engagement mutation lock prevents concurrent lost updates; uncertain Jira writes are recovered through the issue property/label or verification marker before retrying. A crash that leaves a lock requires operator recovery after checking the external outcome, never blind expiration/retry.

The [local HTTP contract](../postman/specs/frontline-local.openapi.json) is only a loopback preview transport for these resolvers. It uses in-memory storage and simulated Jira, clearly labelled in the UI. Production uses Forge authentication; the local header is an origin guard, not account authentication. No production REST endpoint or webhook is introduced.

## Validation gates

- Positive, negative, missing, unsupported, stale, future-dated and tampered evidence; canonical JSON parity between Rust and JavaScript.
- Duplicate/replayed sequence, changed/dropped check, cross-project and stale-digest actions, concurrent changes and uncertain Jira outcomes.
- Permission denial, independent actor contexts, explicit risk/false-positive decisions, retest and completion separation.
- Keyboard interaction, visible focus, text coverage labels, responsive layout and no unsafe rendering of supplied text.
- Existing Rust and both Forge suites, both frontends/manifests and the loopback Postman collection.

Local simulation is not live Jira acceptance or independent human-reviewer acceptance. Deployment guidance must name these outstanding checks. Development acceptance uses one acting identity. Production is unchanged; this release does not claim live monitoring, incident containment, phishing classification or complete coverage of all team interactions.

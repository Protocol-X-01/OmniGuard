# Shared review queue — first delivery

One project page brings existing code remediations and team-defence cases into a shared review queue. A person can see the current Jira owner, take independent review or deputy responsibility, request a specific handoff, accept it, and record a review of the exact evidence. A solo developer can prepare work with AI; review independence is a distinct, visible requirement.

## Contract and identity

Forge resolvers `getReviewQueue` and `actReviewQueue` use the authenticated resolver account and Jira project context. No client-supplied project or actor selects authority. Reads require Browse Projects and an individual current-user Jira issue read before disclosing a row. Writes additionally require Edit Issues and the actor's role. Current owner is the active Jira assignee; change ownership in Jira. Reviewers and deputies claim their own roles with a short, explicitly self-chosen display label. Their real authenticated account reference, not the label, enforces independence. No user directory scope, free-form messaging, email, or notification dispatch is added.

`actReviewQueue` requires the row ID (`code:<24hex>` or `team:<24hex>`), revision and evidence token returned by the latest read. Operations are `take_reviewer`, `take_deputy`, `release_reviewer`, `release_deputy`, `handoff`, `accept`, and `decide`. Claim actions also require `label` (1–60 characters); handoff requires `toRole` (owner/reviewer/deputy) and `purpose` (review_evidence/add_context/address_changes); decision requires `decision` (reviewed/needs_changes) and a structured `reason`. Unknown fields are rejected. Errors have a message and HTTP status in the loopback acceptance adapter (Forge bridge reports resolver errors). Conflict is 409, forbidden 403, malformed 400, missing or unreadable row 404.

## Evidence and state

Rows derive from the existing project-scoped stored remediations; no arbitrary issue can be enrolled by the client. A stable evidence token hashes the row, original baseline, active bundle digest, evidence times and current Jira owner. Bitbucket records recheck immutable source/destination heads. Team entries use capture/expiry from validated intake. Code evidence shows **age since import**, a distinct 24-hour queue review window, and an explicit unknown scan capture time; reimporting the same digest does not reset that window. Missing, future, expired, incomplete, mismatched or unavailable evidence blocks new handoffs and decisions.

Review state stores role account references and self-chosen labels, a monotonic revision, the active handoff, decision and bounded append-only history. A per-project fail-if-exists KVS claim serializes queue writes; a crashed invocation leaves a visible conflict requiring operator recovery, with no time-based lock stealing. Each write rereads the evidence/owner before saving. External imports and Jira assignment cannot be made atomic with KVS: a read always recalculates validity, so an evidence, owner, reviewer or deputy change invalidates prior acceptance/decision without erasing its history. This is coordination, not a release authorization or a second path to completing Jira issues.

Only an active independent reviewer who accepted the current review handoff can record `reviewed` or `needs_changes`. Deputies can accept context handoffs and return work; they do not count as an independent review. A changed or expired basis shows `Review required` and blocks using an old approval. Completion still uses the existing evidence→matching rescan→explicit Jira completion workflow.

## User experience

Retain OmniGuard's muted green/blue identity. Use an evidence ledger with a persistent next-handoff strip: owner → current recipient → explicit receipt. Columns become labelled stacked fields on narrow screens. Provide filters for mine, awaiting acceptance, review required and stale/blocked; text statuses accompany color. Use native controls, visible focus, live status, 44px action targets, no automatic sends or polling. Refresh before acting. The details panel shows the complete digest, freshness basis, gaps and chronological receipts.

## Acceptance and publication

Prove the same service with distinct synthetic owner, reviewer, deputy and outsider principals; self-review denial, project/issue permission denial, role changes, wrong recipient, stale revisions, expired/future evidence, tampered payloads, simultaneous writes and changed evidence must fail closed. Exercise the browser workflow with two independent synthetic actors against the local adapter, including reload persistence and a changed-evidence invalidation. Run Forge tests/build/manifest checks and relevant existing CI. Validate actual Forge development with the available signed-in actor; two real independent Atlassian users remain a separately labelled live acceptance gate if unavailable.

Update the shared project status, README/guide, new demo segment and saved Devpost story together. Date source, local acceptance and Forge development observations separately. Publish only reviewed synthetic captures. Keep production Forge promotion separate from this development delivery.

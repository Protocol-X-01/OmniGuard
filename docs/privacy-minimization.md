# Importer-data minimization

This change stops saving the authenticated importer's Atlassian account ID in new scan records. The workflow does not use this field: it is absent from the public scan model, source-evidence validation and remediation comparison. Jira retains the authorship of actions performed through its own current-user API.

The code is a review candidate, deployed to development as 2.10.0. Production remains 2.0.0. No historical attribution is removed just by opening the dashboard or deploying this change.

## Administrator workflow

1. Open OmniGuard in the relevant Jira project and expand **Data management · project administrators**.
2. Select **Review stored importer IDs**. The server verifies `ADMINISTER_PROJECTS` against the authenticated project, then returns counts without account IDs or source text.
3. Review the counts and permanent-removal notice. Type the exact project key to enable **Remove stored importer IDs**.
4. The server rechecks both project-admin permission and the confirmation on every page. It removes only the legacy `importedBy` property from scan snapshots in that project and installation.
5. Run the review again to check the current result. A completed pass reports counts; an interrupted pass reports incomplete progress and can be safely repeated.

The operation preserves source bundles, import times, findings, digests, remediation baselines, Jira issue links, verification references and native Jira authorship. It does not remove personal information included by an uploader inside a source bundle or copies in Jira. Those requests require a separate, scoped review; the existing support contact and personal-data declaration remain appropriate.

## Storage and failure behavior

Each backend request handles at most 20 records. The UI follows up to 100 pages and explicitly stops with an incomplete result if that limit or an error is reached. This is an early-access fixture app; larger inventories need a support-led cleanup, not an unverified clean claim.

Pagination cursors are held only during the current interaction. They are not stored as durable checkpoints. Every returned key must match the server-derived project prefix and a scan digest before any record on that page is changed. A strongly consistent `get` rereads each record before the update, because KVS queries are eventually consistent.

Scan snapshots are otherwise immutable. Re-importing an existing digest now changes only the active pointer, preventing a stale import from restoring attribution removed concurrently. Interrupted removals are idempotent. A failure can occur after some records on a page were changed, so the UI does not report an all-or-nothing result.

No new Forge scopes, scheduled job, external destination, reporting service or credential is introduced. Existing legacy IDs persist until an administrator explicitly removes them. Removing this one field is not a general certification of privacy compliance; user-supplied source and Jira copies remain in scope for privacy requests.

## Validation and references

The Forge suite contains 31 tests, including new cases for read-only pagination, permission and confirmation denial, project separation, stale reads, concurrent re-import and recovery after a storage failure. The existing scan-to-Jira tests remain part of that suite. Build, manifest validation and authenticated Forge lint passed.

Development 2.10.0 was deployed on 14 November 2026. Its actual KAN inventory initially showed 10 scans with legacy attribution. A new isolated fixed-vault import increased the inventory to 11 scans while the legacy count stayed at 10, demonstrating that this import did not save an account ID. The original fixed scan was restored; KAN-4 remained Done with verification comment 10003. An incorrect confirmation key kept removal disabled; the exact key enabled it. No live stored attribution has been removed. Production rollout and removal acceptance remain pending.

Atlassian recommends avoiding unnecessary cached personal data and provides reporting/erasure requirements for apps that retain it. This update minimizes a field that had no workflow consumer; it does not claim that retained legacy data has already been erased. [Forge user privacy guidance](https://developer.atlassian.com/platform/forge/user-privacy-guidelines/).

The storage design follows the documented query consistency and cursor limits. [Forge KVS consistency and cursors](https://developer.atlassian.com/platform/forge/storage-reference/kvs/) and [KVS queries](https://developer.atlassian.com/platform/forge/storage-reference/kvs-api-query/). Sources checked 14 November 2026.

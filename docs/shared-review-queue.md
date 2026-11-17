# Shared review queue

The Shared review workflow joins existing source remediations and team-defence cases in the current Jira project. The owner comes from the live Jira assignee. Separate authenticated participants can take reviewer or deputy responsibility, request a handoff, accept it, and record a review against the exact evidence.

## Use it with your team

1. Open **OmniGuard Dev → Shared review** in the Jira project. Create a remediation through Code evidence or Team defence if the queue is empty. Assign an active owner in Jira.
2. A separate participant chooses **Take review** and enters a recognizable display label. A third participant can choose **Be deputy**. These labels are self-chosen; authenticated accounts enforce the roles.
3. The owner chooses the recipient and purpose, then **Request handoff**. The recipient refreshes and selects **Accept handoff**. A pending handoff cannot be replaced; the accepted recipient controls the next handoff.
4. The independent reviewer checks the source digest, coverage, age basis and history, then records **Evidence reviewed** or **Needs changes**. A context request can go through the deputy and return to the reviewer.
5. Changed evidence, ownership, reviewer/deputy or expiry makes the prior acceptance/review non-current. Refresh and hand over the current evidence again. History is preserved. A review receipt never closes a Jira issue; continue through the original matching-rescan and explicit completion workflow.

Use the Mine, Awaiting acceptance, Review required and Stale or blocked filters to find the next action. Source rows show age since the original import, not a claimed scan execution time; their review window is 24 hours. Team rows use their validated capture and expiry. Reimporting the same source digest preserves its original age.

## Reproduce the local exercise

Use the Node version required by the installed Forge CLI (the accepted environment uses Node24.22.3):

```sh
npm ci --prefix integrations/atlassian-forge
npm run build --prefix integrations/atlassian-forge
npm test --prefix integrations/atlassian-forge
node dashboard/review-server.mjs
```

Open http://127.0.0.1:4186/?actor=owner and http://127.0.0.1:4186/?actor=reviewer in separate tabs. The local adapter runs the actual review service with distinct synthetic principals, in-memory storage and simulated Jira; it is a development exercise, not production authentication. Casey is available as a deputy. Only loopback is bound. Restarting the server resets this synthetic state; reloading a tab does not. The Import changed evidence and Advance beyond expiry controls demonstrate invalidation.

Run the saved API exercise against a fresh local server:

```sh
postman collection lint postman/collections/omniguard-shared-review-local
postman spec lint postman/specs/review-queue-local.openapi.json --no-report-events
postman collection run postman/collections/omniguard-shared-review-local --no-report-events
```

The 11-request exercise mutates only the local synthetic state. It includes owner self-review denial, wrong-recipient denial, explicit acceptance, a current review, changed-evidence invalidation and expiry. It does not attest Jira service behavior. No Postman workspace publication is required.

## Forge development deployment

From `integrations/atlassian-forge`, sign in using your own Forge account and run:

```sh
npm run build
npm run validate:manifest
./node_modules/.bin/forge lint
./node_modules/.bin/forge deploy --environment development --non-interactive
```

Use the existing cs0lutions development installation. No new scopes or egress hosts are needed. The accepted development deployment is recorded separately from source publication; production promotion and two independent real Jira accounts require their own acceptance. Production retains its existing workflow.

## Storage and operator recovery

Review history stores purposeful account attribution and display labels, bounded to 80 events per item and 100 tracked items per project. Source/issue permission checks happen on each read and mutation. Unknown or unreadable issues are omitted. Releasing a role preserves historical attribution. See the privacy notice for retention and requests.

A per-project fail-if-exists KVS claim serializes queue writes. If an invocation terminates before releasing `og:p:<projectId>:rq:lock`, later writes fail with an operator-recovery message. An app operator must first establish that the original invocation has ended, inspect the project record and receipt history, then recover the abandoned claim through approved storage tooling. No automatic lock timeout or client unlock endpoint can create a second writer. External Jira assignment and imports cannot be made atomic with KVS; queue reads always recalculate whether an earlier receipt still matches.

See [the technical spec](shared-review-queue-spec.md) and the dated acceptance record for the tested boundaries.

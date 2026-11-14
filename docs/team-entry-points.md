# Team engagement and entry-point coverage

Status: expansion roadmap, 14 November 2026. The [front-line team-defence milestone](frontline-spec.md) is implemented for local fixture validation; it is not deployed. Baseline inspected: engine 0.1.4, Jira integration 0.1.5 and the accepted public-fixture Bitbucket workflow. See the [current architecture](architecture.md) and [production acceptance](acceptance-bitbucket-2026-11-14.md).

## Outcome

Help a team identify where untrusted input, code, identities or changes enter its systems, assign responsibility, test the relevant controls and retain evidence through remediation. Start before the first commit and keep the same record useful during development, review and incident response.

The owner clarified that “first line” means front-line defence and incident intake, with particular attention to how people interact. Local editor and staged-code checks are later scope. The scope is a map of known entry points that grows with the system. A declared inventory cannot establish that every entry point has been discovered.

## Coverage map

All additions below are proposals. Current Solidity scan completeness describes only its selected sources, rules and analysis profile.

| Entry point | Proposed checks and evidence | Team handoff | Current coverage |
| --- | --- | --- | --- |
| Requirements, tickets and design changes | Record assets, data sensitivity, exposed interfaces, trust boundaries and security acceptance criteria | Requester → service owner → reviewer | No structured engagement intake |
| Developer workspace and first commit | Local syntax-aware checks; staged-source snapshots; secret redaction; dependency and configuration inventory | Developer → code reviewer | Local Solidity CLI; no editor or staged-file integration |
| PRs, builds and dependencies | Changes, source/report integrity, dependency provenance, CI permissions and artifact identity | Reviewer → build owner → Jira remediation | Accepted public Solidity fixture PR and reproducible pipeline; broader supply-chain analysis absent |
| Web, API and message inputs | Authentication/authorization boundaries, uploads, parsers, webhooks and queues; source/configuration review plus local request fixtures | Application owner → security reviewer | No detection pack |
| Identity and people | Access changes, service-account privileges, suspicious-message reports and session controls; use redacted configuration or event evidence | Service desk → identity owner → responder | No identity or message monitoring |
| Devices, network, cloud and data | Endpoint posture, ingress/egress rules, storage exposure, deployment configuration and restore evidence | Operations → platform/data owner | No endpoint agent, network scanner or cloud audit pack |
| AI agents, Rovo and MCP tools | Boundaries between external content and instructions, tool authorization, retrieval isolation and output destinations; adversarial local fixtures | AI owner → application/security reviewer | No AI-specific detection pack or custom Rovo agent |
| Alerts, disclosures and incidents | Preserve origin, deduplicate, capture affected assets, route ownership, verify fixes and retain recurrence tests | First-line responder → specialist → service owner | Jira remediation for validated scanner findings; no general alert intake |

This lifecycle approach is consistent with NIST's DevSecOps model, which begins with organizational preparation and continues through development and operations. The map above is our proposed product design, not a NIST certification or a claim of framework completeness. [NIST reference model](https://pages.nist.gov/nccoe-devsecops/notational-reference-model.html).

## Shared engagement record

Each engagement needs a scope, asset/environment, known entry points, owner and reviewer, relevant control/rule, evidence origin, analysis version, decision history and retest requirement. Intake records must remain distinguishable from validated findings.

Keep these dimensions separate:

- **Coverage:** not assessed, assessed for a named profile, incomplete, unsupported or excluded with a recorded reason. Show inventory gaps and stale evidence explicitly.
- **Finding result:** detected, not detected within the tested scope, or inconclusive. “No finding” is not a claim that the asset is secure.
- **Team decision:** needs context, confirmed, fixing, ready for retest, verified fixed, accepted risk or false positive. Accepted risk and false positive require a reason and reviewer; neither counts as a verified fix.

Jira remains the authority for assignment and workflow status. Link existing Jira identities and permissions rather than duplicating importer identities in scan records. Any new attribution storage must have a defined purpose and retention policy. Preserve original evidence when a decision changes. Recheck permissions and evidence at each write, and show conflicting edits instead of silently replacing another person's decision.

The first-line view should answer: what arrived, what is affected, what evidence exists, who owns the next step, and what will establish completion. Specialist detail remains available without requiring every team member to interpret a full scanner report. Use text labels as well as colour, keyboard-accessible actions, and concise explanations for incomplete evidence.

## First implementation milestone

The [front-line specification](frontline-spec.md) and [run/deployment guide](frontline-guide.md) now define the selected implementation: **interaction inventory → validated observations → assigned Jira remediation → attributed decision → retest**.

The native fixture evaluator has five checks: sensitive request verification, scoped sharing, acknowledged handoffs, identity posture and endpoint posture. The first three directly address team interactions. These are deterministic control checks against supplied synthetic observations, not live collection or phishing classification. The seven-entry fixture deliberately retains an unsupported collaboration tool and an unassessed service-desk report even after its five known checks pass.

Follow-up work should prioritize authenticated operational evidence intake, triage permissions tested by independent users, and explicit coverage of the team's actual collaboration channels. Language expansion and developer integrations remain later options rather than the first-line priority. The broader coverage map is a roadmap, not a deployed feature list.

## Atlassian surfaces and separation

Keep analysis in the independent Rust core and local/CI processes; keep product permissions, team decisions and Jira transitions in Forge. New evidence types need explicit versioned validation before Forge accepts them. Do not make an external alert appear scanner-validated merely because it entered the same queue.

A Jira issue panel is a candidate place for the engagement record, but Atlassian currently limits its button to users who can edit that issue. Plan and test a suitable read-only route for other team members. [Forge issue-panel reference](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-issue-panel/).

Bitbucket Code Insights supports reports and annotations within code review. It could later expose findings beside relevant source lines; the current OmniGuard overview panel does not publish these annotations. A separate permissions and acceptance pass is needed for publishing them. [Bitbucket Cloud reports reference](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-reports/).

A language model may explain evidence and suggest ownership. Deterministic checks and the authorized review workflow retain responsibility for verification and state changes. Ticket text, repository files and retrieved documents remain untrusted data.

Track team outcomes through time to ownership, waiting time at handoffs, time to verified fix, reopened findings and unsupported-entry-point counts. Establish a baseline before claiming improvement. Keep verified fixes, risk decisions and false positives as separate outcomes.

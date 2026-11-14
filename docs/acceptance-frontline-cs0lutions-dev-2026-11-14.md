# Team-defence acceptance on cs0lutions development

14 November 2026. Scope: synthetic fixtures in KAN, the existing authorized Forge development installation and the acting user's own Jira account. Production Jira 3.0.0, Bitbucket production 2.0.0, public source, release tags and Codegeist submission were not updated by this work.

## Deployed result

Forge development **3.6.0**, contact runtime commit `789dba2afe4a56d8716f6ec48f1cd0acd4015685`. Jira package 0.1.6; native frontline engine 0.1.0; separate Solidity engine 0.1.4. No new scopes, external destinations or installation upgrade were required.

Open [OmniGuard Dev → Team defence](https://cs0lutions.atlassian.net/jira/software/projects/KAN/apps/2dcc2164-b65e-43a5-90c8-bc4ac20447ab/387fd4bc-0f29-4241-a471-dbf1e9edbf96/team-defence).

Fresh baseline capture: 18:58:16 UTC; retest: 18:58:46 UTC. Both expire after 24 hours. They are synthetic observations, not live monitoring or independent attestation.

| Evidence | SHA-256 |
|---|---|
| Baseline | `7914d1222ade8980449f195bc31e5a79690b3447efdb82cc1f70da40a48d9949` |
| Retest | `d59b4c575b9532d3e95400ac6c9f89df7672cb7d7179e249a6a910fa540ac879` |

## Real Jira sequence

[KAN-8](https://cs0lutions.atlassian.net/browse/KAN-8), `[OmniGuard fixture] OG-TEAM-001: Urgent access request`, was created and assigned to the acting user. Its original evidence baseline remained immutable.

1. A tampered bundle was rejected without populating the inventory.
2. The baseline imported as seven entries, five failed checks and two gaps. Premature verification/completion was unavailable.
3. The confirmed decision produced comment **10008**, 19:10:18.051 UTC. Repeating the same decision retained one history entry/comment.
4. The newer retest imported as five satisfied checks and two gaps. Reimporting the old baseline was rejected.
5. Verification comment **10009**, 19:11:59.922 UTC, binds the retest digest. The issue still showed To Do until the explicit completion action.
6. The issue became **Done** at 19:12:15.470 UTC. Reload retained the baseline, decision, current retest, Done state and both gaps.
7. On 3.6.0, the contact panel resolved the current assignee, previewed a retest-review message, then posted one self-mention: comment **10010**, 19:40:01.492 UTC. Connector HTML independently confirms an actual mention targeting the acting account. A repeat preview disables sending the same case/evidence/purpose. KAN-8 remains Done; coverage is unchanged.

Connector readback confirmed the assignee/creator relationship and comment receipts. Notification delivery and reading were **not** measured. This is one signed-in identity; independent reviewer and live denied-actor tests remain open. Permission-denial and actor-change boundaries are exercised locally.

## Fixes discovered by the live test

Development 3.3.0 exposed a full-document navigation issue that lost the Forge bridge. 3.4.0 switched the two workflows within the same document using Forge `view.createHistory`; code-evidence navigation, the team-defence deep route and reload then passed. 3.5.0 added an accessible paste-report path with the same strict server validation after browser automation could not operate the nested file chooser. The actual acceptance used **Paste a report instead**. Ordinary file-picker acceptance remains unmeasured.

The existing code-evidence development screen retains its historical PR snapshot and correctly warns that the PR changed. This work did not re-import that snapshot or retest code scanning. Production KAN-7 remained Done with its previous 14:52:14.441 UTC update.

## Validation

67 Jira/shared tests pass, including eight new contact tests: wrong/changed recipient, actor, purpose and digest; expiry; missing permissions; unassigned/inactive user; unexpected fields; uncertain and definitive failures; response-loss recovery and duplicate prevention. Frontend build, Forge lint and deployment passed. Local Postman contract: **13 requests, 23 assertions, zero failures**.

The current project already holds sequence 2. Newly generated sequence 1/2 files do not reset it. A future exercise in this project needs a higher sequence, new observation IDs and newer capture times; do not delete records to bypass ordering.

Separate encrypted communications are a **local-only** lab in [secure-comms](../secure-comms/README.md). They are not part of this Forge deployment. Physical Android/iOS acceptance and production encrypted-chat hosting remain pending.

Local handoff evidence: sibling output folder `omniguard-frontline-forge-dev-20261114`, including deployment logs, fresh fixtures, sanitized Jira receipts and screenshots. Historical local-only acceptance remains in [the earlier record](acceptance-frontline-2026-11-14.md).

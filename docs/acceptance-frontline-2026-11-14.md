# Front-line team defence — local acceptance, 14 November 2026

**Accepted scope:** a local synthetic-fixture milestone on `codex/frontline-team-defence`, based on public main `4d4dde3db9c3e486c671c149df37aa3e82ed3079`. This is not production Forge acceptance. The original Solidity engine, Bitbucket PR workflow, submitted entry, hosted site and tagged release remain separate.

## Observed result

The native Rust engine and Forge validator agree on seven declared entry points. Five explicit checks fail in the baseline and pass on the newer retest. An unsupported collaboration-tool check and a service-desk report without evidence remain visible gaps. The [guide](frontline-guide.md#coverage-ledger) records every row, owner and check.

The local browser exercise completed risk intake → assigned `LOCAL-1` → confirmed triage decision with a comment receipt → fresh retest → recorded verification → explicit Done transition. The UI separately displayed **Jira: Done** and **Retest current**. All issue, comment, assignment and permission behavior in this exercise used the in-memory Jira harness. No live Jira issue or comment was created.

## Checks performed

| Surface | Result | Limit |
| --- | --- | --- |
| Rust workspace | 43 tests passed, none ignored, including the native compiler fixtures | Uses isolated sources and local solc |
| Rust build/lint | Release workspace build, clippy with warnings denied, formatting check passed | Local Linux build |
| Jira/shared service | 59 tests passed; 18 new front-line/HTTP tests | Simulated Jira and actor contexts |
| Bitbucket integration | 3 tests passed; build and manifest validation passed | Existing regression suite, no new live PR run |
| Jira UI | Existing and new bundles built; full Atlassian manifest validation and Forge lint passed | Installation/navigation inside Forge still needs development acceptance |
| Existing dashboard | Production build passed | Local build only |
| Frozen corpus | All four intake/bundle files reproduced byte-for-byte | Fixed clock, deliberately dated evidence |
| Contract | Both intake files pass JSON Schema; whitespace-only labels rejected; native/JS validators enforce relational constraints | Schema alone does not validate authenticity |
| Postman | 10 requests, 10 test scripts, 17 assertions; zero failures | Loopback transport, simulated Jira |
| Postman lint | 10 files; zero errors/warnings; OpenAPI syntax lint passed | Enterprise governance unavailable |
| Browser accessibility | Enter-key actions, visible focus, restored focus after updates, working skip link, labelled inputs/selects | Targeted checks, not a formal WCAG audit |
| Responsive layout | At 390 px viewport: client/scroll width 375/375; at 320 px: 305/305 | Chromium local preview |
| Representative contrast | Body 11.55:1; button 7.78:1; muted 6.33:1; failure 7.91:1; pass 8.07:1; unsupported 7.33:1; focus on white 5.02:1 | Selected palette pairs; not an exhaustive accessibility certification |
| Packaging/docs | 667 source files and 8 existing judge files; byte-identical repack and 189 local Markdown targets passed | Local candidate snapshot, no tagged release replacement |

The Rust command included `OMNIGUARD_TEST_SOLC=/home/protocol-x/.local/bin/solc cargo test --locked --workspace --offline -- --include-ignored`. Core engine stays `0.1.4`; new binary is `omniguard-frontline` `0.1.0`; Jira package candidate is `0.1.6`. See the [guide](frontline-guide.md) for portable commands rather than the recorded machine-specific compiler path.

Security and recovery cases covered malformed/tampered evidence, unexpected message fields, wrong fact types, future/expired observations, missing owner/check/evidence, stale and conflicting sequences, cross-project actions, permissions, concurrent mutation rejection, immutable baselines, changed/dropped entries, reused observations, risk/false-positive separation, and expiry during transition lookup. Uncertain issue creation, verification and triage-comment outcomes were exercised. A pending triage decision retained its original digest even after newer evidence arrived and was recovered once from the delayed Jira receipt; verification stayed blocked until recovery.

The Postman runner printed:

```text
|                requests |                10 |                0 |
|            test-scripts |                10 |                0 |
|              assertions |                17 |                0 |
```

Columns are executed / failed. Duration was 358 ms; average response 2 ms. Expected 409 and 400 negative requests passed their assertions. The CLI's `--output` report-export attempt was rejected by its Enterprise plan gate before running requests; the subsequent ordinary local run passed and its complete terminal output was preserved. OpenAPI cloud governance is also plan-gated. The CLI used a temporary local session. A Postman skill update attempt failed with `ECONNRESET`; the installed skill instructions were used. Public Orbit discovery returned 403, so the work used the existing Jira adapter and official documentation. No cloud workspace publication or live provider acceptance is claimed.

## Evidence and remaining acceptance

The sibling local delivery folder `omniguard-frontline-20261114/` contains the authentic desktop/mobile captures, fixture hashes, test output, Postman terminal report and contrast measurements. The separate visual pack binds those captures and UI source files by SHA-256. Images contain invented role aliases and synthetic `LOCAL-1` only. Captures used the disclosed fixed clock **2026-11-14T16:21:00Z**.

An initial eager Forge bridge import prevented localhost startup; using a conditional import for the Forge surface corrected it. The accepted browser workflow ran after this fix. Coverage labels were not removed to make the exercise look complete.

Outstanding before an operational rollout: development deployment and real Jira permissions/assignment/comment-author testing with a second authorized identity; authenticated intake sources; a retention/recovery process and accurate privacy notice; broader checks and declared inventories. Current observations are bounded assertions, not independent proof that an account or device is safe. There is no live monitoring, automated incident containment, phishing classifier or universal coverage claim.

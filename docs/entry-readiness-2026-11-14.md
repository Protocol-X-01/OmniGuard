# Codegeist entry review — 14 November 2026

**Submission update:** after explicit entrant approval, Devpost confirmed submission on 14 November 2026. See the separate [confirmation record](acceptance-codegeist-2026-11-14.md).

At the initial review, the entrant was registered and the OmniGuard Devpost draft had its project story, two evidence screenshots, public captioned walkthrough, dedicated cover, software-team category, production installation link and complete judge instructions saved. Final terms acceptance and submission were still pending. The preparation checks below retain that historical context.

## Delivered vertical slice

| Requirement | Evidence |
| --- | --- |
| Independent Rust core, CLI, source and optional compiler AST analysis | [Specification](../SPEC.md), [compiler contract](compiler-analysis.md), [native effects and limits](native-effects.md) |
| Reproducible vulnerable/fixed fixtures and JSON/SARIF source evidence | [Fixture walkthrough](judge-pack.md), [native-effects validation](../reports/benchmarks/native-effects/validation.json) |
| Separate Forge Jira app and real remediation/rescan workflow | [Production KAN-6 acceptance](acceptance-production-cs0lutions-2026-11-14.md) and [separate-site OGTEST-1 acceptance](acceptance-separate-site-2026-11-14.md) |
| Accessible dashboard checks and honest failure states | [Focused accessibility review](accessibility.md); not a full certification |
| Privacy minimization and current notice | [Approved rollout](privacy-minimization.md), [notice text](privacy-notice.md) |
| Build, deployment, installer and judge instructions | [Deployment](deployment.md), [release guide](release.md), [hosted guide](https://omniguard-n5h9.onrender.com/) |
| Public demo under five minutes | [3:51 captioned walkthrough](https://www.youtube.com/watch?v=OVf5P7mi1xE), [media acceptance](acceptance-mellow-narration-2026-11-14.md) |
| Bitbucket integration skeleton kept separate | [Unregistered scaffold](../integrations/atlassian-bitbucket/README.md), not live pull-request scanning |

The last full runtime CI at `e368525893edb1700dcad5754a897de0c6ad7058` passed both jobs: [run 43588896485](https://github.com/Protocol-X-01/OmniGuard/actions/runs/43588896485). It includes 38 Rust tests, 31 Forge tests, compiler evidence, builds, manifest validation and package integrity. Current entry preparation changes documentation, evidence and artwork only; the engine, Forge runtime, source fixtures, dependencies and report bundles are unchanged.

## Fresh execution evidence

A current-file audit found that five of the six native-effect witness inputs match the original runtime manifest. The shipped Foundry configuration differs, while contract/test bytes match. All three witnesses were therefore rerun from fresh copied inputs with the checksum-verified native Solidity 0.8.26 compiler, offline. All passed, including 128 paired fuzz runs. The [new receipt](../reports/benchmarks/native-effects/entry-audit-20261114.json) and [raw result](../reports/benchmarks/native-effects/entry-audit-20261114-raw.json) preserve that distinction. No RPC or live-chain transaction was used.

## Presentation and limits

The [3:2 project cover](assets/omniguard-devpost-cover.png) uses the presentation's teal/cream styling and was created with OpenAI image generation. Synthetic narration and AI assistance are disclosed in the entrant fields. The screenshots retain separate development and production captions.

The frozen synthetic review matches 24/26 expected labels; unsupported explicit-super dispatch and one composed-modifier case remain incomplete. This is not production accuracy or proof against every attack. Import validation establishes supplied source-evidence consistency, not scanner execution. Separate-site installation was tested by the same administrator. No live Bitbucket, Rovo, Teamwork Graph, Marketplace or Atlassian MCP bonus capability is claimed.

# OmniGuard v0.1.4 — Technical Specification

**Status:** implemented bounded native-effects milestone; broader semantic analysis and external submission acceptance remain open

**Date:** 2026-11-13

**Repository:** new, independent project at `outputs/omniguard/`

**Target:** early Codegeist 2026 submission; official deadline is 2026-12-22 at 12:00 PM Pacific.

## Product goal

OmniGuard helps a Solidity developer move from a reproducible static finding to a tracked remediation and a clean rescan. The first slice must demonstrate this path on local fixtures without contacting a live chain:

1. Scan a Foundry-shaped project with the OmniGuard CLI.
2. Show each finding with source-backed evidence that can be independently checked.
3. Create or preview a Jira remediation item from the finding.
4. Apply the matching fixture fix, rescan, and show the finding resolved.

The runtime is a deterministic source analyzer. The separate Foundry witness suite executes authored fixtures in a local EVM. Neither operation submits live-chain transactions or contacts RPC endpoints.

## Repository and boundaries

This is a fresh repository. It has no source-code, binary, pattern-database, or runtime dependency on OmniScan or MULTI-CHAIN-FRAMEWORK. The two systems remain independently buildable and releasable.

```text
omniguard/
  crates/omniguard-core/       parsing, rules, evidence, report models
  crates/omniguard-cli/        Foundry-friendly command line
  contracts/                   versioned JSON report contract
  fixtures/                    vulnerable and fixed Foundry projects
  dashboard/                   accessible local dashboard and demo adapter
  integrations/atlassian-forge/ Forge manifest, resolvers, and UI adapter
  docs/                        architecture and operating guidance
```

The core exposes a versioned JSON report contract. The CLI, dashboard, and Forge adapter consume that contract across a process/API boundary; the Forge app does not embed or link the Rust core. Core rules remain runnable without Node, Forge, or an Atlassian account.

## Rust analysis core

- Parse Solidity with the `tree-sitter-solidity` grammar and walk syntax nodes; detections must use AST node kinds and source spans rather than whole-file regular expressions.
- Scan an explicit file or directory. With no path, recognize a Foundry project (`foundry.toml`) and scan its configured `src` directory, defaulting to `src/`. Outside Foundry, recursively scan `.sol` files.
- Resolve current-source contracts, declarations, lexical bindings and unambiguous interface method signatures. Track a bounded set of local aliases, guard placements and branch relationships. Optional native-solc AST facts resolve declaration identities/types across supplied imports and inherited storage. A whole-program call graph and full control/value flow remain open.
- A syntax-error file produces a scan diagnostic and a non-clean result. It must never silently count as a clean file.
- Findings carry rule ID, severity, confidence, message, remediation, enclosing contract/function, primary and related source locations, one-based line/column, byte spans, exact excerpts, and SHA-256 of the scanned file. Evidence validation verifies path containment, digest, UTF-8 boundaries, spans, excerpts, and locations.
- Record every scanned file's SHA-256 snapshot, attempted rule IDs and explicit input completeness. Empty input, syntax errors, unreadable paths and skipped symbolic links make coverage incomplete. Reject malformed Foundry source settings and implicit source-root expansion outside the selected project.
- Stable finding fingerprints are derived from rule ID, normalized path, and AST source span. Sorting is deterministic.

### Current rule pack

Engine 0.1.4 implements 12 rules covering transaction-origin conditions, call-before-storage-write ordering, discarded/unused low-level call results, unchecked address send, caller-derived delegatecall targets, unrestricted selfdestruct indicators, repeated message-value crediting, block-derived selection, ambiguous packed hashing, ignored resolved token returns, strict self-balance equality and reverting transfers in loops. The Rust registry is authoritative; `omniguard rules --format json` generates the [full rule reference](docs/rules.md), including individual severity, confidence, remediation and limitations.

Compiler mode now follows bounded ordered effects for rules 002/005/006 through directly resolved internal/private functions, storage aliases and imported modifiers. Short-circuit paths and memory/storage binding distinctions are explicit. Unsupported dispatch, recursion, assembly and exhausted bounds produce incomplete coverage. The [native-effect contract](docs/native-effects-plan.md) and [measurement record](docs/native-effects.md) specify the limits.

Rules include a concise explanation, fix guidance, test fixture, and stable identifier. Suppression/configuration is deferred until the baseline evidence contract is proven.

## CLI and report contract

Binary name: `omniguard`. Commands:

```text
omniguard scan [PATH] [--format text|json|sarif] [--output FILE] [--fail-on low|medium|high|critical] [--solc EXECUTABLE]
omniguard rules [--format text|json]
omniguard bundle [PATH] --target ID --name NAME --revision REV --isolated-fixture [--output FILE] [--solc EXECUTABLE]
```

Default scan output is readable text. JSON report schema v3 records analysis mode/compiler version, engine version, input/rule coverage, file snapshots, diagnostics, contextual findings and related evidence. SARIF 2.1.0 includes rule metadata and primary/related locations and per-related-source digests. Exit codes are 0 for a completed scan, 1 for a configured finding threshold and 2 for incomplete/error input. Finding presence without a configured threshold still returns 0.

Native bundle export requires explicit fixture selection and includes every source file. Export rejects any source snapshot drift, including finding-free files. Forge accepts current 0.1.4/schema-v3 and historical 0.1.3/schema-v3, 0.1.2/schema-v3, 0.1.1/schema-v2 and 0.1.0/schema-v1 profiles. Each related source has its own checked digest. Review baselines distinguish engine, rules, mode and compiler version. Old bundles remain under their versioned `reports/legacy/` directories.

## Fixtures and acceptance tests

Fixtures are isolated, authored Solidity projects without network configuration, deployment scripts or secrets. Complete executable vaults, a composed 12-pattern pair and a 60-case labelled corpus and eight frozen compiler-facts challenges have reproducible fixed/negative controls. The regression suite asserts:

- all 60 corpus cases match exact declared rule expectations;
- fixes remove the expected findings without changing the surrounding test scenario;
- every primary/related span, excerpt, file digest and line/column validate against the fixture; tampering is rejected;
- malformed Solidity is surfaced as a diagnostic rather than a clean result;
- current and historical bundles pass their JSON schemas; expanded SARIF passes the official OASIS schema;
- repeated scans of the same tree produce byte-stable logical findings.
- incomplete coverage and changed finding-free source snapshots cannot produce a successful clean export or Jira verification.

Acceptance runs are documented in the README. The 60-case corpus and eight compiler challenges compile with Solidity 0.8.26. Compiler-assisted mode resolves all declared challenge findings, including five missed by source mode; these are authored development cases, not held-out accuracy estimates. Six Foundry witnesses use the complete vault pair with Solidity 0.8.24, including two 128-case fuzz properties. The original KAN-1 Vault fixture lacked a deposit path and remains a historical static workflow example. Run the controlled Slither comparison with recorded detector mappings, versions, per-case outcomes and timing scope; it does not establish production accuracy or superiority.

## Dashboard and remediation flow

The dashboard presents a short scan summary and an evidence ledger: each result can be opened to see its rule, confidence, file and line, exact excerpt, explanation, and fix. It provides a filter by severity and a clear state for parser errors. Keyboard focus, semantic headings, labels, color-independent severity text, reduced-motion support, and narrow-screen layout are required.

The local demo uses real JSON generated by the CLI. A small local adapter invokes the CLI on the selected vulnerable/fixed fixture and records Jira-shaped remediation drafts locally, so the scan/evidence/remediation/rescan story is repeatable without Atlassian credentials. The UI must label this as a local demo. The Forge adapter replaces the local draft action with an explicit Jira issue-creation resolver.

The [focused accessibility review](docs/accessibility.md) records measured text contrast, keyboard operation, reflow at 320–1280 px, reduced motion, and unavailable-service recovery. A failed rescan must clear earlier success claims and must not display stale source evidence as a current result.

Visual direction: an **inspection bench**, not a generic security console. Use a cool paper background, deep ink-blue structure, restrained oxidized-copper severity accents, and a bright evidence-blue focus/selection color. Pair a distinctive display face with a highly legible sans face and tabular mono for locations. The signature is a vertical evidence rail linking finding → Jira status → rescan result. All states remain legible without color.

## Atlassian Forge integration

The Jira app lives in `integrations/atlassian-forge/`, with its own Node package and configuration. It does not import Rust crates or need the Rust CLI at runtime. It contains:

- Jira `jira:projectPage` to review scan results and create remediation issues.
- Authenticated report import, installation/project-scoped Forge KVS and current-user Jira operations.
- Jira read/write and app-storage scopes for issue creation, comments, status checks and explicit completion transitions.
- Server-derived project context, Jira permission checks, duplicate-request claims and uncertain-outcome handling.
- Independent validation of source snapshots, primary/related evidence, fingerprints, rule coverage and profile identity.
- Matching-engine/mode/compiler/rule-profile rescans that require changed source, complete coverage and absence of that rule in that file before recording verification. Completion remains an explicit Jira workflow action.

The import contract is limited to isolated fixtures, 160 KiB per bundle, 8 files, 64 KiB per file and 100 findings. Source integrity checks do not attest scanner execution or prove exploitability. Revision labels are uploader-supplied. A profile upgrade creates a distinct remediation baseline and cannot verify an older profile silently.

The Bitbucket `bitbucket:repoPullRequestOverviewPanel` scaffold lives separately in `integrations/atlassian-bitbucket/`. Live repository fetching, authenticated transfer and PR/commit binding remain open. This split follows Forge's supported product boundary. No Atlassian credentials belong in the repository.

## Build, release, and submission boundary

- Rust core/CLI: `cargo test --workspace` and `cargo build --release --workspace`.
- Dashboard: install its pinned dependencies, build production assets, and run the local demo using the instructions in `README.md`.
- Forge: install its package dependencies, generate reports/catalog, run tests, build and validate/lint before development deployment. See `docs/forge-workflow.md` for sign-in and installation.
- Production 2.0.0 is installed on cs0lutions with Jira-only distribution enabled. The [production acceptance](docs/acceptance-production-cs0lutions-2026-11-14.md) completed KAN-6, rejected a weaker rescan, recorded verification comment 10005 and retained Done after reload. Historical development acceptance remains separately versioned. Independent judge-site acceptance, public video publication and Devpost submission remain open.
- Preserve bounded analysis claims while preparing the public judge materials. The submission target remains ahead of 2026-12-22; the separate multi-chain research and MCP foundation do not establish broader semantic parity.

## Deferred beyond v0.1

Whole-program control/value flow, resolved role/lock semantics, independently labelled held-out cases and additional local property/invariant witnesses are the next depth gates. Additional languages, CI merge gates, Rovo/AI explanations, hosted multi-tenant report storage, Marketplace publication and automated code changes need separate acceptance criteria. Live-chain transactions remain outside the requested scope.

## Source references

- [Codegeist 2026 official rules](https://codegeist2026.devpost.com/rules)
- [Atlassian Forge Jira project page](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-project-page/)
- [Atlassian Forge Bitbucket pull request overview panel](https://developer.atlassian.com/platform/forge/manifest-reference/modules/bitbucket-repository-pull-request-overview-panel/)
- [tree-sitter-solidity Rust crate documentation](https://docs.rs/tree-sitter-solidity/1.2.13)

- [Solidity security considerations](https://docs.soliditylang.org/en/latest/security-considerations.html)
- [Slither detector documentation](https://github.com/crytic/slither/wiki/Detector-Documentation)

## Optional compiler contract

Native `--solc` uses Standard JSON, supplies the selected source bytes, requests AST output only and disables the filesystem import callback. Missing imports, semantic errors, invalid output, unavailable tools and deadlines make the requested analysis incomplete; it cannot silently downgrade to source mode. No compiler or source dependency is downloaded. Foundry library remappings and dependencies outside the selected source root are not loaded in this milestone. The compiler guide documents size/time limits, source evidence and remaining semantic gaps.

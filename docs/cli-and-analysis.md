# CLI and analysis reference

OmniGuard is an independent Rust Solidity source analyzer for Foundry developers. Engine **0.1.4** provides **12 rules**, scoped AST analysis, optional compiler-resolved ordered effects across direct helpers, storage aliases and selected imported modifiers, source-validated primary/related evidence, native fixture-bundle export, JSON/SARIF and a separate Jira Forge integration. The Bitbucket integration remains a separate scaffold.

Created from scratch; it has no source, pattern-database or runtime dependency on OmniScan or MULTI-CHAIN-FRAMEWORK. Its current measurements are specific to the supplied fixtures, not a claim of general superiority over existing analyzers.

## Build and scan

Requirements: Rust 1.90 or newer; `rust-toolchain.toml` pins the reproducible build to stable **1.93.0**. The locked tree-sitter dependency requires 1.90, correcting the earlier 1.88 instruction. Source mode needs no Node, Forge account, Solidity compiler or chain connection. Optional `--solc /path/to/native/solc` supplies compiler facts; it does not download a compiler or source dependencies.

```sh
cargo build --locked --release --workspace
cargo test --locked --workspace

./target/release/omniguard rules
./target/release/omniguard rules --format json
./target/release/omniguard scan fixtures/executable-vault/vulnerable --format text
./target/release/omniguard scan fixtures/patterns/vulnerable --format sarif --output /tmp/omniguard.sarif
./target/release/omniguard scan fixtures/patterns/fixed --format json
./target/release/omniguard scan fixtures/semantic-challenges --solc /path/to/native/solc --format json
```

With no path, `scan` uses the current directory. For Foundry it reads `profile.default.src` or `src` from `foundry.toml`, defaulting to `src/`; otherwise it recursively scans `.sol` files. A configured source root outside the selected project must be scanned explicitly. Symbolic links, unreadable paths, empty input and parser errors produce incomplete coverage. `--fail-on high` returns 1 for a high/critical finding; input/parser diagnostics return 2. A completed scan without a threshold returns 0 even when findings exist.

The [compiler guide and measurements](compiler-analysis.md) explain selected-source imports, overloads, inherited storage and the five challenge detections missed by source mode. The [rule reference](rules.md) includes each detection, remediation, confidence and limitation. The [depth milestone report](rule-pack-results.md) links the exact corpus, Slither comparison and executable witnesses.

The [native-effect milestone](native-effects.md) follows declaration identities through direct helper calls and storage references. It detects the complete helper-vault callback pattern that the previous engine missed, with separately executed vulnerable/fixed local witnesses. Unsupported or exhausted effects make analysis incomplete.

Version 0.1.3 fixed a measured authorization-suppression gap: directly overwriting the storage value used by a later caller check no longer makes that check a trusted restriction. Explicitly selected symbolic links also produce incomplete coverage. See the [guard regression record](guard-analysis.md) for cases and remaining limits.

## Export a source-validated fixture bundle

```sh
./target/release/omniguard bundle fixtures/patterns/vulnerable \
  --target local-patterns --name "Local Solidity patterns" --revision vulnerable-v1 \
  --isolated-fixture --output /tmp/patterns.omniguard.json
```

The bundle includes the source text. Every file must still match the scan's SHA-256 snapshot at export, including files with no findings. JSON report schema v3 records analysis mode/compiler version, rule/input coverage and a separate digest for each related source. SARIF 2.1.0 includes corresponding related locations. Fixture-bundle import rechecks these facts; it does not attest the scanner operator or prove exploitability.

## Repeat the measurements

```sh
cargo test --workspace
forge build --root fixtures/rule-corpus --use 0.8.26
forge test --root fixtures/security-tests --use 0.8.24
python3 scripts/benchmark.py
OMNIGUARD_TEST_SOLC=/path/to/native/solc cargo test -p omniguard-core --test compiler -- --ignored
OMNIGUARD_TEST_SOLC=/path/to/native/solc cargo test --workspace -- --include-ignored
python3 scripts/validate-effect-challenges.py --binary target/release/omniguard --solc /path/to/native/solc --output /tmp/omniguard-effect-results
python3 scripts/validate-effect-review.py --binary target/release/omniguard --solc /path/to/native/solc --output /tmp/omniguard-review-results
forge test --offline --root fixtures/effect-tests --use /path/to/native/solc
python3 scripts/benchmark-compiler.py --solc /path/to/native/solc
```

Here `forge` is **Foundry's** executable. The benchmark needs Foundry, solc and Slither on PATH, or their explicit command-line path options. It writes raw reports, per-case outcomes, tool versions and corpus hashes under `reports/benchmarks/expanded-pack/`. There are 60 authored pattern cases, eight imported/inherited compiler challenges and six local EVM witness tests, including two 128-case fuzz properties. These measurements do not establish production precision/recall or coverage of every attack class.

The 26-case review replay deliberately returns **exit 1** for the recorded 24/26 agreement: explicit-super and composed-modifier cases remain incomplete. Exit 2 means invalid inputs, execution or evidence. It does not convert known limitations into passing detection labels. Both replay commands require new output directories and preserve the frozen source bytes. See [release reproduction and status](release.md).

## Local dashboard

Build the debug CLI with `cargo build --workspace`. In `dashboard/`, run `npm ci` and start `npm run api` and `npm run dev` in separate terminals. Open `http://127.0.0.1:4173`.

This loopback-only fixture dashboard invokes the local Rust scanner over the complete executable vault pair and creates clearly labelled in-memory Jira drafts. Set `OMNIGUARD_SOLC=/path/to/native/solc` when starting its API to use the compiler-assisted semantic vault pair instead. It displays related evidence, analysis mode and incomplete coverage. The separate Forge app below creates real Jira Tasks.

## Jira Forge integration

The app in `integrations/atlassian-forge/` imports isolated scan bundles, rechecks evidence, persists project/profile-scoped remediation records, creates Tasks as the current Jira user, records matching-profile rescan verification and offers explicit completion transitions.

After building the release CLI, run `npm ci`, `npm run reports:generate -- --solc /path/to/native/solc`, `npm test`, `npm run build` and `npm run validate:manifest` in that package. Its Forge CLI is pinned locally; use `npm run login`, `npm run lint` and the documented deployment commands with supported Node.

Generated bundles include:

- `reports/effects-vulnerable.omniguard.json` / `effects-fixed.omniguard.json`: compiler-assisted helper/storage-alias vault pair, backed by local runtime witnesses.

- `reports/semantic-vulnerable.omniguard.json` / `semantic-fixed.omniguard.json`: three-file compiler-assisted vault pair.
- `reports/semantic-source-vulnerable.omniguard.json` / `semantic-source-fixed.omniguard.json`: the same target under source mode, illustrating the coverage difference.

- `reports/patterns-vulnerable.omniguard.json` / `patterns-fixed.omniguard.json`: 12-rule positive/fixed pack.
- `reports/executable-vulnerable.omniguard.json` / `executable-fixed.omniguard.json`: complete vaults used by the local EVM witnesses.
- `reports/vulnerable.omniguard.json` / `fixed.omniguard.json`: the original static Vault source under the current engine.
- `reports/legacy/v0.1.0/`, `v0.1.1/`, `v0.1.2/` and `v0.1.3/`: unchanged historical profiles; KAN-1 used 0.1.0 and KAN-2 used 0.1.2.

The app supports historical 0.1.0/schema-v1, 0.1.1/schema-v2, 0.1.2/schema-v3 and 0.1.3/schema-v3 profiles, plus current 0.1.4/schema-v3 source/compiler profiles. Rescans must match engine, rules, analysis mode and exact compiler version; a profile upgrade creates a distinct review baseline and cannot silently verify an older issue.

See [Forge workflow and data limits](forge-workflow.md), [deployment instructions](deployment.md) and the [historical cs0lutions tenant acceptance record](acceptance-cs0lutions-2026-11-13.md). The 0.1.0 workflow completed KAN-1. The [0.1.2 compiler-assisted tenant workflow](acceptance-compiler-cs0lutions-2026-11-13.md) completed KAN-2, including a live check that source-only rescans cannot verify its compiler baseline. Those histories remain explicitly versioned. The [0.1.4 native-effect workflow](acceptance-native-effects-cs0lutions-2026-11-14.md) completed KAN-4 using the helper/storage-alias vault pair and verification comment 10003; the fixed scan and Done state persisted after reload.

## Analysis boundary and next depth work

Source mode resolves declarations within each file. Optional compiler mode adds actual declaration identities and expression types across the supplied imports and inheritance. Compiler mode additionally expands bounded direct internal/private effects, ordered modifier bodies and storage aliases. It has no general path-feasibility proof, arbitrary dynamic dispatch resolution, cross-transaction role-integrity proof or protocol-level invariant inference. Compiler mode does not load dependencies outside the selected snapshot or process Foundry library remappings yet. Pattern presence is not proof of exploitability; absence is not proof of safety.

Remaining depth work includes more resolved dispatch, guard/lock semantics, an independently labelled external corpus and broader property/invariant witnesses. The [judge guide](judge-guide.md) links the available production installer and current fixture walkthrough. [Production acceptance](acceptance-production-cs0lutions-2026-11-14.md) completed KAN-6 with comment 10005 and Done persistence; a weaker rescan was rejected. The [public demonstration](https://www.youtube.com/watch?v=OVf5P7mi1xE) includes that result. [Separate-site installation and remediation](acceptance-separate-site-2026-11-14.md) also passed under the same administrator account. Final submission and independent reviewer-account acceptance remain open.

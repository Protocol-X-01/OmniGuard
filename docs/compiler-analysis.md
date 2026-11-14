# Optional compiler facts: introduced in engine 0.1.2

The compiler milestone below records 0.1.2 evidence. Engine 0.1.3 added [guard-anchor invalidation and selected-link regression checks](guard-analysis.md); current 0.1.4 adds [bounded native ordered effects](native-effects.md). Exact 0.1.2 Jira bundles are preserved under `reports/legacy/v0.1.2/`.

OmniGuard can use an installed native Solidity compiler to resolve declarations and expression types across the selected source files. The Rust rules still perform bounded local analysis. This improves imported interfaces, overloads, dynamic struct fields and inherited storage identity; it does not establish whole-program reachability, exploitability or safety.

## Reproduce

Use the pinned stable Rust 1.93.0 toolchain (minimum declared Rust 1.90) and a native Solidity 0.8.26 executable for these challenges:

```sh
cargo build --release --workspace
cargo test --workspace
OMNIGUARD_TEST_SOLC=/path/to/native/solc cargo test -p omniguard-core --test compiler -- --ignored
OMNIGUARD_TEST_SOLC=/path/to/native/solc cargo test -p omniguard-core --test guard_anchor -- --ignored
./target/release/omniguard scan fixtures/semantic-challenges --solc /path/to/native/solc --format json
python3 scripts/benchmark-compiler.py --solc /path/to/native/solc
```

The five native-compiler tests are explicitly ignored in the compiler-free default suite; the command above runs them. Tests cover all eight challenges, the existing 60-case corpus, per-file evidence tampering, compiler errors, disabled external imports and inherited builtin-like names. Default tests also cover an unavailable compiler and a timed-out compiler launcher with a child process. The tested process-group cleanup is Unix-specific; Windows acceptance remains unverified.

The [raw measurement and per-case comparison](../reports/benchmarks/compiler-facts/summary.md) records **five source-mode mismatches and zero compiler-mode mismatches** across the eight cases. The existing 60-case corpus also has zero compiler-mode mismatches. Labels were frozen before this implementation; once used to fix the analyzer, these became development cases. They are not an independent held-out benchmark or a comparison against production analyzers. The pre-change 0.1.1 baseline is retained beside the current reports.

## Selected-source boundary

`--solc` supplies all selected source bytes through Solidity's Standard JSON interface and requests AST output only. The driver uses `--no-import-callback`; it neither downloads nor implicitly reads missing dependencies. Relative imports must resolve among the supplied source keys. In a Foundry project the selected root remains the configured `src` directory. Foundry library remappings and files outside that root are not loaded yet. Missing imports or incompatible pragmas produce an incomplete report.

The compiler version, declaration IDs, referenced declarations, expression types and exact source spans come from the invoked tool. Source-mode rules remain runnable without it. A requested compiler failure never downgrades silently to source mode. Native Solidity 0.8.x release metadata is accepted; this milestone was exercised with 0.8.26. Choose a compiler compatible with the source pragma rather than changing the fixture to fit an installed tool.

Input is limited to 8 MiB of Standard JSON, output to 64 MiB and stderr to 1 MiB. Each compiler invocation has a default 30-second deadline. Compiler errors in JSON make coverage incomplete even when its exit code is zero. Compiler warnings are not currently exported as scanner findings. The source-integrity checks do not attest the compiler binary or scanner execution.

## Reports and Jira review profiles

Report schema v3 records `analysis.mode` (`source` or `solc`) and `analysis.compiler_version`. Related evidence carries its own SHA-256, file, span and excerpt, so an imported method or inherited storage declaration can be independently checked. SARIF carries related file locations and analysis metadata too.

The Forge app validates the current v3 profile and historical v1/v2 reports. Remediation creation and rescan comparison distinguish engine, rule set, analysis mode and exact compiler version. A parser-only rescan cannot verify a compiler-assisted finding; a compiler-version change starts a separate review baseline. Historical normalized hashes and Jira records remain compatible.

Generate the small three-file pair for a tenant workflow:

```sh
cd integrations/atlassian-forge
npm run reports:generate -- --solc /path/to/native/solc
npm test
```

Use `reports/semantic-vulnerable.omniguard.json` and `reports/semantic-fixed.omniguard.json` from the repository root. Expect three findings (transaction-origin condition, inherited-storage ordering and ignored imported-token result) and then zero detections. The `semantic-source-*` pair analyzes those same sources without compiler facts and demonstrates the distinct profile. The complete eight-case challenge corpus exceeds the Forge import file-count limit; use its native report for analysis and the small pair for Jira.

## Live workflow evidence

The 0.1.2 compiler-assisted three-file pair was exercised on cs0lutions: imported evidence → real Jira Task KAN-2 → fixed compiler rescan → verification comment → Done. A zero-finding source-only rescan was rejected for that compiler baseline. Both the fixed scan and Done verification persisted after a full app reload. Use the exact legacy bundles for that baseline; current-engine reports start a separate review profile. See the [tenant acceptance record](acceptance-compiler-cs0lutions-2026-11-13.md).

The local dashboard/API also passed the compiler-assisted scan → local draft → fixed rescan path; the local draft remains explicitly separate from real Jira. [API run evidence](../reports/benchmarks/compiler-facts/dashboard-smoke.json).

## Remaining depth work

Compiler-resolved identities improve the facts consumed by these rules. Engine 0.1.4 follows selected imported modifiers, storage aliases and direct internal/private helpers, with explicit incomplete diagnostics for unsupported effects. It does not resolve every modifier composition, role change, reentrancy lock or dynamic dispatch. Rules retain their documented bounds; complex locks/guards can need manual review, and a used success flag may still be handled incorrectly. General dependency/remapping support, stronger control/value flow, independently labelled held-out cases and more local invariant witnesses remain open.

Primary references: [Solidity Standard JSON](https://docs.soliditylang.org/en/v0.8.26/using-the-compiler.html#compiler-input-and-output-json-description) and [compiler source mappings](https://docs.soliditylang.org/en/v0.8.26/internals/source_mappings.html).

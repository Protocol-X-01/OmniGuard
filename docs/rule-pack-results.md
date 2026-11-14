# Analyzer depth milestone: engine 0.1.1

This is the historical 12-rule expansion measurement. Engine 0.1.2 introduced optional compiler facts and schema v3; current 0.1.4 adds [native ordered effects](native-effects.md). See the [compiler guide](compiler-analysis.md) for that earlier milestone. The 0.1.1 bundles remain under `reports/legacy/v0.1.1/`.

The current milestone expands the independent Rust analyzer from 3 to **12 rules**. It adds scoped declarations, address/interface checks, limited local value propagation, caller-guard placement checks and branch separation. Findings now include the enclosing contract/function and related parameter, declaration or storage-write evidence where the rule depends on it. The [generated rule reference](rules.md) records each rule's conditions, remediation, confidence and limits.

## Measured checks

- **60 authored Solidity corpus cases**, including primary vulnerable/fixed pairs and adversarial positive/negative controls. Every case compiles with Solidity 0.8.26, and the scanner's exact findings match all declared expectations. Scope/shadowing, no-op or late guards, aliases, discarded flags and user-defined builtin-like names are covered.
- The same corpus was run through installed Slither 0.11.6 with explicit detector mappings. Raw outputs, per-rule outcomes, case-level differences, versions, corpus hash and timing scope are in the [comparison report](../reports/benchmarks/expanded-pack/summary.md). The labels were authored for this pack; this measures agreement on these patterns and does **not** establish general accuracy or superiority over Slither. Some mapped Slither policies intentionally cover broader conditions.
- **6 local EVM witness tests** pass on the complete executable vault pair with Solidity 0.8.24. Two fuzz properties each ran **128 cases**: the vulnerable withdrawal pays more than its deposit, while the fixed withdrawal preserves other deposits. Unit witnesses cover transaction-origin authorization and ignored/checked payment failure. [Raw Foundry results](../reports/benchmarks/expanded-pack/foundry-witnesses.json).
- **17 Rust tests pass**, checking the corpus plus source/related-evidence tampering, UTF-8 spans, incomplete inputs, unsafe source-root expansion, snapshot drift and native bundle export. **16 Forge tests pass**, additionally checking legacy digests, expanded coverage, related evidence, profile isolation and incomplete-scan gates.
- All six current fixture bundles regenerate deterministically. Current and historical bundles pass their JSON schemas. The expanded SARIF report passes the official OASIS SARIF 2.1.0 schema, including its related locations.

These are specific local measurements. Production precision/recall, general attack coverage and performance against equivalent analyzer pipelines remain unproven.

## Development integration check

Forge development **2.2.0** was deployed on cs0lutions on 13 November 2026 after the frontend build, full manifest validation, service tests and authenticated Forge lint passed. The installed page was reloaded and visibly retained historical KAN-1 as Done, with its recorded verification, original fixed-bundle digest and explicit engine 0.1.0 baseline. The app footer identifies version 0.1.1. [Upgrade evidence](evidence/forge-engine-upgrade-preserved-history.jpg).

The expanded 12-rule bundle is accepted by the local validator/service tests. A complete tenant import → issue → fixed rescan flow using that new profile has not yet been repeated. The historical live acceptance and current-profile local checks remain separate evidence.

## Input and evidence integrity

Report schema v2 records the attempted rule set, input file manifest, SHA-256 snapshot of every scanned file and an explicit completeness flag. Empty input, parser/read/traversal errors and skipped symbolic links cannot be presented as a successful clean scan. A malformed Foundry source path cannot silently fall back to another directory.

The native Rust `bundle` command exports the exact scanned source bytes and refuses a source change between analysis and export, including finding-free source files. Forge validates the source snapshots and all primary/related spans again. It supports the old 0.1.0/schema-v1 profile for historical reports and the expanded 0.1.1/schema-v2 profile. Different profiles cannot silently verify each other's remediation baselines. New profiles produce separate review baselines; an upgrade is not treated as evidence that an old issue is fixed.

The original Vault fixture used for the KAN-1 workflow lacked a deposit path. Its reentrancy result was a statement-order indicator. The new [executable vault pair and local tests](../fixtures/security-tests/README.md) include reachable deposit/credit state and prove the particular mechanism and remediation by execution. The historical fixture and acceptance hashes remain unchanged.

## What still needs deeper work

The model does not yet resolve imports/inheritance through the compiler, build a whole-program call graph, perform full path/value analysis, prove lock/role semantics or infer protocol-level invariants. Unresolved receiver types can hide detections; complex authorization can need manual review. A used success flag may still be handled incorrectly. Guard checks and statement ordering are limited local models, not proofs of reachability.

The next depth gate is a separately labelled challenge/held-out corpus, compiler-resolved symbols and imports, stronger control/value flow, and additional local property/invariant witnesses. Add detectors in response to measured gaps. Keep submission media and public distribution behind that engineering work.

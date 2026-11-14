# Native ordered effects — engine 0.1.4

OmniGuard now follows directly resolved helper calls, imported modifiers and storage references in optional native-solc mode. This is an independently authored Rust analysis over the selected compiler AST, without an external analyzer runtime. Source mode remains available without a compiler.

The motivating complete vault deposits funds, then withdraws through a local storage alias and a private payment helper. Engine 0.1.3 returned no findings for both versions. The new engine identifies the vulnerable helper interaction followed by the credit reset; moving that reset before the helper removes this indicator. Primary evidence points to the caller, with exact helper interaction, later write and binding evidence attached.

## What the analysis does

- Bind declarations and parameters by compiler identity, including named helper arguments.
- Distinguish storage aliases/rebinding from memory and calldata copies.
- Expand direct internal/private calls and selected imported modifier bodies in order.
- Keep exclusive branches, short-circuit alternatives, return/revert and loop-exit effects separate.
- Recognize implemented preceding caller restrictions without treating a modifier name or an unrelated check as authorization.
- Validate every primary/related source digest, UTF-8 span and coordinate. Separate caller locations retain separate finding fingerprints.

These effects support rules OG-SOL-002, OG-SOL-005 and OG-SOL-006. The full registry still contains twelve rules. A source-validated static indicator is separate from a successful runtime witness.

## Measurements and their limits

The twenty-case pack was authored and frozen before implementation evaluation. Its manifest is [in the repository](../fixtures/effect-challenges/manifest.json), SHA-256 `f315bee1430030f01b0130166fb37699ddaf86134032f94fcaf02d03cfcff999`. Native Solidity 0.8.26 accepts every source. Seventeen supported cases declare exact target-rule sets; three unsupported cases require incomplete coverage.

| Check | Frozen 0.1.3 | Initial native-effects handoff |
| --- | ---: | ---: |
| Supported exact expectations | 8/17 | 17/17 |
| Unsupported cases marked incomplete | 0/3 | 3/3 |
| Complete vulnerable helper vault | No finding | OG-SOL-002 |
| Complete fixed helper vault | No finding | No finding |

The initial handoff was frozen as a separate executable before disclosure. All 66 primary/related source spans in this evaluation matched their bytes, hashes and coordinates.

A separate reviewer froze 26 cases before seeing the implementation. The first pass met **24/26 exact expectations**: thirteen detected cases, eight clear controls and five unsupported cases. Two cases labelled for detection—explicit `super` dispatch and a composed-modifier chain exceeding the evidence allowance—remained explicitly incomplete. No expected-positive case returned complete and clean. All 79 evidence spans matched; this does **not** mean 26 successful detections or production accuracy.

Review subsequently found two development gaps outside those frozen cases: eagerly evaluating a short-circuited authorization helper, and propagating storage mutation roots into a memory formal. Corrections retain skipped branches and distinguish reference-copy locations while preserving scalar authority provenance. Their new regression cases are disclosed development tests, not held-out measurements.

Three actual local Foundry witnesses passed: vulnerable callback withdrawal, fixed rejection with preservation, and a paired 128-run fuzz property. In the concrete vulnerable run a participant deposited 1 ETH and received 4 ETH; the fixed run returned that participant's 1 ETH while preserving the other participant's 5 ETH. Those are isolated EVM fixture balances. There was no fork, RPC or live transaction.

## Final local acceptance

The reviewed release SHA-256 is `dbf3fb31b96d7a33b6972ca110fd7d5980e03272ef6f3af38d0ee2d08497a7d3`. It preserves the frozen-pack results above after both disclosed corrections. **38 Rust tests** passed with the native compiler tests enabled, along with strict Clippy, formatting and release build. **23 Forge tests**, frontend builds, manifest validation and authenticated Forge lint passed. Twelve current bundles regenerate byte-for-byte. Schema validation covered 40 current/historical bundles, 149 standalone reports and seven SARIF files.

The [validation manifest](../reports/benchmarks/native-effects/validation.json) links exact final evidence; [the independent review](../reports/benchmarks/native-effects/reviewer/REVIEW.md) retains both the initial result and correction chronology. Frozen reviewer sources are available under [fixtures/effect-review](../fixtures/effect-review/README.md). Five independent report-import checks passed, including rejection of incomplete rescans and altered hashes/fingerprints. The separate [live tenant acceptance](acceptance-native-effects-cs0lutions-2026-11-14.md) completed KAN-4 with verification comment 10003 on development app 2.9.0 and retained the result after reload.

The local dashboard also completed keyboard-activated draft creation and fixed rescan with engine 0.1.4. Its draft is explicitly local and has no Jira issue behind it. [Observed local result](evidence/local-effects-engine-fixed.png). This was a focused interaction check, not a comprehensive assistive-technology audit.

## Reproduce

Use an installed native Solidity 0.8.26 compiler:

```sh
cargo build --release --workspace
OMNIGUARD_TEST_SOLC=/path/to/native/solc cargo test --workspace -- --include-ignored
python3 scripts/validate-effect-challenges.py \
  --binary target/release/omniguard --solc /path/to/native/solc \
  --output /tmp/omniguard-effect-results
forge test --offline --root fixtures/effect-tests --use /path/to/native/solc
```

The challenge validator verifies frozen source hashes, saves raw reports in a new directory and checks exact supported labels, incomplete states and source evidence independently. Its output directory must not already exist. Here `forge` means Foundry; the Atlassian Forge package remains separate.

Generate the Jira pair using `npm run reports:generate -- --solc /path/to/native/solc` in `integrations/atlassian-forge`. Import `reports/effects-vulnerable.omniguard.json` to review the finding, then `reports/effects-fixed.omniguard.json` under the same engine/compiler profile to verify it. Historical 0.1.0–0.1.3 profiles remain readable and cannot be verified silently by a newer profile.

## Bounds

Expansion is limited to depth 8, 64 paths, 4,096 effect steps per entry, 65,536 steps per snapshot, 128 interactions per path, 256 emitted findings per entry and eight related evidence spans. Diagnostic output is capped at twenty with an explicit notice when additional limitations are omitted. Exhaustion or unresolved effects make the report incomplete and block Jira creation/verification.

Virtual/function-pointer dispatch, recursion, unsupported helper-return provenance, unresolved storage roots, implicit receiver binding and assembly remain incomplete where encountered. Loop modeling tracks syntactic iteration/order; it does not prove arbitrary loop invariants or path feasibility. There is no cross-transaction authority-integrity proof, general lock verification or guarantee against every attack. Selected-source/remapping restrictions from the [compiler guide](compiler-analysis.md) still apply. The separate multi-chain MCP's lexical indicators are not this semantic engine.

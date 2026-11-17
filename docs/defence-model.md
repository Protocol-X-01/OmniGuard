# Solidity defence model

Reviewed 16 November 2026 against OmniGuard engine **0.1.4**, rule set `solidity-core/2026.11`, source revision `81dcf1dad84eea16b0bf676a20cd67a4af0db50e`.

This model combines the requested research into a coverage register for the Solidity/EVM layer. It maps the twelve existing rules and defines work still needed; it adds no detector or runtime capability. The separate [team entry-point model](team-entry-points.md) covers incident intake, ownership and team interactions.

Every entry point needs an owner, a defined check, evidence and a visible coverage status. A category name alone supplies none of these. The roles below are proposed responsibilities; assignment to a person or team remains **unassigned**.

## Research basis

- [Dedaub's Solidity security guide](https://dedaub.com/blog/solidity-security-vulnerabilities/) informs the modern protocol categories, including authorization, oracle dependencies, upgrades, signatures and accounting.
- [The HackerNoon taxonomy](https://hackernoon.com/smart-contract-security-a-taxonomy-of-vulnerabilities-attacks-and-defenses) contributes the state-transition and invariant perspective. Its illustrative properties require validation against each protocol and the applicable standard.
- [Sigma Prime's Solidity security catalogue](https://sigmaprime.io/blog/solidity-security/) contributes historical failure patterns and edge cases. It was published in 2018, so examples need explicit compiler and EVM version checks.

These are research inputs, not executable specifications. Language and protocol claims below are checked against Solidity documentation and Ethereum standards. The coverage mapping is our assessment of the current [Rust rule registry](../crates/omniguard-core/src/rules.rs), rather than a claim made by the articles.

## Coverage register

**Partial** means a specific pattern has an implemented check, while the wider security property remains unproven. **Uncovered** means no corresponding general detector exists. **Version conditional** requires a compiler/fork profile before a historical pattern is applicable. No family below is claimed fully covered.

Evidence keys: **R** = [rule definitions and limits](rules.md); **C** = [authored positive, fixed and negative corpus](../fixtures/rule-corpus/manifest.json) and its [assertions](../crates/omniguard-core/tests/corpus.rs); **S** = [compiler regression assertions](../crates/omniguard-core/tests/compiler.rs); **E** = [ordered-effect regression assertions](../crates/omniguard-core/tests/native_effects.rs) and [frozen review](../fixtures/effect-review/README.md). These identify evidence assets; a fresh run receipt is required to claim a current pass.

| Family / entry points | Existing check | Status and defined next check | Evidence | Proposed owner role |
| --- | --- | --- | --- | --- |
| Authorization / privileged calls | `OG-SOL-001`, `005`, `006`: selected caller and authority patterns | Partial. Check role assignment, revocation, initialization and authority changes across calls. | R, C, S, E; [authority-anchor tests](../crates/omniguard-core/tests/guard_anchor.rs) | Semantic analysis maintainer |
| Reentrancy / external calls and callbacks | `OG-SOL-002`: storage writes following external calls | Partial. Check cross-contract and read-only reentrancy; establish guard behavior and reachable call paths. | R, C, S, E | Semantic analysis maintainer |
| Failure handling / value and token transfers | `OG-SOL-003`, `004`, `010`: discarded low-level, send and declared-bool token results | Partial. Check failure propagation, token hooks and nonstandard token behavior. | R, C, S | Detector maintainer |
| Delegate execution / proxy administration | `OG-SOL-005`: selected caller-derived delegate target without a recognized prior caller restriction | Partial. Check implementation control, initialization and storage layout compatibility. | R, C, S, E | Semantic analysis maintainer |
| Destructive actions and unexpected Ether | `OG-SOL-006`, `011`: selected selfdestruct authorization and exact balance comparisons | Partial, with fork conditions. Check balance-accounting independence and actual opcode semantics. | R, C, E | Detector maintainer |
| Accounting / deposits, credits and withdrawals | `OG-SOL-007`, `011`: repeated whole-msg.value credits and exact Ether balance tests | Partial. Specify conservation, solvency and share conversion properties for each protocol. | R, C; protocol properties absent | Protocol reviewer |
| Entropy and timing / selection and settlement | `OG-SOL-008`: block-derived modulo selection | Partial. Check entropy provenance, timestamp tolerance and settlement assumptions. | R, C, S | Detector maintainer |
| Encoding / hashes and signatures | `OG-SOL-009`: packed hashing of multiple dynamic strings or byte arrays | Partial for hash ambiguity. Replay, nonce consumption, expiry and signing-domain checks are uncovered. | R, C, S | Detector maintainer |
| Availability / payouts and queues | `OG-SOL-012`: reverting Ether transfers inside loops | Partial. Check bounded progress, adversarial recipients and resource limits. | R, C | Protocol reviewer |
| Oracles / prices and external observations | No general check | Uncovered. Define freshness, units, confidence, fallback and manipulation-resistance requirements. | No implemented check or acceptance receipt | Protocol reviewer |
| Arithmetic / casts, unchecked blocks and rounding | No general check | Uncovered. Check bounds, signedness, conversion loss and protocol-specific rounding direction. | No implemented check or acceptance receipt | Detector maintainer |
| Transaction ordering / submissions and settlement | No general check | Uncovered. Define acceptable outcomes under reordered actions and adversarial intermediate states. | No implemented check or acceptance receipt | Protocol reviewer |
| Dependencies / external addresses and trusted wiring | No general check | Uncovered. Verify intended code identity, configuration authority and dependency assumptions. Pinned source hashes establish identity only. | No implemented trust-property check | Protocol reviewer |
| Historical language / constructors, visibility, storage pointers and ABI handling | No version-specific detector suite | Version conditional and uncovered. Build compiler-version positive and negative cases before enabling a rule. | No accepted version matrix | Compiler compatibility maintainer |
| Protocol state machine / all public transitions | No general invariant engine | Uncovered. Define allowed transitions, conservation, authorization and liveness properties, then check sequences. | No implemented general invariant engine | Protocol reviewer |

## Version and specification gates

1. **Arithmetic:** Solidity 0.8 normally reverts on arithmetic overflow or underflow; `unchecked` blocks change that behavior. Historical wraparound examples cannot be applied indiscriminately. Casts and rounding need separate reasoning. [Solidity 0.8 breaking changes](https://docs.soliditylang.org/en/latest/080-breaking-changes.html).
2. **Selfdestruct:** on EVM forks implementing EIP-6780, an existing contract generally retains code and storage while transferring its balance; creation and destruction in the same transaction is the exception. Record the actual deployment fork before judging impact. [EIP-6780](https://eips.ethereum.org/EIPS/eip-6780).
3. **Tokens:** `allowance <= balance` is not a universal ERC-20 invariant. Approval authorizes a spending amount independently of the owner's current balance. Do not adopt the taxonomy's example as a generic vulnerability rule. Return-value handling remains a distinct requirement. [ERC-20](https://eips.ethereum.org/EIPS/eip-20).
4. **Signatures:** EIP-712 defines typed hashing and domain separation, but does not itself provide replay protection. Define nonce, expiry and replay behavior for each application. [EIP-712](https://eips.ethereum.org/EIPS/eip-712).
5. **Reentrancy:** effects can cross function and contract boundaries. A recognized modifier or the presence of checks-effects-interactions is not a proof of whole-program safety. [Solidity security considerations](https://docs.soliditylang.org/en/v0.8.35/security-considerations.html).

## Evidence and reporting contract

Maintain two independent states: the capability status above and the completeness of a particular run. The existing `coverage.complete` field says whether the selected engine/rules completed their modeled analysis on the listed files. It does not measure every vulnerability family, reachability or exploitability. Source and compiler modes can produce different results.

For each reviewed entry point, record:

- The asset, callable entry point, trust assumptions and intended property.
- The assigned owner, exact check or manual method, and explicit exclusions.
- Source and dependency hashes; engine, rules, analysis mode, compiler, compiler settings and EVM fork.
- Positive/fixed/negative fixture identities, validation command, dated receipt and unresolved limitations.
- Current capability status, run completeness, alert disposition and next review action.

This is the target review-record format, not a claim that every field is already implemented in JSON, SARIF or Forge. The current report schema and UI must not imply coverage beyond their actual fields.

An alert remains a candidate until review establishes the affected property, relevant assumptions and impact. `evidence.validated` checks the source binding, spans and excerpts; it does not validate an exploit. A zero-alert result with incomplete analysis remains incomplete. Diagnostic truncation must remain visible, including the count of additional limitations. A stronger baseline cannot be verified with a weaker or incomplete rescan; see the existing [CLI and workflow contract](cli-and-analysis.md).

## Validation and next implementation work

Soundness is a property to investigate, not an assumption that removes testing. Keep authored vulnerable/fixed pairs, negative controls, source-tampering checks and compiler-version regressions. Add local stateful properties only when their protocol assumptions are defined and their execution is within the selected scope. The model needs no live-chain transactions.

The [combined contract lab](../fixtures/combined-defence/README.md) now provides a concrete baseline: one vulnerable contract contains twelve supported patterns and ten known gaps, with a corrected counterpart. On 16 November 2026, both scan modes detected all twelve expected rule/function pairs and returned zero alerts on the corrected counterpart. All 22 paired behaviour witnesses and two 128-run fuzz properties passed locally. The ten gap cases were demonstrated by execution but remained undetected by the scanner. The strict all-case gate therefore returns 1. [Measurement and evidence](../reports/benchmarks/combined-defence/2026-11-16/SUMMARY.md).

The existing tests can run offline once the locked dependencies and native compiler are installed:

```sh
cargo test --locked --offline -p omniguard-core --test corpus
OMNIGUARD_TEST_SOLC=/path/to/native/solc-0.8.26 \
  cargo test --locked --offline -p omniguard-core --test compiler -- --include-ignored
```

The compiler regression suite explicitly expects 0.8.26. That test baseline does not prohibit scanning supported source with another native 0.8.x compiler; such a run must retain its own profile and receipt. These tests exercise OmniGuard's synthetic fixtures, not a production deployment.

Prioritize these scoped changes before claiming broader protection:

1. Model or explicitly report virtual/helper dispatch, implicit receivers and assembly effects; preserve unknown effects through composed modifiers and imported code. Add independent cases before changing inference.
2. Make every analysis limit, including truncated diagnostics, understandable in the report-to-review workflow. Never convert an unsupported case into a passing result.
3. Choose one uncovered property at a time, define its compiler/fork assumptions, add positive/fixed/negative controls and independent review cases, then implement and measure it.

The frozen native-effect review records 24/26 exact expected outcomes and six incomplete reports. That is historical fixture evidence, not production precision or recall, and does not justify skipping validation. [Review record](../fixtures/effect-review/README.md).

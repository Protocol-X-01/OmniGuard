# OmniGuard 0.1.4 rule reference

Rule set: `solidity-core/2026.11`. **12 rules**. Generated from the Rust registry with `python3 scripts/generate-rule-docs.py`.

Coverage means the named rules were attempted on the listed input files. It does not establish whole-program semantic coverage, reachability, exploitability or safety. Source mode uses scoped AST facts. Optional native-solc mode adds declaration identities and bounded ordered effects through direct helpers, storage aliases and imported modifiers for rules002/005/006. Unsupported or exhausted effects make coverage incomplete; general path feasibility, arbitrary dispatch and whole-program vulnerability verification remain outside the model.

| Rule | Category | Severity | Confidence | Detection |
| --- | --- | --- | --- | --- |
| OG-SOL-001 | authorization | high | high | Authorization uses tx.origin |
| OG-SOL-002 | reentrancy | high | medium | State write follows an external call |
| OG-SOL-003 | external-calls | medium | high | Low-level call result is not checked |
| OG-SOL-004 | external-calls | medium | high | Ether send result is discarded |
| OG-SOL-005 | code-execution | high | high | Caller controls a delegatecall target |
| OG-SOL-006 | authorization | high | medium | Selfdestruct lacks a local caller restriction |
| OG-SOL-007 | accounting | high | medium | Loop repeatedly credits the full msg.value |
| OG-SOL-008 | randomness | medium | high | Block-derived array selection |
| OG-SOL-009 | encoding | high | high | Packed hash combines dynamic inputs |
| OG-SOL-010 | token-handling | medium | high | Token operation boolean is discarded |
| OG-SOL-011 | accounting | medium | medium | Strict equality on contract Ether balance |
| OG-SOL-012 | availability | medium | medium | Reverting Ether transfer inside a loop |

## OG-SOL-001 — Authorization uses tx.origin

tx.origin participates in a condition that can gate execution.

Remediation: Use msg.sender with an explicit role or ownership check, then add an access-control test.

Limits: Recognizes require/assert conditions and if conditions; does not prove the surrounding policy.

[Primary reference](https://docs.soliditylang.org/en/latest/security-considerations.html#tx-origin)

## OG-SOL-002 — State write follows an external call

An external interaction precedes a write to this contract's storage on a modeled execution path.

Remediation: Apply checks-effects-interactions and verify a reentrancy guard with a local regression test.

Limits: Ordering indicator, not exploit proof. Source mode is local; solc mode follows bounded direct helpers, storage aliases and modifiers. Dynamic dispatch, unresolved effects and exhausted bounds are incomplete; reentrancy-lock safety is not proven.

[Primary reference](https://docs.soliditylang.org/en/latest/security-considerations.html#reentrancy)

## OG-SOL-003 — Low-level call result is not checked

An address call/delegatecall/staticcall result is discarded, or its captured success flag is unused.

Remediation: Capture and enforce the success flag, or explicitly return it to a caller that handles failure.

Limits: An observed use is not proof of correct failure handling; complex data-flow is not resolved.

[Primary reference](https://docs.soliditylang.org/en/latest/units-and-global-variables.html#members-of-address-types)

## OG-SOL-004 — Ether send result is discarded

The boolean from an address send operation is discarded.

Remediation: Handle failed delivery explicitly; prefer a pull-payment design when recipients can reject Ether.

Limits: Requires a locally resolved address receiver; imported or aliased types may remain unknown.

[Primary reference](https://docs.soliditylang.org/en/latest/security-considerations.html#sending-and-receiving-ether)

## OG-SOL-005 — Caller controls a delegatecall target

An externally callable path delegates to a caller-derived target without a recognized preceding caller restriction.

Remediation: Use a trusted implementation target and enforce the intended caller/upgrade policy before delegation.

Limits: Source mode tracks local parameters and aliases. Solc mode additionally binds direct helper arguments, storage roots and imported modifiers with bounded ordered effects. No global role-integrity proof; unresolved dispatch or effect limits are incomplete.

[Primary reference](https://docs.soliditylang.org/en/latest/security-considerations.html#authorized-proxies)

## OG-SOL-006 — Selfdestruct lacks a local caller restriction

An externally callable path contains selfdestruct without a recognized preceding caller restriction.

Remediation: Remove the operation or enforce the intended caller policy and test unauthorized calls locally.

Limits: Modern EVMs generally transfer the balance without deleting existing code; fork and creation-time semantics vary.

[Primary reference](https://docs.soliditylang.org/en/latest/units-and-global-variables.html#contract-related)

## OG-SOL-007 — Loop repeatedly credits the full msg.value

A loop writes the whole msg.value into storage on each iteration.

Remediation: Compute and validate a per-item allocation before the loop, or require a single recipient per payment.

Limits: Tracks direct writes and unmodified local aliases; does not infer protocol accounting invariants.

[Primary reference](https://github.com/crytic/slither/wiki/Detector-Documentation#msgvalue-inside-a-loop)

## OG-SOL-008 — Block-derived array selection

A block-derived value is used in modulo arithmetic to choose an array index.

Remediation: Use an appropriate verifiable randomness or commit/reveal design with an explicit adversary model.

Limits: Direct expressions and unmodified local aliases; no interprocedural or cryptographic proof.

[Primary reference](https://docs.soliditylang.org/en/latest/units-and-global-variables.html#block-and-transaction-properties)

## OG-SOL-009 — Packed hash combines dynamic inputs

A hash uses packed encoding of two or more locally resolved string/bytes values, leaving input boundaries ambiguous.

Remediation: Use abi.encode with explicit types and domain separation for the intended hash or signature protocol.

Limits: Currently resolves string/bytes declarations in the same source; purpose and downstream authorization are not inferred.

[Primary reference](https://docs.soliditylang.org/en/latest/abi-spec.html#non-standard-packed-mode)

## OG-SOL-010 — Token operation boolean is discarded

A transfer/transferFrom/approve operation declared to return bool is used without its result.

Remediation: Use a compatible SafeERC20 wrapper or enforce the token's return value and test failure behavior.

Limits: Source mode requires an unambiguous in-file interface; compiler mode uses the selected declaration across supplied files and overloads. Method names alone do not imply ERC-20 behavior.

[Primary reference](https://eips.ethereum.org/EIPS/eip-20)

## OG-SOL-011 — Strict equality on contract Ether balance

A condition requires this contract's Ether balance to equal an exact value.

Remediation: Track internal accounting explicitly and avoid relying on an exact external Ether balance.

Limits: Flags a fragile invariant, not a proven denial of service; intended accounting needs manual review.

[Primary reference](https://docs.soliditylang.org/en/latest/security-considerations.html#sending-and-receiving-ether)

## OG-SOL-012 — Reverting Ether transfer inside a loop

A payable-address transfer in a loop lets a rejecting recipient revert the whole batch.

Remediation: Use independently claimable payments or isolate recipient failures without losing accounting correctness.

Limits: Does not establish loop bounds, recipient trust or protocol-level impact.

[Primary reference](https://docs.soliditylang.org/en/latest/security-considerations.html#gas-limit-and-loops)

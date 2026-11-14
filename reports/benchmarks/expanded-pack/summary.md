# Expanded rule pack: controlled corpus results

Cases: **60**. Corpus SHA-256: `d676105fb39f00ca65872b399b46f382036b6c866ac2d405be077be72a319674`.

Case/rule pattern agreement on an authored synthetic corpus. Slither policies differ; these are not general vulnerability precision estimates or a superiority ranking.

One local invocation. Slither includes its compiler/build pipeline; timings are not an equivalent workload ranking.

| Rule | OmniGuard TP / FP / FN | Slither pattern agreement TP / FP / FN | Slither detector |
| --- | --- | --- | --- |
| OG-SOL-001 | 1 / 0 / 0 | 1 / 1 / 0 | tx-origin |
| OG-SOL-002 | 1 / 0 / 0 | 1 / 0 / 0 | reentrancy-eth |
| OG-SOL-003 | 4 / 0 / 0 | 2 / 0 / 2 | unchecked-lowlevel |
| OG-SOL-004 | 1 / 0 / 0 | 1 / 0 / 0 | unchecked-send |
| OG-SOL-005 | 5 / 0 / 0 | 5 / 3 / 0 | controlled-delegatecall |
| OG-SOL-006 | 6 / 0 / 0 | 2 / 0 / 4 | suicidal |
| OG-SOL-007 | 2 / 0 / 0 | 1 / 1 / 1 | msg-value-loop |
| OG-SOL-008 | 2 / 0 / 0 | 2 / 1 / 0 | weak-prng |
| OG-SOL-009 | 1 / 0 / 0 | 1 / 1 / 0 | encode-packed-collision |
| OG-SOL-010 | 1 / 0 / 0 | 1 / 0 / 0 | unchecked-transfer |
| OG-SOL-011 | 1 / 0 / 0 | 1 / 0 / 0 | incorrect-equality |
| OG-SOL-012 | 1 / 0 / 0 | 1 / 0 / 0 | calls-loop |

Exact OmniGuard case mismatches: **0**. One-run elapsed: OmniGuard 7.53 ms; Slither 1071.46 ms.

## Per-case evidence

| Case | Expected | OmniGuard | Slither mapped |
| --- | --- | --- | --- |
| positive/rule_001_vulnerable.sol | OG-SOL-001 | OG-SOL-001 | OG-SOL-001 |
| fixed/rule_001_fixed.sol | none | none | none |
| positive/rule_002_vulnerable.sol | OG-SOL-002 | OG-SOL-002 | OG-SOL-002 |
| fixed/rule_002_fixed.sol | none | none | none |
| positive/rule_003_vulnerable.sol | OG-SOL-003 | OG-SOL-003 | OG-SOL-003 |
| fixed/rule_003_fixed.sol | none | none | none |
| positive/rule_004_vulnerable.sol | OG-SOL-004 | OG-SOL-004 | OG-SOL-004 |
| fixed/rule_004_fixed.sol | none | none | none |
| positive/rule_005_vulnerable.sol | OG-SOL-005 | OG-SOL-005 | OG-SOL-005 |
| fixed/rule_005_fixed.sol | none | none | OG-SOL-005 |
| positive/rule_006_vulnerable.sol | OG-SOL-006 | OG-SOL-006 | OG-SOL-006 |
| fixed/rule_006_fixed.sol | none | none | none |
| positive/rule_007_vulnerable.sol | OG-SOL-007 | OG-SOL-007 | OG-SOL-007 |
| fixed/rule_007_fixed.sol | none | none | none |
| positive/rule_008_vulnerable.sol | OG-SOL-008 | OG-SOL-008 | OG-SOL-008 |
| fixed/rule_008_fixed.sol | none | none | none |
| positive/rule_009_vulnerable.sol | OG-SOL-009 | OG-SOL-009 | OG-SOL-009 |
| fixed/rule_009_fixed.sol | none | none | none |
| positive/rule_010_vulnerable.sol | OG-SOL-010 | OG-SOL-010 | OG-SOL-010 |
| fixed/rule_010_fixed.sol | none | none | none |
| positive/rule_011_vulnerable.sol | OG-SOL-011 | OG-SOL-011 | OG-SOL-011 |
| fixed/rule_011_fixed.sol | none | none | none |
| positive/rule_012_vulnerable.sol | OG-SOL-012 | OG-SOL-012 | OG-SOL-012 |
| fixed/rule_012_fixed.sol | none | none | none |
| negative/origin_in_message.sol | none | none | OG-SOL-001 |
| negative/origin_in_event.sol | none | none | none |
| negative/cross_contract_state.sol | none | none | none |
| negative/local_shadowing.sol | none | none | none |
| negative/storage_name_in_index.sol | none | none | none |
| negative/custom_method_names.sol | none | none | none |
| negative/resolved_owner_modifier.sol | none | none | OG-SOL-005 |
| negative/overwritten_delegate_target.sol | none | none | OG-SOL-005 |
| negative/disjoint_branches.sol | none | none | none |
| negative/deadline_only.sol | none | none | none |
| negative/packed_static.sol | none | none | none |
| negative/packed_one_dynamic.sol | none | none | none |
| negative/value_loop_check_only.sol | none | none | none |
| negative/value_loop_scaled.sol | none | none | OG-SOL-007 |
| negative/address_transfer_outside_loop.sol | none | none | none |
| negative/guarded_revert.sol | none | none | none |
| positive/delegate_alias.sol | OG-SOL-005 | OG-SOL-005 | OG-SOL-005 |
| positive/guard_after_sink.sol | OG-SOL-006 | OG-SOL-006 | none |
| positive/noop_modifier.sol | OG-SOL-005 | OG-SOL-005 | OG-SOL-005 |
| positive/guard_or_bypass.sol | OG-SOL-005 | OG-SOL-005 | OG-SOL-005 |
| positive/nested_guard_not_dominating.sol | OG-SOL-006 | OG-SOL-006 | none |
| positive/captured_success_unused.sol | OG-SOL-003 | OG-SOL-003 | none |
| positive/staticcall_discarded.sol | OG-SOL-003 | OG-SOL-003 | OG-SOL-003 |
| positive/modifier_guard_after_placeholder.sol | OG-SOL-006 | OG-SOL-006 | none |
| positive/conditional_revert_not_guard.sol | OG-SOL-006 | OG-SOL-006 | none |
| negative/early_return_separates_write.sol | none | none | none |
| positive/unused_success_shadowed_use.sol | OG-SOL-003 | OG-SOL-003 | none |
| positive/block_index_alias.sol | OG-SOL-008 | OG-SOL-008 | OG-SOL-008 |
| positive/payment_alias_loop.sol | OG-SOL-007 | OG-SOL-007 | none |
| negative/overwritten_block_index.sol | none | none | OG-SOL-008 |
| negative/address_prefixed_contract_type.sol | none | none | none |
| negative/shadowed_selfdestruct_function.sol | none | none | none |
| positive/shadowed_require_is_not_guard.sol | OG-SOL-006 | OG-SOL-006 | OG-SOL-006 |
| positive/contract_typed_delegate_target.sol | OG-SOL-005 | OG-SOL-005 | OG-SOL-005 |
| negative/callee_ignores_block_argument.sol | none | none | none |
| negative/shadowed_hash_function.sol | none | none | OG-SOL-009 |

## Versions

omniguard:
```text
omniguard 0.1.1
```

slither:
```text
0.11.6
```

solc:
```text
solc, the solidity compiler commandline interface
Version: 0.8.26+commit.8a97fa7a.Linux.g++
```

foundry:
```text
forge Version: 1.8.4
Commit SHA: 50af4efe189dc64bad2b75ed6990b835de66c4ae
Build Timestamp: 2026-10-01T14:08:28.191932892Z (1790863708)
Build Profile: dist
```

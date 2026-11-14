# Analyzer depth milestone — 13 November 2026

The user prioritized useful detection depth before release media or submission packaging. The live Jira workflow is proven; the next milestone expands and measures the independent scanner. The project goal remains active.

## First expanded pack

| Rule | Detection focus | Required context |
| --- | --- | --- |
| OG-SOL-001 | tx.origin in a real authorization condition | First require/assert argument or if condition; exclude diagnostic strings |
| OG-SOL-002 | Low-level call followed by a state write | Resolve the current contract, local shadowing and storage root |
| OG-SOL-003 | Unchecked low-level call result | Discarded result or captured success flag with no subsequent use |
| OG-SOL-004 | Discarded address.send result | Resolve address receiver; exclude user-defined send methods |
| OG-SOL-005 | Caller-controlled delegatecall target | Address parameter/local flow, externally callable function, locally checked caller guards |
| OG-SOL-006 | Unguarded selfdestruct balance transfer | Externally callable path and dominating caller restriction; account for modern EVM semantics |
| OG-SOL-007 | Repeated msg.value state credit inside a loop | State assignment and direct, unscaled msg.value use in the loop body |
| OG-SOL-008 | Block-derived array selection | Environment value flows into a modulo selection index; exclude ordinary deadlines |
| OG-SOL-009 | Packed hash with multiple dynamic inputs | Resolve string/bytes inputs to abi.encodePacked inside a hash |
| OG-SOL-010 | Ignored token-operation boolean | Resolve an in-source interface signature; exclude Ether transfer and void methods |
| OG-SOL-011 | Strict equality on this contract's Ether balance | AST equality involving address(this).balance |
| OG-SOL-012 | Reverting Ether transfer in a loop | Resolve payable-address receiver and enclosing loop |

Each rule needs an isolated vulnerable case, a matching remediation, negative controls, machine-readable metadata, source references and stated limitations. Type/guard resolution must be conservative; a modifier's name alone cannot establish authorization. Add related source spans where the finding depends on a parameter, declaration or later state write.

## Evidence and compatibility

Engine 0.1.1 will emit report schema v2 with explicit rule/input coverage and contextual/related evidence. Keep the schema v1 and 0.1.0 bundles as historical acceptance artifacts. Forge must validate both versions, compare rescans only under matching engine/rule coverage, and display the actual rule count. Generate the current catalog from the Rust CLI instead of maintaining a second list by hand.

Directory traversal failures and empty inputs must produce incomplete scans, never a successful clean result. A complete parse/input scan does not imply whole-program semantic coverage or proven exploitability.

## Measurement

Use a labelled, synthetic Solidity corpus with compiler validation. Report per-rule true/false positives and negatives against the case manifest; include the entire output, not just headline counts. Run the installed Slither version on the same corpus and record version, selected detector mapping, output and elapsed time. This is a controlled pattern benchmark, not evidence of general superiority over Slither or dynamic analyzers.

The next deeper stages are compiler-resolved symbols/imports, a control-flow and value-flow model, framework-specific models, and local property/invariant witnesses. Their acceptance criteria should follow measured misses and false positives from this pack.

## Implemented during this milestone

The 12-rule engine is implemented as version 0.1.1 with report schema v2. The corpus grew to 60 compilable cases as additional shadowing and guard cases were found. Added a complete executable vault pair and six Foundry witnesses (including two 128-case fuzz properties), native Rust source-bundle export and complete file digest snapshots. See `docs/rule-pack-results.md` and the raw benchmark artifacts. Compiler-resolved whole-program semantics remain the next depth stage.

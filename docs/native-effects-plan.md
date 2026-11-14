# Native effect analysis — implementation contract

14 November 2026. This stage addresses independently reproduced compiler-mode misses in engine 0.1.3: inherited no-op modifiers suppressing unrestricted delegation, writes through local storage references, and external interactions hidden in internal helpers. The original goal remains scan → validated evidence → Jira remediation → matching fixed rescan, with an independent Rust core and isolated fixtures.

## Required behavior

1. Use native solc declaration identities and exact selected-source snapshots to represent function/modifier definitions, storage roots, aliases and ordered effects. Independently author the implementation; no external analyzer wrapper or copied analyzer source.
2. Track local storage-reference aliases through declarations and direct reassignment, retaining the difference between storage references and memory values. A write through a storage alias after an external interaction must be visible to OG-SOL-002; moving that write before the interaction must remove this ordering indicator.
3. Resolve inherited/imported modifiers by compiler identity. A no-op or irrelevant modifier is not an authorization gate. Recognize only implemented, correctly ordered caller restrictions on the relevant value. Unknown modifier semantics must be visible as an analysis limitation rather than accepted as proof of authorization.
4. Propagate resolved internal/private helper effects into the calling function, including the actual interaction and later storage write. Bind arguments to compiler parameter identities. Preserve source order and structurally exclusive/terminated paths. Do not treat external calls, unresolved function pointers or virtual dispatch as statically resolved merely because an AST contains a declaration ID.
5. Bound expansion and expose recursive, unresolved or exhausted analysis as diagnostics/incomplete coverage where it affects the supported checks. A limit must not become a complete clean report. Bounded static findings remain indicators; their source binding is distinct from an execution witness.
6. Preserve exact primary and related source hashes/UTF-8 spans, including helper/modifier declarations and cross-file call chains. Choose finding locations that keep separate caller sites distinct. Report generation must remain deterministic and accepted by the independent Forge validator.

## Validation and delivery

- Preserve source-mode behavior and the existing corpus, compiler challenges and guard regressions, except for a specifically explained correctness change.
- Author and freeze an independent compiler-valid challenge set before applying the new engine. Include vulnerable/fixed pairs, misleading modifier names, stable/poisoned guards, aliases, helper calls, branch ordering, inherited declarations and unsupported call/recursion cases. Count unsupported results separately. Once a case is used to tune the engine it is a development case, not held-out accuracy evidence.
- Add an isolated complete vulnerable/fixed helper-vault pair and real local Foundry witnesses, including failure oracles and fixed regressions. Use no fork, RPC, account key or live transaction.
- Retain the twelve existing rule IDs unless a new class is justified. Version the changed analysis separately from 0.1.3. Preserve old exact report bundles and historical Jira baselines.
- Validate Rust tests/lint/release, independent adversarial cases, local EVM witnesses, report schemas, evidence tampering and Forge profile compatibility. Repeat a meaningful current-profile fixture remediation flow after deployment.

## Explicit bounds

This stage does not claim whole-program verification, arbitrary dynamic/virtual dispatch resolution, inferred protocol invariants, all modifier compositions, arbitrary assembly semantics or global role integrity across transactions. Those gaps must remain visible and must not be converted into authorization facts. Broader non-Solidity semantic frontends remain part of the adaptation roadmap; the separate MCP's lexical coverage is not evidence that these deeper analyses already exist there.

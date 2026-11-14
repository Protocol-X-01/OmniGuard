# Compiler facts: controlled challenge results

Engine **0.1.2**. Native compiler **0.8.26+commit.8a97fa7a.Linux.g++**. Challenge SHA-256 `9465ea692cd7bcfbeaa2e742197c27ec0829109894c81103dcd82e24e0e02ebb`.

Authored challenge cases frozen before compiler integration; once used for implementation, these are development cases, not an independent held-out accuracy estimate.

| Challenge | Expected | Source mode | Compiler-assisted mode |
| --- | --- | --- | --- |
| ImportedToken.sol | OG-SOL-010 | none | OG-SOL-010 |
| OverloadedToken.sol | OG-SOL-010 | none | OG-SOL-010 |
| InheritedState.sol | OG-SOL-002 | none | OG-SOL-002 |
| FixedState.sol | none | none | none |
| ImportedVoid.sol | none | none | none |
| ImportedStruct.sol | OG-SOL-009 | none | OG-SOL-009 |
| InheritedValue.sol | OG-SOL-007 | none | OG-SOL-007 |
| InheritedShadow.sol | none | none | none |

Exact challenge mismatches: source **5**, compiler-assisted **0**. Existing **60**-case corpus under compiler mode: **0** mismatches.

These are authored development examples. They do not establish production accuracy or superiority over another analyzer. Compiler resolution improves declaration/type identity; the vulnerability rules still use bounded local reasoning.

Reproduce: `python3 scripts/benchmark-compiler.py --solc /path/to/native/solc`. Raw reports and per-case outcomes are beside this file.

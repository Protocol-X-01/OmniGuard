# Isolated detector corpus

All contracts here were authored for OmniGuard. They are small pattern tests, with expected rules and rationale in `manifest.json`. They are not production implementations. Positive cases intentionally contain risky patterns. Fixed cases remove the named pattern; their protocol assumptions still need real application design and tests.

The corpus currently contains 60 files: 12 primary positive/fixed pairs, extra adversarial positives and negative controls. It tests contract scoping, shadowing, method types, caller-guard placement, disjoint/terminated branches and local value aliases. It compiles with Solidity 0.8.26. Warnings in the intentionally vulnerable and adversarial cases are expected.

Run `cargo test --workspace` for exact finding/evidence expectations. Run `python3 scripts/benchmark.py` from the repository root to evaluate OmniGuard and Slither against the same labels; explicit tool path options are available. Raw reports and per-case outcomes are saved under `reports/benchmarks/expanded-pack/`.

The benchmark measures agreement with authored pattern labels. It does not measure general exploit detection accuracy, adversarial robustness across real projects, or superiority to any analyzer. Different Slither detector policies can intentionally flag broader or narrower conditions.

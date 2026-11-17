# One contract, measurable detection

[The vulnerable DefenceLab](vulnerable/src/DefenceLab.sol) contains **22 labelled cases in one concrete contract**: one case for each of OmniGuard's twelve implemented rules and ten broader properties without a detector. Two in-file interfaces describe synthetic token/oracle inputs. The [corrected counterpart](fixed/src/DefenceLab.sol) is the paired control for those properties.

The [manifest](manifest.json) declares each entry point, intended property, expected rule or known gap, and named behaviour witness. These labels were authored before the first scan of this fixture. They are development acceptance cases, not an independent accuracy benchmark or an exhaustive vulnerability catalogue. Historical constructs rejected by Solidity 0.8.26 need separate compiler-specific fixtures.

## Recorded result

The [16 November 2026 measurement](../../reports/benchmarks/combined-defence/2026-11-16/SUMMARY.md) uses OmniGuard 0.1.4, native solc 0.8.26 and Cancun:

| Measurement | Result |
| --- | --- |
| Vulnerable contract, source mode | All 12 expected rules, each at its declared function |
| Vulnerable contract, compiler mode | All 12 expected rules, each at its declared function |
| Corrected contract, both modes | Zero alerts |
| Labelled broader properties | 10 undetected gaps in both modes |
| Behaviour witnesses | 22 paired cases passed on fresh instances |
| Additional property tests | 2 fuzz tests passed, 128 runs each |
| Rust core regression suite | 37 tests passed, zero failed or ignored |
| Source evidence | 19 source-mode and 26 compiler-mode primary/related spans verified |
| JSON, SARIF and compiler source bundles | Finding identity, source binding and analysis profiles matched |
| Strict all-case detection gate | Exit 1, as required while the ten gaps remain |

Both scan modes completed their **modeled rules**, with zero analysis diagnostics. That completion flag does not include the ten missing security properties. `summary.json` separately records `all_labelled_cases_detected: false`.

## Known gaps demonstrated by the lab

| Case | Entry point | Paired behaviour |
| --- | --- | --- |
| GAP-001 | `overflowAdd` | Unchecked overflow wraps; checked addition rejects it |
| GAP-002 | `narrowAmount` | Oversized input truncates; the width check rejects it |
| GAP-003 | `readPrice` | A stale observation is accepted; the freshness check rejects it |
| GAP-004 | `claimVoucher` | A valid voucher credits twice; consuming its nonce blocks reuse |
| GAP-005 | `changeOperator` | An outsider replaces the role value; the owner check rejects it |
| GAP-006 | `upgradeTo` | An outsider changes the subsequently executed implementation; the owner check rejects it |
| GAP-007 | `trade` | A changed price commits below the requested minimum; the output check rejects it |
| GAP-008 | `scaledShare` | Division before scaling loses a share; the bounded corrected arithmetic preserves it |
| GAP-009 | `issueCredit` | Credit is issued without backing; equal new payment is required by the correction |
| GAP-010 | `processQueue` | A growing all-at-once queue makes no progress under the test gas budget; bounded processing advances |

These are executable examples of the declared properties. Their test success establishes the vulnerable/fixed contrast, **not scanner detection**. The tests do not claim every deployment sharing a code pattern is exploitable.

## Reproduce

From the repository root, with the pinned Rust toolchain, native Solidity 0.8.26, Foundry and cached build dependencies:

```sh
cargo build --locked --offline --release -p omniguard-cli
python3 scripts/validate-combined-defence.py \
  --binary target/release/omniguard \
  --solc /path/to/native/solc-0.8.26 \
  --forge /path/to/forge \
  --output /tmp/omniguard-combined-review
```

Choose an output directory that does not already exist. The runner checks complete source inventories, source bytes, evidence spans, line/column coordinates, fingerprints, exact rule-to-function/count matches, corrected controls and JSON/SARIF/bundle consistency. It retains commands, hashes, raw results and a readable coverage matrix. With `--forge`, it also requires every named behaviour witness and both 128-run fuzz properties to pass. Without `--forge`, behaviour is explicitly `not_run`.

Default exit 0 means the declared detector regressions match; known gaps remain reported. Add **`--require-all`** to require detection of every labelled property; this currently returns **1**. Exit 2 means execution, evidence, report consistency or a behaviour witness failed. The [strict-gate receipt](../../reports/benchmarks/combined-defence/2026-11-16/strict-gate.json) confirms the incomplete coverage cannot pass that gate.

Run the Rust acceptance tests directly:

```sh
OMNIGUARD_TEST_SOLC=/path/to/native/solc-0.8.26 \
  cargo test --locked --offline -p omniguard-core --test combined_defence -- --include-ignored
```

Run just the behaviour witnesses:

```sh
forge test --offline --root fixtures/combined-defence --use /path/to/native/solc-0.8.26 -vv
```

No third-party Solidity dependencies, chain fork, RPC, account credentials or live transactions are required. Recorded local runs used a disabled network namespace. The signing key in the harness is a public synthetic constant; the test EVM supplies all balances. The origin-authorization witness uses an EOA owner and an actual forwarding contract. `SELFDESTRUCT` witnesses assert balance movement, not deletion of existing code. The selection correction uses explicit owner allocation, not a claim of secure randomness. Rounding fuzz properties use bounded inputs; this is not a production full-width `mulDiv` implementation.

## Reports and maintenance

- [Vulnerable compiler JSON](../../reports/benchmarks/combined-defence/2026-11-16/vulnerable.solc.json) / [SARIF](../../reports/benchmarks/combined-defence/2026-11-16/vulnerable.solc.sarif).
- [Corrected compiler JSON](../../reports/benchmarks/combined-defence/2026-11-16/fixed.solc.json) / [SARIF](../../reports/benchmarks/combined-defence/2026-11-16/fixed.solc.sarif).
- [Vulnerable source bundle](../../reports/benchmarks/combined-defence/2026-11-16/vulnerable.solc.bundle.json) / [corrected source bundle](../../reports/benchmarks/combined-defence/2026-11-16/fixed.solc.bundle.json) for the isolated-fixture workflow. No Jira import or deployment was performed by this measurement.
- [Machine-readable receipt](../../reports/benchmarks/combined-defence/2026-11-16/summary.json) / [Foundry results](../../reports/benchmarks/combined-defence/2026-11-16/foundry.json).
- [Rust core test receipt](../../reports/benchmarks/combined-defence/2026-11-16/rust-tests.json) / [full test output](../../reports/benchmarks/combined-defence/2026-11-16/rust-tests.txt).

The existing bundle/report schema carries engine-rule coverage, not this broader gap register. Keep the manifest and summary alongside any imported report. Zero corrected findings alone cannot establish complete security coverage.

CI runs the Rust source/native assertions and CLI report checks. Foundry behaviour witnesses were executed locally; the current CI step does not install or execute Foundry. When adding a detector, review the corresponding gap property, add independent variants/negative controls, update its explicit rule mapping and record a fresh measurement. Do not relabel a missed property as detected merely because an unrelated rule fires nearby. The [defence model](../../docs/defence-model.md) describes the wider capability boundaries and proposed owner roles.

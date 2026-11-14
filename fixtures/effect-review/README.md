# Independent native-effect review cases

These 26 synthetic cases and their labels were frozen before implementation evaluation. Preserve the exact source and manifest bytes. The final 0.1.4 result is 24/26 exact expectation agreement; explicit-super dispatch and one composed-modifier chain remain incomplete rather than detected. Five cases have an unsupported classification, and one recursive detected case is also incomplete. This is not production accuracy. See ../../reports/benchmarks/native-effects/reviewer/REVIEW.md for the full chronology.

Scan any named case with an installed native 0.8.26 compiler:

```sh
./target/release/omniguard scan fixtures/effect-review/cases/c08_explicit_super_v --solc /path/to/native/solc --format json
```

The manifest records per-case focused rules, expected outcomes and source hashes. Raw baseline, initial handoff and final reports are retained under reports/benchmarks/native-effects/reviewer/. Cases used in future implementation tuning must be called development cases.

Replay all 26 from any extracted source directory with Python 3.11 or newer:

```sh
python3 scripts/validate-effect-review.py --binary target/release/omniguard --solc /path/to/native/solc --output /tmp/omniguard-review-results
```

The output directory must not already exist. The runner verifies the frozen canonical manifest, every source digest/length, the full reported source inventory, unique finding fingerprints, all primary/related spans and coordinates, and distinct cross-file caller locations. It writes raw reports plus `summary.json`. The current expected result is **exit 1**, 24/26 exact labels, 79 verified spans, six incomplete reports and zero complete-clean positive misses. The two unmet detection expectations remain visible. Exit 0 means every frozen label matches; exit 2 means input/execution/evidence validation failed. Historical reports and labels are never overwritten.

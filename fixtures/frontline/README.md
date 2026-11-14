# Synthetic team-defence fixtures

These files are invented observations for a reproducible local exercise. They do not describe real accounts, people, endpoints or incidents.

- `team-risk.intake.json`: sequence 1, five failed checks and two coverage gaps.
- `team-retest.intake.json`: sequence 2, five passing checks and the same two gaps.
- Corresponding `.bundle.json` files are produced by the native `omniguard-frontline` Rust binary and independently validated by the Forge adapter.

The frozen baseline capture is **2026-11-14 16:20:00 UTC** (`1794673200`); the retest is 30 seconds later. Observations expire after 24 hours. Test suites use a fixed clock deliberately. A present-day check should report these observations stale once expired.

From the repository root:

```sh
cargo build --locked -p omniguard-frontline
node scripts/generate-frontline-fixtures.mjs --at 1794673200
```

Regeneration should leave the four JSON files byte-identical. For fresh demo timestamps, use `--out /tmp/omniguard-frontline-fresh` instead of overwriting this corpus. Both bundles retain an unsupported check and an entry without evidence; neither is an all-covered result. See the [guide and exact coverage ledger](../../docs/frontline-guide.md).

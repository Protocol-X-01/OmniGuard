# Contributing to OmniGuard

Useful contributions make a detection more precise, its evidence easier to check, or the remediation workflow more reliable. Start with a small reproducible case and state the behavior the change should improve.

## Set up

Use the pinned Rust toolchain, Node 24, Python 3.11+ and the committed lockfiles. Source analysis needs no Atlassian account. Compiler tests require a native **solc 0.8.26** binary supplied through `OMNIGUARD_TEST_SOLC`.

```sh
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets -- -D warnings
OMNIGUARD_TEST_SOLC=/path/to/solc cargo test --locked --workspace -- --include-ignored
cd integrations/atlassian-forge
npm ci
npm test
npm run build
npm run validate:manifest
```

Run dashboard checks from `dashboard/` with `npm ci` and `npm run build`. Forge lint/deployment requires the owner's contributor access; public pull-request CI never deploys and needs no Atlassian token. See [build and deployment](docs/deployment.md) for the full operating guide.

## Make a rule change reviewable

1. Add an isolated positive fixture, its corresponding fix and relevant negative controls.
2. Assert exact rule expectations and validate primary/related source spans, excerpts and hashes.
3. Exercise unresolved and unsupported constructs. They must not silently become clean results.
4. Keep source and compiler modes distinct. Document confidence, scope and any expected misses.
5. Update rule documentation and regenerate affected reports with the actual CLI. Never edit a report to manufacture a passing result.

The frozen review corpus is measurement evidence. Do not relabel or rewrite it merely to improve a score. Add separately identified regression cases and retain before/after measurements. Local runtime witnesses should use authored fixtures without RPC or live transactions.

## Preserve the boundaries

The Rust core must build without Node, Forge or Atlassian credentials. Forge validates imported evidence but does not execute the scanner. Report changes require versioned schemas, compatibility tests and matching remediation profiles. Preserve historical acceptance records as dated evidence.

For pull requests, explain the observable problem, resulting behavior and relevant validation. Include failure cases and limitations. Run `python3 scripts/check-release.py` when changing package contents. See [SECURITY.md](SECURITY.md) for private vulnerability reporting and [LICENSE](LICENSE) for the MIT license.

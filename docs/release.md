# OmniGuard 0.1.4 — early-access release

This release packages the independent Rust analyzer, separate Forge Jira app, Bitbucket scaffold, fixture sources, reports and reproducibility records. The independent source is public at [Protocol-X-01/OmniGuard](https://github.com/Protocol-X-01/OmniGuard). Downloadable early-access archives are published through [GitHub Releases](https://github.com/Protocol-X-01/OmniGuard/releases). This is not a completed Codegeist entry. The Forge package is deployed as production 2.0.0 with Jira sharing enabled; [production acceptance](acceptance-production-cs0lutions-2026-11-14.md) completed KAN-6. Independent judge-site installation remains unverified.

The 14 November UI follow-up strengthens the separate local dashboard's contrast, keyboard navigation and narrow-screen layout, and clears stale success/evidence after a failed rescan. Its [focused acceptance record](accessibility.md) distinguishes these checks from the unchanged Rust/Forge validation. Source manifests identify the revised candidate; engine 0.1.4 and the deployed Forge package are unchanged.

## Reproducible build

Use Linux with a C compiler, Python 3.11+, stable Rust 1.93.0 (pinned), Node 24 and the committed npm/Cargo lockfiles. Native compiler checks use **solc 0.8.26+commit.8a97fa7a.Linux.g++**. Supply its executable path yourself; scanner execution never downloads a compiler. Foundry must be supplied separately for local EVM witnesses.

```sh
cargo build --locked --release --workspace
OMNIGUARD_TEST_SOLC=/path/to/native/solc cargo test --locked --workspace -- --include-ignored
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo fmt --all -- --check
python3 scripts/validate-effect-challenges.py --binary target/release/omniguard --solc /path/to/native/solc --output /tmp/omniguard-effects-new
python3 scripts/validate-effect-review.py --binary target/release/omniguard --solc /path/to/native/solc --output /tmp/omniguard-review-new
forge test --offline --root fixtures/effect-tests --use /path/to/native/solc
```

Here `forge` means Foundry. The review runner's expected **exit 1** records two unmet detection expectations; it is not a build failure or 26/26 detection success. See the [frozen review README](../fixtures/effect-review/README.md). All EVM work is local, without RPC, fork or live transaction. `fixtures/effect-tests/foundry.toml` now names compiler version 0.8.26 instead of the author's absolute path. Frozen Solidity and review manifest bytes are unchanged.

Run `npm ci`, `npm test`, `npm run build` and `npm run validate:manifest` inside `integrations/atlassian-forge/`. Regenerate all twelve bundles with `npm run reports:generate -- --solc /path/to/native/solc`. Use **that package's** Forge CLI for deployment. Run `npm ci` and `npm run build` separately in `dashboard/`. The Bitbucket directory is a separately registered scaffold and is not required for the Jira judge workflow.

The earlier accepted executable was built with local nightly Rust 1.90.0; its exact SHA-256 remains in the tenant/benchmark records. A stable-toolchain rebuild may have a different binary digest. Compare generated report/bundle bytes and rerun checks; do not replace historical executable identities with a new hash merely because the version string matches.

## Source and judge packs

```sh
python3 scripts/package-release.py --output /tmp/omniguard-release-new
```

This creates deterministic source and fixture-judge archives, file manifests and SHA-256 checksums in a new directory. It does not deploy, publish, commit or send files. The source archive includes historical local measurement paths and cs0lutions acceptance images, so review those contents before any public distribution. The smaller judge pack contains authored fixture sources, the three production-acceptance bundles (vulnerable compiler, intentional weaker source-only rescan, matching compiler fixed), public distribution metadata and a standalone walkthrough. These bundles relabel previously validated report/source bytes; their provenance is included. Neither pack includes node_modules, build caches, credentials, the research dataset or the original framework.

The canonical file manifest identifies the snapshot even before the first Git commit. A checksum proves byte identity, not publisher authenticity or audit quality. Dependency downloads are needed for a first build unless caches are prepopulated; `--offline` replay is only claimed when those caches already exist.

## Remaining submission gates

The published [Codegeist rules](https://codegeist2026.devpost.com/rules), checked 14 November 2026, require a working Forge installation link, complete setup instructions, a feature/technology description, a category and a public YouTube demonstration under five minutes. They do **not** list public source publication as a requirement. The current intended category is Apps for Software Teams. The separate local MCP does not satisfy the Atlassian MCP bonus, which specifically requires `rovo:mcp`.

Production deployment, support/privacy metadata, the generated Jira installation link and the [public captioned YouTube demonstration](https://www.youtube.com/watch?v=r23rE10Vv5A) are complete. Still open: independent judge-site installation and flow, and final Devpost fields/submission. The source and judge packs preserve the measured engine limits and include the current installer. Deadline: **22 December 2026, 12:00pm Pacific / 20:00 London**.

# Build and deployment

## Local Rust CLI

Install rustup and the pinned stable Rust 1.93.0 toolchain (`rust-toolchain.toml`). The minimum declared Rust is 1.90, required by the locked tree-sitter dependency. From the repository root:

```sh
cargo test --locked --workspace
cargo build --locked --release --workspace
./target/release/omniguard scan /path/to/foundry/project --format sarif --output omniguard.sarif
```

The report contains relative file paths, exact source excerpts, source digests, and validated spans. Keep generated reports with the source revision they describe. Add `--solc /path/to/native/solc` for optional compiler-resolved facts across supplied imports/inheritance. No compiler or missing dependency is downloaded; the [compiler guide](compiler-analysis.md) records source boundaries and reproduction commands.

## Local dashboard

Build the CLI, run `npm ci` in `dashboard/`, and start `npm run api` and `npm run dev` in separate terminals. The dashboard is a local fixture demonstration using the complete executable vault pair. Start the API with `OMNIGUARD_SOLC=/path/to/native/solc` to use the compiler-assisted semantic vault pair. The API has no remote mode and is not intended to be exposed to a network.

## Atlassian Forge

Use the [Forge workflow guide](forge-workflow.md) for scoped-token sign-in, one-time app registration, development deployment, installation on cs0lutions, bundle imports and Jira acceptance testing. The Jira app requests `read:jira-work`, `write:jira-work` and `storage:app`. Its server uses the current user and trusted project context.

The Rust scanner runs locally. The Jira app stores imported fixture source bundles and independently rechecks source evidence; it does not execute Rust or fetch Bitbucket source. The Bitbucket scaffold is a separate Forge app under `integrations/atlassian-bitbucket/`.

## Production and judge distribution

Production 2.1.0 is installed on cs0lutions and the separate temporary acceptance site; development 2.10.0 remains separate. Jira sharing is enabled. The [judge guide](judge-guide.md) contains the current installer; [KAN-6 acceptance](acceptance-production-cs0lutions-2026-11-14.md) proves the production workflow. The [privacy rollout](privacy-minimization.md) records the later update and retained evidence. The following commands document deployment for authorized contributors; they do not need rerunning to use the existing installation:

```sh
cd integrations/atlassian-forge
npm ci
npm test
npm run build
npm run validate:manifest
npm run lint
npm run deploy -- --environment production --non-interactive
npm run install-app -- --environment production --site YOUR-SITE.atlassian.net --product Jira
```

An independent developer must register their own app ID rather than deploy to the supplied owner's ID. Existing contributors to OmniGuard must keep the existing ID. Forge login is separate from browser login; enter credentials only into the CLI's sign-in prompt.

The owner has enabled **Sharing**, selected **Jira only**, supplied protocolx76@gmail.com and the public privacy policy, and declared personal-data storage as **Yes**. The [distribution metadata](distribution.json) records these public fields and the generated installer. Future changes should preserve the reviewed permissions and accurate data declaration. No Marketplace listing or public repository is required by the published Codegeist submission requirements.

Use a separate admin account/site to install from that link, then follow the [judge guide](judge-guide.md). Record the production deployment version, installation result, issue key, verification comment, final workflow status and persistence after reload. Do not reuse cs0lutions development acceptance as evidence of this separate gate. For withdrawal, disable Sharing in the console; this prevents new installations but is not an uninstall of existing sites.

Sources checked 14 November 2026: [Atlassian distribution instructions](https://developer.atlassian.com/platform/forge/distribute-your-apps/) and [Codegeist rules](https://codegeist2026.devpost.com/rules).

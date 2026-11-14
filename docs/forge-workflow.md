# OmniGuard reports in Jira

The Jira Forge app imports bundles produced by the separate Rust scanner. A bundle includes the JSON report, rule coverage, target identity, revision and all source files in the small fixture scan. The Forge resolver independently rechecks each source SHA-256, finding fingerprint, UTF-8 byte span, excerpt and line/column before persisting it in installation-scoped Forge KVS.

Only isolated fixtures are accepted in this early-access slice. The supported profiles are historical engine 0.1.0/schema v1 (3 rules), historical 0.1.1/schema v2 (12 rules), historical 0.1.2/schema v3, historical 0.1.3/schema v3 and current 0.1.4/schema v3 source/compiler modes (12 rules). A bundle is limited to 160 KiB, 8 files, 64 KiB per file and 100 findings. This is source integrity validation, not cryptographic attestation of scanner execution. Revision names are uploader-supplied labels. Reports with diagnostics remain visibly incomplete and cannot create a remediation or verify a fix.

## Generate and import

From the root, build the release CLI, then generate bundles:

```sh
cargo build --release --workspace
cd integrations/atlassian-forge
npm ci
npm run reports:generate -- --solc /path/to/native/solc
npm test
npm run build
npm run validate:manifest
```

The generator actually invokes the Rust CLI over each fixture and exports static Vault, complete executable Vault and 12-pattern bundles. It refreshes the backend rule catalog from `omniguard rules --format json`. With `--solc` it also exports the small compiler-assisted semantic pair; its source-only counterpart demonstrates the profile difference. Each vulnerable/fixed pair is deterministic and shares its own logical target identity. Each fixture family has its own target; source/compiler variants of the semantic family share that target with distinct review profiles. These bundles are not an analysis of a Bitbucket repository.

Open OmniGuard within Jira project KAN on cs0lutions after installing the app. For new review work choose `reports/semantic-vulnerable.omniguard.json` for compiler-assisted evidence, or `reports/patterns-vulnerable.omniguard.json` for the 12-pattern source pack, or open **Paste a report instead**, paste the complete JSON and press **Use pasted report**. Review the prepared revision, then press **Import scan report**, select a finding and press **Create Jira remediation**. The app uses the Jira project from its authenticated resolver context, checks the user's Jira permissions, discovers the Task issue type and includes source evidence in the issue. Persistent claims and evidence labels prevent repeat clicks from blindly creating duplicates; an uncertain network outcome remains pending and is recovered by its Jira reference when available.

Import the corresponding fixed bundle under the same engine/profile. For historical KAN-1 use `reports/legacy/v0.1.0/fixed.omniguard.json`; for KAN-2 use `reports/legacy/v0.1.2/semantic-fixed.omniguard.json`. The original remediation remains in the tracker. Verification requires the same target, engine, rule coverage, analysis mode, exact compiler version and source file, a changed source digest, complete rule coverage, no diagnostics, and no remaining detection for that rule in that file. Press **Record rescan verification in Jira** to add an evidence comment. Completion is a separate explicit action, limited to completion transitions currently exposed by that issue's Jira workflow. The tracker also links directly to the recorded verification comment. A different active scan invalidates prior verification for completion.

## Forge sign-in and development installation

Forge CLI uses a separate Atlassian sign-in. Run `npm run login` with a supported Node version and enter a Forge-scoped API token only at its hidden prompt. The CLI uses the OS keychain; do not store tokens in source, reports or chat.

Register once (only while the manifest still contains the zero placeholder):

```sh
npm run register -- OmniGuard
npm run lint
npm run deploy -- --environment development --non-interactive
npm run install-app -- --site cs0lutions.atlassian.net --product Jira --environment development
```

Review the read/write Jira and app-storage scopes during installation. A later scope change needs an installation upgrade. If registration presents developer terms, the account owner must review and accept them. The Jira app is distinct from the Bitbucket scaffold under `integrations/atlassian-bitbucket/`.

## Live acceptance evidence

Current production 2.0.0 acceptance completed **KAN-6** with verification comment **10005**, Done status and reload persistence. A source-only zero-finding rescan was rejected before the matching compiler rescan passed. See the [production record](acceptance-production-cs0lutions-2026-11-14.md) and [current judge guide/installer](judge-guide.md).

The historical cs0lutions acceptance and the current compiler-assisted acceptance passed on 13 November 2026: [historical KAN-1 record](acceptance-cs0lutions-2026-11-13.md), [compiler-assisted KAN-2 record](acceptance-compiler-cs0lutions-2026-11-13.md).

After installation, test one isolated fixture issue through import → evidence → issue creation → fixed import → verification comment → completion. Inspect the real Jira issue and record its key, both bundle hashes, comment ID, final status and deployment version. Local service tests use a fake Jira adapter; they do not establish acceptance on the tenant.

## Authoritative references

- [Forge getting started and scoped-token login](https://developer.atlassian.com/platform/forge/getting-started/)
- [Forge KVS and installation isolation](https://developer.atlassian.com/platform/forge/storage-reference/kvs-api/)
- [Jira issue creation and transitions](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/)
- [Forge app compatibility](https://developer.atlassian.com/platform/forge/app-compatibility/)

## Engine upgrade behavior

Schema v3 identifies analysis mode/compiler version and gives every related source its own digest, including cross-file declarations. Historical schema v2 includes SHA-256 snapshots for every scanned input, explicit coverage and contextual/related source spans. Import checks these in addition to the primary evidence. A profile change cannot verify an earlier remediation. Creation is idempotent within project, target, engine/mode/compiler profile and finding; a new profile receives a distinct review baseline while historical Jira records remain visible.

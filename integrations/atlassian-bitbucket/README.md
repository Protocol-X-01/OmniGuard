# OmniGuard for Bitbucket

A separate Forge app displays source-validated evidence on a public fixture PR. The Jira app imports that PR URL independently and binds its remediation baseline to the repository UUID, PR number and full source/destination commits.

The Rust core stays outside Forge. There are no repository write scopes, shared secrets or webhook endpoints. Public fixtures only; private repositories, fork PRs and automatic Jira transitions are not supported. Source integrity is verified; scanner execution is not attested by this panel.

## Repository contract

A review branch contains:

```text
contracts/EffectVault.sol
omniguard.scan.json
bitbucket-pipelines.yml
```

Generate the bundle from **all** Solidity files below `contracts/`:

```sh
omniguard bundle contracts --isolated-fixture \
  --target omniguard-bitbucket-fixtures --name 'Bitbucket isolated fixtures' \
  --revision pr-snapshot --solc /path/to/solc-0.8.26 \
  --output omniguard.scan.json
```

Commit source and report together. Copy [the example pipeline](example/bitbucket-pipelines.yml) to the repository root. It checks out the PR source commit, compiles OmniGuard from a fixed Git commit, checks the Solidity compiler SHA-256, regenerates JSON/SARIF and rejects a committed report that differs from fresh analysis. Findings do not make this consistency check fail: a green pipeline means the report was reproduced, not that the code is safe. No merge requirement is installed automatically.

Bitbucket requires account two-step verification before Pipelines can be enabled. Enable it in your account, then activate Pipelines for the repository and run the PR pipeline. The example uses the workspace's existing build-minute allowance, a 15-minute step limit, and no integration credentials. The Rust image has a version tag; the engine commit and compiler checksum are immutable pins.

In the owner's `omniguard/omniguard-pr-fixtures` repository, Pipelines is enabled and [automatic PR run #1](https://bitbucket.org/omniguard/omniguard-pr-fixtures/pipelines/results/1) passed on 14 November 2026. Its downloaded bundle matched the committed fixed report exactly as parsed JSON, SARIF 2.1.0 contained zero results, and `source-commit.txt` matched the PR commit imported into Jira. [Acceptance record and archived reports](../../docs/acceptance-bitbucket-2026-11-14.md#automatic-pipeline-acceptance).

## Jira workflow

1. Open the PR's OmniGuard panel and inspect its current evidence.
2. Open OmniGuard in the destination Jira project. Under **Connect a Bitbucket pull request**, paste its canonical URL and select **Import PR scan**.
3. Review the finding and create a Jira remediation. Its description includes the PR, repository UUID, both commits and source evidence.
4. Fix the fixture, regenerate the bundle, commit both, and let the PR pipeline check the update. Import the PR again in Jira.
5. Record rescan verification, then choose the available Jira completion transition. Both actions recheck the current PR heads. A changed/closed/unavailable PR blocks completion until reviewed again.

Imports are deliberate pulls by a reviewer. Pipelines do not push reports into Jira or close issues. Manual fixture imports cannot verify a PR baseline, even if their target name or source hashes are copied. A changed destination head also requires reimport; this version analyzes the source commit, not a simulated merge result.

## Build and deploy

From this directory, with Node 24:

```sh
npm ci
npm test
npm run build
npm run validate:manifest
forge login
forge deploy --environment development
forge install --environment development --product Bitbucket \
  --site https://bitbucket.org/YOUR_WORKSPACE
```

The manifest's registered app ID belongs to the OmniGuard deployment. Contributors creating their own app must run `forge register` in their own Developer Space first; never reuse the Jira app ID. Forge requires a shared workspace. Registering accepts Atlassian's developer terms and usage-billing rules; use an account authorized for that space.

The Jira app also requires its updated manifest with backend access to `api.bitbucket.org`. Deploy it separately, acknowledge the major-version egress change, then run `forge install --upgrade` for the intended Jira site. Build with the locked packages; do not upload `node_modules` or copy the scanner into Forge.

The panel uses the UI URL only as a locator and checks it against the resolver's trusted repository UUID and PR ID. Both apps share the bounded reader in `../shared/bitbucket-pr.js`; the existing Jira validator independently checks report bytes, spans, fingerprints and analysis coverage.

See [implementation specification](../../docs/bitbucket-pr-spec.md) for the security boundary and acceptance criteria. Deployment and pipeline execution must be verified separately; source code availability is not installation proof.

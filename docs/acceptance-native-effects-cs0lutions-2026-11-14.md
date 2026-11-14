# Native-effects tenant acceptance — 14 November 2026

The real cs0lutions development workflow passed using **engine 0.1.4**, schema **v3**, twelve rules and native compiler **0.8.26+commit.8a97fa7a.Linux.g++**. Forge development app **2.9.0** uses the existing scopes. This is isolated-fixture acceptance; production sharing, a separate judge installation and submission remain open.

The release executable SHA-256 is `dbf3fb31b96d7a33b6972ca110fd7d5980e03272ef6f3af38d0ee2d08497a7d3`. [Local analysis, independent review and execution witnesses](native-effects.md) document what this release detects and what remains incomplete.

## Observed workflow

1. A separate browser tab loaded the upgraded app. Its footer showed 0.1.4 while the exact historical 0.1.2 fixed scan and completed KAN-2/KAN-3 records remained intact.
2. Imported `reports/effects-vulnerable.omniguard.json` using the app's labelled paste alternative. It reported one OG-SOL-002 finding, complete twelve-rule input coverage and the exact compiler profile.
3. Expanded related evidence using the keyboard. The caller location was `EffectVault.sol:20:9`; the helper interaction was `recipient.call{value: amount}("")` at line 25 and the later write was `credit.amount = 0` at line 21. Their source digests matched the supplied source.
4. Created [KAN-4](https://cs0lutions.atlassian.net/browse/KAN-4). Its actual Jira description contained the isolated-fixture label, engine/compiler/rule profile, caller excerpt, helper interaction, later write, storage/binding evidence and scan/source digests. The issue began in To Do; verification was unavailable before a changed rescan. Reloading the app retained the vulnerable scan and the same issue, with an Open action instead of another creation action.
5. Imported `reports/effects-fixed.omniguard.json`. It had zero detections and no diagnostics, with the same target, engine, rules, compiler and source filename, and changed source bytes. The app offered rescan verification for KAN-4.
6. Recorded verification comment **10003**. The actual Jira comment included the fixed revision, absence of OG-SOL-002 under the declared profile and both previous/rescanned source digests.
7. Selected **Move to Done** in the app. Both the app and the actual issue showed Done. After reloading both pages, the fixed scan, Done status and verification-comment link persisted.

The final app view is [saved here](evidence/forge-native-effects-verified.png). The user's original tab and its prepared historical file were not reloaded or replaced. Historical KAN-1/2/3 baselines were not modified by the new fixture flow.

## Exact imported identities

These are the normalized bundle digests checked by Forge, rather than the SHA-256 of pretty-printed file bytes:

| Item | SHA-256 |
| --- | --- |
| Vulnerable bundle | `93ee26afcd1439ddf79502bec778f44a6924bbd374e2f58a0e0c639057209dc6` |
| Fixed bundle | `9fe652a46a1175c35e218ba81e5e94755e72c4550a67f020f692922e5a19a5bd` |
| Vulnerable source | `ea933c4380fd876fd25bff485be6980573cd25a8c67ff84841927fbc48ee18f8` |
| Fixed source | `18c00bd192c116d3b419c51b182f1301f41e602a5a9eb5e567b64860324635d8` |

Finding fingerprint: `f4c0fa6bad9f5ff6fb11dd9a`. Target: `omniguard-effects-vault`. Revisions: `effects-vulnerable-v0.1.4` and `effects-fixed-v0.1.4`.

## Validation boundary

Thirty-eight Rust tests, twenty-three Forge tests, frontend builds, strict Clippy/format checks, manifest validation and authenticated Forge lint passed before deployment. The first deployment attempt lost its TLS connection before deployment; an unchanged retry succeeded with certificate checks intact. No new permission scope was introduced.

Independent local Forge checks rejected incomplete rescans and altered evidence/fingerprints. Those negative checks were local, not additional tenant actions in this run. The local dashboard also passed keyboard draft creation and fixed rescan; that draft remained distinct from real KAN-4. Native file-picker automation was not accepted as proof; the successful paste import uses the same validation contract.

The fixture's three local Foundry witnesses are separate from the report's static finding. No chain connection, RPC, real asset transfer, private repository scan or external target test occurred. This acceptance does not establish general analyzer accuracy, complete semantic coverage, production installation readiness or comprehensive accessibility certification.

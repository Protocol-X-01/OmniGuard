# OmniGuard secure communications lab

A separate, working encrypted messaging slice for synthetic team exercises. The browser uses Matrix JS SDK and its Rust crypto implementation. The local Synapse server receives encrypted message content. Jira and Forge receive no messages, keys or Matrix access tokens.

The local file-transfer extension supports individual files and nested folders. Select **Choose files** or **Choose a folder**, review the paths, then use **Send encrypted transfer** after verifying devices. The recipient chooses **Verify transfer** and then **Save verified copy**. A single top-level file keeps its filename; multiple files/folders download as a ZIP created locally from validated entries. No content is automatically opened or extracted.

Transfers are limited to **100 files / 10 MiB of file content**. Names and folder paths are encrypted with the content; only ciphertext is uploaded. File hashes, bounds and paths are checked before download. Empty folders and filesystem attributes are omitted. Encryption is not a malware scan, and a downloaded copy cannot be recalled. See the [transfer contract](TRANSFERS.md) for format, trust boundaries and remaining production work.

This is **local development**, not a production messenger. The two fixture identities are issued by a loopback-only demo broker; it is deliberately unsuitable for real users. No real incident details belong here.

## Run locally

Requirements: Node 22+, Python 3.10+ supported by the pinned Synapse release, three local terminals, and unused loopback ports 8998 and 4190. The measured environment used Node 24.22.3 and Python 3.14.8. Docker is not required.

From `secure-comms/`, choose a private directory outside the repository:

```sh
export OMNIGUARD_LAB_STATE="$(pwd)/../../../work/secure-comms-state"
python3 -m venv "$OMNIGUARD_LAB_STATE-venv"
"$OMNIGUARD_LAB_STATE-venv/bin/pip" install -r requirements.lock
"$OMNIGUARD_LAB_STATE-venv/bin/python" scripts/configure.py --state "$OMNIGUARD_LAB_STATE"
```

Start Synapse in terminal one and leave it running:

```sh
"$OMNIGUARD_LAB_STATE-venv/bin/python" -m synapse.app.homeserver \
  -c "$OMNIGUARD_LAB_STATE/homeserver.yaml"
```

In terminal two, set the same state path, provision once, then build and start:

```sh
"$OMNIGUARD_LAB_STATE-venv/bin/python" scripts/fixtures.py --state "$OMNIGUARD_LAB_STATE"
npm ci
npm run build
npm start
```

Open <http://127.0.0.1:4190> in two tabs. Choose Alice in one and Bob in the other. Start both sessions, refresh devices, and compare **each device's own fingerprint in the other tab**. The UI refuses a mismatched fingerprint. Verify each side, then exchange synthetic messages. End both sessions before running tests or stopping the lab. There is no persistent crypto store or recovery; reloading creates an unverified device. To recover from an abandoned tab, use a fresh private lab state directory after stopping the old server, or explicitly revoke that fixture device in Matrix; do not silently trust it.

The configure/provision scripts refuse to overwrite existing state. For the current already-running lab, only `npm start` and the existing Synapse command are needed after a restart. Generated server signing keys, account passwords and database remain outside Git.

## Verify

With Synapse running and browser fixture sessions ended:

```sh
OMNIGUARD_LAB_STATE=/absolute/private/lab npm test
```

The integration test uses real Synapse and SDK crypto. It checks encrypted messages and transfers, single-file/nested-folder recovery, outsider key-event rejection, wrong fingerprints, new unverified devices, changed membership during upload, upload failure and broker origin restrictions. It writes sanitized `acceptance.json` and `transfer-acceptance.json` into the private state directory. Authenticated media is not room-scoped: an outsider with a media URI may obtain ciphertext, but cannot read the room event containing its key. Separate unit/HTTP tests cover corruption, invalid paths, size/count limits, malformed bundles and failed/redirected downloads.

A run without `OMNIGUARD_LAB_STATE` skips the live encryption test; it is not acceptance. `--test-force-exit` ends remaining SDK background timers only after the test runner completes; each test has its own timeout and sessions are logged out in cleanup. Run `node --test test/server.test.mjs test/transfers.test.mjs` for the checks that do not require Synapse. The transfer build, real SDK/server flow and browser file/folder pickers have local evidence. On 17 November, two real browser sessions verified devices, transferred a single file and nested folder, then explicitly saved byte-identical copies. See [browser acceptance](../docs/evidence/transfers-2026-11-17/transfer-browser-acceptance.json). Physical Android/iOS acceptance remains pending.

## Android and iOS

The protocol is compatible with Matrix clients such as Element, but this loopback lab is not accessible from a phone. Native mobile acceptance has **not** been run. A later pilot needs a reachable HTTPS homeserver, production authentication, verified devices, encrypted key backup/recovery, lifecycle controls and an independently reviewed client policy. Do not expose this fixture broker or its HTTP ports publicly. Membership, room metadata and timing are visible to the homeserver; encryption does not erase plaintext already read by a recipient.

See [SPEC.md](SPEC.md) for the contract and trust boundaries. The main OmniGuard Jira workflow remains separate.

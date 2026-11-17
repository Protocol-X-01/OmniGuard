# Third-party components

OmniGuard's application code is separate from the maintained cryptographic and server components it uses.

| Component measured in this lab | Declared licence | Source |
|---|---|---|
| Matrix JS SDK 45.1.0 | Apache-2.0 | https://github.com/matrix-org/matrix-js-sdk |
| Matrix SDK crypto WASM 18.9.2 | Apache-2.0 | https://github.com/matrix-org/matrix-sdk-crypto-wasm |
| fflate 0.8.3 (creating ZIP downloads from validated files) | MIT | https://github.com/101arrowz/fflate |
| Synapse 1.165.0 | AGPL-3.0-or-later OR LicenseRef-Element-Commercial | https://github.com/element-hq/synapse |

The JavaScript dependency lock and Python requirements lock record the installed dependency versions. Their individual notices remain applicable. No third-party logo or commercial affiliation is implied. This repository references Synapse as a separately installed dependency; it does not claim that OmniGuard's own licence replaces Synapse's terms.

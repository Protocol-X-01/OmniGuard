# Secure files and folders: local transfer contract

Local implementation contract, 16 November 2026. This extends the synthetic Matrix lab; it does not enable production or mobile sharing. The SDK/server flow and build have local evidence. **17 November update:** real browser file/folder selection, recipient verification and explicit download passed; recovered bytes and nested paths matched. See [browser acceptance](../docs/evidence/transfers-2026-11-17/transfer-browser-acceptance.json). Physical mobile and production acceptance remain pending.

## Team workflow

Select files or a folder, review the relative paths and total size, verify all participant devices, then send. Recipients explicitly verify the transfer before saving a file or a folder ZIP. The interface distinguishes server acceptance from recipient receipt. Jira/Forge receive neither files nor transfer keys.

The initial limit is 100 files and 10 MiB of file content per transfer, with a 256 KiB manifest limit. Folder selection preserves the selected directory's name and nested file paths. Empty directories, filesystem permissions, timestamps and symlinks are not represented. A folder picker supplies file bytes, not an original filesystem image. There is no background synchronization, resumable upload or automatic execution/extraction.

## Encryption and transport

- Use the pinned Matrix Rust crypto WASM `Attachment` implementation, with a fresh attachment key for every send. Upload only ciphertext as `application/octet-stream`, without a filename. Transfer metadata and the attachment key travel inside an encrypted `m.room.message` event (`m.file`).
- Check the exact expected room membership, invitation/history settings, verified devices and local encryption readiness before reading/uploading, and again immediately before sending the key-bearing event. An upload failure or policy change must not publish that event. The app never starts a new transfer automatically after an uncertain result; Matrix's SDK may retry the same event transaction. The user must check the conversation before starting a replacement transfer.
- Only encrypted events from expected participants in the current room can be opened. Check current room/device policy again before and after downloading. Restrict media to the local homeserver and use authenticated downloads, bearer headers, no redirects, no cookies and a bounded streamed response. No access token in a URL.
- Matrix's ciphertext hash is checked before decryption. The decrypted bundle is separately checked for exact structure, total size, file count, paths and per-file SHA-256 before making any download available. Encryption/integrity does not certify harmless content.
- A failed send can leave an encrypted orphan on the media server. There is no retention/expiry service in this lab. Revocation cannot erase a recipient's downloaded copy or already disclosed keys. Server-visible metadata still includes timing, ciphertext size and membership.

## Bundle v1

The transport is a bounded, uncompressed container, not an archive extractor: eight bytes `OGBNDL1\n`, four-byte unsigned big-endian manifest length, UTF-8 JSON manifest, then concatenated regular-file bytes in manifest order. The manifest has exactly `version: 1` and `files`; each entry has exactly `path`, `size` and a lowercase hexadecimal `sha256`. Paths are relative, NFC-normalized, bounded in length/depth and unique case-insensitively. Reject absolute paths, traversal, empty components, control/bidirectional characters, backslashes, drive/alternate-stream syntax, reserved device names, trailing dots/spaces and file/directory collisions. Reject extra or truncated bytes.

For multiple files or a selected folder, the recipient creates a standard ZIP locally from the validated regular-file entries, using stored entries without compression. No incoming ZIP is unpacked. A user-selected archive is transferred as an opaque file and receives no claim of safe contents. The custom bundle needs an OmniGuard client; generic Matrix clients will not unpack it automatically.

## Provider contract and verification

Existing Matrix routes: authenticated `POST /_matrix/media/v3/upload` with opaque bytes returns `content_uri`; authenticated `GET /_matrix/client/v1/media/download/{serverName}/{mediaId}` returns bytes. No new broker endpoint. The local API subset is recorded in `../postman/specs/secure-transfers-matrix.openapi.json`. Official references: [encrypted attachments](https://spec.matrix.org/v1.15/client-server-api/#sending-encrypted-attachments), [Rust crypto attachment API](https://matrix-org.github.io/matrix-sdk-crypto-wasm/classes/Attachment.html).

Required evidence: single binary file and nested-folder round trips, server-side ciphertext and hidden names, wrong keys/tampering/truncation, malicious and colliding paths, size/count limits, foreign media and redirects, oversized/missing-length streams, outsider inability to obtain the key-bearing event, unverified devices and changed membership, and no event publication after failed upload. Authenticated media storage is not room-scoped access control: another logged-in user who learns a media URI may obtain ciphertext, but must not receive the decryption key through this app.

Production gates remain real authentication, HTTPS hosting, independent security review, retention/orphan cleanup, durable device/key lifecycle and physical Android/iOS acceptance. Malware scanning must run on an authorized endpoint or explicitly consented analysis service; silently uploading plaintext to an external scanner would break this design.

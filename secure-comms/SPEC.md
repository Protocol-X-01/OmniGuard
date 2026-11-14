# OmniGuard secure communications: local vertical slice

Separate browser application, local Synapse 1.165.0 server, Matrix JS SDK 45.1.0 and its Rust crypto implementation. This lab is for synthetic messages only. It neither sends messages to real people nor stores chat content, credentials or keys in Forge/Jira.

## Trust and behavior

- HTTP is permitted only on numeric loopback. No public registration, federation, URL previews, push gateways or external invitations. Local demo session issuer accepts only two named fixture users and is **not production authentication**.
- The browser owns ephemeral Matrix device keys and access tokens in memory. Reloading without logout can leave an unused Matrix device; explicit End session revokes that session. This slice provides no durable key backup or recovery.
- A private room is created with `m.megolm.v1.aes-sha2`, invite-only membership and joined-only history. Room names, membership, timing and device IDs remain server-visible metadata. Encryption protects message content, not the endpoint or all metadata.
- Sending checks server room state, exact expected membership and current device keys. Every other device must have its full fingerprint compared through a trusted independent channel and locally verified. Newly discovered devices block sending. The SDK also excludes unverified devices from key sharing. No plaintext fallback.
- Plaintext events are excluded from the protected transcript. Only encrypted events successfully decrypted by the SDK enter the protected transcript.
- The local fixture broker can issue fixture sessions, so it is unsuitable for real identities. Production requires real Matrix authentication, HTTPS, hardened hosting, access lifecycle, key recovery and security review. Native Element Android/iOS can use a future reachable HTTPS homeserver; loopback on this computer is not reachable from a phone.

## Local transport contract

All broker requests require the exact loopback Host. Mutations also require exact same Origin, JSON content type and `X-OmniGuard-Lab: 1`. Responses are no-store. No credentials in URLs, logs, committed files or browser storage.

| Method and route | Request | Success | Failure |
|---|---|---|---|
| GET `/lab/config` | none | 200: local homeserver, room ID, participant IDs, fixture label | 500 setup unavailable |
| POST `/lab/session` | `{participant: "alice" \| "bob"}` | 200: Matrix session for a fresh fixture device | 400 bad shape; 403 origin/host; 429 upstream limit; 502 login unavailable |
| GET static assets | fixed allowlist | 200 asset | 404; no filesystem traversal |

The broker provides no message-send endpoint. Browsers talk directly to Synapse's standard Matrix Client-Server API. Device verification and message encryption run client-side.

## Acceptance

Real local Synapse, two independent SDK clients: invite/join, compare device fingerprints, encrypted send, recipient decryption, raw server-event ciphertext, outsider read/join rejection, unverified-device send block, changed room membership block, and no unsafe-origin broker session. Browser acceptance covers both participants and readable responsive UI. Physical Android/iOS, production authentication, recovery, revocation of already-disclosed historical content and an independent security assessment remain outside this first slice.

Sources: [Matrix SDK](https://github.com/matrix-org/matrix-js-sdk), [Crypto API](https://matrix-org.github.io/matrix-js-sdk/interfaces/crypto-api.CryptoApi.html), [Synapse setup](https://element-hq.github.io/synapse/latest/setup/installation.html). Current dependency versions were checked against their package registries when this lab was created.

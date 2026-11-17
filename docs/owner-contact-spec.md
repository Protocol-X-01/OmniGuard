# Owner contact and mobile handoff

Scope: Forge development, synthetic remediation cases, explicit user-reviewed Jira mentions. The current Jira assignee is the recipient; an inventory's team alias is not a person or a presence signal.

## Contract

`previewFrontlineContact` (`POST /api/frontline/contact-preview` locally) accepts case ID, active evidence digest and one of `request_context`, `remediation_update`, `retest_review`. It checks current-user browse/edit/comment permissions, loads the actual issue and active assignee, and returns a fixed message plus a five-minute signed review token. Its signature binds project, actor, case, recipient, exact message, evidence, reason and expiry. The project signing secret is random and stays in Forge storage; identities and preview tokens are not persisted.

`sendFrontlineContact` (`POST /api/frontline/contact`) additionally accepts that token and expiry. It reloads the recipient and verifies the signature before sending an ADF mention as the acting user. A persistent claim and comment marker allow at most one comment for each case/evidence/reason, including response-loss recovery. A failed or expired review cannot send. Contact does not change triage, verification or completion. The dashboard stores only comment ID, timestamp, reason and digest; Jira owns authorship and recipient identity.

Messages contain a check reference and evidence digest, not raw incident communications, attachments or credentials. A preview is not a delivery/read receipt. Canonical Jira issue links support web/mobile handoff; actual Android/iOS push delivery is a separate device acceptance step.

## Presentation

Preserve the existing OmniGuard character. Use quiet blue-grey surfaces, deep slate text, restrained teal for actions, amber for gaps and violet for unassessed coverage. Keep the distinctive evidence → owner → retest handoff visible. Rounded panels, readable system typography, generous spacing, 44px controls, visible keyboard focus and reduced-motion support. The contact panel has a recipient, a purpose, an exact preview and a separate send button; no online badge.

## Separate encrypted communications

The user chose a separate encrypted messaging feature, initially local with no existing server. It is independent of Forge and will use maintained Matrix SDK cryptography, with a loopback-only Synapse test server and synthetic users. No plaintext fallback, no public registration, no federation, no message/key/token storage in Jira. Desktop browser acceptance must establish ciphertext on the server and decryption only at intended clients. Device verification, membership changes, recovery and actual Android/iOS acceptance must be labelled according to what was tested. Production hosting is outside this local test authorization.

## References

- [Jira ADF mention](https://developer.atlassian.com/cloud/jira/platform/apis/document/nodes/mention/)
- [Jira comment API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comments/)
- [Jira mobile](https://support.atlassian.com/jira-software-cloud/docs/use-jira-cloud-on-apple-and-android-devices/)
- [iOS notification settings](https://support.atlassian.com/jira-cloud-ios/docs/manage-your-notifications/)
- [Matrix SDK encryption](https://github.com/matrix-org/matrix-js-sdk#end-to-end-encryption-support)

Orbit discovery returned unrelated Mention-provider endpoints for the Jira task; no provider result was reused. The official Jira contract above is the source.

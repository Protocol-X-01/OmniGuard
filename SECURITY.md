# Report a security issue

For a suspected vulnerability in OmniGuard, email **protocolx76@gmail.com**. Keep sensitive details out of public issues until a fix or coordinated disclosure is ready. Do not send credentials, private keys or unrelated customer data.

Include the affected version, component, a minimal authorized fixture, reproduction steps, expected and observed behavior, and the impact you can demonstrate. Source evidence, a failing regression and a proposed fix are especially useful. A scan false negative or evidence-validation bypass belongs here when disclosure would expose a real affected system; ordinary synthetic detection gaps can use the public analysis issue template.

## Supported scope

The current early-access version is **0.1.4**. The Rust scanner, CLI, report contracts, Forge import validator and remediation service are in scope. The separate Bitbucket app remains a scaffold. Historical report profiles remain readable for compatibility, not as separately maintained releases.

OmniGuard's documented analysis limits are in [the rule reference](docs/rules.md) and [native-effect results](docs/native-effects.md). A valid digest proves source-byte consistency, not that an uploader ran the scanner or that a finding is exploitable. Reviewers should keep those trust boundaries explicit.

Reports are reviewed through the supplied contact. No response deadline, bounty or legal safe-harbor terms are promised by this document. Testing instructions in this repository use isolated authored fixtures and do not authorize testing third-party systems.

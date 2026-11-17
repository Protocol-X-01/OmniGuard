# Combined defence lab measurement

Engine 0.1.4; native solc 0.8.26; EVM cancun.

**12/12 implemented rules detected in both modes; 10 labelled gaps remain undetected.**

Corrected contract: zero alerts in both modes. Completed modeled analysis does not cover the known gaps.

Local behaviour witnesses: **passed**. See summary.json for test and fuzz counts.

| Case | Entry point | Source | Native compiler | Paired behaviour |
| --- | --- | --- | --- | --- |
| RULE-001 | `originRestricted` | detected | detected | passed |
| RULE-002 | `withdrawLate` | detected | detected | passed |
| RULE-003 | `ignoreCall` | detected | detected | passed |
| RULE-004 | `ignoreSend` | detected | detected | passed |
| RULE-005 | `delegateTo` | detected | detected | passed |
| RULE-006 | `destroyTo` | detected | detected | passed |
| RULE-007 | `creditBatch` | detected | detected | passed |
| RULE-008 | `chooseRecipient` | detected | detected | passed |
| RULE-009 | `packedKey` | detected | detected | passed |
| RULE-010 | `ignoreToken` | detected | detected | passed |
| RULE-011 | `exactBalance` | detected | detected | passed |
| RULE-012 | `pushBatch` | detected | detected | passed |
| GAP-001 | `overflowAdd` | known_gap | known_gap | passed |
| GAP-002 | `narrowAmount` | known_gap | known_gap | passed |
| GAP-003 | `readPrice` | known_gap | known_gap | passed |
| GAP-004 | `claimVoucher` | known_gap | known_gap | passed |
| GAP-005 | `changeOperator` | known_gap | known_gap | passed |
| GAP-006 | `upgradeTo` | known_gap | known_gap | passed |
| GAP-007 | `trade` | known_gap | known_gap | passed |
| GAP-008 | `scaledShare` | known_gap | known_gap | passed |
| GAP-009 | `issueCredit` | known_gap | known_gap | passed |
| GAP-010 | `processQueue` | known_gap | known_gap | passed |

These are authored fixture checks, not independent accuracy estimates or a guarantee of production safety.
`--require-all` fails while any labelled gap remains; a default regression pass does not mean every case was detected.
Detailed JSON, SARIF, source bundles, input hashes and command receipts accompany this summary.

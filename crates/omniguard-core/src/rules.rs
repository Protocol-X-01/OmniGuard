use crate::Severity;
use serde::Serialize;

pub const RULE_SET: &str = "solidity-core/2026.11";

#[derive(Debug, Clone, Copy, Serialize)]
pub struct RuleDefinition {
    pub id: &'static str,
    pub title: &'static str,
    pub severity: Severity,
    pub confidence: &'static str,
    pub category: &'static str,
    pub description: &'static str,
    pub remediation: &'static str,
    pub limitations: &'static str,
    pub reference: &'static str,
}

macro_rules! rule {
    ($id:literal, $title:literal, $severity:ident, $confidence:literal, $category:literal, $description:literal, $fix:literal, $limits:literal, $reference:literal) => {
        RuleDefinition {
            id: $id,
            title: $title,
            severity: Severity::$severity,
            confidence: $confidence,
            category: $category,
            description: $description,
            remediation: $fix,
            limitations: $limits,
            reference: $reference,
        }
    };
}

pub const RULES: &[RuleDefinition] = &[
    rule!(
        "OG-SOL-001",
        "Authorization uses tx.origin",
        High,
        "high",
        "authorization",
        "tx.origin participates in a condition that can gate execution.",
        "Use msg.sender with an explicit role or ownership check, then add an access-control test.",
        "Recognizes require/assert conditions and if conditions; does not prove the surrounding policy.",
        "https://docs.soliditylang.org/en/latest/security-considerations.html#tx-origin"
    ),
    rule!(
        "OG-SOL-002",
        "State write follows an external call",
        High,
        "medium",
        "reentrancy",
        "An external interaction precedes a write to this contract's storage on a modeled execution path.",
        "Apply checks-effects-interactions and verify a reentrancy guard with a local regression test.",
        "Ordering indicator, not exploit proof. Source mode is local; solc mode follows bounded direct helpers, storage aliases and modifiers. Dynamic dispatch, unresolved effects and exhausted bounds are incomplete; reentrancy-lock safety is not proven.",
        "https://docs.soliditylang.org/en/latest/security-considerations.html#reentrancy"
    ),
    rule!(
        "OG-SOL-003",
        "Low-level call result is not checked",
        Medium,
        "high",
        "external-calls",
        "An address call/delegatecall/staticcall result is discarded, or its captured success flag is unused.",
        "Capture and enforce the success flag, or explicitly return it to a caller that handles failure.",
        "An observed use is not proof of correct failure handling; complex data-flow is not resolved.",
        "https://docs.soliditylang.org/en/latest/units-and-global-variables.html#members-of-address-types"
    ),
    rule!(
        "OG-SOL-004",
        "Ether send result is discarded",
        Medium,
        "high",
        "external-calls",
        "The boolean from an address send operation is discarded.",
        "Handle failed delivery explicitly; prefer a pull-payment design when recipients can reject Ether.",
        "Requires a locally resolved address receiver; imported or aliased types may remain unknown.",
        "https://docs.soliditylang.org/en/latest/security-considerations.html#sending-and-receiving-ether"
    ),
    rule!(
        "OG-SOL-005",
        "Caller controls a delegatecall target",
        High,
        "high",
        "code-execution",
        "An externally callable path delegates to a caller-derived target without a recognized preceding caller restriction.",
        "Use a trusted implementation target and enforce the intended caller/upgrade policy before delegation.",
        "Source mode tracks local parameters and aliases. Solc mode additionally binds direct helper arguments, storage roots and imported modifiers with bounded ordered effects. No global role-integrity proof; unresolved dispatch or effect limits are incomplete.",
        "https://docs.soliditylang.org/en/latest/security-considerations.html#authorized-proxies"
    ),
    rule!(
        "OG-SOL-006",
        "Selfdestruct lacks a local caller restriction",
        High,
        "medium",
        "authorization",
        "An externally callable path contains selfdestruct without a recognized preceding caller restriction.",
        "Remove the operation or enforce the intended caller policy and test unauthorized calls locally.",
        "Modern EVMs generally transfer the balance without deleting existing code; fork and creation-time semantics vary.",
        "https://docs.soliditylang.org/en/latest/units-and-global-variables.html#contract-related"
    ),
    rule!(
        "OG-SOL-007",
        "Loop repeatedly credits the full msg.value",
        High,
        "medium",
        "accounting",
        "A loop writes the whole msg.value into storage on each iteration.",
        "Compute and validate a per-item allocation before the loop, or require a single recipient per payment.",
        "Tracks direct writes and unmodified local aliases; does not infer protocol accounting invariants.",
        "https://github.com/crytic/slither/wiki/Detector-Documentation#msgvalue-inside-a-loop"
    ),
    rule!(
        "OG-SOL-008",
        "Block-derived array selection",
        Medium,
        "high",
        "randomness",
        "A block-derived value is used in modulo arithmetic to choose an array index.",
        "Use an appropriate verifiable randomness or commit/reveal design with an explicit adversary model.",
        "Direct expressions and unmodified local aliases; no interprocedural or cryptographic proof.",
        "https://docs.soliditylang.org/en/latest/units-and-global-variables.html#block-and-transaction-properties"
    ),
    rule!(
        "OG-SOL-009",
        "Packed hash combines dynamic inputs",
        High,
        "high",
        "encoding",
        "A hash uses packed encoding of two or more locally resolved string/bytes values, leaving input boundaries ambiguous.",
        "Use abi.encode with explicit types and domain separation for the intended hash or signature protocol.",
        "Currently resolves string/bytes declarations in the same source; purpose and downstream authorization are not inferred.",
        "https://docs.soliditylang.org/en/latest/abi-spec.html#non-standard-packed-mode"
    ),
    rule!(
        "OG-SOL-010",
        "Token operation boolean is discarded",
        Medium,
        "high",
        "token-handling",
        "A transfer/transferFrom/approve operation declared to return bool is used without its result.",
        "Use a compatible SafeERC20 wrapper or enforce the token's return value and test failure behavior.",
        "Source mode requires an unambiguous in-file interface; compiler mode uses the selected declaration across supplied files and overloads. Method names alone do not imply ERC-20 behavior.",
        "https://eips.ethereum.org/EIPS/eip-20"
    ),
    rule!(
        "OG-SOL-011",
        "Strict equality on contract Ether balance",
        Medium,
        "medium",
        "accounting",
        "A condition requires this contract's Ether balance to equal an exact value.",
        "Track internal accounting explicitly and avoid relying on an exact external Ether balance.",
        "Flags a fragile invariant, not a proven denial of service; intended accounting needs manual review.",
        "https://docs.soliditylang.org/en/latest/security-considerations.html#sending-and-receiving-ether"
    ),
    rule!(
        "OG-SOL-012",
        "Reverting Ether transfer inside a loop",
        Medium,
        "medium",
        "availability",
        "A payable-address transfer in a loop lets a rejecting recipient revert the whole batch.",
        "Use independently claimable payments or isolate recipient failures without losing accounting correctness.",
        "Does not establish loop bounds, recipient trust or protocol-level impact.",
        "https://docs.soliditylang.org/en/latest/security-considerations.html#gas-limit-and-loops"
    ),
];

pub fn get(id: &str) -> &'static RuleDefinition {
    RULES
        .iter()
        .find(|rule| rule.id == id)
        .expect("registered detection rule")
}

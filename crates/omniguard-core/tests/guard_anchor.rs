use omniguard_core::{CompilerOptions, scan_path_with_compiler, validate_finding};
use std::fs;

// Independently authored, isolated source fixtures. A checked delegatecall
// result avoids confusing the authorization regression with unchecked results.
fn check_guard_anchors(compiler: Option<&CompilerOptions>) {
    let cases = [
        (
            "caller_overwrites_anchor",
            "",
            "owner = msg.sender; require(msg.sender == owner);",
            true,
        ),
        (
            "parameter_overwrites_anchor",
            "",
            "owner = target; require(owner == msg.sender);",
            true,
        ),
        (
            "tuple_overwrites_anchor",
            "",
            "(owner, other) = (msg.sender, target); require(msg.sender == owner);",
            true,
        ),
        (
            "branch_may_overwrite_anchor",
            "",
            "if (target != address(0)) { owner = msg.sender; } require(msg.sender == owner);",
            true,
        ),
        (
            "deleted_anchor",
            "",
            "delete owner; require(msg.sender == owner);",
            true,
        ),
        (
            "denial_guard_poisoned",
            "",
            "owner = msg.sender; if (msg.sender != owner) { revert(); }",
            true,
        ),
        (
            "conditional_guard_poisoned",
            "",
            "owner = msg.sender;",
            true,
        ),
        (
            "unchanged_guard",
            "",
            "require(msg.sender == owner);",
            false,
        ),
        (
            "immutable_guard",
            "immutable",
            "require(msg.sender == owner);",
            false,
        ),
        (
            "other_state_write",
            "",
            "other = msg.sender; require(msg.sender == owner);",
            false,
        ),
        (
            "shadowed_local_write",
            "",
            "{ address owner; owner = msg.sender; } require(msg.sender == owner);",
            false,
        ),
        (
            "authorized_rotation",
            "",
            "require(msg.sender == owner); owner = target;",
            false,
        ),
        ("unguarded", "", "", true),
    ];
    for (name, qualifier, prefix, expected) in cases {
        let temp = tempfile::tempdir().unwrap();
        let call = "(bool ok,) = target.delegatecall(data); require(ok);";
        let action = if name == "conditional_guard_poisoned" {
            format!("if (msg.sender == owner) {{ {call} }}")
        } else {
            call.into()
        };
        let source = format!(
            "pragma solidity ^0.8.26; contract Case {{ address {qualifier} owner; address other; constructor() {{ owner = msg.sender; }} function run(address target, bytes calldata data) external {{ {prefix} {action} }} }}"
        );
        fs::write(temp.path().join("Case.sol"), source).unwrap();
        let report = scan_path_with_compiler(temp.path(), compiler).unwrap();
        assert!(report.coverage.complete, "{name}: {:?}", report.diagnostics);
        let actual = report.findings.iter().any(|f| f.rule_id == "OG-SOL-005");
        assert_eq!(actual, expected, "{name}: {:?}", report.findings);
        for finding in &report.findings {
            validate_finding(temp.path(), finding).unwrap();
        }
    }

    for (name, modifier, expected) in [
        (
            "poisoned_modifier",
            "owner = msg.sender; require(msg.sender == owner); _;",
            true,
        ),
        (
            "unchanged_modifier",
            "require(msg.sender == owner); _;",
            false,
        ),
    ] {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("Case.sol"), format!(
            "pragma solidity ^0.8.26; contract Case {{ address owner; constructor() {{ owner = msg.sender; }} modifier gate() {{ {modifier} }} function run(address target, bytes calldata data) external gate {{ (bool ok,) = target.delegatecall(data); require(ok); }} }}"
        )).unwrap();
        let report = scan_path_with_compiler(temp.path(), compiler).unwrap();
        assert!(report.coverage.complete, "{name}: {:?}", report.diagnostics);
        assert_eq!(
            report.findings.iter().any(|f| f.rule_id == "OG-SOL-005"),
            expected,
            "{name}: {:?}",
            report.findings
        );
    }
}

#[test]
fn source_mode_does_not_trust_an_overwritten_authority_anchor() {
    check_guard_anchors(None);
}

#[test]
#[ignore = "requires OMNIGUARD_TEST_SOLC: actual native Solidity 0.8.26"]
fn compiler_mode_does_not_trust_an_overwritten_authority_anchor() {
    let compiler = CompilerOptions::new(std::env::var_os("OMNIGUARD_TEST_SOLC").unwrap());
    check_guard_anchors(Some(&compiler));
}

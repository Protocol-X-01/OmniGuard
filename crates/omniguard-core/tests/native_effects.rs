//! Development cases authored before reading the independent effect challenge corpus.
use omniguard_core::{CompilerOptions, ScanReport, scan_path_with_compiler, validate_finding};
use std::fs;

fn scan(files: &[(&str, &str)]) -> (tempfile::TempDir, ScanReport) {
    let root = tempfile::tempdir().unwrap();
    for (file, body) in files {
        fs::write(
            root.path().join(file),
            format!("pragma solidity ^0.8.26;\n{body}"),
        )
        .unwrap();
    }
    let compiler = CompilerOptions::new(std::env::var_os("OMNIGUARD_TEST_SOLC").unwrap());
    let report = scan_path_with_compiler(root.path(), Some(&compiler)).unwrap();
    for f in &report.findings {
        validate_finding(root.path(), f).unwrap();
    }
    (root, report)
}
fn count(report: &ScanReport, rule: &str) -> usize {
    report.findings.iter().filter(|f| f.rule_id == rule).count()
}

#[test]
#[ignore = "requires OMNIGUARD_TEST_SOLC: native Solidity 0.8.26"]
fn imported_modifier_identity_and_order_determine_authorization() {
    for (body, expected) in [
        ("_;", 1),
        ("require(msg.sender == owner); _;", 0),
        ("_; require(msg.sender == owner);", 1),
        ("owner = msg.sender; require(msg.sender == owner); _;", 1),
    ] {
        let base =
            format!("abstract contract Base {{ address owner; modifier admin() {{ {body} }} }}");
        let (_, r) = scan(&[
            ("Base.sol", &base),
            (
                "Run.sol",
                "import './Base.sol'; contract Run is Base { function run(address target, bytes calldata data) external admin { (bool ok,) = target.delegatecall(data); require(ok); } }",
            ),
        ]);
        assert!(r.coverage.complete, "{:?}", r.diagnostics);
        assert_eq!(count(&r, "OG-SOL-005"), expected, "{body}");
        if expected > 0 {
            assert!(
                r.findings
                    .iter()
                    .find(|f| f.rule_id == "OG-SOL-005")
                    .unwrap()
                    .evidence
                    .related
                    .iter()
                    .any(|e| e.location.file == "Base.sol")
            );
        }
    }
}

#[test]
#[ignore = "requires OMNIGUARD_TEST_SOLC: native Solidity 0.8.26"]
fn aliases_and_direct_reassignment_track_roots_and_order() {
    let interaction = "(bool ok,) = to.call(''); require(ok);";
    for (body, expected, root_name) in [
        (
            format!("Entry storage x = a; {interaction} x.amount = 0;"),
            1,
            "a",
        ),
        (
            format!("Entry storage x = a; x.amount = 0; {interaction}"),
            0,
            "a",
        ),
        (
            format!("Entry storage x = a; x = b; {interaction} x.amount = 0;"),
            1,
            "b",
        ),
        (
            format!("Entry memory x = a; {interaction} x.amount = 0;"),
            0,
            "a",
        ),
    ] {
        let source = format!(
            "contract C {{ struct Entry {{uint amount;}} Entry a; Entry b; function run(address to) external {{ {body} }} }}"
        );
        let (_, r) = scan(&[("Case.sol", &source)]);
        assert!(r.coverage.complete, "{:?}", r.diagnostics);
        assert_eq!(count(&r, "OG-SOL-002"), expected, "{body}");
        if expected > 0 {
            assert!(
                r.findings
                    .iter()
                    .find(|f| f.rule_id == "OG-SOL-002")
                    .unwrap()
                    .evidence
                    .related
                    .iter()
                    .any(|e| e.label.contains("storage root")
                        && e.excerpt == format!("Entry {root_name}")),
                "{:?}",
                r.findings
            );
        }
    }
}

#[test]
#[ignore = "requires OMNIGUARD_TEST_SOLC: native Solidity 0.8.26"]
fn helper_effects_bind_storage_and_target_parameters_across_files() {
    let base = "abstract contract Base { struct Entry {uint amount;} Entry a; function pay(address target) internal { (bool ok,) = target.call(''); require(ok); } function clear(Entry storage x) internal { x.amount = 0; } }";
    for (body, expected) in [("pay(to); clear(a);", 1), ("clear(a); pay(to);", 0)] {
        let run = format!(
            "import './Base.sol'; contract C is Base {{ function run(address to) external {{ {body} }} }}"
        );
        let (_, r) = scan(&[("Base.sol", base), ("Run.sol", &run)]);
        assert!(r.coverage.complete, "{:?}", r.diagnostics);
        assert_eq!(count(&r, "OG-SOL-002"), expected, "{:?}", r.findings);
        if expected > 0 {
            let f = r
                .findings
                .iter()
                .find(|f| f.rule_id == "OG-SOL-002")
                .unwrap();
            assert_eq!(f.evidence.excerpt, "pay(to)");
            assert!(
                f.evidence
                    .related
                    .iter()
                    .any(|e| e.location.file == "Base.sol" && e.label == "Later storage write")
            );
            assert!(f.evidence.related.len() <= 8);
        }
    }
}

#[test]
#[ignore = "requires OMNIGUARD_TEST_SOLC: native Solidity 0.8.26"]
fn helper_delegate_target_binding_and_caller_sites_are_distinct() {
    let source = "contract C { address fixedTarget; function invoke(address target) private { (bool ok,) = target.delegatecall(''); require(ok); } function run(address callerTarget, bool first) external { if (first) { invoke(callerTarget); } else { invoke(callerTarget); } invoke(fixedTarget); } }";
    let (_, r) = scan(&[("Case.sol", source)]);
    assert!(r.coverage.complete, "{:?}", r.diagnostics);
    let fs: Vec<_> = r
        .findings
        .iter()
        .filter(|f| f.rule_id == "OG-SOL-005")
        .collect();
    assert_eq!(fs.len(), 2, "{:?}", r.findings);
    assert_ne!(fs[0].location.byte_start, fs[1].location.byte_start);
}

#[test]
#[ignore = "requires OMNIGUARD_TEST_SOLC: native Solidity 0.8.26"]
fn exclusive_branches_and_helper_termination_preserve_order() {
    for (body, helper, expected) in [
        ("if (flag) { pay(to); } else { amount=0; }", "", 0),
        ("pay(to); return; amount=0;", "", 0),
        (
            "pay(to); stop(); amount=0;",
            "function stop() private pure { revert(); }",
            0,
        ),
        (
            "pay(to); stop(); amount=0;",
            "function stop() private pure { return; }",
            1,
        ),
    ] {
        let source = format!(
            "contract C {{ uint amount; function pay(address target) private {{ (bool ok,) = target.call(''); require(ok); }} {helper} function run(address to,bool flag) external {{ {body} }} }}"
        );
        let (_, r) = scan(&[("Case.sol", &source)]);
        assert!(r.coverage.complete, "{:?}", r.diagnostics);
        assert_eq!(count(&r, "OG-SOL-002"), expected, "{body} {helper}");
    }
}

#[test]
#[ignore = "requires OMNIGUARD_TEST_SOLC: native Solidity 0.8.26"]
fn recursion_virtual_dispatch_and_function_pointers_are_incomplete() {
    for source in [
        "contract C { function recurse(uint x) private { if(x>0) recurse(x-1); } function run(uint x) external {recurse(x);} }",
        "contract C { function helper() internal virtual {} function run() external {helper();} }",
        "contract C { function noop() internal {} function run() external {function() internal f = noop; f();} }",
    ] {
        let (_, r) = scan(&[("Case.sol", source)]);
        assert!(!r.coverage.complete);
        assert!(
            r.diagnostics
                .iter()
                .any(|d| d.code == "native-effects-incomplete"),
            "{:?}",
            r.diagnostics
        );
    }
}

#[test]
#[ignore = "requires OMNIGUARD_TEST_SOLC: native Solidity 0.8.26"]
fn modifier_suffix_after_return_and_distinct_modifier_invocations() {
    let source = "contract C { uint amount; modifier tail() { _; amount=0; } function run(address to) external tail { (bool ok,)=to.call(''); require(ok); return; } }";
    let (_, r) = scan(&[("Case.sol", source)]);
    assert!(r.coverage.complete, "{:?}", r.diagnostics);
    assert_eq!(count(&r, "OG-SOL-002"), 1);
    let source = "contract C { modifier invoke(address target) { (bool ok,)=target.delegatecall(''); require(ok); _; } function one(address target) external invoke(target) {} function two(address target) external invoke(target) {} }";
    let (_, r) = scan(&[("Case.sol", source)]);
    assert!(r.coverage.complete, "{:?}", r.diagnostics);
    assert_eq!(count(&r, "OG-SOL-005"), 2, "{:?}", r.findings);
}

#[test]
#[ignore = "requires OMNIGUARD_TEST_SOLC: native Solidity 0.8.26"]
fn named_arguments_and_unmodeled_return_provenance() {
    let source = "contract C { address fixedTarget; function invoke(uint unused,address target) private { (bool ok,)=target.delegatecall(''); require(ok); } function run(address target) external { invoke({target:target,unused:0}); invoke({target:fixedTarget,unused:0}); } }";
    let (_, r) = scan(&[("Case.sol", source)]);
    assert!(r.coverage.complete, "{:?}", r.diagnostics);
    assert_eq!(count(&r, "OG-SOL-005"), 1, "{:?}", r.findings);
    let source = "contract C { function identity(address a) private pure returns(address) { return a; } function run(address a) external { address target=identity(a); (bool ok,)=target.delegatecall(''); require(ok); } }";
    let (_, r) = scan(&[("Case.sol", source)]);
    assert!(!r.coverage.complete);
    assert!(
        r.diagnostics
            .iter()
            .any(|d| d.message.contains("return-value")),
        "{:?}",
        r.diagnostics
    );
}

#[test]
#[ignore = "requires OMNIGUARD_TEST_SOLC: native Solidity 0.8.26"]
fn path_limits_are_incomplete_and_break_preserves_post_loop_effects() {
    let branches = (0..7)
        .map(|i| {
            format!(
                "if (flags[{i}]) {{ amount={i}; }} else {{ amount={}; }}",
                i + 1
            )
        })
        .collect::<String>();
    let source = format!(
        "contract C {{ uint amount; function run(bool[7] calldata flags) external {{ {branches} }} }}"
    );
    let (_, r) = scan(&[("Case.sol", &source)]);
    assert!(!r.coverage.complete);
    assert!(
        r.diagnostics
            .iter()
            .any(|d| d.message.contains("path bound")),
        "{:?}",
        r.diagnostics
    );
    let source = "contract C { uint amount; function run(address to) external { while(amount>0) { (bool ok,)=to.call(''); require(ok); break; } amount=0; } }";
    let (_, r) = scan(&[("Case.sol", source)]);
    assert!(r.coverage.complete, "{:?}", r.diagnostics);
    assert_eq!(count(&r, "OG-SOL-002"), 1, "{:?}", r.findings);
}

#[test]
#[ignore = "requires OMNIGUARD_TEST_SOLC: native Solidity 0.8.26"]
fn short_circuit_guard_helpers_authorize_only_executed_paths() {
    // Disclosed reviewer concern, now a development regression (not held-out).
    for (condition, expected) in [
        ("false && guardHelper()", 1),
        ("true || guardHelper()", 1),
        ("flag && guardHelper()", 1),
        ("flag || guardHelper()", 1),
        ("true && guardHelper()", 0),
        ("false || guardHelper()", 0),
        ("guardHelper() && false", 0),
        ("guardHelper() || true", 0),
    ] {
        let source = format!(
            "contract C {{ address owner; function guardHelper() private view returns(bool) {{ require(msg.sender == owner); return true; }} function run(address target,bool flag) external {{ bool checked={condition}; (bool ok,)=target.delegatecall(''); require(ok); }} function destroy(address payable recipient,bool flag) external {{ bool checked={condition}; selfdestruct(recipient); }} }}"
        );
        let (_, r) = scan(&[("Case.sol", &source)]);
        assert!(r.coverage.complete, "{condition}: {:?}", r.diagnostics);
        assert_eq!(
            count(&r, "OG-SOL-005"),
            expected,
            "{condition}: {:?}",
            r.findings
        );
        assert_eq!(
            count(&r, "OG-SOL-006"),
            expected,
            "{condition}: {:?}",
            r.findings
        );
    }
}

#[test]
#[ignore = "requires OMNIGUARD_TEST_SOLC: native Solidity 0.8.26"]
fn reference_formals_distinguish_storage_aliases_from_memory_copies() {
    // Disclosed reviewer concern, now a development regression.
    for (location, expected) in [("memory", 0), ("storage", 1)] {
        let source = format!(
            "contract C {{ struct Entry {{uint amount;}} Entry stored; function clear(Entry {location} copy) private {{ copy.amount=0; }} function run(address to) external {{ (bool ok,)=to.call(''); require(ok); clear(stored); }} }}"
        );
        let (_, r) = scan(&[("Case.sol", &source)]);
        assert!(r.coverage.complete, "{location}: {:?}", r.diagnostics);
        assert_eq!(
            count(&r, "OG-SOL-002"),
            expected,
            "{location}: {:?}",
            r.findings
        );
    }
    let source = "contract C { address owner; function gate(address allowed) private view { require(msg.sender==allowed); } function run(address target) external { gate(owner); (bool ok,)=target.delegatecall(''); require(ok); } }";
    let (_, r) = scan(&[("Case.sol", source)]);
    assert!(r.coverage.complete, "{:?}", r.diagnostics);
    assert_eq!(count(&r, "OG-SOL-005"), 0, "{:?}", r.findings);
}

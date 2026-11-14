use omniguard_core::{CompilerOptions, scan_path_with_compiler, validate_finding};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures")
        .join(name)
}
fn native() -> CompilerOptions {
    CompilerOptions::new(
        std::env::var_os("OMNIGUARD_TEST_SOLC")
            .expect("Set OMNIGUARD_TEST_SOLC to a native Solidity 0.8.26 executable"),
    )
}
fn case_results(name: &str) {
    let root = fixture(name);
    let manifest: Value =
        serde_json::from_str(&fs::read_to_string(root.join("manifest.json")).unwrap()).unwrap();
    let report = scan_path_with_compiler(&root, Some(&native())).unwrap();
    assert!(report.coverage.complete, "{:?}", report.diagnostics);
    assert_eq!(report.analysis.mode, "solc");
    assert!(
        report
            .analysis
            .compiler_version
            .as_ref()
            .unwrap()
            .starts_with("0.8.26+")
    );
    let mut failures = Vec::new();
    for case in manifest["cases"].as_array().unwrap() {
        let file = case["path"].as_str().unwrap();
        let mut expected = case["expected"]
            .as_array()
            .unwrap()
            .iter()
            .map(|r| r.as_str().unwrap().to_string())
            .collect::<Vec<_>>();
        let mut actual = report
            .findings
            .iter()
            .filter(|f| f.location.file == file)
            .map(|f| f.rule_id.clone())
            .collect::<Vec<_>>();
        expected.sort();
        actual.sort();
        if expected != actual {
            failures.push(format!("{file}: expected {expected:?}, got {actual:?}"));
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
    for finding in &report.findings {
        assert!(finding.evidence.validated);
        validate_finding(&root.join("src"), finding).unwrap();
    }
}

#[test]
#[ignore = "requires OMNIGUARD_TEST_SOLC: actual native Solidity 0.8.26"]
fn compiler_resolves_frozen_import_overload_struct_and_inheritance_challenges() {
    case_results("semantic-challenges");
}

#[test]
#[ignore = "requires OMNIGUARD_TEST_SOLC: actual native Solidity 0.8.26"]
fn compiler_mode_preserves_the_previous_sixty_case_corpus() {
    case_results("rule-corpus");
}

#[test]
#[ignore = "requires OMNIGUARD_TEST_SOLC: actual native Solidity 0.8.26"]
fn cross_file_evidence_checks_each_source_digest_and_path() {
    let root = fixture("semantic-challenges");
    let report = scan_path_with_compiler(&root, Some(&native())).unwrap();
    let found = report
        .findings
        .iter()
        .find(|f| f.location.file == "ImportedToken.sol")
        .unwrap();
    assert_eq!(
        found.evidence.related[0].location.file,
        "deps/Interfaces.sol"
    );
    for mutation in ["digest", "excerpt", "path"] {
        let mut changed = found.clone();
        match mutation {
            "digest" => changed.evidence.related[0].source_sha256 = Some("f".repeat(64)),
            "excerpt" => changed.evidence.related[0].excerpt.push('x'),
            _ => changed.evidence.related[0].location.file = "../Outside.sol".into(),
        }
        assert!(
            validate_finding(&root.join("src"), &changed).is_err(),
            "{mutation}"
        );
    }
}

#[test]
#[ignore = "requires OMNIGUARD_TEST_SOLC: actual native Solidity 0.8.26"]
fn compiler_json_errors_and_external_imports_make_analysis_incomplete() {
    let temp = tempfile::tempdir().unwrap();
    let selected = temp.path().join("selected");
    fs::create_dir(&selected).unwrap();
    fs::write(selected.join("Bad.sol"),"pragma solidity ^0.8.26; contract Bad { function run() external { uint256 x = address(this); } }").unwrap();
    let bad = scan_path_with_compiler(&selected, Some(&native())).unwrap();
    assert!(!bad.coverage.complete);
    assert!(
        bad.findings.is_empty(),
        "Requested compiler analysis must not silently downgrade."
    );
    assert!(bad.diagnostics.iter().any(|d| d.code == "solc-error"));
    // The file exists immediately outside the selected snapshot; solc must not load it.
    fs::write(
        temp.path().join("Outside.sol"),
        "pragma solidity ^0.8.26; contract Outside {}",
    )
    .unwrap();
    fs::write(
        selected.join("Bad.sol"),
        "pragma solidity ^0.8.26; import '../Outside.sol'; contract Bad is Outside {}",
    )
    .unwrap();
    let missing = scan_path_with_compiler(&selected, Some(&native())).unwrap();
    assert!(!missing.coverage.complete);
    assert!(
        missing
            .diagnostics
            .iter()
            .any(|d| d.message.contains("import callback")),
        "{:?}",
        missing.diagnostics
    );
    assert_eq!(missing.coverage.files, vec!["Bad.sol"]);
}

#[test]
fn a_missing_requested_compiler_never_falls_back_to_source_mode() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(temp.path().join("A.sol"),"pragma solidity ^0.8.26; contract A { function go() external view { require(tx.origin == msg.sender); } }").unwrap();
    let report = scan_path_with_compiler(
        temp.path(),
        Some(&CompilerOptions::new(temp.path().join("missing-solc"))),
    )
    .unwrap();
    assert_eq!(report.analysis.mode, "solc");
    assert!(!report.coverage.complete);
    assert!(report.findings.is_empty());
    assert!(
        report
            .diagnostics
            .iter()
            .any(|d| d.code == "solc-incomplete")
    );
}

#[test]
#[cfg(unix)]
fn an_unresponsive_compiler_is_stopped_at_the_configured_deadline() {
    use std::os::unix::fs::PermissionsExt;
    use std::time::{Duration, Instant};
    let temp = tempfile::tempdir().unwrap();
    fs::write(
        temp.path().join("A.sol"),
        "pragma solidity ^0.8.26; contract A {}",
    )
    .unwrap();
    let executable = temp.path().join("compiler");
    fs::write(&executable, "#!/bin/sh\nsleep 10\nexit 0\n").unwrap();
    fs::set_permissions(&executable, fs::Permissions::from_mode(0o700)).unwrap();
    let mut options = CompilerOptions::new(executable);
    options.timeout = Duration::from_millis(30);
    let start = Instant::now();
    let report = scan_path_with_compiler(temp.path(), Some(&options)).unwrap();
    assert!(start.elapsed() < Duration::from_secs(2));
    assert!(!report.coverage.complete);
    assert!(
        report
            .diagnostics
            .iter()
            .any(|d| d.message.contains("timed out"))
    );
}

#[test]
#[ignore = "requires OMNIGUARD_TEST_SOLC: actual native Solidity 0.8.26"]
fn inherited_builtin_named_state_is_not_mistaken_for_transaction_or_block_globals() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(temp.path().join("Base.sol"), "pragma solidity ^0.8.26; struct Origin { address origin; } struct Header { uint256 number; } abstract contract Base { Origin internal tx; Header internal block; address internal owner; }").unwrap();
    fs::write(temp.path().join("Derived.sol"), "pragma solidity ^0.8.26; import './Base.sol'; contract Derived is Base { address[] entries; function run() external view returns(address) { require(tx.origin == owner); return entries[uint256(keccak256(abi.encodePacked(block.number))) % entries.length]; } }").unwrap();
    let report = scan_path_with_compiler(temp.path(), Some(&native())).unwrap();
    assert!(report.coverage.complete, "{:?}", report.diagnostics);
    assert!(report.findings.is_empty(), "{:?}", report.findings);
}

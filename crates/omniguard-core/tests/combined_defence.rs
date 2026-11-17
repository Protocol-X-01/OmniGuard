use omniguard_core::{CompilerOptions, rules, scan_path_with_compiler, validate_finding};
use serde::Deserialize;
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Deserialize)]
struct Manifest {
    cases: Vec<Case>,
}

#[derive(Deserialize)]
struct Case {
    id: String,
    kind: String,
    function: String,
    rule_id: Option<String>,
    witness: String,
}

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/combined-defence")
}

fn verify(compiler: Option<&CompilerOptions>) {
    let root = root();
    let manifest: Manifest =
        serde_json::from_str(&fs::read_to_string(root.join("manifest.json")).unwrap()).unwrap();
    let witnesses = fs::read_to_string(root.join("test/DefenceLab.t.sol")).unwrap();
    let mut ids = BTreeSet::new();
    let mut functions = BTreeSet::new();
    let mut expected = Vec::new();
    let mut gaps = 0;
    for case in &manifest.cases {
        assert!(ids.insert(&case.id), "duplicate case {}", case.id);
        assert!(functions.insert(&case.function), "duplicate entry point");
        assert!(
            witnesses.contains(&format!("function {}(", case.witness)),
            "missing behaviour witness for {}",
            case.id
        );
        match (&*case.kind, &case.rule_id) {
            ("implemented", Some(rule)) => expected.push((rule.clone(), case.function.clone())),
            ("known_gap", None) => gaps += 1,
            _ => panic!("invalid case classification {}", case.id),
        }
    }
    assert_eq!(gaps, 10, "review the gap register when coverage changes");
    assert_eq!(
        expected
            .iter()
            .map(|(rule, _)| rule.as_str())
            .collect::<BTreeSet<_>>(),
        rules::RULES.iter().map(|rule| rule.id).collect()
    );
    expected.sort();

    for variant in ["vulnerable", "fixed"] {
        let project = root.join(variant);
        let report = scan_path_with_compiler(&project, compiler).unwrap();
        assert_eq!(
            report.scanned_files, 1,
            "must scan the complete combined source"
        );
        assert_eq!(report.coverage.files, ["DefenceLab.sol"]);
        assert!(
            report.coverage.complete,
            "{variant}: {:?}",
            report.diagnostics
        );
        assert_eq!(
            report.analysis.mode,
            if compiler.is_some() { "solc" } else { "source" }
        );
        if compiler.is_some() {
            assert!(
                report
                    .analysis
                    .compiler_version
                    .as_ref()
                    .unwrap()
                    .starts_with("0.8.26+")
            );
        }
        let mut actual = Vec::new();
        let mut fingerprints = BTreeSet::new();
        for finding in &report.findings {
            assert!(fingerprints.insert(&finding.id), "duplicate fingerprint");
            assert_eq!(finding.context.contract.as_deref(), Some("DefenceLab"));
            assert!(finding.evidence.validated);
            validate_finding(&project.join("src"), finding).unwrap();
            actual.push((
                finding.rule_id.clone(),
                finding.context.function.clone().unwrap(),
            ));
        }
        actual.sort();
        let wanted = if variant == "vulnerable" {
            expected.clone()
        } else {
            Vec::new()
        };
        assert_eq!(
            actual, wanted,
            "{variant}: wrong rule, function, count or fixed-case alert"
        );
    }
    // The ten no-rule cases are explicitly reported gaps, not successful detections.
    // Foundry executes their separate vulnerable/fixed behavioural witnesses.
}

#[test]
fn source_mode_checks_all_rules_in_one_contract_and_a_matching_fixed_contract() {
    verify(None);
}

#[test]
#[ignore = "requires OMNIGUARD_TEST_SOLC: native Solidity 0.8.26"]
fn compiler_mode_checks_all_rules_in_one_contract_and_a_matching_fixed_contract() {
    let compiler = CompilerOptions::new(
        std::env::var_os("OMNIGUARD_TEST_SOLC")
            .expect("Set OMNIGUARD_TEST_SOLC to native solc 0.8.26"),
    );
    verify(Some(&compiler));
}

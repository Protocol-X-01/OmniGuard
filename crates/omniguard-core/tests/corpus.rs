use omniguard_core::{rules, scan_path, validate_finding};
use serde::Deserialize;
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Deserialize)]
struct Corpus {
    cases: Vec<Case>,
}
#[derive(Deserialize)]
struct Case {
    id: String,
    path: String,
    expected: Vec<String>,
}
fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/rule-corpus")
}

#[test]
fn labelled_solidity_corpus_has_exact_findings_and_valid_related_evidence() {
    let root = root();
    let corpus: Corpus =
        serde_json::from_str(&fs::read_to_string(root.join("manifest.json")).unwrap()).unwrap();
    let mut failures = Vec::new();
    let mut positive_rules = BTreeSet::new();
    for case in corpus.cases {
        let source = root.join("src").join(&case.path);
        let report = scan_path(&source).unwrap();
        let mut actual = report
            .findings
            .iter()
            .map(|finding| finding.rule_id.clone())
            .collect::<Vec<_>>();
        actual.sort();
        let mut expected = case.expected;
        expected.sort();
        positive_rules.extend(expected.iter().cloned());
        if actual != expected || !report.coverage.complete {
            failures.push(format!(
                "{}: expected {:?}, got {:?}; diagnostics {:?}",
                case.id, expected, actual, report.diagnostics
            ));
        }
        for finding in report.findings {
            assert!(finding.evidence.validated, "{}", case.id);
            validate_finding(source.parent().unwrap(), &finding).unwrap();
            assert!(finding.context.contract.is_some(), "{}", case.id);
        }
    }
    assert_eq!(
        positive_rules,
        rules::RULES
            .iter()
            .map(|rule| rule.id.to_string())
            .collect()
    );
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn empty_directory_and_empty_source_are_incomplete() {
    let temp = tempfile::tempdir().unwrap();
    let empty = scan_path(temp.path()).unwrap();
    assert!(!empty.coverage.complete);
    assert!(
        empty
            .diagnostics
            .iter()
            .any(|item| item.code == "no-solidity-files")
    );
    fs::write(temp.path().join("Empty.sol"), "  \n").unwrap();
    let empty_file = scan_path(&temp.path().join("Empty.sol")).unwrap();
    assert!(!empty_file.coverage.complete);
    assert!(
        empty_file
            .diagnostics
            .iter()
            .any(|item| item.code == "empty-source")
    );
}

#[test]
fn related_source_evidence_rejects_tampering() {
    let source = root().join("src/positive/rule_002_vulnerable.sol");
    let report = scan_path(&source).unwrap();
    let mut finding = report
        .findings
        .into_iter()
        .find(|finding| finding.rule_id == "OG-SOL-002")
        .unwrap();
    assert!(!finding.evidence.related.is_empty());
    finding.evidence.related[0].excerpt.push('x');
    assert!(validate_finding(source.parent().unwrap(), &finding).is_err());
}

#[test]
fn foundry_configuration_cannot_expand_scan_outside_selected_project() {
    let temp = tempfile::tempdir().unwrap();
    let project = temp.path().join("project");
    fs::create_dir(&project).unwrap();
    fs::write(
        project.join("foundry.toml"),
        "[profile.default]\nsrc = '../outside'\n",
    )
    .unwrap();
    fs::create_dir(temp.path().join("outside")).unwrap();
    assert!(scan_path(&project).is_err());
}

#[cfg(unix)]
#[test]
fn symbolic_sources_are_reported_as_missing_coverage() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(temp.path().join("Real.sol"), "contract Real {}").unwrap();
    std::os::unix::fs::symlink(temp.path().join("Real.sol"), temp.path().join("Linked.sol"))
        .unwrap();
    let report = scan_path(temp.path()).unwrap();
    assert!(!report.coverage.complete);
    assert!(
        report
            .diagnostics
            .iter()
            .any(|item| item.code == "symlink-skipped")
    );
}

#[cfg(unix)]
#[test]
fn explicitly_selected_symbolic_files_directories_and_dangling_links_are_incomplete() {
    use omniguard_core::{CompilerOptions, scan_path_with_compiler};
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("real");
    fs::create_dir(&source).unwrap();
    fs::write(source.join("Real.sol"), "contract Real {}").unwrap();
    let compiler = CompilerOptions::new("/compiler-must-not-be-invoked-for-a-link");
    for (target, name) in [
        (source.join("Real.sol"), "Linked.sol"),
        (source, "linked-directory"),
        (temp.path().join("missing.sol"), "Dangling.sol"),
    ] {
        let link = temp.path().join(name);
        std::os::unix::fs::symlink(target, &link).unwrap();
        for mode in [None, Some(&compiler)] {
            let report = scan_path_with_compiler(&link, mode).unwrap();
            assert!(!report.coverage.complete, "{name}");
            assert_eq!(report.scanned_files, 0, "{name}");
            assert!(report.findings.is_empty(), "{name}");
            assert!(report.coverage.source_sha256.is_empty(), "{name}");
            assert!(
                report
                    .diagnostics
                    .iter()
                    .any(|item| item.code == "symlink-skipped"),
                "{name}"
            );
        }
    }
}

#[test]
fn malformed_foundry_source_path_type_does_not_fall_back_silently() {
    let temp = tempfile::tempdir().unwrap();
    fs::create_dir(temp.path().join("src")).unwrap();
    fs::write(
        temp.path().join("src/Unrelated.sol"),
        "contract Unrelated {}",
    )
    .unwrap();
    fs::write(
        temp.path().join("foundry.toml"),
        "[profile.default]\nsrc = 123\n",
    )
    .unwrap();
    assert!(scan_path(temp.path()).is_err());
}

#[test]
fn multibyte_comments_preserve_exact_character_columns_and_safe_byte_spans() {
    let temp = tempfile::tempdir().unwrap();
    let source = "contract Unicode { address owner; function f() external view { /* π🛡 */ require(tx.origin == owner); } }";
    fs::write(temp.path().join("Unicode.sol"), source).unwrap();
    let report = scan_path(temp.path()).unwrap();
    assert!(report.coverage.complete);
    let mut finding = report.findings[0].clone();
    assert_eq!(finding.evidence.excerpt, "tx.origin");
    assert_eq!(
        finding.location.start_column,
        source[..finding.location.byte_start].chars().count() + 1
    );
    validate_finding(temp.path(), &finding).unwrap();
    finding.location.byte_start = source.find('π').unwrap() + 1;
    assert!(validate_finding(temp.path(), &finding).is_err());
}

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use thiserror::Error;
use tree_sitter::Node;

mod analysis;
mod compiler;
mod effects;
pub use compiler::CompilerOptions;
pub mod rules;
pub use analysis::analyze_source;
use walkdir::WalkDir;

pub const ENGINE_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const SCHEMA_VERSION: u32 = 3;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Low,
    Medium,
    High,
    Critical,
}

impl Severity {
    pub fn rank(&self) -> u8 {
        match self {
            Self::Low => 1,
            Self::Medium => 2,
            Self::High => 3,
            Self::Critical => 4,
        }
    }

    pub fn as_sarif_level(&self) -> &'static str {
        match self {
            Self::Critical | Self::High => "error",
            Self::Medium => "warning",
            Self::Low => "note",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ScanReport {
    pub schema_version: u32,
    pub engine_version: String,
    pub scanned_files: usize,
    #[serde(default)]
    pub analysis: AnalysisProfile,
    pub coverage: ScanCoverage,
    pub diagnostics: Vec<ScanDiagnostic>,
    pub findings: Vec<Finding>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AnalysisProfile {
    pub mode: String,
    pub compiler_version: Option<String>,
}
impl Default for AnalysisProfile {
    fn default() -> Self {
        Self {
            mode: "source".into(),
            compiler_version: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ScanCoverage {
    pub rule_set: String,
    pub rules: Vec<String>,
    pub files: Vec<String>,
    pub source_sha256: BTreeMap<String, String>,
    pub complete: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FindingContext {
    pub contract: Option<String>,
    pub function: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ScanDiagnostic {
    pub code: String,
    pub message: String,
    pub file: Option<String>,
    pub line: Option<usize>,
    pub column: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Finding {
    pub id: String,
    pub rule_id: String,
    pub title: String,
    pub severity: Severity,
    pub confidence: String,
    pub message: String,
    pub remediation: String,
    pub location: FindingLocation,
    pub evidence: Evidence,
    pub context: FindingContext,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FindingLocation {
    pub file: String,
    pub start_line: usize,
    pub start_column: usize,
    pub end_line: usize,
    pub end_column: usize,
    pub byte_start: usize,
    pub byte_end: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Evidence {
    pub source_sha256: String,
    pub excerpt: String,
    pub validated: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub related: Vec<RelatedEvidence>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RelatedEvidence {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_sha256: Option<String>,
    pub label: String,
    pub location: FindingLocation,
    pub excerpt: String,
}

#[derive(Debug, Error)]
pub enum ScanError {
    #[error("input path does not exist: {0}")]
    MissingInput(PathBuf),
    #[error("input file is not Solidity source: {0}")]
    UnsupportedInput(PathBuf),
    #[error("invalid bundle metadata: {0}")]
    InvalidBundleMetadata(String),
    #[error("source changed between scan and bundle export: {0}")]
    SourceChanged(PathBuf),
    #[error("cannot read {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("invalid Foundry configuration: {0}")]
    FoundryConfig(String),
}

pub fn scan_path(input: &Path) -> Result<ScanReport, ScanError> {
    scan_path_with_compiler(input, None)
}

pub fn scan_path_with_compiler(
    input: &Path,
    compiler: Option<&CompilerOptions>,
) -> Result<ScanReport, ScanError> {
    // Inspect the selected entry before canonicalization erases a root link.
    let input_metadata =
        fs::symlink_metadata(input).map_err(|_| ScanError::MissingInput(input.to_path_buf()))?;
    let symbolic_input = input_metadata.file_type().is_symlink();
    let supplied = if symbolic_input {
        input.to_path_buf()
    } else {
        input
            .canonicalize()
            .map_err(|_| ScanError::MissingInput(input.to_path_buf()))?
    };
    let (root, files, discovery_diagnostics) = if symbolic_input {
        (
            supplied,
            Vec::new(),
            vec![ScanDiagnostic {
                code: "symlink-skipped".into(),
                message: "An explicitly selected symbolic link is not followed; select the real source path.".into(),
                file: None,
                line: None,
                column: None,
            }],
        )
    } else if supplied.is_file() {
        if supplied.extension().is_none_or(|ext| ext != "sol") {
            return Err(ScanError::UnsupportedInput(supplied));
        }
        let root = supplied.parent().unwrap_or(Path::new(".")).to_path_buf();
        (root, vec![supplied], Vec::new())
    } else if supplied.is_dir() {
        let scan_root = foundry_source_dir(&supplied)?.unwrap_or_else(|| supplied.clone());
        let root = scan_root.canonicalize().map_err(|source| ScanError::Io {
            path: scan_root.clone(),
            source,
        })?;
        let (files, diagnostics) = solidity_files(&root);
        (root, files, diagnostics)
    } else {
        return Err(ScanError::MissingInput(input.to_path_buf()));
    };

    let mut report = ScanReport {
        schema_version: SCHEMA_VERSION,
        engine_version: ENGINE_VERSION.to_string(),
        scanned_files: 0,
        analysis: AnalysisProfile {
            mode: if compiler.is_some() { "solc" } else { "source" }.into(),
            compiler_version: None,
        },
        coverage: ScanCoverage {
            rule_set: rules::RULE_SET.into(),
            rules: rules::RULES.iter().map(|rule| rule.id.into()).collect(),
            files: Vec::new(),
            source_sha256: BTreeMap::new(),
            complete: false,
        },
        diagnostics: discovery_diagnostics,
        findings: Vec::new(),
    };
    if files.is_empty() {
        report.diagnostics.push(ScanDiagnostic {
            code: "no-solidity-files".into(),
            message: "No Solidity source files were found in the selected input.".into(),
            file: None,
            line: None,
            column: None,
        });
    }
    let mut sources = BTreeMap::new();
    for file in files {
        let rel = match file.strip_prefix(&root) {
            Ok(path) => path,
            Err(_) => {
                report.diagnostics.push(ScanDiagnostic {
                    code: "path-outside-root".into(),
                    message: "Source file resolved outside the selected scan root.".into(),
                    file: None,
                    line: None,
                    column: None,
                });
                continue;
            }
        };
        let rel_string = portable_path(rel);
        let source = match fs::read_to_string(&file) {
            Ok(source) => source,
            Err(error) => {
                report.diagnostics.push(ScanDiagnostic {
                    code: "source-read-error".into(),
                    message: format!("Could not read Solidity source: {error}"),
                    file: Some(rel_string),
                    line: None,
                    column: None,
                });
                continue;
            }
        };
        report.scanned_files += 1;
        report.coverage.files.push(rel_string.clone());
        report
            .coverage
            .source_sha256
            .insert(rel_string.clone(), hex_sha256(source.as_bytes()));
        if source.trim().is_empty() {
            report.diagnostics.push(ScanDiagnostic { code: "empty-source".into(), message: "Source file is empty; review the removed input before treating the scan as complete.".into(), file: Some(rel_string.clone()), line: None, column: None });
        }
        sources.insert(rel_string, source);
    }
    let semantic = if let Some(options) = compiler {
        let result = compiler::compile(&root, &sources, options);
        report.analysis.compiler_version = result.version;
        report.diagnostics.extend(result.diagnostics);
        result.model
    } else {
        None
    };
    if compiler.is_none() || semantic.is_some() {
        for (rel_string, source) in &sources {
            let (mut findings, diagnostics) =
                analysis::analyze_with_semantics(source, rel_string, semantic.as_ref());
            for finding in &mut findings {
                match validate_finding(&root, finding) {
                    Ok(()) => finding.evidence.validated = true,
                    Err(error) => report.diagnostics.push(ScanDiagnostic {
                        code: "evidence-validation-error".into(),
                        message: error,
                        file: Some(rel_string.clone()),
                        line: Some(finding.location.start_line),
                        column: Some(finding.location.start_column),
                    }),
                }
            }
            report.findings.extend(findings);
            report.diagnostics.extend(diagnostics);
        }
    }
    report.findings.sort_by(|a, b| {
        (&a.location.file, a.location.byte_start, &a.rule_id).cmp(&(
            &b.location.file,
            b.location.byte_start,
            &b.rule_id,
        ))
    });
    report.diagnostics.sort_by(|a, b| {
        (&a.file, a.line, a.column, &a.code).cmp(&(&b.file, b.line, b.column, &b.code))
    });
    report.coverage.complete = report.scanned_files > 0 && report.diagnostics.is_empty();
    Ok(report)
}

fn foundry_source_dir(project: &Path) -> Result<Option<PathBuf>, ScanError> {
    let config = project.join("foundry.toml");
    if !config.is_file() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&config).map_err(|source| ScanError::Io {
        path: config.clone(),
        source,
    })?;
    let parsed: toml::Value =
        toml::from_str(&raw).map_err(|error| ScanError::FoundryConfig(error.to_string()))?;
    let configured_src = parsed
        .get("profile")
        .and_then(|profile| profile.get("default"))
        .and_then(|default| default.get("src"))
        .or_else(|| parsed.get("src"));
    let src = match configured_src {
        Some(value) => value
            .as_str()
            .ok_or_else(|| ScanError::FoundryConfig("src must be a string path".into()))?,
        None => "src",
    };
    let src_path = project.join(src);
    let canonical = src_path.canonicalize().map_err(|source| ScanError::Io {
        path: src_path.clone(),
        source,
    })?;
    if !canonical.starts_with(project) {
        return Err(ScanError::FoundryConfig(
            "src resolves outside the selected project; scan that directory explicitly instead"
                .into(),
        ));
    }
    Ok(Some(canonical))
}

fn solidity_files(root: &Path) -> (Vec<PathBuf>, Vec<ScanDiagnostic>) {
    let mut files = Vec::new();
    let mut diagnostics = Vec::new();
    for entry in WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| {
            !entry.file_type().is_dir()
                || !matches!(
                    entry.file_name().to_str(),
                    Some(".git" | "out" | "cache" | "node_modules")
                )
        })
    {
        match entry {
            Ok(entry) if entry.file_type().is_symlink() => diagnostics.push(ScanDiagnostic {
                code: "symlink-skipped".into(),
                message: "A symbolic link was skipped; source coverage is incomplete.".into(),
                file: entry.path().strip_prefix(root).ok().map(portable_path),
                line: None,
                column: None,
            }),
            Ok(entry)
                if entry.file_type().is_file()
                    && entry.path().extension().is_some_and(|ext| ext == "sol") =>
            {
                files.push(entry.into_path())
            }
            Ok(_) => {}
            Err(error) => diagnostics.push(ScanDiagnostic {
                code: "source-discovery-error".into(),
                message: format!("Could not enumerate source: {error}"),
                file: error
                    .path()
                    .and_then(|path| path.strip_prefix(root).ok())
                    .map(portable_path),
                line: None,
                column: None,
            }),
        }
    }
    files.sort();
    (files, diagnostics)
}

fn portable_path(path: &Path) -> String {
    path.components()
        .filter_map(|component| match component {
            Component::Normal(part) => Some(part.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

#[derive(Debug, Serialize)]
pub struct ScanBundle {
    pub bundle_version: u32,
    pub target: BundleTarget,
    pub revision: String,
    pub rules: Vec<String>,
    pub report: ScanReport,
    pub sources: Vec<SourceArtifact>,
}
#[derive(Debug, Serialize)]
pub struct BundleTarget {
    pub id: String,
    pub name: String,
    pub kind: String,
}
#[derive(Debug, Serialize)]
pub struct SourceArtifact {
    pub path: String,
    pub sha256: String,
    pub content: String,
}

fn bundle_sources(root: &Path, report: &ScanReport) -> Result<Vec<SourceArtifact>, ScanError> {
    let root = root.canonicalize().map_err(|source| ScanError::Io {
        path: root.into(),
        source,
    })?;
    let mut sources = Vec::new();
    for relative in &report.coverage.files {
        let path = root.join(relative);
        let resolved = path.canonicalize().map_err(|source| ScanError::Io {
            path: path.clone(),
            source,
        })?;
        if !resolved.starts_with(&root) {
            return Err(ScanError::SourceChanged(path));
        }
        let content = fs::read_to_string(&resolved).map_err(|source| ScanError::Io {
            path: resolved.clone(),
            source,
        })?;
        let sha256 = hex_sha256(content.as_bytes());
        if report.coverage.source_sha256.get(relative) != Some(&sha256) {
            return Err(ScanError::SourceChanged(resolved));
        }
        sources.push(SourceArtifact {
            path: relative.clone(),
            sha256,
            content,
        });
    }
    Ok(sources)
}

pub fn fixture_bundle(
    input: &Path,
    id: &str,
    name: &str,
    revision: &str,
) -> Result<ScanBundle, ScanError> {
    fixture_bundle_with_compiler(input, id, name, revision, None)
}

pub fn fixture_bundle_with_compiler(
    input: &Path,
    id: &str,
    name: &str,
    revision: &str,
    compiler: Option<&CompilerOptions>,
) -> Result<ScanBundle, ScanError> {
    let valid_id = !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .next()
            .is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        && id
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || b"._-".contains(&c));
    if !valid_id
        || name.is_empty()
        || name.encode_utf16().count() > 100
        || revision.is_empty()
        || revision.encode_utf16().count() > 100
        || name.chars().chain(revision.chars()).any(char::is_control)
    {
        return Err(ScanError::InvalidBundleMetadata(
            "use a normalized target ID and nonempty name/revision labels up to 100 characters"
                .into(),
        ));
    }
    let report = scan_path_with_compiler(input, compiler)?;
    let supplied = input
        .canonicalize()
        .map_err(|_| ScanError::MissingInput(input.into()))?;
    let root = if supplied.is_file() {
        supplied.parent().unwrap().to_path_buf()
    } else {
        foundry_source_dir(&supplied)?.unwrap_or(supplied)
    };
    let sources = bundle_sources(&root, &report)?;
    Ok(ScanBundle {
        bundle_version: 1,
        target: BundleTarget {
            id: id.into(),
            name: name.into(),
            kind: "isolated-fixture".into(),
        },
        revision: revision.into(),
        rules: report.coverage.rules.clone(),
        report,
        sources,
    })
}

pub(crate) fn make_finding(
    source: &str,
    file: &str,
    node: &Node<'_>,
    rule: &rules::RuleDefinition,
    message_override: Option<String>,
) -> Finding {
    let start = node.start_byte();
    let end = node.end_byte();
    let (start_line, start_column) = node_location(source, start);
    let (end_line, end_column) = node_location(source, end);
    let excerpt = source.get(start..end).unwrap_or("").to_string();
    let source_sha256 = hex_sha256(source.as_bytes());
    let fingerprint_material = format!("{}\0{}\0{}\0{}", rule.id, file, start, end);
    let id = hex_sha256(fingerprint_material.as_bytes())[..24].to_string();
    Finding {
        id,
        rule_id: rule.id.to_string(),
        title: rule.title.to_string(),
        severity: rule.severity,
        confidence: rule.confidence.to_string(),
        message: message_override.unwrap_or_else(|| rule.description.to_string()),
        remediation: rule.remediation.to_string(),
        location: FindingLocation {
            file: file.to_string(),
            start_line,
            start_column,
            end_line,
            end_column,
            byte_start: start,
            byte_end: end,
        },
        context: {
            let mut contract = None;
            let mut function = None;
            let mut ancestor = Some(*node);
            while let Some(current) = ancestor {
                if current.kind() == "function_definition"
                    || current.kind() == "modifier_definition"
                {
                    function = current
                        .child_by_field_name("name")
                        .and_then(|name| source.get(name.byte_range()))
                        .map(str::to_owned);
                }
                if matches!(
                    current.kind(),
                    "contract_declaration" | "interface_declaration" | "library_declaration"
                ) {
                    contract = current
                        .child_by_field_name("name")
                        .and_then(|name| source.get(name.byte_range()))
                        .map(str::to_owned);
                    break;
                }
                ancestor = current.parent();
            }
            FindingContext { contract, function }
        },
        evidence: Evidence {
            source_sha256,
            excerpt,
            validated: false,
            related: Vec::new(),
        },
    }
}

pub(crate) fn node_location(source: &str, offset: usize) -> (usize, usize) {
    let prefix = source.get(..offset.min(source.len())).unwrap_or("");
    let line = prefix.bytes().filter(|byte| *byte == b'\n').count() + 1;
    let column = prefix.rsplit('\n').next().unwrap_or("").chars().count() + 1;
    (line, column)
}

pub(crate) fn hex_sha256(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub fn validate_finding(root: &Path, finding: &Finding) -> Result<(), String> {
    let rel = Path::new(&finding.location.file);
    if rel.is_absolute()
        || rel
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err("Evidence path must be a normalized relative path.".into());
    }
    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("Cannot resolve scan root: {error}"))?;
    let canonical_file = canonical_root
        .join(rel)
        .canonicalize()
        .map_err(|error| format!("Cannot resolve evidence file: {error}"))?;
    if !canonical_file.starts_with(&canonical_root) {
        return Err("Evidence file resolves outside the scan root.".into());
    }
    let source = fs::read_to_string(canonical_file)
        .map_err(|error| format!("Cannot read evidence file: {error}"))?;
    if hex_sha256(source.as_bytes()) != finding.evidence.source_sha256 {
        return Err("Source digest no longer matches the report.".into());
    }
    validate_span(&source, &finding.location, &finding.evidence.excerpt)?;
    for related in &finding.evidence.related {
        if related.location.file == finding.location.file {
            if related
                .source_sha256
                .as_ref()
                .is_some_and(|digest| digest != &finding.evidence.source_sha256)
            {
                return Err("Related source digest does not match the primary source.".into());
            }
            validate_span(&source, &related.location, &related.excerpt)?;
        } else {
            let digest = related
                .source_sha256
                .as_ref()
                .ok_or("Cross-file evidence requires its own source digest.")?;
            let mut secondary = finding.clone();
            secondary.location = related.location.clone();
            secondary.evidence = Evidence {
                source_sha256: digest.clone(),
                excerpt: related.excerpt.clone(),
                validated: false,
                related: Vec::new(),
            };
            validate_finding(&canonical_root, &secondary)?;
        }
    }
    Ok(())
}

fn validate_span(source: &str, location: &FindingLocation, expected: &str) -> Result<(), String> {
    if location.byte_end <= location.byte_start {
        return Err("Evidence span must be nonempty.".into());
    }
    let excerpt = source
        .get(location.byte_start..location.byte_end)
        .ok_or_else(|| {
            "Evidence span is outside source or splits a UTF-8 character.".to_string()
        })?;
    if excerpt != expected {
        return Err("Evidence excerpt does not match the source span.".into());
    }
    let from = node_location(source, location.byte_start);
    let to = node_location(source, location.byte_end);
    if (from.0, from.1, to.0, to.1)
        != (
            location.start_line,
            location.start_column,
            location.end_line,
            location.end_column,
        )
    {
        return Err("Evidence line and column do not match the byte span.".into());
    }
    Ok(())
}

pub fn rule_metadata() -> Vec<(String, String, String, String)> {
    rules::RULES
        .iter()
        .map(|rule| {
            (
                rule.id.into(),
                rule.title.into(),
                rule.description.into(),
                rule.severity.as_sarif_level().into(),
            )
        })
        .collect()
}

pub fn rule_catalog() -> serde_json::Value {
    serde_json::json!({ "engine_version": ENGINE_VERSION, "schema_version": SCHEMA_VERSION,
        "rule_set": rules::RULE_SET, "rules": rules::RULES })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;

    fn fixture(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .join("fixtures")
            .join(name)
    }

    #[test]
    fn vulnerable_fixture_has_three_ast_findings_with_valid_evidence() {
        let root = fixture("vulnerable");
        let report = scan_path(&root).unwrap();
        let ids = report
            .findings
            .iter()
            .map(|finding| finding.rule_id.as_str())
            .collect::<BTreeSet<_>>();
        assert_eq!(
            ids,
            BTreeSet::from(["OG-SOL-001", "OG-SOL-002", "OG-SOL-003"])
        );
        assert!(report.diagnostics.is_empty(), "{:?}", report.diagnostics);
        assert!(
            report
                .findings
                .iter()
                .all(|finding| finding.evidence.validated)
        );
        for finding in &report.findings {
            validate_finding(&root.join("src"), finding).unwrap();
        }
    }

    #[test]
    fn fixed_fixture_has_no_findings() {
        let report = scan_path(&fixture("fixed")).unwrap();
        assert!(report.findings.is_empty(), "{:?}", report.findings);
        assert!(report.diagnostics.is_empty(), "{:?}", report.diagnostics);
    }

    #[test]
    fn malformed_solidity_is_a_diagnostic_not_a_clean_scan() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(
            temp.path().join("Broken.sol"),
            "contract Broken { function f( {",
        )
        .unwrap();
        let report = scan_path(temp.path()).unwrap();
        assert_eq!(report.scanned_files, 1);
        assert!(report.diagnostics.iter().any(|d| d.code == "syntax-error"));
    }

    #[test]
    fn evidence_digest_rejects_tampering() {
        let root = fixture("vulnerable");
        let report = scan_path(&root).unwrap();
        let mut finding = report.findings[0].clone();
        finding.evidence.excerpt.push('x');
        assert!(validate_finding(&root.join("src"), &finding).is_err());
    }

    #[test]
    fn scan_output_order_is_deterministic() {
        let first = scan_path(&fixture("vulnerable")).unwrap();
        let second = scan_path(&fixture("vulnerable")).unwrap();
        assert_eq!(first.findings, second.findings);
    }

    #[test]
    fn bundle_export_detects_changes_to_finding_free_source() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("Safe.sol"), "contract Safe {}").unwrap();
        let report = scan_path(temp.path()).unwrap();
        assert!(report.findings.is_empty());
        fs::write(temp.path().join("Safe.sol"), "contract Changed {}").unwrap();
        assert!(matches!(
            bundle_sources(temp.path(), &report),
            Err(ScanError::SourceChanged(_))
        ));
    }

    #[test]
    fn native_bundle_contains_the_exact_scanned_sources_and_profile() {
        let bundle = fixture_bundle(
            &fixture("vulnerable"),
            "vault-test",
            "Local Vault",
            "test-v1",
        )
        .unwrap();
        assert_eq!(bundle.sources.len(), 1);
        assert_eq!(bundle.rules.len(), rules::RULES.len());
        assert_eq!(
            bundle.sources[0].sha256,
            bundle.report.coverage.source_sha256["Vault.sol"]
        );
        assert_eq!(bundle.report.schema_version, SCHEMA_VERSION);
    }
}

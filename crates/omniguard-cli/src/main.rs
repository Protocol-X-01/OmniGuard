use clap::{Parser, Subcommand, ValueEnum};
use omniguard_core::{
    CompilerOptions, Finding, ScanReport, Severity, fixture_bundle_with_compiler, rule_catalog,
    rules, scan_path_with_compiler,
};
use serde_json::{Value, json};
use std::fs;
use std::io::{self, Write};
use std::path::PathBuf;
use std::process::ExitCode;

#[derive(Debug, Parser)]
#[command(
    name = "omniguard",
    version,
    about = "Evidence-first Solidity security scanning for Foundry projects"
)]
struct Args {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    #[command(about = "Export an isolated-fixture scan bundle including source text")]
    Bundle {
        #[arg(default_value = ".")]
        path: PathBuf,
        #[arg(long)]
        target: String,
        #[arg(long)]
        name: String,
        #[arg(long)]
        revision: String,
        #[arg(long, required = true)]
        isolated_fixture: bool,
        #[arg(
            long,
            help = "Native solc executable for compiler-resolved facts; imports stay within selected sources"
        )]
        solc: Option<PathBuf>,
        #[arg(long)]
        output: Option<PathBuf>,
    },
    Rules {
        #[arg(long, value_enum, default_value = "text")]
        format: CatalogFormat,
    },
    Scan {
        #[arg(default_value = ".")]
        path: PathBuf,
        #[arg(long, value_enum, default_value = "text")]
        format: Format,
        #[arg(long)]
        output: Option<PathBuf>,
        #[arg(long, value_enum)]
        fail_on: Option<Threshold>,
        #[arg(
            long,
            help = "Native solc executable for compiler-resolved facts; compiler errors make analysis incomplete"
        )]
        solc: Option<PathBuf>,
    },
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum CatalogFormat {
    Text,
    Json,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum Format {
    Text,
    Json,
    Sarif,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum Threshold {
    Low,
    Medium,
    High,
    Critical,
}

impl Threshold {
    fn rank(self) -> u8 {
        match self {
            Self::Low => 1,
            Self::Medium => 2,
            Self::High => 3,
            Self::Critical => 4,
        }
    }
}

fn main() -> ExitCode {
    match run(Args::parse()) {
        Ok(code) => ExitCode::from(code),
        Err(error) => {
            eprintln!("omniguard: {error}");
            ExitCode::from(2)
        }
    }
}

fn run(args: Args) -> Result<u8, Box<dyn std::error::Error>> {
    match args.command {
        Command::Bundle {
            path,
            target,
            name,
            revision,
            isolated_fixture: _,
            solc,
            output,
        } => {
            let options = solc.map(CompilerOptions::new);
            let bundle =
                fixture_bundle_with_compiler(&path, &target, &name, &revision, options.as_ref())?;
            let rendered = serde_json::to_string_pretty(&bundle)?;
            if let Some(path) = output {
                fs::write(path, rendered)?;
            } else {
                writeln!(io::stdout().lock(), "{rendered}")?;
            }
            Ok(if bundle.report.coverage.complete {
                0
            } else {
                2
            })
        }
        Command::Rules { format } => {
            let output = match format {
                CatalogFormat::Json => serde_json::to_string_pretty(&rule_catalog())?,
                CatalogFormat::Text => rules::RULES
                    .iter()
                    .map(|rule| {
                        format!(
                            "{}  {:?}  {}\n  {}\n  Limit: {}",
                            rule.id, rule.severity, rule.title, rule.description, rule.limitations
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n\n"),
            };
            writeln!(io::stdout().lock(), "{output}")?;
            Ok(0)
        }
        Command::Scan {
            path,
            format,
            output,
            fail_on,
            solc,
        } => {
            let options = solc.map(CompilerOptions::new);
            let report = scan_path_with_compiler(&path, options.as_ref())?;
            let rendered = match format {
                Format::Text => text_report(&report),
                Format::Json => serde_json::to_string_pretty(&report)?,
                Format::Sarif => serde_json::to_string_pretty(&sarif_report(&report))?,
            };
            if let Some(output) = output {
                fs::write(output, rendered)?;
            } else {
                let mut stdout = io::stdout().lock();
                stdout.write_all(rendered.as_bytes())?;
                stdout.write_all(b"\n")?;
            }
            if !report.coverage.complete || !report.diagnostics.is_empty() {
                return Ok(2);
            }
            if fail_on.is_some_and(|threshold| {
                report
                    .findings
                    .iter()
                    .any(|finding| finding.severity.rank() >= threshold.rank())
            }) {
                return Ok(1);
            }
            Ok(0)
        }
    }
}

fn text_report(report: &ScanReport) -> String {
    let mut out = format!(
        "OmniGuard {} ({}) · {} Solidity file(s) scanned · {} finding(s)",
        report.engine_version,
        report.analysis.mode,
        report.scanned_files,
        report.findings.len()
    );
    for finding in &report.findings {
        out.push_str(&format!(
            "\n\n[{}] {} {}:{}:{}\n{}\nEvidence: {}",
            format!("{:?}", finding.severity).to_uppercase(),
            finding.rule_id,
            finding.location.file,
            finding.location.start_line,
            finding.location.start_column,
            finding.message,
            finding.evidence.excerpt.replace('\n', "\\n")
        ));
    }
    for diagnostic in &report.diagnostics {
        out.push_str(&format!(
            "\n\nERROR {}: {}",
            diagnostic.code, diagnostic.message
        ));
        if let Some(file) = &diagnostic.file {
            out.push_str(&format!(" ({file})"));
        }
    }
    out
}

fn sarif_report(report: &ScanReport) -> Value {
    let rules = rules::RULES.iter().map(|rule| json!({
        "id": rule.id, "shortDescription": { "text": rule.title },
        "fullDescription": { "text": rule.description }, "helpUri": rule.reference,
        "help": { "text": format!("{} Limitations: {}", rule.remediation, rule.limitations) },
        "defaultConfiguration": { "level": rule.severity.as_sarif_level() },
        "properties": { "category": rule.category, "confidence": rule.confidence }
    })).collect::<Vec<_>>();
    let results = report
        .findings
        .iter()
        .map(sarif_finding)
        .collect::<Vec<_>>();
    json!({
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "version": "2.1.0",
        "runs": [{
            "tool": { "driver": {
                "name": "OmniGuard",
                "version": report.engine_version,
                "rules": rules
            }},
            "results": results,
            "invocations": [{
                "executionSuccessful": report.coverage.complete && report.diagnostics.is_empty(),
                "properties": { "ruleSet": report.coverage.rule_set, "rules": report.coverage.rules, "files": report.coverage.files, "analysis": report.analysis },
                "toolExecutionNotifications": report.diagnostics.iter().map(|diagnostic| json!({
                    "descriptor": { "id": diagnostic.code },
                    "message": { "text": diagnostic.message }
                })).collect::<Vec<_>>()
            }]
        }]
    })
}

fn sarif_finding(finding: &Finding) -> Value {
    let severity: Severity = finding.severity;
    json!({
        "ruleId": finding.rule_id,
        "level": severity.as_sarif_level(),
        "message": { "text": finding.message },
        "locations": [{
            "physicalLocation": {
                "artifactLocation": { "uri": finding.location.file },
                "region": {
                    "startLine": finding.location.start_line,
                    "startColumn": finding.location.start_column,
                    "endLine": finding.location.end_line,
                    "endColumn": finding.location.end_column,
                    "snippet": { "text": finding.evidence.excerpt }
                }
            }
        }],
        "relatedLocations": finding.evidence.related.iter().enumerate().map(|(index, related)| json!({
            "id": index + 1, "message": { "text": related.label }, "properties": { "sourceSha256": related.source_sha256 },
            "physicalLocation": { "artifactLocation": { "uri": related.location.file }, "region": {
                "startLine": related.location.start_line, "startColumn": related.location.start_column,
                "endLine": related.location.end_line, "endColumn": related.location.end_column,
                "snippet": { "text": related.excerpt }
            }}
        })).collect::<Vec<_>>(),
        "partialFingerprints": { "omniguard/v1": finding.id },
        "properties": {
            "severity": format!("{:?}", finding.severity).to_lowercase(),
            "confidence": finding.confidence,
            "sourceSha256": finding.evidence.source_sha256,
            "remediation": finding.remediation,
            "context": finding.context
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use omniguard_core::scan_path;
    use std::path::Path;

    fn vulnerable_report() -> ScanReport {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .join("fixtures/vulnerable");
        scan_path(&root).unwrap()
    }

    #[test]
    fn sarif_has_standard_version_rules_and_exact_source_regions() {
        let report = vulnerable_report();
        let sarif = sarif_report(&report);
        assert_eq!(sarif["version"], "2.1.0");
        assert_eq!(
            sarif["runs"][0]["tool"]["driver"]["rules"]
                .as_array()
                .unwrap()
                .len(),
            rules::RULES.len()
        );
        assert_eq!(
            sarif["runs"][0]["results"].as_array().unwrap().len(),
            report.findings.len()
        );
        for (result, finding) in sarif["runs"][0]["results"]
            .as_array()
            .unwrap()
            .iter()
            .zip(report.findings)
        {
            assert_eq!(result["ruleId"], finding.rule_id);
            assert_eq!(
                result["locations"][0]["physicalLocation"]["region"]["startLine"],
                finding.location.start_line
            );
        }
    }

    #[test]
    fn bundle_export_requires_explicit_fixture_selection() {
        assert!(
            Args::try_parse_from([
                "omniguard",
                "bundle",
                ".",
                "--target",
                "local",
                "--name",
                "Local",
                "--revision",
                "v1"
            ])
            .is_err()
        );
        assert!(
            Args::try_parse_from([
                "omniguard",
                "bundle",
                ".",
                "--target",
                "local",
                "--name",
                "Local",
                "--revision",
                "v1",
                "--isolated-fixture"
            ])
            .is_ok()
        );
    }

    #[test]
    fn json_report_has_versioned_contract_fields() {
        let value = serde_json::to_value(vulnerable_report()).unwrap();
        assert_eq!(value["schema_version"], omniguard_core::SCHEMA_VERSION);
        assert_eq!(value["coverage"]["complete"], true);
        assert_eq!(
            value["coverage"]["rules"].as_array().unwrap().len(),
            rules::RULES.len()
        );
        assert!(value["findings"].is_array());
        assert!(value["diagnostics"].is_array());
        assert_eq!(value["findings"][0]["evidence"]["validated"], true);
    }
}

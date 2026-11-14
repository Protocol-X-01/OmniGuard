//! Optional compiler facts from an exact source snapshot. No filesystem import callback.
use crate::{FindingLocation, RelatedEvidence, ScanDiagnostic, hex_sha256, node_location};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::io::{Read, Write};
#[cfg(unix)]
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
pub struct CompilerOptions {
    pub executable: PathBuf,
    pub timeout: Duration,
}
impl CompilerOptions {
    pub fn new(executable: impl Into<PathBuf>) -> Self {
        let executable = executable.into();
        let executable = if executable.is_relative() && executable.components().count() > 1 {
            std::env::current_dir()
                .map(|directory| directory.join(&executable))
                .unwrap_or(executable)
        } else {
            executable
        };
        Self {
            executable,
            timeout: Duration::from_secs(30),
        }
    }
}

pub(crate) struct Compilation {
    pub version: Option<String>,
    pub model: Option<SemanticModel>,
    pub diagnostics: Vec<ScanDiagnostic>,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ResolvedType {
    Address,
    String,
    Bytes,
    Bool,
    Contract(String),
    Array(Box<ResolvedType>),
    Other,
}
type Key = (String, usize, usize);
#[derive(Clone)]
struct Declaration {
    state_variable: bool,
    boolean_method: bool,
    file: String,
    start: usize,
    end: usize,
}
pub(crate) struct SemanticModel {
    pub(crate) effects: crate::effects::Effects,
    sources: BTreeMap<String, String>,
    types: BTreeMap<Key, ResolvedType>,
    references: BTreeMap<Key, i64>,
    declarations: BTreeMap<i64, Declaration>,
    storage_roots: BTreeMap<Key, i64>,
    boolean_methods: BTreeMap<Key, i64>,
    builtin_members: BTreeMap<Key, (String, String)>,
}

fn key(file: &str, start: usize, end: usize) -> Key {
    (file.into(), start, end)
}
fn kind(node: &Value) -> &str {
    node["nodeType"].as_str().unwrap_or("")
}
fn walk<'a>(node: &'a Value, into: &mut Vec<&'a Value>) {
    match node {
        Value::Object(fields) => {
            if fields.contains_key("nodeType") {
                into.push(node);
            }
            for child in fields.values() {
                walk(child, into);
            }
        }
        Value::Array(values) => {
            for child in values {
                walk(child, into);
            }
        }
        _ => {}
    }
}
fn source_range(node: &Value, ids: &BTreeMap<i64, String>) -> Option<Key> {
    let mut parts = node["src"].as_str()?.split(':');
    let start = parts.next()?.parse::<usize>().ok()?;
    let len = parts.next()?.parse::<usize>().ok()?;
    let file = ids.get(&parts.next()?.parse::<i64>().ok()?)?;
    if parts.next().is_some() {
        return None;
    }
    Some(key(file, start, start.checked_add(len)?))
}
fn resolved_type(raw: &str) -> ResolvedType {
    let raw = raw.trim();
    if let Some((base, _)) = raw.rsplit_once('[') {
        return ResolvedType::Array(Box::new(resolved_type(base)));
    }
    match raw.split_whitespace().next().unwrap_or("") {
        "address" => ResolvedType::Address,
        "string" => ResolvedType::String,
        "bytes" => ResolvedType::Bytes,
        "bool" => ResolvedType::Bool,
        "contract" => ResolvedType::Contract(raw.split_whitespace().nth(1).unwrap_or("").into()),
        _ => ResolvedType::Other,
    }
}
fn referenced_callee(mut node: &Value) -> Option<i64> {
    if kind(node) == "FunctionCallOptions" {
        node = &node["expression"];
    }
    node["referencedDeclaration"].as_i64()
}
fn storage_reference(node: &Value, declarations: &BTreeMap<i64, Declaration>) -> Option<i64> {
    if let Some(id) = node["referencedDeclaration"].as_i64()
        && declarations.get(&id).is_some_and(|d| d.state_variable)
    {
        return Some(id);
    }
    match kind(node) {
        "IndexAccess" | "IndexRangeAccess" => {
            storage_reference(&node["baseExpression"], declarations)
        }
        "MemberAccess" => storage_reference(&node["expression"], declarations),
        "TupleExpression" => node["components"]
            .as_array()?
            .iter()
            .find_map(|n| storage_reference(n, declarations)),
        _ => None,
    }
}
impl SemanticModel {
    fn from_output(output: &Value, sources: &BTreeMap<String, String>) -> Result<Self, String> {
        let compiled = output["sources"]
            .as_object()
            .ok_or("Compiler returned no source ASTs.")?;
        if compiled.len() != sources.len()
            || !sources.keys().all(|file| compiled.contains_key(file))
        {
            return Err("Compiler source coverage differs from the supplied snapshot.".into());
        }
        let mut ids = BTreeMap::new();
        for (file, data) in compiled {
            let id = data["id"]
                .as_i64()
                .ok_or("Compiler source has no numeric ID.")?;
            if ids.insert(id, file.clone()).is_some() {
                return Err("Duplicate compiler source ID.".into());
            }
        }
        let mut all = Vec::new();
        for data in compiled.values() {
            if kind(&data["ast"]) != "SourceUnit" {
                return Err("Compiler returned an incomplete source AST.".into());
            }
            walk(&data["ast"], &mut all);
        }
        let mut model = Self {
            effects: crate::effects::Effects::build(output, &ids, sources),
            sources: sources.clone(),
            types: BTreeMap::new(),
            references: BTreeMap::new(),
            declarations: BTreeMap::new(),
            storage_roots: BTreeMap::new(),
            boolean_methods: BTreeMap::new(),
            builtin_members: BTreeMap::new(),
        };
        for node in &all {
            let Some((file, start, end)) = source_range(node, &ids) else {
                continue;
            };
            if sources.get(&file).and_then(|s| s.get(start..end)).is_none() {
                return Err("Compiler AST span is outside the supplied source snapshot.".into());
            }
            if let Some(id) = node["id"].as_i64()
                && model
                    .declarations
                    .insert(
                        id,
                        Declaration {
                            state_variable: node["stateVariable"] == true,
                            boolean_method: kind(node) == "FunctionDefinition"
                                && node["returnParameters"]["parameters"]
                                    .as_array()
                                    .is_some_and(|parameters| {
                                        parameters.len() == 1
                                            && parameters[0]["typeDescriptions"]["typeString"]
                                                == "bool"
                                    }),
                            file: file.clone(),
                            start,
                            end,
                        },
                    )
                    .is_some()
            {
                return Err("Duplicate compiler AST node ID.".into());
            }
            if let Some(raw) = node["typeDescriptions"]["typeString"].as_str() {
                model
                    .types
                    .insert(key(&file, start, end), resolved_type(raw));
            }
            if let Some(id) = node["referencedDeclaration"].as_i64() {
                model.references.insert(key(&file, start, end), id);
            }
            if kind(node) == "MemberAccess"
                && kind(&node["expression"]) == "Identifier"
                && node["expression"]["referencedDeclaration"]
                    .as_i64()
                    .is_some_and(|id| id < 0)
                && let (Some(object), Some(member)) = (
                    node["expression"]["name"].as_str(),
                    node["memberName"].as_str(),
                )
            {
                model
                    .builtin_members
                    .insert(key(&file, start, end), (object.into(), member.into()));
            }
        }
        for node in all {
            let Some((file, start, end)) = source_range(node, &ids) else {
                continue;
            };
            if let Some(id) = storage_reference(node, &model.declarations) {
                model.storage_roots.insert(key(&file, start, end), id);
            }
            if kind(node) == "FunctionCall"
                && let Some(id) = referenced_callee(&node["expression"])
                && model
                    .declarations
                    .get(&id)
                    .is_some_and(|d| d.boolean_method)
            {
                model.boolean_methods.insert(key(&file, start, end), id);
            }
        }
        Ok(model)
    }
    pub fn expression_type(&self, file: &str, start: usize, end: usize) -> Option<&ResolvedType> {
        self.types.get(&key(file, start, end))
    }
    pub fn reference(&self, file: &str, start: usize, end: usize) -> Option<i64> {
        self.references.get(&key(file, start, end)).copied()
    }
    pub fn builtin_member(
        &self,
        file: &str,
        start: usize,
        end: usize,
        object: &str,
        property: &str,
    ) -> bool {
        self.builtin_members
            .get(&key(file, start, end))
            .is_some_and(|(o, p)| o == object && p == property)
    }
    pub fn declaration_evidence(
        &self,
        file: &str,
        start: usize,
        end: usize,
        label: &str,
    ) -> Option<RelatedEvidence> {
        self.evidence(self.reference(file, start, end)?, label)
    }
    pub fn storage_declaration(
        &self,
        file: &str,
        start: usize,
        end: usize,
    ) -> Option<RelatedEvidence> {
        self.evidence(
            *self.storage_roots.get(&key(file, start, end))?,
            "Compiler-resolved storage declaration",
        )
    }
    pub fn boolean_method(&self, file: &str, start: usize, end: usize) -> Option<RelatedEvidence> {
        self.evidence(
            *self.boolean_methods.get(&key(file, start, end))?,
            "Compiler-resolved boolean-returning method",
        )
    }
    fn evidence(&self, id: i64, label: &str) -> Option<RelatedEvidence> {
        let d = self.declarations.get(&id)?;
        let source = self.sources.get(&d.file)?;
        let from = node_location(source, d.start);
        let to = node_location(source, d.end);
        Some(RelatedEvidence {
            source_sha256: Some(hex_sha256(source.as_bytes())),
            label: label.into(),
            excerpt: source.get(d.start..d.end)?.into(),
            location: FindingLocation {
                file: d.file.clone(),
                start_line: from.0,
                start_column: from.1,
                end_line: to.0,
                end_column: to.1,
                byte_start: d.start,
                byte_end: d.end,
            },
        })
    }
}

fn stop_compiler(child: &mut Child) {
    #[cfg(unix)]
    if let Ok(pid) = i32::try_from(child.id())
        && pid > 1
    {
        // SAFETY: process_group(0) gives this spawned compiler a separate group.
        // Signal only that group, including a waiting compiler launcher's children.
        unsafe {
            libc::kill(-pid, libc::SIGKILL);
        }
    }
    let _ = child.kill();
    let _ = child.wait();
}

// Bounded output readers run concurrently with stdin to avoid pipe deadlocks.
fn invoke(
    root: &Path,
    options: &CompilerOptions,
    args: &[&str],
    input: Vec<u8>,
) -> Result<Vec<u8>, String> {
    const LIMIT: u64 = 64 * 1024 * 1024;
    let deadline = Instant::now()
        .checked_add(options.timeout)
        .ok_or("Invalid compiler deadline.")?;
    let mut command = Command::new(&options.executable);
    command
        .args(args)
        .current_dir(root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    command.process_group(0);
    let mut child = command
        .spawn()
        .map_err(|e| format!("Could not start the requested Solidity compiler: {e}"))?;
    let mut stdin = child.stdin.take().unwrap();
    let writer = std::thread::spawn(move || stdin.write_all(&input));
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    let reader = std::thread::spawn(move || {
        let mut out = Vec::new();
        stdout.take(LIMIT + 1).read_to_end(&mut out).map(|_| out)
    });
    let errors = std::thread::spawn(move || {
        let mut out = Vec::new();
        stderr
            .take(1024 * 1024 + 1)
            .read_to_end(&mut out)
            .map(|_| out)
    });
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(10)),
            Ok(None) => {
                stop_compiler(&mut child);
                break Err(
                    "Solidity compiler timed out; requested analysis is incomplete.".to_string(),
                );
            }
            Err(error) => {
                stop_compiler(&mut child);
                break Err(format!("Could not monitor Solidity compiler: {error}"));
            }
        }
    };
    let wrote = writer.join().map_err(|_| "Compiler input writer failed.")?;
    let out = reader
        .join()
        .map_err(|_| "Compiler output reader failed.")?
        .map_err(|e| e.to_string())?;
    let err = errors
        .join()
        .map_err(|_| "Compiler error reader failed.")?
        .map_err(|e| e.to_string())?;
    let status = status?;
    if out.len() > LIMIT as usize || err.len() > 1024 * 1024 {
        return Err("Solidity compiler output exceeded its size limit.".into());
    }
    if !status.success() {
        return Err(format!(
            "Solidity compiler exited unsuccessfully: {}",
            String::from_utf8_lossy(&err)
                .chars()
                .take(500)
                .collect::<String>()
        ));
    }
    wrote.map_err(|e| format!("Could not supply compiler input: {e}"))?;
    Ok(out)
}
pub(crate) fn compile(
    root: &Path,
    sources: &BTreeMap<String, String>,
    options: &CompilerOptions,
) -> Compilation {
    let mut result = Compilation {
        version: None,
        model: None,
        diagnostics: Vec::new(),
    };
    let compilation = (|| -> Result<(), String> {
        let version = String::from_utf8(invoke(root, options, &["--version"], Vec::new())?)
            .map_err(|_| "Invalid compiler version text.")?;
        let version = version
            .lines()
            .find_map(|line| line.strip_prefix("Version: "))
            .ok_or("Compiler did not identify its version.")?
            .trim();
        if !version.starts_with("0.8.") || version.len() > 160 {
            return Err("Compiler facts currently support native Solidity 0.8.x.".into());
        }
        result.version = Some(version.into());
        let input = json!({"language":"Solidity","sources":sources.iter().map(|(file,source)|(file.clone(),json!({"content":source}))).collect::<serde_json::Map<_,_>>(),"settings":{"outputSelection":{"*":{"": ["ast"]}},"evmVersion":"cancun"}});
        let encoded = serde_json::to_vec(&input).map_err(|e| e.to_string())?;
        if encoded.len() > 8 * 1024 * 1024 {
            return Err("Compiler source input exceeds 8 MiB.".into());
        }
        let output: Value = serde_json::from_slice(&invoke(
            root,
            options,
            &["--standard-json", "--no-import-callback"],
            encoded,
        )?)
        .map_err(|e| format!("Invalid compiler JSON output: {e}"))?;
        if let Some(errors) = output["errors"].as_array() {
            for error in errors.iter().filter(|e| e["severity"] == "error") {
                let file = error["sourceLocation"]["file"]
                    .as_str()
                    .filter(|file| sources.contains_key(*file));
                let pos = file.and_then(|f| {
                    error["sourceLocation"]["start"]
                        .as_u64()
                        .map(|start| node_location(&sources[f], start as usize))
                });
                result.diagnostics.push(ScanDiagnostic {
                    code: "solc-error".into(),
                    message: error["message"]
                        .as_str()
                        .unwrap_or("Solidity compilation failed.")
                        .chars()
                        .take(2000)
                        .collect(),
                    file: file.map(str::to_owned),
                    line: pos.map(|p| p.0),
                    column: pos.map(|p| p.1),
                });
            }
        }
        if result.diagnostics.is_empty() {
            result.model = Some(SemanticModel::from_output(&output, sources)?);
        }
        Ok(())
    })();
    if let Err(message) = compilation {
        result.diagnostics.push(ScanDiagnostic {
            code: "solc-incomplete".into(),
            message,
            file: None,
            line: None,
            column: None,
        });
    }
    result
}

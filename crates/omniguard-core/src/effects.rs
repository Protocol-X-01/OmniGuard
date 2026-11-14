//! Bounded, compiler-identity-based ordered effects. This is not a verifier.
use crate::{FindingLocation, RelatedEvidence, ScanDiagnostic, hex_sha256, node_location};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

const MAX_DEPTH: usize = 8;
const MAX_PATHS: usize = 64;
const MAX_STEPS: usize = 4096;
const MAX_EVIDENCE: usize = 8;
const MAX_INTERACTIONS: usize = 128;
const MAX_FINDINGS: usize = 256;
const MAX_TOTAL_STEPS: usize = 65_536;

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) struct Span {
    pub file: String,
    pub start: usize,
    pub end: usize,
}
#[derive(Clone)]
struct Declaration {
    span: Span,
    state: bool,
    storage: bool,
    address: bool,
}
#[derive(Clone, Default)]
struct Binding {
    roots: BTreeSet<i64>,
    origin: Option<Span>,
    chain: Vec<Span>,
    unknown: bool,
}
#[derive(Clone)]
struct Interaction {
    primary: Span,
    actual: Span,
    chain: Vec<Span>,
}
#[derive(Clone, Default)]
struct PathState {
    bindings: BTreeMap<i64, Binding>,
    changed: BTreeSet<i64>,
    authorized: bool,
    interactions: Vec<Interaction>,
    stopped: bool,
    reverted: bool,
    loop_control: Option<bool>,
}
pub(crate) struct EffectFinding {
    pub primary: Span,
    pub rule: &'static str,
    pub related: Vec<RelatedEvidence>,
}
pub(crate) struct Effects {
    pub findings: Vec<EffectFinding>,
    pub diagnostics: Vec<ScanDiagnostic>,
}
struct Engine<'a> {
    sources: &'a BTreeMap<String, String>,
    ids: &'a BTreeMap<i64, String>,
    declarations: BTreeMap<i64, Declaration>,
    // Only complete function/modifier subtrees are retained; no subtree-per-node copies.
    definitions: BTreeMap<i64, &'a Value>,
    output: Effects,
    stack: Vec<i64>,
    chain: Vec<Span>,
    call_sites: Vec<Span>,
    entry_external: bool,
    steps: usize,
    emitted: usize,
    total_steps: usize,
}
fn kind(n: &Value) -> &str {
    n["nodeType"].as_str().unwrap_or("")
}
fn reference(n: &Value) -> Option<i64> {
    n["referencedDeclaration"].as_i64()
}
fn expression(n: &Value) -> &Value {
    if kind(n) == "FunctionCallOptions" {
        &n["expression"]
    } else {
        n
    }
}
fn list(n: &Value) -> &[Value] {
    n.as_array().map(Vec::as_slice).unwrap_or(&[])
}
fn literal_bool(n: &Value) -> Option<bool> {
    if kind(n) == "Literal" && n["kind"] == "bool" {
        return match n["value"].as_str() {
            Some("true") => Some(true),
            Some("false") => Some(false),
            _ => None,
        };
    }
    if kind(n) == "UnaryOperation" && n["operator"] == "!" {
        return literal_bool(&n["subExpression"]).map(|value| !value);
    }
    None
}
fn span(n: &Value, ids: &BTreeMap<i64, String>) -> Option<Span> {
    let mut p = n["src"].as_str()?.split(':');
    let start = p.next()?.parse().ok()?;
    let len: usize = p.next()?.parse().ok()?;
    Some(Span {
        file: ids.get(&p.next()?.parse::<i64>().ok()?)?.clone(),
        start,
        end: start.checked_add(len)?,
    })
}
fn collect<'a>(n: &'a Value, out: &mut Vec<&'a Value>) {
    match n {
        Value::Object(m) => {
            if m.contains_key("nodeType") {
                out.push(n);
            }
            for v in m.values() {
                collect(v, out);
            }
        }
        Value::Array(a) => {
            for v in a {
                collect(v, out);
            }
        }
        _ => {}
    }
}
impl Effects {
    pub(crate) fn build(
        output: &Value,
        ids: &BTreeMap<i64, String>,
        sources: &BTreeMap<String, String>,
    ) -> Self {
        let mut all = Vec::new();
        for data in output["sources"]
            .as_object()
            .into_iter()
            .flat_map(|o| o.values())
        {
            collect(&data["ast"], &mut all);
        }
        let mut engine = Engine {
            sources,
            ids,
            declarations: BTreeMap::new(),
            definitions: BTreeMap::new(),
            output: Effects {
                findings: Vec::new(),
                diagnostics: Vec::new(),
            },
            stack: Vec::new(),
            chain: Vec::new(),
            call_sites: Vec::new(),
            entry_external: false,
            steps: 0,
            emitted: 0,
            total_steps: 0,
        };
        for n in all {
            if let (Some(id), Some(span)) = (n["id"].as_i64(), span(n, ids)) {
                if kind(n) == "VariableDeclaration" {
                    engine.declarations.insert(
                        id,
                        Declaration {
                            span,
                            state: n["stateVariable"] == true,
                            storage: n["storageLocation"] == "storage",
                            address: n["typeDescriptions"]["typeString"]
                                .as_str()
                                .is_some_and(|s| s.starts_with("address")),
                        },
                    );
                } else if matches!(kind(n), "FunctionDefinition" | "ModifierDefinition") {
                    engine.definitions.insert(id, n);
                }
            }
        }
        let roots: Vec<_> = engine
            .definitions
            .iter()
            .filter(|(_, n)| {
                kind(n) == "FunctionDefinition"
                    && n["kind"] != "constructor"
                    && n["implemented"] != false
                    && !n["body"].is_null()
            })
            .map(|(id, n)| (*id, *n))
            .collect();
        for (id, n) in roots {
            if engine.total_steps > MAX_TOTAL_STEPS {
                break;
            }
            engine.steps = 0;
            engine.emitted = 0;
            engine.stack = vec![id];
            engine.chain.clear();
            engine.call_sites.clear();
            engine.entry_external = matches!(n["visibility"].as_str(), Some("external" | "public"));
            let mut state = PathState::default();
            for p in list(&n["parameters"]["parameters"]) {
                if let Some(pid) = p["id"].as_i64() {
                    let mut b = Binding::default();
                    if engine.entry_external {
                        b.origin = span(p, ids);
                    }
                    // Standalone storage-reference parameters have unknown roots. They are
                    // concretely bound when expanded from a caller.
                    state.bindings.insert(pid, b);
                }
            }
            engine.wrapped(n, 0, vec![state]);
        }
        engine.output.diagnostics.sort_by(|a, b| {
            (&a.file, a.line, a.column, &a.message).cmp(&(&b.file, b.line, b.column, &b.message))
        });
        engine.output.diagnostics.dedup_by(|a, b| {
            a.file == b.file && a.line == b.line && a.column == b.column && a.message == b.message
        });
        if engine.output.diagnostics.len() > 20 {
            let omitted = engine.output.diagnostics.len() - 19;
            engine.output.diagnostics.truncate(20);
            engine.output.diagnostics[19].message = format!(
                "Native-effect diagnostic limit reached; {omitted} additional limitations require review. Analysis remains incomplete."
            );
        }
        engine.output
    }
}
impl Engine<'_> {
    fn step(&mut self, n: &Value) -> bool {
        self.steps += 1;
        self.total_steps += 1;
        if self.total_steps > MAX_TOTAL_STEPS {
            if self.total_steps == MAX_TOTAL_STEPS + 1 {
                self.limitation(n, "Snapshot-wide ordered effect work budget exhausted.");
            }
            return false;
        }
        if self.steps > MAX_STEPS {
            if self.steps == MAX_STEPS + 1 {
                self.limitation(n, "Ordered effect work budget exhausted.");
            }
            return false;
        }
        true
    }
    fn primary(&self, actual: &Span) -> Span {
        if let Some(call) = self.call_sites.first() {
            return call.clone();
        }
        // An interaction in an inherited modifier needs the invocation site to
        // distinguish callers; an interaction in the wrapped body keeps its own site.
        if self
            .chain
            .iter()
            .skip(1)
            .any(|s| s.file == actual.file && s.start <= actual.start && actual.end <= s.end)
            && let Some(invocation) = self.chain.first()
        {
            return invocation.clone();
        }
        actual.clone()
    }
    fn limitation(&mut self, n: &Value, message: &str) {
        let s = span(n, self.ids);
        let pos = s
            .as_ref()
            .and_then(|s| self.sources.get(&s.file).map(|v| node_location(v, s.start)));
        self.output.diagnostics.push(ScanDiagnostic {
            code: "native-effects-incomplete".into(),
            message: message.into(),
            file: s.map(|s| s.file),
            line: pos.map(|p| p.0),
            column: pos.map(|p| p.1),
        });
    }
    fn evidence(&self, s: &Span, label: &str) -> Option<RelatedEvidence> {
        let source = self.sources.get(&s.file)?;
        let (a, b) = (node_location(source, s.start), node_location(source, s.end));
        Some(RelatedEvidence {
            source_sha256: Some(hex_sha256(source.as_bytes())),
            label: label.into(),
            excerpt: source.get(s.start..s.end)?.into(),
            location: FindingLocation {
                file: s.file.clone(),
                start_line: a.0,
                start_column: a.1,
                end_line: b.0,
                end_column: b.1,
                byte_start: s.start,
                byte_end: s.end,
            },
        })
    }
    fn emit(&mut self, n: &Value, primary: Span, rule: &'static str, spans: Vec<(Span, &str)>) {
        self.emitted += 1;
        if self.emitted > MAX_FINDINGS {
            if self.emitted == MAX_FINDINGS + 1 {
                self.limitation(n, "Per-entrypoint finding bound exhausted.");
            }
            return;
        }
        let mut related = Vec::new();
        for (s, label) in spans {
            if let Some(e) = self.evidence(&s, label)
                && !related
                    .iter()
                    .any(|x: &RelatedEvidence| x.location == e.location)
            {
                related.push(e);
            }
        }
        if related.len() > MAX_EVIDENCE {
            self.limitation(n,"Ordered effect provenance exceeds the eight-item evidence limit; finding withheld.");
            return;
        }
        self.output.findings.push(EffectFinding {
            primary,
            rule,
            related,
        });
    }
    fn value(&self, n: &Value, state: &PathState) -> Binding {
        if let Some(id) = reference(n) {
            if self.declarations.get(&id).is_some_and(|d| d.state) {
                return Binding {
                    roots: BTreeSet::from([id]),
                    ..Binding::default()
                };
            }
            if let Some(b) = state.bindings.get(&id) {
                return b.clone();
            }
        }
        match kind(n) {
            "MemberAccess"
                if n["memberName"] == "sender"
                    && n["expression"]["name"] == "msg"
                    && reference(&n["expression"]).is_some_and(|id| id < 0) =>
            {
                Binding {
                    origin: span(n, self.ids),
                    ..Binding::default()
                }
            }
            "MemberAccess" => self.value(&n["expression"], state),
            "IndexAccess" | "IndexRangeAccess" => self.value(&n["baseExpression"], state),
            "FunctionCall" if n["kind"] == "typeConversion" => list(&n["arguments"])
                .first()
                .map(|x| self.value(x, state))
                .unwrap_or_default(),
            "FunctionCall" => Binding {
                unknown: true,
                ..Binding::default()
            },
            _ => Binding::default(),
        }
    }
    fn sender(n: &Value) -> bool {
        kind(n) == "MemberAccess"
            && n["memberName"] == "sender"
            && n["expression"]["name"] == "msg"
            && reference(&n["expression"]).is_some_and(|id| id < 0)
    }
    fn guard(&self, n: &Value, state: &PathState, truth: bool) -> bool {
        if kind(n) != "BinaryOperation" {
            return false;
        }
        let (a, b) = (&n["leftExpression"], &n["rightExpression"]);
        match n["operator"].as_str().unwrap_or("") {
            "&&" if truth => self.guard(a, state, true) || self.guard(b, state, true),
            "||" if truth => self.guard(a, state, true) && self.guard(b, state, true),
            op if (truth && op == "==") || (!truth && op == "!=") => {
                let anchor = if Self::sender(a) {
                    b
                } else if Self::sender(b) {
                    a
                } else {
                    return false;
                };
                let v = self.value(anchor, state);
                !v.roots.is_empty()
                    && v.origin.is_none()
                    && v.roots.iter().all(|id| {
                        self.declarations
                            .get(id)
                            .is_some_and(|d| d.state && d.address)
                            && !state.changed.contains(id)
                    })
            }
            _ => false,
        }
    }
    fn wrapped(
        &mut self,
        function: &Value,
        index: usize,
        mut states: Vec<PathState>,
    ) -> Vec<PathState> {
        let mods = list(&function["modifiers"]);
        if index >= mods.len() {
            return self.stmt(&function["body"], states, None);
        }
        if index >= MAX_DEPTH {
            self.limitation(function, "Modifier expansion depth exhausted.");
            return states;
        }
        let invocation = &mods[index];
        let Some(id) = reference(&invocation["modifierName"]) else {
            self.limitation(invocation, "Unresolved modifier effects.");
            return self.wrapped(function, index + 1, states);
        };
        let Some(def) = self.definitions.get(&id).copied() else {
            self.limitation(invocation, "Modifier definition is unavailable.");
            return self.wrapped(function, index + 1, states);
        };
        if def["virtual"] == true || def["body"].is_null() {
            self.limitation(
                invocation,
                "Virtual or unimplemented modifier effects are unsupported.",
            );
            return self.wrapped(function, index + 1, states);
        }
        for s in &mut states {
            for (p, arg) in list(&def["parameters"]["parameters"])
                .iter()
                .zip(list(&invocation["arguments"]))
            {
                if let Some(pid) = p["id"].as_i64() {
                    let mut binding = self.value(arg, s);
                    if matches!(p["storageLocation"].as_str(), Some("memory" | "calldata")) {
                        binding.roots.clear();
                    }
                    s.bindings.insert(pid, binding);
                }
            }
        }
        let old = self.chain.len();
        if let Some(s) = span(invocation, self.ids) {
            self.chain.push(s);
        }
        if let Some(s) = span(def, self.ids) {
            self.chain.push(s);
        }
        let result = self.stmt(&def["body"], states, Some((function, index + 1)));
        self.chain.truncate(old);
        result
    }
    fn stmt<'n>(
        &mut self,
        n: &'n Value,
        mut states: Vec<PathState>,
        placeholder: Option<(&'n Value, usize)>,
    ) -> Vec<PathState> {
        if !self.step(n) {
            return states;
        }
        if states.len() > MAX_PATHS {
            self.limitation(n, "Ordered effect path bound exhausted.");
            states.truncate(MAX_PATHS);
        }
        match kind(n) {
            "Block" | "UncheckedBlock" => {
                for child in list(&n["statements"]) {
                    states = self.stmt(child, states, placeholder);
                }
                states
            }
            "PlaceholderStatement" => {
                if let Some((f, i)) = placeholder {
                    let mut result = self.wrapped(f, i, states);
                    // A return from the function body still executes modifier suffixes.
                    for s in &mut result {
                        if !s.reverted {
                            s.stopped = false;
                        }
                    }
                    result
                } else {
                    self.limitation(n, "Unbound modifier placeholder.");
                    states
                }
            }
            "IfStatement" => {
                states = self.expr(&n["condition"], states);
                let mut yes = Vec::new();
                let mut no = Vec::new();
                for s in states {
                    if s.stopped {
                        yes.push(s);
                        continue;
                    }
                    let mut a = s.clone();
                    let mut b = s;
                    a.authorized |= self.guard(&n["condition"], &a, true);
                    b.authorized |= self.guard(&n["condition"], &b, false);
                    yes.push(a);
                    no.push(b);
                }
                let mut result = self.stmt(&n["trueBody"], yes, placeholder);
                result.extend(self.stmt(&n["falseBody"], no, placeholder));
                if result.len() > MAX_PATHS {
                    self.limitation(n, "Ordered effect path bound exhausted.");
                    result.truncate(MAX_PATHS);
                }
                result
            }
            "ExpressionStatement" => self.expr(&n["expression"], states),
            "VariableDeclarationStatement" => {
                states = self.expr(&n["initialValue"], states);
                for s in &mut states {
                    if s.stopped {
                        continue;
                    }
                    for (i, d) in list(&n["declarations"]).iter().enumerate() {
                        if let Some(id) = d["id"].as_i64() {
                            let init = if kind(&n["initialValue"]) == "TupleExpression" {
                                list(&n["initialValue"]["components"])
                                    .get(i)
                                    .unwrap_or(&Value::Null)
                            } else {
                                &n["initialValue"]
                            };
                            let mut b = self.value(init, s);
                            if d["storageLocation"] != "storage" {
                                b.roots.clear();
                            }
                            if let Some(sp) = span(n, self.ids) {
                                b.chain.push(sp);
                            }
                            s.bindings.insert(id, b);
                        }
                    }
                }
                states
            }
            "Return" | "RevertStatement" | "Throw" => {
                states = self.expr(&n["expression"], states);
                for s in &mut states {
                    s.stopped = true;
                    s.reverted |= kind(n) != "Return";
                }
                states
            }
            "ForStatement" | "WhileStatement" | "DoWhileStatement" => {
                // A syntactic iteration is sufficient for same-iteration ordering;
                // retain the zero-iteration path and never join mutually exclusive arms.
                states = self.stmt(&n["initializationExpression"], states, placeholder);
                states = self.expr(&n["condition"], states);
                let zero = states.clone();
                let body = self.stmt(&n["body"], states, placeholder);
                let mut exits = Vec::new();
                let mut iteration = Vec::new();
                for mut s in body {
                    match s.loop_control.take() {
                        Some(true) => {
                            s.stopped = false;
                            exits.push(s);
                        }
                        Some(false) => {
                            s.stopped = false;
                            iteration.push(s);
                        }
                        None => iteration.push(s),
                    }
                }
                exits.extend(self.stmt(&n["loopExpression"], iteration, placeholder));
                if kind(n) != "DoWhileStatement" {
                    exits.extend(zero);
                }
                exits
            }
            "Break" | "Continue" => {
                for s in &mut states {
                    if !s.stopped {
                        s.stopped = true;
                        s.loop_control = Some(kind(n) == "Break");
                    }
                }
                states
            }
            "InlineAssembly" => {
                self.limitation(n, "Assembly effects are not modeled.");
                states
            }
            "EmitStatement" => self.expr(&n["eventCall"], states),
            _ => states,
        }
    }
    fn write(&mut self, n: &Value, target: &Value, state: &mut PathState) {
        let binding = self.value(target, state);
        if binding.roots.is_empty() {
            let mut base = target;
            loop {
                base = match kind(base) {
                    "MemberAccess" => &base["expression"],
                    "IndexAccess" | "IndexRangeAccess" => &base["baseExpression"],
                    _ => break,
                };
            }
            if (self.entry_external || self.stack.len() > 1)
                && reference(base)
                    .and_then(|id| self.declarations.get(&id))
                    .is_some_and(|d| d.storage)
            {
                self.limitation(n, "Storage-reference write has an unresolved root.");
            }
            return;
        }
        state.changed.extend(&binding.roots);
        let Some(write) = span(n, self.ids) else {
            return;
        };
        for interaction in state.interactions.clone() {
            let mut evidence = vec![
                (interaction.actual.clone(), "Resolved external interaction"),
                (write.clone(), "Later storage write"),
            ];
            for id in &binding.roots {
                if let Some(d) = self.declarations.get(id) {
                    evidence.push((d.span.clone(), "Compiler-resolved storage root"));
                }
            }
            for s in interaction
                .chain
                .iter()
                .chain(self.chain.iter())
                .chain(binding.chain.iter())
            {
                evidence.push((s.clone(), "Resolved effect binding or call chain"));
            }
            self.emit(n, interaction.primary, "OG-SOL-002", evidence);
        }
    }
    fn expr(&mut self, n: &Value, mut states: Vec<PathState>) -> Vec<PathState> {
        states = self.expr_inner(n, states);
        if states.len() > MAX_PATHS {
            self.limitation(n, "Ordered effect path bound exhausted.");
            states.truncate(MAX_PATHS);
        }
        states
    }
    fn expr_inner(&mut self, n: &Value, mut states: Vec<PathState>) -> Vec<PathState> {
        if n.is_null() {
            return states;
        }
        if !self.step(n) {
            return states;
        }
        match kind(n) {
            "Assignment" => {
                states = self.expr(&n["rightHandSide"], states);
                for s in &mut states {
                    if s.stopped {
                        continue;
                    }
                    let lhs = &n["leftHandSide"];
                    let rhs = &n["rightHandSide"];
                    let targets = if kind(lhs) == "TupleExpression" {
                        list(&lhs["components"]).iter().collect::<Vec<_>>()
                    } else {
                        vec![lhs]
                    };
                    let values = if kind(rhs) == "TupleExpression" {
                        list(&rhs["components"])
                            .iter()
                            .map(|r| self.value(r, s))
                            .collect::<Vec<_>>()
                    } else {
                        vec![self.value(rhs, s)]
                    };
                    for (i, target) in targets.into_iter().enumerate() {
                        let local = reference(target).and_then(|id| {
                            self.declarations
                                .get(&id)
                                .filter(|d| !d.state)
                                .map(|d| (id, d.storage))
                        });
                        if kind(target) == "Identifier"
                            && let Some((id, storage)) = local
                        {
                            let mut b = values.get(i).cloned().unwrap_or_default();
                            if !storage {
                                b.roots.clear();
                            }
                            if let Some(sp) = span(n, self.ids) {
                                b.chain.push(sp);
                            }
                            s.bindings.insert(id, b);
                        } else {
                            self.write(n, target, s);
                        }
                    }
                }
                states
            }
            "UnaryOperation" => {
                states = self.expr(&n["subExpression"], states);
                if matches!(n["operator"].as_str(), Some("delete" | "++" | "--")) {
                    for s in &mut states {
                        if !s.stopped {
                            self.write(n, &n["subExpression"], s);
                        }
                    }
                }
                states
            }
            "FunctionCall" => self.call(n, states),
            "BinaryOperation" => {
                let left = &n["leftExpression"];
                states = self.expr(left, states);
                let op = n["operator"].as_str().unwrap_or("");
                if matches!(op, "&&" | "||") {
                    // RHS effects exist only on the path that evaluates it.
                    // In particular, a guard helper on a skipped RHS cannot
                    // authorize later effects on the short-circuit path.
                    let evaluates_when = op == "&&";
                    let known = literal_bool(left);
                    let mut skipped = Vec::new();
                    let mut evaluated = Vec::new();
                    for state in states {
                        if state.stopped {
                            skipped.push(state);
                            continue;
                        }
                        if known != Some(evaluates_when) {
                            let mut skip = state.clone();
                            skip.authorized |= self.guard(left, &skip, !evaluates_when);
                            skipped.push(skip);
                        }
                        if known != Some(!evaluates_when) {
                            let mut execute = state;
                            execute.authorized |= self.guard(left, &execute, evaluates_when);
                            evaluated.push(execute);
                        }
                    }
                    if !evaluated.is_empty() {
                        skipped.extend(self.expr(&n["rightExpression"], evaluated));
                    }
                    skipped
                } else {
                    self.expr(&n["rightExpression"], states)
                }
            }
            "Conditional" => {
                states = self.expr(&n["condition"], states);
                let mut a = self.expr(&n["trueExpression"], states.clone());
                a.extend(self.expr(&n["falseExpression"], states));
                a
            }
            "TupleExpression" => {
                for x in list(&n["components"]) {
                    states = self.expr(x, states);
                }
                states
            }
            "IndexAccess" => {
                states = self.expr(&n["baseExpression"], states);
                self.expr(&n["indexExpression"], states)
            }
            "MemberAccess" => self.expr(&n["expression"], states),
            _ => states,
        }
    }
    fn call(&mut self, n: &Value, mut states: Vec<PathState>) -> Vec<PathState> {
        for arg in list(&n["arguments"]) {
            states = self.expr(arg, states);
        }
        let callee = expression(&n["expression"]);
        if kind(callee) == "MemberAccess" {
            states = self.expr(&callee["expression"], states);
        }
        if kind(&n["expression"]) == "FunctionCallOptions" {
            for option in list(&n["expression"]["options"]) {
                states = self.expr(option, states);
            }
        }
        if n["kind"] == "typeConversion" || n["kind"] == "structConstructorCall" {
            return states;
        }
        let name = callee["name"].as_str().unwrap_or("");
        if reference(callee).is_some_and(|id| id < 0) {
            if matches!(name, "require" | "assert") {
                for s in &mut states {
                    if !s.stopped {
                        s.authorized |= list(&n["arguments"])
                            .first()
                            .is_some_and(|c| self.guard(c, s, true));
                    }
                }
            }
            if name == "revert" {
                for s in &mut states {
                    s.stopped = true;
                    s.reverted = true;
                }
            }
            if name == "selfdestruct" && self.entry_external {
                for s in &states {
                    if !s.stopped
                        && !s.authorized
                        && let Some(actual) = span(n, self.ids)
                    {
                        let primary = self.primary(&actual);
                        let mut e = vec![(actual, "Resolved destruction effect")];
                        e.extend(
                            self.chain
                                .iter()
                                .cloned()
                                .map(|s| (s, "Resolved call or modifier chain")),
                        );
                        self.emit(n, primary, "OG-SOL-006", e);
                    }
                }
            }
            return states;
        }
        let ty = callee["typeDescriptions"]["typeIdentifier"]
            .as_str()
            .unwrap_or("");
        let method = callee["memberName"].as_str().unwrap_or("");
        if matches!(method, "push" | "pop") && (ty.contains("arraypush") || ty.contains("arraypop"))
        {
            for state in &mut states {
                if !state.stopped {
                    self.write(n, &callee["expression"], state);
                }
            }
            return states;
        }
        let low = matches!(
            method,
            "call" | "delegatecall" | "staticcall" | "send" | "transfer"
        ) && callee["expression"]["typeDescriptions"]["typeString"]
            .as_str()
            .is_some_and(|s| s.starts_with("address"));
        if low || ty.contains("t_function_external") {
            let Some(actual) = span(n, self.ids) else {
                return states;
            };
            let primary = self.primary(&actual);
            for s in &mut states {
                if s.stopped {
                    continue;
                }
                if method == "delegatecall" && self.entry_external && !s.authorized {
                    let b = self.value(&callee["expression"], s);
                    if b.unknown {
                        self.limitation(n, "Helper return-value target provenance is not modeled.");
                    }
                    if let Some(origin) = b.origin {
                        let mut e = vec![
                            (actual.clone(), "Resolved delegated interaction"),
                            (origin, "Caller-controlled target source"),
                        ];
                        e.extend(
                            self.chain
                                .iter()
                                .chain(b.chain.iter())
                                .cloned()
                                .map(|s| (s, "Resolved argument or call chain")),
                        );
                        self.emit(n, primary.clone(), "OG-SOL-005", e);
                    }
                }
                if method != "staticcall" && method != "send" && method != "transfer" {
                    if s.interactions.len() >= MAX_INTERACTIONS {
                        self.limitation(n, "Per-path interaction bound exhausted.");
                    } else {
                        s.interactions.push(Interaction {
                            primary: primary.clone(),
                            actual: actual.clone(),
                            chain: self.chain.clone(),
                        });
                    }
                }
            }
            return states;
        }
        if let Some(id) = reference(callee)
            && let Some(def) = self.definitions.get(&id).copied()
        {
            if self.stack.contains(&id) || self.stack.len() >= MAX_DEPTH {
                self.limitation(n, "Recursive call or helper expansion depth exhausted.");
                return states;
            }
            if def["virtual"] == true
                || def["body"].is_null()
                || !matches!(def["visibility"].as_str(), Some("internal" | "private"))
            {
                self.limitation(n,"Virtual, unimplemented or non-internal helper effects are not statically expanded.");
                return states;
            }
            let mut active = Vec::new();
            let mut stopped = Vec::new();
            let parameters = list(&def["parameters"]["parameters"]);
            let arguments = list(&n["arguments"]);
            let names = list(&n["names"]);
            if parameters.len() != arguments.len() {
                self.limitation(
                    n,
                    "Implicit helper receiver or argument arity is not modeled.",
                );
                return states;
            }
            for mut s in states {
                if s.stopped {
                    stopped.push(s);
                    continue;
                }
                for (index, p) in parameters.iter().enumerate() {
                    let argument_index = if names.is_empty() {
                        Some(index)
                    } else {
                        names.iter().position(|name| name == &p["name"])
                    };
                    let Some(a) = argument_index.and_then(|i| arguments.get(i)) else {
                        self.limitation(n, "Named helper argument binding is unresolved.");
                        continue;
                    };
                    if let Some(pid) = p["id"].as_i64() {
                        let mut b = self.value(a, &s);
                        // Passing a storage object to a memory/calldata reference
                        // formal copies its value; writes to the formal do not
                        // mutate the original storage region. Scalar authority
                        // value provenance is retained (storageLocation=default).
                        if matches!(p["storageLocation"].as_str(), Some("memory" | "calldata")) {
                            b.roots.clear();
                        }
                        if let Some(sp) = span(n, self.ids) {
                            b.chain.push(sp);
                        }
                        s.bindings.insert(pid, b);
                    }
                }
                active.push(s);
            }
            self.stack.push(id);
            let old = self.chain.len();
            if let Some(sp) = span(n, self.ids) {
                self.chain.push(sp.clone());
                self.call_sites.push(sp);
            }
            if let Some(sp) = span(def, self.ids) {
                self.chain.push(sp);
            }
            let mut results = self.wrapped(def, 0, active);
            for s in &mut results {
                if !s.reverted {
                    s.stopped = false;
                }
            }
            self.stack.pop();
            self.call_sites.pop();
            self.chain.truncate(old);
            results.extend(stopped);
            return results;
        }
        // Compiler-known ABI/hash and array operations have no modeled callback.
        if ty.contains("t_function_internal") || ty.contains("t_function_bare") {
            self.limitation(
                n,
                "Unresolved function-pointer effects are not statically expanded.",
            );
        }
        states
    }
}

use crate::compiler::{ResolvedType, SemanticModel};
use crate::{
    Finding, FindingLocation, RelatedEvidence, ScanDiagnostic, make_finding, node_location, rules,
};
use tree_sitter::{Node, Parser};

fn children(node: Node<'_>) -> Vec<Node<'_>> {
    (0..node.named_child_count())
        .filter_map(|i| node.named_child(i as u32))
        .collect()
}
fn nodes(root: Node<'_>) -> Vec<Node<'_>> {
    let mut found = Vec::new();
    let mut stack = vec![root];
    while let Some(node) = stack.pop() {
        found.push(node);
        stack.extend(children(node).into_iter().rev());
    }
    found
}
fn text<'s>(source: &'s str, node: Node<'_>) -> &'s str {
    source.get(node.byte_range()).unwrap_or("")
}
fn contains(parent: Node<'_>, child: Node<'_>) -> bool {
    parent.start_byte() <= child.start_byte() && child.end_byte() <= parent.end_byte()
}
fn ancestor<'t>(node: Node<'t>, kinds: &[&str]) -> Option<Node<'t>> {
    let mut current = node.parent();
    while let Some(parent) = current {
        if kinds.contains(&parent.kind()) {
            return Some(parent);
        }
        current = parent.parent();
    }
    None
}
fn peel(mut node: Node<'_>) -> Node<'_> {
    while matches!(node.kind(), "expression" | "parenthesized_expression")
        && node.named_child_count() == 1
    {
        node = node.named_child(0).unwrap();
    }
    node
}
fn args(call: Node<'_>) -> Vec<Node<'_>> {
    children(call)
        .into_iter()
        .filter(|node| node.kind() == "call_argument")
        .filter_map(|node| node.named_child(0))
        .map(peel)
        .collect()
}
fn callee(call: Node<'_>) -> Option<Node<'_>> {
    let mut function = peel(call.child_by_field_name("function")?);
    if function.kind() == "struct_expression" {
        function = peel(function.child_by_field_name("type")?);
    }
    Some(function)
}
fn member(call: Node<'_>) -> Option<(Node<'_>, Node<'_>)> {
    let function = callee(call)?;
    if function.kind() != "member_expression" {
        return None;
    }
    Some((
        peel(function.child_by_field_name("object")?),
        function.child_by_field_name("property")?,
    ))
}
fn builtin_member(node: Node<'_>, source: &str, object: &str, property: &str) -> bool {
    let node = peel(node);
    node.kind() == "member_expression"
        && node
            .child_by_field_name("object")
            .is_some_and(|n| text(source, peel(n)) == object)
        && node
            .child_by_field_name("property")
            .is_some_and(|n| text(source, n) == property)
}
fn operator<'s>(node: Node<'_>, source: &'s str) -> &'s str {
    node.child_by_field_name("operator")
        .map(|n| text(source, n))
        .unwrap_or("")
}
fn in_condition<'t>(
    node: Node<'t>,
    source: &str,
    all: &'t [Node<'t>],
    file: &str,
    semantic: Option<&SemanticModel>,
) -> bool {
    let mut current = node.parent();
    while let Some(parent) = current {
        if parent.kind() == "call_expression"
            && callee(parent).is_some_and(|n| matches!(text(source, n), "require" | "assert"))
            && ancestor(
                parent,
                &[
                    "function_definition",
                    "modifier_definition",
                    "fallback_receive_definition",
                ],
            )
            .and_then(|function| Context::new(source, function, all, file, semantic))
            .is_none_or(|context| {
                context.builtin_call(parent, "require") || context.builtin_call(parent, "assert")
            })
            && args(parent).first().is_some_and(|arg| contains(*arg, node))
        {
            return true;
        }
        if parent.kind() == "if_statement"
            && parent
                .child_by_field_name("condition")
                .is_some_and(|n| contains(n, node))
        {
            return true;
        }
        if matches!(parent.kind(), "function_definition" | "modifier_definition") {
            break;
        }
        current = parent.parent();
    }
    false
}
fn discarded(call: Node<'_>) -> bool {
    let mut node = call;
    while let Some(parent) = node.parent() {
        if parent.kind() == "expression_statement" {
            return true;
        }
        if !matches!(parent.kind(), "expression" | "parenthesized_expression") {
            return false;
        }
        node = parent;
    }
    false
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Type {
    Address,
    String,
    Bytes,
    Bool,
    Contract(String),
    Array(Box<Type>),
    Mapping(Box<Type>),
    Other,
}
fn from_resolved_type(value: &ResolvedType) -> Type {
    match value {
        ResolvedType::Address => Type::Address,
        ResolvedType::String => Type::String,
        ResolvedType::Bytes => Type::Bytes,
        ResolvedType::Bool => Type::Bool,
        ResolvedType::Contract(name) => Type::Contract(name.clone()),
        ResolvedType::Array(inner) => Type::Array(Box::new(from_resolved_type(inner))),
        ResolvedType::Other => Type::Other,
    }
}
fn type_of(node: Node<'_>, source: &str) -> Type {
    if let Some(value) = node.child_by_field_name("value_type") {
        return Type::Mapping(Box::new(type_of(value, source)));
    }
    let raw = text(source, node).trim();
    if let Some(inner) = children(node).into_iter().find(|n| n.kind() == "type_name") {
        return Type::Array(Box::new(type_of(inner, source)));
    }
    if matches!(
        raw.split_whitespace().collect::<Vec<_>>().as_slice(),
        ["address"] | ["address", "payable"]
    ) {
        Type::Address
    } else if raw == "string" {
        Type::String
    } else if raw == "bytes" {
        Type::Bytes
    } else if raw == "bool" {
        Type::Bool
    } else if children(node)
        .iter()
        .any(|n| n.kind() == "user_defined_type")
        || node.kind() == "user_defined_type"
    {
        Type::Contract(raw.into())
    } else {
        Type::Other
    }
}
struct Binding<'t> {
    name: String,
    ty: Type,
    declaration: Node<'t>,
    scope: Node<'t>,
    state: bool,
    parameter: bool,
}
struct Context<'t, 's> {
    source: &'s str,
    function: Node<'t>,
    contract: Option<Node<'t>>,
    body_nodes: Vec<Node<'t>>,
    all: &'t [Node<'t>],
    bindings: Vec<Binding<'t>>,
    file: &'s str,
    semantic: Option<&'s SemanticModel>,
}
impl<'t, 's> Context<'t, 's> {
    fn new(
        source: &'s str,
        function: Node<'t>,
        all: &'t [Node<'t>],
        file: &'s str,
        semantic: Option<&'s SemanticModel>,
    ) -> Option<Self> {
        let body = function.child_by_field_name("body")?;
        let body_nodes = nodes(body);
        let contract = ancestor(
            function,
            &[
                "contract_declaration",
                "interface_declaration",
                "library_declaration",
            ],
        );
        let mut bindings = Vec::new();
        if let Some(contract) = contract
            && let Some(contract_body) = contract.child_by_field_name("body")
        {
            for node in children(contract_body)
                .into_iter()
                .filter(|n| n.kind() == "state_variable_declaration")
            {
                if let (Some(name), Some(ty)) = (
                    node.child_by_field_name("name"),
                    node.child_by_field_name("type"),
                ) {
                    bindings.push(Binding {
                        name: text(source, name).into(),
                        ty: type_of(ty, source),
                        declaration: node,
                        scope: body,
                        state: true,
                        parameter: false,
                    });
                }
            }
        }
        for node in children(function)
            .into_iter()
            .filter(|n| n.kind() == "parameter")
        {
            if let (Some(name), Some(ty)) = (
                node.child_by_field_name("name"),
                node.child_by_field_name("type"),
            ) {
                bindings.push(Binding {
                    name: text(source, name).into(),
                    ty: type_of(ty, source),
                    declaration: node,
                    scope: body,
                    state: false,
                    parameter: true,
                });
            }
        }
        for node in body_nodes
            .iter()
            .copied()
            .filter(|n| n.kind() == "variable_declaration")
        {
            if let (Some(name), Some(ty)) = (
                node.child_by_field_name("name"),
                node.child_by_field_name("type"),
            ) {
                let scope = ancestor(node, &["block_statement", "for_statement", "function_body"])
                    .unwrap_or(body);
                bindings.push(Binding {
                    name: text(source, name).into(),
                    ty: type_of(ty, source),
                    declaration: node,
                    scope,
                    state: false,
                    parameter: false,
                });
            }
        }
        Some(Self {
            source,
            function,
            contract,
            body_nodes,
            all,
            bindings,
            file,
            semantic,
        })
    }
    fn declared_function(&self, name: &str) -> bool {
        self.all.iter().any(|node| {
            node.kind() == "function_definition"
                && node
                    .child_by_field_name("name")
                    .is_some_and(|n| text(self.source, n) == name)
                && {
                    let owner = ancestor(
                        *node,
                        &[
                            "contract_declaration",
                            "interface_declaration",
                            "library_declaration",
                        ],
                    );
                    owner.is_none() || owner.map(|n| n.id()) == self.contract.map(|n| n.id())
                }
        })
    }
    fn builtin_call(&self, call: Node<'t>, name: &str) -> bool {
        if let Some(model) = self.semantic
            && let Some(function) = callee(call)
            && let Some(id) = model.reference(self.file, function.start_byte(), function.end_byte())
        {
            return text(self.source, function) == name && id < 0;
        }
        callee(call).is_some_and(|n| n.kind() == "identifier" && text(self.source, n) == name)
            && !self.declared_function(name)
            && self.binding(name, call).is_none()
    }
    fn builtin_member(&self, node: Node<'t>, object: &str, property: &str) -> bool {
        if let Some(model) = self.semantic {
            let node = peel(node);
            return model.builtin_member(
                self.file,
                node.start_byte(),
                node.end_byte(),
                object,
                property,
            );
        }
        builtin_member(node, self.source, object, property) && self.binding(object, node).is_none()
    }
    fn binding(&self, name: &str, at: Node<'t>) -> Option<&Binding<'t>> {
        self.bindings
            .iter()
            .filter(|b| {
                b.name == name
                    && contains(b.scope, at)
                    && (b.state || b.parameter || b.declaration.start_byte() < at.start_byte())
            })
            .max_by_key(|b| {
                (
                    !b.state,
                    b.parameter as u8 ^ 1,
                    usize::MAX - b.scope.byte_range().len(),
                    b.declaration.start_byte(),
                )
            })
    }
    fn expression_type(&self, expression: Node<'t>) -> Type {
        let expression = peel(expression);
        if let Some(resolved) = self.semantic.and_then(|model| {
            model.expression_type(self.file, expression.start_byte(), expression.end_byte())
        }) {
            return from_resolved_type(resolved);
        }
        match expression.kind() {
            "identifier" => self
                .binding(text(self.source, expression), expression)
                .map(|b| b.ty.clone())
                .unwrap_or(Type::Other),
            "payable_conversion_expression" => Type::Address,
            "type_cast_expression" => children(expression)
                .into_iter()
                .find(|n| n.kind() == "primitive_type")
                .map(|n| type_of(n, self.source))
                .unwrap_or(Type::Other),
            "member_expression"
                if self.builtin_member(expression, "msg", "sender")
                    || self.builtin_member(expression, "tx", "origin") =>
            {
                Type::Address
            }
            "array_access" => match expression
                .child_by_field_name("base")
                .map(|n| self.expression_type(n))
            {
                Some(Type::Array(inner) | Type::Mapping(inner)) => *inner,
                _ => Type::Other,
            },
            "call_expression" => {
                let name = callee(expression)
                    .map(|n| text(self.source, n))
                    .unwrap_or("");
                if self.all.iter().any(|n| {
                    matches!(n.kind(), "contract_declaration" | "interface_declaration")
                        && n.child_by_field_name("name")
                            .is_some_and(|n| text(self.source, n) == name)
                }) {
                    Type::Contract(name.into())
                } else {
                    Type::Other
                }
            }
            _ => Type::Other,
        }
    }
    fn storage_root(&self, expression: Node<'t>) -> Option<&Binding<'t>> {
        let expression = peel(expression);
        match expression.kind() {
            "identifier" => self
                .binding(text(self.source, expression), expression)
                .filter(|b| b.state),
            "array_access" => self.storage_root(expression.child_by_field_name("base")?),
            "member_expression" => self.storage_root(expression.child_by_field_name("object")?),
            _ => None,
        }
    }
    fn state_write(&self, node: Node<'t>) -> bool {
        let lhs = match node.kind() {
            "assignment_expression" | "augmented_assignment_expression" => {
                node.child_by_field_name("left")
            }
            "update_expression" => node.child_by_field_name("argument"),
            "unary_expression" if operator(node, self.source) == "delete" => {
                node.child_by_field_name("argument")
            }
            _ => None,
        };
        let Some(lhs) = lhs else {
            return false;
        };
        if let Some(model) = self.semantic {
            let lhs = peel(lhs);
            return model
                .storage_declaration(self.file, lhs.start_byte(), lhs.end_byte())
                .is_some();
        }
        self.storage_root(lhs).is_some()
    }
    fn storage_evidence(&self, node: Node<'t>) -> Option<RelatedEvidence> {
        let lhs = match node.kind() {
            "assignment_expression" | "augmented_assignment_expression" => {
                node.child_by_field_name("left")
            }
            "update_expression" | "unary_expression" => node.child_by_field_name("argument"),
            _ => None,
        }?;
        let lhs = peel(lhs);
        self.semantic?
            .storage_declaration(self.file, lhs.start_byte(), lhs.end_byte())
    }
    fn external(&self) -> bool {
        self.function.kind() == "fallback_receive_definition"
            || children(self.function).iter().any(|n| {
                n.kind() == "visibility" && matches!(text(self.source, *n), "public" | "external")
            })
    }
    fn reassigned(&self, binding: &Binding<'t>, before: Node<'t>) -> bool {
        self.body_nodes.iter().any(|node| {
            matches!(
                node.kind(),
                "assignment_expression" | "augmented_assignment_expression"
            ) && node.start_byte() > binding.declaration.end_byte()
                && node.start_byte() < before.start_byte()
                && node
                    .child_by_field_name("left")
                    .is_some_and(|lhs| text(self.source, peel(lhs)) == binding.name)
        })
    }
    fn tainted_target(&self, expression: Node<'t>, depth: usize) -> Option<Node<'t>> {
        if depth > 4 {
            return None;
        }
        let expression = peel(expression);
        if self.builtin_member(expression, "msg", "sender") {
            return Some(expression);
        }
        if matches!(
            expression.kind(),
            "payable_conversion_expression" | "type_cast_expression"
        ) {
            return self.tainted_target(*args(expression).first()?, depth + 1);
        }
        if expression.kind() != "identifier" {
            return None;
        }
        let binding = self.binding(text(self.source, expression), expression)?;
        if !matches!(binding.ty, Type::Address | Type::Contract(_))
            || binding.state
            || self.reassigned(binding, expression)
        {
            return None;
        }
        if binding.parameter {
            return Some(binding.declaration);
        }
        let declaration = ancestor(binding.declaration, &["variable_declaration_statement"])?;
        self.tainted_target(declaration.child_by_field_name("value")?, depth + 1)
    }
    fn local_value(&self, expression: Node<'t>) -> Option<(Node<'t>, Node<'t>)> {
        let expression = peel(expression);
        if expression.kind() != "identifier" {
            return None;
        }
        let binding = self.binding(text(self.source, expression), expression)?;
        if binding.state || binding.parameter || self.reassigned(binding, expression) {
            return None;
        }
        let statement = ancestor(binding.declaration, &["variable_declaration_statement"])?;
        Some((binding.declaration, statement.child_by_field_name("value")?))
    }
    fn payment_origin(&self, expression: Node<'t>, depth: usize) -> Option<Vec<Node<'t>>> {
        if depth > 4 {
            return None;
        }
        let expression = peel(expression);
        if self.builtin_member(expression, "msg", "value") {
            return Some(Vec::new());
        }
        if let Some((declaration, value)) = self.local_value(expression) {
            let mut path = self.payment_origin(value, depth + 1)?;
            path.push(declaration);
            return Some(path);
        }
        if expression.kind() == "binary_expression" && operator(expression, self.source) == "+" {
            for field in ["left", "right"] {
                if let Some(path) = expression
                    .child_by_field_name(field)
                    .and_then(|n| self.payment_origin(n, depth + 1))
                {
                    return Some(path);
                }
            }
        }
        None
    }
    fn entropy_origin(&self, expression: Node<'t>, depth: usize) -> Option<Vec<Node<'t>>> {
        if depth > 8 {
            return None;
        }
        let expression = peel(expression);
        let entropy = if expression.kind() == "call_expression" {
            self.builtin_call(expression, "blockhash")
        } else {
            ["timestamp", "number", "prevrandao", "difficulty"]
                .iter()
                .any(|property| self.builtin_member(expression, "block", property))
        };
        if entropy {
            return Some(Vec::new());
        }
        if expression.kind() == "call_expression" {
            let known_hash = ["keccak256", "sha256", "ripemd160"]
                .iter()
                .any(|name| self.builtin_call(expression, name));
            let known_encoding = member(expression).is_some_and(|(receiver, method)| {
                text(self.source, receiver) == "abi"
                    && self.binding("abi", expression).is_none()
                    && matches!(text(self.source, method), "encode" | "encodePacked")
            });
            if !known_hash && !known_encoding {
                return None;
            }
        }
        if let Some((declaration, value)) = self.local_value(expression) {
            let mut path = self.entropy_origin(value, depth + 1)?;
            path.push(declaration);
            return Some(path);
        }
        for child in children(expression) {
            if let Some(path) = self.entropy_origin(child, depth + 1) {
                return Some(path);
            }
        }
        None
    }
    fn selection_origin(&self, expression: Node<'t>, depth: usize) -> Option<Vec<Node<'t>>> {
        if depth > 4 {
            return None;
        }
        let expression = peel(expression);
        if let Some((declaration, value)) = self.local_value(expression) {
            let mut path = self.selection_origin(value, depth + 1)?;
            path.push(declaration);
            return Some(path);
        }
        for node in nodes(expression) {
            if node.kind() == "binary_expression"
                && operator(node, self.source) == "%"
                && let Some(path) = node
                    .child_by_field_name("left")
                    .and_then(|n| self.entropy_origin(n, 0))
            {
                return Some(path);
            }
        }
        None
    }
    fn unchanged_guard_anchor(&self, binding: &Binding<'t>, at: Node<'t>) -> bool {
        // A comparison with mutable storage is not an authorization guard when
        // this invocation may already have replaced that storage value. Treat
        // any earlier direct write conservatively, including writes on branches;
        // this bounded AST analysis does not prove path infeasibility.
        !self.body_nodes.iter().any(|write| {
            if write.start_byte() >= at.start_byte() {
                return false;
            }
            let target = match write.kind() {
                "assignment_expression" | "augmented_assignment_expression" => {
                    write.child_by_field_name("left")
                }
                "update_expression" => write.child_by_field_name("argument"),
                "unary_expression" if operator(*write, self.source) == "delete" => {
                    write.child_by_field_name("argument")
                }
                _ => None,
            };
            target.is_some_and(|target| {
                // Descending also handles tuple assignment. Resolve identifiers
                // in their own scope so a shadowed local cannot poison storage.
                nodes(target).into_iter().any(|node| {
                    node.kind() == "identifier"
                        && self
                            .binding(text(self.source, node), node)
                            .is_some_and(|written| {
                                written.declaration.id() == binding.declaration.id()
                            })
                })
            })
        })
    }
    fn caller_condition(&self, expression: Node<'t>, denied: bool) -> bool {
        let expression = peel(expression);
        if expression.kind() != "binary_expression" {
            return false;
        }
        let (Some(left), Some(right)) = (
            expression.child_by_field_name("left"),
            expression.child_by_field_name("right"),
        ) else {
            return false;
        };
        match operator(expression, self.source) {
            "&&" if !denied => {
                self.caller_condition(left, false) || self.caller_condition(right, false)
            }
            "||" if !denied => {
                self.caller_condition(left, false) && self.caller_condition(right, false)
            }
            op if op == if denied { "!=" } else { "==" } => {
                let owner = |node| {
                    let node = peel(node);
                    node.kind() == "identifier"
                        && self
                            .binding(text(self.source, node), node)
                            .is_some_and(|b| {
                                b.state
                                    && b.ty == Type::Address
                                    && self.unchanged_guard_anchor(b, expression)
                            })
                };
                (self.builtin_member(left, "msg", "sender") && owner(right))
                    || (self.builtin_member(right, "msg", "sender") && owner(left))
            }
            _ => false,
        }
    }
    fn local_guard(&self, sink: Node<'t>) -> bool {
        for call in self
            .body_nodes
            .iter()
            .copied()
            .filter(|n| n.kind() == "call_expression" && n.end_byte() < sink.start_byte())
        {
            if !(self.builtin_call(call, "require") || self.builtin_call(call, "assert")) {
                continue;
            }
            let Some(condition) = args(call).first().copied() else {
                continue;
            };
            if !self.caller_condition(condition, false) {
                continue;
            }
            if dominating_statement(call, sink) {
                return true;
            }
        }
        for branch in self
            .body_nodes
            .iter()
            .copied()
            .filter(|n| n.kind() == "if_statement")
        {
            let Some(condition) = branch.child_by_field_name("condition") else {
                continue;
            };
            let bodies = field_children(branch, "body");
            if bodies.first().is_some_and(|body| contains(*body, sink))
                && self.caller_condition(condition, false)
            {
                return true;
            }
            if branch.end_byte() < sink.start_byte()
                && self.caller_condition(condition, true)
                && bodies.len() == 1
                && bodies.first().is_some_and(|body| only_reverts(*body))
                && dominating_statement(branch, sink)
            {
                return true;
            }
        }
        false
    }
    fn guarded_or_unresolved(&self, sink: Node<'t>) -> bool {
        if self.local_guard(sink) {
            return true;
        }
        for invocation in children(self.function)
            .into_iter()
            .filter(|n| n.kind() == "modifier_invocation")
        {
            let Some(name) = children(invocation)
                .into_iter()
                .find(|n| n.kind() == "identifier")
            else {
                return true;
            };
            let definition = self
                .contract
                .and_then(|c| c.child_by_field_name("body"))
                .and_then(|body| {
                    children(body).into_iter().find(|n| {
                        n.kind() == "modifier_definition"
                            && n.child_by_field_name("name")
                                .is_some_and(|n| text(self.source, n) == text(self.source, name))
                    })
                });
            let Some(definition) = definition else {
                return true;
            };
            if let Some(context) =
                Context::new(self.source, definition, self.all, self.file, self.semantic)
                && let Some(placeholder) = context
                    .body_nodes
                    .iter()
                    .copied()
                    .find(|n| n.kind() == "identifier" && text(self.source, *n) == "_")
                && context.local_guard(placeholder)
            {
                return true;
            }
        }
        false
    }
    fn bool_method(&self, receiver: Node<'t>, method: &str, count: usize) -> Option<Node<'t>> {
        let Type::Contract(name) = self.expression_type(receiver) else {
            return None;
        };
        let declarations = self
            .all
            .iter()
            .copied()
            .filter(|n| {
                matches!(n.kind(), "contract_declaration" | "interface_declaration")
                    && n.child_by_field_name("name")
                        .is_some_and(|n| text(self.source, n) == name)
            })
            .collect::<Vec<_>>();
        if declarations.len() != 1 {
            return None;
        }
        let body = declarations[0].child_by_field_name("body")?;
        let methods = children(body)
            .into_iter()
            .filter(|n| {
                n.kind() == "function_definition"
                    && n.child_by_field_name("name")
                        .is_some_and(|n| text(self.source, n) == method)
                    && children(*n)
                        .iter()
                        .filter(|n| n.kind() == "parameter")
                        .count()
                        == count
            })
            .collect::<Vec<_>>();
        if methods.len() != 1 {
            return None;
        }
        let returns = methods[0].child_by_field_name("return_type")?;
        let values = children(returns);
        if values.len() == 1
            && values[0]
                .child_by_field_name("type")
                .is_some_and(|n| type_of(n, self.source) == Type::Bool)
        {
            Some(methods[0])
        } else {
            None
        }
    }
}
fn field_children<'t>(node: Node<'t>, field: &str) -> Vec<Node<'t>> {
    let mut cursor = node.walk();
    node.children_by_field_name(field, &mut cursor).collect()
}
fn statement(node: Node<'_>) -> Option<Node<'_>> {
    let mut current = Some(node);
    while let Some(node) = current {
        if node.kind() == "statement"
            && node
                .parent()
                .is_some_and(|parent| matches!(parent.kind(), "function_body" | "block_statement"))
        {
            return Some(node);
        }
        current = node.parent();
    }
    None
}
fn dominating_statement(guard: Node<'_>, sink: Node<'_>) -> bool {
    statement(guard).is_some_and(|guard| {
        guard.end_byte() < sink.start_byte()
            && guard.parent().is_some_and(|scope| contains(scope, sink))
    })
}
fn only_reverts(body: Node<'_>) -> bool {
    if body.kind() == "revert_statement" {
        return true;
    }
    if matches!(body.kind(), "statement" | "block_statement") {
        let nested = children(body)
            .into_iter()
            .filter(|n| n.kind() != "unchecked")
            .collect::<Vec<_>>();
        return nested.len() == 1 && only_reverts(nested[0]);
    }
    false
}
fn falls_through(a: Node<'_>, b: Node<'_>) -> bool {
    let mut parent = a.parent();
    while let Some(scope) = parent {
        if matches!(scope.kind(), "block_statement" | "function_body") {
            for statement in children(scope) {
                if statement.start_byte() > a.end_byte() && statement.end_byte() < b.start_byte() {
                    let mut terminal = statement;
                    while terminal.kind() == "statement" && terminal.named_child_count() == 1 {
                        terminal = terminal.named_child(0).unwrap();
                    }
                    if matches!(terminal.kind(), "return_statement" | "revert_statement") {
                        return false;
                    }
                }
            }
        }
        if scope.kind() == "function_definition" {
            break;
        }
        parent = scope.parent();
    }
    true
}

fn same_branch(a: Node<'_>, b: Node<'_>, context: &Context<'_, '_>) -> bool {
    falls_through(a, b)
        && !context
            .body_nodes
            .iter()
            .filter(|n| n.kind() == "if_statement")
            .any(|branch| {
                let bodies = field_children(*branch, "body");
                let first = bodies.iter().position(|body| contains(*body, a));
                let second = bodies.iter().position(|body| contains(*body, b));
                first.is_some() && second.is_some() && first != second
            })
}
fn unused_success<'t>(call: Node<'t>, context: &Context<'t, '_>) -> Option<Node<'t>> {
    let statement = ancestor(call, &["variable_declaration_statement"])?;
    if !statement
        .child_by_field_name("value")
        .is_some_and(|n| contains(n, call))
    {
        return None;
    }
    let declaration = nodes(statement).into_iter().find(|node| {
        node.kind() == "variable_declaration"
            && node
                .child_by_field_name("type")
                .is_some_and(|n| type_of(n, context.source) == Type::Bool)
    })?;
    let name = declaration.child_by_field_name("name")?;
    let identifier = text(context.source, name);
    if context.body_nodes.iter().any(|node| {
        node.kind() == "identifier"
            && node.start_byte() > statement.end_byte()
            && text(context.source, *node) == identifier
            && context
                .binding(identifier, *node)
                .is_some_and(|binding| binding.declaration.id() == declaration.id())
    }) {
        None
    } else {
        Some(declaration)
    }
}
fn related(source: &str, file: &str, node: Node<'_>, label: &str) -> RelatedEvidence {
    let from = node_location(source, node.start_byte());
    let to = node_location(source, node.end_byte());
    RelatedEvidence {
        source_sha256: Some(crate::hex_sha256(source.as_bytes())),
        label: label.into(),
        excerpt: text(source, node).into(),
        location: FindingLocation {
            file: file.into(),
            start_line: from.0,
            start_column: from.1,
            end_line: to.0,
            end_column: to.1,
            byte_start: node.start_byte(),
            byte_end: node.end_byte(),
        },
    }
}
fn finding(
    source: &str,
    file: &str,
    node: Node<'_>,
    id: &str,
    facts: &[(Node<'_>, &str)],
) -> Finding {
    let mut found = make_finding(source, file, &node, rules::get(id), None);
    found.evidence.related = facts
        .iter()
        .map(|(node, label)| related(source, file, *node, label))
        .collect();
    found
}
fn this_balance(node: Node<'_>, source: &str) -> bool {
    let node = peel(node);
    if node.kind() != "member_expression"
        || node
            .child_by_field_name("property")
            .is_none_or(|n| text(source, n) != "balance")
    {
        return false;
    }
    node.child_by_field_name("object").is_some_and(|object| {
        let object = peel(object);
        object.kind() == "type_cast_expression"
            && children(object)
                .iter()
                .any(|n| n.kind() == "primitive_type" && text(source, *n) == "address")
            && args(object)
                .first()
                .is_some_and(|arg| text(source, *arg) == "this")
    })
}

pub fn analyze_source(source: &str, file: &str) -> (Vec<Finding>, Vec<ScanDiagnostic>) {
    analyze_with_semantics(source, file, None)
}
pub(crate) fn analyze_with_semantics(
    source: &str,
    file: &str,
    semantic: Option<&SemanticModel>,
) -> (Vec<Finding>, Vec<ScanDiagnostic>) {
    let mut parser = Parser::new();
    if let Err(error) = parser.set_language(&tree_sitter_solidity::LANGUAGE.into()) {
        return (
            Vec::new(),
            vec![diagnostic(
                "parser-init-error",
                error.to_string(),
                file,
                None,
            )],
        );
    }
    let Some(tree) = parser.parse(source, None) else {
        return (
            Vec::new(),
            vec![diagnostic(
                "parse-error",
                "No syntax tree was produced.".into(),
                file,
                None,
            )],
        );
    };
    let root = tree.root_node();
    let all = nodes(root);
    let mut findings = Vec::new();
    let mut diagnostics = Vec::new();
    if root.has_error() {
        let position = all
            .iter()
            .find(|n| n.is_error() || n.is_missing())
            .map(|n| node_location(source, n.start_byte()));
        diagnostics.push(diagnostic(
            "syntax-error",
            "Solidity syntax is invalid; this file's results are incomplete.".into(),
            file,
            position,
        ));
    }
    for node in all.iter().copied() {
        if builtin_member(node, source, "tx", "origin")
            && semantic.is_none_or(|model| {
                model.builtin_member(file, node.start_byte(), node.end_byte(), "tx", "origin")
            })
            && ancestor(
                node,
                &[
                    "function_definition",
                    "modifier_definition",
                    "fallback_receive_definition",
                ],
            )
            .and_then(|function| Context::new(source, function, &all, file, semantic))
            .is_none_or(|context| context.binding("tx", node).is_none())
            && node.kind() == "member_expression"
            && in_condition(node, source, &all, file, semantic)
        {
            findings.push(finding(source, file, node, "OG-SOL-001", &[]));
        }
        if node.kind() == "binary_expression"
            && operator(node, source) == "=="
            && in_condition(node, source, &all, file, semantic)
            && nodes(node).iter().any(|n| this_balance(*n, source))
        {
            findings.push(finding(source, file, node, "OG-SOL-011", &[]));
        }
    }
    for function in all.iter().copied().filter(|n| {
        matches!(
            n.kind(),
            "function_definition" | "fallback_receive_definition" | "modifier_definition"
        )
    }) {
        let Some(context) = Context::new(source, function, &all, file, semantic) else {
            continue;
        };
        for call in context
            .body_nodes
            .iter()
            .copied()
            .filter(|n| n.kind() == "call_expression")
        {
            if let Some((receiver, property)) = member(call) {
                let method = text(source, property);
                let address = context.expression_type(receiver) == Type::Address;
                if address && matches!(method, "call" | "delegatecall" | "staticcall") {
                    let unused = unused_success(call, &context);
                    if discarded(call) || unused.is_some() {
                        let facts = unused
                            .map(|node| vec![(node, "Unused captured success flag")])
                            .unwrap_or_default();
                        findings.push(finding(source, file, call, "OG-SOL-003", &facts));
                    }
                    if semantic.is_none()
                        && method != "staticcall"
                        && let Some(write) = context.body_nodes.iter().copied().find(|n| {
                            n.start_byte() > call.end_byte()
                                && context.state_write(*n)
                                && same_branch(call, *n, &context)
                        })
                    {
                        let mut result = finding(
                            source,
                            file,
                            call,
                            "OG-SOL-002",
                            &[(write, "Later storage write")],
                        );
                        if let Some(declaration) = context.storage_evidence(write) {
                            result.evidence.related.push(declaration);
                        }
                        findings.push(result);
                    }
                    if semantic.is_none()
                        && method == "delegatecall"
                        && context.external()
                        && !context.guarded_or_unresolved(call)
                        && let Some(origin) = context.tainted_target(receiver, 0)
                    {
                        findings.push(finding(
                            source,
                            file,
                            call,
                            "OG-SOL-005",
                            &[(origin, "Caller-controlled target source")],
                        ));
                    }
                }
                if address && method == "send" && discarded(call) {
                    findings.push(finding(source, file, call, "OG-SOL-004", &[]));
                }
                if address
                    && method == "transfer"
                    && let Some(enclosing_loop) = ancestor(
                        call,
                        &["for_statement", "while_statement", "do_while_statement"],
                    )
                {
                    findings.push(finding(
                        source,
                        file,
                        call,
                        "OG-SOL-012",
                        &[(enclosing_loop, "Enclosing batch loop")],
                    ));
                }
                if matches!(method, "transfer" | "transferFrom" | "approve") && discarded(call) {
                    if let Some(model) = semantic {
                        if let Some(signature) =
                            model.boolean_method(file, call.start_byte(), call.end_byte())
                        {
                            let mut result = finding(source, file, call, "OG-SOL-010", &[]);
                            result.evidence.related.push(signature);
                            findings.push(result);
                        }
                    } else if let Some(signature) =
                        context.bool_method(receiver, method, args(call).len())
                    {
                        findings.push(finding(
                            source,
                            file,
                            call,
                            "OG-SOL-010",
                            &[(signature, "Resolved boolean-returning interface method")],
                        ));
                    }
                }
                if text(source, receiver) == "abi"
                    && method == "encodePacked"
                    && context.binding("abi", call).is_none()
                {
                    let in_hash = ancestor_hash(call, &context);
                    let dynamic = args(call)
                        .into_iter()
                        .filter(|arg| {
                            matches!(context.expression_type(*arg), Type::String | Type::Bytes)
                        })
                        .collect::<Vec<_>>();
                    if in_hash && dynamic.len() > 1 {
                        let facts = dynamic
                            .iter()
                            .filter_map(|arg| {
                                context
                                    .binding(text(source, *arg), *arg)
                                    .map(|binding| (binding.declaration, "Dynamic hash input"))
                            })
                            .take(4)
                            .collect::<Vec<_>>();
                        let mut result = finding(source, file, call, "OG-SOL-009", &facts);
                        if let Some(model) = semantic {
                            for value in dynamic.iter().take(4) {
                                if let Some(declaration) = model.declaration_evidence(
                                    file,
                                    value.start_byte(),
                                    value.end_byte(),
                                    "Compiler-resolved dynamic hash input",
                                ) {
                                    result.evidence.related.push(declaration);
                                }
                            }
                        }
                        findings.push(result);
                    }
                }
            }
            if semantic.is_none()
                && context.builtin_call(call, "selfdestruct")
                && context.external()
                && !context.guarded_or_unresolved(call)
            {
                findings.push(finding(source, file, call, "OG-SOL-006", &[]));
            }
        }
        for node in context.body_nodes.iter().copied() {
            if context.state_write(node)
                && let (Some(rhs), Some(enclosing_loop)) = (
                    node.child_by_field_name("right"),
                    ancestor(
                        node,
                        &["for_statement", "while_statement", "do_while_statement"],
                    ),
                )
                && let Some(path) = context.payment_origin(rhs, 0)
            {
                let mut facts = vec![(enclosing_loop, "Repeated accounting operation")];
                facts.extend(
                    path.into_iter()
                        .take(3)
                        .map(|node| (node, "Unscaled payment alias")),
                );
                let mut result = finding(source, file, node, "OG-SOL-007", &facts);
                if let Some(declaration) = context.storage_evidence(node) {
                    result.evidence.related.push(declaration);
                }
                findings.push(result);
            }
            if node.kind() == "array_access"
                && let Some(index) = node.child_by_field_name("index")
                && let Some(path) = context.selection_origin(index, 0)
            {
                let facts = path
                    .into_iter()
                    .take(4)
                    .map(|node| (node, "Block-derived index value flow"))
                    .collect::<Vec<_>>();
                findings.push(finding(source, file, index, "OG-SOL-008", &facts));
            }
        }
    }
    if let Some(model) = semantic {
        for effect in model
            .effects
            .findings
            .iter()
            .filter(|e| e.primary.file == file)
        {
            if let Some(node) = all.iter().copied().find(|n| {
                n.start_byte() == effect.primary.start && n.end_byte() == effect.primary.end
            }) {
                let mut result = finding(source, file, node, effect.rule, &[]);
                result.evidence.related = effect.related.clone();
                findings.push(result);
            } else {
                diagnostics.push(diagnostic(
                    "native-effects-incomplete",
                    "Compiler effect location could not be bound to the source syntax tree.".into(),
                    file,
                    Some(node_location(source, effect.primary.start)),
                ));
            }
        }
        diagnostics.extend(
            model
                .effects
                .diagnostics
                .iter()
                .filter(|d| d.file.as_deref() == Some(file))
                .cloned(),
        );
    }
    findings.sort_by(|a, b| {
        (a.location.byte_start, &a.rule_id).cmp(&(b.location.byte_start, &b.rule_id))
    });
    findings.dedup_by(|a, b| a.id == b.id);
    (findings, diagnostics)
}
fn ancestor_hash<'t>(call: Node<'t>, context: &Context<'t, '_>) -> bool {
    let mut current = call.parent();
    while let Some(node) = current {
        if node.kind() == "call_expression"
            && ["keccak256", "sha256", "ripemd160"]
                .iter()
                .any(|name| context.builtin_call(node, name))
        {
            return true;
        }
        if matches!(node.kind(), "statement" | "function_definition") {
            break;
        }
        current = node.parent();
    }
    false
}
fn diagnostic(
    code: &str,
    message: String,
    file: &str,
    position: Option<(usize, usize)>,
) -> ScanDiagnostic {
    ScanDiagnostic {
        code: code.into(),
        message,
        file: Some(file.into()),
        line: position.map(|p| p.0),
        column: position.map(|p| p.1),
    }
}

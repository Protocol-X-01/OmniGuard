#!/usr/bin/env python3
"""Generate the rule reference from the Rust CLI registry."""
import json
from pathlib import Path
import subprocess
ROOT = Path(__file__).resolve().parents[1]
catalog = json.loads(subprocess.check_output([str(ROOT / 'target/release/omniguard'), 'rules', '--format', 'json'], text=True))
lines = [f"# OmniGuard {catalog['engine_version']} rule reference", '', f"Rule set: `{catalog['rule_set']}`. **{len(catalog['rules'])} rules**. Generated from the Rust registry with `python3 scripts/generate-rule-docs.py`.", '',
    'Coverage means the named rules were attempted on the listed input files. It does not establish whole-program semantic coverage, reachability, exploitability or safety. Source mode uses scoped AST facts. Optional native-solc mode adds declaration identities and bounded ordered effects through direct helpers, storage aliases and imported modifiers for rules002/005/006. Unsupported or exhausted effects make coverage incomplete; general path feasibility, arbitrary dispatch and whole-program vulnerability verification remain outside the model.', '',
    '| Rule | Category | Severity | Confidence | Detection |', '| --- | --- | --- | --- | --- |']
for rule in catalog['rules']: lines.append(f"| {rule['id']} | {rule['category']} | {rule['severity']} | {rule['confidence']} | {rule['title']} |")
for rule in catalog['rules']:
    lines += ['', f"## {rule['id']} — {rule['title']}", '', rule['description'], '', f"Remediation: {rule['remediation']}", '', f"Limits: {rule['limitations']}", '', f"[Primary reference]({rule['reference']})"]
(ROOT / 'docs/rules.md').write_text('\n'.join(lines) + '\n')

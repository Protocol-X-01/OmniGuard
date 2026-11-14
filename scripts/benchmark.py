#!/usr/bin/env python3
"""Compare declared pattern expectations on the authored, isolated Solidity corpus."""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT / "fixtures/rule-corpus"
MAPPING = {
    "OG-SOL-001": "tx-origin", "OG-SOL-002": "reentrancy-eth", "OG-SOL-003": "unchecked-lowlevel",
    "OG-SOL-004": "unchecked-send", "OG-SOL-005": "controlled-delegatecall", "OG-SOL-006": "suicidal",
    "OG-SOL-007": "msg-value-loop", "OG-SOL-008": "weak-prng", "OG-SOL-009": "encode-packed-collision",
    "OG-SOL-010": "unchecked-transfer", "OG-SOL-011": "incorrect-equality", "OG-SOL-012": "calls-loop",
}

def run(command, env, timeout=180):
    before = time.perf_counter()
    process = subprocess.run(command, cwd=ROOT, env=env, text=True, capture_output=True, timeout=timeout)
    return process, round((time.perf_counter() - before) * 1000, 2)


def metrics(expected, actual, cases):
    result = {}
    for rule in MAPPING:
        tp = sum(rule in expected[c] and rule in actual[c] for c in cases)
        fp = sum(rule not in expected[c] and rule in actual[c] for c in cases)
        fn = sum(rule in expected[c] and rule not in actual[c] for c in cases)
        tn = len(cases) - tp - fp - fn
        result[rule] = {"tp": tp, "fp": fp, "fn": fn, "tn": tn,
            "precision": round(tp / (tp + fp), 4) if tp + fp else None,
            "recall": round(tp / (tp + fn), 4) if tp + fn else None}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scanner", default=str(ROOT / "target/release/omniguard"))
    parser.add_argument("--slither", default=shutil.which("slither"))
    parser.add_argument("--foundry", default=shutil.which("forge"))
    parser.add_argument("--solc", default=shutil.which("solc"))
    parser.add_argument("--output", type=Path, default=ROOT / "reports/benchmarks/expanded-pack")
    options = parser.parse_args()
    if not all([options.slither, options.foundry, options.solc]): parser.error("Foundry, solc and Slither are required; pass their explicit paths.")
    output = options.output.resolve(); output.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["PATH"] = os.pathsep.join([str(Path(options.foundry).parent), str(Path(options.solc).parent), env.get("PATH", "")])
    env["FOUNDRY_SOLC"] = options.solc
    manifest = json.loads((CORPUS / "manifest.json").read_text())
    cases = {case["path"]: case for case in manifest["cases"]}
    expected = {path: set(case["expected"]) for path, case in cases.items()}
    source_hash = hashlib.sha256()
    for path in sorted(cases):
        source_hash.update(path.encode()); source_hash.update(b"\0"); source_hash.update((CORPUS / "src" / path).read_bytes())
    result, omni_ms = run([options.scanner, "scan", str(CORPUS), "--format", "json"], env)
    (output / "omniguard.stderr.log").write_text(result.stderr)
    if result.returncode: raise RuntimeError(f"OmniGuard scan failed ({result.returncode}); see its stderr log.")
    report = json.loads(result.stdout)
    (output / "omniguard.json").write_text(json.dumps(report, indent=2) + "\n")
    if not report["coverage"]["complete"]: raise RuntimeError("OmniGuard input coverage was incomplete.")
    actual = defaultdict(set); multiplicity = defaultdict(Counter)
    for finding in report["findings"]:
        path = finding["location"]["file"]
        actual[path].add(finding["rule_id"]); multiplicity[path][finding["rule_id"]] += 1
    mismatches = [{"path": path, "expected": cases[path]["expected"], "actual": list(multiplicity[path].elements())}
        for path in cases if Counter(cases[path]["expected"]) != multiplicity[path]]
    raw_path = output / "slither.json"
    if raw_path.exists(): raw_path.unlink()
    command = [options.slither, str(CORPUS), "--solc", options.solc, "--detect", ",".join(MAPPING.values()),
        "--json", str(raw_path), "--fail-none", "--exclude-dependencies"]
    slither, slither_ms = run(command, env)
    (output / "slither.stdout.log").write_text(slither.stdout)
    (output / "slither.stderr.log").write_text(slither.stderr)
    if not raw_path.exists(): raise RuntimeError("Slither produced no JSON; see slither.stderr.log.")
    raw = json.loads(raw_path.read_text())
    if not raw.get("success"): raise RuntimeError(f"Slither failed: {raw.get('error')}; see slither.stderr.log.")
    slither_actual = defaultdict(set)
    reverse = {detector: rule for rule, detector in MAPPING.items()}
    for detection in raw.get("results", {}).get("detectors", []):
        rule = reverse.get(detection["check"])
        if not rule: continue
        for element in detection.get("elements", []):
            mapping = element.get("source_mapping", {})
            names = [str(mapping.get(key, "")).replace("\\", "/") for key in ["filename_absolute", "filename_relative", "filename_short"]]
            for path in cases:
                if any(name == path or name.endswith("/src/" + path) or name == "src/" + path for name in names): slither_actual[path].add(rule)
    versions = {}
    for name, command in {"omniguard": [options.scanner, "--version"], "slither": [options.slither, "--version"], "solc": [options.solc, "--version"], "foundry": [options.foundry, "--version"]}.items():
        process, _ = run(command, env); versions[name] = process.stdout.strip()
    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(), "corpus_version": manifest["corpus_version"],
        "corpus_sha256": source_hash.hexdigest(), "cases": len(cases), "versions": versions,
        "method": "Case/rule pattern agreement on an authored synthetic corpus. Slither policies differ; these are not general vulnerability precision estimates or a superiority ranking.",
        "timing_scope": "One local invocation. Slither includes its compiler/build pipeline; timings are not an equivalent workload ranking.",
        "detector_mapping": MAPPING,
        "omniguard": {"elapsed_ms": omni_ms, "metrics": metrics(expected, actual, cases), "exact_case_mismatches": mismatches},
        "slither": {"elapsed_ms": slither_ms, "exit_code": slither.returncode, "metrics": metrics(expected, slither_actual, cases)},
        "case_results": [{"id": case["id"], "path": path, "group": case["group"], "expected": sorted(expected[path]),
            "omniguard": sorted(actual[path]), "slither_mapped": sorted(slither_actual[path])} for path, case in cases.items()],
    }
    (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    lines = ["# Expanded rule pack: controlled corpus results", "", f"Cases: **{len(cases)}**. Corpus SHA-256: `{summary['corpus_sha256']}`.", "", summary["method"], "", summary["timing_scope"], "",
        "| Rule | OmniGuard TP / FP / FN | Slither pattern agreement TP / FP / FN | Slither detector |", "| --- | --- | --- | --- |"]
    for rule, detector in MAPPING.items():
        a = summary["omniguard"]["metrics"][rule]; b = summary["slither"]["metrics"][rule]
        lines.append(f"| {rule} | {a['tp']} / {a['fp']} / {a['fn']} | {b['tp']} / {b['fp']} / {b['fn']} | {detector} |")
    lines += ["", f"Exact OmniGuard case mismatches: **{len(mismatches)}**. One-run elapsed: OmniGuard {omni_ms} ms; Slither {slither_ms} ms.", "", "## Per-case evidence", "", "| Case | Expected | OmniGuard | Slither mapped |", "| --- | --- | --- | --- |"]
    for case in summary["case_results"]: lines.append(f"| {case['path']} | {', '.join(case['expected']) or 'none'} | {', '.join(case['omniguard']) or 'none'} | {', '.join(case['slither_mapped']) or 'none'} |")
    lines += ["", "## Versions", ""]
    for tool, version in versions.items(): lines += [f"{tool}:", "```text", version, "```", ""]
    (output / "summary.md").write_text("\n".join(lines) + "\n")
    print(f"Evaluated {len(cases)} isolated cases; exact OmniGuard mismatches: {len(mismatches)}")
    print(f"OmniGuard {omni_ms} ms; Slither {slither_ms} ms (different pipeline scopes; see summary)")
    print(output / "summary.md")
    return 1 if mismatches else 0

if __name__ == "__main__": raise SystemExit(main())

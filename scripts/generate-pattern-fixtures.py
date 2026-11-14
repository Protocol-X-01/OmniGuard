#!/usr/bin/env python3
"""Compose the primary authored corpus cases into single-file Forge import fixtures."""
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
for scenario, group, suffix in [('vulnerable', 'positive', 'vulnerable'), ('fixed', 'fixed', 'fixed')]:
    destination = ROOT / 'fixtures/patterns' / scenario
    (destination / 'src').mkdir(parents=True, exist_ok=True)
    units = []
    for rule in range(1, 13):
        source = ROOT / f'fixtures/rule-corpus/src/{group}/rule_{rule:03d}_{suffix}.sol'
        units.append('\n'.join(line for line in source.read_text().splitlines() if not line.startswith(('// SPDX', 'pragma solidity'))).strip())
    (destination / 'src/Patterns.sol').write_text('// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24;\n\n// Generated from the 12 primary authored corpus cases.\n\n' + '\n\n'.join(units) + '\n')
    (destination / 'foundry.toml').write_text('[profile.default]\nsrc = "src"\nout = "out"\nlibs = []\nsolc_version = "0.8.26"\n')

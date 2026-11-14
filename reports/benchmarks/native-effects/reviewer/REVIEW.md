# Native-effect adversarial review

Status: completed against the replacement 0.1.4 release. Final reviewed executable SHA-256: `dbf3fb31b96d7a33b6972ca110fd7d5980e03272ef6f3af38d0ee2d08497a7d3`. Earlier checkpoints below are retained as history.

All new review files are under this owner-only directory. The original multi-chain framework was not executed or edited. No network, RPC, live-chain transaction, training, upload or tenant action was used. Every frozen Solidity source was accepted by local native solc 0.8.26 before freezing; no exploit execution is claimed for this source-only set.

## Frozen independent set

- 26 cases, 28 Solidity files, independently authored before inspecting the effect implementation.
- Canonical manifest SHA-256: `cbf411ae966313627f3a7b28e7b84a4f8dd6ffd9193c91d029c720bf963dbbd7`.
- Manifest: `frozen-manifest.json`; source files: `cases/`; native compiler acceptance and per-file hashes recorded in the manifest. Sources and manifest were made owner-readable and read-only after the freeze.
- Twelve cases expect an OG-SOL-002/005 detection, eight expect the focused rule to clear, and six explicitly accept detection or diagnostic-bearing incomplete coverage. Unsupported cases are counted separately rather than treated as successful vulnerability detections.
- Coverage probes include actual/parameter substitution, overload identity, virtual versus explicit-super calls, helper returns, inherited modifiers and composition, storage references/rebinding versus memory copies, recursive/deep calls, branches/termination, external-call boundaries, cross-file evidence and distinct caller identities.
- The raw synthetic pack may be copied into the repository for reproducibility. Preserve exact bytes and manifest hashes. Once disclosed cases guide later tuning, their subsequent measurements are development-case agreement, not held-out accuracy. This deliberately adversarial small set never establishes production precision or recall.

## Preserved 0.1.3 baseline

Executable SHA-256: `afa391ed94fa2e6726143b6d19b5a8442ff2b1b983277489200226f60accbd8d`.

`baseline-0.1.3/summary.json`: four detected cases, seven clear controls, fifteen expectation mismatches. Every report claimed complete coverage and had no diagnostics. On these exact frozen expectations, eleven cases agreed; fifteen did not. This includes a focused false positive on a modifier parameter supplied from a legitimate immutable owner as well as false-clean helper/alias/unsupported-path cases. The baseline's eleven emitted primary/related spans independently matched source digests, excerpts and coordinates; correct source integrity did not repair missing semantics.

## Initial effect implementation and first 0.1.4 checkpoint

- Initial handoff executable SHA-256: `a9f627c381d4fe0babf48d045543b16f1c3f766e7c565ff0254f86aa18c4516c` (development build still labelled 0.1.3). Raw results: `initial-handoff/`.
- First reviewed 0.1.4 executable SHA-256: `1a362ee52a83d483d6a446e5f171e3faa092bdcf21b5b1a5651765beea6f0928`; preserved copy: `observed-final-0.1.4`. Raw results: `final-0.1.4/`.

Both produced the same frozen-set classification: **13 detected cases, eight clear controls, five unsupported cases, and zero complete-clean expectation misses**. One detected recursive case was also explicitly incomplete. In total, twenty reports were complete and six incomplete. Source integrity independently passed for **79 primary/related spans**, with no inventory/hash/span/coordinate errors. The cross-file two-caller case produced distinct caller locations and finding IDs; helper/storage related evidence remained bound to its own file digest.

**Exact frozen expectation agreement is 24/26, not 26/26.** Two cases that requested a completed detection instead received conservative incompleteness:

1. `c08_explicit_super_v`: a statically explicit `super` call is rejected because the referenced base function carries the virtual flag. Diagnostic: virtual/unimplemented/non-internal helper effects not statically expanded. This prevents false confidence, but it is less capable than distinguishing explicit base dispatch from dynamic virtual dispatch.
2. `c16_composed_modifiers_v`: a short composed modifier chain exceeds the eight-item related-evidence limit; the engine withholds the finding and marks incomplete. Its reversed, effects-before-interaction control clears completely. This is a provenance-capacity limit, not a claimed safe result. Compact redundant declaration/call-chain evidence or support a versioned larger proof chain before claiming this composition is covered.

The six allowed detection-or-incomplete expectations are not silently counted as complete successful analyses. A recursive effect can be detected while expansion remains incomplete.

## Source-review concerns sent to the implementer

These concerns were identified after the first independent handoff; they were **not added to or substituted into the frozen 26**. Parent designated any regressions authored for them as disclosed development cases.

- The first 0.1.4 `BinaryOperation` traversal evaluated both operands unconditionally. A caller-controlled short circuit such as `bypass || _authorize()` could import authorization from a helper that need not execute. Correction needs separate short-circuit execution paths or an explicit limitation, retaining the path where the right-hand authorization is skipped.
- Internal parameter binding initially retained storage-root provenance when Solidity implicitly copies a storage struct into a memory parameter. The callee's mutation then looked like a storage write. Preserve the distinction between storage-reference alias provenance, memory/calldata reference values and scalar authorization-value provenance; clearing all roots indiscriminately would regress the legitimate modifier-owner argument control.

No additional independent corpus was authored after the parent requested the final unchanged-set rerun. Replacement-build verification will be recorded below when supplied.

## Forge compatibility and incomplete-rescan gating

Pure local calls to the independent Forge `validateBundle` and `assessRescan` functions were exercised against native bundles produced by the exact first reviewed 0.1.4 executable. No external Jira action occurred.

Five bundles validated: a direct positive control, complete fixed control, cross-file two-caller report, virtual-dispatch incomplete report and evidence-budget incomplete report. A matching complete fixed rescan was allowed. Both incomplete reports were accepted as reports but **blocked from verifying remediation**. Tampering with a cross-file related SHA-256 and replacing a caller finding's fingerprint were rejected.

Evidence: `final-0.1.4/forge-validation.json` and `final-0.1.4/bundles/`. The incomplete bundle CLI exits were 2, while complete bundle exits were 0. This demonstrates local report compatibility and gating, not tenant deployment or live workflow acceptance.

## Reproduction

Use `run_cases.py --binary /absolute/path/to/reviewed/omniguard --label fresh-label` and `check_evidence.py --label fresh-label`. The runner verifies frozen manifest/source hashes before every scan and uses only selected local compiler inputs. `check_forge.mjs` records local bundle/rescan behavior for the explicitly saved first 0.1.4 bundle paths. Reports bind their exact executable hashes; equal version strings alone are not sufficient to identify a reviewed development build.

## Final replacement release — completed checkpoint

Final executable SHA-256: `dbf3fb31b96d7a33b6972ca110fd7d5980e03272ef6f3af38d0ee2d08497a7d3`. Final effect source SHA-256: `ee6bd24c02b84b1cf9490f2d53e4abd9b6583fa638592bf1a01040f46b8b7847`. The executable is preserved as `final-reviewed/omniguard`; `final-reviewed/source-manifest.json` records the owning source hashes.

The unchanged frozen 26 were rerun on this exact replacement: **24/26 exact expectation agreement, zero complete-clean expectation misses, 13 detected cases, eight clear controls, five unsupported cases**. Recursion remains detected and explicitly incomplete, so total incomplete reports remain six. Both required-detection limitations (explicit-super dispatch and the composed-modifier evidence budget) remain disclosed and are not counted as full detections. No new independent cases were added.

Independent verification again matched **all 79 primary/related SHA-256, byte-span, excerpt and coordinate checks**, including distinct cross-file caller locations/IDs. Five fresh replacement-build bundles again passed Forge validation; matching complete fixed verification was allowed, both incomplete reports were blocked, and related-hash/fingerprint tampering was rejected. Artifacts: `final-reviewed/summary.json`, `final-reviewed/independent-evidence-check.json`, `final-reviewed/forge-validation.json`, and `final-reviewed/bundles/`.

Source confirmation of the two disclosed corrections:

- Boolean `&&`/`||` now split evaluated and skipped RHS states, retaining the unauthorised short-circuit path; simple literal operands prune impossible sides. A helper can authorize only the path where it executes. Both skipped/evaluated branch collections still pass through the existing path/step limits. The implementer's regression covers literal and caller-controlled conditions for delegatecall and selfdestruct; it is explicitly marked development, not held-out.
- Helper and modifier formal binding now clears storage roots for memory/calldata reference parameters while retaining scalar/default-location authority provenance. This prevents implicit struct copies from becoming storage aliases without discarding the valid owner-argument proof. The implementer's storage-versus-memory and scalar-owner regression is explicitly marked development. The independently frozen legitimate modifier-owner case still clears in the replacement run.

This concludes the requested bounded review. It establishes reproducible agreement and conservative incomplete reporting on these authored cases, not general semantic completeness, a production accuracy estimate, an exploit witness or live Forge tenant acceptance.
